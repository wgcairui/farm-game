# 状态同步策略（State Sync）

> 版本：v1 · 2026-09-11
> 配套：[client-protocol.md](./client-protocol.md) · [architecture.md](./architecture.md)

## 1. 原则

1. **服务端权威**：所有写操作必须经服务端 round-trip；客户端只发请求，服务端校验金币/地块归属/成熟状态后才生效
2. **绝对时间戳**：作物状态用 `plantedAt`（epoch ms）+ 服务端校验后的 `matureAt`，不存相对时长
3. **离线可恢复**：杀进程 / 离线 N 小时后回连，状态从时间戳自然回放，无需特殊补偿
4. **预测 + 校正**：高频点击（浇水）允许乐观本地状态，收到服务端 ack 后校对；冲突时以服务端为准

## 2. 时间戳校时

登录时客户端与一次服务端校时：

```
C: t0 = Date.now()
C → S: hello { openid, token }
S: t1 = Date.now() at server
S → C: welcome { serverNow: t1 }
C: offset = t1 - (t0 + (Date.now() - t0)/2)   // 简化：单程 RTT/2
C: serverNowEstimate ≈ Date.now() + offset
```

`TimeManager` 把 `offset` 存在 `_serverTimeOffset` 字段，`now()` 一律输出 `Date.now() + offset`。三次滑动平均可进一步收敛（Phase 2 启用）。

服务端时间用 `@colyseus/core` 的 `room.clock`（Phase 2），所有 timer 与客户端时钟无关。

## 3. 离线恢复

### 3.1 数据模型

```ts
interface PlotState {
  id: PlotId;
  index: number;
  unlocked: boolean;
  status: 'empty' | 'growing' | 'ready' | 'withered';
  cropId?: string;
  plantedAt?: number;       // epoch ms — 服务端写入时刻
  matureAt?: number;        // epoch ms — 服务端写入时刻
  waterCount: number;
}
```

### 3.2 客户端登录时回放

```ts
function recalcOnLogin(plot: PlotState): PlotState {
  if (plot.status !== 'growing' || !plot.plantedAt || !plot.cropId) return plot;
  const cfg = getCrop(plot.cropId);
  if (!cfg) return { ...plot, status: 'empty' };
  const matureAt = plot.plantedAt + cfg.growthDuration * 1000;
  if (now() - plot.plantedAt >= (cfg.growthDuration + cfg.witherWindow) * 1000) {
    return { ...plot, status: 'withered', matureAt };
  }
  if (now() >= matureAt) return { ...plot, status: 'ready', matureAt };
  return { ...plot, matureAt };
}
```

## 4. 高频操作预测

浇水是高频操作（玩家每秒可点 1–3 次）。完整 round-trip 会卡手。允许：

1. 客户端立即把 `plot.waterCount++`、本地 `matureAt *= 0.95`，UI 立刻反馈
2. 同步发 `water { plotIndex }` 到服务端
3. 服务端回 `plot_updated { plot }` 后覆盖本地；若服务端校验失败（金币不足/超上限），回滚

预测窗口最长 1 秒，超时未收到 ack 则客户端主动 reconcile。

## 5. 重连与房间状态重发

Colyseus `allowReconnection: 30s` 内：
1. 客户端 SDK 自动重连；客户端业务代码不感知
2. 重连成功后服务端 `room.state` 全量广播给该 client
3. 客户端 EventBus 收到 `server_plot_updated` 批量 reconcile

窗口外（>30s）则视为新会话，走完整 `hello` → `welcome` 流程。

## 6. 离线写合并

客户端离线期间允许继续操作本地缓存（种植/收获），操作进 pending buffer：
```
PendingOp = { id: uuid; type: 'plant'|'water'|'harvest'; payload; queuedAt }
```

重连后按 `queuedAt` 顺序回放：
- 服务端每条校验（资金/状态）；失败的从 buffer 移除并通知客户端
- 客户端 EventBus 发 `server_plot_updated` 与本地预测合并

Phase 2 启用；Phase 1 不实现。

## 7. 反作弊

| 作弊 | 防御 |
|---|---|
| 改本地时间 | 服务端用 `room.clock` + 时间戳校验，客户端时间仅用于 UI |
| 重放登录 token | JWT TTL 7 天 + 设备指纹（Phase 2） |
| 直接 POST /farm/unlock 绕过 WS | 服务端状态机校验 `plot.unlocked === false` |
| 偷菜频率过高 | Redis 滑动窗口，60 秒内偷同一玩家上限 3 次 |

## 8. 测试与验证

- 单元测试：`packages/shared/test/growth.test.ts` 覆盖所有生长计算
- 集成测试：服务端 `packages/server/test/smoke.test.ts` 覆盖登录→拉配置→拉玩家
- e2e（Phase 4）：playwright 模拟时间跳跃，杀进程后再启验证回放
- 压测：`@colyseus/loadtest` 模拟 1k CCU 持续 10 分钟，观察房间状态同步延迟 < 200ms