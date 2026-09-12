/**
 * toast — queued toast messages (implementation-plan-ui-v13.md U14).
 *
 * Max 3 stacked chips, 2.5s each, fading in/out. Pure node building + a
 * hand-rolled fade driven by `update(dt)` from OnlineFarm (no cc.tween).
 */

import { Color, Label, Node } from 'cc';
import { UI } from './layout';
import { makeLabel, roundRect, sizedNode, withOpacity } from './widgets';

interface Toast {
  node: Node;
  label: Label;
  opacity: ReturnType<typeof withOpacity>;
  age: number;
}

const LIFETIME = 2.5;
const FADE = 0.25;
const MAX_VISIBLE = 3;

export class ToastLayer {
  private readonly layer: Node;
  private readonly live: Toast[] = [];
  private readonly pending: string[] = [];

  constructor(parent: Node) {
    this.layer = sizedNode('ToastLayer', 0, 0, parent);
    this.layer.setPosition(UI.toastX, 0, 0);
  }

  show(message: string): void {
    if (this.live.length >= MAX_VISIBLE) {
      this.pending.push(message);
      return;
    }
    const node = sizedNode(`Toast_${this.live.length}`, 0, 0, this.layer);
    const label = makeLabel('Text', message, 24, new Color(70, 45, 15, 255), node);
    // size the chip after one layout pass — approximate by string length
    const w = Math.max(200, message.length * 24 * 1.05 + 48);
    label.node.setPosition(0, 0, 0);
    roundRect(node, w, 52, 26, new Color(255, 247, 225, 245), new Color(150, 110, 50, 255), 3);
    const slot = this.live.length;
    node.setPosition(0, UI.toastTopY - slot * UI.toastGap, 0);
    const opacity = withOpacity(node);
    opacity.opacity = 0;
    this.live.push({ node, label, opacity, age: 0 });
  }

  /** Called every frame from OnlineFarm.update. */
  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      const toast = this.live[i];
      toast.age += dt;
      if (toast.age < FADE) {
        toast.opacity.opacity = Math.round(255 * (toast.age / FADE));
      } else if (toast.age > LIFETIME - FADE) {
        toast.opacity.opacity = Math.round(255 * Math.max(0, (LIFETIME - toast.age) / FADE));
      }
      if (toast.age >= LIFETIME) {
        toast.node.destroy();
        this.live.splice(i, 1);
      }
    }
    // promote queued messages as slots free up
    while (this.pending.length > 0 && this.live.length < MAX_VISIBLE) {
      const next = this.pending.shift();
      if (next !== undefined) this.show(next);
    }
  }
}
