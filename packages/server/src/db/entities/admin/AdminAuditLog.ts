/**
 * AdminAuditLog entity — one row per admin write operation.
 *
 * Per ADR-0006 D49: ban / lease-release / process-drain / login all commit
 * a row here in the SAME transaction as the business-table mutation, so a
 * successful business change can never lose its audit trail and a failed
 * audit insert rolls back the business change too.
 *
 * `targetPlayerId` is nullable: not every action targets a player
 * (e.g. `process.drain` targets a WS instance, `auth.login` is a system
 * action). The partial index over non-null target_player_id keeps the
 * "what did we do to player X" query cheap without bloating the index
 * with nulls.
 *
 * `payload` carries the action-specific context (old vs new gold for a
 * ban; lease row snapshot for a release; etc.). It is JSONB so Refine /
 * admin-web (Stage E) can render it directly without a fixed schema.
 *
 * `ip` is stored as VARCHAR rather than PostgreSQL `INET` to keep the
 * MikroORM type map minimal in v2; a future ADR can migrate to `INET`
 * with a `USING ip::inet` ALTER. The application-side validator enforces
 * a sane length cap (≤ 64) and strips port if present.
 */

import { defineEntity } from '@mikro-orm/core';

export class AdminAuditLog {
  id!: number;
  adminUserId!: number;
  action!: string;
  targetPlayerId!: string | null;
  payload!: Record<string, unknown>;
  ip!: string | null;
  userAgent!: string | null;
  createdAt!: Date;
}

export const AdminAuditLogEntity = defineEntity({
  class: AdminAuditLog,
  tableName: 'admin_audit_log',
  schema: 'admin',
  primaryKeys: ['id'],
  properties: (p) => ({
    id: p.bigint().primary().autoincrement(),
    adminUserId: p.bigint().index(),
    action: p.string().length(64),
    targetPlayerId: p.string().length(36).nullable(),
    payload: p.json().default('{}'),
    ip: p.string().length(64).nullable(),
    userAgent: p.text().nullable(),
    createdAt: p.datetime().defaultRaw('now()'),
  }),
});
