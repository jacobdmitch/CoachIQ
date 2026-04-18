import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SITUATION_LABELS, resolveSituation } from '../../services/situationResolver.js';

// ─── SITUATION_LABELS ───────────────────────────────────────────────────────

describe('SITUATION_LABELS', () => {
  test('maps all supported situation types', () => {
    assert.equal(SITUATION_LABELS.man_up,     'Man Up (EMO)');
    assert.equal(SITUATION_LABELS.man_down,   'Man Down');
    assert.equal(SITUATION_LABELS.faceoff,    'Faceoff');
    assert.equal(SITUATION_LABELS.clear,      'Clear');
    assert.equal(SITUATION_LABELS.settled,    'Settled Offense');
    assert.equal(SITUATION_LABELS.transition, 'Transition');
    assert.equal(SITUATION_LABELS['6s_fast_break'], '6s Fast Break');
  });
});

// ─── resolveSituation ───────────────────────────────────────────────────────

function makeAthlete(id, overrides = {}) {
  return {
    id,
    primary_position: 'Midfield',
    skill_shooting: 5, skill_dodging: 5, skill_passing: 5, skill_field_awareness: 5,
    skill_ground_balls: 5, skill_transition: 5, skill_defense: 5, skill_faceoff: 5,
    ...overrides,
  };
}

// Build a game state with 10 on-field slots (goalie + 9 field) plus a bench.
function makeGameState({ onField, bench }) {
  const fieldPositions = { goalie: 'g', ...onField };
  return { fieldPositions, bench };
}

describe('resolveSituation: coach-assigned player set', () => {
  test('uses assigned ids and computes staying vs coming-in', () => {
    const on = ['a1', 'a2', 'a3'];
    const benchIds = ['b1', 'b2', 'b3'];
    const gameState = makeGameState({
      onField:  { slot1: 'a1', slot2: 'a2', slot3: 'a3' },
      bench:    benchIds,
    });
    const athletes = [...on, ...benchIds, 'g'].map(id => makeAthlete(id));
    const assigned = ['a1', 'b1', 'b2']; // keep a1, swap a2/a3 out, bring b1/b2 in

    const result = resolveSituation(gameState, 'man_up', assigned, athletes, null);

    assert.equal(result.type, 'situation');
    assert.equal(result.source, 'situation_assigned');
    assert.equal(result.situationType, 'man_up');
    assert.equal(result.label, 'Man Up (EMO)');
    assert.deepEqual(result.stayingPlayers, ['a1']);
    assert.equal(result.moves.length, 2);
    const playerIns  = result.moves.map(m => m.playerIn).sort();
    const playerOuts = result.moves.map(m => m.playerOut).sort();
    assert.deepEqual(playerIns,  ['b1', 'b2']);
    assert.deepEqual(playerOuts, ['a2', 'a3']);
  });

  test('never pulls the goalie', () => {
    const gameState = makeGameState({
      onField: { slot1: 'a1', slot2: 'a2' },
      bench:   ['b1', 'b2', 'b3'],
    });
    const athletes = ['a1', 'a2', 'b1', 'b2', 'b3', 'g'].map(id => makeAthlete(id));
    const result = resolveSituation(gameState, 'man_up', ['b1', 'b2', 'b3'], athletes, null);
    for (const move of result.moves) {
      assert.notEqual(move.playerOut, 'g');
      assert.notEqual(move.position, 'goalie');
    }
  });

  test('produces unique move ids and a queue id', () => {
    const gameState = makeGameState({
      onField: { slot1: 'a1' },
      bench:   ['b1', 'b2'],
    });
    const athletes = ['a1', 'b1', 'b2', 'g'].map(id => makeAthlete(id));
    const result = resolveSituation(gameState, 'man_up', ['b1', 'b2'], athletes, null);
    assert.equal(typeof result.queueId, 'string');
    const ids = new Set(result.moves.map(m => m.moveId));
    assert.equal(ids.size, result.moves.length);
  });
});

describe('resolveSituation: auto-fill', () => {
  test('uses ai_suggested source when no assignments given', () => {
    const gameState = makeGameState({
      onField: { slot1: 'a1', slot2: 'a2' },
      bench:   ['b1', 'b2', 'b3', 'b4', 'b5'],
    });
    const athletes = ['a1', 'a2', 'b1', 'b2', 'b3', 'b4', 'b5', 'g'].map(id =>
      makeAthlete(id, { primary_position: id === 'g' ? 'Goalie' : 'Midfield' })
    );
    const result = resolveSituation(gameState, 'faceoff', null, athletes, null);
    assert.equal(result.source, 'ai_suggested');
  });

  test('prefers players with better skill fit for the situation', () => {
    // Three field midfielders, two bench candidates with very different skill
    // profiles. Faceoff auto-fill should pull someone out for the high-skill
    // bench player and never select the low-skill bench player first.
    const gameState = makeGameState({
      onField: { slot1: 'f1', slot2: 'f2', slot3: 'f3' },
      bench:   ['skilled', 'weak'],
    });
    const athletes = [
      { id: 'g', primary_position: 'Goalie' },
      makeAthlete('f1'), makeAthlete('f2'), makeAthlete('f3'),
      makeAthlete('skilled', { primary_position: 'Midfield', skill_faceoff: 10, skill_ground_balls: 10 }),
      makeAthlete('weak',    { primary_position: 'Midfield', skill_faceoff: 1,  skill_ground_balls: 1  }),
    ];
    const result = resolveSituation(gameState, 'faceoff', null, athletes, null);
    const inIds = result.moves.map(m => m.playerIn);
    assert.ok(inIds.includes('skilled'), 'high-skill player should be subbed in');
  });

  test('empty assigned array falls through to auto-fill', () => {
    const gameState = makeGameState({
      onField: { slot1: 'a1' },
      bench:   ['b1', 'b2'],
    });
    const athletes = ['a1', 'b1', 'b2', 'g'].map(id =>
      makeAthlete(id, { primary_position: id === 'g' ? 'Goalie' : 'Midfield' })
    );
    const result = resolveSituation(gameState, 'faceoff', [], athletes, null);
    assert.equal(result.source, 'ai_suggested');
  });
});

describe('resolveSituation: label fallback', () => {
  test('uses the raw situationType if not in SITUATION_LABELS', () => {
    const gameState = makeGameState({ onField: {}, bench: [] });
    const result = resolveSituation(gameState, 'unknown_type', [], [{ id: 'g', primary_position: 'Goalie' }], null);
    assert.equal(result.label, 'unknown_type');
  });
});
