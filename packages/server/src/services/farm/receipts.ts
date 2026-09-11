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
 */

import { createHash } from 'node:crypto';
import { EntityManager } from '@mikro-orm/core';
import { canonicaliseBody, type CommandResponse } from '@farm-game/shared';
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
 * Read an existing receipt for `(playerId, operationId)`. Returns the
 * command outcome to replay, or null if no prior attempt exists.
 */
export async function loadReceipt<TPayload>(
  em: EntityManager,
  playerId: string,
  operationId: string,
  requestHash: string,
): Promise<CommandOutcome<TPayload> | null> {
  const row = await em.findOne(OperationReceipt, { playerId, operationId });
  if (!row) return null;
  if (row.requestHash !== requestHash) {
    return {
      ok: false,
      code: 1000 as never, // BAD_REQUEST — typed loosely here; route layer maps to envelope.
      message: 'operationId reused with different parameters',
    };
  }
  if (row.ok) {
    return { ok: true, payload: row.responseData as TPayload, revision: row.revisionAfter ?? 0 };
  }
  return {
    ok: false,
    code: (row.responseCode ?? 1000) as never,
    message: (row.responseData as { message?: string } | null)?.message ?? 'replayed',
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