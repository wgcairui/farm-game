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

### 11.2 构建链（2026-09-13 更新：+素材 meta 修正 +补丁脚本）

```
pnpm --filter @farm-game/shared build            # vendor bundle 吃 dist/
pnpm --filter @farm-game/client-mini build:cocos # assets/scripts/vendor/farm-online.js
node scripts/fix-cocos-sprite-metas.mjs          # 素材 meta: texture → sprite-frame（§11.7，幂等）
/Applications/CocosCreator.app/Contents/MacOS/CocosCreator --project \
  /Users/cairui/Code/farm-game/packages/client-mini \
  --build "platform=wechatgame;debug=true;startScene=1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
node scripts/patch-wechat-build.mjs              # 构建产物被重置，必须重跑（幂等）
#   project.config.json: urlCheck=false / enhance=false / appid=wx39a9fdbb628725fd / libVersion=3.17.2（§11.3）
#   game.json: 删除 networkTimeout 字段（§11.5）
#   game.js: console 遥测 + dev bridge 命令轮询（§11.4）
node scripts/farm-sim-telemetry.mjs              # 常驻：9877 观测/驱动通道（§11.4）
```

Cocos CLI 构建**成功也会以非 0 退出码结束**（子进程 SIGTERM 收尾，实测 exit 36）；判定标准是日志末行 `build Task (wechatgame) Finished in (…)ms` 与产物时间戳，不是退出码。

构建期出现一条 `Missing class: 6f4c2oeiz1MWaLnnwscLT5P` 警告是 builder 统计阶段的库缓存噪音（压缩 uuid 即 OnlineFarm 组件），产物中已正确注册，可忽略。

### 11.3 AppID 坑（2026-09-12 实战）

- Cocos 构建产物会把 `project.config.json#appid` 写成历史残留值（本机出现过 `wx6ac3f5090a6b99c5`）。该 AppID 不属于当前登录账号时，`cli open/auto` 报 **`不存在此 AppID 请检查后重新输入 (code 10)`**，项目窗口根本不打开，且 CLI 退出码为 0、只有 stderr 里有 `[error]`——**极易误判为打开成功**。
- 解法：构建后把 appid patch 成官方测试号 **`touristappid`**（模拟器足够；真机才需要正式 AppID）。

### 11.5 game.json networkTimeout 校验误报（2026-09-12 实战）

- Cocos 构建产物 `game.json` 自带 `networkTimeout.downloadFile: 500000`。文件本身是合法 JSON object，但开发者工具（mg.2.02.2607171 / lib 3.17.2）编译报 **`game.json: networkTimeout 字段需为 object`**，值超常规档位（官方默认/上限 60000ms 一档）疑似触发校验器误报。
- 该字段不承重：wx-compat/SDK 自带连接超时，默认 60s 足够。解法：构建后**删除 `networkTimeout` 字段**，只留 `deviceOrientation`，回 DevTools 重新「编译」即过。

### 11.6 新基础库（3.17.x subcontext）适配坑（2026-09-13 实战）

**①裸 `Component` / `global` 不再是全局**

- 旧基础库把 `Component` / `global` / `window` / `canvas` 当全局变量注入 sandbox，新基础库（3.17.2 / 3.17.3）subcontext 把它们收到 `GameGlobal` 后端 getter 下，sandbox 内的裸名解析是 `undefined`。
- 表现：`ReferenceError: Component is not defined`（`assets/main/index.js:16988`）/`global is not defined`（`cocos-js/system-bundle.js:12`）/ `Cannot read properties of undefined (reading 'devicePixelRatio')`（`game.js:134`）。
- 解法（一次性，固化进 `scripts/patch-wechat-build.mjs`）：
  - 源码侧：所有 `extends Component` / 引用 `global` 的 ts 文件必须在 `import { ... } from 'cc'` 中显式列 `Component`（`OnlineFarm.ts:21` 漏了，`/Users/cairui/Code/farm-game/packages/client-mini/assets/scripts/OnlineFarm.ts` 已修）。
  - 构建产物侧：`game.js` 入口在 `__initApp()` 顶部加 `GameGlobal.global = GameGlobal;`（仅一行，无副作用，给 `cocos-js/system-bundle.js` 的裸 `global` 用）。

**②IDE 版本选择（RC 2.02.2607171 必炸）**

