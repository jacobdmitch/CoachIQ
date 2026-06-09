/**
 * localBackend.js — an on-device reimplementation of the CoachIQ REST API.
 *
 * It fulfils the same routes the screens already call, reading and writing the
 * local IndexedDB document (localDb). Response shapes mirror the server so no
 * UI changes are needed. The live game runs through a ported GameStateManager
 * plus a lightweight on-device playtime model; AI routes proxy to the AI
 * function (aiClient).
 */

import * as store from './localDb';
import GameStateManager from './engine/gameStateManager';
import { resolveSituation } from './engine/situationResolver';
import { suggestLine, listLineRoles } from './engine/lineBuilder';
import positionsKB from './knowledge/positions.json';
import drillsKB from './knowledge/drills.json';
import { aiRecommend, aiPositionAnalysis } from './aiClient';

const { uuid, nowISO } = store;

class HttpError extends Error {
  constructor(status, body) {
    super('http_error');
    this.status = status;
    this.body = typeof body === 'string' ? { error: body } : body;
  }
}
const fail = (status, body) => {
  throw new HttpError(status, body);
};

// ─── In-memory live games (rebuilt from a persisted snapshot on cold start) ─────
const live = new Map(); // gameId -> { gsm, playtime, clockRunning, seq }

const EVENT_TYPE_MAP = {
  GOAL: 'goal', ASSIST: 'assist', SHOT: 'shot', SHOT_ON_GOAL: 'shot_on_goal',
  GROUND_BALL: 'ground_ball', TURNOVER: 'turnover', CAUSED_TURNOVER: 'caused_turnover',
  SAVE: 'save', PENALTY: 'penalty', FACEOFF_WIN: 'faceoff_win', FACEOFF_LOSS: 'faceoff_loss',
};
const UNDOABLE = new Set(Object.keys(EVENT_TYPE_MAP));

// ─── Aggregation helpers ────────────────────────────────────────────────────────
const STAT_FIELDS = [
  'goals', 'assists', 'shots', 'shots_on_goal', 'ground_balls', 'turnovers',
  'caused_turnovers', 'saves', 'faceoff_wins', 'faceoff_losses',
];
const EVENT_TO_STAT = {
  goal: 'goals', assist: 'assists', shot: 'shots', shot_on_goal: 'shots_on_goal',
  ground_ball: 'ground_balls', turnover: 'turnovers', caused_turnover: 'caused_turnovers',
  save: 'saves', faceoff_win: 'faceoff_wins', faceoff_loss: 'faceoff_losses',
};

function teamGameIds(teamId, seasonId) {
  return store
    .find('games', (g) => g.team_id === teamId && (!seasonId || g.season_id === seasonId))
    .map((g) => g.id);
}

function blankStats() {
  const s = {};
  STAT_FIELDS.forEach((f) => (s[f] = 0));
  return s;
}

/** Per-athlete home-side stat totals across the given games. */
function aggregateAthleteStats(gameIds) {
  const set = new Set(gameIds);
  const byAthlete = {};
  const gamesByAthlete = {};
  for (const e of store.all('game_events')) {
    if (!set.has(e.game_id) || e.team_side !== 'home' || !e.athlete_id) continue;
    const stat = EVENT_TO_STAT[e.event_type];
    if (!byAthlete[e.athlete_id]) byAthlete[e.athlete_id] = blankStats();
    if (stat) byAthlete[e.athlete_id][stat] += 1;
    (gamesByAthlete[e.athlete_id] = gamesByAthlete[e.athlete_id] || new Set()).add(e.game_id);
  }
  const minutes = {};
  for (const p of store.all('playtime_log')) {
    if (!set.has(p.game_id)) continue;
    minutes[p.athlete_id] = (minutes[p.athlete_id] || 0) + Number(p.minutes_played || 0);
    (gamesByAthlete[p.athlete_id] = gamesByAthlete[p.athlete_id] || new Set()).add(p.game_id);
  }
  return { byAthlete, gamesByAthlete, minutes };
}

function gameResult(g) {
  if (g.status !== 'completed') return null;
  if (g.score_home > g.score_away) return 'W';
  if (g.score_home < g.score_away) return 'L';
  return 'T';
}

function authTeam(t) {
  return { id: t.id, team_name: t.team_name, season: t.season, sport_type: t.sport_type, game_format: t.game_format };
}

function parentContacts(athleteId) {
  return store.find('parent_contacts', (p) => p.athlete_id === athleteId);
}

function athleteWithStats(a, statsMap) {
  const s = statsMap.byAthlete[a.id] || blankStats();
  const gp = (statsMap.gamesByAthlete[a.id] && statsMap.gamesByAthlete[a.id].size) || 0;
  return { ...s, games_played: gp };
}

// ─── Live-game helpers ──────────────────────────────────────────────────────────
function rosterForTeam(teamId) {
  return store.find('athletes', (a) => a.team_id === teamId);
}

function persistLive(gameId) {
  const L = live.get(gameId);
  if (!L) return;
  store.setKey('live_games', gameId, {
    snapshot: L.gsm.getState(),
    playtime: L.playtime,
    seq: L.seq,
  });
}

function getLive(gameId, { create } = {}) {
  if (live.has(gameId)) return live.get(gameId);
  const persisted = store.db().live_games[gameId];
  const game = store.getById('games', gameId);
  if (!game) fail(404, 'Game not found');
  const roster = rosterForTeam(game.team_id);
  const gsm = new GameStateManager(game, roster);
  if (persisted?.snapshot) {
    Object.assign(gsm, {
      state: persisted.snapshot.state,
      period: persisted.snapshot.period,
      clockRunning: persisted.snapshot.clockRunning,
      clockTime: persisted.snapshot.clockTime,
      homeScore: persisted.snapshot.homeScore,
      awayScore: persisted.snapshot.awayScore,
      fieldPositions: persisted.snapshot.fieldPositions,
      bench: persisted.snapshot.bench,
      subQueue: persisted.snapshot.subQueue || [],
      events: persisted.snapshot.events || [],
    });
    if (gsm.clockRunning) gsm.startTime = Date.now() - gsm.clockTime * 1000;
  } else if (!create) {
    fail(404, 'Game not in progress');
  }
  const L = { gsm, playtime: persisted?.playtime || {}, seq: persisted?.seq || 0 };
  live.set(gameId, L);
  return L;
}

// Live clock reading folded into the snapshot returned to the UI.
function liveState(L) {
  const s = L.gsm.getState();
  if (L.gsm.clockRunning && L.gsm.startTime) {
    s.clockTime = Math.floor((Date.now() - L.gsm.startTime) / 1000);
  }
  return s;
}

