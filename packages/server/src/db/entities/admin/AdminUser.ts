/**
 * AdminUser entity — one row per registered admin operator.
 *
 * Per ADR-0006 D44: lives in the `admin` schema of the same PostgreSQL
 * database that hosts the business `public` schema. The whole stack
 * (admin + business) shares one MikroORM connection — admin writes that
 * mutate business tables (e.g. `players.banned_at`) commit in the same
 * transaction as their `admin_audit_log` row (D49).
 *
 * `password_hash` is a textual hash produced by `src/obs/password.ts`
 * (argon2id in production, scrypt as a no-native-dep fallback; see
 * ADR-0007 for the algorithm choice). The plaintext is never persisted
 * and never logged.
 *
 * `role` is intentionally narrow at MVP — `'operator'` (everyday actions:
 * ban player, release lease, drain process) and `'admin'` (elevated; future
 * use). Complex RBAC is left to v3 per ADR-0006 §7.
 */

import { defineEntity } from '@mikro-orm/core';

export class AdminUser {
  id!: number;
  username!: string;
  passwordHash!: string;
  role!: string;
  createdAt!: Date;
  lastLoginAt!: Date | null;
  disabledAt!: Date | null;
}

export const AdminUserEntity = defineEntity({
  class: AdminUser,
  tableName: 'admin_users',
  schema: 'admin',
  primaryKeys: ['id'],
  properties: (p) => ({
    id: p.bigint().primary().autoincrement(),
    username: p.string().length(64).unique(),
    passwordHash: p.text(),
    role: p.string().length(32).default('operator'),
    createdAt: p.datetime().defaultRaw('now()'),
    lastLoginAt: p.datetime().nullable(),
    disabledAt: p.datetime().nullable(),
  }),
});
