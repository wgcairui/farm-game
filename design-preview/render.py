#!/usr/bin/env python3
"""Render farm-vNN HTML to PNG via Playwright (headless Chromium).

Behavior (2026-09-11):
  - Opens the HTML at the viewport width passed on the CLI (or 692 by default).
  - Screenshots the `#stage` element — this captures the SVG scene AND the
    HTML `.hit-layer` that sits on top of it (pointer-events:none except
    for button cells). The screenshot includes both SVG visuals and the
    HTML overlay positioning.
  - Hit-target geometry claims are validated by validate_hits.py, which
    reads getBoundingClientRect() on every .hit-target.

CLI (backward-compatible):
    python3 design-preview/render.py farm-v25.html out.png 692
    python3 design-preview/render.py farm-v25.html out.png        # defaults to 692

New options:
    --output-dir DIR   Write output to DIR instead of HTML's directory.
    --state STATE     Append ?state=STATE to URL (normal|guided).
                       NO dataset patching — state is read-only after load.
    --source PATH      Path to generator script. Computes SHA-256 for source_hash.
    --hash            Print source, HTML, and validator hashes.
"""
from __future__ import annotations
import argparse
import hashlib
import sys
import time
import urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright


def render(
    html: Path,
    out: Path,
    viewport_w: int = 692,
    state: str | None = None,
    source_path: Path | None = None,
    compute_hash: bool = False,
) -> dict:
    """Open html in headless Chromium and screenshot the #stage element.

    State is passed via URL ?state= parameter — NO dataset patching.
    Returns a dict with keys: source_hash, html_hash, validator_hash,
    elapsed_ms, out_path, viewport_width, state.
    """
    validator_path = Path(__file__).resolve()
    validator_hash = hashlib.sha256(validator_path.read_bytes()).hexdigest()[:16]

    html_bytes = html.read_bytes()
    html_hash = hashlib.sha256(html_bytes).hexdigest()[:16]

    source_hash = None
    if source_path:
        source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()[:16]

    base_url = html.absolute().as_uri()
    if state is not None:
        parts = base_url.split("?")
        base = parts[0]
        params = urllib.parse.parse_qs(parts[1]) if len(parts) > 1 else {}
        params["state"] = state
        url = base + "?" + urllib.parse.urlencode(params, doseq=True)
    else:
        url = base_url

    t0 = time.monotonic()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": viewport_w, "height": 1500},
            device_scale_factor=1,
        )
        page = ctx.new_page()
        try:
            page.goto(url)
            page.wait_for_load_state("networkidle")

            # Verify actual DOM state matches requested state
            actual_state = page.evaluate(
                """() => {
                    const ds = (document.documentElement && document.documentElement.dataset) || {};
                    return ('state' in ds) ? String(ds.state) : null;
                }"""
            )
            state_match = (actual_state == state) if state is not None else (actual_state is None)

            # If state was explicitly requested but doesn't match, raise before screenshot
            if state is not None and not state_match:
                raise ValueError(
                    f"State mismatch: requested ?state={state} but actual dataset.state={actual_state!r}"
                )

            page.locator("#stage").first.screenshot(path=str(out))
        finally:
            browser.close()
    elapsed_ms = round((time.monotonic() - t0) * 1000)

    result = {
        "source_hash": source_hash,
        "html_hash": html_hash,
        "validator_hash": validator_hash,
        "elapsed_ms": elapsed_ms,
        "out_path": str(out),
        "viewport_width": viewport_w,
        "state": state,
        "actual_state": actual_state,
        "state_match": state_match,
        "url": url,
    }
    if compute_hash:
        print(f"[hash] source={source_hash} html={html_hash} validator={validator_hash}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Render farm HTML to PNG via Playwright.")
    parser.add_argument(
        "--output-dir", type=Path, default=None,
        help="Write output to DIR instead of HTML's directory."
    )
    parser.add_argument(
        "--state", choices=["normal", "guided"], default=None,
        help="Append ?state=STATE to URL (normal|guided). "
             "NO dataset patching — state is read-only after load."
    )
    parser.add_argument(
        "--source", type=Path, default=None,
        help="Path to generator script for source_hash."
    )
    parser.add_argument(
        "--hash", action="store_true",
        help="Print source, HTML, and validator hashes."
    )
    parser.add_argument("html", type=Path, help="Input HTML file.")
    parser.add_argument("out", type=Path, nargs="?", default=None,
                        help="Output PNG file.")
    parser.add_argument("viewport_w", type=int, nargs="?", default=692,
                        help="Viewport width (default 692).")

    args = parser.parse_args()

    if args.out is None:
        print("usage: render.py [--output-dir DIR] [--state normal|guided] "
              "[--source PATH] [--hash] <input.html> [output.png] [viewport_width]",
              file=sys.stderr)
        sys.exit(2)

    html = args.html.resolve()
    out = args.out

    if args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        out = args.output_dir / out.name

    try:
        result = render(
            html=html,
            out=out,
            viewport_w=args.viewport_w,
            state=args.state,
            source_path=args.source,
            compute_hash=args.hash,
        )
        size = out.stat().st_size
        print(f"wrote {out}  ({size / 1024:.1f} KB, "
              f"viewport_width={result['viewport_width']}, "
              f"state={result['state'] or 'unset'}, "
              f"{result['elapsed_ms']}ms)")
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
