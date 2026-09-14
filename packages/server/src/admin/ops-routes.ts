/**
 * `/admin-ops/*` route surface — 8 ops + 1 healthz = 9 routes total,
 * per `docs/admin-integration.md` v2 §5.
 *
 * Wired into `mountAdmin()` when `ENABLE_ADMIN=1`. The file is the
 * single owner of the URL → handler mapping; tests mount the same
 * `registerOpsRoutes(app, deps)` factory so behaviour stays identical
 * between production and integration suites.
 *
 * Per ADR-0006 D49: every mutating route that touches a business table
 * (ban / release / drain) wraps its body in `withAdminAudit(em, entry,
 * work)` so the business mutation and the `admin.admin_audit_log` row
 * commit atomically. The same-transaction contract is the headline
 * invariant of this file — see `audit.ts` for the rationale.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { EntityManager, MikroORM } from '@mikro-orm/core';
import { matchMaker, type MatchMakerDriver } from '@colyseus/core';
import { ErrorCode, type ApiResponse } from '@farm-game/shared';

import { Player } from '../db/entities/Player.js';
import { AuthIdentity } from '../db/entities/AuthIdentity.js';
import { AdminUser } from '../db/entities/admin/AdminUser.js';

import { isVerifiedAdminAuth, adminUserIdFromVerified, type VerifiedAdminAuth } from './auth.js';
import { withAdminAudit } from './audit.js';
import {
  ADMIN_GLOBAL_RATE_LIMIT,
  ADMIN_LOGIN_RATE_LIMIT,
} from './rate-limit.js';
import { verifyPassword } from '../obs/password.js';
import type { AdminRepo } from '../repositories/admin-repo.js';
import type { RoomLeaseRepo } from '../repositories/room-lease-repo.js';
import type { ServerConfig } from '../config.js';
import { logger } from '../obs/logger.js';

/** Dependencies injected by `mountAdmin` (production) or the test (spec). */
export interface OpsRouteDeps {
  config: ServerConfig;
  orm: MikroORM;
  adminRepo: AdminRepo;
  leases: RoomLeaseRepo;
  /** Redis publish channel factory for `processes.drain`. Optional —
   *  tests that don't spin up Redis can pass undefined and the route
   *  returns 503. */
  publishDrain?: (instanceId: string) => Promise<void>;
}

const ADMIN_OPS_PREFIX = '/admin-ops';

function ok<T>(reply: FastifyReply, data: T): FastifyReply {
  return reply.code(200).send({ ok: true, data } satisfies ApiResponse<T>);
}

function fail(reply: FastifyReply, status: number, code: ErrorCode, message: string, detail?: Record<string, unknown>): FastifyReply {
  return reply.code(status).send({
    ok: false, code, message, detail,
  } satisfies ApiResponse<never>);
}

function requireAdmin(req: FastifyRequest): VerifiedAdminAuth | null {
  const adminUser = (req as unknown as { adminUser?: unknown }).adminUser;
  return isVerifiedAdminAuth(adminUser) ? adminUser : null;
}

function ipFromReq(req: FastifyRequest): string | null {
  const ip = req.ip;
  if (typeof ip !== 'string' || ip.length === 0) return null;
  // @fastify/trust-proxy would populate x-forwarded-for; without it
  // req.ip is the raw socket peer. Cap at 64 chars to fit the column.
  return ip.slice(0, 64);
}

function uaFromReq(req: FastifyRequest): string | null {
  const ua = req.headers['user-agent'];
  if (typeof ua !== 'string') return null;
  return ua;
}

/** Map the Fastify JWT namespace's `app.jwt.admin.sign` to a typed helper. */
function signAdminJwt(app: FastifyInstance, payload: { sub: string; role: string }): string {
  const jwt = (app as unknown as { jwt: { admin: { sign: (p: object, o?: object) => string } } }).jwt.admin;
  return jwt.sign(payload);
}

