import { query } from './database.js';
import logger from './logger.js';

/**
 * Log LLM API calls to database for monitoring and cost tracking
 * Records model, tokens used, latency, and estimated costs
 *
 * Table schema (ai_call_logs):
 *   id UUID PK, coach_id UUID NOT NULL, model VARCHAR(100),
 *   input_tokens INTEGER, output_tokens INTEGER, latency_ms INTEGER,
 *   cost_estimate NUMERIC(8,6), tool_name VARCHAR(100), created_at TIMESTAMPTZ
 */

// Approximate token costs per model (dollars per million tokens)
const TOKEN_COSTS = {
  'claude-haiku-4-5-20251001': {
    inputPerMTok: 0.80,
    outputPerMTok: 4.0,
  },
  'claude-3-5-sonnet-20241022': {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
  },
  'claude-3-opus-20250219': {
    inputPerMTok: 15.0,
    outputPerMTok: 75.0,
  },
};

/**
 * Calculate estimated cost in dollars for an API call
 * @private
 */
function _calculateCost(model, inputTokens, outputTokens) {
  const costs = TOKEN_COSTS[model] || TOKEN_COSTS['claude-haiku-4-5-20251001'];
  const inputCost = (inputTokens / 1000000) * costs.inputPerMTok;
  const outputCost = (outputTokens / 1000000) * costs.outputPerMTok;
  return inputCost + outputCost; // dollars
}

/**
 * Log an LLM API call
 *
 * @param {Object} callData
 * @param {string} callData.coachId - Coach UUID (required by schema)
 * @param {string} [callData.model] - Model name
 * @param {number} [callData.inputTokens] - Input token count
 * @param {number} [callData.outputTokens] - Output token count
 * @param {number} [callData.latencyMs] - Response latency in ms
 * @param {string} [callData.toolName] - Tool/endpoint name (e.g. 'line-coach', 'position-fit')
 * @param {string} [callData.gameId] - Associated game UUID (nullable)
 * @returns {Promise<Object>} Logged record
 */
export async function logAICall(callData) {
  try {
    const {
      coachId,
      model = 'claude-haiku-4-5-20251001',
      inputTokens = 0,
      outputTokens = 0,
      latencyMs = 0,
      toolName = 'line-coach',
      gameId = null,
    } = callData;

    if (!coachId) {
      logger.warn('logAICall called without coachId, skipping');
      return { error: 'coachId required' };
    }

    const costEstimate = _calculateCost(model, inputTokens, outputTokens);

    const result = await query(
      `INSERT INTO ai_call_logs (coach_id, model, input_tokens, output_tokens, latency_ms, cost_estimate, tool_name, game_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [coachId, model, inputTokens, outputTokens, latencyMs, costEstimate, toolName, gameId]
    );

    logger.debug('AI call logged', {
      callId: result.rows[0]?.id,
      model,
      tokens: inputTokens + outputTokens,
      costEstimate,
      latencyMs,
    });

    return {
      callId: result.rows[0]?.id,
      model,
      totalTokens: inputTokens + outputTokens,
      costEstimate,
      latencyMs,
    };
  } catch (err) {
    logger.error('Error logging AI call:', err);
    return { error: err.message };
  }
}

/**
 * Get call statistics for a coach
 *
 * @param {string} coachId - Coach UUID
 * @returns {Promise<Object>} Call statistics
 */
export async function getCoachAIStats(coachId) {
  try {
    const result = await query(
      `SELECT
        COUNT(*) AS call_count,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
        COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
        COALESCE(SUM(cost_estimate), 0) AS total_cost
       FROM ai_call_logs
       WHERE coach_id = $1`,
      [coachId]
    );

    const stats = result.rows[0];
    return {
      coachId,
      callCount: parseInt(stats.call_count) || 0,
      totalTokens: parseInt(stats.total_tokens) || 0,
      avgLatencyMs: parseFloat(stats.avg_latency_ms) || 0,
      totalCostDollars: parseFloat(stats.total_cost) || 0,
    };
  } catch (err) {
    logger.error('Error getting coach AI stats:', err);
    return { error: err.message };
  }
}

/**
 * Get aggregate statistics across all coaches
 *
 * @param {Object} options
 * @param {number} [options.daysBack=30] - Number of days to look back
 * @returns {Promise<Object>} Aggregate statistics
 */
export async function getAggregateAIStats(options = {}) {
  try {
    const { daysBack = 30 } = options;
    const result = await query(
      `SELECT
        COUNT(*) AS total_calls,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
        COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
        COALESCE(AVG(cost_estimate), 0) AS avg_cost_per_call,
        COALESCE(SUM(cost_estimate), 0) AS total_cost,
        COUNT(DISTINCT model) AS model_count
       FROM ai_call_logs
       WHERE created_at >= NOW() - INTERVAL '1 day' * $1`,
      [daysBack]
    );

    const stats = result.rows[0];
    return {
      daysBack,
      totalCalls: parseInt(stats.total_calls) || 0,
      totalTokens: parseInt(stats.total_tokens) || 0,
      avgLatencyMs: parseFloat(stats.avg_latency_ms) || 0,
      avgCostPerCall: parseFloat(stats.avg_cost_per_call) || 0,
      totalCostDollars: parseFloat(stats.total_cost) || 0,
      modelCount: parseInt(stats.model_count) || 0,
    };
  } catch (err) {
    logger.error('Error getting aggregate AI stats:', err);
    return { error: err.message };
  }
}

/**
 * Get call history for a coach
 *
 * @param {string} coachId - Coach UUID
 * @param {Object} [options]
 * @param {number} [options.limit=50] - Max records to return
 * @returns {Promise<Array>} Call history
 */
export async function getCoachCallHistory(coachId, options = {}) {
  try {
    const { limit = 50 } = options;
    const result = await query(
      `SELECT id, model, input_tokens, output_tokens, latency_ms, cost_estimate, tool_name, created_at
       FROM ai_call_logs
       WHERE coach_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [coachId, limit]
    );

    return result.rows.map((row) => ({
      callId: row.id,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: (row.input_tokens || 0) + (row.output_tokens || 0),
      latencyMs: row.latency_ms,
      toolName: row.tool_name,
      costEstimate: parseFloat(row.cost_estimate) || 0,
      timestamp: row.created_at,
    }));
  } catch (err) {
    logger.error('Error getting call history:', err);
    return [];
  }
}

