# ADR-0002 — 玩法闭环统一（G1 起点）

> 状态：提议 · 2026-09-11
> 范围：`packages/shared` + `packages/server` + `packages/client-mini` + `packages/client-app`
> 起点：ADR-0001 G0 已落地（`162407c`）— 经济与玩法规则继续收敛
> 关系：与 ADR-0001 §1、§5 一致；本 ADR 收紧玩法细节，不涉及鉴权 / 协议校验

## 1. 决策摘要

| # | 决策 | 替代方案 | 选定理由 |
|---|---|---|---|
| D9 | 地块总数固定 **24**，初始解锁 **6**，剩余 `locked` | 沿用 v25 草稿的 8 块；按 PRD 旧 6×6=36 | 24 块已写入 smoke 与 client-mini 单测；同时与上一轮规划 §3 G0 PRD 简化闭环一致；6 块收紧早期体验 |
| D10 | 公开状态枚举统一为 `locked / empty / growing / ripe`，删除 `ready` 与 `withered` | 保留旧 4 态 | 与实施计划 §3 G0 描述、文档叙事一致；D11 砍掉枯萎后状态空间更小 |
| D11 | **不再支持枯萎**：客户端 / 服务端不写入、不展示；`applyWater` 与状态机不再包含 `withered` | 保留 24h witherWindow | 上轮计划 §3 G0 明确"枯萎作为历史原型，不默默混入新服务端闭环"；当前玩家资产闭环不需要枯萎 |
| D12 | **收获直接奖金币**，不经过仓库；种植直接扣金币，不经过种子背包；删除 `inventory` 字段与 `ShopSystem.sellCrop` | 保留仓库 / 出售模型 | 与计划 §3 G0"种植扣种子成本、收获直接金币结算"一致；服务端只需要 4 个命令（plant/water/harvest/unlock），少一个 sell、少 warehouse 容量约束；client-mini 的 `ShopSystem` 退出循环 |
| D13 | **协议 major 升 2**：1.x 客户端发 `X-Protocol-Version: 1.x` 服务端返回 426 + `PROTOCOL_VERSION_MISMATCH` | 静默兼容 | D10/D12 是公开协议破坏性变化；按 ADR-0001 §D6 升 major |
| D14 | `PlotState.unlocked` 字段保留并用于反映 D9 初始化；G1 后单独 `locked/empty/growing/ripe` 状态；客户端根据 `status==='locked'` 或 `unlocked===false` 渲染 | 仅靠 `status==='locked'` | 兼容现有 UI 字段读取路径；新代码优先用 `status` |
| D15 | `Platform.H5Reserve` 重命名为 `Platform.H5`（与 `AuthProvider.H5` 对齐） | 保留双名 | 上一轮规划已点出命名分裂；统一便于 tenant 路由 |
| D16 | 共享侧 `CROPS` 的 `witherWindow` 字段保留但仅作为 dormant 配置；服务端 G1 不读取，不下发到客户端 | 立刻删除字段 | 与 D11 一致；保留字段避免一次性删除所有调用点导致 diff 爆炸；smoke / 单测不再断言 |

## 2. 不在本 ADR 范围

- 真实 PostgreSQL 实体（G1 任务 T3）
- Colyseus 房间（G2）
- 真实微信 jscode2session（G1.5）
- v25 视觉修稿（与本 ADR 并行）

## 3. 影响面

- `packages/shared/src/types/plot.ts` — `PlotStatus` 重写
- `packages/shared/src/types/player.ts` — `createDefaultPlayerSave` 改 unlocked=6；移除 `inventory` 字段
- `packages/shared/src/logic/growth.ts` — `applyWater` 删除 withered 分支；reason `already_ripe` 改名 `already_ripe` 保持不变（语义更准确，state 是 `ripe`）
- `packages/shared/src/types/platform.ts` — `H5Reserve` → `H5`
- `packages/shared/src/protocol/version.ts` — `PROTOCOL_VERSION_MAJOR = 2`，`PROTOCOL_VERSION = '2.0.0'`
- `packages/server/src/farm/routes.ts` — 当前 `/farm/unlock` 与客户端约定保持；G1 后再加 plant/water/harvest
- `packages/client-mini/src/cocos/systems/ShopSystem.ts` — 删除 `sellCrop`；删除 `InventorySystem` 中 `inventory` 字段维护
- `packages/client-mini/src/runtime/headless.ts` — 同步状态机与移除仓库
- `packages/client-app/src/store/GameStore.ts` — 同步状态机；`inventory` 不再使用
- `scripts/smoke-protocol.ts` — `plots.length == 24` 不变；`plot[6]` 替换为 `plot[6] now unlocked`
- `packages/shared/test/growth.test.ts` — 改用 `status: 'ripe'` / `status: 'locked'` 等
- `packages/client-mini/test/core-loop.test.ts` — 改用 6 块解锁、删除仓库断言
- `packages/shared/test/protocol.test.ts` — 断言 PROTOCOL_VERSION_MAJOR === 2

## 4. 验收

- `pnpm -r build` 通过
- `pnpm -r test` 全绿；新增或修改后的用例计数与基线一致（≥ 60）
- `pnpm smoke` 14/14（断言更新到 D9/D10）
- 服务器启动日志中 `PROTOCOL_VERSION_MAJOR=2`
- 任何 `PlotStatus` 引用旧值 `ready` / `withered` 在仓库里 `grep` 不存在

## 5. 实施状态

| 提交 | 范围 |
|---|---|
| （待）Phase 2 G0.5 / 玩法统一 | D9–D16 全部落地（解锁 6、ripe 状态、收获金币、协议 v2） |
