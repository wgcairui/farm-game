#!/usr/bin/env python3
"""Reproducible hit-target validator for farm design HTML.

Collects hit-target rects via Playwright getBoundingClientRect() and validates
geometric, structural, and (optionally) state properties.

CLI — backward-compatible with old usage:
    python3 design-preview/validate_hits.py farm-v25.html

New options:
    --output-dir DIR
    --state normal|guided   (passed via URL ?state=, not dataset patching)
    --input-json FILE      (offline revalidation)
    --source PATH          (compute generator script SHA-256 for source_hash)

Offline revalidation schema (minimal valid collection JSON):
{
  "version": "2",
  "source": "farm-v25.html",
  "source_hash": null,           // SHA-256 of generator script, or null
  "html_hash": "sha256-hex",    // SHA-256 of HTML file at collection time
  "collected_at": "ISO-8601",   // time of browser collection
  "validator_hash": "sha256-hex", // SHA-256 of this script at revalidation time
  "state": "normal",            // requested state at collection time
  "viewport_width": 692,         // MUST match viewport_width_px in results
  "viewport_height": 1500,
  "completeness": "full",        // "full" = all 4 widths present, "partial" = single width
  "results": [
    {
      "viewport_width_px": 692,
      "viewport_width": 692,       // schema field (alias, both accepted)
      "stage_rect": {              // actual #stage getBoundingClientRect at collection
        "x": 0, "y": 0, "width": 692, "height": 1218
      },
      "viewport_rect": {           // actual window dimensions
        "width": 692, "height": 1500
      },
      "document_overflow_x": false, // scrollWidth > clientWidth
      "document_overflow_y": false,
      "targets": [
        {
          "name": "share",
          "x": 30.0, "y": 180.0, "w": 60.0, "h": 60.0,
          "x1": 90.0, "y1": 240.0,
          "data-target": "share",       // or absent if legacy class mode
          "hit_element": "BUTTON",
          "routing_check": {              // elementFromPoint at key positions
            "center": "hit-share",         // element at center point
            "top_center": "hit-share",     // element at top-center
            "bottom_center": "hit-share"    // element at bottom-center
          }
        }
      ]
    }
  ]
}

Required fields per result: viewport_width_px, stage_rect, targets (non-empty array),
each target must have: name (string), x, y, w, h, x1, y1 (all finite numbers, not bool).

Partial results (single width) are marked "partial"; completeness check fails if
"full" is expected but only "partial" provided.  Re-validation must not trust
the input 'pass' field.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

WIDTHS = (375, 390, 430, 692)
MIN_HIT_CSS = 44

# Expected 13 semantic target names — written explicitly per S3 requirement,
# not imported from the module under test.
EXPECTED_TARGET_NAMES = frozenset({
    "share", "music", "menu", "shop", "charity", "farm",
    "task", "friend-close", "warehouse", "nav-shop", "pet", "dress", "friend",
})

# Tiny absolute overlap tolerance in CSS px². Any overlap > this fails.
# This is not a percentage — it is a geometric precision floor.
OVERLAP_TOLERANCE_PX2 = 1e-9


# ====================================================================== browser
def _collect_browser_data(page, state: str | None) -> dict:
    """Collect stage rect, viewport rect, hit-target rects, and routing checks.

    This is the ONLY authoritative data source for geometric validation.
    No hardcoded stage dimensions are used in collection.

    Routing check returns BOOLEAN: true if element at point is the target or
    contained within target, false otherwise. String values indicate raw element
    identification and must be validated separately.
    """
    return page.evaluate(
        """(stateRequested) => {
            const stage = document.getElementById('stage');
            const stageRect = stage ? stage.getBoundingClientRect() : null;
            const sw = document.documentElement.scrollWidth;
            const cw = document.documentElement.clientWidth;
            const sh = document.documentElement.scrollHeight;
            const ch = document.documentElement.clientHeight;

            const targets = [];
            document.querySelectorAll('.hit-target').forEach(el => {
                const r = el.getBoundingClientRect();
                // data-target MUST be present and non-empty — NO class fallback
                const dt = (el.dataset && el.dataset.target) || '';
                const name = dt;  // Require non-empty data-target, no silent class fallback

                // Routing check: elementFromPoint at center and key positions
                // Returns BOOLEAN: isTarget = (el === target) || target.contains(el)
                const cx = r.x + r.width / 2;
                const cy = r.y + r.height / 2;
                const tcy = r.y + r.height * 0.25;
                const bcy = r.y + r.height * 0.75;
                const hitAtBool = (px, py) => {
                    const hit = document.elementFromPoint(px, py);
                    if (!hit) return false;
                    return hit === el || el.contains(hit);
                };

                // String-based identification for debugging (not used in validation)
                const hitAtStr = (px, py) => {
                    const el = document.elementFromPoint(px, py);
                    if (!el) return 'none';
                    return el.className || el.id || el.tagName;
                };

                targets.push({
                    name: String(name),
                    x: r.x,
                    y: r.y,
                    w: r.width,
                    h: r.height,
                    x1: r.x + r.width,
                    y1: r.y + r.height,
                    'data-target': dt,
                    hit_element: el.tagName,
                    routing_check: {
                        center: hitAtBool(cx, cy),
                        top_center: hitAtBool(cx, tcy),
                        bottom_center: hitAtBool(cx, bcy)
                    },
                    routing_check_debug: {
                        center: hitAtStr(cx, cy),
                        top_center: hitAtStr(cx, tcy),
                        bottom_center: hitAtStr(cx, bcy)
                    }
                });
            });

            // Verify actual dataset.state matches requested
            const actualState = (document.documentElement.dataset || {}).state || null;
            const stateMatch = stateRequested
                ? actualState === stateRequested
                : (actualState === null || actualState === undefined);

            return {
                stage_rect: stageRect ? {
                    x: stageRect.x, y: stageRect.y,
                    width: stageRect.width, height: stageRect.height
                } : null,
                viewport_rect: { width: window.innerWidth, height: window.innerHeight },
                document_overflow_x: sw > cw,
                document_overflow_y: sh > ch,
                targets,
                state_support: {
                    document_dataset_state: 'state' in (document.documentElement.dataset || {}),
                    // Check dataset.target (not 'data-target' in dataset)
                    hit_target_data_target: targets.length > 0 && targets[0]
                        && (document.querySelector('.hit-target').dataset || {}).target !== undefined
                },
                actual_state: actualState,
                state_match: stateMatch,
                state_requested: stateRequested
            };
        }""",
        state,
    )


# ====================================================================== geometry
def _validate_rect_geometry(target: dict) -> list[str]:
    """Check that a target dict has valid finite numeric rect fields and consistent bbox.

    Returns list of error strings (empty = valid).
    """
    errors = []
    for field in ("x", "y", "w", "h", "x1", "y1"):
        val = target.get(field)
        if val is None:
            errors.append(f"missing field '{field}'")
            continue
        if isinstance(val, bool):
            errors.append(f"field '{field}' is bool, must be finite number")
            continue
        if not isinstance(val, (int, float)):
            errors.append(f"field '{field}'={val!r} is not a number")
            continue
        if math.isnan(val) or math.isinf(val):
            errors.append(f"field '{field}'={val} is NaN or Inf")
    if not errors:
        # Check bbox consistency: x1 ≈ x + w, y1 ≈ y + h
        x, w, x1 = target["x"], target["w"], target["x1"]
        y, h, y1 = target["y"], target["h"], target["y1"]
        if not math.isclose(x1, x + w, rel_tol=1e-4, abs_tol=1e-6):
            errors.append(f"bbox x inconsistent: x1={x1} != x+w={x+w}")
        if not math.isclose(y1, y + h, rel_tol=1e-4, abs_tol=1e-6):
            errors.append(f"bbox y inconsistent: y1={y1} != y+h={y+h}")
        if w < 0 or h < 0:
            errors.append(f"negative dimension w={w} h={h}")
    return errors


def _compute_overlaps(rects: list[dict]) -> list[dict]:
    """Compute ALL pairwise positive-area intersections using RAW float values.

    Any positive-area overlap fails validation unless it is below OVERLAP_TOLERANCE_PX2.
    The 6% label is recorded as 'severity' for human readability only.
    """
    pairs = []
    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            a, b = rects[i], rects[j]
            ix0 = max(a["x"], b["x"])
            iy0 = max(a["y"], b["y"])
            ix1 = min(a["x1"], b["x1"])
            iy1 = min(a["y1"], b["y1"])
            if ix1 > ix0 and iy1 > iy0:
                ov = (ix1 - ix0) * (iy1 - iy0)
                smaller_area = min(a["w"] * a["h"], b["w"] * b["h"])
                pct = (ov / smaller_area * 100) if smaller_area > 0 else 0
                # All overlaps fail except demonstrably negligible ones
                severity = "acceptable" if ov <= OVERLAP_TOLERANCE_PX2 else (
                    "excessive" if pct > 6.0 else "warning"
                )
                pairs.append({
                    "a": a["name"],
                    "b": b["name"],
                    "overlap_px": ov,
                    "overlap_pct": pct,
                    "severity": severity,
                })
    return pairs


def _validate_routing_check(target: dict, strict: bool = False) -> list[str]:
    """Validate routing_check for a target.

    When strict=False: missing routing_check returns no errors (for legacy/v1 compatibility).
    When strict=True (v2): routing_check is required and all points must be True.

    Returns list of error strings (empty = valid).
    """
    errors = []
    rc = target.get("routing_check")
    # In non-strict mode, missing routing_check is OK
    if rc is None:
        return [] if not strict else ["routing_check is missing (required in v2)"]

    if not isinstance(rc, dict):
        return [f"routing_check is {type(rc).__name__}, expected dict"]

    for point in ("center", "top_center", "bottom_center"):
        val = rc.get(point)
        if val is None:
            errors.append(f"routing_check.{point} is missing")
        elif not isinstance(val, bool):
            errors.append(f"routing_check.{point}={val!r} is not boolean (got {type(val).__name__})")
        elif val is False:
            errors.append(f"routing_check.{point}=false — routing failed (element not hit target)")

    return errors


# ====================================================================== validation
def validate_rects(
    result: dict,
    stage_h: float | None = None,
    stage_w: float | None = None,
    stage_x: float = 0.0,
) -> dict:
    """Validate collected browser data.

    Uses ACTUAL collected stage_rect / viewport_rect from the browser data.
    stage_h/stage_w/stage_x are optional overrides for offline revalidation
    when the original stage_rect is unavailable.

    All positive-area overlaps fail unless demonstrably negligible.
    """
    width = result.get("viewport_width_px") or result.get("viewport_width") or result.get("width")
    targets_raw = result.get("targets", [])

    # Schema: targets must be non-empty
    if not targets_raw:
        return {
            "viewport_width_px": width,
            "target_count": 0,
            "too_small": [],
            "overflow": [],
            "stage_overflow": [],
            "horizontal_overflow": [],
            "document_overflow_x": result.get("document_overflow_x", False),
            "document_overflow_y": result.get("document_overflow_y", False),
            "overlap_pairs": [],
            "pass": False,
            "fail_reason": "zero_targets",
            "geometry_errors": [],
            "schema_errors": ["targets array is empty"],
        }

    # Validate rect geometry for each target
    geometry_errors = []
    routing_check_errors = []
    for t in targets_raw:
        geometry_errors.extend(
            f"{t.get('name','?')}.{err}" for err in _validate_rect_geometry(t)
        )
        routing_check_errors.extend(
            f"{t.get('name','?')}.{err}" for err in _validate_routing_check(t)
        )

    # Use actual stage rect from collection, or override
    # The #stage element may be offset from the viewport (e.g. centered).
    # Both x and y offsets must be accounted for.
    sr = result.get("stage_rect")
    if sr:
        eff_stage_x = float(sr.get("x", 0.0))
        eff_stage_y = float(sr.get("y", 0.0))
        eff_stage_w = float(sr.get("width", stage_w or 692))
        eff_stage_h = float(sr.get("height", stage_h or 1218))
    else:
        eff_stage_x = float(stage_x)
        eff_stage_y = 0.0
        eff_stage_w = float(stage_w or 692)
        eff_stage_h = float(stage_h or 1218)

    vp = result.get("viewport_rect", {})
    vp_w = vp.get("width", width or 692)
    vp_h = vp.get("height", 1500)

    too_small = [t for t in targets_raw
                 if t.get("w", 0) < MIN_HIT_CSS or t.get("h", 0) < MIN_HIT_CSS]

    # Viewport overflow: target rect extends outside the viewport
    overflow = [
        t for t in targets_raw
        if t.get("x", 0) < 0 or t.get("y", 0) < 0
           or t.get("x1", 0) > vp_w or t.get("y1", 0) > vp_h
    ]

    # Stage boundary overflow: target rect extends below or past the stage edges
    # The stage may be offset from the viewport left edge (e.g. centered)
    stage_overflow = [
        t for t in targets_raw
        if t.get("y1", 0) > eff_stage_h + eff_stage_y  # below stage bottom
           or t.get("y", 0) < eff_stage_y               # above stage top
    ]

    horizontal_overflow = [
        t for t in targets_raw
        if t.get("x1", 0) > eff_stage_w + eff_stage_x  # right of stage right edge
           or t.get("x", 0) < eff_stage_x               # left of stage left edge
    ]

    overlaps = _compute_overlaps(targets_raw)
    failing_overlaps = [p for p in overlaps if p["severity"] != "acceptable"]

    fail_reason = None
    if not targets_raw:
        fail_reason = "zero_targets"
    elif geometry_errors:
        fail_reason = "geometry_errors"
    elif routing_check_errors:
        fail_reason = "routing_check_failed"
    elif too_small:
        fail_reason = "too_small"
    elif overflow:
        fail_reason = "viewport_overflow"
    elif stage_overflow:
        fail_reason = "stage_overflow"
    elif horizontal_overflow:
        fail_reason = "horizontal_overflow"
    elif failing_overlaps:
        fail_reason = "overlaps"
    elif result.get("document_overflow_x") is True:
        fail_reason = "document_overflow_x"
    elif result.get("document_overflow_y") is True:
        fail_reason = "document_overflow_y"

    pass_ = fail_reason is None

    return {
        "viewport_width_px": width,
        "stage_height": eff_stage_h,
        "stage_width": eff_stage_w,
        "stage_x": eff_stage_x,
        "viewport_height": vp_h,
        "target_count": len(targets_raw),
        "too_small": too_small,
        "overflow": overflow,
        "stage_overflow": stage_overflow,
        "horizontal_overflow": horizontal_overflow,
        "document_overflow_x": result.get("document_overflow_x", False),
        "document_overflow_y": result.get("document_overflow_y", False),
        "overlap_pairs": overlaps,
        "failing_overlaps": failing_overlaps,
        "geometry_errors": geometry_errors,
        "routing_check_errors": routing_check_errors,
        "schema_errors": [],
        "pass": pass_,
        "fail_reason": fail_reason,
    }


# ====================================================================== browser entry point
def collect_for_width(width: int, url: str, state: str | None) -> dict:
    """Launch browser, navigate to url (with ?state= if requested), collect data."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": width, "height": 1500},
            device_scale_factor=1,
        )
        page = ctx.new_page()
        # Pass state via URL parameter — NO dataset patching
        if state is not None:
            import urllib.parse
            parts = url.split("?")
            base = parts[0]
            params = urllib.parse.parse_qs(parts[1]) if len(parts) > 1 else {}
            params["state"] = state
            url_with_state = base + "?" + urllib.parse.urlencode(params, doseq=True)
        else:
            url_with_state = url
        page.goto(url_with_state)
        page.wait_for_load_state("networkidle")

        raw = _collect_browser_data(page, state)
        browser.close()

    data = raw["targets"]
    raw_stage_rect = raw.get("stage_rect")
    validated = validate_rects(
        {
            "viewport_width_px": width,
            "targets": data,
            "stage_rect": raw_stage_rect,
            "viewport_rect": raw.get("viewport_rect"),
            "document_overflow_x": raw.get("document_overflow_x", False),
            "document_overflow_y": raw.get("document_overflow_y", False),
        }
    )
    validated["targets"] = data
    validated["stage_rect"] = raw_stage_rect   # preserve original rect for reporting
    validated["viewport_rect"] = raw.get("viewport_rect")
    validated["state_support"] = raw.get("state_support", {})
    validated["actual_state"] = raw.get("actual_state")
    validated["state_match"] = raw.get("state_match", True)
    validated["state_requested"] = state
    return validated


