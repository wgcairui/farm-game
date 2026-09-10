# Cocos Creator 集成指南

把设计稿 + SVG 资源落地到 Cocos Creator 工程的标准流程。

## 一、环境准备

| 工具 | 版本 |
|------|------|
| Cocos Dashboard | 最新 |
| Cocos Creator | 3.8.x LTS |
| Node.js | ≥ 18 LTS |
| TypeScript | 内置 |
| 微信开发者工具 | 最新（小程序发布）|
| Xcode | 15+（iOS） |
| Android Studio | Hedgehog+（Android） |

## 二、项目初始化

### 步骤 1：创建 2D 项目

1. 打开 Cocos Dashboard → "新建项目"
2. 选 **2D** 模板（不要选 3D）
3. 项目名：`FarmGame`
4. 路径：`/Users/cairui/Code/FarmGame`（**不要**和设计稿同一目录）
5. 引擎版本：3.8.x LTS

### 步骤 2：导入 SVG 资源

把 `assets/sprites/` 整个目录拷到 Cocos 工程的 `assets/` 下：

```bash
cp -r /Users/cairui/Code/farm-game/assets/sprites/* \
      /Users/cairui/Code/FarmGame/assets/
```

**在 Cocos 中**：
1. 选中所有 SVG 文件 → 右键 → "**导入为 Sprite Frame**"
2. Type 选 `sprite-frame`
3. Filter Mode 选 `bilinear`
4. Prem勾 alpha 勾选
5. 点击"应用" → Cocos 自动转换 SVG 为图集

### 步骤 3：开启 TypeScript

`项目设置 → Scripting → TypeScript → 启用`

Cocos Creator 3.8 内置 TS 支持，无需额外配置。

## 三、项目结构搭建

### 推荐目录结构

```
FarmGame/
├── assets/
│   ├── scenes/              # Cocos 场景文件
│   │   ├── Main.scene       # 农场主页场景
│   │   ├── Inventory.scene  # 仓库场景
│   │   └── Shop.scene       # 商店场景
│   ├── prefabs/             # 预制体
│   │   ├── Plot.prefab      # 地块 prefab
│   │   ├── Crop.prefab      # 作物 prefab
│   │   ├── Building.prefab  # 建筑物 prefab
│   │   └── UIButton.prefab  # UI 按钮
│   ├── scripts/             # 业务逻辑
│   │   ├── core/            # GameApp / EventBus / TimeManager
│   │   ├── systems/         # FarmSystem / ShopSystem 等
│   │   ├── ui/              # UI 控制器
│   │   └── utils/           # 工具
│   ├── resources/           # 动态加载资源
│   ├── audio/               # BGM / SFX
│   └── sprites/             # SVG 资源（已拷贝）
├── settings/                # 项目配置
├── profiles/                # 构建配置
└── package.json
```

### 复制业务脚本

```bash
cp -r /Users/cairui/Code/farm-game/scripts/* \
      /Users/cairui/Code/FarmGame/assets/scripts/
```

## 四、prefab 模板搭建

### 4.1 地块 prefab（Plot.prefab）

**节点树**：
```
Plot (Node)
├── Background (Sprite)         ← plot_grass.svg 或 plot_dirt.svg
├── Crop (Node)                 ← 可切换子节点
│   ├── Stage1 (Sprite)         ← *_seedling.svg
│   ├── Stage2 (Sprite)         ← 中间阶段（半透明 overlay）
│   ├── Stage3 (Sprite)         ← 成熟作物
│   └── ReadyBadge (Node)       ← 可收获黄色脉冲圆点
└── ProgressRing (Sprite)       ← 进度环
```

**绑定组件**：
- `Plot.ts`（业务脚本）
- 暴露属性：`@property(Sprite) background` / `@property(Node) crop` / `@property(Sprite) progressRing`

### 4.2 作物 prefab（Crop.prefab）

3 个 Sprite 子节点，对应 `seedling` / `growing` / `mature` 阶段，运行时切换可见性。

