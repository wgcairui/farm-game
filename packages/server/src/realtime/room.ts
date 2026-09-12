/**
 * FarmRoom — realtime room for ONE player's farm (G2, T3 full version).
 *
 * Ownership + lifecycle (T2): the lease in PostgreSQL is the single authority
 * for "which room instance owns this farm" — Redis room discovery
 * (driver/presence) never grants write rights. Room id == farm ownerId, so
 * room identity is auditable end-to-end: the lease row, the Colyseus
 * directory entry, and the fencing checks all name the same farm.
 *
 * T3 adds:
 *  - `onAuth`: JWT verification (fast-jwt, same secret/iss/aud policy as the
 *    HTTP entry — see auth/verify.ts) with a strict
 *    `options.ownerId === token.sub` cross-check; only the farm's owner can
 *    join. The verified playerId travels via `client.auth`.
 *  - `onJoin`: full DB projection sent once as `welcome`.
 *  - `farm_cmd` handler: the four write commands through the SAME
 *    `executeCommand` path as HTTP (shared receipts → cross-transport
 *    idempotency). The lease is re-asserted INSIDE the command transaction
 *    (`assertCurrent` → SELECT ... FOR UPDATE + epoch check), so a room that
 *    lost ownership to another instance can never commit asset changes.
 *  - broadcasts: `plot_updated` + `gold_updated` to every connection after a
 *    successful command; failures answer only the requester.
 *
 * No synchronized Colyseus state object: the database is the sole authority,
 * messages are projections of it (see shared/protocol/ws.ts).
 *
 * Dependency injection: Colyseus instantiates room classes itself, so the
 * process entry calls `configureFarmRoom(...)` once at boot with the
 * bootstrap resources; the class reads them via module scope.
 */

import { Room, type Client } from '@colyseus/core';
import {
  ErrorCode,
  type FarmCmdName,
  type PlotState,
} from '@farm-game/shared';
import { MikroORM } from '@mikro-orm/core';
import { RoomLeaseRepo, LeaseConflictError, LeaseLostError, type RoomLease } from '../repositories/room-lease-repo.js';
import { MikroORMPlayerRepo } from '../repositories/MikroORMPlayerRepo.js';
import type { TransactionRunner } from '../repositories/transaction.js';
import { LEASE_RENEW_FAILURES_ALLOWED, type ServerConfig } from '../config.js';
import type { PlayerSave } from '@farm-game/shared';
import { verifyAccessToken, WsAuthError } from '../auth/verify.js';
import { unlockCommand } from '../services/farm/unlock.js';
import { plantCommand } from '../services/farm/plant.js';
import { waterCommand } from '../services/farm/water.js';
import { harvestCommand } from '../services/farm/harvest.js';
import { executeCommand, toCommandResponse, type ExecuteResult } from '../services/farm/execute.js';
import type { CommandOutcome } from '../services/farm/outcome.js';
import { FARM_CMD_MESSAGE, FARM_REFRESH_MESSAGE, parseFarmCmd, parseFarmRefresh, serverEnvelope } from './ws-messages.js';
import type { RevisionWatchedRoom } from './revision-watcher.js';
import { logger } from '../obs/logger.js';

export interface FarmRoomContext {
  leases: RoomLeaseRepo;
  config: ServerConfig;
  instanceId: string;
  repo: MikroORMPlayerRepo;
  tx: TransactionRunner;
  orm: MikroORM;
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
   * The farm this room serves. Used by matchmaking (`filterBy(['ownerId'])`)
   * to route the join, then cross-checked in `onAuth` against the token
   * subject — a client can only ever open its OWN farm room.
   */
  ownerId?: unknown;
  /** Access token minted by the HTTP login (POST /auth/*). */
  token?: unknown;
}

/** Value returned by `onAuth`, available to handlers as `client.auth`. */
export interface FarmAuth {
  playerId: string;
}

function authOf(client: Client): FarmAuth | null {
  const auth = client.auth as Partial<FarmAuth> | undefined;
  return auth && typeof auth.playerId === 'string' ? { playerId: auth.playerId } : null;
}

// ── active room registry (T4) ──
// The revision watcher polls the owners of these rooms once per tick.
// Rooms register after the lease is acquired and unregister on dispose.
const activeRooms = new Set<FarmRoom>();

/** Live snapshot of active farm rooms — consumed by the revision watcher. */
export function activeFarmRooms(): FarmRoom[] {
  return Array.from(activeRooms);
}

export class FarmRoom extends Room implements RevisionWatchedRoom {
  // Same-owner multi-device reconnect cap.
  override maxClients = 4;

