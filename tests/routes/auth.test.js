import { test, describe, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';

// JWT + refresh secrets must be set before modules that read them import.
process.env.JWT_SECRET         = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.LOG_LEVEL          = 'error';

/**
 * Integration tests for routes/auth.js (login + register).
 *
 * These cover the signup flow that landed in tandem with the frontend
 * SignupPage, so a regression here breaks coach onboarding.
 *
 * Strategy mirrors tests/routes/lines-rotations.test.js:
 *   - Mock services/database.js so the router runs without a real Postgres.
 *   - Mock bcrypt so tests don't pay the hash/compare cost per assertion.
 *   - Mount the real router on a minimal Express app plus the real error
 *     handler and assert on status + body shape.
 *
 * A FIFO `queryResponses` queue is used instead of `mockImplementationOnce`
 * because leftover queued impls from one test would otherwise leak into the
 * next. Each test resets the queue in beforeEach.
 *
 * Not covered (deliberate — would require a real DB):
 *   - Actual SQL column constraints (unique email, NOT NULL on password_hash).
 *   - Refresh token revocation / rotation.
 *   - Rate limiting.
 */

let queryResponses = [];
const queryMock = mock.fn(async () => {
  if (queryResponses.length === 0) return { rows: [] };
  return queryResponses.shift();
});

let nextCompare = true;
const compareMock = mock.fn(async () => nextCompare);
const hashMock    = mock.fn(async () => 'fake-hash');

let app;

before(async () => {
  mock.module('../../services/database.js', {
    namedExports: {
      query: queryMock,
      initializeDatabase: async () => {},
    },
  });

  // routes/auth.js does `import bcrypt from 'bcrypt'`, so the default export
  // must carry .compare and .hash.
  mock.module('bcrypt', {
    defaultExport: { compare: compareMock, hash: hashMock },
    namedExports:  { compare: compareMock, hash: hashMock },
  });

  const { default: authRouter } = await import('../../routes/auth.js');
  const { errorHandler } = await import('../../middleware/errorHandler.js');

  app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(errorHandler);
});

beforeEach(() => {
  queryResponses = [];
  nextCompare = true;
  queryMock.mock.resetCalls();
  compareMock.mock.resetCalls();
  hashMock.mock.resetCalls();
});

// ─── POST /auth/register ─────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  test('400 when email is missing', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ password: 'longenough123' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /email and password/i);
  });

  test('400 when password is missing', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'coach@example.com' });
    assert.equal(res.status, 400);
  });

  test('400 when password shorter than 8 chars', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'coach@example.com', password: 'short' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least 8/i);
  });

  test('409 when email already exists', async () => {
    queryResponses = [{ rows: [{ id: 'existing-id' }] }];

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'longenough123' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already exists/i);
  });

  test('201 and returns coach+token on success (no team)', async () => {
    queryResponses = [
      { rows: [] },                          // duplicate check
      { rows: [{                             // insert coach
        id: 'coach-123',
        email: 'new@example.com',
        first_name: 'New',
        last_name: 'Coach',
        subscription_tier: 'free',
      }] },
    ];

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'longenough123', firstName: 'New', lastName: 'Coach' });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.coach.email, 'new@example.com');
    assert.equal(res.body.coach.firstName, 'New');
    assert.deepEqual(res.body.teams, []);
    assert.ok(res.body.token, 'token should be present');
    assert.ok(res.body.refreshToken, 'refreshToken should be present');
    assert.equal(hashMock.mock.callCount(), 1, 'password should be hashed once');
  });

  test('201 and creates default team when teamName provided', async () => {
    queryResponses = [
      { rows: [] },                          // duplicate check
      { rows: [{                             // insert coach
        id: 'coach-abc',
        email: 'team@example.com',
        first_name: '',
        last_name: '',
        subscription_tier: 'free',
      }] },
      { rows: [{ id: 'team-xyz', team_name: 'Warriors', season: '2026' }] }, // insert team
    ];

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'team@example.com', password: 'longenough123', teamName: 'Warriors' });

    assert.equal(res.status, 201);
    assert.equal(res.body.teams.length, 1);
    assert.equal(res.body.teams[0].team_name, 'Warriors');
  });
});

// ─── POST /auth/login ────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  test('400 when email missing', async () => {
    const res = await request(app).post('/auth/login').send({ password: 'pw' });
    assert.equal(res.status, 400);
  });

  test('401 when coach not found', async () => {
    queryResponses = [{ rows: [] }];

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /invalid email or password/i);
  });

  test('401 when password does not match', async () => {
    queryResponses = [{
      rows: [{
        id: 'coach-1',
        email: 'wrong@example.com',
        password_hash: 'hashed',
        first_name: 'X',
        last_name: 'Y',
        subscription_tier: 'free',
      }],
    }];
    nextCompare = false;

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'wrong@example.com', password: 'badpassword' });
    assert.equal(res.status, 401);
  });

  test('200 with coach+teams+token on success', async () => {
    queryResponses = [
      { rows: [{                             // SELECT coach
        id: 'coach-9',
        email: 'good@example.com',
        password_hash: 'hashed',
        first_name: 'Good',
        last_name: 'Coach',
        subscription_tier: 'free',
      }] },
      { rows: [                              // getCoachTeams
        { id: 't1', team_name: 'Varsity', season: '2026', sport_type: 'lacrosse', game_format: 'U14' },
      ] },
    ];
    nextCompare = true;

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'good@example.com', password: 'correct' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.coach.id, 'coach-9');
    assert.equal(res.body.teams.length, 1);
    assert.ok(res.body.token);
    assert.ok(res.body.refreshToken);
  });
});
