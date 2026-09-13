# AGENTS.md — `@farm-game/client-mini`

> Cocos Creator 3.8.8 微信小游戏客户端。**唯一首发平台**，目前主页 UI v13 + 模拟器 headless E2E 已收口。
>
> 改任何 UI / 网络 / 资源管线前**先看 [`docs/cocos-runbook.md`](../../docs/cocos-runbook.md)**（§10 联调坑必读）。

---

## 1. 目录结构

```
src/
├── cc/                 # Cocos editor 可见入口（被 build 脚本拷到 assets/scripts/）
│   └── index.ts
├── cocos/              # Cocos editor 直接编辑的脚本
│   ├── systems/
│   └── ui/
├── cocos-entry.ts      # 运行时入口
├── index.ts
├── net/
│   ├── http.ts         # FarmHttpClient
│   ├── transport.ts    # HttpTransport 注入缝（fetch / wx.request）
│   ├── ws.ts           # FarmRealtimeClient（@colyseus/sdk 0.18.2 + WsEnvelope）
│   ├── wx-compat.ts    # 微信 WS 兼容层（send 帧 ArrayBuffer 化 + Node 形构造守卫）
│   └── index.ts
└── runtime/
    ├── online.ts       # OnlineGameApp：服务端权威 + 乐观回滚 + revision 守卫 + 退避重连
    └── headless.ts     # HeadlessGameApp（单机玩法，无后端）

assets/
├── scripts/
│   ├── OnlineFarm.ts   # Cocos UI 主控制器（挂 Main.scene 根节点）
│   ├── farm/           # 11 个 UI 模块（layout 是单一调谐点）
│   │   ├── layout.ts   # ⭐ 几何常量集中处
│   │   ├── plotView.ts # 单地块视图（locked / empty / growing / ripe 状态机）
│   │   ├── mapLayer.ts # 远山 / 视差 / 池塘
│   │   ├── sideColumn.ts
│   │   ├── bottomBar.ts
│   │   ├── hud.ts
│   │   ├── dialogs.ts
│   │   ├── fx.ts
│   │   ├── toast.ts
│   │   ├── widgets.ts  # 通用 UI 原语
│   │   └── assets.ts   # SpriteMap 加载
│   └── vendor/
│       ├── farm-online.js   # src/runtime/online.ts + net 编译产物
│       └── farm-online.d.ts # 类型表面（与 src/runtime/online.ts 手动同步）
├── resources/game/     # slice-assets.py 产物 + plot-layout.json（Cocos 直接 import）
├── scenes/Main.scene   # 唯一场景
└── index.ts            # Cocos editor 入口

test/                   # node --test，**需 db:up**
├── core-loop.test.ts
├── net.test.ts
└── e2e-online.test.ts  # 真实双进程（HTTP + WS）

scripts/                # Cocos 资产 / 构建脚本
├── build-cocos-bundle.mjs   # src/runtime + src/net → assets/scripts/vendor/farm-online.js
└── gen-cocos-scene.mjs

library/  profiles/  settings/  build/  temp/  native/engine/  # Cocos 编辑器本地缓存，全部 .gitignore
```

---

## 2. 关键规则

### 2.1 三铁律（headless E2E）
- `cli auto … --trust-project`（不带就卡信任弹窗不编译）；
- dev bridge 命令走端口 **9877**，沙箱禁 `eval` / `new Function`，只能**路径 get / call**；
- 官方 wechatide 工具面（截图 / 画布触摸）需一次 GUI 授权；
- 跑模拟器前看 [`docs/cocos-runbook.md`](../../docs/cocos-runbook.md) §10。

### 2.2 wx-compat 求值时机
- `net/wx-compat.ts` **必须在 `@colyseus/sdk` import 前求值**；
- 否则 colyseus.js#161（Node 形 WebSocket 构造）+ 微信拒收 TypedArray 帧 → WS 失败；
- 已在 `net/index.ts` 顶部强约束；新增 SDK import 必须复测。

### 2.3 DevTools「增强编译」禁用
- 微信开发者工具 Settings → Project Settings → **「增强编译」OFF**；
- 否则 Map/Set 迭代器协议被破坏，`shared/EventBus.emit` 已加固但仍有风险。

### 2.4 设计空间 & 坐标系
- 设计空间 **720×1280**（`layout.ts: DESIGN_WIDTH/HEIGHT`）；
- Cocos 坐标系 **center-origin**（x ∈ [-360, 360], y ∈ [-640, 640]）；
- 屏幕适配 `ResolutionPolicy.FIXED_HEIGHT`（Fit-Height）；
- Phone (375/390/430) 可见宽度 ≈ 591，**边锚 UI 必须走 `Widget`**，禁止绝对 x；
- 地块网格固定 **6×4 = 24 plots**（6 unlocked，18 locked），pitch **75×47**。

