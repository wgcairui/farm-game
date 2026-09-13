/**
 * OnlineFarm — home page root component (implementation-plan-ui-v13.md U02–U08,
 * U10–U14). The scene stays minimal: Canvas + this component only; every node
 * is built here at runtime.
 *
 * Responsibilities:
 *  - apply the 720×1280 Fit-Height design resolution before anything mounts
 *  - boot OnlineGameApp (fixed mock code → same player across recompiles)
 *  - build MapRoot (mapLayer) + ScreenUI (hud / sideColumn / bottomBar /
 *    dialogs / toast) and the FxPlayer, all consuming preloaded v13 frames
 *  - route plot taps to semantic actions (plant picker / water / harvest /
 *    unlock confirm) — zero local rules, server stays authoritative (D4)
 *  - drive per-frame modules (fx / toast / dialogs / water) from update(dt)
 *    and the 1s countdown tick + 30s clock from schedules
 *
 * Console baselines the E2E greps (keep byte-identical, runbook §10):
 *   [wx-compat] installed guard=true send=true   (from the vendor bundle)
 *   [OnlineFarm] 已连接服务端
 */

import { Color, Component, Label, Node, Vec3, view, _decorator } from 'cc';
import {
  OnlineGameApp, EventBus, GameEvent,
  type OnlineState, type OnlinePlotView,
} from './vendor/farm-online.js';
import {
  SKY_COLOR, applyDesignResolution, applyWidget, lawnRectCocos, loadPlotLayout,
} from './farm/layout';
import { makeLabel, roundRect, sizedNode } from './farm/widgets';
import { MapLayer } from './farm/mapLayer';
import { Hud } from './farm/hud';
import { SideColumn } from './farm/sideColumn';
import { BottomBar } from './farm/bottomBar';
import { DialogLayer } from './farm/dialogs';
import { ToastLayer } from './farm/toast';
import { FxPlayer } from './farm/fx';
import type { PlotAction } from './farm/plotView';

const { ccclass } = _decorator;

/** 固定 mock code：模拟器重启/重编译后仍登录同一玩家，验收「状态保留」。 */
const MOCK_CODE = 'mock_dev_cocos_simulator';

const BASE_URL = 'http://127.0.0.1:3000';
const WS_ENDPOINT = 'ws://127.0.0.1:2567';

interface FarmGlobal {
  app: OnlineGameApp | null;
  state: () => OnlineState | null;
  actions: {
    plant: (plotIndex: number, cropId: string) => Promise<void>;
    water: (plotIndex: number) => Promise<void>;
    harvest: (plotIndex: number) => Promise<void>;
    unlock: (plotIndex: number) => Promise<void>;
  };
}

@ccclass('OnlineFarm')
export class OnlineFarm extends Component {
  private app: OnlineGameApp | null = null;
  private started = false;

  private mapLayer: MapLayer | null = null;
  private hud: Hud | null = null;
  private sideColumn: SideColumn | null = null;
  private bottomBar: BottomBar | null = null;
  private dialogs: DialogLayer | null = null;
  private toast: ToastLayer | null = null;
  private fx: FxPlayer | null = null;

  private statusLabel: Label | null = null;
  private loadingCover: Node | null = null;
  /** Plot that opened the seed picker / unlock dialog. */
  private pendingPlot = -1;
  private greeted = false;

  private offEvents: Array<() => void> = [];

