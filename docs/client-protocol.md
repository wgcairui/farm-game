# 客户端协议契约（Client Protocol）

> 版本：v1 · 2026-09-11
> 当前 `PROTOCOL_VERSION` = `1.0.0`（major = 1）
> 配套：[architecture.md](./architecture.md) · [state-sync.md](./state-sync.md)

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

服务端收到 major 不匹配 → HTTP `426 Upgrade Required` / WS 关闭并发送 `protocol_version_mismatch` 错误帧。**Phase 1**：header 被服务端**忽略**（占位字段），协议版本由 `GET /healthz` 与 `/auth/_meta` 暴露给客户端比对；Phase 2 起开启 426 校验。

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
| 1xxx | 客户端/请求级（`BAD_REQUEST`, `PROTOCOL_VERSION_MISMATCH`） |
| 2xxx | 鉴权（`WECHAT_CODE_INVALID`, `WECHAT_CODE_EXPIRED`） |
| 3xxx | 业务（`INSUFFICIENT_GOLD`, `PLOT_NOT_EMPTY`, `WAREHOUSE_FULL`） |
| 4xxx | 服务端内部（`INTERNAL`, `NOT_IMPLEMENTED`, `MAINTENANCE`） |

### 2.4 平台路由

JWT 携带 `platform: Platform`：
- `weChatMini` — 微信小游戏（`POST /auth/wechat`）
- `ios` — iOS App（`POST /auth/oauth` provider=apple）
- `android` — Android App（`POST /auth/oauth` provider=google）
- `h5Reserve` — H5 预留（Phase 3+）

`platform` 影响：
- 支付回调路由（Phase 2）
- 推送通道（Phase 2）
- 客户端 UI 资源包（编译时分支）

## 3. HTTP 路由

### 3.1 `GET /healthz`
- Auth：无
- 响应：`{ ok: true; uptime: number; protocolVersion: string }`

### 3.2 `POST /auth/wechat`
- Auth：无（用 `code` 一次性登录）
- Body：`WeChatLoginRequest { code: string; guestPlayerId?: string }`
- 响应：`LoginResponse { token; player: PlayerSave; auth: AuthContext }`
- 错误：
  - `4000 INTERNAL` — Phase 1 stub 永不抛
  - `2000 WECHAT_CODE_INVALID` — Phase 2 接入 jscode2session 后启用
  - `2001 WECHAT_CODE_EXPIRED` — 同上

### 3.3 `POST /auth/oauth`
- Auth：无
- Body：`OAuthLoginRequest { provider: 'apple'|'google'|'weChat'; idToken: string; deviceId?: string }`
- 响应：`LoginResponse`
- 错误：
  - `1000 BAD_REQUEST` — `provider` / `idToken` 缺失
  - 其它错误码（Phase 2）

### 3.4 `GET /player/info`
- Auth：Bearer JWT
- 响应：`ApiResponse<PlayerSave>`
- 错误：
  - `1100 NOT_AUTHENTICATED`
  - `1101 INVALID_TOKEN`

### 3.5 `GET /crop/configs`
- Auth：无
- 响应：`ApiResponse<{ crops: CropConfig[]; version: number }>`
- 用途：客户端首次启动拉作物目录；`version` 用于本地缓存

### 3.6 `POST /farm/unlock`
- Auth：Bearer JWT
- Body：`{ plotIndex: number }`
- 响应：`ApiResponse<{ plot: PlotState }>`
- 错误：
  - `3002 PLOT_NOT_OWNED`
  - `3000 INSUFFICIENT_GOLD`（Phase 2 实装扣费时启用）

### 3.7 `GET /admin/*`（admin 节点，内网）
- 默认 `ENABLE_ADMIN=0` 时返回 404
- Phase 2 起：
  - `GET /admin/` — SPA 面板（React + Ant Design ProTable）
  - `GET /admin-api/...` — REST 后端
  - `POST /admin-api/auth/login` — admin 用户登录

## 4. WebSocket 消息

完整定义见 [`packages/shared/src/protocol/ws.ts`](../packages/shared/src/protocol/ws.ts)。

### 4.1 C → S

| 名称 | payload | 语义 |
|---|---|---|
| `hello` | `{ openid, token }` | 握手；服务端校验后回 `welcome` 或 `error` |
| `plant` | `{ plotIndex, cropId }` | 种植；服务端校验金币/地块状态 |
| `water` | `{ plotIndex }` | 浇水；服务端重新算 matureAt |
| `harvest` | `{ plotIndex }` | 收获；服务端 push `plot_updated` |
| `steal` | `{ victimPlayerId, plotIndex }` | 偷菜（Phase 2） |

### 4.2 S → C

| 名称 | payload | 语义 |
|---|---|---|
| `welcome` | `{ serverNow, roomId }` | 握手成功；客户端计算时间偏移 |
| `plot_updated` | `{ plot }` | 地块状态变更（种/收/偷/枯） |
| `crop_stolen` | `{ victimOpenid, plotIndex, cropId, lostAmount }` | 被偷通知 |
| `gold_updated` | `{ gold }` | 金币变化 |
| `error` | `{ code, message }` | 业务错误 |

### 4.3 request/response 语义

`r` 字段携带请求 id。客户端 send `plant` 带 `r: "abc123"`，可同步 `await` 对应 `r === "abc123"` 的响应（Colyseus 0.18 `room.request` API，Phase 2 启用）。

## 5. 鉴权与刷新

- JWT TTL：7 天（PRD §7.3）
- 业务路由：`Authorization: Bearer <token>`
- WS 握手：把 JWT 放在 `hello.token`，服务端校验通过后 join/leave room
- 刷新：Phase 2 引入 `POST /auth/refresh`（rotation refresh token）

## 6. 重连与离线

- Colyseus `allowReconnection` 30 秒
- 客户端在重连窗口内冻结 UI
- 重连成功后客户端用 `hello` 重新握手，服务端 push 整个 room 状态
- 详见 [state-sync.md §3](./state-sync.md)

## 7. 客户端实现位置

| 客户端 | HTTP | WS |
|---|---|---|
| 微信小游戏 | `wx.request` | `wx.connectSocket` |
| iOS / Android App | `fetch` | RN `WebSocket` |
| H5（预留） | `fetch` | 原生 `WebSocket` |

HTTP 层统一通过 `@farm-game/client-app/net/api` 的 `ApiClient`；WS 层统一通过 Colyseus SDK 的 `Client`。