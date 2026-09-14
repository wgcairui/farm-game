/**
 * MikroORMAdminRepo — production implementation of `AdminRepo`.
 *
 * Per ADR-0006 D44 / D49: admin tables live in the `admin` schema of
 * the same PostgreSQL database as the business tables. Both schemas are
 * managed by the same `MikroORM` instance, so read methods here can
 * `em.fork()` without losing transactional isolation from other
 * requests, and write methods accept the caller's em so a single
 * transaction spans business + admin schemas.
 *
 * `insertAuditLog` deliberately does NOT call `em.flush()` — the caller
 * owns the transaction boundary and is responsible for commit. Stage D
 * wraps the call in `withAdminAudit(em, entry, () => businessMutation(em))`
 * which guarantees both writes land in the same transaction.
 */

import type { EntityManager, MikroORM } from '@mikro-orm/core';
import { AdminUser } from '../db/entities/admin/AdminUser.js';
import { AdminAuditLog } from '../db/entities/admin/AdminAuditLog.js';
import type {
  AdminAuditLogRow,
  AdminRepo,
  AdminUserRow,
  AuditEntry,
} from './admin-repo.js';

export class MikroORMAdminRepo implements AdminRepo {
  constructor(private readonly orm: MikroORM) {}

  async findByUsername(username: string): Promise<AdminUserRow | null> {
    const em = this.orm.em.fork();
    const u = await em.findOne(AdminUser, { username });
    return u ? toUserRow(u) : null;
  }

  async findById(id: number): Promise<AdminUserRow | null> {
    const em = this.orm.em.fork();
    const u = await em.findOne(AdminUser, { id });
    return u ? toUserRow(u) : null;
  }

  async recordLogin(id: number, at: Date): Promise<void> {
    const em = this.orm.em.fork();
    const u = await em.findOne(AdminUser, { id });
    if (!u) throw new Error(`MikroORMAdminRepo.recordLogin: user ${id} not found`);
    u.lastLoginAt = at;
    await em.flush();
  }

  async listAuditLog(opts: {
    limit: number;
    offset: number;
    adminUserId?: number;
    action?: string;
    targetPlayerId?: string;
  }): Promise<AdminAuditLogRow[]> {
    const em = this.orm.em.fork();
    const where: Record<string, unknown> = {};
    if (opts.adminUserId !== undefined) where.adminUserId = opts.adminUserId;
    if (opts.action !== undefined) where.action = opts.action;
    if (opts.targetPlayerId !== undefined) where.targetPlayerId = opts.targetPlayerId;

    const rows = await em.find(AdminAuditLog, where, {
      limit: opts.limit,
      offset: opts.offset,
      orderBy: { createdAt: 'DESC' },
    });
    return rows.map(toAuditRow);
  }

  /**
   * Persist an audit row inside the caller's transaction. We do NOT
   * `em.flush()` here — the caller's transactional block owns commit.
   * Returning the row (with id populated) lets follow-up joins in the
   * same transaction reference it, though Stage D's typical caller
   * ignores the return value.
   *
   * `createdAt` is passed explicitly even though the DB column has
   * `DEFAULT now()`; MikroORM's RequiredEntityData type requires it
   * at the TypeScript layer (matches the `MikroORMPlayerRepo.createPlayer`
   * pattern in this codebase).
   */
  async insertAuditLog(em: EntityManager, entry: AuditEntry): Promise<AdminAuditLogRow> {
    const row = em.create(AdminAuditLog, {
      adminUserId: entry.adminUserId,
      action: entry.action,
      targetPlayerId: entry.targetPlayerId ?? null,
      payload: entry.payload ?? {},
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      createdAt: new Date(),
    });
    await em.persistAndFlush(row);
    return toAuditRow(row);
  }
}

function toUserRow(u: AdminUser): AdminUserRow {
  return {
    id: typeof u.id === 'bigint' ? Number(u.id) : (u.id as number),
    username: u.username,
    passwordHash: u.passwordHash,
    role: u.role,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    disabledAt: u.disabledAt,
  };
}

function toAuditRow(r: AdminAuditLog): AdminAuditLogRow {
  return {
    id: typeof r.id === 'bigint' ? Number(r.id) : (r.id as number),
    adminUserId: typeof r.adminUserId === 'bigint' ? Number(r.adminUserId) : (r.adminUserId as number),
    action: r.action,
    targetPlayerId: r.targetPlayerId,
    payload: r.payload as Record<string, unknown>,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
  };
}
