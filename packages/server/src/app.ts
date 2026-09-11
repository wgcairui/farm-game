/**
 * buildApp — wire Fastify + JWT + business routes + admin boundary.
 *
 * Order of registration matters:
 *   1. fastify base
 *   2. @fastify/jwt with config.jwtSecret
 *   3. business routes (auth, crop, player, farm)
 *   4. mountAdmin() — Phase 1 returns 404 on /admin/*; Phase 2 attaches panel
 */

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { PROTOCOL_VERSION } from '@farm-game/shared';
import { authRoutes } from './auth/routes.js';
import { playerRoutes } from './player/routes.js';
import { cropRoutes } from './crop/routes.js';
import { farmRoutes } from './farm/routes.js';
import { InMemoryPlayerRepo } from './auth/repo.js';
import { mountAdmin } from './admin/index.js';
import type { ServerConfig } from './config.js';
import { logger } from './obs/logger.js';

export interface BuildAppOptions {
  config: ServerConfig;
  /** Override repo for tests. */
  repo?: InMemoryPlayerRepo;
}

/**
 * `any` is intentional: Fastify v5 + pino type augmentation produces a
 * `FastifyInstance<Server, ...>` with a parameterized childLoggerFactory that
 * doesn't unify against the `FastifyInstance` export. The runtime contract
 * is unchanged; all route signatures stay precise.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildApp(opts: BuildAppOptions): Promise<any> {
  const { config, repo = new InMemoryPlayerRepo() } = opts;

  const app = Fastify({
    loggerInstance: logger,
  });

  if (config.env === 'test') {
    // Phase 1: silence per-request access logs to keep test output readable.
    // Fastify v5 still accepts the top-level flag but emits a deprecation warning;
    // we accept that until the v6 migration lands.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).disableRequestLogging = true;
  }

  // 1. JWT plugin
  await app.register(fastifyJwt, { secret: config.jwtSecret });

  // 2. /healthz
  app.get('/healthz', async () => ({
    ok: true,
    uptime: Math.round(process.uptime()),
    protocolVersion: PROTOCOL_VERSION,
  }));

  // 3. Business routes
  await authRoutes(app, { repo });
  await cropRoutes(app);
  await playerRoutes(app, { repo });
  await farmRoutes(app, { repo });

  // 4. Admin boundary
  await mountAdmin(
    app,
    {
      adminDbUrl: config.adminDbUrl ?? '',
      jwtSecretAdmin: config.jwtSecretAdmin,
      sessionSecret: config.sessionSecret,
    },
    config.enableAdmin,
  );

  return app;
}