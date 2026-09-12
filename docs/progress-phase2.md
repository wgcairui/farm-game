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

---

## 7. T1 落地（统一命令入口 + 幂等并发 + 快照修订 + 认证 fail-closed）

> 起点：G0/G0.5/G1 已落地；T0 完成 Colyseus 0.18 server 可启动与 WS upgrade 接受。本节在不动业务规则的前提下，把 HTTP/WS 共用的命令执行路径加固到可承接 G2 实时房间。

### 7.1 主要改动

**协议与共享层**

- 新增 `ErrorCode.OPERATION_ID_REUSED = 3007`；`farm/routes.ts` 业务错误映射增加该码 → 409。
- `CommandResponse` 新增可选字段 `operationRevision?: number | null` 与 `replayed?: boolean`。`revision` 仍是当前快照修订；`operationRevision` 是收据结算时的修订；`replayed` 表示本次响应来自持久化收据。
- `CommandOutcome` 新增内部 `_replayed` 标志位，由 `replayedSuccess` / `replayedFailure` 工厂注入；不进 HTTP/WS payload，仅供 `executeCommand` 投影 `ExecuteResult.replayed`。

**执行路径（`services/farm/`）**

- `execute.ts`：`ExecuteResult` 携带 `operationRevision: number | null` 与 `replayed: boolean`；`materialisePlayer` 仍在事务内单事务读出最新 player。
- `receipts.ts`：`loadReceipt` 现在同时校验 `command` 与 `requestHash`。任一不一致返回 `OPERATION_ID_REUSED`，不再误把 `water(plot 0)` 和 `harvest(plot 0)` 当成同一命令的回放。返回值改为 `{ outcome, replayed: true }` 元组，由 service 投影为 `_replayed` 标志。
- `plant / water / harvest / unlock`：把两步 `findOneOrFail + em.lock` 改成单次 `findOne(Player, …, { lockMode: PESSIMISTIC_WRITE })`，发出一条 `SELECT ... FOR UPDATE`，避免两事务读到同一行再竞争加锁。锁在 receipt 查询之前，确保同 operationId 的并发请求串行化在 player 行上。`player` 不存在时返回 `NOT_AUTHENTICATED` 失败收据，不再让 `findOneOrFail` 抛 500。

**仓储（`repositories/`）**

- `PlayerRepo` 接口新增 `getOrCreateByIdentity(identity, createSave)`：原 `ensurePlayer` 的两步 `findByIdentity → upsert → addIdentity` 在并发首次登录时会留下孤儿 player + 抛 500。新入口在 PG 实现里走单事务：`SELECT identity` 命中则读出 player；未命中则 INSERT player + 24 plots + INSERT identity，依赖 `auth_identities` UNIQUE 约束兜底竞态——并发 loser 收到 `IdentityAlreadyBoundError`，调用方可安全重试。
- `MikroORMPlayerRepo.materialisePlayer`：现在用 `derivePlotStatus` + 当前时间推导每个 plot 的 `status`，不再直接读 `Plot.status`。`growing → ripe` 是时间驱动转换（ADR-0003 D23），重启后必须仍可见。
- InMemory 实现同步加上 `getOrCreateByIdentity`（单线程，无需并发控制）。

**认证（`auth/routes.ts`）**

- `production` 模式下，非 `mock_` 前缀的 `wechat code` / `oauth idToken` / `bind token` 一律 403 拒绝并返回 `WECHAT_CODE_INVALID` / `OAUTH_PROVIDER_INVALID`。**真实微信/OAuth 验签仍待 G1.5 接入；本轮只是堵住“裸字符串 → 默认 mock subject”的安全漏洞**。`dev` / `test` 模式下保留旧 stub 行为并增加一条 `WARN` 日志。

**集成测试（`test/integration/farm-flow.test.ts`）**

- PG 不可达时不再 silent skip——打印明确错误并将 `process.exitCode = 1`，避免“未执行”被当成“已通过”。
- `skip()` 改为 `requireDb()` 断言；任何依赖 DB 的测试用例若环境未就绪都失败。
- 新增场景：
  - 同 operationId 改 body：断言 `code === OPERATION_ID_REUSED`（不再依赖“返回 ok:false”）。
  - 同 operationId 跨命令（`water(plot 0)` → `harvest(plot 0)`）：断言 `OPERATION_ID_REUSED`，避免之前因 hash 一致被误当成 water 回放。
  - 同 operationId 重复 `plant`：断言 `replayed === true` 且 `operationRevision === operationRevision`（与首次相同）。
  - 并发首次登录：两个并发 `loginWeChat` 收到同一 `code`，断言 `auth_identities` 中只插入一行（不再有孤儿 player）。

