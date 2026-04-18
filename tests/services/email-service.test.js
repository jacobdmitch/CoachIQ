import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

// Keep logger quiet.
process.env.LOG_LEVEL = 'error';

let computeTeamTotals;
let buildRecipients;
let buildEmail;

before(async () => {
  const mod = await import('../../services/emailService.js');
  computeTeamTotals = mod.computeTeamTotals;
  buildRecipients   = mod.buildRecipients;
  buildEmail        = mod.buildEmail;
});

// ─── computeTeamTotals ──────────────────────────────────────────────────────

describe('computeTeamTotals', () => {
  test('sums stat columns across athlete rows', () => {
    const totals = computeTeamTotals([
      { goals: 2, assists: 1, shots: 5, ground_balls: 3, saves: 0, turnovers: 1, faceoff_wins: 4, faceoff_losses: 1 },
      { goals: 1, assists: 3, shots: 2, ground_balls: 4, saves: 0, turnovers: 2, faceoff_wins: 0, faceoff_losses: 0 },
      { goals: 0, assists: 0, shots: 1, ground_balls: 0, saves: 6, turnovers: 0, faceoff_wins: 0, faceoff_losses: 0 },
    ]);
    assert.equal(totals.goals, 3);
    assert.equal(totals.assists, 4);
    assert.equal(totals.shots, 8);
    assert.equal(totals.ground_balls, 7);
    assert.equal(totals.saves, 6);
    assert.equal(totals.turnovers, 3);
    assert.equal(totals.faceoff_wins, 4);
    assert.equal(totals.faceoff_losses, 1);
  });

  test('returns zeros for an empty roster', () => {
    const totals = computeTeamTotals([]);
    for (const v of Object.values(totals)) assert.equal(v, 0);
  });

  test('coerces stringy numeric columns (pg numeric comes back as string)', () => {
    const totals = computeTeamTotals([{ goals: '2', shots: '3' }]);
    assert.equal(totals.goals, 2);
    assert.equal(totals.shots, 3);
  });
});

// ─── buildRecipients ────────────────────────────────────────────────────────

describe('buildRecipients', () => {
  test('returns null when athlete has no email and no parent contacts', () => {
    assert.equal(buildRecipients({ email: null, parent_contacts: [] }), null);
    assert.equal(buildRecipients({ email: null }), null);
  });

  test('returns athlete email only when no parents supplied', () => {
    assert.deepEqual(
      buildRecipients({ email: 'player@example.com' }),
      ['player@example.com']
    );
  });

  test('appends parent emails after the athlete', () => {
    const recipients = buildRecipients({
      email: 'player@example.com',
      parent_contacts: [
        { email: 'mom@example.com' },
        { email: 'dad@example.com' },
      ],
    });
    assert.deepEqual(recipients, ['player@example.com', 'mom@example.com', 'dad@example.com']);
  });

  test('dedupes case-insensitively and preserves first-seen casing', () => {
    const recipients = buildRecipients({
      email: 'Player@Example.com',
      parent_contacts: [
        { email: 'player@example.com' },     // duplicate of athlete
        { email: 'MOM@example.com' },
        { email: 'mom@example.com' },        // duplicate of first parent
      ],
    });
    assert.deepEqual(recipients, ['Player@Example.com', 'MOM@example.com']);
  });

  test('skips blank parent entries', () => {
    const recipients = buildRecipients({
      email: 'player@example.com',
      parent_contacts: [
        { email: '' },
        { email: null },
        { name: 'Phone-only parent', phone: '555-1212' },
        { email: 'dad@example.com' },
      ],
    });
    assert.deepEqual(recipients, ['player@example.com', 'dad@example.com']);
  });

  test('falls back to parents-only when athlete has no email', () => {
    const recipients = buildRecipients({
      email: null,
      parent_contacts: [{ email: 'mom@example.com' }],
    });
    assert.deepEqual(recipients, ['mom@example.com']);
  });
});

// ─── buildEmail ─────────────────────────────────────────────────────────────

describe('buildEmail', () => {
  const game = {
    opponent: 'Oakridge',
    game_date: '2026-04-12T00:00:00Z',
    score_home: 12,
    score_away: 8,
  };
  const totals = {
    goals: 12, assists: 9, shots: 28, ground_balls: 22,
    saves: 6, turnovers: 4, faceoff_wins: 11, faceoff_losses: 5,
  };
  const narrative = 'The team defeated Oakridge 12–8 with balanced scoring.';

  test('subject contains team, opponent, and score', () => {
    const { subject } = buildEmail(
      game, { first_name: 'Jane', goals: 2, assists: 1 },
      'Wildcats', totals, narrative,
    );
    assert.match(subject, /Wildcats/);
    assert.match(subject, /Oakridge/);
    assert.match(subject, /12–8/);
  });

  test('html embeds narrative, team totals, and player stats', () => {
    const { html } = buildEmail(
      game,
      { first_name: 'Jane', goals: 2, assists: 1, shots: 4, ground_balls: 3 },
      'Wildcats', totals, narrative,
    );
    assert.match(html, /Game Recap/);
    assert.match(html, /balanced scoring/);
    assert.match(html, /Team Totals/);
    assert.match(html, />12</);       // team goals value cell
    assert.match(html, /Your Stats/);
    assert.match(html, /Hi Jane/);
    // Shot percentage derived in-template: 2/4 = 50%
    assert.match(html, /50% shooting/);
  });

  test('text body mirrors html sections', () => {
    const { text } = buildEmail(
      game,
      { first_name: 'Jane', goals: 0, assists: 0, shots: 0 },
      'Wildcats', totals, narrative,
    );
    assert.match(text, /GAME RECAP/);
    assert.match(text, /TEAM TOTALS/);
    assert.match(text, /YOUR STATS/);
    assert.match(text, /No stats recorded for this game\./);
  });

  test('handles missing score and date gracefully', () => {
    const bareGame = { opponent: 'Oakridge', game_date: null, score_home: null, score_away: null };
    const { subject, html } = buildEmail(
      bareGame, { first_name: 'Jane' }, 'Wildcats', totals, narrative,
    );
    assert.match(subject, /Final/);
    assert.match(html, /Recent game/);
  });
});
