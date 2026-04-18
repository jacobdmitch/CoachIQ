import { test, describe, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.LOG_LEVEL  = 'error';

/**
 * Integration tests for parent_contacts handling on routes/athletes.js.
 * Focuses on the PATCH /athletes/:id path where the replace-all strategy runs
 * inside a transaction.
 *
 * Strategy (mirrors tests/routes/lines-rotations.test.js):
 *   - Mock services/database.js: `query` for pool reads, `transaction` runs
 *     the callback with a fake client whose `query` is also tracked.
 *   - Real JWT middleware + real error handler.
 */

const queryMock = mock.fn(async () => ({ rows: [] }));
const clientQueryMock = mock.fn(async () => ({ rows: [] }));
const transactionMock = mock.fn(async (cb) => cb({ query: clientQueryMock }));

let app;
let token;

before(async () => {
  mock.module('../../services/database.js', {
    namedExports: {
      query:              queryMock,
      transaction:        transactionMock,
      initializeDatabase: async () => {},
    },
  });

  const { default: athletesRouter } = await import('../../routes/athletes.js');
  const { errorHandler }            = await import('../../middleware/errorHandler.js');

  app = express();
  app.use(express.json());
  app.use('/athletes', athletesRouter);
  app.use(errorHandler);

  token = jwt.sign(
    { coachId: 'coach-1', teamId: 'team-1', email: 'test@example.com', role: 'head_coach' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

beforeEach(() => {
  queryMock.mock.resetCalls();
  clientQueryMock.mock.resetCalls();
  transactionMock.mock.resetCalls();
});

// ─── GET /athletes/:id attaches parent_contacts ─────────────────────────────

describe('GET /athletes/:id', () => {
  test('attaches parent_contacts from the child table', async () => {
    const athleteRow = { id: 'a1', team_id: 'team-1', first_name: 'Jane', last_name: 'Doe' };
    const contacts = [
      { id: 'pc1', name: 'Mom', email: 'mom@example.com', phone: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ];
    queryMock.mock.mockImplementation(async (sql) => {
      if (/FROM athletes a/.test(sql))        return { rows: [athleteRow] };
      if (/FROM teams/.test(sql))             return { rows: [{ id: 'team-1' }] };
      if (/FROM parent_contacts/.test(sql))   return { rows: contacts };
      return { rows: [] };
    });

    const res = await request(app)
      .get('/athletes/a1')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.athlete.parent_contacts, contacts);
  });
});

// ─── PATCH /athletes/:id with parentContacts ────────────────────────────────

describe('PATCH /athletes/:id — parentContacts replace-all', () => {
  test('validates parentContacts must be an array', async () => {
    queryMock.mock.mockImplementation(async (sql) => {
      if (/FROM athletes/.test(sql)) return { rows: [{ id: 'a1', team_id: 'team-1' }] };
      if (/FROM teams/.test(sql))    return { rows: [{ id: 'team-1' }] };
      return { rows: [] };
    });

    const res = await request(app)
      .patch('/athletes/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({ parentContacts: 'not-an-array' });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /parentContacts must be an array/);
  });

  test('404 when athlete does not exist', async () => {
    queryMock.mock.mockImplementation(async () => ({ rows: [] }));

    const res = await request(app)
      .patch('/athletes/missing')
      .set('Authorization', `Bearer ${token}`)
      .send({ parentContacts: [] });

    assert.equal(res.status, 404);
  });

  test('400 when body contains no valid fields and no parentContacts', async () => {
    queryMock.mock.mockImplementation(async (sql) => {
      if (/FROM athletes/.test(sql)) return { rows: [{ id: 'a1', team_id: 'team-1' }] };
      if (/FROM teams/.test(sql))    return { rows: [{ id: 'team-1' }] };
      return { rows: [] };
    });

    const res = await request(app)
      .patch('/athletes/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({ nonsense: 'ignored' });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /No valid fields/);
  });

  test('replaces contacts with the supplied list and returns them on the response', async () => {
    const existing = { id: 'a1', team_id: 'team-1', first_name: 'Jane', last_name: 'Doe' };
    queryMock.mock.mockImplementation(async (sql) => {
      if (/FROM athletes/.test(sql)) return { rows: [existing] };
      if (/FROM teams/.test(sql))    return { rows: [{ id: 'team-1' }] };
      return { rows: [] };
    });
    const stored = [
      { id: 'pc1', name: 'Mom', email: 'mom@example.com', phone: null, created_at: 't', updated_at: 't' },
      { id: 'pc2', name: 'Dad', email: 'dad@example.com', phone: null, created_at: 't', updated_at: 't' },
    ];
    clientQueryMock.mock.mockImplementation(async (sql) => {
      if (/DELETE FROM parent_contacts/.test(sql))     return { rows: [] };
      if (/INSERT INTO parent_contacts/.test(sql))     return { rows: [] };
      if (/FROM parent_contacts/.test(sql))            return { rows: stored };
      return { rows: [] };
    });

    const res = await request(app)
      .patch('/athletes/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        parentContacts: [
          { name: 'Mom', email: 'mom@example.com', phone: '' },
          { name: '', email: '', phone: '' },                  // blank row — should be stripped
          { name: 'Dad', email: 'dad@example.com' },
        ],
      });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.athlete.parent_contacts, stored);

    // Exactly one DELETE and two INSERTs (blank row filtered out by the normalizer).
    const calls = clientQueryMock.mock.calls.map(c => c.arguments[0]);
    assert.equal(calls.filter(s => /DELETE FROM parent_contacts/.test(s)).length, 1);
    assert.equal(calls.filter(s => /INSERT INTO parent_contacts/.test(s)).length, 2);
  });

  test('contacts-only PATCH (no column changes) still succeeds inside a transaction', async () => {
    const existing = { id: 'a1', team_id: 'team-1', first_name: 'Jane' };
    queryMock.mock.mockImplementation(async (sql) => {
      if (/FROM athletes/.test(sql)) return { rows: [existing] };
      if (/FROM teams/.test(sql))    return { rows: [{ id: 'team-1' }] };
      return { rows: [] };
    });
    clientQueryMock.mock.mockImplementation(async (sql) => {
      if (/FROM parent_contacts/.test(sql)) return { rows: [] };
      return { rows: [] };
    });

    const res = await request(app)
      .patch('/athletes/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({ parentContacts: [] });                            // clear all contacts

    assert.equal(res.status, 200);
    assert.equal(transactionMock.mock.callCount(), 1);
    // No UPDATE athletes was issued — only the contacts DELETE + fetch.
    const calls = clientQueryMock.mock.calls.map(c => c.arguments[0]);
    assert.equal(calls.some(s => /UPDATE athletes/.test(s)), false);
    assert.equal(calls.filter(s => /DELETE FROM parent_contacts/.test(s)).length, 1);
  });

  test('column update + parentContacts run together in one transaction', async () => {
    const existing = { id: 'a1', team_id: 'team-1', first_name: 'Jane', last_name: 'Doe' };
    const updatedRow = { ...existing, email: 'jane@example.com' };
    queryMock.mock.mockImplementation(async (sql) => {
      if (/FROM athletes/.test(sql)) return { rows: [existing] };
      if (/FROM teams/.test(sql))    return { rows: [{ id: 'team-1' }] };
      return { rows: [] };
    });
    clientQueryMock.mock.mockImplementation(async (sql) => {
      if (/UPDATE athletes/.test(sql))              return { rows: [updatedRow] };
      if (/DELETE FROM parent_contacts/.test(sql))  return { rows: [] };
      if (/INSERT INTO parent_contacts/.test(sql))  return { rows: [] };
      if (/FROM parent_contacts/.test(sql))         return { rows: [{ id: 'pc1', name: 'Mom', email: 'mom@example.com', phone: null }] };
      return { rows: [] };
    });

    const res = await request(app)
      .patch('/athletes/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'jane@example.com',
        parentContacts: [{ name: 'Mom', email: 'mom@example.com' }],
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.athlete.email, 'jane@example.com');
    assert.equal(res.body.athlete.parent_contacts.length, 1);
    assert.equal(transactionMock.mock.callCount(), 1);
  });
});
