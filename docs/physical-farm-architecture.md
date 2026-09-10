# 实物农场(高级模式)架构设计

> 状态:**📐 设计阶段**(对应开发路线图 [[development-roadmap]] 的 Phase 5+)
> 目标读者:开发、运营、合规
> 与现有文档关系:不破坏 [[data-schema]] / [[mvp-features]] / [[cocos-integration]],在它们之上扩展

---

## 一、产品定位与边界

### 1.1 核心定位

实物认养是农场游戏的**高级模式**(premium mode),玩家通过付费获得"看得见摸得着 + 可远程操控"的真实种养体验。它不是独立产品,而是同一款游戏里的高阶玩法。

### 1.2 核心闭环

```
开通认养位 → 购买套餐 → 商家种养 → 视频巡查 + 传感器查看
                                              ↓
                                     远程操控(浇水 / 施肥 / 补光 / 调温)
                                              ↓
                          实物成熟 → 玩家确认收获 → 商家打包 → 邮寄到家 → 玩家签收 → 评价
```

### 1.3 明确不可做的事

为避免过度设计,以下功能**不在本期范围**:
- 玩家不能选择地块位置(由商家分配)
- 玩家不能选择作物品种(套餐固定)
- 玩家不能操控生长速率到违反物理规律(比如要求一天成熟)
- 玩家不能跨认养位共享操控配额(每个位独立)

### 1.4 与虚拟农场的并存关系

| 维度 | 虚拟农场 | 实物认养 |
|------|---------|---------|
| 地块 | 6×6 = 36 块虚拟地块 | N 个独立认养位(N 通常 1~5) |
| 状态机 | `empty → growing → ready → withered` | 见第三章 |
| 玩家操作 | 种植 / 收获 / 清理 | 下单 / 确认收货 / 操控硬件 |
| 存储 | 共享 `PlayerSave.plots[]` | 共享 `PlayerSave.physicalFarm` |
| 包体 | 主包 | 独立子包 |
| 时间尺度 | 秒~小时(生长 30s~1h) | 天~月(生长 30~90 天) |

**关键原则**:虚拟与实物**互不干扰、互不占用**。36 块虚拟地块永远可种,N 个认养位各自独立流转。玩家可以"白天玩虚拟,周末巡查实物"。

---

## 二、子包架构与加载策略

### 2.1 子包目录结构

```
farm-game/                              # Cocos 工程根
├── main/                               # 主包(已存在的虚拟农场)
│   └── ...
└── subpackages/
    └── physical-farm/                  # 实物农场子包(新增,独立)
        ├── assets/
        │   ├── scenes/
        │   │   └── PhysicalFarm.scene  # 实物农场主页场景
        │   ├── prefabs/                # 详见 6.1
        │   ├── sprites/                # 视频缩略图、地图占位图、操控按钮
        │   └── audio/                  # 巡查时播放的环境音
        ├── scripts/                    # 详见 6.1
        └── config.json                 # 子包声明(被 Cocos 构建系统识别)
```

### 2.2 触发加载条件

满足以下**任一条件**时,主包异步加载子包:
- 玩家点击"开通实物认养"入口按钮
- 后端推送"实物活动开启"通知
- 玩家已有进行中的认养(冷启动检测,避免空场景)

### 2.3 加载流程

```
[主包启动]
  └─ 检查后端 / 本地:是否有进行中的认养?
       ├─ 无 + 未点击入口 → 不加载
       └─ 有 / 玩家点击入口 → wx.loadSubpackage({ name: 'physical-farm' })
                              ├─ 成功 → 进入实物 Tab
                              └─ 失败 → 展示"实物认养暂不可用,请稍后重试"占位 UI
```

进度反馈通过 `GameEvent.PhysicalSubpackageLoading` / `PhysicalSubpackageLoaded` / `PhysicalSubpackageLoadFailed` 三个事件通知 UI。

### 2.4 首包体积影响

| 项 | 增加量 | 备注 |
|------|------|------|
| 主包 | ~50 KB | 入口按钮 + 加载器 + 状态检测代码 |
| 子包 | 2-3 MB | 视频流 SDK、传感器图表、地图、操控按钮素材 |
| 主包总体积 | 仍 < 4 MB | 完全规避 [[known-pitfalls]] 中"首包 4MB"限制 |

### 2.5 卸载策略

