# 主页 UI 实施方案（模拟器优先，v13 素材 + v24 布局原则）

> 日期：2026-09-12 · 状态：待实施 · 修订 r2：并入批次 D–H（新增 M5 / U20–U23，UI 套件直接换皮，包体预算上调 + U17 升级为硬门）
> 目标读者：本仓库的开发者 / subagent team（任务描述按可直接执行撰写）
> 范围：**微信开发者工具模拟器**内把主页 UI 从「242 行程序化占位」升级为 v13 素材 + v24 布局原则的完整视觉。**不含**真机回归（G4）、真实微信登录（G1.5）、图集/包体极限优化（仅审计记录）。
> 上游输入：[scene-spec-v24.md](./scene-spec-v24.md)（布局原则）· [reference-video-analysis.md](./reference-video-analysis.md)（12 层图层模型）· [cocos-runbook.md](./cocos-runbook.md)（构建链与联调坑）· `assets/sprites/v13/`（**82 件已定稿素材，批次 A–H 全部完成**）· `docs/progress-phase2.md` §12–13（G3 现状与美术批次）。

---

## 1. 目标

在模拟器里达成一个「可以给人看、给人玩」的主页：

1. **大地图底图**（v13 `farm-map-base-2x.jpeg`）铺满画面，24 格地块按 `plot-layout.json` 坐标精确叠放其上；
2. **地块六态完整视觉**：锁定（+100 金价签）/ 空草地 / 已耕 / 湿土 / 成熟发光 / 选中框；
3. **5 作物 × 4 阶段**按服务端时钟推进，带剩余时间倒计时；
4. **完整交互闭环**：选种弹窗 → 种植 → 浇水（特效 + 加速）→ 收获（特效 + 金币飞行）→ 解锁新地（确认弹窗），全部走服务端权威（`OnlineGameApp` 现有方法，**零协议变更**）；
5. **屏幕层 UI**（v24 布局原则 + 批次 H 套件）：顶栏金币、右功能列、左快捷区、底部导航、toast、弹窗，命中区 ≥ 44 物理像素，375/390/430 三宽度无重叠无越界；
6. **场景完整层**（批次 D–G）：远山双层视差带、树林带、水域波光 2 帧动画、荷叶/小桥/道路/灌木摆件，按 12 层模型接入 MapRoot。

完成后的模拟器验收 = 现有 G3 E2E 闭环（登录→种→30s→收）**不退化**，并新增解锁/选种/断线横幅等场景。

## 2. 现状与差距

| 项 | 现状（G3 收口态） | 本方案目标 |
|---|---|---|
| 场景搭建 | `Main.scene` 仅一个 `OnlineFarm` 组件，运行时程序化生成纯色块 UI | 保持「代码搭建 + 单根组件」，拆为 `farm/*` 模块树 |
| 底图 | 无（纯色背景） | v13 大地图底图 + 场景模块摆件 |
| 地块 | 3 张旧切片图（locked/grass-empty 在用，tilled-empty 入库未用） | v13 六态素材 + 覆盖层，坐标来自 `plot-layout.json` |
| 作物 | 仅 carrot 4 阶段 | 5 作物 × 4 阶段 + 倒计时 |
| UI | 3 个裸 Label | 顶栏/右列/左列/底栏/弹窗/toast，v24 布局原则 |
| 素材入库 | 旧 `slice-assets` 8 张 PNG | v13 82 件（A–H 全批次）经预处理脚本入 `resources/`，旧图退役 |
| 交互 | 点地块 = plant(carrot)/water/harvest | + 选种弹窗、解锁确认、失败 toast、特效 |
| 适配 | `view.getVisibleSize()` 自适应网格 | 720×1280 Fit-Height 基准 + Widget 锚点 UI |

## 3. 关键决策

