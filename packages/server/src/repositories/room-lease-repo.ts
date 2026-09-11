/**
 * RoomLeaseRepo — PostgreSQL-backed ownership lease for per-farm realtime
 * rooms (G2 T2).
 *
 * The Redis matchmaker directory shares room metadata across WS processes
 * but CANNOT guarantee that one farm has a single live authority. This repo
 * is the arbiter: at most one (roomId, instanceId) holds a non-expired
 * lease per owner, and every WS write command re-verifies the lease inside
 * its command transaction (`assertCurrent`, SELECT ... FOR UPDATE) so a
 * stale instance cannot commit asset mutations after losing ownership.
 *
 * Clock policy: ALL expiry decisions are made by the DATABASE clock via
 * `now()` in SQL — never by WS-host wall clocks, which may skew or jump.
 *
 * Semantics (per the G2 plan):
 *  - `acquire` is atomic: fresh insert (epoch 1), takeover of an EXPIRED
 *    lease (epoch + 1), or extension by the SAME holder (epoch preserved).
 *    A live lease held by a different room/instance refuses with
 *    `LeaseConflictError`.
 *  - `renew` extends a live lease only; an expired lease can never be
 *    resurrected in place (must re-`acquire`, which bumps the epoch).
 *  - `release` expires the row but keeps it (epoch preserved) so the next
 *    takeover still increments.
 *  - `assertCurrent` locks the lease row for the remainder of the command
 *    transaction, serialising against a concurrent takeover — the old
 *    owner's in-flight command either commits first (it still owns the
 *    lease) or the takeover waits.
 */

import type { Pool } from 'pg';
import type { EntityManager } from '@mikro-orm/core';

export interface RoomLease {
  ownerId: string;
  roomId: string;
  instanceId: string;
  /** Decimal string — avoids bigint precision loss on the JS side. */
  epoch: string;
  /** Lease deadline in epoch ms (DB clock at write time; informational). */
  expiresAtMs: number;
}

export class LeaseConflictError extends Error {
  constructor(
    public readonly ownerId: string,
    public readonly holder: { roomId: string; instanceId: string; expiresAtMs: number },
  ) {
    super(`farm ${ownerId} lease held by room ${holder.roomId} (instance ${holder.instanceId}) until ${new Date(holder.expiresAtMs).toISOString()}`);
    this.name = 'LeaseConflictError';
  }
}

export type LeaseLostReason = 'missing' | 'expired' | 'room-mismatch' | 'instance-mismatch' | 'epoch-mismatch';

export class LeaseLostError extends Error {
  constructor(
    public readonly ownerId: string,
    public readonly reason: LeaseLostReason,
  ) {
    super(`farm ${ownerId} lease lost (${reason})`);
    this.name = 'LeaseLostError';
  }
}

/** MikroORM projection of the lease row inside a command transaction. */
interface LeaseRow {
  room_id: string;
  instance_id: string;
  epoch: string;
  expires_at: Date | string;
}

function toLease(ownerId: string, row: LeaseRow): RoomLease {
  return {
    ownerId,
    roomId: row.room_id,
    instanceId: row.instance_id,
    epoch: String(row.epoch),
    expiresAtMs: new Date(row.expires_at).getTime(),
  };
}

export class RoomLeaseRepo {
  constructor(
    private readonly pool: Pool,
    /** Lease duration in ms. Defaults to 15s; renew ~3x per TTL. */
    private readonly ttlMs = 15_000,
  ) {}

  /**
   * Acquire (or extend) the lease for `ownerId`.
   *
   * One atomic conditional UPDATE handles takeover-of-expired and
   * same-holder-extension; a conditional INSERT handles the fresh case; a
   * final SELECT only runs on genuine conflict to report the live holder.
   * Every branch judges expiry with the DB clock.
   */
  async acquire(ownerId: string, roomId: string, instanceId: string): Promise<RoomLease> {
    const client = await this.pool.connect();
    try {
      // Take over an expired lease, or extend when the same room+instance
      // re-acquires (e.g. process rejoin after a Redis blip). A live lease
      // held by anyone else does not match → 0 rows.
      const takeover = await client.query<LeaseRow>(
        `UPDATE farm_room_leases
         SET room_id = $2,
             instance_id = $3,
             epoch = CASE
                       WHEN farm_room_leases.room_id = $2 AND farm_room_leases.instance_id = $3
                         THEN farm_room_leases.epoch
                       ELSE farm_room_leases.epoch + 1
                     END,
             expires_at = now() + $4::double precision * interval '1 millisecond',
             updated_at = now()
         WHERE owner_id = $1
           AND (expires_at <= now() OR (room_id = $2 AND instance_id = $3))
         RETURNING room_id, instance_id, epoch, expires_at`,
        [ownerId, roomId, instanceId, this.ttlMs],
      );
      if (takeover.rows.length > 0) {
        return toLease(ownerId, takeover.rows[0]!);
      }

      // No usable row — try a fresh insert (first-ever lease for this farm).
      const fresh = await client.query<LeaseRow>(
        `INSERT INTO farm_room_leases (owner_id, room_id, instance_id, epoch, expires_at, updated_at)
         VALUES ($1, $2, $3, 1, now() + $4::double precision * interval '1 millisecond', now())
         ON CONFLICT (owner_id) DO NOTHING
         RETURNING room_id, instance_id, epoch, expires_at`,
        [ownerId, roomId, instanceId, this.ttlMs],
      );
      if (fresh.rows.length > 0) {
        return toLease(ownerId, fresh.rows[0]!);
      }

      // Row exists but is live under a different holder — report it.
      const holder = await client.query<LeaseRow>(
        `SELECT room_id, instance_id, epoch, expires_at FROM farm_room_leases WHERE owner_id = $1`,
        [ownerId],
      );
      const h = holder.rows[0]!;
      throw new LeaseConflictError(ownerId, {
        roomId: h.room_id,
        instanceId: h.instance_id,
        expiresAtMs: new Date(h.expires_at).getTime(),
      });
    } finally {
      client.release();
    }
  }

