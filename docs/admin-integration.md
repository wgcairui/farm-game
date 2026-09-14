# Admin 面板架构（Admin Panel Architecture）

> 版本：v2 · 2026-09-14
> 状态：**设计决策** — Refine standalone + Fastify + MikroORM；不再使用 `@colyseus/admin` / `@colyseus/database` / Drizzle / 第二个 DB
> 配套：[architecture.md §5](./architecture.md) · [deployment.md](./deployment.md) · [packages/server/AGENTS.md §3.6](../packages/server/AGENTS.md)

## 1. 背景与决策

v1 计划把 `@colyseus/admin` 接进来作为后台面板，因为它"开箱即用"。v2 重新评估后放弃这条路径，原因如下：

| 维度 | `@colyseus/admin` 路径 | v2 选择 |
|---|---|---|
| 业务库 admin 数据访问 | 跨 DB（Drizzle 走 admin DB，player 在 main DB 的 MikroORM 里） | 同一 DB 同一 ORM（admin schema 放 MikroORM entities） |
| Admin 改 player 写审计 | 跨 DB 事务不可能（XA 太重） | 同事务原子 |
| 第二个 ORM 工具链 | Drizzle migrations + drizzle-kit | 0 |
| 备份 / 监控 | 两个 schema 两套配置 | 一套 |
| `@colyseus/admin` 当前状态 | npm tag: `next`（预发布） | 跳过 |
| 上游维护成本 | 跟 0.18.x prerelease + Drizzle 兼容 | 跟 Refine 主线即可 |

**核心动机**：用户、记录都在 `postgres-main.players` 里（MikroORM 管）。Admin 要查要改这些记录时，绕不开 MikroORM。所谓"双 ORM 物理隔离"在 import 层有效，**在数据整合层是伪解**——它让 import 干净了，但让数据流割裂了。

**决策（2026-09-14）**：放弃 `@colyseus/admin` + `@colyseus/database` + Drizzle + 第二个 DB，改用下面 §2 的方案。

## 2. 架构：Refine standalone + 我们自己的 Fastify 路由

