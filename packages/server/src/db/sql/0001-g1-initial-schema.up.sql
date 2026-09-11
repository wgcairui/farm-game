-- G1 initial schema — players, auth_identities, plots, operation_receipts.
--
-- Per ADR-0003:
--  - D17: operation_receipts carries a UNIQUE (player_id, operation_id) index
--  - D18: players.revision is bumped atomically with each write command
--  - D19: revision is independent of PlayerSave.version
--  - D23: plot status is read-derived (growing → ripe when matureAt <= now),
--    no background worker is required
--  - D30: all tables use CHECK constraints for non-negative integers
--
-- Idempotent — uses IF NOT EXISTS so the migration can be re-run against
-- a fresh database or one that's already been seeded.

CREATE TABLE IF NOT EXISTS players (
  player_id              VARCHAR(36) PRIMARY KEY,
  nickname               VARCHAR(64),
  avatar_url             VARCHAR(512),
  gold                   INTEGER NOT NULL DEFAULT 200 CHECK (gold >= 0),
  gems                   INTEGER NOT NULL DEFAULT 0  CHECK (gems >= 0),
  level                  INTEGER NOT NULL DEFAULT 1  CHECK (level >= 1),
  exp                    INTEGER NOT NULL DEFAULT 0  CHECK (exp >= 0),
  music_volume           DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  sfx_volume             DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  notifications_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  revision               INTEGER NOT NULL DEFAULT 0  CHECK (revision >= 0),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id          BIGSERIAL PRIMARY KEY,
  player_id   VARCHAR(36) NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  provider    VARCHAR(32) NOT NULL,
  tenant_id   VARCHAR(128) NOT NULL DEFAULT '',
  subject     VARCHAR(256) NOT NULL,
  bound_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_provider_tenant_subject_uniq UNIQUE (provider, tenant_id, subject)
);
CREATE INDEX IF NOT EXISTS auth_identities_player_id_idx ON auth_identities (player_id);

CREATE TABLE IF NOT EXISTS plots (
  id          VARCHAR(96) PRIMARY KEY,
  player_id   VARCHAR(36) NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  "index"     INTEGER NOT NULL CHECK ("index" >= 0 AND "index" < 24),
  unlocked    BOOLEAN NOT NULL DEFAULT FALSE,
  status      VARCHAR(16) NOT NULL DEFAULT 'locked',
  crop_id     VARCHAR(32),
  planted_at  TIMESTAMPTZ,
  mature_at   TIMESTAMPTZ,
  water_count INTEGER NOT NULL DEFAULT 0 CHECK (water_count >= 0),
  CONSTRAINT plots_player_id_index_uniq UNIQUE (player_id, "index")
);
CREATE INDEX IF NOT EXISTS plots_player_id_idx ON plots (player_id);

CREATE TABLE IF NOT EXISTS operation_receipts (
  id             BIGSERIAL PRIMARY KEY,
  player_id      VARCHAR(36) NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  operation_id   VARCHAR(64) NOT NULL,
  command        VARCHAR(32) NOT NULL,
  request_hash   VARCHAR(64) NOT NULL,
  ok             BOOLEAN NOT NULL,
  response_code  INTEGER,
  response_data  JSONB,
  revision_after INTEGER CHECK (revision_after >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT operation_receipts_player_id_operation_id_uniq UNIQUE (player_id, operation_id)
);
CREATE INDEX IF NOT EXISTS operation_receipts_player_id_idx ON operation_receipts (player_id);