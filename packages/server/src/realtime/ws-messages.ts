/**
 * WS message layer — envelope construction and `farm_cmd` parsing.
 *
 * Pure functions (no Colyseus, no DB) so the shapes are unit-testable. The
 * room (`room.ts`) wires them into Colyseus send/broadcast.
 *
 * Structural failures (bad envelope, unknown command, version mismatch) are
 * EPHEMERAL — the server answers with `error` and persists no receipt,
 * mirroring the HTTP entry where JSON-schema violations 400 before any
 * handler runs. Business failures stay inside the command services and keep
 * their receipt semantics.
 */

import {
  ErrorCode,
  OPERATION_ID_MAX_LENGTH,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAJOR,
  type FarmCmdName,
  type WsEnvelope,
} from '@farm-game/shared';

/** Colyseus message type for the single farm write channel. */
export const FARM_CMD_MESSAGE = 'farm_cmd';

/** Colyseus message type for the pull-based full snapshot. */
export const FARM_REFRESH_MESSAGE = 'farm_refresh';

const FARM_COMMANDS: ReadonlySet<string> = new Set<FarmCmdName>(['unlock', 'plant', 'water', 'harvest']);

export interface ParsedFarmCmd {
  command: FarmCmdName;
  operationId: string;
  /** Passed through to the command services, which own business validation. */
  body: Record<string, unknown>;
}

export type FarmCmdParseResult =
  | { ok: true; cmd: ParsedFarmCmd }
  | { ok: false; code: ErrorCode; message: string; /** Best-effort echo so the client can correlate the failure. */ operationId?: string };

export function parseFarmCmd(raw: unknown): FarmCmdParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: ErrorCode.BAD_REQUEST, message: 'message must be a WsEnvelope object' };
  }
  const env = raw as Record<string, unknown>;
  if (typeof env.v !== 'string' || env.v.split('.')[0] !== String(PROTOCOL_VERSION_MAJOR)) {
    return { ok: false, code: ErrorCode.PROTOCOL_VERSION_MISMATCH, message: 'unsupported protocol version' };
  }
  if (env.t !== FARM_CMD_MESSAGE) {
    return { ok: false, code: ErrorCode.BAD_REQUEST, message: `unknown message type (expected '${FARM_CMD_MESSAGE}')` };
  }
  const p = env.p;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) {
    return { ok: false, code: ErrorCode.BAD_REQUEST, message: 'envelope payload must be an object' };
  }
  const { command, operationId, body } = p as Record<string, unknown>;
  if (typeof command !== 'string' || !FARM_COMMANDS.has(command)) {
    return { ok: false, code: ErrorCode.BAD_REQUEST, message: 'unknown farm command' };
  }
  if (typeof operationId !== 'string' || operationId.length < 1 || operationId.length > OPERATION_ID_MAX_LENGTH) {
    return {
      ok: false,
      code: ErrorCode.BAD_REQUEST,
      message: `operationId must be a string of 1..${OPERATION_ID_MAX_LENGTH} chars`,
    };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, code: ErrorCode.BAD_REQUEST, message: 'command body must be an object', operationId };
  }
  return { ok: true, cmd: { command: command as FarmCmdName, operationId, body: body as Record<string, unknown> } };
}

/**
 * Build one server→client envelope. `ts` is stamped here (server wall clock)
 * — it carries the same time authority as `serverNow` fields elsewhere.
 */
export function serverEnvelope<TName extends string, TPayload>(
  t: TName,
  p: TPayload,
  r?: string,
): WsEnvelope<TName, TPayload> {
  return {
    v: PROTOCOL_VERSION,
    t,
    ...(r !== undefined ? { r } : {}),
    p,
    ts: Date.now(),
  };
}

export type FarmRefreshParseResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; message: string };

/** Validate a `farm_refresh` envelope (same version/type checks, no payload). */
export function parseFarmRefresh(raw: unknown): FarmRefreshParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: ErrorCode.BAD_REQUEST, message: 'message must be a WsEnvelope object' };
  }
  const env = raw as Record<string, unknown>;
  if (typeof env.v !== 'string' || env.v.split('.')[0] !== String(PROTOCOL_VERSION_MAJOR)) {
    return { ok: false, code: ErrorCode.PROTOCOL_VERSION_MISMATCH, message: 'unsupported protocol version' };
  }
  if (env.t !== FARM_REFRESH_MESSAGE) {
    return { ok: false, code: ErrorCode.BAD_REQUEST, message: `unknown message type (expected '${FARM_REFRESH_MESSAGE}')` };
  }
  return { ok: true };
}
