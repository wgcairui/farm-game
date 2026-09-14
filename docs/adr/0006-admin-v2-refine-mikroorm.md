# ADR-0006 — Admin 面板 v2：放弃 `@colyseus/admin` + Drizzle，改用 Refine standalone + MikroORM

> 状态：已接受 · 2026-09-14
> 范围：`docs/admin-integration.md`、`docs/architecture.md`、`docs/deployment.md`、`docs/tech-stack.md`、`docs/ONBOARDING.md`、`packages/server/src/admin/**`、`packages/server/package.json`
> 关系：扩展 [ADR-0001](./0001-g0-contract-and-security-baseline.md) §3（鉴权策略，admin JWT secret 与业务分离）；遵循 ADR-0003 D25（事务边界）/ ADR-0003 D30（DB 是单一权威）的精神；废弃之前写在 `docs/admin-integration.md` v1（双 ORM 物理隔离）与 `packages/server/AGENTS.md` §3.6 的所有 admin 集成规划

## 1. 决策摘要

| # | 决策 | 替代方案 | 选定理由 |
|---|---|---|---|
| D44 | **admin 面板不再引入 `@colyseus/admin` / `@colyseus/database` / Drizzle / 第二个 database**。admin 数据（`admin_users` / `admin_audit_log`）放在现有 `postgres-farm-game` 的 `admin` schema，仍由 MikroORM 管理；与业务表（`public` schema）同一连接 / 同一 EM / 同一事务可原子 | A. `@colyseus/admin` 接进来，物理隔离第二个 database（Drizzle 管理）；B. fork `@colyseus/admin` 替换 ORM 层为 MikroORM | A 引入第二个 ORM（运维 + 迁移 + 监控双线）且 admin 改 player 时跨 DB 事务不可能（XA 太重）；B fork 维护成本（Colyseus 0.18 还在 prerelease + 跟 upstream rebase 持续），且实际复用只是 UI 框架层。详见 `docs/admin-integration.md` §1 决策表 |
| D45 | **admin 前端独立 npm 包**：`packages/admin-web/`（或 `packages/client-app/admin/` 子项目），独立装 Refine + `@refinedev/*` + shadcn + Tailwind；`dataProvider = simpleRest('https://admin.example.com/admin-ops')`。**复用** `@colyseus/admin` 已发布的 shadcn 组件源码（MIT），从 `node_modules/@colyseus/admin/src/` 直接复制到 admin 包 | A. 把 admin 前端挂在 server 进程内（沿用 `@colyseus/admin` 默认形态）；B. 完全自写 web UI | A 强行让 server 进程引入 React/Vite 构建链（违反 server-only-stack 边界）；B 工作量爆炸，且 shadcn/Tailwind 现成可用。复制 `@colyseus/admin` 的组件源码而非 fork 包，是因为前端代码不带 ORM 耦合、不带 Drizzle 调用，可独立消费 |
| D46 | **admin ops 路由走 `/admin-ops/*` 前缀**，挂在现有 Fastify HTTP 进程（端口 3000），与业务路由 `/auth/*` `/farm/*` 等并列。复用同一份 MikroORM；admin 装饰器 `authenticateAdmin` 用第二个 `@fastify/jwt` 实例配 `jwtSecretAdmin`（已 enforce 与业务 secret 不同） | A. 独立 admin 进程（端口 2568）；B. 复用业务 JWT secret | A 单独的进程要单独的 deployment / 单独的 DI 装配，且 admin 写业务表 + 写审计必须同事务 → 必须共享 EM，单独进程就破；B 让 admin 拿到任意业务 JWT，footgun |
| D47 | **`package.json` 移除 `@colyseus/admin` / `@colyseus/database` / `@colyseus/auth`**（它们在仓库里实际**没有任何代码 import**，仅占位文件 `src/admin/{index,schema,panel,db.config}.ts` 在注释中提及）。**保留** `@colyseus/core` / `redis-driver` / `redis-presence` / `ws-transport`（WS 框架本身）和 `@colyseus/sdk` / `@colyseus/testing` / `@colyseus/tools`（测试 / 客户端 / 监控） | A. 保留 deps 占位，等 v2 实装 admin web 包再移除 | deps 留在 `package.json` 里只是噪音，且未来 ESLint `no-restricted-imports` 规则挡 `drizzle-orm` / `@colyseus/database` / `@colyseus/admin` 在业务代码前必须先保证 deps 不存在，否则 `pnpm install` 会拉回 Drizzle 运行时 |
| D48 | **ESLint `no-restricted-imports` 规则是 v2 实施第二步**（独立 PR；本 ADR 不强约束）。当前仓库**没有 ESLint**（只有 `lint:tsc`），引入它属于新增 dev 依赖 + 配置文件，需要单独 review | A. 本 ADR 一并引入 ESLint | 本 ADR 范围已超 10 个文件改动 + ADR + package.json，再加 ESLint 配置会让 PR 难以 review。ESLint 规则本质上是个安全网，admin v2 已经做了"边界规则只在 `src/admin/index.ts` 头部注释里写"的文档化处理 |
| D49 | **admin 写业务表 + 写审计必须同事务**：在 `em.fork().transactional(...)` 回调里同时改 `players.banned_at` 与 `INSERT INTO admin.admin_audit_log`，保证原子。**严禁** admin 写操作走非事务路径 | A. 异步写审计（admin 操作先 commit 业务表，再异步发审计事件）；B. 跨 DB 写审计 | A 审计丢失代价（合规风险）远高于事务开销；B 已废（v2 单 DB） |
| D50 | **admin JWT TTL 建议 1-4 小时**（比业务 7 天短）；强制 `jwtSecretAdmin` 在 production 必须与 `JWT_SECRET` 不同（`config.ts:197-201` 已 enforce） | 沿用业务 TTL 7 天 | admin 凭据被窃窗口越小越好；运维操作频率低，每次重新登录成本可接受 |

