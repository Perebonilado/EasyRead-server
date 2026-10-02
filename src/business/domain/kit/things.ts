/**
 * The things of the kit (WP10), as the registry lists them: buildings,
 * documents, objects and machines, each family in its own module. Sets
 * (kit/sets) are not pieces: a set is the shot's whole place, drawn by
 * the build for a set of kind `set`.
 */
import { BUILDING_KIT } from './buildings';
import type { KitEntry } from './registry';

export const THINGS_KIT: Readonly<Record<string, KitEntry>> = {
  ...BUILDING_KIT,
};