// Lightweight playtime model (seconds, with live accrual while the clock runs).
function ptEnsure(L, athleteId) {
  if (!L.playtime[athleteId]) L.playtime[athleteId] = { totalSeconds: 0, onField: false, since: null };
  return L.playtime[athleteId];
}
function ptBank(L, athleteId, now) {
  const p = ptEnsure(L, athleteId);
  if (p.onField && p.since) p.totalSeconds += Math.max(0, Math.floor((now - p.since) / 1000));
  p.since = now;
}
function ptFieldIds(L) {
  return Object.entries(L.gsm.fieldPositions).filter(([, id]) => id).map(([, id]) => id);
}
function ptStartAll(L, now) {
  for (const id of ptFieldIds(L)) {
    const p = ptEnsure(L, id);
    p.onField = true;
    p.since = now;
  }
}
function ptStopAll(L, now) {
  for (const id of Object.keys(L.playtime)) {
    const p = L.playtime[id];
    if (p.onField) {
      ptBank(L, id, now);
      p.onField = false;
    }
  }
}
function ptSummary(L) {
  const now = Date.now();
  const target = store.db().settings.targetMinutes || 15;
  const targetSeconds = target * 60;
  return rosterForTeam(L.gsm.gameId ? store.getById('games', L.gsm.gameId)?.team_id : null).map((a) => {
    const p = L.playtime[a.id] || { totalSeconds: 0, onField: false, since: null };
    let total = p.totalSeconds;
    if (p.onField && p.since && L.gsm.clockRunning) total += Math.floor((now - p.since) / 1000);
    return {
      athleteId: a.id,
      totalMinutes: Math.floor(total / 60),
      totalSeconds: total,
      currentPeriodMinutes: Math.floor(total / 60),
      currentPeriodSeconds: total,
      targetMinutes: target,
      targetSeconds,
      isOnField: !!p.onField,
      minutesRemaining: Math.max(0, target - Math.floor(total / 60)),
    };
  });
}
function ptEquityFlags(L, tolerance = 2) {
  const target = store.db().settings.targetMinutes || 15;
  const targetSeconds = target * 60;
  const tol = tolerance * 60;
  const flags = [];
  for (const s of ptSummary(L)) {
    const diff = s.totalSeconds - targetSeconds;
    if (diff < -tol) {
      flags.push({ athleteId: s.athleteId, status: 'UNDER_TARGET', minutesUnder: Math.ceil(-diff / 60), totalMinutes: s.totalMinutes, targetMinutes: target, urgency: -diff > targetSeconds * 0.5 ? 'HIGH' : 'MEDIUM' });
    } else if (diff > tol) {
      flags.push({ athleteId: s.athleteId, status: 'OVER_TARGET', minutesOver: Math.ceil(diff / 60), totalMinutes: s.totalMinutes, targetMinutes: target, urgency: diff > targetSeconds * 0.5 ? 'HIGH' : 'MEDIUM' });
    }
  }
  return flags;
}

function persistEvent(gameId, { athleteId = null, eventType, period, clockSeconds = 0, teamSide = 'home', opposingPlayerId = null }) {
  const L = live.get(gameId);
  const seq = L ? (L.seq += 1) : store.all('game_events').length + 1;
  const row = {
    id: uuid(), game_id: gameId, athlete_id: athleteId,
    event_type: eventType, period, game_clock_seconds: clockSeconds,
    assist_athlete_id: null, notes: '', team_side: teamSide,
    opposing_player_id: opposingPlayerId, seq_no: seq,
    client_timestamp: nowISO(), coach_id: store.db().coach?.id || null, created_at: nowISO(),
  };
  store.insert('game_events', row);
  return row;
}

// ════════════════════════════════════════════════════════════════════════════════
// Routes
// ════════════════════════════════════════════════════════════════════════════════
const routes = [];
const on = (method, pattern, handler) =>
  routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });

// ── Auth ────────────────────────────────────────────────────────────────────────
on('POST', '/auth/login', () => {
  const coach = store.db().coach;
  return { success: true, coach, teams: store.all('teams').map(authTeam), token: 'local-token', refreshToken: 'local-refresh' };
});
on('GET', '/auth/me', () => ({ success: true, coach: store.db().coach, teams: store.all('teams').map(authTeam) }));
on('POST', '/auth/refresh', () => ({ success: true, token: 'local-token' }));
on('PATCH', '/auth/profile', ({ body }) => {
  Object.assign(store.db().coach, {
    firstName: body.firstName ?? store.db().coach.firstName,
    lastName: body.lastName ?? store.db().coach.lastName,
  });
  store.persistNow();
  return { success: true, coach: store.db().coach };
});
on('POST', '/auth/change-password', () => ({ success: true }));

// ── Teams ─────────────────────────────────────────────────────────────────────
on('GET', '/teams', () => ({ success: true, teams: store.all('teams') }));
on('GET', '/teams/:id', ({ params }) => {
  const team = store.getById('teams', params.id);
  if (!team) fail(404, 'Team not found');
  return { success: true, team };
});
on('POST', '/teams', ({ body }) => {
  const team = {
    id: uuid(), coach_id: store.db().coach?.id, team_name: body.teamName,
    season: body.season || '', sport_type: body.sportType || 'field_lacrosse',
    game_format: body.gameFormat || 'standard', logo_url: null, primary_color: null,
    created_at: nowISO(), updated_at: nowISO(),
  };
  store.insert('teams', team);
  return { status: 201, body: { success: true, team } };
});
on('PATCH', '/teams/:id', ({ params, body }) => {
  const map = { teamName: 'team_name', season: 'season', sportType: 'sport_type', gameFormat: 'game_format', primaryColor: 'primary_color' };
  const patch = {};
  for (const [k, col] of Object.entries(map)) if (body[k] !== undefined) patch[col] = body[k];
  const team = store.update('teams', params.id, patch);
  if (!team) fail(404, 'Team not found');
  return { success: true, team };
});
on('DELETE', '/teams/:id/logo', ({ params }) => {
  store.update('teams', params.id, { logo_url: null });
  return { success: true };
});
on('POST', '/teams/:teamId/logo', ({ params, body }) => {
  // Standalone mode can accept a data-URL logo (sent as { dataUrl }); file
  // uploads can't be processed locally, so fall back to leaving it unchanged.
  const team = store.getById('teams', params.teamId);
  if (!team) fail(404, 'Team not found');
  if (body && typeof body === 'object' && body.dataUrl) store.update('teams', params.teamId, { logo_url: body.dataUrl });
  return { success: true, team: { id: team.id, team_name: team.team_name, logo_url: team.logo_url } };
});

// ── Seasons ─────────────────────────────────────────────────────────────────────
on('GET', '/seasons', ({ query }) => {
  if (!query.teamId) fail(400, 'teamId is required');
  let seasons = store.find('seasons', (s) => s.team_id === query.teamId);
  seasons = seasons.map((s) => {
    const games = store.find('games', (g) => g.season_id === s.id);
    return { ...s, game_count: games.length, completed_game_count: games.filter((g) => g.status === 'completed').length };
  });
  if (query.withGamesOnly === 'true') seasons = seasons.filter((s) => s.game_count > 0);
  seasons.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return { success: true, seasons };
});
on('GET', '/seasons/:id', ({ params }) => {
  const season = store.getById('seasons', params.id);
  if (!season) fail(404, 'Season not found');
  return { success: true, season };
});
on('POST', '/seasons', ({ body }) => {
  const season = { id: uuid(), team_id: body.teamId, name: body.name, start_date: body.startDate, end_date: body.endDate, created_at: nowISO(), updated_at: nowISO() };
  store.insert('seasons', season);
  return { status: 201, body: { success: true, season } };
});
on('PATCH', '/seasons/:id', ({ params, body }) => {
  const patch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.startDate !== undefined) patch.start_date = body.startDate;
  if (body.endDate !== undefined) patch.end_date = body.endDate;
  const season = store.update('seasons', params.id, patch);
  if (!season) fail(404, 'Season not found');
  return { success: true, season };
});
on('DELETE', '/seasons/:id', ({ params }) => {
  const blocked = store.find('games', (g) => g.season_id === params.id && (g.status === 'active' || g.status === 'completed'));
  if (blocked.length) fail(409, 'Season has played games and cannot be deleted');
  store.find('games', (g) => g.season_id === params.id).forEach((g) => store.remove('games', g.id));
  store.remove('seasons', params.id);
  return { success: true };
});

