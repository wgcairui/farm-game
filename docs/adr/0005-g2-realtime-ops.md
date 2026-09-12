# ADR-0005 — G2 实时运维：跨进程同步、重连、故障容忍

> 状态：已接受 · 2026-09-12
> 范围：`packages/server/src/config.ts`、`packages/server/src/realtime/{room,revision-watcher,serve}.ts`、`packages/server/test/integration/farm-room.test.ts`
> 起点：ADR-0004 D31–D37 已落地（onAuth / farm_cmd fencing / farm_refresh / 广播）
> 关系：扩展 ADR-0003 D18（revision 语义）与 ADR-0004 D35（farm_refresh 拉取）；本 ADR 锁定 WS 进程的跨进程状态同步、断线重连与故障容忍策略

## 1. 决策摘要

| # | 决策 | 替代方案 | 选定理由 |
|---|---|---|---|
| D38 | **跨进程变更检测用轮询 watcher**：WS 进程每 `REFRESH_POLL_MS`（默认 1000ms）对活跃房间的 owner 做一次分块 `SELECT player_id, revision FROM players` 查询；`DB revision > room.lastProjectedRevision` 时读取全量快照并向房间内所有连接广播 `welcome`。`lastProjectedRevision` 由房间在 pull/cmd_result/推送三处同步推进，推送侧再加 `<=` 防重入 guard | PG `LISTEN/NOTIFY`；Redis pub/sub | 无新连接生命周期（LISTEN 连接断开重连是新的故障面）；开发态 LocalDriver（无 Redis）行为一致；一秒一次、只查活跃农场所有者，MVP 规模开销可忽略；房间自身命令产生的变更天然被 revision 去重，不产生重复推送 |
| D39 | **断线重连用 Colyseus seat reservation**：`onDrop`（一切非合意关闭，`CloseCode.CONSENTED=4000` 才算合意）→ `allowReconnection(client, ROOM_RECONNECT_TTL_SEC)`（默认 60s）。核心 0.18.12 在重连路径**跳过 onAuth/onJoin 改调 `onReconnect`**，`client.auth` 由框架原样迁移——reconnection token 即能力凭证（只发给已通过 onAuth 的客户端）。重连后客户端必须拉取 `farm_refresh` 取新快照（D35 的 wire 顺序问题对重连同样成立）；token 重放（seat 已消费）被拒绝 | 重连强制重跑 onAuth（重新验 JWT）；不提供 seat | token 是服务端签发给该认证连接的机密，重跑 onAuth 只是重复验证同一凭证；标准 seat 机制保留租约与房间生命周期，改动面最小 |
| D40 | **renew 失败容忍预算**：连续 `LEASE_RENEW_FAILURES_ALLOWED = 2` 次续租失败才停止服务（瞬时 DB 抖动不杀房间）；期间写命令仍受 `assertCurrent` fencing 保护；预算约束 `2 × LEASE_RENEW_MS < LEASE_TTL_MS` 进 `loadConfig` 强校验（分区房间不得活过自己的租约）。失租断开时**尽力做四重 guard 释放**（owner/room/instance/epoch）：租约仍属己方（容忍耗尽）→ 缩短接管延迟；已被接管（fencing 场景）→ 释放自动 no-op | 首次失败即断开（T2 行为）；不设预算 | 单次 DB 抖动杀死全部活跃房间的代价远大于多等一个 renew 周期；fencing 保证容忍期内无越权写；TTL 预算校验杜绝"僵尸房间" |

## 2. 不在本 ADR 范围

- 真实 OS 进程间的双实例接管演练、RedisDriver 故障矩阵（T5）
- HTTP 入口写命令的主动反向通知（HTTP 进程不感知 WS 进程拓扑；轮询是单向的 WS→DB）
- 排空（drain）语义：接受新连接 but 拒绝新命令的过渡态（T5 按需引入）

## 3. 影响面

- `config.ts`：`refreshPollMs`（≥50）、`roomReconnectTtlSec`（(0, 3600]）、`LEASE_RENEW_FAILURES_ALLOWED = 2` 导出 + 预算校验
- `realtime/revision-watcher.ts`（新）：`RoomRevisionWatcher`（`start/stop/pollOnce`；进程级单实例，timer `unref`，跳过堆积 tick）
- `realtime/room.ts`：活跃房间注册表（`activeFarmRooms()`，acquire 成功注册 / onDispose 注销）；`projectedRevision` 跟踪 + `applyExternalUpdate`；`onDrop` → `allowReconnection`；`onReconnect`（日志占位）；`handleRenewResult`（从 interval 回调抽出，可白盒驱动）；`loseLease` 补 guarded 释放
- `realtime/serve.ts`：watcher 装配（`start` 于 boot、`stop` 于 onShutdown）
- `shared/protocol/ws.ts`：`welcome` 文档更新（pull 响应 + 外部变更广播两种来源，客户端按 revision 去重）
- `.env.example`：`REFRESH_POLL_MS` / `ROOM_RECONNECT_TTL_SEC`
- 测试：`farm-room.test.ts` 套件配置满足预算校验（30s/90s）；fencing 断言修正（接管后租约行属新持有者，旧房间释放为 no-op 属预期）

## 4. 验收

- 外部写入（SQL 模拟 HTTP 提交）≤ pollMs + 一次快照读内以 `welcome` 推达在线客户端，revision/gold 正确
- `leave(false)`（异常关闭）→ seat → `sdk.reconnect(token)` 成功且 `auth` 保留、`farm_refresh` 可用、token 不可重放
- `handleRenewResult(null)` ×1 → 房间继续服务；×2 → 断开 + 租约释放（`expires_at <= now()`）
- fencing 场景回归：零写入 + LEASE_LOST + 断开不变；接管后旧房间不触碰新持有者的租约行

## 5. 实施状态

- 已实现（T4，commit 待记）：上列全部；集成 31/31（G1 9 + farm-room 12 + 租约 10），单测 87/87，smoke 13/13
- 遗留到 T5：真实 OS 进程 + RedisDriver 双实例矩阵、drain 语义、真实 smoke 扩展
