/**
 * `withAdminAudit` — atomic "do business work + write audit" helper that
 * implements ADR-0006 D49.
 *
 * Every admin write that mutates a business row (ban a player, release
 * a lease, drain a process) MUST commit an `admin.admin_audit_log` row
 * in the SAME transaction. A successful business mutation can never
 * lose its audit trail; a failed audit insert rolls back the business
 * change too. This is only possible because business + admin schemas
 * share one PostgreSQL database / one MikroORM connection / one EM
 * (D44), so the audit row lives on the same transactional context
 * as the business mutation.
 *
 * The signature is intentionally narrow:
 *   ```ts
 *   withAdminAudit(em, entry, work) → Promise<T>
 *   ```
 * - `em`: a freshly forked MikroORM EntityManager (caller-owned; never
 *   shared across requests per ADR-0003 D25).
 * - `entry`: audit-log row metadata (admin user id, action, target,
 *   ip, user agent, payload).
 * - `work`: the business-side mutation. Returns the result T.
 *
 * Failure semantics: any thrown error inside `work` rolls back the
 * audit insert as well. We DO NOT commit the business change alone and
 * then asynchronously write the audit row — that violates D49 and was
 * explicitly rejected when ADR-0006 was written.
 *
 * Test note: the cross-transaction contract (D49) is exercised in
 * `test/integration/admin-ops-routes.test.ts` by deliberately throwing
 * inside `work` and asserting that BOTH the business row AND the audit
 * row are absent afterwards.
 */

import type { EntityManager } from '@mikro-orm/core';
import { AdminAuditLogEntity } from '../db/entities/admin/AdminAuditLog.js';
import type { AuditEntry } from '../repositories/admin-repo.js';

export interface AuditMeta extends AuditEntry {
  /** Optional override for the timestamp; defaults to `new Date()`. */
  createdAt?: Date;
}

export async function withAdminAudit<T>(
  em: EntityManager,
  entry: AuditMeta,
  work: () => Promise<T>,
): Promise<T> {
  return em.transactional(async (tx) => {
    const result = await work();
    const row = tx.create(AdminAuditLogEntity, {
      adminUserId: entry.adminUserId,
      action: entry.action,
      targetPlayerId: entry.targetPlayerId ?? null,
      payload: entry.payload ?? {},
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      createdAt: entry.createdAt ?? new Date(),
    });
    tx.persist(row);
    return result;
  });
}
