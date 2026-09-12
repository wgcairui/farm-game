# 部署手册（Deployment Guide）

> 版本：v1 · 2026-09-11
> 适用：Phase 1（单节点起步）。Phase 2+ 增量更新。
> 配套：[architecture.md](./architecture.md) · [admin-integration.md](./admin-integration.md)

## 1. 节点角色清单

Phase 1 在单台开发机上跑全部角色；Phase 2 起按角色拆分。

| 角色 | CPU / RAM | 镜像 | 启动命令 | 探针 | 端口（默认） |
|---|---|---|---|---|---|
| api | 2 vCPU / 4 GB | farm-game-server | `node dist/index.js` | `GET /healthz` | 3000 |
| ws | 2 vCPU / 4 GB | farm-game-server | `ENABLE_WS=1 node dist/realtime/serve.js` | `ws ready` | 2567 |
| admin | 1 vCPU / 2 GB | farm-game-server | `ENABLE_ADMIN=1 node dist/admin.js` | `GET /admin/healthz` | 2568（**内网**） |
| postgres-main | 2 vCPU / 4 GB | postgres:16 | `postgres -c shared_buffers=1GB` | `pg_isready` | 5432 |
| postgres-admin | 1 vCPU / 2 GB | postgres:16（同集群不同 database） | 同上 | 同上 | 5432 |
| redis | 1 vCPU / 2 GB | redis:7 | `redis-server --appendonly yes` | `PING` | 6379 |
| nginx | 1 vCPU / 1 GB | nginx:1.27 | `nginx -g 'daemon off;'` | `GET /healthz` | 80 / 443 |

**节点角色**与上文架构图一一对应：`api-1` / `ws-1` / `admin-1` 是进程角色，`postgres-main` / `postgres-admin` / `redis` / `nginx` 是基础设施。

## 2. 起步：docker-compose.yml

`packages/server/compose.yml` 已写满（Phase 2 启用）。 Phase 1 开发者本地直接：

```bash
docker compose -f packages/server/compose.yml up -d postgres-main postgres-admin redis
pnpm dev:server          # tsx watch
```

## 3. 环境变量表

`@farm-game/server` 启动时读取以下变量（详见 `packages/server/src/config.ts`）：

| 变量 | 默认 | 必填 | 说明 |
|---|---|---|---|
| `NODE_ENV` | development | 否 | production 禁用 dev 日志 |
| `PORT` | 3000 | 否 | api 端口 |
| `HOST` | 0.0.0.0 | 否 | api 监听地址 |
| `JWT_SECRET` | `dev-secret-change-me` | **生产必填** | 业务 JWT 签发 |
| `JWT_SECRET_ADMIN` | `dev-admin-secret-change-me` | **生产必填** | admin JWT |
| `SESSION_SECRET` | `dev-session-change-me` | **生产必填** | @colyseus/auth cookie |
| `MAIN_DB_URL` | null | Phase 2 | `postgres://user:pw@host:5432/main` |
| `ADMIN_DB_URL` | null | Phase 2 | `postgres://user:pw@host:5432/admin` |
| `ENABLE_ADMIN` | 0 | 否 | 1 = 挂载 @colyseus/admin（要求 ADMIN_DB_URL 已就绪） |
| `LOG_LEVEL` | info | 否 | pino 等级 |

## 4. 支付回调安全（Phase 2 启用）

- 微信支付：HMAC-SHA256，密钥轮换周期 90 天
- Apple IAP：App Store receipt 校验 + JWS
- Google Play Billing：Signed Purchase Data + Ed25519
- 防重放：Redis `SET nonce EX 600 NX`；命中即拒绝
- 所有 callback 路由：`POST` + `application/json` + `Content-Length ≤ 64KB`

## 5. 滚动更新策略

不同进程不同策略：

| 角色 | 策略 | 说明 |
|---|---|---|
| api | PM2 `reload`（零停） | 进程间不共享内存；reload 期间新流量由其它实例接管 |
| ws | graceful：`onDispose()` flush 所有房间状态到 Postgres | Colyseus 自动禁止新连接，旧连接允许完成当前消息 |
| admin | **先停再启** | rate limiter 状态丢失可接受；不在负载峰值期 |
| postgres | 主从切换需手工 | Phase 4 起启用主从 |
| redis | 主从切换需手工 | Phase 4 起启用主从 |

### WS 滚动更新示例

```bash
pm2 reload ws-1   # reload 当前实例
# 等 30s 让该实例的房间全部 onDispose
# 再 reload ws-2
```

### Admin 节点首次启动流程（Phase 3）

```bash
ADMIN_DB_URL=... ENABLE_ADMIN=1 pnpm seed-admin   # 占位脚本，Phase 3 实装
pm2 start dist/admin.js --name admin-1
```

## 6. 观测

### 日志

`pino` 直出 ndjson 到 stdout。容器内 `kubectl logs` / `docker logs` 直接消费。结构化字段：
- `service`: 固定 `farm-game-server`
- `req.id`: Fastify requestId
- `req.method/url/host/remoteAddress`
- `res.statusCode`
- `responseTime`

### 指标（Phase 2 接入）

