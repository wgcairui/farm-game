/**
 * WS entry — standalone Colyseus process (G2).
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
 * `buildWsServer` performs everything up to (but excluding) listen and is
 * exported for the integration tests, which boot the same room stack via
 * `@colyseus/testing` instead of a real port.
 *
 * Run: `pnpm --filter @farm-game/server dev:ws` (tsx) or `start:ws` (dist).
 */

import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { loadConfig, ConfigError } from '../config.js';
import { bootstrapDatabase, type ServerBootstrap } from '../bootstrap.js';
import { createRedisInfra, type RedisInfra } from './redis.js';
import { FarmRoom, activeFarmRooms, configureFarmRoom, drainActiveCommands } from './room.js';
import { RoomRevisionWatcher } from './revision-watcher.js';
import { logger } from '../obs/logger.js';

/**
 * Deadline for waiting out in-flight farm commands during shutdown. Bounded
 * so a stuck DB transaction delays exit by at most this long.
 */
const DRAIN_DEADLINE_MS = 3_000;

export interface WsServerHandle {
  port: number;
  close(): Promise<void>;
}

export interface BuiltWsServer {
  server: Server;
  boot: ServerBootstrap;
  redis: RedisInfra | null;
  /** Release boot-failure resources (redis infra only — boot.close handles the DB). */
  close(): Promise<void>;
}

export async function buildWsServer(overrides?: {
  config?: Partial<import('../config.js').ServerConfig>;
}): Promise<BuiltWsServer> {
  const config = loadConfig(overrides?.config);
  if (!config.redisUrl && config.env === 'production') {
    // loadConfig already refuses; kept as a defensive check for direct calls.
    throw new ConfigError('REDIS_URL is required for the WS entry in production.');
  }

  const boot = await bootstrapDatabase(config);
  let redis: RedisInfra | null = null;
  try {
    redis = config.redisUrl ? await createRedisInfra(config.redisUrl) : null;
  } catch (err) {
    await boot.close();
    throw err;
  }

  configureFarmRoom({
    leases: boot.leases,
    config,
    instanceId: boot.instanceId,
    repo: boot.dbRepo,
    tx: boot.tx,
    orm: boot.orm,
  });

  const server = new Server({
    transport: new WebSocketTransport(),
    // Advertised in matchmake responses — with the shared Redis directory,
    // a join landing on process A for a room owned by process B must send
    // the client to B's endpoint. The SDK's buildEndpoint prepends the
    // scheme itself, so this is host:port WITHOUT `ws://` (verified: with
    // the scheme the client connects to `ws://ws://…` and dies with 1006).
    // LocalDriver (dev) never crosses processes, where it simply matches
    // the listen port.
    publicAddress: `${config.wsHost}:${config.wsPort}`,
    ...(redis ? { driver: redis.driver, presence: redis.presence } : {}),
  });

  // Per-farm rooms MUST be matched by ownerId — without the filter,
  // joinOrCreate('farm', …) routes any farm's join into whichever farm room
  // exists, bypassing lease arbitration entirely and leaking farm state
  // across owners (T2 review #2; verified against core 0.18.12 matchmaking).
  server.define('farm', FarmRoom).filterBy(['ownerId']);

  // T4: poll players.revision for active rooms so out-of-band writes (HTTP
  // entry, another device) reach connected clients as fresh snapshots.
  const revisionWatcher = new RoomRevisionWatcher({
    repo: boot.dbRepo,
    orm: boot.orm,
    pollMs: config.refreshPollMs,
    rooms: activeFarmRooms,
    label: `ws-${boot.instanceId.slice(0, 8)}`,
  });
  revisionWatcher.start();

  server.onShutdown(async () => {
    logger.info({ instanceId: boot.instanceId }, 'ws server shutting down');
    // Drain: Colyseus disposes rooms without awaiting their message handlers,
    // so wait (bounded) for commands mid-transaction before closing the ORM
    // pool — otherwise a committing command would fail on a closed pool.
    await drainActiveCommands(DRAIN_DEADLINE_MS);
    // Colyseus' gracefullyShutdown already shuts the driver/presence down
    // (Server.ts calls presence.shutdown() + driver.shutdown()); closing
    // them again here produced double-quit rejections. Only DB resources
    // and our own timers are ours to release.
    revisionWatcher.stop();
    await boot.close();
  });

  return {
    server,
    boot,
    redis,
    close: async () => {
      await boot.close();
    },
  };
}

export async function startWsServer(overrides?: {
  config?: Partial<import('../config.js').ServerConfig>;
}): Promise<WsServerHandle> {
  const built = await buildWsServer(overrides);
  const { server, boot, redis } = built;
  const config = boot.config;

  try {
    await server.listen(config.wsPort, config.wsHost);
  } catch (err) {
    // Boot failure after resources were created — release them; the process
    // entry then exits non-zero.
    logger.fatal({ err }, 'ws listen failed');
    if (redis) await redis.close();
    await boot.close();
    throw err;
  }

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
