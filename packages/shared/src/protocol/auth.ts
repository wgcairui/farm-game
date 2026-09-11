/**
 * Auth protocol — JWT claim shape + login exchange shapes.
 *
 * Per ADR-0001 §3, the JWT uses standard claims (`sub`/`iat`/`exp`/`iss`/`aud`)
 * plus an `identities` snapshot. The custom `AuthContext` envelope exposed to
 * clients no longer carries an `expiresAt` field — clients derive it from the
 * standard `exp` claim (visible in the decoded JWT) so the value matches what
 * the server actually validates.
 */

import type { AuthProvider, AuthIdentitySummary } from '../types/auth-identity.js';

export interface JwtClaims {
  /** Internal playerId (UUID). Standard JWT subject. */
  sub: string;
  iat: number;
  exp: number;
  iss: 'farm-game';
  aud: 'client';
  /** Snapshot of identities at issue time — summary only, no provider subjects. */
  identities: AuthIdentitySummary[];
}

/** Public auth context returned alongside the token in `LoginResponse.auth`. */
export interface AuthContext {
  playerId: string;
  identities: AuthIdentitySummary[];
  /** Standard JWT `exp`, echoed for client silent refresh. */
  expiresAt: number;
  /** Standard JWT `iat`, mirrored for client UI ("logged in since …"). */
  issuedAt: number;
}

/** POST /auth/wechat — request body for mini-program login. */
export interface WeChatLoginRequest {
  code: string;
  /** Optional anonymous merge token from prior guest session. */
  guestPlayerId?: string;
}

/** Generic OAuth login request — used by iOS/Android. */
export interface OAuthLoginRequest {
  provider: AuthProvider;
  idToken: string;
  deviceId?: string;
}

/** POST /auth/bind — bind a new identity to the currently authenticated player. */
export interface AuthBindRequest {
  provider: AuthProvider;
  /** Provider's own auth artefact for this binding attempt. */
  token: string;
  /** Optional tenant scope (WeChat appid). */
  tenantId?: string;
}

/** POST /auth/{wechat,oauth,bind} — success response. */
export interface LoginResponse {
  token: string;
  player: import('../types/player.js').PlayerSave;
  auth: AuthContext;
  /**
   * Authoritative server epoch ms at the moment the token was issued.
   * Per ADR-0003 D20: clients use this to seed their local clock skew.
   */
  serverNow: number;
  /**
   * Server-side state revision at the moment of login. Always >= 0.
   * Per ADR-0003 D18: the login command itself does NOT bump `revision`
   * (it is a read of identity), so this is the current revision of the
   * returned `player` snapshot.
   */
  revision: number;
}
