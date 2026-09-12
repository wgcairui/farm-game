# Cocos Creator × 微信小游戏 联调 Runbook（G3）

> 目标读者：拿到这台 Mac 的开发者，从零跑通「**登录 → 种植 → 收获**」的最小联调闭环。
> 范围：MVP 联调最小路径，**不做** sprite 动画、图集、UI 美化、`.scene` 手写 JSON、自动构建脚本。
> 配套策略文档：[`cocos-integration.md`](./cocos-integration.md)（讲「为什么」，本文件讲「怎么照做」）。
> **2026-09-12 更新**：§4–§5 的最小场景已被 [implementation-plan-ui-v13.md](./implementation-plan-ui-v13.md) 的完整 UI（v13 素材 + 分层场景）取代；§11 补记 UI 时代的构建链增量、AppID 坑与自动化 E2E。

---

## 1. 前置

### 1.1 本机已装

| 软件 | 路径 | 实测版本 |
|---|---|---|
| Cocos Dashboard | `/Applications/CocosDashboard.app` | — |
| Cocos Creator | `/Applications/CocosCreator.app` | 3.8.8 |
| 微信开发者工具 | `/Applications/wechatwebdevtools.app` | 36.6.0 |
| Node.js + pnpm | 系统 PATH | Node ≥ 18 / pnpm ≥ 9（仓库根有 `pnpm-lock.yaml`） |
| Python 3 + Pillow | 系统 / `python3 -m pip install pillow` | 12.2.0 |

如未装：`brew install --cask cocoscreator wechat-web-devtools`；Pillow 用 `pip3 install pillow`。

### 1.2 后端已起

G3 联调需要两个进程：

| 服务 | 命令 | 端口 | 备注 |
|---|---|---|---|
| HTTP（Fastify） | `pnpm --filter @farm-game/server dev` | `127.0.0.1:3000` | 提供 `/auth/wechat`、`/crop/configs`、`/player/info`、`/farm/unlock` |
| WS（Colyseus FarmRoom） | `pnpm --filter @farm-game/server dev:ws` | `127.0.0.1:2567` | G2 实时房间，`farm_cmd` / `welcome` / `cmd_result` 走 WsEnvelope |

冒烟：

```bash
curl -s http://127.0.0.1:3000/healthz | jq .
# 期望：{"ok":true,"uptime":<n>,"protocolVersion":"1.0.0"}
pnpm --filter @farm-game/server smoke:realtime
# 期望：所有协议断言通过
```

联调期间**全程保持这两个终端在前台运行**，观察日志。

### 1.3 资源已切片

`assets/game/` 已经存在（由 `scripts/slice-assets.py` 产出）。该产物是 Cocos **直接 import** 的最终 PNG（已去底、含 `manifest.json`）。如需重新生成：

```bash
python3 scripts/slice-assets.py
```

详细切片报告：见 `assets/game/manifest.json`。

---

## 2. 建 Cocos Creator 工程

### 2.1 临时目录起新项目（不污染 monorepo）

1. 打开 `/Applications/CocosDashboard.app`。
2. 左上角「新建」→「**空项目**」（**不是 Hello World / Gallery**）。
3. 工程名：`farm-cocos-scaffold`。
4. 路径：手动改成 `/tmp/farm-cocos-scaffold`（**绝对不要**选到仓库 `packages/client-mini/`，Creator 会覆盖已有文件）。
5. 引擎版本：**3.8.8**（与本机 `.app` 对齐）。
6. 点「创建」→ Dashboard 跳到编辑器；首次打开会编译内置资源，等 30–60s。
7. 关闭工程（菜单 File → Close，不退出 Dashboard）。

此时 `/tmp/farm-cocos-scaffold/` 应有 Creator 生成的标准结构：

```
/tmp/farm-cocos-scaffold/
├── assets/                  # 业务素材/场景/脚本
├── library/                 # 导入缓存（gitignore）
├── local/                   # 用户偏好（gitignore）
├── packages/                # 扩展包目录（gitignore）
├── profiles/                # 平台配置（gitignore）
├── settings/                # v2 settings（关键！）
├── temp/                    # 构建临时产物（gitignore）
├── tsconfig.json
├── package.json             # Creator 生成，含 creator 字段
└── .gitignore               # Cocos 自带
```