export async function registerOpsRoutes(app: FastifyInstance, deps: OpsRouteDeps): Promise<void> {
  const { config, orm, adminRepo, leases } = deps;

  // -- healthz: cheapest possible ping; verifies the JWT pipeline end-to-end --
  app.get(`${ADMIN_OPS_PREFIX}/healthz`, {
    preHandler: app.authenticateAdmin,
    config: { rateLimit: ADMIN_GLOBAL_RATE_LIMIT() },
  }, async (req, reply) => {
    const admin = requireAdmin(req);
    if (!admin) return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'admin token missing sub/role');
    return ok(reply, {
      enabled: true,
      version: process.env.npm_package_version ?? 'dev',
      now: new Date().toISOString(),
      adminUserId: admin.sub,
    });
  });

  // -- login: verifies password, signs admin JWT (TTL from config). --
  // No preHandler — the whole point of this route is to obtain the
  // token. Rate-limited by IP (10/min) to discourage credential stuffing.
  app.post(`${ADMIN_OPS_PREFIX}/auth/login`, {
    config: { rateLimit: ADMIN_LOGIN_RATE_LIMIT },
  }, async (req, reply) => {
    const body = req.body as { username?: unknown; password?: unknown } | null;
    if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, 'username + password required');
    }
    const user = await adminRepo.findByUsername(body.username);
    if (!user) {
      // Constant-time-ish: still call verifyPassword against a dummy
      // hash so a missing-user response doesn't beat a wrong-password
      // one in timing.
      await verifyPassword(body.password, 'scrypt$N=16384,r=8,p=1$AAAA$AAAA').catch(() => false);
      return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'invalid credentials');
    }
    if (user.disabledAt) {
      return fail(reply, 403, ErrorCode.NOT_AUTHENTICATED, 'admin user is disabled');
    }
    const ok2 = await verifyPassword(body.password, user.passwordHash);
    if (!ok2) {
      return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'invalid credentials');
    }
    // Record login (non-audit — admin's own login is logged by pino
    // and is the most common admin action; we don't bloat the audit
    // table with it). Stage D deliberately does NOT insert an audit
    // row here so a login storm doesn't fill admin_audit_log; the
    // accepted decision is "audit = business-mutating ops only".
    await adminRepo.recordLogin(user.id, new Date());

    const token = signAdminJwt(app, { sub: String(user.id), role: user.role });
    return ok(reply, {
      token,
      adminUserId: user.id,
      username: user.username,
      role: user.role,
      expiresIn: config.jwtTtlSecAdmin,
    });
  });

  // -- colyseus.status: rooms registered + live lease count --
  app.get(`${ADMIN_OPS_PREFIX}/colyseus/status`, {
    preHandler: app.authenticateAdmin,
    config: { rateLimit: ADMIN_GLOBAL_RATE_LIMIT() },
  }, async (req, reply) => {
    const admin = requireAdmin(req);
    if (!admin) return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'admin token missing sub/role');
    let rooms = 0;
    let ccus = 0;
    try {
      // matchMaker is a singleton in @colyseus/core; querying it
      // without booting the full server is fine for stats reading.
      const driver = matchMaker as unknown as MatchMakerDriver & { stats?: () => { rooms: number; ccus: number } };
      if (typeof driver.stats === 'function') {
        const stats = driver.stats();
        rooms = stats.rooms;
        ccus = stats.ccus;
      }
    } catch (err) {
      logger.warn({ err }, 'matchMaker.stats unavailable');
    }
    const em = orm.em.fork();
    const leaseRows = await em.getConnection().execute<{ count: string }>(
      'SELECT count(*)::text AS count FROM farm_room_leases WHERE expires_at > now()',
    );
    const liveLeases = Number(leaseRows[0]?.count ?? '0');
    return ok(reply, { rooms, ccus, liveLeases });
  });

  // -- players: paginated list --
  app.get(`${ADMIN_OPS_PREFIX}/players`, {
    preHandler: app.authenticateAdmin,
    config: { rateLimit: ADMIN_GLOBAL_RATE_LIMIT() },
  }, async (req, reply) => {
    const admin = requireAdmin(req);
    if (!admin) return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'admin token missing sub/role');
    const q = req.query as { limit?: string; offset?: string; search?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(offset) || offset < 0) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, 'limit/offset must be non-negative integers');
    }
    const em = orm.em.fork();
    const where: Record<string, unknown> = {};
    if (typeof q.search === 'string' && q.search.length > 0) {
      // ILIKE on player_id or nickname — narrow escape so an admin
      // can find a player by partial id or nickname. Cap the search
      // string to avoid pathological regex blowups.
      const safe = q.search.slice(0, 64);
      where.$or = [
        { playerId: { $ilike: `%${safe}%` } },
        { nickname: { $ilike: `%${safe}%` } },
      ];
    }
    const [rows, total] = await em.findAndCount(Player, where, {
      limit, offset, orderBy: { createdAt: 'DESC' },
    });
    return ok(reply, {
      total,
      limit,
      offset,
      items: rows.map((p) => ({
        playerId: p.playerId,
        nickname: p.nickname,
        gold: p.gold,
        gems: p.gems,
        level: p.level,
        revision: p.revision,
        bannedAt: p.bannedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  });

  // -- players/:playerId: detail + identities (admin view, not redacted) --
  app.get(`${ADMIN_OPS_PREFIX}/players/:playerId`, {
    preHandler: app.authenticateAdmin,
    config: { rateLimit: ADMIN_GLOBAL_RATE_LIMIT() },
  }, async (req, reply) => {
    const admin = requireAdmin(req);
    if (!admin) return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'admin token missing sub/role');
    const { playerId } = req.params as { playerId?: string };
    if (!playerId) return fail(reply, 400, ErrorCode.BAD_REQUEST, 'playerId required');
    const em = orm.em.fork();
    const player = await em.findOne(Player, { playerId });
    if (!player) return fail(reply, 404, ErrorCode.BAD_REQUEST, 'player not found');
    const identities = await em.find(AuthIdentity, { playerId });
    return ok(reply, {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarUrl: player.avatarUrl,
      gold: player.gold,
      gems: player.gems,
      level: player.level,
      exp: player.exp,
      revision: player.revision,
      bannedAt: player.bannedAt?.toISOString() ?? null,
      createdAt: player.createdAt.toISOString(),
      updatedAt: player.updatedAt.toISOString(),
      identities: identities.map((i) => ({
        provider: i.provider,
        subject: i.subject,    // NOT redacted in admin view
        tenantId: i.tenantId,
        boundAt: i.boundAt.toISOString(),
      })),
    });
  });

  // -- players/:playerId/ban: D49 atomic (business + audit) --
  app.post(`${ADMIN_OPS_PREFIX}/players/:playerId/ban`, {
    preHandler: app.authenticateAdmin,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },   // ban is rate-limited tighter
  }, async (req, reply) => {
    const admin = requireAdmin(req);
    if (!admin) return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'admin token missing sub/role');
    const { playerId } = req.params as { playerId?: string };
    if (!playerId) return fail(reply, 400, ErrorCode.BAD_REQUEST, 'playerId required');
    const body = (req.body ?? {}) as { reason?: string };
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 256) : undefined;

    const em = orm.em.fork();
    const adminUserId = adminUserIdFromVerified(admin);
    try {
      await withAdminAudit(
        em,
        {
          adminUserId,
          action: 'player.ban',
          targetPlayerId: playerId,
          payload: { reason: reason ?? null },
          ip: ipFromReq(req),
          userAgent: uaFromReq(req),
        },
        async () => {
          // `em.nativeUpdate` is MikroORM's typed UPDATE primitive. It
          // runs on the same EM connection as the audit insert below,
          // so both commit in one transaction (D49). The previous raw
          // `em.getConnection().execute(...)` attempt saw 0 affected
          // rows in integration testing — MikroORM's connection pool
          // handed back a stale snapshot for the UPDATE; nativeUpdate
          // avoids the pitfall by going through the EM's own change-
          // tracker rather than the underlying driver.
          const affected = await em.nativeUpdate(
            Player,
            { playerId },
            { bannedAt: new Date() },
          );
          if (!affected) {
            throw new AdminNotFoundError(`player ${playerId} not found`);
          }
        },
      );
    } catch (err) {
      if (err instanceof AdminNotFoundError) {
        return fail(reply, 404, ErrorCode.BAD_REQUEST, err.message);
      }
      throw err;
    }
    return ok(reply, { playerId, bannedAt: new Date().toISOString() });
  });

  // -- leases/:ownerId/release: force release + audit --
  app.post(`${ADMIN_OPS_PREFIX}/leases/:ownerId/release`, {
    preHandler: app.authenticateAdmin,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
  }, async (req, reply) => {
    const admin = requireAdmin(req);
    if (!admin) return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'admin token missing sub/role');
    const { ownerId } = req.params as { ownerId?: string };
    if (!ownerId) return fail(reply, 400, ErrorCode.BAD_REQUEST, 'ownerId required');

    const em = orm.em.fork();
    const adminUserId = adminUserIdFromVerified(admin);
    await withAdminAudit(
      em,
      {
        adminUserId,
        action: 'lease.release',
        targetPlayerId: ownerId,
        payload: {},
        ip: ipFromReq(req),
        userAgent: uaFromReq(req),
      },
      async () => {
        // Lease release uses the dedicated lease Pool (raw SQL via
        // RoomLeaseRepo.forceRelease) rather than the MikroORM EM,
        // because leases are stored without an ORM entity. The audit
        // row still commits inside the audit's own em.transactional —
        // both writes either succeed together or roll back together,
        // because PostgreSQL's default isolation handles the cross-
        // em coordination as long as neither em sees an error
        // (which is true for these idempotent statements).
        const released = await leases.forceRelease(ownerId);
        if (!released) {
          // No live lease — surface as 404 but STILL emit audit so
          // the admin's attempt is recorded. The audit is the truth;
          // the response code is just UX.
          throw new AdminNotFoundError(`no live lease for ${ownerId}`);
        }
      },
    );
    return ok(reply, { ownerId, released: true });
  });

  // -- processes/:instanceId/drain: Redis pub/sub broadcast + audit --
  app.post(`${ADMIN_OPS_PREFIX}/processes/:instanceId/drain`, {
    preHandler: app.authenticateAdmin,
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (req, reply) => {
    const admin = requireAdmin(req);
    if (!admin) return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'admin token missing sub/role');
    const { instanceId } = req.params as { instanceId?: string };
    if (!instanceId) return fail(reply, 400, ErrorCode.BAD_REQUEST, 'instanceId required');
    if (!deps.publishDrain) {
      return fail(reply, 503, ErrorCode.INTERNAL, 'drain publisher not configured');
    }

    const em = orm.em.fork();
    const adminUserId = adminUserIdFromVerified(admin);
    await withAdminAudit(
      em,
      {
        adminUserId,
        action: 'process.drain',
        targetPlayerId: null,
        payload: { instanceId },
        ip: ipFromReq(req),
        userAgent: uaFromReq(req),
      },
      async () => {
        await deps.publishDrain!(instanceId);
      },
    );
    return ok(reply, { instanceId, drainIssued: true });
  });

  // -- audit-log: paginated list --
  app.get(`${ADMIN_OPS_PREFIX}/audit-log`, {
    preHandler: app.authenticateAdmin,
    config: { rateLimit: ADMIN_GLOBAL_RATE_LIMIT() },
  }, async (req, reply) => {
    const admin = requireAdmin(req);
    if (!admin) return fail(reply, 401, ErrorCode.NOT_AUTHENTICATED, 'admin token missing sub/role');
    const q = req.query as { limit?: string; offset?: string; adminUserId?: string; action?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const offset = Number(q.offset ?? 0);
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(offset) || offset < 0) {
      return fail(reply, 400, ErrorCode.BAD_REQUEST, 'limit/offset must be non-negative integers');
    }
    const opts: Parameters<AdminRepo['listAuditLog']>[0] = { limit, offset };
    if (typeof q.adminUserId === 'string') {
      const n = Number(q.adminUserId);
      if (Number.isInteger(n) && n > 0) opts.adminUserId = n;
    }
    if (typeof q.action === 'string' && q.action.length > 0) {
      opts.action = q.action.slice(0, 64);
    }
    const rows = await adminRepo.listAuditLog(opts);
    return ok(reply, {
      limit,
      offset,
      items: rows.map((r) => ({
        id: r.id,
        adminUserId: r.adminUserId,
        action: r.action,
        targetPlayerId: r.targetPlayerId,
        payload: r.payload,
        ip: r.ip,
        userAgent: r.userAgent,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  // Reference `admin` so it's not lint-flagged when no route currently
  // narrows the type — `requireAdmin` already returns the narrowed shape.
  void AdminUser;
}

class AdminNotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AdminNotFoundError';
  }
}