- RC 2.02.2607171 的 `SummerCompiler.getAllPageAndComponent` 硬编码按小程序取 `Object.keys(e.pages)`，小游戏项目 `GameConf.getConf` 只返回 `{app, packages}` → `pages=undefined` → `Object.keys(undefined)` 抛 `Cannot convert undefined or null to object`，**任何小游戏项目必白屏**（同 bundle 里 `getAllSortedJSFiles` 等其它方法都有空值保护，唯独这一处漏）。
- 编译产物反编译证实：asar 内 `app.asar` 的 `OriginalCompiler` 实现是安全的，问题只在 `SummerCompiler`。
- 解法：用 **`Stable 2.02.2608070`（2026-09-07）替换**。homebrew cask `wechatwebdevtools` 当前指向同一版本（`formulae.brew.sh/api/cask/wechatwebdevtools.json`），dmg 直链 `https://dldir1.qq.com/WechatWebDev/release/be1ec64cf6184b0fa64091919793f068/wechat_devtools_2.02.2608070_darwin_arm64.dmg`，sha256 `911600453eacc4e7c7b64366719bc8d0151bd5bdb36d7816ca17fc0881dcc681`。旧 RC 备份在 `/tmp/wechatwebdevtools-rc-2.02.2607171-backup.app` 可回滚。
- 替换应用后**必须重新微信扫码登录**（登录态随应用存储），否则 `cli open` 报 `不存在此 AppID (code 10)`——此错在登录态缺失时与 §11.3 同形，注意区分。

**③`miniprogram-automator` 对小游戏只剩 Tool.* 层（2026-09-13 定论）**

- 分层实测（`DEBUG=automator:protocol` 原始帧 + `scripts/farm-automator-split-probe.mjs`）：
  - `Tool.*`（IDE 级：`Tool.getInfo` / `Tool.getTestAccounts`）**1ms 内应答**——`checkVersion` 因此总是通过，容易误判"协议正常"；握手（TCP+WS）也始终成功。
  - `App.*`（游戏运行时节：`App.callFunction` / `App.captureScreenshot` / `App.getPageStack`）**全部超时**，而且超时是 **IDE 自己产生的**：约 2s 后回 `{"error":{"message":"timeout waiting for automator response"}}`（asar 内该字符串出自 `send_to_devtools_message` 的等待分支），不是客户端超时。
- 机制推断：IDE 把 `App.*` 转发给游戏运行时，由运行时侧 automator 客户端应答；小游戏侧没有应答端。已逐一排除的变量：`useIsolateContext`（true/false）、`enhance`、libVersion、新 IDE 会话 + `--trust-project`、游戏已在跑且已连后端、automator 0.12.1（wxgame-mcp 用 0.11.x 且声称 Stable 2.01.2510xxx 可用——版本相关，本项目不再投入）。
- 替代：headless 功能验收走 §11.4 的 dev bridge；截图/画布触摸走官方 agent 工具面（§11.8）。
- 真机调试不需要这条（真机协议是 wx.login/wx.connectSocket/wx.onShow/wx.requestMessageChannel），G4 上 OK。

### 11.4 headless E2E：dev bridge（2026-09-13 起为默认路径，实测 28/28）

**①无人值守启动（关键开关 `--trust-project`）**

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project /Users/cairui/Code/farm-game/packages/client-mini/build/wechatgame \
  --auto-port 9422 --trust-project
