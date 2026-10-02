/**
 * The show's one map as a shot's set (explainer-animation-tech.md §4.1),
 * behind one function, mapSetAsset(), so the MapLibre work package (WP8)
 * swaps only this: today it is the charts' full-frame drawing of the show
 * map (shot-chart-map's mapAsset: every named region in its side's colour,
 * the seams between them, their names, all named parts with boxes); WP8
 * makes it a geo asset the player draws, its places staying points on the
 * earth.
 *
 * Beside the asset it gives the build what it needs to point at the map:
 * each region's and seam's part by the name the show gives it, and a
 * place's point on the drawing, worked out with the very projection the
 * drawing was made with.
 */
import type {
  FilmShape,
  ShotCreditDto,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { d3Geo, projectionOf, readMapBase, type MapDraft } from '../scene-map';
import type { ThemeId } from '../scene-themes';
import { mapAsset, mapAssetFrame } from './shot-charts';
import { mapPartId } from './shot-registry';

/** The map's id among a scene's assets: the registry's features are of it. */
export const MAP_ASSET = 'map';

/** The show's map, ready to be a shot's set. */
export interface ShotMapSet {
  id: string;
  asset: ShotSvgAssetDto;
  /** Each region and seam it draws, by the name the show gives it, to its part. */
  parts: Record<string, string>;
  /**
   * A point on the drawn map in the asset's units, or null off it: how a
   * place is pointed at on a drawn map. Absent on a geo map (WP8), where a
   * place stays a point on the earth.
   */
  project?: (lng: number, lat: number) => [number, number] | null;
  /** What the map says of itself beside the picture; absent when the drawing says it (its "Today's borders" note). */
  chip?: ShotCreditDto;
  /** A drawn map cannot tilt or show terrain; a geo map can. */
  flat: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const made = new Map<string, Promise<ShotMapSet | null>>();
const MADE_KEPT = 16;

/**
 * The show's one map (the editor's world.base) as a shot's set, drawn for
 * the film's shape in the look's colours: every named region and seam of
 * it a part. Null for a show with no map code can draw. Each show map,
 * shape and look is drawn once while the process runs; `theme` only keys
 * that, the look carrying its colours.
 */
export function mapSetAsset(
  base: unknown,
  look: ShotLookDto,
  shape: FilmShape,
  theme: ThemeId = 'paper',
): Promise<ShotMapSet | null> {
  const key = JSON.stringify([base, shape, theme, look.palette, look.fonts]);
  const kept = made.get(key);
  if (kept) return kept;
  const making = drawMapSet(base, look, shape).catch(() => null);
  const oldest = made.keys().next();
  if (made.size >= MADE_KEPT && !oldest.done) made.delete(oldest.value);
  made.set(key, making);
  return making;
}

async function drawMapSet(
  base: unknown,
  look: ShotLookDto,
  shape: FilmShape,
): Promise<ShotMapSet | null> {
  const sound = readMapBase(base);
  if (!sound) return null;
  // The show's map as a map of itself: every named region, every seam.
  const draft: MapDraft = {
    region: sound.region,
    highlight: null,
    places: null,
    routes: null,
    groups: [...(sound.groups ?? [])],
    seams: [...(sound.seams ?? [])],
    year: sound.year ?? null,
    bordersDiffer: sound.bordersDiffer ?? null,
    base: sound,
  };
  const [asset, frame] = await Promise.all([
    mapAsset(draft, look, shape),
    mapAssetFrame(draft, shape),
  ]);
  if (!asset) return null;
  const parts: Record<string, string> = {};
  for (const group of sound.groups ?? []) {
    const id = mapPartId('group', group.name);
    if (asset.parts[id]) parts[group.name] = id;
  }
  for (const seam of sound.seams ?? []) {
    const name = seam.name || seam.between.join(' and ');
    const id = mapPartId('seam', name);
    if (asset.parts[id]) parts[name] = id;
  }
  const projection = frame ? projectionOf(await d3Geo(), frame) : null;
  const [, , W, H] = asset.box;
  return {
    id: MAP_ASSET,
    asset,
    parts,
    ...(projection
      ? {
          project: (lng: number, lat: number) => {
            const p = projection([lng, lat]);
            return p && p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H
              ? [round1(p[0]), round1(p[1])]
              : null;
          },
        }
      : {}),
    flat: true,
  };
}
