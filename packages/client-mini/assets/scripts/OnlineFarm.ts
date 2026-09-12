/**
 * OnlineFarm — G3 联调最小 UI（程序化搭建，场景里只挂这一个组件）。
 *
 * 职责：
 *  - 启动 OnlineGameApp（固定 mock code，保证重开模拟器是同一玩家）
 *  - 程序化生成：顶部金币/状态 Label、6×4 地块网格（resources 加载贴图）
 *  - 点击地块：empty → plant(carrot)、growing → water、可收获 → harvest
 *  - 每秒按服务端时钟刷新生长阶段贴图（stage-1..4）
 *
 * 这是联调最小 UI，不是最终视觉；美化/动画/引导全部留给 Phase 4。
 */
import {
  _decorator, Component, Node, Sprite, SpriteFrame, Label, UITransform,
  Color, Layers, resources, view, Vec3,
} from 'cc';
import {
  OnlineGameApp, EventBus, GameEvent,
  type OnlineState, type OnlinePlotView, type OnlinePlotView as PlotView,
} from './vendor/farm-online.js';

const { ccclass } = _decorator;

const COLUMNS = 6;
const ROWS = 4;
const PLOT_COUNT = COLUMNS * ROWS;
const DEFAULT_CROP = 'carrot';
/** 固定 mock code：模拟器重启/重编译后仍登录同一玩家，验收「状态保留」。 */
const MOCK_CODE = 'mock_dev_cocos_simulator';

type SpriteMap = Record<string, SpriteFrame>;

@ccclass('OnlineFarm')
export class OnlineFarm extends Component {
  private app: OnlineGameApp | null = null;
  private started = false;
  private frames: SpriteMap = {};
  private plotNodes: Node[] = [];
  private goldLabel: Label | null = null;
  private statusLabel: Label | null = null;
  private tipLabel: Label | null = null;

  private onCoins: ((gold: number) => void) | null = null;
  private onPlot: ((index: number) => void) | null = null;
  private onConn: ((connected: boolean) => void) | null = null;

  async onLoad() {
    this.buildUi();
    this.setStatus('加载贴图…');
    try {
      this.frames = await this.loadFrames();
    } catch (err) {
      this.setStatus(`贴图加载失败: ${String((err as Error).message)}（检查 assets/resources/game）`);
      return;
    }
    this.app = new OnlineGameApp({
      baseUrl: 'http://127.0.0.1:3000',
      wsEndpoint: 'ws://127.0.0.1:2567',
      wechatCode: MOCK_CODE,
    });
    this.onCoins = (gold: number) => { if (this.goldLabel) this.goldLabel.string = `金币 ${gold}`; };
    this.onPlot = () => this.refreshAll();
    EventBus.on(GameEvent.CoinsChanged, this.onCoins as never);
    EventBus.on(GameEvent.PlotStateChanged, this.onPlot as never);
    this.onConn = (connected: boolean) => {
      this.setStatus(connected ? '已连接服务端' : '连接断开，自动重连中…');
      if (connected) this.refreshAll();
    };
    this.app.onConnectionChange(this.onConn);

    // 暴露给开发者工具自动化/控制台，便于验收断言。
    (globalThis as { __farm?: unknown }).__farm = {
      app: this.app,
      state: () => this.app?.state() ?? null,
    };

    // 后端未起时轮询重试 start（OnlineGameApp.start 抛错即离线）。
    this.schedule(() => { void this.ensureStarted(); }, 3);
    await this.ensureStarted();
    this.schedule(() => this.refreshAll(), 1);
    this.refreshAll();
  }

  onDestroy(): void {
    if (this.onCoins) EventBus.off(GameEvent.CoinsChanged, this.onCoins as never);
    if (this.onPlot) EventBus.off(GameEvent.PlotStateChanged, this.onPlot as never);
    void this.app?.stop().catch(() => undefined);
  }

  // ── 启动 ────────────────────────────────────────────────

  private async ensureStarted(): Promise<void> {
    if (this.started || this.app === null) return;
    try {
      await this.app.start();
      this.started = true;
      this.setStatus('已连接服务端');
      this.refreshAll();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[OnlineFarm] 离线：', err);
      this.setStatus(`离线：${String((err as Error).message).slice(0, 60)} — 3 秒后重试`);
    }
  }

  // ── 交互 ────────────────────────────────────────────────

  private onPlotClick(plotIndex: number): void {
    if (!this.app || !this.started) return;
    const plot = this.app.state().plots[plotIndex];
    if (!plot || !plot.unlocked) return;
    if (plot.status === 'empty') {
      void this.app.plant(plotIndex, DEFAULT_CROP).catch((e) => this.setStatus(`种植失败: ${String((e as Error).message)}`));
    } else if (plot.status === 'ripe' || plot.derivedRipe) {
      void this.app.harvest(plotIndex).catch((e) => this.setStatus(`收获失败: ${String((e as Error).message)}`));
    } else if (plot.status === 'growing') {
      void this.app.water(plotIndex).catch((e) => this.setStatus(`浇水失败: ${String((e as Error).message)}`));
    }
  }

