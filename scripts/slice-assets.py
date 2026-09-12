#!/usr/bin/env python3
"""
slice-assets.py — 把 AI 生成的 sprite sheet 切成 Cocos 可用的 PNG，并做底色透明化。

用途
----
读取 generated/batch-assets/ 下 14 张 JPEG，按 generated/batch-assets/GENERATION-REPORT.md
的语义映射切成单图 PNG，写到 assets/game/。同时产出 assets/game/manifest.json 供
下游（Cocos 集成 / 联调）按名引用。

运行
----
python3 scripts/slice-assets.py

环境
----
- python3 (>=3.9)，Pillow >=10（项目实测 12.2.0）
- 无第三方依赖；JPEG 解码 / PNG 写出 / 透明化全在 PIL 内

来源目录
--------
generated/batch-assets/

输出目录
--------
assets/game/
  crops/<cropId>/stage-{1..4}.png   # 4 个生长阶段，对应 seed/sprout/growing/ripe
  icons/<semantic>.png              # 图标 4x2 sheet 按语义拆 8 个
  plots/<semantic>.png              # 6 个地块状态/覆盖层（整体拷贝+去底）
  env/<semantic>.png                # 环境 sheet 按行/列切或整体拷贝（见内部映射）
  manifest.json                     # 每个产物的 source / grid / bgRemoved / stats

重复运行
----
所有输出文件为覆盖式（直接重写）。删除整个 assets/game/ 也可再次生成。

去底算法
--------
四角色采样取均值作为参考背景色；对每个像素算与参考色的 L2 距离；
距离 ≤ BG_DISTANCE_THRESHOLD 的像素 alpha=0，其余保持。容差默认 40，
对 JPEG 压缩噪声（±5~10 灰阶）足够稳；对极少数与背景色接近的前景（如
金色 coin）会被一起透明化——这是 MVP 阶段的已知限制，详见 runbook 末节。
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterable

from PIL import Image

# -------- 配置 --------

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = REPO_ROOT / "generated" / "batch-assets"
OUTPUT_DIR = REPO_ROOT / "assets" / "game"

BG_DISTANCE_THRESHOLD = 40  # 默认阈值；调大=更激进地剔前景，调小=更保守

# 每个 plot 是 1024x1024 单图。grid=(1,1) 表示直接切整张并去底。
PLOT_TILES: list[tuple[str, str, str]] = [
    # (source filename, semantic name, output path relative to OUTPUT_DIR)
    ("plot_locked.jpeg",            "locked",          "plots/locked.png"),
    ("plot_grass_empty.jpeg",       "grass-empty",     "plots/grass-empty.png"),
    ("plot_tilled_empty.jpeg",      "tilled-empty",    "plots/tilled-empty.png"),
    ("plot_wet_overlay.jpeg",       "wet-overlay",     "plots/wet-overlay.png"),
    ("plot_ripe_overlay.jpeg",      "ripe-overlay",    "plots/ripe-overlay.png"),
    ("plot_selection_overlay.jpeg", "selection-overlay","plots/selection-overlay.png"),
]

# 作物 sheet：2x2，顺序固定 seed→sprout→growing→ripe（按 GENERATION-REPORT.md §Batch 2）
# 把 crop_radish_stages.jpeg 映射到 carrot：因为 shared 类型里 carrot 的 name 是「白萝卜」，
# AI 出图用了中文名，故 radish 文件实质上是 carrot 的图（详见 runbook 末「发现的问题」）。
CROP_SHEETS: list[tuple[str, str]] = [
    ("crop_radish_stages.jpeg",     "carrot"),
    ("crop_potato_stages.jpeg",     "potato"),
    ("crop_corn_stages.jpeg",       "corn"),
    ("crop_tomato_stages.jpeg",     "tomato"),
    ("crop_strawberry_stages.jpeg", "strawberry"),
]
CROP_STAGE_NAMES = ["stage-1", "stage-2", "stage-3", "stage-4"]  # seed, sprout, growing, ripe
CROP_GRID = (2, 2)  # cols x rows

# 图标 sheet 4x2；按报告里写的语义顺序（左→右、上→下）
# 报告原文：seed bag, watering can, water droplet, water splash, harvest sparkle,
#          gold coin, flying coin reward, lock sign
ICON_SHEET = "icons_core_actions_economy.jpeg"
ICON_GRID = (4, 2)
ICON_TILES: list[str] = [
    "seed-bag",
    "watering-can",
    "droplet",
    "splash",
    "sparkle",
    "coin",
    "flying-coin",
    "lock",
]

# 环境 sheet
# - environment_farm_modules.jpeg：4x2，8 个物件（farmhouse/fence/signboard/well/
#   lotus pond/stepping stones/flowering bush/grass tuft）— MVP 阶段不引入，按整体拷贝
# - environment_tree_mountain_cloud.jpeg：3-piece sheet（tree/mountains/cloud），整体拷贝
ENV_SHEETS: list[tuple[str, str, tuple[int, int]]] = [
    # (source, output relative path, grid)；grid=(1,1) 表示整体拷贝
    ("environment_farm_modules.jpeg",       "env/farm-modules.png",       (1, 1)),
    ("environment_tree_mountain_cloud.jpeg", "env/tree-mountain-cloud.png", (1, 1)),
]


# -------- 数据结构 --------

@dataclass
class TileOutput:
    name: str
    path: str           # 相对 OUTPUT_DIR
    width: int
    height: int
    bgRemoved: bool
    alphaCoverage: float  # alpha>0 像素占比，0~1


@dataclass
class ManifestEntry:
    source: str         # 相对 REPO_ROOT
    grid: list[int]
    outputs: list[TileOutput] = field(default_factory=list)
    bgRemoved: bool = True
    deviation: str | None = None  # 若实际文件与预期不符


# -------- 工具 --------

def _repo_rel(p: Path) -> str:
    """相对仓库根的 POSIX 路径。"""
    try:
        return p.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return p.as_posix()


def _sample_bg_color(img: Image.Image) -> tuple[int, int, int]:
    """取四角像素均值作为背景色参考。"""
    w, h = img.size
    coords = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    rs = gs = bs = 0
    for (x, y) in coords:
        r, g, b = img.getpixel((x, y))[:3]
        rs += r; gs += g; bs += b
    n = len(coords)
    return (rs // n, gs // n, bs // n)


def _remove_bg(img: Image.Image, threshold: int) -> tuple[Image.Image, float]:
    """
    把与四角参考色距离 <= threshold 的像素 alpha=0，返回 (RGBA 图, alpha>0 占比)。
    使用 list 模式而非 numpy 以避免外部依赖。
    """
    src = img.convert("RGB")
    w, h = src.size
    bg = _sample_bg_color(src)
    br, bg_c, bb = bg
    out = src.convert("RGBA")
    pixels = out.load()
    thr2 = threshold * threshold
    kept = 0
    total = w * h
    for y in range(h):
        for x in range(w):
            r, g, b, _a = pixels[x, y]
            dr = r - br
            dg = g - bg_c
            db = b - bb
            if dr * dr + dg * dg + db * db <= thr2:
                pixels[x, y] = (r, g, b, 0)
            else:
                # 抗 JPEG 压缩：把非背景像素 alpha 置满
                pixels[x, y] = (r, g, b, 255)
                kept += 1
    return out, (kept / total if total else 0.0)


def _slice_grid(img: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    """把图按 cols×rows 网格切成子图，先列后行。"""
    w, h = img.size
    cw, ch = w // cols, h // rows
    tiles: list[Image.Image] = []
    for r in range(rows):
        for c in range(cols):
            box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
            tiles.append(img.crop(box))
    return tiles


def _write_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


# -------- 处理函数 --------

def process_plot_tiles(manifest: list[ManifestEntry]) -> None:
    for src_name, semantic, out_rel in PLOT_TILES:
        src = SOURCE_DIR / src_name
        entry = ManifestEntry(
            source=_repo_rel(src),
            grid=[1, 1],
        )
        if not src.exists():
            entry.deviation = f"missing source file: {src_name}"
            manifest.append(entry)
            continue
        img = Image.open(src)
        rgba, coverage = _remove_bg(img, BG_DISTANCE_THRESHOLD)
        out_path = OUTPUT_DIR / out_rel
        _write_png(rgba, out_path)
        entry.outputs.append(TileOutput(
            name=semantic,
            path=out_rel,
            width=rgba.width,
            height=rgba.height,
            bgRemoved=True,
            alphaCoverage=round(coverage, 4),
        ))
        manifest.append(entry)


def process_crop_sheets(manifest: list[ManifestEntry]) -> None:
    for src_name, crop_id in CROP_SHEETS:
        src = SOURCE_DIR / src_name
        entry = ManifestEntry(
            source=_repo_rel(src),
            grid=list(CROP_GRID),
        )
        if not src.exists():
            entry.deviation = f"missing source file: {src_name}"
            manifest.append(entry)
            continue
        img = Image.open(src)
        tiles = _slice_grid(img, *CROP_GRID)
        if len(tiles) != 4:
            entry.deviation = f"unexpected tile count {len(tiles)} for {src_name}"
            manifest.append(entry)
            continue
        for tile, stage_name in zip(tiles, CROP_STAGE_NAMES):
            rgba, coverage = _remove_bg(tile, BG_DISTANCE_THRESHOLD)
            out_rel = f"crops/{crop_id}/{stage_name}.png"
            _write_png(rgba, OUTPUT_DIR / out_rel)
            entry.outputs.append(TileOutput(
                name=stage_name,
                path=out_rel,
                width=rgba.width,
                height=rgba.height,
                bgRemoved=True,
                alphaCoverage=round(coverage, 4),
            ))
        manifest.append(entry)


def process_icon_sheet(manifest: list[ManifestEntry]) -> None:
    src = SOURCE_DIR / ICON_SHEET
    entry = ManifestEntry(
        source=_repo_rel(src),
        grid=list(ICON_GRID),
    )
    if not src.exists():
        entry.deviation = f"missing source file: {ICON_SHEET}"
        manifest.append(entry)
        return
    img = Image.open(src)
    tiles = _slice_grid(img, *ICON_GRID)
    if len(tiles) != len(ICON_TILES):
        entry.deviation = (
            f"icon tile count mismatch: got {len(tiles)}, expected {len(ICON_TILES)}"
        )
        manifest.append(entry)
        return
    for tile, semantic in zip(tiles, ICON_TILES):
        rgba, coverage = _remove_bg(tile, BG_DISTANCE_THRESHOLD)
        out_rel = f"icons/{semantic}.png"
        _write_png(rgba, OUTPUT_DIR / out_rel)
        entry.outputs.append(TileOutput(
            name=semantic,
            path=out_rel,
            width=rgba.width,
            height=rgba.height,
            bgRemoved=True,
            alphaCoverage=round(coverage, 4),
        ))
    manifest.append(entry)


def process_env_sheets(manifest: list[ManifestEntry]) -> None:
    for src_name, out_rel, grid in ENV_SHEETS:
        src = SOURCE_DIR / src_name
        entry = ManifestEntry(
            source=_repo_rel(src),
            grid=list(grid),
        )
        if not src.exists():
            entry.deviation = f"missing source file: {src_name}"
            manifest.append(entry)
            continue
        img = Image.open(src)
        cols, rows = grid
        if cols == 1 and rows == 1:
            rgba, coverage = _remove_bg(img, BG_DISTANCE_THRESHOLD)
            _write_png(rgba, OUTPUT_DIR / out_rel)
            entry.outputs.append(TileOutput(
                name=Path(out_rel).stem,
                path=out_rel,
                width=rgba.width,
                height=rgba.height,
                bgRemoved=True,
                alphaCoverage=round(coverage, 4),
            ))
        else:
            tiles = _slice_grid(img, cols, rows)
            for i, tile in enumerate(tiles):
                rgba, coverage = _remove_bg(tile, BG_DISTANCE_THRESHOLD)
                stem = Path(out_rel).stem
                rel = f"env/{stem}-{i + 1}.png"
                _write_png(rgba, OUTPUT_DIR / rel)
                entry.outputs.append(TileOutput(
                    name=f"{stem}-{i + 1}",
                    path=rel,
                    width=rgba.width,
                    height=rgba.height,
                    bgRemoved=True,
                    alphaCoverage=round(coverage, 4),
                ))
        manifest.append(entry)


# -------- 校验 --------

def assert_min_alpha_coverage(manifest: Iterable[ManifestEntry]) -> list[str]:
    """返回透明化后 alpha 覆盖过低的 tile 列表（阈值 5%）。"""
    flagged: list[str] = []
    for entry in manifest:
        for tile in entry.outputs:
            if tile.bgRemoved and tile.alphaCoverage < 0.05:
                flagged.append(f"{tile.path} coverage={tile.alphaCoverage:.3f}")
    return flagged


# -------- 入口 --------

def main(argv: list[str]) -> int:
    global BG_DISTANCE_THRESHOLD
    threshold = BG_DISTANCE_THRESHOLD
    if len(argv) > 1:
        try:
            threshold = int(argv[1])
        except ValueError:
            print(f"invalid threshold: {argv[1]}", file=sys.stderr)
            return 2
    # process_* helpers read the module-level constant at call time — wire the
    # CLI value through so the manifest never records a threshold that wasn't
    # actually applied.
    BG_DISTANCE_THRESHOLD = threshold

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest: list[ManifestEntry] = []
    process_plot_tiles(manifest)
    process_crop_sheets(manifest)
    process_icon_sheet(manifest)
    process_env_sheets(manifest)

    flagged = assert_min_alpha_coverage(manifest)
    for f in flagged:
        print(f"[warn] low alpha coverage: {f}")

    manifest_path = OUTPUT_DIR / "manifest.json"
    payload = {
        "generatedBy": "scripts/slice-assets.py",
        "bgDistanceThreshold": threshold,
        "sourceDir": _repo_rel(SOURCE_DIR),
        "entries": [
            {
                **{k: v for k, v in asdict(e).items() if k != "outputs"},
                "outputs": [asdict(o) for o in e.outputs],
            }
            for e in manifest
        ],
    }
    manifest_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")

    total_outputs = sum(len(e.outputs) for e in manifest)
    deviations = [e for e in manifest if e.deviation]
    print(f"slice-assets: wrote {total_outputs} tiles to {OUTPUT_DIR}")
    print(f"slice-assets: manifest -> {manifest_path}")
    if deviations:
        print(f"slice-assets: {len(deviations)} deviations:")
        for e in deviations:
            print(f"  - {e.source}: {e.deviation}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