// ── Athletes ────────────────────────────────────────────────────────────────────
const ATHLETE_FIELD_MAP = {
  firstName: 'first_name', lastName: 'last_name', jerseyNumber: 'jersey_number',
  primaryPosition: 'primary_position', secondaryPosition: 'secondary_position',
  graduationYear: 'graduation_year', graduationMonth: 'graduation_month', notes: 'notes',
  email: 'email', sendGameSummary: 'send_game_summary', shotHand: 'shot_hand',
  isCaptain: 'is_captain', depthTier: 'depth_tier', status: 'status',
  skillGroundBalls: 'skill_ground_balls', skillDodging: 'skill_dodging',
  skillShooting: 'skill_shooting', skillPassing: 'skill_passing', skillDefense: 'skill_defense',
  skillFaceoff: 'skill_faceoff', skillTransition: 'skill_transition', skillFieldAwareness: 'skill_field_awareness',
};
on('GET', '/athletes', ({ query }) => {
  if (!query.teamId) fail(400, 'teamId is required');
  const roster = store.find('athletes', (a) => a.team_id === query.teamId)
    .sort((a, b) => (a.primary_position || '').localeCompare(b.primary_position || '') || (a.last_name || '').localeCompare(b.last_name || ''));
  const stats = aggregateAthleteStats(teamGameIds(query.teamId));
  const athletes = roster.map((a) => ({
    id: a.id, jersey_number: a.jersey_number, first_name: a.first_name, last_name: a.last_name,
    primary_position: a.primary_position, secondary_position: a.secondary_position,
    graduation_year: a.graduation_year, graduation_month: a.graduation_month, status: a.status,
    notes: a.notes, shot_hand: a.shot_hand, is_captain: a.is_captain, depth_tier: a.depth_tier,
    skill_ground_balls: a.skill_ground_balls, skill_dodging: a.skill_dodging, skill_shooting: a.skill_shooting,
    skill_passing: a.skill_passing, skill_defense: a.skill_defense, skill_faceoff: a.skill_faceoff,
    skill_transition: a.skill_transition, skill_field_awareness: a.skill_field_awareness,
    ...athleteWithStats(a, stats),
  }));
  return { success: true, athletes, pagination: { total: athletes.length, limit: athletes.length, offset: 0, hasMore: false } };
});
on('GET', '/athletes/:id', ({ params }) => {
  const a = store.getById('athletes', params.id);
  if (!a) fail(404, 'Athlete not found');
  const stats = aggregateAthleteStats(teamGameIds(a.team_id));
  return { success: true, athlete: { ...a, ...athleteWithStats(a, stats), parent_contacts: parentContacts(a.id) } };
});
on('GET', '/athletes/:id/season-history', ({ params }) => {
  const a = store.getById('athletes', params.id);
  if (!a) fail(404, 'Athlete not found');
  const seasons = store.find('seasons', (s) => s.team_id === a.team_id).map((s) => {
    const stats = aggregateAthleteStats(teamGameIds(a.team_id, s.id));
    const row = stats.byAthlete[a.id] || blankStats();
    const gp = (stats.gamesByAthlete[a.id] && stats.gamesByAthlete[a.id].size) || 0;
    return { season_id: s.id, season_name: s.name, start_date: s.start_date, end_date: s.end_date, ...row, games_played: gp };
  }).filter((s) => s.games_played > 0);
  return { success: true, seasons };
});
on('POST', '/athletes', ({ body }) => {
  if (!body.teamId || !body.firstName || !body.lastName) fail(400, 'teamId, firstName and lastName are required');
  const a = {
    id: uuid(), team_id: body.teamId, first_name: body.firstName, last_name: body.lastName,
    jersey_number: body.jerseyNumber ?? null, graduation_year: body.graduationYear ?? null,
    graduation_month: body.graduationMonth ?? null, primary_position: body.primaryPosition ?? null,
    secondary_position: body.secondaryPosition ?? null,
    skill_ground_balls: body.skillGroundBalls ?? 5, skill_dodging: body.skillDodging ?? 5,
    skill_shooting: body.skillShooting ?? 5, skill_passing: body.skillPassing ?? 5,
    skill_defense: body.skillDefense ?? 5, skill_faceoff: body.skillFaceoff ?? 5,
    skill_transition: body.skillTransition ?? 5, skill_field_awareness: body.skillFieldAwareness ?? 5,
    status: 'active', notes: body.notes ?? '', email: body.email ?? null,
    send_game_summary: body.sendGameSummary ?? false, shot_hand: body.shotHand ?? 'right',
    is_captain: body.isCaptain ?? false, depth_tier: body.depthTier ?? 'rotation',
    created_at: nowISO(), updated_at: nowISO(),
  };
  store.insert('athletes', a);
  if (Array.isArray(body.parentContacts)) {
    body.parentContacts.forEach((pc) => store.insert('parent_contacts', { id: uuid(), athlete_id: a.id, name: pc.name || null, email: pc.email || null, phone: pc.phone || null, created_at: nowISO(), updated_at: nowISO() }));
  }
  return { status: 201, body: { success: true, athlete: { ...a, parent_contacts: parentContacts(a.id) } } };
});
on('PATCH', '/athletes/:id', ({ params, body }) => {
  const a = store.getById('athletes', params.id);
  if (!a) fail(404, 'Athlete not found');
  const patch = {};
  for (const [k, col] of Object.entries(ATHLETE_FIELD_MAP)) if (body[k] !== undefined) patch[col] = body[k];
  store.update('athletes', params.id, patch);
  if (Array.isArray(body.parentContacts)) {
    parentContacts(a.id).forEach((pc) => store.remove('parent_contacts', pc.id));
    body.parentContacts.forEach((pc) => store.insert('parent_contacts', { id: uuid(), athlete_id: a.id, name: pc.name || null, email: pc.email || null, phone: pc.phone || null, created_at: nowISO(), updated_at: nowISO() }));
  }
  return { success: true, athlete: { ...store.getById('athletes', params.id), parent_contacts: parentContacts(a.id) } };
});
on('DELETE', '/athletes/:id', ({ params }) => {
  store.remove('athletes', params.id);
  return { success: true };
});

// ── Games ─────────────────────────────────────────────────────────────────────
on('GET', '/games', ({ query }) => {
  if (!query.teamId) fail(400, 'teamId is required');
  let games = store.find('games', (g) => g.team_id === query.teamId);
  if (query.status) games = games.filter((g) => g.status === query.status);
  games.sort((a, b) => (a.game_date < b.game_date ? 1 : -1));
  return {
    success: true,
    games: games.map((g) => ({ id: g.id, opponent: g.opponent, game_date: g.game_date, start_time: g.start_time, location: g.location, format: g.format, score_home: g.score_home, score_away: g.score_away, status: g.status, notes: g.notes, result: gameResult(g) })),
  };
});
on('GET', '/games/:id', ({ params }) => {
  const g = store.getById('games', params.id);
  if (!g) fail(404, 'Game not found');
  return { success: true, game: { ...g, result: gameResult(g) } };
});
on('POST', '/games', ({ body }) => {
  if (!body.opponent || !body.gameDate) fail(400, 'opponent and gameDate are required');
  let seasonId = body.seasonId;
  if (!seasonId) {
    const s = store.findOne('seasons', (x) => x.team_id === body.teamId && x.start_date <= body.gameDate && x.end_date >= body.gameDate);
    if (!s) fail(409, { error: 'No season covers this date', code: 'NO_SEASON' });
    seasonId = s.id;
  }
  const g = {
    id: uuid(), team_id: body.teamId, opponent: body.opponent, game_date: body.gameDate,
    start_time: body.startTime || null, location: body.location || null, format: body.format || 'standard',
    periods: 4, period_length_minutes: 12, shot_clock_seconds: store.db().settings.shotClockSeconds || 60,
    score_home: 0, score_away: 0, status: 'scheduled', notes: body.notes || '', starting_lineup: null,
    opposing_team_id: body.opposingTeamId || null, season_id: seasonId, created_at: nowISO(), updated_at: nowISO(),
  };
  store.insert('games', g);
  return { status: 201, body: { success: true, game: g } };
});
on('PATCH', '/games/:id', ({ params, body }) => {
  const map = { opponent: 'opponent', gameDate: 'game_date', startTime: 'start_time', location: 'location', format: 'format', scoreHome: 'score_home', scoreAway: 'score_away', status: 'status', notes: 'notes', opposingTeamId: 'opposing_team_id' };
  const patch = {};
  for (const [k, col] of Object.entries(map)) if (body[k] !== undefined) patch[col] = body[k];
  const g = store.update('games', params.id, patch);
  if (!g) fail(404, 'Game not found');
  return { success: true, game: { ...g, result: gameResult(g) } };
});
on('GET', '/games/:gameId/situation-assignments', ({ params }) => ({
  success: true,
  assignments: store.find('situation_assignments', (s) => s.game_id === params.gameId).sort((a, b) => a.situation_type.localeCompare(b.situation_type)),
}));
on('PUT', '/games/:gameId/situation-assignments/:type', ({ params, body }) => {
  let row = store.findOne('situation_assignments', (s) => s.game_id === params.gameId && s.situation_type === params.type);
  if (row) store.update('situation_assignments', row.id, { player_ids: body.playerIds });
  else { row = { id: uuid(), game_id: params.gameId, situation_type: params.type, player_ids: body.playerIds, created_at: nowISO(), updated_at: nowISO() }; store.insert('situation_assignments', row); }
  return { success: true, assignment: store.getById('situation_assignments', row.id) };
});
on('DELETE', '/games/:gameId/situation-assignments/:type', ({ params }) => {
  const row = store.findOne('situation_assignments', (s) => s.game_id === params.gameId && s.situation_type === params.type);
  if (row) store.remove('situation_assignments', row.id);
  return { success: true };
});

