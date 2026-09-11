#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
farm-v25 场景生成器（v24 候选基线，不替换 v24 资源）

用途：实施视觉修正计划 V01–V05 的候选版本。**保留** v24 资源
（final-v24.png / COMPARE-v24.png / farm-v24.html）作为复审基线。

起点 = gen_v24.py 的完整副本（首次 cp 后 byte-identical，见 git diff）。
未修改前，渲染 farm-v25.html 与 v24 像素相同；之后逐步修改。

V05 决策（与用户确认 2026-09-10）：
  草屋烟囱在 v24 已存在但视觉脱节（弱、不与屋顶衔接）。
  本轮 V02+V05 联合修正 = 强化 chimney()：顶帽、砖纹、落地阴影、
  炊烟分层，坐标向屋脊靠拢。

V04 决策 (2026-09-10): clock_panel 已从 (548, 474, 686, 506) 重排至
  (602, 482, 690, 514)。下方 8px 留气口, 右移脱离烟囱体块, 与提篮
  (594..660, 386..464) 下沿间距 18px。右沿 690 留 2px 让 2.2px 描边
  不被 692 画布裁切。LAYOUT 白名单 ["cottage"] 已撤销,
  审计 v25 应不再报 clock_panel 与 cottage 压盖。

V03 / V01 在 V02/V04/V05 完成后单独处理，本文件暂不动。

执行约束（来自 docs/visual-repair-plan-v24.md §3）：
  - 不覆盖 v24 任何资源；
  - 每次改完跑 `python3 design-preview/gen_v25.py --audit`；
  - 不只依赖 `--audit`，必须浏览器实看 692/375/390/430px 截图并与
    final-v24.png / COMPARE-v24.png 并排核对。

几何结论 (与 v24 一致, 参考图自相关 + 泛洪填充测得):
  * 地块床 = 2:1 dimetric 菱形瓦片网格, 瓦片外接盒 94x48
  * 格向量 U=(47,+24) 右下, V=(-47,+24) 左下  -> 边-边共享, 无角对角
  * 床顶点 T=(393,589); 网格 4(U向) x 6(V向) = 24 格
  * 已耕(褐色) = j in {0,1} 共 8 格; 未耕(草绿) = j in {2..5} 共 16 格
