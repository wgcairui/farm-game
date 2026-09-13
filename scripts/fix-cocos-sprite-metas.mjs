/**
 * Convert Cocos image .meta files from `texture` to `sprite-frame` import type.
 *
 * Why: the runtime loader (`assets/scripts/farm/assets.ts`) loads every key as
 * `game/<key>/spriteFrame`. Cocos's image importer only creates that
 * sub-asset when `userData.type === "sprite-frame"`; `.jpg`/`.png` files
 * added by scripts/prepare-cocos-assets.py land as `texture` and the whole
 * boot fails on the first key with
 *   `Bundle resources doesn't contain game/map/base/spriteFrame`
 * (runbook §11.7).
 *
 * Idempotent. Run after prepare-cocos-assets.py and before the Cocos CLI
 * build; the importer then materialises `<uuid>@f9941` sprite frames.
 *
 * Usage: node scripts/fix-cocos-sprite-metas.mjs [--dry-run]
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('../packages/client-mini/assets/resources/', import.meta.url).pathname;
const DRY = process.argv.includes('--dry-run');
const SPRITE_FRAME_ID = 'f9941';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(png|jpg|jpeg)\.meta$/.test(name)) out.push(p);
  }
  return out;
}

/** Pixel size straight from the file header (PNG IHDR / JPEG SOFn). */
function imageSize(file) {
  const b = readFileSync(file);
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  throw new Error(`unrecognised image header: ${file}`);
}

let converted = 0;
let skipped = 0;
for (const metaPath of walk(ROOT)) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const textureMeta = meta.subMetas?.['6c48a'];
  if (meta.importer !== 'image' || !textureMeta) { skipped += 1; continue; }
  if (meta.userData?.type === 'sprite-frame' && meta.subMetas?.[SPRITE_FRAME_ID]) { skipped += 1; continue; }

  const uuid = meta.uuid;
  const imgPath = metaPath.replace(/\.meta$/, '');
  const { width, height } = imageSize(imgPath);
  const name = basename(imgPath).replace(/\.[^.]+$/, '');

  meta.userData = { ...(meta.userData ?? {}), type: 'sprite-frame' };
  meta.userData.redirect = `${uuid}@${SPRITE_FRAME_ID}`;
  meta.subMetas[SPRITE_FRAME_ID] = {
    importer: 'sprite-frame',
    uuid: `${uuid}@${SPRITE_FRAME_ID}`,
    displayName: name,
    id: SPRITE_FRAME_ID,
    name: 'spriteFrame',
    userData: {
      trimType: 'auto',
      trimThreshold: 1,
      rotated: false,
      offsetX: 0,
      offsetY: 0,
      trimX: 0,
      trimY: 0,
      width,
      height,
      rawWidth: width,
      rawHeight: height,
      borderTop: 0,
      borderBottom: 0,
      borderLeft: 0,
      borderRight: 0,
      packable: true,
      pixelsToUnit: 100,
      pivotX: 0.5,
      pivotY: 0.5,
      meshType: 0,
      isUuid: true,
      imageUuidOrDatabaseUri: textureMeta.uuid,
      atlasUuid: '',
    },
    ver: '1.0.12',
    imported: true,
    files: ['.json'],
    subMetas: {},
  };

  if (!DRY) writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  converted += 1;
}

console.log(`${DRY ? '[dry-run] ' : ''}converted ${converted} image meta(s) to sprite-frame, skipped ${skipped}`);
