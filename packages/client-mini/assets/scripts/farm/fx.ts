/**
 * fx — effect playback on the FxLayer (implementation-plan-ui-v13.md U08).
 *
 * Tweens are hand-rolled in `update(dt)` (driven by OnlineFarm.update) instead
 * of cc.tween bezier helpers — fewer engine-API unknowns in the minigame
 * runtime, and no iterator protocols anywhere (plain arrays, index loops).
 *
 * Effects: plant dust / water splash / harvest burst (scale + fade), coin fly
 * (quadratic bezier from a world position to the gold panel).
 */

import { Node, SpriteFrame, UIOpacity, Vec3 } from 'cc';
import { makeSprite, withOpacity } from './widgets';

interface ActiveFx {
  node: Node;
  opacity: UIOpacity;
  age: number;
  duration: number;
  scaleStart: number;
  scaleEnd: number;
  /** Coin-fly path (FxLayer-local space). Absent for scale+fade bursts. */
  p0?: Vec3;
  p1?: Vec3;
  p2?: Vec3;
  onDone?: () => void;
}

export class FxPlayer {
  private readonly active: ActiveFx[] = [];
  private frames: Record<string, SpriteFrame> = {};

  constructor(readonly layer: Node) {}

  /** Inject the frame registry (set once by OnlineFarm after MapLayer.create). */
  setFrames(frames: Record<string, SpriteFrame>): void {
    this.frames = frames;
  }

  private toLocal(world: Vec3): Vec3 {
    const local = new Vec3();
    this.layer.inverseTransformPoint(local, world);
    return local;
  }

  private playBurst(key: string, world: Vec3, size: number, duration: number, scaleStart: number, scaleEnd: number): void {
    const frame = this.frames[key];
    if (!frame) return;
    const node = makeSprite(key.replace('/', '_'), frame, size, size, this.layer);
    node.setPosition(this.toLocal(world));
    node.setScale(scaleStart, scaleStart, 1);
    const opacity = withOpacity(node);
    opacity.opacity = 255;
    this.active.push({ node, opacity, age: 0, duration, scaleStart, scaleEnd });
  }

  playPlantDust(world: Vec3): void {
    this.playBurst('fx/plant_dust', world, 90, 0.5, 0.5, 1.05);
  }

  playWaterSplash(world: Vec3): void {
    this.playBurst('fx/water_splash', world, 96, 0.55, 0.5, 1.1);
  }

  playHarvestBurst(world: Vec3): void {
    this.playBurst('fx/harvest_burst', world, 130, 0.6, 0.6, 1.25);
  }

  /** Coin flies from `fromWorld` to `toWorld` along a quadratic arc. */
  playCoinFly(fromWorld: Vec3, toWorld: Vec3, onDone?: () => void): void {
    const frame = this.frames['icons/coin_flying'];
    if (!frame) {
      if (onDone) onDone();
      return;
    }
    const node = makeSprite('coin_fly', frame, 40, 40, this.layer);
    const p0 = this.toLocal(fromWorld);
    const p2 = this.toLocal(toWorld);
    const p1 = new Vec3((p0.x + p2.x) / 2, Math.max(p0.y, p2.y) + 120, 0);
    node.setPosition(p0);
    this.active.push({ node, opacity: withOpacity(node), age: 0, duration: 0.6, scaleStart: 1, scaleEnd: 1, p0, p1, p2, onDone });
  }

  /** Advance all active effects; called every frame from OnlineFarm.update. */
  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const fx = this.active[i];
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.duration);
      if (fx.p0 && fx.p1 && fx.p2) {
        const it = 1 - t;
        const x = it * it * fx.p0.x + 2 * it * t * fx.p1.x + t * t * fx.p2.x;
        const y = it * it * fx.p0.y + 2 * it * t * fx.p1.y + t * t * fx.p2.y;
        fx.node.setPosition(x, y, 0);
        fx.opacity.opacity = Math.round(255 * Math.min(1, t * 3));
      } else {
        const s = fx.scaleStart + (fx.scaleEnd - fx.scaleStart) * t;
        fx.node.setScale(s, s, 1);
        fx.opacity.opacity = Math.round(255 * (1 - t));
      }
      if (t >= 1) {
        fx.node.destroy();
        this.active.splice(i, 1);
        if (fx.onDone) fx.onDone();
      }
    }
  }
}