子包加载后**不主动卸载**,原因:
- 玩家有进行中认养时,频繁进出实物 Tab 不应每次重新下载
- 子包已在内存中,继续保留不增加新内存压力(视频流 SDK 按需实例化)
- 真要卸载,可在玩家连续 30 天无认养时做 LRU 清理(后期优化)

---

## 三、状态机核心设计

### 3.1 设计原则

1. **状态机独立**:认养位的状态机与虚拟地块状态机不共享,各自维护
2. **时间戳为准**:与 [[data-schema]] 同样的原则,所有阶段流转用"服务器时间戳"而非"倒计时"
3. **服务端为权威**:任何阶段转换必须由服务端推送,客户端不能自行判定
4. **玩家不可操控阶段流转**:玩家只能影响生长速度(growthBonus),不能跳过或加速阶段本身

### 3.2 虚拟地块状态机(已存在,不变)

```
empty ──plant──→ growing ──成长──→ ready ──harvest──→ empty
                                       │
                                       └─(24h 未收获)─→ withered ──clear──→ empty
```

沿用现有 [[data-schema]] 中的 `PlotState` 定义。

### 3.3 认养位状态机(新增)

```typescript
type AdoptionStage =
  | 'idle'               // 空闲(可购买新套餐)
  | 'pending_payment'    // 待支付
  | 'paid'               // 已支付,等待商家接单
  | 'rejected'           // 商家拒单
  | 'preparing'          // 准备中(配苗、土壤处理)
  | 'growing'            // 实物生长中(玩家可操控硬件)
  | 'ready_to_ship'      // 可发货(实物成熟,等待玩家确认收货)
  | 'shipped'            // 已发货
  | 'delivered'          // 已签收
  | 'completed'          // 已评价 / 超时自动完成 [终态]
  | 'refunding'          // 退款中
  | 'refunded';          // 已退款 [终态]
```

### 3.4 完整状态转换图

```
                          购买套餐                支付
            idle ───────────────────→ pending_payment ──────→ paid
             ↑                            │                       │
             │ 套餐完成                    │ 取消 / 超时 30min      │ 商家拒单
             │ 自动重置                    ↓                       ↓
             └─ completed               [idle]                  rejected
                                                                      │
                                                                      ↓ 自动退款 24h 内
                                                                   refunded [终态]

                    商家接单            准备种苗             实物播种
        paid ────────────→ preparing ──────────→ growing ──────────┐
                ↑                              │ ↑  │                │
                │ 商家恢复服务                  │ │  └─[玩家操控]──┐  │
                │ (如设备故障修复)              │ │    浇水 / 施肥  │  │
                │                              │ │    补光 / 调温  │  │
                │                              │ └────────────────┘  │
                                                实物成熟(传感器 + 人工复核)
                                                ↓                    ↓
                                        ready_to_ship
                                                │
                                                │ 玩家"确认收货" + 填写地址
                                                ↓
                                            shipped
                                                │
                                                │ 物流签收回调
                                                ↓
                                           delivered
                                                │
                                                │ 玩家评价 / 超时 7 天
                                                ↓
                                          completed [终态]
                                                │
                                                │ 自动重置(归位空闲位)
                                                ↓
                                              idle

        任意阶段 ────[异常 / 退款请求]──→ refunding ───→ refunded [终态]
```

### 3.5 关键转换守卫(transition guards)

| 转换 | 守卫 | 失败后果 |
|------|------|---------|
| `idle → pending_payment` | 套餐有库存 + 玩家支付方式合法 | 弹"套餐已售罄"或支付失败提示 |
| `pending_payment → paid` | 服务端校验支付回调金额匹配 | 保持 `pending_payment` 等待重试 |
| `pending_payment → idle` | 超时 30 min 未支付 | 自动关闭订单,玩家可重新下单 |
| `paid → preparing` | 商家后台"接单"动作 | 状态保留 `paid`,运营介入 |
| `paid → rejected` | 商家点"拒单"(库存不足等) | 自动进入 `refunding`,1-3 工作日退款 |
| `preparing → growing` | 商家完成播种 + 上传第一张图片 | 推送给玩家 |
| `growing → ready_to_ship` | 服务端推送"实物成熟"(传感器多日稳定 + 人工拍照复核) | 玩家仅看到"即将成熟" |
| `ready_to_ship → shipped` | 玩家点击"确认收获" + 填写/确认收货地址 | 状态保留,玩家端常驻提示 |
| `shipped → delivered` | 物流公司回调签收 | 推送给玩家,可评价 |
| `delivered → completed` | 玩家评价 / 超时 7 天 | 终态,该认养位自动重置为 `idle` |
| 任意阶段 → `refunding` | 运营触发 / 系统超时 / 玩家申请退款通过 | 商家必须配合,商家拒接退款需走仲裁 |
| `refunding → refunded` | 财务完成退款 | 终态,认养位释放 |

