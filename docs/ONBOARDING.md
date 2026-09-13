# farm-game — Onboarding

> QQ-农场类 2D 社交模拟经营游戏的 monorepo 工程。Cocos 微信小游戏（首发）+ 未来 React Native App，共用 Fastify + Colyseus + PostgreSQL + Redis 后端。
>
> 本文档是**新成员第一站**。预计 60 分钟让你跑起整套 dev 环境 + 模拟器 + 真机调试。读完本文件再去翻各 `packages/*/AGENTS.md` 与 [`docs/`](./) 下的专题文档。

## 0. 你要带什么来

| 工具 | 版本 | 用途 |
|---|---|---|
| macOS | 13+ | 真机调试需要 iPhone USB；Linux/Windows 也行但 WeChat devtools 截图权限麻烦（参考 runbook §11.10） |
| Node.js | ≥ 18（实测 26） | `pnpm` / `tsx` / Cocos CLI 都要 |
| pnpm | ≥ 9 | workspace 管理（`pnpm-workspace.yaml` 4 包） |
| Python 3 + Pillow | `pip3 install pillow` | 美术切片脚本（`scripts/slice-assets.py`） |
| Docker Desktop | latest | pg + redis + nginx（`packages/server/compose.yml`） |
| Cocos Creator | 3.8.8（**版本固定**） | `/Applications/CocosCreator.app` |
| 微信开发者工具 | **Stable 2.02.2608070**（**不是 RC 2607171**，有 SummerCompiler 回归） | `/Applications/wechatwebdevtools.app` |
| GitHub CLI | `gh` | PR 操作（可选） |

> ⚠️ 微信开发者工具版本是**强约束**。RC 2607171 必白屏（详见 `docs/cocos-runbook.md` §11.6）。

## 1. 5 分钟：clone + 装依赖

```bash
git clone git@github.com:<org>/farm-game.git
cd farm-game
pnpm install                       # 4 个 workspace 包一起装
pnpm -r build                      # 4 个包 tsc 都过
pnpm -r test                       # 110+ 单测全绿
```

预期：4 包 build 通过、110+ 测试通过、0 错误。如果有 error，看是否是 `pnpm-lock.yaml` 漂移（删了重装）。

## 2. 10 分钟：起后端 dev 三件套

新开 **3 个 terminal**：

```bash
# Terminal A — pg + redis + nginx（loopback 5432/6380/8080）
pnpm --filter @farm-game/server db:up
pnpm --filter @farm-game/server db:migrate

# Terminal B — Fastify HTTP on host:3000
cd packages/server
cp .env.example .env                # 第一次需要；ENABLE_MOCK_AUTH=1 / MAIN_DB_URL 都在里面
pnpm dev

# Terminal C — Colyseus WS on host:2567（独立进程，共享同一个 PG）
cd packages/server
pnpm dev:ws
```

**验证全栈连通**（在 Terminal A 跑）：

```bash
curl -s http://127.0.0.1:8080/api/healthz
# → {"ok":true,"uptime":<n>,"protocolVersion":"2.0.0"}

curl -s -X POST http://127.0.0.1:8080/api/auth/wechat \
  -H 'Content-Type: application/json' \
  -d '{"code":"mock_dev_cocos_simulator"}'
# → ok:true, data.player.gold: 500
```

> **nginx 是 8080 一端口前端**：`/api/* → host:3000`、`/ws → host:2567`、`/ → build/wechatgame/`。调试时统一用 8080，devtools / curl 都不用记端口。
>
> nginx 跑不通？99% 是 Terminal B/C 没起，或 `host.docker.internal` 在 Linux Docker 下解析失败（compose 注释里写了切换方法）。

辅助脚本（`packages/server/package.json`）：

```bash
pnpm db:status          # 看 pg/redis/nginx 三个容器
pnpm db:logs            # tail -f 三容器日志
pnpm db:shell           # 进 nginx 容器（默认），SERVICE=postgres|redis 切换
```

## 3. 20 分钟：Cocos 工程与微信模拟器