## 2. 不在本 ADR 范围

- **admin ops 路由的具体内容**（6-8 个 `/admin-ops/*` 端点的实际实现）→ 等独立 PR 实施
- **Refine 前端包**（`packages/admin-web/` 创建、shadcn 组件复制、dataProvider 配置）→ 等独立 PR
- **ESLint 配置**（`no-restricted-imports` 规则、`.eslintrc` 文件）→ D48，等独立 PR
- **`admin_users` schema 与迁移**（`CREATE SCHEMA admin` + entities）→ 等独立 PR
- **Nginx 配置变更**（`/admin-ops/*` 内网代理 + Refine 前端 origin 白名单）→ 见 `docs/deployment.md` §1 admin v2 启动流程

## 3. 影响面

### 代码

- `packages/server/src/admin/index.ts`：注释更新指向本 ADR；`mountAdmin()` 行为不变（`ENABLE_ADMIN=0` no-op / `=1` 抛 `AdminConfigError`）；v2 实装时改为挂载 `ops-routes.ts`
- `packages/server/src/admin/{schema,panel,db.config}.ts`：v1 占位内容保留（标注 `@deprecated` 或注释），但**不删除**——保留它们作为"v1 决策已废弃"的明确标记，reviewer 看到这层就知道发生过方向调整
- `packages/server/package.json`：移除 `@colyseus/admin` / `@colyseus/database` / `@colyseus/auth` 三条 deps；不动 `@colyseus/core` / `redis-driver` / `redis-presence` / `ws-transport` / `sdk` / `testing` / `tools`
- `pnpm-lock.yaml`：同步更新

### 文档

- `docs/admin-integration.md`：**全量重写**为 v2（决策表、复用什么/写什么表、迁移顺序、路由映射、文件清单、v2 待办）
- `docs/architecture.md`：§2 节点拓扑、§4 服务矩阵、§5 数据分区（移除 `postgres-admin`、新增单 DB + 双 schema 描述）、§8 安全边界、§9 进度行
- `docs/deployment.md`：§1 节点表（移除 `postgres-admin` 角色）、§2 docker-compose、§3 env 表（`ADMIN_DB_URL` 标注已废弃、`ENABLE_ADMIN` 改 v2 语义）、§5 admin 滚动策略 + 启动流程、§6 观测 metric、§7 备份（`postgres-admin` 行并入 `postgres-farm-game`）、§9 上线 checklist
- `docs/tech-stack.md`：§五"Admin ORM"行合并到"业务 ORM"行（强调"唯一 ORM"）；§十三 checklist 改 v2 路径
- `docs/ONBOARDING.md`：§7 自查清单单 ORM 规则加强措辞
- `packages/server/AGENTS.md`：§1 端口表 admin 行、§1 Admin 现状段落、§2 目录结构 admin/ 注释、§3.6 Admin 段（重写）、§6 反模式行（加入 `@colyseus/admin`）、§7 必读行
- `packages/server/README.md`：Architecture 段 `admin/` 目录注释（与 v2 对齐）

### 测试

- `packages/server/test/admin-disabled.test.ts`：**保留**，现状过测（`ENABLE_ADMIN=0` 时 `/admin/healthz` 返 `{enabled:false}`）。本 ADR 不改 admin 行为
- v2 实装时新增：`test/admin-ops-*.test.ts`（admin 装饰器、路由、审计落库、跨 schema 事务）

### 依赖图变更

```
移除 (3):
  @colyseus/admin       0.18.5
  @colyseus/auth        0.18.2
  @colyseus/database    0.18.3

保留 (Colyseus 框架 + 客户端 + 测试):
  @colyseus/core        0.18.12    ← WS 框架本体（realtime/ 强依赖）
  @colyseus/ws-transport  ^0.18.2  ← WS 传输层
  @colyseus/redis-driver  0.18.2   ← matchmaker 目录
  @colyseus/redis-presence 0.18.4  ← 跨进程 presence
  @colyseus/sdk         0.18.2     ← client-mini / server 测试
  @colyseus/testing     0.18.5     ← server devDep（integration tests）
  @colyseus/tools       0.18.3     ← server devDep（monitor）
```

