/**
 * Regenerate plot-layout.json (art source of truth + Cocos resource copy) as a
 * CONTIGUOUS plot field.
 *
 * Pitch is NOT the 88px sprite box — it is the tile art's visible geometry, so
 * neighbouring plots share edges instead of showing grass slivers:
 *   plots/plot_grass_empty.png at 88px display has an opaque box of 81x55
 *   (margins: 3 left/right, 18 top, 15 bottom in image space). Inside it the
 *   top face is ~42.6 tall and the brown front face ~4.5; the remainder is the
 *   cast shadow. Tiling with pitchY = top+front = 47 makes each row cover the
 *   previous row's shadow while still showing its own front face; pitchX = 75
 *   (the narrowest tile is tilled at 74.9) keeps every state gap-free.
 *
 * The 6x4 block is centred in lawn_region_720 (the base art reserves that
 * rectangle as empty lawn — props must avoid it, see layout.ts lawnRegion()).
 *
 * Usage: node scripts/make-plot-layout.mjs [--cols 6] [--rows 4] [--pitch-x 75] [--pitch-y 47] [--dry-run]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const COLS = Number(process.argv[process.argv.indexOf('--cols') + 1]) || 6;
const ROWS = Number(process.argv[process.argv.indexOf('--rows') + 1]) || 4;
const PITCH_X = Number(process.argv[process.argv.indexOf('--pitch-x') + 1]) || 75;
const PITCH_Y = Number(process.argv[process.argv.indexOf('--pitch-y') + 1]) || 47;
const DRY = process.argv.includes('--dry-run');

const SRC = new URL('../assets/sprites/v13/map/plot-layout.json', import.meta.url).pathname;
const DST = new URL('../packages/client-mini/assets/resources/game/plot-layout.json', import.meta.url).pathname;

const prev = JSON.parse(readFileSync(SRC, 'utf8'));
const lawn = prev.lawn_region_720;

if (COLS * ROWS !== 24) throw new Error(`expected 24 plots, got ${COLS}x${ROWS}`);

const blockW = COLS * PITCH_X;
const blockH = ROWS * PITCH_Y;
const originX = (lawn[0] + lawn[2]) / 2 - blockW / 2;
const originY = (lawn[1] + lawn[3]) / 2 - blockH / 2;

const plots = [];
for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLS; col += 1) {
    const cx = originX + (col + 0.5) * PITCH_X;
    const cy = originY + (row + 0.5) * PITCH_Y;
    const r2 = (v) => Math.round(v * 10) / 10;
    plots.push({
      index: row * COLS + col,
      row,
      col,
      rect_720: [r2(cx - PITCH_X / 2), r2(cy - PITCH_Y / 2), r2(cx + PITCH_X / 2), r2(cy + PITCH_Y / 2)],
      center_720: [r2(cx), r2(cy)],
    });
  }
}

const out = {
  design_resolution: prev.design_resolution,
  asset_scale: prev.asset_scale,
  map_asset: prev.map_asset,
  lawn_region_720: lawn,
  // Tile PITCH (= touch cell): neighbouring plots tile edge to edge. Kept in
  // sync with the hit box in plotView.ts — do not "fix" it back to the sprite
  // box (88), that is what left grass slivers between rows.
  cell_size_720: [PITCH_X, PITCH_Y],
  note: 'rects in 720x1280 design coords; multiply by 2 for the 1440x2560 asset; '
    + 'engine renders plot sprites centered on center_720; adjacent pitch = tile visible box '
    + '(x) x top+front face (y) so the field is contiguous',
  plots,
};

const body = `${JSON.stringify(out, null, 2)}\n`;
if (!DRY) {
  writeFileSync(SRC, body);
  writeFileSync(DST, body);
}
console.log(`${DRY ? '[dry-run] ' : ''}${COLS}x${ROWS} field pitch ${PITCH_X}x${PITCH_Y}`
  + ` block ${blockW}x${blockH} at (${originX.toFixed(1)}, ${originY.toFixed(1)}) in lawn [${lawn.join(', ')}]`);
console.log(`wrote ${SRC}`);
console.log(`wrote ${DST}`);
