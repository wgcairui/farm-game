/**
 * Online runtime — server-authoritative headless app that talks to the
 * Fastify + Colyseus stack via {@link import('../net/index.js').FarmHttpClient}
 * and {@link import('../net/index.js').FarmRealtimeClient}.
 *
 * Differs from {@link HeadlessGameApp} in that the server holds the truth:
 * the runtime keeps only the most recent `PlayerSave` it has seen plus a
 * `serverNowOffsetMs` skew, applies server-pushed deltas, and treats any
 * local write as optimistic. Failures roll back via `refresh()`.
 *
 * UI integration: the runtime is the single seam for the future Cocos UI.
 * It emits events on the shared {@link EventBus} using the same names and
 * payload shapes as {@link HeadlessGameApp} (see FarmSystem / EconomySystem):
 *   - `coins_changed`        → number (new coin total)
 *   - `diamonds_changed`      → number (new diamond total)
 *   - `plot_state_changed`    → number (plot index)
 *   - `server_connected`      → void (mirrored from FarmRealtimeClient join)
 *   - `server_disconnected`   → void (mirrored from onLeave)
 *
 * No offline queue, no replay, no diffing, no persistence — the server's
 * authoritative snapshot IS the source of truth.
 */

import {
  EventBus,
  GameEvent,
  getCrop,
  type PlayerSave,
  type PlotState,
} from '@farm-game/shared';
import {
  FarmApiError,
  FarmHttpClient,
  FarmRealtimeClient,
  FarmWsError,
  makeOperationId,
  type CmdResultPayload,
  type WelcomePayload,
} from '../net/index.js';

/** Hard cap on auto-reconnect attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 5;
/** Exponential backoff base in ms (1s, 2s, 4s). */
const RECONNECT_BASE_MS = 1000;

/** View-level plot snapshot — same shape as server, but `status` may be
 *  promoted from `growing` to `ripe` when the local clock has crossed
 *  `matureAt`. */
export interface OnlinePlotView extends PlotState {
  /** Derived flag for UI binding. `true` iff a `growing` plot has matured. */
  derivedRipe: boolean;
}

export interface OnlineState {
  playerId: string;
  gold: number;
  gems: number;
  plots: OnlinePlotView[];
  revision: number;
  connected: boolean;
  serverNowOffsetMs: number;
}

export interface OnlineGameAppOptions {
  baseUrl: string;
  wsEndpoint: string;
  /** Mock WeChat code for `POST /auth/wechat`. Defaults to a fresh
   *  `mock_dev_<8-hex>` (same shape as smoke-realtime uses). */
  wechatCode?: string;
  /** Underlying HTTP client (allows tests to inject a transport). */
  httpClient?: FarmHttpClient;
  /** Override the realtime client (tests only). */
  realtimeClient?: FarmRealtimeClient;
}

/**
 * OnlineGameApp — minimum-viable online runtime. Starts by logging in,
 * fetching crop configs (retained for future shop UI), and joining the
 * `farm` room. Exposes optimistic plant/water/harvest/unlock that delegate
 * to the realtime client and emit EventBus events on success/failure.
 */
export class OnlineGameApp {
  private readonly http: FarmHttpClient;
  private readonly wechatCode: string;
  private readonly wsEndpoint: string;