```

- **不带 `--trust-project` 时 IDE 停在「信任项目」弹窗**：`launch`/`checkVersion` 照常通过、端口照常监听，但模拟器不编译——零 console、2567 无连接。"headless 跑不起来"的真根因就是这个弹窗（曾经归因于首启对话框，方向对但开关没找对）。
- 带它之后实测：项目自动编译 + 游戏自动启动 + 自动连上后端，全程无人值守。
- `cli` 官方文档没写这个 flag，`cli auto -h` 里有（`--trust-project  Trust Project [boolean]`）；wxgame-mcp 的配方同样依赖它 +「设置 → 安全 → 自动化接口打开工具时默认信任项目」。
- 每次 Cocos 构建会重置构建产物，**必须先 `node scripts/patch-wechat-build.mjs`**（否则 appid 变残留值 → `code 10`，见 §11.3）。

**②观测 / 驱动通道：dev bridge（`scripts/farm-sim-telemetry.mjs`，127.0.0.1:9877）**

- 补丁脚本往 `game.js` 注入两段（幂等；bridge 段每次运行自动与新定义同步）：console 转发 + **命令轮询**（`GET /cmd` → 执行 → `POST /result`，400ms 间隔）。
- 命令种类：`state` = `__farm.state()`；`action` = `__farm.actions.{plant,water,harvest,unlock}`；`get` / `call` = 按点号路径读取/调用（例：`{"kind":"call","path":"__farm.app.refresh"}`）。驱动侧 HTTP：`POST /enqueue` 入队、`GET /result/:id` 取结果、`GET /lines?since=N` 取 console、`GET /health`（`gameListening` 表示游戏在轮询）。
- **沙箱禁用动态代码生成**：devtools 的 game sandbox 把 `Function` 换成反 tamper 桩（`new Function(...)` 返回**非函数**，报 `fn is not a function`），`(0, eval)` 也不是函数。所以桥**不能用 eval/表达式**，只能路径派发——官方 automator 的 `evaluate` 走的是 IDE debugger 特权通道，桥不是。
- 循环引用/大对象：桥侧 `safeResult()` 折叠成 `{__summary,__type,__keys}` 再回传；否则 `wx.request` 序列化抛错会表现为"命令丢失"（driver 侧只看到超时）。实测 `cc` / `cc.director` / `GameGlobal.cc` / `__farm.app` 都可达（只是不可序列化）——**场景图审计具备条件**。

**③验收脚本：`node scripts/farm-sim-bridge-e2e.mjs`**

- 流程：bridge 健康检查 → console 基线（`已连接服务端`、无 `boot failed` / `missing sprite frame` / 未处理拒绝）→ SQL fixture 复位（plot 0 空、plot 6 锁，保证跨运行幂等）→ 种（−10 金）→ 浇（revision 递增）→ 31s 成熟 → 收（+25 金）→ SQL 补金 + refresh → 解锁（−100 金）→ 每步 UI（`__farm.state()`）与 DB（psql）双断言。
- **2026-09-13 实测 28 pass / 0 fail**。
- 旧的 automator 版 `scripts/farm-sim-e2e.mjs` 保留作历史参考（本环境跑不通，§11.6③）；`scripts/farm-automator-split-probe.mjs` 是分层诊断探针（Tool.* vs App.*）。
- 仍需人工/GUI：**截图**（`simulator_screenshot` → §11.8 授权；OS 整屏 `screencapture` 被 macOS 屏幕录制权限挡住，本机实测黑屏）与**设备尺寸切换**（375/390/430 是 IDE GUI 动作）。
- automator 内部有 background rejection，凡直接用它仍需 `process.on('unhandledRejection')` 兜底。

### 11.7 素材 meta 导入类型：`texture` vs `sprite-frame`（2026-09-13 实战）

- 症状：模拟器 `[OnlineFarm] 加载失败: missing sprite frame: game/map/base (Error: Bundle resources doesn't contain game/map/base/spriteFrame)` → `boot failed`，首页整个出不来。
- 放大效应：加载器 `assets/scripts/farm/assets.ts` 对**每一个** key 都请求 `game/<key>/spriteFrame`，`map/base` 只是列表第一个——**失败即中断**，后面的问题不会逐个暴露（所以只看 console 会误以为只有一张图坏了）。
- 根因：项目里 80 个图片 `.meta` 全是 `"type": "texture"`（没有 `<uuid>@f9941` 子资源）。`spriteFrame` 子资源只在 `userData.type === "sprite-frame"` 时由导入器生成。
- 解法：`node scripts/fix-cocos-sprite-metas.mjs`（幂等：改 `userData.type`、补 `subMetas.f9941`，宽高从 PNG IHDR / JPEG SOFn 解析）→ 再跑 Cocos CLI 构建，由导入器补齐子资源。
- 验证：构建产物 `assets/resources/config.json` 的 `paths` 应出现 `<uuid>@f9941 → ['game/map/base/spriteFrame','cc.SpriteFrame']`（本次 80/80 素材 texture+spriteFrame 双条目齐全）；运行期 console 出现 `[OnlineFarm] 加载贴图 53/53…`。
- 顺序：`prepare-cocos-assets.py`（重生成图片，会带出 texture 类型 meta）→ `fix-cocos-sprite-metas.mjs` → Cocos 构建 → `patch-wechat-build.mjs`。素材管线重跑后**不要跳过**第二步。

### 11.8 官方 agent 工具面（截图 / 画布触摸的正路，需一次 GUI 授权）

- IDE 自带 skill 包与 CLI（v0.3.9）：`/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/wechatide-skill/`；入口 `wechatide`（在 app 包内 `/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide`，检查脚本 `skills/installer/scripts/check-installation.mjs` 会给出绝对路径；DMG 安装常需 `ensure-cli-path.mjs` 建软链）。
- 调用：`wechatide -c <clientName> <toolName> --project <path> [--token …]`。小游戏可用工具（官方 `skills/automator/SKILL.md` 明确）：`simulator_screenshot`（默认优化尺寸，返回 path + imageWidth/Height）、`automation_game_action`（**画布坐标** tap/swipe/touch*，可 `coordinateSpace=image` 按截图换算）、`automation_evaluate`、`automation_wx_api`、`compiler` 的 `simulator_refresh`。小游戏**不要**用 `automation_navigate` / `automation_element_action` / `automation_page_action` / `automation_runtime_info`（无页面栈/WXML）。
- **门禁（本机 2026-09-13 状态：pending）**：首次调用返回 `{"status":"pending","taskId":"auth_…"}`，需在 IDE 授权弹窗点允许（`-c` 的 clientName 必须与弹窗一致）；放行结果用 `wechatide -c <c> polling_task_result --task-id <id>` 轮询。这是人工动作：agent 不应代点，也不要从工具侧翻 token（官方文档 line: 禁止自行从开发者工具侧翻找）。
- `cli agent tool --name <tool>` 是同一工具面的 CLI 入口，但**本地技能解析写死读小程序的 `app.json#agent.skills`**；小游戏项目没有 `app.json` → `ENOENT …/app.json`，故小游戏只能用 `wechatide`。
- 授权未放行期间的替代：功能验收走 §11.4 的 bridge；布局/尺寸这类"看图"检查改走桥的 `get`/`call`（`cc.director` 可达）或等授权后截图。

### 11.9 地块连片布局契约（2026-09-13）

- 症状：24 格看起来是"散开的格子"，不是一整片耕地。
- 根因：格心距来自旧 rect 网格（70.7×90），行距 90 远大于贴图可见高 52 → 每行之间露 ~38px 草缝。
- 契约（改布局只走这三步，别手改坐标）：
  1. `node scripts/make-plot-layout.mjs`（可带 `--cols/--rows/--pitch-x/--pitch-y`）同时写源文件 `assets/sprites/v13/map/plot-layout.json` 与资源副本 `packages/client-mini/assets/resources/game/plot-layout.json`；默认 6×4、pitch 75×47、整块居中 `lawn_region_720`。
  2. pitch 推导：`plot_grass_empty.png` 在 88px 显示下不透明盒 81×55，其中顶面 42.6 + 棕色正面 4.5（其余是投影）→ **pitchY = 顶面+正面 = 47**（每排盖住后排投影、露出自己的正面）；**pitchX = 75**（最窄的 `plot_tilled_empty` 可见宽 74.9，取小值才不露缝）。
  3. `plotView.ts`：命中盒 = `cell_size_720`（与格子一一对应，零重叠；原来的 85×85 在 47 行距下会让前排偷走后排点击），倒计时标签 46×18 收进格内 `(0, +23)`。
- 生效链：改脚本 → 重生成 JSON → **Cocos 构建**（`plot-layout.json` 是打包进 bundle 的 JsonAsset，只改文件不重建不生效）→ `patch-wechat-build.mjs` → IDE 重编译。
- 验证：桥 `dump` 应返回 `x pitch: [75]`、`y pitch: [47]`、`Hit sz [75,47]`。

### 11.10 M5 完成度追赶（2026-09-13）+ 模拟器截图盲点 + G4 4MB 限制

> 用户反馈参考视频完成度差距后，做了 4 步追赶。期间被用户提醒"自己检查下，素材都失真了"——这才发现 **dump 验证不等于视觉验证**。本节记录截图发现的 3 个隐藏 bug + G4 真机 4MB 限制的处理路径。

**M5 四步改动**（代码详见 `git log --grep M5`）：

- **M5-A 场景道具 + 远山 + 池塘水波**：`SHOW_PARALLAX/WATER/PROPS` 全开（之前 baseline 都是 false），19 个 prop（3 远景小屋 + 5 中景围栏/树丛/牌子/井 + 4 近景莲花/桥 + 2 装饰石）分 3 层（far/mid/near）按 z-order 挂在 PlotGrid 之前/之后。dev-only 守门：`assertOutsideLawn()` 抛 throw 防止坐标踩地块。
- **M5-B 底栏 4 圆角彩色按钮**（仓库/商店/宠物/装扮）：替换原 5 键圆形占位（首页/仓库/种子/好友/更多），接 `ui_btn_round_red` kit 素材。
- **M5-C 侧栏 4+3 按钮接 kit 图标**（分享/音乐/菜单/相机 + 商城/萌宠/提篮）：替换原 7 圆形占位，接 `ui_icon_*` + `icons/seed_bag`。
- **M5-D 解锁弹窗"再想想"升级**为 `ui_btn_close` 72×72 × 按钮（主"开垦"按钮在 d5fcbbb 已接 `ui_btn_confirm`）。

**截图发现的 3 个隐藏 bug**（被用户戳"自己检查下"后才发现——d5fcbbb 当时没人截屏验证）：

1. **24 块全显示「100 金币 lock」**：根因 `OnlineFarm.refreshAll()` 只在 `app.start()` 成功后调，但 devtools 模拟器对 127.0.0.1 域 wx.request 拦截 → `app.start()` 永远失败 → `refreshAll()` 永远不跑 → PlotView 一直用构造时的默认 `lockIcon.enabled = true` + `priceLabel.active = true`。**修复**：`plotView.ts` 构造时 `lockIcon.enabled = false` + `priceLabel.node.active = false` + `setVisible()` 同步管理 `sprite.enabled`。
2. **金币/钻石木牌里的「0」字看不清**：`hud.ts` 浅黄字 `(255, 236, 160)` 配 332×357 浅米色木牌，对比度低。**修复**：label color 改深棕 `(80, 50, 15)` + 字号 32pt + 位置 `(0, 6, 0)`。
3. **LoadingCover 销毁依赖"已连接服务端"**：devtools 模拟器永远连不上 → cover 永远挡住 → 截图只见蓝屏。**修复**：`OnlineFarm.setStatus` 改为「加载贴图 N/N 完成」即销毁 cover。

**v13 batch H baseline 命名错误**：`ui_panel_gold_bar.png` / `ui_panel_cash_bar.png` 实际是**等级木牌**（带星星等级数），不是金币/钻石木牌。v13 batch H 当时命名错（d5fcbbb commit 之前就埋了）。当前 HUD 沿用旧命名（等级木牌暂代金币/钻石木牌），等 v13 批次重生成真木牌或换用 v8 切图。

**G4 4MB 限制 + release build 现状**（用户提"试试上传"才暴露）：

- 错误：`Error: 上传失败: 网络请求错误, ([object Object]) 系统错误, 错误码: 80051, source size 10365KB exceed max limit 4MB`
- 当前 release build 7.3MB（debug 11MB）但仍超 4MB。
- 包体构成：`cocos-js/_virtual_cc` 2.8M（引擎）+ `assets/resources` 2.6M（美术）+ `assets/internal` 0.6M + `assets/main` 0.3M。
- **release 跑通**：`/Applications/CocosCreator.app/Contents/MacOS/CocosCreator --project <dir> --build "platform=wechatgame;debug=false;startScene=1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"`。
- **release patch 脚本**：`node scripts/patch-release-build.mjs`（基于 `patch-wechat-build.mjs` 改造，但**不注入** dev bridge/telemetry、**不强制** `enhance=false`——release bundle 已 minify）。
- **真正的卡点：引擎裁剪需要 GUI 操作**（Cocos Creator「项目设置 → 引擎管理」勾掉 audio/3d/physics/spine/tiledmap/video/webview 等不需要的模块），CLI 不能改 `engine.json excludeModules`。**这是 G4 事项，不是 M5 范围**——d5fcbbb commit 时就标"release+裁剪是 G4 事项"。
- 进一步拆分：把 `assets/resources` 2.6M 拆到 subpackage 上 CDN（d5fcbbb progress 文档："parallax 远程包切分暂不需要"），Cocos 2.4 builder.json 加 `subpackages: [{name: "resources", root: "assets/resources"}]`，但这也要 GUI 配置。

**模拟器截图盲点**（对所有未来的"自动验收"流程都重要）：

- Cocos 模拟器 **debug build** 下每个 sprite 都加红色 AABB outline + 节点名浮层；`Frame time`/`Framerate`/`Draw call` 等浮层常驻显示。
- 这意味着 debug build 截图**不能**用于视觉验收——所有 sprite 都会带"红边"误导观感。
- `wechatide simulator_screenshot` 在 debug build 下截的图是 **cache frame**（dump 看到 v=0 但 GPU framebuffer 仍画旧 sprite，两者不同步，疑似 GLES frame swap 延迟）。
- **真机/真图验收**要么：a) 真机 G4（需要 release + 引擎裁剪 + 4MB 包体限制解决）；b) **Release 模拟器**（无 debug 浮层 + sprite outline 消失，**但仍有 frame cache 延迟问题**）。
- **未来应改**：收口流程加一步「release build 模拟器截图」作为视觉验收基线（之前 d5fcbbb 没做过，所以 24 块 lock bug 一直藏到今天）。

