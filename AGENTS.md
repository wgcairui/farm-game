# AGENTS.md — farm-game

> QQ-农场类 2D 社交模拟经营游戏的 monorepo 工程。Cocos 微信小游戏（首发）+ 未来 React Native App，共用 Fastify + Colyseus + PostgreSQL + Redis 后端。
>
> 本文件为后续 ZCode agent 的工作准则；**面向项目专属信息**，通用 TypeScript / pnpm 知识不重复。

> 🆕 **新人请先读 [`docs/ONBOARDING.md`](./docs/ONBOARDING.md)**（60 分钟跑通 dev 全流程 + 自查清单）。本文件是后续工作的索引；ONBOARDING.md 是入门第一步。

---

## 1. 项目状态（2026-09-13）

**Phase 2 G0→G3 + UI v13 已落地**，主干 `main` 干净，所有测试 + smoke + 模拟器 headless E2E 全绿。

| 项 | 状态 |
|---|---|
| `pnpm -r build` / `pnpm -r test` | ✅ 4 包全绿（单测 110+） |
| `pnpm smoke` / `pnpm --filter @farm-game/server smoke:realtime` | ✅ 13/13 + 9/9 |
| 微信开发者工具模拟器 headless E2E | ✅ 28/28（`scripts/farm-sim-bridge-e2e.mjs`） |
| 主页 UI（v13 素材 + 6×4 地块） | ✅ 11 模块 + 111 tests |
| **剩余待办** | 三尺寸视觉走查（375/390/430，需 GUI 一次） → 真机 G4 → G1.5 真实微信登录 |

**绝对不要做的事**（workflow-rules 已沉淀）：
- 没有用户明确指令不 `git commit` / `git push`；
- v25 视觉设计稿（`design-preview/_assets-*/`、`design-preview/v2*.html` 等）不动；
- 美术资产（`packages/client-mini/assets/`、`generated/`、`assets/`）有改动必须经视觉走查；
- browser / GUI 操作只在 main agent 执行，subagent 用 `Agent` 工具委派只读 / 编辑任务。

---

## 2. 仓库结构（关键目录）

```
farm-game/
├── packages/
│   ├── shared/         # 客户端/服务端共享：types / protocol / time / eventbus / logic / persistence
│   ├── server/         # Fastify HTTP + Colyseus WS + MikroORM（唯一 ORM；@colyseus/admin 占位）
│   ├── client-mini/    # Cocos Creator 3.8.8 微信小游戏：src/cc + assets/scripts + net + runtime
│   └── client-app/     # React Native iOS/Android API + GameStore（无 RN 依赖）
├── scripts/            # slice-assets / make-plot-layout / farm-sim-bridge-e2e / patch-*
├── docs/               # 架构 + ADR + Cocos runbook + 视觉规范 + 实施计划
├── design-preview/     # v25 视觉候选 + Python 工具（仅 .gitignore 白名单文件入库）
├── assets/             # 美术源（与最终 Cocos 资源共用）
├── pnpm-workspace.yaml # 4 packages 声明
└── tsconfig.base.json  # 严格 TS（noImplicitAny / noImplicitOverride / isolatedModules）
```

子包细节见各 `packages/*/AGENTS.md`。

---

## 3. 常用命令（按场景）

### 安装 / 构建 / 测试
```bash
pnpm install                                # 装 workspace 依赖
pnpm -r build                               # 4 packages 全部 tsc 通过
pnpm -r test                                # 全部单测
pnpm lint:tsc                               # 根级 tsc -b 编译检查
pnpm smoke                                  # server 协议 smoke（13/13）
```

### 后端起本地服务（dev 三件套）
```bash
pnpm --filter @farm-game/server db:up       # docker compose 起 PG:5432 + Redis:6380
pnpm --filter @farm-game/server db:migrate  # 跑 MikroORM 迁移
pnpm --filter @farm-game/server dev         # Fastify HTTP @ :3000
pnpm --filter @farm-game/server dev:ws      # Colyseus WS @ :2567（独立进程）
pnpm --filter @farm-game/server smoke:realtime  # HTTP+WS 双真实进程对跑
pnpm --filter @farm-game/server test:integration  # 真实 PG 集成测试
pnpm --filter @farm-game/server demo:loop   # 30s 真实等待玩法闭环
```

