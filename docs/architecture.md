# 架构总览（Architecture Overview）

> 版本：v3 · 2026-09-11
> 状态：Phase 2 G0→G3 已落地（HTTP/WS 后端闭环 + PostgreSQL 持久化 + 小游戏联网层 + 微信开发者工具模拟器 E2E 通过；单测 110/110；最新提交 `9ef7c24`）
> 配套文档：[deployment.md](./deployment.md) · [client-protocol.md](./client-protocol.md) · [state-sync.md](./state-sync.md) · [admin-integration.md](./admin-integration.md) · [ADR-0001](./adr/0001-g0-contract-and-security-baseline.md) · [实施计划](./implementation-plan-phase2.md)

## 1. 系统定位

《类 QQ 农场》是一款 2D 等距视角农场模拟经营游戏。本仓库是从产品 PRD（v1.2）落地为可执行的 monorepo 工程，**未来全局后端**作为唯一服务方，支持以下客户端形态：

| 客户端形态 | 目标平台 | 渲染栈 | 网络层 | 登录方式 |
|---|---|---|---|---|
| **微信小游戏** | 微信内 | Cocos Creator 3.8 + TypeScript | wx.request + Colyseus WS | `wx.login` |
| **iOS / Android App** | App Store / Google Play / 国内安卓 | React Native + TypeScript | fetch + Colyseus WS | Sign in with Apple / Google |
| H5（预留） | 浏览器 | Cocos Creator 3.8 H5 内核 | fetch + Colyseus WS | 匿名 + 升级合并 |

同一份 `@farm-game/shared` 协议契约被三类客户端与 Fastify/Colyseus 服务端共同消费；两端各用自身习惯的存储实现（`localStorage` / `AsyncStorage`）。

## 2. 节点拓扑

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              客户端 (Client)                             │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│  │  微信小游戏 (Coc)   │  │   iOS / Android    │  │     H5 (预留)      │  │
│  │  packages/client-  │  │  packages/client-  │  │   Cocos H5 内核    │  │
│  │  mini              │  │  app               │  │                    │  │
│  └──────────┬─────────┘  └──────────┬─────────┘  └──────────┬─────────┘  │
└─────────────┼──────────────────────┼──────────────────────┼────────────┘
              │ HTTPS (REST)         │ HTTPS (REST)         │
              ▼                      ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              边缘 (Edge)                                  │