### 2.2 把工程文件合并进 monorepo 的 `packages/client-mini/`

> 原则：**只**搬工程元文件（让 Creator 认得这个目录是工程），**不**碰 `src/` 下任何业务文件（队友并行开发中），**不**覆盖 `package.json`。

```bash
cd /Users/cairui/Code/farm-game/packages/client-mini

# 1) 把 .gitignore 合并：保留 monorepo 根 .gitignore 已有规则，追加 Cocos 专用项
cat >> .gitignore <<'EOF'

# Cocos Creator
/library/
/local/
/profiles/
/temp/
/build/
*.meta.tmp
EOF

# 2) 拷贝 settings/ 整个目录（Creator 用 v2 settings 描述项目结构）
cp -R /tmp/farm-cocos-scaffold/settings .

# 3) 拷贝 assets/（空的也行，但 Creator 需要这个目录存在；后面再放我们的 scene/scripts/game）
cp -R /tmp/farm-cocos-scaffold/assets .

# 4) 拷贝 tsconfig.json（Creator 用它来编译 assets/scripts/）
cp /tmp/farm-cocos-scaffold/tsconfig.json ./cocos-tsconfig.json
# Creator 会自动 rewrite include / 引用我们的 src/ 时需手动改，见 5.3

# 5) 合并 package.json（只补 creator 字段，不动现有 scripts/deps）
node -e '
const fs = require("fs");
const ours = JSON.parse(fs.readFileSync("package.json","utf8"));
const theirs = JSON.parse(fs.readFileSync("/tmp/farm-cocos-scaffold/package.json","utf8"));
ours.creator = theirs.creator;       // 版本 + 引擎类型
if (!fs.existsSync("assets")) fs.mkdirSync("assets");
fs.writeFileSync("package.json", JSON.stringify(ours, null, 2) + "\n");
'
# 千万别执行 `cp /tmp/farm-cocos-scaffold/package.json ./` —— 这会覆盖我们的 scripts / deps

# 6) 建好 Cocos 期望的子目录（即使空也建，避免 Creator 弹警告）
mkdir -p assets/scripts assets/scenes assets/prefab
```

**为什么这样合并？** `packages/client-mini/` 已经是 pnpm workspace 包，有自己的 `package.json`/`tsconfig.json`/`src/` 业务代码。Cocos 工程本质上是「`assets/` + `settings/` + Creator 专属 `package.json#creator` 字段」的组合——我们把这三块合并进去，而不是用 `cp -R` 把整个 scaffold 盖进来，避免破坏工作流。

### 2.3 验证 Creator 能打开

1. Dashboard → 「打开其他项目」→ 选 `/Users/cairui/Code/farm-game/packages/client-mini`（不是 `/tmp/...`）。
2. 顶部应显示项目名 `@farm-game/client-mini`，引擎 3.8.8。
3. 左侧资源管理器应有 `assets/`、`library/` 等节点，无红色报错。
4. 控制台（Creator 底部 Console）无 `Script Error`。

---

## 3. 导入切片资源

```bash
cd /Users/cairui/Code/farm-game
cp -R assets/game packages/client-mini/assets/game
```

打开 Creator 后：

1. 左侧资源管理器进入 `assets/game/`。
2. Cocos 会自动为每个 PNG 生成同名 `.meta`（这就是 SpriteFrame 的入口）。
3. 选中任意一张图 → 属性检查器确认「Type = sprite-frame」「Trim Type = none」「Packable = false」（MVP 不做图集，单图直接用）。
4. 「项目 → 资源管理器刷新」（如果 .meta 没自动出）。

**`manifest.json` 的用途**：本 runbook 不消费它（脚本读 PNG 路径硬编码）；它是 Phase 4 之后的图集/打包工具以及 CI 校验的契约——脚本输出时已写明每个 PNG 的源 sheet、grid、去底覆盖率。

---

## 4. 搭最小场景 `Main.scene`

> **不手写 .scene JSON**——全程在 Creator 编辑器里点。

