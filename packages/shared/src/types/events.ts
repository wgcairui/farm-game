/**
 * Game events — emitted by both client systems and server rooms.
 * Server-side events prefixed with 'server_' to avoid namespace collision.
 */

export enum GameEvent {
  // Client (local)
  CoinsChanged = 'coins_changed',
  DiamondsChanged = 'diamonds_changed',
  InventoryChanged = 'inventory_changed',
  PlotStateChanged = 'plot_state_changed',
  CropHarvested = 'crop_harvested',
  CropWithered = 'crop_withered',
  SceneChanged = 'scene_changed',
  ToastShow = 'toast_show',
  // Server (remote, mirrored into client EventBus)
  ServerConnected = 'server_connected',
  ServerDisconnected = 'server_disconnected',
  ServerPlotUpdated = 'server_plot_updated',
  ServerCropStolen = 'server_crop_stolen',
  AuthLoggedIn = 'auth_logged_in',
}