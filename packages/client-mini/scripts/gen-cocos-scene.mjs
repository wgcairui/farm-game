/**
 * Generate assets/scenes/Main.scene + the two uuid-anchored .meta files.
 *
 * The scene body is the official Creator 3.8.8 2D template
 * (…/engine/editor/assets/default_file_content/scene/scene-2d.scene) with a
 * single edit: the OnlineFarm component appended to Canvas — the component
 * builds the whole UI at runtime, so the scene stays minimal.
 *
 * Script components are referenced by the COMPRESSED asset uuid
 * (first 5 hex chars + base64 packing of the remaining 27, 23 chars total).
 * Run: pnpm --filter @farm-game/client-mini gen:scene
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const ONLINE_FARM_UUID = '6f4c2a1e-8b3d-4c59-a2e7-9f0b1c2d3e4f';
const SCENE_UUID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const TEMPLATE = '/Applications/CocosCreator.app/Contents/Resources/resources/3d/engine/editor/assets/default_file_content/scene/scene-2d.scene';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function compressUuid(uuid) {
  const hex = uuid.replace(/-/g, '');
  let out = hex.slice(0, 5);
  for (let i = 5; i < 32; i += 3) {
    const v = parseInt(hex.slice(i, i + 3), 16);
    out += BASE64[v >> 6] + BASE64[v & 63];
  }
  return out;
}

const scene = JSON.parse(readFileSync(TEMPLATE, 'utf8'));
scene[0]._name = 'Main';
scene[1]._name = 'Main';

const onlineFarmComponent = {
  __type__: compressUuid(ONLINE_FARM_UUID),
  _name: '',
  _objFlags: 0,
  node: { __id__: 2 },
  _enabled: true,
  __prefab: null,
  _id: `of${randomUUID().slice(0, 8)}`,
};
scene[2]._components.push({ __id__: scene.length });
scene.push(onlineFarmComponent);

writeFileSync('assets/scenes/Main.scene', `${JSON.stringify(scene, null, 2)}\n`);
writeFileSync('assets/scenes/Main.scene.meta', `${JSON.stringify({
  ver: '1.1.46',
  importer: 'scene',
  imported: true,
  uuid: SCENE_UUID,
  files: ['.json'],
  subMetas: {},
  userData: {},
}, null, 2)}\n`);
writeFileSync('assets/scripts/OnlineFarm.ts.meta', `${JSON.stringify({
  ver: '4.0.24',
  importer: 'typescript',
  imported: true,
  uuid: ONLINE_FARM_UUID,
  files: [],
  subMetas: {},
  userData: {},
}, null, 2)}\n`);
console.log(`Main.scene written (component __type__=${onlineFarmComponent.__type__})`);
console.log(`scene uuid=${SCENE_UUID}`);
