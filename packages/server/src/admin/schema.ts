/**
 * Admin schema placeholder — v2 路径。
 *
 * v1 计划（Drizzle table definitions for `@colyseus/admin`）已废弃（2026-09-14）。
 * v2 计划：实体作为 MikroORM entities 落在 `src/db/entities/admin/`
 *   - `AdminUser.ts`      (id, username, password_hash, created_at, last_login_at)
 *   - `AdminAuditLog.ts`  (id, admin_user_id, action, target_player_id, payload_jsonb, created_at)
 *   - `AdminSession.ts`   (可选，stateless JWT 模式可以不要)
 *
 * 所有 admin entities 属于同一个 Postgres DB 的 `admin` schema（同一份 MikroORM 连接）。
 * 详见 [`docs/admin-integration.md`](../../../../docs/admin-integration.md) v2。
 */

export const AdminTablesPhase2 = {
  users: 'admin_users',
  sessions: 'admin_sessions',
  auditLog: 'admin_audit_log',
} as const;