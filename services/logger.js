import winston from 'winston';

// Console format: include request ID when present so lines can be correlated
// with the X-Request-Id response header. Other metadata follows as JSON.
const consoleFormat = winston.format.printf(({ level, message, timestamp, requestId, ...meta }) => {
  const idTag = requestId ? ` [${requestId}]` : '';
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]${idTag}: ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'coachiq-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), consoleFormat),
    }),
  ],
});

if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 10485760,
    maxFiles: 5,
  }));
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 10485760,
    maxFiles: 5,
  }));
}

export default logger;
