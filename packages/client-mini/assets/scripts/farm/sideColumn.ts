/**
 * sideColumn — right function column + left shortcuts (M7 2026-09-14: full
 * remake). Each of the 7 side buttons now renders as a real button sprite
 * (colored iOS-style rounded square) with an independent icon sprite overlaid
 * — same dual-layer pattern as the bottom tabbar (M6). The previous programmatic
 * `roundRect` frame + flat kit icon is gone; the colored button sprites live
 * under `ui/ui_btn_side_*` keys and the icons stay on the existing kit keys.
 *
 * - Right column (商城/萌宠/提篮) — 88×88 hit area; iconSize 72 centered; label
 *   sits below the button (cream text, no outline — they're on the colored
 *   button, not on transparent wood like the tabbar).
 * - Left rail (分享/音乐/菜单/相机) — 88×88 hit area; iconSize 60 centered;
 *   no label (the kit icon is enough).
 *
 * Buttons without a backing feature render at 60% opacity + toast 「未开放」.
 */

import { Color, Label, Node, Sprite } from 'cc';
import type { SpriteMap } from './assets';
import { UI, applyWidget } from './layout';
import type { WidgetSpec } from './layout';
import { makeLabel, makeSprite, sizedNode } from './widgets';

const LABEL_COLOR = new Color(255, 250, 235, 255);
const CLOCK_COLOR = new Color(90, 60, 20, 255);
const DISABLED_ALPHA = 0.6 * 255;

interface BtnSpec {
  readonly btnKey: string;
  readonly iconKey: string;
  readonly top: number;
  readonly label: string;
  readonly enabled?: boolean;
}

export class SideColumn {
  private clockLabel: Label | null = null;

  constructor(
    parent: Node,
    frames: SpriteMap,
    onShop: () => void,
    onDisabled: (label: string) => void,
  ) {
    // ── right column (M7: 真 button sprite + 真 icon sprite 双层) ──
    const shop = this.kitButton(parent, frames, UI.sideBtns[0], { right: UI.sideRight, top: UI.sideBtns[0].top }, false);
    shop.on(Node.EventType.TOUCH_END, () => onShop());

    const pet = this.kitButton(parent, frames, UI.sideBtns[1], { right: UI.sideRight, top: UI.sideBtns[1].top }, true);
    pet.on(Node.EventType.TOUCH_END, () => onDisabled(UI.sideBtns[1].label));

    const basket = this.kitButton(parent, frames, UI.sideBtns[2], { right: UI.sideRight, top: UI.sideBtns[2].top }, true);
    basket.on(Node.EventType.TOUCH_END, () => onDisabled(UI.sideBtns[2].label));

    // time capsule — real wall clock, refreshed by OnlineFarm every 30s
    const capsule = sizedNode('TimeCapsule', UI.timeCapsule.w, UI.timeCapsule.h, parent);
    applyWidget(capsule, UI.timeCapsule.widget);
    this.clockLabel = makeLabel('Clock', '--:--', 22, CLOCK_COLOR, capsule);

    // ── left rail (M7: 同上，去掉程序化 frame) ──
    for (let i = 0; i < UI.leftBtns.length; i += 1) {
      const spec = UI.leftBtns[i];
      const btn = this.railButton(parent, frames, spec, { left: UI.sideRight, top: spec.top });
      const label = spec.label;
      btn.on(Node.EventType.TOUCH_END, () => onDisabled(label));
    }
  }

  /** Refresh the wall-clock capsule text. */
  setClock(text: string): void {
    if (this.clockLabel) this.clockLabel.string = text;
  }

  /** M7: 右侧大按钮（商城/萌宠/提篮）— 88×88 colored button sprite + 72×72 icon sprite。 */
  private kitButton(
    parent: Node,
    frames: SpriteMap,
    spec: BtnSpec,
    anchor: WidgetSpec,
    disabled: boolean,
  ): Node {
    const node = sizedNode(`Btn_${spec.label}`, UI.sideBtnSize, UI.sideBtnSize, parent);
    applyWidget(node, anchor);

    // 1) button sprite（彩色圆角方块，全尺寸填满）
    const btnFrame = frames[spec.btnKey] ?? null;
    const btn = makeSprite('Btn', btnFrame, UI.sideBtnSize, UI.sideBtnSize, node);

    // 2) icon sprite（72×72 居中叠加）
    const iconFrame = frames[spec.iconKey] ?? null;
    const icon = makeSprite('Icon', iconFrame, UI.sideBtnIconSize, UI.sideBtnIconSize, node);
    icon.node.setPosition(0, 0, 0);

    if (disabled) {
      if (btn) (btn as Sprite).setOpacity(DISABLED_ALPHA);
      if (icon) (icon as Sprite).setOpacity(DISABLED_ALPHA);
    }

    // label（在按钮下方，跟 M5-C 一致）
    const tag = makeLabel('Tag', spec.label, 16, LABEL_COLOR, node);
    tag.node.setPosition(0, -UI.sideBtnSize / 2 - UI.sideBtnLabelGap, 0);
    return node;
  }

  /** M7: 左侧小按钮（分享/音乐/菜单/相机）— 88×88 colored button sprite + 60×60 icon sprite。 */
  private railButton(
    parent: Node,
    frames: SpriteMap,
    spec: BtnSpec,
    anchor: WidgetSpec,
  ): Node {
    const node = sizedNode(`Rail_${spec.label}`, UI.sideBtnSize, UI.sideBtnSize, parent);
    applyWidget(node, anchor);

    // 1) button sprite
    const btnFrame = frames[spec.btnKey] ?? null;
    makeSprite('Btn', btnFrame, UI.sideBtnSize, UI.sideBtnSize, node);

    // 2) icon sprite（60×60 居中叠加）
    const iconFrame = frames[spec.iconKey] ?? null;
    const icon = makeSprite('Icon', iconFrame, UI.leftBtnIconSize, UI.leftBtnIconSize, node);
    icon.node.setPosition(0, 0, 0);

    return node;
  }
}
