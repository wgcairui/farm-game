# Phase 2 进度快照（G0 / G0.5 / G1 落地）

> 日期：2026-09-11 · 分支 `feat/phase2-g0-contract`
> 起点：Phase 1 单机骨架 (`b0becb1`)
> 范围：契约 / 安全 / 玩法统一 / 持久化与原子命令
> 状态：**G0 / G0.5 / G1 / G2 / G3 已落地；G4（真机回归 + 发布收口）/ G1.5（真实微信登录）未完成**

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
| ~~G2~~ | ~~Colyseus WS 房间 + 断线重连 + 幂等收据复用 G1 + 两进程竞争测试~~ | ✅ 已完成（§6–11，commit fb49188→967ad12） |
| ~~G3~~ | ~~Cocos Creator 3.8.x 工程 + 微信开发者工具 + 真实联调~~ | ✅ 已完成（§12，commit `9ef7c24`；模拟器 E2E 通过） |
| **G4** | wx transport 真机回归 + 包体/图集优化 + 上线发布链路 | 真机 + 微信 AppID 就位 |
| **G1.5** | 真实微信 jscode2session（AppID/AppSecret）+ Apple/Google id_token | 凭据就位 |

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
- 客户端 SDK 选型：0.18 没有官方 SDK，最终客户端必须自己实现 WS 握手与 envelope 解码。该选型属于 G3 客户端接入而非 T0 server spike。（**已被 §12 推翻**：G3 实际采用 `@colyseus/sdk 0.18.2` + wx-compat，实测可用）
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
---

## 9. T3 — 真实 FarmRoom 完整版（onAuth + 四命令 + 快照 + 广播）

> 契约与测试栈决策已锁入 **ADR-0004**（D31–D37）。T2 骨架（租约仲裁/续租/失租断开）不变，本节在其上补齐鉴权、命令、快照与广播。

### 9.1 关键决策（详见 ADR-0004）

- **D31** 房间无 Colyseus Schema state，DB 唯一权威；C→S 写命令走单通道 `farm_cmd`（command 判别，body 复用 HTTP 形状，services 原样复用）。
- **D32** envelope 复用 `PROTOCOL_VERSION '2.0.0'`，服务器校验 major；结构垃圾 ephemeral 不落 receipt（镜像 HTTP 400），业务失败仍落 receipt。
- **D33** `onAuth` 用 `fast-jwt`（`@fastify/jwt` 同底座）以同 secret/iss/aud 验签；`options.ownerId === token.sub` 强一致，跨农场拒绝；verified playerId 走 `client.auth`。
- **D34** fencing 注入 `executeCommand` 的 `run` 回调：`assertCurrent(em, lease)` 与命令写同事务同连接；`LeaseLostError` → 整事务回滚（命令与收据都不落库）→ 房间断开 → 原 `operationId` 可安全重试。新错误码 `LEASE_LOST: 4300`。
- **D35** 快照以 `farm_refresh`（拉取）为可靠路径。实测 core 0.18.12 `_onJoin` 先 `await onJoin()` 再发 `JOIN_ROOM`，SDK 客户端必然丢弃 join 推送——G3 客户端因此以 `farm_refresh` 拉取快照（见 §12）。
- **D36** 成功命令：请求者 `cmd_result`（r 回声 + `toCommandResponse` 共享投影）+ 全连接 `plot_updated`/`gold_updated`；失败仅回请求者 `error`（带 r），不广播。
- **D37** 测试栈 `@colyseus/testing@0.18.5` + `@colyseus/sdk@0.18.2`（T1"SDK 只到 0.16"结论仅适用旧包名 `colyseus.js`；~~生产客户端走 wx.connectSocket 自研~~ **已被 §12 推翻：生产小游戏采用 SDK + wx-compat**）。`serve.ts` 抽 `buildWsServer(config)` 供测试构造。

### 9.2 新增与改动