| # | 决策 | 理由 |
|---|---|---|
| **D1** | **Cocos 工程设计坐标改为 720×1280（Fit Height），v24 的 692×1218 几何降级为 HTML 预览参考，不再作为 Cocos 基准** | v13 底图资产（1440×2560 @2x）与 24 格坐标（`plot-layout.json`）全部以 720×1280 为基准；v24 自身声明「最终素材不得按 v24 冻结」且是程序化 SVG 几何，与 AI 底图透视不一致。v24 的**布局原则**（命中区、栏序、审计思路）继续沿用 |
| **D2** | **Fit Height（高度固定 1280，宽度随设备）**，底图按 cover 铺满 | 375/390/430 宽手机的可视宽度 ≈ 591 设计 px < 720，底图天然覆盖；若 Fit Width 则 19.5:9 屏可视高 ≈1558 > 1280，上下露边。24 格横向跨度 118–582，任何手机纵横比下都完整可见 |
| **D3** | **保持「运行时代码搭建 UI」**，不手写 `.scene` JSON、不在编辑器手摆节点；场景仍只有 `Canvas + OnlineFarm` 单组件 | `gen-cocos-scene.mjs` 生成流程与 uuid 锚点不变；E2E 自动化（`globalThis.__farm`）不受影响；全部几何收敛到一个 `layout.ts`，可单点调参 |
| **D4** | **UI 零协议变更**：弹窗/按钮只调用 `OnlineGameApp` 现有 `unlock/plant/water/harvest`，UI 不新增本地结算规则 | 服务端权威（ADR-0002/0003）已锁死玩法；「一键种植」等批量操作是客户端循环调用，后续可加，不需动协议 |
| **D5** | **v13 是唯一美术基线**，旧 `assets/game/` 切片 8 张从 `resources/` 退役（仓库根目录产物保留不动）；批次 H 套件已就绪，弹窗/HUD 底板**直接用 `ui/` 套件**（`ui_popup_panel` 九宫格、`ui_panel_gold_bar` 等），程序化底板仅作套件单件不合格时的兜底 | 避免两套素材并存漂移；套件缺口件（提篮/公益图标）按 §7 降级方案处理 |
| **D6** | **素材必须预处理后入库**（缩放 + 量化），原始 11MB 直接进 `resources/` 不可接受（地块/特效是 1024² 大图，显示尺寸 ≤85 设计 px） | 微信小游戏首包 ≤4MB 红线（known pitfalls）；模拟器阶段就按压缩基线入库，G4 只做图集合并而非补救 |

## 4. 目标场景结构

### 4.1 节点树（运行时构建，对应 12 层模型的当前可用子集）

```
Canvas                                    # 720×1280 基准（D1/D2）
├── MapRoot                               # 地图组+对象组（未来随镜头滚动）
│   ├── ParallaxBack                      # L2/L3 视差带：mountains_far(0.15) → mountains_near(0.3) → forest_belt(0.5)
│   ├── MapBase                           # L4 底图 sprite（720×1280，中心 360,640）
│   ├── PathLayer                         # L5 道路摆件：path_straight_stone/dirt + curve + end_cap
│   ├── WaterLayer                        # L6 水域：pond_water 2 帧交替 + lily_pad_a/b + lotus_flower + module_bridge
│   ├── PlotGrid
│   │   └── Plot_{0..23}                  # L8 地块 + L9 作物（见 4.2）
│   ├── SceneModules                      # L7 摆件（cottage / water_well / fence_* / bush_a–d / haystack…）
│   └── FxLayer                           # L10 特效（收获/浇水/种植/金币飞行）
└── ScreenUI                              # 屏幕组（Widget 锚点，永不随地图滚）
    ├── TopHud                            # L11：金币面板（ui_panel_gold_bar）/点券占位（ui_panel_cash_bar）/头像占位/连接状态点
    ├── LeftRail                          # 分享/音乐/菜单/相机（ui_icon_share/music/menu/camera）
    ├── SideColumn                        # 商城（ui_icon_shop）/萌宠（ui_icon_pet）/提篮（占位）/时间胶囊
    ├── BottomBar                         # 任务条占位 + 5 键导航占位
    ├── ToastLayer                        # toast 队列
    └── DialogLayer                       # 遮罩 + 选种弹窗/解锁确认（ui_popup_panel 九宫格）
```

MapRoot 与 ScreenUI 的先后即绘制顺序；ParallaxBack 在 MapBase 之下（远景），PathLayer/WaterLayer 在 MapBase 之上、PlotGrid 之下（地物）；`FxLayer` 挂在 PlotGrid 之后保证特效压在地块上；对话框永远最后。视差系数在镜头漫游（后续任务）才生效，本期静态摆位即可，但节点结构按此预留。

### 4.2 单个地块节点（Plot_{i}）

