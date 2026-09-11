/**
 * WS entry — standalone Colyseus process (G2 T2).
 *
 * Runs independently from the HTTP entry, sharing the same database wiring
 * via `bootstrapDatabase` (migrations are advisory-lock guarded so both
 * entries can boot concurrently). Room discovery/presence go through Redis
 * when `REDIS_URL` is set; farm ownership is arbitrated by PostgreSQL
 * leases regardless.
 *
 * Boot sequence: bootstrap DB → configure FarmRoom → register rooms →
 * listen. On shutdown (SIGINT/SIGTERM handled by Colyseus by default),
 * rooms dispose (lease released) and DB resources close.
 *
 * Run: `pnpm --filter @farm-game/server dev:ws` (tsx) or `start:ws` (dist).
 */

import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { loadConfig, ConfigError } from '../config.js';
import { bootstrapDatabase } from '../bootstrap.js';
import { createRedisInfra, type RedisInfra } from './redis.js';
import { FarmRoom, configureFarmRoom } from './room.js';
import { logger } from '../obs/logger.js';

export interface WsServerHandle {
  port: number;
  close(): Promise<void>;
}

export async function startWsServer(overrides?: {
  config?: Partial<import('../config.js').ServerConfig>;
}): Promise<WsServerHandle> {
  const config = loadConfig(overrides?.config);
  if (!config.redisUrl && config.env === 'production') {
    // loadConfig already refuses; kept as a defensive check for direct calls.
    throw new ConfigError('REDIS_URL is required for the WS entry in production.');
  }

  const boot = await bootstrapDatabase(config);
  const redis: RedisInfra | null = config.redisUrl ? await createRedisInfra(config.redisUrl) : null;

  configureFarmRoom({
    leases: boot.leases,
    config,
    instanceId: boot.instanceId,
  });

  const server = new Server({
    transport: new WebSocketTransport(),
    ...(redis ? { driver: redis.driver, presence: redis.presence } : {}),
  });

  server.define('farm', FarmRoom);

  server.onShutdown(async () => {
    logger.info({ instanceId: boot.instanceId }, 'ws server shutting down');
    if (redis) await redis.close();
    await boot.close();
  });

  await server.listen(config.wsPort, config.wsHost);
  logger.info(
    {
      port: config.wsPort,
      env: config.env,
      instanceId: boot.instanceId,
      driver: redis ? 'redis' : 'local',
      db: 'postgresql',
    },
    'farm-game-ws listening',
  );

  let closed = false;
  return {
    port: config.wsPort,
    close: async () => {
      if (closed) return;
      closed = true;
      await server.gracefullyShutdown(false);
    },
  };
}

/** CLI main — only runs when executed directly. */
async function main(): Promise<void> {
  try {
    await startWsServer();
  } catch (err) {
    logger.fatal({ err }, 'ws bootstrap failed');
    process.exit(1);
  }
}

// tsx watch / node dist both execute this module as the entry script.
if (process.argv[1]?.endsWith('serve.ts') || process.argv[1]?.endsWith('serve.js')) {
  void main();
}