### 3.6 玩家操控子状态机

在 `growing` 阶段内,玩家可下发以下动作(**不影响主 stage**,只影响 `growthBonus`):

| 动作 | 生长加成 | 消耗 | 冷却时间 | 服务端二次校验 |
|------|---------|------|---------|---------------|
| `water`(浇水) | +3% | 无 | 1 h | ✓ |
| `fertilize`(施肥) | +5% | 1 个肥料道具 | 24 h | ✓ |
| `light_on`(开补光) | +2% | 无 | 30 min | ✓ |
| `light_off`(关补光) | -1%(节能关闭) | 无 | 30 min | ✓ |
| `temp_adjust`(调温) | 0% | 无 | 1 h | ✓ |

**累积上限**:`growthBonus` 最高 0.3(30%),超过部分不再叠加,避免破坏平衡。

### 3.7 保护机制

为防止玩家操控破坏作物生长,设计三层保护:

1. **每日配额**:每认养位每天最多 10 次操控(凌晨 0 点重置)
2. **传感器报警锁定**:传感器检测到异常时(湿度 > 90% / 温度 < 5°C 或 > 40°C),系统自动锁定 2 h,前端展示警告
3. **商家后台优先级**:商家可下发覆盖指令(比如商家发现玩家关掉补光灯导致作物受冻,商家可远程开灯),覆盖事件通过 `DeviceOverrideEvent` 推送,玩家端 UI 自动更新

### 3.8 新增 GameEvent 枚举

沿用现有 `EventBus`(主包已存在),新增物理相关事件,**命名空间前缀 `pf_`** 以隔离:

```typescript
enum GameEvent {
  // ... 现有事件保持不变
  PhysicalSubpackageLoading      = 'pf_subpackage_loading',
  PhysicalSubpackageLoaded       = 'pf_subpackage_loaded',
  PhysicalSubpackageLoadFailed   = 'pf_subpackage_load_failed',
  PhysicalAdoptionCreated        = 'pf_adoption_created',
  PhysicalAdoptionStageChanged   = 'pf_adoption_stage_changed',
  PhysicalSensorDataUpdated      = 'pf_sensor_data_updated',
  PhysicalStreamStatusChanged    = 'pf_stream_status_changed',
  PhysicalStreamRefreshed        = 'pf_stream_refreshed',
  PhysicalDeviceActionSent       = 'pf_device_action_sent',
  PhysicalDeviceActionResult     = 'pf_device_action_result',
  PhysicalDeviceCooldownChanged  = 'pf_device_cooldown_changed',
  PhysicalDeviceOverride         = 'pf_device_override',     // 商家覆盖
  PhysicalShippingUpdated        = 'pf_shipping_updated',
  PhysicalDeliveryConfirmed      = 'pf_delivery_confirmed',
}
```

UI 只订阅自己关心的事件,系统改变状态后 emit,UI 自动更新(沿用 [[data-schema]] 的解耦原则)。

---

## 四、数据模型扩展

### 4.1 设计原则

**关键决策**:不创建独立存档,而是在现有 `PlayerSave` 上**新增 `physicalFarm` 字段**,保持与虚拟农场的紧密关联:

- 共享 `playerId`(账号体系)
- 共享 `updatedAt`(存档写入时间统一管理)
- 共享版本迁移机制
- 旧存档自动补字段,无需用户操作

### 4.2 PlayerSave 扩展

```typescript
interface PlayerSave {
  // ... 现有字段全部保持不变
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

  // —— 实物认养扩展(新增) ——
  physicalFarm: PhysicalFarmData;
}

interface PhysicalFarmData {
  unlockedSlots: number;           // 已购买的认养位数量(0 表示未开通)
  activeAdoptions: AdoptedPlot[];  // 进行中的认养
  completedOrders: CompletedOrder[]; // 历史订单(最多保留最近 50 条)
  shippingAddresses: Address[];    // 收货地址簿(最多 10 条)
  inventory: {
    fertilizer: number;            // 肥料数量(其他道具后续扩展)
  };
}
```