// ── Game-live ───────────────────────────────────────────────────────────────────
on('POST', '/game-live/:gameId/start', ({ params, body }) => {
  const L = getLive(params.gameId, { create: true });
  L.gsm.state = 'ACTIVE';
  L.gsm.period = 1;
  if (body?.startingLineup) L.gsm.fieldPositions = { ...L.gsm.fieldPositions, ...body.startingLineup };
  L.gsm.bench = rosterForTeam(store.getById('games', params.gameId).team_id).map((a) => a.id).filter((id) => !Object.values(L.gsm.fieldPositions).includes(id));
  store.update('games', params.gameId, { status: 'active', starting_lineup: L.gsm.fieldPositions });
  persistLive(params.gameId);
  return { success: true, gameId: params.gameId, state: liveState(L) };
});
on('POST', '/game-live/:gameId/clock/start', ({ params }) => {
  const L = getLive(params.gameId);
  const ev = L.gsm.startClock();
  if (!ev) fail(400, 'Clock already running');
  ptStartAll(L, Date.now());
  persistLive(params.gameId);
  return { success: true, event: ev, state: liveState(L) };
});
on('POST', '/game-live/:gameId/clock/stop', ({ params }) => {
  const L = getLive(params.gameId);
  const ev = L.gsm.stopClock();
  if (!ev) fail(400, 'Clock not running');
  ptStopAll(L, Date.now());
  persistLive(params.gameId);
  return { success: true, event: ev, state: liveState(L) };
});
on('POST', '/game-live/:gameId/period/end', ({ params }) => {
  const L = getLive(params.gameId);
  ptStopAll(L, Date.now());
  const ev = L.gsm.endPeriod();
  persistLive(params.gameId);
  return { success: true, event: ev, state: liveState(L) };
});
on('POST', '/game-live/:gameId/period/next', ({ params }) => {
  const L = getLive(params.gameId);
  const ev = L.gsm.startNextPeriod();
  if (!ev) fail(400, 'Not in a period break');
  persistLive(params.gameId);
  return { success: true, event: ev, state: liveState(L) };
});
on('POST', '/game-live/:gameId/sub', ({ params, body }) => {
  const L = getLive(params.gameId);
  const now = Date.now();
  if (L.gsm.clockRunning && body.playerOut) ptBank(L, body.playerOut, now), (L.playtime[body.playerOut].onField = false);
  const ev = L.gsm.executeSubstitution(body.playerIn, body.playerOut, body.position);
  if (ev.success === false) fail(400, ev.error);
  if (L.gsm.clockRunning && body.playerIn) { const p = ptEnsure(L, body.playerIn); p.onField = true; p.since = now; }
  persistLive(params.gameId);
  return { success: true, event: ev, state: liveState(L) };
});
on('POST', '/game-live/:gameId/event', ({ params, body }) => {
  const L = getLive(params.gameId);
  const ev = L.gsm.logEvent(body.eventType, body.athleteId, body.metadata || {});
  const dbType = EVENT_TYPE_MAP[body.eventType] || String(body.eventType).toLowerCase();
  persistEvent(params.gameId, { athleteId: body.athleteId, eventType: dbType, period: L.gsm.period, clockSeconds: L.gsm.clockTime });
  ev.seqNo = L.seq;
  persistLive(params.gameId);
  return { success: true, event: ev, state: liveState(L) };
});
on('POST', '/game-live/:gameId/opponent-event', ({ params, body }) => {
  const L = getLive(params.gameId);
  const ev = { type: String(body.eventType).toUpperCase(), teamSide: 'away', opposingPlayerId: body.opposingPlayerId || null, timestamp: Date.now(), period: L.gsm.period, clockTime: L.gsm.clockTime };
  L.gsm.events.push(ev);
  persistEvent(params.gameId, { athleteId: null, eventType: body.eventType, period: L.gsm.period, clockSeconds: L.gsm.clockTime, teamSide: 'away', opposingPlayerId: body.opposingPlayerId || null });
  persistLive(params.gameId);
  return { success: true, event: ev, state: liveState(L) };
});
on('GET', '/game-live/:gameId/threats', ({ params }) => {
  const g = store.getById('games', params.gameId);
  if (!g?.opposing_team_id) return { success: true, threats: [], note: 'No opposing team linked to this game.' };
  return { success: true, threats: computeThreats(params.gameId, g.opposing_team_id) };
});
on('DELETE', '/game-live/:gameId/event/last', ({ params }) => {
  const L = getLive(params.gameId);
  const removed = L.gsm.undoLastStatEvent();
  if (removed) {
    const rows = store.find('game_events', (e) => e.game_id === params.gameId && e.team_side === 'home' && EVENT_TO_STAT[e.event_type]);
    const last = rows[rows.length - 1];
    if (last) store.remove('game_events', last.id);
  }
  persistLive(params.gameId);
  return { success: true, removed: removed || null, state: liveState(L) };
});
on('POST', '/game-live/:gameId/score', ({ params, body }) => {
  const L = getLive(params.gameId);
  const ev = L.gsm.updateScore(body.team, body.points);
  store.update('games', params.gameId, { score_home: L.gsm.homeScore, score_away: L.gsm.awayScore });
  persistLive(params.gameId);
  return { success: true, event: ev, state: liveState(L) };
});
on('GET', '/game-live/:gameId/state', ({ params }) => {
  const L = getLive(params.gameId);
  return { success: true, state: liveState(L) };
});
on('GET', '/game-live/:gameId/playtime', ({ params }) => {
  const L = getLive(params.gameId);
  return { success: true, summary: ptSummary(L), equityFlags: ptEquityFlags(L) };
});
on('POST', '/game-live/:gameId/end', ({ params }) => {
  const L = getLive(params.gameId);
  ptStopAll(L, Date.now());
  L.gsm.state = 'COMPLETED';
  // Persist final playtime to the season log (clear any prior rows for this game).
  store.find('playtime_log', (p) => p.game_id === params.gameId).forEach((p) => store.remove('playtime_log', p.id));
  for (const [athleteId, p] of Object.entries(L.playtime)) {
    store.insert('playtime_log', { id: uuid(), game_id: params.gameId, athlete_id: athleteId, period: 0, minutes_played: Math.round((p.totalSeconds / 60) * 100) / 100, entered_at_seconds: 0, exited_at_seconds: 0, created_at: nowISO() });
  }
  store.update('games', params.gameId, { status: 'completed', score_home: L.gsm.homeScore, score_away: L.gsm.awayScore });
  const finalState = liveState(L);
  persistLive(params.gameId);
  return { success: true, finalState };
});

