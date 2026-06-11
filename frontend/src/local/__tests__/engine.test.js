/**
 * engine.test.js — guardrails for the on-device engine that is now the
 * production data layer (localBackend + localDb + ported gameStateManager /
 * playtime). Uses fake-indexeddb so the same IndexedDB-backed store runs under
 * Jest. Mirrors the manual verification harness used during the standalone port.
 */
import 'fake-indexeddb/auto';
import { handleRequest } from '../localBackend';

const req = (method, path, opt = {}) =>
  handleRequest({ method, path, query: opt.query || {}, body: opt.body || null });

let teamId;
let roster;
let scheduledId;
let completedId;

beforeAll(async () => {
  teamId = (await req('GET', '/auth/me')).data.teams[0].id;
  roster = (await req('GET', '/athletes', { query: { teamId } })).data.athletes;
  const games = (await req('GET', '/games', { query: { teamId } })).data.games;
  scheduledId = games.find((g) => g.status === 'scheduled').id;
  completedId = games.find((g) => g.status === 'completed').id;
});

function startingLineup() {
  const lineup = { goalie: roster.find((a) => a.primary_position === 'Goalie').id };
  roster.filter((a) => a.primary_position !== 'Goalie').slice(0, 10)
    .forEach((a, i) => { lineup[`field_${i}`] = a.id; });
  return lineup;
}

async function freshActiveGame() {
  const g = (await req('POST', '/games', { body: { teamId, opponent: 'Test FC', gameDate: '2026-06-20' } })).data.game;
  await req('POST', `/game-live/${g.id}/start`, { body: { startingLineup: startingLineup() } });
  await req('POST', `/game-live/${g.id}/clock/start`);
  return g.id;
}

test('seeds roster with computed season stats', () => {
  expect(roster).toHaveLength(18);
  expect(roster.find((a) => a.jersey_number === 13).goals).toBe(3);
  expect(roster.find((a) => a.jersey_number === 1).saves).toBe(6);
});

test('dashboard reflects the completed game', async () => {
  const d = (await req('GET', `/dashboard/season/${teamId}`)).data.dashboard;
  expect(d.record.wins).toBe(1);
  expect(d.record.games_played).toBe(1);
  expect(d.topScorers.length).toBeGreaterThan(0);
});

test('out-of-season game is rejected with NO_SEASON', async () => {
  const r = await req('POST', '/games', { body: { teamId, opponent: 'X', gameDate: '2030-01-01' } });
  expect(r.status).toBe(409);
  expect(r.data.code).toBe('NO_SEASON');
});

test('full live game: start, clock, event, score, substitution', async () => {
  const gid = scheduledId;
  let r = await req('POST', `/game-live/${gid}/start`, { body: { startingLineup: startingLineup() } });
  expect(r.data.state.state).toBe('ACTIVE');
  expect(Object.values(r.data.state.fieldPositions).filter(Boolean)).toHaveLength(11);

  r = await req('POST', `/game-live/${gid}/clock/start`);
  expect(r.data.state.clockRunning).toBe(true);

  await req('POST', `/game-live/${gid}/event`, { body: { eventType: 'GOAL', athleteId: r.data.state.fieldPositions.field_0 } });
  r = await req('POST', `/game-live/${gid}/score`, { body: { team: 'home', points: 1 } });
  expect(r.data.state.homeScore).toBe(1);

  const state = (await req('GET', `/game-live/${gid}/state`)).data.state;
  const benchId = state.bench[0];
  const outId = state.fieldPositions.field_9;
  r = await req('POST', `/game-live/${gid}/sub`, { body: { playerIn: benchId, playerOut: outId, position: 'field_9' } });
  expect(r.data.state.fieldPositions.field_9).toBe(benchId); // same-slot swap keeps the incoming player

  r = await req('POST', `/game-live/${gid}/end`, { body: {} });
  expect(r.status).toBe(200);
  expect(r.data.finalState).toBeTruthy();
});

test('every sub-queue entry carries a moves[] array (crash regression guard)', async () => {
  const gid = await freshActiveGame();
  const lineId = (await req('GET', '/lines', { query: { teamId } })).data.lines[0].id;

  let r = await req('POST', `/game-live/${gid}/sub-queue/add`, { body: { type: 'line', lineId } });
  expect(r.data.subQueue.every((e) => Array.isArray(e.moves))).toBe(true);

  r = await req('POST', `/game-live/${gid}/sub-queue/add`, { body: { type: 'situation', situationType: 'man_up' } });
  expect(r.data.subQueue.every((e) => Array.isArray(e.moves))).toBe(true);

  // bad input degrades to a 400, never a throw/500
  r = await req('POST', `/game-live/${gid}/sub-queue/add`, { body: { type: 'bogus' } });
  expect(r.status).toBe(400);

  // batch activation resolves (200 or a 400 with errors), never 500
  r = await req('POST', `/game-live/${gid}/batch-sub`, { body: {} });
  expect([200, 400]).toContain(r.status);
});

test('score edit during a live game syncs into the engine (no reset)', async () => {
  const gid = await freshActiveGame();
  await req('PATCH', `/games/${gid}`, { body: { scoreHome: 4, scoreAway: 2 } });
  const st = (await req('GET', `/game-live/${gid}/state`)).data.state;
  expect(st.homeScore).toBe(4);
  expect(st.awayScore).toBe(2);
});

test('clock persists a numeric live value with the running flag (crash recovery)', async () => {
  const gid = await freshActiveGame();
  const st = (await req('GET', `/game-live/${gid}/state`)).data.state;
  expect(typeof st.clockTime).toBe('number');
  expect(st.clockRunning).toBe(true);
});

test('game recap falls back to a local template when no AI proxy is configured', async () => {
  const r = await req('POST', `/ai-coach/recap/${completedId}`, { body: {} });
  expect(r.status).toBe(200);
  expect(r.data.recap.result).toBe('W');
  expect(r.data.recap.narrative.length).toBeGreaterThan(10);
  expect(r.data.recap.ai).toBe(false);
});