│   ┌───────────────────────────────────────────────────────────────────┐  │
│   │   Nginx 负载均衡                                                   │  │
│   │   - TLS termination                                                │  │
│   │   - /admin/* 限制内网访问                                          │  │
│   │   - WebSocket 升级透传                                             │  │
│   └──────┬─────────────────────────────────────┬─────────────────────┘  │
└──────────┼─────────────────────────────────────┼─────────────────────────┘
           │ HTTP                                │ WS (Colyseus)
           ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              网关 (Gateway)                              │
│   ┌────────────────────────┐         ┌────────────────────────┐         │
│   │  api-1 (Fastify HTTP)  │   ...   │  ws-1 (Colyseus WS)    │  ...    │
│   │  /auth, /player,       │         │  FarmRoom (Phase 2)    │         │
│   │  /crop, /farm,         │         │                        │         │
│   │  /admin-ops/* (v2)     │         │  (admin ops 共用         │         │
│   │  /healthz              │         │   matchMaker.* API)    │         │
│   │  PM2 fork 模式         │         │                        │         │
│   │  instances = cpus      │         │                        │         │
│   └──────────┬─────────────┘         └──────────┬─────────────┘         │
└──────────────┼──────────────────────────────────┼───────────────────────┘
               │ MikroORM (public schema)          │ MikroORM (无 schema 差异)
               ▼                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              数据 (Data)                                 │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐  │
│   │  postgres-farm-game     │                            │     redis       │  │
│   │  (单 DB, MikroORM 管理) │                            │  (Presence,     │  │
│   │  schema: public         │                            │   Driver, 缓存) │  │
│   │   players / plots /     │                            │                 │  │
│   │   auth_identities /     │                            │                 │  │
│   │   operation_receipts /  │                            │                 │  │
│   │   farm_room_leases      │                            │                 │  │
│   │  schema: admin (v2)     │                            │                 │  │
│   │   admin_users /         │                            │                 │  │
│   │   admin_audit_log       │                            │                 │  │
│   └─────────────────────────┘                            └─────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                ┌────────────────────────────────────────────┐
                │                观测 (Obs)                │
                │   - pino 日志   - Prometheus 指标         │
                │   - 告警       - @colyseus/loadtest       │
                └────────────────────────────────────────────┘
```

## 3. 客户端矩阵

详见 [client-protocol.md](./client-protocol.md)。摘要：

| 维度 | 微信小游戏 | iOS / Android App |
|---|---|---|
| 渲染 | Cocos 3.8 (TypeScript) | React Native (TypeScript) |
| 持久化 | `localStorage`（H5 内核下）；小游戏专用 `wx.setStorageSync`（Phase 2） | `AsyncStorage` |
| 登录 | `wx.login() → code → POST /auth/wechat` | `Sign in with Apple` / Google → `POST /auth/oauth` |
| 支付 | 微信支付（Phase 2） | iOS IAP / Google Play Billing（Phase 2） |
| 推送 | 微信订阅消息 | APNs / FCM |
| WS 客户端 | 走 `wx.connectSocket` 适配层 | RN 默认 WebSocket |
| 关键约束 | 主包 ≤ 4 MB；无 wx API 触发功能不可用 | App 体积不限，但首屏渲染同样受 RN 包大小影响 |

## 4. 后端服务矩阵

| 服务 | 角色 | 协议 | 端口 | 伸缩单位 | 关键依赖 |
|---|---|---|---|---|---|
| api (Fastify HTTP) | 业务 REST | HTTPS/JSON | 3000 | 进程（PM2 fork） | MikroORM main DB |
| ws (Colyseus WS) | 实时房间 | WSS | 2567 | 进程 | Redis Presence, RedisDriver |
| admin (v2) | 后台面板 | HTTPS/JSON + 独立 Refine 前端 | 与 api 同进程 `/admin-ops/*`;前端静态资源 Nginx 内网 | 进程 | MikroORM（admin schema，同 DB）|
| crop-config (HTTP) | 作物配置 | HTTPS/JSON | 同 api | 同 api | 无（共享常量） |
| auth (HTTP) | 登录/JWT | HTTPS/JSON | 同 api | 同 api | wx/oAuth 第三方 |
| friend (WS+HTTP) | 好友/偷菜（Phase 2） | WSS+HTTPS | 同 ws/api | 同上 | ws 房间, redis cache |
| pay-webhook (HTTP) | 支付回调（Phase 2） | HTTPS/JSON | 同 api | 同 api | 签名校验 |

Fastify HTTP 与 Colyseus WS 永远独立进程（uWebSockets.js 不可与 Fastify 共享端口），便于独立扩容。

## 5. 数据分区

**单 PostgreSQL database + 一块 Redis**（admin 路径 v2：Refine + Fastify + MikroORM admin schema，详见 [admin-integration.md](./admin-integration.md)）：

- **postgres-farm-game** — MikroORM 管理，承载全部表：
  - **schema `public`**（业务）：`players` / `farm_plots` / `steal_records` / `crop_configs` / `friend_*` / `auth_identities` / `operation_receipts` / `farm_room_leases`；连接池 `min:2 max:15`
  - **schema `admin`**（v2 后台）：`admin_users` / /admin_audit_log（可选 `admin_sessions`）；共用同一 MikroORM 连接的 EM（不单独配连接池）
- **redis** — Presence（房间成员）、Driver（房间元数据）、缓存（排行榜/限流）

**严禁跨库 FK**（v1 时代的多 DB 时代规则已废；现在只有一个 DB，谈不上跨库）。admin 引用业务 `player_id` 用字符串字段，DB 层无外键。详见 [admin-integration.md §3](./admin-integration.md)。

## 6. 客户端 → 服务端会话生命周期

```
[Client]                            [api]                  [ws / Colyseus]
  │  POST /auth/wechat (code)        │                       │
  ├────────────────────────────────►│                       │
  │  JWT + PlayerSave                │                       │
  │◄────────────────────────────────┤                       │
  │                                                            │
  │  WS connect (Bearer JWT, x-platform)                        │
  ├───────────────────────────────────────────────────────────►│
  │  hello {openid, token}                                       │
  │  welcome {serverNow, roomId}                                 │
  │  plot_updated {plot}      ◄───  时钟/事件                    │
  │  gold_updated {gold}                                          │
  │  error {code, message}                                        │
  │                                                            │
  │  POST /farm/unlock (bearer)            │                       │
  ├──────────────────────────────────────►│                       │
  │  {plot}                                  │                       │
  │◄──────────────────────────────────────┤                       │
```

## 7. 扩展路径

| 阶段 | 节点规模 | 关键变化 |
|---|---|---|
| **Phase 1（当前）** | 1 台开发机 | HTTP 与 WS 同机不同进程；Postgres/Redis 走 docker-compose；admin 关闭 |
| **Phase 2** | 4 节点（api-1 + api-2 + ws-1 + ws-2） | 启用 Redis Presence/Driver；admin 进程可挂；MikroORM 实体 + 迁移实装 |
| **Phase 3** | 7 节点（api×2 + ws×2 + admin×1 + postgres×1 + redis×1） | 启用 admin 面板；admin rate limiter 切 Redis |
| **Phase 4+** | 多区多活 | 增加 `region` 路由；Postgres 主从 + Redis Cluster；admin 多区部署 |
| **Phase 5+** | 完全跨云 | Cloudflare / 多云 LB；客户端连接最近 region |

## 8. 安全边界

- **JWT**：HS256，业务 secret 与 admin secret 分开；TTL 7 天（`JWT_TTL_SEC`）；`iss=farm-game`、`aud=client`；标准 `sub`/`iat`/`exp` 由 `@fastify/jwt` 校验
- **协议版本**：`x-protocol-version` header major 不匹配 → HTTP 426 `PROTOCOL_VERSION_MISMATCH`
- **WS**：握手携带 JWT，连接即校验 `sub`（playerId） 与 platform
- **Admin（v2）**：`/admin-ops/*` 路由 + Refine 前端独立部署；Nginx `allow 10.0.0.0/8; deny all;` 限制内网访问；admin JWT 用 `jwtSecretAdmin`（与业务 secret 物理分离，见 [`config.ts`](../../packages/server/src/config.ts)）
- **支付回调**：HMAC 签名 + nonce 防重放；详见 [deployment.md §4](./deployment.md)
- **数据隔离**：单 DB + 单 ORM，admin 用 `admin` schema；ESLint `no-restricted-imports` 挡 `drizzle-orm` / `@colyseus/database` / `@colyseus/admin` 在业务代码（admin 代码本身允许 MikroORM，因为 admin 也用同一 ORM）
- **生产启动 fail-closed**：默认 secret 在 production 启动时抛 `ConfigError`；`ENABLE_MOCK_AUTH=1` 在 production 启动时抛 `ConfigError`
- **Mock 隔离**：mock login 仅在 `NODE_ENV ∈ {development, test}` + 显式 `ENABLE_MOCK_AUTH=1` 时启用

## 9. 当前 Phase 2 G0–G2 已落地 vs 计划中

> 2026-09-12 更新。逐阶段细节见 [progress-phase2.md](./progress-phase2.md)，决策见 [ADR-0001–0005](./adr/)。

| 能力 | 状态 |
|---|---|
| pnpm monorepo（shared / server / client-mini / client-app） | ✅ |
| `@farm-game/shared` 协议契约（HTTP/WS/Auth/ErrorCode/协议 v2） | ✅ 31 单测 |
| Fastify HTTP（auth / player / crop / farm/{unlock,plant,water,harvest}，JSON Schema 全类型化） | ✅ 44 server 单测 + 13 smoke |
| **PostgreSQL 16 持久化**（MikroORM；players / auth_identities / plots / operation_receipts；PESSIMISTIC_WRITE 行锁） | ✅ G1（ADR-0003） |
| **operationId 幂等 + revision 修订号 + serverNow 时间权威**（收据表 UNIQUE 原子判定，跨 HTTP/WS 共用） | ✅ G1（ADR-0003） |
| **玩法闭环**（24 plots / 6 unlocked / 种植扣金 / 浇水折扣 / 收获加金 / ripe 状态） | ✅ G0.5 + G1（ADR-0002） |
| 标准 JWT `sub`/`iat`/`exp` + `iss`/`aud`；production fail-closed | ✅ G0 |
| **Colyseus WS 实时层（G2 完整落地）**：独立 WS 进程、FarmRoom（onAuth fast-jwt 与 HTTP 同策略 + owner 强一致）、单通道 `farm_cmd` 四命令（事务内 assertCurrent fencing）、`farm_refresh` 拉取快照、多连接广播、revision watcher 跨进程推送、seat 重连、renew 失败容忍、SIGTERM 排空、跨进程故障矩阵实测（kill -9 接管 epoch 递增 / 重启路由回既有房间 / 优雅停机释放租约） | ✅ G2 T0–T5（ADR-0004/0005） |
| **租约仲裁**：PostgreSQL `farm_room_leases` 是农场所有权唯一权威（epoch fencing）；Redis 仅做 matchmaker 目录 + presence | ✅ G2 |
| 双进程真实 smoke（HTTP + WS 子进程对跑） | ✅ `pnpm smoke:realtime` 9/9 |
| 集成测试（真实 PG：G1 9 + farm-room 12 + failover 3 + lease 10） | ✅ 34/34 |
| 单测总计（shared 31 + server 44 + client-mini 28 + client-app 7） | ✅ 110/110 |
| **client-mini 联网层（G3）**：FarmHttpClient（wx.request/fetch 双 transport）+ FarmRealtimeClient（**@colyseus/sdk 0.18.2** + wx-compat 适配层）+ OnlineGameApp（服务端权威 + 乐观回滚 + revision 守卫 + 退避重连） | ✅ G3（commit `9ef7c24`） |
| **微信开发者工具模拟器 E2E**：登录 → join → 种植（−10 金）→ 30s 成熟 → 收获（+25 金），DB 断言全程一致，重编译状态保留 | ✅ G3（2026-09-12，见 runbook §10） |
| `Admin` 路径 v2 锁定（Refine standalone + Fastify `/admin-ops/*` + MikroORM `admin` schema，**不再**引入 `@colyseus/admin` / Drizzle / 第二个 DB） | ✅ 设计决策（2026-09-14，详见 [admin-integration.md](./admin-integration.md)） |
| 真实微信 jscode2session + Apple/Google id_token 验证 | ⌛ G1.5 |
| wx transport 真机回归（wx-compat 已覆盖 send 帧与构造形；真机网络栈待实测） | ⌛ G4 |
| 发布链路收口（包体/图集优化、上线流程、DELIVERY 追加） | ⌛ G4 |
| React Native 工程（expo prebuild） | ⌛ Phase 5 |
| 视觉规范（v25 design-preview） | ⌛ 继续走 [visual-repair-plan-v24.md](./visual-repair-plan-v24.md) |

---

接下来阅读：[deployment.md](./deployment.md) 了解节点/进程/容器清单与滚动更新策略。