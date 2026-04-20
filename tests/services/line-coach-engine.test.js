import { test, describe, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.LOG_LEVEL = 'error';
process.env.ANTHROPIC_API_KEY = 'sk-test';

/**
 * Unit tests for the agentic loop in services/lineCoachEngine.js.
 *
 * Covered:
 *   1. Happy path — Claude returns a tool_use turn, orchestrator resolves,
 *      next turn is end_turn. Recommendation surfaces the suggestion and
 *      logs the invocation.
 *   2. Recovery on tool error — first turn's tool returns { error }, loop
 *      appends is_error:true tool_result, Claude's next turn is end_turn.
 *   3. Max iterations — every turn returns tool_use. Loop exits at the cap
 *      with stopReason: 'max_iterations'.
 *   4. RAG preamble injection — a write-tier tool (suggest_substitution)
 *      triggers assembleRagContext; the preamble text appears as the first
 *      content block in the next user turn that carries tool_results.
 *
 * Strategy:
 *   - Mock @anthropic-ai/sdk with a class whose messages.create reads from
 *     a FIFO queue staged per test.
 *   - Mock the orchestrator (routeToolCall) so tool execution is
 *     deterministic without touching real agents.
 *   - Mock ragContextAssembler to assert on invocations and control the
 *     returned data shape.
 *   - Mock aiCallLogger.logInvocation so we can assert on audit writes
 *     without hitting the database.
 *   - contextBuilder, modelSelector, and the tool definitions are real —
 *     they're pure and cheap, and using them catches integration drift.
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

const createQueue = [];
const createCalls = [];
const createImpl = async (args) => {
  createCalls.push(args);
  if (createQueue.length === 0) {
    return {
      content: [{ type: 'text', text: 'no-op' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
  return createQueue.shift();
};

class MockAnthropic {
  constructor() {
    this.messages = { create: (args) => createImpl(args) };
  }
}

const routeToolCallMock = mock.fn(async () => ({ ok: true }));
const assembleMock      = mock.fn(async () => ({
  tier: 'LINEUP_WRITE',
  data: { rosterSize: 12 },
  cacheHit: false,
  error: null,
}));
const logInvocationMock = mock.fn(async () => {});

let engine;

before(async () => {
  mock.module('@anthropic-ai/sdk', {
    defaultExport: MockAnthropic,
    namedExports: { Anthropic: MockAnthropic },
  });

  mock.module('../../services/agents/orchestrator.js', {
    namedExports: {
      routeToolCall:   routeToolCallMock,
      getAgentForTool: () => 'lineup_agent',
      getAvailableAgents: () => [],
      processBatch:    async () => [],
      getAgentInfo:    () => null,
    },
  });

  mock.module('../../services/ai/ragContextAssembler.js', {
    namedExports: {
      assemble:    assembleMock,
      RISK_TIERS:  {
        LINEUP_WRITE:   'LINEUP_WRITE',
        SCORING_WRITE:  'SCORING_WRITE',
        PLAYTIME_WRITE: 'PLAYTIME_WRITE',
      },
      invalidate:  () => {},
    },
  });

  mock.module('../../services/aiCallLogger.js', {
    namedExports: {
      logInvocation:       logInvocationMock,
      logAICall:           async () => {},
      getCoachAIStats:     async () => ({}),
      getAggregateAIStats: async () => ({}),
      getCoachCallHistory: async () => [],
      getGameAIStats:      async () => ({}),
      getGameCallHistory:  async () => [],
    },
  });

  engine = await import('../../services/lineCoachEngine.js');
});

beforeEach(() => {
  createQueue.length = 0;
  createCalls.length = 0;
  routeToolCallMock.mock.resetCalls();
  assembleMock.mock.resetCalls();
  logInvocationMock.mock.resetCalls();

  // Default tool resolver: success.
  routeToolCallMock.mock.mockImplementation(async () => ({ ok: true }));
  // Default RAG assembler: returns usable data.
  assembleMock.mock.mockImplementation(async () => ({
    tier: 'LINEUP_WRITE',
    data: { rosterSize: 12 },
    cacheHit: false,
    error: null,
  }));
});

// Minimal game state + playtime shapes accepted by the real contextBuilder.
const gameState = {
  gameId: 'g-1',
  format: 'standard',
  period: 2,
  clockTime: 450,
  clockRunning: false,
  homeScore: 3,
  awayScore: 1,
  fieldPositions: {},
  bench: [],
  subQueue: [],
  events: [],
};
const playtimeData = { summary: [], equityFlags: [] };

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('agentic loop — happy path', () => {
  test('one tool_use turn then end_turn produces a suggestion + logs invocation', async () => {
    createQueue.push(
      // Turn 1: tool_use
      {
        content: [
          { type: 'text', text: 'Let me check.' },
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'flag_alert',
            input: { message: 'Line 2 is gassed', severity: 'medium' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
      },
      // Turn 2: end_turn
      {
        content: [{ type: 'text', text: 'Done.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 120, output_tokens: 20 },
      },
    );

    const rec = await engine.getLineCoachRecommendation(gameState, playtimeData, {
      teamId: 'team-1',
      coachId: 'coach-1',
    });

    assert.equal(rec.iterations, 2);
    assert.equal(rec.stopReason, 'end_turn');
    assert.equal(rec.toolCalls.length, 1);
    assert.equal(rec.toolCalls[0].name, 'flag_alert');
    assert.equal(rec.toolResults.length, 1);
    assert.equal(rec.toolResults[0].isError, false);
    assert.equal(logInvocationMock.mock.callCount(), 1, 'one invocation log per tool call');
    assert.equal(
      logInvocationMock.mock.calls[0].arguments[0].toolName,
      'flag_alert',
    );
  });
});

// ─── Recovery on tool error ─────────────────────────────────────────────────

describe('agentic loop — recovery on tool error', () => {
  test('is_error tool_result is sent to Claude, loop continues to end_turn', async () => {
    // Orchestrator returns an error on the first call, success on the second.
    let call = 0;
    routeToolCallMock.mock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { error: 'athlete-not-found' } : { ok: true };
    });

    createQueue.push(
      {
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'flag_alert',
            input: { message: 'x', severity: 'low' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'Recovered.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 4 },
      },
    );

    const rec = await engine.getLineCoachRecommendation(gameState, playtimeData, {
      teamId: 'team-1',
    });

    assert.equal(rec.stopReason, 'end_turn');
    assert.equal(rec.toolResults[0].isError, true, 'tool result should be marked as error');

    // The user turn sent back to Claude on iteration 2 must carry is_error.
    const iter2Args = createCalls[1];
    const userTurn  = iter2Args.messages[iter2Args.messages.length - 1];
    assert.equal(userTurn.role, 'user');
    const toolResultBlock = userTurn.content.find((b) => b.type === 'tool_result');
    assert.ok(toolResultBlock, 'tool_result block present');
    assert.equal(toolResultBlock.is_error, true);

    // Audit log captures the error.
    const logArg = logInvocationMock.mock.calls[0].arguments[0];
    assert.equal(logArg.isError, true);
    assert.match(logArg.errorMessage, /athlete-not-found/);
  });
});

// ─── Max iterations ─────────────────────────────────────────────────────────

describe('agentic loop — hard-fail at max iterations', () => {
  test('stopReason is "max_iterations" and iterations equals the cap', async () => {
    // Queue enough tool_use turns to exceed any reasonable cap.
    for (let i = 0; i < 10; i++) {
      createQueue.push({
        content: [
          {
            type: 'tool_use',
            id: `tu_${i}`,
            name: 'flag_alert',
            input: { message: 'x', severity: 'low' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }

    const rec = await engine.getLineCoachRecommendation(gameState, playtimeData, {
      teamId: 'team-1',
      maxToolIterations: 3,
    });

    assert.equal(rec.iterations, 3);
    assert.equal(rec.stopReason, 'max_iterations');
    assert.equal(rec.toolCalls.length, 3);
  });
});

// ─── RAG preamble injection ─────────────────────────────────────────────────

describe('agentic loop — RAG preamble injection', () => {
  test('write-tier tool triggers assemble() and preamble is prepended to next turn', async () => {
    createQueue.push(
      {
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'suggest_substitution',  // LINEUP_WRITE tier
            input: {
              player_out_id: 'a1',
              player_in_id:  'a2',
              position: 'midfield',
              reason: 'rest',
              priority: 'medium',
            },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'Confirmed.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 4 },
      },
    );

    await engine.getLineCoachRecommendation(gameState, playtimeData, {
      teamId: 'team-1',
    });

    assert.equal(
      assembleMock.mock.callCount(),
      1,
      'assemble should be called once per unique write-tier on this turn',
    );
    assert.equal(assembleMock.mock.calls[0].arguments[0], 'LINEUP_WRITE');

    // The second iteration's user turn should have a leading text block with
    // the preamble, followed by the tool_result.
    const iter2Args  = createCalls[1];
    const userTurn   = iter2Args.messages[iter2Args.messages.length - 1];
    assert.equal(userTurn.role, 'user');
    assert.equal(userTurn.content[0].type, 'text', 'first block is the RAG preamble');
    assert.match(userTurn.content[0].text, /Fresh DB context/);
    assert.match(userTurn.content[0].text, /LINEUP_WRITE/);
    assert.equal(userTurn.content[1].type, 'tool_result', 'preamble is followed by the tool_result');
  });

  test('non-write tool does not trigger assemble()', async () => {
    createQueue.push(
      {
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'flag_alert',
            input: { message: 'x', severity: 'low' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'Done.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 4 },
      },
    );

    await engine.getLineCoachRecommendation(gameState, playtimeData, {
      teamId: 'team-1',
    });

    assert.equal(assembleMock.mock.callCount(), 0);
  });

  test('missing teamId skips RAG even for a write-tier tool', async () => {
    createQueue.push(
      {
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'suggest_substitution',
            input: {
              player_out_id: 'a1',
              player_in_id:  'a2',
              position: 'midfield',
              reason: 'rest',
              priority: 'medium',
            },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'Done.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 4 },
      },
    );

    await engine.getLineCoachRecommendation(gameState, playtimeData, {
      // No teamId passed.
    });

    assert.equal(assembleMock.mock.callCount(), 0);
  });
});
