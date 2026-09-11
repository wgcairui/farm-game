# ADR-0003 — G1 持久化与原子命令（HTTP 域闭环）

> 状态：提议 · 2026-09-11
> 范围：`packages/shared/src/**`、`packages/server/src/**`、新增 `docs/adr/0003-g1-persistence-and-commands.md`
> 起点：ADR-0002 D9–D16 已落地（24 plots / 6 unlocked / `ripe` 状态 / 种植扣金币 / 收获加金币 / 协议 v2）；ADR-0001 §3–§6 JWT、身份分离、mock fail-closed、协议 426 保留
> 关系：扩展 ADR-0001 §D6 与 ADR-0002 §1；本 ADR 锁定 HTTP 持久化层的契约与实现约定；WS（Colyseus）留到 G2

## 1. 决策摘要

| # | 决策 | 替代方案 | 选定理由 |
|---|---|---|---|
| D17 | **新写操作命令统一携带 `operationId`**（客户端生成的请求级 UUIDv4，长度 ≤ 64），服务端按 `(playerId, operationId)` 唯一约束做幂等 | 仅按请求体哈希去重；无幂等键 | 玩家可以同时打开多个标签页或多次重试；按内容哈希会把合法重复浇水判定为重复；按操作 ID 才能保留同玩家多次合法操作 |
| D18 | **新增服务端权威状态修订号 `revision`**：每次成功修改金币或地块状态的命令在同一事务内 `revision++`，与资产写入、收据写入原子提交；查询响应携带当前 `revision` | 不需要修订号；用 `updatedAt` 代替 | `updatedAt` 受并发与时钟漂移影响，不能可靠区分并发更新；`revision` 单调递增，给后续客户端拒绝旧快照（`G3`）预留依据 |
| D19 | **`revision` 与 `PlayerSave.version` 解耦**：存档结构版本仍是 `2`（ADR-0002 D12 锁定的公开信封）；`revision` 仅作服务端状态修订号 | 把 `version` 改为修订号 | 两类版本语义不同：公开契约仍按 major/minor 维护；服务实现层需要的是强一致的内部修订号 |
| D20 | **响应统一附加 `serverNow`**：登录响应与所有命令响应携带服务端读到的 `now`，客户端用于校时 | 客户端只信任本地时钟 | 服务端是唯一时间权威；客户端时钟可漂移；不暴露后端 UTC 偏移，只暴露 epoch ms |
| D21 | **服务端时钟由命令注入**：所有命令在事务中读取 `now = Date.now()`；不向客户端公开“快进时间”调试接口；测试通过内部时间抽象注入 | 客户端传 `clientNow` 推进 | 接收客户端时间等于让客户端决定何时作物成熟，破坏 `applyWater` 剩余时间折扣语义 |
| D22 | **服务端 `/auth/_meta` 增加 `serverNow`**，便于客户端首次登录前校时 | 新增独立 `/time` 接口 | `_meta` 已是登录握手弱耦合点，复用现有路径 |
| D23 | **服务端缓存不命中 → 状态查询也走 DB**，返回前重算 `status` 为 `ripe` 当 `matureAt <= now`，避免依赖后台计时器轮询 | 起 `setInterval` 推进状态 | 客户端读到的永远是当前应当看到的状态；服务端不需要常驻定时器；这是 Phase 1 `headless` 路径依赖的同款事实 |
| D24 | **新地块解锁价格走共享配置 `UNLOCK_PRICE_GOLD = 100`**（G1 dev 默认；非最终经济平衡）；初始 200 金币保留 | 数据库价格表；阶梯价格 | 本轮目标是“后端可演示”，不是经济平衡；集中常量可后续替换为配置表，不影响调用点 |
| D25 | **每个写命令独立 EntityManager 上下文**：服务层 `transaction(em => …)` 闭包，不在 Fastify 路由中保存跨请求的 EM；同一玩家并发操作靠 DB `SELECT … FOR UPDATE` 行锁串行化 | 共享 EM + 应用层互斥 | `docs/implementation-plan-phase2.md:89` 明文要求；行锁由 PG 强制，进程重启或水平扩展后仍然成立 |
| D26 | **`/farm/unlock` 改为扣费并设置 `status: 'empty'`**；保持与 ADR-0002 D14 兼容：`unlocked: true` 与 `status: 'empty'` 必须同步 | 仅设 `unlocked: true` | ADR-0002 D14 明确客户端可同时读 `status` 与 `unlocked`，因此两者必须一致，避免出现 `unlocked=true, status='locked'` 的非法状态 |
| D27 | **`/farm/plant` 与 `/farm/harvest` 新增**；客户端与 smoke-protocol 必须保持一致；HTTP 协议 union `HttpRoute` 同步扩展 | 仅扩展 unlock | G1 出口证据要求“真实 PG 上种植/浇水/收获闭环通过” |
| D28 | **`/farm/water` 新增**；复用共享 `applyWater()`；业务校验在事务内由 service 完成，不依赖客户端预校验 | 由客户端过滤非法浇水 | 客户端校验只是体验优化；服务端必须独立做校验，否则换客户端即可绕过 |
| D29 | **服务端不在 v2.0.0 中提供 `/farm/sell` / `/inventory` 端点**；`InventorySystem`/`ShopSystem` 在 client-mini 仍是 stub；G3 不再做这两个端点 | 恢复 inventory 字段 | ADR-0002 D12 已移除 `inventory`；恢复会破坏公开协议；G1 不引入新公开端点 |
| D30 | **WAL 测试 / 集成测试必须用真实 PostgreSQL**；不允许用 `InMemoryPlayerRepo` 跑数据库集成测试；`docker compose up postgres` 通过后 `pg_isready` 验证 | 引入测试 sqlite + 抽象 | plan §3 G1 出口证据强制要求“数据库集成测试不得以 mock 冒充” |

