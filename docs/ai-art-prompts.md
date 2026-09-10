# AI 出图 Prompt 清单（还原 QQ 农场风格参照图）

> 目标：把这张参照图按元素拆开，每个元素用 AI 出图工具（Midjourney / DALL-E 3 / 即梦 / 通义万相）出图。
> 出图后丢到 `assets/sprites/ai-art/` 目录，我替换到 design-preview 里。

## 一、全局风格 Prompt（每个出图都要前置这段）

```
Style: 2D isometric farm game art, similar to QQ Farm / Hay Day / Farm Together,
warm color palette, soft sunlight, lush green grass, hand-painted cartoon style,
high saturation, soft shadows, no text, no UI, clean isolated object on transparent background,
single object, centered, mobile game asset, PNG with alpha channel.
Aspect ratio: 1:1 for crops/icons, 4:3 for buildings, 16:9 for scenes.
Negative: realistic photo, 3D render, anime style, chibi, low poly, pixel art.
```

## 二、场景层（背景，铺满屏幕的）

### 2.1 天空 + 远山（背景板）
```
A wide scenic background of a farm game: soft blue gradient sky with white
fluffy clouds at top, layered blue-green mountains in distance, lush green forest
trees in mid-ground, no foreground, isometric perspective, 750x1334 pixels.
```

### 2.2 草坪
```
Top-down view of a lush green grass field tile, cartoon hand-painted style,
slightly varied green shades with tiny grass tufts and small flowers scattered,
seamless tileable pattern, 200x200 pixels.
```

### 2.3 池塘
```
Small cartoon pond viewed from 45-degree isometric angle, blue water with
white ripple lines, two green lily pads with pink lotus flowers, surrounded by
smooth round stones, hand-painted warm style, 240x160 pixels.
```

### 2.4 小路（鹅卵石）
```
Isometric view of a winding cobblestone path, beige and gray stones with soft
shadows, grass edges on sides, cartoon hand-painted style, 200x100 pixels tile.
```

## 三、建筑物

### 3.1 主草屋（核心视觉）
```
A cute cartoon thatched-roof cottage, isometric 45-degree view, golden hay
roof with visible straw layers, warm cream walls with wood grain, two windows
with flower boxes, brown wooden door with brass handle, stone chimney with white
smoke curling up, hand-painted cartoon style, 240x240 pixels.
```

### 3.2 狗屋
```
A small cartoon wooden dog house with pointed roof, dark entrance hole,
sitting on grass, hand-painted style, 100x80 pixels.
```

### 3.3 木牌
```
A small wooden sign post, two planks nailed together, planted in ground,
hand-painted cartoon style, weathered wood texture, 80x100 pixels.
```

### 3.4 稻草人
```
A friendly cartoon scarecrow with straw hat, blue plaid shirt, stick arms
outstretched, button eyes, smiling face, hand-painted style, 120x160 pixels.
```

## 四、地块（核心玩法）

### 4.1 草地块（未开垦）
```
Isometric 45-degree view of a single grass plot tile, bright green grass with
visible grass blades, slight 3D depth with darker green side, cartoon
hand-painted style, 100x100 pixels, isolated on transparent background.
```

### 4.2 翻耕地块（已开垦）
```
Isometric 45-degree view of a tilled soil plot tile, brown earth with visible
furrow lines and small soil clumps, slight 3D depth with darker brown side,
cartoon hand-painted style, 100x100 pixels.
```

### 4.3 幼苗地块
```
Isometric 45-degree view of a brown soil plot with small green seedling
sprouting from the middle, tiny green stem with two leaves, cartoon style,
100x100 pixels.
```

## 五、作物（成熟态，每个单独出图）

### 5.1 白萝卜
```
A cute cartoon white radish/carrot (the orange Korean style), bright orange
root with green leafy top, simple round shape, hand-painted style, 100x100 pixels.
```

### 5.2 土豆
```
A cute cartoon potato, irregular brown oval shape with small eyes/spots,
with tiny green sprouts on top, hand-painted style, 100x100 pixels.
```

### 5.3 玉米
```
A cute cartoon corn cob, golden yellow kernels visible, partially wrapped in
green husk, top leaves spread out, hand-painted style, 100x100 pixels.
```

### 5.4 番茄
```
A cute cartoon tomato, perfectly round red fruit with green 5-pointed leaf
calyx on top, small green stem, hand-painted style, 100x100 pixels.
```

### 5.5 草莓
```
A cute cartoon strawberry, heart-shaped red fruit with yellow seeds visible,
green leafy top, hand-painted style, 100x100 pixels.
```

## 六、装饰元素

### 6.1 木栅栏
```
A section of cartoon wooden fence, two horizontal rails with vertical posts,
weathered brown wood, hand-painted style, 120x80 pixels tileable.
```

### 6.2 兔子
```
A cute cartoon white rabbit sitting on grass, long ears, pink nose, hand-painted
style, 60x60 pixels.
```

### 6.3 蝴蝶
```
A cute cartoon butterfly with orange and yellow wings, small body with
antennae, hand-painted style, 60x60 pixels.
```

### 6.4 花坛
```
A cartoon flower bed planter, wooden box with multiple colorful flowers
(red, pink, yellow roses) blooming, green leaves, hand-painted style, 100x80 pixels.
```

### 6.5 木推车
```
A cartoon wooden wheelbarrow with two wheels, filled with hay/straw, brown
wood, hand-painted style, 100x80 pixels.
```

## 七、UI 元素

### 7.1 头像（小农夫）
```
A cute cartoon avatar of a young farmer, wearing a straw hat, red shirt,
rosy cheeks, big eyes, friendly smile, simple round bust portrait, hand-painted
style, 100x100 pixels.
```

