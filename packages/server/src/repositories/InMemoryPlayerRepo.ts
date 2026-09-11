/**
 * InMemoryPlayerRepo — test-only implementation of `PlayerRepo`.
 *
 * Mirrors the by-identity / by-playerId two-index design of
 * `MikroORMPlayerRepo` so existing unit tests can exercise the same
 * semantics without touching PostgreSQL. NOT used in production boot.
 *
 * Known drift vs `MikroORMPlayerRepo`: plot `status` is returned as stored —
 * the PG repo derives `growing → ripe` at projection time (ADR-0003 D23),
 * this repo does not. Farm commands reject InMemory mode at the route layer,
 * so the drift is only observable to unit tests that never assert ripe
 * transitions.
 *
 * The production wiring lives in `auth/routes.ts` (DI'd via `BuildAppOptions`).
 */

import {
  toIdentitySummary,
  type AuthIdentity,
  type AuthIdentitySummary,
  type PlayerSave,
} from '@farm-game/shared';
import { generatePlayerId, IdentityAlreadyBoundError, type PlayerRepo } from './player-repo.js';

export class InMemoryPlayerRepo implements PlayerRepo {
  private readonly _byId = new Map<string, PlayerSave>();
  private readonly _byIdentity = new Map<string, string>();
  private readonly _fullIdentities = new Map<string, AuthIdentity[]>();

  async findByIdentity(identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<PlayerSave | null> {
    const key = identityKey(identity);
    const playerId = this._byIdentity.get(key);
    if (!playerId) return null;
    return this._byId.get(playerId) ?? null;
  }

  async getOrCreateByIdentity(
    identity: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>,
    createSave: (playerId: string) => PlayerSave,
  ): Promise<PlayerSave> {
    // In-memory repo runs on a single event-loop tick so there's no
    // concurrency; the lookup-then-insert sequence is atomic enough for
    // tests.
    const existing = await this.findByIdentity(identity);
    if (existing) return existing;
    const playerId = generatePlayerId();
    const save = createSave(playerId);
    await this.upsert(save);
    await this.addIdentity(playerId, {
      provider: identity.provider,
      subject: identity.subject,
      tenantId: identity.tenantId,
      boundAt: Date.now(),
    });
    const final = await this.findByPlayerId(playerId);
    if (!final) throw new Error('getOrCreateByIdentity: race produced no player');
    return final;
  }

  async findByPlayerId(playerId: string): Promise<PlayerSave | null> {
    return this._byId.get(playerId) ?? null;
  }

  async findIdentities(playerId: string): Promise<AuthIdentity[]> {
    return [...(this._fullIdentities.get(playerId) ?? [])];
  }

  async upsert(save: PlayerSave): Promise<PlayerSave> {
    save.updatedAt = Date.now();
    this._byId.set(save.playerId, save);
    const fulls = this._fullIdentities.get(save.playerId) ?? [];
    save.identities = fulls.map(toIdentitySummary);
    return save;
  }

  async addIdentity(playerId: string, identity: AuthIdentity): Promise<PlayerSave> {
    const key = identityKey(identity);
    const existingPlayer = this._byIdentity.get(key);
    if (existingPlayer) {
      throw new IdentityAlreadyBoundError(identity.provider, identity.subject, existingPlayer);
    }
    const fulls = this._fullIdentities.get(playerId) ?? [];
    if (fulls.some((i) => identityKey(i) === key)) {
      const save = this._byId.get(playerId);
      if (!save) throw new Error(`player ${playerId} not found`);
      return save;
    }
    fulls.push(identity);
    this._fullIdentities.set(playerId, fulls);
    this._byIdentity.set(key, playerId);
    const save = this._byId.get(playerId);
    if (!save) throw new Error(`player ${playerId} not found`);
    save.identities = fulls.map(toIdentitySummary);
    save.updatedAt = Date.now();
    return save;
  }

  async removeIdentity(playerId: string, key: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): Promise<PlayerSave> {
    const fullKey = identityKey(key);
    const fulls = this._fullIdentities.get(playerId) ?? [];
    const next = fulls.filter((i) => identityKey(i) !== fullKey);
    if (next.length === fulls.length) {
      const save = this._byId.get(playerId);
      if (!save) throw new Error(`player ${playerId} not found`);
      return save;
    }
    this._fullIdentities.set(playerId, next);
    if (this._byIdentity.get(fullKey) === playerId) {
      this._byIdentity.delete(fullKey);
    }
    const save = this._byId.get(playerId);
    if (!save) throw new Error(`player ${playerId} not found`);
    save.identities = next.map(toIdentitySummary);
    save.updatedAt = Date.now();
    return save;
  }

  async size(): Promise<number> {
    return this._byId.size;
  }
}

function identityKey(id: Pick<AuthIdentity, 'provider' | 'subject' | 'tenantId'>): string {
  return `${id.provider}:${id.tenantId ?? '-'}:${id.subject}`;
}

// Avoid pulling types that aren't exported (AuthIdentitySummary is a type-only re-export).
export type _IdentitySummary = AuthIdentitySummary;