  /**
   * Extend a live lease. Returns the renewed lease, or null when ownership
   * was lost (expired and/or taken over). Never resurrects an expired lease.
   */
  async renew(lease: RoomLease): Promise<RoomLease | null> {
    const client = await this.pool.connect();
    try {
      const res = await client.query<LeaseRow>(
        `UPDATE farm_room_leases
         SET expires_at = now() + $2::double precision * interval '1 millisecond',
             updated_at = now()
         WHERE owner_id = $1
           AND room_id = $3
           AND instance_id = $4
           AND epoch = $5::bigint
           AND expires_at > now()
         RETURNING room_id, instance_id, epoch, expires_at`,
        [lease.ownerId, this.ttlMs, lease.roomId, lease.instanceId, lease.epoch],
      );
      return res.rows.length > 0 ? toLease(lease.ownerId, res.rows[0]!) : null;
    } finally {
      client.release();
    }
  }

  /**
   * Voluntarily expire the caller's own lease. The row is kept (epoch
   * preserved) so the next takeover increments the epoch. A no-op when the
   * lease was already lost, expired, or taken over.
   */
  async release(lease: RoomLease): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE farm_room_leases
         SET expires_at = now(), updated_at = now()
         WHERE owner_id = $1
           AND room_id = $2
           AND instance_id = $3
           AND epoch = $4::bigint
           AND expires_at > now()`,
        [lease.ownerId, lease.roomId, lease.instanceId, lease.epoch],
      );
    } finally {
      client.release();
    }
  }

  /** The live lease for an owner, or null when none is unexpired. */
  async findCurrent(ownerId: string): Promise<RoomLease | null> {
    const client = await this.pool.connect();
    try {
      const res = await client.query<LeaseRow>(
        `SELECT room_id, instance_id, epoch, expires_at
         FROM farm_room_leases
         WHERE owner_id = $1 AND expires_at > now()`,
        [ownerId],
      );
      return res.rows.length > 0 ? toLease(ownerId, res.rows[0]!) : null;
    } finally {
      client.release();
    }
  }

  /**
   * Fencing check — MUST run inside the command's transaction. Locks the
   * lease row (SELECT ... FOR UPDATE) so a concurrent takeover cannot
   * interleave with the command, then verifies the caller still owns the
   * lease. Throws `LeaseLostError` with the specific mismatch reason.
   *
   * The row lock is held until the command transaction commits, closing the
   * "checked once, wrote later" window a lock-free check would leave.
   */
  async assertCurrent(em: EntityManager, lease: RoomLease): Promise<void> {
    // `em.getConnection()` returns the transactional connection inside an
    // open transaction, so the FOR UPDATE lock participates in the command's
    // own transaction.
    const rows = (await em.getConnection().execute<LeaseRow[]>(
      `SELECT room_id, instance_id, epoch, expires_at
       FROM farm_room_leases
       WHERE owner_id = ? AND expires_at > now()
       FOR UPDATE`,
      [lease.ownerId],
    )) as LeaseRow[];
    if (!rows || rows.length === 0) {
      throw new LeaseLostError(lease.ownerId, 'expired');
    }
    const row = rows[0]!;
    if (row.room_id !== lease.roomId) {
      throw new LeaseLostError(lease.ownerId, 'room-mismatch');
    }
    if (row.instance_id !== lease.instanceId) {
      throw new LeaseLostError(lease.ownerId, 'instance-mismatch');
    }
    if (String(row.epoch) !== lease.epoch) {
      throw new LeaseLostError(lease.ownerId, 'epoch-mismatch');
    }
  }
}
