/**
 * CoachIQ Demo Seed Script
 * Creates a data-rich sample team exercising Phase 1-7 features:
 *   - Seasons table (required by games route)
 *   - Athletes with shot_hand / is_captain / depth_tier
 *   - Opposing teams with film stats (Phase 6 scouting)
 *   - Lines + line_rotations (Phase 7 staging panel)
 *   - Per-game situation assignments
 *   - Completed, active (in-progress), and scheduled games
 *
 * Run via Render Shell or locally:
 *   DATABASE_URL=<url> NODE_ENV=production node scripts/seed-demo.js
 *
 * This script WIPES the demo coach and everything downstream before reseeding.
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

const SEASON = {
  name: 'Spring 2026',
  start_date: '2026-02-15',
  end_date:   '2026-06-15',
};

// 22 players with realistic skill ratings, shot hands, captains, depth tiers.
// depth_tier: 'starter' | 'rotation' | 'developmental'
// shot_hand:  'right' | 'left' | 'both'
const ATHLETES = [
  // Goalies
  { first_name: 'Tyler',   last_name: 'Brooks',      jersey: 30, grad: 2026, pos: 'Goalie',  sec: null,      hand: 'right', cap: false, tier: 'starter',       gb:5, dg:3, sh:4, pa:6, df:8, fo:3, tr:6, fa:8, notes: 'Starter. Elite footwork and communication.' },
  { first_name: 'Marcus',  last_name: 'Webb',         jersey: 31, grad: 2027, pos: 'Goalie',  sec: null,      hand: 'right', cap: false, tier: 'rotation',      gb:4, dg:2, sh:3, pa:5, df:6, fo:2, tr:5, fa:7, notes: 'Backup. Strong off the pipe, needs work on high corners.' },
  // Defense
  { first_name: 'Cole',    last_name: 'Harrington',   jersey: 2,  grad: 2026, pos: 'Defense', sec: 'Midfield',hand: 'right', cap: true,  tier: 'starter',       gb:8, dg:6, sh:4, pa:7, df:9, fo:3, tr:7, fa:8, notes: 'Shutdown defender. Named team captain.' },
  { first_name: 'Ryan',    last_name: 'Stokes',       jersey: 3,  grad: 2026, pos: 'Defense', sec: null,      hand: 'right', cap: false, tier: 'starter',       gb:7, dg:5, sh:3, pa:6, df:8, fo:2, tr:6, fa:7, notes: 'Long pole specialist. Excellent on clears.' },
  { first_name: 'Jake',    last_name: 'Dunn',         jersey: 4,  grad: 2027, pos: 'Defense', sec: null,      hand: 'right', cap: false, tier: 'starter',       gb:8, dg:5, sh:3, pa:6, df:7, fo:2, tr:7, fa:7, notes: 'Caused turnover machine. Aggressive on-ball.' },
  { first_name: 'Brandon', last_name: 'Mills',        jersey: 5,  grad: 2028, pos: 'Defense', sec: null,      hand: 'right', cap: false, tier: 'rotation',      gb:6, dg:4, sh:2, pa:5, df:7, fo:2, tr:5, fa:6, notes: 'Reliable off-ball defender. Junior.' },
  { first_name: 'Liam',    last_name: 'Foster',       jersey: 6,  grad: 2027, pos: 'Defense', sec: 'Midfield',hand: 'left',  cap: false, tier: 'rotation',      gb:7, dg:6, sh:4, pa:6, df:7, fo:3, tr:8, fa:7, notes: 'Athletic transition defender. Can push up in EMO.' },
  { first_name: 'Owen',    last_name: 'Clarke',       jersey: 7,  grad: 2029, pos: 'Defense', sec: null,      hand: 'right', cap: false, tier: 'developmental', gb:5, dg:4, sh:2, pa:5, df:5, fo:2, tr:5, fa:5, notes: 'Freshman. High ceiling, needs reps.' },
  // Midfield
  { first_name: 'Nate',    last_name: 'Rivera',       jersey: 10, grad: 2026, pos: 'Midfield',sec: 'Defense', hand: 'right', cap: true,  tier: 'starter',       gb:8, dg:8, sh:7, pa:9, df:8, fo:4, tr:9, fa:9, notes: 'Best two-way mid. Sets the tempo on offense and D.' },
  { first_name: 'Connor',  last_name: 'Walsh',        jersey: 11, grad: 2027, pos: 'Midfield',sec: null,      hand: 'right', cap: false, tier: 'rotation',      gb:7, dg:6, sh:5, pa:6, df:6, fo:9, tr:7, fa:7, notes: 'Primary FOGO in a pinch. Strong transition mid.' },
  { first_name: 'Derek',   last_name: 'Sato',         jersey: 12, grad: 2026, pos: 'Midfield',sec: 'Attack',  hand: 'right', cap: false, tier: 'starter',       gb:6, dg:7, sh:8, pa:7, df:5, fo:3, tr:7, fa:7, notes: 'Offensive mid with a strong shot. Good on the pipe.' },
  { first_name: 'Marcus',  last_name: 'Bell',         jersey: 13, grad: 2027, pos: 'Midfield',sec: null,      hand: 'right', cap: false, tier: 'starter',       gb:7, dg:6, sh:5, pa:7, df:6, fo:3, tr:8, fa:7, notes: 'Transition mid. Great motor, never stops running.' },
  { first_name: 'Tyler',   last_name: 'Nguyen',       jersey: 14, grad: 2028, pos: 'Midfield',sec: 'Defense', hand: 'left',  cap: false, tier: 'rotation',      gb:6, dg:5, sh:4, pa:6, df:7, fo:3, tr:6, fa:6, notes: 'Defensive mid. Excellent on riding and slides.' },
  { first_name: 'Jason',   last_name: 'Park',         jersey: 15, grad: 2027, pos: 'Midfield',sec: null,      hand: 'right', cap: false, tier: 'rotation',      gb:8, dg:6, sh:5, pa:6, df:6, fo:3, tr:7, fa:7, notes: 'Ground ball warrior. Wins every 50/50.' },
  { first_name: 'Sam',     last_name: 'Torres',       jersey: 16, grad: 2028, pos: 'Midfield',sec: null,      hand: 'right', cap: false, tier: 'rotation',      gb:6, dg:5, sh:5, pa:8, df:5, fo:2, tr:6, fa:6, notes: 'Great passer. Distributes well in settled offense.' },
  { first_name: 'Chris',   last_name: 'Evans',        jersey: 17, grad: 2029, pos: 'Midfield',sec: null,      hand: 'right', cap: false, tier: 'developmental', gb:5, dg:5, sh:4, pa:5, df:5, fo:3, tr:5, fa:5, notes: 'Freshman mid developing well.' },
  // Attack
  { first_name: 'Kyle',    last_name: 'Donovan',      jersey: 1,  grad: 2026, pos: 'Attack',  sec: null,      hand: 'right', cap: true,  tier: 'starter',       gb:7, dg:9, sh:8, pa:8, df:4, fo:2, tr:7, fa:8, notes: 'Leading scorer. Lethal off the dodge. Senior captain.' },
  { first_name: 'Austin',  last_name: 'Reed',         jersey: 8,  grad: 2026, pos: 'Attack',  sec: null,      hand: 'left',  cap: false, tier: 'starter',       gb:6, dg:7, sh:7, pa:9, df:3, fo:2, tr:6, fa:8, notes: 'Assist leader. Elite vision and IQ. Lefty shooter.' },
  { first_name: 'Brody',   last_name: 'Kim',          jersey: 9,  grad: 2027, pos: 'Attack',  sec: null,      hand: 'left',  cap: false, tier: 'starter',       gb:6, dg:7, sh:7, pa:7, df:3, fo:2, tr:6, fa:7, notes: 'Crease presence. Strong finisher near goal. Lefty.' },
  { first_name: 'Hunter',  last_name: 'Price',        jersey: 22, grad: 2027, pos: 'Attack',  sec: 'Midfield',hand: 'right', cap: false, tier: 'rotation',      gb:6, dg:6, sh:6, pa:6, df:4, fo:2, tr:7, fa:6, notes: 'Utility attack. Can play up top or on the wing.' },
  { first_name: 'Jake',    last_name: 'Moss',         jersey: 23, grad: 2028, pos: 'Attack',  sec: null,      hand: 'right', cap: false, tier: 'developmental', gb:5, dg:5, sh:5, pa:6, df:3, fo:2, tr:5, fa:5, notes: 'Developing sophomore. Improving shot this year.' },
  // FOGO
  { first_name: 'Carlos',  last_name: 'Rodriguez',    jersey: 24, grad: 2027, pos: 'FOGO',    sec: 'Midfield',hand: 'right', cap: false, tier: 'starter',       gb:9, dg:5, sh:4, pa:5, df:5, fo:10, tr:7, fa:7, notes: 'Specialist FOGO. 82% win rate on the season.' },
];

// Opposing teams scouted by the coach. Greenfield is the upcoming semifinal
// opponent and has the richest film-stats baseline. The other two are teams
// we've already played but still have scouting notes on.
const OPPOSING_TEAMS = [
  {
    name: 'Greenfield Academy',
    notes: 'Semifinal opponent. Run-and-gun offense built around #22. Weak on off-ball D — look for skip passes.',
    players: [
      // Scouting data is cumulative film observations across multiple games.
      { jersey: 22, name: 'Ethan Walsh',    pos: 'Attack',   film: { games: 5, goals: 24, assists: 9,  shots: 62, shots_on_goal: 48, ground_balls: 6,  turnovers: 14, caused_turnovers: 1, saves: 0,  fo_w: 0,  fo_l: 0,  pens: 3 }, notes: 'Primary dodger. Lefty. Loves the alley from X.' },
      { jersey: 7,  name: 'Dylan Park',     pos: 'Attack',   film: { games: 5, goals: 14, assists: 18, shots: 40, shots_on_goal: 31, ground_balls: 4,  turnovers: 9,  caused_turnovers: 0, saves: 0,  fo_w: 0,  fo_l: 0,  pens: 1 }, notes: 'Feeder. Elite IQ. Slide early.' },
      { jersey: 11, name: 'Marcus Lee',     pos: 'Midfield', film: { games: 5, goals: 10, assists: 7,  shots: 35, shots_on_goal: 25, ground_balls: 18, turnovers: 5,  caused_turnovers: 6, saves: 0,  fo_w: 0,  fo_l: 0,  pens: 2 }, notes: 'Two-way mid. Dangerous from above the arch.' },
      { jersey: 17, name: 'Sam Chen',       pos: 'Midfield', film: { games: 5, goals: 4,  assists: 6,  shots: 22, shots_on_goal: 14, ground_balls: 22, turnovers: 4,  caused_turnovers: 5, saves: 0,  fo_w: 0,  fo_l: 0,  pens: 1 }, notes: 'Defensive mid. Great stick on face-off wings.' },
      { jersey: 44, name: 'Rob Anderson',   pos: 'FOGO',     film: { games: 5, goals: 1,  assists: 0,  shots: 2,  shots_on_goal: 1,  ground_balls: 31, turnovers: 3,  caused_turnovers: 2, saves: 0,  fo_w: 62, fo_l: 18, pens: 0 }, notes: '77% faceoff win rate. Prep Carlos for the clamp-to-rake.' },
      { jersey: 33, name: 'Drew Hardy',     pos: 'Defense',  film: { games: 5, goals: 0,  assists: 1,  shots: 1,  shots_on_goal: 0,  ground_balls: 16, turnovers: 2,  caused_turnovers: 11, saves: 0, fo_w: 0,  fo_l: 0,  pens: 4 }, notes: 'Shutdown LSM. Will be on Kyle.' },
      { jersey: 6,  name: 'Jack Morrison',  pos: 'Defense',  film: { games: 5, goals: 0,  assists: 0,  shots: 0,  shots_on_goal: 0,  ground_balls: 10, turnovers: 1,  caused_turnovers: 4, saves: 0,  fo_w: 0,  fo_l: 0,  pens: 2 }, notes: 'Physical close D. Draws penalties.' },
      { jersey: 1,  name: 'Tyler Grant',    pos: 'Goalie',   film: { games: 5, goals: 0,  assists: 0,  shots: 0,  shots_on_goal: 0,  ground_balls: 3,  turnovers: 2,  caused_turnovers: 0, saves: 58, fo_w: 0,  fo_l: 0,  pens: 0 }, notes: 'Struggles with low-to-low on the run. Shoot low.' },
    ],
  },
  {
    name: "St. Michael's",
    notes: 'Played 2026-03-07 (W 9-6). Disciplined defense, slow-tempo offense.',
    players: [
      { jersey: 5,  name: 'Connor Jameson', pos: 'Attack',   film: { games: 1, goals: 2, assists: 1, shots: 7, shots_on_goal: 4, ground_balls: 2, turnovers: 3, caused_turnovers: 0, saves: 0, fo_w: 0, fo_l: 0, pens: 0 }, notes: 'Their A1. Good off ball, average dodger.' },
      { jersey: 10, name: 'Jake Torres',    pos: 'Midfield', film: { games: 1, goals: 1, assists: 2, shots: 4, shots_on_goal: 2, ground_balls: 5, turnovers: 2, caused_turnovers: 1, saves: 0, fo_w: 0, fo_l: 0, pens: 0 }, notes: 'Primary initiator.' },
      { jersey: 22, name: 'Eric Summers',   pos: 'Defense',  film: { games: 1, goals: 0, assists: 0, shots: 0, shots_on_goal: 0, ground_balls: 6, turnovers: 1, caused_turnovers: 3, saves: 0, fo_w: 0, fo_l: 0, pens: 1 }, notes: 'LSM.' },
    ],
  },
  {
    name: 'Northview',
    notes: 'Played 2026-03-18 (L 7-9). Upset us at home. Fast transition team, exploited our slow slides.',
    players: [
      { jersey: 8,  name: 'Miles Kwon',     pos: 'Attack',   film: { games: 1, goals: 4, assists: 2, shots: 9, shots_on_goal: 7, ground_balls: 3, turnovers: 1, caused_turnovers: 0, saves: 0, fo_w: 0, fo_l: 0, pens: 0 }, notes: 'Hat trick + on us. Righty crease finisher.' },
      { jersey: 14, name: 'Brayden Ortiz',  pos: 'Midfield', film: { games: 1, goals: 3, assists: 1, shots: 8, shots_on_goal: 6, ground_balls: 4, turnovers: 2, caused_turnovers: 1, saves: 0, fo_w: 0, fo_l: 0, pens: 0 }, notes: 'Transition mid. Shoots on the run.' },
      { jersey: 25, name: 'Oscar Reed',     pos: 'FOGO',     film: { games: 1, goals: 0, assists: 0, shots: 0, shots_on_goal: 0, ground_balls: 9, turnovers: 1, caused_turnovers: 1, saves: 0, fo_w: 14, fo_l: 8, pens: 0 }, notes: 'Won 64% vs Carlos last time. Needs a different look.' },
    ],
  },
];

// Saved lines (reusable across games). Order within player_ids is meaningful.
// Keys reference athlete first_last_name lookup to resolve IDs at seed time.
const LINES = [
  // Attack (2 lines of 3)
  { name: 'A1 (Starters)',        group: 'attack',   players: ['Kyle_Donovan', 'Austin_Reed', 'Brody_Kim'] },
  { name: 'A2 (Reserves)',        group: 'attack',   players: ['Hunter_Price', 'Jake_Moss',   'Kyle_Donovan'] },
  // Midfield (3 lines of 3)
  { name: 'Midi A (Starters)',    group: 'midfield', players: ['Nate_Rivera',  'Derek_Sato',   'Marcus_Bell']  },
  { name: 'Midi B (Rotation)',    group: 'midfield', players: ['Jason_Park',   'Sam_Torres',   'Tyler_Nguyen'] },
  { name: 'Midi C (Defensive)',   group: 'midfield', players: ['Tyler_Nguyen', 'Liam_Foster',  'Marcus_Bell']  },
  // Defense (2 lines of 3)
  { name: 'D1 (Starters)',        group: 'defense',  players: ['Cole_Harrington', 'Ryan_Stokes', 'Jake_Dunn']  },
  { name: 'D2 (Reserves)',        group: 'defense',  players: ['Brandon_Mills',   'Liam_Foster', 'Owen_Clarke'] },
];

// Line rotations. References line names to resolve IDs post-insert.
const ROTATIONS = [
  { name: 'Midi A/B/C',    group: 'midfield', lines: ['Midi A (Starters)', 'Midi B (Rotation)', 'Midi C (Defensive)'] },
  { name: 'Attack 1/2',    group: 'attack',   lines: ['A1 (Starters)', 'A2 (Reserves)'] },
];

// Completed games. Each entry drives both the game row and the event script.
const GAMES_TEMPLATE = [
  { opponent: "St. Michael's",   opposing_ref: "St. Michael's", date: '2026-03-07', location: 'Home', score_home: 9,  score_away: 6  },
  { opponent: 'Riverside HS',    opposing_ref: null,            date: '2026-03-12', location: 'Away', score_home: 11, score_away: 5  },
  { opponent: 'Northview',       opposing_ref: 'Northview',     date: '2026-03-18', location: 'Home', score_home: 7,  score_away: 9  },
  { opponent: 'Cardinal Prep',   opposing_ref: null,            date: '2026-03-22', location: 'Away', score_home: 13, score_away: 8  },
  { opponent: 'Eastwood',        opposing_ref: null,            date: '2026-03-28', location: 'Home', score_home: 8,  score_away: 7  },
  { opponent: 'Lincoln Academy', opposing_ref: null,            date: '2026-04-03', location: 'Away', score_home: 5,  score_away: 10 },
  { opponent: "St. Mary's",      opposing_ref: null,            date: '2026-04-08', location: 'Home', score_home: 10, score_away: 6  },
  { opponent: 'Westfield (Tournament)', opposing_ref: null,     date: '2026-04-11', location: 'Neutral — Maplewood Sports Complex', score_home: 12, score_away: 9 },
];

// In-progress game: halfway through, some events already logged.
// Demonstrates Phase 3 offline-first "resume active game" flow.
const ACTIVE_GAME = {
  opponent: 'Central Regional',
  opposing_ref: null,
  date: '2026-04-18',
  start_time: '16:00:00',
  location: 'Away — Central Regional Athletics',
  score_home: 4,
  score_away: 3,
  notes: 'Quarterfinal playoff game. Currently in progress (P2, ~4:20 remaining).',
};

// Upcoming scheduled game. Links to Greenfield scouting roster and gets
// situation assignments populated so the coach can tap "Load Scouting" /
// "Apply Situations" on the game's setup screen.
const SCHEDULED_GAME = {
  opponent: 'Greenfield Academy',
  opposing_ref: 'Greenfield Academy',
  date: '2026-04-22',
  start_time: '18:30:00',
  location: 'Home — Lakewood Athletic Complex',
  notes: 'Semifinal. Greenfield is 9-2 on the season. Their #22 Walsh has 24 goals on film. Expect heavy EMO pressure.',
};

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
    date: '2026-04-16',
    focus_tags: ['emo', 'man_down', 'settled'],
    notes: 'Greenfield prep day 1. Walked through EMO sets against their zone look.',
    drill_blocks: [
      { name: 'Warm-Up / Stick Work', duration_minutes: 15, description: 'Dynamic warm-up, partner passing.' },
      { name: 'Greenfield Film Review', duration_minutes: 20, description: 'Watched 6 clips of #22 (Walsh) dodging. He always goes to his left.' },
      { name: 'EMO Reps (6v5)', duration_minutes: 30, description: 'Walk-through then live reps of Wheel and Overload Right.' },
      { name: 'Man-Down Positioning', duration_minutes: 25, description: 'Zone alignment vs their EMO Overload.' },
    ],
  },
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

async function wipe() {
  // Deleting the coach cascades through teams → athletes, games, lines,
  // line_rotations, opposing_teams, practice_sessions, plays, etc.
  const res = await q('DELETE FROM coaches WHERE email = $1 RETURNING id', [COACH.email]);
  if (res.rows.length > 0) {
    console.log(`Wiped existing coach ${COACH.email} and all related data.`);
  } else {
    console.log('No existing demo data. Starting fresh.');
  }
}

async function seedCoach() {
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
  const res = await q(
    `INSERT INTO teams (coach_id, team_name, season, sport_type, game_format, primary_color)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [coachId, TEAM.team_name, TEAM.season, TEAM.sport_type, TEAM.game_format, TEAM.primary_color]
  );
  console.log(`Created team: ${TEAM.team_name}`);
  return res.rows[0].id;
}

async function seedSeason(teamId) {
  const res = await q(
    `INSERT INTO seasons (team_id, name, start_date, end_date)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [teamId, SEASON.name, SEASON.start_date, SEASON.end_date]
  );
  console.log(`Created season: ${SEASON.name} (${SEASON.start_date} → ${SEASON.end_date})`);
  return res.rows[0].id;
}

async function seedAthletes(teamId) {
  const ids = {};
  for (const a of ATHLETES) {
    const res = await q(
      `INSERT INTO athletes
         (team_id, first_name, last_name, jersey_number, graduation_year,
          primary_position, secondary_position,
          shot_hand, is_captain, depth_tier,
          skill_ground_balls, skill_dodging, skill_shooting, skill_passing,
          skill_defense, skill_faceoff, skill_transition, skill_field_awareness,
          notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        teamId, a.first_name, a.last_name, a.jersey, a.grad,
        a.pos, a.sec,
        a.hand, a.cap, a.tier,
        a.gb, a.dg, a.sh, a.pa, a.df, a.fo, a.tr, a.fa,
        a.notes,
      ]
    );
    ids[`${a.first_name}_${a.last_name}`] = res.rows[0].id;
  }
  console.log(`Created ${ATHLETES.length} athletes`);
  return ids;
}

async function seedOpposingTeams(teamId) {
  const byName = {};
  for (const ot of OPPOSING_TEAMS) {
    const teamRes = await q(
      `INSERT INTO opposing_teams (team_id, name, notes) VALUES ($1, $2, $3) RETURNING id`,
      [teamId, ot.name, ot.notes]
    );
    const otId = teamRes.rows[0].id;
    byName[ot.name] = { id: otId, playerIds: [] };

    for (const p of ot.players) {
      const playerRes = await q(
        `INSERT INTO opposing_players (opposing_team_id, jersey_number, display_name, primary_position, notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [otId, p.jersey, p.name, p.pos, p.notes || null]
      );
      const opId = playerRes.rows[0].id;
      byName[ot.name].playerIds.push(opId);

      await q(
        `INSERT INTO opposing_player_film_stats
           (opposing_player_id, games_observed, goals, assists, shots, shots_on_goal,
            ground_balls, turnovers, caused_turnovers, saves,
            faceoff_wins, faceoff_losses, penalties)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          opId, p.film.games, p.film.goals, p.film.assists, p.film.shots, p.film.shots_on_goal,
          p.film.ground_balls, p.film.turnovers, p.film.caused_turnovers, p.film.saves,
          p.film.fo_w, p.film.fo_l, p.film.pens,
        ]
      );
    }
    console.log(`  ${ot.name}: ${ot.players.length} scouted players with film stats`);
  }
  console.log(`Created ${OPPOSING_TEAMS.length} opposing teams`);
  return byName;
}

async function seedLines(teamId, athleteIds) {
  const byName = {};
  for (const ln of LINES) {
    const playerIds = ln.players.map(k => {
      const id = athleteIds[k];
      if (!id) throw new Error(`Line "${ln.name}" references unknown athlete key: ${k}`);
      return id;
    });
    const res = await q(
      `INSERT INTO lines (team_id, name, position_group, player_ids)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [teamId, ln.name, ln.group, playerIds]
    );
    byName[ln.name] = res.rows[0].id;
  }
  console.log(`Created ${LINES.length} lines`);
  return byName;
}

async function seedRotations(teamId, lineIds) {
  for (const rot of ROTATIONS) {
    const rotLineIds = rot.lines.map(n => {
      const id = lineIds[n];
      if (!id) throw new Error(`Rotation "${rot.name}" references unknown line: ${n}`);
      return id;
    });
    await q(
      `INSERT INTO line_rotations (team_id, name, position_group, line_ids)
       VALUES ($1, $2, $3, $4)`,
      [teamId, rot.name, rot.group, rotLineIds]
    );
  }
  console.log(`Created ${ROTATIONS.length} line rotations`);
}

// Build realistic game events for one completed game.
function buildGameScript(athleteIds, gameIndex) {
  const {
    Kyle_Donovan: kyle, Austin_Reed: austin, Brody_Kim: brody,
    Nate_Rivera: nate, Derek_Sato: derek, Marcus_Bell: marcus,
    Hunter_Price: hunter, Sam_Torres: sam,
    Cole_Harrington: cole, Ryan_Stokes: ryan, Jake_Dunn: jake_d,
    Liam_Foster: liam, Jason_Park: jason,
    Tyler_Brooks: tyler_g,
    Carlos_Rodriguez: carlos,
  } = athleteIds;

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
  let clockBucket = 600;

  goals.forEach((g, i) => {
    const period = Math.min(4, Math.floor(i / 3) + 1);
    const clockSeconds = Math.max(30, clockBucket - randomBetween(60, 180));
    clockBucket = clockSeconds;

    events.push({ athlete_id: g.a, event_type: 'goal',         period, clock: clockSeconds, assist_id: null });
    if (g.assist) {
      events.push({ athlete_id: g.assist, event_type: 'assist', period, clock: clockSeconds, assist_id: null });
    }
    events.push({ athlete_id: g.a, event_type: 'shot_on_goal', period, clock: clockSeconds + 2, assist_id: null });
  });

  const shooters = [kyle, austin, brody, derek, nate];
  for (let i = 0; i < 6; i++) {
    events.push({ athlete_id: shooters[i % shooters.length], event_type: 'shot', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
  }

  const gbPlayers = [jason, cole, ryan, jake_d, nate, marcus];
  gbPlayers.forEach((p, i) => {
    const count = i === 0 ? 4 : randomBetween(1, 3);
    for (let j = 0; j < count; j++) {
      events.push({ athlete_id: p, event_type: 'ground_ball', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
    }
  });

  [kyle, austin, marcus, derek].forEach((p) => {
    events.push({ athlete_id: p, event_type: 'turnover', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
  });

  [cole, jake_d, liam].forEach((p) => {
    events.push({ athlete_id: p, event_type: 'caused_turnover', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
  });

  const saveCount = randomBetween(8, 14);
  for (let i = 0; i < saveCount; i++) {
    events.push({ athlete_id: tyler_g, event_type: 'save', period: randomBetween(1,4), clock: randomBetween(30, 700), assist_id: null });
  }

  for (let period = 1; period <= 4; period++) {
    const wins  = randomBetween(2, 4);
    const losses = randomBetween(0, 2);
    for (let w = 0; w < wins; w++)   events.push({ athlete_id: carlos, event_type: 'faceoff_win',  period, clock: randomBetween(600, 720), assist_id: null });
    for (let l = 0; l < losses; l++) events.push({ athlete_id: carlos, event_type: 'faceoff_loss', period, clock: randomBetween(600, 720), assist_id: null });
  }

  return events;
}

function buildPlaytimeLog(athleteIds, periodsPlayed = 4) {
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

  for (let period = 1; period <= periodsPlayed; period++) {
    starters.forEach((id) => {
      log.push({ athlete_id: id, period, minutes_played: parseFloat(randomBetween(10, 12).toFixed(2)) });
    });
    subs.forEach((id) => {
      log.push({ athlete_id: id, period, minutes_played: parseFloat(randomBetween(4, 8).toFixed(2)) });
    });
    deepSubs.forEach((id) => {
      if (randomBetween(1, 3) > 1) {
        log.push({ athlete_id: id, period, minutes_played: parseFloat(randomBetween(1, 4).toFixed(2)) });
      }
    });
  }

  return log;
}

async function insertGameEvents(gameId, events) {
  for (const ev of events) {
    await q(
      `INSERT INTO game_events (game_id, athlete_id, event_type, period, game_clock_seconds, assist_athlete_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [gameId, ev.athlete_id, ev.event_type, ev.period, ev.clock, ev.assist_id]
    );
  }
}

async function insertPlaytime(gameId, log) {
  for (const pt of log) {
    await q(
      `INSERT INTO playtime_log (game_id, athlete_id, period, minutes_played)
       VALUES ($1,$2,$3,$4)`,
      [gameId, pt.athlete_id, pt.period, pt.minutes_played]
    );
  }
}

async function seedCompletedGames(teamId, seasonId, athleteIds, opposingTeams) {
  const gameIds = [];
  for (let i = 0; i < GAMES_TEMPLATE.length; i++) {
    const g = GAMES_TEMPLATE[i];
    const opposingTeamId = g.opposing_ref ? opposingTeams[g.opposing_ref]?.id : null;

    const res = await q(
      `INSERT INTO games
         (team_id, opponent, game_date, location, format, periods, period_length_minutes,
          score_home, score_away, status, notes, season_id, opposing_team_id)
       VALUES ($1,$2,$3,$4,'standard',4,12,$5,$6,'completed',$7,$8,$9)
       RETURNING id`,
      [teamId, g.opponent, g.date, g.location, g.score_home, g.score_away,
       `Final: ${g.score_home}-${g.score_away} vs ${g.opponent}`,
       seasonId, opposingTeamId]
    );
    const gameId = res.rows[0].id;
    gameIds.push(gameId);

    const events = buildGameScript(athleteIds, i);
    await insertGameEvents(gameId, events);
    const ptLog = buildPlaytimeLog(athleteIds, 4);
    await insertPlaytime(gameId, ptLog);

    console.log(`  Completed ${i + 1}/${GAMES_TEMPLATE.length}: ${g.opponent} (${g.score_home}-${g.score_away}) — ${events.length} events, ${ptLog.length} playtime entries`);
  }
  return gameIds;
}

async function seedActiveGame(teamId, seasonId, athleteIds) {
  const g = ACTIVE_GAME;
  const res = await q(
    `INSERT INTO games
       (team_id, opponent, game_date, start_time, location, format, periods, period_length_minutes,
        score_home, score_away, status, notes, season_id)
     VALUES ($1,$2,$3,$4,$5,'standard',4,12,$6,$7,'active',$8,$9)
     RETURNING id`,
    [teamId, g.opponent, g.date, g.start_time, g.location, g.score_home, g.score_away, g.notes, seasonId]
  );
  const gameId = res.rows[0].id;

  // Partial game: P1 full + P2 midway. Generate ~1.5 periods worth of events.
  const {
    Kyle_Donovan: kyle, Austin_Reed: austin, Brody_Kim: brody,
    Nate_Rivera: nate, Derek_Sato: derek,
    Cole_Harrington: cole, Jake_Dunn: jake_d,
    Jason_Park: jason,
    Tyler_Brooks: tyler_g,
    Carlos_Rodriguez: carlos,
  } = athleteIds;

  // Home (us) goals so far: 4. Away: 3.
  const events = [
    { athlete_id: kyle,  event_type: 'goal',         period: 1, clock: 540, assist_id: austin },
    { athlete_id: austin,event_type: 'assist',       period: 1, clock: 540, assist_id: null  },
    { athlete_id: kyle,  event_type: 'shot_on_goal', period: 1, clock: 542, assist_id: null  },
    { athlete_id: brody, event_type: 'goal',         period: 1, clock: 280, assist_id: nate  },
    { athlete_id: nate,  event_type: 'assist',       period: 1, clock: 280, assist_id: null  },
    { athlete_id: brody, event_type: 'shot_on_goal', period: 1, clock: 282, assist_id: null  },
    { athlete_id: derek, event_type: 'goal',         period: 2, clock: 610, assist_id: null  },
    { athlete_id: derek, event_type: 'shot_on_goal', period: 2, clock: 612, assist_id: null  },
    { athlete_id: austin,event_type: 'goal',         period: 2, clock: 320, assist_id: kyle  },
    { athlete_id: kyle,  event_type: 'assist',       period: 2, clock: 320, assist_id: null  },
    { athlete_id: austin,event_type: 'shot_on_goal', period: 2, clock: 322, assist_id: null  },
    // Misses and other stats
    { athlete_id: kyle,  event_type: 'shot',         period: 1, clock: 420, assist_id: null  },
    { athlete_id: derek, event_type: 'shot',         period: 2, clock: 500, assist_id: null  },
    { athlete_id: jason, event_type: 'ground_ball',  period: 1, clock: 560, assist_id: null  },
    { athlete_id: jason, event_type: 'ground_ball',  period: 2, clock: 450, assist_id: null  },
    { athlete_id: cole,  event_type: 'caused_turnover', period: 1, clock: 380, assist_id: null },
    { athlete_id: jake_d,event_type: 'caused_turnover', period: 2, clock: 510, assist_id: null },
    { athlete_id: tyler_g, event_type: 'save',       period: 1, clock: 480, assist_id: null  },
    { athlete_id: tyler_g, event_type: 'save',       period: 1, clock: 210, assist_id: null  },
    { athlete_id: tyler_g, event_type: 'save',       period: 2, clock: 580, assist_id: null  },
    { athlete_id: tyler_g, event_type: 'save',       period: 2, clock: 340, assist_id: null  },
    { athlete_id: carlos, event_type: 'faceoff_win', period: 1, clock: 720, assist_id: null  },
    { athlete_id: carlos, event_type: 'faceoff_win', period: 1, clock: 540, assist_id: null  },
    { athlete_id: carlos, event_type: 'faceoff_loss',period: 1, clock: 280, assist_id: null  },
    { athlete_id: carlos, event_type: 'faceoff_win', period: 2, clock: 720, assist_id: null  },
    { athlete_id: carlos, event_type: 'faceoff_win', period: 2, clock: 620, assist_id: null  },
  ];
  await insertGameEvents(gameId, events);

  // Playtime for 2 periods played so far
  const ptLog = buildPlaytimeLog(athleteIds, 2);
  await insertPlaytime(gameId, ptLog);

  console.log(`  Active: ${g.opponent} (${g.score_home}-${g.score_away}, in P2) — ${events.length} events logged`);
  return gameId;
}

async function seedScheduledGame(teamId, seasonId, opposingTeams, athleteIds) {
  const g = SCHEDULED_GAME;
  const opposingTeamId = g.opposing_ref ? opposingTeams[g.opposing_ref]?.id : null;

  const res = await q(
    `INSERT INTO games
       (team_id, opponent, game_date, start_time, location, format, periods, period_length_minutes,
        status, notes, season_id, opposing_team_id)
     VALUES ($1,$2,$3,$4,$5,'standard',4,12,'scheduled',$6,$7,$8)
     RETURNING id`,
    [teamId, g.opponent, g.date, g.start_time, g.location, g.notes, seasonId, opposingTeamId]
  );
  const gameId = res.rows[0].id;

  // Situation assignments so the coach can see them pre-populated pre-game.
  // man_up: 6 attackers (3 attack + 3 offensive mids)
  // man_down: 5 defenders (3 D + 2 defensive mids) + goalie implied
  // faceoff: FOGO + 2 wing mids
  // clear: 3 D + 2 transition mids + goalie
  // settled: starting offense 6
  // transition: mids who run the break
  const assignments = [
    { type: 'man_up', players: [
      athleteIds.Kyle_Donovan, athleteIds.Austin_Reed, athleteIds.Brody_Kim,
      athleteIds.Nate_Rivera, athleteIds.Derek_Sato, athleteIds.Marcus_Bell,
    ]},
    { type: 'man_down', players: [
      athleteIds.Cole_Harrington, athleteIds.Ryan_Stokes, athleteIds.Jake_Dunn,
      athleteIds.Tyler_Nguyen, athleteIds.Liam_Foster,
    ]},
    { type: 'faceoff', players: [
      athleteIds.Carlos_Rodriguez, athleteIds.Jason_Park, athleteIds.Nate_Rivera,
    ]},
    { type: 'clear', players: [
      athleteIds.Cole_Harrington, athleteIds.Ryan_Stokes, athleteIds.Jake_Dunn,
      athleteIds.Liam_Foster, athleteIds.Marcus_Bell,
    ]},
    { type: 'settled', players: [
      athleteIds.Kyle_Donovan, athleteIds.Austin_Reed, athleteIds.Brody_Kim,
      athleteIds.Nate_Rivera, athleteIds.Derek_Sato, athleteIds.Marcus_Bell,
    ]},
    { type: 'transition', players: [
      athleteIds.Nate_Rivera, athleteIds.Marcus_Bell, athleteIds.Derek_Sato,
      athleteIds.Liam_Foster,
    ]},
  ];
  for (const a of assignments) {
    await q(
      `INSERT INTO game_situation_assignments (game_id, situation_type, player_ids)
       VALUES ($1, $2, $3)`,
      [gameId, a.type, a.players]
    );
  }

  console.log(`  Scheduled: ${g.opponent} (${g.date} ${g.start_time}) with ${assignments.length} situation assignments`);
  return gameId;
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
    console.log('Wiping existing demo data...');
    await wipe();

    const coachId = await seedCoach();
    const teamId  = await seedTeam(coachId);
    const seasonId = await seedSeason(teamId);

    console.log('\nSeeding athletes...');
    const athleteIds = await seedAthletes(teamId);

    console.log('\nSeeding opposing teams + film stats...');
    const opposingTeams = await seedOpposingTeams(teamId);

    console.log('\nSeeding lines + rotations...');
    const lineIds = await seedLines(teamId, athleteIds);
    await seedRotations(teamId, lineIds);

    console.log('\nSeeding completed games...');
    await seedCompletedGames(teamId, seasonId, athleteIds, opposingTeams);

    console.log('\nSeeding active (in-progress) game...');
    await seedActiveGame(teamId, seasonId, athleteIds);

    console.log('\nSeeding scheduled game + situation assignments...');
    await seedScheduledGame(teamId, seasonId, opposingTeams, athleteIds);

    console.log('\nSeeding plays...');
    await seedPlays(teamId);

    console.log('\nSeeding practice sessions...');
    await seedPractice(teamId);

    console.log('\n=== Seed complete ===');
    console.log(`\n  Login:       ${COACH.email}`);
    console.log(`  Password:    ${COACH.password}`);
    console.log(`  Team:        ${TEAM.team_name} (${TEAM.season})`);
    console.log(`  Season:      ${SEASON.name}`);
    console.log(`  Roster:      ${ATHLETES.length} athletes`);
    console.log(`  Opposing:    ${OPPOSING_TEAMS.length} scouted teams`);
    console.log(`  Lines:       ${LINES.length} saved`);
    console.log(`  Rotations:   ${ROTATIONS.length} saved`);
    console.log(`  Games:       ${GAMES_TEMPLATE.length} completed + 1 active + 1 scheduled`);
    console.log(`  Plays:       ${PLAYS.length}`);
    console.log(`  Practices:   ${PRACTICE_SESSIONS.length}\n`);
  } catch (err) {
    console.error('\nSeed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
