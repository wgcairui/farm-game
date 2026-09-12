# 客户端协议契约（Client Protocol）

> 版本：v3 · 2026-09-11 — Phase 2 G0 review-fix：新增 `/auth/identities/me`，公开 `identities` 不再携带 `subject`，applyWater 错误原因拆分。
> 当前 `PROTOCOL_VERSION` = `1.0.0`（major = 1）
> 配套：[architecture.md](./architecture.md) · [state-sync.md](./state-sync.md) · [ADR-0001](./adr/0001-g0-contract-and-security-baseline.md)

所有 client/server 通信消息的 TypeScript shape 集中在 [`packages/shared/src/protocol/`](../packages/shared/src/protocol/)。两端各自 `import` 同一份 interface，禁止任一端独立写 shape。

## 1. 协议版本

- `PROTOCOL_VERSION`：`"1.0.0"`（semver）
- `PROTOCOL_VERSION_MAJOR`：1
- breaking change 必须升 major
- minor = 增字段（兼容）
- patch = 修文案/字段描述

客户端握手时上报：
- HTTP header `x-protocol-version`（小写，与 fetch / axios 行为一致）
- WS envelope `v` 字段

服务端收到 major 不匹配 → HTTP `426 Upgrade Required` + body `{ ok: false, code: 1200, message: "client major=N server major=M" }` / WS 关闭并发送 `protocol_version_mismatch` 错误帧。**Phase 2 G0 起开启**：服务端在 `onRequest` hook 解析 header，major 不一致立即 426。

## 2. 通用约定

### 2.1 HTTP

- Content-Type: `application/json; charset=utf-8`
- 所有响应统一信封：
  ```ts
  type ApiResponse<T> =
    | { ok: true;  data: T }
    | { ok: false; code: ErrorCode; message: string; detail?: Record<string, unknown> };
  ```
- HTTP status 仅表示传输层结果；业务错误用 `code` 字段。例：参数缺失 → HTTP 400 + `code: 1000`
- 验证错误、过期 token 等服务端内部错误统一走 `app.setErrorHandler` 翻译成 `ApiResponse`，不再暴露 Fastify 默认错误结构

### 2.2 WS（Colyseus）

所有消息套在统一 envelope 里：
```ts
interface WsEnvelope<TName extends string, TPayload> {
  v: string;                 // PROTOCOL_VERSION
  t: TName;                  // 消息类型
  r?: string;                // 可选 request id（request/response 配对）
  p: TPayload;
  ts?: number;               // 服务端 epoch ms（仅 S→C 填充；C→S 不强制）
}
```

### 2.3 错误码

集中在 [`ErrorCode`](../packages/shared/src/protocol/error.ts)。范围 1000–4999。

| 段 | 用途 |
|---|---|
| 1xxx | 客户端/请求级（`BAD_REQUEST`, `TOKEN_EXPIRED`, `PROTOCOL_VERSION_MISMATCH`） |
| 2xxx | 鉴权（`WECHAT_CODE_INVALID`, `WECHAT_CODE_EXPIRED`, `OAUTH_PROVIDER_INVALID`, `IDENTITY_ALREADY_BOUND`） |
| 3xxx | 业务（`INSUFFICIENT_GOLD`, `PLOT_NOT_EMPTY`, `CROP_NOT_RIPE`, `WAREHOUSE_FULL`, `WATER_LIMIT_REACHED`） |
| 4xxx | 服务端内部（`INTERNAL`, `NOT_IMPLEMENTED`, `MAINTENANCE`） |

### 2.4 平台路由

JWT 不再携带 `platform`；平台只出现在 HTTP `x-platform` 头，影响：
- 支付回调路由（G1+）
- 推送通道（G1+）
- 客户端 UI 资源包（编译时分支）

`Platform` 取值：
- `weChatMini` — 微信小游戏（`POST /auth/wechat`）
- `ios` — iOS App
- `android` — Android App
- `h5Reserve` — H5 预留

### 2.5 玩家身份模型（ADR-0001 §1；review-fix H1）

- 业务玩家用内部 UUID `playerId` 标识，跨平台唯一
- `AuthIdentity { provider, subject, tenantId? }` 是登录键；一个玩家可绑定多个 provider
- 公开信封（`PlayerSave.identities`、JWT `identities`）是 `AuthIdentitySummary[]`，**不含 `subject`**
- owner 通过 `GET /auth/identities/me` 取回自己的完整 `AuthIdentity[]`（含 subject）
- 绑定必须经 `POST /auth/bind`；重复绑定到不同玩家 → `2003 IDENTITY_ALREADY_BOUND`
- JWT `sub` = `playerId`
- `openid` 永不进入客户端公开协议（详见 [data-schema.md §3](./data-schema.md)）