# ====================================================================== schema validation for input JSON
class SchemaValidationError(Exception):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__(f"Schema validation failed: {'; '.join(errors)}")


def _validate_collection_schema(data: dict) -> list[str]:
    """Strict schema validation for input JSON.

    Returns list of error strings (empty = valid).

    v2 schema requirements:
    - version field must be "2" (no implicit legacy fallback)
    - stage_rect must be a proper object with finite x, y, width, height
    - viewport_width_px must match the label
    - all 4 widths (375, 390, 430, 692) must be present exactly once
    - target w, h must be positive numbers (not zero or negative)
    - all target coordinates must be finite numbers (no NaN/Inf)
    - boolean values are not allowed for any numeric fields
    """
    errors = []

    # version check — v2 is strictly enforced, no implicit legacy
    version = data.get("version", None)
    if version is None:
        errors.append("missing 'version' field — v2 schema required, no implicit legacy fallback")
    elif version not in ("1", "2"):
        errors.append(f"unknown version '{version}' (expected '1' or '2')")

    # Top-level state must be legal enum or null
    top_state = data.get("state")
    if top_state is not None and top_state not in ("normal", "guided"):
        errors.append(f"top-level 'state' must be 'normal' or 'guided', got: {top_state!r}")

    # results must be non-empty array
    results = data.get("results")
    if results is None:
        errors.append("missing 'results' field")
        return errors  # can't continue
    if not isinstance(results, list):
        errors.append(f"'results' is {type(results).__name__}, expected array")
        return errors
    if len(results) == 0:
        errors.append("'results' is empty array — re-validation requires at least one width")
        return errors

    # For v2, check that all 4 widths are present exactly once
    if version == "2":
        seen_widths = []
        for i, r in enumerate(results):
            w = r.get("viewport_width_px") or r.get("viewport_width")
            if w is not None:
                seen_widths.append(w)
        if len(seen_widths) != len(set(seen_widths)):
            dupes = [w for w in seen_widths if seen_widths.count(w) > 1]
            errors.append(f"v2 schema requires unique widths, duplicates found: {sorted(set(dupes))}")
        missing_widths = set(WIDTHS) - set(seen_widths)
        if missing_widths and data.get("completeness") == "full":
            errors.append(f"v2 'full' completeness requires all 4 widths, missing: {sorted(missing_widths)}")

    for i, r in enumerate(results):
        prefix = f"results[{i}]"
        vp_label = r.get("viewport_width_px") or r.get("viewport_width")
        vpactual = r.get("viewport_width")

        # viewport_width_px required
        if vp_label is None:
            errors.append(f"{prefix}: missing viewport_width_px")

        # In v2, viewport_width_px must match the actual width label
        if version == "2" and vp_label is not None and vpactual is not None:
            if vp_label != vpactual:
                errors.append(
                    f"{prefix}: viewport_width_px={vp_label} does not match "
                    f"viewport_width={vpactual} — must be consistent"
                )

        # stage_rect required and must be proper object in v2
        if version == "2":
            sr = r.get("stage_rect")
            if sr is None:
                errors.append(f"{prefix}: missing 'stage_rect' (required in schema v2)")
            elif not isinstance(sr, dict):
                errors.append(f"{prefix}.stage_rect: is {type(sr).__name__}, expected object")
            else:
                for field in ("x", "y", "width", "height"):
                    val = sr.get(field)
                    if val is None:
                        errors.append(f"{prefix}.stage_rect: missing field '{field}'")
                    elif isinstance(val, bool):
                        errors.append(f"{prefix}.stage_rect.{field}: is bool, must be finite number")
                    elif not isinstance(val, (int, float)):
                        errors.append(f"{prefix}.stage_rect.{field}: is {type(val).__name__}, not a number")
                    elif math.isnan(val) or math.isinf(val):
                        errors.append(f"{prefix}.stage_rect.{field}: is NaN or Inf")
                # stage dimensions should be positive
                sw = sr.get("width")
                sh = sr.get("height")
                if sw is not None and sh is not None:
                    if not isinstance(sw, bool) and not isinstance(sh, bool):
                        if isinstance(sw, (int, float)) and isinstance(sh, (int, float)):
                            if not (math.isnan(sw) or math.isinf(sw) or math.isnan(sh) or math.isinf(sh)):
                                if sw <= 0 or sh <= 0:
                                    errors.append(
                                        f"{prefix}.stage_rect: width={sw} and height={sh} must be positive"
                                    )

        # viewport_rect must be object with finite width, height (positive numbers, not bool)
        vr = r.get("viewport_rect")
        if vr is None:
            errors.append(f"{prefix}: missing 'viewport_rect'")
        elif not isinstance(vr, dict):
            errors.append(f"{prefix}.viewport_rect: is {type(vr).__name__}, expected object")
        else:
            for field in ("width", "height"):
                val = vr.get(field)
                if val is None:
                    errors.append(f"{prefix}.viewport_rect: missing field '{field}'")
                elif isinstance(val, bool):
                    errors.append(f"{prefix}.viewport_rect.{field}: is bool, must be finite number")
                elif not isinstance(val, (int, float)):
                    errors.append(f"{prefix}.viewport_rect.{field}: is {type(val).__name__}, not a number")
                elif math.isnan(val) or math.isinf(val):
                    errors.append(f"{prefix}.viewport_rect.{field}: is NaN or Inf")
                elif val <= 0:
                    errors.append(f"{prefix}.viewport_rect.{field}: must be positive, got {val}")
            # viewport_rect.width must equal viewport_width_px
            vr_w = vr.get("width")
            if vr_w is not None and vp_label is not None:
                if not isinstance(vr_w, bool) and isinstance(vp_label, (int, float)):
                    if not (math.isnan(vr_w) or math.isinf(vr_w)):
                        if vr_w != vp_label:
                            errors.append(
                                f"{prefix}.viewport_rect.width={vr_w} != viewport_width_px={vp_label}"
                            )

        # Per-result state_requested and actual_state must be legal enum or null
        state_req = r.get("state_requested")
        actual_st = r.get("actual_state")
        if state_req is not None and state_req not in ("normal", "guided"):
            errors.append(f"{prefix}.state_requested: must be 'normal' or 'guided' or null, got: {state_req!r}")
        if actual_st is not None and actual_st not in ("normal", "guided"):
            errors.append(f"{prefix}.actual_state: must be 'normal' or 'guided' or null, got: {actual_st!r}")

        # document_overflow_x is required and must be bool
        dox = r.get("document_overflow_x")
        if dox is None:
            errors.append(f"{prefix}: missing 'document_overflow_x' (required bool)")
        elif not isinstance(dox, bool):
            errors.append(f"{prefix}.document_overflow_x: is {type(dox).__name__}, must be bool")

        # targets must be non-empty array
        targets = r.get("targets")
        if targets is None:
            errors.append(f"{prefix}: missing 'targets'")
        elif not isinstance(targets, list):
            errors.append(f"{prefix}: 'targets' is {type(targets).__name__}, expected array")
        elif len(targets) == 0:
            errors.append(f"{prefix}: 'targets' is empty")
        else:
            # Validate each target
            for j, t in enumerate(targets):
                tp = f"{prefix}.targets[{j}]"
                if not isinstance(t, dict):
                    errors.append(f"{tp}: is {type(t).__name__}, expected object")
                    continue
                for field in ("name", "x", "y", "w", "h", "x1", "y1"):
                    if field not in t:
                        errors.append(f"{tp}: missing field '{field}'")
                # Numeric checks
                for field in ("x", "y", "w", "h", "x1", "y1"):
                    val = t.get(field)
                    if val is None:
                        continue  # already flagged as missing
                    if isinstance(val, bool):
                        errors.append(f"{tp}.{field}: is bool, must be finite number")
                    elif not isinstance(val, (int, float)):
                        errors.append(f"{tp}.{field}: is {type(val).__name__}, not a number")
                    elif math.isnan(val) or math.isinf(val):
                        errors.append(f"{tp}.{field}: is NaN or Inf")
                # In v2, w and h must be positive
                if version == "2":
                    w_val = t.get("w")
                    h_val = t.get("h")
                    if w_val is not None and h_val is not None:
                        if not isinstance(w_val, bool) and not isinstance(h_val, bool):
                            if isinstance(w_val, (int, float)) and isinstance(h_val, (int, float)):
                                if not (math.isnan(w_val) or math.isinf(w_val) or math.isnan(h_val) or math.isinf(h_val)):
                                    if w_val <= 0 or h_val <= 0:
                                        errors.append(
                                            f"{tp}: w={w_val} and h={h_val} must be positive (v2 schema)"
                                        )
                # data-target must be present, non-null, non-empty string
                dt_val = t.get("data-target")
                if dt_val is None:
                    errors.append(f"{tp}: missing 'data-target' (required)")
                elif not isinstance(dt_val, str):
                    errors.append(f"{tp}.data-target: is {type(dt_val).__name__}, must be string")
                elif dt_val == "":
                    errors.append(f"{tp}.data-target: is empty string, must be non-empty")
                # name must equal data-target
                name_val = t.get("name")
                if name_val is not None and dt_val is not None:
                    if isinstance(name_val, str) and isinstance(dt_val, str) and name_val != dt_val:
                        errors.append(f"{tp}.name={name_val!r} != data-target={dt_val!r}")
                # In v2, routing_check must be valid
                if version == "2":
                    errors.extend(f"{tp}.{e}" for e in _validate_routing_check(t, strict=True))

    return errors