  /** Realtime client; recreated on each reconnect attempt. */
  private rt: FarmRealtimeClient | null = null;
  /** Most recent PlayerSave snapshot from the server. */
  private player: PlayerSave | null = null;
  /** Most recent room id (set by welcome). */
  private roomId: string | null = null;
  /** Wallclock skew: serverNow - Date.now(). Updated on every welcome / cmd_result. */
  private serverNowOffsetMs = 0;
  /** Connection state for the latest view. */
  private connected = false;
  /** Connection-change listeners. */
  private connectionCbs = new Set<(connected: boolean) => void>();
  /** Stopped by `stop()` — suppresses further reconnect attempts. */
  private stopped = false;
  /** In-flight reconnect chain (so we don't fan out). */
  private reconnectChain: Promise<void> | null = null;
  /** Pending reconnect attempts; reset on a successful connect. */
  private reconnectAttempts = 0;
  /** Reconnect timer handle (cleared on stop / on success). */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: OnlineGameAppOptions) {
    this.http = opts.httpClient ?? new FarmHttpClient({ baseUrl: opts.baseUrl });
    this.wsEndpoint = opts.wsEndpoint;
    this.wechatCode = opts.wechatCode ?? `mock_dev_${makeOperationId().slice(0, 8)}`;
    if (opts.realtimeClient) this.rt = opts.realtimeClient;
  }

  // ── Lifecycle ───────────────────────────────────────────────

  /**
   * Boot sequence: login → fetch crop configs → join realtime → apply the
   * welcome snapshot. Throws on any unrecoverable failure.
   */
  async start(): Promise<void> {
    const login = await this.http.loginWeChat(this.wechatCode);
    this.applyServerClock(login.serverNow);
    this.player = login.player;
    this.roomId = null;
    // Crop configs are retained for future shop UI; fetched now so the
    // runtime is fully bootstrapped even if no UI is wired yet.
    await this.http.getCropConfigs();

    const rt = this.rt ?? new FarmRealtimeClient({
      endpoint: this.wsEndpoint,
      ownerId: login.player.playerId,
      token: this.http.token!,
    });
    this.rt = rt;
    this.bindRealtimeHandlers(rt);
    const welcome = await rt.join();
    this.applyWelcome(welcome);
  }

  /** Tear down: leave the room and disable auto-reconnect. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const rt = this.rt;
    this.rt = null;
    if (rt !== null) await rt.leave().catch(() => undefined);
    if (this.connected) this.setConnected(false);
  }

  /** Re-pull the full snapshot via `farm_refresh`. */
  async refresh(): Promise<void> {
    const rt = this.requireRt();
    const welcome = await rt.refresh();
    this.applyWelcome(welcome);
  }

  /**
   * Force-sync the local clock to a server-provided epoch. Exposed for
   * tests that simulate time travel; production code receives the value
   * implicitly through welcome / cmd_result / login responses.
   */
  syncServerClock(serverNow: number): void {
    this.applyServerClock(serverNow);
  }

  // ── Commands (optimistic) ───────────────────────────────────

  async plant(plotIndex: number, cropId: string): Promise<void> {
    const before = this.requirePlayer();
    const cfg = getCrop(cropId);
    if (cfg === undefined) throw new Error(`unknown crop: ${cropId}`);
    const plot = before.plots[plotIndex];
    if (!plot) throw new Error(`plot ${plotIndex} out of range`);
    if (!plot.unlocked) throw new Error(`plot ${plotIndex} is locked`);
    if (plot.status !== 'empty') throw new Error(`plot ${plotIndex} is ${plot.status}, not empty`);
    if (before.gold < cfg.seedPrice) throw new Error(`insufficient gold: have ${before.gold}, need ${cfg.seedPrice}`);
    // Fail fast before any optimistic patch when the realtime channel is
    // down — otherwise the patch would linger with no rollback path.
    this.requireRt();
    const snapshot = this.captureSnapshot();

    const plantedAt = this.serverNow();
    const matureAt = plantedAt + cfg.growthDuration * 1000;
    // Optimistic patch: deduct gold, set plot to growing.
    this.patchPlayer((p) => {
      p.gold -= cfg.seedPrice;
      const target = p.plots[plotIndex];
      target.status = 'growing';
      target.cropId = cropId;
      target.plantedAt = plantedAt;
      target.matureAt = matureAt;
      target.waterCount = 0;
    });
    EventBus.emit(GameEvent.CoinsChanged, this.player!.gold);
    EventBus.emit(GameEvent.PlotStateChanged, plotIndex);

    await this.runCmd('plant', { plotIndex, cropId }, () => {
      // Rollback: restore the pre-patch snapshot synchronously (works even
      // while disconnected), then best-effort re-sync — the refresh also
      // picks up any concurrent writes the restore overwrote.
      this.replaceAndEmit(snapshot);
      void this.refresh().catch(() => undefined);
    });
  }

  async water(plotIndex: number): Promise<void> {
    const before = this.requirePlayer();
    const plot = before.plots[plotIndex];
    if (!plot) throw new Error(`plot ${plotIndex} out of range`);
    if (plot.status !== 'growing') throw new Error(`plot ${plotIndex} is ${plot.status}, not growing`);
    if (plot.cropId === undefined) throw new Error(`plot ${plotIndex} has no crop`);
    const cfg = getCrop(plot.cropId);
    if (cfg === undefined) throw new Error(`unknown crop: ${plot.cropId}`);
    if (plot.matureAt === undefined) throw new Error(`plot ${plotIndex} missing matureAt`);
    if (plot.waterCount >= cfg.maxWater) throw new Error(`plot ${plotIndex} reached max water`);
    this.requireRt();
    const snapshot = this.captureSnapshot();

    const now = this.serverNow();
    const remaining = plot.matureAt - now;
    if (remaining <= 0) throw new Error(`plot ${plotIndex} is already ripe`);
    const discounted = Math.ceil(remaining * 0.95);
    const newMatureAt = now + discounted;
    const newCount = plot.waterCount + 1;

    this.patchPlayer((p) => {
      const target = p.plots[plotIndex];
      target.matureAt = newMatureAt;
      target.waterCount = newCount;
    });
    EventBus.emit(GameEvent.PlotStateChanged, plotIndex);

    await this.runCmd('water', { plotIndex }, () => {
      this.replaceAndEmit(snapshot);
      void this.refresh().catch(() => undefined);
    });
  }

  async harvest(plotIndex: number): Promise<void> {
    const before = this.requirePlayer();
    const plot = before.plots[plotIndex];
    if (!plot) throw new Error(`plot ${plotIndex} out of range`);
    if (plot.status !== 'ripe' && !(plot.status === 'growing' && this.deriveRipe(plot))) {
      throw new Error(`plot ${plotIndex} not ripe`);
    }
    if (plot.cropId === undefined) throw new Error(`plot ${plotIndex} has no crop`);
    const cfg = getCrop(plot.cropId);
    if (cfg === undefined) throw new Error(`unknown crop: ${plot.cropId}`);
    this.requireRt();
    const snapshot = this.captureSnapshot();

    this.patchPlayer((p) => {
      p.gold += cfg.sellPrice;
      const target = p.plots[plotIndex];
      target.status = 'empty';
      target.cropId = undefined;
      target.plantedAt = undefined;
      target.matureAt = undefined;
      target.waterCount = 0;
    });
    EventBus.emit(GameEvent.CoinsChanged, this.player!.gold);
    EventBus.emit(GameEvent.CropHarvested, { plotIndex, cropId: cfg.id });
    EventBus.emit(GameEvent.PlotStateChanged, plotIndex);

    await this.runCmd('harvest', { plotIndex }, () => {
      this.replaceAndEmit(snapshot);
      void this.refresh().catch(() => undefined);
    });
  }

  async unlock(plotIndex: number): Promise<void> {
    const before = this.requirePlayer();
    const plot = before.plots[plotIndex];
    if (!plot) throw new Error(`plot ${plotIndex} out of range`);
    if (plot.unlocked) throw new Error(`plot ${plotIndex} already unlocked`);
    this.requireRt();
    const snapshot = this.captureSnapshot();

    this.patchPlayer((p) => {
      const target = p.plots[plotIndex];
      target.unlocked = true;
      target.status = 'empty';
      target.waterCount = 0;
    });
    EventBus.emit(GameEvent.PlotStateChanged, plotIndex);

    await this.runCmd('unlock', { plotIndex }, () => {
      this.replaceAndEmit(snapshot);
      void this.refresh().catch(() => undefined);
    });
  }

  // ── Subscriptions ───────────────────────────────────────────

  onConnectionChange(cb: (connected: boolean) => void): void {
    this.connectionCbs.add(cb);
  }

  /** Snapshot view of the current state (UI binding). */
  state(): OnlineState {
    const player = this.requirePlayer();
    const now = this.serverNow();
    const plots: OnlinePlotView[] = player.plots.map((plot) => ({
      ...plot,
      derivedRipe: this.deriveRipe(plot, now),
    }));
    return {
      playerId: player.playerId,
      gold: player.gold,
      gems: player.gems,
      plots,
      revision: player.revision,
      connected: this.connected,
      serverNowOffsetMs: this.serverNowOffsetMs,
    };
  }

  // ── Internals ───────────────────────────────────────────────

  /** Authoritative server-now = local clock + skew. */
  private serverNow(): number {
    return Date.now() + this.serverNowOffsetMs;
  }

  /** True iff a growing plot has crossed its matureAt under server clock. */
  private deriveRipe(plot: PlotState, now: number = this.serverNow()): boolean {
    return plot.status === 'growing' && plot.matureAt !== undefined && now >= plot.matureAt;
  }

  private applyServerClock(serverNow: number): void {
    this.serverNowOffsetMs = serverNow - Date.now();
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    if (value) EventBus.emit(GameEvent.ServerConnected);
    else EventBus.emit(GameEvent.ServerDisconnected);
    // Set.forEach rather than for-of — WeChat DevTools' babel enhance breaks
    // iterator protocols (see EventBus.emit).
    this.connectionCbs.forEach((cb) => {
      try {
        cb(value);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[OnlineGameApp] connectionChange handler threw', err);
      }
    });
  }

  private requirePlayer(): PlayerSave {
    if (this.player === null) {
      throw new Error('OnlineGameApp not started — call start() first');
    }
    return this.player;
  }

  private requireRt(): FarmRealtimeClient {
    if (this.rt === null) {
      throw new Error('OnlineGameApp not joined — call start() first');
    }
    return this.rt;
  }

  /** True when `after` is older than the newest authoritative snapshot we
   *  hold (ADR-0003 D18 — clients must ignore older revisions). Optimistic
   *  patches never bump `revision`, so `this.player.revision` is always the
   *  last authoritative revision seen. */
  private isStale(after: PlayerSave): boolean {
    return this.player !== null && after.revision < this.player.revision;
  }

  /** Apply a welcome snapshot: replace player, update roomId + clock,
   *  re-emit the canonical diff so any stale UI catches up. */
  private applyWelcome(welcome: WelcomePayload): void {
    const before = this.player;
    this.applyServerClock(welcome.serverNow);
    this.roomId = welcome.roomId;
    this.setConnected(true);
    this.reconnectAttempts = 0;
    if (before !== null && welcome.player.revision < before.revision) {
      // Stale snapshot (e.g. a buffered broadcast welcome consumed after a
      // newer cmd_result) — the clock is fresh but the state must not regress.
      return;
    }
    const after = welcome.player;
    this.player = after;

    if (before === null) {
      // First welcome: emit the bootstrap events so the UI starts in sync.
      EventBus.emit(GameEvent.AuthLoggedIn, { playerId: after.playerId });
      EventBus.emit(GameEvent.CoinsChanged, after.gold);
      EventBus.emit(GameEvent.DiamondsChanged, after.gems);
      for (const plot of after.plots) {
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
      }
      return;
    }

    // Subsequent welcome: diff against the previous snapshot.
    this.diffAndEmit(before, after);
  }

  /** Replace the local player with `after` and emit minimal event set. */
  private replaceAndEmit(after: PlayerSave): void {
    if (this.isStale(after)) return;
    const before = this.player;
    this.player = after;
    if (before === null) {
      EventBus.emit(GameEvent.CoinsChanged, after.gold);
      EventBus.emit(GameEvent.DiamondsChanged, after.gems);
      for (const plot of after.plots) {
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
      }
      return;
    }
    this.diffAndEmit(before, after);
  }

  /** Emit only the events whose values actually changed. */
  private diffAndEmit(before: PlayerSave, after: PlayerSave): void {
    if (before.gold !== after.gold) {
      EventBus.emit(GameEvent.CoinsChanged, after.gold);
    }
    if (before.gems !== after.gems) {
      EventBus.emit(GameEvent.DiamondsChanged, after.gems);
    }
    // Plot diff: index-by-index, emit only when the wire-shape fields differ.
    const len = Math.min(before.plots.length, after.plots.length);
    for (let i = 0; i < len; i += 1) {
      const a = before.plots[i];
      const b = after.plots[i];
      if (
        a.unlocked !== b.unlocked ||
        a.status !== b.status ||
        a.cropId !== b.cropId ||
        a.plantedAt !== b.plantedAt ||
        a.matureAt !== b.matureAt ||
        a.waterCount !== b.waterCount
      ) {
        EventBus.emit(GameEvent.PlotStateChanged, i);
      }
    }
  }

  /** Apply a synchronous mutation to the local player snapshot. */
  private patchPlayer(mutator: (p: PlayerSave) => void): void {
    if (this.player === null) {
      throw new Error('OnlineGameApp not started — call start() first');
    }
    mutator(this.player);
  }

  /** JSON clone of the current player for optimistic rollback. PlayerSave is
   *  a small flat document (< 5 KB), so a stringify round-trip is fine and
   *  avoids structuredClone availability questions on WeChat. */
  private captureSnapshot(): PlayerSave {
    return JSON.parse(JSON.stringify(this.requirePlayer())) as PlayerSave;
  }

  /** Wrap a `FarmRealtimeClient.cmd()` call with uniform error handling. */
  private async runCmd(
    command: 'unlock' | 'plant' | 'water' | 'harvest',
    body: Record<string, unknown>,
    onFailure: () => void,
  ): Promise<void> {
    let result: CmdResultPayload;
    try {
      // requireRt() sits inside the try: if the room vanished between the
      // command's pre-patch check and here, onFailure still rolls back.
      result = await this.requireRt().cmd(command, body);
    } catch (err) {
      // Cmd failed (FarmWsError / timeout / lease-lost). Roll back to the
      // authoritative snapshot and re-throw so the caller sees the error.
      onFailure();
      throw err;
    }
    this.applyServerClock(result.serverNow);
    // Cmd succeeded — replace the optimistic local state with the server's
    // truth. The diff emitter naturally skips anything that already matches.
    this.replaceAndEmit(result.player);
  }

  // ── Realtime wiring ─────────────────────────────────────────

  private bindRealtimeHandlers(rt: FarmRealtimeClient): void {
    rt.onPlotUpdated(({ plot }) => {
      if (this.player === null) return;
      const idx = plot.index;
      if (idx < 0 || idx >= this.player.plots.length) return;
      this.player.plots[idx] = { ...plot };
      EventBus.emit(GameEvent.PlotStateChanged, idx);
    });
    rt.onGoldUpdated(({ gold }) => {
      if (this.player === null) return;
      if (this.player.gold !== gold) {
        this.player.gold = gold;
        EventBus.emit(GameEvent.CoinsChanged, gold);
      }
    });
    rt.onError((err) => {
      // Surface server-pushed errors on the shared bus. We don't roll back
      // on broadcast errors (they aren't tied to a local command).
      // eslint-disable-next-line no-console
      console.error('[OnlineGameApp] server error', err);
    });
    rt.onLeave(() => {
      if (this.stopped) return;
      this.setConnected(false);
      this.scheduleReconnect();
    });
  }

  // ── Reconnect ───────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectChain !== null) return;
    if (this.reconnectTimer !== null) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    if (this.rt === null) return;
    if (this.http.token === null) return;

    this.reconnectAttempts += 1;
    const delay = RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts - 1);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectChain = this.doReconnect().finally(() => {
        this.reconnectChain = null;
      });
      void this.reconnectChain;
    }, delay);
  }

  private async doReconnect(): Promise<void> {
    if (this.stopped) return;
    if (this.http.token === null) return;
    // Spin a fresh client — the old one is already closed and Colyseus SDK
    // state can't be safely reused across leave/join cycles.
    const ownerId = this.player?.playerId;
    if (ownerId === undefined) return;
    const rt = new FarmRealtimeClient({
      endpoint: this.wsEndpoint,
      ownerId,
      token: this.http.token,
    });
    this.rt = rt;
    this.bindRealtimeHandlers(rt);
    try {
      const welcome = await rt.join();
      this.applyWelcome(welcome);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[OnlineGameApp] reconnect failed', err);
      // Clear the in-flight chain BEFORE rescheduling: scheduleReconnect()
      // treats a non-null chain as "already working on it", so rescheduling
      // without this reset would end the backoff loop after one attempt.
      this.reconnectChain = null;
      this.scheduleReconnect();
    }
  }
}

/** Convenience re-exports — useful when consumers want to import errors. */
export { FarmApiError, FarmWsError };