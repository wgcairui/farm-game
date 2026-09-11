# 数据表设计

> 更新：2026-09-11 — Phase 1 抽到 `packages/shared`。
>
> 所有类型**单一事实源**在 [`packages/shared/src/types/`](../packages/shared/src/types/)。本文件保留策划视角的设计意图与历史记录；代码以 shared 为准。

## 一、作物配置表（CropConfig）

静态配置表，写死在代码或 `assets/config/crops.json`，**不可改**。

```typescript
// 真实定义见 packages/shared/src/types/crop.ts
import type { CropConfig } from '@farm-game/shared';

interface CropConfig {
  id: string;                  // 'carrot' | 'potato' | ...
  name: string;                // '白萝卜'
  icon: string;                // 资源 key
  seedPrice: number;           // 种子价格（金币）
  sellPrice: number;           // 收获售价
  growthDuration: number;      // 总生长时长（秒）
  stages: number;              // 生长阶段数（含种子→成熟）
  maxWater: number;            // 浇水次数上限
  witherWindow: number;        // 成熟后多久枯萎（秒）
  seedItemId: string;          // 背包里的种子 id
  cropItemId: string;          // 收获后入仓库的作物 id
}
```

### Phase 1 作物配置（`CROPS` Record）

| id | name | 种子价 | 售价 | 生长时长 | 阶段 |
|---|---|---|---|---|---|
| carrot | 白萝卜 | 10 | 25 | 30s | 4 |
| potato | 土豆 | 30 | 70 | 2min | 4 |
| corn | 玉米 | 60 | 150 | 5min | 4 |
| tomato | 番茄 | 100 | 280 | 15min | 4 |
| strawberry | 草莓 | 200 | 600 | 1h | 4 |

---

## 二、地块状态（PlotState）

运行时状态，每个地块一份。

```typescript
// packages/shared/src/types/plot.ts
import type { PlotState } from '@farm-game/shared';

interface PlotState {
  id: string;                  // 'openid:index'，稳定 id
  index: number;               // 地块索引 0~23（v25 baseline = 4×6 = 24）
  unlocked: boolean;           // 是否解锁
  status: 'empty' | 'growing' | 'ready' | 'withered';
  cropId?: string;             // 已种植时填
  plantedAt?: number;          // 种植时间戳（毫秒）
  matureAt?: number;           // 成熟时间戳（毫秒）
  waterCount: number;          // 浇水次数（默认 0）
}
```

**关键设计**：`plantedAt` 用时间戳，不用"剩余时间"。

理由：
- 杀进程后再开，时间戳还能算出生长进度
- 改系统时间作弊时，可结合服务器校验（Phase 2）
- 离线多久都能正确结算

---

## 三、玩家存档（PlayerSave）

整个游戏一份，存本地 + 服务端（Phase 2）。

```typescript
// packages/shared/src/types/player.ts
import type { PlayerSave, InventoryItem, PlayerSettings } from '@farm-game/shared';

interface PlayerSave {
  version: number;             // 存档版本号，便于迁移
  playerId: string;            // 本地生成的 uuid（Phase 1 即可，Phase 2 换登录 id）
  openid: string;              // 服务端认证 id；登录后写入
  nickname?: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;

  // 资源
  gold: number;                // 金币（命名：gold 取代 coins，与 PRD §5.1 对齐）
  gems: number;                // 钻石

  // 背包
  inventory: InventoryItem[];

  // 农场
  plots: PlotState[];          // 长度固定 24（v25 baseline）

  // 系统
  level: number;
  exp: number;
  settings: PlayerSettings;
}
```

### 字段重命名说明

Phase 1 起字段统一为 PRD §4.1 命名：`coins` → `gold`、`inventory` 不变、`plots` 不变。新建存档时使用 `createDefaultPlayerSave(openid)` 生成。

---

## 四、Item 类型表

```typescript
type ItemId =
  | 'carrot_seed' | 'potato_seed' | 'corn_seed' | 'tomato_seed' | 'strawberry_seed'
  | 'carrot' | 'potato' | 'corn' | 'tomato' | 'strawberry';
```

种子和作物分开存 id，**避免误用**（种子和作物不该等价）。

---

## 五、事件总线（EventBus）

解耦 UI 和业务系统的关键。**单一事实源在 `packages/shared/src/eventbus/EventBus.ts`**，自实现轻量 emit/on/off（替代 Cocos `cc.EventTarget`）。

```typescript
// packages/shared/src/eventbus/EventBus.ts
import { EventBus, GameEvent } from '@farm-game/shared';

enum GameEvent {
  CoinsChanged = 'coins_changed',
  DiamondsChanged = 'diamonds_changed',
  InventoryChanged = 'inventory_changed',
  PlotStateChanged = 'plot_state_changed',
  CropHarvested = 'crop_harvested',
  CropWithered = 'crop_withered',
  SceneChanged = 'scene_changed',
  ToastShow = 'toast_show',
  // Phase 2 服务端推送事件
  ServerConnected = 'server_connected',
  ServerDisconnected = 'server_disconnected',
  ServerPlotUpdated = 'server_plot_updated',
  ServerCropStolen = 'server_crop_stolen',
  AuthLoggedIn = 'auth_logged_in',
}
```

UI 只订阅事件，不直接调系统。系统改变状态后发事件，UI 自动更新。

---

## 六、时间管理（TimeManager）

**单一事实源在 `packages/shared/src/time/TimeManager.ts`**。纯 TS、无 Cocos 依赖。

```typescript
import { TimeManager } from '@farm-game/shared';

const tm = new TimeManager();
tm.syncServerTime(serverEpochMs);  // Phase 2 登录后调用
const now = tm.now();
```

**单例**，所有"现在几点"都走这个。Phase 2 接服务端校时后，自动防本地改时间。

---

## 七、存档版本迁移

未来加字段时：

```typescript
const CURRENT_SAVE_VERSION = 1;

function migrate(save: any): PlayerSave {
  if (!save.version) save.version = 1;
  if (save.version < 2) {
    // 加字段
    save.settings = defaultSettings();
    save.version = 2;
  }
  return save;
}
```

每次改 schema 加一档版本号，**永不删除旧版本逻辑**。