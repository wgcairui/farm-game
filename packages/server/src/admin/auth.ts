/**
 * Admin JWT claim mapping — separate from business JWT (auth/jwt.ts).
 *
 * Per ADR-0006 D46/D50: admin ops use a distinct @fastify/jwt namespace
 * with `jwtSecretAdmin` (different from the business `jwtSecret`) and a
 * short TTL (default 2h). The only claims we accept from a verified admin
 * token are `sub` (admin user id, numeric string from BIGSERIAL) and
 * `role` (`operator` | `admin`).
 *
 * The `iss` / `aud` / `exp` claims are still enforced by the @fastify/jwt
 * plugin's verify step; this module only narrows the CUSTOM payload.
 */

import type { AdminJwtPayload } from '../app.js';

export interface VerifiedAdminAuth {
  sub: string;
  role: string;
}

export function isVerifiedAdminAuth(v: unknown): v is VerifiedAdminAuth {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.sub === 'string' && typeof o.role === 'string';
}

/** Helper for route handlers that want to extract the admin user id. */
export function adminUserIdFromVerified(auth: VerifiedAdminAuth): number {
  const n = Number(auth.sub);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(`admin JWT sub is not a positive integer: ${auth.sub}`);
  }
  return n;
}

export type { AdminJwtPayload };