```
┌──────────────────────────────────────────────────────────┐
│ Refine + shadcn + Tailwind（独立 npm 包）                │
│   - shadcn 组件从 node_modules/@colyseus/admin/src/       │
│     复制（MIT 授权，路径自由）                            │
│   - dataProvider = simpleRest('https://.../admin-ops')  │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTPS（Nginx 内网限制）
                          ▼
┌──────────────────────────────────────────────────────────┐
│ Fastify HTTP entry（:3000，与业务路由同进程）            │
│   /admin-ops/*  走 jwtSecretAdmin 单独 preHandler        │
│   同一个 MikroORM，entities 放 admin schema              │
│   matchMaker.* API 拿 Colyseus 实时状态（@colyseus/core）│
└─────────────────────────┬────────────────────────────────┘
                          │ 同连接池 / 同事务
                          ▼
┌──────────────────────────────────────────────────────────┐
│ 单个 Postgres database：postgres-farm-game                │
│  ┌──────────────────────────┐  ┌─────────────────────┐   │
│  │ schema: public           │  │ schema: admin       │   │
│  │ (MikroORM)               │  │ (MikroORM)          │   │
│  │ players / plots /        │  │ admin_users /       │   │
│  │ auth_identities /        │  │ admin_audit_log /   │   │
│  │ operation_receipts /     │  │ admin_sessions(opt) │   │
│  │ farm_room_leases         │  │                     │   │
│  └──────────────────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 复用什么 / 写什么

| 部分 | 来源 | 工作量 |
|---|---|---|
| Refine + shadcn + Tailwind 框架 | npm 独立装 `refine` / `@refinedev/*` | 0.5 天 |
| shadcn 组件源码 | 从 `node_modules/@colyseus/admin/src/` 复制（MIT） | 0.5 天 |
| Colyseus 实时数据 | `matchMaker` from `@colyseus/core`（已在用） | 0 行新代码 |
| `@colyseus/auth` 集成 | 可选。简单 JWT 替代 30 行 Fastify | 0.5 天 |
| Admin 数据层 | `AdminUser` / `AdminAuditLog` MikroORM entities + `AdminRepo` | 1 天 |
| Admin 路由 | 6-8 个 `/admin-ops/*` 路由 | 1.5 天 |
| 文档同步 | 本文件 + AGENTS.md §3.6 等 | 0.5 天 |
| **总计** | | **5 天** |

对比 fork `@colyseus/admin` + 换 ORM 的 6-8 天首期 + 每月 fork 维护成本。

## 3. 边界规则（修订）

旧的"双 ORM 物理隔离"五条规则**作废**。新规则：

1. ✅ Admin 代码（`packages/server/src/admin/**`）**可以** import `@mikro-orm/core`（admin 也用 MikroORM）
2. ✅ 业务代码（`packages/server/src/{auth,crop,player,farm,realtime}/**`）**禁止** import `@colyseus/admin` / `@colyseus/database` / `drizzle-orm`（这些依赖会从 `package.json` 移除，ESLint `no-restricted-imports` 兜底）
3. ✅ Admin 用 MikroORM `admin` schema；业务用 MikroORM `public` schema。同一 DB，逻辑隔离。
4. ✅ Admin 路由在 `/admin-ops/*` 前缀下，与业务路由 `/auth/*` `/farm/*` 等物理隔离。
5. ✅ Admin JWT 用 `config.jwtSecretAdmin`（已 enforce 必须与业务 JWT secret 不同，见 [`config.ts`](../../packages/server/src/config.ts)）
6. ✅ Nginx 限制 `/admin-ops/*` 和 Refine 前端 origin 仅内网访问（见 [`deployment.md`](./deployment.md)）

## 4. 迁移顺序

Phase 3 起执行：

1. **依赖精简**：从 `packages/server/package.json` 移除 `@colyseus/admin` / `@colyseus/database` / `@colyseus/auth`（`@colyseus/core` / `redis-driver` / `redis-presence` / `ws-transport` 保留，这些是 WS 框架本身）
2. **schema 创建**：单一 migration 增加 `CREATE SCHEMA IF NOT EXISTS admin;`
3. **MikroORM entities**：在 `src/db/entities/admin/` 下新建 `AdminUser.ts` / `AdminAuditLog.ts`（可选 `AdminSession.ts`）
4. **AdminRepo**：`src/repositories/admin-repo.ts` 30-50 行，跟 `PlayerRepo` 一个套路
5. **admin 装饰器**：`app.ts` 注册第二个 `@fastify/jwt` 用 `jwtSecretAdmin`，加 `authenticateAdmin` 装饰器
6. **admin 路由**：`src/admin/ops-routes.ts` 实现 6-8 个 `/admin-ops/*` 路由
7. **mountAdmin 重写**：`src/admin/index.ts` 的 `mountAdmin` 从抛错替换改为挂载 ops-routes（`ENABLE_ADMIN=0` 时仍然 no-op）
8. **前端包**：在 `packages/` 下新建 `packages/admin-web/`（或放进 `client-app/` 的 admin 子项目），装 Refine + shadcn + Tailwind，从 `@colyseus/admin` 复制需要的组件源码
9. **部署**：Nginx 加 `/admin/*` 路由 + 内网 IP allow-list
10. **文档收尾**：把旧的"双 ORM 物理隔离"段落从所有文档移除（本文件就是这一步的产物）

## 5. 路由映射（计划）

| Path | Handler | 备注 |
|---|---|---|
| `GET /admin-ops/healthz` | `mountAdmin`（`ENABLE_ADMIN=0` 时返 `{enabled:false}`） | 探活 |
| `POST /admin-ops/auth/login` | 自建（JWT 签发） | bcrypt 验密码 |
| `GET /admin-ops/colyseus/status` | `matchMaker.*` API + SQL `farm_room_leases` | 进程 / 房间 / 客户端 |
| `GET /admin-ops/players` | `MikroORMPlayerRepo.listAll` | 列表 + 分页 |
| `GET /admin-ops/players/:playerId` | `MikroORMPlayerRepo.findByPlayerId` | 详情 |
| `POST /admin-ops/players/:playerId/ban` | 同事务改 `players.banned_at` + 写 `admin_audit_log` | 原子 |
| `POST /admin-ops/leases/:ownerId/release` | SQL `UPDATE farm_room_leases SET expires_at = now()` | 强制接管 |
| `POST /admin-ops/processes/:instanceId/drain` | Redis pub/sub 广播 → instance `gracefullyShutdown` | 主动接管 |
| `GET /admin-ops/audit-log` | `MikroORMAdminRepo.listAuditLog` | 查 `admin_audit_log` |

## 6. 性能与限制

- admin ops 是低频管理操作，**不参与业务 rate limit 桶**；应有独立 rate limit（运维操作不该被业务限流误伤）
- admin JWT TTL 建议 1-4 小时（比业务 JWT 短）
- 所有 admin 写操作必须落 `admin_audit_log`（即使不立刻建表，接口设计上要留 hook）
- admin 路由统一通过 `em.fork()` 拿 EM，避免污染业务 EM identity map

## 7. 文件清单（v2）

| 文件 | 状态 | 计划 |
|---|---|---|
| `packages/server/src/admin/index.ts` | 占位（`ENABLE_ADMIN=0` no-op / `=1` 抛错） | v2 重写挂挂载 ops-routes |
| `packages/server/src/admin/db.config.ts` | 占位 | v2 删除（用 MikroORM 主连接） |
| `packages/server/src/admin/schema.ts` | 仅字符串常量 | v2 删除（用 MikroORM entities） |
| `packages/server/src/admin/panel.ts` | 占位抛错 | v2 删除（前端用独立 web 包） |
| `packages/server/src/admin/ops-routes.ts` | 不存在 | v2 新建：6-8 个路由 |
| `packages/server/src/admin/auth-prehandler.ts` | 不存在 | v2 新建：`authenticateAdmin` 装饰器 |
| `packages/server/src/db/entities/admin/AdminUser.ts` | 不存在 | v2 新建 |
| `packages/server/src/db/entities/admin/AdminAuditLog.ts` | 不存在 | v2 新建 |
| `packages/server/src/repositories/admin-repo.ts` | 不存在 | v2 新建 |
| `packages/admin-web/`（或 `packages/client-app/admin/`） | 不存在 | v2 新建：Refine + shadcn + Tailwind |
| `packages/server/test/admin-disabled.test.ts` | ✅ 通过（`ENABLE_ADMIN=0` 时 `/admin/healthz` 返 `{enabled:false}`） | 保留 |

## 8. v2 待办清单

- [ ] `package.json` 移除 `@colyseus/admin` / `@colyseus/database` / `@colyseus/auth`（独立 PR）
- [ ] 单一 migration 加 `CREATE SCHEMA admin`
- [ ] `AdminUser` / `AdminAuditLog` MikroORM entities
- [ ] `AdminRepo`
- [ ] `authenticateAdmin` 装饰器（`app.ts`）
- [ ] 6-8 个 `/admin-ops/*` 路由
- [ ] `mountAdmin` 重写
- [ ] Refine 前端包 + 复制 `@colyseus/admin` shadcn 组件源码
- [ ] Nginx 配置 `/admin/*` 内网限制
- [ ] 删除 / 废弃旧的 `src/admin/{db.config,schema,panel}.ts`
- [ ] ESLint `no-restricted-imports` 规则挡 `drizzle-orm` / `@colyseus/database` / `@colyseus/admin`（业务代码）
- [ ] audit log 接入 pino

## 9. 相关变更（其他文档同步更新）

- [`docs/architecture.md`](./architecture.md) §2 §4 §5 §8 §9 同步移除 postgres-admin 与 Drizzle 引用
- [`packages/server/AGENTS.md`](../packages/server/AGENTS.md) §3.6 Admin 段重写
- [`packages/server/src/admin/{index,db.config,schema,panel}.ts`](../../packages/server/src/admin/) 头部注释更新指向本文件
- [`docs/tech-stack.md`](./tech-stack.md) §五 移除 "Admin ORM" 行；§十三 checklist 更新
- [`docs/deployment.md`](./deployment.md) 移除 postgres-admin 节点 + `ADMIN_DB_URL`
- [`packages/server/README.md`](../packages/server/README.md) §Architecture 中 `admin/` 目录说明更新