// Sub queue
on('POST', '/game-live/:gameId/sub-queue/add', ({ params, body }) => {
  const L = getLive(params.gameId);
  const roster = rosterForTeam(store.getById('games', params.gameId).team_id);
  let entry;
  if (body.type === 'individual') {
    entry = { queueId: uuid(), type: 'individual', label: 'Manual Sub', source: 'manual', situationType: null, stayingPlayers: [], moves: [{ moveId: uuid(), playerIn: body.playerIn, playerOut: body.playerOut, position: body.position }] };
  } else if (body.type === 'line') {
    const line = store.getById('lines', body.lineId);
    if (!line) fail(404, 'Line not found');
    entry = L.gsm.resolveLineSwap(line);
  } else if (body.type === 'situation') {
    const assign = store.findOne('situation_assignments', (s) => s.game_id === params.gameId && s.situation_type === body.situationType);
    entry = resolveSituation(L.gsm, body.situationType, assign?.player_ids || null, roster, null);
  } else {
    fail(400, 'Unknown sub-queue entry type');
  }
  const { mergeAlerts } = L.gsm.addToQueue(entry);
  persistLive(params.gameId);
  return { success: true, entry, subQueue: L.gsm.subQueue, mergeAlerts };
});
on('DELETE', '/game-live/:gameId/sub-queue/:queueId', ({ params }) => {
  const L = getLive(params.gameId);
  L.gsm.removeFromQueue(params.queueId);
  persistLive(params.gameId);
  return { success: true, subQueue: L.gsm.subQueue };
});
on('DELETE', '/game-live/:gameId/sub-queue/:queueId/moves/:moveId', ({ params }) => {
  const L = getLive(params.gameId);
  L.gsm.removeMoveFromQueue(params.queueId, params.moveId);
  persistLive(params.gameId);
  return { success: true, subQueue: L.gsm.subQueue };
});
on('POST', '/game-live/:gameId/batch-sub', ({ params }) => {
  const L = getLive(params.gameId);
  const now = Date.now();
  const result = L.gsm.executeBatchSub();
  if (!result.success) return { status: 400, body: { success: false, errors: result.errors } };
  // Re-sync playtime on/off-field flags to the new field set.
  if (L.gsm.clockRunning) {
    const fieldIds = new Set(ptFieldIds(L));
    for (const id of Object.keys(L.playtime)) {
      const p = L.playtime[id];
      const shouldBeOn = fieldIds.has(id);
      if (p.onField && !shouldBeOn) { ptBank(L, id, now); p.onField = false; }
      else if (!p.onField && shouldBeOn) { p.onField = true; p.since = now; }
    }
  }
  persistLive(params.gameId);
  return { success: true, event: result.event, state: liveState(L) };
});
on('GET', '/game-live/:gameId/events-since/:seqNo', ({ params }) => {
  const L = live.get(params.gameId);
  if (!L) return { success: true, events: [], latestSeqNo: 0, snapshot: null };
  return { success: true, events: [], latestSeqNo: L.seq, snapshot: liveState(L) };
});

// ── Game sessions (single device — multi-coach is handled by Multipeer) ────────
on('POST', '/game-sessions/join', () => fail(400, 'Joining over the network is handled by nearby-device sync, not this endpoint.'));
on('GET', '/game-sessions/:gameId/participants', () => {
  const c = store.db().coach;
  return { success: true, participants: [{ coach_id: c.id, role: 'head_coach', joined_at: nowISO(), first_name: c.firstName, last_name: c.lastName, email: c.email }] };
});
on('POST', '/game-sessions/:gameId/leave', () => ({ success: true }));

// ── Lines ───────────────────────────────────────────────────────────────────────
on('GET', '/lines/roles', ({ query }) => ({ success: true, roles: listLineRoles({ format: query.format || 'standard' }) }));
on('GET', '/lines/suggestions', ({ query }) => {
  if (!query.teamId || !query.role) fail(400, 'teamId and role are required');
  const roster = store.find('athletes', (a) => a.team_id === query.teamId);
  const excludeIds = query.exclude ? String(query.exclude).split(',') : [];
  try {
    const r = suggestLine(roster, query.role, { excludeIds });
    return { success: true, ...r };
  } catch (e) {
    fail(400, e.message);
  }
});
on('GET', '/lines/rotations', ({ query }) => ({ success: true, rotations: store.find('line_rotations', (r) => r.team_id === query.teamId) }));
on('POST', '/lines/rotations', ({ body }) => {
  if (!body.lineIds || body.lineIds.length < 2) fail(400, 'A rotation needs at least two lines');
  const row = { id: uuid(), team_id: body.teamId, name: body.name, position_group: body.positionGroup, line_ids: body.lineIds, created_at: nowISO(), updated_at: nowISO() };
  store.insert('line_rotations', row);
  return { status: 201, body: { success: true, rotation: row } };
});
on('PUT', '/lines/rotations/:id', ({ params, body }) => {
  const patch = {};
  ['name', 'positionGroup', 'lineIds'].forEach((k) => { if (body[k] !== undefined) patch[k === 'positionGroup' ? 'position_group' : k === 'lineIds' ? 'line_ids' : k] = body[k]; });
  const row = store.update('line_rotations', params.id, patch);
  if (!row) fail(404, 'Rotation not found');
  return { success: true, rotation: row };
});
on('DELETE', '/lines/rotations/:id', ({ params }) => { store.remove('line_rotations', params.id); return { success: true }; });
on('GET', '/lines', ({ query }) => ({ success: true, lines: store.find('lines', (l) => l.team_id === query.teamId).sort((a, b) => (a.position_group || '').localeCompare(b.position_group || '') || a.name.localeCompare(b.name)) }));
on('POST', '/lines', ({ body }) => {
  const row = { id: uuid(), team_id: body.teamId, name: body.name, position_group: body.positionGroup, player_ids: body.playerIds || [], created_at: nowISO(), updated_at: nowISO() };
  store.insert('lines', row);
  return { status: 201, body: { success: true, line: row } };
});
on('PUT', '/lines/:lineId', ({ params, body }) => {
  const patch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.positionGroup !== undefined) patch.position_group = body.positionGroup;
  if (body.playerIds !== undefined) patch.player_ids = body.playerIds;
  const row = store.update('lines', params.lineId, patch);
  if (!row) fail(404, 'Line not found');
  return { success: true, line: row };
});
on('DELETE', '/lines/:lineId', ({ params }) => { store.remove('lines', params.lineId); return { success: true }; });

// ── Plays ───────────────────────────────────────────────────────────────────────
on('GET', '/plays', ({ query }) => {
  let plays = store.find('plays', (p) => p.team_id === query.teamId);
  if (query.situationTag) plays = plays.filter((p) => p.situation_tag === query.situationTag);
  return { success: true, data: plays, pagination: { total: plays.length, limit: plays.length, offset: 0, hasMore: false } };
});
on('GET', '/plays/:id', ({ params }) => {
  const p = store.getById('plays', params.id);
  if (!p) fail(404, { success: false, error: 'Play not found' });
  return { success: true, data: p };
});
on('POST', '/plays', ({ body }) => {
  const row = { id: uuid(), team_id: body.teamId, title: body.title, situation_tag: body.situationTag || null, diagram_data: body.diagramData || { format: 'half_field', players: [], arrows: [], text_labels: [] }, notes: body.notes || '', created_at: nowISO(), updated_at: nowISO() };
  store.insert('plays', row);
  return { status: 201, body: { success: true, data: row } };
});
on('PUT', '/plays/:id', ({ params, body }) => {
  const patch = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.situationTag !== undefined) patch.situation_tag = body.situationTag;
  if (body.diagramData !== undefined) patch.diagram_data = body.diagramData;
  if (body.notes !== undefined) patch.notes = body.notes;
  const row = store.update('plays', params.id, patch);
  if (!row) fail(404, { success: false, error: 'Play not found' });
  return { success: true, data: row };
});
on('DELETE', '/plays/:id', ({ params }) => { store.remove('plays', params.id); return { success: true, message: 'Play deleted successfully' }; });
on('POST', '/plays/:id/duplicate', ({ params, body }) => {
  const src = store.getById('plays', params.id);
  if (!src) fail(404, { success: false, error: 'Play not found' });
  const row = { ...src, id: uuid(), title: body.newTitle || `${src.title} (Copy)`, created_at: nowISO(), updated_at: nowISO() };
  store.insert('plays', row);
  return { status: 201, body: { success: true, data: row } };
});
on('GET', '/plays/:id/export', ({ params }) => {
  const p = store.getById('plays', params.id);
  if (!p) fail(404, { success: false, error: 'Play not found' });
  return { success: true, data: { play: p, exportReady: true } };
});

