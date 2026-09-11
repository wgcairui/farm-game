/**
 * GameStore — minimal observable store for client-app (Phase 5 RN UI binding).
 *
 * Phase 1 ships the type contract and pure reducer logic; the actual RN
 * subscriptions (`useSyncExternalStore`) land in Phase 5 when react/react-native
 * become real dependencies. The store is engine-agnostic and can be tested in Node.
 */

import {
  EventBus,
  GameEvent,
  type PlayerSave,
  type PlotState,
} from '@farm-game/shared';

export interface GameStoreState {
  player: PlayerSave | null;
  connected: boolean;
}

export class GameStore {
  private _state: GameStoreState = { player: null, connected: false };
  private readonly _listeners = new Set<(state: GameStoreState) => void>();
  private readonly _busHandlers = new Map<string, Set<() => void>>();

  constructor() {
    this._bind(GameEvent.CoinsChanged);
    this._bind(GameEvent.DiamondsChanged);
    this._bind(GameEvent.PlotStateChanged);
  }

  private _bind(event: string): void {
    const handler = () => this._notify();
    EventBus.on(event, handler);
    let set = this._busHandlers.get(event);
    if (!set) {
      set = new Set();
      this._busHandlers.set(event, set);
    }
    set.add(handler);
  }

  get state(): Readonly<GameStoreState> { return this._state; }

  setPlayer(player: PlayerSave): void {
    this._state = { ...this._state, player };
    this._notify();
  }

  setConnected(connected: boolean): void {
    this._state = { ...this._state, connected };
    this._notify();
  }

  subscribe(listener: (state: GameStoreState) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Phase 5: call when leaving the app to drop WS subscriptions. */
  destroy(): void {
    for (const [event, handlers] of this._busHandlers) {
      for (const h of handlers) EventBus.off(event, h);
    }
    this._busHandlers.clear();
    this._listeners.clear();
  }

  private _notify(): void {
    for (const fn of this._listeners) fn(this._state);
  }
}

/** Pure reducer — exposed for tests; returns a new state with the plot patched. */
export function patchPlot(state: GameStoreState, plot: PlotState): GameStoreState {
  if (!state.player) return state;
  const plots = state.player.plots.map((p) => (p.index === plot.index ? { ...p, ...plot } : p));
  return { ...state, player: { ...state.player, plots } };
}