## 3. HTTP 路由

### 3.1 `GET /healthz`
- Auth：无
- 响应：`{ ok: true; uptime: number; protocolVersion: string }`
- 跳过协议版本检查

### 3.2 `POST /auth/wechat`
- Auth：无（用 `code` 一次性登录）
- Body：`WeChatLoginRequest { code: string; guestPlayerId?: string }`（JSON Schema 校验：`code` 长度 1–256）
- 响应：`LoginResponse { token; player: PlayerSave; auth: AuthContext }`
- 错误：
  - `1000 BAD_REQUEST` — body 校验失败
  - `2000 WECHAT_CODE_INVALID` — mock `mock_*` 前缀被拒（生产默认关闭 mock）
  - 其它错误码（G1+ 接 jscode2session 后启用）

### 3.3 `POST /auth/oauth`
- Auth：无
- Body：`OAuthLoginRequest { provider: AuthProvider; idToken: string; deviceId?: string }`（JSON Schema 校验）
- 响应：`LoginResponse`
- 错误：
  - `1000 BAD_REQUEST`
  - `2002 OAUTH_PROVIDER_INVALID` — mock token 被拒

### 3.4 `POST /auth/bind`
- Auth：Bearer JWT
- Body：`AuthBindRequest { provider: AuthProvider; token: string; tenantId?: string }`
- 响应：`ApiResponse<{ player: PlayerSave }>`
- 错误：
  - `1100 NOT_AUTHENTICATED`
  - `2002 OAUTH_PROVIDER_INVALID` — mock token 被拒
  - `2003 IDENTITY_ALREADY_BOUND` — 该 (provider, subject, tenant) 已绑定到另一玩家

### 3.4a `GET /auth/identities/me`
- Auth：Bearer JWT
- 响应：`ApiResponse<{ identities: AuthIdentity[] }>` —— 调用者**自己**的完整身份（含 subject）
- 错误：
  - `1100 NOT_AUTHENTICATED`
  - `1101 INVALID_TOKEN`
- 用途：客户端展示"我绑定了哪些 provider"或发起解绑时使用；其他玩家的 subject 永远不暴露。

### 3.5 `GET /player/info`
- Auth：Bearer JWT
- 响应：`ApiResponse<PlayerSave>`
- 错误：
  - `1100 NOT_AUTHENTICATED`
  - `1101 INVALID_TOKEN`（签名错 / 格式错）
  - `1102 TOKEN_EXPIRED`（@fastify/jwt 报告 `FST_JWT_AUTHORIZATION_TOKEN_EXPIRED`）

### 3.6 `GET /crop/configs`
- Auth：无
- 响应：`ApiResponse<{ crops: CropConfig[]; version: number }>`
- 用途：客户端首次启动拉作物目录；`version` 用于本地缓存

### 3.7 `POST /farm/unlock`
- Auth：Bearer JWT
- Body：`{ plotIndex: number }`（JSON Schema 校验：`plotIndex` 整数 0–23）
- 响应：`ApiResponse<{ plot: PlotState }>`
- 错误：
  - `3002 PLOT_NOT_OWNED`
  - `3000 INSUFFICIENT_GOLD`（G1+ 实装扣费时启用）

### 3.8 `GET /admin/*`（admin 节点，内网）
- 默认 `ENABLE_ADMIN=0` 时返回 404
- Phase 2 起：
  - `GET /admin/` — SPA 面板（React + Ant Design ProTable）
  - `GET /admin-api/...` — REST 后端
  - `POST /admin-api/auth/login` — admin 用户登录

## 4. WebSocket 消息

完整定义见 [`packages/shared/src/protocol/ws.ts`](../packages/shared/src/protocol/ws.ts)（G2 版，ADR-0004）。所有消息包 WsEnvelope `{ v, t, r?, p, ts? }`，`v` 校验 major。房间**不使用 Colyseus Schema state**——PostgreSQL 是唯一权威，消息是投影；客户端按 `revision` 丢弃过期快照。

### 4.1 C → S

