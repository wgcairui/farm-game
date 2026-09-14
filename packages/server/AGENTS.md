# AGENTS.md — `@farm-game/server`

> 全局后端：**Fastify HTTP** + **Colyseus WS** 双入口，**MikroORM**（业务库，**当前唯一 ORM**）+ **PostgreSQL 16** + **Redis 7**。
>
> 改任何路由 / 房间 / 持久化前**先看 ADR**（[`docs/adr/`](../../docs/adr/)）。

---

## 1. 端口 & 进程矩阵

| 服务 | 进程命令 | 端口 | 进程模型 |
|---|---|---|---|
| API (Fastify HTTP) | `pnpm dev` | `127.0.0.1:3000` | PM2 fork（instances = cpus）|
| WS (Colyseus) | `pnpm dev:ws` | `127.0.0.1:2567` | 独立进程，共享 PostgreSQL |
| Admin (v2) | **当前未启用** | — | `ENABLE_ADMIN=0` 默认关闭；`ENABLE_ADMIN=1` 时 `mountAdmin()` 抛 `AdminConfigError`（v2 待实装，详见 [`docs/admin-integration.md`](../../docs/admin-integration.md)） |
| PostgreSQL | `pnpm db:up` | `127.0.0.1:5432`（**避让本机其他项目**：compose.yml 显式映射）| docker compose |
| Redis | 同上 | `127.0.0.1:6380`（避让本机 6379）| docker compose |

**Redis 端口注意**：compose.yml 用 `:6380` 而非 `:6379`，避让本机已有 Redis。改 compose 必须确认不冲突。

**Admin 现状**：`src/admin/index.ts` 是 v2 占位骨架（`ENABLE_ADMIN=0` no-op / `=1` 抛 `AdminConfigError`）；v1 三个占位文件 `db.config.ts` / `panel.ts` / `schema.ts` 已于阶段 A 直接删除（不留 `@deprecated`）。**v2 路径（2026-09-14 决策）**：放弃 `@colyseus/admin` + `@colyseus/database` + Drizzle + 第二个 DB，改用 Refine standalone + 我们自己的 Fastify `/admin-ops/*` 路由 + MikroORM `admin` schema（同一 DB）。依赖 `@colyseus/admin` / `@colyseus/database` / `@colyseus/auth` 已从 `package.json` 移除；后续阶段会引入 ESLint `no-restricted-imports` 兜底（ADR-0006 D48）。详见 [`docs/admin-integration.md`](../../docs/admin-integration.md) v2。

---

## 2. 目录结构

```
src/
├── index.ts            # API 进程入口（Fastify bootstrap）
├── app.ts              # Fastify app factory
├── bootstrap.ts        # 共享初始化（config / DB / redis / 日志）
├── config.ts           # 环境变量集中读取
├── auth/               # /auth/wechat + /auth/oauth + JWT（fast-jwt，HTTP 同策略）
├── player/             # /player/info + player repo
├── crop/               # /crop/configs + CropConfigRepo
├── farm/               # /farm/unlock + farm services（unlock/plant/water/harvest）
├── realtime/
│   ├── serve.ts        # WS 进程入口
│   ├── room.ts         # FarmRoom（schema + clock + message handlers + onAuth fast-jwt）
│   ├── redis.ts        # RedisDriver / Presence 接线
│   ├── revision-watcher.ts  # DB revision 轮询推送
│   └── ws-messages.ts  # WsEnvelope 序列化
├── repositories/       # MikroORM 实体 / persistence 接口实现
├── services/           # 业务服务层（解锁 / 种植 / 浇水 / 收获）
├── db/
│   └── migrate.ts      # MikroORM migrations runner
├── admin/              # v2 单文件占位（index.ts）：ENABLE_ADMIN=0 返 no-op；=1 抛 AdminConfigError；v1 占位 db.config/panel/schema 已删（阶段 A）
└── obs/                # pino / 指标
test/
├── integration/        # 真实 PG：G1 9 + farm-room 12 + failover 3 + lease 10
├── admin-disabled.test.ts
├── auth-verify.test.ts
├── realtime-spike.test.ts
├── security.test.ts
├── smoke.test.ts
└── ws-messages.test.ts
scripts/
├── demo-loop.ts        # 30s 真实等待闭环（需 db:up）
├── smoke-protocol.ts   # 13/13 协议校验
└── smoke-realtime.ts   # 9/9 HTTP+WS 双进程对跑
compose.yml             # postgres 16 + redis 7
db-init/                # 初始 SQL（角色 / 库）
.env.example            # 所有环境变量（G2 完整）
```

