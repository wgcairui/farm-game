/**
 * AdminRepo — interface implemented by both the unit-test in-memory repo
 * and the production MikroORM-backed repo.
 *
 * Per ADR-0006 D49: writes to business tables (e.g. `players.banned_at`)
 * commit in the same transaction as their `admin.admin_audit_log` row.
 * That atomicity is owned by the route layer (`withAdminAudit`), NOT by
 * this repo: `insertAuditLog` accepts the caller's `EntityManager` so
 * the audit insert reuses the transaction context. Read-only methods
 * (`findByUsername`, `findById`, `listAuditLog`) use the repo's own
 * `em.fork()` — they have no reason to share a transaction.
 *
 * Production wiring: see `bootstrap.ts` → `MikroORMAdminRepo`.
 * Unit-test wiring: see `test/admin-repo.test.ts` → `InMemoryAdminRepo`.
 */

import type { EntityManager } from '@mikro-orm/core';

export interface AdminUserRow {
  id: number;
  username: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  disabledAt: Date | null;
}

export interface AdminAuditLogRow {
  id: number;
  adminUserId: number;
  action: string;
  targetPlayerId: string | null;
  payload: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditEntry {
  adminUserId: number;
  action: string;
  targetPlayerId?: string | null;
  payload?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AdminRepo {
  findByUsername(username: string): Promise<AdminUserRow | null>;
  findById(id: number): Promise<AdminUserRow | null>;
  recordLogin(id: number, at: Date): Promise<void>;
  listAuditLog(opts: {
    limit: number;
    offset: number;
    adminUserId?: number;
    action?: string;
    targetPlayerId?: string;
  }): Promise<AdminAuditLogRow[]>;

  /**
   * Insert an audit log row using the caller's EntityManager. The caller
   * MUST be inside an `em.transactional(...)` so the audit row commits
   * atomically with the business-table mutation it describes.
   *
   * Pure-function contract: this method does NOT auto-fill `createdAt`
   * (the column has a `DEFAULT now()` and MikroORM will let the DB assign
   * it on INSERT). Returns the assigned `id` synchronously after flush —
   * callers can use the returned id for downstream joins, but the typical
   * caller doesn't need it (the route handler returns after commit).
   */
  insertAuditLog(em: EntityManager, entry: AuditEntry): Promise<AdminAuditLogRow>;
}