## 4. 验收

- `pnpm install` 后 `pnpm-lock.yaml` 不再含 `@colyseus/admin` / `@colyseus/database` / `@colyseus/auth`；`node_modules/@colyseus/` 目录只剩 7 个包（core / ws-transport / redis-driver / redis-presence / sdk / testing / tools）
- `pnpm -r build` 全过（4 packages 全部 tsc 编译成功）
- `pnpm -r test` 全过（110+ 单测）
- `pnpm --filter @farm-game/server test:integration` 仍然可用（real PG；`@colyseus/testing` 还在 devDeps）
- `pnpm smoke:realtime` 仍然 9/9（`@colyseus/core` + redis-driver 都在）
- `grep -rn "@colyseus/admin\|@colyseus/database\|@colyseus/auth" packages/server/src/` → 无业务代码 import（仅占位文件 `src/admin/{index,schema,panel,db.config}.ts` 注释中提及，标注为 v1 废弃）
- `mountAdmin()` 行为兼容：`ENABLE_ADMIN=0` 仍挂 `/admin/healthz` 返 `{enabled:false}`，`ENABLE_ADMIN=1` 仍抛 `AdminConfigError`（v2 实装前不开放）
- 文档自洽：`docs/admin-integration.md` v2 + `docs/architecture.md` §2/§4/§5/§8/§9 + `docs/deployment.md` §1/§2/§3/§5/§6/§7/§9 + `docs/tech-stack.md` §五/§十三 + `packages/server/AGENTS.md` §1/§2/§3.6/§6/§7 + `packages/server/README.md` Architecture 段都描述 v2 路径，无 v1 / 双 ORM / `postgres-admin` 残留

## 5. 实施状态

- 本 ADR 已落地（本 PR）：
  - 全部文档更新（10 个文件，含 ADR 本文件）
  - `packages/server/package.json` 移除 3 条 deps
  - `pnpm-lock.yaml` 同步
  - `src/admin/*` 占位文件保留 + 注释标注 v1 废弃
- v2 实装待办（独立 PR）：
  - `mountAdmin()` 改为挂载 `/admin-ops/*` 路由
  - `authenticateAdmin` 装饰器
  - 6-8 个 `/admin-ops/*` 路由
  - `AdminUser` / `AdminAuditLog` MikroORM entities
  - `AdminRepo`
  - Refine 前端包（`packages/admin-web/`）+ 复制 shadcn 组件源码
  - Nginx 配置 + admin schema migration
  - ESLint `no-restricted-imports` 规则（D48）

## 6. 与历史决策的关系

| 历史 | 状态 | 本 ADR 处理 |
|---|---|---|
| `docs/admin-integration.md` v1（双 ORM 物理隔离） | 整篇废弃 | 文件内容全量重写为 v2；旧内容引用全部替换 |
| `packages/server/AGENTS.md` §3.6 v1 | 整段废弃 | 重写指向 v2 + `docs/admin-integration.md` |
| `packages/server/src/admin/{schema,panel,db.config}.ts` 占位 | 改为"v1 标记" | 内容保留但 `@deprecated`，等 v2 实装时一并删除 |
| `ENABLE_ADMIN` 环境变量语义 | 含义微调 | 仍是 0/1 gate；=1 行为从"挂载 @colyseus/admin"改为"挂载 /admin-ops/* 路由"（v2 实装后） |
| `SESSION_SECRET` 环境变量 | 用途重定义 | 注释明确"预留，v2 admin 自建简单 JWT 时可作备用 cookie 密钥（暂未使用）" |
| `ADMIN_DB_URL` 环境变量 | 已废弃 | 文档标注"即使保留也会被忽略"；D44 已通过单 DB 单 ORM 决策从根上消除 |
| `JWT_SECRET_ADMIN` 环境变量 | **保留 + 加强** | 沿用 + `config.ts:197-201` 强制与业务 secret 不同 |
| `ENABLE_MOCK_AUTH` / `JWT_SECRET` / `SESSION_SECRET` 等 | **无影响** | 本 ADR 不动业务鉴权 |

## 7. 不在范围内但需在 v2 阶段决策

- admin ops 路由是否要走独立 rate limit（建议：是）
- admin 写业务表的权限粒度（建议：MVP 一个 admin role 即可，复杂 RBAC 留 v3）
- audit log 保留期（建议：与业务 retention 策略对齐；默认不删）
- admin 操作的脱敏（建议：审计日志里禁止存 player 隐私字段如 `wx.openid` raw，只存 hash 或 playerId）