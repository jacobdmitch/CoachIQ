import { query } from './database.js';
import logger from './logger.js';

/**
 * opponentScoutingService — opposing-player threat scoring (P6).
 *
 * Mirrors the formula CIF film-study coaches already run by hand: weight
 * goals and shots-on-goal heaviest (they end possessions), assists next
 * (playmaker creation), then ground balls, caused turnovers, and faceoff
 * wins (possession work). A position multiplier bumps the score for the
 * attackers and middies a coach actually worries about. We expose the
 * per-component breakdown so the panel can show *why* a player is red-flag
 * and what to scheme against.
 *
 * Two inputs combine:
 *   1. Historical stats from opposing_player_season_stats (pre-game baseline)
 *   2. Live event counts from the current game's in-memory gameState
 *
 * The live component is weighted slightly higher (recency + "he's hot
 * today" adjustment coaches make instinctively).
 */

// Threat score is the sum of (count × weight) across these event types.
// Tuned against the manual film-study rubric the coach uses today.
const BASE_WEIGHTS = {
  goal:            6.0,
  shot_on_goal:    2.0,
  shot:            0.5,
  assist:          4.0,
  ground_ball:     1.0,
  caused_turnover: 1.5,
  faceoff_win:     0.75,
  save:            2.0,   // dangerous goalies matter
  turnover:       -0.75,  // mistakes reduce threat
  penalty:        -0.5,
};

// Recency boost — live events count more than historical; "he's got 2
// goals today" is the kind of thing a coach instinctively weights up.
const LIVE_MULTIPLIER = 1.3;

// Position multipliers — a Defenseman with 3 goals is freakishly dangerous
// (and worth a hard double), while an attackman doing the same is "doing his
// job". Boost the unexpected.
const POSITION_MULTIPLIER = {
  Attack:   1.00,
  Midfield: 1.10,
  Defense:  1.35,
  Goalie:   1.00,
  FOGO:     1.05,
  null:     1.00,
  undefined: 1.00,
};

/**
 * Score a single opposing player given base (season-to-date) counts and
 * live-game counts. Returns the numeric score plus the top contributors
 * so the UI can explain the pick.
 *
 * @param {Object} player         opposing player row (id, display_name, …)
 * @param {Object} baseStats      { goal: n, shot_on_goal: n, … } — historical
 * @param {Object} liveStats      { goal: n, … } — counts this game
 * @returns {Object} { playerId, score, badge, contributors }
 */
export function scoreOpposingPlayer(player, baseStats = {}, liveStats = {}) {
  const positionMultiplier = POSITION_MULTIPLIER[player.primary_position] ?? 1.0;

  // Individual contributions, kept around so we can surface the top 3.
  const contributions = [];
  for (const [evType, weight] of Object.entries(BASE_WEIGHTS)) {
    const base = Number(baseStats[evType] || 0);
    const live = Number(liveStats[evType] || 0);
    const raw  = (base * weight) + (live * weight * LIVE_MULTIPLIER);
    if (raw !== 0) {
      contributions.push({
        eventType: evType,
        base, live, weight,
        contribution: raw,
      });
    }
  }

  const rawTotal = contributions.reduce((sum, c) => sum + c.contribution, 0);
  const score = Math.max(0, rawTotal * positionMultiplier);

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  // Threat bucket drives the panel's color and the recommended response.
  // Tuned against typical CIF-level stat lines: a 2-goal, 3-SOG attackman
  // lands in HIGH and starts to pull scheme attention.
  let badge;
  if      (score >= 18) badge = 'LOCKDOWN';  // double him, slide early
  else if (score >= 10) badge = 'HIGH';      // match with best d-pole
  else if (score >=  5) badge = 'WATCH';     // be aware
  else                  badge = 'LOW';

  return {
    playerId: player.id,
    jersey_number: player.jersey_number,
    display_name:  player.display_name,
    primary_position: player.primary_position,
    score: Math.round(score * 10) / 10,
    badge,
    positionMultiplier,
    topContributors: contributions.slice(0, 3).map(c => ({
      eventType: c.eventType,
      base: c.base,
      live: c.live,
      contribution: Math.round(c.contribution * 10) / 10,
    })),
    why: buildWhy(contributions, player),
  };
}

