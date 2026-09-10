import { sys } from 'cc';

/**
 * 玩家存档。MVP 阶段本地存储；Phase 2 增加服务端同步。
 *
 * 关键约束：
 * 1. 每次 schema 变更升一档 version，永不删除旧迁移逻辑
 * 2. 写盘要 debounce，避免频繁 IO
 * 3. 关键数据用时间戳，不用"剩余时间"
 */

export const CURRENT_SAVE_VERSION = 1;
const SAVE_KEY = 'farm_game_save_v1';
const SAVE_DEBOUNCE_MS = 500;

export interface InventoryItem {
    itemId: string;
    count: number;
}

export interface PlotState {
    index: number;
    unlocked: boolean;
    state: 'empty' | 'growing' | 'ready' | 'withered';
    cropId?: string;
    plantedAt?: number;
}

export interface PlayerSettings {
    musicVolume: number;
    sfxVolume: number;
    notificationsEnabled: boolean;
}

export interface PlayerSave {
    version: number;
    playerId: string;
    createdAt: number;
    updatedAt: number;
    coins: number;
    diamonds: number;
    inventory: InventoryItem[];
    plots: PlotState[];
    level: number;
    exp: number;
    settings: PlayerSettings;
}

export function createDefaultSave(): PlayerSave {
    return {
        version: CURRENT_SAVE_VERSION,
        playerId: generateUuid(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        coins: 200,
        diamonds: 0,
        inventory: [],
        plots: Array.from({ length: 36 }, (_, i) => ({
            index: i,
            unlocked: true,
            state: 'empty' as const,
        })),
        level: 1,
        exp: 0,
        settings: {
            musicVolume: 0.7,
            sfxVolume: 1.0,
            notificationsEnabled: true,
        },
    };
}

export class SaveManager {
    public data: PlayerSave = createDefaultSave();
    private _writeTimer: any = null;

    load() {
        const raw = sys.localStorage.getItem(SAVE_KEY);
        if (!raw) {
            this.data = createDefaultSave();
            this.scheduleWrite();
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            this.data = migrate(parsed);
        } catch (e) {
            console.error('[SaveManager] 存档损坏，重置', e);
            this.data = createDefaultSave();
        }
        this.scheduleWrite();
    }

    /** 防抖写入：500ms 内多次调用只写一次 */
    scheduleWrite() {
        if (this._writeTimer) return;
        this._writeTimer = setTimeout(() => {
            this._writeTimer = null;
            this.data.updatedAt = Date.now();
            sys.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
        }, SAVE_DEBOUNCE_MS);
    }

    /** 立即强制写盘（退出游戏前调用） */
    flush() {
        if (this._writeTimer) {
            clearTimeout(this._writeTimer);
            this._writeTimer = null;
        }
        this.data.updatedAt = Date.now();
        sys.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    }
}

function migrate(raw: any): PlayerSave {
    if (typeof raw.version !== 'number') raw.version = 1;

    // 升级示例：v1 → v2 时
    // if (raw.version < 2) {
    //     raw.settings = defaultSettings();
    //     raw.version = 2;
    // }

    // 兜底：缺失字段补默认
    const base = createDefaultSave();
    return { ...base, ...raw, version: CURRENT_SAVE_VERSION };
}

function generateUuid(): string {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
        return (crypto as any).randomUUID();
    }
    return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}