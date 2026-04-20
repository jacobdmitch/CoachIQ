import Anthropic from '@anthropic-ai/sdk';
import {
  buildGameContext,
  buildPositionContext,
  getStaticSystemPrompt,
  getDynamicSystemPrompt,
} from './contextBuilder.js';
import { COACHING_TOOLS } from './agents/toolDefinitions.js';
import { routeToolCall, getAgentForTool } from './agents/orchestrator.js';
import { logInvocation } from './aiCallLogger.js';
import { selectModel } from './ai/modelSelector.js';
import { assemble as assembleRagContext, RISK_TIERS } from './ai/ragContextAssembler.js';
import logger from './logger.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Fallback model for position-recommendation calls that haven't been moved
// onto the selector yet. Any new call site should use selectModel().
const MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOOL_ITERATIONS = 5;

// Write-tier tools that should pull fresh DB context via the RAG assembler
// before Claude sees the next turn. Kept as a static map so adding a new
// write-tier tool is a one-line change here.
const RAG_TRIGGER_TIERS = {
  suggest_substitution: RISK_TIERS.LINEUP_WRITE,
  evaluate_lineup:      RISK_TIERS.LINEUP_WRITE,
};

/**
 * Get Line Coach recommendations for current game state
 * Uses Claude API with tool_use to generate structured coaching advice
 *
 * @param {Object} gameState - Current game state from GameStateManager
 * @param {Object} playtimeData - Playtime tracking data
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Recommendation with tool calls and analysis
 */
