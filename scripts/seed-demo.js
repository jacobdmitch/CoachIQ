/**
 * CoachIQ Demo Seed Script
 * Creates a data-rich sample team for end-to-end testing.
 *
 * Run via Render Shell or locally:
 *   DATABASE_URL=<url> NODE_ENV=production node scripts/seed-demo.js
 *
 * Credentials after seeding:
 *   Email:    demo@coachiq.app
 *   Password: CoachIQ2026!
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';

const { Pool } = pg;
const sslConfig = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function q(text, params = []) {
  return pool.query(text, params);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const COACH = {
  email: 'demo@coachiq.app',
  password: 'CoachIQ2026!',
  first_name: 'Jake',
  last_name: 'Mitchell',
  subscription_tier: 'coach',
};

const TEAM = {
  team_name: 'Lakewood Warriors',
  season: 'Spring 2026',
  sport_type: 'field_lacrosse',
  game_format: 'standard',
  primary_color: '#1B4F8A',
};

// 22 players with realistic skill ratings
const ATHLETES = [
  // Goalies
  { first_name: 'Tyler',   last_name: 'Brooks',      jersey: 30, grad: 2026, pos: 'Goalie',  sec: null,      gb:5, dg:3, sh:4, pa:6, df:8, fo:3, tr:6, fa:8, notes: 'Starter. Elite footwork and communication.' },
  { first_name: 'Marcus',  last_name: 'Webb',         jersey: 31, grad: 2027, pos: 'Goalie',  sec: null,      gb:4, dg:2, sh:3, pa:5, df:6, fo:2, tr:5, fa:7, notes: 'Backup. Strong off the pipe, needs work on high corners.' },
  // Defense
  { first_name: 'Cole',    last_name: 'Harrington',   jersey: 2,  grad: 2026, pos: 'Defense', sec: 'Midfield',gb:8, dg:6, sh:4, pa:7, df:9, fo:3, tr:7, fa:8, notes: 'Shutdown defender. Named team captain.' },
  { first_name: 'Ryan',    last_name: 'Stokes',       jersey: 3,  grad: 2026, pos: 'Defense', sec: null,      gb:7, dg:5, sh:3, pa:6, df:8, fo:2, tr:6, fa:7, notes: 'Long pole specialist. Excellent on clears.' },
  { first_name: 'Jake',    last_name: 'Dunn',         jersey: 4,  grad: 2027, pos: 'Defense', sec: null,      gb:8, dg:5, sh:3, pa:6, df:7, fo:2, tr:7, fa:7, notes: 'Caused turnover machine. Aggressive on-ball.' },
  { first_name: 'Brandon', last_name: 'Mills',        jersey: 5,  grad: 2028, pos: 'Defense', sec: null,      gb:6, dg:4, sh:2, pa:5, df:7, fo:2, tr:5, fa:6, notes: 'Reliable off-ball defender. Junior.' },
  { first_name: 'Liam',    last_name: 'Foster',       jersey: 6,  grad: 2027, pos: 'Defense', sec: 'Midfield',gb:7, dg:6, sh:4, pa:6, df:7, fo:3, tr:8, fa:7, notes: 'Athletic transition defender. Can push up in EMO.' },
  { first_name: 'Owen',    last_name: 'Clarke',       jersey: 7,  grad: 2029, pos: 'Defense', sec: null,      gb:5, dg:4, sh:2, pa:5, df:5, fo:2, tr:5, fa:5, notes: 'Freshman. High ceiling, needs reps.' },
  // Midfield
  { first_name: 'Nate',    last_name: 'Rivera',       jersey: 10, grad: 2026, pos: 'Midfield',sec: 'Defense', gb:8, dg:8, sh:7, pa:9, df:8, fo:4, tr:9, fa:9, notes: 'Best two-way mid. Sets the tempo on offense and D.' },
  { first_name: 'Connor',  last_name: 'Walsh',        jersey: 11, grad: 2027, pos: 'Midfield',sec: null,      gb:7, dg:6, sh:5, pa:6, df:6, fo:9, tr:7, fa:7, notes: 'Primary FOGO in a pinch. Strong transition mid.' },
  { first_name: 'Derek',   last_name: 'Sato',         jersey: 12, grad: 2026, pos: 'Midfield',sec: 'Attack',  gb:6, dg:7, sh:8, pa:7, df:5, fo:3, tr:7, fa:7, notes: 'Offensive mid with a strong shot. Good on the pipe.' },
  { first_name: 'Marcus',  last_name: 'Bell',         jersey: 13, grad: 2027, pos: 'Midfield',sec: null,      gb:7, dg:6, sh:5, pa:7, df:6, fo:3, tr:8, fa:7, notes: 'Transition mid. Great motor, never stops running.' },
  { first_name: 'Tyler',   last_name: 'Nguyen',       jersey: 14, grad: 2028, pos: 'Midfield',sec: 'Defense', gb:6, dg:5, sh:4, pa:6, df:7, fo:3, tr:6, fa:6, notes: 'Defensive mid. Excellent on riding and slides.' },
  { first_name: 'Jason',   last_name: 'Park',         jersey: 15, grad: 2027, pos: 'Midfield',sec: null,      gb:8, dg:6, sh:5, pa:6, df:6, fo:3, tr:7, fa:7, notes: 'Ground ball warrior. Wins every 50/50.' },
  { first_name: 'Sam',     last_name: 'Torres',       jersey: 16, grad: 2028, pos: 'Midfield',sec: null,      gb:6, dg:5, sh:5, pa:8, df:5, fo:2, tr:6, fa:6, notes: 'Great passer. Distributes well in settled offense.' },
  { first_name: 'Chris',   last_name: 'Evans',        jersey: 17, grad: 2029, pos: 'Midfield',sec: null,      gb:5, dg:5, sh:4, pa:5, df:5, fo:3, tr:5, fa:5, notes: 'Freshman mid developing well.' },
  // Attack
  { first_name: 'Kyle',    last_name: 'Donovan',      jersey: 1,  grad: 2026, pos: 'Attack',  sec: null,      gb:7, dg:9, sh:8, pa:8, df:4, fo:2, tr:7, fa:8, notes: 'Leading scorer. Lethal off the dodge. Senior captain.' },
  { first_name: 'Austin',  last_name: 'Reed',         jersey: 8,  grad: 2026, pos: 'Attack',  sec: null,      gb:6, dg:7, sh:7, pa:9, df:3, fo:2, tr:6, fa:8, notes: 'Assist leader. Elite vision and IQ. Lefty shooter.' },
  { first_name: 'Brody',   last_name: 'Kim',          jersey: 9,  grad: 2027, pos: 'Attack',  sec: null,      gb:6, dg:7, sh:7, pa:7, df:3, fo:2, tr:6, fa:7, notes: 'Crease presence. Strong finisher near goal. Lefty.' },
  { first_name: 'Hunter',  last_name: 'Price',        jersey: 22, grad: 2027, pos: 'Attack',  sec: 'Midfield',gb:6, dg:6, sh:6, pa:6, df:4, fo:2, tr:7, fa:6, notes: 'Utility attack. Can play up top or on the wing.' },
  { first_name: 'Jake',    last_name: 'Moss',         jersey: 23, grad: 2028, pos: 'Attack',  sec: null,      gb:5, dg:5, sh:5, pa:6, df:3, fo:2, tr:5, fa:5, notes: 'Developing sophomore. Improving shot this year.' },
  // FOGO
  { first_name: 'Carlos',  last_name: 'Rodriguez',    jersey: 24, grad: 2027, pos: 'FOGO',    sec: 'Midfield',gb:9, dg:5, sh:4, pa:5, df:5, fo:10, tr:7, fa:7, notes: 'Specialist FOGO. 82% win rate on the season.' },
];

// 8 completed games + 1 scheduled
const GAMES_TEMPLATE = [
  { opponent: "St. Michael's",  date: '2026-03-07', location: 'Home', score_home: 9,  score_away: 6  },
  { opponent: 'Riverside HS',   date: '2026-03-12', location: 'Away', score_home: 11, score_away: 5  },
  { opponent: 'Northview',      date: '2026-03-18', location: 'Home', score_home: 7,  score_away: 9  },
  { opponent: 'Cardinal Prep',  date: '2026-03-22', location: 'Away', score_home: 13, score_away: 8  },
  { opponent: 'Eastwood',       date: '2026-03-28', location: 'Home', score_home: 8,  score_away: 7  },
  { opponent: 'Lincoln Academy',date: '2026-04-03', location: 'Away', score_home: 5,  score_away: 10 },
  { opponent: "St. Mary's",     date: '2026-04-08', location: 'Home', score_home: 10, score_away: 6  },
  { opponent: 'Westfield (Tournament)', date: '2026-04-11', location: 'Neutral – Maplewood Sports Complex', score_home: 12, score_away: 9 },
];

const PLAYS = [
  {
    title: 'Wheel',
    situation_tag: 'settled',
    notes: 'Standard settled offense. A1 initiates dodge from top, mids rotate, crease slides weak side.',
    diagram: {
      format: 'half_field',
      players: [
        { id: 'p-1', x: 0.50, y: 0.25, label: 'A1', role: 'Attack',  color: '#e63946' },
        { id: 'p-2', x: 0.25, y: 0.40, label: 'A2', role: 'Attack',  color: '#e63946' },
        { id: 'p-3', x: 0.75, y: 0.40, label: 'A3', role: 'Attack',  color: '#e63946' },
        { id: 'p-4', x: 0.20, y: 0.65, label: 'M1', role: 'Midfield',color: '#457b9d' },
        { id: 'p-5', x: 0.50, y: 0.70, label: 'M2', role: 'Midfield',color: '#457b9d' },
        { id: 'p-6', x: 0.80, y: 0.65, label: 'M3', role: 'Midfield',color: '#457b9d' },
        { id: 'p-7', x: 0.50, y: 0.88, label: 'G',  role: 'Goalie',  color: '#f1faee' },
      ],
      arrows: [],
      text_labels: [],
    },
  },
  {
    title: 'EMO Overload Right',
    situation_tag: 'emo',
    notes: '6v5. Overload the right side. A1 holds ball up top. Mids shift right creating 3v2.',
    diagram: {
      format: 'half_field',
      players: [
        { id: 'p-1', x: 0.50, y: 0.22, label: 'A1', role: 'Attack',  color: '#e63946' },
        { id: 'p-2', x: 0.20, y: 0.35, label: 'A2', role: 'Attack',  color: '#e63946' },
        { id: 'p-3', x: 0.75, y: 0.35, label: 'A3', role: 'Attack',  color: '#e63946' },
        { id: 'p-4', x: 0.65, y: 0.55, label: 'M1', role: 'Midfield',color: '#457b9d' },
        { id: 'p-5', x: 0.85, y: 0.55, label: 'M2', role: 'Midfield',color: '#457b9d' },
        { id: 'p-6', x: 0.75, y: 0.72, label: 'M3', role: 'Midfield',color: '#457b9d' },
        { id: 'p-7', x: 0.50, y: 0.88, label: 'G',  role: 'Goalie',  color: '#f1faee' },
      ],
      arrows: [],
      text_labels: [],
    },
  },
  {
    title: 'Man-Down Zone',
    situation_tag: 'man_down',
    notes: '5v6 man-down zone. Box + 1 alignment. Goalies communicate slides.',
    diagram: {
      format: 'half_field',
      players: [
        { id: 'p-1', x: 0.25, y: 0.30, label: 'D1', role: 'Defense', color: '#1d3557' },
        { id: 'p-2', x: 0.75, y: 0.30, label: 'D2', role: 'Defense', color: '#1d3557' },
        { id: 'p-3', x: 0.25, y: 0.60, label: 'D3', role: 'Defense', color: '#1d3557' },
        { id: 'p-4', x: 0.75, y: 0.60, label: 'M1', role: 'Midfield',color: '#457b9d' },
        { id: 'p-5', x: 0.50, y: 0.45, label: 'M2', role: 'Midfield',color: '#457b9d' },
        { id: 'p-6', x: 0.50, y: 0.88, label: 'G',  role: 'Goalie',  color: '#f1faee' },
      ],
      arrows: [],
      text_labels: [],
    },
  },
  {
    title: 'Fast Break 3v2',
    situation_tag: 'transition',
    notes: '3v2 transition. Ball carrier splits the two defenders. Wings cut hard to the pipe.',
    diagram: {
      format: 'half_field',
      players: [
        { id: 'p-1', x: 0.50, y: 0.20, label: 'M1', role: 'Midfield',color: '#457b9d' },
        { id: 'p-2', x: 0.20, y: 0.45, label: 'A1', role: 'Attack',  color: '#e63946' },
        { id: 'p-3', x: 0.80, y: 0.45, label: 'A2', role: 'Attack',  color: '#e63946' },
        { id: 'p-4', x: 0.50, y: 0.88, label: 'G',  role: 'Goalie',  color: '#f1faee' },
      ],
      arrows: [],
      text_labels: [],
    },
  },
  {
    title: 'Faceoff Wing Set',
    situation_tag: 'faceoff',
    notes: 'Wings attack ground ball aggressively. Mids crash if FOGO wins. Defense holds if loss.',
    diagram: {
      format: 'full_field',
      players: [
        { id: 'p-1', x: 0.50, y: 0.50, label: 'FO', role: 'FOGO',   color: '#a8dadc' },
        { id: 'p-2', x: 0.35, y: 0.50, label: 'W1', role: 'Midfield',color: '#457b9d' },
        { id: 'p-3', x: 0.65, y: 0.50, label: 'W2', role: 'Midfield',color: '#457b9d' },
        { id: 'p-4', x: 0.20, y: 0.65, label: 'M1', role: 'Midfield',color: '#457b9d' },
        { id: 'p-5', x: 0.80, y: 0.65, label: 'M2', role: 'Midfield',color: '#457b9d' },
      ],
      arrows: [],
      text_labels: [],
    },
  },
];

const PRACTICE_SESSIONS = [
  {
    date: '2026-04-10',
    focus_tags: ['ground_balls', 'transition', 'faceoff'],
    notes: 'Pre-tournament sharpening. Focused on 50/50 battles and outlet passes after GB wins.',
    drill_blocks: [
      { name: 'Warm-Up / Stick Work', duration_minutes: 15, description: 'Dynamic warm-up, partner passing, dodging footwork.' },
      { name: 'GB War Drill (3v3)', duration_minutes: 20, description: 'Two groups compete for loose balls with immediate transition.' },
      { name: 'FOGO Reps', duration_minutes: 15, description: 'Carlos Rodriguez gets live reps against Connor Walsh. Wings work timing.' },
      { name: 'Outlet + Transition 5v4', duration_minutes: 25, description: 'Goalie makes save, outlet to defender, mids push tempo. Count seconds to shot.' },
      { name: 'Team Scrimmage', duration_minutes: 30, description: 'Full team. Emphasize riding hard and taking away outlets.' },
    ],
  },
  {
    date: '2026-04-07',
    focus_tags: ['emo', 'man_down', 'settled'],
    notes: 'Special teams day. Spent first half on EMO sets, second half on man-down positioning.',
    drill_blocks: [
      { name: 'Warm-Up', duration_minutes: 15, description: 'Stick work, shooting warm-up.' },
      { name: 'EMO Reps (6v5)', duration_minutes: 30, description: 'Walk-through then live reps of Wheel and Overload Right. Attack moving feet in cuts.' },
      { name: 'Man-Down Positioning', duration_minutes: 25, description: 'Zone alignment. Communication drills. Goalies calling slides.' },
      { name: 'Live 6v5 / 5v6 Situational', duration_minutes: 25, description: 'Full live situation with refs simulating man-up and man-down scenarios.' },
    ],
  },
  {
    date: '2026-03-31',
    focus_tags: ['shooting', 'dodging', 'settled'],
    notes: 'Offensive efficiency day. Film review showed too many bounce shots getting saved low.',
    drill_blocks: [
      { name: 'Warm-Up / Shooting Lines', duration_minutes: 20, description: 'High-to-low warm-up, then shooting lines from 10 yards.' },
      { name: 'Dodge Series', duration_minutes: 25, description: 'Split dodge, roll dodge, face dodge vs live D. Attack finishes with shot.' },
      { name: '2-Man Game (Attack)', duration_minutes: 20, description: 'A1 and A2 vs two defenders plus goalie. Emphasis on skip-and-cut reads.' },
      { name: 'Settled Offense 6v6', duration_minutes: 30, description: 'Half-field settled offense. Count passes before shot. Require ball movement.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedCoach() {
  const existing = await q('SELECT id FROM coaches WHERE email = $1', [COACH.email]);
  if (existing.rows.length > 0) {
    console.log(`Coach already exists (${COACH.email}). Skipping.`);
    return existing.rows[0].id;
  }
  const hash = await bcrypt.hash(COACH.password, 12);
  const res = await q(
    `INSERT INTO coaches (email, password_hash, first_name, last_name, subscription_tier)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [COACH.email, hash, COACH.first_name, COACH.last_name, COACH.subscription_tier]
  );
  console.log(`Created coach: ${COACH.email}`);
  return res.rows[0].id;
}

async function seedTeam(coachId) {
  const existing = await q(
    'SELECT id FROM teams WHERE coach_id = $1 AND team_name = $2',
    [coachId, TEAM.team_name]
  );
  if (existing.rows.length > 0) {
    console.log(`Team already exists (${TEAM.team_name}). Skipping team + all related data.`);
    return null; // signal to skip downstream seeds
  }
  const res = await q(
    `INSERT INTO teams (coach_id, team_name, season, sport_type, game_format, primary_color)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [coachId, TEAM.team_name, TEAM.season, TEAM.sport_type, TEAM.game_format, TEAM.primary_color]
  );
  console.log(`Created team: ${TEAM.team_name}`);
  return res.rows[0].id;
}

async function seedAthletes(teamId) {
  const ids = {};
  for (const a of ATHLETES) {
    const res = await q(
      `INSERT INTO athletes
         (team_id, first_name, last_name, jersey_number, graduation_year,
          primary_position, secondary_position,
          skill_ground_balls, skill_dodging, skill_shooting, skill_passing,
          skill_defense, skill_faceoff, skill_transition, skill_field_awareness,
          notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        teamId, a.first_name, a.last_name, a.jersey, a.grad,
        a.pos, a.sec,
        a.gb, a.dg, a.sh, a.pa, a.df, a.fo, a.tr, a.fa,
        a.notes,
      ]
    );
    ids[`${a.first_name}_${a.last_name}`] = res.rows[0].id;
  }
  console.log(`Created ${ATHLETES.length} athletes`);
  return ids;
}

// Build realistic game events for one completed game.
// goals/assists come from a per-game script so season totals are realistic.
function buildGameScript(athleteIds, gameIndex) {
  const {
    Kyle_Donovan: kyle, Austin_Reed: austin, Brody_Kim: brody,
    Nate_Rivera: nate, Derek_Sato: derek, Marcus_Bell: marcus,
    Hunter_Price: hunter,
    Cole_Harrington: cole, Ryan_Stokes: ryan, Jake_Dunn: jake_d,
    Liam_Foster: liam, Jason_Park: jason, Sam_Torres: sam,
    Tyler_Brooks: tyler_g,
    Carlos_Rodriguez: carlos, Connor_Walsh: connor,
  } = athleteIds;

  // Per-game goal distributions (roughly matching the 8 final scores)
  const scoringScripts = [
    // G1: W 9-6 vs St. Michael's
    [ {a:kyle,assist:austin}, {a:austin,assist:brody}, {a:derek,assist:nate}, {a:kyle,assist:null}, {a:brody,assist:austin}, {a:nate,assist:kyle}, {a:kyle,assist:austin}, {a:austin,assist:derek}, {a:hunter,assist:brody} ],
    // G2: W 11-5 vs Riverside
    [ {a:kyle,assist:austin}, {a:kyle,assist:null}, {a:austin,assist:kyle}, {a:derek,assist:nate}, {a:brody,assist:austin}, {a:nate,assist:kyle}, {a:kyle,assist:brody}, {a:austin,assist:nate}, {a:derek,assist:austin}, {a:hunter,assist:kyle}, {a:marcus,assist:nate} ],
    // G3: L 7-9 vs Northview
    [ {a:kyle,assist:austin}, {a:austin,assist:kyle}, {a:brody,assist:null}, {a:derek,assist:nate}, {a:nate,assist:kyle}, {a:kyle,assist:austin}, {a:austin,assist:derek} ],
    // G4: W 13-8 vs Cardinal
    [ {a:kyle,assist:austin}, {a:austin,assist:brody}, {a:kyle,assist:null}, {a:derek,assist:nate}, {a:brody,assist:austin}, {a:nate,assist:kyle}, {a:kyle,assist:brody}, {a:austin,assist:nate}, {a:derek,assist:kyle}, {a:hunter,assist:austin}, {a:marcus,assist:nate}, {a:brody,assist:derek}, {a:sam,assist:nate} ],
    // G5: W 8-7 vs Eastwood
    [ {a:kyle,assist:austin}, {a:austin,assist:kyle}, {a:brody,assist:null}, {a:derek,assist:nate}, {a:nate,assist:kyle}, {a:kyle,assist:brody}, {a:austin,assist:derek}, {a:hunter,assist:kyle} ],
    // G6: L 5-10 vs Lincoln
    [ {a:kyle,assist:austin}, {a:austin,assist:kyle}, {a:derek,assist:nate}, {a:brody,assist:null}, {a:nate,assist:kyle} ],
    // G7: W 10-6 vs St. Mary's
    [ {a:kyle,assist:austin}, {a:austin,assist:brody}, {a:brody,assist:kyle}, {a:derek,assist:nate}, {a:nate,assist:kyle}, {a:kyle,assist:null}, {a:austin,assist:kyle}, {a:hunter,assist:austin}, {a:marcus,assist:nate}, {a:sam,assist:derek} ],
    // G8: W 12-9 vs Westfield
    [ {a:kyle,assist:austin}, {a:kyle,assist:brody}, {a:austin,assist:kyle}, {a:brody,assist:austin}, {a:derek,assist:nate}, {a:nate,assist:kyle}, {a:kyle,assist:null}, {a:austin,assist:derek}, {a:hunter,assist:brody}, {a:marcus,assist:nate}, {a:brody,assist:kyle}, {a:sam,assist:austin} ],
  ];

  const goals = scoringScripts[gameIndex];
  const events = [];
  let clockBucket = 600; // start at 10:00 left in period 1

  goals.forEach((g, i) => {
    const period = Math.min(4, Math.floor(i / 3) + 1);
    const clockSeconds = Math.max(30, clockBucket - randomBetween(60, 180));
    clockBucket = clockSeconds;

    events.push({ athlete_id: g.a, event_type: 'goal',         period, clock: clockSeconds, assist_id: null });
    if (g.assist) {
      events.push({ athlete_id: g.assist, event_type: 'assist', period, clock: clockSeconds, assist_id: null });
    }
    // Each goal attempt also had a shot
    events.push({ athlete_id: g.a, event_type: 'shot_on_goal', period, clock: clockSeconds + 2, assist_id: null });
  });

  // Additional shots (misses)
  const shooters = [kyle, austin, brody, derek, nate];
  for (let i = 0; i < 6; i++) {
    events.push({ athlete_id: shooters[i % shooters.length], event_type: 'shot', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
  }

  // Ground balls
  const gbPlayers = [jason, cole, ryan, jake_d, nate, marcus];
  gbPlayers.forEach((p, i) => {
    const count = i === 0 ? 4 : randomBetween(1, 3);
    for (let j = 0; j < count; j++) {
      events.push({ athlete_id: p, event_type: 'ground_ball', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
    }
  });

  // Turnovers
  [kyle, austin, marcus, derek].forEach((p) => {
    events.push({ athlete_id: p, event_type: 'turnover', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
  });

  // Caused turnovers
  [cole, jake_d, liam].forEach((p) => {
    events.push({ athlete_id: p, event_type: 'caused_turnover', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
  });

  // Goalie saves
  const saveCount = randomBetween(8, 14);
  for (let i = 0; i < saveCount; i++) {
    events.push({ athlete_id: tyler_g, event_type: 'save', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
  }

  // Faceoff wins/losses for Carlos
  for (let period = 1; period <= 4; period++) {
    const wins  = randomBetween(2, 4);
    const losses = randomBetween(0, 2);
    for (let w = 0; w < wins; w++)   events.push({ athlete_id: carlos, event_type: 'faceoff_win',  period, clock: randomBetween(600, 720), assist_id: null });
    for (let l = 0; l < losses; l++) events.push({ athlete_id: carlos, event_type: 'faceoff_loss', period, clock: randomBetween(600, 720), assist_id: null });
  }

  return events;
}

function buildPlaytimeLog(athleteIds) {
  // Build a realistic playtime log. All active players get minutes; backups less.
  const starters = [
    athleteIds.Tyler_Brooks,
    athleteIds.Cole_Harrington, athleteIds.Ryan_Stokes, athleteIds.Jake_Dunn,
    athleteIds.Nate_Rivera, athleteIds.Derek_Sato, athleteIds.Marcus_Bell,
    athleteIds.Kyle_Donovan, athleteIds.Austin_Reed, athleteIds.Brody_Kim,
    athleteIds.Carlos_Rodriguez,
  ];
  const subs = [
    athleteIds.Liam_Foster, athleteIds.Jason_Park, athleteIds.Sam_Torres,
    athleteIds.Hunter_Price, athleteIds.Tyler_Nguyen, athleteIds.Connor_Walsh,
  ];
  const deepSubs = [
    athleteIds.Brandon_Mills, athleteIds.Chris_Evans, athleteIds.Jake_Moss,
    athleteIds.Owen_Clarke,
  ];

  const log = [];

  for (let period = 1; period <= 4; period++) {
    starters.forEach((id) => {
      const mins = parseFloat((randomBetween(10, 12)).toFixed(2));
      log.push({ athlete_id: id, period, minutes_played: mins });
    });
    subs.forEach((id) => {
      const mins = parseFloat((randomBetween(4, 8)).toFixed(2));
      log.push({ athlete_id: id, period, minutes_played: mins });
    });
    deepSubs.forEach((id) => {
      if (randomBetween(1, 3) > 1) { // play ~67% of periods
        const mins = parseFloat((randomBetween(1, 4)).toFixed(2));
        log.push({ athlete_id: id, period, minutes_played: mins });
      }
    });
  }

  return log;
}

async function seedGames(teamId, athleteIds) {
  const gameIds = [];

  for (let i = 0; i < GAMES_TEMPLATE.length; i++) {
    const g = GAMES_TEMPLATE[i];
    const res = await q(
      `INSERT INTO games
         (team_id, opponent, game_date, location, format, periods, period_length_minutes,
          score_home, score_away, status, notes)
       VALUES ($1,$2,$3,$4,'standard',4,12,$5,$6,'completed',$7)
       RETURNING id`,
      [teamId, g.opponent, g.date, g.location, g.score_home, g.score_away,
       `Final: ${g.score_home}-${g.score_away} vs ${g.opponent}`]
    );
    const gameId = res.rows[0].id;
    gameIds.push(gameId);

    // Game events
    const events = buildGameScript(athleteIds, i);
    for (const ev of events) {
      await q(
        `INSERT INTO game_events (game_id, athlete_id, event_type, period, game_clock_seconds, assist_athlete_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [gameId, ev.athlete_id, ev.event_type, ev.period, ev.clock, ev.assist_id]
      );
    }

    // Playtime log
    const ptLog = buildPlaytimeLog(athleteIds);
    for (const pt of ptLog) {
      await q(
        `INSERT INTO playtime_log (game_id, athlete_id, period, minutes_played)
         VALUES ($1,$2,$3,$4)`,
        [gameId, pt.athlete_id, pt.period, pt.minutes_played]
      );
    }

    console.log(`  Game ${i + 1}/8: ${g.opponent} (${g.score_home}-${g.score_away}) — ${events.length} events, ${ptLog.length} playtime entries`);
  }

  // Upcoming scheduled game for live game mode testing
  const scheduledRes = await q(
    `INSERT INTO games
       (team_id, opponent, game_date, location, format, periods, period_length_minutes, status, notes)
     VALUES ($1,$2,$3,$4,'standard',4,12,'scheduled',$5)
     RETURNING id`,
    [teamId, 'Greenfield Academy', '2026-04-18', 'Home – Lakewood Athletic Complex',
     'Semifinal. Greenfield is 9-2 on the season. Their #22 (attack) has 24 goals. Expect heavy EMO pressure.']
  );
  console.log(`  Scheduled game vs Greenfield Academy (${scheduledRes.rows[0].id})`);

  return gameIds;
}

async function seedPlays(teamId) {
  for (const p of PLAYS) {
    await q(
      `INSERT INTO plays (team_id, title, situation_tag, diagram_data, notes)
       VALUES ($1,$2,$3,$4,$5)`,
      [teamId, p.title, p.situation_tag, JSON.stringify(p.diagram), p.notes]
    );
  }
  console.log(`Created ${PLAYS.length} plays`);
}

async function seedPractice(teamId) {
  for (const ps of PRACTICE_SESSIONS) {
    await q(
      `INSERT INTO practice_sessions (team_id, practice_date, drill_blocks, focus_tags, notes)
       VALUES ($1,$2,$3,$4,$5)`,
      [teamId, ps.date, JSON.stringify(ps.drill_blocks), ps.focus_tags, ps.notes]
    );
  }
  console.log(`Created ${PRACTICE_SESSIONS.length} practice sessions`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  console.log('=== CoachIQ Demo Seed ===\n');
  try {
    const coachId = await seedCoach();
    const teamId  = await seedTeam(coachId);

    if (!teamId) {
      console.log('\nTeam already seeded. Nothing to do.');
      return;
    }

    console.log('\nSeeding athletes...');
    const athleteIds = await seedAthletes(teamId);

    console.log('\nSeeding games, events, and playtime...');
    await seedGames(teamId, athleteIds);

    console.log('\nSeeding plays...');
    await seedPlays(teamId);

    console.log('\nSeeding practice sessions...');
    await seedPractice(teamId);

    console.log('\n=== Seed complete ===');
    console.log(`\n  Login:    ${COACH.email}`);
    console.log(`  Password: ${COACH.password}`);
    console.log(`  Team:     ${TEAM.team_name} (${TEAM.season})`);
    console.log(`  Roster:   ${ATHLETES.length} athletes`);
    console.log(`  Games:    8 completed + 1 scheduled\n`);
  } catch (err) {
    console.error('\nSeed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
