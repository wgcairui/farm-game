/**
 * dialogs — modal layer: seed picker + unlock confirm (U13, U07 data source).
 *
 * Panel base = batch H `ui_popup_panel`; close/confirm = `ui_btn_close` /
 * `ui_btn_confirm`. Row layout follows the reference-video shop-dialog density
 * rule: seed price / sell price / growth time / water cap visible per row so
 * the player decides without leaving the dialog (reference-video-analysis §一).
 *
 * Crop data comes from the vendor bundle's re-export of shared CROPS (static
 * config; U07 prerequisite). Gold-gated rows render grayed and ignore taps.
 */

import { BlockInputEvents, Color, Node } from 'cc';
import { CROPS } from '../vendor/farm-online.js';
import type { SpriteMap } from './assets';
import { UNLOCK_PRICE_GOLD } from './layout';
import { makeLabel, makeSprite, roundRect, sizedNode, withOpacity } from './widgets';

const PANEL_TEXT = new Color(255, 248, 230, 255);
const TEXT = new Color(80, 52, 18, 255);
const TEXT_DIM = new Color(150, 130, 100, 255);
const ROW_FILL = new Color(255, 244, 214, 235);
const ROW_FILL_DIM = new Color(228, 218, 196, 200);
const ROW_STROKE = new Color(160, 118, 55, 255);

/** '秒'/'分钟'/'小时' compact duration (reference-video shop dialog style). */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
  return `${Math.round(seconds / 3600)}小时`;
}

type CloseReason =
  | { kind: 'close' }
  | { kind: 'pick'; cropId: string }
  | { kind: 'confirm'; plotIndex: number };

export class DialogLayer {
  private readonly root: Node;
  private readonly frames: SpriteMap;
  private gold = 0;

  constructor(parent: Node, frames: SpriteMap) {
    this.frames = frames;
    this.root = sizedNode('DialogLayer', 0, 0, parent);
    this.root.active = false;
  }

  /** Keep the gold gate fresh — OnlineFarm pushes coins_changed here. */
  setGold(gold: number): void {
    this.gold = gold;
  }

  /** Seed picker over the 5 shared crops. `onPick(cropId)` plants immediately. */
  showSeedPicker(): void {
    this.open((panel, close) => {
      makeLabel('Title', '选择种子', 30, TEXT, panel).node.setPosition(0, 160, 0);
      const rowH = 52;
      const rowW = 480;
      for (let i = 0; i < CROPS.length; i += 1) {
        const crop = CROPS[i];
        const affordable = this.gold >= crop.seedPrice;
        const row = sizedNode(`Row_${crop.id}`, rowW, rowH, panel);
        row.setPosition(0, 94 - i * (rowH + 10), 0);
        roundRect(row, rowW, rowH, 14, affordable ? ROW_FILL : ROW_FILL_DIM, ROW_STROKE, 2);

        const icon = makeSprite('Icon', this.frames[`crops/${crop.id}/stage-4`] ?? null, 46, 46, row);
        icon.node.setPosition(-rowW / 2 + 38, 0, 0);
        if (!affordable) icon.color = new Color(160, 160, 160, 255);

        makeLabel('Name', crop.name, 24, affordable ? TEXT : TEXT_DIM, row).node.setPosition(-rowW / 2 + 100, 0, 0);

        const stats = `买 ${crop.seedPrice} · 卖 ${crop.sellPrice} · ${formatDuration(crop.growthDuration)} · 浇水×${crop.maxWater}`;
        makeLabel('Stats', stats, 16, affordable ? TEXT : TEXT_DIM, row).node.setPosition(62, 0, 0);

        if (affordable) {
          row.on(Node.EventType.TOUCH_END, () => close({ kind: 'pick', cropId: crop.id }));
        }
      }
      if (this.gold < 10) {
        makeLabel('Hint', '金币不足，先收获几茬作物吧', 16, TEXT_DIM, panel).node.setPosition(0, -196, 0);
      }
    });
  }

