/**
 * Farm system (client-mini). Drives plot state machine locally; server is
 * authoritative in Phase 2 — this class is also used as a local mirror that
 * syncs from server PlotUpdated messages via EventBus (server_plot_updated).
 */

import {
  EventBus,
  GameEvent,
  TimeManager,
  computeMatureAt,
  getCrop,
  type PlotState,
} from '@farm-game/shared';
import type { InventorySystem } from './InventorySystem.js';

const DEFAULT_WITHER_WINDOW = 24 * 3600;

export class FarmSystem {
  private _plots: PlotState[] = [];
  private _timeManager = new TimeManager();
  private _inventory: InventorySystem | null = null;

  init(plots: PlotState[]): void { this._plots = plots; }
  bindInventory(inv: InventorySystem): void { this._inventory = inv; }
  setTimeManager(tm: TimeManager): void { this._timeManager = tm; }

  get plots(): ReadonlyArray<PlotState> { return this._plots; }

  /** Called on app start to roll forward growing plots after offline. */
  recalcOnLogin(): void {
    for (const plot of this._plots) {
      if (plot.status !== 'growing' || !plot.cropId || !plot.plantedAt) continue;
      const cfg = getCrop(plot.cropId);
      if (!cfg) { plot.status = 'empty'; continue; }
      const matureAt = computeMatureAt(plot.plantedAt, plot.cropId);
      if (matureAt == null) continue;
      plot.matureAt = matureAt;
      if (this._timeManager.isWithered(plot.plantedAt, cfg.growthDuration, cfg.witherWindow ?? DEFAULT_WITHER_WINDOW)) {
        plot.status = 'withered';
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
      } else if (this._timeManager.isReady(plot.plantedAt, cfg.growthDuration)) {
        plot.status = 'ready';
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
      }
    }
  }

  plant(plotIndex: number, cropId: string): boolean {
    if (!this._inventory) return false;
    const plot = this._plots[plotIndex];
    if (!plot || plot.status !== 'empty') return false;
    const cfg = getCrop(cropId);
    if (!cfg) return false;
    if (!this._inventory.remove(cfg.seedItemId, 1)) return false;
    const plantedAt = this._timeManager.now();
    plot.status = 'growing';
    plot.cropId = cropId;
    plot.plantedAt = plantedAt;
    const matureAt = computeMatureAt(plantedAt, cropId);
    plot.matureAt = matureAt;
    EventBus.emit(GameEvent.PlotStateChanged, plot.index);
    return true;
  }

  harvest(plotIndex: number): boolean {
    if (!this._inventory) return false;
    const plot = this._plots[plotIndex];
    if (!plot || plot.status !== 'ready' || !plot.cropId) return false;
    const cfg = getCrop(plot.cropId);
    if (!cfg) return false;
    if (!this._inventory.add(cfg.cropItemId, 1)) return false;
    this.resetPlot(plot);
    EventBus.emit(GameEvent.CropHarvested, { plotIndex, cropId: cfg.id });
    return true;
  }

  clearWithered(plotIndex: number): boolean {
    const plot = this._plots[plotIndex];
    if (!plot || plot.status !== 'withered') return false;
    this.resetPlot(plot);
    EventBus.emit(GameEvent.PlotStateChanged, plot.index);
    return true;
  }

  harvestAll(): number {
    let count = 0;
    for (const p of this._plots) {
      if (this.harvest(p.index)) count += 1;
    }
    return count;
  }

  /** 1-second tick: scan growing plots for ready / withered transitions. */
  tick(): void {
    for (const plot of this._plots) {
      if (plot.status !== 'growing' || !plot.cropId || !plot.plantedAt) continue;
      const cfg = getCrop(plot.cropId);
      if (!cfg) continue;
      if (this._timeManager.isWithered(plot.plantedAt, cfg.growthDuration, cfg.witherWindow ?? DEFAULT_WITHER_WINDOW)) {
        plot.status = 'withered';
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
      } else if (this._timeManager.isReady(plot.plantedAt, cfg.growthDuration)) {
        plot.status = 'ready';
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
      }
    }
  }

  private resetPlot(plot: PlotState): void {
    plot.status = 'empty';
    plot.cropId = undefined;
    plot.plantedAt = undefined;
    plot.matureAt = undefined;
    plot.waterCount = 0;
  }
}