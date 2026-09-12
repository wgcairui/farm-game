#!/usr/bin/env python3
"""Prepare v13 sprites for the Cocos Creator project (implementation-plan-ui-v13.md U01).

Reads assets/sprites/v13/ (the art-pipeline source of truth, never modified)
and regenerates packages/client-mini/assets/resources/game/ with:
  - downscale to display-appropriate sizes (plots/crops 256, fx 512, ...)
  - palette quantization (PNG8) when it saves >25% vs optimized RGBA
  - JPEG recompression for the map base
  - a prepare-report.json manifest with per-file provenance and size totals

Known defects handled here (see plan §5/§7 and progress-phase2 §13):
  - plots/overlay_selected.png is excluded entirely: it is a mis-generated
    sand pile with keying residue, not a selection frame. The UI draws a
    programmatic selection ring instead.
  - the base map already paints a pond/bridge/paths, so scene-module water
    and path pieces are still imported (cheap, flagged off at runtime in
    layout.ts) but not relied upon.

Idempotent: wipes and regenerates the destination tree every run.

Usage: python3 scripts/prepare-cocos-assets.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "assets" / "sprites" / "v13"
DST = REPO / "packages" / "client-mini" / "assets" / "resources" / "game"

MAP_QUALITY = 82
QUANT_GAIN_THRESHOLD = 0.75  # keep quantized only if size <= 75% of RGBA

# (source under v13/, destination under game/, rule)
# rule kinds:
#   {"jpeg": quality}          recompress jpeg
#   {"copy": True}             byte copy
#   {"box": px, "q": True}     fit within px box (LANCZOS) + quantization attempt
#   {"size": (w, h), "q": True} resize exactly + quantization attempt
#   {"q": True}                quantization attempt only
RULES: list[tuple[str, str, dict]] = [
    # L4 base map + plot grid contract
    ("map/farm-map-base-2x.jpeg", "map/base.jpg", {"jpeg": MAP_QUALITY}),
    ("map/plot-layout.json", "plot-layout.json", {"copy": True}),
    # L8 plots (overlay_selected excluded — defective asset)
    ("plots/plot_locked.png", "plots/plot_locked.png", {"box": 256, "q": True}),
    ("plots/plot_grass_empty.png", "plots/plot_grass_empty.png", {"box": 256, "q": True}),
    ("plots/plot_tilled_empty.png", "plots/plot_tilled_empty.png", {"box": 256, "q": True}),
    ("plots/overlay_wet.png", "plots/overlay_wet.png", {"box": 256, "q": True}),
    ("plots/overlay_ripe.png", "plots/overlay_ripe.png", {"box": 256, "q": True}),
    # L9 crops 5 x 4 (source is flat naming, dest is per-crop folder)
] + [
    (f"crops/{crop}_stage{s}.png", f"crops/{crop}/stage-{s}.png", {"box": 256, "q": True})
    for crop in ("carrot", "corn", "potato", "strawberry", "tomato")
    for s in (1, 2, 3, 4)
] + [
    # icons (already display-sized)
    (f"icons/{name}.png", f"icons/{name}.png", {"q": True})
    for name in (
        "coin_gold", "coin_flying", "harvest_sparkle", "lock_sign", "seed_bag",
        "star_gold", "water_drop", "watering_can", "watering_can_alt",
    )
] + [
    # L10 effects
    (f"effects/fx_{name}.png", f"fx/{name}.png", {"box": 512, "q": True})
    for name in ("plant_dust", "water_splash", "harvest_burst", "coin_fly", "levelup_badge")
] + [
    # L6/L7 scene modules (imported for future roaming-map use; runtime flags off)
    (f"scene-modules/module_{name}.png", f"modules/{name}.png", {"q": True})
    for name in (
        "cottage", "cottage_small", "bush", "fence_segment", "fence_stones",
        "fence_white", "haystack", "lotus_pond", "signboard", "water_well",
        "bush_a", "bush_b", "bush_c", "bush_d",
    )
] + [
    ("scene-modules/module_bridge.png", "modules/bridge.png", {"size": (576, 432), "q": True}),
    ("scene-modules/module_lily_pad_a.png", "modules/lily_pad_a.png", {"q": True}),
    ("scene-modules/module_lily_pad_b.png", "modules/lily_pad_b.png", {"q": True}),
    ("scene-modules/module_lotus_flower.png", "modules/lotus_flower.png", {"q": True}),
    # water animation pair (2 frames)
    ("scene-modules/module_pond_water.png", "fx/pond_water_a.png", {"box": 512, "q": True}),
    ("scene-modules/module_pond_water_b.png", "fx/pond_water_b.png", {"box": 512, "q": True}),
] + [
    # L5 path pieces
    (f"scene-modules/{name}.png", f"modules/{name}.png", {"q": True})
    for name in ("path_straight_stone", "path_straight_dirt", "path_curve_stone", "path_end_cap")
] + [
    # L2/L3 parallax strips (keep 2880 width = 2 screen widths @2x, mirror-tileable)
    (f"scene-modules/{name}.png", f"parallax/{name}.png", {"q": True})
    for name in ("mountains_far_strip", "mountains_near_strip", "forest_belt_strip")
] + [
    # L11/L12 UI kit
    (f"ui/{name}.png", f"ui/{name}.png", {"q": True})
    for name in (
        "ui_btn_close", "ui_btn_confirm", "ui_btn_round_red",
        "ui_icon_share", "ui_icon_music", "ui_icon_menu", "ui_icon_camera",
        "ui_icon_pet", "ui_icon_shop",
        "ui_panel_gold_bar", "ui_panel_cash_bar",
    )
] + [
    ("ui/ui_popup_panel.png", "ui/ui_popup_panel.png", {"size": (720, 540), "q": True}),
    ("ui/ui_slider.png", "ui/ui_slider.png", {"size": (640, 360), "q": True}),
]

# Asset group per destination dir — assets.ts loads by group and U17 (package
# audit) uses it to decide remote-bundle splitting.
GROUPS = {
    "map": ["map"],
    "plot-layout": ["plot-layout.json"],
    "plots": ["plots"],
    "crops": ["crops"],
    "icons": ["icons"],
    "fx": ["fx"],
    "modules": ["modules"],
    "parallax": ["parallax"],
    "ui": ["ui"],
}


def group_of(dst_rel: str) -> str:
    for group, prefixes in GROUPS.items():
        for prefix in prefixes:
            if dst_rel == prefix or dst_rel.startswith(prefix + "/"):
                return group
    return "misc"


def quantize_rgba(img: Image.Image) -> Image.Image:
    """PNG8 via FASTOCTREE — the only PIL quantize mode that accepts RGBA."""
    return img.quantize(colors=256, method=Image.FASTOCTREE)


def png_bytes(img: Image.Image) -> int:
    import io
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.tell()


def process_one(src_path: Path, dst_path: Path, rule: dict, dry: bool) -> dict:
    entry: dict = {
        "src": str(src_path.relative_to(REPO)),
        "dst": str(dst_path.relative_to(REPO)),
        "srcBytes": src_path.stat().st_size,
    }
    if dry:
        return entry

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    if rule.get("copy"):
        shutil.copyfile(src_path, dst_path)
        entry["dstBytes"] = dst_path.stat().st_size
        entry["note"] = "copied"
        return entry

    img = Image.open(src_path)
    entry["srcSize"] = list(img.size)

    if "jpeg" in rule:
        img.save(dst_path, "JPEG", quality=rule["jpeg"], optimize=True)
        entry.update(dstBytes=dst_path.stat().st_size, note=f"jpeg q{rule['jpeg']}")
        return entry

    if "box" in rule:
        img.thumbnail((rule["box"], rule["box"]), Image.LANCZOS)
    elif "size" in rule:
        img = img.resize(rule["size"], Image.LANCZOS)
    entry["dstSize"] = list(img.size)

    if img.mode != "RGBA":
        img = img.convert("RGBA")

    rgba_bytes = png_bytes(img)
    if rule.get("q"):
        quant = quantize_rgba(img)
        quant_bytes = png_bytes(quant)
        if quant_bytes <= rgba_bytes * QUANT_GAIN_THRESHOLD:
            quant.save(dst_path, "PNG", optimize=True)
            entry.update(
                dstBytes=dst_path.stat().st_size,
                note=f"box/resized + quantized (rgba would be {rgba_bytes // 1024}KB)",
            )
            return entry
        entry["note"] = "quantize skipped (gain below threshold)"
    img.save(dst_path, "PNG", optimize=True)
    entry["dstBytes"] = dst_path.stat().st_size
    return entry


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    missing = [src for src, _, _ in RULES if not (SRC / src).exists()]
    if missing:
        print("ERROR — missing source assets:")
        for src in missing:
            print(f"  {SRC / src}")
        return 1

    if not args.dry_run:
        if DST.exists():
            shutil.rmtree(DST)  # generated tree — regenerated fully every run
        DST.mkdir(parents=True)

    report_entries = []
    for src_rel, dst_rel, rule in RULES:
        entry = process_one(SRC / src_rel, DST / dst_rel, rule, args.dry_run)
        entry["group"] = group_of(dst_rel)
        report_entries.append(entry)
        if not args.dry_run:
            print(f"{src_rel:44s} -> {dst_rel:36s} {entry['dstBytes'] // 1024:5d}KB  {entry.get('note', '')}")

    totals: dict[str, int] = {}
    for entry in report_entries:
        totals[entry["group"]] = totals.get(entry["group"], 0) + entry.get("dstBytes", 0)
    grand = sum(totals.values())

    report = {
        "generatedBy": "scripts/prepare-cocos-assets.py",
        "source": str(SRC.relative_to(REPO)),
        "excluded": ["plots/overlay_selected.png (defective: sand pile + keying residue)"],
        "totalsByGroup": {k: f"{v // 1024}KB" for k, v in sorted(totals.items())},
        "totalBytes": grand,
        "totalHuman": f"{grand / 1024 / 1024:.2f}MB",
        "files": report_entries,
    }
    if not args.dry_run:
        (DST / "prepare-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(f"\ntotal: {report['totalHuman']} in {len(report_entries)} files -> {DST}")
        for group, size in sorted(totals.items()):
            print(f"  {group:12s} {size // 1024:6d}KB")
    else:
        print(f"dry-run: {len(report_entries)} files planned")
    return 0


if __name__ == "__main__":
    sys.exit(main())
