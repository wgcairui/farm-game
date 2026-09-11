/**
 * Economy system (client-mini). Mirrors scripts/systems/EconomySystem.ts semantics
 * with the shared EventBus instead of cc.EventTarget.
 */

import { EventBus, GameEvent } from '@farm-game/shared';

export class EconomySystem {
  private _coins = 0;
  private _diamonds = 0;

  init(coins: number, diamonds = 0): void {
    this._coins = coins;
    this._diamonds = diamonds;
  }

  get coins(): number { return this._coins; }
  get diamonds(): number { return this._diamonds; }

  earn(amount: number): void {
    if (amount <= 0) return;
    this._coins += amount;
    EventBus.emit(GameEvent.CoinsChanged, this._coins);
  }

  spend(amount: number): boolean {
    if (amount <= 0) return true;
    if (this._coins < amount) return false;
    this._coins -= amount;
    EventBus.emit(GameEvent.CoinsChanged, this._coins);
    return true;
  }

  earnDiamonds(amount: number): void {
    this._diamonds += amount;
    EventBus.emit(GameEvent.DiamondsChanged, this._diamonds);
  }
}