### 4.1 新建场景

1. `assets/scenes/` 右键 → 创建 → Scene（默认名 `Main`）。
2. 双击 `Main.scene` 打开。
3. 默认已有 `Canvas` 节点（带 `Camera` + `UITransform`）。

### 4.2 Canvas 下节点结构

```
Canvas (Design Resolution 692 × 1218, Fit Mode: Fixed Width)
├── FarmGrid                 # 6×4 地块网格
│   ├── Plot_0  (Sprite, plots/grass-empty)
│   ├── Plot_1  ...
│   ├── Plot_23
├── TopBar                   # 顶部金币显示
│   └── GoldLabel (Label, "Gold: 200")
├── CropButtons              # 底部作物选择
│   ├── BtnCarrot     (Button, 图标 crops/carrot/stage-1)
│   ├── BtnPotato     (Button, 图标 crops/potato/stage-1)
│   ├── BtnCorn       (Button, 图标 crops/corn/stage-1)
│   └── BtnTomato     (Button, 图标 crops/tomato/stage-1)
└── OnlineFarm               # Component 脚本（§5 挂载）
```

### 4.3 排 24 个 Plot（手动即可，6×4 网格）

1. 复制 `plots/grass-empty.png` 为 SpriteFrame（在资源管理器选中，拖到 Plot_0 的 SpriteFrame 槽）。
2. `Plot_0` 节点 UITransform：宽 100 / 高 100（按 692 宽缩放下视觉差不多就行，**MVP 不要求精确对齐 v24 场景基线**）。
3. 复制 23 份 `Plot_0..Plot_23`，排成 6 列 × 4 行，列距 100 / 行距 80（手排即可）。
4. 默认全部引用 `plots/grass-empty`。脚本会按服务端状态切贴图。

### 4.4 TopBar / CropButtons

- `TopBar` 放 Canvas 顶部（y=550 附近），GoldLabel 字体用系统默认。
- `CropButtons` 放 Canvas 底部（y=-550 附近），四个 Button 等距分布。MVP 阶段**任何**作物按钮都触发「种 carrot」就行——切具体作物的 UI 留 Phase 4。

> 这只是联调最小 UI，**不**是最终视觉。最终视觉在 v25 视觉修正后单独排版。

---

## 5. 挂业务组件 `OnlineFarm`

### 5.1 契约（来自队友 W3 同步的 `OnlineGameApp`）

`OnlineGameApp`（由 W3 队友编写，路径 `packages/client-mini/src/runtime/online.ts`）的契约：

```ts
new OnlineGameApp({
  baseUrl: 'http://127.0.0.1:3000',
  wsEndpoint: 'ws://127.0.0.1:2567',
}).start();

app.plant(plotIndex: number, cropId: string): Promise<void>;
app.water(plotIndex: number): Promise<void>;
app.harvest(plotIndex: number): Promise<void>;
app.state(): { gold: number; gems: number; plots: PlotState[] };

app.on('CoinsChanged', (gold: number) => void);
app.on('PlotStateChanged', (plot: PlotState) => void);
// …事件名与 HeadlessGameApp 一致
```

`PlotState` 定义见 `packages/shared/src/types/plot.ts`。本 runbook **不依赖** 内部实现，只消费上面 API。

### 5.2 Cocos 端 `assets/scripts/OnlineFarm.ts`