# ====================================================================== assertions
def _assert_target_count(result: dict, expected: int = 13) -> list[str]:
    errors = []
    count = result.get("target_count", 0)
    if count == 0:
        errors.append(
            f"[ASSERT] Zero targets found — empty page or hit-layer missing. "
            f"Expected {expected} semantic targets."
        )
    elif count != expected:
        names = sorted(t["name"] for t in result.get("targets", []) if "name" in t)
        errors.append(
            f"[ASSERT] Expected {expected} targets, got {count} ({' '.join(names)})."
        )
    return errors


def _assert_unique_names(result: dict) -> list[str]:
    errors = []
    names = [t.get("name") for t in result.get("targets", []) if "name" in t]
    if len(names) != len(set(names)):
        dupes = sorted(n for n in names if names.count(n) > 1)
        errors.append(f"[ASSERT] Duplicate target names: {dupes}")
    return errors


def _assert_expected_set(result: dict) -> list[str]:
    errors = []
    seen = frozenset(t.get("name") for t in result.get("targets", []) if "name" in t)
    missing = EXPECTED_TARGET_NAMES - seen
    unexpected = seen - EXPECTED_TARGET_NAMES
    if missing:
        errors.append(f"[ASSERT] Missing expected targets: {sorted(missing)}")
    if unexpected:
        errors.append(f"[ASSERT] Unexpected targets not in spec: {sorted(unexpected)}")
    return errors


