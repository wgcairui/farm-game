/**
 * Type surface of the prebuilt runtime bundle (farm-online.js) for the
 * Cocos editor's TypeScript. Regenerated types live in
 * packages/client-mini/src/runtime/online.ts — keep this in sync manually.
 */
export declare class OnlineGameApp {
  constructor(opts: {
    baseUrl: string;
    wsEndpoint: string;
    /** Fixed mock code → same player across simulator restarts. */
    wechatCode?: string;
  });
  start(): Promise<void>;
  stop(): Promise<void>;
  refresh(): Promise<void>;
  plant(plotIndex: number, cropId: string): Promise<void>;
  water(plotIndex: number): Promise<void>;
  harvest(plotIndex: number): Promise<void>;
  unlock(plotIndex: number): Promise<void>;
  onConnectionChange(cb: (connected: boolean) => void): void;
  state(): OnlineState;
}

export declare interface OnlinePlotView {
  index: number;
  unlocked: boolean;
  status: 'locked' | 'empty' | 'growing' | 'ripe';
  cropId?: string;
  plantedAt?: number;
  matureAt?: number;
  waterCount: number;
  /** View-level: growing plot past its matureAt under the server clock. */
  derivedRipe: boolean;
}

export declare interface OnlineState {
  playerId: string;
  gold: number;
  gems: number;
  plots: OnlinePlotView[];
  revision: number;
  connected: boolean;
  serverNowOffsetMs: number;
}

export declare class FarmApiError extends Error {
  readonly code: number | string;
  readonly status: number;
}

export declare class FarmWsError extends Error {
  readonly code: number | string | undefined;
  readonly operationId: string | undefined;
}

export declare const EventBus: {
  on(event: string, cb: (...args: unknown[]) => void): void;
  off(event: string, cb: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
};

export declare const GameEvent: {
  readonly CoinsChanged: string;
  readonly DiamondsChanged: string;
  readonly PlotStateChanged: string;
  readonly CropHarvested: string;
  readonly AuthLoggedIn: string;
  readonly ServerConnected: string;
  readonly ServerDisconnected: string;
};