```ts
/**
 * OnlineFarm — Cocos 端 G3 联调最小 UI 适配器。
 *
 * 职责：
 *  - 启动时 new OnlineGameApp().start()，订阅 CoinsChanged / PlotStateChanged
 *  - 点击 Plot：empty → plant(carrot)、growing → water、ripe → harvest
 *  - 每秒刷新进度：growing 阶段按剩余时间切 stage-1/2/3，ripe 用 stage-4
 *
 * 这是联调最小 UI，不是最终视觉——任何 UI 美化、动画、引导都留后续 sprint。
 */
import {
  _decorator, Component, Label, Sprite, SpriteFrame, Node,
} from 'cc';
import { OnlineGameApp } from '../../src/runtime/online';  // 见 §5.3 关于相对路径的说明
import { CROPS } from '../../src/runtime/crop-bootstrap';  // 共享作物表：id → growthDuration 等
import type { PlotState } from '../../src/types/plot';

const { ccclass, property } = _decorator;

const PLOT_COUNT = 24;
const DEFAULT_CROP_ID = 'carrot';

@ccclass('OnlineFarm')
export class OnlineFarm extends Component {
  @property([Sprite]) plotSprites: Sprite[] = [];   // Plot_0..Plot_23 拖进来
  @property(Label) goldLabel: Label | null = null;  // TopBar/GoldLabel
  @property([SpriteFrame]) cropStageFrames: SpriteFrame[] = [];  // 4 张作物 sprite，按 stage-1..4

  private app: OnlineGameApp | null = null;

  onLoad(): void {
    // 1) 起联调运行时（指向本机后端）
    this.app = new OnlineGameApp({
      baseUrl: 'http://127.0.0.1:3000',
      wsEndpoint: 'ws://127.0.0.1:2567',
    });
    this.app.start();

    // 2) 订阅业务事件
    this.app.on('CoinsChanged', (gold: number) => {
      if (this.goldLabel) this.goldLabel.string = `Gold: ${gold}`;
    });
    this.app.on('PlotStateChanged', (plot: PlotState) => {
      this.refreshPlot(plot);
    });

    // 3) 首次同步全量状态
    const state = this.app.state();
    if (this.goldLabel) this.goldLabel.string = `Gold: ${state.gold}`;
    for (const plot of state.plots) this.refreshPlot(plot);

    // 4) 给每个 Plot 节点绑点击
    for (const sprite of this.plotSprites) {
      const idx = sprite.node.name.replace(/^Plot_/, '');
      const plotIndex = Number.parseInt(idx, 10);
      if (Number.isNaN(plotIndex)) continue;
      sprite.node.on(Node.EventType.TOUCH_END, () => this.onPlotClick(plotIndex));
    }

    // 5) 每秒刷进度（growing 阶段按时间切 stage）
    this.schedule(() => this.tickProgress(), 1);
  }

  onDestroy(): void {
    this.app?.['stop']?.();  // 契约里 stop 是可选；保留兼容
  }

  private onPlotClick(plotIndex: number): void {
    if (!this.app) return;
    const plot = this.app.state().plots.find((p) => p.index === plotIndex);
    if (!plot || plot.status === 'locked') return;

    if (plot.status === 'empty') {
      void this.app.plant(plotIndex, DEFAULT_CROP_ID);
    } else if (plot.status === 'growing') {
      void this.app.water(plotIndex);
    } else if (plot.status === 'ripe') {
      void this.app.harvest(plotIndex);
    }
  }

  private tickProgress(): void {
    if (!this.app) return;
    for (const plot of this.app.state().plots) {
      if (plot.status === 'growing' || plot.status === 'ripe') {
        this.refreshPlot(plot);
      }
    }
  }

  private refreshPlot(plot: PlotState): void {
    const sprite = this.plotSprites[plot.index];
    if (!sprite) return;

    if (plot.status === 'locked') {
      sprite.spriteFrame = this.cropStageFrames[0];  // 占位：MVP 阶段直接用 crop stage-1 表示 lock 也行
      // 真实锁定视觉：换成 plots/locked.png 即可（@property 加个 lockFrame）
      return;
    }
    if (plot.status === 'empty') {
      sprite.spriteFrame = this.cropStageFrames[0];  // MVP 用 stage-1 占位
      return;
    }
    if (plot.status === 'ripe') {
      sprite.spriteFrame = this.cropStageFrames[3];
      return;
    }
    // growing：按剩余进度切 stage
    const crop = CROPS[plot.cropId ?? DEFAULT_CROP_ID];
    if (!crop || !plot.plantedAt || !plot.matureAt) {
      sprite.spriteFrame = this.cropStageFrames[0];
      return;
    }
    const now = Date.now();
    const total = plot.matureAt - plot.plantedAt;
    const elapsed = Math.max(0, now - plot.plantedAt);
    const progress = total > 0 ? elapsed / total : 0;
    if (progress < 0.34) sprite.spriteFrame = this.cropStageFrames[0];
    else if (progress < 0.67) sprite.spriteFrame = this.cropStageFrames[1];
    else sprite.spriteFrame = this.cropStageFrames[2];
  }
}
```