`@metrics` 包导出 Prometheus 文本格式：
- `farm_http_request_total{method, route, status}`
- `farm_http_request_duration_seconds_bucket{...}`
- `farm_ws_connections{room}`
- `farm_db_pool_acquire_seconds{db}`
- `farm_admin_rate_limited_total`

### 告警阈值

- HTTP 5xx 比例 > 1% 持续 5 分钟
- WS 房间数 / 进程 > 1000
- MikroORM 连接池等待 > 200ms
- Postgres replication lag > 10s

## 7. 备份与恢复

| 数据 | 备份方式 | RTO | RPO |
|---|---|---|---|
| postgres-main | `pg_dump` + WAL archiving | 1h | 5min |
| postgres-admin | `pg_dump`（24h 一次） | 24h | 24h |
| redis | AOF rewrite + RDB snapshot | 30min | 0（重启丢失活跃会话） |

admin DB 可容忍 24h 数据丢失（只存用户/审计，业务数据在 main）。

## 8. 系统调优（参考 PRD §7.4）

```
ulimit -n 65535
net.core.somaxconn = 65535
fs.file-max = 1000000
net.ipv4.tcp_tw_reuse = 1
```

## 9. 上线 checklist

- [ ] `pnpm -r build && pnpm -r test && pnpm smoke` 三件套全过
- [ ] `ENABLE_ADMIN=0` 默认关闭；开启前必须 `pnpm seed-admin`
- [ ] JWT_SECRET / JWT_SECRET_ADMIN / SESSION_SECRET 均已从环境注入且不在源码
- [ ] nginx `/admin/*` 限制内网 IP
- [ ] Prometheus scrape 配置就绪
- [ ] Postgres `pg_dump` cron 已加
- [ ] Redis AOF 已开
- [ ] 压测报告归档（目标：4 vCPU 单机 5k CCU）

---

## 10. Phase 2 单机运行手册（G4 收口）

> 本节为 G2 真实形态收口。前面章节里的端口表、角色表、滚动更新策略仍是 **Phase 1 规划稿**，与现网实际不一致时**以本节为准**。
>
> 适用：单台 Linux 物理机 / 虚拟机部署 HTTP + WS 两个 Node 进程 + PostgreSQL + Redis。

### 10.1 端口表（G2 实测）

| 角色 | 监听地址 | 端口 | 备注 |
|---|---|---|---|
| api（Fastify HTTP） | `127.0.0.1` | **3000** | 业务路由 + `/healthz` |
| ws（Colyseus Realtime） | `127.0.0.1` | **2567** | `farm` 房间；matchmaker 直接暴露 |
| postgres-main | `127.0.0.1` | **5432** | `compose.yml`：`127.0.0.1:5432:5432` |
| redis | `127.0.0.1` | **6380** | `compose.yml`：`127.0.0.1:6380:6379` ——宿主端口 **6380**（非默认 6379）用于避让本机其它项目的 6379 占用 |
| nginx | `0.0.0.0` | 80 / 443 | 反向代理 `/api` 和 `/ws` |

### 10.2 本地开发运行顺序

```bash
# 终端 1：起 PostgreSQL + Redis（docker compose，来自 packages/server/compose.yml）
pnpm --filter @farm-game/server db:up

# 等待容器 healthy，再跑迁移（db-init 已自动建库；这里只挂 schema）
pnpm --filter @farm-game/server db:migrate

# 终端 2：HTTP 入口（tsx watch，自动重载）
pnpm --filter @farm-game/server dev          # → http://127.0.0.1:3000

# 终端 3：WS 入口（独立进程，共享同一 PostgreSQL）
pnpm --filter @farm-game/server dev:ws       # → ws://127.0.0.1:2567
```

无需 `pnpm -r build` —— `dev` / `dev:ws` 直接走 `tsx watch`。生产才需要 `pnpm build` 出 `dist/`。

### 10.3 生产单机拓扑

#### nginx server 块示例

```nginx
# /etc/nginx/sites-available/farm-game.conf
upstream farm_api {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream farm_ws {
    server 127.0.0.1:2567;
    keepalive 8;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # 业务 HTTP
    location /api/ {
        proxy_pass         http://farm_api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # Colyseus WebSocket（浏览器 / H5）
    location /ws/ {
        proxy_pass         http://farm_ws/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_read_timeout 3600s;            # 长连接
    }
}

# 微信小游戏不经过此 nginx —— 客户端直接连业务域名（wss://api.example.com/ws/）。
# 在「微信公众平台 → 开发管理 → 服务器域名」里把 wss 域名配到 https://api.example.com，
# 不需要单独的 wss 子域。
```

#### systemd unit 示例

`/etc/systemd/system/farm-api.service`：

```ini
[Unit]
Description=Farm Game HTTP API
After=network.target farm-game-postgres.service
Wants=farm-game-postgres.service

[Service]
Type=simple
User=farm
Group=farm
WorkingDirectory=/opt/farm-game
EnvironmentFile=/etc/farm-game/env
ExecStartPre=/usr/bin/pnpm --filter @farm-game/server build
ExecStart=/usr/bin/node /opt/farm-game/packages/server/dist/index.js
Restart=on-failure
RestartSec=5
# 日志走 journald：journalctl -u farm-api -f
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/farm-ws.service`：

