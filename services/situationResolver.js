/**
 * situationResolver.js
 *
 * Resolves which field players need to swap when a coach triggers a situation
 * (man_up, man_down, faceoff, etc.). Produces a sub-queue entry ready to be
 * staged — the coach reviews it and activates when ready.
 *
 * Rules (from design doc):
 * - Goalie is NEVER touched automatically
 * - Players already on field from the assigned set stay where they are (honor current positions)
 * - If no assignment exists, AI auto-fill scores bench players by skill fit
 * - Conflict merging is handled upstream in GameStateManager.addToQueue()
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const SITUATION_LABELS = {
  man_up:         'Man Up (EMO)',
  man_down:       'Man Down',
  faceoff:        'Faceoff',
  clear:          'Clear',
  settled:        'Settled Offense',
  transition:     'Transition',
  '6s_fast_break':'6s Fast Break',
};

// Skill weights per situation for auto-fill scoring.
// Each entry: { skillField: weight, ... }
const SITUATION_SKILL_WEIGHTS = {
  man_up: {
    skill_shooting:       3,
    skill_dodging:        2,
    skill_passing:        1,
    skill_field_awareness: 1,
  },
  man_down: {
    skill_defense:        3,
    skill_field_awareness: 2,
    skill_ground_balls:   1,
  },
  faceoff: {
    skill_faceoff:        4,
    skill_ground_balls:   2,
    skill_transition:     1,
  },
  clear: {
    skill_transition:     3,
    skill_passing:        2,
    skill_field_awareness: 1,
  },
  settled: {
    skill_shooting:       2,
    skill_dodging:        2,
    skill_passing:        2,
    skill_field_awareness: 1,
  },
  transition: {
    skill_transition:     3,
    skill_ground_balls:   2,
    skill_dodging:        1,
  },
  '6s_fast_break': {
    skill_shooting:       2,
    skill_transition:     2,
    skill_dodging:        2,
    skill_passing:        1,
  },
};

// Preferred position for auto-fill candidates per situation
const SITUATION_PREFERRED_POSITIONS = {
  man_up:         ['Attack', 'Midfield'],
  man_down:       ['Defense', 'Midfield'],
  faceoff:        ['FOGO', 'Midfield'],
  clear:          ['Defense', 'Midfield', 'Attack'],
  settled:        ['Attack', 'Midfield'],
  transition:     ['Midfield', 'Attack'],
  '6s_fast_break':['Attack', 'Midfield'],
};

// How many field players a situation typically uses (excluding goalie)
const SITUATION_PLAYER_COUNT = {
  man_up:         5,  // standard: 5 offensive players
  man_down:       4,  // standard: 4 defensive players
  faceoff:        3,  // 3 midfielders
  clear:          5,
  settled:        5,
  transition:     5,
  '6s_fast_break': 3, // 6s: 3 field + goalie
};

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreAthleteForSituation(athlete, situationType) {
  const weights = SITUATION_SKILL_WEIGHTS[situationType] || {};
  let score = 0;
  for (const [field, weight] of Object.entries(weights)) {
    score += (athlete[field] || 5) * weight; // default 5/10 if unrated
  }
  return score;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Resolve a situation into a staged sub-queue entry.
 *
 * @param {Object}      gameState        - GameStateManager instance
 * @param {string}      situationType    - e.g. 'man_up'
 * @param {string[]|null} assignedIds    - coach-configured player IDs for this situation (or null)
 * @param {Object[]}    athletes         - full athlete roster records
 * @param {Object|null} playtimeTracker  - PlaytimeTracker instance (for rest-time ordering)
 * @returns {Object} Sub-queue entry ready for GameStateManager.addToQueue()
 */
export function resolveSituation(
  gameState,
  situationType,
  assignedIds,
  athletes,
  playtimeTracker
) {
  const { fieldPositions, bench } = gameState;

  // Build quick lookup map
  const athleteMap = Object.fromEntries(athletes.map(a => [a.id, a]));

  // Current field players excluding goalie
  const fieldEntries = Object.entries(fieldPositions)
    .filter(([slot, id]) => id !== null && slot !== 'goalie');

  // ── Determine target player set ────────────────────────────────────────────

  let targetIds;
  let source;

  if (assignedIds && assignedIds.length > 0) {
    targetIds = assignedIds;
    source = 'situation_assigned';
  } else {
    targetIds = autoFill(situationType, fieldEntries, bench, athletes, playtimeTracker);
    source = 'ai_suggested';
  }

  // ── Separate staying vs. coming in ─────────────────────────────────────────

  const onFieldIds = new Set(fieldEntries.map(([, id]) => id));
  const stayingPlayers = targetIds.filter(id => onFieldIds.has(id));
  const comingIn       = targetIds.filter(id => bench.includes(id));

  // ── Identify pull candidates ────────────────────────────────────────────────
  // Non-target field players (excluding goalie), sorted by most playtime first

  const pullCandidates = fieldEntries
    .filter(([, id]) => !targetIds.includes(id))
    .sort(([, aId], [, bId]) => {
      const timeA = playtimeTracker?.playtime[aId]?.totalSeconds ?? 0;
      const timeB = playtimeTracker?.playtime[bId]?.totalSeconds ?? 0;
      return timeB - timeA; // most time on field comes off first
    });

  // ── Build moves ─────────────────────────────────────────────────────────────

  const moves = [];
  for (let i = 0; i < comingIn.length; i++) {
    if (i >= pullCandidates.length) break;
    const [slot, outId] = pullCandidates[i];
    moves.push({
      moveId: crypto.randomUUID(),
      playerIn:  comingIn[i],
      playerOut: outId,
      position:  slot,
    });
  }

  const label = SITUATION_LABELS[situationType] || situationType;

  return {
    queueId:        crypto.randomUUID(),
    type:           'situation',
    label,
    source,
    situationType,
    stayingPlayers,
    moves,
  };
}

// ─── AI auto-fill ─────────────────────────────────────────────────────────────

function autoFill(situationType, fieldEntries, bench, athletes, playtimeTracker) {
  const count         = SITUATION_PLAYER_COUNT[situationType] || 5;
  const preferredPos  = SITUATION_PREFERRED_POSITIONS[situationType] || [];
  const onFieldIds    = new Set(fieldEntries.map(([, id]) => id));

  // Score all available athletes (on bench or already on field, excluding goalie)
  const candidates = athletes
    .filter(a => a.primary_position !== 'Goalie')
    .map(a => {
      const skillScore = scoreAthleteForSituation(a, situationType);
      const posBonus   = preferredPos.includes(a.primary_position) ? 20 : 0;
      // Prefer well-rested bench players: give a bonus for time on bench
      const restBonus  = bench.includes(a.id)
        ? Math.floor((playtimeTracker?.playtime[a.id]?.totalSeconds ?? 0) / 60)
        : 0;
      return { id: a.id, score: skillScore + posBonus + restBonus };
    })
    .sort((a, b) => b.score - a.score);

  // Take top N, preferring bench players but including field players if needed
  const selected = [];
  // First pass: bench players only
  for (const c of candidates) {
    if (selected.length >= count) break;
    if (bench.includes(c.id)) selected.push(c.id);
  }
  // Second pass: fill remaining from field if still under count
  for (const c of candidates) {
    if (selected.length >= count) break;
    if (onFieldIds.has(c.id) && !selected.includes(c.id)) selected.push(c.id);
  }

  return selected;
}