### 5.3 tsconfig / import 路径注意

- Cocos 编辑器用 `assets/tsconfig.json` 编译 `assets/scripts/**`；它**不会**自动 include `packages/client-mini/src/**`。
- 解法：在 `assets/tsconfig.json` 的 `compilerOptions.paths` 里把 `../../src/*` 加进去（Creator 会用相对路径 import map 解析），例如：

  ```jsonc
  // assets/tsconfig.json（如果 Cocos 没生成就放最小骨架）
  {
    "extends": "../cocos-tsconfig.json",
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@farm-game/shared": ["../src/shared-bridge.ts"]  // 仅联调需要
      }
    },
    "include": ["./**/*.ts", "../src/runtime/**/*.ts", "../src/types/**/*.ts"]
  }
  ```

- 更省事的做法：直接用相对路径 `../../src/runtime/online`（如上面脚本示例）。TS 报「找不到模块」但**运行时 Cocos 的 require 能解析**（因为它们都在同一个包内）——忽略 TS 红线即可，**不要**为了消红线去改 `src/` 下的文件（队友并行开发）。
- `@farm-game/shared` 在 Cocos 里不会被自动解析：联调阶段让 `OnlineGameApp` 内部已经 bundled 共享类型，UI 脚本只引 `OnlineGameApp` 即可。如必须从 UI 脚本里 import shared 类型，请走上面的 `paths` 桥接。

### 5.4 挂到 Canvas

1. 在 `Main.scene` 中选中根 `Canvas` 节点。
2. 属性检查器 → 添加组件 → Custom Script → `OnlineFarm`。
3. 把 `Plot_0..Plot_23` 拖到 `Plot Sprites` 数组（顺序 = index）。
4. 把 `TopBar/GoldLabel` 拖到 `Gold Label`。
5. 准备 4 个 SpriteFrame：
   - 在资源管理器复制 `assets/game/crops/carrot/stage-1.png` 到一个临时位置，Creator 会生成 `.meta`，右键 → Set as SpriteFrame。
   - 同样对 `stage-2.png` `stage-3.png` `stage-4.png`（**只取 carrot 这一组**，MVP UI 阶段不区分作物）。
6. 把这 4 个 SpriteFrame 拖到 `Crop Stage Frames`（顺序 1→4）。
7. 保存场景。

---

## 6. 构建微信小游戏

### 6.1 在 Creator 里配置发布

1. 顶部菜单 **项目 → 构建发布**（或 `Cmd+Shift+B`）。
2. 平台列表选 **wechatgame**（微信小游戏）。
3. 点击「**打开**」旁边的「**设置**」（齿轮图标）→ 弹出原生开发面板：
   - 初始场景：`Main.scene`
   - 包名：`com.farmgame.mini`（任意）
   - 平台 appid：**留空 / 选「测试号」**（模拟器足够；真机发布才需要正式 AppID）。
4. 点击「**构建**」。第一次会下载微信小游戏引擎包，等 1–2 分钟。完成后弹窗提示生成 `build/wechatgame/`。
5. 不要点「运行」（Creator 会试图直接拉起微信开发者工具，本机模拟器路径需手动开）。

### 6.2 微信开发者工具导入

1. 打开 `/Applications/wechatwebdevtools.app`。
2. 左侧「**小程序**」→「**+**」→「**导入项目**」。
3. 目录：`/Users/cairui/Code/farm-game/packages/client-mini/build/wechatgame`。
4. AppID：选「**测试号**」（或留空用「无 AppID」体验模式）。
5. 项目名：随便填。
6. 点击「**导入**」。

### 6.3 关掉合法域名校验

> **这一步不做就看不到后端**——本地 HTTP/WS 不在白名单里。

1. 微信开发者工具顶部 → 「**详情**」→「**本地设置**」。
2. 勾上「**不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**」。
3. 关掉弹窗。

