# 下一步实施计划：持久化全局后端与小游戏联调

> 日期：2026-09-11
> 起点：`b0becb1`（Phase 1 monorepo 骨架）。
> 状态：待执行。本文件只制定计划，不代表以下功能已完成或获得实施授权。
> 本轮交付：计划文档及其 Git 提交；不启动数据库、不修改业务代码、不推送远端。

## 1. 目标与固定边界

下一实施阶段交付可持久化、服务端权威的核心循环：

**登录 → 获取本人农场 → 种植 → 浇水 → 成熟 → 收获 → 开垦 → 断线恢复 → 服务重启后恢复。**

- 后端是全局服务，不以微信 openid 作为全平台玩家主键；未来 RN iOS/Android 复用相同账户、协议和领域服务。
- 微信小游戏使用 Cocos Creator 3.8.x；App 使用 React Native，不走 Cocos 原生导出。
- pnpm workspace 继续保留四包布局；共享类型、协议与纯规则不依赖 Cocos、React Native、Fastify 或 ORM。
- 主业务库使用 MikroORM + PostgreSQL 16。`@colyseus/admin` 保留已批准的隔离方向，但本阶段仍默认关闭，不实现后台用户、Drizzle 连接或后台页面。
- 从单主机部署起步。HTTP、实时房间、数据库、Redis 是可独立部署的角色，不等于现在需要多台主机或多区多活。
- v25 设计稿继续冻结；不修改 `design-preview/`、既有美术资源和视觉修复任务，不把浏览器或 Node 测试当成小游戏真机验收。
- 每个可验证里程碑完成后直接 commit；不自动 push。功能实现与本次计划文档提交分开。

## 2. 当前基线与前置缺口

已有：四个 workspace、共享协议、Fastify HTTP 骨架、内存仓储、客户端 headless 系统、RN 方向的 API/store 模块。此前运行记录为 34 个单测与 13 个 smoke 断言通过；实施开始时必须重新跑，不能沿用历史结论。

尚未完成：真实微信登录、业务数据库实体与迁移、Colyseus 房间、Redis Presence/Driver、Cocos 工程、RN 工程、可用 admin。

优先核对并修正：

1. `packages/server/src/auth/routes.ts` 写入的自定义 `expiresAt` 不能替代 JWT 标准 `exp`；必须显式配置过期并测试拒绝过期 token。
2. mock 登录与默认 secret 目前仅适合作为本地骨架。生产必须拒绝 mock、缺失密钥和内存仓储。
3. `playerId = openid` 不适合作为多平台账户模型；认证身份与业务玩家必须分离。
4. `applyWater()` 当前按总时长折扣，不符合 PRD 的“剩余时间减少 5%”；成熟判断必须尊重已经持久化的 `matureAt`。
5. Fastify 路由 `any` 和 MikroORM 配置断言掩盖类型问题，需要按实际安装版本的官方文档与声明修正，而非继续绕过检查。
6. 文档提及的 `packages/server/compose.yml` 未在当前仓库中存在；部署命令、admin 路由、备份和扩容描述必须区分现有能力与目标设计。
7. 旧单机语义、PRD 和当前共享类型存在冲突：初始 6/8 块、`ready`/`ripe`、仓库出售/直接金币结算、枯萎。不能无说明地继续扩展。

## 3. 阶段关卡

### G0：统一契约与安全基线

**文件范围**
- `packages/shared/src/types/{player,plot,crop}.ts`
- `packages/shared/src/protocol/{auth,http,ws,error,version}.ts`
- `packages/shared/src/logic/growth.ts`
- `packages/server/src/{config,app}.ts`、`auth/*`、`db/mikro-orm.config.ts`
- 对应单测与 `docs/{data-schema,client-protocol,state-sync,tech-stack}.md`

