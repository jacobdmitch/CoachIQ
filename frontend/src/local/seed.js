/**
 * seed.js — first-run demo data for standalone mode.
 *
 * Populates a ready-to-use Lakewood Warriors team so the app opens to a
 * working roster, a season, lines, plays, and one completed game (so the
 * dashboard and stats render real numbers). Mutates the passed-in document
 * in place. Field names mirror the backend tables exactly.
 */

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
const ISO = () => new Date().toISOString();

// Position skill templates (1-10). Lightly differentiated so AI suggestions and
// position-fit have signal to work with.
const TEMPLATE = {
  Attack:   { sh: 8, do: 8, pa: 7, de: 3, gb: 5, fo: 1, tr: 6, fa: 7 },
  Midfield: { sh: 6, do: 7, pa: 7, de: 6, gb: 7, fo: 3, tr: 8, fa: 7 },
  Defense:  { sh: 3, do: 4, pa: 6, de: 8, gb: 7, fo: 1, tr: 6, fa: 7 },
  Goalie:   { sh: 2, do: 3, pa: 6, de: 7, gb: 5, fo: 1, tr: 4, fa: 8 },
  FOGO:     { sh: 4, do: 5, pa: 5, de: 5, gb: 8, fo: 9, tr: 7, fa: 6 },
};

// [first, last, jersey, primary, secondary, captain]
const PLAYERS = [
  ['Mason', 'Reilly', 1, 'Goalie', null, true],
  ['Cole', 'Bennett', 2, 'Defense', 'Midfield', false],
  ['Ryan', 'Castellano', 3, 'Defense', null, false],
  ['Will', 'Harrington', 4, 'Defense', 'Midfield', false],
  ['Drew', 'Pearson', 5, 'Defense', null, false],
  ['Tyler', 'Nakamura', 6, 'FOGO', 'Midfield', false],
  ['Jack', 'Donnelly', 7, 'Midfield', 'Attack', true],
  ['Aiden', 'Foster', 8, 'Midfield', 'Defense', false],
  ['Liam', 'Vasquez', 9, 'Midfield', null, false],
  ['Noah', 'Whitman', 10, 'Midfield', 'Attack', false],
  ['Ethan', 'Brooks', 11, 'Midfield', null, false],
  ['Carter', 'Quinn', 12, 'Attack', 'Midfield', false],
  ['Owen', 'Delgado', 13, 'Attack', null, true],
  ['Luke', 'Ferraro', 14, 'Attack', null, false],
  ['Gavin', 'Sutton', 15, 'Attack', 'Midfield', false],
  ['Hunter', 'Walsh', 16, 'Midfield', 'Defense', false],
  ['Blake', 'Okafor', 17, 'Defense', null, false],
  ['Sean', 'Murphy', 18, 'Attack', 'Midfield', false],
];