### 6.4 跑模拟器

1. 顶部编译按钮（▶）→ 模拟器应该出现 Canvas：6 块地（locked 灰块）+ 顶部「Gold: 200」+ 底部 4 个作物按钮。
2. 同时 `pnpm --filter @farm-game/server dev:ws` 那个终端应打出玩家 join / farm_cmd 日志。

---

## 7. 验收 checklist

按顺序过一遍，全部通过即可宣告 G3 联调完成。

- [ ] 模拟器加载 `Main.scene` 看到 **6 块 unlocked 绿草地**（其余 18 块显示为锁状态占位）+ 顶部 `Gold: 200`
- [ ] 点任意 unlocked 地 → 跳出胡萝卜小苗（stage-1），金币 200 → 190
- [ ] WS 终端看到 `farm_cmd{command:plant, cropId:carrot}` + `cmd_result` 回包
- [ ] 点同一块地（growing）→ 触发 water（日志 `farm_cmd{command:water}`）
- [ ] 等约 30 秒（或 `water` 加速到 maxWater=3 仍走完 30s growth）→ 地块切到 stage-4（ripe 红色果实）
- [ ] 再点一次 → 金币 +25，状态回到 empty
- [ ] **关掉模拟器 + 重开微信开发者工具 + 重新编译 → 金币与地块状态保留**（验证服务端持久化）
- [ ] 在另一个隐身窗口/另一台设备用同一 wechat code 登录 → 看到**同一份**状态（验证服务端权威）
- [ ] 服务端两个终端全程无未捕获异常（允许 `error` 事件帧——那是协议断言）

---

## 8. 已知限制与人工步骤

| 项 | 现状 | 绕过 / 后续 |
|---|---|---|
| 真机预览（不是模拟器） | 需要正式微信 AppID + 备案过的 HTTPS 域名 | 本 runbook 只覆盖模拟器；真机走标准 wechatgame 上线流程 |
| `wx.request` / `wx.connectSocket` 在真机的传输层 | 未做真机联调 | 模拟器 OK 即可推进；真机回归放在 G4 视觉冻结后 |
| withered（枯萎）状态 | UI 不展示；`PlotStatus` 枚举里也没有（见 `packages/shared/src/types/plot.ts`） | 留 Phase 4 |
| 解锁新地块（`farm/unlock` 路由 + UI） | `unlock` HTTP 路由已就绪，但 UI 未接；本 runbook 24 个地块默认前 6 个 unlocked | 留 Phase 4 |
| `environment_tree_mountain_cloud.jpeg` 内容缺失 | AI 生成时返回纯背景（详见 `assets/game/manifest.json` 的 alpha=0 警告） | 视觉资源重出后重跑 `scripts/slice-assets.py` 即可 |
| TS 红线（import 路径） | 见 §5.3，UI 脚本的 `import '../../src/runtime/online'` 在 Cocos 编辑器里会报「cannot find module」 | **不要去改 `src/`**；运行时 Creator 能解析。Phase 4 把工程拆出独立 tsconfig 再消 |
| Cocos / pnpm 双 package.json | Creator 写 `package.json#creator` 字段，pnpm 写 `scripts/deps`。已通过 `node -e` 合并脚本处理（§2.2 步骤 5） | 升级 Creator 时**不要** `cp` 覆盖；只复制 `creator` 字段 |
| 资源构建到 wechatgame | 本 runbook 不打包图集，PNG 散在 `assets/game/` | Phase 4 接自动图集；当前首包 ~2MB（14 张 1024² PNG），MVP 阈值 ≤4MB 内 |

---

## 9. 常见卡点

**Q: Creator 打开 `packages/client-mini` 报「找不到 project.json」。**
A: 你漏了 §2.2 步骤 2。`settings/` 是 v2 settings，但仍需一个 project 入口——重新检查 `settings/v2/packages/project.json` 存在。

**Q: 构建 wechatgame 时报「找不到 Main.scene」。**
A: 场景没保存（`Cmd+S`）；或初始场景下拉框没选。回到 §6.1 步骤 3。

