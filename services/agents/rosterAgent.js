/**
 * Roster Agent
 *
 * Owns athlete-level evaluation tooling that is not tied to a specific
 * in-game moment:
 *   - position_recommendation: evaluate best-fit position for an athlete
 *
 * Operates on roster and athlete skill profiles rather than live game state.
 */

export const TOOLS = ['position_recommendation'];

export async function execute(toolName, toolInput /* , gameState, playtimeTracker */) {
  switch (toolName) {
    case 'position_recommendation':
      return _handlePositionRecommendation(toolInput);
    default:
      return { error: `rosterAgent: unknown tool ${toolName}` };
  }
}

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

export default { TOOLS, execute };
