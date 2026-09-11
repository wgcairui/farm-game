/**
 * /player/info — returns the authenticated player's save.
 *
 * Per ADR-0001 §1, the lookup key is the JWT `sub` (= internal playerId),
 * not a provider subject. Token validity is enforced by the `authenticate`
 * decorator in app.ts.
 */

import type { FastifyInstance } from 'fastify';
import { ErrorCode, type ApiResponse, type PlayerSave } from '@farm-game/shared';
import type { PlayerRepo } from '../repositories/player-repo.js';

export async function playerRoutes(app: FastifyInstance, deps: { repo: PlayerRepo; dbRepo?: PlayerRepo }): Promise<void> {
  const readRepo = deps.dbRepo ?? deps.repo;
  app.get<{ Reply: ApiResponse<PlayerSave> }>(
    '/player/info',
    { preHandler: app.authenticate },
    async (req): Promise<ApiResponse<PlayerSave>> => {
      const playerId = req.user.sub;
      const player = await readRepo.findByPlayerId(playerId);
      if (!player) {
        return { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'player not found' };
      }
      return { ok: true, data: player };
    },
  );
}