**实施内容**
- 制定 ADR，明确业务玩家 ID、认证身份、状态机、经济闭环、配置版本及兼容策略。推荐以用户提供 PRD 为功能基准：24 块地、初始解锁 6 块、`locked/empty/growing/ripe`，种植扣种子成本、收获直接金币结算；旧仓库出售与枯萎仅作为历史原型，不默默混入新服务端闭环。涉及行为取舍须在执行前确认，不修改设计稿以迎合数据。
- 玩家内部 ID 与 provider identity 分离：身份唯一键包含 provider、应用/租户范围、provider subject。openid 不外泄至公共农场协议；跨端账户绑定必须双方验证，不自动按昵称、邮箱或猜测 unionid 合并。
- JWT 使用 `sub`、`iat`、`exp`、`iss`、`aud`；客户端展示的过期字段与 `exp` 保持一致。provider 不是设备平台，支付渠道不能由客户端平台 header 决定。
- mock 认证仅显式开启于本地/test；生产启动 fail-closed。密钥不进 Git、不写日志；默认监听本地回环地址。
- 采用真实 Fastify 类型和运行时 JSON Schema 校验，校验字符串长度、枚举、整数、索引边界；统一错误响应。
- 浇水纯函数输入服务端 `now`、当前 `matureAt`、`waterCount`：`nextMatureAt = now + ceil((matureAt - now) * 0.95)`；拒绝成熟后、超次数与非法输入。回放不能按原始总时长覆盖加速后的成熟时间。
- 共享协议发生破坏性变化时升 major；拒绝不支持的协议，增加负面测试。旧本地存档不作为可信云端资产导入。

**出口证据**：四包构建通过；过期 JWT、mock 生产启动、非法参数、协议不匹配、epoch=0、浇水边界都有自动化测试。ADR 与协议文档一致。

### G1：PostgreSQL 持久化与原子领域操作

**新增/修改位置**
- `packages/server/src/db/entities/{Player,AuthIdentity,Plot,OperationReceipt}.ts`
- `packages/server/src/db/migrations/`
- `packages/server/src/repositories/`、`services/farm/`、`auth/repo.ts`
- `packages/server/compose.yml`、安全的 `.env.example`
- `packages/server/test/integration/`

**实施内容**
- 查明已安装 MikroORM 版本与 Node 支持矩阵并锁定；不因 PRD 示例使用 v7 就静默升级当前 v6。
- 实现实体、唯一约束、非负金币/次数及索引约束。每个请求或命令使用独立 EntityManager 上下文，不将长生命周期房间绑定到一个共享 EM。
- 实现开垦、种植、浇水、收获领域命令；HTTP 和 WS 未来必须调用同一服务，禁止两条写入路径各自结算。
- 将玩家资产、地块状态、命令收据放在同一事务中。行锁或条件更新防止重复收获；幂等键绑定玩家和请求内容，重复命令返回原结果而非再次扣费/奖励。
- 命令返回成功必须在事务提交后。`onDispose` 只做清理或补充检查，不把整间房旧快照覆盖回主库。
- 新增仅绑定本地端口、使用开发专属 volume 的 PostgreSQL/Redis compose；不包含不可启动的 WS/admin 假服务。不删除既有数据库或 volume。

**出口证据**：真实 PostgreSQL 上迁移通过；提交后重启 API 数据仍在；失败回滚不扣资产；并发收获只发一次奖励；重复命令返回一致结果。数据库集成测试不得以 mock 冒充。

### G2：Colyseus 实时房间与恢复

**文件范围**
- `packages/server/src/realtime/{serve,room,state}.ts`
- `packages/server/src/realtime/handlers/`
- `packages/shared/src/protocol/ws.ts`
- `packages/server/test/realtime/`

**实施内容**
- 按实际 Colyseus 0.18 包版本核实 Schema、认证、request/reply 和重连 API；安装兼容 SDK，避免凭版本号猜接口。
- HTTP 与 WS 使用独立入口，共享领域服务与数据库配置。初期只实现本人农场，不同时加入好友、偷菜、排行和支付。
- 农场按内部 ownerId 路由；规划并实现同一农场单一活跃房间所有者机制。RedisDriver 的房间元数据共享本身不能保证业务 ownerId 唯一。
- 房间命令先鉴权、校验、事务提交，再刷新/广播状态。权威时间来自服务端 epoch 时钟；room.clock 仅用于调度，不宣称计时不受负载影响。
- 断线后刷新 token/重新认证，恢复全量快照及 revision；命令超时使用幂等收据判定结果，不盲目重放资产操作。
- Redis Presence/Driver 承担跨进程协调，不作为业务数据持久层。两进程测试路由、房间所有权与旧状态覆盖防护。

**出口证据**：真实 SDK 客户端完成登录、进房、种植/浇水/收获、断线重连；两个连接竞争收获不重复发奖；WS 进程中止重启后从 DB 恢复；鉴权失败不得进入他人农场。

### G3：小游戏客户端接真实后端

**文件范围**
- `packages/client-mini/src/net/`、`platform/`、`runtime/`
- `packages/client-mini/src/cocos/` 及后续实际 Cocos 工程目录
- `docs/cocos-integration.md`

