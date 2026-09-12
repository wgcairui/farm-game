/**
 * mapLayer — MapRoot subtree (implementation-plan-ui-v13.md §4.1).
 *
 * Bottom-up: ParallaxBack (flag off) → MapBase → PathLayer (flag off) →
 * WaterLayer (flag off) → PlotGrid (24 × PlotView) → SceneModules (flag off)
 * → FxLayer (filled by FxPlayer).
 *
 * The AI base map paints a complete scene, so the D–G scenery layers are
 * mounted but hidden by default (layout.ts flags) — see module header of
 * layout.ts for the rationale. `tick(dt)` drives the water frame swap.
 */

import { Node, Sprite } from 'cc';
import { loadAll, type SpriteMap } from './assets';
import {
  MAP_SIZE, PARALLAX_LAYERS, PROPS, SHOW_PARALLAX, SHOW_PROPS, SHOW_WATER,
  WATER_CENTER, WATER_FRAME_MS, WATER_SIZE,
} from './layout';
import type { PlotLayout } from './layout';
import { PlotView } from './plotView';
import { makeSprite, sizedNode } from './widgets';

export class MapLayer {
  readonly root: Node;
  readonly plotViews: PlotView[] = [];
  readonly fxLayer: Node;

  private readonly waterSprite: Sprite | null = null;
  private waterFrameA = true;
  private waterClock = 0;
  private readonly frames: SpriteMap;

  private constructor(root: Node, frames: SpriteMap, layout: PlotLayout) {
    this.root = root;
    this.frames = frames;

    if (SHOW_PARALLAX) this.buildParallax();
    this.buildMapBase();
    if (SHOW_PROPS) this.buildPaths();
    if (SHOW_WATER) this.waterSprite = this.buildWater();
    this.buildPlots(layout);
    if (SHOW_PROPS) this.buildModules();
    this.fxLayer = sizedNode('FxLayer', 0, 0, root);
  }

  /** Build MapRoot; resolves once the base map frame is attached. */
  static async create(parent: Node, layout: PlotLayout, onProgress?: (d: number, t: number) => void): Promise<MapLayer> {
    const root = sizedNode('MapRoot', MAP_SIZE.w, MAP_SIZE.h, parent);
    const frames = await loadAll(onProgress);
    return new MapLayer(root, frames, layout);
  }

  get framesMap(): SpriteMap {
    return this.frames;
  }

  private buildParallax(): void {
    const layer = sizedNode('ParallaxBack', 0, 0, this.root);
    for (let i = 0; i < PARALLAX_LAYERS.length; i += 1) {
      const strip = PARALLAX_LAYERS[i];
      const sprite = makeSprite(`Strip_${i}`, this.frames[strip.key] ?? null, strip.w, strip.h, layer);
      // Y is center-origin already; speed is reserved for the roaming-camera milestone.
      sprite.node.setPosition(0, strip.y, 0);
    }
  }

  private buildMapBase(): void {
    const sprite = makeSprite('MapBase', this.frames['map/base'] ?? null, MAP_SIZE.w, MAP_SIZE.h, this.root);
    sprite.node.setPosition(0, 0, 0); // MapRoot itself sits at MAP_CENTER
  }

  private buildPaths(): void {
    const layer = sizedNode('PathLayer', 0, 0, this.root);
    const keys = ['modules/path_straight_stone', 'modules/path_straight_dirt', 'modules/path_curve_stone', 'modules/path_end_cap'];
    for (let i = 0; i < keys.length; i += 1) {
      // placeholder mount points — UNCALIBRATED, layer is flag-off (layout.ts)
      const sprite = makeSprite(`Path_${i}`, this.frames[keys[i]] ?? null, 90, 90, layer);
      sprite.node.setPosition(-270 + i * 180, -340, 0);
    }
  }

  private buildWater(): Sprite {
    const layer = sizedNode('WaterLayer', 0, 0, this.root);
    const sprite = makeSprite('PondWater', this.frames['fx/pond_water_a'] ?? null, WATER_SIZE, WATER_SIZE, layer);
    sprite.node.setPosition(WATER_CENTER.x, WATER_CENTER.y, 0);
    return sprite;
  }

  private buildPlots(layout: PlotLayout): void {
    const grid = sizedNode('PlotGrid', 0, 0, this.root);
    for (let i = 0; i < layout.plots.length; i += 1) {
      this.plotViews.push(new PlotView(grid, layout.plots[i], this.frames));
    }
  }

  private buildModules(): void {
    const layer = sizedNode('SceneModules', 0, 0, this.root);
    for (let i = 0; i < PROPS.length; i += 1) {
      const prop = PROPS[i];
      const sprite = makeSprite(`Prop_${i}`, this.frames[prop.key] ?? null, prop.w, prop.w, layer);
      sprite.node.setPosition(prop.x, prop.y, 0);
    }
  }

  /** Water 2-frame swap — called from OnlineFarm.update(dt); no-op when flag off. */
  tick(dt: number): void {
    if (this.waterSprite === null) return;
    this.waterClock += dt * 1000;
    if (this.waterClock < WATER_FRAME_MS) return;
    this.waterClock = 0;
    this.waterFrameA = !this.waterFrameA;
    this.waterSprite.spriteFrame = this.frames[this.waterFrameA ? 'fx/pond_water_a' : 'fx/pond_water_b'] ?? null;
  }
}
