/**
 * Player repository — interface + InMemory implementation for Phase 1.
 * Phase 2 swaps InMemoryPlayerRepo for MikroORMPlayerRepo implementing the same interface.
 */

import { createDefaultPlayerSave, type PlayerSave } from '@farm-game/shared';

export interface PlayerRepo {
  findByOpenid(openid: string): Promise<PlayerSave | null>;
  upsert(save: PlayerSave): Promise<PlayerSave>;
  /** Test/observability helper. */
  size(): Promise<number>;
}

export class InMemoryPlayerRepo implements PlayerRepo {
  private readonly _map = new Map<string, PlayerSave>();

  async findByOpenid(openid: string): Promise<PlayerSave | null> {
    return this._map.get(openid) ?? null;
  }

  async upsert(save: PlayerSave): Promise<PlayerSave> {
    save.updatedAt = Date.now();
    this._map.set(save.openid, save);
    return save;
  }

  async size(): Promise<number> {
    return this._map.size;
  }
}

/** Test helper — get-or-create. Phase 1 only used by smoke. */
export async function ensurePlayer(repo: PlayerRepo, openid: string): Promise<PlayerSave> {
  const existing = await repo.findByOpenid(openid);
  if (existing) return existing;
  const fresh = createDefaultPlayerSave(openid);
  return repo.upsert(fresh);
}