export async function getLineCoachRecommendation(gameState, playtimeData, options = {}) {
  try {
    const {
      format = 'standard',
      seasonStats = {},
      focusArea = null,
      playtimeTracker = null,
      maxToolIterations = DEFAULT_MAX_TOOL_ITERATIONS,
      coachId = null,
      teamId = null,
      isLiveGame = false,
    } = options;

    // Build context for Claude
    const gameContext = buildGameContext(gameState, playtimeData, seasonStats);
    const staticSystem = getStaticSystemPrompt(format);
    const dynamicSystem = getDynamicSystemPrompt({ focusArea });

    // Build user message. Note: focusArea is handled via the dynamic system
    // block above, so no longer duplicated in the user message.
    const userMessage =
      gameContext + '\nProvide coaching recommendations for this game state.';

    logger.info('Calling Claude for Line Coach recommendations', {
      gameId: gameState.gameId,
      format,
    });

    // The system prompt is sent as two blocks. The static block is stable
    // across calls for a given format and is marked cache_control: ephemeral
    // so the Anthropic cache serves it on subsequent calls within a game.
    const systemBlocks = [
      {
        type: 'text',
        text: staticSystem,
        cache_control: { type: 'ephemeral' },
      },
    ];
    if (dynamicSystem) {
      systemBlocks.push({ type: 'text', text: dynamicSystem });
    }

    // Conversation state for the agentic loop. Each iteration either:
    //   (a) produces a tool_use response -> we execute tools, append
    //       tool_result, and loop for Claude to refine its analysis, or
    //   (b) produces end_turn -> we stop and return.
    const messages = [{ role: 'user', content: userMessage }];

    // Pick model + token budget per intent signals. Default path stays on
    // Haiku/1024 so behavior is unchanged for current callers; deliberative
    // focusAreas escalate to Sonnet automatically. isLiveGame without a
    // focusArea flips to a terse token budget (used by the proactive push
    // scheduler where responses are one-line cards, not long analyses).
    const { model: selectedModel, maxTokens, tier } = selectModel({
      focusArea,
      isLiveGame,
    });

    const recommendation = {
      gameId: gameState.gameId,
      timestamp: Date.now(),
      toolCalls: [],
      toolResults: [],
      textAnalysis: '',
      suggestions: [],
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      iterations: 0,
      stopReason: null,
      model: selectedModel,
      modelTier: tier,
    };

    let iteration = 0;
    let response;

    while (iteration < maxToolIterations) {
      iteration++;
      response = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: maxTokens,
        system: systemBlocks,
        tools: COACHING_TOOLS,
        messages,
      });

      // Accumulate usage across turns so billing/audit has a single total.
      _accumulateUsage(recommendation.usage, response.usage);

      // Extract text + collect tool_use blocks from this turn.
      const toolUseBlocks = [];
      for (const block of response.content) {
        if (block.type === 'text') {
          recommendation.textAnalysis = block.text;
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
          recommendation.toolCalls.push({
            toolId: block.id,
            name: block.name,
            input: block.input,
          });
          const suggestion = _toolToSuggestion(block.name, block.input);
          if (suggestion) recommendation.suggestions.push(suggestion);
        }
      }

      // Terminate loop if Claude is done or produced no tools this turn.
      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        recommendation.stopReason = response.stop_reason || null;
        break;
      }

      // Preserve the assistant turn exactly as returned, so tool_use_ids
      // line up with the tool_results we append next.
      messages.push({ role: 'assistant', content: response.content });

      // RAG pre-fetch: if any tool_use in this turn is a write-tier tool,
      // pull fresh DB context keyed by tier and prepend it as a text block
      // to the user turn that carries the tool_results. The assembler is
      // cached (90s TTL) so repeats within a burst are effectively free.
      // Skipped entirely when teamId is absent or the assembler errors -
      // the loop must stay silent on RAG failure and rely on in-memory
      // state the same way it did before this wiring.
      const ragPreamble = await _fetchRagPreamble(
        toolUseBlocks,
        { gameId: gameState.gameId, teamId }
      );

      // Execute each tool via the orchestrator. On failure, send
      // is_error: true so Claude knows to recover rather than treat
      // the error text as legitimate data. Each invocation is logged
      // for audit replay; logging failures never block the loop.
      const toolResultsContent = [];
      if (ragPreamble) {
        toolResultsContent.push({ type: 'text', text: ragPreamble });
      }
      for (const tu of toolUseBlocks) {
        const toolStart = Date.now();
        let result;
        let isError = false;
        let errorMessage = null;
        try {
          result = await routeToolCall(null, tu.name, tu.input, gameState, playtimeTracker);
          if (result && result.error) {
            isError = true;
            errorMessage = result.error;
          }
        } catch (err) {
          result = { error: err.message };
          isError = true;
          errorMessage = err.message;
        }
        const toolLatencyMs = Date.now() - toolStart;

        recommendation.toolResults.push({
          toolId: tu.id,
          name: tu.name,
          result,
          isError,
        });

        // Fire-and-forget audit log. Not awaited — DB failure must not
        // stall the coach-facing loop.
        logInvocation({
          coachId,
          gameId: gameState.gameId || null,
          agentId: getAgentForTool(tu.name) || 'unknown',
          toolName: tu.name,
          input: tu.input,
          output: result,
          isError,
          errorMessage,
          iteration,
          latencyMs: toolLatencyMs,
        }).catch(() => {});

        toolResultsContent.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          ...(isError ? { is_error: true } : {}),
        });
      }

      messages.push({ role: 'user', content: toolResultsContent });
    }

    recommendation.iterations = iteration;

    if (iteration >= maxToolIterations && response?.stop_reason === 'tool_use') {
      logger.warn('Line Coach hit max tool iterations without completing', {
        gameId: gameState.gameId,
        maxToolIterations,
      });
      recommendation.stopReason = 'max_iterations';
    }

    logger.info('Line Coach recommendations generated', {
      gameId: gameState.gameId,
      suggestionCount: recommendation.suggestions.length,
      iterations: recommendation.iterations,
      stopReason: recommendation.stopReason,
    });

    return recommendation;
  } catch (err) {
    logger.error('Error getting Line Coach recommendations:', err);
    return {
      error: err.message,
      suggestions: [],
      toolCalls: [],
    };
  }
}

/**
 * Fetch RAG pre-call context for any write-tier tool_uses in the current
 * turn and format the result as a compact text block.
 *
 * Returns null when:
 *   - no tool_use in this turn maps to a risk tier
 *   - teamId is missing (legacy callers or route without team context)
 *   - every assemble() call errored (assembler logs its own failures)
 *
 * Multiple tool_uses in the same turn that map to the same tier produce
 * only one fetch thanks to the Set-based dedupe; the assembler's internal
 * cache (90s TTL) then absorbs repeat tiers across iterations.
 *
 * @private
 */