/**
 * Get call statistics scoped to a specific game
 *
 * @param {string} gameId - Game UUID
 * @returns {Promise<Object>} Call statistics for the game
 */
export async function getGameAIStats(gameId) {
  try {
    const result = await query(
      `SELECT
        COUNT(*) AS call_count,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
        COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
        COALESCE(SUM(cost_estimate), 0) AS total_cost
       FROM ai_call_logs
       WHERE game_id = $1`,
      [gameId]
    );

    const stats = result.rows[0];
    return {
      gameId,
      callCount: parseInt(stats.call_count) || 0,
      totalTokens: parseInt(stats.total_tokens) || 0,
      avgLatencyMs: parseFloat(stats.avg_latency_ms) || 0,
      totalCostDollars: parseFloat(stats.total_cost) || 0,
    };
  } catch (err) {
    logger.error('Error getting game AI stats:', err);
    return { error: err.message };
  }
}

/**
 * Get call history scoped to a specific game
 *
 * @param {string} gameId - Game UUID
 * @param {Object} [options]
 * @param {number} [options.limit=50] - Max records
 * @returns {Promise<Array>} Call history for the game
 */
export async function getGameCallHistory(gameId, options = {}) {
  try {
    const { limit = 50 } = options;
    const result = await query(
      `SELECT id, model, input_tokens, output_tokens, latency_ms, cost_estimate, tool_name, created_at
       FROM ai_call_logs
       WHERE game_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [gameId, limit]
    );

    return result.rows.map((row) => ({
      callId: row.id,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: (row.input_tokens || 0) + (row.output_tokens || 0),
      latencyMs: row.latency_ms,
      toolName: row.tool_name,
      costEstimate: parseFloat(row.cost_estimate) || 0,
      timestamp: row.created_at,
    }));
  } catch (err) {
    logger.error('Error getting game call history:', err);
    return [];
  }
}

export default {
  logAICall,
  getCoachAIStats,
  getAggregateAIStats,
  getCoachCallHistory,
  getGameAIStats,
  getGameCallHistory,
};