- `shared/protocol/ws.ts` 重写 G2 版：删除 `hello`/`steal`（无引用），新增 `farm_cmd`/`farm_refresh`/`welcome`(含全量 `player`)/`cmd_result`/`plot_updated`/`gold_updated`/`error`；`error.ts` 加 `LEASE_LOST: 4300`。
- `server/auth/verify.ts`（新）：`verifyAccessToken` + `WsAuthError`（expired→1102 / 签名·claim 类→1101 / key·config 类→4000）；`fast-jwt` 提为直接依赖。
- `server/realtime/ws-messages.ts`（新）：`parseFarmCmd`/`parseFarmRefresh`/`serverEnvelope` 纯函数。
- `server/realtime/room.ts` 完整版：onAuth + 房间级 `onMessage` 一次注册 + `handleFarmCmd`（结构校验→lease 空检查→executeCommand（run 回调内 assertCurrent）→投影/广播）+ `handleFarmRefresh` + `loseLease()` 断开路径。
- `server/realtime/serve.ts`：抽 `buildWsServer`（构造不 listen）；`configureFarmRoom` 扩展六件套。
- `services/farm/execute.ts`：新增 `toCommandResponse`，HTTP routes 与 WS 共用投影（消除双份漂移）。
- `compose.yml`/`.env.example`：redis 宿主端口 6379→6380（与本机其他项目端口转发冲突）。

### 9.3 集成测试（`test/integration/farm-room.test.ts`，真实 PG + 真实 transport）

`@colyseus/testing` 构造真 Server（临时端口、LocalDriver、无 Redis），覆盖 9 项：welcome 全量投影（24 plots/6 unlocked/revision）；WS plant 落 DB（gold/plot/revision/收据）；第二连接收到 `plot_updated`+`gold_updated` 广播；同 operationId 幂等重放（gold 不重复扣）；坏 token 拒绝；ownerId≠sub 拒绝；**fencing**（SQL 强制过期 + instance-B 接管 epoch=2 → 旧房间命令回 `LEASE_LOST`、房间断开、gold/revision/收据零写入）；matchmaking 同 owner 复用同房间（filterBy）异 owner 隔离；租约被外部持有者占用时建房失败、释放后重试成功。

**测试基建发现**：广播/快照类断言必须在发命令**前**注册 `waitForMessage`——服务端在同一 tick 内投递 cmd_result 与广播，后注册的 listener 会丢失已送达的帧（本次实测踩坑一次后修正）。

