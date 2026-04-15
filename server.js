import 'dotenv/config';
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
import { initializeDatabase } from './services/database.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';

// Route imports
import authRouter from './routes/auth.js';
import teamsRouter from './routes/teams.js';
import athletesRouter from './routes/athletes.js';
import gamesRouter from './routes/games.js';
import gameLiveRouter from './routes/game-live.js';
import statsRouter from './routes/stats.js';
import aiCoachRouter from './routes/ai-coach.js';
import playsRouter from './routes/plays.js';
import practiceRouter from './routes/practice.js';
import dashboardRouter from './routes/dashboard.js';
import setupGameSync from './routes/game-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Middleware
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      `${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/athletes', athletesRouter);
app.use('/api/games', gamesRouter);
app.use('/api/game-live', gameLiveRouter);
app.use('/api/stats', statsRouter);
app.use('/api/ai-coach', aiCoachRouter);
app.use('/api/plays', playsRouter);
app.use('/api/practice', practiceRouter);
app.use('/api/dashboard', dashboardRouter);

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
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

const start = async () => {
  try {
    await initializeDatabase();
    logger.info('Database initialized successfully');
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
