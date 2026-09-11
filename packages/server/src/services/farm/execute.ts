/**
 * executeCommand — single entry point that ties transaction lifecycle,
 * operation-receipt persistence, and response projection together.
 *
 * Every HTTP farm command routes through here. It opens a fresh EM
 * (per ADR-0003 D25), runs the command's service inside a transaction,
 * persists the outcome via `persistReceipt`, then loads the latest player
 * state from the SAME transaction so the response reflects what was
 * actually written (no read-modify-write race against concurrent commands).
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
  revision: number;
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
    const base = { revision: outcome.ok ? outcome.revision : player.revision, serverNow, player };
    if (outcome.ok) return { ok: true, payload: outcome.payload, ...base };
    return { ok: false, code: outcome.code, message: outcome.message, ...base };
  });
}

export type { PlotState };