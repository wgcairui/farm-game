# 技术选型清单

> 更新：2026-09-11 — Phase 1 monorepo 化，新增 pnpm + TypeScript Project References + 双客户端矩阵说明。

## 一、Monorepo 工具链

- **包管理**：pnpm 11+（启用 `workspace` + `allowBuilds`）
- **TypeScript**：`tsc -b` 项目引用（composite），根 `tsconfig.base.json` 统一编译选项
- **测试**：Node 内置 `node:test` + `tsx --import`（无 jest/vitest 依赖）
- **包结构**：
  - `packages/shared` — 类型与协议契约
  - `packages/server` — Fastify HTTP + Colyseus WS + MikroORM
  - `packages/client-mini` — Cocos 微信小游戏
  - `packages/client-app` — React Native iOS/Android

## 二、引擎：Cocos Creator 3.8（微信小游戏）

**为什么选 Cocos**：
- 微信小游戏支持最成熟，国内同类游戏首选
- 一套代码导出小程序（ H5 内核未来）+ H5
- TypeScript 一等公民，编辑器可视化
- 2D 性能经过大量商业项目验证

**版本**：Cocos Creator 3.8.x LTS（最新稳定版）

**引擎授权**（个人学习 / 年营收 < 100 万：免费；其它阶梯式付费）— **MVP/Phase 1 阶段不用付钱**。

> **Phase 1 状态**：`client-mini` 仅含 cc stub，业务系统脱离 Cocos 在 Node 下跑通。Cocos Creator 工程留 Phase 4 创建（详见 [architecture.md §9](./architecture.md)）。

## 三、语言：TypeScript

理由：
- Cocos Creator 原生支持 TS
- 类型系统避免运行时 bug
- 重构友好，Phase 2+ 扩展时收益大

## 四、双客户端矩阵

| 客户端 | 渲染 | 持久化 | 网络 |
|---|---|---|---|
| 微信小游戏 | Cocos Creator 3.8 | localStorage / `wx.setStorageSync` | wx.request + Colyseus WS |
| iOS / Android App | React Native | AsyncStorage | fetch + Colyseus WS |
| H5（预留） | Cocos 3.8 H5 内核 | localStorage | fetch + Colyseus WS |

两份客户端共享 `@farm-game/shared` 协议契约；UI 与生命周期各自实现。

## 五、后端（Phase 1 骨架）

| 组件 | Phase 1 | 选型理由 |
|---|---|---|
| HTTP 框架 | Fastify 5 | 高性能、QPS 30k+、TypeScript 一等公民 |
| WebSocket | Colyseus 0.18（Phase 2 实装） | 官方支持房间管理；uWebSockets.js 传输层 |
| 业务 ORM | **MikroORM 6** | Data Mapper + Unit of Work，批量性能优；与 PRD §3.5 一致 |
| Admin ORM | Drizzle（@colyseus/database 强依赖） | 仅 admin 范围使用；不接触业务表 |
| 数据库 | PostgreSQL 16 | 事务、JSONB、并发 |
| 缓存 / Presence | Redis 7（Phase 2） | Presence、Driver、Session、限流 |
| 进程管理 | PM2 fork | 每核一进程，独立端口 |
| 鉴权 | JWT (@fastify/jwt) | 无状态 |
| 日志 | pino | ndjson 结构化输出 |
| 监控 | Prometheus（Phase 2） | 与 pino 配套 |

## 六、Cocos 项目结构（client-mini）

```
packages/client-mini/src/
├── cc/                   # Phase 1 stub：ccclass/Component/Node/sys/EventTarget
├── cocos/
│   ├── systems/          # EconomySystem / InventorySystem / FarmSystem / ShopSystem
│   └── GameApp.ts        # 业务装配（Phase 4 改为 @ccclass + Cocos Component）
└── runtime/
    └── headless.ts       # Node 测试 / smoke 用的 headless 装配
```

**核心原则**：
- UI 层只读状态 + 发事件，不改状态
- 系统层改状态 + 发事件
- 单向数据流，可调试

## 七、React Native 项目结构（client-app）

```
packages/client-app/src/
├── net/api.ts            # ApiClient：fetch wrapper，含 PROTOCOL_VERSION / Platform header
├── store/GameStore.ts    # 纯 TS observable store（不依赖 react）
└── App.tsx               # Phase 5 实装为 RN root component（Phase 1 仅 stub）
```

## 九、必备 Cocos 插件

| 插件 | 用途 | 必装？ |
|------|------|--------|
| AssetsManager | 资源热更新 | ✅ Phase 2+ |
| AudioSource | 音效管理 | ✅ |
| Tween | 补间动画 | ✅ |
| LabelOutline | 文字描边 | 可选 |
| Spine / DragonBones | 骨骼动画 | Phase 2+ |

## 十、必须引入的第三方库

| 库 | 用途 | 备注 |
|---|---|---|
| `@farm-game/shared` | 客户端/服务端共享 | workspace:* |
| `eventemitter3` | 备用事件总线 | shared 内置 EventBus 已够用 |
| `uuid` | 生成玩家 id | `crypto.randomUUID()` |
| `dayjs` | 时间格式化 | Phase 2+ 用 |
| `@fastify/jwt` | JWT | server 端 |
| `pino` | 日志 | server 端 |
| `tsx` | TS 直接执行 | dev/script |
| `@types/node` | Node 类型 | dev |

**原则**：能不依赖就别装。`@farm-game/shared` 内置事件总线、时间管理、存储接口，已覆盖大部分需求。

## 十一、目录命名 & 代码规范

- 文件名：PascalCase（大驼峰）`FarmSystem.ts`
- 类名：PascalCase
- 方法名：camelCase
- 常量：UPPER_SNAKE
- 私有字段：`_` 前缀 `_coins`
- 事件名：`模块_动作` 命名 `plot_planted` `coins_changed`
- 跨包导入：必须用 `@farm-game/shared` 等 workspace 协议名，**禁止** `../../../shared`

## 十二、开发环境

| 工具 | 版本 |
|---|---|
| Node.js | ≥ 20 LTS |
| pnpm | ≥ 11 |
| TypeScript | 5.5.x |
| Cocos Dashboard | 最新；Phase 4 实装时锁定 3.8.x |
| 微信开发者工具 | 最新 |
| Xcode | 15+（Phase 5） |
| Android Studio | Hedgehog+（Phase 5） |
| VSCode + Cocos 插件 | 推荐 |

## 十三、风险点 Checklist（每次发版前过一遍）

- [ ] `pnpm -r build && pnpm -r test && pnpm smoke` 三件套全过
- [ ] 杀进程后存档可恢复（Phase 2 端到端验证）
- [ ] 时间戳改到 2030 年不会刷钱（TimeManager + 服务端校验）
- [ ] 仓库满时收获不丢失
- [ ] 没有 console.log 漏在生产（pino logger 兜底）
- [ ] `@colyseus/admin` 关闭时 `/admin/*` 返回 404（已有单测守护）