**Q: 模拟器连不上 3000 / 2567。**
A: 三件事：① 后端两个进程在跑；② §6.3 关掉域名校验；③ 微信开发者工具左上项目栏→「**后台**」也能看到网络请求——检查有没有 `127.0.0.1:3000` 的失败请求。

**Q: 点地块没反应。**
A: `OnlineFarm.plotSprites` 数组没填满 24 个——属性检查器看一下是否每个 Plot 节点都拖进去了；顺序必须与 index 对齐（Plot_0 对应数组下标 0）。

**Q: Cocos TS 报「cannot find module '../../src/runtime/online'」编译红。**
A: 正常（见 §5.3 + §8）。先 `Cmd+S` 保存场景，编辑器顶部「运行预览」图标（▶）能直接起游戏——只要 .ts 能编译过编辑器内部那一步就行。如果编辑器连编译都过不了，把 `assets/scripts/` 下脚本里的 `import` 临时改成相对路径（比如直接放 `../../src/runtime/online.ts` 的拷贝）临时绕开——**绝对不要碰 src/ 下的代码**。

---

## 10. 模拟器 E2E 已知坑（2026-09-12 实战沉淀，均已修复在代码中）

以下问题在首次模拟器联调时叠加出现，表象都是 join 失败/挂死，根因分三层。**修复代码已落库**（`src/net/wx-compat.ts`、`src/cocos-entry.ts`、`packages/shared/src/eventbus/EventBus.ts`），此节记录原理供升级/回归时对照。