  private lease: RoomLease | null = null;
  private renewHandle: { clear(): void } | null = null;
  /** Consecutive lease-renew failures tolerated before the room stops serving. */
  private renewFailures = 0;
  /**
   * Highest `players.revision` this room has projected to its clients — the
   * dedup key for the external-change watcher. -1 until the first snapshot.
   */
  private projectedRevision = -1;

  /** RevisionWatchedRoom — the farm this room serves. */
  get ownerId(): string {
    return this.roomId;
  }

  /** RevisionWatchedRoom — dedup key read by the revision watcher. */
  get lastProjectedRevision(): number {
    return this.projectedRevision;
  }

  override async onCreate(options: FarmRoomJoinOptions): Promise<void> {
    const ctx = requireContext();
    const { ownerId } = options;
    // 36 = the players.player_id column width (VARCHAR(36)); a JWT sub is a
    // UUID, so anything longer is malformed. onAuth verifies ownership
    // against the token subject before any client can interact.
    if (typeof ownerId !== 'string' || ownerId.length === 0 || ownerId.length > 36) {
      throw new Error('FarmRoom requires options.ownerId (≤36 chars; verified against the JWT subject in onAuth)');
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
      activeRooms.add(this);

      // Room-level message dispatch: registered once, independent of the
      // (re)connecting client set. Same-owner multi-device joins all share it.
      this.onMessage(FARM_CMD_MESSAGE, (client, raw) => {
        // fire-and-forget: Colyseus message handlers may be async; errors are
        // answered to the requester inside handleFarmCmd and never rethrown.
        void this.handleFarmCmd(client, raw);
      });
      this.onMessage(FARM_REFRESH_MESSAGE, (client, raw) => {
        void this.handleFarmRefresh(client, raw);
      });

      // Renew at config.leaseRenewMs. Transient DB failures are tolerated up
      // to LEASE_RENEW_FAILURES_ALLOWED consecutive misses (the budget
      // N × leaseRenewMs < leaseTtlMs is enforced in loadConfig) — writes
      // stay fenced by assertCurrent the whole time. At N the room stops
      // serving; the surviving instance rebuilds from PostgreSQL. (Drain
      // semantics across processes land in T5.)
      this.renewHandle = this.clock.setInterval(async () => {
        if (!this.lease) return;
        const renewed = await ctx.leases.renew(this.lease).catch((err) => {
          logger.error({ err, ownerId: this.roomId }, 'farm room lease renew failed');
          return null;
        });
        await this.handleRenewResult(renewed);
      }, ctx.config.leaseRenewMs);
    } catch (err) {
      this.stopRenew();
      activeRooms.delete(this);
      const leaseToRelease = this.lease;
      this.lease = null;
      await ctx.leases.release(leaseToRelease).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Runs after matchmaking + onCreate, before onJoin. Any throw rejects the
   * join with a matchmaking error client-side. Returns the auth payload that
   * lands on `client.auth`.
   */
  override onAuth(client: Client, options: FarmRoomJoinOptions): FarmAuth {
    const ctx = requireContext();
    const verified = verifyAccessToken(options.token, ctx.config);

    // The room is addressed by ownerId (matchmaking) — the token subject
    // must name the SAME farm, otherwise the join is refused. This is what
    // keeps one player from opening another player's farm room.
    if (options.ownerId !== verified.sub) {
      logger.warn({ sub: verified.sub, requestedOwner: options.ownerId }, 'farm join rejected: owner mismatch');
      throw new WsAuthError(ErrorCode.NOT_AUTHENTICATED, 'farm owner mismatch');
    }
    return { playerId: verified.sub };
  }

  override async onJoin(client: Client): Promise<void> {
    const auth = authOf(client);
    if (!auth) {
      // Unreachable via the onAuth path; defensive against lifecycle changes.
      logger.warn({ roomId: this.roomId }, 'onJoin without auth payload; leaving');
      client.leave();
    }
    // NOTE: no snapshot push here. Colyseus sends JOIN_ROOM only AFTER
    // onJoin() returns, so a message pushed here reaches the client BEFORE
    // its join completes — SDK clients cannot have handlers registered yet
    // and would drop it. Clients pull the snapshot via `farm_refresh`
    // (see shared/protocol/ws.ts); the G3 raw-socket client may buffer
    // pre-join frames and use the push.
  }

  /** Pull path for the full snapshot — deterministic and reconnect-safe. */
  private async handleFarmRefresh(client: Client, raw: unknown): Promise<void> {
    const parsed = parseFarmRefresh(raw);
    if (!parsed.ok) {
      this.sendError(client, undefined, parsed.code, parsed.message);
      return;
    }
    const auth = authOf(client);
    if (!auth) {
      this.sendError(client, undefined, ErrorCode.NOT_AUTHENTICATED, 'connection is not authenticated');
      return;
    }
    await this.sendWelcome(client, auth);
  }

  /** Read-only full projection — a forked EM without a transaction is fine; the snapshot is advisory. */
  private async sendWelcome(client: Client, auth: FarmAuth): Promise<void> {
    const ctx = requireContext();
    const player = await ctx.repo.materialisePlayer(ctx.orm.em.fork(), auth.playerId);
    if (!player) {
      logger.error({ playerId: auth.playerId, roomId: this.roomId }, 'authenticated player has no DB row; leaving');
      client.leave();
      return;
    }
    this.noteProjected(player.revision);
    client.send(
      'welcome',
      serverEnvelope('welcome', { serverNow: Date.now(), roomId: this.roomId, player }),
    );
  }

  /**
   * External-change delivery (called by the revision watcher): broadcast a
   * fresh full snapshot to every connection. The watcher only calls this when
   * the DB revision moved; the guard keeps a slow materialisation from
   * overwriting a newer room-command projection.
   */
  applyExternalUpdate(player: PlayerSave): void {
    if (player.revision <= this.projectedRevision) return;
    this.noteProjected(player.revision);
    logger.debug({ roomId: this.roomId, revision: player.revision }, 'broadcasting out-of-band state change');
    this.broadcast('welcome', serverEnvelope('welcome', { serverNow: Date.now(), roomId: this.roomId, player }));
  }

  private noteProjected(revision: number): void {
    if (revision > this.projectedRevision) {
      this.projectedRevision = revision;
    }
  }

  override onLeave(_client: Client, _code: number): void {
    // Consented leaves get no reconnection seat — the client chose to go.
    // Multi-connection rooms keep serving; per-device bookkeeping is G3+.
  }

  /**
   * Network drop / abnormal close (any non-consented close code routes here
   * instead of onLeave — core 0.18.12 `_onLeave`). Offer a reconnection seat:
   * the room keeps its lease and keeps serving remaining connections while
   * the seat is pending. The reconnecting client re-enters WITHOUT re-running
   * onAuth (the reconnection token is the capability issued to the
   * authenticated client) and lands in `onReconnect`.
   */
  override async onDrop(client: Client, code?: number): Promise<void> {
    const ctx = requireContext();
    await this.allowReconnection(client, ctx.config.roomReconnectTtlSec).catch(() => {
      // Seat expired without a reconnect — room drains via autoDispose.
      logger.debug({ roomId: this.roomId, code: code ?? null }, 'reconnection seat expired');
    });
  }

  /**
   * Reconnect completion — onAuth/onJoin are SKIPPED on this path (core
   * 0.18.12), `client.auth` is restored by the framework. The client pulls a
   * fresh snapshot via `farm_refresh` (the join-time push ordering issue
   * applies to reconnection too).
   */
  override async onReconnect(client: Client): Promise<void> {
    const auth = authOf(client);
    logger.info({ roomId: this.roomId, playerId: auth?.playerId ?? null }, 'farm client reconnected');
  }

  override async onDispose(): Promise<void> {
    this.stopRenew();
    activeRooms.delete(this);
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

  // ── farm_cmd ──

  private async handleFarmCmd(client: Client, raw: unknown): Promise<void> {
    const ctx = requireContext();

    const parsed = parseFarmCmd(raw);
    if (!parsed.ok) {
      this.sendError(client, parsed.operationId, parsed.code, parsed.message);
      return;
    }
    const { command, operationId, body } = parsed.cmd;

    const auth = authOf(client);
    if (!auth) {
      this.sendError(client, operationId, ErrorCode.NOT_AUTHENTICATED, 'connection is not authenticated');
      return;
    }

    const lease = this.lease;
    if (!lease) {
      // The room lost ownership (renew failed / takeover) — it must not
      // process writes even though the socket may still be up.
      this.sendError(client, operationId, ErrorCode.LEASE_LOST, 'farm room no longer holds the lease; reconnect');
      return;
    }

    try {
      const result = await executeCommand({ repo: ctx.repo, tx: ctx.tx }, {
        command,
        playerId: auth.playerId,
        operationId,
        body,
        run: async ({ em, playerId, serverNow }) => {
          // Fencing: re-assert ownership INSIDE the command transaction, on
          // the same connection that will commit — a room whose lease was
          // taken over rolls back instead of writing (ADR-0003 + G2 plan).
          await ctx.leases.assertCurrent(em, lease);
          return runFarmCommand(command, { em, playerId, operationId, body, serverNow });
        },
      });

      if (result.ok) {
        this.noteProjected(result.revision);
        client.send('cmd_result', serverEnvelope('cmd_result', toCommandResponse(operationId, result), operationId));
        this.broadcastCommandEffects(result);
      } else {
        // Deterministic business failure — persisted as a receipt by the
        // service (same semantics as the HTTP 4xx projection).
        this.sendError(client, operationId, result.code ?? ErrorCode.BAD_REQUEST, result.message ?? 'command failed');
      }
    } catch (err) {
      if (err instanceof LeaseLostError) {
        // The transaction rolled back — command and receipt are both
        // unwritten, so the client may retry the same operationId against
        // whichever instance now owns the farm. This room must stop serving.
        logger.warn(
          { err, roomId: this.roomId, reason: err.reason, instanceId: ctx.instanceId },
          'farm command refused: lease lost mid-command; disconnecting room',
        );
        this.sendError(client, operationId, ErrorCode.LEASE_LOST, 'farm room lost the lease; reconnect');
        await this.loseLease();
        return;
      }
      logger.error({ err, roomId: this.roomId, command, operationId }, 'farm command failed unexpectedly');
      this.sendError(client, operationId, ErrorCode.INTERNAL, 'internal error');
    }
  }

  /** Broadcast the state effects of a successful command to every connection. */
  private broadcastCommandEffects(result: ExecuteResult<unknown>): void {
    const plot = (result.payload as { plot?: PlotState } | undefined)?.plot;
    if (plot) {
      this.broadcast('plot_updated', serverEnvelope('plot_updated', { plot }));
    }
    if (result.player) {
      this.broadcast('gold_updated', serverEnvelope('gold_updated', { gold: result.player.gold }));
    }
  }

  private sendError(client: Client, operationId: string | undefined, code: ErrorCode, message: string): void {
    client.send('error', serverEnvelope('error', { code, message }, operationId));
  }

  /**
   * Renew outcome handling (T4): tolerate up to LEASE_RENEW_FAILURES_ALLOWED
   * consecutive failures — a transient DB blip must not kill rooms — then
   * stop serving. Extracted from the interval callback so tests can drive it
   * deterministically without waiting real ticks.
   */
  private async handleRenewResult(renewed: RoomLease | null): Promise<void> {
    if (renewed) {
      this.renewFailures = 0;
      this.lease = renewed;
      return;
    }
    this.renewFailures += 1;
    const ctx = requireContext();
    if (this.renewFailures >= LEASE_RENEW_FAILURES_ALLOWED) {
      logger.error(
        { ownerId: this.roomId, instanceId: ctx.instanceId, renewFailures: this.renewFailures },
        'farm room lease lost; disconnecting',
      );
      await this.loseLease();
    } else {
      logger.warn(
        { ownerId: this.roomId, renewFailures: this.renewFailures },
        'farm room lease renew failed; tolerating within budget',
      );
    }
  }

  /**
   * Stop acting as the authority: stop renewing, best-effort release the
   * lease, and disconnect every client so they re-route to the surviving
   * instance. The release is four-way guarded (owner/room/instance/epoch):
   * it shortens takeover latency when the lease is still ours
   * (tolerance-exhaustion case) and is a no-op when another instance already
   * took over (fencing case — the row belongs to the new holder).
   */
  private async loseLease(): Promise<void> {
    this.stopRenew();
    const lease = this.lease;
    this.lease = null;
    if (lease) {
      const ctx = requireContext();
      await ctx.leases.release(lease).catch((err) => {
        logger.warn({ err, ownerId: this.roomId }, 'lease release on loss failed');
      });
    }
    await this.disconnect().catch((err) => {
      logger.warn({ err, ownerId: this.roomId }, 'disconnect after lease loss failed');
    });
  }

  private stopRenew(): void {
    if (this.renewHandle) {
      this.renewHandle.clear();
      this.renewHandle = null;
    }
  }
}

/** Route a parsed command to its service — the same services the HTTP entry uses. */
function runFarmCommand(
  command: FarmCmdName,
  args: {
    em: import('@mikro-orm/core').EntityManager;
    playerId: string;
    operationId: string;
    body: Record<string, unknown>;
    serverNow: number;
  },
): Promise<CommandOutcome<unknown>> {
  switch (command) {
    case 'unlock':
      return unlockCommand({ ...args, body: args.body as { plotIndex: number } }) as Promise<CommandOutcome<unknown>>;
    case 'plant':
      return plantCommand({ ...args, body: args.body as { plotIndex: number; cropId: string } }) as Promise<CommandOutcome<unknown>>;
    case 'water':
      return waterCommand({ ...args, body: args.body as { plotIndex: number } }) as Promise<CommandOutcome<unknown>>;
    case 'harvest':
      return harvestCommand({ ...args, body: args.body as { plotIndex: number } }) as Promise<CommandOutcome<unknown>>;
  }
}