def _assert_state_match(result: dict, requested_state: str | None) -> list[str]:
    """Verify that actual DOM state matches the requested state."""
    errors = []
    if requested_state is not None:
        actual = result.get("actual_state")
        match = result.get("state_match", True)
        if not match:
            errors.append(
                f"[ASSERT] State mismatch: requested ?state={requested_state} "
                f"but actual dataset.state={actual!r}. Page did not apply state."
            )
    return errors


def _assert_completeness(data: dict, expect_full: bool) -> list[str]:
    """Check that results cover all 4 required widths (or are explicitly partial)."""
    errors = []
    completeness = data.get("completeness", "unknown")
    results = data.get("results", [])
    seen_widths = {r.get("viewport_width_px") or r.get("viewport_width") for r in results}

    if expect_full and completeness == "partial":
        errors.append(
            f"[ASSERT] Input JSON claims 'partial' coverage but re-validation "
            f"requires 'full' (4 widths). Found widths: {sorted(seen_widths)}"
        )
    if completeness not in ("full", "partial"):
        errors.append(
            f"[ASSERT] Input JSON missing or invalid 'completeness' field "
            f"(expected 'full' or 'partial'), got: {completeness!r}"
        )
    if expect_full:
        missing_widths = set(WIDTHS) - seen_widths
        if missing_widths:
            errors.append(
                f"[ASSERT] Missing required widths: {sorted(missing_widths)}. "
                f"Present: {sorted(seen_widths)}"
            )
    return errors


