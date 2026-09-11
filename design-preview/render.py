#!/usr/bin/env python3
"""Render farm-vNN HTML to PNG via Playwright (headless Chromium).

Behavior (2026-09-11):
  - Opens the HTML at the viewport width passed on the CLI (or 692 by default).
  - Screenshots the `#stage` element — this captures both the SVG scene
    AND the HTML `.hit-layer` that sits on top of it.
  - The 13 semantic hit-targets are NOT included in the screenshot as
    visible artifacts (the layer is `pointer-events:none` except for the
    button cells). For hit-area claims use `validate_hits.py`, which
    reads `getBoundingClientRect()` on every `.hit-target`.

Usage:
    python3 design-preview/render.py farm-v25.html final-v25.png
    python3 design-preview/render.py farm-v25.html mobile-v25-375.png 375
"""
from __future__ import annotations
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright


def render(html: Path, out: Path, viewport_w: int = 692) -> None:
    """Open html in headless Chromium and screenshot the #stage element."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": viewport_w, "height": 1500},
            device_scale_factor=1,
        )
        page = ctx.new_page()
        page.goto(html.absolute().as_uri())
        page.wait_for_load_state("networkidle")
        page.locator("#stage").first.screenshot(path=str(out))
        browser.close()


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: render.py <input.html> <output.png> [viewport_width]")
        sys.exit(2)
    html = Path(sys.argv[1])
    out = Path(sys.argv[2])
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 692
    render(html, out, width)
    size = out.stat().st_size
    print(f"wrote {out}  ({size / 1024:.1f} KB, viewport_width={width})")


if __name__ == "__main__":
    main()