---

## 3. 关键规则

### 3.1 服务端权威
- 客户端金币 / 地块状态**全部由服务端决定**；
- `applyWater` 用 `serverNow - plantedAt` 计算剩余时间折扣（ADR-0001）；
- 24 plots / 6 unlocked 默认值集中在 `services/farm/unlock.ts`（**禁止**散落）。

### 3.2 幂等收据
- `operationId` 来自 client，server 写库前先查 receipt 表；
- 重复 operationId 返回首次结果，**禁止**重复扣金 / 重复发奖；
- 测试要覆盖「同一 opId 并发」。

### 3.3 revision 守卫
- `players.revision` 单调递增；
- 客户端 `farm_cmd` 带 revision，服务端在事务内 `assertCurrent`，过期 → 拒收；
- `revision-watcher.ts` 轮询推送新 revision。

### 3.4 跨进程租约仲裁
- PostgreSQL `pg_try_advisory_lock` + `LEASE_TTL_MS` / `LEASE_RENEW_MS`；
- WS 进程挂掉后另一实例能在 TTL 内接管；
- `ROOM_RECONNECT_TTL_SEC` 控制 client 重连窗口；
- SIGTERM 排空 + graceful shutdown（release lease）。

### 3.5 Auth
- `fast-jwt` 校验，HTTP 入口与 WS `onAuth` **同策略**；
- 失败 fail-closed：mock 模式除外（`mock_dev_*` code 复用同一玩家）；
- `playerId` 与 `wechatCode` 完全解耦（ADR-0001）。

### 3.6 Admin（**当前未启用**）
- `src/admin/index.ts` 是占位骨架；`mountAdmin()` 在 `ENABLE_ADMIN=0` 时挂 `/admin/healthz` 返 `{enabled:false}`，`ENABLE_ADMIN=1` 时抛 `AdminConfigError`（v2 待实装）；
- 业务代码（`auth|crop|player|farm|realtime/**`）**禁止** import `drizzle-orm` / `@colyseus/database` / `@colyseus/admin`（计划从 `package.json` 移除这些依赖）；
- **v2 路径（2026-09-14）**：Refine standalone + 我们自己的 Fastify `/admin-ops/*` 路由 + MikroORM `admin` schema；**不**引入第二个 ORM / 第二个 DB；
- 详见 [`docs/admin-integration.md`](../../docs/admin-integration.md) v2（设计决策、迁移顺序、路由映射、文件清单）；
- Nginx 限制 `/admin/*` 与 `/admin-ops/*` 仅内网访问。

---

## 4. 常用命令

```bash
# 起依赖
pnpm --filter @farm-game/server db:up
pnpm --filter @farm-game/server db:migrate
pnpm --filter @farm-game/server db:migrate:test  # 测试库

# 开发（两个终端）
pnpm --filter @farm-game/server dev          # API @ :3000
pnpm --filter @farm-game/server dev:ws       # WS  @ :2567

# 测试
pnpm --filter @farm-game/server test         # 44 单测（无外部依赖）
pnpm --filter @farm-game/server test:integration  # 34 集成（需 db:up）
pnpm --filter @farm-game/server smoke        # 13/13
pnpm --filter @farm-game/server smoke:realtime  # 9/9（HTTP+WS 双进程）

# demo
pnpm --filter @farm-game/server demo:loop    # 30s 真实等待闭环
```

