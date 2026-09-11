/**
 * /player routes — GET /player/info returns the authenticated player's save.
 */

import { ErrorCode, type ApiResponse, type PlayerSave } from '@farm-game/shared';
import type { InMemoryPlayerRepo } from '../auth/repo.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type App = any;

export async function playerRoutes(
  app: App,
  deps: { repo: InMemoryPlayerRepo },
): Promise<void> {
  app.get('/player/info', async (req: { user?: { openid?: string }; jwtVerify: () => Promise<void> }, reply: { code: (n: number) => unknown }): Promise<ApiResponse<PlayerSave>> => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401);
      return { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'invalid or missing token' };
    }
    const openid = (req.user as { openid?: string } | undefined)?.openid;
    if (!openid) {
      reply.code(401);
      return { ok: false, code: ErrorCode.INVALID_TOKEN, message: 'token missing openid' };
    }
    const player = await deps.repo.findByOpenid(openid);
    if (!player) {
      reply.code(404);
      return { ok: false, code: ErrorCode.NOT_AUTHENTICATED, message: 'player not found' };
    }
    return { ok: true, data: player };
  });
}