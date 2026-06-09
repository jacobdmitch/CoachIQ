import 'dotenv/config';

// ─── Production secret guard — fail fast before binding any port ──────────────
if (process.env.NODE_ENV === 'production') {
  const missing = [];
  if (!process.env.JWT_SECRET)         missing.push('JWT_SECRET');
  if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
  if (!process.env.DATABASE_URL)       missing.push('DATABASE_URL');
  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import logger from './services/logger.js';
import { initializeDatabase, query as dbQuery } from './services/database.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';
import { scheduleGraduationSweep } from './services/graduationSweep.js';
import requestId from './middleware/requestId.js';
import { initSentry, expressErrorMiddleware as sentryErrorMiddleware } from './services/sentry.js';

// Init Sentry as early as possible — must run before any route handlers
// register so exceptions in startup code are captured.
initSentry();

// Route imports
import authRouter from './routes/auth.js';
import teamsRouter from './routes/teams.js';
import seasonsRouter from './routes/seasons.js';
import athletesRouter from './routes/athletes.js';
import gamesRouter from './routes/games.js';
import gameLiveRouter from './routes/game-live.js';
import gameSessionsRouter from './routes/game-sessions.js';
import aiCoachRouter from './routes/ai-coach.js';
import playsRouter from './routes/plays.js';
import practiceRouter from './routes/practice.js';
import dashboardRouter from './routes/dashboard.js';
import linesRouter from './routes/lines.js';
import statsRouter from './routes/stats.js';
import opposingRouter from './routes/opposing.js';
import publicRouter from './routes/public.js';
import setupGameSync from './routes/game-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Allowed CORS origins: the configured web origin(s) plus the native iOS
// (Capacitor) WebView origin, so the bundled App Store build can reach the
// REST API and Socket.io. CORS_ORIGIN may be a comma-separated list.
const allowedOrigins = (process.env.CORS_ORIGIN || 'https://coachiq.onrender.com')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
  .concat(['capacitor://localhost']);

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Middleware
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https://*.amazonaws.com'],
    },
  },
}));
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Attach request ID before logging so every log line can be traced back to
// a single HTTP request. Also writes X-Request-Id response header.
app.use(requestId);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      `${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`,
      { requestId: req.id }
    );
  });
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});
app.use('/api/', limiter);

// Static file serving — uploaded assets (logos, etc.)
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Health check with database connectivity
app.get('/health', async (req, res) => {
  try {
    const dbResult = await dbQuery('SELECT 1 AS ok');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbResult.rows[0]?.ok === 1 ? 'connected' : 'error',
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: err.message,
    });
  }
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/seasons', seasonsRouter);
app.use('/api/athletes', athletesRouter);
app.use('/api/games', gamesRouter);
app.use('/api/game-live', gameLiveRouter);
app.use('/api/game-sessions', gameSessionsRouter);
app.use('/api/ai-coach', aiCoachRouter);
app.use('/api/plays', playsRouter);
app.use('/api/practice', practiceRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/lines', linesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/opposing', opposingRouter);
app.use('/api/public', publicRouter);

// Setup Socket.io game sync
setupGameSync(io);

// Serve React static build in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, 'frontend/build');
  app.use(express.static(frontendPath));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handling middleware (must be last)
// Forward to Sentry first (noop when SENTRY_DSN unset), then our own handler.
app.use(sentryErrorMiddleware());
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

const start = async () => {
  try {
    await initializeDatabase();
    logger.info('Database initialized successfully');
    scheduleGraduationSweep();
    server.listen(PORT, () => {
      logger.info(`CoachIQ server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();

export { app, server, io };
