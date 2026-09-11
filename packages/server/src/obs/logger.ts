import pino from 'pino';

/** Singleton pino logger. dev = pretty; prod = ndjson. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'farm-game-server' },
  timestamp: pino.stdTimeFunctions.isoTime,
});