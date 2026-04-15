import { query } from './database.js';
import logger from './logger.js';

/**
 * Log LLM API calls to database for monitoring and cost tracking
 * Records model, tokens used, latency, and estimated costs
 */

// Approximate token costs per model (as of knowledge cutoff)
const TOKEN_COSTS = {
  'claude-haiku-4-5-20251001': {
    inputPerMTok: 0.80, // $0.80 per million input tokens
    outputPerMTok: 4.0, // $4.00 per million output tokens
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
 * Calculate estimated cost for API call
 * @private
 */
function _calculateCost(model, inputTokens, outputTokens) {
  const costs = TOKEN_COSTS[model] || TOKEN_COSTS['claude-haiku-4-5-20251001'];
  const inputCost = (inputTokens / 1000000) * costs.inputPerMTok;
  const outputCost = (outputTokens / 1000000) * costs.outputPerMTok;
  return (inputCost + outputCost) * 100; // Return in cents
}

/**
 * Log an LLM API call
 *
 * @param {Object} callData - Call information
 * @param {string} callData.model - Model name
 * @param {string} callData.gameId - Associated game ID
 * @param {number} callData.inputTokens - Tokens used in input
 * @param {number} callData.outputTokens - Tokens used in output
 * @param {number} callData.latencyMs - Response latency in milliseconds
 * @param {string} callData.endpoint - API endpoint called
 * @param {string} callData.requestType - Type of request (recommendations, position_fit, etc.)
 * @param {boolean} callData.success - Whether call succeeded
 * @returns {Promise<Object>} Logged record
 */
export async function logAICall(callData) {
  try {
    const {
      model = 'claude-haiku-4-5-20251001',
      gameId,
      inputTokens = 0,
      outputTokens = 0,
      latencyMs = 0,
      endpoint = 'line-coach',
      requestType = 'general',
      success = true,
    } = callData;

    const totalTokens = inputTokens + outputTokens;
    const estimatedCostCents = _calculateCost(model, inputTokens, outputTokens);

    const result = await query(
      `
      INSERT INTO ai_call_logs (
        model,
        game_id,
        input_tokens,
        output_tokens,
        total_tokens,
        latency_ms,
        endpoint,
        request_type,
        estimated_cost_cents,
        success,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id, created_at
      `,
      [
        model,
        gameId || null,
        inputTokens,
        outputTokens,
        totalTokens,
        latencyMs,
        endpoint,
        requestType,
        estimatedCostCents,
        success,
      ]
    );

    logger.debug('AI call logged', {
      callId: result.rows[0]?.id,
      model,
      tokens: totalTokens,
      costCents: estimatedCostCents,
      latencyMs,
    });

    return {
      callId: result.rows[0]?.id,
      model,
      totalTokens,
      estimatedCostCents,
      latencyMs,
    };
  } catch (err) {
    logger.error('Error logging AI call:', err);
    return { error: err.message };
  }
}

/**
 * Get call statistics for a game
 *
 * @param {string|number} gameId - Game ID
 * @returns {Promise<Object>} Call statistics
 */
export async function getGameAIStats(gameId) {
  try {
    const result = await query(
      `
      SELECT
        COUNT(*) as call_count,
        SUM(total_tokens) as total_tokens,
        AVG(latency_ms) as avg_latency_ms,
        SUM(estimated_cost_cents) as total_cost_cents,
        COUNT(DISTINCT endpoint) as endpoint_count
      FROM ai_call_logs
      WHERE game_id = $1 AND success = true
      `,
      [gameId]
    );

    const stats = result.rows[0];
    return {
      gameId,
      callCount: parseInt(stats.call_count) || 0,
      totalTokens: parseInt(stats.total_tokens) || 0,
      avgLatencyMs: parseFloat(stats.avg_latency_ms) || 0,
      totalCostCents: parseInt(stats.total_cost_cents) || 0,
      totalCostDollars: (parseInt(stats.total_cost_cents) || 0) / 100,
      endpointCount: parseInt(stats.endpoint_count) || 0,
    };
  } catch (err) {
    logger.error('Error getting game AI stats:', err);
    return { error: err.message };
  }
}

/**
 * Get aggregate statistics across all games
 *
 * @param {Object} options - Query options
 * @param {number} options.daysBack - Number of days to look back (default 30)
 * @returns {Promise<Object>} Aggregate statistics
 */
export async function getAggregateAIStats(options = {}) {
  try {
    const { daysBack = 30 } = options;
    const result = await query(
      `
      SELECT
        COUNT(*) as total_calls,
        SUM(total_tokens) as total_tokens,
        AVG(latency_ms) as avg_latency_ms,
        AVG(estimated_cost_cents) as avg_cost_per_call_cents,
        SUM(estimated_cost_cents) as total_cost_cents,
        COUNT(DISTINCT model) as model_count,
        COUNT(CASE WHEN success = false THEN 1 END) as failed_calls
      FROM ai_call_logs
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      `,
      [daysBack]
    );

    const stats = result.rows[0];
    return {
      daysBack,
      totalCalls: parseInt(stats.total_calls) || 0,
      totalTokens: parseInt(stats.total_tokens) || 0,
      avgLatencyMs: parseFloat(stats.avg_latency_ms) || 0,
      avgCostPerCallCents: parseInt(stats.avg_cost_per_call_cents) || 0,
      totalCostCents: parseInt(stats.total_cost_cents) || 0,
      totalCostDollars: (parseInt(stats.total_cost_cents) || 0) / 100,
      modelCount: parseInt(stats.model_count) || 0,
      failedCalls: parseInt(stats.failed_calls) || 0,
    };
  } catch (err) {
    logger.error('Error getting aggregate AI stats:', err);
    return { error: err.message };
  }
}

/**
 * Get call history for a game
 *
 * @param {string|number} gameId - Game ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Max records to return (default 50)
 * @returns {Promise<Array>} Call history
 */
export async function getGameCallHistory(gameId, options = {}) {
  try {
    const { limit = 50 } = options;
    const result = await query(
      `
      SELECT
        id,
        model,
        input_tokens,
        output_tokens,
        total_tokens,
        latency_ms,
        endpoint,
        request_type,
        estimated_cost_cents,
        success,
        created_at
      FROM ai_call_logs
      WHERE game_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [gameId, limit]
    );

    return result.rows.map((row) => ({
      callId: row.id,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      latencyMs: row.latency_ms,
      endpoint: row.endpoint,
      requestType: row.request_type,
      estimatedCostCents: row.estimated_cost_cents,
      success: row.success,
      timestamp: row.created_at,
    }));
  } catch (err) {
    logger.error('Error getting call history:', err);
    return [];
  }
}

export default {
  logAICall,
  getGameAIStats,
  getAggregateAIStats,
  getGameCallHistory,
};
