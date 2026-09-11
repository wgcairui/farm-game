# Phase 2 进度快照（G0 / G0.5 / G1 落地）

> 日期：2026-09-11 · 分支 `feat/phase2-g0-contract`
> 起点：Phase 1 单机骨架 (`b0becb1`)
> 范围：契约 / 安全 / 玩法统一 / 持久化与原子命令
> 状态：**G0 / G0.5 / G1 已落地；G2 / G3 / G4 未开始**

## 1. 提交栈

```
31ec064  Phase 2 G1 / PostgreSQL 持久化与原子命令 (ADR-0003 D17–D30)
5ae88b3  Phase 2 G0.5 / 玩法统一 (ADR-0002 D9–D16)
162407c  docs: sync progress + G0 review-fix outcome
c66d6ca  Phase 2 G0 review-fix: subject privacy, atomic identity index, applyWater hardening
1ea87ee  Phase 2 G0: contract + security baseline (ADR-0001)
```

## 2. 验证矩阵

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm -r build` | 4 包 tsc | ✅ 全绿 |
| `pnpm -r test` | 单测 | ✅ **65/65**（shared 31 + server 22 + client-mini 5 + client-app 7） |
| `pnpm smoke`（InMemory） | 登录链 + admin 边界 | ✅ **13/13** |
| `pnpm smoke`（PostgreSQL） | 登录链 + 4 个 farm 命令 + admin | ✅ **16/16** |
| `pnpm --filter @farm-game/server test:integration` | 真实 PG | ✅ **6/6** |
| `pnpm --filter @farm-game/server demo:loop` | 30 秒真实等待 + 9 项断言 | ✅ all green |

## 3. ADR 落地一览

| ADR | 范围 | commit |
|---|---|---|
| 0001 | G0 契约 + 安全：`playerId` (UUID) / `AuthIdentitySummary` 公开投影 / JWT 标准声明 / mock fail-closed / `applyWater` 剩余时间折扣 / 协议 426 | 1ea87ee + c66d6ca |
| 0002 | G0.5 玩法统一：24 plots / 6 unlocked / `ripe` 状态 / 协议 v2 / 移除 `inventory` + 仓库 | 5ae88b3 |
| 0003 | G1 持久化与原子命令：`operationId` 幂等 / `revision` 修订号 / `serverNow` 时间权威 / 行锁 + 事务 / 4 命令服务 / 真 PG 集成 | 31ec064 |

## 4. G1 实施细节

### 4.1 持久化层

- `compose.yml` 启 PostgreSQL 16，端口仅绑定 `127.0.0.1:5432`，`pg_isready` 健康门；volume `farm-pg-data`。
- 4 张表（`db/sql/0001-g1-initial-schema.{up,down}.sql`）：
  - `players` — UUID PK、`revision` 字段、CHECK 非负。
  - `auth_identities` — UNIQUE `(provider, tenant_id, subject)`，tenant 用 `''` sentinel 规避 PG NULL 唯一性语义。
  - `plots` — UNIQUE `(player_id, index)`，24 行/玩家，CHECK `0..23`。
  - `operation_receipts` — UNIQUE `(player_id, operation_id)` = 幂等收据点。
- `src/db/migrator.ts`：手写 `pg` runner，避开 MikroORM Migrator 的 `emittery@0.13` `maps.js` 漏装；`_schema_migrations` 跟踪。
- `src/db/mikro-orm.config.ts`：用 `@mikro-orm/postgresql` 的 `defineConfig`，注册 4 个 entity。
- 启动时 `index.ts` 自动 `applyPendingMigrations()` 再 `MikroORM.init()`；从零 PG 容器即可落表 5 张（4 + `_schema_migrations`）。

### 4.2 仓储层

- `repositories/player-repo.ts`：`PlayerRepo` 接口 + `ensurePlayer` + `generatePlayerId`。
- `repositories/InMemoryPlayerRepo.ts`：测试用。
- `repositories/MikroORMPlayerRepo.ts`：PG 实现；`upsert` 用两次 flush 满足 `plots.player_id → players.player_id` FK；`addIdentity` 捕 `UniqueConstraintViolationException` 转 `IdentityAlreadyBoundError`。
- `repositories/transaction.ts`：`TransactionRunner` 抽象，每写命令独立 EM 上下文。

### 4.3 命令服务

- `services/farm/{unlock,plant,water,harvest}.ts`：每个服务在事务内完成 (a) 业务校验 (b) `Player`/`Plot` + `revision` 变更 (c) `OperationReceipt` 持久化。
- 浇水复用共享 `applyWater()` 计算折扣；成熟判定在 `derivePlotStatus`。
- `services/farm/receipts.ts`：`hashRequestBody`（canonical JSON SHA-256）+ `loadReceipt` 重放 / 改参拒绝。
- `services/farm/execute.ts`：事务执行器，调用 service + 读取最新 player 投影返回。

### 4.4 HTTP 路由

- `farm/routes.ts` 重写为薄壳：每个命令 `POST /farm/{unlock,plant,water,harvest}`，body envelope `{operationId, body}`。
- 业务错误 → `businessHttpStatus` 映射（402 `INSUFFICIENT_GOLD` / 409 占用冲突 / 401 鉴权）。
- In-memory 模式返回 503 `NOT_IMPLEMENTED`。
- `auth/routes.ts` 中 `/auth/wechat` / `/auth/oauth` 注入 `serverNow` + `revision`；`/auth/_meta` 返回 `serverNow`。

### 4.5 共享层

- `protocol/commands.ts`：`CommandRequest<TBody>` / `CommandResponse<TPayload>`、4 个 DTO、`canonicaliseBody`。
- `types/operation.ts`：`OperationReceipt` 公开类型。
- `PlayerSave.revision: number` 加入公开类型；`createDefaultPlayerSave` 默认 `revision: 0`。

### 4.6 客户端

- `client-app/src/net/api.ts`：`ApiClient.{unlockPlot,plantPlot,waterPlot,harvestPlot}` + `makeOperationId()`（UUIDv4）。
- `client-mini` 仅扩展单测，UI/CC stub 留给 G3 切换真实 `cc` 包。

### 4.7 命令清单

```bash
pnpm db:up              # docker compose up postgres
pnpm db:migrate         # 应用 ./sql/*.up.sql
pnpm db:migrate:test    # 应用到 farm_game_test
pnpm db:reset           # drop volume + 重启
pnpm db:down            # 关停容器