def run_assertions(results: list[dict], requested_state: str | None) -> list[str]:
    all_errors = []
    for r in results:
        all_errors.extend(_assert_target_count(r))
        all_errors.extend(_assert_unique_names(r))
        all_errors.extend(_assert_expected_set(r))
        all_errors.extend(_assert_state_match(r, requested_state))
    return all_errors


# ====================================================================== input-json helpers
def load_input_json(path: Path) -> dict:
    """Load and normalize a collection JSON.

    Accepts:
      - Single-width: dict with 'targets' key
      - Multi-width: dict with 'results' key

    Returns dict always with a 'results' list.
    Raises json.JSONDecodeError on parse failure.
    """
    data = json.loads(path.read_text(encoding="utf-8"))
    if "results" in data:
        return data
    elif "targets" in data:
        return {"results": [data]}
    else:
        raise ValueError(
            f"Input JSON has neither 'targets' nor 'results' key. "
            f"Required schema: see validate_hits.py docstring."
        )


# ====================================================================== report
def write_report(out_dir: Path, report: dict) -> None:
    json_path = out_dir / "hit-validation.json"
    md_path = out_dir / "hit-validation.md"

    json_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    results = report.get("results", [])
    lines = [
        f"# Hit-target validation — `{report.get('source', 'unknown')}`",
        "",
        f"Version: {report.get('version', 'n/a')}",
        f"Min CSS hit size: **{MIN_HIT_CSS}×{MIN_HIT_CSS} px**.",
        f"Overlap tolerance: **{report.get('overlap_tolerance_px2', OVERLAP_TOLERANCE_PX2)} px²**.",
        f"Widths tested: {', '.join(str(r.get('viewport_width_px', '?')) for r in results)}.",
        f"Source hash: `{report.get('source_hash', 'n/a')}` (current generator only, not generation association).",
        f"HTML hash: `{report.get('html_hash', 'n/a')}`.",
        f"Validator hash: `{report.get('validator_hash', 'n/a')}`.",
        f"Collected: {report.get('collected_at', 'n/a')}.",
        f"Validated: {report.get('generated_at', 'n/a')}.",
        f"State: {report.get('state', 'unset')}.",
        f"Completeness: {report.get('completeness', 'n/a')}.",
        f"Output path: `{report.get('out_path', 'n/a')}`.",
        f"URL: {report.get('url', 'n/a')}.",
        "",
    ]
    if report.get("schema_errors"):
        lines.append(f"## Schema errors: {len(report['schema_errors'])}")
        for e in report["schema_errors"]:
            lines.append(f"- `{e}`")
        lines.append("")
    if report.get("assertion_errors"):
        lines.append(f"## Assertion failures: {len(report['assertion_errors'])}")
        for e in report["assertion_errors"]:
            lines.append(f"- `{e}`")
        lines.append("")

    for r in results:
        flag = "PASS" if r.get("pass") else "FAIL"
        fr = r.get("fail_reason")
        lines.append(f"## [{flag}] viewport={r.get('viewport_width_px','?')}px "
                     + (f"(reason={fr})" if fr else ""))
        lines.append("")
        lines.append(f"- Targets: **{r.get('target_count', 0)}**")
        lines.append(f"- Fail reason: {fr or 'none'}")
        lines.append(f"- Too-small: **{len(r.get('too_small', []))}**")
        lines.append(f"- Viewport overflow: **{len(r.get('overflow', []))}**")
        lines.append(f"- Stage boundary overflow: **{len(r.get('stage_overflow', []))}**")
        lines.append(f"- Horizontal overflow: **{len(r.get('horizontal_overflow', []))}**")
        lines.append(f"- Document overflow x: **{r.get('document_overflow_x', False)}**")
        lines.append(f"- Document overflow y: **{r.get('document_overflow_y', False)}**")
        lines.append(f"- All overlap pairs: **{len(r.get('overlap_pairs', []))}**")
        lines.append(f"- Failing overlaps: **{len(r.get('failing_overlaps', []))}**")
        if r.get("geometry_errors"):
            lines.append(f"- Geometry errors: {r['geometry_errors']}")
        if r.get("state_support"):
            ss = r["state_support"]
            lines.append(
                f"- State: dataset.state={ss.get('document_dataset_state')}, "
                f"data-target={ss.get('hit_target_data_target')}, "
                f"actual={r.get('actual_state')}, match={r.get('state_match')}"
            )
        if r.get("stage_rect"):
            sr = r["stage_rect"]
            lines.append(f"- Stage rect: x={sr.get('x')} y={sr.get('y')} "
                         f"w={sr.get('width')} h={sr.get('height')}")
        for cat, items, fields in [
            ("Too-small targets", r.get("too_small", []),
             ["name", "w", "h"]),
            ("Viewport overflow", r.get("overflow", []),
             ["name", "x", "y", "x1", "y1"]),
            ("Stage boundary overflow", r.get("stage_overflow", []),
             ["name", "y", "y1"]),
            ("Horizontal overflow", r.get("horizontal_overflow", []),
             ["name", "x", "x1"]),
        ]:
            if items:
                lines.append("")
                lines.append(f"### {cat}")
                lines.append("| " + " | ".join(fields) + " |")
                lines.append("| " + " | ".join(["---"] * len(fields)) + " |")
                for t in items:
                    lines.append("| " + " | ".join(str(t.get(f, "")) for f in fields) + " |")
        if r.get("overlap_pairs"):
            lines.append("")
            lines.append("### Overlapping pairs")
            lines.append("| a | b | overlap px² | pct | severity |")
            lines.append("|---|---|---|---|---|")
            for o in r["overlap_pairs"]:
                lines.append(
                    f"| `{o['a']}` | `{o['b']}` | {o['overlap_px']:.6f} | "
                    f"{o['overlap_pct']:.4f}%% | {o['severity']} |"
                )
        lines.append("")

    md_path.write_text("\n".join(lines), encoding="utf-8")


