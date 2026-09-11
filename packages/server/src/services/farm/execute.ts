/**
 * executeCommand — single entry point that ties transaction lifecycle,
 * operation-receipt persistence, and response projection together.
 *
 * Every HTTP farm command (and, in G2, every WS farm command) routes through
 * here. It opens a fresh EM (per ADR-0003 D25), runs the command's service
 * inside a transaction, persists the outcome via `persistReceipt`, then
 * loads the latest player state from the same transaction so the response
 * reflects what was actually written (no read-modify-write race against
 * concurrent commands).
 *
 * T1 extension: response carries both `revision` (current snapshot revision
 * — what the client should overlay on its local state) and `operationRevision`
 * (the revision recorded on the original receipt — preserved when the
 * outcome is a replay so the client can distinguish "result then" from
 * "snapshot now"). The flag `replayed` is true iff this call hit a
 * persisted receipt instead of executing fresh.
 */

import type { ErrorCode, PlotState, PlayerSave } from '@farm-game/shared';
import type { EntityManager } from '@mikro-orm/core';
import { MikroORMPlayerRepo } from '../../repositories/MikroORMPlayerRepo.js';
import type { TransactionRunner } from '../../repositories/transaction.js';
import type { CommandOutcome } from './outcome.js';

export interface ExecuteContext {
  repo: MikroORMPlayerRepo;
  tx: TransactionRunner;
}

export interface ExecuteArgs<TBody, TPayload> {
  command: string;
  playerId: string;
  operationId: string;
  body: TBody;
  run: (args: { em: EntityManager; playerId: string; serverNow: number }) => Promise<CommandOutcome<TPayload>>;
}

export interface ExecuteResult<TPayload> {
  ok: boolean;
  code?: ErrorCode;
  message?: string;
  payload?: TPayload;
  /** Current snapshot revision (player.revision) at response time. */
  revision: number;
  /**
   * Revision recorded on the persisted receipt when this outcome was
   * settled. Equals `revision` for fresh executions; older for replays.
   * Always present in success responses; null on failure (no revision bump).
   */
  operationRevision: number | null;
  /** True if the outcome came from a persisted receipt (replay path). */
  replayed: boolean;
  serverNow: number;
  player: PlayerSave;
}

export async function executeCommand<TBody, TPayload>(
  ctx: ExecuteContext,
  args: ExecuteArgs<TBody, TPayload>,
): Promise<ExecuteResult<TPayload>> {
  return ctx.tx.run(async (em) => {
    const serverNow = Date.now();
    // The service is responsible for persisting its own operation receipt.
    const outcome = await args.run({ em, playerId: args.playerId, serverNow });
    const player = await ctx.repo.materialisePlayer(em, args.playerId);
    if (!player) throw new Error(`player ${args.playerId} vanished mid-command`);

    // `replayed` is set by the service itself via a private outcome flag —
    // services call `loadReceipt` and return the persisted result with
    // `outcome.replayed = true` so we can distinguish a fresh execution
    // from an idempotent replay without inspecting revision arithmetic.
    const replayed = outcome._replayed === true;

    const base = {
      revision: player.revision,
      serverNow,
      player,
      operationRevision: outcome.ok ? outcome.revision : null,
      replayed,
    };

    if (outcome.ok) return { ok: true, payload: outcome.payload, ...base };
    return { ok: false, code: outcome.code, message: outcome.message, ...base };
  });
}

export type { PlotState };