```bash
# Terminal D — Cocos bundle 重建（每次 src/runtime 或 src/net 改动都跑）
pnpm --filter @farm-game/client-mini build && \
  pnpm --filter @farm-game/client-mini build:cocos

# 打开 Cocos 编辑器
open -a "/Applications/CocosCreator.app"
# Dashboard → 打开其他项目 → 选 packages/client-mini

# 打开微信开发者工具，导入 packages/client-mini/build/wechatgame/
# （AppID 选「测试号」，勾上「不校验合法域名」）

# 关掉 Cocos 编辑器，让 IDE 占着 build dir 跑

# 在 IDE 顶部「编译」按钮（▶）触发首启
# 然后 Terminal E 跑 headless E2E（不需要 GUI 操作）：
node scripts/farm-sim-telemetry.mjs &           # 起 dev bridge @ 9877（命令轮询通道）
node scripts/farm-sim-bridge-e2e.mjs           # 28/28 验收：登录 → 种 → 浇 → 31s → 收 → 解锁
```

**第一次跑会卡住的 3 个坑**（必读 [`docs/cocos-runbook.md`](./cocos-runbook.md) §10）：

1. **`cli auto` 必须带 `--trust-project`**，否则 IDE 停在「信任项目」弹窗不编译（runbook §11.4）。
2. **首次构建后 `urlCheck` 被重置为 true**，必须重跑 `node scripts/patch-wechat-build.mjs`。
3. **DevTools「增强编译」禁用**（会破坏 Map/Set 迭代器，shared `EventBus.emit` 已加固过，别回退）。

## 4. 30 分钟：跑一次 60 秒模拟器截图

确认视觉基线：

```bash
# 上面 Terminal E 已经跑通；现在做"截图"
# 1. 截图需 IDE 授权一次（runbook §11.8）
/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide \
  -c farm-simulator simulator_screenshot \
  --project /Users/cairui/Code/farm-game/packages/client-mini/build/wechatgame \
  --wait 3 --optimize false
# 第一次会返回 pending auth taskId，去 IDE 弹窗点「允许」
# 2. 截完图打开看：6×4 isometric 菱形地块、上 12 绿下 12 棕的对比
# 3. 如果现实是"扁平矩形绿块"，回去检查 PLOT_DISPLAY 是否为 75×50
```

**视觉验收原则**（runbook §11.10）：

- 用 release build（`--build "platform=wechatgame;debug=false;…"`），不要用 debug（debug 有 FPS 浮层 + sprite AABB 红框）
- 截图要带真场景，dump 节点数不算视觉验证

## 5. 40 分钟：跑通 G2 实时协议

```bash
pnpm --filter @farm-game/server smoke:realtime
# 期望：所有协议断言通过（HTTP + WS 双进程对跑）

pnpm --filter @farm-game/server demo:loop
# 30s 完整闭环：登录 → 解锁 → 种 → 浇 → 收 → DB 一致
```

如果 smoke 失败，**先看日志再调代码**。`packages/server/src/` 下面有 30+ 个 `console.error` 标记的错误路径，都是 past regressions 留下的报警点。

## 6. 50 分钟：挑一个 first task

按"修改面 vs 风险"挑：

| 想熟悉的内容 | 推荐任务 | 风险 |
|---|---|---|
| 客户端 UI 调参 | 改 `packages/client-mini/assets/scripts/farm/layout.ts` 的某个 `UI.*` 数值，跑模拟器看效果 | 低 |
| 新地块场景 | 在 `scripts/make-plot-layout.mjs` 加 `--cols 8 --rows 4` 试 8×4 网格 | 低 |
| 新增 HTTP 路由 | `packages/server/src/farm/` 加一个 `/farm/foo` 路由 + 对应 service | 中 |
| WS 消息 | `packages/server/src/realtime/room.ts` 加一个 cmd handler | 中 |
| 协议层 | `packages/shared/src/protocol/` 加字段 → 编译 → 看 `pnpm -r build` 是否通过 | 高（双向） |
| 持久化 | `packages/server/src/db/sql/` 加 migration | 高（要 reset 测） |

强烈建议**第一个 PR 改 docs 或注释**——熟悉 git workflow + CI + review 节奏，比改代码风险低。

## 7. 60 分钟：自查清单

