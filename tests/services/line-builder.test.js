import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suggestLine, listLineRoles } from '../../services/lineBuilder.js';

// Minimal athlete factory — fills in skill fields so scoring is deterministic.
function makeAthlete(overrides = {}) {
  return {
    id: overrides.id ?? 'a1',
    first_name: 'First',
    last_name: 'Last',
    jersey_number: 10,
    primary_position: 'Attack',
    secondary_position: null,
    status: 'active',
    skill_shooting:        5,
    skill_dodging:         5,
    skill_passing:         5,
    skill_field_awareness: 5,
    skill_ground_balls:    5,
    skill_transition:      5,
    skill_defense:         5,
    skill_faceoff:         5,
    ...overrides,
  };
}

describe('listLineRoles', () => {
  test('returns standard roles by default', () => {
    const roles = listLineRoles();
    assert.ok(roles.length > 0);
    assert.ok(roles.every(r => r.format === 'standard'));
    const keys = roles.map(r => r.key);
    assert.ok(keys.includes('starting_attack'));
    assert.ok(keys.includes('man_up'));
    assert.ok(!keys.includes('starting_six'));
  });

  test('filters to 6s roles when format=6s', () => {
    const roles = listLineRoles({ format: '6s' });
    assert.ok(roles.length > 0);
    assert.ok(roles.every(r => r.format === '6s'));
    assert.ok(roles.some(r => r.key === 'starting_six'));
  });

  test('each role entry has label, hint, size, positions', () => {
    for (const r of listLineRoles()) {
      assert.equal(typeof r.label, 'string');
      assert.equal(typeof r.hint,  'string');
      assert.equal(typeof r.size,  'number');
      assert.ok(r.size > 0);
      assert.ok(Array.isArray(r.positions));
    }
  });
});

describe('suggestLine', () => {
  test('throws on unknown role', () => {
    assert.throws(
      () => suggestLine([], 'not_a_real_role'),
      /Unknown line role/
    );
  });

  test('returns empty starters/alternates on empty roster', () => {
    const result = suggestLine([], 'starting_attack');
    assert.deepEqual(result.starters, []);
    assert.deepEqual(result.alternates, []);
    assert.equal(result.totalEligible, 0);
    assert.equal(result.role.key, 'starting_attack');
    assert.equal(result.role.size, 3);
  });

  test('filters by primary position', () => {
    const roster = [
      makeAthlete({ id: 'a1', primary_position: 'Attack' }),
      makeAthlete({ id: 'a2', primary_position: 'Defense' }),
      makeAthlete({ id: 'a3', primary_position: 'Attack' }),
    ];
    const result = suggestLine(roster, 'starting_attack');
    // role.size is 3, eligible pool is 2 (only Attack)
    assert.equal(result.totalEligible, 2);
    assert.equal(result.starters.length, 2);
    assert.ok(result.starters.every(s => ['a1', 'a3'].includes(s.athleteId)));
  });

  test('includes athletes with matching secondary position and flags as offPosition', () => {
    const roster = [
      makeAthlete({ id: 'a1', primary_position: 'Attack' }),
      makeAthlete({ id: 'a2', primary_position: 'Midfield', secondary_position: 'Attack' }),
    ];
    const result = suggestLine(roster, 'starting_attack');
    assert.equal(result.totalEligible, 2);
    const secondary = result.starters.find(s => s.athleteId === 'a2');
    assert.ok(secondary, 'secondary-position athlete should be in starters');
    assert.equal(secondary.offPosition, true);
    const primary = result.starters.find(s => s.athleteId === 'a1');
    assert.equal(primary.offPosition, false);
  });

  test('excludes athletes whose id is in excludeIds', () => {
    const roster = [
      makeAthlete({ id: 'a1', primary_position: 'Attack' }),
      makeAthlete({ id: 'a2', primary_position: 'Attack' }),
      makeAthlete({ id: 'a3', primary_position: 'Attack' }),
    ];
    const result = suggestLine(roster, 'starting_attack', { excludeIds: ['a2'] });
    assert.equal(result.totalEligible, 2);
    assert.ok(result.starters.every(s => s.athleteId !== 'a2'));
  });

  test('excludes non-active athletes', () => {
    const roster = [
      makeAthlete({ id: 'a1', primary_position: 'Attack', status: 'active' }),
      makeAthlete({ id: 'a2', primary_position: 'Attack', status: 'injured' }),
    ];
    const result = suggestLine(roster, 'starting_attack');
    assert.equal(result.totalEligible, 1);
    assert.equal(result.starters[0].athleteId, 'a1');
  });

  test('ranks higher-skilled athletes first (weighted scoring)', () => {
    const roster = [
      makeAthlete({ id: 'low',  primary_position: 'Attack', skill_shooting: 1, skill_dodging: 1 }),
      makeAthlete({ id: 'high', primary_position: 'Attack', skill_shooting: 10, skill_dodging: 10 }),
    ];
    const result = suggestLine(roster, 'starting_attack');
    assert.equal(result.starters[0].athleteId, 'high');
    assert.equal(result.starters[1].athleteId, 'low');
    assert.ok(result.starters[0].score > result.starters[1].score);
  });

  test('returns role metadata including size and positions', () => {
    const result = suggestLine([], 'man_up');
    assert.equal(result.role.key, 'man_up');
    assert.equal(result.role.size, 6);
    assert.deepEqual(result.role.positions, ['Attack', 'Midfield']);
  });

  test('starters contain topSkills and why rationale', () => {
    const roster = [makeAthlete({ id: 'a1', primary_position: 'Attack', skill_shooting: 9 })];
    const result = suggestLine(roster, 'starting_attack');
    const pick = result.starters[0];
    assert.ok(Array.isArray(pick.topSkills));
    assert.ok(pick.topSkills.length > 0);
    assert.equal(typeof pick.why, 'string');
    assert.ok(pick.why.length > 0);
  });

  test('alternates limited to 3 entries', () => {
    const roster = Array.from({ length: 10 }, (_, i) =>
      makeAthlete({ id: `a${i}`, primary_position: 'Attack' })
    );
    const result = suggestLine(roster, 'starting_attack'); // size 3
    assert.equal(result.starters.length, 3);
    assert.equal(result.alternates.length, 3);
    assert.equal(result.totalEligible, 10);
  });
});
