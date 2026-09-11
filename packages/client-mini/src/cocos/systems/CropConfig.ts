/**
 * Re-export crop config from shared so client-mini business code keeps the same
 * import path as the original scripts/systems/CropConfig.ts.
 */

export { CROPS, getCrop, listCrops, type CropConfig } from '@farm-game/shared';