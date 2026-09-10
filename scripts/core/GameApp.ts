import { _decorator, Component, Node } from 'cc';
import { EventBus, GameEvent } from './EventBus';
import { TimeManager } from './TimeManager';
import { SaveManager } from './SaveManager';
import { EconomySystem } from '../systems/EconomySystem';
import { InventorySystem } from '../systems/InventorySystem';
import { FarmSystem } from '../systems/FarmSystem';
import { ShopSystem } from '../systems/ShopSystem';

const { ccclass } = _decorator;

/**
 * GameApp — 全局启动入口，负责注册和初始化所有系统。
 * 单例模式，整个游戏一个实例，挂在常驻 Node 上。
 */
@ccclass('GameApp')
export class GameApp extends Component {
    private static _instance: GameApp | null = null;

    public static get instance(): GameApp {
        if (!GameApp._instance) {
            throw new Error('GameApp not initialized');
        }
        return GameApp._instance;
    }

    // —— 系统 ——
    public readonly eventBus = EventBus.instance;
    public readonly timeManager = new TimeManager();
    public readonly saveManager = new SaveManager();
    public readonly economy = new EconomySystem();
    public readonly inventory = new InventorySystem();
    public readonly farm = new FarmSystem();
    public readonly shop = new ShopSystem();

    onLoad() {
        if (GameApp._instance) {
            this.destroy();
            return;
        }
        GameApp._instance = this;

        // 初始化顺序：存档 → 系统 → 注入依赖 → 启动 tick
        this.saveManager.load();

        this.economy.init(this.saveManager.data.coins, this.saveManager.data.diamonds);
        this.inventory.init(this.saveManager.data.inventory);

        this.farm.setTimeManager(this.timeManager);
        this.farm.bindInventory(this.inventory);
        this.farm.init(this.saveManager.data.plots);

        this.shop.bind(this.economy, this.inventory);

        // 启动后立即结算一次离线收益
        this.farm.recalcOnLogin();

        // 周期 tick：每秒检查作物状态（成长 → 成熟 → 枯萎）
        this.schedule(this.farm.tick.bind(this.farm), 1.0);

        // 应用退出前强制写盘（小程序和 H5 不可靠，原生 OK）
        this.schedule(this.saveManager.flush.bind(this.saveManager), 5.0);
    }

    onDestroy() {
        if (GameApp._instance === this) {
            GameApp._instance = null;
        }
    }
}