```
Plot_{i}                       # 位置 = layout 坐标（4.3），锚点中心
├── Base      (Sprite)         # plot_locked / plot_grass_empty / plot_tilled_empty
├── Crop      (Sprite)         # crops/{id}/stage-1..4；growing/ripe 时显示
├── OverlayWet   (Sprite)      # overlay_wet，waterCount > 0 时显示
├── OverlayRipe  (Sprite)      # overlay_ripe，derivedRipe 时显示（叠加轻微缩放呼吸 tween）
├── OverlaySel   (Sprite)      # overlay_selected，touch-down 显示
├── LockSign  (Sprite+Label)   # icons/lock_sign + 「100」价签，仅 locked
├── TimeLabel (Label)          # growing 时 mm:ss 倒计时
└── Hit       (Node+UITransform 85×85)   # 唯一命中节点，TOUCH_END 派发
```

状态机（数据源 = `OnlineGameApp.state()` 的 `OnlinePlotView`）：

| 数据状态 | Base | Crop | Overlay | 说明 |
|---|---|---|---|---|
| `!unlocked` | plot_locked | — | — | LockSign + 价签（`UNLOCK_PRICE_GOLD` = 100） |
| `empty` | plot_grass_empty | — | — | 点按 → 选种弹窗 |
| `growing`（未熟） | plot_tilled_empty | stage 按进度 1–3 | waterCount>0 → wet | 点按 → water；TimeLabel 倒计时 |
| `growing` + `derivedRipe` | plot_tilled_empty | stage-4 | ripe | 点按 → harvest |
| `ripe`（服务端判定） | 同上 | stage-4 | ripe | 同上 |
| 任意 + 按压中 | — | — | +selected | 松手清除 |

### 4.3 坐标与尺寸（`farm/layout.ts` 全量常量）

- **坐标系转换（必读）**：`plot-layout.json` 的 `center_720` 是**图像坐标（y 向下、原点左上）**；Cocos UI 是**中心原点、y 向上**。转换：`cocosX = center_720[0]`，`cocosY = 1280 − center_720[1]`。例：plot 0 → (153.3, **522**)，plot 23 → (546.7, **228**)。搞反 y 是本项目历史最爱踩的坑。
- 地块 sprite 显示尺寸：`84×84` 设计 px（初值，覆盖 70.7×90 格心距的视觉重叠，模拟器校准）；作物 sprite `56` 设计 px 宽，锚在格中心上移 `6` px。
- **命中区 ≥ 85×85 设计 px**：375 物理宽屏上 1 设计 px ≈ 0.52 物理pt，85 设计 px ≈ 44 物理pt，正好满足 v24 命中规则。命中节点独立于视觉 Sprite（v24 §6 原则）。
- 屏幕层初排（全部 Widget 锚点 + 内边距常量，**模拟器校准项**，U15 审计）：

| 元素 | 锚点 | 初排值（设计 px） |
|---|---|---|
| TopHud | top-center / top-left | 金币面板中心 (200, 1280−48)；头像占位 (48, 1280−48)；连接点 (700, 1280−24) |
| SideColumn | right-center | 商城 (720−56, 940)、公益 (720−56, 830)、提篮 (720−56, 720)、时间胶囊 (720−56, 620)，按钮 88×88、间距 ≥ 20 |
| LeftRail | left-center | 分享 (56, 1060)、音乐 (56, 960)、菜单 (56, 860)，按钮 88×88 |
| BottomBar | bottom | 任务条占位 (0..350, 96)；导航 5 键 y=64，x 均分 72..648 |
| Toast | top-center | y = 1280−160，队列纵向排 |
| Dialog | center | 遮罩全屏；底板 560×640 九宫格 |

## 5. 素材入库（预处理管线）

新建 `scripts/prepare-cocos-assets.py`（Pillow，沿用 `slice-assets.py` 的工程风格），从 `assets/sprites/v13/` 生成 `packages/client-mini/assets/resources/game/`。**源目录永远不改动**；脚本可重复执行、输出尺寸报告到 `resources/game/prepare-report.json`。