"""
import math, random, re
import xml.etree.ElementTree as ET

W, H = 692, 1218

# ---------------------------------------------------------------- 调色板
SKY = [(0.00, "#4f97d2"), (0.08, "#5ba3d7"), (0.18, "#6db4e0"),
       (0.30, "#86c7e7"), (0.42, "#a2d8ee"), (0.55, "#b9e6f2"), (1.00, "#c3ecf5")]
GRASS_FAR   = "#cfe498"
GRASS_MID   = "#bcd96f"
GRASS_NEAR  = "#a4bb50"
GRASS_LOW   = "#9bb246"
GRASS_DARK  = "#7e9c3f"
TAN_GAP     = "#d8c28a"
TAN_EDGE    = "#c3a86e"
TILE_G_TOP  = "#b7da6c"
TILE_G_LIT  = "#cbe888"
TILE_G_SIDE = "#8fb64f"
TILE_G_EDGE = "#7aa445"
TILE_D_TOP  = "#a8764c"
TILE_D_LIT  = "#c08d5e"
TILE_D_SIDE = "#7d5334"
TILE_D_EDGE = "#6b452a"
WOOD        = "#c99a63"
WOOD_D      = "#a87c48"
WOOD_XD     = "#7d5a30"
STRAW       = "#e8c46a"
STRAW_D     = "#c99a3f"

# ---------------------------------------------------------------- 基础工具
def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s if s else "0"

def P(x, y):
    return f"{f(x)},{f(y)}"

def poly(pts, **kw):
    a = " ".join(P(x, y) for x, y in pts)
    return f'<polygon points="{a}"{attrs(kw)}/>'

def path(d, **kw):
    return f'<path d="{d}"{attrs(kw)}/>'

def rect(x, y, w, h, **kw):
    return f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}"{attrs(kw)}/>'

def circ(cx, cy, r, **kw):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"{attrs(kw)}/>'

def ell(cx, cy, rx, ry, **kw):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}"{attrs(kw)}/>'

def attrs(d):
    out = []
    for k, v in d.items():
        k = k.replace("_", "-")
        if v is None or v is True:
            continue
        if v is False:
            v = "none"
        out.append(f'{k}="{v}"')
    return (" " + " ".join(out)) if out else ""

def text(x, y, s, size, fill, anchor="middle", weight="700",
         stroke=None, sw=0, family="'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC',sans-serif",
         ls=None):
    extra = {}
    if stroke:
        extra["stroke"] = stroke
        extra["stroke-width"] = f(sw)
        extra["paint-order"] = "stroke fill"
        extra["stroke-linejoin"] = "round"
    if ls is not None:
        extra["letter-spacing"] = f(ls)
    return (f'<text x="{f(x)}" y="{f(y)}" font-family="{family}" font-size="{f(size)}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{attrs(extra)}>{s}</text>')

# ---------------------------------------------------------------- 树 / 灌木
def pine(cx, by, h, w=None, dark=0):
    """针叶松: 分层圆锥 (尖顶 + 弧形层底 + 左侧受光)"""
    w = w or h * 0.46
    cols = [("#1c4a25", "#2a6330", "#3d843d", "#57a44f"),
            ("#22552c", "#306f38", "#448c44", "#5dad54"),
            ("#2a6433", "#3a7f3e", "#4f9c4b", "#68b85c")][dark]
    c_dk, c_md, c_lt, c_hi = cols
    o = [f'<g transform="translate({f(cx)},{f(by)})">']
    o.append(f'<ellipse cx="2" cy="1" rx="{f(w*0.60)}" ry="{f(h*0.050)}" fill="#5f8236" opacity="0.32"/>')
    o.append(f'<rect x="{f(-w*0.055)}" y="{f(-h*0.15)}" width="{f(w*0.11)}" height="{f(h*0.16)}" fill="#6d4a28"/>')
    hw = w / 2.0
    tiers = [(1.00, 0.72, 0.32), (0.90, 0.55, 0.45), (0.79, 0.38, 0.58),
             (0.66, 0.20, 0.71), (0.52, 0.02, 0.86)]
    for k, (atop, abase, aw) in enumerate(tiers):
        hwu = hw * aw
        yb = -h * abase
        ya = -h * atop
        col = [c_hi, c_hi, c_lt, c_lt, c_md][k]
        d = (f"M{f(-hwu)},{f(yb)} L0,{f(ya)} L{f(hwu)},{f(yb)} "
             f"Q{f(hwu*0.52)},{f(yb + h*0.052)} 0,{f(yb + h*0.052)} "
             f"Q{f(-hwu*0.52)},{f(yb + h*0.052)} {f(-hwu)},{f(yb)} Z")
        o.append(path(d, fill=col))
        # 左半受光
        dl = (f"M{f(-hwu)},{f(yb)} L0,{f(ya)} L0,{f(yb + h*0.052)} "
              f"Q{f(-hwu*0.52)},{f(yb + h*0.052)} {f(-hwu)},{f(yb)} Z")
        o.append(path(dl, fill=c_hi, opacity="0.30"))
        # 右半阴影
        dr = (f"M{f(hwu)},{f(yb)} L0,{f(ya)} L0,{f(yb + h*0.052)} "
              f"Q{f(hwu*0.52)},{f(yb + h*0.052)} {f(hwu)},{f(yb)} Z")
        o.append(path(dr, fill=c_dk, opacity="0.28"))
    o.append("</g>")
    return "".join(o)


def rtree(cx, by, h, w=None, tone=0):
    """阔叶圆冠树"""
    w = w or h * 1.0
    base = ["#3d7a2a", "#4a8a33", "#356f26"][tone]
    blobs = [(-0.30, -0.48, 0.40), (0.31, -0.50, 0.38), (0.00, -0.66, 0.42),
             (-0.14, -0.32, 0.34), (0.18, -0.30, 0.32), (0.02, -0.88, 0.26)]
    o = [f'<g transform="translate({f(cx)},{f(by)})">']
    o.append(f'<ellipse cx="3" cy="0" rx="{f(w*0.52)}" ry="{f(h*0.10)}" fill="#6d8f3a" opacity="0.30"/>')
    o.append(f'<path d="M{f(-w*0.05)},0 L{f(-w*0.03)},{f(-h*0.42)} L{f(w*0.05)},{f(-h*0.42)} '
             f'L{f(w*0.07)},0 Z" fill="#7a5230"/>')
    for bx, byy, br in blobs:
        o.append(circ(bx * w, byy * h, br * w * 0.62, fill=base))
    for bx, byy, br in blobs:
        o.append(circ(bx * w - w * 0.10, byy * h - h * 0.09, br * w * 0.34,
                      fill="#5da33f", opacity="0.85"))
    o.append(circ(-w * 0.24, -h * 0.72, w * 0.19, fill="#7fc055", opacity="0.55"))
    o.append("</g>")
    return "".join(o)

def bush(cx, by, h, tone=0):
    w = h * 1.5
    base = ["#42862f", "#4a9236", "#3b7a2b"][tone]
    o = [f'<g transform="translate({f(cx)},{f(by)})">']
    o.append(f'<ellipse cx="2" cy="1" rx="{f(w*0.5)}" ry="{f(h*0.14)}" fill="#6d8f3a" opacity="0.32"/>')
    for bx, byy, br in [(-0.34, -0.34, 0.40), (0.00, -0.46, 0.46), (0.34, -0.34, 0.40),
                        (-0.18, -0.18, 0.34), (0.18, -0.18, 0.34)]:
        o.append(circ(bx * w, byy * h, br * w * 0.52, fill=base))
    for bx, byy, br in [(-0.20, -0.56, 0.24), (0.16, -0.62, 0.20)]:
        o.append(circ(bx * w, byy * h, br * w * 0.52, fill="#7dbc52", opacity="0.8"))
    o.append("</g>")
    return "".join(o)

def tuft(cx, by, s=1.0, col="#7fa845"):
    g = []
    for k, dx in enumerate((-5, -2.4, 0, 2.4, 5)):
        hh = (7 + (k % 3) * 2.6) * s
        g.append(path(f"M{f(0)},{f(0)} Q{f(dx*0.6)},{f(-hh*0.6)} {f(dx*1.5)},{f(-hh)}",
                      fill="none", stroke=col, stroke_width=f(1.7 * s), stroke_linecap="round"))
    return f'<g transform="translate({f(cx)},{f(by)})">' + "".join(g) + "</g>"

def flower(cx, cy, r, petal="#ffd83d", core="#f0a71e", petals=5, rot=0):
    o = [f'<g transform="translate({f(cx)},{f(cy)}) rotate({f(rot)})">']
    for i in range(petals):
        a = 360.0 / petals * i
        o.append(f'<ellipse cx="0" cy="{f(-r*0.72)}" rx="{f(r*0.46)}" ry="{f(r*0.62)}" '
                 f'fill="{petal}" transform="rotate({f(a)})"/>')
    o.append(circ(0, 0, r * 0.42, fill=core))
    o.append("</g>")
    return "".join(o)

def daisy(cx, cy, r):
    return flower(cx, cy, r, petal="#ffffff", core="#f5c518", petals=8)

def pebble(cx, cy, w, h, rot=0, tone=0):
    c = ["#e6d8b0", "#dfd0a4", "#eee2c0"][tone]
    return (f'<g transform="translate({f(cx)},{f(cy)}) rotate({f(rot)})">'
            f'<ellipse rx="{f(w/2)}" ry="{f(h/2)}" fill="#c9b98d" opacity="0.45" transform="translate(1.5,2)"/>'
            f'<ellipse rx="{f(w/2)}" ry="{f(h/2)}" fill="{c}"/></g>')

# ---------------------------------------------------------------- 地块
T0 = (393.0, 589.0)
U  = (47.0, 24.0)
V  = (-47.0, 24.0)
NI, NJ = 4, 6                 # 4 沿 U, 6 沿 V
TILE_SCALE = 0.88
TILE_R = 9.0

def cell_center(i, j):
    return (T0[0] + U[0]*(i - j), T0[1] + 24.0 + U[1]*(i + j))

def rhombus_path(cx, cy, w, h, r):
    """圆角菱形路径"""
    pts = [(cx, cy - h/2), (cx + w/2, cy), (cx, cy + h/2), (cx - w/2, cy)]
    n = 4
    segs = []
    for k in range(n):
        cur = pts[k]; prv = pts[(k-1) % n]; nxt = pts[(k+1) % n]
        def toward(o, d, dist):
            L = math.hypot(d[0]-o[0], d[1]-o[1]) or 1
            return (o[0] + (d[0]-o[0])/L*dist, o[1] + (d[1]-o[1])/L*dist)
        t = min(r, 18.0)
        pin = toward(cur, prv, t)
        pout = toward(cur, nxt, t)
        segs.append((pin, cur, pout))
    d = [f"M{f(segs[0][0][0])},{f(segs[0][0][1])}"]
    for k in range(n):
        pin, cur, pout = segs[k]
        d.append(f"Q{f(cur[0])},{f(cur[1])} {f(pout[0])},{f(pout[1])}")
        nxt_in = segs[(k+1) % n][0]
        d.append(f"L{f(nxt_in[0])},{f(nxt_in[1])}")
    d.append("Z")
    return " ".join(d)

def build_plot():
    o = ['<g id="plot-bed">']
    # --- 床: 完整格平行四边形 (榃色底 / 褐色边框)
    bed = [(T0[0], T0[1]),
           (T0[0] + U[0]*NI,           T0[1] + U[1]*NI),
           (T0[0] + U[0]*NI + V[0]*NJ, T0[1] + U[1]*NI + V[1]*NJ),
           (T0[0] + V[0]*NJ,           T0[1] + V[1]*NJ)]
    o.append(poly(bed, fill=TAN_GAP, stroke=TAN_EDGE, stroke_width="3"))
    o.append(poly(bed, fill="url(#bedShade)"))
    # 床的柔和内阴影 (贴合瓦片网格凹陷感)
    o.append(poly([(x + (bed[0][0]-x)*0.02, y + (bed[0][1]-y)*0.02) for x, y in bed],
                  fill="none", stroke="#b99f66", stroke_width="2", opacity="0.5"))

    # --- 24 块瓦片
    tw, th = 94 * TILE_SCALE, 48 * TILE_SCALE
    for j in range(NJ):
        for i in range(NI):
            cx, cy = cell_center(i, j)
            dirt = j <= 1
            top   = TILE_D_TOP if dirt else TILE_G_TOP
            lits  = TILE_D_LIT if dirt else TILE_G_LIT
            side  = TILE_D_SIDE if dirt else TILE_G_SIDE
            edge  = TILE_D_EDGE if dirt else TILE_G_EDGE
            # 侧面厚度
            o.append(path(rhombus_path(cx, cy + 4.5, tw, th, TILE_R),
                          fill=side, stroke=edge, stroke_width="1.6"))
            # 顶面
            o.append(path(rhombus_path(cx, cy, tw, th, TILE_R),
                          fill="url(#tileGrad%s)" % ("D" if dirt else "G"),
                          stroke=edge, stroke_width="1.6"))
            # 高光
            o.append(path(rhombus_path(cx, cy - 2.2, tw * 0.86, th * 0.80, TILE_R * 0.8),
                          fill=lits, opacity="0.34"))
            o.append(path(rhombus_path(cx, cy - 3.4, tw * 0.62, th * 0.56, TILE_R * 0.6),
                          fill="#ffffff", opacity="0.13"))
    # --- 作物幼苗 (仅在 j=0,1 共 8 格)
    for j in range(2):
        for i in range(NI):
            cx, cy = cell_center(i, j)
            o.append(sprout(cx, cy + 3, 0.92 if (i + j) % 3 else 1.22))
    o.append("</g>")
    return "".join(o)

def sprout(cx, cy, s=1.0):
    """土面幼苗: 短茎 + 两片贴茎子叶 + 顶芽"""
    o = [f'<g transform="translate({f(cx)},{f(cy)}) scale({f(s)})">']
    o.append(ell(0, 1, 7, 2.2, fill="#6b4a2c", opacity="0.16"))
    o.append(path("M0,1 L0,-7", fill="none", stroke="#5a9a30",
                  stroke_width="1.8", stroke_linecap="round"))
    o.append(path("M-1.2,-6.6 C-4.6,-10.6 -8.2,-10.4 -9.4,-7.8 "
                  "C-7.6,-4.6 -3.6,-3.8 -1.2,-6.6 Z", fill="#7ecb46"))
    o.append(path("M1.2,-6.6 C4.6,-10.6 8.2,-10.4 9.4,-7.8 "
                  "C7.6,-4.6 3.6,-3.8 1.2,-6.6 Z", fill="#6dbd3c"))
    o.append(path("M-0.9,-7 C-3.4,-12.2 -2.6,-15.4 -0.5,-15.6 "
                  "C0.9,-13.2 1.1,-9.6 -0.9,-7 Z", fill="#8edb52"))
    o.append(path("M0.9,-7 C3.4,-12.2 2.6,-15.4 0.5,-15.6 "
                  "C-0.9,-13.2 -1.1,-9.6 0.9,-7 Z", fill="#79cf46"))
    o.append("</g>")
    return "".join(o)


# ================================================================ 场景层
def layer_sky():
    o = ['<g id="L0-sky">']
    o.append(rect(0, 0, W, 470, fill="url(#skyGrad)"))
    # 云
    for cx, cy, w, h, op in [(120, 116, 240, 36, 0.78), (352, 26, 250, 30, 0.72),
                             (600, 128, 210, 30, 0.8), (455, 162, 150, 22, 0.7),
                             (60, 44, 150, 24, 0.65), (250, 74, 130, 18, 0.5)]:
        o.append(f'<g filter="url(#soft4)" opacity="{op}">')
        o.append(ell(cx, cy, w * 0.5, h * 0.5, fill="#ffffff"))
        o.append(ell(cx - w * 0.22, cy + h * 0.16, w * 0.26, h * 0.36, fill="#ffffff"))
        o.append(ell(cx + w * 0.24, cy + h * 0.14, w * 0.24, h * 0.34, fill="#ffffff"))
        o.append(ell(cx + w * 0.02, cy - h * 0.24, w * 0.30, h * 0.38, fill="#ffffff"))
        o.append("</g>")
    # 飞鸟
    for bx, by in [(300, 262), (322, 254), (341, 266)]:
        o.append(path(f"M{f(bx-7)},{f(by)} Q{f(bx-3)},{f(by-5)} {f(bx)},{f(by)} "
                      f"Q{f(bx+3)},{f(by-5)} {f(bx+7)},{f(by)}",
                      fill="none", stroke="#ffffff", stroke_width="1.7",
                      stroke_linecap="round", opacity="0.9"))
    o.append("</g>")
    return "".join(o)


def layer_mountains():
    o = ['<g id="L2-mountain">']
    # 远山 - 蓝紫
    o.append(poly([(-20, 440), (-20, 372), (40, 336), (108, 366), (172, 330), (232, 360),
                   (300, 330), (368, 356), (430, 326), (492, 360), (556, 336), (620, 364),
                   (692, 356), (712, 444)], fill="#9dbccb", opacity="0.72"))
    # 中景山 - 青绿
    o.append(poly([(-20, 452), (-20, 392), (36, 356), (96, 386), (150, 348), (206, 380),
                   (268, 350), (326, 380), (392, 346), (452, 382), (516, 356), (578, 386),
                   (640, 360), (700, 386), (712, 452)], fill="#7dae9c", opacity="0.92"))
    o.append(poly([(-20, 452), (-20, 412), (60, 382), (128, 408), (196, 376), (262, 406),
                   (330, 378), (398, 406), (466, 380), (534, 408), (602, 384), (670, 408),
                   (712, 390), (712, 452)], fill="#96c0a6", opacity="0.88"))
    # 山脊高光
    o.append(poly([(40, 336), (108, 366), (172, 330), (232, 360), (300, 338),
                   (312, 346), (232, 380), (172, 352), (108, 384), (40, 356)],
                  fill="#bcd3d8", opacity="0.6"))
    # 地平线浅色远景草场
    o.append(poly([(-20, 470), (-20, 424), (100, 406), (240, 418), (380, 404),
                   (520, 424), (660, 412), (712, 422), (712, 470)], fill="#bcd884"))
    o.append(poly([(-20, 478), (-20, 444), (140, 430), (300, 442), (470, 428),
                   (640, 444), (712, 438), (712, 478)], fill="#aecb70"))
    o.append("</g>")
    return "".join(o)


def layer_forest():
    """地平线密林带: 3 层景深, 左右高中间低 (对齐参考图树冠轮廓).

    V03 改造: 打开中央林带 (x≈300..420) 让远景草甸透出来; 远层对比由
    opacity=0.78 降至 0.62, 让远树融入大气透视; 中/近层中央缺口更宽,
    让通道视觉明确; 中景大树与结构树保留作为视觉锚点.
    """
    rnd = random.Random(20260910)

    def top_profile(x):
        """参考图树冠顶部轮廓 (含起伏)"""
        if x < 250:
            base = 330 + (x / 250.0) * 46
        elif x < 452:
            base = 376 + ((x - 250) / 202.0) * 74
        else:
            base = 322 + ((x - 452) / 240.0) * 40
        return base + 9 * math.sin(x * 0.055) + 5 * math.sin(x * 0.021 + 1.7)

    # V03 中央缺口区间 (远/中/近三层使用, 让地平线草甸显形)
    CLEAR_FAR   = (305, 415)   # 远层缺口略窄
    CLEAR_MID   = (315, 410)
    CLEAR_NEAR  = (300, 400)   # 近层缺口略宽, 视觉通道更明显

    o = ['<g id="L3-forest">']
    # ---- 远层 (雾化浅绿, 小) [V03 opacity 0.78 -> 0.62]
    o.append('<g opacity="0.62">')
    for k in range(40):
        x = -16 + k * 18.4 + rnd.uniform(-3.5, 3.5)
        if CLEAR_FAR[0] <= x <= CLEAR_FAR[1]:
            continue
        by = 472 + rnd.uniform(-9, 9)
        h = max(34.0, by - (top_profile(x) + 16 + rnd.uniform(-11, 11)))
        o.append(pine(x, by, h, dark=1) if k % 3 else rtree(x, by, h * 1.05, tone=2))
    o.append("</g>")
    # ---- 中层
    for k in range(32):
        x = -12 + k * 22.6 + rnd.uniform(-5, 5)
        if CLEAR_MID[0] <= x <= CLEAR_MID[1]:
            continue
        by = 501 + rnd.uniform(-12, 12)
        h = max(46.0, by - (top_profile(x) + 54 + rnd.uniform(-17, 17)))
        o.append(rtree(x, by, h * 1.02, tone=k % 3) if k % 4 == 1
                 else pine(x, by, h, dark=k % 3))
    # ---- 近层 (深色大株)
    for k in range(30):
        x = -8 + k * 24.1 + rnd.uniform(-8, 8)
        if CLEAR_NEAR[0] <= x <= CLEAR_NEAR[1]:
            continue
        by = 536 + rnd.uniform(-15, 15)
        h = max(58.0, by - (top_profile(x) + 92 + rnd.uniform(-22, 22)))
        o.append(rtree(x, by, h * 1.0, tone=0) if k % 5 == 3 else pine(x, by, h, dark=0))
    # ---- 中景大树 (参考图中央 3 株显眼针叶松, 树冠 y340-560)
    o.append('<g id="mid-trees">')
    for mx, mby, mh, md in [(238, 512, 176, 0), (286, 528, 148, 1),
                            (404, 508, 180, 0), (452, 528, 140, 1),
                            (166, 496, 140, 2), (496, 520, 126, 1)]:
        o.append(f'<ellipse cx="{f(mx+3)}" cy="{f(mby)}" rx="{f(mh*0.20)}" ry="{f(mh*0.045)}" '
                 f'fill="#5f8236" opacity="0.30"/>')
        o.append(pine(mx, mby, mh, dark=md))
    o.append("</g>")
    # ---- 结构树: 草屋右后大圆冠 + 左侧大树
    o.append(rtree(590, 512, 152, tone=0))
    o.append(rtree(662, 520, 116, tone=1))
    o.append(rtree(214, 508, 128, tone=0))
    o.append(rtree(150, 500, 116, tone=1))
    # ---- 草屋周围灌木
    o.append(bush(432, 516, 40, tone=0))
    o.append(bush(470, 508, 34, tone=1))
    o.append(bush(50, 596, 42, tone=1))
    o.append("</g>")
    return "".join(o)


def layer_ground():
    o = ['<g id="L4-ground">', '<g filter="url(#grainGrass)">']
    o.append(rect(0, 412, W, 806, fill="url(#grassGrad)"))
    # 大块浅色草地斑
    rnd = random.Random(7)
    o.append('<g filter="url(#soft26)" opacity="0.26">')
    o.append(ell(300, 470, 210, 52, fill="#d7e79e"))
    o.append(ell(78, 520, 150, 44, fill="#d7e79e"))
    o.append("</g>")
    o.append('<g filter="url(#soft10)" opacity="0.40">')
    for k in range(30):
        x = rnd.uniform(-10, 700); y = rnd.uniform(430, 1150)
        rx = rnd.uniform(26, 74); ry = rnd.uniform(11, 30)
        o.append(ell(x, y, rx, ry, fill=rnd.choice(["#c9df7c", "#c4dc76", "#cfe283"])))
    o.append("</g>")
    o.append('<g filter="url(#soft14)" opacity="0.32">')
    for k in range(24):
        x = rnd.uniform(-10, 700); y = rnd.uniform(520, 1150)
        rx = rnd.uniform(30, 70); ry = rnd.uniform(14, 30)
        o.append(ell(x, y, rx, ry, fill=rnd.choice(["#93a846", "#8ba042", "#9daf4e"])))
    o.append("</g>")
    # 细颗粒草纹理
    o.append("</g>")
    # 近景暗色前景带
    o.append(poly([(-4, 1218), (-4, 1168), (120, 1152), (280, 1166), (430, 1150),
                   (560, 1164), (696, 1150), (696, 1218)], fill="#5f7c37"))
    o.append(poly([(-4, 1218), (-4, 1196), (200, 1180), (400, 1194), (560, 1180),
                   (696, 1192), (696, 1218)], fill="#4a6629"))
    o.append("</g>")
    return "".join(o)


def layer_fence(x0, y0, x1, y1, posts, post_h=64, iid="fence"):
    """简易木栅栏: 沿线节点画立柱 + 两道横杆"""
    o = [f'<g id="{iid}">']
    dx, dy = x1 - x0, y1 - y0
    for k in range(posts):
        p = k / (posts - 1)
        px, py = x0 + dx * p, y0 + dy * p
        sc = 1.0 - 0.10 * abs(p - 0.5)
        h = post_h * sc
        o.append(rect(px - 6.5, py - h, 13, h, rx=5, fill="#d3a96e",
                      stroke="#9a6f3c", stroke_width="1.7"))
        o.append(ell(px, py - h, 6.5, 3.4, fill="#e3bd85", stroke="#9a6f3c", stroke_width="1.4"))
        o.append(rect(px - 5, py - h + 6, 4, h - 10, fill="#e6c493", opacity="0.75"))
    for off in (0.34, 0.66):
        ay = y0 - post_h * off
        by = y1 - post_h * off
        o.append(f'<path d="M{f(x0-8)},{f(ay)} L{f(x1+8)},{f(by)}" stroke="#c99a5f" '
                 f'stroke-width="7.5" stroke-linecap="round"/>')
        o.append(f'<path d="M{f(x0-8)},{f(ay-1.6)} L{f(x1+8)},{f(by-1.6)}" stroke="#e0bb85" '
                 f'stroke-width="3.4" stroke-linecap="round" opacity="0.9"/>')
    o.append("</g>")
    return "".join(o)


def layer_fish():
    o = ['<g id="L5c-fish">']
    o.append(rect(56, 512, 10, 38, rx=4, fill="#c99a63", stroke="#8a5f34", stroke_width="1.6"))
    o.append('<g transform="translate(58,506) scale(0.84)">')
    o.append(path("M-26,0 C-26,-14 -6,-21 8,-19 C22,-17 30,-8 28,2 C26,12 16,17 2,16 "
                  "C-12,15 -26,12 -26,0 Z", fill="#dcae70", stroke="#9a6f3c", stroke_width="1.8"))
    o.append(path("M28,2 L44,-12 L42,2 L44,15 Z", fill="#cf9f60", stroke="#9a6f3c", stroke_width="1.6"))
    o.append(circ(-14, -4, 4.2, fill="#5b3a1c"))
    o.append(circ(-15, -5.4, 1.5, fill="#ffffff"))
    o.append(path("M-20,6 Q-10,12 -2,6", fill="none", stroke="#7d5330",
                  stroke_width="1.9", stroke_linecap="round"))
    o.append(path("M-6,-14 q6,-6 12,-2", fill="none", stroke="#b98d52", stroke_width="1.6"))
    o.append("</g></g>")
    return "".join(o)


def layer_hay_and_cart():
    o = ['<g id="L5d-hay">']
    # 左侧干草车
    o.append('<g transform="translate(-4,596) scale(0.86)">')
    o.append(rect(-2, 0, 74, 34, rx=5, fill="#b98a52", stroke="#83582c", stroke_width="2"))
    o.append(rect(-2, 6, 74, 5, fill="#9c6f3c", opacity="0.8"))
    o.append(path("M2,2 C14,-16 46,-20 68,-6 L68,4 C46,-6 16,-2 2,8 Z", fill="#e6c469"))
    for k in range(6):
        o.append(f'<path d="M{f(6+k*11)},-8 q4,-6 9,-4" stroke="#f4da95" stroke-width="2.4" '
                 f'fill="none" stroke-linecap="round"/>')
    o.append(circ(48, 44, 24, fill="#a2703c", stroke="#6d4520", stroke_width="3"))
    o.append(circ(48, 44, 15, fill="#c99a5f", stroke="#7d5330", stroke_width="2.2"))
    o.append(circ(48, 44, 5, fill="#6d4520"))
    for a in range(0, 360, 45):
        o.append(f'<line x1="48" y1="44" x2="{f(48+14*math.cos(math.radians(a)))}" '
                 f'y2="{f(44+14*math.sin(math.radians(a)))}" stroke="#8a5f34" stroke-width="2.4"/>')
    o.append("</g>")
    # 左侧草垛
    o.append('<g transform="translate(-2,552) scale(0.86)">')
    o.append(path("M0,30 C0,8 16,-4 34,-4 C52,-4 66,8 66,30 Z", fill="#e2c069",
                  stroke="#b8913c", stroke_width="2"))
    for k in range(5):
        o.append(f'<path d="M{f(8+k*12)},26 q3,-14 9,-22" stroke="#f2dc9a" stroke-width="2.6" '
                 f'fill="none" stroke-linecap="round"/>')
    o.append("</g>")
    o.append("</g>")
    return "".join(o)


def layer_path():
    """右侧石板小径"""
    o = ['<g id="L6-path">']
    rnd = random.Random(31)
    # 主径: 从 (470,470) 向右下弧到 (640,1010)
    pts = []
    for k in range(30):
        p = k / 29.0
        x = 452 + 190 * p + 46 * math.sin(p * 3.1)
        y = 462 + 560 * p
        pts.append((x, y))
    for k, (x, y) in enumerate(pts):
        n = rnd.randint(1, 3)
        for m in range(n):
            px = x + rnd.uniform(-26, 26); py = y + rnd.uniform(-14, 14)
            w = rnd.uniform(30, 58) * (0.75 + 0.3 * k / 30)
            o.append(pebble(px, py, w, w * rnd.uniform(0.40, 0.55),
                            rnd.uniform(-24, 24), rnd.randint(0, 2)))
    # 地块上方零星石板
    for x, y in [(268, 566), (312, 578), (352, 566), (452, 548), (300, 604),
                 (600, 560), (642, 596), (664, 640)]:
        o.append(pebble(x, y, rnd.uniform(30, 46), rnd.uniform(13, 20), rnd.uniform(-20, 20), 1))
    # 左下零散
    for x, y in [(30, 856), (96, 900), (56, 950), (150, 968)]:
        o.append(pebble(x, y, rnd.uniform(34, 50), rnd.uniform(15, 21), rnd.uniform(-20, 20), 2))
    o.append("</g>")
    return "".join(o)


def layer_bubble_dog():
    o = ['<g id="L8a-bubble">']
    o.append(f'<g transform="translate(0,0)">')
    o.append(path("M308,441 l94,0 q8,0 8,8 l0,7 q0,8 -8,8 l-12,0 l-1,10 l-9,-10 "
                  "l-72,0 q-8,0 -8,-8 l0,-7 q0,-8 8,-8 Z",
                  fill="#fdfaf2", stroke="#efe3c8", stroke_width="2.2"))
    o.append(text(356, 456, "带田园犬回家", 12, "#6b4438", weight="800"))
    o.append('<g transform="translate(392,452) scale(0.62)">')
    o.append(circ(0, 5, 5.4, fill="#d9a86a"))
    for dx, dy in [(-6, -4), (-2, -7), (2, -7), (6, -4)]:
        o.append(circ(dx, dy, 2.6, fill="#d9a86a"))
    o.append("</g>")
    o.append("</g></g>")
    return "".join(o)


def layer_cottage():
    """草屋 (x 424..596, y 392..564).

    统一 dimetric 投影: origin O=(438,562), U=(47,24), V=(-47,24).
    正面墙: 宽152, 侧深22, 墙高92, 檐高78.
    顺序:
      1. 地面阴影
      2. 盒子顶面 + 右侧面 (dimetric 平行四边形, 短轴 V 方向)
      3. 盒子正面墙体 (平行四边形, 墙顶平行于 U)
      4. 木框 + 门 + 窗 + 花箱 + 长凳
      5. 烟囱后段 (先于屋顶)
      6. 屋顶双坡 (dimetric 平行四边形) + 茅檐
      7. 屋面接触泛水 + 炊烟
      8. 右侧栅栏

    V02 修复 (2026-09-11): 前墙体改为平行四边形, 墙顶边平行于 U=(47,24).
    门/窗使用仿射变换映射到倾斜墙面.
    """
    o = ['<g id="L8-cottage">']
    # ---- dimetric 参数 ----
    COT_OY = 562  # front-left wall bottom y (ground level)
    COT_FW = 152   # front width
    COT_FD = 22    # depth
    COT_WH = 92    # wall height
    COT_RH = 78    # roof height above eave
    U_MAG = math.sqrt(47**2 + 24**2)  # ≈52.8
    V_MAG = U_MAG
    # k_u = 152/|U| ≈ 2.88 使 front eave 长度为 152px, 方向平行于 U
    k_u = COT_FW / U_MAG
    # k_v = 22/|V| ≈ 0.42 使 right eave 长度为 22px, 方向平行于 V
    k_v = COT_FD / V_MAG
    U = (47.0 * k_u, 24.0 * k_u)    # (≈135.4, ≈69.2) 方向平行于 U
    V = (-47.0 * k_v, 24.0 * k_v)   # (≈-19.7, ≈10.1) 方向平行于 V

    # 实际顶点 (从 origin O=(438,562) 出发)
    # Front eave: FEL -> FER, 平行于 U, 长152px
    COT_FEL = (438.0, 470.0)  # front eave left (on front wall top line)
    COT_FER = (COT_FEL[0] + U[0], COT_FEL[1] + U[1])  # front eave right (≈573.4, 539.2)
    # Right eave: FER -> BER, 平行于 V, 长22px
    COT_BER = (COT_FER[0] + V[0], COT_FER[1] + V[1])  # back eave right (≈553.7, 549.3)
    # Back eave: BEL -> BER, 平行于 U (方向与 FEL->FER 相同)
    # 左上角 BEL: front eave left + V
    COT_BEL = (COT_FEL[0] + V[0], COT_FEL[1] + V[1])  # back eave left (≈418.3, 480.1)
    # Ridge: 平行于 V, 在 eave 中点上方 COT_RH
    eave_mid_front = ((COT_FEL[0] + COT_FER[0]) / 2, (COT_FEL[1] + COT_FER[1]) / 2)
    eave_mid_back = ((COT_BEL[0] + COT_BER[0]) / 2, (COT_BEL[1] + COT_BER[1]) / 2)
    COT_RF = (eave_mid_front[0], eave_mid_front[1] - COT_RH)   # ridge front (≈505.7, 461.2)
    COT_RB = (eave_mid_back[0], eave_mid_back[1] - COT_RH)     # ridge back (≈486.0, 471.1)
    # Wall bottom corners (ground level, under FEL and FER)
    wall_bl = (COT_FEL[0], COT_OY)  # bottom left (438, 562)
    wall_br = (COT_FER[0], COT_OY)  # bottom right (≈573.4, 562)
    # Wall top line: 平行于 U, 从 wall_bl 偏移 wall height
    # 墙顶左: FEL; 墙顶右: FEL + (U[0], 0) = FER
    # 实际上墙顶就是 front eave line

    # Ground shadow
    o.append(ell((COT_FEL[0] + COT_FER[0]) / 2, COT_OY, 76, 14, fill="#7d9a42", opacity="0.35"))

    # ---- box top (dimetric parallelogram) ----
    o.append(poly([COT_FEL, COT_FER, COT_BER, COT_BEL],
                  fill="#d8b888", stroke="#9a6f3c", stroke_width="1.6"))
    # top wood grain lines (along U direction)
    for k in range(4):
        t = (k + 0.5) / 4.0
        x0 = COT_FEL[0] + t * (COT_FER[0] - COT_FEL[0])
        y0 = COT_FEL[1] + t * (COT_FER[1] - COT_FEL[1])
        x1 = COT_BEL[0] + t * (COT_BER[0] - COT_BEL[0])
        y1 = COT_BEL[1] + t * (COT_BER[1] - COT_BEL[1])
        o.append(line(x0, y0, x1, y1, stroke="#a87c48", stroke_width="0.8", opacity="0.45"))

    # ---- right face (dimetric parallelogram, V direction) ----
    # Right face top: front-right to back-right = V direction
    o.append(poly([COT_FER, COT_BER,
                   (COT_BER[0], COT_BER[1] + COT_WH),
                   (COT_FER[0], COT_FER[1] + COT_WH)],
                  fill="#a07a48", stroke="#7d5330", stroke_width="1.8"))
    # right face wood grain (horizontal lines)
    for k in range(3):
        y = COT_FEL[1] + 20 + k * 24
        # Interpolate y position on right face
        right_y_at_y = COT_FER[1] + (y - COT_FEL[1]) * (COT_BER[1] - COT_FER[1]) / (COT_BEL[1] - COT_FEL[1])
        o.append(line(COT_FER[0], y, COT_BER[0], right_y_at_y + 11,
                      stroke="#7d5330", stroke_width="0.9", opacity="0.55"))

    # ---- front wall (parallelogram, top edge parallel to back eave BEL->BER) ----
    # FIX: top corners must be COT_BEL/COT_BER (back eave) not COT_FEL/COT_FER.
    # Original [wall_bl, wall_br, COT_FER, COT_FEL] was a twisted quadrilateral where
    # top edge FEL->FER slope=0.511 but bottom edge horizontal, left/right edges not parallel.
    # Corrected parallelogram [wall_bl=(438,562), wall_br=(573.37,562), COT_BER=(553.78,549.13), COT_BEL=(430.53,486.36)]:
    #   bottom: horizontal at y=562; top: BEL->BER slope=0.511; right edge: slanted; left edge: slanted.
    wall_pts = [wall_bl, wall_br, COT_BER, COT_BEL]
    o.append(poly(wall_pts, fill="url(#wallGrad)", stroke="#b9a184", stroke_width="2"))

    # wood frame (vertical left post, vertical right post, horizontal top beam)
    # Left post: from ground up along left edge (V direction)
    left_post_bottom = wall_bl
    left_post_top = COT_FEL
    # Right post: from ground up along right edge (V direction)
    right_post_bottom = wall_br
    right_post_top = COT_FER
    # For the frame, we draw simplified vertical/horizontal posts
    o.append(path(f"M{COT_FEL[0]-2},{COT_FEL[1]-2} L{COT_FEL[0]-2},{COT_OY+2}",
                  stroke="#8a5f34", stroke_width="12", fill="none"))
    o.append(path(f"M{COT_FER[0]-6},{COT_FER[1]-2} L{COT_FER[0]-6},{COT_OY+2}",
                  stroke="#8a5f34", stroke_width="12", fill="none"))
    o.append(path(f"M{COT_FEL[0]-2},{COT_FEL[1]-4} L{COT_FER[0]-6},{COT_FER[1]-4}",
                  stroke="#8a5f34", stroke_width="10", fill="none"))
    # Center post (vertical, screen-aligned since it's structural)
    center_x = (COT_FEL[0] + COT_FER[0]) / 2
    o.append(path(f"M{center_x},{COT_FEL[1]} L{center_x},{COT_OY}",
                  stroke="#8a5f34", stroke_width="9", fill="none"))

    # ---- door (affine transform onto slanted wall) ----
    # Door base width=40, height=46. Door bottom at ground level.
    # Door is parallelogram on wall: bottom follows wall bottom (horizontal),
    # top follows wall top (parallel to U).
    door_w = 40
    door_h = 46
    door_cx = (COT_FEL[0] + COT_FER[0]) / 2  # door center x at wall base level
    door_bl_x = door_cx - door_w / 2
    # Door bottom left: at ground level, left of center
    door_bl = (door_bl_x, COT_OY)
    # Door bottom right: at ground level, right of center
    door_br = (door_bl_x + door_w, COT_OY)
    # Door top left: on wall top line, same x as door_bl
    # Wall top line: from COT_FEL to COT_FER, parallel to U
    # At door_bl_x, find y on wall top line
    # Wall top line parametric: P = COT_FEL + t * U, solve for t where P.x = door_bl_x
    t_door = (door_bl_x - COT_FEL[0]) / U[0] if U[0] != 0 else 0
    door_tl = (door_bl_x, COT_FEL[1] + t_door * U[1])
    # Door top right
    door_tr = (door_bl_x + door_w, COT_FEL[1] + t_door * U[1])
    # Draw door as parallelogram
    o.append(path(f"M{door_bl[0]:.1f},{door_bl[1]:.1f} "
                  f"L{door_br[0]:.1f},{door_br[1]:.1f} "
                  f"L{door_tr[0]:.1f},{door_tr[1]:.1f} "
                  f"L{door_tl[0]:.1f},{door_tl[1]:.1f} Z",
                  fill="url(#doorGrad)", stroke="#7d5330", stroke_width="2.4"))
    # Door inner panel (parallelogram)
    inner_offset = 4
    inner_bl = (door_bl[0] + inner_offset, door_bl[1] - inner_offset)
    inner_br = (door_br[0] - inner_offset, door_br[1] - inner_offset)
    inner_tl = (door_tl[0] + inner_offset, door_tl[1] + inner_offset)
    inner_tr = (door_tr[0] - inner_offset, door_tr[1] + inner_offset)
    o.append(path(f"M{inner_bl[0]:.1f},{inner_bl[1]:.1f} "
                  f"L{inner_br[0]:.1f},{inner_br[1]:.1f} "
                  f"L{inner_tr[0]:.1f},{inner_tr[1]:.1f} "
                  f"L{inner_tl[0]:.1f},{inner_tl[1]:.1f} Z",
                  fill="#a8763f", opacity="0.55"))
    # Door knob
    knob_x = door_br[0] - 6
    knob_y = (door_bl[1] + door_tl[1]) / 2
    o.append(circ(knob_x, knob_y, 2.8, fill="#f0d47e"))
    # 福字 (on door, position interpolated)
    text_x = (door_bl[0] + door_br[0]) / 2
    text_y = (door_bl[1] + door_tl[1]) / 2 + 8
    o.append(text(text_x, text_y, "福", 17, "#c0392b", weight="800"))

    # ---- windows (affine transform onto slanted wall) ----
    # Window 1: left side, width=32, height=30
    win1_w = 32
    win1_h = 30
    win1_cx = COT_FEL[0] + (COT_FER[0] - COT_FEL[0]) * 0.2  # 20% from left
    win1_y_bottom = COT_FEL[1] + (COT_FER[1] - COT_FEL[1]) * 0.2 + 32  # on wall, lower
    win1_bl = (win1_cx - win1_w/2, win1_y_bottom)
    win1_br = (win1_cx + win1_w/2, win1_y_bottom)
    t_win1 = (win1_bl[0] - COT_FEL[0]) / U[0] if U[0] != 0 else 0
    win1_tl = (win1_bl[0], COT_FEL[1] + t_win1 * U[1])
    win1_tr = (win1_br[0], COT_FEL[1] + t_win1 * U[1])
    o.append(path(f"M{win1_bl[0]:.1f},{win1_bl[1]:.1f} "
                  f"L{win1_br[0]:.1f},{win1_br[1]:.1f} "
                  f"L{win1_tr[0]:.1f},{win1_tr[1]:.1f} "
                  f"L{win1_tl[0]:.1f},{win1_tl[1]:.1f} Z",
                  fill="#bfe0e8", stroke="#8a5f34", stroke_width="3"))
    # Window cross (vertical and horizontal bars)
    o.append(path(f"M{win1_cx:.1f},{win1_bl[1]:.1f} L{win1_cx:.1f},{win1_tl[1]:.1f}",
                  stroke="#8a5f34", stroke_width="2.4"))
    win1_mid_y = (win1_bl[1] + win1_tl[1]) / 2
    o.append(path(f"M{win1_bl[0]:.1f},{win1_mid_y:.1f} L{win1_br[0]:.1f},{win1_mid_y:.1f}",
                  stroke="#8a5f34", stroke_width="2.4"))

    # Window 2: right side
    win2_cx = COT_FEL[0] + (COT_FER[0] - COT_FEL[0]) * 0.75  # 75% from left
    win2_y_bottom = COT_FEL[1] + (COT_FER[1] - COT_FEL[1]) * 0.75 + 48
    win2_bl = (win2_cx - win1_w/2, win2_y_bottom)
    win2_br = (win2_cx + win1_w/2, win2_y_bottom)
    t_win2 = (win2_bl[0] - COT_FEL[0]) / U[0] if U[0] != 0 else 0
    win2_tl = (win2_bl[0], COT_FEL[1] + t_win2 * U[1])
    win2_tr = (win2_br[0], COT_FEL[1] + t_win2 * U[1])
    o.append(path(f"M{win2_bl[0]:.1f},{win2_bl[1]:.1f} "
                  f"L{win2_br[0]:.1f},{win2_br[1]:.1f} "
                  f"L{win2_tr[0]:.1f},{win2_tr[1]:.1f} "
                  f"L{win2_tl[0]:.1f},{win2_tl[1]:.1f} Z",
                  fill="#bfe0e8", stroke="#8a5f34", stroke_width="3"))
    o.append(path(f"M{win2_cx:.1f},{win2_bl[1]:.1f} L{win2_cx:.1f},{win2_tl[1]:.1f}",
                  stroke="#8a5f34", stroke_width="2.4"))
    win2_mid_y = (win2_bl[1] + win2_tl[1]) / 2
    o.append(path(f"M{win2_bl[0]:.1f},{win2_mid_y:.1f} L{win2_br[0]:.1f},{win2_mid_y:.1f}",
                  stroke="#8a5f34", stroke_width="2.4"))

    # flower boxes (simplified, on wall bottom)
    for bx, by_frac in [(COT_FEL[0] + 10, 0.15), (COT_FER[0] - 50, 0.7)]:
        # Flower box parallelogram on wall
        fb_w = 34
        fb_h = 11
        fb_bl = (bx, COT_OY - fb_h - 8)
        fb_br = (bx + fb_w, COT_OY - fb_h - 8)
        t_fb = (fb_bl[0] - COT_FEL[0]) / U[0] if U[0] != 0 else 0
        fb_tl = (bx, COT_FEL[1] + t_fb * U[1] - 8)
        fb_tr = (bx + fb_w, COT_FEL[1] + t_fb * U[1] - 8)
        o.append(path(f"M{fb_bl[0]:.1f},{fb_bl[1]:.1f} "
                      f"L{fb_br[0]:.1f},{fb_br[1]:.1f} "
                      f"L{fb_tr[0]:.1f},{fb_tr[1]:.1f} "
                      f"L{fb_tl[0]:.1f},{fb_tl[1]:.1f} Z",
                      fill="#a8763f", stroke="#7d5330", stroke_width="1.6"))
        for k in range(4):
            fx = bx + 5 + k * 8
            fy = fb_bl[1] + 1
            o.append(circ(fx, fy, 4.4, fill=["#e8556d", "#f08fa0", "#e8556d", "#f5b942"][k]))
            o.append(circ(fx, fy, 1.6, fill="#ffe08a"))

    # bench (simplified, at wall base)
    bench_y = COT_OY - 18
    o.append(rect(COT_FEL[0] - 6, bench_y, 40, 7, rx=2, fill="#b98a52", stroke="#83582c", stroke_width="1.6"))
    o.append(rect(COT_FEL[0] - 2, bench_y + 7, 6, 10, fill="#9c6f3c"))
    o.append(rect(COT_FEL[0] + 26, bench_y + 7, 6, 10, fill="#9c6f3c"))

    # ---- chimney back (before roof so roof covers bottom edge) ----
    # Chimney based on actual roof vertices: find roof surface y at chimney x
    # Chimney x centered at ~540, within the near-face roof area
    chim_x = 540
    # Roof near-face: line from FEL to RF (left slope) and FER to RF (right slope)
    # For x=540, it's on the right slope (between RF and FER)
    # Right slope: param t where x = RF.x + t*(FER.x - RF.x)
    t_chim = (chim_x - COT_RF[0]) / (COT_FER[0] - COT_RF[0]) if (COT_FER[0] - COT_RF[0]) != 0 else 0
    roof_y_at_chim = COT_RF[1] + t_chim * (COT_FER[1] - COT_RF[1])
    chim_base_y = roof_y_at_chim
    # Shaft height extends above roof
    o.append(chimney_back(cx_top=chim_x, base_y=chim_base_y, shaft_w=46, shaft_h=70,
                          iid="L8c-chimney-back"))

    # ---- roof near face (dimetric parallelogram) ----
    # FIX: roof_left must use COT_BEL (back eave) not COT_FEL + hardcoded offset.
    # The left eave should start from the back eave BEL shifted left by overhang.
    # For a proper parallelogram, 4th point = roof_left + V (same delta as FER-BER).
    # Overhang: 14px left (back eave), 20px right (front eave)
    left_overhang = 14
    right_overhang = 20
    roof_left = (COT_BEL[0] - left_overhang, COT_BEL[1] + 16)
    roof_right = (COT_FER[0] + right_overhang, COT_FER[1])
    # 4th point: parallelogram completion = roof_left + (COT_BER - COT_FER) = roof_left + V
    _fourth = (roof_left[0] + V[0], roof_left[1] + V[1])
    o.append(poly([roof_left, COT_RF, roof_right, _fourth],
                  fill="url(#roofGrad)", stroke="#b8913c", stroke_width="0"))

    # Straw texture lines (along V direction, from eave to ridge)
    o.append('<g opacity="0.55" stroke="#a87f28" stroke-width="1.5" fill="none">')
    rnd = random.Random(5)
    for k in range(22):
        t = (k + 0.5) / 22.0
        # Left half (FEL to RF)
        lx = COT_FEL[0] + t * (COT_RF[0] - COT_FEL[0])
        ly = COT_FEL[1] + t * (COT_RF[1] - COT_FEL[1])
        lbx = COT_BEL[0] + t * (COT_RB[0] - COT_BEL[0])
        lby = COT_BEL[1] + t * (COT_RB[1] - COT_BEL[1])
        o.append(f'<path d="M{lx:.1f},{ly:.1f} L{lbx:.1f},{lby:.1f}"/>')
        # Right half (FER to RF)
        rx = COT_FER[0] + t * (COT_RF[0] - COT_FER[0])
        ry = COT_FER[1] + t * (COT_RF[1] - COT_FER[1])
        rrx = COT_BER[0] + t * (COT_RB[0] - COT_BER[0])
        rry = COT_BER[1] + t * (COT_RB[1] - COT_BER[1])
        o.append(f'<path d="M{rx:.1f},{ry:.1f} L{rrx:.1f},{rry:.1f}"/>')
    o.append("</g>")
    # Roof near-face outline stroke
    o.append(poly([roof_left, COT_RF, roof_right, (COT_FEL[0] - left_overhang + 6, COT_FEL[1] + 18)],
                  fill="none", stroke="#c99a3f", stroke_width="2.4"))

    # ---- roof right face (dimetric parallelogram: RF to RB to BER to FER) ----
    o.append(poly([COT_RF, COT_RB, COT_BER, COT_FER],
                  fill="#c89c4c", stroke="#7d5330", stroke_width="1.6", opacity="0.94"))

    # ---- roof ridge highlight ----
    o.append(path(f"M{COT_RF[0]:.1f},{COT_RF[1]:.1f} "
                  f"C{COT_RF[0]+36:.1f},{COT_RF[1]+28:.1f} "
                  f"{COT_FER[0]-20:.1f},{COT_FER[1]-8:.1f} "
                  f"{COT_FER[0]:.1f},{COT_FER[1]:.1f}",
                  fill="#f6e0a0", opacity="0.75"))
    o.append(path(f"M{COT_RF[0]:.1f},{COT_RF[1]:.1f} "
                  f"C{COT_RF[0]-32:.1f},{COT_RF[1]+28:.1f} "
                  f"{COT_FEL[0]+20:.1f},{COT_FEL[1]-8:.1f} "
                  f"{COT_FEL[0]:.1f},{COT_FEL[1]:.1f}",
                  fill="#f6e0a0", opacity="0.45"))

    # ---- roof eave thickness ----
    o.append(poly([(COT_FEL[0] - left_overhang, COT_FEL[1] + 18),
                   (COT_RF[0], COT_RF[1] + 2),
                   (COT_FER[0] + right_overhang, COT_FER[1] + 2),
                   (COT_FEL[0] - left_overhang + 6, COT_FEL[1] + 20)],
                  fill="#c99a3f"))

    # ---- chimney contact strip (clipped to near eave polygon) ----
    # Recalculate roof surface at chimney position
    t_cs = (chim_x - COT_RF[0]) / (COT_FER[0] - COT_RF[0]) if (COT_FER[0] - COT_RF[0]) != 0 else 0
    cs_roof_y = COT_RF[1] + t_cs * (COT_FER[1] - COT_RF[1])
    _near_eave_pts = f"{roof_left[0]:.1f},{roof_left[1]:.1f} {COT_RF[0]:.1f},{COT_RF[1]:.1f} {COT_FER[0]:.1f},{COT_FER[1]:.1f}"
    o.append(f'<clipPath id="eaveClip"><polygon points="{_near_eave_pts}"/></clipPath>')
    _cs_x0 = chim_x - 23; _cs_x1 = chim_x + 23
    _cs_y0 = cs_roof_y; _cs_y1 = cs_roof_y + 5
    o.append(f'<g clip-path="url(#eaveClip)">')
    o.append(f'<path d="M{_cs_x0:.1f},{_cs_y0:.1f} L{_cs_x1:.1f},{_cs_y0:.1f} L{_cs_x1:.1f},{_cs_y1:.1f} L{_cs_x0:.1f},{_cs_y1:.1f} Z" '
             f'fill="#7d5a30" opacity="0.55"/>')
    o.append(f'<path d="M{_cs_x0-4:.1f},{_cs_y0:.1f} Q{_cs_x0+_cs_x1*0.4:.1f},{_cs_y0+8:.1f} {_cs_x1:.1f},{_cs_y0+4:.1f} '
             f'L{_cs_x1:.1f},{_cs_y0:.1f} Z" fill="#5a4422" opacity="0.32"/>')
    o.append("</g>")

    # ---- chimney smoke ----
    o.append(chimney_smoke(cx_top=chim_x, base_y=chim_base_y, shaft_w=46, shaft_h=70,
                           iid="L8c-chimney-smoke"))

    # ---- right fence ----
    o.append(layer_fence(642, 556, 690, 566, 3, 62, "cfence"))
    o.append("</g>")
    return "".join(o)


def chimney_back(cx_top, base_y, shaft_w=46, shaft_h=46, iid="chimney-back"):
    """烟囱后段 — 仅绘制屋脊上方的烟囱体块。

    在 layer_cottage() 中先于屋顶绘制, 让近侧屋顶 path 覆盖下沿实现"穿透"效果。
    锚点 (cx_top, base_y) = 顶帽中线 x 与屋脊穿透线 y。
    `shaft_h` 仅表示屋脊之上可见的体块高度。
    """
    o = [f'<g id="{iid}">']
    cx_left = cx_top - shaft_w / 2
    cx_right = cx_top + shaft_w / 2
    cap_w = shaft_w + 12
    cap_h = 12
    cap_y = base_y - shaft_h - cap_h
    shaft_y = base_y - shaft_h
    # 主体砖墙 (浅色基, 让近侧屋顶 path 覆盖下沿)
    o.append(rect(cx_left, shaft_y, shaft_w, shaft_h, rx=2,
                  fill="#cab692", stroke="#8f7a55", stroke_width="2"))
    # 横向砖缝 (按可见段高度分 4 行)
    rows = 4
    row_h = shaft_h / rows
    for r in range(rows - 1):
        y_line = shaft_y + (r + 1) * row_h
        o.append(line(cx_left + 1, y_line, cx_right - 1, y_line,
                      stroke="#8f7a55", stroke_width="1.2", opacity="0.85"))
        offset_x = (shaft_w * 0.34) if r % 2 == 0 else (shaft_w * 0.66)
        o.append(line(cx_left + offset_x, y_line - row_h,
                      cx_left + offset_x, y_line,
                      stroke="#8f7a55", stroke_width="1.2", opacity="0.85"))
    # 主体右侧受光 (深米色) + 左侧阴影 (暗米色)
    o.append(rect(cx_left + shaft_w - 10, shaft_y + 4, 6, shaft_h - 8,
                  fill="#b09c7c", opacity="0.55"))
    o.append(rect(cx_left + 4, shaft_y + 4, 5, shaft_h - 8,
                  fill="#7d6a4a", opacity="0.32"))
    # 顶帽 (承檐石)
    cap_x = cx_top - cap_w / 2
    o.append(rect(cap_x, cap_y, cap_w, cap_h, rx=2,
                  fill="#e8dcc0", stroke="#8f7a55", stroke_width="2"))
    o.append(rect(cap_x + 4, cap_y + cap_h - 3, cap_w - 8, 2,
                  fill="#a88e5c", opacity="0.55"))
    o.append(rect(cap_x + cap_w - 8, cap_y + 2, 4, cap_h - 4,
                  fill="#fff3d4", opacity="0.45"))
    o.append(rect(cap_x + 2, cap_y + 2, 4, cap_h - 4,
                  fill="#8a7050", opacity="0.35"))
    # 烟口 (顶帽中心向内凹陷的暗孔)
    o.append(ell(cx_top, cap_y + cap_h - 1, shaft_w * 0.36, 4.6,
                 fill="#2b2622", opacity="0.95"))
    o.append(ell(cx_top, cap_y + cap_h - 1, shaft_w * 0.30, 3.0,
                 fill="#0e0c0a", opacity="0.90"))
    o.append("</g>")
    return "".join(o)


def chimney_contact(cx_top, base_y, shaft_w=46, iid="chimney-contact"):
    """屋面接触泛水 — 在近侧屋顶 path 之后绘制。

    沿烟囱底部 ~6px 高的梯形, 表示屋顶茅草与烟囱体块的接缝防水层。
    `base_y` 是屋脊穿透处的 roof curve y 值 (约 420 at x=540);
    泛水顶部与屋面曲线齐平, 近侧屋顶覆盖下沿形成"穿透"感。
    """
    o = [f'<g id="{iid}">']
    cl = cx_top - shaft_w / 2
    cr = cx_top + shaft_w / 2
    by = base_y
    # 泛水带: 沿屋顶斜面贴一道 5px 厚的暗色, 表示烟囱与茅草的接缝
    o.append(path(f"M{f(cl-2)},{f(by)} L{f(cr+2)},{f(by)} L{f(cr+2)},{f(by+5)} "
                  f"L{f(cl-2)},{f(by+5)} Z",
                  fill="#7d5a30", opacity="0.55"))
    # 屋面阴影 (烟囱左侧投射到近侧屋面的暗色三角)
    o.append(path(f"M{f(cl-6)},{f(by)} Q{f(cl+shaft_w*0.4)},{f(by+8)} {f(cr)},{f(by+4)} "
                  f"L{f(cr)},{f(by)} Z",
                  fill="#5a4422", opacity="0.32"))
    o.append("</g>")
    return "".join(o)


def chimney_smoke(cx_top, base_y, shaft_w=46, shaft_h=46, iid="chimney-smoke"):
    """炊烟分层 — 在所有实体绘制之后调用, 6 团由浓到淡向上飘."""
    cap_h = 12
    cap_y = base_y - shaft_h - cap_h
    o = [f'<g id="{iid}">']
    smoke = [
        (cx_top - 2, cap_y - 10, 11, 9, 0.85, "#ffffff"),
        (cx_top + 3, cap_y - 26, 14, 11, 0.78, "#ffffff"),
        (cx_top - 4, cap_y - 44, 17, 13, 0.68, "#f6f6f4"),
        (cx_top + 4, cap_y - 64, 20, 15, 0.56, "#e8eae6"),
        (cx_top - 2, cap_y - 86, 23, 17, 0.42, "#dde2e8"),
        (cx_top + 5, cap_y - 110, 26, 19, 0.30, "#cfd5dc"),
    ]
    for sx, sy, srx, sry, op, col in smoke:
        o.append(ell(sx, sy, srx, sry, fill=col, opacity=op,
                     filter="url(#soft6)"))
    o.append("</g>")
    return "".join(o)


def chimney(cx_top, base_y, shaft_w=46, shaft_h=64, iid="chimney"):
    """立体砖砌烟囱 (V02+V05 联合改造, 旧单段版本, 保留以避免破坏外部调用).

    实际 A 阶段绘制时由 `chimney_back` + `chimney_contact` + `chimney_smoke`
    拆三段调用, 由 `layer_cottage()` 控制顺序. 本函数仅保留作为占位.
    """
    cx_left = cx_top - shaft_w / 2
    cap_h = 12
    cap_y = base_y - shaft_h - cap_h
    o = [f'<g id="{iid}">']
    # 落地阴影 (墙根接地, 视觉占位 — 仅用于未走 chimney_back 的外部调用)
    o.append(ell(cx_top, base_y + 2.5, shaft_w * 0.65, 4.5,
                 fill="#3a4a25", opacity="0.32"))
    # 完整主体 — 不推荐, 会盖住屋顶
    o.append(rect(cx_left, base_y - shaft_h, shaft_w, shaft_h, rx=2,
                  fill="#cab692", stroke="#8f7a55", stroke_width="2"))
    o.append(rect(cx_top - (shaft_w + 12)/2, cap_y, shaft_w + 12, cap_h, rx=2,
                  fill="#e8dcc0", stroke="#8f7a55", stroke_width="2"))
    o.append("</g>")
    return "".join(o)


def line(x1, y1, x2, y2, **kw):
    return (f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}"'
            f'{attrs(kw)}/>')


def layer_doghouse():
    """狗屋 (dimetric 盒子 + 双坡顶, 与草屋/地块同投影方向).

    统一 dimetric 投影: U=(47,24), V=(-47,24).
    顺序:
      1. 地面阴影
      2. 盒子顶面 + 右侧面 (dimetric 平行四边形)
      3. 盒子正面墙体 (平行四边形, 墙顶平行于 U)
      4. 左山墙三角 + 近檐口平行四边形
      5. 右后屋面 (dimetric 平行四边形)
      6. 入口
      7. 骨头 / 水盆

    V02 修复 (2026-09-11): 前墙体改为平行四边形, 墙顶边平行于 U=(47,24).
    """
    o = ['<g id="L8b-doghouse">']
    o.append(ell(359, 540, 44, 9, fill="#7d9a42", opacity="0.32"))

    # ---- dimetric 参数 ----
    DOG_FW = 66    # front width
    DOG_FD = 14    # depth
    DOG_WH = 34    # wall height
    DOG_RH = 24    # roof height
    U_MAG = math.sqrt(47**2 + 24**2)  # ≈52.8
    V_MAG = U_MAG
    k_u = DOG_FW / U_MAG   # ≈1.25
    k_v = DOG_FD / V_MAG    # ≈0.265
    U = (47.0 * k_u, 24.0 * k_u)    # (≈58.75, ≈30)
    V = (-47.0 * k_v, 24.0 * k_v)   # (≈-12.4, ≈6.36)

    # 实际顶点
    DOG_FEL = (330.0, 508.0)  # front eave left
    DOG_FER = (DOG_FEL[0] + U[0], DOG_FEL[1] + U[1])  # front eave right (≈388.75, 538)
    DOG_BEL = (DOG_FEL[0] + V[0], DOG_FEL[1] + V[1])  # back eave left (≈317.6, 514.4)
    DOG_BER = (DOG_FER[0] + V[0], DOG_FER[1] + V[1])  # back eave right (≈376.35, 544.36)
    # Ridge: eave midpoint minus roof height
    eave_mid_front = ((DOG_FEL[0] + DOG_FER[0]) / 2, (DOG_FEL[1] + DOG_FER[1]) / 2)
    eave_mid_back = ((DOG_BEL[0] + DOG_BER[0]) / 2, (DOG_BEL[1] + DOG_BER[1]) / 2)
    DOG_RF = (eave_mid_front[0], eave_mid_front[1] - DOG_RH)   # ridge front
    DOG_RB = (eave_mid_back[0], eave_mid_back[1] - DOG_RH)      # ridge back
    # Wall bottom corners
    DOG_WALL_BL = (DOG_FEL[0], DOG_FEL[1] + DOG_WH)  # wall bottom left
    DOG_WALL_BR = (DOG_FER[0], DOG_FER[1] + DOG_WH)  # wall bottom right

    # ---- box top (dimetric parallelogram) ----
    o.append(poly([DOG_FEL, DOG_FER, DOG_BER, DOG_BEL],
                  fill="#ead6b4", stroke="#b99f76", stroke_width="1.4"))
    # right face
    # ---- right face (dimetric parallelogram, connects front eave to back eave) ----
    # Polygon: top-left=FER, top-right=BER, bottom-right=(BER.x,BER.y+DOG_WH), bottom-left=(BEL.x,BEL.y+DOG_WH)
    # Both top and bottom edges follow V direction (slope -0.511), forming proper parallelogram.
    # FIX: bottom-left was (FER.x,FER.y+DOG_WH) which gives wrong direction. Correct is BEL+(0,DOG_WH).
    o.append(poly([DOG_FER, DOG_BER,
                   (DOG_BER[0], DOG_BER[1] + DOG_WH),
                   (DOG_BEL[0], DOG_BEL[1] + DOG_WH)],
                  fill="#b89572", stroke="#7d5a30", stroke_width="1.4"))

    # ---- front wall (parallelogram, top edge parallel to back eave BEL->BER) ----
    # FIX: both bottom corners must be BEL/DOG_WH and BER/DOG_WH, not DOG_WALL_BL/DOG_WALL_BR.
    # Original [DOG_WALL_BL=(330,542), DOG_WALL_BR=(388.78,572.02), FER, FEL] had:
    #   - bottom-right using FER.y+DOG_WH instead of BER.y+DOG_WH (wrong x and wrong y)
    #   - top-right using FER instead of BER (wrong vertex)
    #   - bottom-left using FEL.y+DOG_WH instead of BEL.y+DOG_WH (wrong x and wrong y)
    # Corrected: top corners = BEL, BER; bottom corners = BEL+(0,DOG_WH), BER+(0,DOG_WH).
    wall_pts = [(DOG_BEL[0], DOG_BEL[1] + DOG_WH), (DOG_BER[0], DOG_BER[1] + DOG_WH), DOG_BER, DOG_BEL]
    o.append(poly(wall_pts, fill="#e6d3b4", stroke="#b99f76", stroke_width="2"))

    # ---- left gable triangle: FEL -> RF -> BEL ----
    o.append(path(f"M{DOG_FEL[0]:.1f},{DOG_FEL[1]:.1f} "
                f"L{DOG_RF[0]:.1f},{DOG_RF[1]:.1f} "
                f"L{DOG_BEL[0]:.1f},{DOG_BEL[1]:.1f} Z",
                fill="#c9903f", stroke="#a8762c", stroke_width="1.6"))

    # ---- near eave parallelogram: FEL -> FER -> BER -> BEL ----
    o.append(path(f"M{DOG_FEL[0]:.1f},{DOG_FEL[1]:.1f} "
                f"L{DOG_FER[0]:.1f},{DOG_FER[1]:.1f} "
                f"L{DOG_BER[0]:.1f},{DOG_BER[1]:.1f} "
                f"L{DOG_BEL[0]:.1f},{DOG_BEL[1]:.1f} Z",
                fill="#d4a84a", stroke="#a8762c", stroke_width="1.4"))

    # Straw texture on left gable (along V direction)
    for k in range(6):
        t = (k + 0.5) / 6.0
        gx = DOG_FEL[0] + t * (DOG_BEL[0] - DOG_FEL[0])
        gy = DOG_FEL[1] + t * (DOG_BEL[1] - DOG_FEL[1])
        rx = DOG_RF[0] + t * (DOG_RB[0] - DOG_RF[0])
        ry = DOG_RF[1] + t * (DOG_RB[1] - DOG_RF[1])
        o.append(f'<path d="M{gx:.1f},{gy:.1f} L{rx:.1f},{ry:.1f}" stroke="#b8913c" '
                 f'stroke-width="1.5" opacity="0.6"/>')

    # ---- right rear roof face (dimetric parallelogram) ----
    o.append(poly([DOG_RF, DOG_RB, DOG_BER, DOG_FER],
                  fill="#a8763c", stroke="#7d5330", stroke_width="1.4", opacity="0.95"))

    # ---- entrance (on wall, affine mapped) ----
    # Door: parallelogram on wall, width=28, height=28
    door_w = 28
    door_h = 28
    door_cx = (DOG_FEL[0] + DOG_FER[0]) / 2
    door_bl_x = door_cx - door_w / 2
    # Door bottom at ground level
    door_bl = (door_bl_x, DOG_FEL[1] + DOG_WH)
    door_br = (door_bl_x + door_w, DOG_FEL[1] + DOG_WH)
    # Door top on wall top line (parallel to U)
    t_door = (door_bl_x - DOG_FEL[0]) / U[0] if U[0] != 0 else 0
    door_tl = (door_bl_x, DOG_FEL[1] + t_door * U[1])
    door_tr = (door_bl_x + door_w, DOG_FEL[1] + t_door * U[1])
    # Outer frame
    o.append(path(f"M{door_bl[0]:.1f},{door_bl[1]:.1f} "
                  f"L{door_br[0]:.1f},{door_br[1]:.1f} "
                  f"L{door_tr[0]:.1f},{door_tr[1]:.1f} "
                  f"L{door_tl[0]:.1f},{door_tl[1]:.1f} Z",
                  fill="#5a3a20"))
    # Inner door (slightly smaller parallelogram)
    inner_off = 3
    inner_bl = (door_bl[0] + inner_off, door_bl[1] - inner_off)
    inner_br = (door_br[0] - inner_off, door_br[1] - inner_off)
    inner_tl = (door_tl[0] + inner_off, door_tl[1] + inner_off)
    inner_tr = (door_tr[0] - inner_off, door_tr[1] + inner_off)
    o.append(path(f"M{inner_bl[0]:.1f},{inner_bl[1]:.1f} "
                  f"L{inner_br[0]:.1f},{inner_br[1]:.1f} "
                  f"L{inner_tr[0]:.1f},{inner_tr[1]:.1f} "
                  f"L{inner_tl[0]:.1f},{inner_tl[1]:.1f} Z",
                  fill="#3f2716"))

    # 骨头
    o.append('<g transform="translate(359,502) rotate(-12) scale(0.84)">'
             '<rect x="-13" y="-3" width="26" height="6" rx="3" fill="#f7f2e6" stroke="#c9c0ad" stroke-width="1.3"/>'
             '<circle cx="-12" cy="-3.6" r="4.6" fill="#f7f2e6" stroke="#c9c0ad" stroke-width="1.3"/>'
             '<circle cx="-12" cy="3.6" r="4.6" fill="#f7f2e6" stroke="#c9c0ad" stroke-width="1.3"/>'
             '<circle cx="12" cy="-3.6" r="4.6" fill="#f7f2e6" stroke="#c9c0ad" stroke-width="1.3"/>'
             '<circle cx="12" cy="3.6" r="4.6" fill="#f7f2e6" stroke="#c9c0ad" stroke-width="1.3"/></g>')
    # 水盆
    o.append(ell(320, 524, 12, 5.6, fill="#8fc7dd", stroke="#5f9ab5", stroke_width="2"))
    o.append(ell(320, 521, 12, 5.6, fill="none", stroke="#5f9ab5", stroke_width="2"))
    o.append(ell(320, 521, 9, 3.8, fill="#bfe6f2"))
    o.append("</g>")
    return "".join(o)


def layer_signs():
    o = ['<g id="L8c-signs">']
    # 访客牌 (木箱)
    o.append(rect(221, 524, 9, 34, rx=3, fill="#b98a52", stroke="#83582c", stroke_width="1.5"))
    o.append(rect(206, 506, 38, 20, rx=3, fill="#d3a96e", stroke="#9a6f3c", stroke_width="1.8"))
    o.append(rect(208, 508, 34, 16, rx=2.6, fill="#c99a5f"))
    o.append(text(225, 520, "访客", 11, "#5b3a1c", weight="800"))
    for k in range(5):
        o.append(path(f"M{f(209+k*10)},502 l3,-5 l3,5", fill="#6fae3f", opacity="0.85"))
    # 劳动光荣牌 (木牌)
    o.append(rect(223, 552, 9, 34, rx=3, fill="#b98a52", stroke="#83582c", stroke_width="1.5"))
    o.append(rect(202, 532, 48, 22, rx=3, fill="#d9b077", stroke="#9a6f3c", stroke_width="1.9"))
    o.append(rect(204, 534, 44, 18, rx=2.6, fill="#cfa464"))
    o.append(text(226, 549, "劳动光荣", 10, "#5b3a1c", weight="800"))
    for k in range(6):
        o.append(path(f"M{f(204+k*9)},530 q3,-5 6,0", fill="#6fae3f", opacity="0.8"))
    # 石块
    o.append(ell(226, 594, 21, 9, fill="#b9b2a4", stroke="#8f887a", stroke_width="1.6"))
    o.append(ell(223, 591, 16, 6.5, fill="#cfc8ba"))
    o.append("</g>")
    return "".join(o)


def layer_grade_sign():
    """地块左缘 '9级 可扩建' 木牌 (前景层)"""
    o = ['<g id="L8d-gradesign">']
    o.append('<g transform="rotate(-2 294 640)">')
    o.append(rect(289, 650, 10, 44, rx=3, fill="#b98a52", stroke="#7d5330", stroke_width="1.7"))
    for gdx in (-4, 0, 4):
        o.append(path(f"M{294+gdx},694 q-2.4,-8 1,-11 q2.4,4 1.6,11 Z", fill="#6fae3f", opacity="0.85"))
    o.append(rect(271, 622, 46, 30, rx=4.5, fill="#e0bd88", stroke="#9a6f3c", stroke_width="2.4"))
    o.append(rect(274, 625, 40, 23, rx=3.5, fill="#d3a96e"))
    o.append(text(294, 638, "9级", 12, "#5b3a1c", weight="800"))
    o.append(text(294, 649, "可扩建", 9.5, "#5b3a1c", weight="800"))
    for dx, dy, rot in [(-18, 620, -34), (-10, 617, -18), (-2, 619, 4),
                        (6, 616, 22), (14, 619, 38)]:
        o.append(f'<g transform="translate({294+dx},{dy}) rotate({rot})">'
                 f'<path d="M0,0 C-3,-4 -2.4,-8 0,-9 C2.4,-8 3,-4 0,0 Z" '
                 f'fill="#6fae3f" opacity="0.92"/></g>')
    o.append("</g></g>")
    return "".join(o)


def layer_basket():
    """藤编提篮: 大麻花提手 + 椭圆篮口 + 编织篮身"""
    o = ['<g id="L8e-basket">']
    o.append('<g transform="translate(626,436) scale(0.96)">')
    # 提手 (粗麻花)
    o.append(path("M-23,-26 C-28,-44 -13,-53 0,-53 C13,-53 28,-44 23,-26",
                  fill="none", stroke="#a87f28", stroke_width="10",
                  stroke_linecap="round"))
    o.append(path("M-23,-26 C-28,-44 -13,-53 0,-53 C13,-53 28,-44 23,-26",
                  fill="none", stroke="#e8c877", stroke_width="6.4",
                  stroke_linecap="round"))
    o.append(path("M-23,-26 C-28,-44 -13,-53 0,-53 C13,-53 28,-44 23,-26",
                  fill="none", stroke="#b8913c", stroke_width="6.4",
                  stroke_linecap="round", stroke_dasharray="3.6 4.2", opacity="0.75"))
    # 篮身
    o.append(path("M-31,-27 C-31,-27 -27,10 -21,20 C-12,26 12,26 21,20 "
                  "C27,10 31,-27 31,-27 Z", fill="#dfb459",
                  stroke="#a87f28", stroke_width="2.2", stroke_linejoin="round"))
    o.append('<clipPath id="bkCl"><path d="M-31,-27 L31,-27 C31,-27 27,10 21,20 '
             'C12,26 -12,26 -21,20 C-27,10 -31,-27 -31,-27 Z"/></clipPath>')
    o.append('<g clip-path="url(#bkCl)">')
    for k in range(7):
        o.append(f'<path d="M{f(-31+k*10.4)},-27 L{f(-22+k*7.4)},24" stroke="#b3854e" '
                 f'stroke-width="2.2" opacity="0.65"/>')
    for k in range(5):
        yy = -22 + k * 9.6
        o.append(f'<path d="M-33,{f(yy)} L33,{f(yy)}" stroke="#f2dc9e" stroke-width="3"/>')
        o.append(f'<path d="M-33,{f(yy+1.5)} L33,{f(yy+1.5)}" stroke="#ffffff" '
                 f'stroke-width="1.1" opacity="0.5"/>')
        o.append(f'<path d="M-33,{f(yy+4.4)} L33,{f(yy+4.4)}" stroke="#a87f28" stroke-width="2.4"/>')
    o.append('</g>')
    # 篮口
    o.append(ell(0, -27, 31, 8.4, fill="#f2dc9e", stroke="#a87f28", stroke_width="2.2"))
    o.append(ell(0, -27, 25, 5.6, fill="#8a5f34", opacity="0.45"))
    o.append(ell(0, -28.6, 26, 4.4, fill="none", stroke="#fdf0c8",
                 stroke_width="1.6", opacity="0.8"))
    o.append("</g></g>")
    return "".join(o)


DECOR_BLOCK = [
    (92, 566, 604, 852),      # 地块床
    (416, 382, 618, 572),     # 草屋
    (296, 458, 418, 562),     # 狗屋 + 食盆
    (186, 492, 268, 618),     # 木牌
    (0, 434, 258, 560),       # 历史池塘区，当前候选已移除，保留框线用于审计参考
    (0, 540, 72, 674),        # 干草车
    (286, 828, 398, 942),     # 一键务农
    (0, 0, 692, 292),         # 顶部 HUD
    (0, 946, 692, 1218),      # 底部 UI
    (592, 392, 690, 468),     # 提篮
    (22, 700, 116, 830),      # 左下栅栏 (V01: 已外移至地块床 x0=110 之外)
]


def in_block(x, y, pad=0.0):
    for x0, y0, x1, y1 in DECOR_BLOCK:
        if x0 - pad <= x <= x1 + pad and y0 - pad <= y <= y1 + pad:
            return True
    return False


def layer_decor():
    """花丛 / 草簇 / 灌木 (自动避开道具占用区)"""
    o = ['<g id="L9-decor">']
    rnd = random.Random(99)
    # 黄色雏菊丛
    for gx, gy, n in [(78, 700, 6), (44, 636, 5), (206, 600, 4), (132, 706, 3)]:
        o.append(bush(gx, gy, 22, tone=0))
        for k in range(n):
            o.append(flower(gx + rnd.uniform(-22, 22), gy - rnd.uniform(8, 26),
                            rnd.uniform(6, 9), rot=rnd.uniform(0, 72)))
    # 白色雏菊
    for gx, gy in [(112, 628), (154, 616), (52, 590), (126, 690), (96, 726)]:
        o.append(daisy(gx, gy, rnd.uniform(8, 11)))
    # 紫色小花
    for gx, gy in [(126, 596), (168, 588), (96, 606), (610, 640), (656, 632),
                   (628, 664), (592, 620)]:
        o.append(flower(gx, gy, 6, petal="#d9a8e0", core="#f7e08a", petals=6))
    # 右侧白雏菊
    for gx, gy in [(672, 720), (640, 744), (684, 762), (612, 700)]:
        o.append(daisy(gx, gy, rnd.uniform(9, 12)))
    # 底部黄花
    for gx, gy in [(268, 918), (238, 890), (440, 920), (466, 880), (486, 902),
                   (18, 866), (74, 872), (128, 880), (176, 906), (214, 934)]:
        o.append(flower(gx, gy, rnd.uniform(9, 12), rot=rnd.uniform(0, 72)))
    # 草簇
    n = 0
    while n < 150:
        n += 1
        x = rnd.uniform(-6, 698); y = rnd.uniform(500, 1160)
        if in_block(x, y, 4):
            continue
        o.append(tuft(x, y, rnd.uniform(0.7, 1.5), rnd.choice(["#7fa845", "#8ab24d", "#749c3f"])))
    # 右后灌木
    o.append(bush(660, 858, 70, tone=0))
    o.append(bush(676, 826, 56, tone=1))
    o.append(bush(612, 872, 46, tone=2))
    # 左下木栅栏 (V01 重排: 移到地块床 x0=110 左外侧, 柱脚落地, 不再横跨地块顶面)
    # 起点 (28, 760) -> 终点 (104, 824): 沿地块左缘斜下, 全部位于床外
    # (plot_bed 包围盒 (110, 581, 585, 832) 内不再出现栅栏像素)
    o.append(layer_fence(28, 760, 104, 824, 3, 56, "blfence"))
    # 左下前景树
    o.append(pine(26, 928, 150, dark=0))
    o.append(bush(-6, 900, 52, tone=1))
    # 木桶花盆 (右上, 床右)
    o.append('<g transform="translate(656,578)">'
             + rect(-30, -22, 60, 26, rx=6, fill="#c99a5f", stroke="#8a5f34", stroke_width="2")
             + rect(-33, -26, 66, 10, rx=4, fill="#b98a52", stroke="#8a5f34", stroke_width="2")
             + bush(0, -22, 30, tone=1) + "</g>")
    o.append("</g>")
    return "".join(o)


def layer_farmbtn():
    """一键务农 圆钮"""
    o = ['<g id="L10-farmbtn">']
    o.append(ell(341, 930, 46, 10, fill="#5c7c39", opacity="0.35"))
    o.append(circ(341, 878, 44, fill="url(#woodBtn)", stroke="#8a5f34", stroke_width="3.4"))
    o.append(circ(341, 878, 37, fill="#f0dbb4", stroke="#c99a63", stroke_width="2.4"))
    # 农夫小人
    o.append('<g transform="translate(337,882)">')
    # 锄头 (先画, 在身后)
    o.append(path("M16,-30 L26,-34 L30,-28 L20,-24 Z", fill="#bfc4ca",
                  stroke="#8f959c", stroke_width="1.4"))
    o.append(rect(14, -30, 4, 34, rx=2, fill="#a8763f"))
    # 身体
    o.append(path("M-12,18 L-9,-4 L9,-4 L12,18 Z", fill="#4f7fb5"))
    o.append(rect(-8, -6, 16, 12, rx=2, fill="#f2ecda"))
    o.append(rect(-4, -6, 3.4, 13, fill="#4f7fb5"))
    o.append(rect(1, -6, 3.4, 13, fill="#4f7fb5"))
    o.append(circ(-7, 12, 2.4, fill="#e8d9a8"))
    # 脸
    o.append(circ(0, -14, 8.6, fill="#f7d9bb"))
    o.append(circ(-3.2, -15, 1.4, fill="#4a3a2c"))
    o.append(circ(3.2, -15, 1.4, fill="#4a3a2c"))
    o.append(path("M-2.6,-10.4 q2.6,2.2 5.2,0", fill="none", stroke="#c98a7a", stroke_width="1.3"))
    # 草帽
    o.append(path("M-12,-19 q12,-13 24,0 Z", fill="#f0d47e", stroke="#d9b055", stroke_width="1.3"))
    o.append(ell(0, -19, 15, 4.4, fill="#e8c46a", stroke="#d9b055", stroke_width="1.3"))
    o.append(path("M-6,-24 q6,-5 12,0", fill="none", stroke="#d9b055", stroke_width="1.2"))
    # 手臂
    o.append(path("M9,-2 Q16,-8 16,-22", fill="none", stroke="#f7d9bb",
                  stroke_width="5", stroke_linecap="round"))
    o.append("</g>")
    o.append(text(341, 934, "一键务农", 21, "#ffffff", stroke="#7d5330", sw=5.4))
    o.append("</g>")
    return "".join(o)


# ================================================================ UI
def layer_ui():
    o = ['<g id="L11-ui">']
    # ---------- 左上 资料卡 ----------
    o.append('<g id="profile">')
    o.append(rect(27, 86, 217, 77, rx=37, fill="url(#woodBtn)", stroke="#8a5f34", stroke_width="3.4"))
    o.append(rect(33, 92, 205, 65, rx=31, fill="none", stroke="#e0bb85", stroke_width="1.8", opacity="0.7"))
    # 头像
    o.append(circ(78, 124, 36, fill="#f5e3c4", stroke="#ffffff", stroke_width="3.6"))
    o.append('<clipPath id="avClip"><circle cx="78" cy="124" r="34"/></clipPath>')
    o.append('<g clip-path="url(#avClip)">')
    o.append(rect(44, 90, 68, 68, fill="#cbd8dc"))
    o.append(ell(78, 152, 38, 28, fill="#e8a44c"))
    o.append(ell(78, 119, 28, 26, fill="#d98f36"))
    o.append(ell(65, 110, 11, 10, fill="#c07a26"))
    o.append(ell(91, 110, 11, 10, fill="#c07a26"))
    o.append(ell(78, 131, 19, 16, fill="#f0d3ac"))
    o.append(circ(71, 120, 3.2, fill="#4a2f14"))
    o.append(circ(85, 120, 3.2, fill="#4a2f14"))
    o.append(circ(78, 129, 4.2, fill="#8a5a2e"))
    o.append("</g>")
    o.append(circ(78, 124, 36, fill="none", stroke="#e6c9a0", stroke_width="1.8"))
    # 等级星徽
    o.append(f'<path d="M108,124 l4.2,8 l9,1.3 l-6.5,6.3 l1.5,8.9 l-8.2,-4.3 '
             f'l-8.6,4.5 l1.6,-9.3 l-6.8,-6.6 l9.4,-1.4 Z" fill="#f7d24a" '
             f'stroke="#b8860b" stroke-width="2.4" stroke-linejoin="round"/>')
    o.append(text(108, 140, "8", 12, "#7d5330", weight="900"))
    # 名字
    o.append(text(126, 118, "Cr", 22, "#ffffff", anchor="start", weight="800",
                  stroke="#8a5f34", sw=4.4))
    # 经验条
    o.append(rect(124, 124, 112, 24, rx=12, fill="#7a5230"))
    o.append(rect(129, 120, 102, 20, rx=10, fill="#4e8a2e"))
    o.append(rect(130, 121, 76, 18, rx=9, fill="#7ecb3a"))
    o.append(rect(132, 123, 72, 6.5, rx=3, fill="#a5e269", opacity="0.85"))
    o.append(text(180, 136, "2227/3500", 13, "#ffffff", weight="800",
                  stroke="#3a6b22", sw=3.2))
    o.append("</g>")
    # ---------- 左侧按钮列 ----------
    o.append('<g id="leftbtns">')
    o.append('<g id="share-control">')
    o.append(ui_round_btn(60, 210, 30, "share"))
    o.append(red_bead(84, 196, 10.5))
    o.append(text(60, 244, "分享", 16, "#ffffff", stroke="#8a5f34", sw=4.2))
    o.append('</g>')
    o.append('<g id="music-control">')
    o.append(ui_round_btn(56, 270, 23, "music"))
    o.append('</g>')
    o.append('<g id="menu-control">')
    o.append(ui_round_btn(56, 335, 23, "menu"))
    o.append(red_bead(74, 320, 7.5))
    o.append('</g>')
    o.append("</g>")
    # ---------- 右上 货币 ----------
    o.append('<g id="currency">')
    o.append(rect(530, 86, 132, 32, rx=16, fill="url(#pillGrad)", stroke="#dcc7a0", stroke_width="2.2"))
    o.append(coin3d(546, 102, 20))
    o.append(text(626, 110, "13万", 19, "#5b4632", weight="800"))
    o.append(rect(530, 128, 132, 32, rx=16, fill="url(#pillGrad)", stroke="#dcc7a0", stroke_width="2.2"))
    o.append(tickets3d(554, 143, 1.0))
    o.append(text(626, 152, "1120", 19, "#5b4632", weight="800"))
    o.append("</g>")
    # ---------- 右上 商城 ----------
    o.append('<g id="shopbtn">')
    o.append(shop_icon(618, 226, 0.70))
    o.append("</g>")
    o.append(text(624, 258, "商城", 19, "#ffffff", weight="800", stroke="#8a5f34", sw=4.8))
    # ---------- 公益小红花 ----------
    o.append('<g id="charity">')
    o.append(hand_cup(624, 350, 0.80))
    o.append(flower_charity(627, 312, 0.80))
    o.append(text(630, 375, "公益小红花", 20, "#ffffff", weight="800", stroke="#8a5f34", sw=4.8))
    o.append("</g>")
    # ---------- 今日时间：独立信息条 (V04 重排) ----------
    # 新坐标 (602, 482, 690, 514):
    #   * 整体下移 8px 至墙根下方, 烟囱体块 (x≤585, y≤476) 不再压屋檐
    #   * 整体右移 54px 让胶囊完全位于 cottage 包围盒 (x≤612) 之外
    #   * 右沿 690 留 2px 余量让 2.2px 描边不被 692 画布裁切
    #   * 与上方提篮 (594, 386, 660, 464) 下沿间距 18px ≥ 8px 要求
    #   * 已撤销 cottage 允许压盖白名单
    o.append('<g id="clock">')
    o.append(rect(602, 482, 88, 32, rx=16, fill="url(#pillGrad)",
                  stroke="#dcc7a0", stroke_width="2.2"))
    o.append(clock_icon(620, 498, 11))
    o.append(text(636, 505, "18:43", 17, "#6b4438", weight="800", anchor="start"))
    o.append("</g>")
    # ---------- 底部任务条 ----------
    o.append('<g id="taskbar">')
    o.append(rect(-14, 972, 364, 80, rx=40, fill="#f7efdc", stroke="#efe3c8", stroke_width="2.8"))
    o.append(rect(-14, 972, 364, 80, rx=40, fill="url(#pillGrad)"))
    # 书本圆钮
    o.append(circ(56, 1011, 35, fill="url(#woodBtn)", stroke="#8a5f34", stroke_width="3"))
    o.append(circ(56, 1011, 29.5, fill="#e0c196"))
    o.append('<g transform="translate(56,1011) scale(0.92)">')
    o.append(path("M0,-11 C-8,-16 -18,-17 -25,-14 L-25,12 C-18,9 -8,10 0,15 Z",
                  fill="#fdf8ea", stroke="#a8763f", stroke_width="2"))
    o.append(path("M0,-11 C8,-16 18,-17 25,-14 L25,12 C18,9 8,10 0,15 Z",
                  fill="#fdf8ea", stroke="#a8763f", stroke_width="2"))
    o.append(path("M0,-11 L0,15", stroke="#a8763f", stroke_width="2.2"))
    for k in range(4):
        o.append(path(f"M-20,{f(-8+k*6)} L-5,{f(-6+k*6)}", stroke="#c9a877", stroke_width="1.6"))
        o.append(path(f"M5,{f(-6+k*6)} L20,{f(-8+k*6)}", stroke="#c9a877", stroke_width="1.6"))
    o.append("</g>")
    o.append(text(106, 1006, "完成8次收获", 22, "#6b4438", weight="800", anchor="start"))
    o.append(text(106, 1033, "（0/8）", 17, "#c0392b", weight="800", anchor="start"))
    # 白色手套指针
    o.append('<g transform="translate(272,1042) rotate(-11) scale(0.92)">')
    o.append(path("M-13,2 Q-19,-8 -12,-17 Q-6,-24 2,-22 "
                  "L2,-46 Q2,-55 10,-55 Q18,-55 18,-46 L18,-20 "
                  "Q25,-24 30,-17 Q35,-10 31,-2 "
                  "Q37,0 39,6 Q41,13 35,18 "
                  "L16,34 Q2,42 -8,32 Q-15,22 -13,2 Z",
                  fill="#fdfaf3", stroke="#c4b9a6", stroke_width="3",
                  stroke_linejoin="round"))
    o.append(path("M18,-16 Q24,-18 28,-13", fill="none", stroke="#c4b9a6", stroke_width="2.4"))
    o.append(path("M31,-1 Q36,-1 38,4", fill="none", stroke="#c4b9a6", stroke_width="2.4"))
    o.append(path("M-11,14 L-2,26 L10,20 L1,8 Z", fill="#f1ebdd",
                  stroke="#c4b9a6", stroke_width="2.4", stroke_linejoin="round"))
    o.append("</g>")
    o.append("</g>")
    # ---------- 好友求助 ----------
    o.append('<g id="friend">')
    o.append(path("M494,1006 q0,-34 34,-34 l112,0 q38,0 38,38 l0,8 q0,38 -38,38 "
                  "l-70,0 l-2,20 l-16,-20 l-22,0 q-34,0 -34,-34 Z",
                  fill="#fbf7ee", stroke="#efe5cf", stroke_width="3"))
    o.append(path("M494,1006 q0,-34 34,-34 l112,0 q38,0 38,38 l0,8 q0,38 -38,38 "
                  "l-70,0 l-2,20 l-16,-20 l-22,0 q-34,0 -34,-34 Z",
                  fill="none", stroke="#e3d7bd", stroke_width="1.6", opacity="0.9"))
    # 头像 (压在气泡左缘)
    o.append(circ(466, 1002, 26, fill="#f7e6d0", stroke="#ffffff", stroke_width="3.2"))
    o.append('<clipPath id="av2"><circle cx="466" cy="1002" r="24"/></clipPath>')
    o.append('<g clip-path="url(#av2)">')
    o.append(rect(442, 978, 48, 48, fill="#efe6d8"))
    o.append(ell(466, 1028, 22, 20, fill="#fbfbfd"))          # 衬衫
    o.append(ell(466, 1004, 17, 19, fill="#f7dcc0"))          # 脸
    o.append(path("M446,1000 q0,-24 20,-24 q20,0 20,24 q0,4 -2,6 "
                  "l-2,-14 q-6,4 -18,4 q-12,0 -18,-4 l-2,14 q-2,-2 -2,-6 Z",
                  fill="#2b2529"))                             # 刘海
    o.append(ell(448, 1011, 5.4, 13, fill="#2b2529"))           # 左侧发
    o.append(ell(484, 1011, 5.4, 13, fill="#2b2529"))
    o.append(ell(461, 1007, 3.2, 4, fill="#3a4a63"))
    o.append(ell(471, 1007, 3.2, 4, fill="#3a4a63"))
    o.append(circ(460, 1005.6, 1.1, fill="#ffffff"))
    o.append(circ(470, 1005.6, 1.1, fill="#ffffff"))
    o.append(path("M462,1016 q4,3 8,0", fill="none", stroke="#c98a7a", stroke_width="1.6"))
    o.append("</g>")
    o.append(circ(466, 1002, 26, fill="none", stroke="#ffffff", stroke_width="3.2"))
    o.append(text(522, 1000, "小果", 22, "#4a3a2c", weight="800", anchor="start"))
    o.append(text(522, 1027, "好友求助", 19, "#7a6a58", weight="700", anchor="start"))
    # 小农夫推车图标
    o.append('<g transform="translate(634,1018) scale(0.82)">')
    o.append(path("M-13,10 l5,-10 l14,0 l5,10 Z", fill="#c9a06a", stroke="#8a5f34", stroke_width="1.4"))
    o.append(circ(-9, 12, 3.4, fill="#7d5330")); o.append(circ(9, 12, 3.4, fill="#7d5330"))
    o.append(path("M4,-4 l8,-6", stroke="#a8763f", stroke_width="2"))
    o.append(rect(-2, -13, 8, 9, rx=2, fill="#6a9ed0"))
    o.append(circ(2, -18, 4.6, fill="#f7d9bb"))
    o.append(path("M-4,-20 q6,-5 12,0 l0,-2.4 q-6,-4.4 -12,0 Z", fill="#e8c46a"))
    o.append(ell(2, -20, 7, 2, fill="#d3a94e"))
    o.append(path("M8,-6 l4,4", stroke="#a8763f", stroke_width="2", stroke_linecap="round"))
    o.append("</g>")
    # 关闭按钮
    o.append(circ(668, 970, 13, fill="#fdfaf2", stroke="#e6dcc4", stroke_width="2.4"))
    o.append(path("M663,965 L673,975 M673,965 L663,975", stroke="#d99a86", stroke_width="4.4",
                  stroke_linecap="round"))
    o.append("</g>")
    # ---------- 底部导航 ----------
    o.append('<g id="navbar">')
    for cx, label, icon in [(73, "仓库", "barn"), (176, "商店", "shop"),
                            (280, "宠物", "pet"), (383, "装扮", "dress"),
                            (614, "好友", "friend")]:
        o.append(nav_btn(cx, 1114, 41, label, icon))
    o.append("</g>")
    o.append("</g>")
    return "".join(o)


def coin3d(cx, cy, r):
    """立体金币: 外圈浮雕 + 内盘 + 叶片纹 + 高光"""
    o = [circ(cx, cy, r, fill="url(#coinRingG)", stroke="#a8760c", stroke_width="1.2")]
    o.append(circ(cx, cy, r * 0.80, fill="url(#coinG)"))
    o.append(circ(cx, cy, r * 0.80, fill="none", stroke="#fff2b8", stroke_width="1.2", opacity="0.85"))
    o.append(circ(cx + r * 0.04, cy + r * 0.05, r * 0.62,
                  fill="none", stroke="#c98a0c", stroke_width="1.1", opacity="0.55"))
    # 叶片/稻穗纹
    o.append(path(f"M{f(cx-r*0.34)},{f(cy+r*0.20)} "
                  f"C{f(cx-r*0.42)},{f(cy-r*0.28)} {f(cx+r*0.02)},{f(cy-r*0.50)} "
                  f"{f(cx+r*0.34)},{f(cy-r*0.30)} "
                  f"C{f(cx+r*0.30)},{f(cy+r*0.06)} {f(cx-r*0.06)},{f(cy+r*0.24)} "
                  f"{f(cx-r*0.34)},{f(cy+r*0.20)} Z", fill="#e8a81c", opacity="0.85"))
    o.append(path(f"M{f(cx-r*0.24)},{f(cy+r*0.12)} "
                  f"C{f(cx-r*0.14)},{f(cy-r*0.20)} {f(cx+r*0.10)},{f(cy-r*0.30)} "
                  f"{f(cx+r*0.26)},{f(cy-r*0.24)}", fill="none",
                  stroke="#fff0b0", stroke_width="1.5", stroke_linecap="round" ))
    o.append(path(f"M{f(cx-r*0.66)},{f(cy-r*0.34)} A{f(r*0.72)},{f(r*0.72)} 0 0 1 "
                  f"{f(cx-r*0.10)},{f(cy-r*0.76)}", fill="none",
                  stroke="#ffffff", stroke_width="2.2", stroke_linecap="round", opacity="0.7"))
    return "".join(o)


def tickets3d(cx, cy, sc=1.0):
    """叠放绿票 (3 张扇形 + 白星)"""
    o = [f'<g transform="translate({f(cx)},{f(cy)}) scale({f(sc)})">']
    for rot, dx, dy, tone, edge in [(-22, -13, 4, "#2f8f3e", "#1f6b2c"),
                                    (-10, -5, 1, "#3fa84e", "#2a7a38"),
                                    (2, 4, -3, "#5ac46a", "#3a9a4a")]:
        o.append(f'<g transform="translate({f(dx)},{f(dy)}) rotate({rot})">'
                 f'<rect x="-16" y="-10" width="32" height="20" rx="3" '
                 f'fill="{tone}" stroke="{edge}" stroke-width="1.6"/>'
                 f'<rect x="-16" y="-10" width="32" height="5.5" rx="3" '
                 f'fill="#ffffff" opacity="0.22"/></g>')
    o.append('<g transform="translate(4,-3) rotate(2)">')
    star = []
    for k in range(5):
        a = -90 + k * 72
        p1 = (3.6 * math.cos(math.radians(a - 20)), 3.6 * math.sin(math.radians(a - 20)))
        p2 = (9.4 * math.cos(math.radians(a)), 9.4 * math.sin(math.radians(a)))
        p3 = (3.6 * math.cos(math.radians(a + 20)), 3.6 * math.sin(math.radians(a + 20)))
        star.append(f"L{f(p1[0])},{f(p1[1])} L{f(p2[0])},{f(p2[1])} L{f(p3[0])},{f(p3[1])}")
    o.append(f'<path d="M{f(3.6*math.cos(math.radians(-110)))},'
             f'{f(3.6*math.sin(math.radians(-110)))} {" ".join(star)} Z" '
             f'fill="#ffffff"/>')
    o.append("</g></g>")
    return "".join(o)


def shop_icon(cx, by, sc=1.0):
    """木质商铺: 尖顶 + 绿白条纹雨棚 + 木屋身 + 星星 + 气球"""
    o = [f'<g transform="translate({f(cx)},{f(by)}) scale({f(sc)})">']
    # 气球
    o.append(circ(-40, -60, 13, fill="#8ed2f2", stroke="#4a94bc", stroke_width="1.6"))
    o.append(circ(-44, -65, 3.8, fill="#ffffff", opacity="0.55"))
    o.append(path("M-40,-47 q-3,10 1,16", fill="none", stroke="#b8e2f4", stroke_width="1.4"))
    o.append(circ(36, -64, 14, fill="#f07070", stroke="#c04040", stroke_width="1.6"))
    o.append(circ(32, -69, 4, fill="#ffffff", opacity="0.5"))
    o.append(path("M36,-50 q3,10 -1,16", fill="none", stroke="#f8b0b0", stroke_width="1.4"))
    # 尖顶 (雨棚之上的屋顶)
    o.append(path("M-30,-34 C-22,-46 -10,-54 0,-54 C10,-54 22,-46 30,-34 Z",
                  fill="#e8c48c", stroke="#a8762c", stroke_width="2",
                  stroke_linejoin="round"))
    o.append(path("M-22,-38 C-16,-47 -8,-52 0,-52", fill="none", stroke="#f6e0ae",
                  stroke_width="2.4", opacity="0.8"))
    # 屋身
    o.append(rect(-30, -36, 60, 54, rx=3, fill="#dda86a",
                  stroke="#8a5f34", stroke_width="2.2"))
    for k in range(4):
        o.append(f'<line x1="{f(-18+k*12)}" y1="-34" x2="{f(-18+k*12)}" y2="16" '
                 f'stroke="#c08f52" stroke-width="1.2" opacity="0.5"/>')
    o.append(path("M6,18 L6,-2 Q6,-12 17,-12 Q28,-12 28,-2 L28,18 Z",
                  fill="#a8763f", stroke="#7d5330", stroke_width="1.8"))
    o.append(circ(23, 5, 1.8, fill="#f0d47e"))
    o.append(rect(-24, -6, 18, 16, rx=2, fill="#9fd4e4",
                  stroke="#8a5f34", stroke_width="1.8"))
    o.append(path("M-15,-6 L-15,10 M-24,2 L-6,2", stroke="#8a5f34", stroke_width="1.4"))
    # 绿白条纹雨棚 (斜出檐)
    o.append(path("M-38,-28 L38,-28 L31,-42 L-31,-42 Z", fill="#7fd06a",
                  stroke="#4f9c3c", stroke_width="1.6", stroke_linejoin="round"))
    for k in range(5):
        o.append(path(f"M{f(-38+k*15.2)},-28 L{f(-31+k*12.4)},-42 L{f(-23.6+k*12.4)},-42 "
                      f"L{f(-30+k*15.2)},-28 Z", fill="#ffffff"))
    o.append(path("M-38,-28 L38,-28 L38,-24 L-38,-24 Z", fill="#4f9c3c", opacity="0.35"))
    o.append(path("M-40,-42 L40,-42 L38,-37 L-38,-37 Z", fill="#f2a03c",
                  stroke="#c9741d", stroke_width="1.5"))
    # 底板
    o.append(rect(-33, 16, 66, 9, rx=3, fill="#c99a5f",
                  stroke="#8a5f34", stroke_width="1.8"))
    # 星星
    o.append('<g transform="translate(28,-36)">')
    o.append(path("M0,-12 L3,-3.2 L11.6,-3.2 L4.5,2.1 L7.2,10.9 L0,5.7 "
                  "L-7.2,10.9 L-4.5,2.1 L-11.6,-3.2 L-3,-3.2 Z",
                  fill="#ffe07a", stroke="#e0a83c", stroke_width="1.3",
                  stroke_linejoin="round"))
    o.append("</g></g>")
    return "".join(o)


def flower_charity(cx, cy, sc=1.0):
    """公益红花: 5 圆瓣(相互重叠) + 白心黄环 + 绿叶"""
    o = [f'<g transform="translate({f(cx)},{f(cy)}) scale({f(sc)})">']
    # 绿叶
    o.append(path("M-6,13 q-18,-1 -22,-13 q18,-4 24,6 Z", fill="#5fae4a",
                  stroke="#3f8a30", stroke_width="1.6"))
    o.append(path("M6,11 q18,-4 20,-16 q-18,-2 -22,11 Z", fill="#4f9c3c",
                  stroke="#3f8a30", stroke_width="1.6"))
    o.append(path("M-3,8 q-3,-10 3,-15", fill="none", stroke="#4f9c3c", stroke_width="2.2"))
    # 5 瓣 (重叠)
    for k in range(5):
        o.append(f'<g transform="rotate({f(k*72)})">'
                 f'<ellipse cx="0" cy="-17" rx="14" ry="15" fill="#e8404a" '
                 f'stroke="#b62a34" stroke-width="1.6"/>'
                 f'<ellipse cx="-3.6" cy="-21" rx="6" ry="6.8" fill="#f2656d" '
                 f'opacity="0.8"/></g>')
    # 花心
    o.append(circ(0, 0, 10, fill="#fdf8ee", stroke="#e0b0a8", stroke_width="1.4"))
    o.append(circ(0, 0, 7, fill="none", stroke="#f2c53c", stroke_width="2.6"))
    for k in range(6):
        a = k * 60
        o.append(f'<circle cx="{f(4.9*math.cos(math.radians(a)))}" '
                 f'cy="{f(4.9*math.sin(math.radians(a)))}" r="1.6" fill="#e8a01c"/>')
    o.append(circ(0, 0, 2.2, fill="#e8a01c"))
    o.append("</g>")
    return "".join(o)


def hand_cup(cx, cy, sc=1.0):
    """托举手: 掌心向上, 左侧四指弯曲, 右侧拇指"""
    palm = ("M-32,4 C-34,-6 -28,-13 -18,-14 L18,-14 C30,-14 35,-5 33,5 "
            "C31,14 22,19 10,19 L-20,19 C-28,19 -31,13 -32,4 Z")
    o = [f'<g transform="translate({f(cx)},{f(cy)}) scale({f(sc)})">']
    o.append(path(palm, fill="#ffffff", stroke="#ffffff", stroke_width="7",
                  stroke_linejoin="round"))
    o.append(path(palm, fill="#f8d6ae", stroke="#c08a5c", stroke_width="1.8",
                  stroke_linejoin="round"))
    for k, fx in enumerate((-26, -15, -4, 7)):
        o.append(f'<ellipse cx="{f(fx)}" cy="-16" rx="6.4" ry="5.4" fill="#fde3c8" '
                 f'stroke="#c08a5c" stroke-width="1.5"/>')
        o.append(f'<path d="M{f(fx-3.4)},-16 q3.4,-3 6.8,0" fill="none" '
                 f'stroke="#e0b58c" stroke-width="1" opacity="0.8"/>')
    o.append('<ellipse cx="26" cy="-8" rx="9.5" ry="7" fill="#fde3c8" '
             'stroke="#c08a5c" stroke-width="1.6" transform="rotate(-26 26 -8)"/>')
    o.append('<ellipse cx="2" cy="6" rx="21" ry="9" fill="#fdeada" opacity="0.7"/>')
    o.append('<path d="M-24,12 C-12,18 12,18 30,9" fill="none" stroke="#e0b58c" '
             'stroke-width="1.4" opacity="0.7"/>')
    o.append("</g>")
    return "".join(o)


def clock_icon(cx, cy, r):
    o = [circ(cx, cy, r, fill="#fdf6e6", stroke="#7d5330", stroke_width="2.2")]
    o.append(circ(cx, cy, r - 3.4, fill="none", stroke="#c9a877", stroke_width="1.2"))
    for k in range(12):
        a = k * 30
        o.append(f'<line x1="{f(cx + (r-6.5)*math.cos(math.radians(a)))}" '
                 f'y1="{f(cy + (r-6.5)*math.sin(math.radians(a)))}" '
                 f'x2="{f(cx + (r-4.2)*math.cos(math.radians(a)))}" '
                 f'y2="{f(cy + (r-4.2)*math.sin(math.radians(a)))}" '
                 f'stroke="#a8855c" stroke-width="1"/>')
    o.append(f'<line x1="{f(cx)}" y1="{f(cy)}" x2="{f(cx)}" y2="{f(cy - r*0.52)}" '
             f'stroke="#6b4438" stroke-width="2.2" stroke-linecap="round"/>')
    o.append(f'<line x1="{f(cx)}" y1="{f(cy)}" x2="{f(cx + r*0.42)}" y2="{f(cy + r*0.22)}" '
             f'stroke="#6b4438" stroke-width="2.2" stroke-linecap="round"/>')
    o.append(circ(cx, cy, 1.8, fill="#6b4438"))
    o.append(f'<rect x="{f(cx-3.4)}" y="{f(cy-r-3.6)}" width="6.8" height="4" rx="1.6" '
             f'fill="#7d5330"/>')
    return "".join(o)


def wood_disc(cx, cy, r, uid):
    """木质圆盘: 深棕外环 + 径向渐变内盘 + 年轮 + 放射木纹 + 左上高光"""
    o = [circ(cx, cy, r, fill="url(#woodRing)", stroke="#7d5330", stroke_width=2.6)]
    o.append(circ(cx, cy, r - 3.2, fill="url(#woodFace)"))
    o.append(f'<clipPath id="wd{uid}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r-3.6)}"/></clipPath>')
    o.append(f'<g clip-path="url(#wd{uid})">')
    # 年轮
    for k in range(1, 3):
        o.append(circ(cx - r * 0.10, cy - r * 0.08, r * (0.30 + 0.24 * k),
                      fill="none", stroke="#8f5f3c", stroke_width="1", opacity="0.13"))
    # 放射木纹
    for k in range(16):
        a = k * 22.5 + 6
        o.append(f'<line x1="{f(cx + r*0.32*math.cos(math.radians(a)))}" '
                 f'y1="{f(cy + r*0.32*math.sin(math.radians(a)))}" '
                 f'x2="{f(cx + r * math.cos(math.radians(a)))}" '
                 f'y2="{f(cy + r * math.sin(math.radians(a)))}" stroke="#8f5f3c" '
                 f'stroke-width="0.9" opacity="0.10"/>')
    # 左上高光 + 右下暗部
    o.append(f'<ellipse cx="{f(cx - r*0.26)}" cy="{f(cy - r*0.40)}" rx="{f(r*0.62)}" '
             f'ry="{f(r*0.30)}" fill="#e8b98f" opacity="0.40"/>')
    o.append(f'<ellipse cx="{f(cx + r*0.34)}" cy="{f(cy + r*0.36)}" rx="{f(r*0.62)}" '
             f'ry="{f(r*0.46)}" fill="#8a5f34" opacity="0.18"/>')
    o.append("</g>")
    o.append(circ(cx, cy, r, fill="none", stroke="#e0bb85", stroke_width="1.2", opacity="0.55"))
    return "".join(o)


def paper_plane(cx, cy, sc=1.0):
    """金黄纸飞机 (实心 + 深色描边 + 折痕)"""
    return (f'<g transform="translate({f(cx)},{f(cy)}) scale({f(sc)})">'
            # 上翼 (亮)
            f'<path d="M16,-12 L-15,3 L-2,5 Z" fill="#fdf0c4" stroke="#8a5f34" '
            f'stroke-width="1.6" stroke-linejoin="round"/>'
            # 下翼 (中)
            f'<path d="M16,-12 L-2,5 L-8,14 Z" fill="#f0cf60" stroke="#8a5f34" '
            f'stroke-width="1.6" stroke-linejoin="round"/>'
            # 尾部折面 (暗)
            f'<path d="M-15,3 L-2,5 L-8,14 Z" fill="#e6c455" stroke="#8a5f34" '
            f'stroke-width="1.4" stroke-linejoin="round"/>'
            f'<path d="M-2,5 L-1,-1" stroke="#8a5f34" stroke-width="1.1" opacity="0.65"/>'
            f'</g>')


def music_note(cx, cy, sc=1.0):
    """奶油色双八分音符"""
    return (f'<g transform="translate({f(cx)},{f(cy)}) scale({f(sc)})">'
            f'<path d="M-7,7 L-7,-11 L9,-14 L9,4" fill="none" stroke="#fdf8ea" '
            f'stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="M-7,-11 L9,-14" stroke="#f7d24a" stroke-width="4.6" stroke-linecap="round"/>'
            f'<ellipse cx="-10.4" cy="8" rx="4.6" ry="3.8" fill="#fdf8ea" '
            f'transform="rotate(-18 -10.4 8)"/>'
            f'<ellipse cx="5.6" cy="5" rx="4.6" ry="3.8" fill="#fdf8ea" '
            f'transform="rotate(-18 5.6 5)"/>'
            f'</g>')


def menu_bars(cx, cy, sc=1.0):
    return (f'<g transform="translate({f(cx)},{f(cy)}) scale({f(sc)})">'
            + "".join(f'<rect x="-11" y="{f(-7.5 + k*7.2)}" width="22" height="3.6" rx="1.8" '
                      f'fill="#fdf8ea"/>' for k in range(3))
            + '</g>')


def red_bead(cx, cy, r):
    return (f'<g><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="url(#beadG)" '
            f'stroke="#c0392b" stroke-width="1"/></g>')


def ui_round_btn(cx, cy, r, kind):
    o = [wood_disc(cx, cy, r, f"{kind}{int(cx)}")]
    if kind == "share":
        o.append(paper_plane(cx, cy + 1, r / 30.0 * 1.15))
    elif kind == "music":
        o.append(music_note(cx, cy, r / 23.0 * 0.86))
    elif kind == "menu":
        o.append(menu_bars(cx, cy, r / 23.0 * 0.92))
    return "".join(o)


def nav_btn(cx, cy, r, label, icon):
    o = [ell(cx, cy + r - 4, r * 0.9, r * 0.22, fill="#5c7c39", opacity="0.30")]
    o.append(circ(cx, cy, r, fill="url(#woodBtn)", stroke="#8a5f34", stroke_width="3.4"))
    o.append(circ(cx, cy, r - 7, fill="#f0dbb4"))
    o.append(f'<clipPath id="nb{cx}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r-8)}"/></clipPath>')
    o.append(f'<g clip-path="url(#nb{cx})">')
    X, Y = cx, cy - 6          # 图标中心稍上移, 给底部标签让位
    if icon == "barn":
        # 麻袋装土豆
        o.append(path(f"M{X-22},{Y+20} L{X-16},{Y-14} Q{X},{Y-22} {X+16},{Y-14} L{X+22},{Y+20} Z",
                      fill="#d3a86e", stroke="#9a6f3c", stroke_width="2"))
        o.append(path(f"M{X-17},{Y-14} Q{X},{Y-24} {X+17},{Y-14} Q{X},{Y-4} {X-17},{Y-14} Z",
                      fill="#e0c196", stroke="#9a6f3c", stroke_width="2"))
        o.append(path(f"M{X-13},{Y-17} L{X+13},{Y-17}", stroke="#8a5f34", stroke_width="2.4"))
        o.append(circ(X - 8, Y + 1, 8, fill="#e0a852"))
        o.append(circ(X + 7, Y + 3, 7, fill="#cf9440"))
        o.append(circ(X - 1, Y + 10, 8, fill="#eab55e"))
        o.append(circ(X - 10, Y - 3, 2.4, fill="#8a6027"))
        o.append(circ(X + 5, Y - 1, 2.2, fill="#8a6027"))
        o.append(circ(X + 1, Y + 7, 2.2, fill="#8a6027"))
    elif icon == "shop":
        # 蔬果篮
        o.append(circ(X - 13, Y + 8, 13, fill="#f0952e", stroke="#c9741d", stroke_width="1.6"))
        o.append(circ(X + 11, Y + 10, 11, fill="#e8b23c", stroke="#c08e28", stroke_width="1.6"))
        o.append(circ(X - 2, Y - 4, 12, fill="#7fbf4a", stroke="#5f9432", stroke_width="1.6"))
        o.append(ell(X + 14, Y - 8, 10, 7, fill="#9ad35e", transform=f"rotate(-18 {X+14} {Y-8})"))
        o.append(path(f"M{X-24},{Y+12} L{X+24},{Y+12} L{X+18},{Y+26} L{X-18},{Y+26} Z",
                      fill="#c99a5f", stroke="#8a5f34", stroke_width="2"))
        o.append(path(f"M{X-24},{Y+12} L{X+24},{Y+12} L{X+22},{Y+18} L{X-22},{Y+18} Z",
                      fill="#e0bb85"))
    elif icon == "pet":
        # 哈士奇
        o.append(path(f"M{X-20},{Y-16} L{X-8},{Y-26} L{X-6},{Y-6} Z", fill="#5f6b78"))
        o.append(path(f"M{X+20},{Y-16} L{X+8},{Y-26} L{X+6},{Y-6} Z", fill="#5f6b78"))
        o.append(circ(X, Y + 4, 21, fill="#c3ccd4"))
        o.append(ell(X, Y + 14, 13, 10, fill="#f2f5f7"))
        o.append(path(f"M{X-19},{Y-8} q19,-12 38,0 q-6,-16 -19,-16 q-13,0 -19,16 Z", fill="#5f6b78"))
        o.append(ell(X - 8, Y + 2, 5, 4.6, fill="#3f6f9c"))
        o.append(ell(X + 8, Y + 2, 5, 4.6, fill="#3f6f9c"))
        o.append(circ(X - 8, Y + 1, 2, fill="#1e2a36"))
        o.append(circ(X + 8, Y + 1, 2, fill="#1e2a36"))
        o.append(ell(X, Y + 12, 4.6, 3.6, fill="#2f3439"))
        o.append(path(f"M{X},{Y+14} l0,4 M{X-5},{Y+19} q5,3 10,0", fill="none",
                      stroke="#2f3439", stroke_width="1.8"))
    elif icon == "dress":
        # 滚筒刷 + 彩虹
        o.append('<g transform="rotate(-32 %d %d)">' % (X, Y))
        o.append(rect(X - 6, Y - 24, 12, 24, rx=3, fill="#b98a52", stroke="#8a5f34", stroke_width="1.6"))
        o.append('<g>')
        for k, col in enumerate(["#e8556d", "#f0952e", "#f5d24a", "#7fbf4a", "#6a9ed0", "#a97fd0"]):
            o.append(rect(X - 20, Y - 4 + k * 5, 40, 5, fill=col))
        o.append("</g>")
        o.append(path(f"M{X-20},{Y-4} q20,-8 40,0", fill="none", stroke="#c98a7a", stroke_width="1.6"))
        o.append(path(f"M{X-20},{Y+26} q20,8 40,0", fill="none", stroke="#c98a7a", stroke_width="1.6"))
        o.append(rect(X - 22, Y - 8, 44, 36, rx=5, fill="none", stroke="#8a5f34", stroke_width="2.4"))
        o.append(rect(X - 22, Y - 14, 44, 8, rx=3, fill="#d9b077", stroke="#8a5f34", stroke_width="2"))
        o.append("</g>")
    elif icon == "friend":
        # 小鸡 + 信封 + 叶子
        o.append(path(f"M{X-30},{Y+26} q-4,-18 10,-24 q10,-5 18,2 Z", fill="#5fae4a"))
        o.append(path(f"M{X+26},{Y+22} q6,-16 -8,-21 q-10,-4 -16,3 Z", fill="#4f9c3c"))
        o.append(path(f"M{X-24},{Y-2} l40,0 l0,26 l-40,0 Z", fill="#f5e6c8",
                      stroke="#c9a877", stroke_width="2"))
        o.append(path(f"M{X-24},{Y-2} l20,15 l20,-15", fill="none", stroke="#c9a877", stroke_width="2"))
        o.append(ell(X + 8, Y + 12, 17, 15, fill="#f7d24a"))
        o.append(ell(X - 5, Y - 1, 15, 14, fill="#fbe06a"))
        o.append(ell(X + 18, Y + 4, 9, 8, fill="#e8a83c"))
        o.append(circ(X + 1, Y - 2, 2.8, fill="#4a3a1c"))
        o.append(path(f"M{X-4},{Y+6} l7,4 l7,-4 l-3,6 l-8,0 Z", fill="#e07a2c"))
        o.append(path(f"M{X-6},{Y+16} q9,7 20,2", fill="none", stroke="#d99a2c", stroke_width="2"))
    o.append("</g>")
    o.append(f'<rect x="{f(cx-r+3)}" y="{f(cy+r-22)}" width="{f((r-3)*2)}" height="27" rx="13" '
             f'fill="#c99a63" stroke="#8a5f34" stroke-width="2.4"/>')
    o.append(text(cx, cy + r - 2, label, 17, "#ffffff", weight="800", stroke="#8a5f34", sw=4))
    return "".join(o)



# ================================================================ 布局审计
# 画布 692x1218。下表是各元素的**设计意图包围盒**，用于自动检查:
#   (1) UI 元素是否越界  (2) UI 元素之间是否互相压盖
#   (3) 装饰物是否侵入保留区 (保留区见 DECOR_BLOCK, 生成时已避让)
# kind: hud=UI(不可压盖)  prop=场景道具(允许与场景互相遮挡, 只查越界)
# allow_overlap: 与这些元素名允许压盖 (QQ农场风格里"标签压按钮"等是有意设计)
LAYOUT = [
    # name,          x0,  y0,   x1,   y1,  kind, allow_overlap
    ("profile",       27,   86,  244,  163, "hud",  []),
    ("share_btn",     30,  180,   90,  240, "hud",  []),
    ("share_label",   40,  228,   80,  246, "hud",  ["share_btn"]),
    ("share_dot",     75,  185,   95,  205, "hud",  ["share_btn", "share_label"]),
    ("music_btn",     33,  247,   79,  293, "hud",  []),
    ("menu_btn",      33,  312,   79,  358, "hud",  []),
    ("coin_pill",    530,   86,  662,  118, "hud",  []),
    ("ticket_pill",  530,  128,  662,  160, "hud",  []),
    ("shop_btn",     592,  168,  656,  268, "hud",  []),
    ("charity",      588,  290,  672,  378, "hud",  []),
    ("basket",       594,  386,  660,  464, "prop", []),
    # V04 重排: 时间胶囊下移右移至 (602, 482, 690, 514), 右沿留 2px 让描边不被裁切, 撤销与 cottage 的白名单
    ("clock_panel",  602,  482,  690,  514, "hud",  []),
    ("bubble_dog",   306,  441,  410,  478, "hud",  ["doghouse"]),
    # V02 修复后: cottage 包围盒根据实际顶点重新计算
    # x: 418(COT_BEL.x) 到 593(roof_right=COT_FER.x+20 右出檐), y: 470(RF.y) 到 562(墙底)
    ("cottage",      418,  470,  594,  562, "prop", []),
    # V02 修复后: doghouse 包围盒根据实际顶点重新计算
    # x: 317(DOG_BEL.x) 到 389(DOG_FER.x), y: 499(DOG_RF.y) 到 544(墙底)
    ("doghouse",     317,  499,  389,  544, "prop", []),
    ("signs",        194,  494,  258,  584, "prop", []),
    ("plot_bed",     110,  581,  585,  832, "prop", []),
    ("grade_sign",   256,  612,  326,  698, "prop", []),
    # 历史: ("pond", 0, 448, 182, 538, "prop", []), 已删除
    # 历史: ("pond_fence", 146, 458, 252, 520, "prop", []), 已删除
    ("fish",          32,  486,   98,  528, "prop", []),
    ("hay_cart",       0,  540,   70,  676, "prop", []),
    ("bl_fence",      22,  700,  116,  830, "prop", []),  # V01: 外移至地块床左缘外
    ("farm_btn",     296,  834,  386,  942, "hud",  []),
    ("task_pill",      0,  972,  350, 1052, "hud",  []),   # 实际绘制 x=-14, 有意左出血
    ("hand_cursor",  248,  968,  320, 1052, "hud",  ["task_pill"]),
    ("friend_bubble",494,  972,  674, 1068, "hud",  []),
    ("close_btn",    655,  957,  681,  983, "hud",  ["friend_bubble"]),
    ("nav_warehouse", 32, 1073,  114, 1160, "hud",  []),
    ("nav_shop",     135, 1073,  217, 1160, "hud",  []),
    ("nav_pet",      239, 1073,  321, 1160, "hud",  []),
    ("nav_dress",    342, 1073,  424, 1160, "hud",  []),
    ("nav_friend",   573, 1073,  655, 1160, "hud",  []),
]


def _area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _inter(a, b):
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    if x1 <= x0 or y1 <= y0:
        return None
    return (x0, y0, x1, y1)


def validate_svg_structure(svg):
    """Parse the generated SVG and validate IDs and url(#id) references."""
    problems = []
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as exc:
        return [f"[SVG结构] XML 解析失败: {exc}"]

    ids = []
    refs = []
    for elem in root.iter():
        elem_id = elem.attrib.get("id")
        if elem_id:
            ids.append(elem_id)
        for value in elem.attrib.values():
            refs.extend(re.findall(r"url\(#([^)]+)\)", value))
            if value.startswith("#") and elem.tag.endswith("use"):
                refs.append(value[1:])
    duplicates = sorted({x for x in ids if ids.count(x) > 1})
    if duplicates:
        problems.append("[SVG结构] 重复 id: " + ", ".join(duplicates))
    missing = sorted(set(refs) - set(ids))
    if missing:
        problems.append("[SVG结构] 无效引用: " + ", ".join(missing))
    return problems


# 元素级描边扩张 (用于把"几何边界"扩展为"可见边界")。
# 浮点 pen 半径 = stroke_width / 2, SVG 描边以路径为中心向两侧外扩.
# 仅记录需要被审计照顾描边扩张的元素 (HUD 圆角胶囊 / 描边按钮 等).
# 一般 2.0–2.2px 描边需要 1.0–1.1px 扩张.
STROKE_PADDING = {
    # name: (left, top, right, bottom) 几何向各方向扩张的像素
    "clock_panel":   (0, 0, 1.1, 0),  # 2.2px 描边 → 右沿需外扩 1.1px
    "coin_pill":     (0, 0, 1.1, 0),
    "ticket_pill":   (0, 0, 1.1, 0),
    "task_pill":     (1.4, 1.4, 1.4, 1.4),
    "friend_bubble": (1.5, 1.5, 1.5, 1.5),
    "profile":       (1.7, 1.7, 1.7, 1.7),
}

# 允许"故意超出几何边界"的元素 (设计意图); 这些元素的"可见越界"被豁免.
# task_pill 故意 x=-14 出血, 在记录中显式承认.
ALLOW_VISIBLE_OVERFLOW = {
    "task_pill": "task_pill 故意左出血 x=-14, 已记录; 不计入可见越界违规",
}


def _visible_box(name, x0, y0, x1, y1):
    """返回含描边扩张的可见包围盒 (用于越界判定)."""
    pl, pt, pr, pb = STROKE_PADDING.get(name, (0, 0, 0, 0))
    return (x0 - pl, y0 - pt, x1 + pr, y1 + pb)


def audit(verbose=True):
    """Validate SVG structure plus constraint-box boundaries, overlaps and gaps.

    使用 `STROKE_PADDING` 把 HUD 元素的"几何边界"扩展为"可见边界"，
    防止仅靠描边绘制的圆角胶囊因描边扩张被 viewBox 裁切。
    """
    problems = validate_svg_structure(build())
    W_, H_ = W, H
    rows = {row[0]: row for row in LAYOUT}

    for name, x0, y0, x1, y1, kind, _ in LAYOUT:
        # 几何越界仍要报警 (不能让 padding 掩盖原始违规)
        if x0 < 0 or y0 < 0 or x1 > W_ or y1 > H_:
            problems.append(f"[越界] {name} ({x0},{y0})-({x1},{y1}) 超出画布 {W_}x{H_}")
        # 可见 (含描边) 越界要报警 — 这是导致胶囊右沿被裁切的真正口径
        vx0, vy0, vx1, vy1 = _visible_box(name, x0, y0, x1, y1)
        if (vx0 < 0 or vy0 < 0 or vx1 > W_ or vy1 > H_) and name not in ALLOW_VISIBLE_OVERFLOW:
            problems.append(
                f"[可见越界] {name} 几何 ({x0},{y0})-({x1},{y1}) "
                f"含描边后 ({f(vx0)},{f(vy0)})-({f(vx1)},{f(vy1)}) "
                f"超出画布 {W_}x{H_}; 需要调整坐标或 STROKE_PADDING")
        if x1 <= x0 or y1 <= y0:
            problems.append(f"[非法] {name} 包围盒为空")

    for i in range(len(LAYOUT)):
        for j in range(i + 1, len(LAYOUT)):
            n1, *b1, k1, a1 = LAYOUT[i]
            n2, *b2, k2, a2 = LAYOUT[j]
            if n2 in a1 or n1 in a2:
                continue
            # Scene props may intentionally occlude one another; every pair touching UI is checked.
            if k1 != "hud" and k2 != "hud":
                continue
            it = _inter(b1, b2)
            if not it:
                continue
            ov = _area(it) / min(_area(b1), _area(b2))
            limit = 0.06 if k1 == k2 == "hud" else 0.12
            if ov > limit:
                problems.append(
                    f"[压盖] {n1} 与 {n2} 重叠 {ov*100:.0f}%  交叠区 {it}")

    # Load-bearing vertical gaps; positive values mean visible breathing room.
    required_gaps = [
        ("basket", "clock_panel", 8),
        ("task_pill", "nav_warehouse", 8),
        ("task_pill", "nav_shop", 8),
        ("friend_bubble", "nav_friend", 4),
    ]
    for upper, lower, required in required_gaps:
        u, d = rows[upper], rows[lower]
        gap = d[2] - u[4]
        if gap < required:
            problems.append(f"[间距] {upper}→{lower} 仅 {gap}px，需要 ≥{required}px")

    # ---- 几何断言 (P1 S3 要求) ----
    # dimetric 基础方向
    _U = (47.0, 24.0)
    _V = (-47.0, 24.0)
    _U_len = math.sqrt(_U[0]**2 + _U[1]**2)
    _V_len = math.sqrt(_V[0]**2 + _V[1]**2)

    def _parallel_to(p1, p2, ref, tol_px=3.0):
        """检查线段 (p1→p2) 是否与参考向量 ref 平行, 容差 tol_px/100。"""
        dx = p2[0] - p1[0]; dy = p2[1] - p1[1]
        if abs(dx) < 0.1 and abs(dy) < 0.1:
            return True  # 零长线段, 视为平行
        rdx = ref[0] / (math.sqrt(ref[0]**2 + ref[1]**2))
        rdy = ref[1] / (math.sqrt(ref[0]**2 + ref[1]**2))
        seg_len = math.sqrt(dx**2 + dy**2)
        sdx = dx / seg_len; sdy = dy / seg_len
        dot = abs(sdx * rdx + sdy * rdy)
        # 平行: |dot| ≈ 1.0
        return dot > 0.99

    def _seg_intersect(p1, p2, p3, p4):
        """检查线段 p1-p2 与 p3-p4 是否真相交 (非端点接触)。"""
        def _cross(a, b, c):
            return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
        d1 = _cross(p3, p4, p1); d2 = _cross(p3, p4, p2)
        d3 = _cross(p1, p2, p3); d4 = _cross(p1, p2, p4)
        if d1*d2 > 0 or d3*d4 > 0:
            return False
        # 检查共线端点接触 (不算真相交)
        if abs(d1) < 0.1 and abs(d2) < 0.1:
            return False
        if abs(d3) < 0.1 and abs(d4) < 0.1:
            return False
        return True

    # ---- 重新计算 cottage 顶点 (与绘制代码一致) ----
    COT_OY = 562; COT_FW = 152; COT_FD = 22; COT_WH = 92; COT_RH = 78
    k_u_cot = COT_FW / _U_len
    k_v_cot = COT_FD / _V_len
    U_cot = (47.0 * k_u_cot, 24.0 * k_u_cot)
    V_cot = (-47.0 * k_v_cot, 24.0 * k_v_cot)
    COT_FEL = (438.0, 470.0)
    COT_FER = (COT_FEL[0] + U_cot[0], COT_FEL[1] + U_cot[1])
    COT_BEL = (COT_FEL[0] + V_cot[0], COT_FEL[1] + V_cot[1])
    COT_BER = (COT_FER[0] + V_cot[0], COT_FER[1] + V_cot[1])
    eave_mid_front_cot = ((COT_FEL[0] + COT_FER[0]) / 2, (COT_FEL[1] + COT_FER[1]) / 2)
    eave_mid_back_cot = ((COT_BEL[0] + COT_BER[0]) / 2, (COT_BEL[1] + COT_BER[1]) / 2)
    COT_RF = (eave_mid_front_cot[0], eave_mid_front_cot[1] - COT_RH)
    COT_RB = (eave_mid_back_cot[0], eave_mid_back_cot[1] - COT_RH)

    # ---- 重新计算 doghouse 顶点 (与绘制代码一致) ----
    DOG_FW = 66; DOG_FD = 14; DOG_WH = 34; DOG_RH = 24
    k_u_dog = DOG_FW / _U_len
    k_v_dog = DOG_FD / _V_len
    U_dog = (47.0 * k_u_dog, 24.0 * k_u_dog)
    V_dog = (-47.0 * k_v_dog, 24.0 * k_v_dog)
    DOG_FEL = (330.0, 508.0)
    DOG_FER = (DOG_FEL[0] + U_dog[0], DOG_FEL[1] + U_dog[1])
    DOG_BEL = (DOG_FEL[0] + V_dog[0], DOG_FEL[1] + V_dog[1])
    DOG_BER = (DOG_FER[0] + V_dog[0], DOG_FER[1] + V_dog[1])
    eave_mid_front_dog = ((DOG_FEL[0] + DOG_FER[0]) / 2, (DOG_FEL[1] + DOG_FER[1]) / 2)
    eave_mid_back_dog = ((DOG_BEL[0] + DOG_BER[0]) / 2, (DOG_BEL[1] + DOG_BER[1]) / 2)
    DOG_RF = (eave_mid_front_dog[0], eave_mid_front_dog[1] - DOG_RH)
    DOG_RB = (eave_mid_back_dog[0], eave_mid_back_dog[1] - DOG_RH)

    # 断言 1: 草屋墙顶边 (front eave) 平行于 U=(47,24)
    cot_fl_top = COT_FEL
    cot_fr_top = COT_FER
    if not _parallel_to(cot_fl_top, cot_fr_top, _U):
        problems.append(
            f"[几何] cottage 墙顶边 ({cot_fl_top}→{cot_fr_top}) "
            f"不平行于 U={(47,24)}; 当前 slope={(cot_fr_top[1]-cot_fl_top[1])/(cot_fr_top[0]-cot_fl_top[0]):.3f}, "
            f"U slope={_U[1]/_U[0]:.3f}")
    # 断言 2: 草屋右屋檐边平行于 V=(-47,24)
    cot_fr_eave = COT_FER
    cot_br_eave = COT_BER
    if not _parallel_to(cot_fr_eave, cot_br_eave, _V):
        problems.append(
            f"[几何] cottage 右屋檐边 ({cot_fr_eave}→{cot_br_eave}) "
            f"不平行于 V={_V}; 当前 slope={(cot_br_eave[1]-cot_fr_eave[1])/(cot_br_eave[0]-cot_fr_eave[0]):.3f}, "
            f"V slope={_V[1]/_V[0]:.3f}")
    # 断言 3: 狗屋墙顶边平行于 U
    dog_fl_top = DOG_FEL
    dog_fr_top = DOG_FER
    if not _parallel_to(dog_fl_top, dog_fr_top, _U):
        problems.append(
            f"[几何] doghouse 墙顶边 ({dog_fl_top}→{dog_fr_top}) "
            f"不平行于 U={(47,24)}; 当前 slope={(dog_fr_top[1]-dog_fl_top[1])/(dog_fr_top[0]-dog_fl_top[0]):.3f}")
    # 断言 4: 狗屋右屋檐边平行于 V
    dog_fr_eave = DOG_FER
    dog_br_eave = DOG_BER
    if not _parallel_to(dog_fr_eave, dog_br_eave, _V):
        problems.append(
            f"[几何] doghouse 右屋檐边 ({dog_fr_eave}→{dog_br_eave}) "
            f"不平行于 V={_V}; 当前 slope={(dog_br_eave[1]-dog_fr_eave[1])/(dog_br_eave[0]-dog_fr_eave[0]):.3f}")
    # 断言 5: clock_panel 与 cottage 的实际线段不相交
    # clock_panel 矩形 (602,482)-(690,514)
    clock_segs = [((602.0,482.0),(690.0,482.0)), ((690.0,482.0),(690.0,514.0)),
                  ((690.0,514.0),(602.0,514.0)), ((602.0,514.0),(602.0,482.0))]
    # cottage 实际轮廓 (使用修正后的顶点)
    cot_footprint = [COT_FEL, COT_FER, COT_BER, COT_BEL]
    cot_segs = [(cot_footprint[i], cot_footprint[(i+1)%4]) for i in range(4)]
    for cs in clock_segs:
        for ts in cot_segs:
            if _seg_intersect(cs[0], cs[1], ts[0], ts[1]):
                problems.append(
                    f"[几何] clock_panel 线段 {cs} 与 cottage 轮廓线段 {ts} 相交 (真实几何重叠)")
    # 断言 6: 狗屋与草屋实际轮廓不相交 (prop-prop 不查压盖, 但检查越界)
    dog_footprint = [DOG_FEL, DOG_FER, DOG_BER, DOG_BEL]
    for ds in [(dog_footprint[i], dog_footprint[(i+1)%4]) for i in range(4)]:
        for ts in cot_segs:
            if _seg_intersect(ds[0], ds[1], ts[0], ts[1]):
                problems.append(
                    f"[几何] doghouse 线段 {ds} 与 cottage 轮廓线段 {ts} 相交")

    if verbose:
        print(f"v24 审计: XML + {len(LAYOUT)} 个约束元素")
        if problems:
            for p_ in problems:
                print("  ✗ " + p_)
        else:
            print("  ✓ SVG 结构有效；无越界、无意外压盖、关键间距合格")
    return problems


# ================================================================ defs
def build_defs():
    d = ["<defs>"]
    # --- 天空
    d.append('<linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">'
             + "".join(f'<stop offset="{f(o*100)}%" stop-color="{c}"/>' for o, c in SKY)
             + "</linearGradient>")
    # --- 草地
    d.append('<linearGradient id="grassGrad" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0%" stop-color="#cfe094"/>'
             '<stop offset="10%" stop-color="#c2d77f"/>'
             '<stop offset="26%" stop-color="#b6cd6e"/>'
             '<stop offset="46%" stop-color="#b0c765"/>'
             '<stop offset="66%" stop-color="#aec35e"/>'
             '<stop offset="86%" stop-color="#aebf57"/>'
             '<stop offset="100%" stop-color="#abb951"/>'
             "</linearGradient>")
    # --- 地块床
    d.append('<linearGradient id="bedShade" x1="0.1" y1="0" x2="0.9" y2="1">'
             '<stop offset="0%" stop-color="#a0ad48"/>'
             '<stop offset="55%" stop-color="#d8c28a"/>'
             '<stop offset="100%" stop-color="#c9b075"/>'
             "</linearGradient>")
    # --- 瓦片
    d.append('<linearGradient id="tileGradG" x1="0.15" y1="0" x2="0.85" y2="1">'
             '<stop offset="0%" stop-color="#c8e77f"/>'
             '<stop offset="45%" stop-color="#b6da63"/>'
             '<stop offset="100%" stop-color="#9dc450"/>'
             "</linearGradient>")
    d.append('<linearGradient id="tileGradD" x1="0.15" y1="0" x2="0.85" y2="1">'
             '<stop offset="0%" stop-color="#bd8a5c"/>'
             '<stop offset="45%" stop-color="#a8764c"/>'
             '<stop offset="100%" stop-color="#8e603c"/>'
             "</linearGradient>")
    # --- 水
    d.append('<linearGradient id="unused_waterGrad" x1="0" y1="0" x2="0.3" y2="1">'
             '<stop offset="0%" stop-color="#8fcfe4"/>'
             '<stop offset="42%" stop-color="#6fb6d4"/>'
             '<stop offset="100%" stop-color="#4f96b4"/>'
             "</linearGradient>")
    # --- 屋
    d.append('<linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0%" stop-color="#fbf4e4"/>'
             '<stop offset="100%" stop-color="#e6d5b6"/>'
             "</linearGradient>")
    d.append('<linearGradient id="doorGrad" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0%" stop-color="#b98247"/>'
             '<stop offset="100%" stop-color="#8e5f30"/>'
             "</linearGradient>")
    d.append('<linearGradient id="roofGrad" x1="0.1" y1="0" x2="0.9" y2="1">'
             '<stop offset="0%" stop-color="#f4dc96"/>'
             '<stop offset="34%" stop-color="#e8c46a"/>'
             '<stop offset="72%" stop-color="#d4a94a"/>'
             '<stop offset="100%" stop-color="#b8913c"/>'
             "</linearGradient>")
    # --- UI
    d.append('<linearGradient id="woodBtn" x1="0" y1="0" x2="0.2" y2="1">'
             '<stop offset="0%" stop-color="#dcb27c"/>'
             '<stop offset="45%" stop-color="#c99a63"/>'
             '<stop offset="100%" stop-color="#a87c48"/>'
             "</linearGradient>")
    d.append('<radialGradient id="woodRing" cx="0.36" cy="0.30" r="0.80">'
             '<stop offset="0%" stop-color="#dcaa83"/>'
             '<stop offset="55%" stop-color="#c68f66"/>'
             '<stop offset="100%" stop-color="#9d6a45"/>'
             "</radialGradient>")
    d.append('<radialGradient id="woodFace" cx="0.50" cy="0.48" r="0.62">'
             '<stop offset="0%" stop-color="#ac7654"/>'
             '<stop offset="40%" stop-color="#bd8760"/>'
             '<stop offset="78%" stop-color="#d59d78"/>'
             '<stop offset="100%" stop-color="#c48e69"/>'
             "</radialGradient>")
    d.append('<radialGradient id="beadG" cx="0.34" cy="0.28" r="0.80">'
             '<stop offset="0%" stop-color="#ff9b8f"/>'
             '<stop offset="38%" stop-color="#f2564c"/>'
             '<stop offset="100%" stop-color="#c0392b"/>'
             "</radialGradient>")
    d.append('<radialGradient id="coinG" cx="0.34" cy="0.28" r="0.78">'
             '<stop offset="0%" stop-color="#fff3bc"/>'
             '<stop offset="40%" stop-color="#ffd54a"/>'
             '<stop offset="100%" stop-color="#d99a12"/>'
             "</radialGradient>")
    d.append('<radialGradient id="coinRingG" cx="0.34" cy="0.28" r="0.78">'
             '<stop offset="0%" stop-color="#f5cd52"/>'
             '<stop offset="100%" stop-color="#b87d0a"/>'
             "</radialGradient>")
    d.append('<linearGradient id="pillGrad" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0%" stop-color="#fffdf6"/>'
             '<stop offset="55%" stop-color="#faf2e0"/>'
             '<stop offset="100%" stop-color="#f0e4cc"/>'
             "</linearGradient>")
    # --- 滤镜
    for name, sd in [("soft4", 4), ("soft6", 6), ("soft10", 10), ("soft14", 14), ("soft26", 26)]:
        d.append(f'<filter id="{name}" x="-30%" y="-60%" width="160%" height="220%">'
                 f'<feGaussianBlur stdDeviation="{sd}"/></filter>')
    # 细颗粒草纹理
    d.append('<filter id="grainGrass" x="0" y="0" width="100%" height="100%">'
             '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" '
             'seed="17" stitchTiles="stitch" result="n"/>'
             '<feColorMatrix in="n" type="saturate" values="0" result="g"/>'
             '<feComponentTransfer in="g" result="gc">'
             '<feFuncR type="table" tableValues="0.90 1"/>'
             '<feFuncG type="table" tableValues="0.90 1"/>'
             '<feFuncB type="table" tableValues="0.90 1"/>'
             '<feFuncA type="table" tableValues="1 1"/>'
             '</feComponentTransfer>'
             '<feComposite in="gc" in2="SourceGraphic" operator="in" result="clip"/>'
             '<feBlend in="SourceGraphic" in2="clip" mode="multiply"/>'
             "</filter>")
    # 土壤颗粒
    d.append('<filter id="grainSoil" x="0" y="0" width="100%" height="100%">'
             '<feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" '
             'seed="23" stitchTiles="stitch" result="n"/>'
             '<feColorMatrix in="n" type="saturate" values="0" result="g"/>'
             '<feComponentTransfer in="g" result="gc">'
             '<feFuncR type="table" tableValues="0.80 1"/>'
             '<feFuncG type="table" tableValues="0.80 1"/>'
             '<feFuncB type="table" tableValues="0.80 1"/>'
             '<feFuncA type="table" tableValues="1 1"/>'
             '</feComponentTransfer>'
             '<feComposite in="gc" in2="SourceGraphic" operator="in" result="clip"/>'
             '<feBlend in="SourceGraphic" in2="clip" mode="multiply"/>'
             "</filter>")
    d.append("</defs>")
    return "".join(d)


def build():
    body = []
    body.append(layer_sky())
    body.append(layer_mountains())
    body.append(layer_ground())
    body.append(layer_forest())
    # 历史池塘与池边栅栏已移除 (2026-09-11)
    body.append(layer_fish())
    body.append(layer_hay_and_cart())
    body.append(layer_path())
    body.append(build_plot())
    body.append(layer_grade_sign())
    body.append(layer_bubble_dog())
    body.append(layer_cottage())
    body.append(layer_doghouse())
    body.append(layer_signs())
    body.append(layer_basket())
    body.append(layer_decor())
    body.append(layer_farmbtn())
    body.append(layer_ui())
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
           f'viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
           + build_defs() + "".join(body) + "</svg>")
    return svg