export function seedDatabase(doc) {
  const coachId = uid();
  const teamId = uid();
  const seasonId = uid();

  doc.coach = {
    id: coachId,
    email: 'coach@lakewoodlacrosse.com',
    firstName: 'Coach',
    lastName: 'Mitchell',
    subscriptionTier: 'coach',
  };

  doc.settings = {
    targetMinutes: 15,
    aiEnabled: true,
    shotClockSeconds: 60,
  };

  doc.teams = [
    {
      id: teamId,
      coach_id: coachId,
      team_name: 'Lakewood Warriors',
      season: '2026 Spring',
      sport_type: 'field_lacrosse',
      game_format: 'standard',
      logo_url: null,
      primary_color: '#C9A227',
      created_at: ISO(),
      updated_at: ISO(),
    },
  ];

  doc.seasons = [
    {
      id: seasonId,
      team_id: teamId,
      name: '2026 Spring',
      start_date: '2026-03-01',
      end_date: '2026-06-30',
      created_at: ISO(),
      updated_at: ISO(),
    },
  ];

  doc.athletes = PLAYERS.map(([first, last, jersey, pos, secondary, captain]) => {
    const t = TEMPLATE[pos] || TEMPLATE.Midfield;
    return {
      id: uid(),
      team_id: teamId,
      first_name: first,
      last_name: last,
      jersey_number: jersey,
      graduation_year: 2027,
      graduation_month: 6,
      primary_position: pos,
      secondary_position: secondary,
      skill_ground_balls: t.gb,
      skill_dodging: t.do,
      skill_shooting: t.sh,
      skill_passing: t.pa,
      skill_defense: t.de,
      skill_faceoff: t.fo,
      skill_transition: t.tr,
      skill_field_awareness: t.fa,
      status: 'active',
      notes: '',
      email: null,
      send_game_summary: false,
      shot_hand: 'right',
      is_captain: captain,
      depth_tier: jersey <= 13 ? 'starter' : 'rotation',
      created_at: ISO(),
      updated_at: ISO(),
    };
  });

  const byJersey = (n) => doc.athletes.find((a) => a.jersey_number === n);
  const id = (n) => byJersey(n).id;

  // ── Lines ──────────────────────────────────────────────────────────────────
  doc.lines = [
    {
      id: uid(), team_id: teamId, name: 'First Attack', position_group: 'attack',
      player_ids: [id(13), id(12), id(14)], created_at: ISO(), updated_at: ISO(),
    },
    {
      id: uid(), team_id: teamId, name: 'First Mid', position_group: 'midfield',
      player_ids: [id(7), id(9), id(10)], created_at: ISO(), updated_at: ISO(),
    },
    {
      id: uid(), team_id: teamId, name: 'Close D', position_group: 'defense',
      player_ids: [id(2), id(3), id(4)], created_at: ISO(), updated_at: ISO(),
    },
  ];

  // ── Plays ──────────────────────────────────────────────────────────────────
  doc.plays = [
    {
      id: uid(), team_id: teamId, title: 'Box Set — Mumbo', situation_tag: 'settled',
      diagram_data: { format: 'half_field', players: [], arrows: [], text_labels: [] },
      notes: 'Pick at top, slip to the crease.', created_at: ISO(), updated_at: ISO(),
    },
    {
      id: uid(), team_id: teamId, title: 'EMO — Circle', situation_tag: 'emo',
      diagram_data: { format: 'half_field', players: [], arrows: [], text_labels: [] },
      notes: 'Rotate the zone, skip to the far pipe.', created_at: ISO(), updated_at: ISO(),
    },
  ];

  // ── One completed game (so dashboard/stats are non-empty) ───────────────────
  const gameId = uid();
  doc.games = [
    {
      id: gameId, team_id: teamId, opponent: 'Northgate Hawks', game_date: '2026-06-03',
      start_time: '16:00', location: 'Home', format: 'standard', periods: 4,
      period_length_minutes: 12, shot_clock_seconds: 60, score_home: 11, score_away: 8,
      status: 'completed', notes: '', starting_lineup: null, opposing_team_id: null,
      season_id: seasonId, created_at: ISO(), updated_at: ISO(),
    },
    {
      id: uid(), team_id: teamId, opponent: 'Riverside Prep', game_date: '2026-06-13',
      start_time: '11:00', location: 'Away', format: 'standard', periods: 4,
      period_length_minutes: 12, shot_clock_seconds: 60, score_home: 0, score_away: 0,
      status: 'scheduled', notes: '', starting_lineup: null, opposing_team_id: null,
      season_id: seasonId, created_at: ISO(), updated_at: ISO(),
    },
  ];

  // Events for the completed game (home side). Lowercase event_type per schema.
  const ev = (athleteJersey, type, period) => ({
    id: uid(), game_id: gameId, athlete_id: athleteJersey ? id(athleteJersey) : null,
    event_type: type, period, game_clock_seconds: 300, assist_athlete_id: null,
    notes: '', team_side: 'home', opposing_player_id: null,
    seq_no: doc.game_events.length + 1, client_timestamp: ISO(),
    coach_id: coachId, created_at: ISO(),
  });
  const scoreLine = [
    [13, 'goal', 1], [13, 'goal', 2], [13, 'goal', 3], [14, 'goal', 1], [14, 'goal', 2],
    [12, 'goal', 2], [12, 'goal', 4], [7, 'goal', 3], [10, 'goal', 4], [9, 'goal', 1], [15, 'goal', 3],
    [7, 'assist', 1], [7, 'assist', 3], [9, 'assist', 4], [12, 'assist', 2],
    [6, 'faceoff_win', 1], [6, 'faceoff_win', 2], [6, 'faceoff_win', 3], [6, 'faceoff_loss', 4],
    [2, 'ground_ball', 1], [4, 'ground_ball', 2], [3, 'ground_ball', 3], [16, 'ground_ball', 4],
    [1, 'save', 1], [1, 'save', 1], [1, 'save', 2], [1, 'save', 3], [1, 'save', 3], [1, 'save', 4],
  ];
  doc.game_events = scoreLine.map(([j, type, p]) => ev(j, type, p));

  // Playtime log — give everyone minutes; a couple of bench players land under
  // the 15-min target so equity flags have something to show.
  const minutesByJersey = {
    1: 48, 2: 40, 3: 38, 4: 36, 5: 14, 6: 22, 7: 34, 8: 20, 9: 33, 10: 31,
    11: 12, 12: 30, 13: 35, 14: 32, 15: 18, 16: 24, 17: 10, 18: 16,
  };
  doc.playtime_log = Object.entries(minutesByJersey).map(([j, mins]) => ({
    id: uid(), game_id: gameId, athlete_id: id(Number(j)), period: 0,
    minutes_played: mins, entered_at_seconds: 0, exited_at_seconds: 0, created_at: ISO(),
  }));
}

export default seedDatabase;
