import { GameEvent, EventBus } from '../core/EventBus';
import { TimeManager } from '../core/TimeManager';
import { PlotState, PlayerSave } from '../core/SaveManager';
import { getCrop } from './CropConfig';
import { InventorySystem } from './InventorySystem';

/**
 * 农场系统：地块状态机。
 * 状态转换：
 *   empty --plant--> growing --成长--> ready --(withWindow)-- withered --clear--> empty
 *                                  ↑-harvest-↓
 *                                  (作物入仓库)
 */
export class FarmSystem {
    private _plots: PlotState[] = [];
    private _timeManager = new TimeManager();
    private _inventory: InventorySystem | null = null;

    /** 成熟后多久枯萎（秒） */
    private readonly WITHER_WINDOW = 24 * 3600;

    init(plots: PlotState[]) {
        this._plots = plots;
    }

    bindInventory(inv: InventorySystem) {
        this._inventory = inv;
    }

    setTimeManager(tm: TimeManager) {
        this._timeManager = tm;
    }

    get plots(): ReadonlyArray<PlotState> { return this._plots; }

    /** 登录后调用：把所有 growing 状态根据当前时间推到 ready / withered */
    recalcOnLogin() {
        for (const plot of this._plots) {
            if (plot.state !== 'growing' || !plot.cropId || !plot.plantedAt) continue;
            const cfg = getCrop(plot.cropId);
            if (!cfg) {
                plot.state = 'empty';
                continue;
            }
            if (this._timeManager.isWithered(plot.plantedAt, cfg.growthDuration, this.WITHER_WINDOW)) {
                plot.state = 'withered';
                EventBus.emit(GameEvent.PlotStateChanged, plot.index);
            } else if (this._timeManager.isReady(plot.plantedAt, cfg.growthDuration)) {
                plot.state = 'ready';
                EventBus.emit(GameEvent.PlotStateChanged, plot.index);
            }
        }
    }

    /** 玩家在 plotIndex 地块种植 cropId */
    plant(plotIndex: number, cropId: string): boolean {
        if (!this._inventory) return false;
        const plot = this._plots[plotIndex];
        if (!plot || plot.state !== 'empty') return false;

        const cfg = getCrop(cropId);
        if (!cfg) return false;

        if (!this._inventory.remove(cfg.seedItemId, 1)) return false;

        plot.state = 'growing';
        plot.cropId = cropId;
        plot.plantedAt = this._timeManager.now();
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
        return true;
    }

    /** 收获 ready 状态的地块 */
    harvest(plotIndex: number): boolean {
        if (!this._inventory) return false;
        const plot = this._plots[plotIndex];
        if (!plot || plot.state !== 'ready' || !plot.cropId) return false;

        const cfg = getCrop(plot.cropId);
        if (!cfg) return false;

        if (!this._inventory.add(cfg.cropItemId, 1)) {
            // 仓库满，不允许收获
            return false;
        }

        this.resetPlot(plot);
        EventBus.emit(GameEvent.CropHarvested, { plotIndex, cropId: cfg.id });
        return true;
    }

    /** 清理枯萎地块 */
    clearWithered(plotIndex: number): boolean {
        const plot = this._plots[plotIndex];
        if (!plot || plot.state !== 'withered') return false;
        this.resetPlot(plot);
        EventBus.emit(GameEvent.PlotStateChanged, plot.index);
        return true;
    }

    /** 一键收获所有 ready 地块 */
    harvestAll(): number {
        let count = 0;
        for (const plot of this._plots) {
            if (this.harvest(plot.index)) count++;
        }
        return count;
    }

    /** 周期性 tick：检查所有 growing 地块是否进入 ready 或 withered */
    tick() {
        for (const plot of this._plots) {
            if (plot.state !== 'growing' || !plot.cropId || !plot.plantedAt) continue;
            const cfg = getCrop(plot.cropId);
            if (!cfg) continue;
            if (this._timeManager.isWithered(plot.plantedAt, cfg.growthDuration, this.WITHER_WINDOW)) {
                plot.state = 'withered';
                EventBus.emit(GameEvent.PlotStateChanged, plot.index);
            } else if (this._timeManager.isReady(plot.plantedAt, cfg.growthDuration) && plot.state !== 'ready') {
                plot.state = 'ready';
                EventBus.emit(GameEvent.PlotStateChanged, plot.index);
            }
        }
    }

    private resetPlot(plot: PlotState) {
        plot.state = 'empty';
        plot.cropId = undefined;
        plot.plantedAt = undefined;
    }
}