### 9.4 验证矩阵（T3 后，真实 PG + 真实 transport）

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm -r build` | tsc | ✅ 全绿 |
| `pnpm -r test` | 单测 | ✅ 87/87（server 44） |
| `pnpm smoke` | InMemory HTTP smoke | ✅ 13/13 |
| `pnpm --filter @farm-game/server test:integration` | 真实 PG（G1 9 + farm-room 9 + 租约 10） | ✅ **28/28** |

### 9.5 T4 需要接手的点

- HTTP→WS 状态同步：HTTP 写命令后按 revision 通知/轮询刷新 WS 侧快照（`farm_refresh` 已是现成入口）。
- 重连重认证：seat reservation / reconnect 路径 + 重连后重放 `farm_refresh`。
- Redis/PG 故障与优雅退出：renew 失败的排空语义、`gracefullyShutdown` 排空策略。
- 双进程矩阵（T5）：真实 OS 进程 + RedisDriver 的接管演练。

---

## 10. T4 — 跨进程同步、重连、故障容忍

> 决策已锁入 **ADR-0005**（D38–D40）。T3 的命令/鉴权/快照路径不变，本节在其上补齐"房间外的世界变了"三类感知。

### 10.1 关键决策（详见 ADR-0005）

- **D38 轮询 watcher**：WS 进程每 `REFRESH_POLL_MS`（默认 1s）对活跃房间 owner 分块查询 `players.revision`，`DB revision > room.lastProjectedRevision` 时读全量快照广播 `welcome`。房间在 pull / cmd_result / 推送三处推进 `lastProjectedRevision`，推送侧 `<=` guard 防重入；选轮询而非 LISTEN/NOTIFY / Redis pub/sub 是为了零新连接生命周期、dev 无 Redis 行为一致。
- **D39 seat 重连**：`onDrop`（非合意关闭；`CloseCode.CONSENTED=4000` 才算合意）→ `allowReconnection(client, ROOM_RECONNECT_TTL_SEC=60s)`。core 0.18.12 重连路径跳过 onAuth/onJoin 改调 `onReconnect`，`client.auth` 框架迁移（reconnection token 即能力凭证）；重连后客户端必须 `farm_refresh` 拉新快照（D35 wire 顺序问题对重连同样成立）；已消费 token 重放被拒。
- **D40 renew 容忍预算**：连续 2 次续租失败才停止服务（预算 `2 × LEASE_RENEW_MS < LEASE_TTL_MS` 进 loadConfig 强校验）；容忍期内写命令仍被 fencing 保护；失租断开时尽力做四重 guard 释放——租约仍是己方（容忍耗尽）→ 缩短接管延迟，已被接管（fencing）→ no-op。

### 10.2 改动清单

- `config.ts`：`refreshPollMs` / `roomReconnectTtlSec` / `LEASE_RENEW_FAILURES_ALLOWED=2` 导出 + 预算校验；`.env.example` 同步。
- `realtime/revision-watcher.ts`（新）：`start/stop/pollOnce`，timer unref、跳过堆积 tick、分块 IN 查询。
- `realtime/room.ts`：活跃房间注册表（acquire 成功注册 / onDispose 注销）；`projectedRevision` + `applyExternalUpdate`；`onDrop`/`onReconnect`；`handleRenewResult`（从 interval 回调抽出，测试可白盒驱动）；`loseLease` 补 guarded 释放。
- `realtime/serve.ts`：watcher 装配（boot 时 start、onShutdown 时 stop）。
- `shared/protocol/ws.ts`：`welcome` 文档更新（pull 响应 + 外部变更广播双来源，按 revision 去重）。

### 10.3 新增集成测试（`farm-room.test.ts`，累计 12 项）

- **外部变更推送**：SQL 模拟 HTTP 提交（gold+50, revision+1）→ 150ms watcher tick → 客户端收到 `welcome`（revision=1, gold=250）。
- **异常断线重连**：`leave(false)`（裸 close，非 4000）→ onDrop 建 seat → `sdk.reconnect(token)` → roomId 一致、`farm_refresh` 拿到新快照、同 token 二次重连被拒。
- **renew 容忍**：白盒 `handleRenewResult(null)` ×1 → 房间继续服务（farm_refresh 正常）；×2 → 断开 + 租约释放（`expires_at <= now()`）。
- **fencing 回归修正**：接管后租约行属新持有者，旧房间 guarded 释放为 no-op 属预期（T3 版断言此处有误，已改）。

**架构发现**：`@colyseus/core` 的 `matchMaker` 是进程级全局单例（第二个 `new Server()` 会覆盖全局 driver），且 `configureFarmRoom` 为模块级注入——单测试进程只能承载一个房间上下文，故 renew 容忍用白盒驱动而非第二 server + 真实快 tick（避免与 fencing 测试的时序假设互斥）。

### 10.4 验证矩阵（T4 后，真实 PG + 真实 transport）

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm -r build` | tsc | ✅ 全绿 |
| `pnpm -r test` | 单测 | ✅ 87/87（server 44） |
| `pnpm smoke` | InMemory HTTP smoke | ✅ 13/13 |
| `pnpm --filter @farm-game/server test:integration` | 真实 PG（G1 9 + farm-room 12 + 租约 10） | ✅ **31/31** |

### 10.5 T5 需要接手的点

- 真实 OS 进程双实例矩阵（RedisDriver）：kill -9 实例 A → B 接管 epoch 递增 → A 的客户端重连到 B；A 复活后建房被拒直到租约过期。
- 排空语义：SIGTERM 后停止接受新 join、存量命令限期排空。
- 真实 smoke 扩展：HTTP+WS 双进程对跑。

---

## 11. T5 — 双进程故障矩阵、排空、真实 smoke（G2 收口）

> 决策补充在 **ADR-0005 §6**（D41–D43）。本轮全部在真实 OS 进程 + 真实 Redis 目录上验证。

### 11.1 交付内容

- **排空（D41）**：`handleFarmCmd` 维护进程级 in-flight 计数，`onShutdown` 先 `drainActiveCommands(3000ms)` 再关 ORM——消除"停机时正提交的命令撞上已关闭连接池"的窗口。
- **跨进程路由（D42）**：`publicAddress: host:port`（不带 scheme）。实测发现 0.18 的 matchmake `create` 经 IPC 转发到目录内随机活跃进程，SDK 依响应里的 `publicAddress` 连接真实宿主；带 scheme 的值会拼出 `ws://ws://…` 并 1006 断连。
- **故障矩阵（`test/integration/failover.test.ts`，3 场景，D43 动态所有权发现）**：
  - kill -9 租约持有者 → 幸存者 TTL 后接管（**实测 epoch 1→2**）→ 新客户端落到幸存者房间，A 时代种的作物经 DB 权威保留、命令路径完整可用；
  - 被杀进程重启 → joinOrCreate 经共享 Redis 目录 + publicAddress 路由回既有房间（零接管，epoch/instance 不变），双连接广播互通；
  - SIGTERM 持有者 → exit 0 + 客户端收 `SERVER_SHUTDOWN(4001)` + 租约立即释放（不等 TTL）。
