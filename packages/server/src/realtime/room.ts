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
import type { ServerConfig } from '../config.js';
import { verifyAccessToken, WsAuthError } from '../auth/verify.js';
import { unlockCommand } from '../services/farm/unlock.js';
import { plantCommand } from '../services/farm/plant.js';
import { waterCommand } from '../services/farm/water.js';
import { harvestCommand } from '../services/farm/harvest.js';
import { executeCommand, toCommandResponse, type ExecuteResult } from '../services/farm/execute.js';
import type { CommandOutcome } from '../services/farm/outcome.js';
import { FARM_CMD_MESSAGE, FARM_REFRESH_MESSAGE, parseFarmCmd, parseFarmRefresh, serverEnvelope } from './ws-messages.js';
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

export class FarmRoom extends Room {
  // Same-owner multi-device reconnect cap.
  override maxClients = 4;

  private lease: RoomLease | null = null;
  private renewHandle: { clear(): void } | null = null;

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

      // Renew at config.leaseRenewMs. On loss (expired/taken over) the room
      // MUST stop acting as an authority — disconnect everyone and dispose;
      // the surviving instance rebuilds from PostgreSQL. (Full fault handling
      // and drain semantics land in T4.)
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
    client.send(
      'welcome',
      serverEnvelope('welcome', { serverNow: Date.now(), roomId: this.roomId, player }),
    );
  }

  override onLeave(_client: Client, _code: number): void {
    // Multi-connection rooms keep serving; per-device bookkeeping is T4
    // (reconnect/resume). Nothing to release — auth data dies with the client.
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
   * Stop acting as the authority: drop the lease handle, stop renewing, and
   * disconnect every client so they re-route to the surviving instance.
   */
  private async loseLease(): Promise<void> {
    this.lease = null;
    this.stopRenew();
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
