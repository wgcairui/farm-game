/**
 * FarmRoom — realtime room for ONE player's farm (G2).
 *
 * T2 skeleton: ownership + lifecycle only. The lease in PostgreSQL is the
 * single authority for "which room instance owns this farm" — Redis room
 * discovery (driver/presence) never grants write rights. T3 adds JWT auth
 * (onAuth), the four farm commands (reusing `services/farm/*` via the
 * shared `executeCommand` path with lease fencing), and the full-snapshot
 * broadcast; T4 adds reconnect/refresh scheduling.
 *
 * Room id == farm ownerId, so room identity is auditable end-to-end: the
 * lease row, the Colyseus directory entry, and the fencing checks all name
 * the same farm.
 *
 * Dependency injection: Colyseus instantiates room classes itself, so the
 * process entry calls `configureFarmRoom(...)` once at boot with the
 * bootstrap resources; the class reads them via module scope.
 */

import { Room, type Client } from '@colyseus/core';
import { RoomLeaseRepo, LeaseConflictError, type RoomLease } from '../repositories/room-lease-repo.js';
import type { ServerConfig } from '../config.js';
import { logger } from '../obs/logger.js';

export interface FarmRoomContext {
  leases: RoomLeaseRepo;
  config: ServerConfig;
  instanceId: string;
}

let roomContext: FarmRoomContext | null = null;

/** Called once per WS process by `realtime/serve.ts` before listening. */
export function configureFarmRoom(ctx: FarmRoomContext): void {
  roomContext = ctx;
}

function requireContext(): FarmRoomContext {
  if (!roomContext) {
    throw new Error('FarmRoom used before configureFarmRoom() — boot the WS entry via realtime/serve.ts');
  }
  return roomContext;
}

export interface FarmRoomJoinOptions {
  /**
   * T2 skeleton: the farm owner this room serves. T3 replaces this with
   * JWT verification in `onAuth` — the client-supplied value is then
   * cross-checked against the verified token subject.
   */
  ownerId?: unknown;
}

export class FarmRoom extends Room {
  // Same-owner multi-device reconnect cap; made configurable with T3 auth.
  override maxClients = 4;

  private lease: RoomLease | null = null;
  private renewHandle: { clear(): void } | null = null;

  override async onCreate(options: FarmRoomJoinOptions): Promise<void> {
    const ctx = requireContext();
    const { ownerId } = options;
    // 36 = the players.player_id column width (VARCHAR(36)); a JWT sub is a
    // UUID, so anything longer is malformed. T3 verifies ownership against
    // the token subject in onAuth.
    if (typeof ownerId !== 'string' || ownerId.length === 0 || ownerId.length > 36) {
      throw new Error('FarmRoom requires options.ownerId (≤36 chars; T3 will verify it against the JWT subject)');
    }

    // Room identity = farm identity. See module doc.
    this.roomId = ownerId;

    // Fail the room creation when another live instance owns the farm.
    // The client's join attempt fails with a matchmaking error and can
    // retry — `join` would then route to the existing room via the shared
    // driver directory.
    let lease: RoomLease;
    try {
      lease = await ctx.leases.acquire(ownerId, this.roomId, ctx.instanceId);
    } catch (err) {
      if (err instanceof LeaseConflictError) {
        logger.warn(
          { ownerId, holder: err.holder, instanceId: ctx.instanceId },
          'farm room lease held by another instance; refusing room creation',
        );
      }
      throw err;
    }
    this.lease = lease;

    // Colyseus does NOT call onDispose when onCreate throws (verified against
    // core 0.18.12 handleCreateRoom) — everything after the acquire must
    // release the lease itself on failure, or it dangles until TTL expiry.
    try {
      logger.info(
        { ownerId, roomId: this.roomId, instanceId: ctx.instanceId, epoch: this.lease.epoch },
        'farm room lease acquired',
      );

      // Renew at config.leaseRenewMs. On loss (expired/taken over) the room
      // MUST stop acting as an authority — disconnect everyone and dispose;
      // the surviving instance rebuilds from PostgreSQL. (Full fault handling
      // and drain semantics land in T4; the skeleton already refuses to serve
      // after ownership loss.)
      this.renewHandle = this.clock.setInterval(async () => {
        if (!this.lease) return;
        const renewed = await ctx.leases.renew(this.lease).catch((err) => {
          logger.error({ err, ownerId: this.roomId }, 'farm room lease renew failed');
          return null;
        });
        if (!renewed) {
          logger.error({ ownerId: this.roomId, instanceId: ctx.instanceId }, 'farm room lease lost; disconnecting');
          this.lease = null;
          this.stopRenew();
          await this.disconnect().catch((err) => {
            logger.warn({ err, ownerId: this.roomId }, 'disconnect after lease loss failed');
          });
          return;
        }
        this.lease = renewed;
      }, ctx.config.leaseRenewMs);
    } catch (err) {
      this.stopRenew();
      const leaseToRelease = this.lease;
      this.lease = null;
      await ctx.leases.release(leaseToRelease).catch(() => undefined);
      throw err;
    }
  }

  override onJoin(_client: Client): void {
    // T3: send the full snapshot (welcome) after JWT auth + lease check.
  }

  override onLeave(_client: Client, _code: number): void {
    // T3/T4: presence bookkeeping; multi-connection rooms keep serving.
  }

  override async onDispose(): Promise<void> {
    this.stopRenew();
    const ctx = requireContext();
    if (this.lease) {
      const lease = this.lease;
      this.lease = null;
      try {
        await ctx.leases.release(lease);
        logger.info({ ownerId: this.roomId, epoch: lease.epoch }, 'farm room lease released');
      } catch (err) {
        // Best-effort: the lease expires on its own; release is an
        // optimisation to shorten takeover latency.
        logger.warn({ err, ownerId: this.roomId }, 'farm room lease release failed');
      }
    }
  }

  private stopRenew(): void {
    if (this.renewHandle) {
      this.renewHandle.clear();
      this.renewHandle = null;
    }
  }
}