- **真实 smoke（`scripts/smoke-realtime.ts`，`pnpm smoke:realtime`）**：HTTP+WS 双真实进程对跑 9 步——预检（PG+Redis）→ 双进程起 → HTTP 登录 → WS join+farm_refresh → WS 命令 → HTTP 读取核对 → HTTP 写 → WS 拉取可见 → SIGTERM 排空停机。

### 11.2 调试记录（对本仓库后续有复用价值）

- `waitForMessage` 等 SDK Room 扩展来自 `@colyseus/testing` 的 Room.ext monkey-patch——直接 import `@colyseus/sdk` 的脚本/测试必须显式 `import '@colyseus/testing'`（本轮 smoke 与 failover 各踩一次）。
- matchmake create 的 IPC 转发 + 死进程目录残留 → `ipc_timeout: create room request timed out`，join 重试需覆盖 ~2s TTL + IPC 超时的窗口（25s deadline）。
- node --test 的子进程隔离会缓冲 stderr；子进程（serve.ts）的生命周期日志镜像到测试输出是排障关键。

### 11.3 验证矩阵（T5 后 = G2 完成态）

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm -r build` | tsc | ✅ 全绿 |
| `pnpm -r test` | 单测 | ✅ 87/87（server 44） |
| `pnpm smoke` | InMemory HTTP smoke | ✅ 13/13 |
| `pnpm --filter @farm-game/server smoke:realtime` | **双真实进程** HTTP+WS 对跑 | ✅ **9/9** |
| `pnpm --filter @farm-game/server test:integration` | 真实 PG（G1 9 + farm-room 12 + failover 3 + 租约 10） | ✅ **34/34** |

### 11.4 G2 之后

- **G3**：client-mini 接真实后端（`net/` wx.request + wx.connectSocket 自研 WS 栈、headless 改读服务端权威）。
- **G4**：deployment 文档收口、`architecture.md` 阶段状态更新、双进程生产启动脚本（systemd/pm2 各一份示例）。

### 11.5 G2 review-fix（T3–T5 code review 收口）

只读 code review 对 T3–T5 全量 diff 给出 **0 Critical** + 1 Important + 1 Minor，全部落地：

- **Important：`farm_refresh` 可崩掉整个 WS 进程**——refresh 的 DB 读无兜底 catch，`void` 包装把 rejection 丢给默认行为（进程退出），且 refresh 不计入停机排空（SIGTERM 时 in-flight 的快照读会撞上已关闭连接池）。修复：`trackInFlight` 统一包裹命令与 refresh（排空语义覆盖两类 DB 工作）；refresh 内部 try/catch → 回 `error(INTERNAL)`；onCreate 的消息注册改为 `.catch()` 记日志（任何 handler 逃逸都不会再杀进程）。
- **Minor：未认证建房可搅动租约**——matchmake create 在任何鉴权之前运行 onCreate，而 onCreate 即抢租约；知道 playerId 的客户端可反复建房制造受害者的锁出窗口。修复：onCreate 在 acquire **之前** verifyAccessToken + `sub === ownerId` 核对（ADR-0004 D33 修订）；每个后续 join 仍在 onAuth 强制验证。
- Review 同时明确验证了 fencing（无事务上下文 fail-closed + 事务内 FOR UPDATE + epoch 四重校验）、关停顺序（Colyseus 先 dispose 房间再跑 onShutdown，租约释放发生在连接池关闭前）、watcher 乱序防护、解析健壮性与无 token 落日志——均无问题。

**验证矩阵（review-fix 后）**：build ✅ / 单测 87/87 / smoke 13/13 / smoke:realtime 9/9 / 集成 **34/34**（farm-room 的 createRoom 助手补齐建房 token 以匹配新的 creation gate）。

---

## 12. G3 落地（client-mini 联网层 + Cocos 工程 + 模拟器 E2E，2026-09-12）

> commit `9ef7c24`（分支 `feat/phase2-t0-realtime-spike`，本地未 push）。由 subagent team 并行交付（前段）+ 微信开发者工具模拟器联调收口（后段）两个 session 完成。

### 交付物

- **`client-mini/src/net/`**：`HttpTransport` 注入缝（fetch / wx.request 双实现）→ `FarmHttpClient`（信封解包 + Bearer token + `serverNowOffsetMs` 时钟偏移）→ `FarmRealtimeClient`（`@colyseus/sdk 0.18.2` 的 `joinOrCreate('farm')` + `farm_refresh` 拉取 welcome + `farm_cmd` 按 `r=operationId` 匹配 `cmd_result`/`error` + plot/gold 广播回调）。关键契约：SDK 的 `onMessage` 送达完整 WsEnvelope `{v,t,r,p,ts}`，dispatch 入口统一解包一次。
- **`client-mini/src/net/wx-compat.ts`**（模拟器联调补丁，必须在 `@colyseus/sdk` import 之前求值）：① `WebSocket.prototype.send` 把 msgpack Uint8Array 视图拷贝为精确长度 ArrayBuffer（`wx.sendSocketMessage` 只收 `string|ArrayBuffer`；官方文档要求的 patch）；② `wx.connectSocket` 守卫——SDK 0.18 首选 `new WebSocket(url, {headers})`（Node 形），Cocos web-adapter 会把该 options 对象当 subprotocol 传下去导致连接永不建立，守卫同步 throw 逼 SDK 落回 browser 形（[colyseus.js#161](https://github.com/colyseus/colyseus.js/issues/161)）。
- **`client-mini/src/cocos-entry.ts`**：小游戏 fetch/Headers/Response/URL shims（全部 Map/Set `.forEach` 实现，**禁用迭代器协议**——DevTools「增强编译」会把 `[...map.entries()]` 等转译成含 undefined 洞的数组，曾以 `Cannot read properties of undefined (reading 'join')` 的形式炸掉 matchmake）+ fetch shim 同步异常堆栈诊断。
- **`client-mini/src/runtime/online.ts` OnlineGameApp**：服务端权威（本地仅存最近 PlayerSave + 时钟偏移）、乐观 patch + cmd_result 覆盖 + 失败快照回滚、revision 守卫（ADR-0003 D18）、1s/2s/4s×5 退避重连、事件名与 HeadlessGameApp 对齐（UI 唯一对接缝）。
- **Cocos 工程**：`assets/scripts/OnlineFarm.ts`（程序化 6×4 地块 UI，EventBus 驱动）+ `assets/scripts/vendor/farm-online.js`（esbuild bundle，`pnpm build:cocos`）+ 场景/资源；资产管线 `scripts/slice-assets.py` → `assets/game/`。
- **server**：`@fastify/cors`（CORS_ORIGIN；非生产默认 origin:true，生产 fail-closed false），服务 H5/浏览器调试。
- **shared**：EventBus.emit 改 Set.forEach 快照分发（同迭代器协议问题，勿回退）。
- **文档**：`docs/cocos-runbook.md`（从零到模拟器手册 + §10 联调坑与标准构建链）、deployment.md 单机运行手册、README 快速开始。

### 模拟器 E2E 验收（2026-09-12）

微信开发者工具模拟器（iPhone 12/13，基础库 3.17.2，Cocos Creator 3.8.8 CLI 构建）完整闭环：**登录 → joinOrCreate(farm) → farm_refresh welcome → 种胡萝卜（−10 金）→ 30s 成熟 → 收获（+25 金）**。`players.gold/revision` 与 `plots.status` 在每步经 psql 断言一致；多次重编译后同玩家状态保留（固定 mock code `mock_dev_cocos_simulator`）。console 基线：`[wx-compat] installed guard=true send=true` + `[OnlineFarm] 已连接服务端`，无业务红字。

### 验证矩阵（G3 完成态）

```bash
pnpm -r build    # ✅ 4 包全绿
pnpm -r test     # ✅ 单测 110/110（shared 31 + server 44 + mini 28 + app 7）
# mini 28 含 net shim 行为测试 + e2e-online.test.ts（真实双子进程 HTTP+WS，PG/Redis 不可达自动 skip）
```

### 剩余（通往 MVP）

wx transport **真机**回归（模拟器已验证的 wx-compat 需在真机网络栈复测）→ 发布链路收口（图集/包体、上线流程）→ G1.5 真实微信 jscode2session（需 AppID/AppSecret，接入点 `auth/routes.ts` mock 分支）。

---

## 13. v13 美术管线落地（大地图底图 + 分层素材 + 生成计划）——补记

> 交付于 2026-09-12，commits `0da3c8b`（素材与文档）+ `e46131f`（候选目录 gitignore 策略）。规范与缺口总计划见 [reference-video-analysis.md](./reference-video-analysis.md)，目录与命名规范见 [assets/sprites/README.md](../assets/sprites/README.md)。

### 13.1 关键产出

- **参考视频机制分析**（`docs/reference-video-analysis.md`）：竞品录屏逐段拆解 + 与 Phase 2 机制对照表 + **12 层 4 组图层模型**（屏幕组 / 对象组 / 地图组 / 视差带）+ 商店购买弹窗信息密度范式。确立"底图大于屏幕 + 镜头漫游 + UI 固定屏幕层"的大地图方向——这是此前多轮"扩图"尝试失败的根因澄清。
- **大地图底图定稿**：`assets/sprites/v13/map/farm-map-base-2x.jpeg`（1440×2560，4 候选中选 3）+ `plot-layout.json`（留空区 (100,645)–(600,1165)，24 格 = 6 列 × 4 行，每格 70.7×90 @720 设计坐标，×2 对齐资产，含每格 rect 与中心点）。
- **v13 分层素材 52 件**：plots 6（locked/grass/tilled + 湿土/成熟/选中覆盖）、crops 5 作物 × 4 阶段、icons 9、scene-modules 10、effects 5、map 2。

### 13.2 管线方法（沉淀给批次 D–H 复用）

- MiniMax `image-01` REST 直调（`subject_reference` 仅支持 `character`，无 outpaint/mask 能力——严格外扩不可行，改用"生成留白底图 + 引擎叠地块"方案）；批量请求 + 失败重试 ≤5 + 逐张落盘验证 + 评审联系表。
- JPEG 浅底 → 透明 PNG 抠图脚本（角点采样背景色 + 差分 alpha）。
- **非网格排布的生成表用连通域检测提取**：4×2 图标/环境表模型不服从网格，按格切会错位；2×2 作物表可按格切。
- 白色主体（白萝卜、星星中心）会被浅底误抠：提示词加"深色描边"+ 改中灰背景，二轮重生成解决。

### 13.3 批次状态

| 批次 | 内容 | 状态 |
|---|---|---|
| A | 大地图底图候选 + 定稿 + 24 格坐标 | ✅ |
| P | batch-assets 切图抠图归档 v13（45 件） | ✅ |
| B | 作物修复（carrot/corn/potato，两轮） | ✅ |
| C | 特效 5 组单帧（2 张二轮修复） | ✅ |
| D | 远山第二层 + 宽幅视差长条 | ✅ 品红底 + R−G 键控 + 镜像加宽 2880px；远山层经去偏色处理 |
| E | 树林带/灌木/云补充 | ✅ 树林带 1 + 灌木 4；云朵由底图天空承担，未单独出 |
| F | 水域（波光 2 帧/荷叶/小桥） | ✅ 水面 1 + 程序化微闪第二帧 / 荷叶 2 + 睡莲 / 木桥 |
| G | 道路/栅栏拼块 + 水井 | ✅ 石板直/弯/端 + 土路直 + 栅栏直/X/门；水井批次 P 已有 |
| H | UI 套件（HUD/功能列/弹窗底板） | ✅ 木圆钮 4 / 商店+萌宠入口 / 金条+点券栏 / 弹窗木牌 / 确认+关闭+圆钮 / 滑杆 |

被淘汰候选轮次（`generated/{candidates,qualified-candidates,far-view-candidates}/`）本地保留、git 排除（`e46131f`）。

---

## 14. 主页 UI 实施（v13 素材 + 模拟器优先）——U01–U18 代码与构建收口

> 2026-09-12。方案 [implementation-plan-ui-v13.md](./implementation-plan-ui-v13.md)（r2）。本轮完成 M1–M5 全部代码、素材入库、构建链与 node 侧验收；**模拟器 E2E 与视觉走查被 GUI 阻塞**（§14.4），待人工打开一次 IDE 后跑 `scripts/farm-sim-e2e.mjs` 收口。

### 14.1 已交付

- **素材管线（U01）**：`scripts/prepare-cocos-assets.py` 从 `assets/sprites/v13/` 82 件生成 `resources/game/`（缩放+PNG8 量化+JPEG 重压缩），幂等，报告 `prepare-report.json`。**1.78MB / 81 件**（预算 4.8MB 内）。旧 `slice-assets` 8 张退役。已知缺陷处理：`overlay_selected`（沙堆误图）排除；`overlay_ripe` 有少量键控残留（记录待重生）。
- **场景代码（U02–U08/U10–U14/U20–U23）**：`assets/scripts/` 新增 `farm/{layout,widgets,assets,plotView,mapLayer,hud,sideColumn,bottomBar,dialogs,toast,fx}.ts` 共 11 模块，`OnlineFarm.ts` 重写为编排根组件。720×1280 Fit-Height；24 格由 `plot-layout.json` 驱动（y 轴翻转见 layout.ts）；地块六态（wet/ripe 为整块替换图）；5 作物×4 阶段+倒计时；选种弹窗（信息密度范式）/解锁确认/Toast 队列/断线横幅/种植尘土·浇水水花·收获爆发·金币飞行四特效；命中区独立节点 85 设计 px（≈44pt）。
- **交互零协议变更（D4）**：全部经 `OnlineGameApp` 既有四命令；vendor bundle 补 `CROPS/getCrop` 导出。
- **场景层开关（U20–U22 偏差修正）**：底图自带完整造景（池塘/木桥/栅栏/农舍/道路已画），视差条/水域/摆件三层**默认关闭**（`layout.ts` SHOW_* 开关，节点已挂载），留给漫游地图里程碑启用——避免与底图重影。
- **E2E（U09/U16）**：`test/e2e-online.test.ts` 新增 unlock+玉米+浇水+失败语义子测试；`scripts/farm-sim-e2e.mjs`（模拟器自动化，待 GUI 解锁）与 `scripts/farm-sim-probe.mjs`（诊断探针）入库。

### 14.2 验证矩阵

| 命令 | 范围 | 结果 |
|---|---|---|
| `pnpm -r build` | 4 包 tsc | ✅ 全绿 |
| `pnpm -r test` | 单测+集成 | ✅ **111/111**（shared 31 + server 44 + mini 29 + app 7；e2e 真实双进程含新 unlock 场景） |
| shared build → build:cocos → Cocos CLI 构建 | 完整构建链 | ✅ 6.6s，产物 81 PNG + 1 JPG + 脚本包齐全 |
| 包体（U17） | build/wechatgame | 总 11MB：**debug 引擎 7.2MB**（release+裁剪是 G4 事项）、resources 2.3MB、main 744KB、internal 740KB；素材达预算，parallax 远程包切分暂不需要 |
| 模拟器 E2E（功能闭环 种→浇→收→解锁） | DevTools + dev bridge | ✅ **28/28**（2026-09-13，`scripts/farm-sim-bridge-e2e.mjs`） |
| 三尺寸视觉走查（U15 剩余） | DevTools GUI | ⏳ 需一次 GUI 授权（截图）或屏幕录制权限，见 §14.4 |

### 14.3 遗留缺陷（不阻塞）

- `overlay_ripe` 键控黑斑（少量，重生素材时顺带修）；套件缺提篮/公益图标（seed_bag 降级已实现）；水面第二帧为程序化微闪（开关关闭中）。

### 14.4 模拟器联调现状（2026-09-13 升级版）

**已解决的 3 个独立阻塞**（详见 [cocos-runbook.md §11](./cocos-runbook.md)）：

1. **IDE 版本回归**：原 RC 2.02.2607171 的 SummerCompiler 对小游戏必崩（`Object.keys(undefined)` 抛 `Cannot convert undefined or null to object`）。换装 **Stable 2.02.2608070**（2026-09-07，homebrew cask 当前版本，sha256 校验一致），旧 RC 备份在 `/tmp/wechatwebdevtools-rc-2.02.2607171-backup.app` 可回滚。
2. **新基础库 3.17.x subcontext 适配**：裸 `Component` / `global` / `window` 不再注入 sandbox。修了 `OnlineFarm.ts` 漏 import Component（`assets/scripts/OnlineFarm.ts:21`）+ `scripts/patch-wechat-build.mjs` 脚本化 3 项构建后补丁（project.config、game.json、game.js 注入 `GameGlobal.global` + 遥测钩子）。
3. **`game.json: networkTimeout 字段需为 object` 校验误报**：Cocos 默认产物 `downloadFile: 500000` 超出常规档位触发。已删除该字段（不承重，60s 默认足够），patch 脚本同步处理。

**仍待解决（不阻塞主页 UI 实施）**：

- **真机 G4**：需正式 AppID（已收到 `wx39a9fdbb628725fd`，但需上传审核后才能真机预览）+ 真机调试基线。
- **G1.5 真实微信登录**：需要凭据，与上述阻塞独立。

**2026-09-13 第二轮：E2E 阻塞解除 + 1 个真 bug（详见 runbook §11.4 / §11.6③ / §11.7 / §11.8）**

1. **无人值守启动解锁**：`cli auto … --trust-project`（+ 设置里"自动化接口打开工具时默认信任项目"）。此前"headless 模拟器不编译"的根因就是「信任项目」弹窗——不带该 flag 时 launch/checkVersion 全过、端口全监听，但模拟器零 console、2567 无连接。带上后自动编译 + 自动启动 + 自动连后端。
2. **真 bug：素材 spriteFrame 全缺**。80 个图片 meta 是 `texture` 类型，而加载器对每个 key 都要 `game/<key>/spriteFrame` → 第一个 key（`map/base`）就 `boot failed`，首页根本渲染不出来（此前从未在模拟器里跑过，所以没暴露）。修复：`scripts/fix-cocos-sprite-metas.mjs`（meta → sprite-frame）+ Cocos 重建；运行期 `加载贴图 53/53`，console 无错。
3. **headless E2E 用 dev bridge 收口**：automator 对小游戏只有 `Tool.*` 层可用（`App.*` 由 IDE 自己回 `timeout waiting for automator response`，§11.6③）。改为 `scripts/farm-sim-telemetry.mjs`（9877）+ 补丁脚本注入 `game.js` 的命令轮询做输入通道：`node scripts/farm-sim-bridge-e2e.mjs` = fixture 复位 → 种 → 浇 → 31s 成熟 → 收 → 解锁，每步 UI（`__farm.state()`）/ DB（psql）双断言 + console 基线。**2026-09-13 实测 28 pass / 0 fail**。
   - 注意：沙箱禁用 `Function`/`eval`（反 tamper 桩），桥只能按路径 `get`/`call`，不能跑任意表达式。
4. **仍未覆盖**：**三尺寸视觉走查（U15 剩余部分）**——截图与设备尺寸切换都属 GUI：IDE 侧 `simulator_screenshot` / `automation_game_action` 需要一次授权弹窗（`wechatide`，§11.8，本机截止发稿仍是 pending），OS 整屏 `screencapture` 被 macOS 屏幕录制权限挡住（实测黑屏）。桥可读 `cc.director`，程序化布局审计具备条件（尚未实现）。
5. **地块连片重构**（用户反馈"地块要相邻"）：24 格由散格（格心距 70.7×90，行间露草缝）改为 **6×4 无缝整块**——pitch 75×47 取自贴图可见几何（顶面 42.6 + 正面 4.5；宽度取最窄贴图 74.9），整块居中于底图留白区。命中盒同步改为格距尺寸（原 85×85 在 47 行距下会前排偷后排的点击），倒计时标签 46×18 收进格内。坐标由新增 `scripts/make-plot-layout.mjs` 生成（参数化，便于后续放大/改排布）。E2E 复跑 **28/28 通过**。

6. **M5 完成度追赶**（用户反馈"参考视频差距大"）：4 步改动 — 场景道具+远山+池塘水波全开 / 底栏 4 圆角彩色按钮 / 侧栏 4+3 按钮接 kit 图标 / 解锁弹窗"再想想"升级；详见 [cocos-runbook.md §11.10](./cocos-runbook.md)。过程中被用户提醒"自己检查下，素材都失真了"——才发现 dump 验证不等于视觉验证。截图发现 3 个隐藏 bug（24 块 lock 默认 visible / 金条字对比度低 / LoadingCover 销毁依赖 server）+ 1 个 v13 baseline 命名错误（`ui_panel_gold_bar` 实际是等级木牌不是金币木牌）。**新增经验**：debug 模拟器 sprite 加红色 AABB outline + 节点浮层 + `frame-time` 浮层，**截图不能作为视觉验收基线**——所有未来"自动收口"流程都应加 release 模拟器截图步骤。
7. **G4 4MB 限制发现**（用户提"试试上传"）：真机调试 `Error: 80051, source size 10365KB exceed max limit 4MB`。debug build 11MB、release build 7.3MB 仍超 4MB。包体构成：cocos-js 2.8M（引擎）+ resources 2.6M（美术）+ internal 0.6M + main 0.3M。**真正的卡点：引擎裁剪需要 GUI 操作**（Cocos Creator「项目设置 → 引擎管理」勾掉 audio/3d/physics/spine/tiledmap 等），CLI 不能改 `engine.json excludeModules`。d5fcbbb commit 时就标"release+裁剪是 G4 事项"——这是历史遗留，非 M5 引入。**新建** `scripts/patch-release-build.mjs`（不注入 dev bridge、不强制 enhance=false，release bundle 已 minify）—— release build 跑通，但 4MB 限制解决仍需 GUI 引擎裁剪。
