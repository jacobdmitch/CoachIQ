import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load the app help knowledge base once at startup so Line Coach can answer
// feature questions without a separate lookup round-trip.
let _appHelpText = '';
try {
  const helpPath = path.join(__dirname, '../knowledge-bases/ai/coachiq-help.md');
  _appHelpText = fs.readFileSync(helpPath, 'utf-8');
} catch (err) {
  logger.warn('Could not load coachiq-help.md knowledge base:', err.message);
}

// Load domain knowledge bases once at startup. These are consulted from the
// prompt builders below; loading at init keeps the hot path free of file I/O.
let _positionsKB = null;
let _rulesStandardKB = null;
let _rulesSixesKB = null;
let _drillsKB = null;

try {
  const kbDir = path.join(__dirname, '../knowledge-bases/lacrosse');
  _positionsKB     = JSON.parse(fs.readFileSync(path.join(kbDir, 'positions.json'),      'utf-8'));
  _rulesStandardKB = JSON.parse(fs.readFileSync(path.join(kbDir, 'rules-standard.json'), 'utf-8'));
  _rulesSixesKB    = JSON.parse(fs.readFileSync(path.join(kbDir, 'rules-6s.json'),       'utf-8'));
  _drillsKB        = JSON.parse(fs.readFileSync(path.join(kbDir, 'drills.json'),         'utf-8'));
} catch (err) {
  logger.warn('Could not load one or more lacrosse knowledge bases:', err.message);
}

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
 * Build position context for position recommendation queries.
 *
 * Conditionally injects:
 *   - Position archetype data (positions.json) - ideal skill profiles to
 *     compare this athlete against.
 *   - A small, relevance-filtered slice of drills.json - drills matched to
 *     the athlete's two lowest skill ratings (development gaps). Filtering
 *     is necessary because the full drills KB is ~33KB and mostly irrelevant
 *     to any single athlete.
 *
 * @param {Object} athlete - Athlete object with skill ratings
 * @param {Array} teamRoster - Full team roster
 * @param {string} [format] - Game format; currently only used to pass through
 *   to skill consumers, not to filter position data itself.
 * @returns {string} Formatted context for position evaluation
 */
export function buildPositionContext(athlete, teamRoster = [], format = 'standard') {
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
  const ratedSkills = [];
  for (const skill of skills) {
    const rating = athlete[skill] || athlete[`rating_${skill}`] || 0;
    context += `  ${skill.replace(/_/g, ' ')}: ${rating}\n`;
    ratedSkills.push({ skill, rating });
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

  // Position archetypes KB - used by the LLM to compare this athlete's
  // rating profile against each position's ideal_profile and key_skills.
  if (_positionsKB?.positions) {
    context += '=== POSITION ARCHETYPES ===\n';
    context += 'Compare the athlete above against these position profiles:\n';
    context += JSON.stringify(_positionsKB.positions, null, 2);
    context += '\n\n';
  }

  // Development drill suggestions - pick 3 drills that target the athlete's
  // two lowest-rated skills. Keeps payload small and relevant.
  if (_drillsKB?.drills?.length) {
    const devGaps = [...ratedSkills]
      .filter(r => r.rating > 0) // ignore unrated skills
      .sort((a, b) => a.rating - b.rating)
      .slice(0, 2)
      .map(r => r.skill);

    if (devGaps.length > 0) {
      const matched = _drillsKB.drills
        .filter(d => (d.skill_tags || []).some(tag => devGaps.includes(tag)))
        .slice(0, 3);

      if (matched.length > 0) {
        context += `=== SUGGESTED DEVELOPMENT DRILLS (targeting: ${devGaps.join(', ')}) ===\n`;
        for (const d of matched) {
          context += `- ${d.name} [${d.category}, ${d.difficulty}, ${d.duration_minutes}m] — tags: ${(d.skill_tags || []).join(', ')}\n`;
          if (d.description) context += `  ${d.description}\n`;
        }
        context += '\n';
      }
    }
  }

  return context;
}

/**
 * Get the static portion of the Line Coach system prompt.
 * This text does not change between calls for a given format, so it is
 * safe to mark with cache_control: ephemeral for prompt caching.
 *
 * @param {string} format - Game format: 'standard' or '6s'
 * @returns {string} Static system prompt text
 */
export function getStaticSystemPrompt(format = 'standard') {
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

  const helpSection = _appHelpText
    ? `\n\n=== APP REFERENCE ===\nYou also have full knowledge of how the CoachIQ app works. Use the following documentation to answer any questions the coach asks about app features, navigation, or workflows.\n\n${_appHelpText}\n=== END APP REFERENCE ===`
    : '';

  // Rules KB for the active format is stable across calls, so it stays in the
  // static (cacheable) block. Picking one format's rules (not both) keeps the
  // prompt focused and the cached token count lower.
  const rulesKB = format === '6s' ? _rulesSixesKB : _rulesStandardKB;
  const rulesSection = rulesKB
    ? `\n\n=== RULES REFERENCE (${format === '6s' ? '6v6 Sixes' : 'Standard 11v11'}) ===\nUse this as the authoritative rule source when answering rules questions or flagging rule-bound coaching decisions.\n\n${JSON.stringify(rulesKB, null, 2)}\n=== END RULES REFERENCE ===`
    : '';

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

Always end recommendations with "Coach's call" to reinforce that the coach makes final decisions.${helpSection}${rulesSection}`;
}

/**
 * Get the dynamic portion of the Line Coach system prompt.
 * Reserved for per-call volatile instructions (focus area hints, etc).
 * Returns empty string when there is nothing dynamic to add.
 *
 * @param {Object} [options] - Per-call context
 * @param {string} [options.focusArea] - Coach's current focus for this call
 * @returns {string} Dynamic system prompt text, possibly empty
 */
export function getDynamicSystemPrompt(options = {}) {
  const { focusArea } = options;
  if (!focusArea) return '';
  return `\nCOACH FOCUS FOR THIS CALL: ${focusArea}\nAdjust your analysis to prioritize this focus area.`;
}

/**
 * Backward-compatible single-string system prompt.
 * New call sites should prefer getStaticSystemPrompt + getDynamicSystemPrompt
 * and pass them as separate system blocks so prompt caching applies.
 *
 * @param {string} format - Game format
 * @param {Object} [options] - Dynamic options (focusArea, etc)
 * @returns {string}
 */
export function getSystemPrompt(format = 'standard', options = {}) {
  return getStaticSystemPrompt(format) + getDynamicSystemPrompt(options);
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
  getStaticSystemPrompt,
  getDynamicSystemPrompt,
};