**M5 改动验证**：

| 验证项 | 结果 |
|---|---|
| `tsc -p packages/client-mini --noEmit` | ✅ EXIT 0 |
| `pnpm --filter @farm-game/client-mini test` | ✅ 29/29 |
| 桥 `dump` MapRoot 子树 | ✅ ParallaxBack=4 / SceneModules_Far=4 / SceneModules_Mid=12 / SceneModules_Near=7 / WaterLayer=2 / PathLayer=5 / PlotGrid=241 |
| 桥 `dump` ScreenUI 子树 | ✅ Nav_仓库/商店/宠物/装扮 各 3 子节点 / Btn_商城/萌宠/提篮 各 4 / Rail_分享/音乐/菜单/相机 各 3 |
| 桥 `dump` Plot_0 Lock/Price | ✅ v=0（修复生效） |
| 桥 `dump` LoadingCover | ✅ 不存在（已销毁） |
| Release build (debug=false) | ✅ 7.3MB（debug 11MB），但仍超 4MB |
| G4 真机上传 | ❌ **80051 / 4MB 限制**（G4 阻塞，需 GUI 引擎裁剪） |
| 模拟器视觉验收（debug 模拟器） | ⚠️ 受 debug 浮层 + sprite outline + frame cache 延迟干扰，不能做最终视觉基线 |

