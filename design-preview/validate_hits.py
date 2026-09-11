#!/usr/bin/env python3
"""Reproducible hit-target validator for farm design HTML.

Reads `farm-v25.html` (or any path given as argv[1]) at four widths
(375, 390, 430, 692) and measures every `.hit-target` element via
`getBoundingClientRect()`. Writes:

  * `hit-validation.json` — machine-readable per-target fields.
  * `hit-validation.md` — human-readable summary with failure counts.

This is the only audit considered authoritative for "HUD 命中区 ≥44×44 CSS px"
claims. The renderer (`render.py`) only captures the SVG element, so
its PNGs cannot prove hit-area properties.

Usage:
    python3 design-preview/validate_hits.py farm-v25.html
    python3 design-preview/validate_hits.py farm-v24.html    # baseline
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright


WIDTHS = (375, 390, 430, 692)
MIN_HIT_CSS = 44


def _rects(page) -> list[dict]:
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('.hit-target')).map(el => {
            const r = el.getBoundingClientRect();
            return {
                name: el.className.replace('hit-target hit-', ''),
                x: Math.round(r.x * 100) / 100,
                y: Math.round(r.y * 100) / 100,
                w: Math.round(r.width * 100) / 100,
                h: Math.round(r.height * 100) / 100,
                x1: Math.round((r.x + r.width) * 100) / 100,
                y1: Math.round((r.y + r.height) * 100) / 100
            };
        })"""
    )


def _validate_for_width(width: int, rects: list[dict]) -> dict:
    targets = len(rects)
    too_small = [r for r in rects if r["w"] < MIN_HIT_CSS or r["h"] < MIN_HIT_CSS]
    overflow = [
        r for r in rects
        if r["x"] < 0 or r["y"] < 0 or r["x1"] > width or r["y1"] > 1500
    ]
    # Pairwise intersections
    overlaps = []
    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            a, b = rects[i], rects[j]
            ix0, iy0 = max(a["x"], b["x"]), max(a["y"], b["y"])
            ix1, iy1 = min(a["x1"], b["x1"]), min(a["y1"], b["y1"])
            if ix1 > ix0 and iy1 > iy0:
                ov = (ix1 - ix0) * (iy1 - iy0)
                pair_area = min(a["w"] * a["h"], b["w"] * b["h"]) or 1
                pct = ov / pair_area
                if pct > 0.06:
                    overlaps.append(
                        {"a": a["name"], "b": b["name"],
                         "overlap_px": round(ov, 2), "overlap_pct": round(pct * 100, 1)}
                    )
    return {
        "viewport_width_px": width,
        "target_count": targets,
        "too_small": too_small,
        "overflow": overflow,
        "overlap_pairs": overlaps,
        "pass": not too_small and not overflow and not overlaps,
    }


def main() -> None:
    html = Path(sys.argv[1] if len(sys.argv) > 1 else "farm-v25.html").resolve()
    out_dir = html.parent
    url = html.as_uri()
    results = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        try:
            for w in WIDTHS:
                ctx = b.new_context(viewport={"width": w, "height": 1500},
                                    device_scale_factor=1)
                page = ctx.new_page()
                page.goto(url)
                page.wait_for_load_state("networkidle")
                rects = _rects(page)
                results.append({"width": w, **_validate_for_width(w, rects),
                                "targets": rects})
                ctx.close()
        finally:
            b.close()

    json_path = out_dir / "hit-validation.json"
    md_path = out_dir / "hit-validation.md"
    json_path.write_text(
        json.dumps({"source": html.name, "results": results}, indent=2),
        encoding="utf-8")

    lines = [f"# Hit-target validation — `{html.name}`",
             "",
             f"Min CSS hit size: **{MIN_HIT_CSS}×{MIN_HIT_CSS} px**.",
             f"Widths tested: {', '.join(str(w) for w in WIDTHS)}.",
             ""]
    for r in results:
        status = "✅" if r["pass"] else "❌"
        lines.append(f"## {status} viewport = {r['viewport_width_px']}px")
        lines.append("")
        lines.append(f"- Targets measured: **{r['target_count']}**")
        lines.append(f"- Too-small (<{MIN_HIT_CSS}px): **{len(r['too_small'])}**")
        lines.append(f"- Out-of-viewport: **{len(r['overflow'])}**")
        lines.append(f"- Overlapping pairs (>6%): **{len(r['overlap_pairs'])}**")
        if r["too_small"]:
            lines.append("")
            lines.append("### Too-small targets")
            lines.append("| name | w×h (CSS px) |")
            lines.append("|---|---|")
            for t in r["too_small"]:
                lines.append(f"| `{t['name']}` | {t['w']}×{t['h']} |")
        if r["overflow"]:
            lines.append("")
            lines.append("### Out-of-viewport targets")
            lines.append("| name | bbox (x,y)–(x1,y1) |")
            lines.append("|---|---|")
            for t in r["overflow"]:
                lines.append(
                    f"| `{t['name']}` | ({t['x']},{t['y']})–({t['x1']},{t['y1']}) |")
        if r["overlap_pairs"]:
            lines.append("")
            lines.append("### Overlapping pairs")
            lines.append("| a | b | overlap px² | pct |")
            lines.append("|---|---|---|---|")
            for o in r["overlap_pairs"]:
                lines.append(
                    f"| `{o['a']}` | `{o['b']}` | {o['overlap_px']} | {o['overlap_pct']}% |")
        lines.append("")
    md_path.write_text("\n".join(lines), encoding="utf-8")

    # Stdout summary for CI / shell inspection
    overall = all(r["pass"] for r in results)
    for r in results:
        flag = "PASS" if r["pass"] else "FAIL"
        print(f"[{flag}] width={r['viewport_width_px']}px "
              f"targets={r['target_count']} "
              f"small={len(r['too_small'])} "
              f"overflow={len(r['overflow'])} "
              f"overlap={len(r['overlap_pairs'])}")
    print(f"wrote {json_path.name} and {md_path.name}")
    sys.exit(0 if overall else 1)


if __name__ == "__main__":
    main()