# CoachIQ — App Reference Guide

This document is the authoritative reference for how CoachIQ works. The AI Coach (Line Coach) uses it to answer questions about app features, navigation, workflows, and data interpretation.

---

## What Is CoachIQ?

CoachIQ is a tablet-native coaching assistant for field lacrosse coaches. It manages your roster, tracks live game events, recommends substitutions in real time, stores plays, and logs practice sessions — all from one app designed for the sideline.

The AI feature is called **Line Coach**. It reads live game state (score, period, playtime, recent events) and gives you actionable substitution and tactical recommendations. It does not make decisions — the coach always decides.

---

## Logging In

- Navigate to the app URL and enter your coach email and password.
- If you are using the demo account: email `demo@coachiq.app`, password `CoachIQ2026!`.
- After login you land on the Season Dashboard.
- Your session persists via a JWT token stored in a cookie. You will stay logged in across browser sessions until you explicitly log out.
- To log out: tap your initials avatar in the top-right corner of the navigation bar, then tap **Log out**.

---

## Navigation

The navigation bar runs across the top of every screen. Tabs (left to right):

| Tab | Path | Purpose |
|-----|------|---------|
| Dashboard | /dashboard | Season overview, win/loss record, top stats |
| Roster | /roster | Player list, skill ratings, athlete profiles |
| Game | /game | Live game mode — scorekeeping, subs, AI Coach |
| Plays | /plays | Playbook — view, create, and edit play diagrams |
| Practice | /practice | Practice calendar and drill planning |
| Settings | /settings | Team info, logo upload, account management |
| Help | /help | This guide — feature documentation |

Your team name is shown in the top-right area of the nav bar. Tap your initials to open the coach menu (account, logout).

---

## Dashboard

The Season Dashboard shows a high-level summary of your team's season.

**What you see:**
- Win/loss record with total goals for and against
- Season trend chart (goals per game)
- Top performers table: goals, assists, ground balls, saves
- Recent game results (last 5 games)
- Playtime equity overview — flags any player who is significantly under their target minutes

**How to use it:**
- Use it as your morning check-in before practice or as a debrief tool after a game.
- Click any athlete's name to open their individual profile.
- The playtime equity panel is color-coded: green = on target, yellow = slightly under, red = significantly under.

---

## Roster

The Roster screen lists all active players on your team.

**Athlete card shows:**
- Jersey number, name, position, graduation year
- Status badge: Active / Injured / Inactive
- Skill rating summary (composite bar)

**To open an athlete profile:** tap the player's card.

**Athlete profile contains:**
- Full skill ratings (1–10 scale): Ground Balls, Dodging, Shooting, Passing, Defense, Faceoff, Transition, Field Awareness
- Season statistics (goals, assists, ground balls, saves, faceoff win%, total minutes)
- Coach notes
- Game-by-game playtime history

**Skill ratings** are coach-only input. They are used by Line Coach to weight substitution recommendations. A rating of 1 is the weakest, 10 is elite. Rate players honestly — the AI uses these numbers directly.

**To add a player:** tap **+ Add Player** and fill in the form. Jersey number, name, and primary position are required. All skill ratings are optional but improve AI recommendations.

**To edit a player:** open their profile and tap **Edit**.

**To mark a player injured or inactive:** edit their profile and change their status. Injured/inactive players are excluded from live game lineup slots.

---

## Live Game Mode

Game Mode is the core feature of CoachIQ. You run your game from this screen.

### Starting a Game

1. Go to the **Game** tab.
2. If you have a scheduled game, tap it to open Game Mode. Or tap **New Game** to create one on the spot.
3. Fill in the opponent, location, and format (Standard 4×12 or 6s).
4. Tap **Start Game**.

### Game Screen Layout

- **Scoreboard** — top center. Tap the `+` buttons to increment score. Tap score numbers to adjust manually.
- **Clock** — below scoreboard. Tap **Start/Stop** to run the clock. Shows current period and time remaining.
- **Field** — center area shows your active lineup (positions and jersey numbers).
- **Bench** — below the field shows players currently off the field.
- **AI Coach panel** — right side (or bottom on smaller tablets). Shows Line Coach recommendations.
- **Event log** — tracks all recorded events (goals, ground balls, subs, etc.)

### Recording Events

Tap a player's jersey to select them, then tap the event type from the action bar:
- **Goal** — prompts for assist (optional)
- **Assist** — records the assisting player
- **Shot** / **Shot on Goal**
- **Ground Ball**
- **Turnover** / **Caused Turnover**
- **Save** (goalie)
- **Penalty** — prompts for duration
- **Faceoff Win** / **Faceoff Loss**

Events are recorded with the current game clock time and period automatically.

### Making Substitutions

1. Tap the player on the field you want to remove.
2. Tap **Sub Out**.
3. Tap the bench player who will replace them.
4. Tap **Sub In**.

The playtime tracker updates automatically. Line Coach will see the updated playtime and adjust its recommendations.

### Playtime Equity

CoachIQ tracks every player's minutes per period. The playtime equity indicator (colored bar under each player on the bench) shows who needs more time. Line Coach actively monitors this and will flag players who are under their target minutes.

Target minutes are calculated based on roster size and game format.

### Ending the Game