# ====================================================================== main
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate hit targets in farm HTML. "
                    "Old CLI: validate_hits.py farm-v25.html. "
                    "New options: --output-dir, --state, --input-json, --source, --hash."
    )
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument(
        "--state", choices=["normal", "guided"], default=None,
        help="Request state via URL ?state= parameter. "
             "After load, verifies actual dataset.state matches. "
             "NO dataset patching."
    )
    parser.add_argument(
        "--input-json", type=Path, default=None,
        help="Offline revalidation from a pre-collected JSON file."
    )
    parser.add_argument(
        "--source", type=Path, default=None,
        help="Path to generator script. If provided, compute its SHA-256 "
             "and store as source_hash (distinct from html_hash)."
    )
    parser.add_argument(
        "--hash", action="store_true",
        help="Print source, HTML, and validator hashes."
    )
    parser.add_argument(
        "html", type=Path, nargs="?", default=None,
        help="Input HTML file (not used in --input-json mode)."
    )

    args = parser.parse_args()

    # Compute validator hash (hash of this script)
    validator_path = Path(__file__).resolve()
    validator_hash = hashlib.sha256(validator_path.read_bytes()).hexdigest()[:16]

    # ---- input-json (offline) mode ----
    if args.input_json is not None:
        def _reject_nan_inf(ws):
            """Reject NaN/Inf constants in JSON."""
            if ws in ("NaN", "Infinity", "-Infinity"):
                raise ValueError(f"JSON parse error: {ws} is not allowed")
            return ws
        try:
            data = json.loads(
                args.input_json.read_text(encoding="utf-8"),
                parse_constant=_reject_nan_inf
            )
        except (json.JSONDecodeError, ValueError) as e:
            err_report = {
                "version": None,
                "source": args.input_json.name,
                "html_hash": "",
                "source_hash": None,
                "validator_hash": validator_hash,
                "collected_at": "",
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "state": args.state,
                "schema_errors": [f"invalid JSON: {e}"],
                "results": [],
                "pass": False,
                "fail_reason": "json_parse_error",
            }
            out_dir = args.output_dir or Path.cwd()
            out_dir.mkdir(parents=True, exist_ok=True)
            write_report(out_dir, err_report)
            print(f"JSON parse error: {e}", file=sys.stderr)
            sys.exit(1)

        # All remaining offline validation work
        try:
            # Schema validation
            schema_errors = _validate_collection_schema(data)
            if schema_errors:
                print("Schema validation errors:", file=sys.stderr)
                for e in schema_errors:
                    print(f"  {e}", file=sys.stderr)
                # Write error report
                err_report = {
                    "version": data.get("version", "1"),
                    "source": data.get("source", args.input_json.name),
                    "html_hash": data.get("html_hash", ""),
                    "source_hash": data.get("source_hash"),
                    "validator_hash": validator_hash,
                    "collected_at": data.get("collected_at", ""),
                    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "state": args.state or data.get("state"),
                    "schema_errors": schema_errors,
                    "results": [],
                    "pass": False,
                    "fail_reason": "schema_validation_failed",
                }
                out_dir = args.output_dir or Path.cwd()
                out_dir.mkdir(parents=True, exist_ok=True)
                write_report(out_dir, err_report)
                sys.exit(1)

            # Validate each result (do NOT trust input 'pass' or 'state_match' field)
            validated_results = []
            all_assertion_errors = []
            # state_requested comes from DATA, not CLI --state
            # CLI --state is only for ASSERTION purposes
            for r in data.get("results", []):
                val = validate_rects(r)
                val["targets"] = r.get("targets", [])
                val["state_support"] = r.get("state_support", {})
                val["actual_state"] = r.get("actual_state")
                # state_requested comes from data, not CLI override
                data_state_requested = r.get("state_requested")
                val["state_requested"] = data_state_requested
                # Recalculate state_match: trust nothing, compute from evidence
                actual_state = r.get("actual_state")
                if data_state_requested is not None:
                    # If state was in data, actual_state must match exactly
                    val["state_match"] = (actual_state == data_state_requested)
                else:
                    # If no state in data, match is true only if actual_state is null/undefined
                    val["state_match"] = (actual_state is None or actual_state == "")
                val["stage_rect"] = r.get("stage_rect")
                val["viewport_rect"] = r.get("viewport_rect")
                val["document_overflow_x"] = r.get("document_overflow_x", False)
                val["document_overflow_y"] = r.get("document_overflow_y", False)
                validated_results.append(val)
                all_assertion_errors.extend(_assert_target_count(val))
                all_assertion_errors.extend(_assert_unique_names(val))
                all_assertion_errors.extend(_assert_expected_set(val))
                # CLI --state only asserts, does not override
                if args.state is not None:
                    # If CLI --state was provided, assert actual_state matches
                    if actual_state != args.state:
                        all_assertion_errors.append(
                            f"[ASSERT] CLI --state={args.state} but actual_state={actual_state!r} "
                            f"in data for viewport={r.get('viewport_width_px','?')}px"
                        )

            # Completeness assertion
            all_assertion_errors.extend(_assert_completeness(data, expect_full=True))

            # Build report — compute overall pass FIRST, then write
            overall_pass = all(r.get("pass") for r in validated_results) and not all_assertion_errors

            # Build clean report dict without null fields or non-JSON objects
            report = {
                "version": data.get("version"),
                "source": data.get("source", args.input_json.name),
                "html_hash": data.get("html_hash", ""),
                "source_hash": data.get("source_hash"),
                "validator_hash": validator_hash,
                "collected_at": data.get("collected_at", ""),
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                # state comes from DATA, not CLI --state (CLI only asserts)
                "state": data.get("state"),
                "completeness": data.get("completeness"),
                "min_hit_css": MIN_HIT_CSS,
                "overlap_tolerance_px2": OVERLAP_TOLERANCE_PX2,
                "expected_targets": sorted(EXPECTED_TARGET_NAMES),
                "assertion_errors": all_assertion_errors,
                "schema_errors": [],
                "results": validated_results,
                "pass": overall_pass,
                "fail_reason": None if overall_pass else "assertion_failure",
            }
            # Remove None values for clean JSON
            report = {k: v for k, v in report.items() if v is not None}

            out_dir = args.output_dir or Path.cwd()
            out_dir.mkdir(parents=True, exist_ok=True)
            write_report(out_dir, report)

            for r in validated_results:
                flag = "PASS" if r.get("pass") else "FAIL"
                print(f"[{flag}] width={r.get('viewport_width_px','?')}px "
                      f"targets={r.get('target_count',0)} fail={r.get('fail_reason','none')}")
            if all_assertion_errors:
                print("Assertion failures:")
                for e in all_assertion_errors:
                    print(f"  {e}")
            print(f"wrote {out_dir / 'hit-validation.json'} and {out_dir / 'hit-validation.md'}")
            sys.exit(0 if overall_pass else 1)

        except Exception as e:
            # Unexpected error — write structured failure report, not raw traceback
            import traceback
            err_report = {
                "version": data.get("version", "1") if 'data' in dir() else None,
                "source": args.input_json.name if args.input_json else None,
                "html_hash": data.get("html_hash", "") if 'data' in dir() else "",
                "source_hash": None,
                "validator_hash": validator_hash,
                "collected_at": data.get("collected_at", "") if 'data' in dir() else "",
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "state": args.state,
                "schema_errors": [f"unexpected error: {type(e).__name__}: {e}"],
                "assertion_errors": [],
                "results": [],
                "pass": False,
                "fail_reason": "unexpected_error",
            }
            err_report = {k: v for k, v in err_report.items() if v is not None}
            out_dir = args.output_dir or Path.cwd()
            out_dir.mkdir(parents=True, exist_ok=True)
            write_report(out_dir, err_report)
            print(f"Unexpected error: {type(e).__name__}: {e}", file=sys.stderr)
            print(traceback.format_exc(), file=sys.stderr)
            sys.exit(1)

    # ---- browser mode ----
    html = Path(args.html or "farm-v25.html").resolve()
    if not html.exists():
        print(f"Error: {html} not found", file=sys.stderr)
        sys.exit(2)

    url = html.as_uri()
    out_dir = args.output_dir or html.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    html_bytes = html.read_bytes()
    html_hash = hashlib.sha256(html_bytes).hexdigest()[:16]

    source_hash = None
    if args.source:
        src_bytes = args.source.read_bytes()
        source_hash = hashlib.sha256(src_bytes).hexdigest()[:16]
        print(f"[hash] source={source_hash} html={html_hash} validator={validator_hash}",
              file=sys.stderr)
    elif args.hash:
        print(f"[hash] source=null html={html_hash} validator={validator_hash}",
              file=sys.stderr)

    collected_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    results = []
    for w in WIDTHS:
        print(f"Collecting viewport {w}px...", file=sys.stderr)
        r = collect_for_width(w, url, args.state)
        r["viewport_width_px"] = w
        results.append(r)

    assertion_errors = run_assertions(results, args.state)

    # State mismatch is an assertion failure
    for r in results:
        actual = r.get("actual_state")
        match = r.get("state_match", True)
        if args.state and not match:
            assertion_errors.append(
                f"[ASSERT] State mismatch at {r['viewport_width_px']}px: "
                f"requested ?state={args.state} but actual dataset.state={actual!r}"
            )

    report = {
        "version": "2",
        "source": html.name,
        "source_hash": source_hash,
        "html_hash": html_hash,
        "validator_hash": validator_hash,
        "collected_at": collected_at,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "state": args.state,
        "completeness": "full",
        "min_hit_css": MIN_HIT_CSS,
        "overlap_tolerance_px2": OVERLAP_TOLERANCE_PX2,
        "expected_targets": sorted(EXPECTED_TARGET_NAMES),
        "assertion_errors": assertion_errors,
        "schema_errors": [],
        "results": results,
        "out_path": str(out_dir / "hit-validation.json"),
        "elapsed_ms": None,  # Browser mode doesn't track total elapsed
        "url": url,
    }

    write_report(out_dir, report)

    overall_pass = (
        all(r.get("pass") for r in results)
        and not assertion_errors
    )

    for r in results:
        flag = "PASS" if r.get("pass") else "FAIL"
        print(f"[{flag}] width={r.get('viewport_width_px','?')}px "
              f"targets={r.get('target_count',0)} "
              f"fail={r.get('fail_reason','none')} "
              f"overlaps={len(r.get('failing_overlaps',[]))}")
    if assertion_errors:
        print("Assertion failures:")
        for e in assertion_errors:
            print(f"  {e}")
    print(f"wrote {out_dir / 'hit-validation.json'} and {out_dir / 'hit-validation.md'}")
    sys.exit(0 if overall_pass else 1)


if __name__ == "__main__":
    main()