| 源（assets/sprites/v13/） | 目标（resources/game/） | 处理 | 预算 |
|---|---|---|---|
| `map/farm-map-base-2x.jpeg` | `map/base.jpg` | 重压缩（quality 82）+ 尺寸不变 | ≤ 450 KB |
| `map/plot-layout.json` | `plot-layout.json` | 原样拷贝 | — |
| `plots/plot_*.png` × 3 | `plots/` | 缩至 256² + 量化 256 色 | 6×≤35 KB |
| `plots/overlay_*.png` × 3 | `plots/` | 同上 | 含上 |
| `crops/{carrot,corn,potato,strawberry,tomato}_stage{1..4}.png` | `crops/{id}/stage-{1..4}.png` | 缩至 256² + 量化 | 20×≤45 KB |
| `icons/*.png` × 9 | `icons/`（coin_gold, coin_flying, lock_sign, seed_bag, water_drop, watering_can, watering_can_alt, star_gold, harvest_sparkle） | 量化（尺寸已合适） | ≤ 250 KB |
| `effects/fx_*.png` × 5 | `fx/`（plant_dust, water_splash, harvest_burst, coin_fly, levelup_badge） | 缩至 512² + 量化 | 5×≤120 KB |
| `scene-modules/*.png` × 10 | `modules/`（cottage, cottage_small, bush, fence_segment, fence_stones, fence_white, haystack, lotus_pond, signboard, water_well） | 尺寸已合适，量化 | ≤ 350 KB |
| **D** `mountains_far_strip.png`（2880×576）/ `mountains_near_strip.png`（2880×319）/ **E** `forest_belt_strip.png`（2880×344） | `parallax/` 同名 | 量化 256 色（保 alpha），宽度保留 2880（= 2 屏宽 @2x，可镜像平铺） | 3×≤ 280 KB |
| **E** `module_bush_a..d.png` | `modules/` | 量化 | 4×≤ 70 KB |
| **F** `module_pond_water.png` / `_b.png`（1024²） | `fx/pond_water_a.png` / `pond_water_b.png` | 缩至 512² + 量化（2 帧动画对） | 2×≤ 130 KB |
| **F** `module_lily_pad_a/b`、`module_lotus_flower`、`module_bridge`（1152×864） | `modules/` | lily/lotus 量化；bridge 缩至 576×432 + 量化 | 4×≤ 110 KB |
| **G** `path_straight_stone/dirt`、`path_curve_stone`、`path_end_cap` | `modules/` | 量化 | 4×≤ 45 KB |
| **H** `ui/*.png` × 13 | `ui/` 同名（btn_close/btn_confirm/btn_round_red、icon_share/music/menu/camera/pet/shop、panel_gold_bar/panel_cash_bar、popup_panel、slider） | `popup_panel` 缩至 720×540、`slider` 缩至 640×360，其余量化 | 13 件合计 ≤ 700 KB |

入库总预算 ≈ **4–4.8 MB**——比 4MB 首包红线紧。模拟器阶段不受限制，照此入库；**U17 从「记录体积」升级为硬门**：若总包 > 4MB，视差条 `parallax/` + 部分摆件 `modules/` 列入远程 bundle / 微信分包清单（真机发布前必须完成切分，切分接口由 assets.ts 按目录分组预留）。旧 `resources/game/{plots/grass-empty,plots/locked,plots/tilled-empty,icons/coin,crops/carrot}` 8 件同 commit 删除，加载代码同步切换。

## 6. 代码结构（`packages/client-mini/assets/scripts/`）

```
OnlineFarm.ts              # 根组件，保留名字（console 基线 `[OnlineFarm] 已连接服务端` 不变）
                           # 职责收窄为：app 生命周期 + 事件分发 + __farm 暴露 + 1s tick
farm/
├── layout.ts              # §4.3 全部常量 + plot-layout.json 加载/坐标转换（唯一调参点）
├── assets.ts              # SpriteFrame 预加载注册表（v13 命名 → frames Map，.forEach 遍历）
├── mapLayer.ts            # MapRoot：ParallaxBack（3 视差条）+ 底图 + PathLayer/WaterLayer（2 帧波光）
│                          #   + PlotGrid（24×plotView）+ SceneModules + FxLayer
├── plotView.ts            # §4.2 单地块状态机 + 倒计时 + 命中派发（回调进 OnlineFarm）
├── hud.ts                 # TopHud：金币面板（ui_panel_gold_bar）+ tween、连接状态点
├── sideColumn.ts          # SideColumn + LeftRail：套件图标接线 + 未开放灰态 toast
├── bottomBar.ts           # BottomBar：导航占位 + 任务条占位
├── dialogs.ts             # DialogLayer：选种弹窗（5 crop 数据卡）/ 解锁确认 / ui_popup_panel 九宫格底板
├── toast.ts               # ToastLayer 队列（2.5s 自动消退，同屏 ≤3）
└── fx.ts                  # FxLayer：playDust/Splash/Burst（缩放+淡出 tween）、coinFly（贝塞尔飞向金币面板）
vendor/farm-online.js      # esbuild 产物（build:cocos 生成，不动）
```