  async onLoad(): Promise<void> {
    // U02 — design resolution first so every later Widget measures correctly.
    applyDesignResolution();
    this.buildLoadingCover();
    this.buildStatusLabels();

    try {
      await this.boot();
    } catch (err) {
      this.setStatus(`加载失败: ${String((err as Error).message).slice(0, 60)}`);
      // eslint-disable-next-line no-console
      console.error('[OnlineFarm] boot failed', err);
    }

    this.app = new OnlineGameApp({
      baseUrl: BASE_URL,
      wsEndpoint: WS_ENDPOINT,
      wechatCode: MOCK_CODE,
    });
    this.wireEvents();
    (globalThis as { __farm?: FarmGlobal }).__farm = {
      app: this.app,
      state: () => {
        try {
          return this.app?.state() ?? null;
        } catch {
          return null;
        }
      },
      actions: {
        plant: (plotIndex, cropId) => this.requireApp().plant(plotIndex, cropId),
        water: (plotIndex) => this.requireApp().water(plotIndex),
        harvest: (plotIndex) => this.requireApp().harvest(plotIndex),
        unlock: (plotIndex) => this.requireApp().unlock(plotIndex),
      },
    };

    // 后端未起时轮询重试 start（OnlineGameApp.start 抛错即离线）。
    this.schedule(() => { void this.ensureStarted(); }, 3);
    await this.ensureStarted();
    this.schedule(() => this.tickOneSecond(), 1);
    this.schedule(() => this.sideColumn?.setClock(this.wallClock()), 30);
    this.sideColumn?.setClock(this.wallClock());
  }

  update(dt: number): void {
    this.fx?.update(dt);
    this.toast?.update(dt);
    this.dialogs?.update(dt);
    this.hud?.update(dt);
    this.mapLayer?.tick(dt);
  }

  onDestroy(): void {
    for (let i = 0; i < this.offEvents.length; i += 1) this.offEvents[i]();
    this.offEvents = [];
    void this.app?.stop().catch(() => undefined);
  }

  // ── boot ────────────────────────────────────────────────

  private async boot(): Promise<void> {
    const layout = await loadPlotLayout();
    // eslint-disable-next-line no-console
    console.log('[OnlineFarm] lawn rect cocos:', lawnRectCocos(layout).toString());
    this.mapLayer = await MapLayer.create(this.node, layout, (done, total) => {
      this.setStatus(`加载贴图 ${done}/${total}…`);
    });
    const frames = this.mapLayer.framesMap;

    // ScreenUI container must track the VISIBLE screen box (Fit-Width varies),
    // otherwise child Widgets anchor to a 720-wide box that overflows phones.
    const screenUi = sizedNode('ScreenUI', 720, 1280, this.node);
    applyWidget(screenUi, { left: 0, right: 0, top: 0, bottom: 0 });

    this.hud = new Hud(screenUi, frames);
    this.sideColumn = new SideColumn(screenUi, frames, () => {
      this.dialogs?.showSeedPicker();
    }, (label) => this.toast?.show(`「${label}」未开放`));
    this.bottomBar = new BottomBar(
      screenUi,
      frames,
      (action) => {
        // M5-B: 4 键彩色按钮路由。仓库/宠物/装扮 走 toast（功能未实现），商店
        // 复用 sideColumn 的 seed picker（不是真商店，是选种子）。
        if (action === '仓库') this.toast?.show('「仓库」未开放');
        else if (action === '宠物') this.toast?.show('「宠物」未开放');
        else if (action === '装扮') this.toast?.show('「装扮」未开放');
      },
      (action) => this.toast?.show(`「${action}」未开放`),
    );
    this.toast = new ToastLayer(screenUi);
    this.dialogs = new DialogLayer(screenUi, frames);
    this.dialogs.onResult = (result) => this.onDialogResult(result);

    this.fx = new FxPlayer(this.mapLayer.fxLayer);
    this.fx.setFrames(frames);

    for (let i = 0; i < this.mapLayer.plotViews.length; i += 1) {
      const plot = this.mapLayer.plotViews[i];
      plot.onAction = (plotIndex, action) => this.onPlotAction(plotIndex, action);
    }
  }

  private requireApp(): OnlineGameApp {
    if (this.app === null) throw new Error('app not ready');
    return this.app;
  }

  private async ensureStarted(): Promise<void> {
    if (this.started || this.app === null) return;
    try {
      await this.app.start();
      this.started = true;
      this.setConnected(true);
      this.refreshAll();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[OnlineFarm] 离线：', err);
      this.setStatus(`离线：${String((err as Error).message).slice(0, 60)} — 3 秒后重试`);
    }
  }

