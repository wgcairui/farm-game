/**
 * JWT verification outside Fastify — used by the G2 WS process (`onAuth`).
 *
 * The HTTP entry verifies via `@fastify/jwt` (`app.authenticate` in app.ts),
 * which is a thin wrapper over `fast-jwt`. The WS process has no Fastify
 * instance, so it drives `fast-jwt` directly — with the SAME secret and the
 * SAME `allowedIss`/`allowedAud` policy from ServerConfig, claim-for-claim:
 * standard `exp` enforcement (fast-jwt default), issuer/audience allow-lists,
 * and the custom `identities` claim shape-checked by the shared `isVerifiedAuth`.
 * A token minted by the HTTP login is accepted identically by both entries,
 * and vice versa.
 *
 * Failure mapping (fast-jwt TokenError.code → ErrorCode):
 *  - FAST_JWT_EXPIRED                       → TOKEN_EXPIRED (1102)
 *  - signature/shape/claim classes          → INVALID_TOKEN (1101)
 *  - key/config classes (server-side fault) → INTERNAL (4000)
 */

import { createVerifier, TokenError } from 'fast-jwt';
import { ErrorCode } from '@farm-game/shared';
import { isVerifiedAuth, type VerifiedAuth } from './jwt.js';

export class WsAuthError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WsAuthError';
  }
}

export interface TokenVerifyConfig {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
}

/** fast-jwt error classes that mean "this token is not trustworthy" (client-side fault). */
const CLIENT_FAULT_CODES: ReadonlySet<string> = new Set([
  TokenError.codes.malformed,
  TokenError.codes.invalidSignature,
  TokenError.codes.missingSignature,
  TokenError.codes.invalidAlgorithm,
  TokenError.codes.inactive,
  TokenError.codes.invalidClaimType,
  TokenError.codes.invalidClaimValue,
  TokenError.codes.missingRequiredClaim,
  TokenError.codes.invalidPayload,
  TokenError.codes.invalidType,
]);

/**
 * Verify one access token. Called once per connection in `onAuth` (not per
 * message), so the verifier is built per call — no cache invalidation to
 * reason about.
 *
 * Throws `WsAuthError` on any failure; never returns a falsy payload.
 */
export function verifyAccessToken(token: unknown, config: TokenVerifyConfig): VerifiedAuth {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    throw new WsAuthError(ErrorCode.NOT_AUTHENTICATED, 'missing or malformed bearer token');
  }

  let payload: unknown;
  try {
    // A literal `key` (string) yields a synchronous verifier.
    const verify = createVerifier({
      key: config.jwtSecret,
      allowedIss: config.jwtIssuer,
      allowedAud: config.jwtAudience,
    });
    payload = verify(token);
  } catch (err) {
    if (err instanceof TokenError) {
      if (err.code === TokenError.codes.expired) {
        throw new WsAuthError(ErrorCode.TOKEN_EXPIRED, 'token expired');
      }
      if (CLIENT_FAULT_CODES.has(err.code)) {
        throw new WsAuthError(ErrorCode.INVALID_TOKEN, `invalid token (${err.code})`);
      }
    }
    throw new WsAuthError(ErrorCode.INTERNAL, 'token verification failed unexpectedly');
  }

  if (!isVerifiedAuth(payload) || payload.sub.length === 0 || payload.sub.length > 36) {
    throw new WsAuthError(ErrorCode.INVALID_TOKEN, 'token payload missing sub/identities');
  }
  return payload;
}