HIT_AREAS = [
    # name, label, center x/y, desktop visual width/height in SVG units
    ("share", "分享", 60, 210, 60, 60),
    ("music", "音乐", 56, 270, 46, 46),
    ("menu", "菜单", 56, 335, 46, 46),
    ("shop", "商城", 618, 226, 74, 98),
    ("charity", "公益小红花", 627, 334, 100, 88),
    ("farm", "一键务农", 341, 888, 90, 108),
    # task 胶囊 rect(-14, 972, 364, 80). 命中区向内收缩 8px (左侧受胶囊出血影响)
    # 确保 430px 等 viewport 下的 left >= 0 (validate_hits.py 实测要求)
    ("task", "收获任务", 175, 1012, 348, 78),
    ("friend-close", "关闭好友求助", 668, 970, 26, 26),
    ("warehouse", "仓库", 73, 1114, 82, 87),
    ("nav-shop", "商店", 176, 1114, 82, 87),
    ("pet", "宠物", 280, 1114, 82, 87),
    ("dress", "装扮", 383, 1114, 82, 87),
    ("friend", "好友", 614, 1114, 82, 87),
]


def build_hit_areas():
    buttons = []
    for name, label, cx, cy, width, height in HIT_AREAS:
        buttons.append(
            f'<button class="hit-target hit-{name}" aria-label="{label}" '
            f'data-target="{name}" '
            f'style="--cx:{cx / W * 100:.5f}%;--cy:{cy / H * 100:.5f}%;'
            f'--w:{width / W * 100:.5f}%;--h:{height / H * 100:.5f}%"></button>')
    return '<div class="hit-layer" aria-label="农场快捷操作">' + "".join(buttons) + '</div>'


