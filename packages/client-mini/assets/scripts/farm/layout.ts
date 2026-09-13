/**
 * layout — single tuning point for every geometry constant on the home page
 * (implementation-plan-ui-v13.md §4.3 / D1–D3).
 *
 * Coordinate systems:
 *   - Design space: 720×1280, Fit-Height. ALL constants below are Cocos UI
 *     space: **center-origin** (screen center = 0,0), x ∈ [−360, 360],
 *     y ∈ [−640, 640].
 *   - plot-layout.json `center_720` is IMAGE space (y down, origin top-left).
 *     Conversion to Cocos: (x − 360, 640 − y). Baked by `plotCocosPosition()`.
 *   - Edge-anchored UI (side columns, top HUD, conn dot, bottom bar) carries a
 *     `widget` spec instead of a fixed x/y — with Fit-Height the visible width
 *     shrinks below 720 on phones (≈591 on 375/390/430pt screens), so anything
 *     pinned by absolute x would fall off-screen. `applyWidget()` consumes it.
 *
 * The AI base map paints a complete scene (sky, mountains, forest, pond with a
 * bridge, cottage, dirt paths) with the 24-plot lawn reserved center-bottom, so
 * the extra scenery layers brought by art batches D–G (parallax strips, water
 * animation, path props) default to OFF: overlaying them on the painted scene
 * duplicates landmarks. They stay one flag away for the roaming-map milestone,
 * where the base grows beyond one screen and the 12-layer model takes over.
 */

import { Color, JsonAsset, Rect, resources, Vec3, view, ResolutionPolicy } from 'cc';
import { Widget } from 'cc';

export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

/** Apply once in OnlineFarm.onLoad before any UI is built. */
export function applyDesignResolution(): void {
  view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_HEIGHT);
}

/** Sky color of the base map top edge — camera clear color while assets load. */
export const SKY_COLOR = new Color(109, 205, 246, 255);

// ── Map layer ────────────────────────────────────────────────────

/** MapRoot sits at the screen center (0,0) and never moves in this milestone. */
export const MAP_SIZE = { w: DESIGN_WIDTH, h: DESIGN_HEIGHT };

// ── Plot grid ────────────────────────────────────────────────────

/** Display size of one plot block (design px). */
export const PLOT_DISPLAY = 88;
export const CROP_DISPLAY = 56;
export const CROP_Y_LIFT = 10;

export interface PlotLayoutEntry {
  index: number;
  row: number;
  col: number;
  center_720: [number, number];
}

export interface PlotLayout {
  lawn_region_720: [number, number, number, number];
  /**
   * Tile pitch of the plot field (= the touch cell, see plotView.ts). Adjacent
   * plots tile edge to edge; it is derived from the tile art's visible box,
   * not from PLOT_DISPLAY. Regenerate with scripts/make-plot-layout.mjs.
   */
  cell_size_720: [number, number];
  plots: PlotLayoutEntry[];
}

/** Load game/plot-layout.json (promise wrapper — Cocos resources API is callback based). */
export function loadPlotLayout(): Promise<PlotLayout> {
  return new Promise((resolve, reject) => {
    resources.load('game/plot-layout', JsonAsset, (err, asset) => {
      if (err || !asset) {
        reject(err ?? new Error('missing game/plot-layout.json'));
        return;
      }
      const json = (asset as JsonAsset).json as PlotLayout;
      if (!json || !Array.isArray(json.plots) || json.plots.length !== 24) {
        reject(new Error('plot-layout.json malformed (expected 24 plots)'));
        return;
      }
      if (!Array.isArray(json.cell_size_720) || json.cell_size_720.length !== 2) {
        reject(new Error('plot-layout.json malformed (expected cell_size_720 [w, h])'));
        return;
      }
      resolve(json);
    });
  });
}

/** Image-space center → Cocos center-origin position. */
export function plotCocosPosition(entry: PlotLayoutEntry): Vec3 {
  return new Vec3(entry.center_720[0] - DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - entry.center_720[1], 0);
}

/** Locked-plot price tag. Mirrors server `UNLOCK_PRICE_GOLD` (services/farm/unlock.ts) —
 *  keep in sync; there is no client-facing endpoint for it yet. */
export const UNLOCK_PRICE_GOLD = 100;

// ── Scene scenery flags (batches D–G — see module header) ───────

/** M5-A (2026-09-13): 远山+视差+池塘水波+场景道具全部开启。`SHOW_PROPS` 在
 *  之前的 baseline 是 false，是因为 PROPS 坐标是 placeholder；M5-A 重排了
 *  PROPS[] 并加了 3 层 z-order（far/mid/near），现在打开是安全的。 */
export const SHOW_PARALLAX = true;
export const SHOW_WATER = true;
export const SHOW_PROPS = true;

/** Parallax strips, design sizes (asset ÷2), center-origin Y. */
export const PARALLAX_LAYERS = [
  { key: 'parallax/mountains_far_strip', speed: 0.15, w: 1440, h: 288, y: 510 },
  { key: 'parallax/mountains_near_strip', speed: 0.3, w: 1440, h: 160, y: 445 },
  { key: 'parallax/forest_belt_strip', speed: 0.5, w: 1440, h: 172, y: 360 },
] as const;

/** Water animation spot (M5-A: 莲花池塘 in mid layer). */
export const WATER_CENTER = new Vec3(10, 350, 0);
export const WATER_SIZE = 200;
export const WATER_FRAME_MS = 500;

/** Prop table (M5-A), center-origin. y > -5 全部在 lawn 之上；x ∈ [-260, 240] 内
 *  只允许 y > -5（避免压地块）。`layer` 决定 z-order: far 在地块下，near 在地块上。 */
