/**
 * OperationReceipt — server-side record that a write command was processed
 * (or deterministically rejected) for a given player.
 *
 * Per ADR-0003 D17: every write command carries a client-generated
 * `operationId`. The server guarantees at most one asset-changing outcome
 * per `(playerId, operationId)` tuple by enforcing a unique constraint on
 * the underlying table and short-circuiting when the receipt already exists.
 *
 * The receipt deliberately persists both successful and deterministic
 * business-failure outcomes, so a retried request returns the original
 * verdict instead of double-spending gold or double-harvesting a crop.
 * Transient infrastructure errors (DB deadlock, network timeout) are NOT
 * persisted as receipts — the caller may safely retry with the same
 * `operationId` and the next attempt will re-evaluate the command.
 */

import type { ErrorCode } from '../protocol/error.js';

export interface OperationReceipt {
  /** Server-internal numeric id. Not a primary key surfaced to clients. */
  id: number;
  playerId: string;
  /** Client-supplied operationId. UUIDv4 recommended. <= 64 chars. */
  operationId: string;
  /** Command name: 'plant' | 'water' | 'harvest' | 'unlock'. */
  command: string;
  /** SHA-256-style fingerprint of the canonicalised request body. */
  requestHash: string;
  /**
   * Server's terminal business outcome:
   *   - `ok: true`  → command committed; `responseData` holds the result payload
   *   - `ok: false` → deterministic business failure; `responseCode` is the
   *     domain ErrorCode (e.g. INSUFFICIENT_GOLD); client may safely retry
   *     with the same operationId and expect the same answer.
   */
  ok: boolean;
  responseCode: ErrorCode | null;
  /**
   * JSON-encoded response payload. Kept opaque on the wire; the server's
   * command service is the single producer so the shape is owned there.
   */
  responseData: unknown;
  /** `revision` after the command was applied. Always present on success. */
  revisionAfter: number | null;
  createdAt: number;
}