### 2.5 地块布局生成
- 改地块：编辑 [`scripts/make-plot-layout.mjs`](../../scripts/make-plot-layout.mjs) §11.9，然后 `node scripts/make-plot-layout.mjs` 重生成 `assets/resources/game/plot-layout.json`；
- **Cocos 内必须重建**（重启 Creator 或在 editor 内 import 一次），否则节点位置还是旧的。

### 2.6 资源管线
- 美术源 → `python3 scripts/slice-assets.py`（去底 + manifest.json）；
- **meta 修正**：必须 `texture → sprite-frame`，否则首 key 就 boot failed — 跑 `node scripts/fix-cocos-sprite-metas.mjs`；
- 微信构建：`node scripts/patch-wechat-build.mjs`（必跑补丁）；
- release 包：`node scripts/patch-release-build.mjs`；
- 主包预算：**≤ 4 MB**（微信小游戏硬约束）。

### 2.7 UI 模块约束
- `layout.ts` 是单一调谐点（geometry / anchors / prop table / scene flags）；
- `plotView.ts` 的状态机由 `OnlinePlotView.status` + `derivedRipe` 驱动（locked → empty → growing → ripe）；
- lock/price 等必须 `sprite.enabled = false` + `node.active = false`（**单改 active 不能阻止 sprite renderer 画 spriteFrame** — M5 教训）；
- 触摸 cell = layout pitch（避免邻接地块 hit-test 抢事件）；
- 视觉验收靠真截图（release build 模拟器），**不**靠 dump 节点数（M5-A/B/C/D 教训）。

### 2.8 工具版本固定
- Cocos Creator **3.8.8**（与 `package.json` 的 `creator.version` 对齐）；
- 微信开发者工具 **Stable 2608070**（RC 2607171 SummerCompiler 有回归）；
- Node ≥ 18 / pnpm ≥ 9；
- Python 3 + Pillow（仅切片脚本需要）。

---

## 3. 常用命令

```bash
# TS 编译（用于 node 单测）
pnpm --filter @farm-game/client-mini build

# 单测（需 db:up）
pnpm --filter @farm-game/client-mini test            # 28 单测
pnpm --filter @farm-game/client-mini test -- e2e-online  # 仅跑双进程 e2e

# Cocos bundle（TS → assets/scripts/vendor/farm-online.js）
pnpm --filter @farm-game/client-mini build:cocos

# 资源 / 补丁
python3 scripts/slice-assets.py                    # 美术源切片
node scripts/fix-cocos-sprite-metas.mjs            # texture → sprite-frame
node scripts/make-plot-layout.mjs                  # 地块布局
node scripts/patch-wechat-build.mjs                # 微信构建补丁
node scripts/patch-release-build.mjs               # release 包补丁

# 模拟器 headless E2E（需 server 起来）
pnpm --filter @farm-game/server dev                # 终端 1
pnpm --filter @farm-game/server dev:ws             # 终端 2
node scripts/farm-sim-bridge-e2e.mjs               # 终端 3

# Cocos editor
open /Applications/CocosCreator.app
# 导入 packages/client-mini（不要新建工程，直接打开此目录）
```

---

## 4. 必读

- [`docs/cocos-runbook.md`](../../docs/cocos-runbook.md) — 从零到模拟器联调，**§10 坑必读**
- [`docs/cocos-integration.md`](../../docs/cocos-integration.md) — 集成策略
- [`docs/scene-spec-v24.md`](../../docs/scene-spec-v24.md) — 当前视觉规范
- [`docs/implementation-plan-ui-v13.md`](../../docs/implementation-plan-ui-v13.md) — UI 实施代码 + 11 模块拆分
- [`docs/visual-repair-plan-v24.md`](../../docs/visual-repair-plan-v24.md) — 视觉修复计划
- [`docs/client-protocol.md`](../../docs/client-protocol.md) — 协议契约
- [`docs/state-sync.md`](../../docs/state-sync.md) — revision / optimistic

---

## 5. 反模式（不要做）

- ❌ 在 `assets/scripts/farm/` 里 `import` Cocos editor 之外的内容（应通过 `src/net` / `src/runtime` → build 桥接）；
- ❌ 直接编辑 `assets/scripts/vendor/farm-online.js`（build 会被覆盖）；
- ❌ 跳过 `node scripts/fix-cocos-sprite-metas.mjs` 直接构建（首 key boot failed）；
- ❌ 用绝对 x 锚定屏幕 UI（Fit-Height 下 phone 会偏移）；
- ❌ 在 `plotView.ts` 里硬编码 88×88（已修正为 75×47）；
- ❌ `node.active = false` 后认为 spriteFrame 不渲染（必须 `sprite.enabled = false`）；
- ❌ 跳过 `build:cocos` 直接在 Cocos editor 跑（编辑器读的是 .js bundle）；
- ❌ 改 `assets/resources/game/plot-layout.json` 后不重建 Creator；
- ❌ 跑模拟器用 `cli auto …` 不加 `--trust-project`；
- ❌ DevTools 启用「增强编译」。
