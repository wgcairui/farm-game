-- Reverse 0004 — drop the partial index, then the column. DROP COLUMN
-- IF EXISTS guards against a no-op rollback that already ran.

DROP INDEX IF EXISTS players_banned_at_idx;
ALTER TABLE players DROP COLUMN IF EXISTS banned_at;
