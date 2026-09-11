/**
 * unlock command service — POST /farm/unlock.
 *
 * Per ADR-0003 D24/D26: plots cost 100 gold each (G1 dev default). Repeat
 * unlocks are no-ops (idempotent success, no revision bump). The plot's
 * `unlocked` and `status` fields MUST move together.
 */

import { ErrorCode } from '@farm-game/shared';
import { EntityManager, LockMode } from '@mikro-orm/core';
import { Plot } from '../../db/entities/Plot.js';
import { Player } from '../../db/entities/Player.js';
import { hashRequestBody, loadReceipt, persistReceipt } from './receipts.js';
import { failure, success, type CommandOutcome } from './outcome.js';
import type { FarmUnlockPayload } from '@farm-game/shared';

export const UNLOCK_PRICE_GOLD = 100;
const MAX_PLOT_INDEX = 23;

export interface UnlockArgs {
  em: EntityManager;
  playerId: string;
  operationId: string;
  body: { plotIndex: number };
  serverNow: number;
}

export async function unlockCommand(args: UnlockArgs): Promise<CommandOutcome<FarmUnlockPayload>> {
  const { em, playerId, operationId, body, serverNow } = args;
  const requestHash = hashRequestBody(body);

  const replayed = await loadReceipt<FarmUnlockPayload>(em, playerId, operationId, requestHash);
  if (replayed) return replayed;

  if (!Number.isInteger(body.plotIndex) || body.plotIndex < 0 || body.plotIndex > MAX_PLOT_INDEX) {
    return persistReceipt<FarmUnlockPayload>({
      em, playerId, operationId, command: 'unlock', requestHash, serverNow,
      outcome: failure<FarmUnlockPayload>(ErrorCode.PLOT_NOT_OWNED, 'plotIndex out of range'),
    });
  }

  // Lock the player row so concurrent unlocks serialise.
  const player = await em.findOneOrFail(Player, { playerId });
  await em.lock(player, LockMode.PESSIMISTIC_WRITE);

  const plot = await em.findOne(Plot, { playerId, index: body.plotIndex });
  if (!plot) {
    return persistReceipt<FarmUnlockPayload>({
      em, playerId, operationId, command: 'unlock', requestHash, serverNow,
      outcome: failure<FarmUnlockPayload>(ErrorCode.PLOT_NOT_OWNED, 'plot row missing'),
    });
  }

  // Already unlocked → idempotent no-op (don't charge, don't bump revision).
  if (plot.unlocked) {
    const outcome = success<FarmUnlockPayload>({ plot: snapshotPlot(plot), goldSpent: 0 }, player.revision);
    return persistReceipt({ em, playerId, operationId, command: 'unlock', requestHash, serverNow, outcome });
  }

  if (player.gold < UNLOCK_PRICE_GOLD) {
    return persistReceipt<FarmUnlockPayload>({
      em, playerId, operationId, command: 'unlock', requestHash, serverNow,
      outcome: failure<FarmUnlockPayload>(ErrorCode.INSUFFICIENT_GOLD, 'not enough gold to unlock plot'),
    });
  }

  player.gold -= UNLOCK_PRICE_GOLD;
  player.revision += 1;
  player.updatedAt = new Date(serverNow);
  plot.unlocked = true;
  plot.status = 'empty';
  em.persist(player);
  em.persist(plot);

  const outcome = success<FarmUnlockPayload>({ plot: snapshotPlot(plot), goldSpent: UNLOCK_PRICE_GOLD }, player.revision);
  return persistReceipt({ em, playerId, operationId, command: 'unlock', requestHash, serverNow, outcome });
}

function snapshotPlot(row: Plot): import('@farm-game/shared').PlotState {
  return {
    id: row.id,
    index: row.index,
    unlocked: row.unlocked,
    status: row.status as import('@farm-game/shared').PlotStatus,
    waterCount: row.waterCount,
    ...(row.cropId ? { cropId: row.cropId } : {}),
    ...(row.plantedAt ? { plantedAt: row.plantedAt.getTime() } : {}),
    ...(row.matureAt ? { matureAt: row.matureAt.getTime() } : {}),
  };
}