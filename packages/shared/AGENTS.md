# AGENTS.md — `@farm-game/shared`

> 客户端与服务端**唯一**共享的协议契约与纯逻辑层。HTTP / WS / Auth / ErrorCode / 时间管理 / 事件总线 / 玩法规则全部由此包导出。
>
> 改动协议层 = 强制同步 server / client-mini / client-app + 对应 ADR，**先看 `docs/adr/`**。

---

## 1. 角色定位

- **不允许**在这里引入运行时副作用（无 DB / 无 fetch / 无 fs / 无 `window`）；
- **不允许**写任何平台分支代码（无 `wx.` / 无 RN API / 无 Cocos import）；
- **允许**的依赖：仅 ESM 标准库 + 纯类型；
- ESM only，外部 import 显式 `.js` 后缀；
- 跨包消费用 `@farm-game/shared` 或 `@farm-game/shared/protocol`（看 `package.json` exports）。

---

## 2. 目录结构

```
src/
├── protocol/          # HTTP/WS DTO + ErrorCode + Auth + version
│   ├── auth.ts        # JWT / wechat / oauth 类型
│   ├── commands.ts    # farm_cmd 枚举（plant/water/harvest/unlock）+ cmd_result
│   ├── error.ts       # ErrorCode 枚举 + 错误形状（client 必须按 code 处理）
│   ├── http.ts        # /auth/* /crop /player /farm 请求响应 DTO
│   ├── ws.ts          # WsEnvelope（welcome / farm_cmd / cmd_result / state_changed）
│   ├── version.ts     # PROTOCOL_VERSION（server /healthz 与 client 都校验）
│   └── index.ts
├── types/             # 业务实体类型（PlayerSave / PlotState / CropConfig / etc.）
├── logic/             # 纯玩法规则（applyWater 剩余时间折扣、收获加金、种植扣金…）
├── persistence/       # 持久化接口（PlayerRepo / PlotRepo / CropConfigRepo）
├── time/              # serverNow / elapsed / 时间窗口工具
├── eventbus/          # EventBus.emit（DevTools 增强编译已加固，不要回退）
└── index.ts           # 桶出口
```

---

## 3. 关键约束

### 3.1 EventBus.emit 迭代器协议
- DevTools「增强编译」破坏 `Map/Set` 迭代器协议，已加固；
- **禁止**回退到旧的 emit 实现；改这里务必跑 `pnpm -r test`（mini 的 e2e-online 也会覆盖）。

### 3.2 protocol version
- `PROTOCOL_VERSION` 在 `protocol/version.ts`；
- server `/healthz` 返回该值；client `OnlineGameApp.start()` 与之比对，**不一致直接 fail-closed**（mock 模式除外）；
- 升版本 → 写 ADR（沿用 `0001–0005` 编号），并修改 `docs/client-protocol.md`。

### 3.3 ErrorCode
- `protocol/error.ts` 是唯一来源；
- 任何新错误必须先在 ErrorCode 加常量，再在 server 抛出，再在 client 捕获；
- client 端按 `code` 字符串判断（**禁止**按 message 判断）。

### 3.4 玩法逻辑
- `logic/` 下的函数必须**纯**（无 IO、无 Date.now，传入 serverNow）；
- 时间相关一律用 `time/` 下的工具函数；
- 24 plots / 6 unlocked 默认值集中在 `logic/plot.ts`，**禁止**散落。

---

## 4. 常用命令

```bash
pnpm --filter @farm-game/shared build    # tsc → dist/
pnpm --filter @farm-game/shared test     # 31 单测（node --test --import tsx）
pnpm --filter @farm-game/shared clean    # rm -rf dist
```

消费方（server / client-*）若只看到旧类型，记得：
```bash
pnpm --filter @farm-game/shared build && \
  pnpm --filter <consumer> build
```
shared dist 是**真实产物**，改 src 不 build 不会传播。

---

## 5. 必读

- [`docs/architecture.md`](../../docs/architecture.md) §2-3 — 节点拓扑 + 客户端矩阵
- [`docs/client-protocol.md`](../../docs/client-protocol.md) — 协议契约全文
- [`docs/adr/`](../../docs/adr/) — 历次协议决策（0001 contract / 0002 gameplay / 0003 commands / 0004 ws / 0005 ops）
- [`docs/state-sync.md`](../../docs/state-sync.md) — revision / serverNow / 乐观回滚

---

## 6. 反模式（不要做）

- ❌ 在 shared 写 `import { WX } from '@farm-game/...'`；
- ❌ 把 server-only 工具（如 fast-jwt、pino）放进 shared；
- ❌ 在 shared 写 `Date.now()` —— 全部走 `time/serverNow()`，保证测试可控；
- ❌ 直接在 `protocol/` 加新错误码而不写 ADR；
- ❌ 跨包用相对路径绕过 `@farm-game/shared`（如 `../../shared/dist/...`）；
- ❌ 在 client 端按 `error.message` 分支判断。