**代码规范（wx-compat 红线，违反即模拟器炸包）**：Map/Set 只用 `.forEach` 与索引循环，禁 `[...x]` / `for..of` / 解构迭代（DevTools「增强编译」会转译出 undefined 洞，见 runbook §10.3）；`import 'cc'` 之外只允许 `./vendor/farm-online.js` 与 `./farm/*`。

**事件消费清单**（全部已存在，`GameEvent` 枚举）：

| 事件 | payload | UI 响应 |
|---|---|---|
| `coins_changed` | number | 金币 Label + 数字 tween + coinFly 落点 |
| `plot_state_changed` | number (index) | 对应 plotView 重渲染 |
| `crop_harvested` | `{plotIndex, cropId}` | harvest_burst + coinFly |
| `server_connected` / `server_disconnected` | void | 连接点绿/红 + 断线横幅「重连中…」 |
| `auth_logged_in` | `{playerId}` | 初始化 HUD |

数据读取唯一入口 `app.state()`：`{gold, gems, plots[24]{unlocked,status,cropId,plantedAt,matureAt,waterCount,derivedRipe}, revision, connected, serverNowOffsetMs}`；倒计时一律 `Date.now() + serverNowOffsetMs`（服务端时钟），禁止裸 `Date.now()`。

## 7. 批次 D–H 素材接入规格（已全部就绪，随任务直接实施）

批次 D–H 已于 2026-09-12 完成归档（82 件，进度见 [progress-phase2.md §13.3](./progress-phase2.md) 与 [reference-video-analysis.md §六](./reference-video-analysis.md)）。接入规格与**已知缺口**如下：

| 层 | 素材（v13） | 接入任务 | 规格 |
|---|---|---|---|
| L2/L3 视差带 | `mountains_far_strip`（2880×576）/ `mountains_near_strip`（2880×319）/ `forest_belt_strip`（2880×344） | U20 | ParallaxBack 三层，视差系数 0.15/0.3/0.5（本期静态摆位，节点预留系数）；宽 1440 设计 px = 2 屏宽，水平镜像平铺 |
| L5 道路 | `path_straight_stone` / `path_straight_dirt` / `path_curve_stone` / `path_end_cap` | U22 | 摆件表（layout 常量），从底图既有小径走向对齐 |
| L6 水域 | `module_pond_water` + `_b`（**2 帧波光**）、`module_lily_pad_a/b`、`module_lotus_flower`、`module_bridge` | U21 | 水面 2 帧 500ms 交替；注意第二帧是**程序化微闪生成**，若交替跳动明显则降级为单帧 + alpha 呼吸 tween |
| L7 摆件 | `module_bush_a..d`（新增）+ cottage/water_well/fence_*/haystack（既有） | U22 | 摆件表集中 layout.ts；fence 已有 直/X/门 三态 |
| L11/L12 UI 套件 | `ui/` 13 件 | U10/U13/U23 | 映射表见下 |

**UI 套件映射表**：

| 素材 | 用途 |
|---|---|
| `ui_panel_gold_bar` | TopHud 金币面板底（coin_gold 图标 + Label 叠加） |
| `ui_panel_cash_bar` | TopHud 点券面板底（gems 占位） |
| `ui_popup_panel` | 弹窗底板（1152×864 缩 720×540，九宫格或整图居中） |
| `ui_btn_confirm` / `ui_btn_close` / `ui_btn_round_red` | 弹窗确认/关闭/圆形红钮（关闭按钮右吸附，≥44pt） |
| `ui_icon_share` / `ui_icon_music` / `ui_icon_menu` / `ui_icon_camera` | LeftRail 四键 |
| `ui_icon_shop` / `ui_icon_pet` | SideColumn 商城（打开选种弹窗）/ 萌宠（灰态「未开放」） |
| `ui_slider` | 批量购买滑杆——本期不用，入库备着（reference-video 商店弹窗范式预留） |

