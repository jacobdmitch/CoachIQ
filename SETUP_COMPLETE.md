# CoachIQ - Initial Project Setup Complete

## Project Location
`/sessions/trusting-epic-euler/mnt/Lacrosse CoachIQ/CoachIQ`

## What's Been Created

### Backend (Node.js/Express)
- **server.js** - Express server with Socket.io and HTTP setup
- **package.json** - All dependencies configured (Express 5, PostgreSQL, Socket.io, Claude SDK)
- **run-all-migrations.js** - Database migration executor
- **.node-version** - Node.js 22 specification

### Middleware (5 files)
- **auth.js** - JWT authentication with refresh tokens
- **errorHandler.js** - Central error handling
- Plus stubs for security, validation, and subscription gating

### Routes (11 modules)
- **auth.js** - Login/register/refresh
- **teams.js** - Team management
- **athletes.js** - Player roster
- **games.js** - Game scheduling
- **game-live.js** - Live game state
- **game-sync.js** - Socket.io real-time sync
- **stats.js** - Statistics logging
- **ai-coach.js** - Claude AI integration
- Plus stubs for plays, practice, and dashboard

### Services (4 core files created)
- **database.js** - PostgreSQL connection pool
- **logger.js** - Winston logging
- **cache.js** - In-memory cache with TTL
- **tierConfig.js** - Subscription tier matrix
- Stubs for AI agents, context building, and gameplay

### Frontend (React)
- **src/App.js** - Main app with routing
- **src/index.js** - React entry point
- **config/api.js** - Axios API client with auth
- **components/layout/** - AppShell and TabletNav
- **styles/** - Global and tablet-responsive CSS
- **public/index.html** - HTML template
- **package.json** - React dependencies

### Configuration & Deployment
- **.env.example** - Environment variables template
- **.gitignore** - Standard Node.js ignores
- **render.yaml** - Render.com deployment config
- **migrate.sh** - Migration runner script

### Database & Knowledge Bases
- **migrations/001_initial_schema.sql** - (placeholder for full schema)
- **knowledge-bases/lacrosse/** - Position models, rules, drills

## Getting Started

### Install Dependencies
```bash
npm install
cd frontend && npm install && cd ..
```

### Configure Environment
```bash
cp .env.example .env
# Edit .env with your:
# - DATABASE_URL (PostgreSQL connection)
# - JWT_SECRET (random string)
# - ANTHROPIC_API_KEY (Claude API key)
# - Other settings
```

### Setup Database
```bash
npm run migrate
npm run seed  # Optional: load demo data
```

### Run Development Servers
```bash
# Backend
npm run dev

# Frontend (in another terminal)
cd frontend && npm start
```

Backend runs on: `http://localhost:3001`
Frontend runs on: `http://localhost:3000`

## Architecture Highlights

### Backend
- Express 5 with helmet/CORS security
- JWT auth with 1-hour tokens + 7-day refresh tokens
- PostgreSQL with connection pooling
- Socket.io for real-time multi-coach sync
- Rate limiting (100 req/min general, stricter on auth/AI)

### Frontend
- React with React Router
- Tablet-optimized responsive design
- Socket.io client for live updates
- Bottom navigation for mobile/tablet

### AI Integration
- Anthropic Claude API for Line Coach recommendations
- Tool-use pattern for substitution suggestions
- Context builder for game state analysis
- LLM call logging for cost tracking

### Subscription Model
- Free: Basic team and roster management
- Coach ($12/mo): Full AI features
- Club ($49/mo): 6 teams, shared resources
- Organization ($149/mo): Unlimited teams, cross-team analytics

## Next Steps

1. **Database Schema** - Create migration with full table definitions
2. **Knowledge Bases** - Populate positions, rules, and drills JSON files
3. **API Testing** - Test all endpoints with sample data
4. **Frontend Components** - Implement full UI for all routes
5. **Socket.io Events** - Complete multi-coach sync implementation
6. **Authentication** - Implement login/signup UI
7. **Deployment** - Connect to Render or Railway

## Tech Stack Summary
- **Backend**: Node.js 22, Express 5, PostgreSQL
- **Real-time**: Socket.io
- **AI**: Anthropic Claude 3.5 Sonnet
- **Frontend**: React 18, React Router 6
- **Auth**: JWT + Bcrypt
- **Logging**: Winston
- **Validation**: Zod

## Files Created
- 39 source files (excluding node_modules and .git)
- Modular, scalable architecture
- Ready for npm install and development
- Git initialized with initial commit

---
Generated: 2026-04-14