### 4.3 认养位模型

```typescript
interface AdoptedPlot {
  id: string;                        // 认养订单 id(全局唯一)
  slotIndex: number;                 // 认养位索引 0~N-1
  packageId: string;                 // 套餐 id(决定作物和价格)
  stage: AdoptionStage;              // 当前阶段
  stageStartedAt: number;            // 当前阶段开始时间戳(服务器时间,毫秒)
  stageHistory: StageHistoryEntry[]; // 全生命周期记录(用于追溯)
  growthBonus: number;               // 玩家操控累积生长加速(0~0.3)
  todayActionCount: number;          // 今日操控次数(每日 0 点重置)
  lastActionResetAt: number;         // 上次重置时间戳
  farmLocation: FarmLocation;        // 商家农场位置
  deliveryAddress?: Address;           // 收货地址
  trackingNumber?: string;           // 物流单号
  streamInfo?: StreamInfo;           // 实时视频流
  sensorSnapshot?: SensorReading;    // 最新一次传感器数据(用于离线展示)
  cooldown: Record<DeviceAction, number>; // 每种动作的剩余冷却时间戳
}

type DeviceAction = 'water' | 'fertilize' | 'light_on' | 'light_off' | 'temp_adjust';
```

### 4.4 辅助模型

```typescript
interface StageHistoryEntry {
  stage: AdoptionStage;
  enteredAt: number;        // 进入该阶段时间戳
  exitedAt?: number;        // 离开该阶段时间戳(终态可空)
}

interface FarmLocation {
  farmId: string;           // 商家农场 id
  farmName: string;         // "上海崇明岛有机农场"
  region: string;           // "上海市崇明区"
  coordinates: { lat: number; lng: number }; // 地图展示用
}

interface StreamInfo {
  streamUrl: string;        // RTMP/HLS 拉流地址(短时效签名)
  status: 'online' | 'offline' | 'maintenance';
  lastOnlineAt: number;
  expiresAt: number;        // URL 过期时间戳(15min 内)
}

interface SensorReading {
  timestamp: number;        // 服务器时间戳
  temperature: number;      // 温度(°C)
  humidity: number;         // 空气湿度(%)
  lightLux: number;         // 光照(lux)
  soilMoisture: number;     // 土壤湿度(%)
}

interface Address {
  id: string;               // 地址 id
  receiverName: string;     // 收货人
  phone: string;            // 手机号
  province: string;
  city: string;
  district: string;
  detail: string;           // 详细地址
  isDefault: boolean;
}

interface CompletedOrder {
  id: string;
  packageId: string;
  completedAt: number;
  rating?: number;          // 1-5 星
  reviewText?: string;      // 评价文字(最多 200 字)
}
```

### 4.5 存档迁移

在 `scripts/core/SaveManager.ts` 的 `migrate()` 中追加:

```typescript
// 升级示例:v1 → v2 时新增 physicalFarm
// if (raw.version < 2) {
//     raw.physicalFarm = createDefaultPhysicalFarm();
//     raw.version = 2;
// }

// 兜底:缺失字段补默认
const base = createDefaultSave();
return { ...base, ...raw, version: CURRENT_SAVE_VERSION };

function createDefaultPhysicalFarm(): PhysicalFarmData {
  return {
    unlockedSlots: 0,
    activeAdoptions: [],
    completedOrders: [],
    shippingAddresses: [],
    inventory: { fertilizer: 0 },
  };
}
```

每次 schema 变更升一档 version,沿用 [[data-schema]] "永不删除旧迁移逻辑" 原则。

---

## 五、服务端 API 契约

### 5.1 RESTful 端点

| 方法 | 路径 | 用途 | 鉴权 |
|------|------|------|------|
| POST | `/physical/packages` | 获取可选套餐列表 | 登录态 |
| POST | `/physical/slots/purchase` | 购买额外认养位(扩展 N) | 登录态 |
| POST | `/physical/adoption/create` | 创建认养订单 | 登录态 |
| GET | `/physical/adoptions` | 我的认养列表(含 active + completed) | 登录态 |
| GET | `/physical/adoption/:id` | 单个认养详情 | 登录态 |
| POST | `/physical/adoption/:id/confirm-address` | 确认收货地址 | 登录态 |
| POST | `/physical/adoption/:id/confirm-harvest` | 玩家确认收获 | 登录态 |
| POST | `/physical/adoption/:id/device-action` | 下发硬件操控 | 登录态 |
| GET | `/physical/sensor/:adoptionId/history` | 传感器历史(分页) | 登录态 |
| POST | `/physical/stream/:adoptionId/refresh` | 刷新视频流地址 | 登录态 |
| POST | `/physical/address/add` | 新增收货地址 | 登录态 |
| POST | `/physical/address/:id/delete` | 删除收货地址 | 登录态 |