迁移 / 种子：
```bash
pnpm --filter @farm-game/server db:migrate
node --import tsx scripts/seed-admin.ts       # Phase 3 admin seed
```

---

## 5. 环境变量（参见 `.env.example`）

| 变量 | 说明 |
|---|---|
| `MAIN_DB_URL` | **唯一**业务库（默认 `postgres://farm:farm@127.0.0.1:5432/farm_game`）|
| `TEST_DB_URL` | 集成测试库（compose/db-init 创建）|
| `ADMIN_DB_URL` | **已废弃**（admin v2 走同库 `admin` schema，不再有第二个 DB；即便设了也会被忽略，见 [ADR-0006 §6](./../../docs/adr/0006-admin-v2-refine-mikroorm.md)）|
| `REDIS_URL` | 默认 `redis://127.0.0.1:6380` |
| `WS_HOST` / `WS_PORT` | WS 进程监听（`server.listen` 绑点）|
| `PUBLIC_WS_HOST` / `PUBLIC_WS_PORT` | LB-fronted 部署时设（ADR-0005 D42）。matchmake 响应里返回的端点；让 SDK 客户端连 LB 公网域名而非内网。`PUBLIC_WS_PORT` 必须正整数；不设 → 退回 `wsHost:wsPort` |
| `LEASE_TTL_MS` / `LEASE_RENEW_MS` | 房间租约 |
| `REFRESH_POLL_MS` | revision 推送轮询 |
| `ROOM_RECONNECT_TTL_SEC` | 客户端重连窗口 |
| `ENABLE_MOCK_AUTH` | 1 / 0；mock 路径**仅开发**用 |
| `ENABLE_ADMIN` | 0 / 1；**当前 = 1 时抛错**（Phase 2 占位） |
| `JWT_SECRET` / `JWT_SECRET_ADMIN` / `SESSION_SECRET` | 必须从 env 读，**禁止**硬编码 |
| `WECHAT_APPID` / `WECHAT_SECRET` | G1.5 真实微信登录（占位） |

---

## 6. 反模式（不要做）

- ❌ 在事务内做网络 IO / sleep；
- ❌ 用 `console.log` 代替 `pino`；
- ❌ 把 revision / operationId 校验逻辑放进 client（必须 server 兜底）；
- ❌ `Date.now()` 用于业务时间（用 `serverNow`）；
- ❌ 跨包用相对路径绕过 `@farm-game/shared`；
- ❌ 改动协议层不更新 ADR；
- ❌ 直接连 6379（必须 6380，避让本机）；
- ❌ 把 `ENABLE_ADMIN` 设成 `1`（**当前 = 1 时抛 `AdminConfigError`**；admin 子模块尚未实装）；
- ❌ 在业务代码 import `drizzle-orm` / `@colyseus/database` / `@colyseus/admin`（admin v2 边界规则，`src/admin/index.ts` 顶部 + ESLint `no-restricted-imports` 兜底）；
- ❌ 把 `JWT_SECRET` 写到代码 / 提交到 git。

---

## 7. 必读

- [`docs/architecture.md`](../../docs/architecture.md) — 节点拓扑
- [`docs/deployment.md`](../../docs/deployment.md) — 上线流程
- [`docs/adr/0003-g1-persistence-and-commands.md`](../../docs/adr/0003-g1-persistence-and-commands.md) — 持久化 / operationId / revision
- [`docs/adr/0004-g2-ws-protocol-and-auth.md`](../../docs/adr/0004-g2-ws-protocol-and-auth.md) — WS 协议 + auth 门
- [`docs/adr/0005-g2-realtime-ops.md`](../../docs/adr/0005-g2-realtime-ops.md) — 跨进程 / 容错 / D38-D43 故障矩阵
- [`docs/admin-integration.md`](../../docs/admin-integration.md) — Admin 面板架构（v2：Refine + Fastify `/admin-ops/*` + MikroORM `admin` schema）
- [`docs/data-schema.md`](../../docs/data-schema.md) — 表结构
- [`docs/state-sync.md`](../../docs/state-sync.md) — revision / optimistic
