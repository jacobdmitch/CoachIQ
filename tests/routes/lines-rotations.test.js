import { test, describe, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// Set JWT secret BEFORE any module that reads it is imported.
process.env.JWT_SECRET = 'test-secret';
process.env.LOG_LEVEL  = 'error';

/**
 * Integration tests for rotation endpoints on routes/lines.js.
 *
 * Strategy:
 *   - Mock services/database.js so routes run without a real Postgres.
 *   - Use real JWT auth middleware with a token signed by JWT_SECRET.
 *   - Mount the real router on a minimal express app + real error handler.
 *
 * Limitations (flagged deliberately):
 *   - Does NOT validate SQL correctness or constraint behavior — that would
 *     require a live Postgres. This layer tests routing, auth, body
 *     validation, and response shape.
 */

// Shared stateful mock for query — each test resets its implementation.
const queryMock = mock.fn(async () => ({ rows: [] }));

let app;
let token;

before(async () => {
  // Install the module mock for services/database.js so any subsequent import
  // of routes/lines.js resolves to the mocked query.
  mock.module('../../services/database.js', {
    namedExports: {
      query: queryMock,
      initializeDatabase: async () => {},
    },
  });

  const { default: linesRouter } = await import('../../routes/lines.js');
  const { errorHandler } = await import('../../middleware/errorHandler.js');

  app = express();
  app.use(express.json());
  app.use('/lines', linesRouter);
  app.use(errorHandler);

  token = jwt.sign(
    { coachId: 'coach-1', teamId: 'team-1', email: 'test@example.com', role: 'head_coach' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

// ─── auth ───────────────────────────────────────────────────────────────────

describe('auth gate', () => {
  test('returns 401 when no token is supplied', async () => {
    const res = await request(app).get('/lines/rotations?teamId=team-1');
    assert.equal(res.status, 401);
  });

  test('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .get('/lines/rotations?teamId=team-1')
      .set('Authorization', 'Bearer not-a-real-token');
    assert.equal(res.status, 401);
  });
});

// ─── GET /lines/rotations ───────────────────────────────────────────────────

describe('GET /lines/rotations', () => {
  test('400 when teamId is missing', async () => {
    queryMock.mock.resetCalls();
    const res = await request(app)
      .get('/lines/rotations')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /teamId/);
  });

  test('403 when team ownership check returns empty', async () => {
    queryMock.mock.resetCalls();
    queryMock.mock.mockImplementation(async () => ({ rows: [] })); // requireTeamAccess fails
    const res = await request(app)
      .get('/lines/rotations?teamId=team-1')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 403);
  });

  test('200 with rotations when team ownership passes', async () => {
    queryMock.mock.resetCalls();
    const rotations = [
      { id: 'r1', team_id: 'team-1', name: 'Midi A/B', position_group: 'midfield', line_ids: ['l1', 'l2'] },
    ];
    queryMock.mock.mockImplementation(async (sql) => {
      if (/FROM teams/.test(sql))          return { rows: [{ id: 'team-1' }] };
      if (/FROM line_rotations/.test(sql)) return { rows: rotations };
      return { rows: [] };
    });
    const res = await request(app)
      .get('/lines/rotations?teamId=team-1')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.rotations, rotations);
  });
});

// ─── POST /lines/rotations ──────────────────────────────────────────────────

describe('POST /lines/rotations: validation', () => {
  test('400 when teamId is missing', async () => {
    const res = await request(app)
      .post('/lines/rotations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', positionGroup: 'midfield', lineIds: ['a', 'b'] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /teamId/);
  });

  test('400 when name is missing', async () => {
    queryMock.mock.mockImplementation(async () => ({ rows: [{ id: 'team-1' }] })); // pass team access
    const res = await request(app)
      .post('/lines/rotations')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId: 'team-1', positionGroup: 'midfield', lineIds: ['a', 'b'] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /name is required/);
  });

  test('400 when positionGroup is invalid', async () => {
    queryMock.mock.mockImplementation(async () => ({ rows: [{ id: 'team-1' }] }));
    const res = await request(app)
      .post('/lines/rotations')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId: 'team-1', name: 'X', positionGroup: 'goalie', lineIds: ['a', 'b'] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /positionGroup must be/);
  });

  test('400 when lineIds has fewer than two entries', async () => {
    queryMock.mock.mockImplementation(async () => ({ rows: [{ id: 'team-1' }] }));
    const res = await request(app)
      .post('/lines/rotations')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId: 'team-1', name: 'X', positionGroup: 'midfield', lineIds: ['only-one'] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least two lines/);
  });

  test('400 when a referenced line is not in the team/position group', async () => {
    // Team access passes; line assertion returns only ONE of the two ids.
    queryMock.mock.mockImplementation(async (sql) => {
      if (/FROM teams/.test(sql))          return { rows: [{ id: 'team-1' }] };
      if (/FROM lines\s+WHERE team_id/.test(sql)) return { rows: [{ id: 'l1' }] };
      return { rows: [] };
    });
    const res = await request(app)
      .post('/lines/rotations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        teamId: 'team-1', name: 'X', positionGroup: 'midfield',
        lineIds: ['l1', 'l2-missing'],
      });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /l2-missing/);
  });
});

describe('POST /lines/rotations: happy path', () => {
  test('201 returns the created rotation', async () => {
    const created = {
      id: 'rot-1', team_id: 'team-1', name: 'Midi A/B/C',
      position_group: 'midfield', line_ids: ['l1', 'l2', 'l3'],
    };
    queryMock.mock.mockImplementation(async (sql) => {
      if (/FROM teams/.test(sql))                   return { rows: [{ id: 'team-1' }] };
      if (/FROM lines\s+WHERE team_id/.test(sql))   return { rows: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }] };
      if (/INSERT INTO line_rotations/.test(sql))   return { rows: [created] };
      return { rows: [] };
    });
    const res = await request(app)
      .post('/lines/rotations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        teamId: 'team-1', name: 'Midi A/B/C', positionGroup: 'midfield',
        lineIds: ['l1', 'l2', 'l3'],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.rotation, created);
  });
});

// ─── DELETE /lines/rotations/:id ────────────────────────────────────────────

describe('DELETE /lines/rotations/:id', () => {
  test('404 when rotation does not exist', async () => {
    queryMock.mock.mockImplementation(async () => ({ rows: [] })); // lookup empty
    const res = await request(app)
      .delete('/lines/rotations/does-not-exist')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 404);
  });

  test('200 when the rotation is deleted', async () => {
    queryMock.mock.mockImplementation(async (sql) => {
      if (/SELECT team_id FROM line_rotations/.test(sql)) return { rows: [{ team_id: 'team-1' }] };
      if (/FROM teams/.test(sql))                          return { rows: [{ id: 'team-1' }] };
      if (/DELETE FROM line_rotations/.test(sql))          return { rows: [] };
      return { rows: [] };
    });
    const res = await request(app)
      .delete('/lines/rotations/rot-1')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});
