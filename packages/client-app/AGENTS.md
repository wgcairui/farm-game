# AGENTS.md — `@farm-game/client-app`

> iOS / Android App 客户端（React Native）。**Phase 5 占位**：api client + GameStore + 类型契约就位，**未引入 react / react-native 依赖**；expo prebuild 留到 Phase 5 实装。
>
> 现阶段主要用于服务端契约参考 + 给后续 RN 实现铺路。

---

## 1. 现状

- ✅ `dist/` 编译过（`pnpm --filter @farm-game/client-app build`）；
- ✅ 7 单测覆盖 API client + GameStore（`pnpm --filter @farm-game/client-app test`）；
- ⌛ 未引入 `react` / `react-native` 运行时依赖；
- ⌛ 未做 expo prebuild；
- ⌛ Sign in with Apple / Google 走 `/auth/oauth`（G1.5 待 AppID/Secret）；
- ⌛ IAP / Google Play Billing（Phase 2+）。

---

## 2. 目录结构

```
src/
├── index.ts           # 桶出口
├── App.tsx            # 顶层占位（实际 RN 渲染逻辑待 Phase 5）
├── net/               # API client（与 server HTTP /auth + /player + /farm + /crop 对齐）
├── screens/           # 屏占位
└── store/             # GameStore（与 client-mini runtime/online.ts 形态对齐）
test/
├── api.test.ts
└── store.test.ts
```

---

## 3. 关键规则

### 3.1 协议契约
- 与 client-mini 共享 `@farm-game/shared`；
- 改协议必须同步 server + 两个 client；
- ErrorCode 处理逻辑与 client-mini 一致（**按 `code` 字符串判断**，不按 message）。

### 3.2 登录
- Phase 5 起接入 `Sign in with Apple` / Google → `POST /auth/oauth`；
- 当前**只有** mock 入口，与 client-mini 共用同一服务端 `mock_dev_*` code；
- 真 AppID / Secret 落地走 G1.5（见 workflow-rules）。

### 3.3 GameStore
- 形态与 client-mini `runtime/online.ts` 对齐（服务端权威 + optimistic + revision 守卫）；
- 持久化层用 `AsyncStorage`（不在本仓库，由 Phase 5 expo prebuild 引入）；
- **当前**只暴露内存版实现，单元测试覆盖 reducer / event handler。

### 3.4 不引入 react / react-native
- Phase 5 之前**禁止** `package.json` 加 `react` / `react-native` / `expo`；
- 真接入走 expo prebuild（见 docs/deployment.md Phase 5）；
- 引入前先在团队 review。

---

## 4. 常用命令

```bash
pnpm --filter @farm-game/client-app build    # tsc → dist/
pnpm --filter @farm-game/client-app test     # 7 单测
pnpm --filter @farm-game/client-app clean    # rm -rf dist
```

---

## 5. 必读

- [`docs/architecture.md`](../../docs/architecture.md) §3 — 客户端矩阵
- [`docs/client-protocol.md`](../../docs/client-protocol.md) — HTTP 路由 + DTO
- [`docs/state-sync.md`](../../docs/state-sync.md) — revision / optimistic（与 client-mini 行为对齐）
- [`docs/deployment.md`](../../docs/deployment.md) — Phase 5 expo prebuild 流程

---

## 6. 反模式（不要做）

- ❌ 提前引入 `react` / `react-native` / `expo` 依赖；
- ❌ 复制 client-mini 的 `runtime/online.ts` 整套过来（API client + GameStore 是 seam，UI 自己写）；
- ❌ 跳过 server 端直接 mock 玩法逻辑（server 权威，client 不能自创金币）；
- ❌ 在 client 端按 `error.message` 判断；
- ❌ 把 AsyncStorage mock 写进 `dist/`（应在测试里）；
- ❌ 用 `@farm-game/shared` 的相对路径（用包名）。
