/**
 * sideColumn — right function column + left shortcuts (v24 §4–§5 ported, U11).
 *
 * Kit icons (batch H) on 88×88 independent hit nodes (≥44pt rule); every node
 * is edge-anchored via Widget so it survives Fit-Width shrink on phones.
 * Buttons without a backing feature render grayed + toast 「未开放」.
 */

import { Color, Label, Node, Sprite } from 'cc';
import type { SpriteMap } from './assets';
import { UI, applyWidget } from './layout';
import type { WidgetSpec } from './layout';
import { makeLabel, makeSprite, sizedNode } from './widgets';

const GRAY = new Color(150, 150, 150, 255);
const LABEL_COLOR = new Color(255, 250, 235, 255);
const CLOCK_COLOR = new Color(90, 60, 20, 255);

interface BtnSpec {
  readonly key: string;
  readonly top: number;
  readonly label: string;
}

export class SideColumn {
  private clockLabel: Label | null = null;

  constructor(
    parent: Node,
    frames: SpriteMap,
    onShop: () => void,
    onDisabled: (label: string) => void,
  ) {
    // ── right column ──
    const shop = this.iconButton(parent, frames, UI.sideBtns[0], { right: UI.sideRight, top: UI.sideBtns[0].top }, false);
    shop.on(Node.EventType.TOUCH_END, () => onShop());

    const pet = this.iconButton(parent, frames, UI.sideBtns[1], { right: UI.sideRight, top: UI.sideBtns[1].top }, true);
    pet.on(Node.EventType.TOUCH_END, () => onDisabled(UI.sideBtns[1].label));

    const basket = this.iconButton(parent, frames, UI.sideBtns[2], { right: UI.sideRight, top: UI.sideBtns[2].top }, true);
    basket.on(Node.EventType.TOUCH_END, () => onDisabled(UI.sideBtns[2].label));

    // time capsule — real wall clock, refreshed by OnlineFarm every 30s
    const capsule = sizedNode('TimeCapsule', UI.timeCapsule.w, UI.timeCapsule.h, parent);
    applyWidget(capsule, UI.timeCapsule.widget);
    this.clockLabel = makeLabel('Clock', '--:--', 22, CLOCK_COLOR, capsule);

    // ── left rail ──
    for (let i = 0; i < UI.leftBtns.length; i += 1) {
      const spec = UI.leftBtns[i];
      const btn = this.iconButton(parent, frames, spec, { left: UI.sideRight, top: spec.top }, true);
      const label = spec.label;
      btn.on(Node.EventType.TOUCH_END, () => onDisabled(label));
    }
  }

  /** Refresh the wall-clock capsule text. */
  setClock(text: string): void {
    if (this.clockLabel) this.clockLabel.string = text;
  }

  private iconButton(
    parent: Node,
    frames: SpriteMap,
    spec: BtnSpec,
    anchor: WidgetSpec,
    disabled: boolean,
  ): Node {
    const node = sizedNode(`Btn_${spec.label}`, UI.sideBtnSize, UI.sideBtnSize, parent);
    applyWidget(node, anchor);
    const sprite = makeSprite('Icon', frames[spec.key] ?? null, UI.sideBtnSize - 12, UI.sideBtnSize - 12, node);
    if (disabled && sprite.spriteFrame) sprite.color = GRAY;
    const tag = makeLabel('Tag', spec.label, 16, LABEL_COLOR, node);
    tag.node.setPosition(0, -UI.sideBtnSize / 2 - 2, 0);
    return node;
  }
}