// ── Practice ────────────────────────────────────────────────────────────────────
const drillList = Array.isArray(drillsKB) ? drillsKB : drillsKB.drills || [];
on('GET', '/practice/drills/library', () => ({ drills: drillList }));
on('GET', '/practice/drills/:drillId', ({ params }) => {
  const d = drillList.find((x) => String(x.id) === String(params.drillId));
  if (!d) fail(404, 'Drill not found');
  return d;
});
on('GET', '/practice/analysis/:teamId', ({ params }) => analyzePractice(params.teamId));
on('GET', '/practice', ({ query }) => {
  if (!query.team_id) fail(400, 'team_id is required');
  const sessions = store.find('practice_sessions', (p) => p.team_id === query.team_id).map(practiceOut);
  return { sessions, total: sessions.length, limit: sessions.length, offset: 0, hasMore: false };
});
on('GET', '/practice/:id', ({ params }) => {
  const p = store.getById('practice_sessions', params.id);
  if (!p) fail(404, 'Practice session not found');
  return practiceOut(p);
});
on('POST', '/practice', ({ body }) => {
  if (!body.team_id || !body.practice_date || !body.drill_blocks) fail(400, 'team_id, practice_date and drill_blocks are required');
  const row = { id: uuid(), team_id: body.team_id, practice_date: body.practice_date, start_time: body.start_time || null, drill_blocks: body.drill_blocks, focus_tags: body.focus_tags || [], notes: body.notes || '', created_at: nowISO(), updated_at: nowISO() };
  store.insert('practice_sessions', row);
  return { status: 201, body: practiceOut(row) };
});
on('PUT', '/practice/:id', ({ params, body }) => {
  const patch = {};
  ['practice_date', 'start_time', 'drill_blocks', 'focus_tags', 'notes'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
  const row = store.update('practice_sessions', params.id, patch);
  if (!row) fail(404, 'Practice session not found');
  return practiceOut(row);
});
on('DELETE', '/practice/:id', ({ params }) => { store.remove('practice_sessions', params.id); return { success: true }; });

// ── Opposing ────────────────────────────────────────────────────────────────────
on('GET', '/opposing/teams', ({ query }) => ({ success: true, opposingTeams: store.find('opposing_teams', (t) => t.team_id === query.teamId).sort((a, b) => a.name.localeCompare(b.name)) }));
on('POST', '/opposing/teams/lookup', ({ body }) => {
  let t = store.findOne('opposing_teams', (x) => x.team_id === body.teamId && x.name.toLowerCase() === String(body.name).toLowerCase());
  if (t) return { success: true, opposingTeam: t, created: false };
  t = { id: uuid(), team_id: body.teamId, name: body.name, notes: '', created_at: nowISO(), updated_at: nowISO() };
  store.insert('opposing_teams', t);
  return { status: 201, body: { success: true, opposingTeam: t, created: true } };
});
on('POST', '/opposing/teams', ({ body }) => {
  const t = { id: uuid(), team_id: body.teamId, name: body.name, notes: body.notes || '', created_at: nowISO(), updated_at: nowISO() };
  store.insert('opposing_teams', t);
  return { status: 201, body: { success: true, opposingTeam: t } };
});
on('PATCH', '/opposing/teams/:id', ({ params, body }) => {
  const patch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.notes !== undefined) patch.notes = body.notes;
  const t = store.update('opposing_teams', params.id, patch);
  if (!t) fail(404, 'Opposing team not found');
  return { success: true, opposingTeam: t };
});
on('DELETE', '/opposing/teams/:id', ({ params }) => { store.remove('opposing_teams', params.id); return { success: true }; });
on('GET', '/opposing/players', ({ query }) => ({ success: true, opposingPlayers: store.find('opposing_players', (p) => p.opposing_team_id === query.opposingTeamId) }));
on('POST', '/opposing/players', ({ body }) => {
  const p = { id: uuid(), opposing_team_id: body.opposingTeamId, jersey_number: body.jerseyNumber ?? null, display_name: body.displayName || '', primary_position: body.primaryPosition || null, notes: body.notes || '', created_at: nowISO(), updated_at: nowISO() };
  store.insert('opposing_players', p);
  return { status: 201, body: { success: true, opposingPlayer: p } };
});
on('PATCH', '/opposing/players/:id', ({ params, body }) => {
  const map = { jerseyNumber: 'jersey_number', displayName: 'display_name', primaryPosition: 'primary_position', notes: 'notes' };
  const patch = {};
  for (const [k, col] of Object.entries(map)) if (body[k] !== undefined) patch[col] = body[k];
  const p = store.update('opposing_players', params.id, patch);
  if (!p) fail(404, 'Opposing player not found');
  return { success: true, opposingPlayer: p };
});
on('POST', '/opposing/players/bulk', ({ body }) => {
  const existing = new Set(store.find('opposing_players', (p) => p.opposing_team_id === body.opposingTeamId).map((p) => p.jersey_number));
  let inserted = 0, skipped = 0;
  (body.players || []).forEach((pl) => {
    if (pl.jerseyNumber != null && existing.has(pl.jerseyNumber)) { skipped += 1; return; }
    store.insert('opposing_players', { id: uuid(), opposing_team_id: body.opposingTeamId, jersey_number: pl.jerseyNumber ?? null, display_name: pl.displayName || '', primary_position: pl.primaryPosition || null, notes: pl.notes || '', created_at: nowISO(), updated_at: nowISO() });
    inserted += 1;
  });
  return { status: 201, body: { success: true, inserted, skipped, opposingPlayers: store.find('opposing_players', (p) => p.opposing_team_id === body.opposingTeamId) } };
});
on('DELETE', '/opposing/players/:id', ({ params }) => { store.remove('opposing_players', params.id); return { success: true }; });
on('GET', '/opposing/players/:id/film-stats', ({ params }) => ({ success: true, filmStats: store.findOne('opposing_player_film_stats', (f) => f.opposing_player_id === params.id) }));
on('PUT', '/opposing/players/:id/film-stats', ({ params, body }) => {
  const map = { gamesObserved: 'games_observed', goals: 'goals', assists: 'assists', shots: 'shots', shotsOnGoal: 'shots_on_goal', groundBalls: 'ground_balls', turnovers: 'turnovers', causedTurnovers: 'caused_turnovers', saves: 'saves', faceoffWins: 'faceoff_wins', faceoffLosses: 'faceoff_losses', penalties: 'penalties', notes: 'notes' };
  let row = store.findOne('opposing_player_film_stats', (f) => f.opposing_player_id === params.id);
  if (!row) { row = { opposing_player_id: params.id, games_observed: 0, goals: 0, assists: 0, shots: 0, shots_on_goal: 0, ground_balls: 0, turnovers: 0, caused_turnovers: 0, saves: 0, faceoff_wins: 0, faceoff_losses: 0, penalties: 0, notes: '', created_at: nowISO(), updated_at: nowISO() }; store.insert('opposing_player_film_stats', row); }
  for (const [k, col] of Object.entries(map)) if (body[k] !== undefined) row[col] = body[k];
  row.updated_at = nowISO();
  store.persistNow();
  return { success: true, filmStats: row };
});
on('GET', '/opposing/teams/:id/film-stats', ({ params }) => {
  const players = store.find('opposing_players', (p) => p.opposing_team_id === params.id);
  const ids = new Set(players.map((p) => p.id));
  return { success: true, filmStats: store.find('opposing_player_film_stats', (f) => ids.has(f.opposing_player_id)) };
});

