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

/** Display size of one plot block (design px). ~44pt hit target comes from HIT_SIZE. */
export const PLOT_DISPLAY = 88;
export const CROP_DISPLAY = 56;
export const CROP_Y_LIFT = 10;
/** Independent hit node — 85 design px ≈ 44 physical pt on a 375pt screen (v24 §6). */
export const HIT_SIZE = 85;

export interface PlotLayoutEntry {
  index: number;
  row: number;
  col: number;
  center_720: [number, number];
}

export interface PlotLayout {
  lawn_region_720: [number, number, number, number];
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

export const SHOW_PARALLAX = false;
export const SHOW_WATER = false;
export const SHOW_PROPS = false;

/** Parallax strips, design sizes (asset ÷2), center-origin Y. UNCALIBRATED — flags off. */
export const PARALLAX_LAYERS = [
  { key: 'parallax/mountains_far_strip', speed: 0.15, w: 1440, h: 288, y: 510 },
  { key: 'parallax/mountains_near_strip', speed: 0.3, w: 1440, h: 160, y: 445 },
  { key: 'parallax/forest_belt_strip', speed: 0.5, w: 1440, h: 172, y: 360 },
] as const;

/** Water animation spot (painted pond). UNCALIBRATED — flag off. */
export const WATER_CENTER = new Vec3(-95, 150, 0);
export const WATER_SIZE = 280;
export const WATER_FRAME_MS = 500;

/** Prop table (batch G/E + existing modules), center-origin. UNCALIBRATED — flag off. */
export const PROPS = [
  { key: 'modules/signboard', x: 280, y: 20, w: 70 },
  { key: 'modules/haystack', x: 300, y: -460, w: 70 },
  { key: 'modules/bush_a', x: -290, y: 50, w: 90 },
  { key: 'modules/bush_b', x: 295, y: -80, w: 84 },
] as const;

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
  navSize: 88,
  navXs: [-270, -140, 0, 140, 270],
  navLabels: ['首页', '仓库', '种子', '好友', '更多'],

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

/** Lawn region in cocos space (from plot-layout.json) — props must avoid it. */
export function lawnRectCocos(layout: PlotLayout): Rect {
  const region = layout.lawn_region_720;
  const x0 = region[0];
  const y0Img = region[1];
  const x1 = region[2];
  const y1Img = region[3];
  return new Rect(x0 - DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2 - y1Img, x1 - x0, y1Img - y0Img);
}