**实施内容**
- 先建立可注入的网络和平台适配，微信使用 `wx.request`、`wx.connectSocket`、微信存储 API；不让小游戏依赖 RN 包，通用网络层如需复用应单独归属而非从 client-app 导入。
- headless 联调使用真实后端，不再让本地 Economy/FarmSystem 改写权威资产。UI 可显示加载/待确认，但离线不直接赚取金币，不按离线客户端时间发奖励。
- 校验 Cocos 编辑器和微信开发者工具可用性后，创建锁定版本的最小工程与代码构建场景。保留冻结设计作为参照，不重新绘制或改变布局。
- 替换 cc stub 需要真实生命周期、调度取消、资源加载与构建验证，不能承诺“改 import 即零改动接入”。
- 用户提供微信 AppID/必要凭据前使用明确标识的本地开发认证；不得以它宣称真实微信登录通过。凭据通过安全环境配置，不通过聊天传输。

**出口证据**：Node 网络联调通过；Cocos 编译和微信构建通过；有条件时真机完成登录到收获及前后台恢复，并记录设备/版本。缺少编辑器或凭据时明确阻塞 G3，不用桩测试关闭真机验收。

### G4：回归、部署文档与阶段交付

- 补全运行脚本、环境变量、数据库迁移/恢复步骤和单主机部署拓扑。
- 更新 `README.md`、`DELIVERY.md` 与五份架构文档，仅记录实际验证过的节点和命令；交付历史采用追加记录，不再次覆盖历史内容。
- 补充 `docs/mvp-features.md` 的新旧范围说明；历史实物农场设计明确不属于本阶段。冻结视觉文件不动。
- 记录单元、数据库集成、真实 WS、多连接并发和客户端验证的分别结果；不以测试数量代替用例覆盖。
- 完成只读 code-reviewer 审查，处理高置信度高优先问题，再提交阶段结果；不自动发布或 push。

## 4. Subagent 分工与并行顺序

| 角色 | 文件所有权 | 交付责任 |
|---|---|---|
| 主 agent | 根工具链、版本与 ADR、整合文档、最终验证 | 锁定协议、执行联调、保护冻结文件、按里程碑 commit |
| S1 共享协议/规则 | `packages/shared/**` | G0 契约、时间计算、纯规则与边界测试 |
| S2 数据与领域 | `packages/server/src/db/**`、`repositories/**`、`services/**` | G1 实体、迁移、事务与并发集成测试 |
| S3 认证与实时 | `packages/server/src/auth/**`、`realtime/**`、对应测试 | 登录隔离、JWT、房间、重连；依赖 S1/S2 契约 |
| S4 小游戏适配 | `packages/client-mini/**`、Cocos 集成说明 | G3 网络、平台适配、真实客户端构建 |
| S5 审查 | 只读 | 每关卡审查准确性、安全、测试覆盖和文档证据 |

顺序：主 agent 完成 G0 决策后 S1 先锁协议；S2/S3 按接口并行，禁止同时编辑同一路由或公共配置；G1 通过后整合 G2；S4 可提前做平台接口，但 G3 联调依赖 G2。主 agent 独占根 package/lockfile 与依赖安装，避免多个 agent 同时安装。浏览器工作仅主 agent 执行。

## 5. 验证与提交约定

现有可运行命令：

```bash
pnpm -r build
pnpm -r test
pnpm smoke
```

待实施时新增并文档化的命令（当前不可声称已存在）：数据库迁移检查、PostgreSQL 集成测试、真实 Colyseus 联调、双进程并发测试、Cocos/微信构建。

每个里程碑提交前：检查工作树和 diff；运行对应验证；检查日志无 token/secret；核对冻结资源未变化。测试失败则不把阶段标为完成。实现 commit 建议按 G0 契约、安全、G1 持久化、G2 实时、G3 小游戏分别组织，不把未通过的功能混入“全部完成”提交。

## 6. 本阶段不做

- RN 原生工程与 App UI（保留共享协议兼容目标）。
- admin 面板实装、后台管理业务及 Drizzle 迁移。
- 好友关系、偷菜经济、排行榜、任务、充值与支付。
- 自动离线操作回放、完整客户端预测/回滚系统。
- 多区多活、Redis Cluster、未经压测的万级 CCU 承诺。
- v25 视觉修复、换图、池塘恢复或素材重绘。

## 7. 完成定义

G0–G2 完成意味着“可持久化的全局核心后端已联调”，不是小游戏已交付；G3 有真实引擎/平台验证才可声明“小游戏闭环可玩”。RN、admin 和商业上线分别验收，不借本阶段测试通过提前宣称完成。
