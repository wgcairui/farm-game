/**
 * AuthIdentity — provider + subject pair.
 *
 * Why split from PlayerSave: per ADR-0001 §1, the backend is a global service
 * that supports the same account across WeChat mini-program, iOS, Android,
 * and (later) H5. `playerId` is the internal stable UUID; `AuthIdentity` is
 * the binding to a specific provider. One Player can carry multiple identities;
 * merging requires an explicit `POST /auth/bind` exchange.
 *
 * Privacy boundary: `AuthIdentity.subject` (the provider's own user identifier,
 * e.g. WeChat openid / Apple sub / Google sub) is **server-internal**. It never
 * crosses the public envelope. The client sees only `AuthIdentitySummary`, which
 * strips the subject so a compromised client or a debug log cannot capture
 * cross-platform subjects.
 *
 * The provider subject is exposed only in two narrow cases:
 *   1. The client that owns the identity (via a dedicated endpoint, see
 *      `GET /auth/identities/me`) — the requesting player proves ownership
 *      via JWT `sub`.
 *   2. Server-side lookups, where the subject is keyed in the auth repo.
 */

export const AuthProvider = {
  WeChatMini: 'weChatMini',
  IOS: 'ios',
  Android: 'android',
  H5: 'h5',
} as const;

export type AuthProvider = typeof AuthProvider[keyof typeof AuthProvider];

/** Server-internal record — full provider subject + tenant + boundAt. */
export interface AuthIdentity {
  provider: AuthProvider;
  /** Provider subject — WeChat openid / Apple sub / Google sub. NEVER sent to other clients. */
  subject: string;
  /** Application/tenant scope; used to scope WeChat openid by mini-program appid. */
  tenantId?: string;
  boundAt: number;
}

/**
 * Public projection embedded in `PlayerSave.identities` and JWT `identities`.
 * Subject is intentionally absent: clients cannot enumerate another player's
 * provider subjects, and even the owning client only sees the summary in the
 * save envelope — fetching the full subject requires an explicit
 * authenticated call to `/auth/identities/me`.
 */
export interface AuthIdentitySummary {
  provider: AuthProvider;
  tenantId?: string;
  boundAt: number;
}

/**
 * Backwards-compat alias used by code that needs the bounded type but doesn't
 * need the subject. Server-internal callers should use `AuthIdentity` directly.
 *
 * @deprecated Use `AuthIdentitySummary` in public types; `AuthIdentity` for
 *   server-internal storage. This alias will be removed once all callers are
 *   migrated (G1+).
 */
export type AuthIdentityRef = AuthIdentitySummary;

/** Stable composite key for indexing/dedup — provider + tenant + subject. */
export function identityKey(id: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): string {
  return `${id.provider}:${id.tenantId ?? '-'}:${id.subject}`;
}

/** Public projection from internal record. Strips the subject. */
export function toIdentitySummary(id: AuthIdentity): AuthIdentitySummary {
  const summary: AuthIdentitySummary = { provider: id.provider, boundAt: id.boundAt };
  if (id.tenantId !== undefined) summary.tenantId = id.tenantId;
  return summary;
}
