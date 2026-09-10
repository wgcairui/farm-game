# 设计规范（Design Spec v1.0）

> 基于 MVP 阶段的高保真设计稿产出。所有色值、字号、间距在 [design-preview/index.html](../design-preview/index.html) 中通过 CSS 变量集中管理。

> ⚠️ **适用范围**：本文档适用于**弹层页面**（种植交互 / 仓库 / 商店 / 好友农场）。
> **农场主页场景**已升级为 2:1 dimetric 方案，请以
> [主页场景设计规范 v24](./scene-spec-v24.md) 为准 —— 其中“俯视角 45° 等距”
> 已修正为 2:1 dimetric（二测投影，轴角 ≈26.565°），并规定了移动端独立命中层。

> 主页 v24 已完成静态视觉复审，但**未通过最终美术验收**；修正实施以 [视觉修正实施计划](./visual-repair-plan-v24.md) 为准。本文的 emoji/早期 SVG 仅可作为占位，不能视为已通过主页图标语义、透视和材质验收。

## 一、设计语言

参考 QQ 经典农场 + Farm Together / Hay Day 的视觉风格：

- **2:1 dimetric 斜俯视角** — 地块用轴角约 26.565° 的 SVG 菱形表达
- **暖色调** — 土黄、草地绿、橙红强调色
- **卡通圆润** — 圆角组件 + 软阴影，避免锐利边框
- **图标风格** — emoji + SVG 自绘（暂无专业美术资产时，emoji 占位）

## 二、Color Tokens

```css
--color-primary: #ff7043;        /* 暖橙：主操作按钮、FAB */
--color-primary-dark: #e64a19;   /* 深橙：hover/按下 */
--color-secondary: #ffc107;      /* 暖黄：收获提示、次要按钮 */
--color-success: #66bb6a;        /* 绿色：进度、容量 */
--color-danger: #e53935;         /* 红色：危险操作、枯萎 */

--color-text: #3e2723;           /* 主文本：深棕 */
--color-text-sub: #6d4c41;       /* 次要文本 */
--color-text-light: #a1887f;     /* 辅助文本 */

--color-bg: #fff8e1;             /* 米黄背景 */
--color-card: #ffffff;           /* 卡片白 */
--color-divider: #efebe9;        /* 分隔线灰 */
```

## 三、Typography

| 用途 | Size | Weight | 颜色 |
|------|------|--------|------|
| H1 页面标题 | 22px | 700 | text |
| H2 卡片标题 | 18px | 700 | text |
| 数值（金额/数量） | 16px | 700 | text |
| 正文 | 14px | 400 | text |
| 辅助信息 | 12px | 400 | text-sub |
| 极小提示 | 11px | 600 | text-light |

字体栈：`-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`

## 四、Spacing

8px 基础栅格：

```
4 / 8 / 12 / 16 / 24 / 32 / 48
```

实际项目里出现过的：
- HUD padding: 8px 14px
- 卡片 padding: 14px
- 页面边距: 16px
- 元素间距（小）：8px
- 元素间距（中）：12px
- 元素间距（大）：24px

## 五、Radius

| 用途 | 值 |
|------|------|
| 小元素（按钮、标签） | 6px |
| 卡片、面板 | 12px |
| 胶囊按钮、Tab 角 | 24px |
| FAB | 28px |
| 全屏圆角（手机框架） | 36px |

## 六、Shadow

```
--shadow-sm: 0 2px 4px rgba(62, 39, 35, 0.08);     /* 卡片 */
--shadow-md: 0 4px 12px rgba(62, 39, 35, 0.12);    /* 弹窗 */
--shadow-lg: 0 8px 24px rgba(62, 39, 35, 0.16);    /* 模态 */
```

棕色阴影（不用纯黑），贴合暖色基调。

## 七、组件清单

| 组件 | 实现状态 | 备注 |
|------|---------|------|
| HUD 资源栏 | ✅ | 玻璃拟态模糊背景 |
| 地块（4 状态） | ✅ SVG | empty / growing / ready / withered |
| Tab Bar | ✅ | 5 tab，图标 + 文字 |
| FAB | ✅ | 右下浮动，一键收获 |
| 作物卡片 | ✅ | 三段式：图标/信息/价格 |
| 仓库格子 | ✅ | 3 列网格 + 数量徽章 |
| 新手引导气泡 | ✅ | 遮罩 + 镂空 + 尖角 |
| 设置滑块 | ✅ | iOS 风格橙色 thumb |
| 设置开关 | ✅ | 胶囊 + 滑动 thumb |
| Toast | ⏳ Phase 2 | 成功/失败反馈 |
| Dialog | ⏳ Phase 2 | 确认弹窗 |
| Loading | ⏳ Phase 2 | 加载占位 |

## 八、动画

| 场景 | 动画 |
|------|------|
| 可收获地块 | 右上角黄色圆点脉冲（1.5s 循环） |
| 新手引导 | 黄色边框脉冲（1.5s 循环） |
| 按钮 hover | 200ms 颜色过渡 + translateY(2px) |
| 卡片 hover | 200ms 阴影增强 + translateY(2px) |
| Tab 切换 | 200ms 内容淡入淡出 |

所有动画 ≤ 200ms，避免拖慢操作。

## 九、Icon 资源

**Phase 1（当前）**：
- 作物：SVG 内联手绘
- 地块：SVG 菱形 + 渐变
- UI：emoji 占位（🪙/💎/📦/🌱/🛒/👥/⚙️）

**Phase 2（接入真实素材后）**：
- 替换 emoji 为 PNG/SVG 图标集（建议使用 Phosphor Icons 或 Twemoji）
- 作物图标用 Aseprite 制作 4 帧生长动画
- 装饰物（栅栏/稻草人/池塘）单独制作

## 十、可访问性 / 适配

- 所有交互元素最小点击区域 44×44px（iOS HIG 标准）
- 文字最小 11px
- 颜色对比度 ≥ 4.5:1（已验证棕色文字 + 白卡）
- 支持刘海屏：状态栏预留 44px 顶部
- 横竖屏：MVP 仅竖屏，Phase 2 加横屏布局

## 十一、交付物

| 产物 | 路径 |
|------|------|
| 高保真原型 | `design-preview/index.html` + `style.css` |
| 设计规范文档 | `docs/design-spec.md`（本文件） |
| 设计标注 | 集成在 HTML 的 `<aside class="annot">` 中 |

打开 `design-preview/index.html` 在浏览器中查看完整原型。