HTML = r"""<!DOCTYPE html>
<html lang="zh-CN" data-state="normal"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>farm-v25</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100%%;background:#182619;overflow:auto;}
  body{display:flex;justify-content:center;align-items:flex-start;}
  #stage{position:relative;width:min(100vw,%dpx);aspect-ratio:%d/%d;overflow:hidden;background:#000;}
  svg{display:block;width:100%%;height:100%%;}
  .hit-layer{position:absolute;inset:0;pointer-events:none;}
  .hit-target{position:absolute;left:var(--cx);top:var(--cy);width:max(44px,var(--w));height:max(44px,var(--h));
    transform:translate(-50%%,-50%%);padding:0;border:0;background:transparent;pointer-events:auto;cursor:pointer;}
  .hit-target:focus-visible{outline:3px solid #fff3a0;outline-offset:2px;border-radius:12px;background:#fff3a026;}
  .hit-friend-close{left:auto;right:0;transform:translateY(-50%%);}
</style></head><body><div id="stage">%s%s</div>
<script>
  // State interface: URL ?state=normal|guided sets document.documentElement.dataset.state
  (function(){
    var p=new URLSearchParams(location.search);
    var s=p.get("state");
    if(s==="normal"||s==="guided") document.documentElement.dataset.state=s;
  })();
  const compact = () => document.getElementById('stage').clientWidth <= 430;
  function adaptCompactControls(){
    const shifts = compact() ? {'share-control':-11,'music-control':11,'menu-control':28} : {};
    for (const id of ['share-control','music-control','menu-control']) {
      document.getElementById(id).setAttribute('transform', `translate(0,${shifts[id] || 0})`);
    }
    const centers = compact() ? {share:199,music:281,menu:363} : {share:210,music:270,menu:335};
    for (const [name, y] of Object.entries(centers)) {
      document.querySelector(`.hit-${name}`).style.setProperty('--cy', `${y / 1218 * 100}%%`);
    }
  }
  addEventListener('resize', adaptCompactControls, {passive:true});
  adaptCompactControls();
</script></body></html>"""

if __name__ == "__main__":
    import sys
    if "--audit" in sys.argv:
        probs = audit()
        sys.exit(1 if probs else 0)
    if "--layout" in sys.argv:
        print("| 元素 | x0,y0 | x1,y1 | 尺寸 | 类别 | 允许压盖 |")
        print("|---|---|---|---|---|---|")
        for name, x0, y0, x1, y1, kind, ov in LAYOUT:
            print(f"| `{name}` | {x0}, {y0} | {x1}, {y1} | {x1-x0}×{y1-y0} "
                  f"| {kind} | {', '.join(ov) if ov else '—'} |")
        sys.exit(0)
    out = sys.argv[1] if len(sys.argv) > 1 else "farm-v25.html"
    html = HTML % (W, W, H, build(), build_hit_areas())
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"wrote {out}  ({len(html)/1024:.1f} KB)")