function buildWhy(contributions, player) {
  const posBits = contributions.filter(c => c.contribution > 0).slice(0, 2);
  if (posBits.length === 0) {
    return `No scouted production — keep scouting.`;
  }
  const phrase = posBits.map(c => {
    const liveBit = c.live ? ` (${c.live} today)` : '';
    const baseBit = c.base && !c.live ? ` (${c.base} season)` : c.base ? ` +${c.base} season` : '';
    return `${humanEvent(c.eventType, c.base + c.live)}${liveBit}${baseBit}`;
  }).join(', ');
  const posHint = player.primary_position && player.primary_position !== 'Attack'
    ? ` (${player.primary_position} scoring is atypical)`
    : '';
  return `${phrase}${posHint}.`;
}

function humanEvent(evType, count) {
  const LABEL = {
    goal:            'Goal',
    shot_on_goal:    'SOG',
    shot:            'Shot',
    assist:          'Assist',
    ground_ball:     'GB',
    caused_turnover: 'CT',
    faceoff_win:     'FO Win',
    save:            'Save',
    turnover:        'TO',
    penalty:         'Penalty',
  };
  const label = LABEL[evType] || evType;
  return count === 1 ? `1 ${label}` : `${count} ${label}${count > 1 && !label.endsWith('s') ? 's' : ''}`;
}

/**
 * Tally live events for one game, grouped by opposing_player_id and
 * event_type, strictly from the in-memory gameState's away events.
 *
 * @param {Array} events  gameState.events array
 * @returns {Map<playerId, Object>} playerId → { goal, shot_on_goal, … }
 */
export function tallyLiveAwayEvents(events = []) {
  const byPlayer = new Map();
  for (const ev of events) {
    // Normalize to lowercase DB enum
    const type = String(ev.type || ev.eventType || '').toLowerCase();
    if (!type) continue;
    // Consider anything flagged team_side='away' or with an opposing_player_id
    const side = ev.teamSide || ev.team_side;
    const oppId = ev.opposingPlayerId || ev.opposing_player_id;
    if (side !== 'away' && !oppId) continue;
    if (!oppId) continue;
    if (!byPlayer.has(oppId)) byPlayer.set(oppId, {});
    byPlayer.get(oppId)[type] = (byPlayer.get(oppId)[type] || 0) + 1;
  }
  return byPlayer;
}

/**
 * Load the historical season stats for the given opposing team. Returns a
 * Map keyed by opposing_player_id with per-event counts — shape matches the
 * live tally so downstream code can handle both uniformly.
 */
export async function loadBaseStatsForOpposingTeam(opposingTeamId) {
  const result = await query(
    `SELECT opposing_player_id,
            goals, assists, shots, shots_on_goal,
            ground_balls, turnovers, caused_turnovers,
            saves, faceoff_wins, penalties
     FROM opposing_player_season_stats
     WHERE opposing_team_id = $1`,
    [opposingTeamId]
  );
  const byPlayer = new Map();
  for (const r of result.rows) {
    byPlayer.set(r.opposing_player_id, {
      goal:            Number(r.goals),
      assist:          Number(r.assists),
      shot:            Number(r.shots),
      shot_on_goal:    Number(r.shots_on_goal),
      ground_ball:     Number(r.ground_balls),
      turnover:        Number(r.turnovers),
      caused_turnover: Number(r.caused_turnovers),
      save:            Number(r.saves),
      faceoff_win:     Number(r.faceoff_wins),
      penalty:         Number(r.penalties),
    });
  }
  return byPlayer;
}

/**
 * Compute threat scores for every scouted opposing player on a game's
 * opposing team, blending historical + live stats. Returns an array sorted
 * descending by score.
 *
 * @param {Object} params
 * @param {string} params.opposingTeamId
 * @param {Array}  params.liveAwayEvents   events from gameState (optional)
 * @returns {Promise<Array>} ranked threats
 */
export async function computeOpposingThreats({ opposingTeamId, liveAwayEvents = [] }) {
  if (!opposingTeamId) return [];
  try {
    const [playersResult, baseByPlayer] = await Promise.all([
      query(
        `SELECT id, display_name, jersey_number, primary_position
         FROM opposing_players
         WHERE opposing_team_id = $1`,
        [opposingTeamId]
      ),
      loadBaseStatsForOpposingTeam(opposingTeamId),
    ]);

    const liveByPlayer = tallyLiveAwayEvents(liveAwayEvents);

    const scored = playersResult.rows.map(p =>
      scoreOpposingPlayer(
        p,
        baseByPlayer.get(p.id) || {},
        liveByPlayer.get(p.id) || {},
      )
    );
    scored.sort((a, b) => b.score - a.score);
    return scored;
  } catch (err) {
    logger.error('computeOpposingThreats failed:', err);
    return [];
  }
}

export const __internals = { BASE_WEIGHTS, POSITION_MULTIPLIER, LIVE_MULTIPLIER };