### 5.2 WebSocket 长连(复用 Phase 2 通道)

不另起通道,复用 Phase 2 推送服务的同一 WebSocket,通过 topic 隔离:

```jsonc
// 客户端订阅
{
  "action": "subscribe",
  "topics": ["physical:adoption:*", "physical:sensor:*"]
}

// 服务端推送
{
  "topic": "physical:adoption:12345:stage_changed",
  "data": {
    "adoptionId": "12345",
    "fromStage": "growing",
    "toStage": "ready_to_ship",
    "timestamp": 1736500000000
  }
}
```

推送 topic 类型:
- `physical:adoption:{id}:stage_changed`
- `physical:adoption:{id}:shipping_updated`
- `physical:adoption:{id}:delivered`
- `physical:adoption:{id}:device_override`
- `physical:sensor:{adoptionId}:reading`
- `physical:stream:{adoptionId}:status_changed`

### 5.3 安全模型

沿用 [[data-schema]] 的严格策略,并为操控场景补充:

| 项 | 规则 |
|----|------|
| 时间权威 | 所有客户端时间以服务端为准,通过 `TimeManager.syncServerTime()` 校准 |
| 推送校验 | 推送消息带 HMAC 签名,客户端拒绝 ±5min 窗口外的时间戳 |
| 操控鉴权 | 操控指令必须含当前登录态 + adoptionId,服务端二次校验归属 |
| 冷却二次校验 | 服务端必须二次校验冷却 / 配额 / 传感器状态,客户端可绕过但服务端必须挡住 |
| 拉流短时效 | 视频流 URL 15 min 过期,过期自动失效,前端需调用 `/stream/refresh` 获取新地址 |
| 防重放 | 操控指令带客户端 nonce,服务端 5 min 内拒绝重复 nonce |

---

## 六、Cocos 子包内架构

### 6.1 模块目录

```
subpackages/physical-farm/
├── assets/
│   ├── scenes/
│   │   └── PhysicalFarm.scene        # 实物农场主页场景
│   ├── prefabs/
│   │   ├── PlotAdopted.prefab        # 认养位(含视频缩略图 + 操控按钮入口)
│   │   ├── StreamViewer.prefab       # 全屏视频巡查
│   │   ├── SensorChart.prefab        # 传感器图表(24h 折线)
│   │   ├── DeviceControlBar.prefab   # 操控工具栏(浇水 / 施肥 / 补光 / 调温)
│   │   ├── AdoptionPackage.prefab     # 套餐卡
│   │   ├── AddressForm.prefab         # 收货地址表单
│   │   └── OrderTimeline.prefab      # 阶段时间线(显示 stageHistory)
│   └── sprites/
│       ├── farm-map/                 # 农场地图占位图
│       ├── controls/                 # 操控按钮图标
│       └── stages/                   # 阶段图标(播种 / 生长 / 成熟 / 收获)
└── scripts/
    ├── systems/
    │   ├── AdoptionOrderSystem.ts    # 认养位生命周期管理
    │   ├── SensorDataSystem.ts       # 传感器数据缓存与渲染
    │   ├── StreamPlayerSystem.ts     # 视频流封装(SDK 桥接)
    │   └── DeviceControlSystem.ts    # 操控指令发送 + 冷却管理
    └── ui/
        ├── PlotAdoptedView.ts        # 认养位视图
        ├── StreamViewerView.ts       # 视频巡查视图
        ├── SensorChartView.ts        # 传感器图表视图
        ├── DeviceControlView.ts      # 操控工具栏视图
        ├── AdoptionListView.ts       # 认养列表视图
        └── PackageSelectView.ts      # 套餐选择视图
```

### 6.2 复用主包核心

子包脚本**不重新实现**主包已有的核心,通过 `import` 引用:

| 主包核心 | 子包使用方式 |
|---------|------------|
| `EventBus` | 子包系统直接 emit / on `pf_` 命名空间事件 |
| `TimeManager` | 共享 `serverTimeOffset`,所有时间戳走同一基准 |
| `SaveManager` | 通过 `SaveManager.data.physicalFarm` 读写,扩展 schema 不修改原有方法 |