### Cocos 微信小游戏联调
```bash
# 1. 重建 Cocos bundle（src/runtime + src/net → assets/scripts/vendor/farm-online.js）
pnpm --filter @farm-game/client-mini build && \
  pnpm --filter @farm-game/client-mini build:cocos

# 2. 重新生成地块布局（改后必须 Cocos 重建）
node scripts/make-plot-layout.mjs

# 3. 模拟器 headless E2E
node scripts/farm-sim-bridge-e2e.mjs

# 4. 资产管线（如美术批次更新）
python3 scripts/slice-assets.py
node scripts/fix-cocos-sprite-metas.mjs     # texture→sprite-frame，否则首个 key 就 boot failed
node scripts/patch-wechat-build.mjs         # 微信构建补丁
node scripts/patch-release-build.mjs        # release 包补丁

# 5. minimax 直出新按钮 sprite（M6/M7 pattern）—— runbook §11.11
zsh -lic 'python3 /tmp/gen_side_btns.py'        # 7 张 button PNG 直出 + PIL alpha-key
python3 /tmp/gen_sprite_meta.py <png...>         # 写 sprite-frame .meta（无 .meta 的新文件）

# 6. funplay-cocos-mcp 调试（main agent only）—— runbook §11.12
#    一次性装：见 §11.12①；.gitignore 加 extensions/ + funplay-cocos-mcp.config.json
#    一次性流程：set_preview_mode gameView → run_project_preview → 
#    execute_scene_script context=scene code="..." (attach OnlineFarm) → 
#    capture_game_screenshot outputPath=/tmp/shot.png
```

完整流程见 [`docs/cocos-runbook.md`](./docs/cocos-runbook.md)（§10 联调坑必读 + §11.11 sprite 双层 pattern + §11.12 MCP 调试经验）。

---

## 4. 架构与层规则

### 4.1 协议契约唯一来源：`@farm-game/shared`
- HTTP/WS/Auth/ErrorCode 全部由 `packages/shared/src/protocol/` 导出；
- 客户端与服务端**只通过 shared 类型通讯**，禁止自行定义 DTO；
- 改协议必须同步两个端 + 更新对应 ADR。

### 4.2 持久化层（ADR-0001 / 0003）
- **当前**：单一 PostgreSQL 16，**唯一 ORM = MikroORM**（业务库 players / plots / steal_records / crop_configs）；
- Redis 仅用于 Colyseus Driver / Presence / 缓存，**不**存业务状态；
- `@colyseus/admin` 仅是 **Phase 2 占位骨架**（`src/admin/index.ts`，`ENABLE_ADMIN=0` 默认关闭，开启即抛 `AdminConfigError`）；
- Drizzle / admin 库 / `@colyseus/database` **当前不存在**，将来真做 admin 面板才引入，且必须物理隔离（见 `src/admin/index.ts` 注释）；**业务代码（MikroORM 侧）禁止 import drizzle-orm**。

### 4.3 Cocos 工程结构（client-mini）
- `src/cc/` — Cocos editor 可见的入口（被 `assets/scripts/` 通过 build 脚本引用）；
- `src/runtime/online.ts` — 服务端权威 + 乐观回滚 + revision 守卫的运行时；
- `src/net/` — HttpTransport（fetch/wx.request 注入缝）+ FarmHttpClient + FarmRealtimeClient + `wx-compat.ts`（**必须在 SDK import 前求值**，否则 colyseus.js#161 会爆）；
- `assets/scripts/farm/` — Cocos UI 模块（11 个文件，`layout.ts` 是单一调谐点）；
- `assets/scripts/vendor/farm-online.{js,d.ts}` — `src/runtime/online.ts` 编译产物，**d.ts 与 .ts 手动同步**；
- `assets/scenes/Main.scene` — 唯一场景，Cocos editor 内编辑；
- `assets/resources/game/` — `slice-assets.py` 产物 + `plot-layout.json`，Cocos 直接 import。

### 4.4 关键约束
- **wx-compat 三件套**必须在 SDK import 前求值（runbook §10）；
- **DevTools「增强编译」禁用**（会破坏 Map/Set 迭代器协议，shared `EventBus.emit` 已加固）；
- **headless E2E 三铁律**：`cli auto … --trust-project` 不带就卡信任弹窗不编译、dev bridge 命令走端口 9877 路径 get/call（沙箱禁 eval/new Function）、官方 wechatide 工具面截图/画布触摸需一次 GUI 授权；
- 素材 meta 必须 `texture → sprite-frame`，否则首 key 就 boot failed；
- 微信开发者工具用 **Stable 2608070**（RC 2607171 SummerCompiler 有回归）；
- Cocos 引擎版本固定 **3.8.8**。

### 4.5 编号 / ID
- `playerId` = `p_<base32>`，全局唯一；
- `operationId` = 客户端生成的幂等键，命令匹配 + 重发安全；
- `revision` = 服务端修订号，玩家金币/地块变更单调递增，乐观更新用其做守卫。

---

## 5. 编码规范

### TypeScript
- 严格 TS（继承 `tsconfig.base.json` 的 strict + noImplicitOverride + isolatedModules）；
- ESM only（`"type": "module"`），所有跨包 import 显式带 `.js` 后缀（即使源是 .ts）；
- `void` 显式标注异步函数返回；
- 错误用 `Error` 子类 + 显式 `name` + `code`（参考 `FarmApiError` / `FarmWsError`）。

