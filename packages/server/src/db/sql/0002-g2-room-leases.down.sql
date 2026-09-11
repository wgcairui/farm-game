-- Roll back G2 T2 room-lease coordination table.
-- Only drops the lease table; business data (players/plots/receipts) is
-- untouched. Realtime rooms lose ownership arbitration after this runs —
-- do not roll back while WS processes are live.

DROP TABLE IF EXISTS farm_room_leases;