```ini
[Unit]
Description=Farm Game WS (Colyseus)
After=network.target farm-game-postgres.service farm-game-redis.service
Wants=farm-game-postgres.service farm-game-redis.service

[Service]
Type=simple
User=farm
Group=farm
WorkingDirectory=/opt/farm-game
EnvironmentFile=/etc/farm-game/env
ExecStartPre=/usr/bin/pnpm --filter @farm-game/server build
ExecStart=/usr/bin/node /opt/farm-game/packages/server/dist/realtime/serve.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`/etc/farm-game/env`（一个 `KEY=VALUE` 一行的 EnvironmentFile）示例：

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
WS_HOST=127.0.0.1
WS_PORT=2567

# secrets —— 必填，禁止使用 .env.example 的默认值
JWT_SECRET=<64 字符随机>
JWT_SECRET_ADMIN=<另一段 64 字符随机>
SESSION_SECRET=<第三段 64 字符随机>

MAIN_DB_URL=postgres://farm:<pw>@127.0.0.1:5432/farm_game
REDIS_URL=redis://127.0.0.1:6380/0

# 安全红线（见 10.5）
ENABLE_MOCK_AUTH=0
ENABLE_ADMIN=0
CORS_ORIGIN=https://admin.example.com
```

PostgreSQL / Redis 各自有官方 systemd unit（apt 装 `postgresql-16` / docker 部署均可），这里不重复。

### 10.4 发布顺序

```bash
# 1) 构建（任一节点上跑一次即可，产物通过 scp / 共享卷分发）
pnpm --filter @farm-game/server build

# 2) 迁移（advisory-lock 互斥，多实例并发执行也安全，ADR-0003）
pnpm --filter @farm-game/server db:migrate

# 3) 滚动重启：先重启 api（无连接粘性），再重启 ws
sudo systemctl restart farm-api
# 验证健康
curl -fsS http://127.0.0.1:3000/healthz

# 4) WS 必须「先排空再关库」：SIGTERM 走 graceful drain（ADR-0005 D41）
#    Colyseus gracefullyShutdown + drainActiveCommands(3s 期限)，房间排空后才关 ORM
sudo systemctl restart farm-ws
```

WS 单独重启时，连接由 nginx 摘除（关闭 keepalive + 客户端 colyseus-sdk 自动重连到其它节点）；房间所有权由 PostgreSQL 租约仲裁，重启后 `instanceId` 变化，旧租约自然过期（`LEASE_TTL_MS=15000`）。

### 10.5 安全红线清单（生产必检）

| 项 | 规则 | 失败后果 |
|---|---|---|
| `ENABLE_MOCK_AUTH` | **必须 = 0 或 unset**；`loadConfig` 会在 `NODE_ENV=production` 时拒绝启动 | 任何人可凭 `mock_xxx` 拿任意身份的 JWT |
| `JWT_SECRET` / `JWT_SECRET_ADMIN` / `SESSION_SECRET` | 全部从环境注入；不能等于 `.env.example` 的默认值；admin 与业务必须不同 | 默认值在源码里，等同于无鉴权 |
| `REDIS_URL` | **必填**；WS 进程启动时若为空会拒启（HTTP 进程不查） | 单进程 LocalDriver 不支持多 WS 实例扩缩容 |
| `MAIN_DB_URL` | 生产显式配置；不能为空 | `loadConfig` 拒启（ADR-0003 D30） |
| `CORS_ORIGIN` | 生产 **必须**显式配置（逗号分隔白名单）；未配置时 `origin: false` 直接拒跨域 | 默认 `origin: true` + `credentials: false` 在 dev 方便，但生产必须收紧 |
| `HOST` | `127.0.0.1`（走 nginx 反代），不要 `0.0.0.0` 直出 | 进程直接暴露公网 |

### 10.6 G1.5 待办：真实微信 jscode2session

接入点：`packages/server/src/auth/routes.ts` 的 `/auth/wechat` mock 分支（当前约 **L115** `if (code.startsWith(MOCK_CODE_PREFIX))`）。需要新增环境变量：

```bash
WX_APPID=<微信公众平台 → 开发管理 → 开发者ID(AppID)>
WX_SECRET=<同页 AppSecret(小程序)>)
```

实现要点（待 G1.5）：
- `code` 不以 `mock_` 开头 → 走 `https://api.weixin.qq.com/sns/jscode2session?appid=...&secret=...&js_code=${code}&grant_type=authorization_code`；
- 用返回的 `openid` 作为 subject（不要再用 raw code 字符串）；
- 把 `enableMockAuth === false && env === 'production'` 时的「mock 拒绝」分支替换成「非 mock 走 jscode2session」分支；
- 失败（`errcode !== 0`）→ `ErrorCode.WECHAT_CODE_INVALID` + 401。

实施时务必同步更新 `packages/shared/src/protocol/http.ts` 的 `WeChatLoginRequest` 与 admin-integration.md 的「mock 模式说明」段落。