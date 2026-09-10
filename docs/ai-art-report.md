# AI 出图交付报告

## 总览

- **API**: minimax (image-01-live, style_type=漫画)
- **调用次数**: 34 次
- **成功率**: 34/34
- **总耗时**: ~6 分钟
- **产物目录**: `assets/sprites/ai-art/{crops,buildings,plots,scene,decor,ui}/`

## 出图质量评估

### ⭐ 优秀

| 资源 | 备注 |
 |------|------|
| 草屋 | 茅草屋顶+木门+花盆+远山——非常 QQ 农场 |
| 池塘 | 蓝水+荷叶+莲花——可作背景 |
| 小农夫头像 | 草帽男孩——超预期，日漫风 |
| 小农女头像 | 蓝衣女孩——可用 |
| Tab·宠物（小狗）| 2 只柯基——比 QQ 农场还可爱 |
| Tab·商店（棚子）| 苹果橙子+棚——完整 |
| 装饰·兔子 | 萌系白兔——可用 |
| 装饰·小鸡 | 黄鸡——可爱 |
| 装饰·蝴蝶 | 橙翅蝴蝶——可作动画 |
| 场景·天空背景 | 蓝渐变+远山——**完美** |

### ⚠️ 中等（可凑合用）

| 资源 | 备注 |
 |------|------|
| 白萝卜 | 笑脸萝卜头，但带场景 |
| 土豆 | 棕椭圆+芽眼，但偏3D |
| 玉米 | 偏3D 写实 |
| 番茄 | 红色+绿蒂 |
| 草莓 | 心形+黄籽——**不错** |
| Tab·仓库（箱子）| 木箱——可识别 |
| Tab·装扮（调色板）| 圆调色板——可识别 |
| Tab·好友（信封）| 简笔信封 |
| 装饰·花坛 | 木盒+玫瑰——不错 |
| 装饰·木推车 | 满载干草——OK |
| 装饰·栅栏 | 木栏段——可作背景 |
| 场景·鹅卵石路 | 黄石小路 |
| 场景·草地 tile | 绿草+小花 |

### ❌ 跑偏（API 误识别）

| 资源 | 实际出了 | 应有 |
 |------|------|------|
 | plot_grass | **画了 4 个小屋** | 单个草地块 |
 | plot_dirt | **画了 4 个小屋** | 单个翻耕地块 |
 | plot_seedling | **画了 3 个小屋** | 幼苗地块 |

**根本原因**：API 把 "grass plot / dirt plot" 的 "grass / dirt" 误识别为"草地房屋"，prompt 描述不到位。

### ⚠️ 一般

| 资源 | 备注 |
 |------|------|
| 木牌 | 木板——OK |
| 狗屋 | 偏可爱风 |
| 稻草人 | 一般 |
| 任务书本 | OK |
| 等级徽章 | 偏写实 |
| 金币 | 偏写实 |
| 一键收获 | OK |
| 分享按钮 | OK |

## 集成到 design-preview

成功的（已渲染）：

| 元素 | 实现方式 |
 |------|------|
 | 头像 | `<img>` 替换 SVG 头像 |
 | 5 个 Tab 圆按钮 | `<img>` 替换 |
 | 草屋 | HTML `<img>` 覆盖层（带场景）|
 | 池塘 | HTML `<img>` 覆盖层（带场景）|

未成功（SVG `<image>` 不支持 data URI）：

- 地块（AI plot_grass API跑偏，保留 QQ 风格 SVG）
- 作物（已 inline polygon，但 AI 出图带场景不好塞入）

## 已知限制

1. **API 不支持纯白背景**：所有图都带场景（石头/草地/天空），需要用专业抠图工具（rembg / Photoshop）处理
2. **地块类抽象概念易跑偏**：AI 把 "grass plot" 理解为"grass house"
3. **SVG `<image>` 不支持 data URI**：只能用 `<img>` HTML 元素
4. **风格不完全统一**：每张图风格有微妙差别，不像专业美术一气呵成

## 后续建议

### A. 优化 AI 出图（推荐）

1. **重出地块** —— 强化 prompt："single square farm tile, isometric view, ONLY green grass top, NO buildings, NO scenery"
2. **强化背景** —— 所有 prompt 加 "absolutely pure white background, isolated single object, no environment"
3. **风格统一** —— 加 "consistent style across series, same line weight, same color palette"

### B. 专业抠图（关键）

用 rembg / PhotoRoom / remove.bg 处理已出的34 张图：
- 去除场景背景
- 保留主体
- 输出透明 PNG

### C. 接受现状

- 已嵌入头像/草屋/池塘/5 Tab ——视觉效果**显著提升**
- 地块/作物保持 QQ 风格 SVG 占位
- 整体"差不多能用"

### D. 找专业美术

AI 出图已达上限。**真游戏美术**需要：
- 矢量绘制（Adobe Illustrator）
- 一致的角色设定
- 完整的动画帧
- 表情/动作规范

## 时间预估

| 任务 | 时间 |
 |------|------|
 | 重出地块 + 强化背景 prompt | 30 分钟 |
 | rembg 批量抠图 | 1 小时 |
 | 完整嵌入 design-preview | 1-2 小时 |
 | 美术资源全套重做 | 1-2 周（专业） |

## 关键文件

- 出图脚本: `/tmp/minimax-batch.py`
- 预览页: `/Users/cairui/Code/farm-game/assets/sprites/ai-art/preview.html`
- 设计稿: `/Users/cairui/Code/farm-game/design-preview/index.html`
- Prompt 文档: `/Users/cairui/Code/farm-game/docs/ai-art-prompts.md`

---

**结论**：minimax 图像 API 能用，34/34 成功，质量参差。视觉档次从"几何SVG"提升到"AI 出图"水平，但**风格不完全统一**且**地块跑偏**。建议下次重出时加"pure white background, isolated" 和具体场景约束。