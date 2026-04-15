import React, { useState } from 'react';

const SECTIONS = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    content: [
      {
        heading: 'Logging In',
        body: `Navigate to the app URL and enter your coach email and password. Your session persists across browser refreshes. To log out, tap your initials avatar in the top-right corner of the nav bar and select Log Out.`,
      },
      {
        heading: 'Navigation',
        body: `The tab bar runs across the top of every screen. Tabs from left to right: Dashboard (season overview), Roster (player management), Game (live game mode), Plays (playbook), Practice (drill planner), Settings (team and account), Help (this guide).`,
      },
      {
        heading: 'First-Time Setup',
        body: `After logging in, go to Settings to set your team name, season, primary color, and upload a logo. Then go to Roster and add your players before your first game. Skill ratings are optional but significantly improve AI substitution recommendations.`,
      },
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    content: [
      {
        heading: 'Season Overview',
        body: `The Dashboard shows your win/loss record, goals for and against, and a per-game trend chart. Use it as a daily check-in or post-game debrief tool.`,
      },
      {
        heading: 'Top Performers',
        body: `The stat leaderboard shows season leaders for goals, assists, ground balls, and saves. Click any player's name to open their full athlete profile.`,
      },
      {
        heading: 'Playtime Equity',
        body: `The playtime panel flags players who are below their target minutes for the season. Color coding: green = on target, yellow = slightly under, red = significantly under. Use this before games to plan who needs more time.`,
      },
    ],
  },
  {
    id: 'roster',
    label: 'Roster',
    content: [
      {
        heading: 'Adding Players',
        body: `Tap + Add Player and fill in the form. Jersey number, name, and primary position are required. Graduation year, secondary position, and skill ratings are optional but recommended.`,
      },
      {
        heading: 'Skill Ratings (1–10)',
        body: `Eight skills are rated on a 1–10 scale: Ground Balls, Dodging, Shooting, Passing, Defense, Faceoff, Transition, and Field Awareness. These ratings are coach-only input and are used directly by Line Coach for substitution recommendations. Rate players as honestly as possible.`,
      },
      {
        heading: 'Player Status',
        body: `Each player has a status: Active, Injured, or Inactive. Injured and Inactive players are automatically excluded from live game lineup slots. Update status from the athlete profile edit screen.`,
      },
      {
        heading: 'Athlete Profile',
        body: `Tap any player card to open their full profile: skill ratings, season stats (goals, assists, GBs, saves, faceoff %, total minutes), coach notes, and game-by-game playtime history.`,
      },
    ],
  },
  {
    id: 'game',
    label: 'Live Game Mode',
    content: [
      {
        heading: 'Starting a Game',
        body: `Go to the Game tab. Tap a scheduled game to open it, or tap New Game to create one on the spot. Enter opponent, location, and format (Standard 4×12 or 6s). Tap Start Game.`,
      },
      {
        heading: 'Scoreboard and Clock',
        body: `Tap the + buttons next to each score to increment. Tap Start/Stop to run or pause the game clock. The period advances automatically when the clock hits zero, or you can advance it manually.`,
      },
      {
        heading: 'Recording Events',
        body: `Tap a player's jersey number to select them, then tap an event type from the action bar: Goal (prompts for assist), Shot, Shot on Goal, Ground Ball, Turnover, Caused Turnover, Save, Penalty, Faceoff Win, Faceoff Loss. Events are time-stamped automatically.`,
      },
      {
        heading: 'Substitutions',
        body: `Tap the player on the field you want to remove → Sub Out. Tap the bench player who replaces them → Sub In. The playtime tracker updates immediately. Line Coach reads the updated lineup before each recommendation.`,
      },
      {
        heading: 'Playtime Equity',
        body: `A colored indicator under each bench player shows their playtime status relative to their target minutes. Line Coach actively monitors this and will flag players who are significantly under their target. Target minutes are calculated from roster size and game length.`,
      },
      {
        heading: 'Ending the Game',
        body: `At the end of the final period, tap End Game and confirm the final score. The game status changes to completed and all stats are locked into the season record.`,
      },
      {
        heading: 'Multi-Coach Sync',
        body: `Up to 3 devices can connect to the same live game. The head coach's device shows a 6-character join code. Assistant coaches tap Join Session and enter the code. All events, substitutions, and score changes sync in real time. Requires stable WiFi on all devices.`,
      },
    ],
  },
  {
    id: 'ai-coach',
    label: 'Line Coach (AI)',
    content: [
      {
        heading: 'What Is Line Coach?',
        body: `Line Coach is the AI assistant built into Live Game Mode. It reads live game state — score, period, clock, active lineup, playtime data, and recent events — before every response. It gives you actionable sideline recommendations without requiring you to describe what's happening.`,
      },
      {
        heading: 'What It Can Do',
        body: `Recommend specific substitutions with reasoning. Suggest lineup adjustments for EMO, man-down, or defensive situations. Flag urgent playtime equity issues. Answer tactical questions ("Who should cover their #22?", "We're down 3 in the fourth — what do you recommend?"). Answer questions about how to use the app.`,
      },
      {
        heading: 'What It Cannot Do',
        body: `Line Coach cannot see the actual field. It only knows what you record. It cannot access opponent scouting data beyond what you enter in game notes. It never overrides your decisions — every recommendation ends with "Coach's call."`,
      },
      {
        heading: 'How to Get Better Recommendations',
        body: `Record events consistently — especially subs, goals, and ground balls. Fill in skill ratings for your players. The more data you enter, the more accurate the recommendations. An incomplete lineup or missing sub data will degrade recommendation quality.`,
      },
      {
        heading: 'Example Prompts',
        body: `"Who needs the most minutes right now?" — "We just went down 2 goals. Any lineup changes?" — "Should I rest my FOGO for the faceoff in the fourth?" — "Give me a man-down lineup recommendation." — "How do I record a penalty?"`,
      },
    ],
  },
  {
    id: 'plays',
    label: 'Plays',
    content: [
      {
        heading: 'Browsing the Library',
        body: `Plays are filtered by situation tag: All, EMO, Man-Down, Settled, Transition, Faceoff, Clear, 6s Set, 6s Fast Break. Tap the filter buttons at the top to narrow the view. Tap any play card to see the full diagram and notes.`,
      },
      {
        heading: 'Creating a Play',
        body: `Tap + New Play. Enter a title and select a situation tag. In the diagram editor, use the position buttons (A1, A2, A3, M1, M2, M3, D1, D2, D3, G, FOGO) to add players to the canvas. Drag players to their starting positions. Add notes to describe execution. Tap Save Play.`,
      },
      {
        heading: 'Diagram Formats',
        body: `Half field is the default and works for settled offense, EMO, man-down, and clears. Full field is used for faceoff sets and full-field transition schemes. Switch formats using the toolbar in the editor.`,
      },
      {
        heading: 'Duplicating and Editing',
        body: `Tap Duplicate on any play card to create a copy (useful for play variations or mirror versions). Tap Edit to modify an existing play's diagram, title, tag, or notes. Deletions are permanent.`,
      },
    ],
  },
  {
    id: 'practice',
    label: 'Practice',
    content: [
      {
        heading: 'Creating a Session',
        body: `Tap + New Practice. Select the date. Add drill blocks — each block has a name, duration in minutes, and a description. Add focus tags to categorize the session (ground_balls, transition, emo, shooting, etc.). Add overall session notes. Tap Save.`,
      },
      {
        heading: 'Focus Tags',
        body: `Tags let you track which skills have received practice time over the season. Available tags: ground_balls, transition, emo, man_down, shooting, dodging, settled, faceoff, clearing, riding, conditioning. Use multiple tags per session as needed.`,
      },
      {
        heading: 'Reviewing Past Sessions',
        body: `Tap any past session in the calendar to view its full drill blocks and notes. Use this for player development conversations, parent updates, or pre-tournament preparation reviews.`,
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    content: [
      {
        heading: 'Team Profile',
        body: `Set your team name, season label, default game format, and primary color (hex). Your team name appears in the nav bar. The primary color is used as an accent throughout the app.`,
      },
      {
        heading: 'Team Logo',
        body: `Upload a PNG or JPG to replace the default lacrosse head icon in the nav bar. Recommended size: 200×200px or larger, square crop. The logo is stored on the server and displayed across all sessions.`,
      },
      {
        heading: 'Account',
        body: `Update your display name, email, or password from the Account section of Settings.`,
      },
      {
        heading: 'Subscription Tiers',
        body: `Free: 1 team, no AI. Coach ($12/mo): 1 team, full Line Coach AI. Club ($49/mo): up to 6 teams. Organization ($149/mo): unlimited teams. Contact support to change your plan.`,
      },
    ],
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    content: [
      {
        heading: 'Line Coach Is Not Responding',
        body: `Verify that your ANTHROPIC_API_KEY is set in the Render environment variables. Confirm the game session status is active. If the issue persists, end and restart the game session.`,
      },
      {
        heading: 'Player Missing from Lineup',
        body: `Open the player's Roster profile. If their status is Injured or Inactive, they will not appear in game lineup slots. Change their status to Active to include them.`,
      },
      {
        heading: 'Multi-Coach Sync Lagging',
        body: `Socket.io requires a stable network connection on all devices. Switch to a known-good WiFi network. The join code expires when the game session ends — reconnect with a new code if needed.`,
      },
      {
        heading: 'Blank Screen After Login',
        body: `Clear your browser cache and reload the page. If the issue continues, log out and back in to refresh the authentication token.`,
      },
      {
        heading: 'Score Correction After Game',
        body: `Completed games are locked. To correct a score, use the Render database shell or contact support to update the record directly.`,
      },
    ],
  },
];

// ────────────────────────────────────────────────────────────
// Styles (inline to keep the component self-contained)
// ────────────────────────────────────────────────────────────

const S = {
  page: {
    display: 'flex',
    minHeight: 'calc(100vh - 56px)',
    backgroundColor: '#0A1018',
    color: '#E5E7EB',
    fontFamily: "'Helvetica Neue', system-ui, sans-serif",
  },
  sidebar: {
    width: 200,
    flexShrink: 0,
    borderRight: '1px solid #1F2937',
    padding: '24px 0',
    position: 'sticky',
    top: 56,
    height: 'calc(100vh - 56px)',
    overflowY: 'auto',
  },
  sidebarLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: '#6B7280',
    padding: '0 16px 8px',
  },
  navBtn: (active) => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? '#C9A227' : '#9CA3AF',
    backgroundColor: active ? 'rgba(201,162,39,0.08)' : 'transparent',
    border: 'none',
    borderLeft: active ? '3px solid #C9A227' : '3px solid transparent',
    cursor: 'pointer',
    lineHeight: 1.4,
  }),
  main: {
    flex: 1,
    padding: '32px 40px',
    maxWidth: 760,
    overflowY: 'auto',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#F9FAFB',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 32,
  },
  section: {
    marginBottom: 36,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: 700,
    color: '#F3F4F6',
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#C9A227',
    flexShrink: 0,
  },
  body: {
    fontSize: 13,
    lineHeight: 1.7,
    color: '#9CA3AF',
    marginLeft: 14,
  },
  divider: {
    border: 'none',
    borderTop: '1px solid #1F2937',
    margin: '28px 0',
  },
  badge: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    backgroundColor: 'rgba(201,162,39,0.15)',
    color: '#C9A227',
    padding: '2px 7px',
    borderRadius: 4,
    marginBottom: 16,
  },
  searchBox: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 13,
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: 8,
    color: '#F3F4F6',
    outline: 'none',
    marginBottom: 32,
    boxSizing: 'border-box',
  },
};

