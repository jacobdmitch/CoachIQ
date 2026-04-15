import logger from '../logger.js';

/**
 * Line Coach Agent
 * Processes tool calls from Claude and executes them against game state.
 * Bridges between Claude's recommendations and actual game state mutations.
 */

/**
 * Execute a tool call from Claude
 * @param {string} toolName - Tool name from Claude
 * @param {Object} toolInput - Tool input from Claude
 * @param {Object} gameState - Current game state manager
 * @param {Object} playtimeTracker - Current playtime tracker
 * @returns {Object} Tool result
 */
export async function executeToolCall(toolName, toolInput, gameState, playtimeTracker) {
  logger.debug(`Executing tool: ${toolName}`, { input: toolInput });

  try {
    switch (toolName) {
      case 'suggest_substitution':
        return _handleSubstitutionSuggestion(toolInput, gameState, playtimeTracker);

      case 'analyze_playtime':
        return _handlePlaytimeAnalysis(toolInput, playtimeTracker);

      case 'evaluate_lineup':
        return _handleLineupEvaluation(toolInput, gameState);

      case 'position_recommendation':
        return _handlePositionRecommendation(toolInput);

      case 'flag_alert':
        return _handleAlert(toolInput);

      default:
        logger.warn(`Unknown tool: ${toolName}`);
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    logger.error(`Error executing tool ${toolName}:`, err);
    return { error: err.message };
  }
}

/**
 * Handle substitution suggestion
 * @private
 */
function _handleSubstitutionSuggestion(input, gameState, playtimeTracker) {
  const { player_in, player_out, position, reason, urgency } = input;

  // Validate substitution is possible
  if (!gameState) {
    return { error: 'Game state not available' };
  }

  return {
    success: true,
    recommendation: {
      type: 'SUBSTITUTION',
      playerIn: player_in,
      playerOut: player_out,
      position: position || 'field_0',
      reason,
      urgency: urgency || 'medium',
      canExecute: true,
      guidance:
        'Coach reviews and approves all substitutions. This is a recommendation only.',
    },
  };
}

/**
 * Handle playtime analysis
 * @private
 */
function _handlePlaytimeAnalysis(input, playtimeTracker) {
  if (!playtimeTracker) {
    return { error: 'Playtime tracking not available' };
  }

  const { focus = 'all' } = input;
  const summary = playtimeTracker.getPlaytimeSummary();
  const flags = playtimeTracker.getEquityFlags();

  let filteredFlags = flags;
  if (focus === 'under_target') {
    filteredFlags = flags.filter((f) => f.status === 'UNDER_TARGET');
  } else if (focus === 'over_target') {
    filteredFlags = flags.filter((f) => f.status === 'OVER_TARGET');
  }

  return {
    success: true,
    analysis: {
      focus,
      playtimeSummary: summary,
      equityFlags: filteredFlags,
      alertCount: filteredFlags.filter((f) => f.urgency === 'HIGH').length,
      guidance:
        'Review flagged athletes and consider substitutions to ensure equitable playtime.',
    },
  };
}

/**
 * Handle lineup evaluation
 * @private
 */
function _handleLineupEvaluation(input, gameState) {
  const { aspect = 'overall', concern } = input;

  if (!gameState) {
    return { error: 'Game state not available' };
  }

  const currentLineup = Object.entries(gameState.fieldPositions)
    .filter(([_, playerId]) => playerId)
    .map(([slot, playerId]) => ({ slot, playerId }));

  return {
    success: true,
    evaluation: {
      aspect,
      concern,
      currentLineupSize: currentLineup.length,
      lineup: currentLineup,
      guidance: 'Provide specific feedback to coach on lineup effectiveness.',
      coachDecision:
        'Coach makes final lineup decisions based on real-time game observation.',
    },
  };
}

/**
 * Handle position recommendation request
 * @private
 */
function _handlePositionRecommendation(input) {
  const { athlete_id, context } = input;

  return {
    success: true,
    recommendation: {
      athleteId: athlete_id,
      context: context || 'general',
      guidance:
        'Position recommendations should be reviewed by coaching staff. Consider development goals and game context.',
    },
  };
}

/**
 * Handle alert flagging
 * @private
 */
function _handleAlert(input) {
  const { alert_type, severity, message, recommended_action } = input;

  logger.warn(`Coach Alert [${severity.toUpperCase()}]: ${message}`, {
    alertType: alert_type,
    action: recommended_action,
  });

  return {
    success: true,
    alert: {
      type: alert_type,
      severity,
      message,
      recommendedAction: recommended_action,
      timestamp: Date.now(),
      requiresAck: severity === 'urgent',
    },
  };
}

export default {
  executeToolCall,
};
