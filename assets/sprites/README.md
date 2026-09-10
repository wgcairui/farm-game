# 素材资源（Assets/Sprites · v2 参照物对齐版）

所有素材均为 SVG 矢量图，由 AI 生成手绘，Cocos Creator / Laya / Unity 2D 通用。

> 配套预览：打开 `preview.html` 在浏览器中查看全部资源的实际渲染。

## 目录结构（v2）

```
sprites/
├── scene/                  # 场景层（参照物核心 · v2 新增）
│   ├── sky_gradient.svg    天空渐变
│   ├── cloud_a.svg         云朵 A
│   ├── cloud_b.svg         云朵 B
│   ├── mountains_far.svg   远山（多层）
│   ├── tree_large.svg      大树
│   ├── tree_conifer.svg    针叶树
│   ├── pond.svg            池塘
│   └── grass_tile.svg      草坪平铺
├── path/                   # 路径
│   └── stone_path.svg      鹅卵石小路
├── plots-v2/               # 地块 v2（参照物双形态）
│   ├── plot_grass.svg      草地菱形（未开垦）
│   ├── plot_dirt.svg       棕色菱形（已翻耕）
│   └── plot_locked.svg     未解锁遮罩
├── buildings/              # 建筑物（v2 新增）
│   ├── cottage.svg         草屋
│   ├── dog_house.svg       狗屋
│   ├── scarecrow.svg       稻草人
│   └── sign_board.svg      木牌
├── animals/                # 动物（v2 新增）
│   ├── rabbit.svg          兔子
│   ├── butterfly.svg       蝴蝶
│   └── cart.svg            木推车
├── decor/                  # 装饰物
│   ├── fence.svg           旧栅栏
│   ├── scarecrow.svg       旧稻草人
│   ├── grass_tile.svg      旧草地
│   ├── fence_wooden.svg    木栅栏（v2）
│   └── flower_bed.svg      花坛（v2）
├── crops/                  # 作物 v1（5 种 × 2 阶段 = 10 个）
│   ├── carrot.svg / carrot_seedling.svg
│   ├── potato.svg / potato_seedling.svg
│   ├── corn.svg / corn_seedling.svg
│   ├── tomato.svg / tomato_seedling.svg
│   └── strawberry.svg / strawberry_seedling.svg
├── crops-quality/          # 品质色（v2 新增）
│   ├── quality_palette.svg         6 级品质色板
│   └── quality_tag_template.svg    品质标签模板
├── plots/                  # 地块 v1（保留兼容）
│   ├── plot_empty.svg
│   ├── plot_ready.svg
│   └── plot_withered.svg
├── tools/                  # 工具（v2 新增）
│   ├── fertilizer_bag.svg  化肥袋
│   ├── shovel.svg          铲子
│   ├── watering_can.svg    水壶
│   └── hay_basket.svg      稻草筐
└── ui/                     # UI 元素（v2 新增）
    ├── harvest_badge.svg   可收获徽章
    ├── progress_ring.svg   生长进度环
    ├── avatar_lion.svg     头像·狮子
    ├── tab_inventory.svg   Tab·仓库
    ├── tab_shop.svg        Tab·商店
    ├── tab_pet.svg         Tab·宠物
    ├── tab_decor.svg       Tab·装扮
    ├── tab_friend.svg      Tab·好友
    └── crop_bubble.svg     作物气泡
```

## 命名规范

### 作物
```
{crop_id}.svg              成熟阶段
{crop_id}_seedling.svg     幼苗阶段
```

### 地块
```
plot_grass.svg     草地（未开垦）
plot_dirt.svg      棕色翻耕（已开垦）
plot_locked.svg    未解锁
```

### 品质色
```
1品 = #d4b878 (棕白)
2品 = #aed581 (绿)
3品 = #90caf9 (蓝)
4品 = #ce93d8 (紫)
5品 = #ffb74d (橙)
6品 = #ef5350 (红)
```

## 推荐尺寸

| 用途 | 尺寸 |
|------|------|
| 作物图标 | 80×80 px |
| 地块菱形 | 80×80 px |
| UI 徽章 | 24×24 px |
| 装饰物（栅栏/稻草人） | 80-120 px |
| 场景层（天空/远山） | 800×500 px |
| 草屋 | 200×200 px |
| 池塘 | 200×140 px |

## Cocos Creator 导入步骤

1. 把 `sprites/` 整个目录拖入 Cocos 工程的 `assets/` 下
2. Cocos 自动识别 SVG → 在导入面板 Type 选 **sprite-frame**
3. 推荐用 **TexturePacker** 打包图集（减少 draw call）
4. 场景层（天空/远山/草坪）作为**背景图层**（z=-1），地块放 z=0，UI/气泡 z=10+

## 动画建议

每种作物建议 4 帧：seedling → growing → mature → ready

```
阶段1（0-25%）    seedling.svg     淡入淡出
阶段2（25-50%）   seedling.svg     缩放 1.0 → 1.2
阶段3（50-90%）   mature.svg       缩放 1.2 → 1.0
阶段4（90-100%）  mature.svg       摇摆 ±3°
```

实际生产可用 **Spine / 龙骨骨骼动画** 替代。

## 颜色参考

| 用途 | 色值 |
|------|------|
| 主橙 | `#ff7043` |
| 主黄 | `#ffc107` |
| 草地亮 | `#a8d56a` |
| 草地暗 | `#6fa83c` |
| 土壤亮 | `#a47148` |
| 土壤暗 | `#5d3a26` |
| 木材 | `#8b5a2b` |
| 奶油卡 | `#f5e6c8` |

完整色板见 `docs/design-spec.md`。

## 美术对接清单（参照物差距）

以下素材仍弱于参照物，需要专业美术重做：

| 类别 | 现状 | 建议 |
|------|------|------|
| 作物 | emoji 简化矢量 | 手绘风，写实描边，4 帧动画 |
| 草屋 | 几何 SVG | 手绘线稿 + 厚重茅草纹理 |
| 字体 | 苹方系统字 | 圆头卡通手写风（如方正少儿、汉仪乐喵体）|
| 动物 | 简化图形 | 多状态动画（站立/行走/进食）|

## 版本历史

- **v1**（v1.0）：基础 5 作物 + 3 地块 + 2 装饰 = 18 文件
- **v2**（当前）：补全场景层 +建筑物 +动物 +工具 + UI + 品质色 = **40+ 文件**