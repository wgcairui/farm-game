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