### 11.11 Sprite 双层 pattern（button + icon，2026-09-14 M6/M7 实战）

**核心**：所有「彩色圆角按钮 + 中心图标」都必须用 **2 个独立 sprite 叠加**——一个 button sprite（圆角方块/胶囊，纯色 + 渐变高光）、一个 icon sprite（白底/纯色居中）。代码层 `kitButton`/`railButton`/`Nav_*` 都是「先建 hit 节点 → 上 button sprite → 上 icon sprite（中心） → 加 label」三步走。

为什么不用单 sprite + 程序化 roundRect：

- 程序化 `roundRect()` 画的 bg + sprite icon 混在一起，缩放后 bg 圆角变形、icon 不在视觉中心
- 单 sprite 的按钮要换色/换图标必须重新出图
- 双层可以**单换图标**（A/B 测试）/ **单换底色**（节日皮肤），不重新出图

**M6 底部 4 键 tabbar**（仓库/商店/宠物/装扮，4 色）：

- 4 张 button PNG：`ui_btn_tabbar_{red,orange,blue,green}.png`（1024×1024，minimax 直出 + PIL alpha-key 240）
- 4 张 icon PNG：`icons/ui_icon_{crate,market,paw,palette}.png`（同源同工艺）
- `layout.ts` 加 `navBtnKeys[]` / `navIconKeys[]` / `navIconSize=64` / `navIconLiftY=4` 四个常量
- `bottomBar.ts` 把 for 循环改为每键取 `frames[btnKey]` / `frames[iconKey]` 双 sprite
- label 白字 `(255,255,255)` + 黑描边 `outlineWidth=2 / outlineColor=(40,30,20)`，在 4 色底上都可见

