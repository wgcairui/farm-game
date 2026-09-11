# Farm Game

类似 QQ 经典农场的 2D 社交模拟经营游戏。**全局后端**服务微信小游戏（Cocos 3.8）+ 未来 iOS / Android App（React Native）。

## 当前状态

**Phase 1 骨架已落地（2026-09-11）**：

- pnpm monorepo（4 packages）
- `packages/shared` 协议契约：15 单测全绿
- `packages/server` Fastify HTTP：4 路由 + admin 边界 + 7 单测 + smoke 13/13 全过
- `packages/client-mini` Cocos 兼容层 + headless 业务系统：5 单测覆盖核心循环
- `packages/client-app` RN API + GameStore + 类型契约：7 单测
- 5 份架构文档（[docs/architecture.md](./docs/architecture.md) · [deployment.md](./docs/deployment.md) · [client-protocol.md](./docs/client-protocol.md) · [state-sync.md](./docs/state-sync.md) · [admin-integration.md](./docs/admin-integration.md)）

**视觉规范未关闭**：[visual-repair-plan-v24.md](./docs/visual-repair-plan-v24.md) 仍按 v25 路线推进；本 PR 不动设计稿。

## 仓库结构

```
farm-game/
├── packages/
│   ├── shared/              # 客户端/服务端共享：types / protocol / time / eventbus / logic
│   ├── server/              # Fastify HTTP + Colyseus WS + MikroORM 主库 + admin 占位
│   ├── client-mini/         # Cocos 微信小游戏：cc stub + 业务系统 + headless runtime
│   └── client-app/          # React Native iOS/Android：api + GameStore（无 RN 依赖）
├── scripts/
│   ├── smoke-protocol.ts    # 端到端 smoke：跑 4 个 HTTP 路由，验证 PROTOCOL_VERSION
│   └── seed-admin.ts        # Phase 3 admin seed 占位
├── docs/                    # 5 架构文档 + 视觉规范 + Cocos 集成指南
├── design-preview/          # v25 视觉候选 + Python 工具（gitignore 历史版本）
├── assets/                  # 美术源（与设计稿/最终 Cocos 资源共用）
├── package.json             # pnpm workspace 根
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 快速开始

```bash
pnpm install                       # 安装 workspace 依赖
pnpm -r build                      # shared + server + client-mini + client-app 全部 tsc 通过
pnpm -r test                       # shared 15 + server 7 + client-mini 5 + client-app 7 = 34/34 全绿
pnpm smoke                         # 13/13 协议校验通过
```

## 客户端矩阵

| 客户端 | 阶段 | 启动方式 |
|---|---|---|
| 微信小游戏（Cocos 3.8） | Phase 4 起建 Cocos 工程 | `pnpm --filter @farm-game/client-mini build` |
| iOS / Android App（React Native） | Phase 5 起建 RN 工程（expo prebuild） | `pnpm --filter @farm-game/client-app build` |
| H5（预留） | Phase 6+ | 同 client-mini，跑在 Cocos H5 内核 |

## 服务端矩阵

| 服务 | 角色 | Phase 1 状态 |
|---|---|---|
| api (Fastify HTTP) | /auth, /crop, /player, /farm, /healthz | ✅ 可启动 |
| ws (Colyseus) | 实时房间（Phase 2） | ⌛ 占位 |
| admin (@colyseus/admin) | 后台面板 | ⌛ ENABLE_ADMIN=0 占位 |
| postgres-main | MikroORM 业务库 | ⌛ docker compose |
| postgres-admin | Drizzle admin 库 | ⌛ docker compose |
| redis | Presence / Driver / 缓存 | ⌛ docker compose |

## 文档索引

**架构**
- [架构总览](./docs/architecture.md) ⭐
- [部署手册](./docs/deployment.md)
- [客户端协议契约](./docs/client-protocol.md)
- [状态同步策略](./docs/state-sync.md)
- [@colyseus/admin 集成](./docs/admin-integration.md)

**视觉 / 设计**
- [视觉修正实施计划 v24](./docs/visual-repair-plan-v24.md)
- [主页场景设计规范 v24](./docs/scene-spec-v24.md)
- [Cocos 集成指南](./docs/cocos-integration.md)
- [AI 出图报告](./docs/ai-art-report.md) · [出图提示词](./docs/ai-art-prompts.md)

**策划 / 数据**
- [功能清单 (MVP)](./docs/mvp-features.md)
- [数据表设计](./docs/data-schema.md)
- [技术选型清单](./docs/tech-stack.md)
- [线下农场架构](./docs/physical-farm-architecture.md)
- [v25 Subagent 实施计划](./docs/implementation-plan-v25-subagents.md)

## Phase 2+ 路线

- **Phase 2**：MikroORM 实体 + 迁移实装；Colyseus FarmRoom（schema + clock + message handlers）；好友/偷菜；Redis Presence
- **Phase 3**：admin 子模块实装（Drizzle 连接 + seed 脚本 + Redis rate limiter）；admin-1 节点上线
- **Phase 4**：建 client-mini 的 Cocos Creator 3.8 工程；`./cc/*` 切到 `cc`
- **Phase 5**：建 client-app 的 RN 工程（expo prebuild）；Sign in with Apple / Google；IAP / Google Play Billing
- **Phase 6**：多区多活 + Postgres 主从 + Redis Cluster
- **视觉**：v25 V01-V12 修复走 [visual-repair-plan-v24.md](./docs/visual-repair-plan-v24.md)