At the end of the final period, tap **End Game**. You will be prompted to confirm the final score. The game status changes to `completed` and all statistics are locked into the season record.

### Multi-Coach Sync

Up to 3 devices can connect to the same live game session simultaneously.

- The head coach's device creates the session and displays a 6-character **join code**.
- Assistant coaches tap **Join Session** and enter the code.
- All events, subs, and score changes sync in real time across all connected devices via WebSockets.
- Role assignments: head_coach, assistant, stat_tracker.

---

## Line Coach (AI)

Line Coach is the AI assistant built into Live Game Mode. It is powered by Claude (Anthropic).

### What it can do

- Recommend specific substitutions with reasoning (playtime equity, fatigue, matchup)
- Suggest lineup adjustments for EMO, man-down, or defensive situations
- Answer tactical questions ("Who should I put on their #22?")
- Flag urgent situations (player significantly under target minutes, momentum shift)
- Answer questions about how to use the app

### What it cannot do

- See the actual field — it only knows what you record
- Override your decisions — it always defers to you ("Coach's call")
- Access opponent scouting data — only what you enter as notes

### How to use it

- The AI panel is open by default on the right side during game mode.
- Type any question or tap a suggested prompt.
- Ask natural questions: "Who needs minutes?", "We're down 3 in the fourth — what should I do?", "Should I rest Kyle?"
- Line Coach reads live game state automatically before every response — you do not need to describe the score or period.

### Accuracy

Line Coach recommendations are only as good as the data you record. Record subs, events, and goals consistently. The more data you enter, the better the recommendations.

---

## Plays

The Play Library stores your team's set plays with interactive diagrams.

### Viewing plays

Plays are organized by situation tag:
- All, EMO, Man-Down, Settled, Transition, Faceoff, Clear, 6s Set, 6s Fast Break

Tap a play card to open the full diagram.

### Creating a play

1. Tap **+ New Play**.
2. Enter a title and select a situation tag.
3. In the diagram editor, use the toolbar to add players (by position: A1-A3, M1-M3, D1-D3, G, FOGO).
4. Drag players to their positions on the field.
5. (Future: draw arrows for routes.)
6. Add notes to describe the play's execution.
7. Tap **Save Play**.

### Diagram formats

- **Half field** — used for settled offense, EMO, man-down, clear
- **Full field** — used for faceoff, transition, ride

### Editing and duplicating

- Tap the **Edit** button on any play card to open the editor.
- Tap **Duplicate** to create a copy with a new name (useful for play variations).
- Tap **Delete** to remove a play permanently.

---

## Practice Planner

The Practice Calendar shows all past and upcoming practice sessions.

### Creating a practice session

1. Tap **+ New Practice**.
2. Select the date.
3. Add drill blocks: each block has a name, duration (minutes), and description.
4. Add focus tags (e.g., ground_balls, transition, emo, shooting).
5. Add overall session notes.
6. Tap **Save**.

### Focus tags

Focus tags help you track which skills you have practiced over the season. The dashboard can show you which areas have received the least practice time — useful for pre-tournament preparation.

Available tags: `ground_balls`, `transition`, `emo`, `man_down`, `shooting`, `dodging`, `settled`, `faceoff`, `clearing`, `riding`, `conditioning`.

### Reviewing past sessions

Tap any past session in the calendar to view its drill blocks, focus tags, and notes. Use this to prep for parent questions, player development conversations, or seasonal reviews.

---

## Settings

The Settings screen manages your team profile and account.

### Team settings

- **Team name** — displayed in the nav bar and on all exports
- **Season** — the current season label (e.g., "Spring 2026")
- **Game format** — Standard or 6s (sets the default for new games)
- **Primary color** — hex color used for accent styling throughout the app
- **Team logo** — upload a PNG or JPG. Replaces the default lacrosse head icon in the nav bar.

### Account

- Change your display name
- Update your email
- Change your password

### Subscription tier

- **Free** — 1 team, no AI features
- **Coach ($12/mo)** — 1 team, full AI (Line Coach)
- **Club ($49/mo)** — up to 6 teams
- **Organization ($149/mo)** — unlimited teams

The demo account is on the Coach tier.

---

## Troubleshooting

**Line Coach is not responding**
- Check that your ANTHROPIC_API_KEY environment variable is set (Render dashboard → Environment).
- Ensure the game session is active (status = `active`).

**Score is wrong after a game**
- Completed games are locked. To correct a score, contact support or use the Render database shell to update the record directly.

**A player does not appear in the lineup slots**
- Check their status in Roster. Players with status `injured` or `inactive` are excluded from active lineup.

**Multi-coach sync is lagging**
- Socket.io requires stable network on all devices. Switch to a known-good WiFi network. The join code expires when the game session ends.

**The app shows a blank screen after login**
- Clear browser cache and reload. If the issue persists, log out and back in to refresh the auth token.

---

## Data and Privacy

- All data is stored in a PostgreSQL database hosted on Render (Oregon region).
- Athlete data (names, jersey numbers, skill ratings) is coach-entered and coach-visible only.
- No player/parent access exists in V1.
- AI calls are logged (model, token count, cost estimate) for usage monitoring. Conversation content is stored in `ai_conversations` for session continuity only.

---

*CoachIQ V1 — Field Lacrosse. Beta target: July 2026.*