### 4.3 建筑物 prefab（Building.prefab）

直接放 SVG + 一个 `House` 节点引用即可。示例代码：

```typescript
// scripts/systems/FarmSystem.ts（已提供）
const PLOT = 'Plot';  // prefab 路径
resources.load(PLOT, Prefab, (err, prefab) => {
  const node = instantiate(prefab);
  this.node.addChild(node);
});
```

## 五、场景搭建（Main.scene）

### 节点树

```
Canvas (Node, 750×1334)
├── Camera
├── Background (Node, z=-1)
│   ├── Sky (Sprite, sky_gradient.svg)
│   ├── Clouds (Node)
│   │   ├── CloudA (cloud_a.svg)
│   │   ├── CloudB (cloud_b.svg)
│   ├── Mountains (Sprite, mountains_far.svg)
│   ├── Trees (Node)
│   │   ├── TreeL (tree_large.svg)
│   │   ├── TreeR (tree_conifer.svg)
│   ├── Grass (Sprite, grass_tile.svg)
│   ├── Pond (Sprite, pond.svg)
│   ├── Cottage (Sprite, buildings/cottage.svg)
│   └── Path (Node)
│       ├── StonePath1 (stone_path.svg)
│       └── StonePath2 (stone_path.svg)
├── FarmLayer (Node, z=0)
│   ├── PlotGrid (Node)
│   │   ├── Plot00 (Plot.prefab)
│   │   ├── Plot01 (Plot.prefab)
│   │   └── ... (24 个)
├── HUD (Node, z=10)
│   ├── TopBar (HUD.ts)
│   │   ├── Avatar (Sprite, avatar_lion.svg)
│   │   ├── LevelBadge (Label)
│   │   ├── ExpBar (ProgressBar)
│   │   ├── CoinBox (Sprite + Label)
│   │   └── GemBox
│   ├── SideLeft (Node)
│   │   ├── ShareBtn
│   │   ├── MusicBtn
│   │   └── MenuBtn
│   ├── SideRight (Node)
│   │   ├── MallBtn
│   │   ├── CharityBtn
│   │   └── OneKeyFarmBtn
│   ├── TaskBar (Node)
│   │   ├── Icon (book)
│   │   ├── Progress
│   │   └── Finger (emoji)
│   └── FriendHelp (Node)
│       ├── Avatar
│       ├── Info
│       └── CloseBtn
└── TabBar (Node, z=11)
    ├── TabInventory (tab_inventory.svg)
    ├── TabShop (tab_shop.svg)
    ├── TabPet (tab_pet.svg)
    ├── TabDecor (tab_decor.svg)
    └── TabFriend (tab_friend.svg)
```

### 屏幕适配

`项目设置 → 项目数据 → 设计分辨率 / 适配屏幕宽度`

```
设计分辨率：750 × 1334（iPhone 14）
适配策略：Fixed Width
```

## 六、关键脚本接入

### GameApp 启动顺序

```typescript
// scripts/core/GameApp.ts
import { _decorator, Component } from 'cc';
import { SaveManager } from './SaveManager';
import { EconomySystem } from '../systems/EconomySystem';
import { InventorySystem } from '../systems/InventorySystem';
import { FarmSystem } from '../systems/FarmSystem';
import { ShopSystem } from '../systems/ShopSystem';
import { TimeManager } from './TimeManager';

@ccclass('GameApp')
export class GameApp extends Component {
  public timeManager = new TimeManager();
  public saveManager = new SaveManager();
  public economy = new EconomySystem();
  public inventory = new InventorySystem();
  public farm = new FarmSystem();
  public shop = new ShopSystem();

  onLoad() {
    this.saveManager.load();
    this.economy.init(this.saveManager.data.coins, this.saveManager.data.diamonds);
    this.inventory.init(this.saveManager.data.inventory);
    this.farm.setTimeManager(this.timeManager);
    this.farm.bindInventory(this.inventory);
    this.farm.init(this.saveManager.data.plots);
    this.shop.bind(this.economy, this.inventory);

    this.farm.recalcOnLogin();
    this.schedule(this.farm.tick.bind(this.farm), 1.0);
  }
}
```