// ── Stats ───────────────────────────────────────────────────────────────────────
on('GET', '/stats/game/:gameId', ({ params }) => {
  const g = store.getById('games', params.gameId);
  if (!g) fail(404, 'Game not found');
  const homeEvents = store.find('game_events', (e) => e.game_id === params.gameId && e.team_side === 'home');
  const awayEvents = store.find('game_events', (e) => e.game_id === params.gameId && e.team_side === 'away');
  const playtime = {};
  store.find('playtime_log', (p) => p.game_id === params.gameId).forEach((p) => (playtime[p.athlete_id] = Number(p.minutes_played || 0)));
  const homeMap = {};
  homeEvents.forEach((e) => {
    if (!e.athlete_id) return;
    const a = store.getById('athletes', e.athlete_id);
    if (!homeMap[e.athlete_id]) homeMap[e.athlete_id] = { athlete_id: e.athlete_id, first_name: a?.first_name, last_name: a?.last_name, jersey_number: a?.jersey_number, primary_position: a?.primary_position, ...blankStats(), minutes_played: playtime[e.athlete_id] || 0 };
    const stat = EVENT_TO_STAT[e.event_type];
    if (stat) homeMap[e.athlete_id][stat] += 1;
  });
  const homeTotals = blankStats(); homeTotals.penalties = 0;
  Object.values(homeMap).forEach((r) => STAT_FIELDS.forEach((f) => (homeTotals[f] += r[f])));
  return {
    success: true, gameId: params.gameId,
    athletes: Object.values(homeMap).sort((a, b) => b.goals + b.assists - (a.goals + a.assists)),
    opponents: [],
    totals: homeTotals, homeTotals,
    awayTotals: { ...blankStats(), penalties: 0 },
    awayEventCount: awayEvents.length,
  };
});
on('GET', '/stats/athlete/:athleteId', ({ params }) => {
  const a = store.getById('athletes', params.athleteId);
  if (!a) fail(404, 'Athlete not found');
  const stats = aggregateAthleteStats(teamGameIds(a.team_id));
  const s = stats.byAthlete[a.id] || blankStats();
  const minutes = stats.minutes[a.id] || 0;
  const gp = (stats.gamesByAthlete[a.id] && stats.gamesByAthlete[a.id].size) || 0;
  const shotPct = s.shots ? Math.round((s.goals / s.shots) * 1000) / 10 : 0;
  const foTotal = s.faceoff_wins + s.faceoff_losses;
  return { success: true, athleteId: a.id, stats: { athlete_id: a.id, team_id: a.team_id, first_name: a.first_name, last_name: a.last_name, jersey_number: a.jersey_number, games_participated: gp, ...s, total_minutes_played: minutes, shot_pct: shotPct, faceoff_pct: foTotal ? Math.round((s.faceoff_wins / foTotal) * 1000) / 10 : 0 } };
});

// ── Dashboard ───────────────────────────────────────────────────────────────────
on('GET', '/dashboard/season/:teamId', ({ params, query }) => buildDashboard(params.teamId, query.seasonId));

// ── AI coach (proxied) ──────────────────────────────────────────────────────────
on('POST', '/ai-coach/recommendations', async ({ body }) => {
  const L = live.get(body.gameId);
  const context = L ? { state: liveState(L), playtime: ptSummary(L), equityFlags: ptEquityFlags(L), roster: rosterForTeam(store.getById('games', body.gameId)?.team_id) } : {};
  const rec = await aiRecommend({ gameId: body.gameId, focusArea: body.focusArea, context });
  return { success: true, recommendation: rec, latencyMs: rec.latencyMs || 0 };
});
on('POST', '/ai-coach/position-fit/:athleteId', async ({ params, body }) => {
  const a = store.getById('athletes', params.athleteId);
  if (!a) fail(404, 'Athlete not found');
  const engine = positionFit(a, body?.format || 'standard');
  let claudeAnalysis = null;
  try { claudeAnalysis = await aiPositionAnalysis({ athlete: a, engine }); } catch { /* optional */ }
  return { success: true, athleteId: a.id, athleteName: `${a.first_name} ${a.last_name}`, format: body?.format || 'standard', positionEngine: engine, claudeAnalysis, latencyMs: 0 };
});
on('GET', '/ai-coach/available-agents', () => ({ success: true, agents: [{ id: 'lineCoach', name: 'Line Coach', description: 'Substitution and playtime guidance', capabilities: ['substitutions', 'playtime', 'position-fit'], model: 'claude-haiku', status: 'active' }] }));
on('GET', '/ai-coach/stats/:gameId', ({ params }) => ({ success: true, gameId: params.gameId, stats: { gameId: params.gameId, callCount: 0, totalTokens: 0, avgLatencyMs: 0, totalCostDollars: 0 } }));
on('GET', '/ai-coach/conversation/:gameId', ({ params }) => ({ success: true, gameId: params.gameId, stats: { gameId: params.gameId, callCount: 0, totalTokens: 0, avgLatencyMs: 0, totalCostDollars: 0 }, callHistory: [] }));
on('POST', '/ai-coach/proactive/:pushId/ack', ({ params }) => {
  const p = store.getById('proactive_pushes', params.pushId);
  if (p) store.update('proactive_pushes', params.pushId, { acknowledged_at: nowISO() });
  return { success: true, push: { id: params.pushId, game_id: p?.game_id || null, rec_type: p?.rec_type || null, acknowledged_at: nowISO() } };
});
on('POST', '/ai-coach/proactive/:pushId/dismiss', ({ params }) => {
  const p = store.getById('proactive_pushes', params.pushId);
  if (p) store.update('proactive_pushes', params.pushId, { dismissed_at: nowISO() });
  return { success: true, push: { id: params.pushId, game_id: p?.game_id || null, rec_type: p?.rec_type || null, dismissed_at: nowISO() } };
});

// ── Public share (minimal local implementation) ────────────────────────────────
on('POST', '/public/athletes/:id/share', ({ params, body }) => {
  const token = uuid().replace(/-/g, '');
  const days = body?.expiresDays || 180;
  const row = { id: uuid(), token, athlete_id: params.id, created_by_coach_id: store.db().coach?.id, expires_at: new Date(Date.now() + days * 86400000).toISOString(), revoked_at: null, last_viewed_at: null, view_count: 0, created_at: nowISO() };
  store.insert('share_tokens', row);
  return { status: 201, body: { success: true, share: { id: row.id, token, expires_at: row.expires_at, created_at: row.created_at } } };
});
on('GET', '/public/athletes/:id/share', ({ params }) => ({ success: true, shares: store.find('share_tokens', (s) => s.athlete_id === params.id) }));
on('DELETE', '/public/athletes/:id/share', ({ params }) => {
  store.find('share_tokens', (s) => s.athlete_id === params.id && !s.revoked_at).forEach((s) => store.update('share_tokens', s.id, { revoked_at: nowISO() }));
  return { success: true };
});

// ════════════════════════════════════════════════════════════════════════════════
// Computed-feature helpers
// ════════════════════════════════════════════════════════════════════════════════
function positionFit(a, format) {
  const positions = positionsKB.positions || {};
  const skillKeyToCol = { shooting: 'skill_shooting', dodging: 'skill_dodging', passing: 'skill_passing', field_awareness: 'skill_field_awareness', ground_balls: 'skill_ground_balls', transition: 'skill_transition', defense: 'skill_defense', faceoff: 'skill_faceoff' };
  const scores = Object.entries(positions).map(([name, def]) => {
    const weights = def.key_skills || {};
    const ideal = def.ideal_profile || {};
    let num = 0, den = 0;
    for (const [skill, w] of Object.entries(weights)) {
      const rating = a[skillKeyToCol[skill]] ?? 5;
      const target = ideal[skill] ?? 7;
      const closeness = 1 - Math.min(1, Math.abs(rating - target) / 10);
      num += w * closeness; den += w;
    }
    return { position: name, fitScore: Math.round((den ? num / den : 0) * 100) };
  }).sort((x, y) => y.fitScore - x.fitScore);
  const strengths = ['shooting', 'dodging', 'passing', 'field_awareness', 'ground_balls', 'transition', 'defense', 'faceoff']
    .map((k) => ({ k, v: a[skillKeyToCol[k]] ?? 0 })).sort((x, y) => y.v - x.v);
  return {
    athleteId: a.id, athleteName: `${a.first_name} ${a.last_name}`, format,
    recommendations: {
      primary: { position: scores[0].position, fitScore: scores[0].fitScore, rationale: `Best skill match for ${scores[0].position}.` },
      secondary: scores[1] ? { position: scores[1].position, fitScore: scores[1].fitScore, rationale: `Viable secondary fit.` } : null,
      allScores: scores,
    },
    athleteStrengths: strengths.slice(0, 3).map((s) => s.k),
    developmentAreas: strengths.slice(-2).map((s) => s.k),
  };
}