| 名称 | payload | 语义 |
|---|---|---|
| `farm_cmd` | `{ command, operationId, body }` | **唯一写通道**。`command ∈ unlock/plant/water/harvest`，body 与 HTTP 同形状；`operationId` 幂等收据与 HTTP 共表（跨通道重放安全） |
| `farm_refresh` | `null` | 拉取全量快照（回 `welcome`）。**这是可靠的快照路径**：join 时服务端虽会 push，但 0.18 握手在 onJoin 之后才发 JOIN_ROOM，SDK 客户端必然收不到那次 push |

### 4.2 S → C

| 名称 | payload | 语义 |
|---|---|---|
| `welcome` | `{ serverNow, roomId, player: PlayerSave }` | 全量快照。三种来源：`farm_refresh` 的响应（仅请求者）、join 推送（仅供缓冲 pre-join 帧的自研客户端）、**跨进程变更广播**（HTTP 入口写入后由 revision watcher 推给全体连接） |
| `cmd_result` | `CommandResponse`（含 `player` 全量 + `payload` + `replayed`/`operationRevision`） | 命令响应；`envelope.r` 回声 operationId |
| `plot_updated` | `{ plot }` | 命令成功后广播（全体连接） |
| `gold_updated` | `{ gold }` | 同上 |
| `error` | `{ code, message }` | 结构垃圾/版本不符/内部错误（ephemeral，可原 operationId 重试）或确定性业务失败（已落收据，勿重试） |
| `crop_stolen` | — | **reserved**（社交阶段） |

### 4.3 request/response 语义

`r` 字段携带请求 id（farm 命令即 operationId）。服务端在 `cmd_result`/`error` 上原样回声，客户端据此关联响应。

## 5. 鉴权与刷新

- JWT TTL：7 天（`JWT_TTL_SEC` 默认 7×24×3600）
- 业务路由：`Authorization: Bearer <token>`
- WS：join options `{ ownerId, token }`。**双重验证**：`onCreate`（建房即抢租约，因此创建前先验 token + `sub === ownerId`，防未认证建房搅动租约）+ `onAuth`（每个后续 join）。验证用 fast-jwt，与 HTTP 的 `@fastify/jwt` 同 secret/iss/aud（ADR-0004 D33 + T5 review 修订）
- 刷新：G1+ 引入 `POST /auth/refresh`（rotation refresh token）

### 5.1 JWT 声明

```ts
interface JwtClaims {
  sub: string;                // playerId (UUID)
  iat: number;                // 由 @fastify/jwt 自动写入
  exp: number;                // 由 @fastify/jwt 自动写入（TTL=7d）
  iss: 'farm-game';           // 由 fastifyJwt.sign.iss 配置注入
  aud: 'client';              // 由 fastifyJwt.sign.aud 配置注入
  identities: AuthIdentitySummary[];  // 登录时的身份快照（不含 subject）
}
```

`exp` 失效由 `@fastify/jwt` 在每次 `jwtVerify()` 自动校验，服务端**不**再维护自定义 `expiresAt` 字段。`AuthContext.expiresAt` 直接来自 JWT `exp`，客户端用同一数值调度 silent refresh。

## 6. 重连与离线

- 异常断线 → 服务端 `onDrop` 提供 reconnection seat（`ROOM_RECONNECT_TTL_SEC` 默认 60s）；seat 期间房间保留租约、其余连接继续服务
- 重连走 reconnection token（服务端签发给已认证连接的能力凭证），**不重跑 onAuth**；`onReconnect` 后客户端必须发 `farm_refresh` 拉新快照（无 room.state 推送）
- 合意退出（`CloseCode.CONSENTED=4000`）不给 seat；服务端 SIGTERM 关停时客户端收到 4001
- 详见 [state-sync.md §5](./state-sync.md)

## 7. 客户端实现位置

| 客户端 | HTTP | WS |
|---|---|---|
| 微信小游戏 | `wx.request` | `wx.connectSocket`（G3 自研 WsEnvelope 栈） |
| iOS / Android App | `fetch` | RN `WebSocket` |
| H5（预留） | `fetch` | 原生 `WebSocket` |

HTTP 层统一通过 `@farm-game/client-app/net/api` 的 `ApiClient`。WS 层：测试/工具脚本可用 `@colyseus/sdk`（0.18.x）；**生产小游戏客户端不使用 Colyseus SDK**（运行时/包体约束），G3 按上述消息契约在 `wx.connectSocket` 上自研（需自行缓冲 pre-join 帧）。
