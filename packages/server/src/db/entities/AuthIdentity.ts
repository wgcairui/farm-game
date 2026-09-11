/**
 * AuthIdentity entity — server-internal provider identity bindings.
 *
 * Per ADR-0001 §1, `subject` (the provider's own user identifier — WeChat
 * openid, Apple sub, Google sub, etc.) NEVER crosses the public envelope.
 * This table is the single source of truth for the by-identity index used
 * by `/auth/wechat` and `/auth/oauth`; the public projection
 * (`AuthIdentitySummary`) is reconstructed on read.
 *
 * The composite UNIQUE constraint on `(provider, tenant_id, subject)`
 * guarantees no two players can share an identity tuple at the database
 * level — application-level races are caught by Postgres' unique-violation
 * error and translated to `IdentityAlreadyBoundError`.
 *
 * NULL handling note: Postgres treats NULL != NULL in unique constraints by
 * default, so two rows with `tenant_id IS NULL` and the same `(provider, subject)`
 * would NOT be deduplicated by the constraint. We work around this by using
 * `''` (empty string) as the sentinel for "no tenant" and matching the
 * application-level `identityKey()` helper which encodes `null` as `'-'`.
 */

import { defineEntity } from '@mikro-orm/core';

export class AuthIdentity {
  id!: number;
  playerId!: string;
  provider!: string;
  tenantId!: string;
  subject!: string;
  boundAt!: Date;
}

export const AuthIdentityEntity = defineEntity({
  class: AuthIdentity,
  tableName: 'auth_identities',
  primaryKeys: ['id'],
  properties: (p) => ({
    id: p.bigint().primary().autoincrement(),
    playerId: p.string().length(36).index(),
    provider: p.string().length(32),
    tenantId: p.string().length(128).default(''),
    subject: p.string().length(256),
    boundAt: p.datetime().defaultRaw('now()'),
  }),
  uniques: [
    {
      name: 'auth_identities_provider_tenant_subject_uniq',
      properties: ['provider', 'tenantId', 'subject'],
    },
  ],
});