**M7 侧栏 7 键**（左 4 分享/音乐/菜单/相机 + 右 3 商城/萌宠/提篮，**7 色**）：

- 7 张 button PNG：`ui_btn_side_{share,music,menu,camera,shop,pet,basket}.png`（避免和 tabbar 4 色撞色，每按钮独立色匹配动作语义）
- icon 复用现有 kit（share/music/menu/camera/shop/pet/seed_bag），**未重出**
- `layout.ts` 把 `sideBtns[i] / leftBtns[i]` 重构为 `{ btnKey, iconKey, top, label }`；加 `sideBtnIconSize=72` + `leftBtnIconSize=60`
- `sideColumn.ts` 同样双层；disabled 按钮双 sprite 都 `setOpacity(0.6)`
- 7 色 palette（写进记忆，方便复用）：

  | 按钮 | hex | 色彩名 |
  |---|---|---|
  | 分享 share | `#4FC3D9` | teal cyan |
  | 音乐 music | `#9B6BD9` | soft purple |
  | 菜单 menu  | `#5C6680` | slate gray |
  | 相机 camera| `#E66B9C` | soft pink |
  | 商城 shop  | `#F5C242` | warm gold |
  | 萌宠 pet   | `#6BD9A3` | mint green |
  | 提篮 basket| `#F0944D` | warm orange |

