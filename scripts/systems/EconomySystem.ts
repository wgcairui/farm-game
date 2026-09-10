import { GameEvent, EventBus } from '../core/EventBus';

/**
 * 经济系统：金币 / 钻石。
 * UI 只读 coins，扣金币通过 spend()，加金币通过 earn()。
 */
export class EconomySystem {
    private _coins = 0;
    private _diamonds = 0;

    init(coins: number, diamonds = 0) {
        this._coins = coins;
        this._diamonds = diamonds;
    }

    get coins() { return this._coins; }
    get diamonds() { return this._diamonds; }

    earn(amount: number) {
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

    earnDiamonds(amount: number) {
        this._diamonds += amount;
        EventBus.emit(GameEvent.DiamondsChanged, this._diamonds);
    }
}