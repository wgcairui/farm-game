# ADR-0004 — G2 WS 协议与鉴权（真实 FarmRoom）

> 状态：已接受 · 2026-09-12
> 范围：`packages/shared/src/protocol/ws.ts`、`packages/server/src/auth/verify.ts`、`packages/server/src/realtime/**`、`packages/server/src/services/farm/execute.ts`、`packages/server/test/integration/farm-room.test.ts`
> 起点：ADR-0003 D17–D30 已落地（operationId 幂等 / revision / serverNow / 真实 PG）；T2 租约仲裁已实证（事务内 `assertCurrent` FOR UPDATE + epoch）
> 关系：扩展 ADR-0001 §3（JWT 声明）与 ADR-0002 §1（协议 v2）；本 ADR 锁定 G2 WS 层的消息形态、鉴权契约与 fencing 注入方式

## 1. 决策摘要

| # | 决策 | 替代方案 | 选定理由 |
|---|---|---|---|
| D31 | **房间不使用 Colyseus Schema state 同步**；PostgreSQL 是唯一权威，一切状态以消息投影（`welcome` / `cmd_result` / `plot_updated` / `gold_updated`）传输；C→S 写命令走单通道 `farm_cmd`，payload 按 `command` 判别（unlock/plant/water/harvest），复用 HTTP 的 body 形状与 services | Schema state 自动增量同步；每命令一个消息类型 | Schema state 会引入第二状态源，与 DB 权威模型冲突；单通道与 `POST /farm/:cmd` 同构，服务端一张路由表，四命令复用现有自校验服务 |
| D32 | **WS envelope 复用 `PROTOCOL_VERSION '2.0.0'`**（HTTP 契约与 envelope 结构未动，WS 消息集合原地重定义）；服务器校验 C→S `v` 的 major，不符回 ephemeral `error(PROTOCOL_VERSION_MISMATCH)`。结构垃圾（坏 envelope / 未知命令 / 非法 operationId / body 非对象）一律 ephemeral 不落 receipt——镜像 HTTP JSON-schema 400 不落收据的语义；业务失败仍由 services 落 receipt | WS 独立版本号；结构错误也落 receipt | WS 尚无线上客户端，无兼容包袱；JSON-schema 校验前置于 handler 的 HTTP 语义是既定事实 |
| D33 | **`onAuth` 用 `fast-jwt` 直接验签**（与 `@fastify/jwt` 同底座，同 secret、同 `allowedIss`/`allowedAud`、默认 `exp` 强制），`options.ownerId === token.sub` 强一致，跨农场加入拒绝；verified playerId 经 `client.auth` 传递；`fast-jwt` 提为 server 直接依赖 | 在 WS 进程里起 Fastify；用 `@colyseus/auth` 的 JWT 工具 | 与 HTTP 逐声明等价且无框架耦合；onAuth 每连接只跑一次，per-call 建 verifier 无需缓存 |
| D34 | **fencing 注入点 = `executeCommand` 的 `run` 回调**：WS 侧在回调内先 `await assertCurrent(em, lease)` 再调 service，fence 与命令写提交同事务同连接。`LeaseLostError` → 整个事务回滚（**命令与收据都不落库**）→ 房间 `disconnect()` 停止服务 → 客户端可用原 `operationId` 重试（新错误码 `LEASE_LOST: 4300`，ephemeral） | 修改 `executeCommand` 加 fencing 参数；fence 在事务外预检 | `run` 回调本就在命令事务内，零改动注入；事务外预检有 TOCTOU 窗口；回滚语义与 ADR-0003"瞬态错误不落收据、可安全重试"完全一致 |
| D35 | **快照投递以 `farm_refresh`（C→S 拉取）为可靠路径**；`onJoin` 的 `welcome` 推送保留，仅服务于能缓冲 pre-join 帧的 G3 自研客户端。依据：core 0.18.12 在 `_onJoin` 中先 `await onJoin()` 再发 `JOIN_ROOM`（Room.mjs:1122→1145），SDK 客户端收到推送时必然尚未注册 handler，推送必丢 | 仅 join 推送；移除推送只留拉取 | 实测确认的 wire 顺序问题；拉取同时是 T4 重连恢复的现成入口 |
| D36 | **广播语义**：命令成功 → 请求者收 `cmd_result`（`envelope.r` 回声 operationId，含全量 `player` + `payload`，与 HTTP `ApiResponse<CommandResponse>` 同构，由共享 `toCommandResponse` 投影）；全体连接广播 `plot_updated` + `gold_updated`；失败仅回请求者 `error`（带 `r` 回声），不广播 | 每命令广播全量 PlayerSave；失败也广播 | 粒度事件保持 Phase 1 ws.ts 既定形状；全量广播浪费且使客户端合并逻辑复杂化 |
| D37 | **测试栈 = `@colyseus/testing@0.18.5` + `@colyseus/sdk@0.18.2`**（devDependencies）；`serve.ts` 抽出 `buildWsServer(config)`（构造不 listen），测试自选临时端口后 `new ColyseusTestServer(server)`。修正 T1 结论："官方客户端 SDK 只到 0.16"仅适用于旧包名 `colyseus.js`；`@colyseus/sdk` 0.18.x 存在。**生产客户端结论不变**：小程序运行时/包体约束下 G3 仍用 `wx.connectSocket` 自研 WS 栈 | 手写二进制协议测试客户端；`colyseus.js@0.16` | 官方测试栈走真实 transport（onAuth/matchmaking 真跑），维护成本最低；`boot()` 对已构造 Server 忽略端口参数（恒 2568），故自行 listen |

