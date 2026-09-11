/**
 * JWT claim mapping — the @fastify/jwt library already enforces `sub`/`iat`/`exp`
 * for us. Per ADR-0001 §3, the only custom payload we add is `identities`, and
 * `iss`/`aud` are configured globally in `buildApp`. This module exposes the
 * narrow contract the rest of the server reads back from a verified token.
 */

import type { AuthIdentityRef } from '@farm-game/shared';

export interface JwtCustomClaims {
  identities: AuthIdentityRef[];
}

/** Shape after Fastify has verified `iss`/`aud`/`exp`. */
export interface VerifiedAuth {
  sub: string;                 // playerId
  identities: AuthIdentityRef[];
}

export function isVerifiedAuth(v: unknown): v is VerifiedAuth {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.sub === 'string' && Array.isArray(o.identities);
}
