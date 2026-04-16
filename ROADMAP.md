# CoachIQ Prioritized Roadmap

Narrowed scope based on field-coach feedback. The initial blueprint was "a lot
to manage" — this document focuses on the six features that would deliver the
most value in a competitive CIF/club environment, in priority order of the work
we should complete first. Everything not listed here is deferred.

## Target users

- Head coaches running CIF-season and recruiting-level club teams
- New coaches who benefit from data-backed line decisions
- Players and parents consuming season stats

## The six priorities

### P1. Real-time per-player play time tracker
Per-game playtime with live updates as subs happen. This is the baseline coaches
want running on the sideline tablet every game.

- Exists: `services/playtimeTracker.js`, `frontend/src/hooks/usePlaytime.js`,
  `routes/game-live.js` sub endpoints.
- Gaps: verify sub events drive the tracker end-to-end; surface per-player
  minutes in the live UI with visible equity indicators.

### P2. Live stats for our team AND opposing team
Track shots, ground balls, goals, faceoffs won, saves, turnovers, penalties for
both sides as the game happens. Home-only is not enough — the opposing-team
side is what enables scouting (P6) and in-game adjustments.

- Exists: `routes/stats.js`, `migrations/001_initial_schema.sql` stat tables.
- Gaps: confirm schema supports opponent-side stats (opposing team, opposing
  player tags for scouting feed). Add a fast tablet input UI — one tap per
  event. Pipe events through Socket.io so a second coach/parent can log.

### P3. Game clocks: countdown, 20-sec clear, 10-sec delay, 45-sec shot clock (sixes)
Coaches need these visible and audible on the sideline. The 45-second shot
clock is sixes-specific; clear/stall counts apply to standard field lacrosse.

- Exists: `services/gameStateManager.js` has clock control scaffolding.
- Gaps: add secondary countdowns (clear, stall, shot clock) that run
  independently of the game clock. Rules source from
  `knowledge-bases/lacrosse/rules-standard.json` and `rules-6s.json` so
  durations stay configurable. Add visible/audible alerts at expiry.

### P4. Line creator driven by player trait ratings
Build lines from player-by-player ratings on specific traits (speed, stick
skills, lacrosse IQ, dodging, off-ball, defensive positioning, etc.). Should
help a new coach assemble lines they would not have come up with on their own.

- Exists: `routes/lines.js`, `services/lineCoachEngine.js`,
  `migrations/005_lines.sql`, athlete skill ratings in `routes/athletes.js`.
- Gaps: define the trait taxonomy per position in
  `knowledge-bases/lacrosse/positions.json`. Rating UI on the athlete profile.
  Line generator that weights traits by line role (1st midi, ride line, man-up,
  etc.) and exposes the "why" so a coach learns from the suggestion.

### P5. Season stats for players and parents
A read-only season view players/parents can check — goals, assists, GBs, CT,
save %, etc. — aggregated from P2's game data. Mentioned as a highlight of the
old SD program.

- Exists: `routes/dashboard.js`, `routes/stats.js`.
- Gaps: player-facing (and parent-facing) share view. Accessible without full
  coach login — time-limited share link or a lightweight player account.
  Subscription gating: include in the Coach tier.

### P6. Opposing-player risk / threat calculator
The film-study formula the coach runs manually today: track each opposing
player's shots, dodges, goals, fast breaks, etc., compute a threat score,
surface the top threats so the staff can cater matchups and slides to them.
Has to run live during a game, not just post-film.

- Exists: nothing directly.
- Gaps: new `services/opponentScoutingService.js` that consumes the
  opposing-team event stream from P2, computes a per-player threat score from a
  configurable formula, and returns a ranked list. Add a film-session mode
  that ingests historical opponent games to seed the score before tip-off.
  Surface the live ranking in game mode as a "Top threats" panel. Likely a
  Club-tier feature given its scouting value.

## What we are NOT building right now

Everything in the initial blueprint outside the six above — practice planning
depth, play library authoring, drill recommendations, advanced AI agents
beyond line coaching, cross-team organization analytics — stays stubbed. We
revisit after the six priorities are shipped and in use with a real team.

## Sequencing

1. Finish P1 and P2 together — P1 is mostly built, P2 is the data source for
   P5 and P6. Ship them as one release so the tablet UI is useful in a real
   game.
2. Ship P3 clocks next; they are self-contained and low-risk.
3. P4 line creator — depends on trait taxonomy and rating UI, moderate scope.
4. P5 season stats — mostly a read/aggregate layer on top of P2.
5. P6 scouting — highest leverage feature, built last because it depends on
   P2's opposing-team stream and wants historical data to be valuable.

## Tier placement (proposed)

- Free: P1 playtime, basic own-team P2 stats, P3 clocks.
- Coach ($12): full P2 (incl. opponent), P4 line creator, P5 season stats.
- Club ($49): P6 scouting + film-session ingest, multi-team rollups.
- Organization ($149): unchanged from blueprint.