### 7.2 验证矩阵

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm -r build` | tsc | ✅ 全绿 |
| `pnpm -r test` | 单测（不含集成） | ✅ 66/66（shared 31 + server 23 + client-mini 5 + client-app 7） |
| `pnpm smoke` | InMemory HTTP smoke | ✅ 13/13（既有记录未退化） |
| `pnpm --filter @farm-game/server test:integration` | 真实 PG | **本机未运行**（无 docker / 未启动 `pnpm db:up`）。下一阶段 T2 之前必须重跑一次以确认 T1 未引入回归。 |

### 7.3 已知风险与下阶段要求

- 真实 PG 集成测试在本次提交中未运行；T2 commit 之前必须 `pnpm db:up && pnpm db:migrate:test && pnpm test:integration` 跑一遍 8/8 全绿。
- 业务错误码 `OPERATION_ID_REUSED` 已加入 `packages/shared`，下次升级协议 major 时需记录。
- `auth/routes.ts` 的 production fail-closed 改变了 prod 默认行为——任何依赖“裸字符串即可登录”的内部脚本会失效。如有内部脚本依赖 stub 登录，必须改用 `mock_` 前缀并 `ENABLE_MOCK_AUTH=1`。

### 7.4 T1 review-fix（code review 高优先项收口）

只读 code-review 对 T0+T1 提出两处必修 + 一处断言收紧，本节全部落地：

- **并发首登 loser 不再 500**：`ensurePlayer` 捕获 `IdentityAlreadyBoundError` 后在新事务里 `findByIdentity` 回读赢家（唯一约束只在赢家提交后才触发，回读必然命中），两个并发首登均返回 200 + 同一 playerId。`MikroORMPlayerRepo.getOrCreateByIdentity` 的误导性注释同步改写为与实现一致（PG abort 后同事务内 swallow + 回读不可实现）。
- **“player 缺失 → 失败收据” 变为可达**：`executeCommand` 只在成功 outcome 时要求 player 可读（原实现无条件 `materialisePlayer` 并在 null 时 throw → 回滚收据 → 500）。`ExecuteResult.player` 放宽为 `PlayerSave | null`，route 层成功路径加防御性收窄。服务端 missing-player 分支同时先查一次收据，避免重试已结算 operationId 时撞收据唯一约束。
- **plant 不再允许覆盖 ripe 作物**（review 范围外发现，随本 fix 收口）：`liveStatus !== 'empty'` 即拒绝 `PLOT_NOT_EMPTY`，与文件头 "MUST be unlocked and empty" 及 G2 计划一致；新增集成场景验证。
- **并发首登测试断言收紧**：由 `successes.length >= 1` 改为两条登录均 200 且 playerId 相同。
- **清理**：删除 `receipts.ts` 死代码（`PersistedReceipt` / `buildResponse`）、`MikroORMPlayerRepo.lockPlayer`（T1 锁重构后无调用方）、`water.ts` 的 `void getCrop` 残留、指向已删除 spike 脚本的 npm scripts、测试内 debug `console.error`；`InMemoryPlayerRepo` 补与 PG repo 的 ripe 推导差异说明。
- **顺手修复**：`db:migrate:test` 脚本 `MAIN_DB_URL=$TEST_DB_URL` 的 shell 展开顺序 bug（同一命令行内赋值展开取旧值）——`migrate.ts` 本就直接接受 `TEST_DB_URL`。

**验证矩阵（review-fix 后，真实 PG）**：

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm -r build` | tsc | ✅ 全绿 |
| `pnpm -r test` | 单测 | ✅ 66/66 |
| `pnpm smoke` | InMemory HTTP smoke | ✅ 13/13 |
| `pnpm --filter @farm-game/server test:integration` | 真实 PG | ✅ **9/9**（G1 六项 + review-fix 新增三项：跨命令 OPERATION_ID_REUSED、并发首登收敛、ripe 禁重播） |

---

## 8. T2 落地（房间所有权租约 + WS 入口基础设施）