**缺口与降级**（均已确认，不阻塞）：
- **提篮、公益红花图标无套件件**：SideColumn 第三格提篮沿用 icons/seed_bag 或程序化占位 + 灰态 toast；公益入口本期不摆（v24 栏序中顺延）。
- **云朵**：由底图天空承担，无独立素材（批次 E 决策）；ScreenUI 云层不做。
- **水面第二帧**：程序化微闪产物，动画效果验收时若跳动则降级单帧 + tween。

## 8. 任务分解

> 每个任务独立可验收、可提交。执行顺序即编号顺序；U 系列全部完成 = 主页 UI 模拟器阶段收口。

### M1 地基（素材 + 场景重构）

**U01 素材预处理管线**
- 产出：`scripts/prepare-cocos-assets.py`（§5 规格：缩放/量化/重压缩 + prepare-report.json，**含批次 D–H 全部行**）+ `resources/game/` 新树 + 删除旧 8 件。
- 验收：脚本重复执行幂等；`prepare-report.json` 每件素材有 源路径/目标路径/尺寸/体积；resources 总体积 ≤ 4.8MB 且按目录分组（`parallax/` 独立组，为 U17 远程包切分预留）；Cocos 打开无缺失引用报错。

**U02 设计分辨率与画布**
- 改动：`OnlineFarm.ts`（或 farm/layout.ts）`onLoad` 首行 `view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT)`；相机 clearColor 设为底图天空主色。
- 验收：模拟器 iPhone 12/13 下底图 cover 铺满无露边；375/430 机型切换无异常。

**U03 代码骨架拆分**
- 改动：OnlineFarm.ts 职责收窄，新建 `farm/{layout,assets,mapLayer}.ts`；加载器切 v13 命名；保持 `MOCK_CODE`、`__farm`、console 前缀逐字节不变。
- 验收：现有 G3 E2E（登录→种→收）零回归；console 基线两行照旧出现。

**U04 底图 + 24 格坐标接入**
- 改动：mapLayer.ts 按 plot-layout.json 生成 24 个 plotView 节点（§4.3 y 轴转换）。
- 验收：模拟器截图与 `farm-map-base-2x.jpeg` 原图并排比对——每格中心落在草地留空区内；格间距目测均匀；点击每格均有响应（tmp 高亮验证）。

### M2 地块视觉与交互闭环

**U05 地块六态渲染**（§4.2 状态机全表 + LockSign 价签）
- 验收：人为构造 6 态（服务端 psql 改数据 + farm_refresh），每态贴图正确；locked 显示 100 价签。

**U06 作物 5×4 + 倒计时**
- 改动：assets.ts 预加载 20 张；plotView 进度阈值 <0.34/<0.67/其余；TimeLabel 每秒 tick（`serverNowOffsetMs` 校正）。
- 验收：种 5 种作物各 1 格，阶段图正确推进；倒计时归零同秒切 stage-4 + ripe 覆盖层。

**U07 交互升级**
- 改动：点 empty → `dialogs` 选种弹窗（金币不足的作物置灰，显示 seedPrice/sellPrice/growthDuration/maxWater）；点 growing → water；点 ripe/derivedRipe → harvest；点 locked → 解锁确认弹窗。失败（余额不足/占用冲突/OPERATION_ID_REUSED）→ toast 展示服务端错误语义。
- 数据源前置：vendor bundle 目前不导出作物配置——`src/cocos-entry.ts` 追加 `export { CROPS, getCrop } from '@farm-game/shared'`（静态配置，无网络请求），重跑 `build:cocos`。（`runtime.start()` 里的 `getCropConfigs()` 调用仅作协议预热，返回值未留存，弹窗不依赖它。）
- 验收：模拟器手测全路径；gold 扣加与 DB 一致；失败路径状态无回退残影（乐观回滚已由 runtime 保证，UI 只需不缓存过期贴图）。

**U08 特效**
- 改动：fx.ts 四动作（plant dust / water splash / harvest burst / coinFly 贝塞尔到金币面板，时长 0.6s）；ripe 呼吸 tween。
- 验收：手测四动作各触发一次；连续快速点击不堆积残留节点（播放完强制回收）。

**U09 解锁闭环 E2E**
- 改动：扩展 e2e-online 断言（或 DevTools 手测脚本）：解锁 1 格 → DB `plots` unlocked 行数 +1、gold −100；解锁 24 格全开。
- 验收：DB 断言全过。

