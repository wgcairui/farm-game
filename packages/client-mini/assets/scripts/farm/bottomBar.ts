/**
 * bottomBar — task bar placeholder + 5-key nav placeholder (v24 §7, U12).
 *
 * Task system is out of Phase 2 scope: the bar shows a static expansion quest
 * chip and the nav keys are non-interactive placeholders with ≥44pt hit boxes.
 * Nav keys are center-anchored (x ∈ ±270 < 295 half-width on 375pt screens).
 */

import { Color, Label } from 'cc';
import type { SpriteMap } from './assets';
import { UI, applyWidget } from './layout';
import { circle, makeLabel, roundRect, sizedNode } from './widgets';

const BAR_FILL = new Color(255, 247, 225, 235);
const BAR_STROKE = new Color(150, 110, 50, 255);
const TEXT = new Color(90, 60, 20, 255);

export class BottomBar {
  private progressLabel: Label | null = null;

  constructor(parent: Node, frames: SpriteMap) {
    void frames;

    // task bar placeholder (left-bottom, Widget anchored)
    const task = sizedNode('TaskBar', UI.taskBar.w, UI.taskBar.h, parent);
    applyWidget(task, UI.taskBar.widget);
    roundRect(task, UI.taskBar.w, UI.taskBar.h, 20, BAR_FILL, BAR_STROKE, 3);
    makeLabel('TaskText', '扩建第 7 块土地', 22, TEXT, task).node.setPosition(-70, 8, 0);
    const track = sizedNode('Track', 240, 14, task);
    track.setPosition(0, -16, 0);
    roundRect(track, 240, 14, 7, new Color(210, 190, 150, 255));
    const fill = sizedNode('Fill', 96, 14, track);
    fill.setPosition(-72, 0, 0);
    roundRect(fill, 96, 14, 7, new Color(110, 190, 80, 255));
    this.progressLabel = makeLabel('Progress', '(1/18)', 18, TEXT, task);
    this.progressLabel.node.setPosition(110, 8, 0);

    // nav 5 keys (placeholders)
    for (let i = 0; i < UI.navXs.length; i += 1) {
      const node = sizedNode(`Nav_${UI.navLabels[i]}`, UI.navSize, UI.navSize, parent);
      node.setPosition(UI.navXs[i], UI.navY, 0);
      applyWidget(node, { bottom: UI.navBottom });
      circle(node, 30, BAR_FILL, BAR_STROKE);
      makeLabel('NavText', UI.navLabels[i], 20, TEXT, node);
    }
  }

  /** Wire the task chip to real data later (task system not in Phase 2). */
  setTask(_text: string, _progress: number, _total: number): void {
    void this.progressLabel;
  }
}