> 起点：T1 + review-fix 后命令层已可承接 HTTP/WS 共用。本节交付 G2 的所有权仲裁与 WS 进程基础设施；真实 FarmRoom 命令处理与广播在 T3。

### 8.1 关键决策与 SDK 核实

- **`@colyseus/core` 0.18.12 下的 Redis 组件**：`@colyseus/redis-driver@0.18.2`（`RedisDriver implements MatchMakerDriver`，matchmaker 目录）与 `@colyseus/redis-presence@0.18.4`（`RedisPresence implements Presence`，pub/sub presence）均已安装并核实导出；core peer `^0.18.5` / `^0.18.11` 均满足。
- **所有权不交给 Redis**：RedisDriver 只共享房间目录；同一农场的单一活跃房间所有者由 PostgreSQL `farm_room_leases` 表仲裁。每次 WS 写命令在命令事务内 `assertCurrent`（`SELECT ... FOR UPDATE`）做 fencing，防止旧实例在租约被接管后继续提交资产变更。
- **时钟策略**：租约的所有过期判断一律用数据库时钟（SQL `now()`），不依赖 WS 主机墙钟。
- **Redis 无业务状态**：compose 中 redis 无 volume；进程级 `instanceId`（UUID）随租约落库用于 fencing。

### 8.2 新增与改动

**迁移与仓储**

- `db/sql/0002-g2-room-leases.{up,down}.sql`：`farm_room_leases`（owner_id PK/FK players、room_id、instance_id、epoch BIGINT、expires_at/updated_at）。释放保留行并置 `expires_at = now()`（epoch 不重置，接管必递增）。
- `repositories/room-lease-repo.ts`：`acquire`（单条条件 UPDATE 实现过期接管 epoch+1 / 同持有者续借 epoch 不变；条件 INSERT 处理首租；真冲突时抛 `LeaseConflictError` 携带持有者信息）、`renew`（room+instance+epoch+`expires_at > now()` 四重 guard，过期不可原地复活）、`release`（仅过期自己的租约）、`findCurrent`、`assertCurrent(em, lease)`（命令事务内 FOR UPDATE + epoch 校验，抛 `LeaseLostError`）。

**迁移互斥**

- `db/migrator.ts`：`applyPendingMigrations` / `rollbackLastMigration` 包进 `pg_advisory_lock`（key `0x6661726d`），HTTP 与 WS 双进程并发启动不再竞争 DDL。

**入口与接线**

- `bootstrap.ts`：共享 DB 装配（迁移 → MikroORM → repo/tx → 租约 pool(max 4) + `RoomLeaseRepo` → `instanceId`），单一 `close()` 释放；`MAIN_DB_URL` 缺失时 WS 入口 fail-closed。
- `realtime/serve.ts`：独立 Colyseus 进程（`dev:ws` / `start:ws`）。`REDIS_URL` 存在时挂 RedisDriver+RedisPresence（含启动探测，连接失败即拒绝启动），否则 LocalDriver（仅 dev）。
- `realtime/room.ts`：替换 G0 stub。T2 骨架版 `FarmRoom`：`roomId = ownerId`；`onCreate` 竞争租约（冲突 → 建房失败，客户端 join 报错可重试）；`this.clock.setInterval` 按 `LEASE_RENEW_MS` 续租，失租即 `disconnect()` 停止服务（完整排空语义 T4）；`onDispose` 停表 + 释放租约。JWT onAuth、四命令、快照广播留待 T3。
- `config.ts`：新增 `wsPort`（2567）、`wsHost`、`redisUrl`、`leaseTtlMs`（15000）、`leaseRenewMs`（5000）+ 校验（renew 必须 < TTL；production 无 REDIS_URL 拒绝启动）。
- `index.ts`：复用 `bootstrapDatabase`，与 WS 入口共享同一装配路径。
- `compose.yml`：新增 `redis:7-alpine`（127.0.0.1:6379，healthcheck，无 volume）；`db:up` 同时启动 postgres + redis。
- `.env.example`：新增 G2 段（WS_HOST/WS_PORT/REDIS_URL/LEASE_TTL_MS/LEASE_RENEW_MS）。

### 8.3 集成测试（`test/integration/room-lease.test.ts`，真实 PG）

两个独立 pg Pool 模拟两个 WS 进程（真 OS 进程级测试在 T5）：