### 6.3 视频流接入

| 平台 | 方案 |
|------|------|
| 微信小游戏 | `<live-player>` 组件 + 腾讯云直播 SDK,通过 `wx.loadSubpackage` 之外再加载推流 SDK 子包 |
| iOS | `ijkplayer` 桥接,通过 Pod 引入 |
| Android | `ijkplayer` 桥接,通过 gradle 依赖 |

**生命周期管理**(避免内存泄漏):

```text
进入 StreamViewerView
  └─ StreamPlayerSystem.create(adoptionId)
       ├─ 申请拉流地址(若过期)
       ├─ 实例化 player
       └─ 订阅 stream_status_changed 事件
离开 StreamViewerView
  └─ StreamPlayerSystem.destroy(adoptionId)
       ├─ 停止拉流
       ├─ 销毁 player 实例
       └─ 取消订阅
```

**降级策略**:流中断时显示"摄像头维护中"占位图,其他功能(传感器、操控按钮)保持可用。

### 6.4 传感器图表

不引入第三方图表库,使用 Cocos 自带的 `Graphics` 组件绘制:

- 数据按小时聚合,前端只渲染最近 24 h(4 个数据点 × 24 = 96 点,绘制开销低)
- 双 Y 轴:温度(°C)/ 湿度(%) 折线
- 触摸交互:长按显示该时刻的精确数值
- 离线缓存:`SensorReading` 直接存进 `AdoptedPlot.sensorSnapshot`,离线时显示最后一次值

### 6.5 硬件操控交互

操控工具栏是认养位详情页的底部固定 UI:

```
┌─────────────────────────────────────────────────┐
│  💧 浇水  │  🌱 施肥 │  💡 补光 │  🌡️ 调温    │
│  冷却 58min │ 冷却 23h │ 冷却 12m │ 冷却 45m  │
└─────────────────────────────────────────────────┘
```

**交互流程**:

1. 玩家点击按钮 → `DeviceControlSystem.send(adoptionId, action)`
2. 按钮立即置灰 + 显示 loading,本地先乐观更新冷却(失败回滚)
3. 服务端通过 WebSocket 推送 `PhysicalDeviceActionResult`
4. 成功:按钮恢复 + 播放动画 + 传感器数据自动刷新 + 触发 `PhysicalDeviceCooldownChanged`
5. 失败:按钮恢复 + 弹提示(冷却未结束 / 传感器报警锁定 / 服务端拒绝)
6. 商家覆盖:收到 `PhysicalDeviceOverride`,UI 强制刷新状态(可附带提示"商家已远程开启补光")

**冷却倒计时**:客户端使用本地 `TimeManager.now()` 计算,精度足够;过期时主动调 `DeviceControlSystem.refreshCooldown()` 拉一次服务端最新状态。

### 6.6 子包加载器(主包侧)

主包需要一个轻量加载器,触发条件见 §3.2:

```typescript
// 伪代码,示意加载逻辑(实际由 GameApp 接入)
class PhysicalFarmLoader {
  static async load(): Promise<boolean> {
    EventBus.emit(GameEvent.PhysicalSubpackageLoading);
    try {
      await wx.loadSubpackage({ name: 'physical-farm' });
      EventBus.emit(GameEvent.PhysicalSubpackageLoaded);
      return true;
    } catch (e) {
      EventBus.emit(GameEvent.PhysicalSubpackageLoadFailed);
      return false;
    }
  }
}
```

---

## 七、合规与商业清单

### 7.1 版号

认养玩法可能触发版号要求(尤其涉及"获得实物" + "营销抽奖"性质时),建议:

- **Phase 5 启动前**先咨询律师,确认当前模式是否需要申请版号
- 准备"实物认养"作为应用宝 / 小程序游戏分类时的资质材料清单
- 若需要,**提前 2-3 个月**申请(沿用 [[known-pitfalls]] "版号陷阱")

### 7.2 预付式消费

玩家预付费用获得未来实物,可能涉及:
- 预付卡管理(单次充值上限、留存资金监管)
- 退款规则必须清晰展示:**实物未成熟可全额退款,实物成熟未发货按比例退款,已发货按物流状态退款**

### 7.3 食品安全

