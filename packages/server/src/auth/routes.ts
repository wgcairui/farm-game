/**
 * /auth routes — POST /auth/wechat (mini-program), POST /auth/oauth (iOS/Android).
 * Phase 1: stub the upstream exchanges; return a JWT signed with JWT_SECRET.
 */

import {
  ErrorCode,
  Platform,
  PROTOCOL_VERSION,
  createDefaultPlayerSave,
  type LoginResponse,
  type WeChatLoginRequest,
  type OAuthLoginRequest,
  type ApiResponse,
} from '@farm-game/shared';
import { ensurePlayer, InMemoryPlayerRepo } from './repo.js';

const TOKEN_TTL_SEC = 7 * 24 * 3600; // PRD §7.3

// Use any-app alias to match buildApp's permissive return type (see src/app.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type App = any;

export async function authRoutes(
  app: App,
  deps: { repo: InMemoryPlayerRepo },
): Promise<void> {
  app.post('/auth/wechat', async (req: { body?: WeChatLoginRequest }, reply: { code: (n: number) => unknown; jwtSign: (p: unknown) => Promise<string> }): Promise<ApiResponse<LoginResponse>> => {
    const { code } = req.body ?? {};
    if (typeof code !== 'string' || code.length === 0) {
      reply.code(400);
      return {
        ok: false,
        code: ErrorCode.BAD_REQUEST,
        message: 'code is required',
      };
    }

    // Phase 1: stub the wechat code2session exchange.
    // Phase 2: call https://api.weixin.qq.com/sns/jscode2session with APP_ID/APP_SECRET.
    const openid = `stub_${code.slice(0, 16)}`;
    const player = await ensurePlayer(deps.repo, openid);

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + TOKEN_TTL_SEC;
    const token = await reply.jwtSign({
      openid: player.openid,
      platform: Platform.WeChatMini,
      issuedAt,
      expiresAt,
    });

    return {
      ok: true,
      data: {
        token,
        player,
        auth: { openid: player.openid, platform: Platform.WeChatMini, issuedAt, expiresAt },
      },
    };
  });

  app.post('/auth/oauth', async (req: { body?: OAuthLoginRequest }, reply: { code: (n: number) => unknown; jwtSign: (p: unknown) => Promise<string> }): Promise<ApiResponse<LoginResponse>> => {
    const { provider, idToken } = req.body ?? ({} as Partial<OAuthLoginRequest>);
    if (!provider || !idToken) {
      reply.code(400);
      return { ok: false, code: ErrorCode.BAD_REQUEST, message: 'provider & idToken required' };
    }
    const platform: Platform =
      provider === 'apple' ? Platform.IOS :
      provider === 'google' ? Platform.Android :
      Platform.WeChatMini;

    const openid = `stub_${provider}_${idToken.slice(0, 16)}`;
    let player = await deps.repo.findByOpenid(openid);
    if (!player) {
      player = createDefaultPlayerSave(openid);
      await deps.repo.upsert(player);
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + TOKEN_TTL_SEC;
    const token = await reply.jwtSign({ openid: player.openid, platform, issuedAt, expiresAt });

    return {
      ok: true,
      data: {
        token,
        player,
        auth: { openid: player.openid, platform, issuedAt, expiresAt },
      },
    };
  });

  // Expose PROTOCOL_VERSION via /auth/_meta so smoke can verify handshake.
  app.get('/auth/_meta', async () => ({
    ok: true,
    data: { protocolVersion: PROTOCOL_VERSION },
  }));
}