/**
 * bottomBar — task chip + 4-key nav with v13 `ui_btn_round_red` kit buttons
 * (M5-B 2026-09-13, implementation-plan-ui-v13 §4.3 / §7 / U12).
 *
 * Nav keys are center-anchored at navXs ∈ {-260, -90, 90, 260} (y = navY, 100×100
 * buttons, ≥ 44pt hit boxes). Each button is a real Sprite using the v13 round
 * red kit asset; the 4 labels match the reference video (仓库 / 商店 / 宠物 /
 * 装扮). Wire the tap via `onAction(label)` — the caller decides whether to
 * open a dialog, fire a shop route, or show a "未开放" toast.
 */

import { Color, Label, Node, Sprite } from 'cc';
import type { SpriteMap } from './assets';
import { UI, applyWidget } from './layout';
import { makeLabel, makeSprite, roundRect, sizedNode } from './widgets';

const TASK_FILL = new Color(255, 247, 225, 235);
const TASK_STROKE = new Color(150, 110, 50, 255);
const TASK_TRACK = new Color(210, 190, 150, 255);
const TASK_PROGRESS = new Color(110, 190, 80, 255);
const TEXT = new Color(90, 60, 20, 255);
// M6 2026-09-14: 4-colour tabbar 上标签用白 + 黑描边 (在红/橙/蓝/绿底色都可见)
const NAV_LABEL_COLOR = new Color(255, 255, 255, 255);
const NAV_LABEL_OUTLINE = new Color(40, 30, 20, 255);

export type NavAction = '仓库' | '商店' | '宠物' | '装扮';

export class BottomBar {
  private progressLabel: Label | null = null;

  constructor(
    parent: Node,
    frames: SpriteMap,
    onAction: (action: NavAction) => void,
    onDisabled: (action: NavAction) => void,
  ) {
    // ── task chip (left-bottom, Widget anchored) ──
    const task = sizedNode('TaskBar', UI.taskBar.w, UI.taskBar.h, parent);
    applyWidget(task, UI.taskBar.widget);
    roundRect(task, UI.taskBar.w, UI.taskBar.h, 20, TASK_FILL, TASK_STROKE, 3);
    makeLabel('TaskText', '扩建第 7 块土地', 22, TEXT, task).node.setPosition(-70, 8, 0);
    const track = sizedNode('Track', 240, 14, task);
    track.setPosition(0, -16, 0);
    roundRect(track, 240, 14, 7, TASK_TRACK);
    const fill = sizedNode('Fill', 96, 14, track);
    fill.setPosition(-72, 0, 0);
    roundRect(fill, 96, 14, 7, TASK_PROGRESS);
    this.progressLabel = makeLabel('Progress', '(1/18)', 18, TEXT, task);
    this.progressLabel.node.setPosition(110, 8, 0);

    // ── 4 nav keys (M6 2026-09-14: 4-colour iOS tabbar + 独立 icon) ──
    for (let i = 0; i < UI.navLabels.length; i += 1) {
      const label = UI.navLabels[i] as NavAction;
      // 命中节点（≥ 44pt，独立于视觉按钮，按 v24 §6）
      const hit = sizedNode(`Nav_${label}`, UI.navSize, UI.navSize, parent);
      hit.setPosition(UI.navXs[i], UI.navY, 0);
      applyWidget(hit, { bottom: UI.navBottom });

      // 视觉按钮 sprite：4 色 iOS tabbar 圆角方块
      const btnKey = UI.navBtnKeys[i];
      const btnFrame = frames[btnKey] ?? null;
      const btn = makeSprite('Btn', btnFrame, UI.navSize, UI.navSize, hit);
      void btn;

      // 独立 icon sprite（64×64，中心 +4Y 让视觉重心下移）
      const iconKey = UI.navIconKeys[i];
      const iconFrame = frames[iconKey] ?? null;
      const icon = makeSprite('Icon', iconFrame, UI.navIconSize, UI.navIconSize, hit);
      icon.node.setPosition(0, UI.navIconLiftY, 0);

      // 文字标签（在按钮下方）— M6: 白字 + 黑描边
      const tag = makeLabel('NavText', label, 18, NAV_LABEL_COLOR, hit);
      tag.color = NAV_LABEL_COLOR;
      if (tag && (tag as any).outlineWidth !== undefined) {
        (tag as any).outlineWidth = 2;
        (tag as any).outlineColor = NAV_LABEL_OUTLINE;
      }
      tag.node.setPosition(0, -UI.navSize / 2 - 12, 0);

      // 事件（不消费的 label 当 disabled：弹未开放 toast）
      const handler = (): void => {
        if (label === '商店') onAction(label);
        else onDisabled(label);
      };
      hit.on(Node.EventType.TOUCH_END, handler);
    }
  }

  /** Wire the task chip to real data later (task system not in Phase 2). */
  setTask(_text: string, _progress: number, _total: number): void {
    void this.progressLabel;
  }
}
