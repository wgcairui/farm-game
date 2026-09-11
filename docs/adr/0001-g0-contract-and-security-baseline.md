# ADR-0001 — G0 契约与安全基线（Phase 2 起点）

> 状态：提议 · 2026-09-11
> 范围：`packages/shared` + `packages/server`（不涉及数据库、不涉及 Colyseus、不涉及 RN）
> 起点：Phase 1 已交付（`b0becb1`）— 计划见 [implementation-plan-phase2.md §3 G0](../implementation-plan-phase2.md)

本 ADR 锁定 Phase 2 G0 必须落地的契约与安全决策。后续 G1–G3 都以此为输入；冲突时 G0 优先。

## 1. 决策摘要

| # | 决策 | 替代方案 | 选定理由 |
|---|---|---|---|
| D1 | 业务玩家 ID 与 provider 身份分离：`Player.playerId` 为内部稳定 UUID；`AuthIdentity(provider, subject)` 才绑定微信/Apple/Google subject | 沿用 `playerId = openid` | 后端是全局服务，必须支持多平台同账号；PRD §3.1 要求跨端账户合并 |
| D2 | JWT 使用标准声明：`sub` = `playerId`、`iss` = `farm-game`、`aud` = `client`、内置 `exp` 由 `@fastify/jwt` 校验；自定义 `auth` 字段从 token 移除 | 继续使用自定义 `expiresAt` claim | 自定义 claim 绕过 `exp` 校验，会出现"过期 token 仍被接受"的隐患 |
| D3 | mock 登录仅 `NODE_ENV ∈ {development, test}` 启用；生产启动必须 `ENABLE_MOCK_AUTH=0` 且 `JWT_SECRET` 与默认不同；host 默认 `127.0.0.1` | 默 mock 永远可用 | mock 在生产意味着任何人都能伪造登录 |
| D4 | 路由统一用 Fastify 真实类型 + JSON Schema 校验（`schema: { body, querystring, response }`）；移除 `any` 包装 | 继续 `any` + 手工断言 | `@fastify/jwt` v10 与 Fastify v5 类型本就兼容；`any` 是被审标记的问题 |
| D5 | `applyWater()` 输入服务端 `now`、当前 `matureAt`、`waterCount`；新 `matureAt = now + ceil((matureAt - now) × 0.95)`；封顶 50% off、拒绝成熟后与超次数 | 沿用"对总时长打折" | 旧实现让浇水 N 次后剩余时间被多次折扣，违背 PRD §2.2.3 "每次浇水剩余时间减少 5%" |
| D6 | HTTP `x-protocol-version` 与 server `PROTOCOL_VERSION_MAJOR` 不一致 → HTTP 426 `PROTOCOL_VERSION_MISMATCH` | 头被忽略（Phase 1 状态） | 协议版本是契约的一部分；客户端必须能在版本不匹配时拿到明确错误 |
| D7 | `1102 TOKEN_EXPIRED` 错误码；过期 token 返回 401 + code 1102，便于客户端 silent refresh | 复用 `INVALID_TOKEN` | 客户端需区分"格式不对"与"过期"，触发不同的 UX |
| D8 | 错误响应统一：业务失败用 `ApiResponse<T>` + HTTP 400/401/403/404/409；服务端内部错误用 500 + `INTERNAL`，不泄露细节 | 继续手工 `reply.code().send()` 拼接 | 单一错误路径便于客户端与监控解析 |

## 2. 数据模型变化

### 2.1 Player（业务身份）

```ts
interface PlayerSave {
  version: 1;
  playerId: string;              // 内部稳定 UUID；跨平台唯一
  nickname?: string;
  avatarUrl?: string;
  gold: number;
  gems: number;
  inventory: InventoryItem[];
  plots: PlotState[];
  level: number;
  exp: number;
  settings: PlayerSettings;
  createdAt: number;
  updatedAt: number;
  identities: AuthIdentityRef[]; // ★ G1 起真正持久化；G0 仅类型定义
}
```

`openid` 字段从 `PlayerSave` 删除。它只属于 `AuthIdentity`，永不进入客户端公开协议。

### 2.2 AuthIdentity（认证身份）

```ts
type AuthProvider = 'weChatMini' | 'ios' | 'android' | 'h5';

interface AuthIdentity {
  provider: AuthProvider;
  subject: string;            // 微信 openid / Apple sub / Google sub
  tenantId?: string;          // 应用/小程序租户范围；用于多 app 共用 backend
  boundAt: number;
}

/** 公开协议中只携带 provider + subject，避免 openid 泄漏。 */
interface AuthIdentityRef {
  provider: AuthProvider;
  subject: string;
  boundAt: number;
}
```

### 2.3 一对多与合并

- 一个 `Player` 可绑定多个 `AuthIdentity`（微信 + Apple 同一账号）。
- 合并请求走 `POST /auth/bind`，需要两方都已登录；服务端匹配不在登录时"猜"。
- 没有 unionid 自动合并：跨小程序/同主体 unionid 走 `weChatMini` 单独 identity，不与其它平台合并。

