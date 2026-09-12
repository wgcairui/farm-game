/**
 * Redis infrastructure for the WS entry (G2 T2).
 *
 * Two independent Colyseus pieces live in Redis, and both are OPTIONAL at
 * the process level: with `REDIS_URL` unset, a single WS process runs on
 * the in-process LocalDriver/LocalPresence (development only). Production
 * refuses to boot without Redis (enforced in `loadConfig`).
 *
 *  - RedisDriver  — the matchmaker DIRECTORY (room listings, process ids,
 *    seat reservations) shared across WS processes.
 *  - RedisPresence — pub/sub presence for cross-process room events.
 *
 * Ownership is NOT decided here: the farm lease in PostgreSQL
 * (`RoomLeaseRepo`) is the single arbiter of which room instance may write
 * a given farm. Redis only coordinates discovery.
 */

import { RedisDriver } from '@colyseus/redis-driver';
import { RedisPresence } from '@colyseus/redis-presence';
import { logger } from '../obs/logger.js';

export interface RedisInfra {
  driver: RedisDriver;
  presence: RedisPresence;
  /**
   * Best-effort close of both clients. Reserved for BOOT-FAILURE cleanup —
   * on the graceful shutdown path Colyseus' `gracefullyShutdown` already
   * calls `presence.shutdown()` + `driver.shutdown()` itself, and calling
   * them a second time here produced double-quit rejections (T2 review).
   */
  close(): Promise<void>;
}

export async function createRedisInfra(redisUrl: string): Promise<RedisInfra> {
  const driver = new RedisDriver(redisUrl);
  const presence = new RedisPresence(redisUrl);
  // Force an early connection so a wrong URL / unreachable Redis fails at
  // boot instead of on the first room join.
  await presence.exists('__farm_game_boot_probe__').catch((err) => {
    logger.error({ err }, 'redis presence probe failed — REDIS_URL unreachable?');
    throw err;
  });
  let closed = false;
  return {
    driver,
    presence,
    close: async () => {
      if (closed) return;
      closed = true;
      // Both are best-effort: `presence.shutdown()` returns void and may
      // fire internal quit() rejections we cannot attach handlers to, so
      // this path must only run when the graceful shutdown did NOT already
      // close the clients (i.e. boot failures).
      try {
        await driver.shutdown();
      } catch (err) {
        logger.warn({ err }, 'redis driver shutdown failed');
      }
      try {
        presence.shutdown();
      } catch (err) {
        logger.warn({ err }, 'redis presence shutdown failed');
      }
    },
  };
}
