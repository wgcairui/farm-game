# 数据表设计

> 更新：v3 · 2026-09-11 — Phase 2 G0 review-fix：`AuthIdentitySummary` (公开) 与 `AuthIdentity` (server-internal) 分离；`applyWater` 失败原因拆分；6 类 NaN/Infinity 拒绝。
>
> 所有类型**单一事实源**在 [`packages/shared/src/types/`](../packages/shared/src/types/)。本文件保留策划视角的设计意图与历史记录；代码以 shared 为准。

## 一、作物配置表（CropConfig）

静态配置表，写死在代码或 `assets/config/crops.json`，**不可改**。

```typescript
// 真实定义见 packages/shared/src/types/crop.ts
import type { CropConfig } from '@farm-game/shared';

interface CropConfig {
  id: string;
  name: string;
  icon: string;
  seedPrice: number;
  sellPrice: number;
  growthDuration: number;   // 秒
  stages: number;
  maxWater: number;         // 默认 3
  witherWindow: number;
  seedItemId: string;
  cropItemId: string;
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
  id: string;                  // '{playerId}:{index}'，稳定 id
  index: number;               // 地块索引 0~23（v25 baseline = 4×6 = 24）
  unlocked: boolean;
  status: 'empty' | 'growing' | 'ready' | 'withered';
  cropId?: string;
  plantedAt?: number;          // 种植时间戳（毫秒）
  matureAt?: number;           // 成熟时间戳（毫秒）；每次浇水重算
  waterCount: number;
}
```

**关键设计**：`plantedAt` 和 `matureAt` 都是绝对时间戳，不用"剩余时间"。

理由：
- 杀进程后再开，时间戳还能算出生长进度
- 改系统时间作弊时，可结合服务器校验（G1+）
- 离线多久都能正确结算
- 浇水折扣作用于"剩余时间"，与原始 `matureAt` 兼容

---

## 三、玩家存档（PlayerSave）

整个游戏一份，存本地 + 服务端（G1+）。

```typescript
// packages/shared/src/types/player.ts
import type { PlayerSave, InventoryItem, PlayerSettings, AuthIdentityRef } from '@farm-game/shared';

interface PlayerSave {
  version: number;
  playerId: string;            // 内部稳定 UUID；服务端签发；跨平台唯一
  nickname?: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;

  // 资源
  gold: number;
  gems: number;

  // 背包
  inventory: InventoryItem[];

  // 农场
  plots: PlotState[];          // 长度固定 24（v25 baseline）

  // 系统
  level: number;
  exp: number;
  settings: PlayerSettings;

  // 绑定身份（ADR-0001 §1）
  identities: AuthIdentityRef[];
}
```

### 字段变更说明

- `coins` → `gold`（与 PRD §4.1 对齐）
- `openid` 字段已**移除**。`openid` 是 provider 私有身份，不进入客户端公开协议。改用 `identities` 列表承载。

### AuthIdentity 与绑定

```typescript
// packages/shared/src/types/auth-identity.ts
type AuthProvider = 'weChatMini' | 'ios' | 'android' | 'h5';

/** Server-internal — full provider subject. NEVER crosses the public envelope. */
interface AuthIdentity {
  provider: AuthProvider;
  subject: string;            // 微信 openid / Apple sub / Google sub
  tenantId?: string;          // 应用/小程序 appid 范围
  boundAt: number;
}

/** Public projection — embedded in PlayerSave.identities and JWT identities. */
interface AuthIdentitySummary {
  provider: AuthProvider;
  tenantId?: string;
  boundAt: number;
  // 注意：故意没有 `subject` 字段。客户端若要看自己的 subject，必须经
  // 已认证的 GET /auth/identities/me 拉回。
}
```

- `PlayerSave.identities: AuthIdentitySummary[]` 是公开投影，**不携带 `subject`**
- 一个玩家可绑定多个 `AuthIdentity`；典型场景：微信 + Apple 同一账号
- 绑定必须经 `POST /auth/bind`（Bearer JWT），不接受客户端伪造的身份
- 重复绑定到不同玩家 → `2003 IDENTITY_ALREADY_BOUND`
- owner 通过 `GET /auth/identities/me` 取回自己的完整 `AuthIdentity[]`（含 subject）
- `PlayerRepo.findByIdentity({ provider, subject, tenantId })` 是登录键；不使用 `playerId` 作为登录键
- 仓储层维护 by-identity 索引时，`addIdentity` 跨玩家去重，`removeIdentity` 释放索引以便重新绑定

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
  // 服务端推送事件
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
tm.syncServerTime(serverEpochMs);  // 登录后调用
const now = tm.now();
```

**单例**，所有"现在几点"都走这个。接服务端校时后，自动防本地改时间。

---

## 七、浇水算法（ADR-0001 §5；review-fix H4）

```typescript
// packages/shared/src/logic/growth.ts
export const WATER_DISCOUNT_PER = 0.05; // 5% of *remaining* time, per PRD §2.2.3

export type ApplyWaterFailure =
  | 'unknown_crop'
  | 'not_growing'        // status='empty'
  | 'already_ripe'       // status='ready'
  | 'withered'           // status='withered'
  | 'limit_reached'
  | 'corrupted';         // matureAt 缺失或 NaN/Infinity

export function applyWater(plot, now):
  | { ok: true; value: { matureAt: number; waterCount: number } }
  | { ok: false; reason: ApplyWaterFailure }
```

- 每次浇水对"剩余时间"打 5% 折扣，不是对总时长：`matureAt_new = now + ceil((matureAt - now) * 0.95)`
- `maxWater` 默认 3；超过返回 `WATER_LIMIT_REACHED`（错误码 3006）
- `status='ready'` → `already_ripe`（错误码 3003 `CROP_NOT_RIPE` 复用）；`status='withered'` → `withered`（错误码 3006 复用，需服务端另行映射）
- `matureAt` 缺失或非有限数 → `corrupted`；拒绝写入避免把 NaN 传播到下一状态
- 与服务器权威 `now` 一同传入，禁止客户端传入本地时间

---

## 八、存档版本迁移

未来加字段时：

```typescript
const CURRENT_SAVE_VERSION = 1;

function migrate(save: any): PlayerSave {
  if (!save.version) save.version = 1;
  if (save.version < 2) {
    save.identities = save.identities ?? [];
    save.settings = defaultSettings();
    save.version = 2;
  }
  return save;
}
```

每次改 schema 加一档版本号，**永不删除旧版本逻辑**。

v1 → v2 迁移（G0 落地后）：移除 `openid` 字段，新建 `identities: []`。