合作农场必须具备:
- 食品经营许可证 / 农产品相关认证(有机 / 绿色)
- 农产品溯源能力(扫码可看种植记录)
- 包装与冷链能力(根据作物特性)

### 7.4 退款规则

实物失败的边界条件很多,客户端必须清晰展示:

| 场景 | 退款比例 | 处理时限 |
|------|---------|---------|
| 商家接单前拒单 | 100% | 立即 |
| 商家接单后拒单(不可抗力) | 100% | 1-3 工作日 |
| 商家接单后玩家主动取消 | 100% | 1-3 工作日 |
| 实物种养失败(商家责任) | 100% + 补偿 | 3-7 工作日 |
| 实物种养失败(玩家操控不当) | 50% | 3-7 工作日 |
| 已发货拒签 | 80%(扣运费) | 5-10 工作日 |
| 已签收不满意 | 不支持退款,仅补偿下次优惠券 | — |

### 7.5 隐私

摄像头可能拍到:
- 农场工作人员(需要员工签肖像权同意书)
- 周边环境(可能涉及邻居隐私)
- 设备控制画面(无特殊问题)

**客户端必须**:
- 进入视频巡查前展示"该摄像头位于 XX 农场,可能包含工作人员"
- 用户协议中明确数据收集范围

### 7.6 操控权限与责任

玩家操控设备若造成损失,**责任划分必须在用户协议明确**:

- **玩家责任**:玩家在传感器报警后仍执意操控,导致作物受损
- **商家责任**:商家未及时响应报警,或硬件故障
- **平台责任**:服务端 bug 导致操控指令错乱

建议在用户协议附**"操控免责条款"**:

> 玩家理解并同意:实物作物的生长受自然环境、设备状态、操作时机等多重因素影响,平台不对最终产量、品质、成熟度做任何明示或暗示的承诺。玩家在传感器报警期间仍执意操控的,后果由玩家自行承担。

---

## 八、迁移路线图

| 阶段 | 内容 | 周期 | 依赖 |
|------|------|------|------|
| Phase 5a | 子包框架 + 认养位展示 + 订单流程(无视频) | 2-3 周 | Phase 2 后端基础 |
| Phase 5b | 视频流接入 + 传感器图表 | 2-3 周 | 5a + 视频 SDK 集成 |
| Phase 5c | 硬件操控 + 冷却 / 限额系统 | 2-3 周 | 5b + MQTT 后端 |
| Phase 6 | 多认养位扩展 + 共享地块 + 好友围观 | 2-3 周 | 5c |
| Phase 7 | AI 异常检测 + 自动化建议 | 3-4 周 | 6 + 商家反馈 |

**注意**:Phase 5 启动前必须完成:
1. 与合作农场签订协议(产能 / 退款 / 数据共享)
2. 律师对"实物认养"模式的合规审查
3. 后端 BaaS 选型确认(实物数据是否上云)
4. 视频流 / 物联网网关供应商对接

---

## 九、附录:与现有文档的关系

| 现有文档 | 关系 |
|---------|------|
| [[project-overview]] | 本文档是高级模式的扩展,不改变主产品定位 |
| [[tech-stack-choice]] | 沿用 Cocos Creator 3.8 LTS,子包是 Cocos 原生支持的特性 |
| [[data-schema]] | 扩展 `PlayerSave`,所有现有字段保持不变 |
| [[mvp-features]] | 本文档功能**不在** MVP 范围,对应 Phase 5+ |
| [[cocos-integration]] | 子包遵循 [[cocos-integration]] 的项目结构约定 |
| [[known-pitfalls]] | 沿用"时间戳原则" / "首包限制" / "离线封顶" |
| [[development-roadmap]] | 实物农场对应 Phase 5+ |

---

## 十、待办与未决事项

> 这一节记录需要在实施前进一步确认的设计问题。

1. **套餐定价策略**:需要运营 / 财务介入,本文档只列 API 不定价格
2. **认养位初始数量**:是否给所有玩家赠送 1 个免费认养位?(用于拉新)
3. **好友互动**:实物能否让好友"帮忙浇水"?(涉及权限 + 数据隐私)
4. **退订 / 转让**:认养中的位能否转赠好友?(涉及法律合规)
5. **AI 预警**:传感器数据接入 ML 模型自动识别异常生长?成本与必要性待定
6. **历史数据归档**:玩家完成订单后,历史传感器数据保留多久?(存储成本)

这些事项不阻塞当前文档定稿,但实施前必须有明确答案。