/**
 * Command outcome — the shape every farm command service returns.
 *
 * Per ADR-0003 D17/D27/D28: a command produces a deterministic outcome
 * that the route layer translates into either a success envelope (with
 * `payload`) or an error envelope. The outcome is persisted to the
 * `operation_receipts` table so retried requests get the same verdict.
 *
 * The command service is the only place that writes gold / plots /
 * revision — the route layer is a thin shell that validates the request,
 * looks up the player from JWT, calls the service, and serialises the
 * outcome. Colyseus rooms in G2 reuse the same service.
 *
 * T1 internal flag: `_replayed` is set by services when the outcome came
 * from a persisted receipt (the idempotency path). `execute.ts` projects
 * it onto the public `ExecuteResult.replayed`; it never enters the
 * HTTP/WS response payload.
 */

import type { ErrorCode } from '@farm-game/shared';

export type CommandOutcome<TPayload> =
  | { ok: true; payload: TPayload; revision: number; _replayed?: true }
  | { ok: false; code: ErrorCode; message: string; _replayed?: true };

export function success<TPayload>(payload: TPayload, revision: number): CommandOutcome<TPayload> {
  return { ok: true, payload, revision };
}

export function replayedSuccess<TPayload>(payload: TPayload, revision: number): CommandOutcome<TPayload> {
  return { ok: true, payload, revision, _replayed: true };
}

export function failure<TPayload>(code: ErrorCode, message: string): CommandOutcome<TPayload> {
  return { ok: false, code, message };
}

export function replayedFailure<TPayload>(code: ErrorCode, message: string): CommandOutcome<TPayload> {
  return { ok: false, code, message, _replayed: true };
}
