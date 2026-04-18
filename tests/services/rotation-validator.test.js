import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRotationInput,
  advanceRotationCursor,
} from '../../services/rotationValidator.js';

// ─── validateRotationInput ───────────────────────────────────────────────────

test('validateRotationInput: happy path returns {ok: true}', () => {
  const result = validateRotationInput({
    name: 'Midi A/B/C',
    positionGroup: 'midfield',
    lineIds: ['a', 'b', 'c'],
  });
  assert.deepEqual(result, { ok: true });
});

test('validateRotationInput: rejects missing name', () => {
  const result = validateRotationInput({
    positionGroup: 'midfield',
    lineIds: ['a', 'b'],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /name is required/);
});

test('validateRotationInput: rejects empty/whitespace name', () => {
  const result = validateRotationInput({
    name: '   ',
    positionGroup: 'midfield',
    lineIds: ['a', 'b'],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /name is required/);
});

test('validateRotationInput: rejects non-string name', () => {
  const result = validateRotationInput({
    name: 42,
    positionGroup: 'midfield',
    lineIds: ['a', 'b'],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /name is required/);
});

test('validateRotationInput: rejects invalid positionGroup', () => {
  const result = validateRotationInput({
    name: 'Test',
    positionGroup: 'goalie',
    lineIds: ['a', 'b'],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /positionGroup must be attack, midfield, or defense/);
});

test('validateRotationInput: rejects missing positionGroup', () => {
  const result = validateRotationInput({
    name: 'Test',
    lineIds: ['a', 'b'],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /positionGroup/);
});

test('validateRotationInput: accepts all three valid position groups', () => {
  for (const group of ['attack', 'midfield', 'defense']) {
    const result = validateRotationInput({
      name: 'Test',
      positionGroup: group,
      lineIds: ['a', 'b'],
    });
    assert.deepEqual(result, { ok: true }, `expected ${group} to be valid`);
  }
});

test('validateRotationInput: rejects non-array lineIds', () => {
  const result = validateRotationInput({
    name: 'Test',
    positionGroup: 'midfield',
    lineIds: 'a,b,c',
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /lineIds must be an array/);
});

test('validateRotationInput: rejects lineIds with fewer than two entries', () => {
  const result = validateRotationInput({
    name: 'Test',
    positionGroup: 'midfield',
    lineIds: ['only-one'],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /at least two lines/);
});

test('validateRotationInput: rejects empty lineIds array', () => {
  const result = validateRotationInput({
    name: 'Test',
    positionGroup: 'midfield',
    lineIds: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /at least two lines/);
});

test('validateRotationInput: rejects non-string lineId entries', () => {
  const result = validateRotationInput({
    name: 'Test',
    positionGroup: 'midfield',
    lineIds: ['a', 42],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /non-empty strings/);
});

test('validateRotationInput: rejects empty-string lineId entries', () => {
  const result = validateRotationInput({
    name: 'Test',
    positionGroup: 'midfield',
    lineIds: ['a', ''],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /non-empty strings/);
});

// ─── advanceRotationCursor ───────────────────────────────────────────────────

test('advanceRotationCursor: normal advance', () => {
  assert.equal(advanceRotationCursor(0, 3), 1);
  assert.equal(advanceRotationCursor(1, 3), 2);
});

test('advanceRotationCursor: wraps at end of rotation', () => {
  assert.equal(advanceRotationCursor(2, 3), 0);
  assert.equal(advanceRotationCursor(4, 5), 0);
});

test('advanceRotationCursor: wraps from index 0 in a single-line rotation', () => {
  assert.equal(advanceRotationCursor(0, 1), 0);
});

test('advanceRotationCursor: throws on invalid length', () => {
  assert.throws(() => advanceRotationCursor(0, 0), /positive integer/);
  assert.throws(() => advanceRotationCursor(0, -1), /positive integer/);
  assert.throws(() => advanceRotationCursor(0, 2.5), /positive integer/);
  assert.throws(() => advanceRotationCursor(0, NaN), /positive integer/);
});

test('advanceRotationCursor: resets negative or NaN currentIndex to 0', () => {
  assert.equal(advanceRotationCursor(-1, 3), 0);
  assert.equal(advanceRotationCursor(NaN, 3), 0);
});

test('advanceRotationCursor: resets non-integer currentIndex to 0', () => {
  assert.equal(advanceRotationCursor(1.5, 3), 0);
});