1. **wx WebSocket 只收 `string|ArrayBuffer`**：SDK 的 msgpack 帧是 Uint8Array，直接被 `wx.sendSocketMessage` 拒收 → 服务端看到连接但 0 条 join。`wx-compat.ts` 按 [官方微信文档](https://docs.colyseus.io/getting-started/wechat) patch 了 `WebSocket.prototype.send`（视图拷贝为精确长度 ArrayBuffer）。
2. **SDK 0.18 先试 Node 形构造** `new WebSocket(url, {headers, protocols})`：Cocos web-adapter 会把 options 对象当 subprotocol 传给 `wx.connectSocket` → 连接永不建立（[colyseus.js#161](https://github.com/colyseus/colyseus.js/issues/161)）。DevTools 的 `window.WebSocket` 只读，守卫做在 `wx.connectSocket` 里：subprotocol 含非字符串时同步 throw，借 SDK 自己的 catch 落回 browser 形。
3. **DevTools「增强编译」会破坏 Map/Set 迭代器协议**：`[...map.entries()]` / `[...set]` / `for (const [k,v] of map)` 转译后产生 undefined 元素，报 `Cannot read properties of undefined (reading 'join')`。**小游戏端代码规范：Map/Set 一律 `.forEach`，数组用索引循环，禁迭代器展开与解构**（shared 的 EventBus 也因此改过，勿回退）。
4. **改 `shared/src` 后必须** `pnpm --filter @farm-game/shared build`（vendor bundle 吃的是 shared 的 `dist/`，不是 src）→ 再 `pnpm build:cocos` → 再 Cocos 构建。跳过第一步 = 旧代码进包。
5. **每次 Cocos 构建都会把 `build/wechatgame/project.config.json` 的 `urlCheck` 重置为 true** → 构建后重新 patch 为 false，再回 DevTools 点「编译」。
6. **模拟器 canvas 不响应自动化合成点击**（鼠标事件不产生触摸）：E2E 验收走 `globalThis.__farm` + 与点击处理相同的公开 API（`app.plant/harvest`），DB（`docker exec farm-game-postgres psql -U farm -d farm_game`）+ console 断言；真触摸需人工。
7. **定位技巧**：SDK 的 async 错误经 babel/regenerator 包装后堆栈失真——在 `cocos-entry.ts` 的 fetch shim 里 try/catch 打 `err.stack` 才能拿到 TypeError 真实出生点；`MatchMakeError` 的 message 可能是别人抛的（SDK catch 原样包装）。

**已验证的构建链**（改任何客户端/shared 代码后按此顺序）：`pnpm --filter @farm-game/shared build` → `pnpm --filter @farm-game/client-mini build:cocos` → CocosCreator CLI `--build "platform=wechatgame;debug=true;startScene=1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"` → patch urlCheck=false → DevTools「编译」。

**验收基线（2026-09-12）**：登录 → join → 种胡萝卜（−10 金）→ 30s → 收获（+25 金）→ DB `players.gold/revision` 与 `plots.status` 全程一致；重编译后同玩家状态保留。console 应出现 `[wx-compat] installed guard=true send=true` 与 `[OnlineFarm] 已连接服务端`，无业务红字（DevTools 自身的 `webapi_getwxaasyncsecinfo:fail` 是工具噪音，可忽略）。

---

## 11. UI v13 时代的构建链与自动化 E2E（2026-09-12 补记）

### 11.1 素材管线

- `resources/game/` 现为**纯生成目录**：由仓库根 `scripts/prepare-cocos-assets.py` 从 `assets/sprites/v13/`（82 件，批次 A–H）缩放/量化后重建，幂等可重跑，体积报告在 `resources/game/prepare-report.json`（当前 1.78MB）。**不要手工往里放图**。
- `overlay_selected.png` 被 v13 素材管线**排除**（实为沙堆误图，含键控残留）；选中框由 `farm/widgets.ts selectionRing()` 程序化绘制。
- 场景几何唯一来源：`assets/scripts/farm/layout.ts`（720×1280 Fit-Height、中心原点坐标、Widget 规格、D–G 场景层开关）。

### 11.2 构建链（不变 + 一步 patch）

```
pnpm --filter @farm-game/shared build            # vendor bundle 吃 dist/
pnpm --filter @farm-game/client-mini build:cocos # assets/scripts/vendor/farm-online.js
/Applications/CocosCreator.app/Contents/MacOS/CocosCreator --project \
  /Users/cairui/Code/farm-game/packages/client-mini \
  --build "platform=wechatgame;debug=true;startScene=1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
# 构建后两个 patch（都因为构建产物被重置）：
#   project.config.json: urlCheck=false；appid=touristappid（见 §11.3）
```

构建期出现一条 `Missing class: 6f4c2oeiz1MWaLnnwscLT5P` 警告是 builder 统计阶段的库缓存噪音（压缩 uuid 即 OnlineFarm 组件），产物中已正确注册，可忽略。

### 11.3 AppID 坑（2026-09-12 实战）

- Cocos 构建产物会把 `project.config.json#appid` 写成历史残留值（本机出现过 `wx6ac3f5090a6b99c5`）。该 AppID 不属于当前登录账号时，`cli open/auto` 报 **`不存在此 AppID 请检查后重新输入 (code 10)`**，项目窗口根本不打开，且 CLI 退出码为 0、只有 stderr 里有 `[error]`——**极易误判为打开成功**。
- 解法：构建后把 appid patch 成官方测试号 **`touristappid`**（模拟器足够；真机才需要正式 AppID）。

### 11.4 自动化 E2E（headless 联调验收）

- `scripts/farm-sim-e2e.mjs`：连/拉起 IDE（automator launch，端口 9421）→ console 基线断言 → `globalThis.__farm.actions` 驱动 种→浇→收→解锁 → 每步 psql 断言 → 截图 `/tmp/farm-sim-home.png`。
- `scripts/farm-sim-probe.mjs`：自动化诊断探针（launch → 3 分钟轮询后端连接 → evaluate）。判定标准：**模拟器真正跑起来的唯一铁证是 wechatweb 进程与 2567 端口建立 ESTABLISHED**；IDE 的 `✔ auto` / `checkVersion` 通过都只代表 IDE 层。
- 已知边界（2026-09-12）：CLI/automator 全流程在**无人值守**环境下卡在「模拟器窗口不编译」——launch/checkVersion 正常但 simulator 零 console、零连接（疑似首启 GUI 弹窗阻塞，需人眼看一次窗口）。人工打开 IDE 确认弹窗后，自动化路径即可恢复。
- automator 的 `mini.evaluate` 需要游戏 context 存活；`automator` 内部有 background rejection，脚本需挂 `process.on('unhandledRejection')` 兜底（两脚本均已挂）。
