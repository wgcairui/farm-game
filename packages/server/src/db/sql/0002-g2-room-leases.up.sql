-- G2 T2: per-farm room ownership lease.
--
-- PostgreSQL is the SOLE arbiter of "which room instance is the live
-- authority for a farm". The Redis matchmaker directory only shares room
-- metadata across WS processes; it cannot guarantee business-level single
-- ownership. Every WS write command re-verifies this lease row inside its
-- command transaction (SELECT ... FOR UPDATE) so a stale instance whose
-- lease was taken over cannot commit asset mutations (fencing).
--
--  - owner_id      one arbitration row per farm owner (the lease PK).
--  - room_id       Colyseus roomId currently holding the farm.
--  - instance_id   WS process that owns the room (unique per process boot).
--  - epoch         incremented on every takeover; used to fence old owners.
--                  bigint in SQL, decimal string over the wire (exceeds
--                  Number.MAX_SAFE_INTEGER only after ~9e15 takeovers, but
--                  the string form is free and future-proof).
--  - expires_at    lease deadline; judged by the DATABASE clock (now()),
--                  never by WS-host wall clocks.
--
-- Releases keep the row with expires_at = now() (epoch preserved) so the
-- next takeover still increments the epoch — a released lease can never be
-- silently resurrected with a stale epoch.

CREATE TABLE IF NOT EXISTS farm_room_leases (
  -- Matches players.player_id (VARCHAR(36)), per the G1 schema.
  owner_id    VARCHAR(36) PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  room_id     TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  epoch       BIGINT NOT NULL DEFAULT 1,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
