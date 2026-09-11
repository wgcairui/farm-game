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