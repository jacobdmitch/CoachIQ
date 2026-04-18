import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import tierConfig, { hasFeature, getAllTiers } from '../../services/tierConfig.js';

describe('tierConfig: shape', () => {
  test('exposes all four tiers', () => {
    for (const key of ['free', 'coach', 'club', 'organization']) {
      assert.ok(tierConfig[key], `tier ${key} should exist`);
      assert.equal(typeof tierConfig[key].price, 'number');
      assert.ok(Array.isArray(tierConfig[key].features));
    }
  });
});

describe('hasFeature', () => {
  test('returns true for features in the tier', () => {
    assert.equal(hasFeature('free', 'basic_roster_management'), true);
    assert.equal(hasFeature('coach', 'ai_line_coach'), true);
    assert.equal(hasFeature('organization', 'sso_support'), true);
  });

  test('returns false for features not in the tier', () => {
    assert.equal(hasFeature('free', 'ai_line_coach'), false);
    assert.equal(hasFeature('coach', 'sso_support'), false);
  });

  test('returns false for unknown tier', () => {
    assert.equal(hasFeature('enterprise_plus', 'anything'), false);
  });

  test('returns false for unknown feature', () => {
    assert.equal(hasFeature('free', 'feature_that_does_not_exist'), false);
  });
});

describe('getAllTiers', () => {
  test('returns all tiers in ascending price order', () => {
    const tiers = getAllTiers();
    assert.equal(tiers.length, 4);
    for (let i = 1; i < tiers.length; i++) {
      assert.ok(
        tiers[i].price >= tiers[i - 1].price,
        `expected tier ${tiers[i].key} price >= ${tiers[i - 1].key} price`
      );
    }
    assert.equal(tiers[0].key, 'free');
    assert.equal(tiers[tiers.length - 1].key, 'organization');
  });

  test('each entry includes the key plus tier data', () => {
    for (const t of getAllTiers()) {
      assert.equal(typeof t.key, 'string');
      assert.equal(typeof t.name, 'string');
      assert.ok(Array.isArray(t.features));
    }
  });
});
