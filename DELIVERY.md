# 🎉 交付总结

> 上次更新：2026-09-11（Phase 1 monorepo 骨架）
> 本次更新：2026-09-12（**Phase 2 后端 G0→G2 全量交付：HTTP 域闭环 + PostgreSQL 持久化 + Colyseus 实时层，全部验证绿**）

## Phase 2 G0→G2 交付（2026-09-11 ~ 2026-09-12）

**状态：后端双入口（HTTP Fastify + WS Colyseus）生产形态就绪，玩法闭环与多人实时基础全部落地。分支 `feat/phase2-t0-realtime-spike`（本地 commit，未 push）。**

### 分阶段交付物

| 阶段 | commit | 内容 |
|---|---|---|
| G0 契约/安全 | `1ea87ee` + `c66d6ca` | ADR-0001；playerId/身份分离、标准 JWT、mock fail-closed、协议 426、`applyWater` 剩余时间折扣 |
| G0.5 玩法统一 | `5ae88b3` | ADR-0002；协议 v2、24 plots/6 unlocked、种植扣金/收获加金、移除 inventory |
| G1 持久化 | `31ec064` | ADR-0003；PostgreSQL 16（MikroORM）、4 表 schema、operationId 幂等收据、revision 修订号、行锁串行化、4 命令 HTTP 路由 |
| G2 T0–T2 实时基座 | `fb49188`→`d55e4c3` | 独立 WS 进程（Colyseus 0.18 + RedisDriver/Presence）、PostgreSQL 租约仲裁（事务内 fencing 实证）、迁移 advisory-lock 互斥 |
| G2 T3 FarmRoom 完整版 | `0f210c7` | ADR-0004；onAuth fast-jwt（HTTP 同策略）、单通道 `farm_cmd`（事务内 assertCurrent）、`farm_refresh` 拉取快照、多连接广播、`@colyseus/testing` 测试栈 |
| G2 T4 跨进程/容错 | `6c3a813` | ADR-0005 D38–D40；revision watcher 轮询推送、seat 重连（onDrop/onReconnect）、renew 失败容忍预算 |
| G2 T5 故障矩阵 | `c4a7fd0` | ADR-0005 D41–D43；SIGTERM 排空、publicAddress 跨进程路由、**真实 OS 进程双实例矩阵**（kill -9 接管 epoch 1→2 / 重启路由回既有房间 / 优雅停机释放租约）、`pnpm smoke:realtime` 双进程对跑 |
| G2 review-fix | `967ad12` | code review（0 Critical）：farm_refresh 错误围栏 + 排空覆盖、建房前鉴权门（防未认证租约搅动） |

### 决策记录

[ADR-0001](docs/adr/0001-g0-contract-and-security-baseline.md) · [ADR-0002](docs/adr/0002-gameplay-closure.md) · [ADR-0003](docs/adr/0003-g1-persistence-and-commands.md) · [ADR-0004](docs/adr/0004-g2-ws-protocol-and-auth.md) · [ADR-0005](docs/adr/0005-g2-realtime-ops.md)

### 验证矩阵（G2 完成态）

```bash
pnpm -r build                                  # ✅ 4 包全绿
pnpm -r test                                   # ✅ 单测 87/87（shared 31 + server 44 + mini 5 + app 7）
pnpm smoke                                     # ✅ 13/13（InMemory HTTP）
pnpm --filter @farm-game/server smoke:realtime # ✅ 9/9（HTTP+WS 双真实进程对跑）
pnpm --filter @farm-game/server test:integration  # ✅ 34/34（真实 PG：G1 9 + farm-room 12 + failover 3 + lease 10）
MAIN_DB_URL=postgres://farm:farm@127.0.0.1:5432/farm_game \
  pnpm --filter @farm-game/server demo:loop    # ✅ 30 秒真实等待闭环（需 db:up + migrate）
```

### 基础设施

`packages/server/compose.yml`：postgres 16（127.0.0.1:5432）+ redis 7（**127.0.0.1:6380**，宿主端口避让本机其他项目）。`.env.example` 含 G2 全部变量（WS_HOST/WS_PORT/REDIS_URL/LEASE_TTL_MS/LEASE_RENEW_MS/REFRESH_POLL_MS/ROOM_RECONNECT_TTL_SEC）。

### 下一步

G3（client-mini 接真实后端：`net/` wx.request + wx.connectSocket 自研 WsEnvelope 栈）→ G4（Cocos 工程联调 + 部署文档收口）→ G1.5（真实微信/Apple 验签，可与 G3 并行）。

## Phase 1 交付（2026-09-11）

**状态：monorepo 骨架就位，核心循环 Node 端可跑通，4 路由 HTTP 协议契约落实。视觉验收仍未关闭。**

新增交付物：
- pnpm workspace（4 个 packages）
- `@farm-game/shared` — 类型 / 协议 / 时间管理 / 事件总线 / 纯逻辑；**15 单测全绿**
- `@farm-game/server` — Fastify HTTP（`/auth/wechat` `/auth/oauth` `/player/info` `/crop/configs` `/farm/unlock` `/healthz`），InMemoryPlayerRepo，**7 单测 + smoke 13/13 全过**
- `@farm-game/client-mini` — Cocos 兼容桩 + 业务系统 + headless runtime；**5 单测覆盖 buy→plant→harvest→sell 循环**
- `@farm-game/client-app` — RN API client + GameStore + 类型契约；**7 单测；未引入 react/react-native**
- `@colyseus/admin` 隔离子模块（ENABLE_ADMIN=0 默认关闭；占位抛 `AdminConfigError`）
- 5 份架构文档（[architecture.md](docs/architecture.md) · [deployment.md](docs/deployment.md) · [client-protocol.md](docs/client-protocol.md) · [state-sync.md](docs/state-sync.md) · [admin-integration.md](docs/admin-integration.md)）
- 根级 smoke：`scripts/smoke-protocol.ts`，跑 4 个 HTTP 路由 + admin 边界校验

验证命令：
```bash
pnpm -r build && pnpm -r test && pnpm smoke
```

## v24 视觉复审更新（2026-09-10 — 历史记录）

已成功查看 `final-v24.png` 和 `COMPARE-v24.png`，仍有栅栏跨地块、建筑视角不统一、树林成墙、时钟遮草屋、篮旁灰矩形悬空等 12 项视觉问题。可继续制作的原型，不能作为高保真最终稿验收。

- [视觉修正实施计划](docs/visual-repair-plan-v24.md)：逐项依据、优先级、修正动作与验收条件，全部待实施。
- 本轮未触碰 design-preview / assets / v25 视觉相关文档。

## v24 工程修复交付记录（2026-09-10 — 历史记录）

（详见 git history 与 [implementation-plan-v25-subagents.md](docs/implementation-plan-v25-subagents.md)。本轮 Phase 1 提交未引入工程变更；仅新增 monorepo 骨架。）