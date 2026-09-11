/**
 * Farm system (client-mini). Drives plot state machine locally; server is
 * authoritative in Phase 2 — this class is also used as a local mirror that
 * syncs from server PlotUpdated messages via EventBus (server_plot_updated).
 *
 * Per ADR-0002 D10/D11/D12:
 *  - Status enum is `locked / empty / growing / ripe` (no `withered`).
 *  - Planting deducts gold directly; harvest awards gold directly. No
 *    inventory is read or written here.
 */

import {
  EventBus,
  GameEvent,
  TimeManager,
  applyWater,
  computeMatureAt,
  getCrop,
  type PlotState,
} from '@farm-game/shared';
import type { EconomySystem } from './EconomySystem.js';

export class FarmSystem {
  private _plots: PlotState[] = [];
  private _timeManager = new TimeManager();
  private _economy: EconomySystem | null = null;

  init(plots: PlotState[]): void { this._plots = plots; }
  bindEconomy(eco: EconomySystem): void { this._economy = eco; }
  setTimeManager(tm: TimeManager): void { this._timeManager = tm; }

  get plots(): ReadonlyArray<PlotState> { return this._plots; }

  /** Called on app start to roll forward growing plots after offline. */
  recalcOnLogin(): void {
    const now = this._timeManager.now();
    for (const plot of this._plots) {
      if (plot.status !== 'growing' || !plot.cropId || !plot.plantedAt) continue;
      const cfg = getCrop(plot.cropId);
      if (!cfg) { this.resetPlot(plot); continue; }
      const matureAt = computeMatureAt(plot.plantedAt, plot.cropId);
      if (matureAt == null) continue;
      plot.matureAt = matureAt;
      if (now >= matureAt) {
        plot.status = 'ripe';
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
      }
    }
  }

  plant(plotIndex: number, cropId: string): boolean {
    const plot = this._plots[plotIndex];
    if (!plot || plot.status !== 'empty') return false;
    const cfg = getCrop(cropId);
    if (!cfg) return false;
    if (!this._economy || !this._economy.spend(cfg.seedPrice)) return false;
    const plantedAt = this._timeManager.now();
    plot.status = 'growing';
    plot.cropId = cropId;
    plot.plantedAt = plantedAt;
    plot.matureAt = computeMatureAt(plantedAt, cropId);
    EventBus.emit(GameEvent.PlotStateChanged, plot.index);
    return true;
  }

  water(plotIndex: number): boolean {
    const plot = this._plots[plotIndex];
    if (!plot) return false;
    const r = applyWater(plot, this._timeManager.now());
    if (!r.ok) return false;
    plot.matureAt = r.value.matureAt;
    plot.waterCount = r.value.waterCount;
    EventBus.emit(GameEvent.PlotStateChanged, plot.index);
    return true;
  }

  harvest(plotIndex: number): boolean {
    const plot = this._plots[plotIndex];
    if (!plot || plot.status !== 'ripe' || !plot.cropId) return false;
    const cfg = getCrop(plot.cropId);
    if (!cfg) return false;
    if (!this._economy) return false;
    this._economy.earn(cfg.sellPrice);
    this.resetPlot(plot);
    EventBus.emit(GameEvent.CropHarvested, { plotIndex, cropId: cfg.id });
    return true;
  }

  unlock(plotIndex: number): boolean {
    const plot = this._plots[plotIndex];
    if (!plot || plot.unlocked) return false;
    // Unlocking is free in v1; Phase 2 G1 servers will validate + deduct.
    plot.unlocked = true;
    plot.status = 'empty';
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

  /** 1-second tick: scan growing plots for growing→ripe transitions. */
  tick(): void {
    const now = this._timeManager.now();
    for (const plot of this._plots) {
      if (plot.status !== 'growing' || !plot.matureAt) continue;
      if (now >= plot.matureAt) {
        plot.status = 'ripe';
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
