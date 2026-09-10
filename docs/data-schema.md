# 数据表设计

## 一、作物配置表（CropConfig）

静态配置表，写死在代码或 `assets/config/crops.json`，**不可改**。

```typescript
interface CropConfig {
  id: string;                  // 'carrot' | 'potato' | ...
  name: string;                // '白萝卜'
  icon: string;                // 资源 key
  seedPrice: number;           // 种子价格（金币）
  sellPrice: number;           // 收获售价
  growthDuration: number;      // 总生长时长（秒）
  stages: number;              // 生长阶段数（含种子→成熟）
  unlockLevel: number;         // 玩家等级解锁门槛（Phase 2 用）
  expReward: number;           // 收获经验（Phase 2 用）
}
```

### Phase 1 作物配置示例

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
interface PlotState {
  index: number;               // 地块索引 0~35
  unlocked: boolean;           // 是否解锁（Phase 1 默认全解锁）
  // —— 以下三选一 ——
  state: 'empty' | 'growing' | 'ready' | 'withered';
  cropId?: string;             // 已种植时填
  plantedAt?: number;          // 种植时间戳（毫秒）
  // ready 状态是 growing 成长到 100% 的快照，无需额外字段
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
interface PlayerSave {
  version: number;             // 存档版本号，便于迁移
  playerId: string;            // 本地生成的 uuid（Phase 1 即可，Phase 2 换登录 id）
  createdAt: number;
  updatedAt: number;

  // 资源
  coins: number;               // 金币
  diamonds: number;            // 钻石（Phase 2 才用）

  // 背包
  inventory: InventoryItem[];  // 种子 + 仓库作物

  // 农场
  plots: PlotState[];          // 长度固定 36

  // 系统（Phase 2+ 用）
  level: number;
  exp: number;
  settings: PlayerSettings;
}

interface InventoryItem {
  itemId: string;              // 'carrot_seed' | 'carrot' | 'potato_seed' ...
  count: number;
}

interface PlayerSettings {
  musicVolume: number;         // 0~1
  sfxVolume: number;           // 0~1
  notificationsEnabled: boolean;
}
```

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

解耦 UI 和业务系统的关键。

```typescript
// scripts/core/EventBus.ts
enum GameEvent {
  CoinsChanged = 'coins_changed',
  InventoryChanged = 'inventory_changed',
  PlotStateChanged = 'plot_state_changed',
  CropHarvested = 'crop_harvested',
  CropWithered = 'crop_withered',
  SceneChanged = 'scene_changed',
}
```

UI 只订阅事件，不直接调系统。系统改变状态后发事件，UI 自动更新。

---

## 六、时间管理（TimeManager）

```typescript
// scripts/core/TimeManager.ts
class TimeManager {
  private serverTimeOffset = 0;  // Phase 2 接服务端校时

  now(): number {
    return Date.now() + this.serverTimeOffset;
  }

  // 计算作物当前阶段
  getCropStage(plantedAt: number, duration: number, stages: number): number {
    const elapsed = (this.now() - plantedAt) / 1000;
    const progress = Math.min(elapsed / duration, 1);
    return Math.min(Math.floor(progress * stages), stages - 1);
  }

  isReady(plantedAt: number, duration: number): boolean {
    return this.now() - plantedAt >= duration * 1000;
  }
}
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