  // ── 刷新 ────────────────────────────────────────────────

  private refreshAll(): void {
    if (!this.app) return;
    let s: OnlineState;
    try {
      s = this.app.state();
    } catch {
      return; // start() 之前 state() 抛「未启动」属预期
    }
    if (this.goldLabel) this.goldLabel.string = `金币 ${s.gold}`;
    for (const plot of s.plots) this.refreshPlot(plot);
  }

  private refreshPlot(plot: PlotView): void {
    const node = this.plotNodes[plot.index];
    if (!node) return;
    const sprite = node.getComponent(Sprite);
    if (!sprite) return;

    const set = (key: string): void => {
      const frame = this.frames[key];
      if (frame && sprite.spriteFrame !== frame) sprite.spriteFrame = frame;
    };
    if (!plot.unlocked || plot.status === 'locked') {
      set('locked');
      return;
    }
    if (plot.status === 'empty') {
      set('grass-empty');
      return;
    }
    if (plot.status === 'ripe' || plot.derivedRipe) {
      set('carrot-stage-4');
      return;
    }
    // growing：按服务端时钟进度切 stage-1/2/3
    const total = (plot.matureAt ?? 0) - (plot.plantedAt ?? 0);
    const elapsed = Math.max(0, Date.now() + this.app!.state().serverNowOffsetMs - (plot.plantedAt ?? 0));
    const progress = total > 0 ? elapsed / total : 1;
    if (progress < 0.34) set('carrot-stage-1');
    else if (progress < 0.67) set('carrot-stage-2');
    else set('carrot-stage-3');
  }

  // ── UI 构建 ─────────────────────────────────────────────

  private buildUi(): void {
    const canvas = this.node;
    const vis = view.getVisibleSize();
    const cell = Math.min(vis.width / (COLUMNS + 1.5), vis.height / (ROWS + 6));

    this.goldLabel = this.makeLabel('金币 —', cell * 0.42, new Vec3(0, vis.height / 2 - cell * 1.1, 0), Color.BLACK);
    this.statusLabel = this.makeLabel('初始化…', cell * 0.3, new Vec3(0, vis.height / 2 - cell * 1.8, 0), new Color(90, 90, 90));
    this.tipLabel = this.makeLabel('点击空地种植 · 点击生长中浇水 · 点击成熟收获', cell * 0.26, new Vec3(0, -vis.height / 2 + cell * 0.8, 0), new Color(120, 120, 120));

    const gridY0 = cell * 0.6;
    const gap = cell * 0.14;
    for (let i = 0; i < PLOT_COUNT; i += 1) {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      const node = new Node(`Plot_${i}`);
      node.layer = Layers.Enum.UI_2D;
      node.setParent(canvas);
      node.addComponent(UITransform).setContentSize(cell, cell);
      node.setPosition(
        (col - (COLUMNS - 1) / 2) * (cell + gap),
        gridY0 - row * (cell + gap),
        0,
      );
      const sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.type = Sprite.Type.SIMPLE;
      const plotIndex = i;
      node.on(Node.EventType.TOUCH_END, () => this.onPlotClick(plotIndex));
      this.plotNodes.push(node);
    }
  }

  private makeLabel(text: string, fontSize: number, pos: Vec3, color: Color): Label {
    const node = new Node(`Label_${text.slice(0, 4)}`);
    node.layer = Layers.Enum.UI_2D;
    node.setParent(this.node);
    node.setPosition(pos);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize * 1.3;
    label.color = color;
    return label;
  }

  private setStatus(text: string): void {
    if (this.statusLabel) this.statusLabel.string = text;
    // eslint-disable-next-line no-console
    console.log(`[OnlineFarm] ${text}`);
  }

  // ── 资源 ────────────────────────────────────────────────

  private loadFrames(): Promise<SpriteMap> {
    const keys = [
      'game/plots/locked',
      'game/plots/grass-empty',
      'game/crops/carrot/stage-1',
      'game/crops/carrot/stage-2',
      'game/crops/carrot/stage-3',
      'game/crops/carrot/stage-4',
    ];
    const map: SpriteMap = {};
    return Promise.all(keys.map((path) => new Promise<void>((resolve, reject) => {
      resources.load(`${path}/spriteFrame`, SpriteFrame, (err, frame) => {
        if (err || !frame) {
          reject(err ?? new Error(`missing frame ${path}`));
          return;
        }
        const key = path.split('/').slice(2).join('-');
        map[key] = frame as SpriteFrame;
        resolve();
      });
    }))).then(() => map);
  }
}
