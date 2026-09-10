# Farm Game

类似 QQ 经典农场的 2D 社交休闲游戏。先做微信小程序，再移植 iOS / Android。

## 当前设计状态

**v24 为工程检查通过、静态视觉复审未通过的原型基线，不是最终美术定稿。** 2026-09-10 已实际查看最终稿与对比图；栅栏遮地、建筑透视、树林纵深及右侧布局等 12 项修正待实施。本次仅更新文档，未修改设计稿。

实施入口：[视觉修正实施计划](./docs/visual-repair-plan-v24.md) → [Cocos 集成指南](./docs/cocos-integration.md)。先修正并复验视觉，再冻结正式资源；灰盒功能验证可并行。

## 技术栈

- 引擎：Cocos Creator 2D（待定 LTS 版本）
- 语言：TypeScript
- 服务端：LeanCloud（中国服）或 Firebase（海外服）
- 美术：2D 卡通，**2:1 dimetric**（二测投影，轴角 ≈26.565°）
- 状态机：作物生长 / 任务 / 每日重置

## 目录结构

```
farm-game/
├── assets/                  # Cocos 资源（图片、音频、prefab）
│   ├── sprites/             # 贴图
│   ├── audio/               # 音效 / BGM
│   └── fonts/               # 字体
├── scenes/                  # Cocos 场景文件
├── prefab/                  # 预制体
├── scripts/                 # TypeScript 脚本
│   ├── core/                # 全局单例：GameApp、EventBus、TimeManager
│   ├── systems/             # 业务系统：FarmSystem、ShopSystem、InventorySystem
│   ├── ui/                  # UI 控制器
│   └── utils/               # 工具函数
├── design-preview/           # 设计原型与待验收美术
│   ├── farm-v24.html         # ⭐ 农场主页场景（响应式 SVG + 独立命中层）
│   ├── gen_v24.py            #    场景生成器（SVG 结构/布局审计）
│   ├── index.html            #    5 页面原型（主页/种植/仓库/商店/好友）
│   ├── final-v24.png         #    692×1218 基准渲染图
│   ├── mobile-v24-*.png      #    375/390/430px 移动端验证图
│   └── COMPARE-v24.png       #    与参考图并排对比
├── docs/                     # 设计文档（本目录）
└── project.json              # Cocos 项目配置
```

## 文档索引

设计
- [**视觉修正实施计划 v24**](./docs/visual-repair-plan-v24.md) — 12 项问题、实施顺序、阶段关卡与验收证据
- [**主页场景设计规范 v24**](./docs/scene-spec-v24.md) — 投影/图层/地块几何/响应式命中层/审计与评分更正 ⭐
- [设计规范 v1.0](./docs/design-spec.md) — 通用组件与 token（弹层页面适用）
- [Cocos 集成指南](./docs/cocos-integration.md)
- [AI 出图报告](./docs/ai-art-report.md) · [出图提示词](./docs/ai-art-prompts.md)
- [交付总结](./DELIVERY.md)

策划 / 技术
- [功能清单 (MVP)](./docs/mvp-features.md)
- [数据表设计](./docs/data-schema.md)
- [技术选型清单](./docs/tech-stack.md)
- [线下农场架构](./docs/physical-farm-architecture.md)

## 设计稿自检

```bash
cd design-preview
python3 gen_v24.py --audit                  # XML/引用/布局/关键间距检查
python3 gen_v24.py farm-v24.html            # 重新生成响应式设计稿
python3 gen_v24.py --layout                 # 导出 33 项设计意图坐标表
python3 ../scripts/visual_score.py /Users/cairui/Downloads/image.png final-v24.png
```

## 路线

1. **Phase 1（4-6 周）单机 MVP** — 种/长/收/卖 + 存档
2. **Phase 2（3-4 周）社交版** — 好友 + 偷菜 + 排行榜
3. **Phase 3（2-3 周）小程序上线**
4. **Phase 4（3-4 周）iOS / Android 移植**