  // ── events ──────────────────────────────────────────────

  private wireEvents(): void {
    const onCoins = (gold: number): void => {
      this.hud?.setGold(gold);
      this.dialogs?.setGold(gold);
    };
    const onGems = (gems: number): void => this.hud?.setGems(gems);
    const onPlot = (index: number): void => this.refreshPlot(index);
    const onHarvest = (payload: { plotIndex: number }): void => {
      this.playHarvestFx(payload.plotIndex);
    };
    const onConnected = (): void => this.setConnected(true);
    const onDisconnected = (): void => this.setConnected(false);

    EventBus.on(GameEvent.CoinsChanged, onCoins as never);
    EventBus.on(GameEvent.DiamondsChanged, onGems as never);
    EventBus.on(GameEvent.PlotStateChanged, onPlot as never);
    EventBus.on(GameEvent.CropHarvested, onHarvest as never);
    EventBus.on(GameEvent.ServerConnected, onConnected as never);
    EventBus.on(GameEvent.ServerDisconnected, onDisconnected as never);
    this.offEvents = [
      () => EventBus.off(GameEvent.CoinsChanged, onCoins as never),
      () => EventBus.off(GameEvent.DiamondsChanged, onGems as never),
      () => EventBus.off(GameEvent.PlotStateChanged, onPlot as never),
      () => EventBus.off(GameEvent.CropHarvested, onHarvest as never),
      () => EventBus.off(GameEvent.ServerConnected, onConnected as never),
      () => EventBus.off(GameEvent.ServerDisconnected, onDisconnected as never),
    ];
  }

  private setConnected(connected: boolean): void {
    this.hud?.setConnected(connected);
    if (connected) {
      this.setStatus('已连接服务端');
      this.refreshAll();
      if (!this.greeted) {
        this.greeted = true;
        this.toast?.show('点击空地选种，成熟后点击收获');
      }
    } else {
      this.setStatus('连接断开，自动重连中…');
    }
  }

  // ── plot interactions (U07) ─────────────────────────────

  private onPlotAction(plotIndex: number, action: PlotAction): void {
    if (!this.started || this.app === null) {
      this.toast?.show('未连接服务端');
      return;
    }
    if (action === 'plant') {
      this.pendingPlot = plotIndex;
      this.dialogs?.showSeedPicker();
      return;
    }
    if (action === 'unlock') {
      this.pendingPlot = plotIndex;
      this.dialogs?.showUnlockConfirm(plotIndex);
      return;
    }
    const world = this.mapLayer?.plotViews[plotIndex]?.node.worldPosition;
    if (action === 'water') {
      if (world) this.fx?.playWaterSplash(world.clone());
      this.app.water(plotIndex).catch((err) => this.showFailure(err));
      return;
    }
    if (action === 'harvest') {
      if (world) this.playHarvestFx(plotIndex);
      this.app.harvest(plotIndex).catch((err) => this.showFailure(err));
    }
  }

  private onDialogResult(result: { kind: 'close' } | { kind: 'pick'; cropId: string } | { kind: 'confirm'; plotIndex: number }): void {
    if (result.kind === 'close') return;
    if (result.kind === 'pick') {
      if (this.pendingPlot < 0) return;
      const plotIndex = this.pendingPlot;
      this.pendingPlot = -1;
      const world = this.mapLayer?.plotViews[plotIndex]?.node.worldPosition;
      if (world) this.fx?.playPlantDust(world.clone());
      this.requireApp().plant(plotIndex, result.cropId).catch((err) => this.showFailure(err));
      return;
    }
    // confirm — unlock
    this.requireApp().unlock(result.plotIndex).catch((err) => this.showFailure(err));
  }

  /** Error → toast, with the common failures translated (raw text stays in console). */
  private showFailure(err: unknown): void {
    const raw = String((err as Error)?.message ?? err);
    // eslint-disable-next-line no-console
    console.error('[OnlineFarm] command failed', err);
    let text = `操作失败: ${raw.slice(0, 36)}`;
    if (raw.indexOf('insufficient gold') >= 0) text = '金币不足';
    else if (raw.indexOf('max water') >= 0) text = '这块地浇过水啦';
    else if (raw.indexOf('not started') >= 0 || raw.indexOf('not joined') >= 0) text = '未连接服务端';
    this.toast?.show(text);
  }

