/**
 * Playtime Agent
 *
 * Owns playtime-equity tooling:
 *   - analyze_playtime: return current equity picture and flags
 *
 * Read-only relative to game state; mutates nothing.
 */

export const TOOLS = ['analyze_playtime'];

export async function execute(toolName, toolInput, gameState, playtimeTracker) {
  switch (toolName) {
    case 'analyze_playtime':
      return _handlePlaytimeAnalysis(toolInput, playtimeTracker);
    default:
      return { error: `playtimeAgent: unknown tool ${toolName}` };
  }
}

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

export default { TOOLS, execute };
