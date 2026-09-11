/**
 * Headless runtime — runs the same business wiring as GameApp, but without
 * the @ccclass decorator / Component inheritance. Used by Node tests and
 * the root-level smoke-protocol script.
 *
 * Once Cocos Creator 3.8 project lands (Phase 4), the same wiring lives in
 * packages/client-mini/src/cocos/GameApp.ts and is bound to a scene; this
 * file stays as the test scaffold.
 *
 * Per ADR-0002 D12: planting deducts gold, harvest awards gold; no inventory.
 */

import {
  createDefaultPlayerSave,
  EventBus,
  LocalStorageAdapter,
  MemoryStorageAdapter,
  TimeManager,
  type KeyValueStorage,
  type PlayerSave,
  GameEvent,
} from '@farm-game/shared';
import { EconomySystem } from '../cocos/systems/EconomySystem.js';
import { FarmSystem } from '../cocos/systems/FarmSystem.js';
import { ShopSystem } from '../cocos/systems/ShopSystem.js';

export interface HeadlessConfig {
  /** Storage backend; defaults to an in-memory map for tests. */
  storage?: KeyValueStorage;
  /** Pre-existing player save; defaults to a fresh PlayerSave. */
  save?: PlayerSave;
}

export class HeadlessGameApp {
  readonly timeManager = new TimeManager();
  readonly economy = new EconomySystem();
  readonly farm = new FarmSystem();
  readonly shop = new ShopSystem();

  private _storage: KeyValueStorage;
  private _save: PlayerSave;
  private _ticker: ReturnType<typeof setInterval> | null = null;

  constructor(cfg: HeadlessConfig = {}) {
    this._storage = cfg.storage ?? new MemoryStorageAdapter();
    this._save = cfg.save ?? createDefaultPlayerSave({ playerId: 'local-headless' });
  }

  /** Mirrors GameApp.onLoad() wiring. */
  start(): void {
    this.economy.init(this._save.gold, this._save.gems);
    this.farm.setTimeManager(this.timeManager);
    this.farm.bindEconomy(this.economy);
    this.farm.init(this._save.plots);
    this.shop.init();

    this.farm.recalcOnLogin();
    this._ticker = setInterval(() => this.farm.tick(), 1000);
    EventBus.emit(GameEvent.AuthLoggedIn, { playerId: this._save.playerId });
  }

  /** Mirrors GameApp.onDestroy(). */
  stop(): void {
    if (this._ticker) clearInterval(this._ticker);
    this._ticker = null;
    this.flush();
  }

  /** Persist current snapshot back to the storage backend. */
  flush(): void {
    this._save.gold = this.economy.coins;
    this._save.gems = this.economy.diamonds;
    this._save.plots = [...this.farm.plots];
    this._save.updatedAt = Date.now();
    void this._storage.setItem('farm_game_save_v2', JSON.stringify(this._save));
  }

  get save(): Readonly<PlayerSave> { return this._save; }
}

/** Convenience helper used by tests / smoke. */
export function buildHeadlessGameApp(cfg?: HeadlessConfig): HeadlessGameApp {
  const app = new HeadlessGameApp(cfg);
  app.start();
  return app;
}