### M3 屏幕层 UI

**U10 TopHud**：金币面板（`ui_panel_gold_bar` 底 + coin_gold 图标 + Label + 变化 tween）、点券面板（`ui_panel_cash_bar` + gems）、头像/等级占位（icon + Label "Lv.1"）、连接状态点 + 断线横幅（server_disconnected → 顶部红条「连接断开，自动重连中…」→ connected 消失）。
- 验收：kill WS 进程 → 横幅出现 → 重启 WS → 横幅自动消失且状态刷新。

**U11 SideColumn + LeftRail**：按 v24 栏序（§4.3 初排）；商城 → 打开选种弹窗（复用 U07）；公益/提篮/分享/音乐/菜单 → 灰态 + toast「未开放」；时间胶囊显示现实时间（每分钟刷新）。
- 验收：每键命中 ≥44 物理pt（DevTools wxml 面板或点击反馈）；无一处截获地块点击。

**U12 BottomBar**：任务条占位（「扩建第 7 块土地 (x/18)」静态文案 + 进度条）+ 导航 5 键占位。
- 验收：视觉到位即可，无交互要求（任务系统不在 Phase 2 范围）。

**U13 DialogLayer**：`ui_popup_panel` 底板（缩后 720×540）+ 遮罩点击不穿透 + `ui_btn_close` 关闭按钮（右吸附，≥44pt）+ `ui_btn_confirm` 确认钮；程序化底板仅作单件素材不合格兜底（D5）。
- 验收：弹窗打开时地图层点击无效；关闭恢复。

**U14 Toast + 引导**：toast 队列；空地首次点击提示文案；ripe 格 harvest_sparkle 徽章 + 轻微弹跳。
- 验收：3 条 toast 依序展示不重叠；成熟格有动效引导。

### M4 验收与收口

**U15 三尺寸适配审计**：DevTools 切 iPhone 12/13 (390)、iPhone 6/7/8 Plus (414)、自定义 375/430 逐项检查——无重叠、无越界、命中 ≥44pt、底图无露边；结果记入 runbook 附录。
**U16 E2E 扩展回归**：`__farm` 暴露 `unlock/dialog` 动作；全流程断言：登录 → 选种玉米 → water ×3 → 300s（或 psql 改 matureAt 提速）→ 收获 → 解锁 → 断线重连；每步 DB 断言。
**U17 包体审计（硬门）**：记录 `build/wechatgame` 体积分布（引擎/代码/素材/场景）；总包 ≤ 4MB 则记录归档即可；超出则产出远程 bundle / 微信分包切分清单（首批候选：`parallax/` 视差条 + 装饰性 `modules/`，assets.ts 已按目录分组预留接口）并标注为 G4 发布前必做。
**U18 文档收口**：cocos-runbook §4–5 标注「已被本方案取代」+ 链接；scene-spec-v24 顶部注记「Cocos 工程几何以 implementation-plan-ui-v13.md D1 为准」；progress-phase2 追加 §14。

### M5 场景完整层（批次 D–G 接入，§7 规格；仅依赖 M1/M2，可与 M3 并行）

**U20 视差远景带**：ParallaxBack 挂 mountains_far（0.15）→ mountains_near（0.3）→ forest_belt（0.5）三层，静态摆位（本期镜头固定，系数只在节点上预留）；与底图地平线对齐校准。
- 验收：模拟器截图三层无穿帮、无与底图山体重影；镜像平铺接缝不可见。

**U21 水域层**：WaterLayer 挂 `pond_water_a/b` 2 帧 500ms 交替 + lily_pad_a/b + lotus_flower + module_bridge 摆位；第二帧跳动则降级单帧 + alpha 呼吸 tween（§7 缺口预案）。
- 验收：波光动画目测自然无闪跳；摆件压在水域合理位置；不遮挡地块。

**U22 道路与场景摆件**：PathLayer 4 件（从底图既有小径走向对齐）+ SceneModules 摆位表（bush_a–d、cottage、water_well、fence_*、haystack），全部集中 layout.ts 常量。
- 验收：摆件不侵入 24 格留空区与 UI 命中区；截图整体构图评审通过。

**U23 UI 套件换皮校验**：若 U10/U11/U13 已直接用 `ui/` 套件则本任务退化为走查；补漏件（提篮占位、萌宠灰态）按 §7 降级方案核对。
- 验收：ScreenUI 无一处裸色块（除兜底占位）；与套件风格一致。

