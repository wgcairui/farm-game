/**
 * WebSocket message shapes — G2 realtime protocol over Colyseus rooms.
 *
 * G2 replaces the Phase 1 stub (which assumed a bare `hello` handshake and a
 * `steal` command). The room join now carries auth: the client passes
 * `{ ownerId, token }` as join options and the server verifies the JWT in
 * Colyseus `onAuth` — there is no `hello` message.
 *
 * Envelope contract (unchanged from the Phase 1 stub):
 *  - `v` MUST carry `PROTOCOL_VERSION` (see ./version.ts). The server checks
 *    the major version on every client→server message and answers with an
 *    ephemeral `error(PROTOCOL_VERSION_MISMATCH)` otherwise.
 *  - `r` is the client's request id. For farm commands this is redundant with
 *    `operationId`, but the server echoes it on `cmd_result`/`error` so the
 *    client can correlate responses without parsing payloads.
 *  - `ts` is filled by the server on every server→client message.
 *
 * State model: the room keeps NO synchronized Colyseus state object — the
 * database is the sole authority and messages are projections of it. Full
 * state arrives once in `welcome`; afterwards clients overlay `cmd_result`
 * (requester) and `plot_updated`/`gold_updated` (all connections), discarding
 * anything stamped older than the revision they hold.
 */

import type { PlotState } from '../types/plot.js';
import type { PlayerSave } from '../types/player.js';
import {
  type CommandResponse,
  type FarmHarvestBody,
  type FarmHarvestPayload,
  type FarmPlantBody,
  type FarmPlantPayload,
  type FarmUnlockBody,
  type FarmUnlockPayload,
  type FarmWaterBody,
  type FarmWaterPayload,
} from './commands.js';
import type { ErrorCode } from './error.js';

/** Every WS message is wrapped in this envelope to carry protocol version + message type. */
export interface WsEnvelope<TName extends string, TPayload> {
  v: string;                  // PROTOCOL_VERSION
  t: TName;                   // message discriminator
  /** Optional request id; server echoes it back for request/response semantics. */
  r?: string;
  p: TPayload;
  /** Server epoch ms at dispatch. S→C fills it; C→S may omit. */
  ts?: number;
}

// ── Client → Server ──
/**
 * The single write channel. Mirrors `POST /farm/{command}`: same body shapes,
 * same `operationId` idempotency (shared receipts table — an operationId first
 * seen over HTTP replays identically over WS and vice versa).
 */
export type FarmCmdName = 'unlock' | 'plant' | 'water' | 'harvest';

export type FarmCmdPayload =
  | { command: 'unlock'; operationId: string; body: FarmUnlockBody }
  | { command: 'plant'; operationId: string; body: FarmPlantBody }
  | { command: 'water'; operationId: string; body: FarmWaterBody }
  | { command: 'harvest'; operationId: string; body: FarmHarvestBody };

export type ClientFarmCmd = WsEnvelope<'farm_cmd', FarmCmdPayload>;

/**
 * Pull the full farm snapshot (`welcome`). This is the RELIABLE snapshot
 * path: the room also pushes `welcome` from `onJoin`, but the Colyseus
 * handshake sends JOIN_ROOM after `onJoin` returns, so an SDK client's
 * handlers are registered only after the push has already been dispatched —
 * the pushed copy is for client stacks that buffer pre-join frames (the G3
 * wx.connectSocket client). SDK-style clients must pull via `farm_refresh`.
 */
export type ClientFarmRefresh = WsEnvelope<'farm_refresh', null>;

export type ClientMessage = ClientFarmCmd | ClientFarmRefresh;

// ── Server → Client ──
/** Full projection sent once per connection right after `onJoin`. */
export type ServerWelcome = WsEnvelope<'welcome', { serverNow: number; roomId: string; player: PlayerSave }>;

/** Response to a farm command, addressed to the requester via envelope `r` = operationId. */
export type FarmCmdResponse =
  | CommandResponse<FarmUnlockPayload>
  | CommandResponse<FarmPlantPayload>
  | CommandResponse<FarmWaterPayload>
  | CommandResponse<FarmHarvestPayload>;

export type ServerCmdResult = WsEnvelope<'cmd_result', FarmCmdResponse>;

/** Broadcast after a successful command — the changed plot (all connections). */
export type ServerPlotUpdated = WsEnvelope<'plot_updated', { plot: PlotState }>;

/** Broadcast after a successful command — the owner's new gold (all connections). */
export type ServerGoldUpdated = WsEnvelope<'gold_updated', { gold: number }>;

/**
 * `error` covers two distinct cases:
 *  - Ephemeral (no receipt): structural garbage (bad envelope, unknown
 *    command, version mismatch), a lost lease, or infrastructure failures.
 *    The client may retry with the same operationId.
 *  - Deterministic business failure (persisted receipt, same semantics as
 *    the HTTP 409/402/401 projection): the code identifies it, and the
 *    client must NOT retry with the same operationId.
 */
export type ServerError = WsEnvelope<'error', { code: ErrorCode; message: string }>;

/** Reserved for the social phase (steal). Not emitted by G2 rooms. */
export type ServerCropStolen = WsEnvelope<'crop_stolen', {
  victimPlayerId: string;
  plotIndex: number;
  cropId: string;
  lostAmount: number;
}>;

export type ServerMessage =
  | ServerWelcome
  | ServerCmdResult
  | ServerPlotUpdated
  | ServerGoldUpdated
  | ServerError
  | ServerCropStolen;