**minimax image-01 直出 PNG 全流程**（不需要 MCP 中转，可脚本批跑 7+ 张）：

```bash
# 1) key 必须在 interactive zsh env（memory: minimax API key 安全）
zsh -lic 'python3 /tmp/gen_side_btns.py'   # /tmp/gen_side_btns.py 见下
```

`/tmp/gen_side_btns.py` 流水线：

1. 调 `https://api.minimax.chat/v1/image_generation` REST（`Authorization: Bearer $MINIMAX_API_KEY`），`response_format: base64`，**注意返回是 `data.image_base64` 数组**（不是 `data.images`，已踩过）
2. PIL 解码 → 转 RGBA → R/G/B 全 ≥ 240 像素 α=0（白底 key 掉，threshold=240 比 255 更稳，能去 minimax 的 #F8–#FE 灰边）
3. 写到 `packages/client-mini/assets/resources/game/{ui,icons}/<name>.png`

**新 PNG 的 sprite-frame .meta 一条龙**：

```bash
node scripts/fix-cocos-sprite-metas.mjs   # 只对老 PNG（已有 texture meta）有效
# 新文件无 .meta：用 /tmp/gen_sprite_meta.py（写全新 .meta，包含 texture 6c48a + sprite-frame f9941 子资源）
python3 /tmp/gen_sprite_meta.py packages/client-mini/assets/resources/game/ui/ui_btn_side_*.png
```

不写 sprite-frame .meta → Cocos 加载时报 `Bundle resources doesn't contain game/<key>/spriteFrame` → boot failed 全屏蓝（§11.7）。

**`assets.ts` 必须同步加 key**，否则 `loadAll()` 不请求这张图，浪费导入时间。键名规则：`ui/ui_btn_<group>_<color>` / `icons/ui_icon_<name>`，避免和 kit 命名冲突。

### 11.12 funplay-cocos-mcp 调试 + asset DB sync 坑（2026-09-14 实战沉淀）

**①装 + 接 + 启（一次性）**

```bash
# clone to Cocos builtin-extensions
git clone https://github.com/FunplayAI/funplay-cocos-mcp \
  ~/.CocosCreator/builtin-extensions/3.8.8/funplay-cocos-mcp
# 软链到项目（避免 .gitignore 黑名单外泄到仓库）
ln -s ~/.CocosCreator/builtin-extensions/3.8.8/funplay-cocos-mcp \
  packages/client-mini/extensions/funplay-cocos-mcp
# 关键：必须写 funplay-cocos-mcp.config.json 把 toolProfile 提到 "full"
cat > packages/client-mini/funplay-cocos-mcp.config.json <<'EOF'
{ "toolProfile": "full", "host": "127.0.0.1", "port": 22143,
  "portMode": "project", "autostart": true,
  "executeJavascriptSafetyChecks": true }
EOF
# ZCode MCP client 配置（~/.zcode/cli/config.json）
"funplay_cocos": { "type": "http", "url": "http://127.0.0.1:22143/",
                   "enabled": true }
# 启动 Cocos（会自动起 MCP server）
/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator \
  --project /Users/cairui/Code/farm-game/packages/client-mini
```

