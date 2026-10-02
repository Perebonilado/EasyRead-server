/**
 * The show's one map as a shot's set (explainer-animation-tech.md §4.1,
 * §6.1), behind one function, mapSetAsset(). The map is geography the
 * player draws itself on MapLibre (work package 8): a geo asset of the
 * show's regions, seams and land round them (shot-geo), its places points
 * on the earth, so the camera can tilt over it, fly across it and light
 * it up a region at a time.
 *
 * For whatever cannot draw geography, `drawnMapSet()` gives the charts'
 * full-frame drawing of the same map (shot-chart-map's mapAsset: every
 * named region in its side's colour, the seams between them, their names,
 * all named parts with boxes), and a place's point on the drawing, worked
 * out with the very projection the drawing was made with.
 *
 * Beside the asset, either gives the build what it needs to point at the
 * map: each region's and seam's part (or feature) by the name the show
 * gives it.
 */
import type {
  FilmShape,
  ShotBox,
  ShotCreditDto,
  ShotGeoAssetDto,
  ShotLookDto,
  ShotSvgAssetDto,
  ShotTargetDto,
} from '../../../contracts';
import {
  PERIOD_NOTE,
  d3Geo,
  projectionOf,
  readMap,
  readMapBase,
  type MapDraft,
} from '../scene-map';
import type { ThemeId } from '../scene-themes';
import { mapAsset, mapAssetFrame } from './shot-charts';
import {
  mapGeo,
  mercator,
  mercatorBox,
  unmercator,
  type GeoBounds,
} from './shot-geo';
import { mapPartId } from './shot-registry';

/** The map's id among a scene's assets: the registry's features are of it. */
export const MAP_ASSET = 'map';

/** The show's map, ready to be a shot's set. */
export interface ShotMapSet {
  id: string;
  /** The geography the player draws (a geo map), or the charts' drawing of it (a drawn map). */
  asset: ShotSvgAssetDto | ShotGeoAssetDto;
  /** Each region and seam it draws, by the name the show gives it, to its part (or feature). */
  parts: Record<string, string>;
  /**
   * A point on the drawn map in the asset's units, or null off it: how a
   * place is pointed at on a drawn map. Absent on a geo map, where a
   * place stays a point on the earth.
   */
  project?: (lng: number, lat: number) => [number, number] | null;
  /** A geo map's frame, in Web Mercator pixels at zoom 8 (shot-geo's WORLD_PX): the units its distances are measured in. */
  box?: ShotBox;
  /** On a geo map, what a target covers in those units: a point, a feature's bounds, the whole frame. */
  boxOf?: (target: ShotTargetDto) => ShotBox | null;
  /** On a geo map, the point on the earth (lng, lat) at a spot in those units: where a piece placed in them stands. */
  earthAt?: (x: number, y: number) => [number, number];
  /** On a geo map, each feature's bounds on the earth (west, south, east, north), by id. */
  geoBoxes?: Record<string, GeoBounds>;
  /** What the map says of itself beside the picture; absent when the drawing says it (its "Today's borders" note). */
  chip?: ShotCreditDto;
  /** A drawn map cannot tilt or show terrain; a geo map can. */
  flat: boolean;
}

/** Natural Earth's borders are public domain; the chip says which borders a geo map draws, which writes no note of its own. */
const BORDERS_CHIP: ShotCreditDto = {
  text: `${PERIOD_NOTE} · Natural Earth`,
  licence: 'Public domain',
  source: 'Natural Earth',
  url: 'https://www.naturalearthdata.com',
};

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Four places of a degree: about ten metres, finer than any marker. */
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

const made = new Map<string, Promise<ShotMapSet | null>>();
const MADE_KEPT = 16;