## 2. 不在本 ADR 范围

- Colyseus 实时房间（G2）
- 真实微信 `jscode2session` 与 Apple/Google `id_token` 验签（G1.5）
- 好友、偷菜、排行榜、支付、任务
- 自动离线操作回放
- admin 面板
- Redis（plan 已说明 G2 才引入）

## 3. 影响面

- `docs/adr/0003-g1-persistence-and-commands.md` — 本文件
- `packages/shared/src/protocol/http.ts` — `HttpRoute` union 新增 `FarmPlantRoute / FarmWaterRoute / FarmHarvestRoute`，并扩展 `FarmUnlockRoute` 的响应携带 `serverNow / revision`
- `packages/shared/src/protocol/commands.ts` — 新增；定义四个写命令的请求/响应 DTO 与错误码映射（**新文件**）
- `packages/shared/src/protocol/auth.ts` — `LoginResponse` 增加 `serverNow`
- `packages/shared/src/types/operation.ts` — 新增；`OperationReceipt` 类型（**新文件**）
- `packages/shared/src/index.ts` — 导出新类型
- `packages/shared/src/protocol/version.ts` — 不升 major；D17–D29 全部兼容 v2.0.0 公开契约
- `packages/shared/test/commands.test.ts` — 新增；纯函数校验（**新文件**）
- `packages/server/src/auth/repo.ts` — `PlayerRepo` 接口保持；`InMemoryPlayerRepo` 保留为测试用
- `packages/server/src/repositories/MikroORMPlayerRepo.ts` — 新增（**新文件**）
- `packages/server/src/repositories/transaction.ts` — 新增；事务执行器抽象（**新文件**）
- `packages/server/src/services/farm/{plant,water,harvest,unlock}.ts` — 新增（**新目录**）
- `packages/server/src/farm/routes.ts` — 重写为委托到 service
- `packages/server/src/db/entities/{Player,AuthIdentity,Plot,OperationReceipt}.ts` — 新增（**新目录**）
- `packages/server/src/db/migrations/` — 新增初始迁移
- `packages/server/src/db/mikro-orm.config.ts` — 注册实体
- `packages/server/src/config.ts` — `mainDbUrl` 必填校验（生产 fail-closed 扩展）
- `packages/server/src/app.ts` — 接受 `repo: PlayerRepo`；关闭时释放 ORM
- `packages/server/src/index.ts` — 数据库初始化与优雅关闭
- `packages/server/compose.yml` — 新增（仅 PG，Redis 不引入）
- `packages/server/.env.example` — 新增
- `packages/server/package.json` — 新增 `db:up / db:down / db:migrate / db:reset / db:lint` 命令
- `packages/client-app/src/net/api.ts` — 新增 `plantPlot / waterPlot / harvestPlot`，扩展 `unlockPlot` 携带 `operationId`
- `packages/client-app/src/store/GameStore.ts` — 新增 `applyServerRevision`
- `packages/client-app/test/api.test.ts` — 验证新方法与 `operationId` 注入
- `scripts/smoke-protocol.ts` — 增加 plant/water/harvest 三步；断言 `revision / serverNow`
- `scripts/demo-server.ts` — 新增；启动 PG 模式的服务
- `scripts/demo-loop.ts` — 新增；端到端登录→解锁→种植→浇水→收获→重试→重启验证

## 4. 验收

- `pnpm -r build` 全绿
- `pnpm -r test` 全绿；新增 shared 单测 ≥ 5 项、新增 server 单测 ≥ 5 项、现有断言保持
- `pnpm smoke` 通过；smoke-protocol 扩展为包含 plant/water/harvest 与 revision/serverNow 断言
- 真实 PostgreSQL（`docker compose up -d postgres`）上迁移通过
- 数据库集成测试覆盖：成功路径、业务失败、重复幂等（同 operationId / 同 ID 不同参数）、并发收获、重启恢复、双 API 实例竞争、行锁下超时
- HTTP demo 脚本可在干净环境从 PG 容器启动到完整闭环
- 冻结视觉资源（design-preview/、assets/、scripts/core/、scripts/systems/、scripts/ui/）未改动
- 配置文件与 `git diff` 中没有真实凭据

## 5. 实施状态

| 提交 | 范围 |
|---|---|
| （待）Phase 2 G1 | D17–D30 落地：PostgreSQL 实体、迁移、仓储、原子命令服务、真实 PG 集成测试、HTTP demo |