async function _fetchRagPreamble(toolUseBlocks, { gameId, teamId }) {
  if (!teamId) return null;

  const tiers = new Set();
  for (const tu of toolUseBlocks) {
    const tier = RAG_TRIGGER_TIERS[tu.name];
    if (tier) tiers.add(tier);
  }
  if (tiers.size === 0) return null;

  const results = await Promise.all(
    [...tiers].map((tier) => assembleRagContext(tier, { gameId, teamId }))
  );

  const sections = [];
  for (const r of results) {
    if (!r || r.error || !r.data) continue;
    sections.push(
      `### ${r.tier}${r.cacheHit ? ' (cached)' : ''}\n` +
      JSON.stringify(r.data, null, 2)
    );
  }
  if (sections.length === 0) return null;

  return (
    'Fresh DB context pulled for the write-tier tools in this turn. ' +
    'Use it to validate or refine your recommendation before finalizing.\n\n' +
    sections.join('\n\n')
  );
}

/**
 * Merge a single API-response usage block into a running total.
 * Safe against missing fields on either side.
 * @private
 */
function _accumulateUsage(running, fromResponse) {
  if (!fromResponse) return;
  running.input_tokens += fromResponse.input_tokens || 0;
  running.output_tokens += fromResponse.output_tokens || 0;
  running.cache_creation_input_tokens += fromResponse.cache_creation_input_tokens || 0;
  running.cache_read_input_tokens += fromResponse.cache_read_input_tokens || 0;
}

/**
 * Get position recommendation for a specific athlete
 * Uses Claude to evaluate skill fit for different positions
 *
 * @param {Object} athlete - Athlete object with skill ratings
 * @param {Array} teamRoster - Full team roster for context
 * @param {string} format - Game format ('standard' or '6s')
 * @returns {Promise<Object>} Position recommendation with rationale
 */
export async function getPositionRecommendation(athlete, teamRoster = [], format = 'standard') {
  try {
    const context = buildPositionContext(athlete, teamRoster, format);
    // The static prompt is shared across all position-recommendation calls
    // for a given format; mark it cacheable.
    const staticSystem = `You are a lacrosse position coach analyzing athlete skill profiles to recommend position fit.

Game format: ${format === '6s' ? '6v6 Sixes' : 'Standard 11v11'}

Provide a structured recommendation including:
1. Primary position recommendation
2. Secondary position fit
3. Skill strengths for recommended positions
4. Development areas
5. Comparison to position archetypes

Be specific and actionable. Consider the athlete's overall skill profile and physical attributes.`;

    logger.info('Calling Claude for position recommendation', {
      athleteId: athlete.id,
      format,
    });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: [
        {
          type: 'text',
          text: staticSystem,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: context + '\nProvide a comprehensive position recommendation for this athlete.',
        },
      ],
    });

    const analysis = response.content[0]?.text || '';

    return {
      athleteId: athlete.id,
      athleteName: athlete.name,
      format,
      analysis,
      timestamp: Date.now(),
      usage: response.usage || null,
    };
  } catch (err) {
    logger.error('Error getting position recommendation:', err);
    return {
      error: err.message,
      athleteId: athlete.id,
    };
  }
}

/**
 * Convert a tool use call into a structured suggestion
 * @private
 */
function _toolToSuggestion(toolName, input) {
  switch (toolName) {
    case 'suggest_substitution':
      return {
        type: 'SUBSTITUTION',
        playerIn: input.player_in,
        playerOut: input.player_out,
        position: input.position,
        reason: input.reason,
        urgency: input.urgency || 'medium',
      };
    case 'analyze_playtime':
      return {
        type: 'PLAYTIME_ANALYSIS',
        focus: input.focus || 'all',
        toleranceMinutes: input.tolerance_minutes || 2,
      };
    case 'evaluate_lineup':
      return {
        type: 'LINEUP_EVALUATION',
        aspect: input.aspect,
        concern: input.concern,
      };
    case 'position_recommendation':
      return {
        type: 'POSITION_FIT',
        athleteId: input.athlete_id,
        context: input.context,
      };
    case 'flag_alert':
      return {
        type: 'ALERT',
        alertType: input.alert_type,
        severity: input.severity,
        message: input.message,
        recommendedAction: input.recommended_action,
      };
    default:
      return null;
  }
}

export default {
  getLineCoachRecommendation,
  getPositionRecommendation,
};
