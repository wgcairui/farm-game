/**
 * Auth protocol — JWT payload + login exchange shapes.
 */

import type { Platform } from '../types/platform.js';
import type { PlayerSave } from '../types/player.js';

export interface AuthContext {
  openid: string;
  platform: Platform;
  deviceId?: string;
  /** JWT iat, mirrored for client UI ("logged in since …"). */
  issuedAt: number;
  /** JWT exp, used by client to schedule silent refresh. */
  expiresAt: number;
}

/** POST /auth/wechat — request body for mini-program login. */
export interface WeChatLoginRequest {
  /** wx.login() result.code, single use. */
  code: string;
  /** Optional anonymous merge token from prior guest session. */
  guestPlayerId?: string;
}

/** Generic OAuth login request — used by iOS/Android. */
export interface OAuthLoginRequest {
  provider: 'apple' | 'google' | 'weChat';
  idToken: string;          // Sign in with Apple / Google id_token
  deviceId?: string;
}

/** POST /auth/{wechat,oauth} — success response. */
export interface LoginResponse {
  token: string;            // JWT signed with JWT_SECRET
  player: PlayerSave;
  /** Echo of the auth context, for client cache. */
  auth: AuthContext;
}