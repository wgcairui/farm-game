/**
 * assets — SpriteFrame preload registry for the home page
 * (implementation-plan-ui-v13.md §5/§6).
 *
 * Every path is relative to `resources/game/` and matches the tree produced by
 * `scripts/prepare-cocos-assets.py`. Keys keep the path shape (`plots/plot_locked`,
 * `crops/carrot/stage-1`) so callers ask for exactly what the report manifest lists.
 *
 * Loaded groups: map + plot-layout + plots + crops + icons + fx + ui always;
 * modules + parallax only when their layout flags are on (keeps startup light
 * and mirrors the runtime feature flags).
 */

import { resources, SpriteFrame } from 'cc';
import { SHOW_PARALLAX, SHOW_PROPS } from './layout';

export type SpriteMap = Record<string, SpriteFrame>;

const PLOT_KEYS = [
  'plots/plot_locked',
  'plots/plot_grass_empty',
  'plots/plot_tilled_empty',
  'plots/overlay_wet',
  'plots/overlay_ripe',
];

const CROP_IDS = ['carrot', 'corn', 'potato', 'strawberry', 'tomato'];

const ICON_KEYS = [
  'icons/coin_gold',
  'icons/coin_flying',
  'icons/harvest_sparkle',
  'icons/lock_sign',
  'icons/seed_bag',
  'icons/star_gold',
  'icons/water_drop',
  'icons/watering_can',
  // M6 2026-09-14: iOS-style nav icons (仓库 / 商店 / 宠物 / 装扮)
  'icons/ui_icon_crate',
  'icons/ui_icon_market',
  'icons/ui_icon_paw',
  'icons/ui_icon_palette',
];

const FX_KEYS = [
  'fx/plant_dust',
  'fx/water_splash',
  'fx/harvest_burst',
  'fx/coin_fly',
  'fx/levelup_badge',
  'fx/pond_water_a',
  'fx/pond_water_b',
];

const UI_KEYS = [
  'ui/ui_btn_close',
  'ui/ui_btn_confirm',
  'ui/ui_btn_round_red',
  'ui/ui_icon_share',
  'ui/ui_icon_music',
  'ui/ui_icon_menu',
  'ui/ui_icon_camera',
  'ui/ui_icon_pet',
  'ui/ui_icon_shop',
  'ui/ui_panel_gold_bar',
  'ui/ui_panel_cash_bar',
  'ui/ui_popup_panel',
  // M6 2026-09-14: 4-colour iOS tabbar buttons (红/橙/蓝/绿)
  'ui/ui_btn_tabbar_red',
  'ui/ui_btn_tabbar_orange',
  'ui/ui_btn_tabbar_blue',
  'ui/ui_btn_tabbar_green',
  // M7 2026-09-14: 侧栏 7 按钮（每按钮独立配色，避免跟 tabbar 4 色撞色）
  'ui/ui_btn_side_share',
  'ui/ui_btn_side_music',
  'ui/ui_btn_side_menu',
  'ui/ui_btn_side_camera',
  'ui/ui_btn_side_shop',
  'ui/ui_btn_side_pet',
  'ui/ui_btn_side_basket',
];

const MODULE_KEYS = [
  'modules/cottage',
  'modules/cottage_small',
  'modules/bush',
  'modules/fence_segment',
  'modules/fence_stones',
  'modules/fence_white',
  'modules/haystack',
  'modules/lotus_pond',
  'modules/signboard',
  'modules/water_well',
  'modules/bush_a',
  'modules/bush_b',
  'modules/bush_c',
  'modules/bush_d',
  'modules/bridge',
  'modules/lily_pad_a',
  'modules/lily_pad_b',
  'modules/lotus_flower',
  'modules/path_straight_stone',
  'modules/path_straight_dirt',
  'modules/path_curve_stone',
  'modules/path_end_cap',
];

const PARALLAX_KEYS = [
  'parallax/mountains_far_strip',
  'parallax/mountains_near_strip',
  'parallax/forest_belt_strip',
];

/** The asset keys this boot needs. */
export function plannedKeys(): string[] {
  // No iterator spread (`push(...arr)`) — WeChat DevTools' babel enhance
  // mangles it (runbook §10.3). Index-loop concat only.
  const keys: string[] = ['map/base'];
  pushAll(keys, PLOT_KEYS);
  for (let c = 0; c < CROP_IDS.length; c += 1) {
    for (let stage = 1; stage <= 4; stage += 1) keys.push(`crops/${CROP_IDS[c]}/stage-${stage}`);
  }
  pushAll(keys, ICON_KEYS);
  pushAll(keys, FX_KEYS);
  pushAll(keys, UI_KEYS);
  if (SHOW_PROPS) pushAll(keys, MODULE_KEYS);
  if (SHOW_PARALLAX) pushAll(keys, PARALLAX_KEYS);
  return keys;
}

function pushAll(dst: string[], src: readonly string[]): void {
  for (let i = 0; i < src.length; i += 1) dst.push(src[i]);
}

/** Load every planned SpriteFrame; resolves with a key→frame map. */
export function loadAll(onProgress?: (done: number, total: number) => void): Promise<SpriteMap> {
  const keys = plannedKeys();
  const total = keys.length;
  let done = 0;
  const map: SpriteMap = {};

  return new Promise<SpriteMap>((resolve, reject) => {
    const loadAt = (i: number): void => {
      if (i >= keys.length) {
        resolve(map);
        return;
      }
      const key = keys[i];
      resources.load(`game/${key}/spriteFrame`, SpriteFrame, (err, frame) => {
        if (err || !frame) {
          reject(new Error(`missing sprite frame: game/${key} (${String(err ?? '')})`));
          return;
        }
        map[key] = frame as SpriteFrame;
        done += 1;
        if (onProgress) onProgress(done, total);
        loadAt(i + 1);
      });
    };
    loadAt(0);
  });
}