## 3. JWT 契约（替换旧自定义 claim）

```ts
interface JwtClaims {
  sub: string;                 // playerId
  iat: number;                 // 由 @fastify/jwt 自动写入
  exp: number;                 // 由 @fastify/jwt 自动写入（TTL=7d）
  iss: 'farm-game';
  aud: 'client';
  identities: AuthIdentityRef[]; // 客户端缓存，登录后无需再请求 /player/info 才知道绑了哪些
}
```

- `exp` 由 `@fastify/jwt` 设置与校验；服务端不再维护自定义 `expiresAt`。
- `identities` 是只读副本，**不可**用客户端伪造的身份注册新 identity（绑定必须经 `POST /auth/bind`）。
- 服务端在 `verify` 失败时区分：`FAST_JWT_EXPIRED` → 401 + `1102 TOKEN_EXPIRED`；其他 → 401 + `1101 INVALID_TOKEN`。

## 4. 安全与配置基线

### 4.1 `loadConfig()` 在生产 fail-closed

```ts
function loadConfig(overrides): ServerConfig {
  const env = NODE_ENV ?? 'development';
  if (env === 'production') {
    if (JWT_SECRET === default) throw ConfigError('JWT_SECRET must differ from default in production');
    if (JWT_SECRET_ADMIN === default) throw ConfigError('JWT_SECRET_ADMIN must differ');
    if (SESSION_SECRET === default) throw ConfigError('SESSION_SECRET must differ');
    if (ENABLE_MOCK_AUTH === '1') throw ConfigError('ENABLE_MOCK_AUTH must be 0 in production');
  }
  if (env !== 'test' && HOST === '0.0.0.0') warn('binding to 0.0.0.0; restrict with HOST env in production');
  return { ... };
}
```

### 4.2 mock auth 隔离

- `ENABLE_MOCK_AUTH=1` 仅 `development` / `test` 允许；生产抛 ConfigError。
- mock 仅用于本地无微信凭据场景；返回的 `subject` 以 `mock_` 前缀，便于审计。

### 4.3 协议版本校验

- HTTP：`x-protocol-version` 头解析失败或 major 不匹配 → 426 `PROTOCOL_VERSION_MISMATCH`。
- 客户端拿到 426 必须升级，不重试。
- WS：G2 启用，G0 仅在 HTTP 路径上验证。

## 5. 浇水算法修正

旧实现（拒绝原因）：

```ts
// ❌ 对总时长折扣 — 第 3 次浇水把成熟时间从 now+60s 改到 now+25.5s
const baseDuration = cfg.growthDuration * 1000;
const discount = min(newWaterCount * 0.05, 0.5);
const newDuration = baseDuration * (1 - discount);
return { matureAt: plantedAt + newDuration, waterCount: newWaterCount };
```

新实现：

```ts
// ✅ 对剩余时间折扣 — 第 3 次浇水：matureAt = now + ceil((matureAt - now) × 0.95)
function applyWater(plot, now): { matureAt, waterCount } | null {
  if (plot.status !== 'growing') return null;          // 已成熟/已枯萎不能再浇
  if (!plot.matureAt || !plot.cropId) return null;
  if (plot.waterCount >= maxWater) return null;
  const remaining = plot.matureAt - now;
  if (remaining <= 0) return null;                     // 已经成熟则拒绝
  const discounted = Math.ceil(remaining * 0.95);
  return { matureAt: now + discounted, waterCount: plot.waterCount + 1 };
}
```

校验：

- `now + ceil((matureAt - now) × 0.95) < matureAt`（总有加速，0 除外）
- 总封顶：3 次浇水后剩余时间最小为原始剩余的 `0.95^3 ≈ 0.857`，与 PRD "3 次封顶 50% 加速" 不冲突——PRD 是上限说明，实际由 `maxWater` 限制浇水次数。
- 浇水失败的 4 种原因：`PLOT_NOT_EMPTY`（不在 growing）、`CROP_NOT_RIPE`（已成熟）、`WATER_LIMIT_REACHED`（超过 maxWater）。

### 5.1 新错误码

```ts
WATER_LIMIT_REACHED: 3006,  // ★ G0 新增
TOKEN_EXPIRED: 1102,       // ★ G0 新增
```

## 6. 不在本 ADR 范围

- 真实 PostgreSQL 实体与迁移（G1）
- Colyseus 房间与重连（G2）
- Cocos / RN 联调（G3）
- admin 面板实装（Phase 3）

## 7. 验收证据

- `pnpm -r build` 通过
- `pnpm -r test` 全绿（新增 ≥ 5 测试覆盖：协议 mismatch、过期 token、prod fail-closed、applyWater 剩余时间、AuthIdentity 映射）
- 路由签名从 `any` 改为真实 Fastify 类型；`tsc --noEmit` 不报类型逃逸
- `JWT_SECRET` 默认值在 production 启动时抛 ConfigError
- mock auth 在 production 启动抛 ConfigError
