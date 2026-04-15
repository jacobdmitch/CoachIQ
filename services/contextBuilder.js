import logger from './logger.js';

/**
 * Builds system prompt context for Claude LLM calls.
 * Assembles structured context about game state, roster, and stats.
 */

/**
 * Build game context for Line Coach recommendations
 * @param {Object} gameState - Current game state from GameStateManager
 * @param {Object} playtimeData - Playtime summary from PlaytimeTracker
 * @param {Object} seasonStats - Season statistics for players
 * @returns {string} Formatted context block for system prompt
 */
export function buildGameContext(gameState, playtimeData, seasonStats = {}) {
  let context = '';

  // Game state section
  context += '=== CURRENT GAME STATE ===\n';
  context += `Format: ${gameState.format === '6s' ? '6v6 Sixes' : 'Standard 11v11'}\n`;
  context += `Period: ${gameState.period}\n`;
  context += `Time: ${formatSeconds(gameState.clockTime)} / ${formatSeconds(gameState.periodDuration)}\n`;
  context += `Clock: ${gameState.clockRunning ? 'RUNNING' : 'STOPPED'}\n`;
  context += `Score: Home ${gameState.homeScore} - Away ${gameState.awayScore}\n\n`;

  // Active lineup
  context += '=== ACTIVE LINEUP ===\n';
  const fieldPlayers = [];
  const positions = Object.entries(gameState.fieldPositions);
  for (const [slot, athleteId] of positions) {
    if (athleteId) {
      fieldPlayers.push(`  ${slot}: Player #${athleteId}`);
    }
  }
  if (fieldPlayers.length > 0) {
    context += fieldPlayers.join('\n') + '\n';
  } else {
    context += '  (No lineup set)\n';
  }
  context += '\n';

  // Playtime equity
  context += '=== PLAYTIME EQUITY ===\n';
  const summary = playtimeData.summary || [];
  const sorted = [...summary].sort((a, b) => b.totalSeconds - a.totalSeconds);

  for (const athlete of sorted) {
    const minutes = Math.floor(athlete.totalSeconds / 60);
    const status =
      minutes >= athlete.targetMinutes
        ? '✓'
        : `UNDER ${athlete.targetMinutes - minutes}m`;
    context += `  Player #${athlete.athleteId}: ${minutes}m / ${athlete.targetMinutes}m target [${status}]\n`;
  }
  context += '\n';

  // Recent events
  context += '=== RECENT EVENTS (Last 10) ===\n';
  const recentEvents = gameState.events.slice(-10);
  for (const event of recentEvents) {
    const time = formatSeconds(event.clockTime || 0);
    context += `  P${event.period} ${time}: ${event.type}\n`;
  }
  context += '\n';

  return context;
}

/**
 * Build position context for position recommendation queries
 * @param {Object} athlete - Athlete object with skill ratings
 * @param {Array} teamRoster - Full team roster
 * @returns {string} Formatted context for position evaluation
 */
export function buildPositionContext(athlete, teamRoster = []) {
  let context = '';

  context += '=== ATHLETE PROFILE ===\n';
  context += `Name: ${athlete.name || 'Unknown'}\n`;
  context += `Jersey: #${athlete.jerseyNumber || '?'}\n`;
  context += `Class: ${athlete.class || 'Unknown'}\n`;
  context += `Height: ${athlete.height || '?'}\n`;
  context += `Weight: ${athlete.weight || '?'}\n\n`;

  context += '=== SKILL RATINGS (1-10) ===\n';
  const skills = [
    'shooting',
    'dodging',
    'passing',
    'field_awareness',
    'ground_balls',
    'transition',
    'defense',
    'faceoff',
  ];
  for (const skill of skills) {
    const rating = athlete[skill] || athlete[`rating_${skill}`] || 0;
    context += `  ${skill.replace(/_/g, ' ')}: ${rating}\n`;
  }
  context += '\n';

  // Team depth context
  if (teamRoster.length > 0) {
    context += '=== POSITION COMPETITION ===\n';
    const positionCounts = {};
    for (const p of teamRoster) {
      const pos = p.primary_position || 'Unassigned';
      positionCounts[pos] = (positionCounts[pos] || 0) + 1;
    }
    for (const [pos, count] of Object.entries(positionCounts)) {
      context += `  ${pos}: ${count} players\n`;
    }
    context += '\n';
  }

  return context;
}

/**
 * Get the Line Coach system prompt
 * @param {string} format - Game format: 'standard' or '6s'
 * @returns {string} System prompt for Claude
 */
export function getSystemPrompt(format = 'standard') {
  const formatDescription =
    format === '6s'
      ? `This is a 6v6 (sixes) game. Key differences:
  - 6 players per side (5 field + 1 goalie)
  - Shorter field (70x36 yards)
  - Faster pace, more shooting
  - No faceoff (possession alternates)
  - All players must be capable scorers`
      : `This is a standard 11v11 game. Key differences:
  - 11 players per side (10 field + 1 goalie)
  - Full-size field (110x60 yards)
  - Faceoffs after each goal
  - Defensive specialists and attackers
  - Three distinct positions: Attack, Midfield, Defense, Goalie`;

  return `You are Line Coach, an AI assistant for lacrosse coaches running sideline operations during games.

Your role:
- Provide tactical recommendations for substitutions and lineup adjustments
- Monitor player playtime equity and flag imbalances
- Suggest offensive/defensive adjustments based on game flow
- Analyze player performance and positioning
- Answer in-game strategy questions

Game Format:
${formatDescription}

Communication Style:
- Be concise and actionable (coaches read quickly on the sideline)
- Use player jersey numbers for identification
- Provide specific, executable recommendations
- Explain your reasoning briefly
- Flag urgent situations (playtime equity, fatigue)

Constraints:
- You NEVER make final decisions - the coach always decides
- Respect coach expertise and game context (you can't see everything)
- Consider player development and game momentum, not just stats
- Account for player roles and substitution patterns
- Be aware of in-game rest and fatigue

When analyzing the game state provided:
1. Check playtime equity first
2. Assess current lineup effectiveness
3. Consider recent game momentum
4. Flag any urgent coaching decisions needed

Always end recommendations with "Coach's call" to reinforce that the coach makes final decisions.`;
}

/**
 * Format seconds as M:SS for display
 * @private
 */
function formatSeconds(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default {
  buildGameContext,
  buildPositionContext,
  getSystemPrompt,
};
