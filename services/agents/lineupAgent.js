import logger from '../logger.js';

/**
 * Lineup Agent
 *
 * Owns tools that mutate or evaluate on-field lineup state:
 *   - suggest_substitution: swap players in/out
 *   - evaluate_lineup: assess current lineup effectiveness
 *   - flag_alert: raise urgent coaching alerts (lineup-adjacent concerns
 *     like foul trouble, matchup issues, tactical adjustments)
 *
 * All handlers return recommendations only. Final decisions stay with the coach.
 */

export const TOOLS = ['suggest_substitution', 'evaluate_lineup', 'flag_alert'];

export async function execute(toolName, toolInput, gameState, playtimeTracker) {
  switch (toolName) {
    case 'suggest_substitution':
      return _handleSubstitutionSuggestion(toolInput, gameState, playtimeTracker);
    case 'evaluate_lineup':
      return _handleLineupEvaluation(toolInput, gameState);
    case 'flag_alert':
      return _handleAlert(toolInput);
    default:
      return { error: `lineupAgent: unknown tool ${toolName}` };
  }
}

function _handleSubstitutionSuggestion(input, gameState /* , playtimeTracker */) {
  const { player_in, player_out, position, reason, urgency } = input;

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

export default { TOOLS, execute };