/** One making per key while the process runs, the oldest let go. */
function keptMaking(
  key: string,
  make: () => Promise<ShotMapSet | null>,
): Promise<ShotMapSet | null> {
  const kept = made.get(key);
  if (kept) return kept;
  const making = make().catch(() => null);
  const oldest = made.keys().next();
  if (made.size >= MADE_KEPT && !oldest.done) made.delete(oldest.value);
  made.set(key, making);
  return making;
}

/**
 * The show's one map (the editor's world.base) as a shot's set: a geo
 * map the player draws, its named regions and seams features it can
 * light up, its land round it, its places points on the earth. Null for a
 * show with no map code can draw. The same for every shape and theme (the
 * player colours it from the look), made once per show map while the
 * process runs. `drawn` asks for the charts' drawing instead (drawnMapSet).
 */
export function mapSetAsset(
  base: unknown,
  look: ShotLookDto,
  shape: FilmShape,
  theme: ThemeId = 'paper',
  engine: 'geo' | 'drawn' = 'geo',
): Promise<ShotMapSet | null> {
  if (engine === 'drawn') return drawnMapSet(base, look, shape, theme);
  return keptMaking(JSON.stringify(['geo', base]), () => geoMapSet(base));
}

/**
 * The show's one map as the charts draw it, full frame for the film's
 * shape in the look's colours: every named region and seam of it a part.
 * Null for a show with no map code can draw. Each show map, shape and
 * look is drawn once while the process runs; `theme` only keys that, the
 * look carrying its colours.
 */
export function drawnMapSet(
  base: unknown,
  look: ShotLookDto,
  shape: FilmShape,
  theme: ThemeId = 'paper',
): Promise<ShotMapSet | null> {
  return keptMaking(
    JSON.stringify(['drawn', base, shape, theme, look.palette, look.fonts]),
    () => drawMapSet(base, look, shape),
  );
}

/** The show's map as a map of itself: every named region, every seam. */
function draftOf(base: unknown): MapDraft | null {
  const sound = readMapBase(base);
  if (!sound) return null;
  return {
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
}

async function geoMapSet(base: unknown): Promise<ShotMapSet | null> {
  const draft = draftOf(base);
  const spec = draft ? readMap(draft).spec : null;
  if (!spec) return null;
  const geo = await mapGeo(spec);
  const box = mercatorBox(geo.asset.bounds);
  const boxOf = (target: ShotTargetDto): ShotBox | null => {
    switch (target.kind) {
      case 'geo': {
        const [x, y] = mercator(target.lng, target.lat);
        return [x, y, 0, 0];
      }
      case 'feature':
        return target.asset === MAP_ASSET && geo.boxes[target.id]
          ? mercatorBox(geo.boxes[target.id])
          : null;
      case 'asset':
        return target.asset === MAP_ASSET && !target.part ? box : null;
      case 'box':
        return target.box;
      default:
        return null;
    }
  };
  return {
    id: MAP_ASSET,
    asset: geo.asset,
    parts: geo.parts,
    box,
    boxOf,
    earthAt: (x, y) => {
      const [lng, lat] = unmercator(x, y);
      return [round4(lng), round4(lat)];
    },
    geoBoxes: geo.boxes,
    // Natural Earth's borders are today's; a map of a year whose borders differed says so on its chip.
    ...(spec.period ? { chip: BORDERS_CHIP } : {}),
    flat: false,
  };
}

async function drawMapSet(
  base: unknown,
  look: ShotLookDto,
  shape: FilmShape,
): Promise<ShotMapSet | null> {
  const draft = draftOf(base);
  if (!draft) return null;
  const [asset, frame] = await Promise.all([
    mapAsset(draft, look, shape),
    mapAssetFrame(draft, shape),
  ]);
  if (!asset) return null;
  const sound = draft.base;
  const parts: Record<string, string> = {};
  for (const group of sound?.groups ?? []) {
    const id = mapPartId('group', group.name);
    if (asset.parts[id]) parts[group.name] = id;
  }
  for (const seam of sound?.seams ?? []) {
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