## 2. 不在本 ADR 范围

- HTTP→WS 状态同步调度、重连重认证、Redis/PG 故障与优雅停机（T4）
- 真实 OS 进程间的双实例故障矩阵（T5）
- steal / 好友访问农场（社交阶段；`crop_stolen` 消息类型保留为 reserved）
- G3 客户端绑定（`client-mini` 的 WS 栈）

## 3. 影响面

- `packages/shared/src/protocol/ws.ts`：G2 消息集合（`ClientFarmCmd` / `ClientFarmRefresh` / `ServerWelcome` / `ServerCmdResult` / `ServerPlotUpdated` / `ServerGoldUpdated` / `ServerError`；删除 Phase 1 的 `hello` 与 `steal` C→S 形状，无任何 client 引用）
- `packages/shared/src/protocol/error.ts`：新增 `LEASE_LOST: 4300`
- `packages/server/src/auth/verify.ts`（新）：`verifyAccessToken` + `WsAuthError`（expired→1102、签名/claim 类→1101、key/config 类→4000）
- `packages/server/src/realtime/room.ts`：完整版 FarmRoom（onAuth / farm_refresh / farm_cmd / fencing / 广播；房间级 `onMessage` 一次注册）
- `packages/server/src/realtime/ws-messages.ts`（新）：`parseFarmCmd` / `parseFarmRefresh` / `serverEnvelope` 纯函数
- `packages/server/src/realtime/serve.ts`：抽 `buildWsServer`；`configureFarmRoom` 扩展为六件套（leases/config/instanceId/repo/tx/orm）
- `packages/server/src/services/farm/execute.ts`：新增共享投影 `toCommandResponse`（HTTP routes 与 WS 共用）
- `packages/server/package.json`：`fast-jwt` 进 dependencies；`@colyseus/testing` + `@colyseus/sdk` + `@colyseus/tools` 进 devDependencies；移除已无引用的 `colyseus.js@0.16.22`
- `packages/server/compose.yml` + `.env.example`：redis 宿主端口改 6380（6379 与本机其他项目/端口转发常驻冲突）

## 4. 验收

- 集成测试（真实 PG + 真实 transport）覆盖：welcome 全量投影、WS 命令落 DB、多连接广播、operationId 幂等、坏 token / owner 不匹配拒绝、接管后旧房间拒写且零写入、matchmaking filterBy 复用与隔离、租约冲突建房失败可重试
- 结构校验为纯函数单测（`ws-messages.test.ts`）；JWT 验签映射为单测（`auth-verify.test.ts`）
- `pnpm -r build` / `pnpm -r test` / `pnpm smoke` / `test:integration` 全绿

## 5. 实施状态

- 已实现（T3，commit 待记）：上列全部；集成测试 28/28（G1 9 + farm-room 9 + lease 10）
- 遗留到 T4：HTTP→WS 批量刷新、重连重认证、Redis/PG 故障处理；遗留到 T5：双进程矩阵
