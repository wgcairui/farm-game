/**
 * @farm-game/client-app — barrel export (Phase 1: pure TS, no React import).
 */

export { ApiClient, makeOperationId, type ApiClientOptions } from './net/api.js';
export { GameStore, patchPlot, type GameStoreState } from './store/GameStore.js';
export { describeApp, type AppProps } from './App.js';