/**
 * Game events — emitted by both client systems and server rooms.
 * Server-side events prefixed with 'server_' to avoid namespace collision.
 *
 * Per ADR-0002 D11/D12: withered/inventory events removed; harvest awards
 * gold directly and crops never transition to a withered state.
 */

export enum GameEvent {
  // Client (local)
  CoinsChanged = 'coins_changed',
  DiamondsChanged = 'diamonds_changed',
  PlotStateChanged = 'plot_state_changed',
  CropHarvested = 'crop_harvested',
  SceneChanged = 'scene_changed',
  ToastShow = 'toast_show',
  // Server (remote, mirrored into client EventBus)
  ServerConnected = 'server_connected',
  ServerDisconnected = 'server_disconnected',
  ServerPlotUpdated = 'server_plot_updated',
  ServerCropStolen = 'server_crop_stolen',
  AuthLoggedIn = 'auth_logged_in',
}