**可选 U19（P2，时间富余才做）**：一键种植（循环对 empty 格调 plant，买得起的最便宜作物）；一键收获（循环 derivedRipe）。纯客户端批量调用，无协议变更（reference-video-analysis §一 结论）。

## 9. 验证矩阵（收口态）

| 命令/动作 | 范围 | 期望 |
|---|---|---|
| `pnpm -r build && pnpm -r test` | 全仓回归 | 全绿（UI 是 assets 层，不动 src，理论零影响） |
| `pnpm --filter @farm-game/shared build && pnpm --filter @farm-game/client-mini build:cocos` | vendor bundle | 成功，无新增体积异常 |
| CocosCreator CLI 构建 → patch urlCheck → DevTools 编译 | 完整构建链 | runbook §10.6 链路照旧可用 |
| 模拟器 console 基线 | `[wx-compat] installed guard=true send=true` + `[OnlineFarm] 已连接服务端` | 两行都在，无业务红字 |
| G3 老 E2E（种→30s→收 + DB 断言） | 回归 | 零退化 |
| U16 新 E2E（选种/解锁/断线/5 作物） | 新增 | 全过 |
| U15 三尺寸审计 | 375/390/430 | checklist 全勾 |
| U20–U22 场景层走查 | 视差带/水域/摆件 | §7 验收项全过，无穿帮无遮挡 |
| `resources/game/` 体积 + build/wechatgame 体积 | 包体 | 素材 ≤ 4.8MB；总包 ≤ 4MB 或 U17 切分清单就位 |

## 10. 风险与规避

| 风险 | 等级 | 规避 |
|---|---|---|
| 坐标 y 轴转换搞反（图像坐标 y-down vs Cocos y-up） | 高 | §4.3 给出换算公式与两个基准点（plot 0/23）；U04 用截图并排比对验收 |
| 素材量化后边缘脏/半透明带 | 中 | prepare 脚本保留 alpha、量化前先预乘清理；每件素材 report 里带缩略校验；不合格单件回退为仅缩放 |
| 首包超 4MB（82 件素材下大概率发生） | 中 | §5 预算表 + U17 硬门；超出按「`parallax/` 视差条 + 装饰性 `modules/` → 远程 bundle / 微信分包」切分（模拟器阶段不阻塞） |
| 宽幅条纹理内存（3 条 2880 宽 ≈ 各 5–7MB GPU 纹理） | 中 | 模拟器无碍；真机低端机列入 G4 关注项（必要时降采样至 1920 宽或压缩纹理格式） |
| 水面第二帧（程序化微闪）交替跳动 | 低 | U21 验收项；降级预案 = 单帧 + alpha 呼吸 tween（§7） |
| 套件缺口件（提篮/公益图标、云朵） | 低 | §7 降级方案：seed_bag 占位 / 公益入口本期不摆 / 云由底图承担 |
| DevTools 增强编译毁迭代器 | 高 | §6 代码红线；review 时 grep `[...` 与 `for..of` |
| plot-layout 网格与底图留空区轻微错位 | 中 | 布局常量集中在 layout.ts，允许 ±8px 整体偏移校正；不做逐格手调 |
| 弹窗/贴图加载在弱网模拟器上闪烁 | 低 | assets.ts 启动一次性预加载 + 加载进度文案（沿用现有 setStatus 模式） |

## 11. 与既有文档/轨道的关系

- `scene-spec-v24.md`：**布局原则来源**（命中区、栏序、审计思路），其 692×1218 几何不再作为 Cocos 基准（D1）；其「已知限制——素材是程序化矢量」由本方案的 v13 位图路线解决。
- `reference-video-analysis.md`：12 层模型是 §4 节点树的依据；批次 D–H 接入点见 §7；商店弹窗信息密度范式是 U13 选种弹窗的规格来源。
- `cocos-runbook.md`：构建链、wx-compat 三坑、E2E 验收方式**全部沿用**；§4–5（旧最小场景）由本方案取代。
- 美术批次 D–H：**已全部完成并入库**（82 件），接入规格与缺口预案见 §7，实施任务为 M5（U20–U23，可与 M3 并行）。
- G4（真机/发布）：本方案完成后，wx transport 真机回归面对的将是最终视觉，避免二次回归。
