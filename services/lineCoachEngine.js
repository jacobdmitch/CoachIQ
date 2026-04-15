import Anthropic from '@anthropic-ai/sdk';
import { buildGameContext, buildPositionContext, getSystemPrompt } from './contextBuilder.js';
import { COACHING_TOOLS } from './agents/toolDefinitions.js';
import logger from './logger.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-haiku-4-5-20251001';

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
    const { format = 'standard', seasonStats = {}, focusArea = null } = options;

    // Build context for Claude
    const gameContext = buildGameContext(gameState, playtimeData, seasonStats);
    const systemPrompt = getSystemPrompt(format);

    // Build user message
    let userMessage = gameContext;
    if (focusArea) {
      userMessage += `\nFOCUS: Coach is asking about ${focusArea}\n`;
    }
    userMessage += '\nProvide coaching recommendations for this game state.';

    logger.info('Calling Claude for Line Coach recommendations', {
      gameId: gameState.gameId,
      format,
    });

    // Call Claude with tools
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: COACHING_TOOLS,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    // Process response
    const recommendation = {
      gameId: gameState.gameId,
      timestamp: Date.now(),
      toolCalls: [],
      textAnalysis: '',
      suggestions: [],
      usage: response.usage || null,
    };

    // Extract text and tool calls from response
    for (const block of response.content) {
      if (block.type === 'text') {
        recommendation.textAnalysis = block.text;
      } else if (block.type === 'tool_use') {
        recommendation.toolCalls.push({
          toolId: block.id,
          name: block.name,
          input: block.input,
        });

        // Convert tool calls to structured suggestions
        const suggestion = _toolToSuggestion(block.name, block.input);
        if (suggestion) {
          recommendation.suggestions.push(suggestion);
        }
      }
    }

    logger.info('Line Coach recommendations generated', {
      gameId: gameState.gameId,
      suggestionCount: recommendation.suggestions.length,
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
    const context = buildPositionContext(athlete, teamRoster);
    const systemPrompt = `You are a lacrosse position coach analyzing athlete skill profiles to recommend position fit.

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
      system: systemPrompt,
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