export interface PropSpec {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly layer: 'far' | 'mid' | 'near';
}

export const PROPS: readonly PropSpec[] = [
  // 远景装饰（小屋、草垛）
  { key: 'modules/cottage',       x: -250, y: 460, w: 150, layer: 'far'  },
  { key: 'modules/cottage_small', x:  200, y: 410, w: 110, layer: 'far'  },
  { key: 'modules/haystack',      x:  300, y: 280, w:  90, layer: 'far'  },
  // 中景：牌子、井、围栏
  { key: 'modules/signboard',     x:  280, y:  20, w:  70, layer: 'mid'  },
  { key: 'modules/water_well',    x:  295, y: -75, w:  90, layer: 'mid'  },
  { key: 'modules/fence_white',   x: -270, y: 200, w:  80, layer: 'mid'  },
  { key: 'modules/fence_white',   x:  305, y: 200, w:  80, layer: 'mid'  },
  { key: 'modules/fence_segment', x: -310, y: -300, w: 70, layer: 'mid'  },
  { key: 'modules/fence_segment', x:  310, y: -300, w: 70, layer: 'mid'  },
  // 中景：树丛
  { key: 'modules/bush_a',        x: -265, y:  50, w:  90, layer: 'mid'  },
  { key: 'modules/bush_b',        x:  280, y:  85, w:  84, layer: 'mid'  },
  { key: 'modules/bush_c',        x: -290, y:  370, w:  80, layer: 'mid'  },
  { key: 'modules/bush_d',        x:  290, y:  370, w:  80, layer: 'mid'  },
  // 中景：莲花池塘（在 lawn 之上、x 落在地块下沿）
  { key: 'modules/lotus_pond',    x:   10, y: 350, w: 130, layer: 'mid'  },
  // 近景：莲花叶、莲花、桥
  { key: 'modules/lily_pad_a',    x:  -45, y: 380, w:  40, layer: 'near' },
  { key: 'modules/lily_pad_b',    x:   60, y: 360, w:  40, layer: 'near' },
  { key: 'modules/lotus_flower',  x:   30, y: 320, w:  60, layer: 'near' },
  { key: 'modules/bridge',        x:   95, y: 350, w:  80, layer: 'near' },
  // 近景：装饰小石（绕开地块下沿）
  { key: 'modules/fence_stones',  x: -300, y: -130, w: 60, layer: 'near' },
  { key: 'modules/fence_stones',  x:  310, y: -130, w: 60, layer: 'near' },
];

/** Lawn region in cocos space (Cocos center-origin, y up). Anything placed in the
 *  PROPS[] array must NOT collide with this rect. Used by buildModules() as a
 *  dev-time guard so coordinate mistakes throw immediately. */
export function lawnRectCocos(layout: PlotLayout): Rect {
  const region = layout.lawn_region_720;
  const x0 = region[0];
  const y0Img = region[1];
  const x1 = region[2];
  const y1Img = region[3];
  return new Rect(x0 - DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - y1Img, x1 - x0, y1Img - y0Img);
}

// ── Screen layer (v24 §4–§7 ported to 720×1280; U15 audits these) ──

export interface WidgetSpec {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export const UI = {
  goldPanel: { w: 100, h: 108, widget: { left: 24, top: 12 } },
  cashPanel: { w: 92, h: 100, widget: { left: 136, top: 16 } },
  avatar: { r: 34, widget: { left: 258, top: 28 } },
  connDot: { r: 10, widget: { right: 28, top: 20 } },
  disconnectBanner: { w: 720, h: 64, y: 468 },

  // Right column — kit icons; basket falls back to seed_bag (§7 缺口降级)
  sideRight: 20,
  sideBtnSize: 88,
  sideBtns: [
    { key: 'ui/ui_icon_shop', top: 296, label: '商城', enabled: true },
    { key: 'ui/ui_icon_pet', top: 406, label: '萌宠', enabled: false },
    { key: 'icons/seed_bag', top: 516, label: '提篮', enabled: false },
  ],
  timeCapsule: { w: 128, h: 44, widget: { right: 24, top: 614 } },

  leftBtns: [
    { key: 'ui/ui_icon_share', top: 176, label: '分享' },
    { key: 'ui/ui_icon_music', top: 271, label: '音乐' },
    { key: 'ui/ui_icon_menu', top: 366, label: '菜单' },
    { key: 'ui/ui_icon_camera', top: 461, label: '相机' },
  ],

  taskBar: { w: 340, h: 64, widget: { left: 20, bottom: 96 } },
  navY: -576,
  navBottom: 20,
  navSize: 100,
  // M5-B 2026-09-13: 5 键占位（首页/仓库/种子/好友/更多）→ 4 键彩色按钮（仓库/商店/宠物/装扮）
  navXs: [-260, -90, 90, 260],
  navLabels: ['仓库', '商店', '宠物', '装扮'],

  toastX: 0,
  toastTopY: 400,
  toastGap: 64,

  dialogPanel: { w: 560, h: 420 },
} as const;

/** Edge-anchor a node inside its (full-screen) parent. */
export function applyWidget(node: Node, spec: WidgetSpec): void {
  const w = node.addComponent(Widget);
  w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  if (spec.left !== undefined) {
    w.isAlignLeft = true;
    w.left = spec.left;
  }
  if (spec.right !== undefined) {
    w.isAlignRight = true;
    w.right = spec.right;
  }
  if (spec.top !== undefined) {
    w.isAlignTop = true;
    w.top = spec.top;
  }
  if (spec.bottom !== undefined) {
    w.isAlignBottom = true;
    w.bottom = spec.bottom;
  }
}
