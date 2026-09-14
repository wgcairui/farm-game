-- Stage D: admin ban support. Adds `players.banned_at` so the
-- `/admin-ops/players/:playerId/ban` route can mark a player without
-- needing a separate `admin.player_bans` table. The timestamp is NULL
-- for active players and set to now() when an admin bans them; we never
-- unban in v2 (an unban would just be a future admin route that clears
-- the column).
--
-- Idempotent — uses ADD COLUMN IF NOT EXISTS so re-running against a
-- fresh database or one already seeded is a no-op.

ALTER TABLE players ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS players_banned_at_idx ON players (banned_at) WHERE banned_at IS NOT NULL;