- 首租 epoch=1；活跃租约拒绝其他实例（`LeaseConflictError` 携带持有者 roomId/instanceId/到期时间）；
- 同持有者重复 acquire 续借且 epoch 不变；
- release → `findCurrent` 为 null → 其他实例接管 epoch=2；
- renew 的 room/instance/epoch guard；过期租约 renew 返回 null（不可复活）；
- 强制过期（SQL 置 `expires_at` 到过去）后跨实例接管 epoch 递增、旧 handle renew 失败；
- `assertCurrent` 在真实事务内通过 / 接管后抛 `LeaseLostError`。

**基础设施修复**：`test:integration` 加 `--test-concurrency=1`——两个集成测试文件并行 TRUNCATE 同批表会死锁（本次实测复现），文件级串行后消除。

### 8.4 验证矩阵（T2 后，真实 PG + Redis compose 就绪）

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm -r build` | tsc | ✅ 全绿 |
| `pnpm -r test` | 单测 | ✅ 66/66 |
| `pnpm smoke` | InMemory HTTP smoke | ✅ 13/13 |
| `pnpm --filter @farm-game/server test:integration` | 真实 PG（G1 9 项 + 租约 8 项） | ✅ **17/17** |

### 8.5 T3 需要接手的点

- `FarmRoom.onAuth`：JWT 验证（HTTP 同款 iss/aud/exp），`options.ownerId` 与 token `sub` 强一致；非本人农场拒绝。
- 四命令 handler：委托 `executeCommand` 并在命令事务内先 `assertCurrent`（fencing），提交后刷新快照广播。
- `welcome/snapshot`：进房后从 DB 读全量投影发送；多连接广播；WS envelope 采用 shared `protocol/ws.ts` 的 G2 版本。
- Redis 双进程行为、HTTP→WS 同步、重连恢复：T4。

### 8.6 T2 review-fix（code review 高优先项收口）

只读 code-review 对 T2 提出 1 Critical + 3 Important，全部落地：

- **Critical：fencing 失效**——`assertCurrent` 的 `em.getConnection().execute(sql, params)` 不传事务上下文时经 knex 根连接 autocommit 执行，FOR UPDATE 行锁在语句结束即释放，fencing 完全不生效。修复：显式传 `em.getTransactionContext()` 并在无事务上下文时 fail closed（`LeaseLostError('no-transaction')`）。**用最小实验实证了修复有效**：事务内持锁期间，竞争 UPDATE 被阻塞 610ms 直到事务提交。配套新增锁竞争集成测试（红→绿判别）。
- **Important：matchmaking 未按农场过滤**——`server.define('farm', FarmRoom)` 补 `.filterBy(['ownerId'])`，否则任何 farm 房间都会被 joinOrCreate 命中，lease 仲裁在 matchmaking 第一跳即被绕过（T3 一旦广播快照即跨农场泄漏）。
- **Important：迁移 tracking 表建在锁外**——`ensureTrackingTable` 移入 advisory lock 回调内，HTTP/WS 并发首跑全新库不再有 DDL 竞态。
- **Important：REDIS_URL production 必填误伤 HTTP 入口**——约束从 `loadConfig` 移到 WS 入口（HTTP 进程不使用 Redis）。
- **次要清理**：WS 优雅停机不再重复关闭 Redis（Colyseus `gracefullyShutdown` 自带 driver/presence shutdown，二次关闭会产生 double-quit rejection）；`redis.close()` 收窄为启动失败清理路径专用；`FarmRoom.onCreate` 在 acquire 成功后的失败路径主动释放租约（Colyseus onCreate 抛错不调 onDispose）；`ownerId` 长度校验收紧至 36（与 players.player_id 列宽一致）。
- **测试修正**：锁竞争测试修正计时窗口（阻塞发生在 expire UPDATE 上，原实现把计时包在 acquire 周围导致误报失败）并在 finally 中始终回收事务（断言失败时悬挂事务会以行锁污染下一测试的 TRUNCATE）；新增“同持有者过期 re-acquire 保持 epoch + 真实交接递增”场景；新增无事务上下文 fail-closed 断言。

**验证矩阵（T2 review-fix 后，真实 PG）**：

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm -r build` | tsc | ✅ 全绿 |
| `pnpm -r test` | 单测 | ✅ 66/66 |
| `pnpm smoke` | InMemory HTTP smoke | ✅ 13/13 |
| `pnpm --filter @farm-game/server test:integration` | 真实 PG（G1 9 项 + 租约 10 项） | ✅ **19/19** |