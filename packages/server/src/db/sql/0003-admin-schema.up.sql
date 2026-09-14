-- Stage B: admin schema (ADR-0006 D44/D49).
--
-- Single PostgreSQL database; admin data lives in the `admin` schema, the
-- business data lives in `public`. Both are managed by the same MikroORM
-- connection (see `src/db/mikro-orm.config.ts`). Admin writes that mutate
-- business tables + audit rows commit in one transaction (D49) — this is
-- only possible because the two schemas share a database / connection /
-- EM context.
--
-- Idempotent — uses IF NOT EXISTS so the migration can be re-run against
-- a fresh database or one that already has the schema applied.

CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE IF NOT EXISTS admin.admin_users (
  id              BIGSERIAL    PRIMARY KEY,
  username        VARCHAR(64)  NOT NULL UNIQUE,
  password_hash   TEXT         NOT NULL,
  role            VARCHAR(32)  NOT NULL DEFAULT 'operator',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ,
  disabled_at     TIMESTAMPTZ,
  CONSTRAINT admin_users_role_chk CHECK (role IN ('operator', 'admin'))
);
CREATE INDEX IF NOT EXISTS admin_users_username_idx ON admin.admin_users (username);

CREATE TABLE IF NOT EXISTS admin.admin_audit_log (
  id                 BIGSERIAL    PRIMARY KEY,
  admin_user_id      BIGINT       NOT NULL REFERENCES admin.admin_users(id) ON DELETE RESTRICT,
  action             VARCHAR(64)  NOT NULL,
  target_player_id   VARCHAR(36),
  payload            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ip                 VARCHAR(64),
  user_agent         TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON admin.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_user_id_idx
  ON admin.admin_audit_log (admin_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_player_id_idx
  ON admin.admin_audit_log (target_player_id)
  WHERE target_player_id IS NOT NULL;
