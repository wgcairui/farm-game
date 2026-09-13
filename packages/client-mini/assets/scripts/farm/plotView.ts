/**
 * plotView — one farm tile: base block + crop + state overlays + countdown +
 * independent hit node (implementation-plan-ui-v13.md §4.2).
 *
 * State machine (data = OnlinePlotView from OnlineGameApp.state()):
 *   locked                  → plot_locked + gate + price tag
 *   empty                   → plot_grass_empty
 *   growing (unwatered)     → plot_tilled_empty + crop stage-1..3 + countdown
 *   growing (watered)       → overlay_wet (full-block wet soil) + crop + countdown
 *   growing + derivedRipe   → overlay_ripe (glowing full block) + crop stage-4
 *   ripe                    → same as derivedRipe
 *   pressed                 → programmatic selection ring (asset excluded, §5)
 *
 * overlay_wet / overlay_ripe are FULL plot replacements from the same art
 * batch (same perspective), not additive overlays.
 */

import { Color, Label, Node, Sprite, SpriteFrame } from 'cc';
import type { OnlinePlotView } from '../vendor/farm-online.js';
import {
  CROP_DISPLAY, CROP_Y_LIFT, PLOT_DISPLAY, PLOT_DISPLAY_H, PLOT_DISPLAY_W,
  UNLOCK_PRICE_GOLD, plotCocosPosition,
} from './layout';
import type { PlotLayoutEntry } from './layout';
import type { SpriteMap } from './assets';
import { makeLabel, makeSprite, roundRect, selectionRing, sizedNode } from './widgets';

const STAGE_SPLIT_1 = 0.34;
const STAGE_SPLIT_2 = 0.67;

export type PlotAction = 'plant' | 'water' | 'harvest' | 'unlock';

export class PlotView {
  readonly node: Node;
  private readonly base: Sprite;
  private readonly cropSprite: Sprite;
  private readonly lockIcon: Sprite;
  private readonly priceLabel: Label;
  private readonly timeChip: Node;
  private readonly timeLabel: Label;
  private readonly ring: Node;
  private readonly badge: Sprite;
  private readonly frames: SpriteMap;
  private readonly layoutEntry: PlotLayoutEntry;

  /** Wired by OnlineFarm — dispatches the semantic action for the CURRENT state. */
  onAction: ((plotIndex: number, action: PlotAction) => void) | null = null;

  constructor(parent: Node, entry: PlotLayoutEntry, cell: [number, number], frames: SpriteMap) {
    this.frames = frames;
    this.layoutEntry = entry;

    // M5-fix (2026-09-13): sprite box 用 PLOT_DISPLAY_W × PLOT_DISPLAY_H（= cell pitch 75×47），
    // 不是老的 88×88。cell pitch 见 plot-layout.json cell_size_720。子元素（lock / timeChip /
    // badge / crop）按比例缩到能放进 47 高。
    this.node = sizedNode(`Plot_${entry.index}`, PLOT_DISPLAY_W, PLOT_DISPLAY_H, parent);
    this.node.setPosition(plotCocosPosition(entry));

    this.base = makeSprite('Base', this.f('plots/plot_grass_empty'), PLOT_DISPLAY_W, PLOT_DISPLAY_H, this.node);

    this.cropSprite = makeSprite(
      'Crop', null, CROP_DISPLAY, CROP_DISPLAY, this.node,
    );
    this.cropSprite.node.setPosition(0, CROP_Y_LIFT, 0);

    this.lockIcon = makeSprite('Lock', this.f('icons/lock_sign'), 28, 28, this.node);
    this.lockIcon.node.setPosition(-10, 4, 0);
    // M5-screenshot 2026-09-13: 默认隐藏 lock/price — node.active 不够（sprite renderer
    // 仍会画 spriteFrame），需要 sprite.enabled = false 让 renderer 真正跳过。
    this.lockIcon.enabled = false;
    this.priceLabel = makeLabel('Price', `${UNLOCK_PRICE_GOLD}`, 14, new Color(255, 232, 150, 255), this.node);
    this.priceLabel.node.setPosition(10, 0, 0);
    this.priceLabel.node.active = false;

    // Countdown tag lives INSIDE the tile: the field is contiguous, so anything
    // floating above a plot would sit on the row behind it. Sits high enough to
    // clear the crop, and never shows together with the ripe badge.
    this.timeChip = sizedNode('TimeChip', 36, 12, this.node);
    this.timeChip.setPosition(0, 14, 0);
    roundRect(this.timeChip, 36, 12, 6, new Color(255, 252, 240, 225), new Color(120, 90, 40, 255), 1);
    this.timeLabel = makeLabel('Time', '', 11, new Color(60, 40, 10, 255), this.timeChip);

    this.badge = makeSprite('RipeBadge', this.f('icons/harvest_sparkle'), 24, 24, this.node);
    this.badge.node.setPosition(PLOT_DISPLAY_W / 2 - 6, PLOT_DISPLAY_H / 2 - 2, 0);

    // Touch cell = the layout pitch, so neighbouring plots never overlap in the
    // hit test (Cocos dispatches to the topmost node containing the point; an
    // 85px box on a 47px pitch would let the front row steal the back row's
    // taps). Nudged down to sit on the tile's visible box, which is offset from
    // the sprite box centre by ~2px.
    this.ring = selectionRing(cell[0] - 2, cell[1] + 4, this.node);
    this.ring.setPosition(0, -2, 0);

    const hit = sizedNode('Hit', cell[0], cell[1], this.node);
    hit.setPosition(0, -2, 0);
    hit.on(Node.EventType.TOUCH_START, () => {
      this.ring.active = true;
    });
    hit.on(Node.EventType.TOUCH_END, () => {
      this.ring.active = false;
      this.dispatch();
    });
    hit.on(Node.EventType.TOUCH_CANCEL, () => {
      this.ring.active = false;
    });

    this.refreshView(null, 0);
  }

