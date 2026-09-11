/**
 * Operation-receipt helpers — centralise the idempotency lookup so every
 * farm command service applies the same semantics.
 *
 * Per ADR-0003 D17: each write command carries a `(playerId, operationId)`
 * tuple that is unique on the receipts table. The first execution wins and
 * the outcome is persisted (including deterministic business failures);
 * subsequent retries with the same tuple receive the original outcome.
 *
 * Transient infrastructure errors (deadlock, network drop) NEVER persist a
 * receipt — the caller can safely retry those with the same operationId.
 *
 * Per T1 (G2 prep): the receipt's `(command, requestHash)` pair is checked
 * together on every replay — using the same `operationId` for a different
 * command or a different body is rejected with `OPERATION_ID_REUSED`. This
 * closes the gap where `water(plot 0)` and `harvest(plot 0)` share the
 * same body shape (`{plotIndex: 0}`) and would otherwise replay each other.
 */

import { createHash } from 'node:crypto';
import { EntityManager } from '@mikro-orm/core';
import { canonicaliseBody, ErrorCode, type CommandResponse } from '@farm-game/shared';
import { OperationReceipt } from '../../db/entities/OperationReceipt.js';
import type { CommandOutcome } from './outcome.js';

/** Stable SHA-256 hex digest of the canonicalised body (uppercase). */
export function hashRequestBody(body: unknown): string {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>) : { value: body };
  return createHash('sha256').update(canonicaliseBody(value)).digest('hex');
}

export interface PersistedReceipt<TPayload> {
  ok: boolean;
  payload?: TPayload;
  errorCode?: number;
  message?: string;
  /** Revision recorded at command settlement time; replay responses carry this same number. */
  revision: number;
}

interface PersistArgs<TPayload> {
  em: EntityManager;
  playerId: string;
  operationId: string;
  command: string;
  requestHash: string;
  outcome: CommandOutcome<TPayload>;
  serverNow: number;
}

/**
 * Persist a command outcome. Throws on DB errors (which propagate to the
 * caller and abort the surrounding transaction); transient DB errors will
 * therefore leave NO receipt behind, allowing the caller to retry.
 */
export function persistReceipt<TPayload>(args: PersistArgs<TPayload>): CommandOutcome<TPayload> {
  const { em, playerId, operationId, command, requestHash, outcome, serverNow } = args;
  const revision = outcome.ok ? outcome.revision : 0;
  const responseCode = outcome.ok ? null : outcome.code;
  const responseData = outcome.ok
    ? (outcome.payload as unknown)
    : { code: outcome.code, message: outcome.message };
  em.persist(
    em.create(OperationReceipt, {
      playerId,
      operationId,
      command,
      requestHash,
      ok: outcome.ok,
      responseCode,
      responseData,
      revisionAfter: revision,
      createdAt: new Date(serverNow),
    }),
  );
  return outcome;
}

/**
 * Receipt lookup result — returns the outcome to replay plus a flag so the
 * caller can mark the response as a replay (`replayed: true`).
 *
 * `null` means "no prior attempt"; a non-null value MUST be projected back
 * through `replayedSuccess` / `replayedFailure` so `execute.ts` can stamp
 * the public `ExecuteResult.replayed` correctly.
 */
export interface ReceiptLookup<TPayload> {
  outcome: CommandOutcome<TPayload>;
  replayed: true;
}

export async function loadReceipt<TPayload>(
  em: EntityManager,
  playerId: string,
  operationId: string,
  command: string,
  requestHash: string,
): Promise<ReceiptLookup<TPayload> | null> {
  const row = await em.findOne(OperationReceipt, { playerId, operationId });
  if (!row) return null;
  if (row.command !== command || row.requestHash !== requestHash) {
    return {
      replayed: true,
      outcome: {
        ok: false,
        code: ErrorCode.OPERATION_ID_REUSED,
        message: 'operationId reused with a different command or parameters',
      },
    };
  }
  if (row.ok) {
    return {
      replayed: true,
      outcome: {
        ok: true,
        payload: row.responseData as TPayload,
        revision: row.revisionAfter ?? 0,
      },
    };
  }
  return {
    replayed: true,
    outcome: {
      ok: false,
      code: (row.responseCode ?? ErrorCode.BAD_REQUEST) as never,
      message: (row.responseData as { message?: string } | null)?.message ?? 'replayed',
    },
  };
}

/** Compose the public response shape from an outcome + serverNow + player. */
export function buildResponse<TPayload>(
  operationId: string,
  serverNow: number,
  revision: number,
  player: import('@farm-game/shared').PlayerSave,
  payload: TPayload,
): CommandResponse<TPayload> {
  return { operationId, serverNow, revision, player, payload };
}
