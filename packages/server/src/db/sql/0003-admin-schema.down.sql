-- Reverse 0003-admin-schema: drop the audit log table first (it references
-- admin_users), then the users table, then the schema itself.

DROP TABLE IF EXISTS admin.admin_audit_log;
DROP TABLE IF EXISTS admin.admin_users;
-- Only drop the schema if no other objects remain; using IF EXISTS guards
-- against an idempotent rollback that has already removed the tables.
DROP SCHEMA IF EXISTS admin;