// ────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [activeId, setActiveId] = useState('getting-started');
  const [search, setSearch] = useState('');

  const activeSection = SECTIONS.find((s) => s.id === activeId);

  // If searching, show results across all sections
  const searchResults = search.trim()
    ? SECTIONS.flatMap((section) =>
        section.content
          .filter(
            (item) =>
              item.heading.toLowerCase().includes(search.toLowerCase()) ||
              item.body.toLowerCase().includes(search.toLowerCase())
          )
          .map((item) => ({ ...item, sectionLabel: section.label }))
      )
    : null;

  return (
    <div style={S.page}>
      {/* Sidebar */}
      <aside style={S.sidebar}>
        <div style={S.sidebarLabel}>Help Topics</div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            style={S.navBtn(activeId === s.id && !search)}
            onClick={() => { setActiveId(s.id); setSearch(''); }}
          >
            {s.label}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <main style={S.main}>
        <div style={S.pageTitle}>CoachIQ Help</div>
        <div style={S.pageSubtitle}>Feature documentation and how-to guides</div>

        {/* Search */}
        <input
          style={S.searchBox}
          type="text"
          placeholder="Search help topics…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Search results */}
        {searchResults && (
          <>
            <div style={{ ...S.pageSubtitle, marginBottom: 24 }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{search}"
            </div>
            {searchResults.length === 0 && (
              <div style={{ color: '#6B7280', fontSize: 13 }}>
                No results found. Try a different keyword.
              </div>
            )}
            {searchResults.map((item, i) => (
              <div key={i} style={S.section}>
                <div style={{ ...S.badge, marginBottom: 8 }}>{item.sectionLabel}</div>
                <div style={S.sectionHeading}>
                  <span style={S.dot} />
                  {item.heading}
                </div>
                <div style={S.body}>{item.body}</div>
                {i < searchResults.length - 1 && <hr style={S.divider} />}
              </div>
            ))}
          </>
        )}

        {/* Section content */}
        {!searchResults && activeSection && (
          <>
            <div style={S.badge}>{activeSection.label}</div>
            {activeSection.content.map((item, i) => (
              <div key={i} style={S.section}>
                <div style={S.sectionHeading}>
                  <span style={S.dot} />
                  {item.heading}
                </div>
                <div style={S.body}>{item.body}</div>
                {i < activeSection.content.length - 1 && <hr style={S.divider} />}
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
