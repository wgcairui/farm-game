/**
 * OperationReceipt entity — server-side idempotency record.
 *
 * Per ADR-0003 D17: every write command carries a client-generated
 * `operationId`. The DB UNIQUE constraint on `(player_id, operation_id)`
 * is the single point of deduplication; the application layer catches the
 * unique-violation error and returns the persisted outcome instead of
 * re-running the command.
 *
 * `request_hash` is a fingerprint of the canonicalised request body so the
 * server can detect "same operationId, different parameters" and reject the
 * retry as a logical conflict (HTTP 409).
 *
 * `ok` distinguishes persisted successes from persisted deterministic
 * business failures. Transient infrastructure errors (deadlock, network
 * drop) are NEVER persisted — the caller can safely retry those with the
 * same operationId.
 */

import { defineEntity } from '@mikro-orm/core';

export class OperationReceipt {
  id!: number;
  playerId!: string;
  operationId!: string;
  command!: string;
  requestHash!: string;
  ok!: boolean;
  responseCode!: number | null;
  responseData!: unknown;
  revisionAfter!: number | null;
  createdAt!: Date;
}

export const OperationReceiptEntity = defineEntity({
  class: OperationReceipt,
  tableName: 'operation_receipts',
  primaryKeys: ['id'],
  properties: (p) => ({
    id: p.bigint().primary().autoincrement(),
    playerId: p.string().length(36).index(),
    operationId: p.string().length(64),
    command: p.string().length(32),
    requestHash: p.string().length(64),
    ok: p.boolean(),
    responseCode: p.type('integer').nullable(),
    responseData: p.json().nullable(),
    revisionAfter: p.type('integer').nullable(),
    createdAt: p.datetime().defaultRaw('now()'),
  }),
  uniques: [
    {
      name: 'operation_receipts_player_id_operation_id_uniq',
      properties: ['playerId', 'operationId'],
    },
  ],
});