# @colyseus/admin 集成（Admin Integration）

> 版本：v1 · 2026-09-11
> 状态：Phase 1 占位（`ENABLE_ADMIN=0` 默认关闭，admin 子模块抛 `AdminConfigError`）
> 配套：[architecture.md §5](./architecture.md) · [deployment.md](./deployment.md)

## 1. 背景与决策

`@colyseus/admin` 是 Colyseus 官方后台面板，提供 admin 用户管理、审计日志、表格 introspection。它的运行时强依赖 `@colyseus/database`（Drizzle），不接受自定义存储层。

本仓库主库按 PRD §3.5 已选定 **MikroORM**。`@colyseus/admin` 与之**互斥**——同一进程里同一张表无法被两套 ORM 同时管理。

**决策**：双 ORM 共存，边界严格隔离。详见 [architecture.md §5 数据分区](./architecture.md)。

## 2. 双 ORM 共存边界

| 维度 | 主库（业务） | Admin DB |
|---|---|---|
| ORM | MikroORM | Drizzle（经 `@colyseus/database`） |
| 表 | `players`, `farm_plots`, `steal_records`, `crop_configs`, `friend_*` | `admin_users`, `admin_sessions`, `admin_audit_log` |
| 连接池 | MikroORM `pool: { min: 2, max: 15 }` | Drizzle node-postgres pool |
| 迁移 | MikroORM CLI（`migration:up`） | `@colyseus/database` 自带迁移命令 |
| 业务代码访问 | **唯一允许** | **禁止** |
| 配置文件 | `packages/server/src/db/mikro-orm.config.ts` | `packages/server/src/admin/db.config.ts` |
| README 警告 | "主库 ORM，**不是** admin 用的 ORM" | "Admin DB，**禁止**业务代码访问" |

物理上：两块 database，**同一 Postgres 集群、不同 `database` 名**。

## 3. 迁移顺序

Phase 2 起执行：

1. **数据库创建**：`CREATE DATABASE farm_admin;`（与 `farm_main` 同实例）
2. **依赖就绪**：`@colyseus/database` `@colyseus/auth` `@colyseus/admin` 已在 `packages/server/package.json`，无需额外安装
3. **初始化 admin_users**：
   ```bash
   ADMIN_DB_URL=postgres://... pnpm --filter @farm-game/server migrate-admin
   ```
4. **首登 seed**（`scripts/seed-admin.ts`，Phase 3 实装）：
   ```bash
   ADMIN_DB_URL=... ADMIN_DEFAULT_USER=root ADMIN_DEFAULT_PASSWORD=$(openssl rand -hex 16) \
     pnpm seed-admin
   ```
5. **启动 admin 进程**：
   ```bash
   ADMIN_DB_URL=... JWT_SECRET_ADMIN=... SESSION_SECRET=... ENABLE_ADMIN=1 \
     pm2 start dist/admin.js --name admin-1
   ```

## 4. 架构红线（强制）

1. 业务代码（`packages/server/src/{auth,crop,player,farm,realtime}/**`）禁止 `import` 自 `drizzle-orm` 或 `@colyseus/database`
2. Admin 代码（`packages/server/src/admin/**`）禁止 `import` 自 `@mikro-orm/core`
3. 两 ORM 共用同一 Postgres 集群，但连接串完全不同（`MAIN_DB_URL` / `ADMIN_DB_URL`）
4. 跨库"无 FK"：admin 引用 `user_id`（业务 openid）用字符串字段，不在 DB 层加外键
5. Phase 2 引入 ESLint `no-restricted-imports` 规则自动校验上述 1、2 条

## 5. Bootstrap（首启流程）

```
首次部署：
  1. Postgres 集群就绪（docker compose up postgres-main postgres-admin）
  2. 创建 admin database: CREATE DATABASE farm_admin
  3. 运行 migrate-admin: 应用 Drizzle 迁移到 admin DB
  4. 运行 seed-admin:   创建首个 admin 用户，密码从 env 读取
  5. 启动 admin-1 节点: 启用 ENABLE_ADMIN=1
  6. nginx: 限制 /admin/* 仅内网访问

日常运维：
  - 改 admin 密码：POST /admin-api/auth/change-password
  - 增删 admin 用户：admin UI 或 POST /admin-api/users
  - 审计查询：GET /admin-api/audit-log
  - 玩家封禁：admin UI；后端调 packages/server/src/admin/routes.ts 的 webhook
```

## 6. 路由映射

| Path | Handler | 备注 |
|---|---|---|
| `GET /admin/` | admin SPA | React + Ant Design ProTable |
| `GET /admin-api/auth/login` | @colyseus/auth | cookie + CSRF |
| `GET /admin-api/tables` | @colyseus/database | introspection |
| `GET /admin-api/audit-log` | 自建 | 查 `admin_audit_log` |
| `POST /admin-api/users` | @colyseus/auth | CRUD admin 用户 |
| `POST /admin/banned-players/:openid` | `packages/server/src/admin/routes.ts` | 业务侧 webhook，封禁时同步吊销 JWT（Phase 3） |

## 7. 性能与限制

- admin rate limiter 默认 token-bucket（**进程内**），多 ws 节点会各持一份
- Phase 3 起切换为 Redis-backed limiter：`@colyseus/admin` 的 `rateLimit` 选项
- admin 进程负载低（管理面板请求稀疏），建议 1 vCPU / 2 GB

## 8. 当前 Phase 1 文件清单

| 文件 | 状态 |
|---|---|
| `packages/server/src/admin/index.ts` | `mountAdmin()` 占位；ENABLE_ADMIN=1 抛 `AdminConfigError` |
| `packages/server/src/admin/db.config.ts` | `connectAdminDb()` 占位 |
| `packages/server/src/admin/schema.ts` | 仅声明表名字符串常量 |
| `packages/server/src/admin/panel.ts` | `bootstrapAdminPanel()` 占位 |
| `packages/server/src/admin/routes.ts` | 空实现；Phase 3 填业务 webhook |
| `packages/server/src/db/mikro-orm.config.ts` | MikroORM 配置骨架（entities 空） |
| `packages/server/src/db/README.md` | 边界说明 |
| `scripts/seed-admin.ts` | Phase 3 实装 |
| `packages/server/test/admin-disabled.test.ts` | ENABLE_ADMIN=0 时 `/admin/*` 返回 404 | ✅ 通过 |

## 9. Phase 3 待办清单

- [ ] 实装 `connectAdminDb()`（pg + drizzle-kit migration）
- [ ] 实装 `scripts/seed-admin.ts`（bcrypt 哈希 + 环境变量注入默认密码）
- [ ] ESLint `no-restricted-imports` 规则
- [ ] admin rate limiter 切 Redis
- [ ] 玩家封禁 webhook
- [ ] 审计日志接入 pino