/**
 * The preset shapes a scene may name: drawn once by hand, scaled into the
 * box the script gives, so a leaf is a leaf in every lesson and the model
 * never writes a path. Each path is on a unit square; the client scales
 * it. The list here is the contract the checks and the prompt read; the
 * paths live beside the renderer.
 */
export const PRESET_SHAPES = [
  'leaf',
  'cloud',
  'drop',
  'document',
  'database',
  'capsule',
  'sun',
  'shield',
] as const;
export type PresetShape = (typeof PRESET_SHAPES)[number];