  private f(key: string): SpriteFrame | null {
    return this.frames[key] ?? null;
  }

  private dispatch(): void {
    if (!this.onAction) return;
    // Re-derive from the latest cached view data instead of the last refresh:
    // OnlineFarm stores the newest OnlinePlotView via setViewData().
    const plot = this.latest;
    if (plot === null) return;
    if (!plot.unlocked) this.onAction(plot.index, 'unlock');
    else if (plot.status === 'empty') this.onAction(plot.index, 'plant');
    else if (plot.status === 'ripe' || plot.derivedRipe) this.onAction(plot.index, 'harvest');
    else if (plot.status === 'growing') this.onAction(plot.index, 'water');
  }

  /** Newest view data, kept by OnlineFarm on every state event for hit-time dispatch. */
  private latest: OnlinePlotView | null = null;

  /** Called by OnlineFarm on plot_state_changed / boot / 1s tick. */
  refreshView(plot: OnlinePlotView | null, serverNow: number): void {
    if (plot !== null) this.latest = plot;
    const p = this.latest;
    if (p === null) {
      this.base.spriteFrame = this.f('plots/plot_grass_empty');
      this.setVisible(false, false, false, false);
      return;
    }

    const growing = p.status === 'growing';
    const ripe = p.status === 'ripe' || p.derivedRipe;

    if (!p.unlocked) {
      this.base.spriteFrame = this.f('plots/plot_locked');
      this.setVisible(true, false, false, false);
      return;
    }

    if (p.status === 'empty') {
      this.base.spriteFrame = this.f('plots/plot_grass_empty');
      this.setVisible(false, false, false, false);
      return;
    }

    if (ripe) {
      this.base.spriteFrame = this.f('plots/overlay_ripe');
      this.cropSprite.spriteFrame = this.cropFrame(p.cropId, 4);
      this.setVisible(false, true, false, true);
      return;
    }

    // growing: full-block wet soil once watered, tilled soil otherwise
    this.base.spriteFrame = this.f(p.waterCount > 0 ? 'plots/overlay_wet' : 'plots/plot_tilled_empty');
    this.cropSprite.spriteFrame = this.cropFrame(p.cropId, this.stageFor(p, serverNow));
    this.setVisible(false, true, true, false);
    this.updateCountdown(p, serverNow);
  }

  private setVisible(lock: boolean, crop: boolean, time: boolean, badge: boolean): void {
    // M5-screenshot 2026-09-13: lock/price 必须同时改 node.active + sprite.enabled，
    // 单改 active 不能阻止 sprite renderer 画 spriteFrame。
    this.lockIcon.enabled = lock;
    this.lockIcon.node.active = lock;
    this.priceLabel.node.active = lock;
    this.cropSprite.node.active = crop;
    this.timeChip.active = time;
    this.badge.node.active = badge;
  }

  private cropFrame(cropId: string | undefined, stage: number): SpriteFrame | null {
    const id = cropId ?? 'carrot';
    return this.f(`crops/${id}/stage-${stage}`);
  }

  private stageFor(p: OnlinePlotView, serverNow: number): number {
    const planted = p.plantedAt ?? 0;
    const mature = p.matureAt ?? 0;
    const total = mature - planted;
    if (total <= 0) return 4;
    const elapsed = Math.max(0, Math.min(total, serverNow - planted));
    const progress = elapsed / total;
    if (progress < STAGE_SPLIT_1) return 1;
    if (progress < STAGE_SPLIT_2) return 2;
    return 3;
  }

  private updateCountdown(p: OnlinePlotView, serverNow: number): void {
    const mature = p.matureAt ?? 0;
    const remainSec = Math.max(0, Math.ceil((mature - serverNow) / 1000));
    const mm = Math.floor(remainSec / 60);
    const ss = remainSec % 60;
    this.timeLabel.string = `${mm}:${ss < 10 ? '0' : ''}${ss}`;
  }
}