### 7.2 底部 Tab 圆胶囊（5个）

**仓库**：
```
A circular icon button with a brown wooden crate/box with lid, cartoon
hand-painted style, 80x80 pixels.
```

**商店**：
```
A circular icon button showing a small market stall with red-white striped
awning, fruits on display, cartoon hand-painted style, 80x80 pixels.
```

**宠物**：
```
A circular icon button with a cute cartoon puppy face (brown dog with floppy
ears), hand-painted style, 80x80 pixels.
```

**装扮**：
```
A circular icon button showing an artist's palette with colorful paint dots
and a brush, cartoon hand-painted style, 80x80 pixels.
```

**好友**：
```
A circular icon button with a white envelope and a small red heart sticker,
cartoon hand-painted style, 80x80 pixels.
```

## 八、HUD 资源

### 8.1 金币图标
```
A shiny cartoon gold coin with "C" or coin symbol embossed, golden color
with shine highlight, hand-painted style, 40x40 pixels.
```

### 8.2 等级徽章
```
A small orange circle badge with star symbol, cartoon hand-painted style,
30x30 pixels.
```

### 8.3 任务书本
```
A small open book with pages, cartoon hand-painted style, 40x40 pixels.
```

## 九、UI 控件

### 9.1 一键收获 FAB
```
A large circular yellow-orange action button with wheat symbol in center,
3D pop-up shadow effect, cartoon hand-painted style, 80x80 pixels.
```

### 9.2 分享按钮
```
A circular orange share button with paper airplane icon, hand-painted style,
60x60 pixels.
```

## 十、出图工作流

### 10.1 推荐工具

| 工具 | 优势 | 价格 |
|------|------|------|
| **Midjourney v6** | 顶级质量 | $10/月 |
| **DALL-E 3** | 易用 | 含 ChatGPT Plus |
| **即梦**（字节）| 国内方便，免费 | 免费 |
| **通义万相**（阿里）| 中文 prompt 友好 | 免费 |
| **可灵**（快手）| 风格稳 | 免费 |

### 10.2 出图步骤

1. 复制全局风格 prompt + 单个元素 prompt
2. 设置：
   - aspect ratio 按上面规格
   - style: illustration / cartoon
   - negative: 上面写的禁用项
3. 出 4-8 张候选
4. 选最像 QQ 农场风格的一张
5. 去掉背景（用 remove.bg 或 PS）
6. 保存为 PNG 透明图
7. 丢到 `assets/sprites/ai-art/{类别}/`

### 10.3 集成到 design-preview

出图完成后告诉我，我会：
1. 把 PNG 嵌入 design-preview（用 `<img src="data:image/png;base64,...">`）
2. 调整大小和位置
3. 重新截图5 页给你看效果

## 十一、必备元素清单（30+ 张）

| # | 元素 | 尺寸 | 状态 |
|---|------|------|------|
| 1 | 天空 + 远山背景 | 750×1334 | 待出 |
| 2 | 草坪 tile | 200×200 | 待出 |
| 3 | 池塘 | 240×160 | 待出 |
| 4 | 鹅卵石路 tile | 200×100 | 待出 |
| 5 | 主草屋 | 240×240 | 待出 |
| 6 | 狗屋 | 100×80 | 待出 |
| 7 | 木牌 | 80×100 | 待出 |
| 8 | 稻草人 | 120×160 | 待出 |
| 9 | 草地块 | 100×100 | 待出 |
| 10 | 翻耕地块 | 100×100 | 待出 |
| 11 | 幼苗地块 | 100×100 | 待出 |
| 12 | 白萝卜 | 100×100 | 待出 |
| 13 | 土豆 | 100×100 | 待出 |
| 14 | 玉米 | 100×100 | 待出 |
| 15 | 番茄 | 100×100 | 待出 |
| 16 | 草莓 | 100×100 | 待出 |
| 17 | 木栅栏 | 120×80 | 待出 |
| 18 | 兔子 | 60×60 | 待出 |
| 19 | 蝴蝶 | 60×60 | 待出 |
| 20 | 花坛 | 100×80 | 待出 |
| 21 | 木推车 | 100×80 | 待出 |
| 22 | 小农夫头像 | 100×100 | 待出 |
| 23 | Tab·仓库 | 80×80 | 待出 |
| 24 | Tab·商店 | 80×80 | 待出 |
| 25 | Tab·宠物 | 80×80 | 待出 |
| 26 | Tab·装扮 | 80×80 | 待出 |
| 27 | Tab·好友 | 80×80 | 待出 |
| 28 | 金币图标 | 40×40 | 待出 |
| 29 | 等级徽章 | 30×30 | 待出 |
| 30 | 任务书本 | 40×40 | 待出 |
| 31 | 一键收获 FAB | 80×80 | 待出 |
| 32 | 分享按钮 | 60×60 | 待出 |

## 十二、快速试用

如果你现在就想试一下，**推荐从这3 个最重要的开始**：

1. **主草屋**（视觉权重最大）
2. **白萝卜**（作物卡代表）
3. **草地块**（核心玩法元素）

把这3 个的 prompt（已写好）直接复制到 DALL-E 3 或即梦，10 分钟就能看到效果。

---

**下一步建议**：

- 你拿去出图后，把 PNG 给我（或路径），我嵌入 design-preview 重拍给你看
- 或者我可以**先把现有的 SVG 设计稿作为占位**，等你出图后**整批替换**（2 小时工作）
- 或者我可以**写一份更详细的美术 spec**（光影方向 / 色卡 / 描边粗细 / 高光位置）让你照着出图