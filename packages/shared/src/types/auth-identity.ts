/**
 * AuthIdentity — provider + subject pair.
 *
 * Why split from PlayerSave: per ADR-0001 §1, the backend is a global service
 * that supports the same account across WeChat mini-program, iOS, Android,
 * and (later) H5. `playerId` is the internal stable UUID; `AuthIdentity` is
 * the binding to a specific provider. One Player can carry multiple identities;
 * merging requires an explicit `POST /auth/bind` exchange.
 *
 * The provider `subject` is the provider's own user identifier (WeChat openid,
 * Apple `sub`, Google `sub`). It is NEVER placed in the public PlayerSave
 * envelope — clients know their own subject but should not be able to look up
 * another player's provider subject.
 */

export const AuthProvider = {
  WeChatMini: 'weChatMini',
  IOS: 'ios',
  Android: 'android',
  H5: 'h5',
} as const;

export type AuthProvider = typeof AuthProvider[keyof typeof AuthProvider];

export interface AuthIdentity {
  provider: AuthProvider;
  /** Provider subject — WeChat openid / Apple sub / Google sub. */
  subject: string;
  /** Application/tenant scope; used to scope WeChat openid by mini-program appid. */
  tenantId?: string;
  boundAt: number;
}

/** Public projection — emitted in `PlayerSave.identities` and JWT claims. */
export interface AuthIdentityRef {
  provider: AuthProvider;
  subject: string;
  boundAt: number;
}

/** Stable composite key for indexing/dedup — provider + tenant + subject. */
export function identityKey(id: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): string {
  return `${id.provider}:${id.tenantId ?? '-'}:${id.subject}`;
}

/** Public projection from internal record. */
export function toIdentityRef(id: AuthIdentity): AuthIdentityRef {
  return { provider: id.provider, subject: id.subject, boundAt: id.boundAt };
}