  /** Unlock confirmation (price mirrors server UNLOCK_PRICE_GOLD — layout.ts). */
  showUnlockConfirm(plotIndex: number): void {
    this.open((panel, close) => {
      makeLabel('Title', '开垦新土地', 30, TEXT, panel).node.setPosition(0, 90, 0);
      makeLabel('Body', `花费 ${UNLOCK_PRICE_GOLD} 金币开垦这块土地？`, 24, TEXT, panel).node.setPosition(0, 20, 0);
      // M5-D 2026-09-13: 「开垦」主按钮已经接 ui_btn_confirm (d5fcbbb)；
      // 「再想想」次按钮升级为 ui_btn_close 圆角 × 按钮。
      const confirm = makeSprite('Confirm', this.frames['ui/ui_btn_confirm'] ?? null, 180, 72, panel);
      confirm.node.setPosition(-110, -110, 0);
      makeLabel('ConfirmText', '开垦', 28, TEXT, confirm.node).node.setPosition(0, -4, 0);
      const cancel = makeSprite('Cancel', this.frames['ui/ui_btn_close'] ?? null, 72, 72, panel);
      cancel.node.setPosition(110, -110, 0);
      confirm.node.on(Node.EventType.TOUCH_END, () => close({ kind: 'confirm', plotIndex }));
      cancel.node.on(Node.EventType.TOUCH_END, () => close({ kind: 'close' }));
    });
  }

  /** Mount a panel + blocker; `build` fills content; auto-close on result. */
  private open(build: (panel: Node, close: (result: CloseReason) => void) => void): void {
    this.clearRoot();
    this.root.active = true;

    // full-screen blocker swallows touches below the dialog
    const blocker = sizedNode('Blocker', 720, 1280, this.root);
    blocker.addComponent(BlockInputEvents);
    roundRect(blocker, 720, 1280, 0, new Color(0, 0, 0, 130));

    const panelSpec = { w: 560, h: 420 };
    const panel = sizedNode('Panel', panelSpec.w, panelSpec.h, this.root);
    makeSprite('PanelBase', this.frames['ui/ui_popup_panel'] ?? null, panelSpec.w, panelSpec.h, panel);
    panel.setScale(0.7, 0.7, 1);
    withOpacity(panel).opacity = 0;

    const closeBtn = makeSprite('CloseBtn', this.frames['ui/ui_btn_close'] ?? null, 56, 56, panel);
    closeBtn.node.setPosition(panelSpec.w / 2 - 16, panelSpec.h / 2 - 12, 0);

    const finish = (result: CloseReason): void => {
      this.clearRoot();
      this.root.active = false;
      if (result.kind === 'confirm' || result.kind === 'pick') {
        this.onResult(result);
      }
    };
    closeBtn.node.on(Node.EventType.TOUCH_END, () => finish({ kind: 'close' }));

    build(panel, finish);

    // pop-in: scale 0.7→1 + fade-in over 0.18s (hand-rolled via OnlineFarm tick)
    this.pendingPop = { node: panel, age: 0 };
  }

  private pendingPop: { node: Node; age: number } | null = null;

  /** Result routing — OnlineFarm assigns these. */
  onResult: ((result: Exclude<CloseReason, { kind: 'close' }>) => void) | null = null;

  /** Called every frame from OnlineFarm.update — panel pop-in + gold refresh. */
  update(dt: number): void {
    if (this.pendingPop !== null) {
      this.pendingPop.age += dt;
      const t = Math.min(1, this.pendingPop.age / 0.18);
      const s = 0.7 + 0.3 * t;
      this.pendingPop.node.setScale(s, s, 1);
      withOpacity(this.pendingPop.node).opacity = Math.round(255 * t);
      if (t >= 1) this.pendingPop = null;
    }
  }

  private clearRoot(): void {
    this.pendingPop = null;
    const children = this.root.children.slice();
    for (let i = 0; i < children.length; i += 1) children[i].destroy();
  }
}