- [ ] `pnpm -r build && pnpm -r test` 通过
- [ ] 模拟器打开看到 6×4 菱形地块（不是扁平矩形）
- [ ] `pnpm db:status` 显示三个容器 healthy
- [ ] `curl http://127.0.0.1:8080/api/healthz` 返回 ok:true
- [ ] `pnpm --filter @farm-game/server smoke:realtime` 全过
- [ ] 你能说出 `playerId` / `operationId` / `revision` 三个 ID 各是什么用途
- [ ] 你能说出 `@farm-game/shared` 是"协议契约唯一来源"
- [ ] 你能说出"只有 MikroORM 一个 ORM，不要加 drizzle-orm"
- [ ] 你能说出"wx-compat 三件套必须在 SDK import 前求值"
- [ ] 你能说出"asset meta 必须 texture→sprite-frame，否则 boot failed"

如果还有 ❌，回去读对应章节。

---

## 文档地图（之后遇到问题去这里查）

| 你想知道什么 | 文档 |
|---|---|
| 项目状态、仓库结构、协议、命名规范 | [`/AGENTS.md`](../AGENTS.md) ← root |
| 后端架构、端口、ORM、WS 房间、leasing | [`/packages/server/AGENTS.md`](../packages/server/AGENTS.md) + [`/packages/server/README.md`](../packages/server/README.md) |
| 微信小游戏联调的所有坑（必读 §10） | [`./cocos-runbook.md`](./cocos-runbook.md) |
| Cocos editor ↔ runtime ↔ vendor bundle 的打包链 | [`./cocos-integration.md`](./cocos-integration.md) |
| 协议层 | [`/packages/shared/AGENTS.md`](../packages/shared/AGENTS.md) + [`./client-protocol.md`](./client-protocol.md) |
| 客户端 UI 11 模块 + 视觉规范 | [`/packages/client-mini/AGENTS.md`](../packages/client-mini/AGENTS.md) + [`./scene-spec-v24.md`](./scene-spec-v24.md) |
| React Native App（Phase 5 占位） | [`/packages/client-app/AGENTS.md`](../packages/client-app/AGENTS.md) |
| 架构图、ADR 列表 | [`./architecture.md`](./architecture.md) + [`./adr/`](./adr/) |
| 数据 schema / 数据迁移 | [`./data-schema.md`](./data-schema.md) |
| 部署 / 上线 | [`./deployment.md`](./deployment.md) |
| AI 美术出图 | [`./ai-art-report.md`](./ai-art-report.md) + [`./ai-art-prompts.md`](./ai-art-prompts.md) |

---

## 黄金规则（破坏任何一条就要回滚）

1. **没用户明确指令不 `git commit` / `git push`**（memory `workflow-rules.md` 第 1 条）
2. **不删 / 不改 v25 视觉设计稿**（`design-preview/_assets-*/`、`design-preview/v2*.html`）
3. **美术资产改动必须经真截图视觉走查**（dump 节点数不算）
4. **browser / GUI 操作只在 main agent 跑**（subagent 只读 / 编辑文件）
5. **改协议层必须双向同步**（server + client-mini + client-app + ADR）
6. **`MINIMAX_API_KEY` 出现在 chat = 已泄露**（memory `api-key-safety-rule.md`），立即轮换
7. **.env / secrets / build artifacts 不入库**（`.gitignore` 已覆盖）
8. **Cocos 引擎版本 3.8.8、WeChat devtools Stable 2.02.2608070**——别动这两个版本

违反任何一条，先 revert 再讨论。

---

## 拿到机器的第一天 / 第一周

| 时间 | 任务 |
|---|---|
| Day 1 | 跑完上面 60 分钟清单；选一个 first task（建议改 docs） |
| Day 2-3 | 读完 [`/AGENTS.md`](../AGENTS.md) + [`docs/architecture.md`](./architecture.md) + [`docs/adr/`](./adr/) 三件套 |
| Day 4-5 | 跟一个真实 ticket（建议从 bug fix 开始，understand the system before adding features） |
| Week 2 | 做一个 feature（protocol 字段 / UI 模块 / 新地块场景）；提第一个 PR |
| Week 3+ | 端到端负责一个故事，开始 review 别人的 PR |

---

## 求助通道

| 渠道 | 用途 |
|---|---|
| GitHub Issues | bug / feature 提案 |
| GitHub Discussions | 设计讨论 / 提问 |
| 项目记忆 `memory/` | ZCode agent 自动记忆（每次会话加载） |
| runbook §10 | 微信联调所有坑——出 bug 先翻这里 |

最后：**迷路了先去 [`/AGENTS.md`](../AGENTS.md)**——root AGENTS.md 是所有信息的索引。