### 命名 / 路径
- 包名 `@farm-game/<name>`（workspace 协议）；
- 文件：`kebab-case.ts`（`farm-sim-bridge-e2e.mjs`、`plotView.ts` 兼容 Cocos）；
- 类型 / 类：`PascalCase`；函数 / 变量：`camelCase`；
- Cocos 节点：`PascalCase` 或 `snake_case` 视场景，`PlotView` 这类 UI 类保持 PascalCase。

### 日志
- 后端统一 `pino`；
- 客户端禁止 `console.log`（调试时临时加，打完包前清掉）；
- 所有错误路径必须 log + 触发对应的 EventBus 事件。

### 视觉 / UI
- 设计空间 **720×1280**（`packages/client-mini/assets/scripts/farm/layout.ts` 的 `DESIGN_WIDTH/HEIGHT`）；
- Cocos 坐标系 **center-origin**（x ∈ [-360, 360], y ∈ [-640, 640]）；
- 屏幕适配 `FIXED_HEIGHT`；Fit-Height 下 phone (375/390/430) 可见宽度 ≈ 591，边锚 UI 走 `Widget`；
- 地块网格固定 **6×4 = 24** plots（6 unlocked，18 locked），pitch **75×47**；
- 改地块布局：编辑 `scripts/make-plot-layout.mjs` 然后 `node scripts/make-plot-layout.mjs` 重生成 `assets/resources/game/plot-layout.json`，**Cocos 内必须重建**；
- 视觉验收靠真截图（release build 模拟器或真机），不靠 dump 节点数。

---

## 6. 改敏感区域前必读

| 改动 | 必读文档 |
|---|---|
| 协议（types / DTO / ErrorCode） | [`docs/architecture.md`](./docs/architecture.md) · [`docs/client-protocol.md`](./docs/client-protocol.md) · [`docs/adr/`](./docs/adr/) |
| WS / Colyseus 房间 | [`docs/adr/0004-g2-ws-protocol-and-auth.md`](./docs/adr/0004-g2-ws-protocol-and-auth.md) · [`docs/adr/0005-g2-realtime-ops.md`](./docs/adr/0005-g2-realtime-ops.md) · [`docs/state-sync.md`](./docs/state-sync.md) |
| 持久化 / 数据库 | [`docs/adr/0003-g1-persistence-and-commands.md`](./docs/adr/0003-g1-persistence-and-commands.md) · [`docs/data-schema.md`](./docs/data-schema.md) · [`packages/server/compose.yml`](./packages/server/compose.yml) |
| Cocos 工程 / UI / 联调 | [`docs/cocos-runbook.md`](./docs/cocos-runbook.md)（必读 §10 坑）· [`docs/cocos-integration.md`](./docs/cocos-integration.md) |
| 视觉 / 美术 | [`docs/scene-spec-v24.md`](./docs/scene-spec-v24.md) · [`docs/visual-repair-plan-v24.md`](./docs/visual-repair-plan-v24.md) · [`docs/implementation-plan-ui-v13.md`](./docs/implementation-plan-ui-v13.md) |
| 出图 / AI 资产 | [`docs/ai-art-report.md`](./docs/ai-art-report.md) · [`docs/ai-art-prompts.md`](./docs/ai-art-prompts.md) · **MINIMAX_API_KEY 在交互 zsh env 用 `zsh -lic`，不要硬编码 / 贴 chat** |
| 部署 / 上线 | [`docs/deployment.md`](./docs/deployment.md) |

---

## 7. 已知坑（速查）

- 微信开发者工具：`cli auto … --trust-project`（不带就卡信任弹窗不编译）；
- DevTools「增强编译」会破坏 Map/Set 迭代器，**禁用**；
- babel enhance 迭代器禁令 — 任何 `for...of` 经过 Babel 编译可能丢失协议；
- shared dist 陷阱：跨包改动如果只改 `src/` 没 `build`，消费方拿到的还是旧 `.d.ts`；
- 当前**只有** MikroORM 一个 ORM：`@colyseus/admin` 是占位骨架（`ENABLE_ADMIN=1` 即抛 `AdminConfigError`），**不要**给业务代码加 `drizzle-orm` / `@colyseus/database` import；
- minimax image-01：`image_base64` 是数组；`subject_reference` 只支持 character（无 outpainting）；模型不会数格子；
- sprite-sheet 4×2 → blob extraction 用灰底 + 粗描边（白物在浅底会被 key 掉）；
- API Key 安全：**任何 chat 里贴过的 key = 已暴露**，立即轮换。

更多见项目记忆 [`memory/MEMORY.md`](.zcode/cli/memories/projects/farm-game-848868ab67a8f96a/memory/MEMORY.md) 与 [`workflow-rules.md`](.zcode/cli/memories/projects/farm-game-848868ab67a8f96a/memory/workflow-rules.md)。
