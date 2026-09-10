import { EventTarget } from 'cc';

/**
 * 事件枚举。
 * 命名规则：模块_动作，全小写 + 下划线。
 */
export enum GameEvent {
    CoinsChanged = 'coins_changed',
    DiamondsChanged = 'diamonds_changed',
    InventoryChanged = 'inventory_changed',
    PlotStateChanged = 'plot_state_changed',
    CropHarvested = 'crop_harvested',
    CropWithered = 'crop_withered',
    SceneChanged = 'scene_changed',
    ToastShow = 'toast_show',
}

/**
 * 事件总线：单例。
 * UI 只订阅事件，业务系统改状态后 emit 事件，UI 自动更新。
 *
 * 实现：Cocos 自带的 EventTarget。
 */
class EventBusImpl {
    private static _instance: EventBusImpl | null = null;
    private _target = new EventTarget();

    static get instance(): EventBusImpl {
        if (!EventBusImpl._instance) {
            EventBusImpl._instance = new EventBusImpl();
        }
        return EventBusImpl._instance;
    }

    on(event: GameEvent, handler: (arg?: any) => void, target?: any) {
        this._target.on(event, handler, target);
    }

    off(event: GameEvent, handler: (arg?: any) => void, target?: any) {
        this._target.off(event, handler, target);
    }

    emit(event: GameEvent, arg?: any) {
        this._target.emit(event, arg);
    }
}

export const EventBus = EventBusImpl.instance;