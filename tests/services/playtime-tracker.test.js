import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import PlaytimeTracker from '../../services/playtimeTracker.js';

function makeRoster(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i}` }));
}

describe('PlaytimeTracker: construction', () => {
  test('initializes playtime entries for every athlete', () => {
    const tracker = new PlaytimeTracker(makeRoster(3));
    assert.equal(Object.keys(tracker.playtime).length, 3);
    for (const id of ['p0', 'p1', 'p2']) {
      assert.deepEqual(tracker.playtime[id], {
        athleteId: id,
        totalSeconds: 0,
        currentPeriodSeconds: 0,
        isOnField: false,
        lastSubInTime: null,
        targetMinutes: 15,
        periodHistory: {},
      });
    }
  });

  test('respects custom targetMinutes', () => {
    const tracker = new PlaytimeTracker(makeRoster(1), 10);
    assert.equal(tracker.targetMinutes, 10);
    assert.equal(tracker.targetSeconds, 600);
    assert.equal(tracker.playtime.p0.targetMinutes, 10);
  });
});

describe('PlaytimeTracker: subIn / subOut', () => {
  test('subIn marks player on field with timestamp', () => {
    const tracker = new PlaytimeTracker(makeRoster(1));
    tracker.subIn('p0', 1_000_000);
    assert.equal(tracker.playtime.p0.isOnField, true);
    assert.equal(tracker.playtime.p0.lastSubInTime, 1_000_000);
  });

  test('subOut accumulates totalSeconds and clears on-field state', () => {
    const tracker = new PlaytimeTracker(makeRoster(1));
    tracker.subIn('p0', 1_000_000);
    tracker.subOut('p0', 1_120_000); // +120s
    const entry = tracker.playtime.p0;
    assert.equal(entry.totalSeconds, 120);
    assert.equal(entry.currentPeriodSeconds, 120);
    assert.equal(entry.isOnField, false);
    assert.equal(entry.lastSubInTime, null);
  });

  test('subOut without prior subIn is a no-op on the counter', () => {
    const tracker = new PlaytimeTracker(makeRoster(1));
    tracker.subOut('p0', 1_000_000);
    assert.equal(tracker.playtime.p0.totalSeconds, 0);
  });

  test('multiple sub cycles sum correctly', () => {
    const tracker = new PlaytimeTracker(makeRoster(1));
    tracker.subIn('p0', 1_000_000);
    tracker.subOut('p0', 1_060_000); // +60s
    tracker.subIn('p0', 1_100_000);
    tracker.subOut('p0', 1_130_000); // +30s
    assert.equal(tracker.playtime.p0.totalSeconds, 90);
  });

  test('subIn/subOut on unknown athlete returns null', () => {
    const tracker = new PlaytimeTracker(makeRoster(1));
    assert.equal(tracker.subIn('ghost', 1_000_000), null);
    assert.equal(tracker.subOut('ghost', 1_000_000), null);
  });
});

describe('PlaytimeTracker: tick', () => {
  test('tick updates currentPeriodSeconds for on-field players', () => {
    const tracker = new PlaytimeTracker(makeRoster(2));
    tracker.subIn('p0', 1_000_000);
    // p1 stays off field
    tracker.tick(1_045_000);
    assert.equal(tracker.playtime.p0.currentPeriodSeconds, 45);
    assert.equal(tracker.playtime.p1.currentPeriodSeconds, 0);
  });
});

describe('PlaytimeTracker: getPlaytimeSummary', () => {
  test('returns one entry per athlete with derived fields', () => {
    const tracker = new PlaytimeTracker(makeRoster(2), 20);
    tracker.subIn('p0', 1_000_000);
    tracker.subOut('p0', 1_000_000 + 600_000); // 10 minutes
    const summary = tracker.getPlaytimeSummary();
    assert.equal(summary.length, 2);
    const p0 = summary.find(s => s.athleteId === 'p0');
    assert.equal(p0.totalMinutes, 10);
    assert.equal(p0.targetMinutes, 20);
    assert.equal(p0.minutesRemaining, 10);
    assert.equal(p0.isOnField, false);
  });
});

describe('PlaytimeTracker: getEquityFlags', () => {
  test('flags players under target and over target past tolerance', () => {
    const tracker = new PlaytimeTracker(makeRoster(3), 15);
    // p0 under target: 5 minutes played vs 15 target = 10 min under (HIGH: > 50% of target)
    tracker.subIn('p0', 1); tracker.subOut('p0', 1 + 300_000);
    // p1 over target: 20 minutes played vs 15 target = 5 min over
    tracker.subIn('p1', 1); tracker.subOut('p1', 1 + 1_200_000);
    // p2 on target: 15 minutes
    tracker.subIn('p2', 1); tracker.subOut('p2', 1 + 900_000);

    const flags = tracker.getEquityFlags();
    const p0Flag = flags.find(f => f.athleteId === 'p0');
    const p1Flag = flags.find(f => f.athleteId === 'p1');
    const p2Flag = flags.find(f => f.athleteId === 'p2');
    assert.equal(p0Flag.status, 'UNDER_TARGET');
    assert.equal(p0Flag.urgency, 'HIGH');
    assert.equal(p1Flag.status, 'OVER_TARGET');
    assert.equal(p2Flag, undefined, 'on-target player should not be flagged');
  });

  test('respects tolerance window', () => {
    const tracker = new PlaytimeTracker(makeRoster(1), 15);
    // 14 minutes played, tolerance=2 → within window, no flag
    tracker.subIn('p0', 1); tracker.subOut('p0', 1 + 14 * 60_000);
    assert.equal(tracker.getEquityFlags(2).length, 0);
  });
});

describe('PlaytimeTracker: endPeriod', () => {
  test('resets currentPeriodSeconds but preserves totalSeconds', () => {
    const tracker = new PlaytimeTracker(makeRoster(1));
    tracker.subIn('p0', 1);
    tracker.subOut('p0', 1 + 300_000); // 5 min
    assert.equal(tracker.playtime.p0.currentPeriodSeconds, 300);
    tracker.endPeriod();
    assert.equal(tracker.playtime.p0.currentPeriodSeconds, 0);
    assert.equal(tracker.playtime.p0.totalSeconds, 300);
  });
});

describe('PlaytimeTracker: getRecommendedSubs', () => {
  test('pairs under-target with over-target players', () => {
    const tracker = new PlaytimeTracker(makeRoster(2), 15);
    // p0 significantly under
    tracker.subIn('p0', 1); tracker.subOut('p0', 1 + 120_000); // 2 min
    // p1 significantly over
    tracker.subIn('p1', 1); tracker.subOut('p1', 1 + 1_500_000); // 25 min
    const recs = tracker.getRecommendedSubs();
    assert.ok(recs.length > 0);
    assert.equal(recs[0].playerIn, 'p0');
    assert.equal(recs[0].playerOut, 'p1');
    assert.equal(recs[0].urgency, 'HIGH');
  });
});