  private playHarvestFx(plotIndex: number): void {
    const plot = this.mapLayer?.plotViews[plotIndex];
    if (!plot || !this.fx) return;
    const world = plot.node.worldPosition.clone();
    this.fx.playHarvestBurst(world);
    this.fx.playCoinFly(world, this.hudGoldWorld());
  }

  /** Gold plaque center in world space (widget: left 24 + w/2, top 12 + h/2). */
  private hudGoldWorld(): Vec3 {
    const size = view.getVisibleSize();
    return new Vec3(24 + 100 / 2 - size.width / 2, size.height / 2 - (12 + 108 / 2), 0);
  }

  // ── refresh ─────────────────────────────────────────────

  private currentState(): OnlineState | null {
    if (!this.app) return null;
    try {
      return this.app.state();
    } catch {
      return null; // start() 之前 state() 抛「未启动」属预期
    }
  }

  private refreshAll(): void {
    const s = this.currentState();
    if (!s || !this.mapLayer) return;
    this.hud?.setGold(s.gold);
    this.dialogs?.setGold(s.gold);
    this.hud?.setGems(s.gems);
    for (let i = 0; i < s.plots.length; i += 1) this.refreshPlot(i);
  }

  private refreshPlot(index: number): void {
    const s = this.currentState();
    const plot: OnlinePlotView | undefined = s?.plots[index];
    if (!plot) return;
    const serverNow = Date.now() + (s?.serverNowOffsetMs ?? 0);
    this.mapLayer?.plotViews[index]?.refreshView(plot, serverNow);
  }

  /** 1s tick — countdown labels + stage flips are time-driven. */
  private tickOneSecond(): void {
    const s = this.currentState();
    if (!s || !this.mapLayer) return;
    const serverNow = Date.now() + s.serverNowOffsetMs;
    for (let i = 0; i < s.plots.length; i += 1) {
      this.mapLayer.plotViews[i]?.refreshView(s.plots[i], serverNow);
    }
  }

  private wallClock(): string {
    const now = new Date();
    const hh = now.getHours();
    const mm = now.getMinutes();
    return `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
  }

  // ── static UI ───────────────────────────────────────────

  private buildLoadingCover(): void {
    const cover = sizedNode('LoadingCover', 720, 1280, this.node);
    cover.setPosition(0, 0, 0);
    roundRect(cover, 720, 1280, 0, SKY_COLOR);
    this.loadingCover = cover;
  }

  private buildStatusLabels(): void {
    const status = makeLabel('Status', '初始化…', 20, new Color(70, 70, 70, 255), this.node);
    status.node.setPosition(0, 600, 0);
    this.statusLabel = status;
    const tip = makeLabel('Tip', '点击空地种植 · 点击生长中浇水 · 点击成熟收获', 18, new Color(70, 60, 40, 255), this.node);
    tip.node.setPosition(0, -300, 0);
  }

  private setStatus(text: string): void {
    if (this.statusLabel) this.statusLabel.string = text;
    // M5-screenshot 2026-09-13: 之前 destroy 时机是「已连接服务端」— 但 devtools
    // 模拟器对 127.0.0.1 域 wx.request 拦截 → app.start() 永远失败 → cover 永远
    // 不销毁 → 24 块 + 场景道具 + UI 全被遮住（截图只能看到蓝屏）。改为「贴图
    // 加载完」就销毁：boot 阶段就绪，视觉立刻可读，连接状态用 banner 单独表达。
    if (this.loadingCover && text.startsWith('加载贴图')) {
      const m = text.match(/(\d+)\/(\d+)/);
      if (m && m[1] === m[2]) {
        this.loadingCover.destroy();
        this.loadingCover = null;
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[OnlineFarm] ${text}`);
  }
}
