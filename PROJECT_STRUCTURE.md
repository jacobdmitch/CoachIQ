# CoachIQ Project Structure

## Backend (Node.js/Express)
- **server.js** - Express entry point, HTTP server, Socket.io setup
- **package.json** - Dependencies and scripts
- **.env.example** - Environment variables template
- **.node-version** - Node.js version (22)
- **render.yaml** - Render.com deployment config
- **migrate.sh** - Migration runner script
- **run-all-migrations.js** - Migration executor

## Middleware
- **middleware/auth.js** - JWT authentication
- **middleware/security.js** - Helmet, rate limiter, input sanitization
- **middleware/errorHandler.js** - Central error handling
- **middleware/subscriptionGate.js** - Feature gating by tier
- **middleware/validate.js** - Zod schema validation
- **middleware/requestLogger.js** - Request logging with Winston

## Routes
- **routes/auth.js** - Login/register/refresh endpoints
- **routes/teams.js** - Team CRUD operations
- **routes/athletes.js** - Athlete/player management, skill ratings
- **routes/games.js** - Game CRUD, scheduling
- **routes/game-live.js** - Live game endpoints (start, clock, score, subs)
- **routes/game-sync.js** - Socket.io multi-coach synchronization
- **routes/stats.js** - Game statistics logging and retrieval
- **routes/plays.js** - Play library (Phase 2 stub)
- **routes/practice.js** - Practice planning (Phase 2 stub)
- **routes/dashboard.js** - Season analytics and dashboards
- **routes/ai-coach.js** - Line Coach AI endpoints

## Services
- **services/database.js** - PostgreSQL connection pool, query helpers
- **services/logger.js** - Winston logger configuration
- **services/cache.js** - In-memory cache with TTL
- **services/aiCallLogger.js** - LLM API call tracking for costs
- **services/tierConfig.js** - Subscription tier feature matrix
- **services/gameStateManager.js** - Live game state machine
- **services/playtimeTracker.js** - Player playtime calculations
- **services/contextBuilder.js** - AI context and prompt building

## AI Agents
- **services/agents/toolDefinitions.js** - Claude tool_use definitions
- **services/agents/lineCoachAgent.js** - Line Coach agent with AI logic
- **services/agents/orchestrator.js** - Routes requests to agents

## Knowledge Bases
- **knowledge-bases/lacrosse/positions.json** - Position archetypes and skill models
- **knowledge-bases/lacrosse/rules-standard.json** - Standard field lacrosse rules
- **knowledge-bases/lacrosse/rules-6s.json** - Six-on-six rules
- **knowledge-bases/lacrosse/drills.json** - 30 pre-loaded drills

## Database
- **migrations/001_initial_schema.sql** - Database schema (create tables, indexes)

## Frontend (React)
- **frontend/package.json** - React dependencies
- **frontend/public/index.html** - HTML entry point
- **frontend/src/index.js** - React root
- **frontend/src/App.js** - Main app component with routing

### Frontend Config
- **frontend/src/config/api.js** - Axios API client with JWT interceptors

### Frontend Hooks
- **frontend/src/hooks/useGameState.js** - Live game state hook
- **frontend/src/hooks/useSocket.js** - Socket.io connection hook
- **frontend/src/hooks/usePlaytime.js** - Player playtime tracking hook

### Frontend Components
- **frontend/src/components/layout/AppShell.js** - Main app layout wrapper
- **frontend/src/components/layout/TabletNav.js** - Bottom tab navigation
- Stub components for: Roster, AthleteProfile, GameMode, Dashboard, Settings

### Frontend Styles
- **frontend/src/styles/global.css** - Global styles
- **frontend/src/styles/tablet.css** - Tablet-responsive media queries
- **frontend/src/components/layout/AppShell.css** - App shell layout
- **frontend/src/components/layout/TabletNav.css** - Tab navigation styles

## Scripts
- **scripts/seed-demo.js** - Seeds demo data (1 coach, 1 team, 20 athletes, 3 games with stats)

## Other
- **.gitignore** - Git ignore rules
- **docs/** - Documentation (placeholder)
- **tests/** - Tests (placeholder)

## Tech Stack
- Backend: Node.js 22, Express 5, PostgreSQL
- Real-time: Socket.io for multi-coach sync
- AI: Anthropic Claude API (@anthropic-ai/sdk)
- Frontend: React, React Router, Socket.io client, Recharts
- Auth: JWT with refresh tokens, bcrypt
- Hosting targets: Render or Railway

## Key Features
✓ Multi-coach real-time game sync via Socket.io
✓ Live game state management and clock control
✓ Player substitution tracking with playtime equity
✓ AI-powered Line Coach recommendations using Claude
✓ Team and athlete roster management with skill ratings
✓ Game statistics logging and season analytics
✓ Subscription tier-based feature gating (Free/Coach/Club/Organization)
✓ JWT authentication with refresh tokens
✓ Tablet-optimized responsive UI
✓ Rate limiting and security headers
✓ LLM API call logging for cost tracking