- 默认 `toolProfile: "core"` 只暴露 39 工具；`capture_game_screenshot` / `run_project_preview` / `refresh_assets` 等都在 `full` profile（共 105 工具）。
- `toolProfile: "full"` 改了之后必须**重启 Cocos** 才生效（插件启动时一次性读 config）。
- `extensions/funplay-cocos-mcp` 是**符号链接**到 `~/.CocosCreator/builtin-extensions/`，加进 `.gitignore`（`packages/client-mini/extensions/`）——它是工具不是游戏资产。
- `funplay-cocos-mcp.config.json` 也加 `.gitignore`，是本机 MCP 配置不入库。

**②核心工具用法（主 agent 用，subagent 不调）**

```javascript
// 1) 切到 gameView（不是 browser / simulator）
mcp tools/call set_preview_mode {"mode":"gameView"}

// 2) 启动 preview（等 6s 让游戏加载完成）
mcp tools/call run_project_preview {}    // 首次可 forceRestart=true

// 3) 关键：先让 OnlineFarm 挂到 Canvas（场景默认空）
mcp tools/call execute_scene_script {
  context: "scene",
  code: "(function(){const c=cc.find('Canvas');const ex=c.getComponent('OnlineFarm');if(ex){if(!ex.enabled){ex.enabled=true;if(ex.onLoad)ex.onLoad();}return;}c.addComponent('OnlineFarm').onLoad();})()"
}

// 4) 截图（M6/M7 用这条验证 tabbar + 侧栏 7 按钮）
mcp tools/call capture_game_screenshot {"outputPath":"/tmp/shot.png"}
```

**踩过的参数名坑**：

- `execute_scene_script` 的参数是 **`code`** 不是 `script`（用 `script` 直接报 "code is required"）
- `refresh_assets` 接 `paths: [...]`，**路径用仓库相对路径不带 `db://`**（如 `"assets/resources/game/ui"` 不是 `"db://assets/resources/game/ui"`）
- `run_project_preview` 不接 `forceRestart` 默认就 restart，传了反而有时 hang

**③asset DB sync 死锁（本次会话卡住的真凶，§11.10 截图盲点之后第二个工具栈坑）**

- 现象：手写 7 张新 PNG + `.meta` 写到 `assets/resources/game/ui/`，Cocos 启动后 `require('@editor/asset-db').forEach(cb)` 始终返回 **0**，但 `library/.assets-info.json` 在每次 `refresh_assets` 后都被 Cocos 重写（262 个目录条目含全部 ui 文件）。
- 后果：runtime `cc.assetManager.assets` 也只有 111 个（engine builtins），`bundles` 列表只有 `["internal"]`，**0 个项目 sprite 被加载**。OnlineFarm.onLoad() 走到 `loadAll` 就 reject → sideColumn/bottomBar 全 null，但 status label 被后续 "已连接服务端" 覆盖，看不到失败原因。
- 试遍无效：`adb.refresh` / `adb.reimport` / `save_current_scene` / `cc.resources.loadDir("game/ui")` / `cc.assetManager.loadBundle("resources")` / `pkill && rm -rf library/ && cold restart` —— in-memory cache 永远不装载。
- **结论**：本会话的 MCP singleton 引用了一个未被进程初始化的 DB 实例；disk .assets 已被 Cocos 重写过说明 Cocos 在做 scan，但 MCP 侧拿不到结果。
- **绕过**：让用户在新开 Cocos 会话里手验（截图 §11.8 / 桥 dump §11.4），或者直接 commit + push（**M6/M7 commit cc92afc / 5aff3fc 已落地，代码侧 29/29 测试 + tsc 全绿**）。
- **教训**：MCP 工具栈不靠谱时**别死磕**——disk 上 .assets 能验出来就够说明 Cocos 看到了文件；runtime 能不能 load 是引擎 startup 顺序问题，不是文件问题。下次开工先 `pkill` + `rm -rf library/` + 冷启，等 Cocos 跑完首屏（菜单/资源管理器都画出来）再接 MCP。

**④GUI 操作只在 main agent**

- WebView 菜单里的「打开项目 / 编译 / 触发 asset 重导入」等按钮**无法**用 CGEvent / AppleScript 点（Electron WebView 不响应），必须 main agent 在 macOS GUI 里点。
- ZCode subagent 用 `Agent` 工具委派只能做**只读 / 编辑**任务，GUI 操作（点击 WebView、微信开发者工具 IDE 授权弹窗）全部 main agent 自己来。
- 本会话已踩：wechatide 工具面的 GUI 授权（§11.8）以及 funplay-cocos-mcp 的「编辑器编译按钮」都属此类。