function computeThreats(gameId, opposingTeamId) {
  const players = store.find('opposing_players', (p) => p.opposing_team_id === opposingTeamId);
  const WEIGHTS = { goal: 6, assist: 4, shot_on_goal: 2, save: 2, caused_turnover: 1.5, ground_ball: 1, shot: 0.5, faceoff_win: 0.75, turnover: -0.75, penalty: -0.5 };
  const MULT = { Defense: 1.35, Midfield: 1.1, FOGO: 1.05, Attack: 1.0, Goalie: 1.0 };
  const liveByPlayer = {};
  store.find('game_events', (e) => e.game_id === gameId && e.team_side === 'away' && e.opposing_player_id).forEach((e) => {
    (liveByPlayer[e.opposing_player_id] = liveByPlayer[e.opposing_player_id] || []).push(e.event_type);
  });
  return players.map((p) => {
    const film = store.findOne('opposing_player_film_stats', (f) => f.opposing_player_id === p.id) || {};
    let base = 0;
    for (const [type, w] of Object.entries(WEIGHTS)) {
      const col = EVENT_TO_STAT[type];
      base += (film[col] || 0) * w;
    }
    const live = (liveByPlayer[p.id] || []).reduce((sum, t) => sum + (WEIGHTS[t] || 0), 0);
    const mult = MULT[p.primary_position] || 1;
    const score = Math.max(0, (base + live * 1.3) * mult);
    const badge = score >= 18 ? 'LOCKDOWN' : score >= 10 ? 'HIGH' : score >= 5 ? 'WATCH' : 'LOW';
    return { playerId: p.id, jersey_number: p.jersey_number, display_name: p.display_name, primary_position: p.primary_position, score: Math.round(score * 10) / 10, badge, positionMultiplier: mult, topContributors: [], why: `${p.primary_position || 'Player'} threat score` };
  }).sort((a, b) => b.score - a.score);
}

const CORE_SKILLS = ['ground_balls', 'dodging', 'shooting', 'passing', 'defense', 'transition', 'field_awareness', 'faceoff'];
function analyzePractice(teamId) {
  const sessions = store.find('practice_sessions', (p) => p.team_id === teamId);
  const now = Date.now();
  const tagsWithin = (days) => {
    const set = new Set();
    sessions.filter((s) => now - new Date(s.practice_date).getTime() <= days * 86400000).forEach((s) => (s.focus_tags || []).forEach((t) => set.add(t)));
    return set;
  };
  const last30 = tagsWithin(30), last14 = tagsWithin(14);
  const stalled = CORE_SKILLS.filter((sk) => last30.has(sk) && !last14.has(sk));
  const neverDrilled = CORE_SKILLS.filter((sk) => !last30.has(sk));
  const recs = [];
  [...stalled, ...neverDrilled].forEach((skill) => {
    drillList.filter((d) => (d.skill_tags || []).includes(skill)).slice(0, 2).forEach((d) => recs.push({ drillId: d.id, drillName: d.name, category: d.category, skill, reason: stalled.includes(skill) ? 'Not drilled in the last 2 weeks' : 'Not drilled recently', durationMinutes: d.duration_minutes, difficulty: d.difficulty }));
  });
  return { stalledSkills: stalled, neverDrilledSkills: neverDrilled, recentlyPracticedSkills: [...last14], recommendations: recs.slice(0, 10), lastAnalyzedAt: nowISO() };
}

function practiceOut(p) {
  return { id: p.id, teamId: p.team_id, practiceDate: p.practice_date, startTime: p.start_time, drillBlocks: p.drill_blocks, focusTags: p.focus_tags, notes: p.notes, createdAt: p.created_at, updatedAt: p.updated_at };
}

function buildDashboard(teamId, seasonId) {
  const team = store.getById('teams', teamId);
  if (!team) fail(404, 'Team not found');
  const games = store.find('games', (g) => g.team_id === teamId && (!seasonId || g.season_id === seasonId));
  const completed = games.filter((g) => g.status === 'completed');
  const wins = completed.filter((g) => g.score_home > g.score_away).length;
  const losses = completed.filter((g) => g.score_home < g.score_away).length;
  const ties = completed.filter((g) => g.score_home === g.score_away).length;
  const upcoming = games.filter((g) => g.status === 'scheduled').length;
  const roster = store.find('athletes', (a) => a.team_id === teamId);
  const active = roster.filter((a) => a.status === 'active');
  const stats = aggregateAthleteStats(completed.map((g) => g.id));
  const topScorers = active
    .map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, jersey_number: a.jersey_number, primary_position: a.primary_position, goals: (stats.byAthlete[a.id] || {}).goals || 0, assists: (stats.byAthlete[a.id] || {}).assists || 0 }))
    .sort((a, b) => b.goals + b.assists - (a.goals + a.assists)).slice(0, 5);
  const playtimeEquity = active.map((a) => ({ athleteId: a.id, firstName: a.first_name, lastName: a.last_name, jerseyNumber: a.jersey_number, position: a.primary_position, totalMinutes: stats.minutes[a.id] || 0, gamesPlayed: (stats.gamesByAthlete[a.id] && stats.gamesByAthlete[a.id].size) || 0 }));
  const played = playtimeEquity.filter((p) => p.gamesPlayed > 0);
  const avgMinutes = played.length ? Math.round((played.reduce((s, p) => s + p.totalMinutes, 0) / played.length) * 10) / 10 : 0;
  const playtimeFlags = played.filter((p) => p.totalMinutes < avgMinutes * 0.4).map((p) => ({ athleteId: p.athleteId, name: `${p.firstName} ${p.lastName}`, jerseyNumber: p.jerseyNumber, totalMinutes: p.totalMinutes, flag: 'below_threshold', message: `${p.firstName} is well below the team average of ${avgMinutes} min` }));
  const goalsFor = completed.reduce((s, g) => s + g.score_home, 0);
  const goalsAgainst = completed.reduce((s, g) => s + g.score_away, 0);
  return {
    success: true,
    dashboard: {
      team,
      record: { games_played: completed.length, wins, losses, ties, upcoming, winPct: completed.length ? Math.round((wins / completed.length) * 100) : 0 },
      stats: { avgGoalsFor: completed.length ? Math.round((goalsFor / completed.length) * 10) / 10 : 0, avgGoalsAgainst: completed.length ? Math.round((goalsAgainst / completed.length) * 10) / 10 : 0 },
      roster: { total: roster.length, active: active.length, injured: roster.filter((a) => a.status === 'injured').length },
      recentGames: completed.slice().sort((a, b) => (a.game_date < b.game_date ? 1 : -1)).slice(0, 5).map((g) => ({ id: g.id, opponent: g.opponent, game_date: g.game_date, score_home: g.score_home, score_away: g.score_away, status: g.status, result: gameResult(g) })),
      topScorers,
      playtimeEquity,
      playtimeFlags,
      avgMinutes,
    },
  };
}

// ─── Matcher / dispatch ─────────────────────────────────────────────────────────
function matchRoute(method, path) {
  const segs = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      const p = r.parts[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
      else if (p !== segs[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

/**
 * Handle one request. Returns { status, data } (never throws — errors are
 * normalized to an HTTP-shaped result the adapter converts to an axios error).
 */
export async function handleRequest({ method, path, query = {}, body = null, headers = {} }) {
  await store.ready();
  const m = matchRoute(method.toUpperCase(), path);
  if (!m) return { status: 404, data: { error: `No local route for ${method} ${path}` } };
  try {
    const result = await m.handler({ params: m.params, query, body: body || {}, headers });
    if (result && typeof result === 'object' && 'status' in result && 'body' in result) {
      return { status: result.status, data: result.body };
    }
    return { status: 200, data: result };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, data: e.body };
    // Unexpected error — surface as 500 so the UI can toast.
    return { status: 500, data: { error: e.message || 'Local backend error' } };
  }
}

export default { handleRequest };