挂载到 `Canvas` 下的一个常驻 Node（如 `_App`）即可。

## 七、构建发布

### 7.1 微信小游戏

1. `项目设置 → 微信小游戏 → AppID`（测试可填"测试号"）
2. `构建 → 微信小游戏` → 输出到 `build/wechatgame/`
3. 微信开发者工具导入 `build/wechatgame/` 即可预览
4. 提交审核前需要在 `project.config.json` 填入小游戏 AppID

### 7.2 iOS

1. `项目设置 → iOS` 配证书
2. `构建 → iOS` → 输出 Xcode 工程
3. Xcode 打开 → Archive → 上传 App Store Connect

### 7.3 Android

1. `项目设置 → Android` 配 keystore
2. `构建 → Android` → 输出 APK / AAB
3. 上传 Google Play 或国内安卓市场

## 八、性能预算与优化

| 指标 | 目标 |
|------|------|
| 首包大小（微信）| ≤ 4 MB |
| 启动时间 | ≤ 2s |
| 30 个作物动画同播 | ≥ 30 FPS |
| 内存占用 | ≤ 200 MB |

**优化策略**：

| 优化项 | 做法 |
|--------|------|
| 纹理压缩 | ASTC（iOS）/ ETC2（Android）|
| 图集打包 | TexturePacker 把同场景 sprite 打图集 |
| 对象池 | 作物动画预创建，复用 |
| 分包加载 | 首包只含农场场景，其他场景分包 |
| 资源懒加载 | 商店/仓库按需 load |

## 九、调试与开发流程

### 9.1 调试工具

- **Cocos 编辑器**：场景搭建、prefab 编辑、属性面板
- **VSCode**：TS 编辑（推荐装 Cocos 插件）
- **Chrome DevTools**：调试 H5 / 小游戏模式
- **Safari Web Inspector**：调试 iOS WKWebView
- **微信开发者工具**：调试小游戏

### 9.2 开发命令

```bash
# 启动 Cocos Dashboard 后，从 Dashboard 打开项目即可
# 命令行构建（CI 用）：
cd /Users/cairui/Code/FarmGame
CocosCreator --path . --build "platform=wechatgame"
```

### 9.3 调试 checklist

- [ ] 首次启动能看到农场主页场景
- [ ] 地块能点击 → 弹出种子选择器
- [ ] 种下后能看到作物生长动画
- [ ] 收获后金币增加
- [ ] 关闭游戏 1 小时后重开，作物自动成熟
- [ ] 仓库/商店页 Tab 切换流畅
- [ ] 微信开发者工具能跑（4 MB 首包）

## 十、版本里程碑

| 阶段 | 产物 | 周数 |
|------|------|------|
| **Week 1-2** | 工程初始化 + 资源导入 + 主场景搭建 | 2 |
| **Week 3-4** | GameApp + FarmSystem + ShopSystem 业务接入 | 2 |
| **Week 5-6** | UI 控制器 + 动画 + 音效 | 2 |
| **Week 7-8** | 调优 + 性能优化 + 微信小游戏发布 | 2 |
| **Week 9-12**| iOS / Android 移植 | 4 |

## 十一、参考资源

- Cocos 官方文档：https://docs.cocos.com/creator3.8/manual/zh/
- TypeScript 手册：https://www.typescriptlang.org/docs/handbook/
- 设计规范：本目录 `docs/design-spec.md`
- 数据结构：本目录 `docs/data-schema.md`
- 业务骨架：本目录 `scripts/`

---

**任何问题先看：**
1. `docs/data-schema.md` — 字段定义
2. `docs/design-spec.md` — 视觉规范
3. `scripts/systems/` — 业务逻辑参考实现
4. `assets/sprites/README.md` — 资源说明

如果还卡，请把控制台报错 + 截图发出来一起排查。