pnpm --filter @farm-game/server demo:loop   # 端到端演示
pnpm --filter @farm-game/server test:integration  # 真实 PG 集成
```

## 5. 仍未完成（通往 MVP 的剩余路径）

按 [implementation-plan-phase2.md §3](./implementation-plan-phase2.md) 与 [mvp-features.md](./mvp-features.md)：

| 关卡 | 范围 | 阻塞 |
|---|---|---|
| **G2** | Colyseus WS 房间 + 断线重连 + 幂等收据复用 G1 + 两进程竞争测试 | 无外部阻塞；G1 命令服务已 HTTP+WS 共用 |
| **G3** | Cocos Creator 3.8.x 工程 + 微信开发者工具 + 真实联调 | **Cocos 编辑器 + 微信 AppID 必须就位** |
| **G4** | 部署文档 + `architecture.md` §9 阶段路线 + `DELIVERY.md` 追加 | 无外部阻塞 |

详见项目记忆 [[../.zcode/cli/memories/projects/farm-game-848868ab67a8f96a/memory/development-roadmap.md]] 与 [[../.zcode/cli/memories/projects/farm-game-848868ab67a8f96a/memory/monorepo-architecture.md]]。

---

## 6. T0 落地（基线 + Colyseus 0.18 server 可启动）

> 起点：G0/G0.5/G1 完成后，下一步进入 G2 实时房间的探索。本节记录“server 真能起来”这一可证伪前提的最小验证。

### 6.1 关键决定

- **升级 `@colyseus/core` 0.18.3 → 0.18.12**。锁定的 0.18.3 与 `@colyseus/ws-transport` 0.18.2 peer 错配（transport 引用了 core 0.18.5+ 才出现的 `createAuthContext`），spike 启动即 `SyntaxError`。升 core 到 0.18.12 后，peer check 通过、build 通过、test 通过。
- **官方 `colyseus.js` SDK 跨大版本不兼容**。该包最新只到 0.16.22，未发布 0.18。0.18 server 引入了新 `HandshakeSection`（INPUT_REFLECTION / INPUT_OPTIONS）、新 `ProtocolModifier`（TIMED / UNRELIABLE）和 `ROOM_RESPONSE` 上的 `ResponseStatus` 字节；0.16 客户端在 HTTP matchmake 阶段就拿不到 `room.name` 而抛 `TypeError`。Spike 弃用 SDK 路径。
- **T0 spike 仅验证“server listen + WS upgrade 接受”**，不验证 Colyseus matchmake / JOIN_ROOM / ROOM_DATA 二进制协议。该验证是 SDK 客户端的工作，且微信小游戏客户端无法加载 `colyseus.js`——最终 Phase 2 客户端将以自有 `WsEnvelope` 通过 `wx.connectSocket` 直连，不会依赖 colyseus.js。

### 6.2 新增与改动

- 新增 `packages/server/src/realtime/spike/serve.ts`：用 `@colyseus/core` 0.18.12 + `@colyseus/ws-transport` 0.18.2 暴露最小 `farm` 房间，导出 `startSpikeServer(port)` 与 `SpikeRoom`。
- 新增 `packages/server/test/realtime-spike.test.ts`：起 server → HTTP `Upgrade: websocket` 请求 `/matchmake/joinOrCreate/farm` → 断言 101 Switching Protocols。
- `packages/server/package.json` 升 `@colyseus/core` 至 0.18.12、补 `@colyseus/ws-transport@^0.18.2` 为 dependencies、补 `ws` / `@types/ws` 为 devDependencies（保留以备 T3+ 需要时使用）。

### 6.3 验证矩阵（本节新增）

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm --filter @farm-game/server build` | tsc | ✅ Done |
| `pnpm -r test` | 单测（含新 `realtime-spike.test.ts`） | ✅ 66/66（shared 31 + server 23 + client-mini 5 + client-app 7） |
| `pnpm smoke` | InMemory HTTP smoke | ✅ 13/13（既有记录未退化） |

### 6.4 T0 未验证、留给后续阶段的事

- Colyseus matchmake HTTP 响应结构、JOIN_ROOM 字节序列、ROOM_DATA 解码。
- 客户端 SDK 选型：0.18 没有官方 SDK，最终客户端必须自己实现 WS 握手与 envelope 解码。该选型属于 G3 客户端接入而非 T0 server spike。
- Redis / 多进程 / 跨节点：T2 才引入。

### 6.5 后续阶段提交前需复核

- `pnpm --filter @farm-game/server test:integration`（真实 PG 集成）：本轮 core 升级未触及 PG 路径，但下次跑 PG 时必须先重跑以确认依赖更新未影响集成测试。
- 升级 `@colyseus/admin` / `@colyseus/auth` / `@colyseus/database` 与 core 同步：本轮保持原版本（peer check 通过），T2 接入 Redis Presence/Driver 时若引入 transport/auth 再统一升级。