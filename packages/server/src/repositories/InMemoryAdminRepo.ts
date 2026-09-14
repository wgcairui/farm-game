/**
 * InMemoryAdminRepo — test-only implementation of `AdminRepo`.
 *
 * Mirrors the dual-key design of `MikroORMAdminRepo` (by-id + by-username)
 * so existing unit tests can exercise the same semantics without touching
 * PostgreSQL. NOT used in production boot.
 *
 * `insertAuditLog` in this in-memory variant is best-effort — it has no
 * concept of "caller's transaction" because there's no DB. It just
 * appends to the in-memory list and returns a synthetic row. The
 * production `MikroORMAdminRepo` is the one that honours the em contract
 * (see `admin-repo.ts` header).
 */

import type { EntityManager } from '@mikro-orm/core';
import type {
  AdminAuditLogRow,
  AdminRepo,
  AdminUserRow,
  AuditEntry,
} from './admin-repo.js';

export class InMemoryAdminRepo implements AdminRepo {
  private readonly _byId = new Map<number, AdminUserRow>();
  private readonly _byUsername = new Map<string, number>();
  private _nextUserId = 1;
  private readonly _auditLog: AdminAuditLogRow[] = [];
  private _nextAuditId = 1;

  async findByUsername(username: string): Promise<AdminUserRow | null> {
    const id = this._byUsername.get(username);
    if (id === undefined) return null;
    return this._byId.get(id) ?? null;
  }

  async findById(id: number): Promise<AdminUserRow | null> {
    return this._byId.get(id) ?? null;
  }

  async recordLogin(id: number, at: Date): Promise<void> {
    const u = this._byId.get(id);
    if (!u) throw new Error(`InMemoryAdminRepo.recordLogin: user ${id} not found`);
    u.lastLoginAt = at;
  }

  /** Test/seed helper — not part of the `AdminRepo` interface. */
  createUser(input: {
    username: string;
    passwordHash: string;
    role?: string;
  }): AdminUserRow {
    const id = this._nextUserId++;
    if (this._byUsername.has(input.username)) {
      throw new Error(`InMemoryAdminRepo.createUser: username ${input.username} already exists`);
    }
    const row: AdminUserRow = {
      id,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role ?? 'operator',
      createdAt: new Date(),
      lastLoginAt: null,
      disabledAt: null,
    };
    this._byId.set(id, row);
    this._byUsername.set(input.username, id);
    return row;
  }

  async listAuditLog(opts: {
    limit: number;
    offset: number;
    adminUserId?: number;
    action?: string;
    targetPlayerId?: string;
  }): Promise<AdminAuditLogRow[]> {
    let rows = this._auditLog.slice().reverse();   // newest first
    if (opts.adminUserId !== undefined) rows = rows.filter((r) => r.adminUserId === opts.adminUserId);
    if (opts.action !== undefined) rows = rows.filter((r) => r.action === opts.action);
    if (opts.targetPlayerId !== undefined) rows = rows.filter((r) => r.targetPlayerId === opts.targetPlayerId);
    return rows.slice(opts.offset, opts.offset + opts.limit);
  }

  /**
   * In-memory `insertAuditLog` ignores the supplied `em` (there is no
   * transactional context to honour) and appends to the in-memory list.
   * The signature still accepts `em` so callers can share code with the
   * production repo.
   */
  async insertAuditLog(_em: EntityManager, entry: AuditEntry): Promise<AdminAuditLogRow> {
    void _em;
    const id = this._nextAuditId++;
    const row: AdminAuditLogRow = {
      id,
      adminUserId: entry.adminUserId,
      action: entry.action,
      targetPlayerId: entry.targetPlayerId ?? null,
      payload: entry.payload ?? {},
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      createdAt: new Date(),
    };
    this._auditLog.push(row);
    return row;
  }

  // ---- test-only helpers ----

  /** Test helper: read-only view of all audit log rows. */
  auditLogSnapshot(): readonly AdminAuditLogRow[] {
    return this._auditLog.slice();
  }

  /** Test helper: count users. */
  size(): number {
    return this._byId.size;
  }
}
