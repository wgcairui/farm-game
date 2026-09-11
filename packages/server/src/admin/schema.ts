/**
 * Drizzle table definitions for the admin DB — Phase 2.
 *
 * Schema listed here so Phase 2 reviewers can see the planned surface area:
 *   - admin_users      (id, username, password_hash, created_at, last_login_at)
 *   - admin_sessions   (id, user_id, expires_at, revoked_at)
 *   - admin_audit_log  (id, user_id, action, target, payload_jsonb, created_at)
 *
 * Phase 1: no actual table definitions; file exists so the boundary is explicit.
 */

export const AdminTablesPhase2 = {
  users: 'admin_users',
  sessions: 'admin_sessions',
  auditLog: 'admin_audit_log',
} as const;