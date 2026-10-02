/**
 * The show's one map as a shot's set (explainer-animation-tech.md §4.1,
 * §6.1), behind one function, mapSetAsset(). The map is geography the
 * player draws itself on MapLibre (work package 8): a geo asset of the
 * show's regions, seams and land round them (shot-geo), its places points
 * on the earth, so the camera can tilt over it, fly across it and light
 * it up a region at a time.
 *
 * Today's drawing (scene-map's SVG, its regions, seams and places named
 * parts) is kept as `drawnMapSet()`, a still asset for anything that
 * cannot draw a geo map: its CSS animations out (the recipes move the
 * parts), its rounded card corners out (the map fills the frame), its
 * region names out (a label recipe names a region when the voice does)
 * and its "Today's borders" corner note out (it becomes the shot's source
 * chip). Its ids are made its own, so two assets on the stage at once
 * never share one.
 */
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import type { Element } from 'domhandler';
import type {
  FilmShape,
  ShotBox,
  ShotCreditDto,
  ShotGeoAssetDto,
  ShotLookDto,
  ShotPartDto,
  ShotSvgAssetDto,
  ShotTargetDto,
} from '../../../contracts';
import { isolate } from '../scene-callouts';
import { elements, removeNode, walk } from '../scene-dom';
import {
  PERIOD_NOTE,
  d3Geo,
  frameFor,
  projectionOf,
  readMap,
  readMapBase,
  renderMap,
  type MapFrame,
} from '../scene-map';
import { nameKey } from '../scene-palette';
import { renderSvg } from '../scene-raster';
import { THEMES, themedCode, type ThemeId } from '../scene-themes';
import { mapGeo, mercator, mercatorBox, type GeoBounds } from './shot-geo';

/** The map's id among a scene's assets. */
export const MAP_ASSET = 'map';

/** The show's map, ready to be a shot's set. */
export interface ShotMapSet {
  id: string;
  /** The geography the player draws (a geo map), or today's drawing (a drawn map). */
  asset: ShotSvgAssetDto | ShotGeoAssetDto;
  /** Each region, seam and place it draws, by the name the show gives it, to its part (or feature). */
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
  /** On a geo map, each feature's bounds on the earth (west, south, east, north), by id. */
  geoBoxes?: Record<string, GeoBounds>;
  /** What the map says of itself: drawn with today's borders for a past year. */
  chip?: ShotCreditDto;
  /** A drawn map cannot tilt or show terrain; a geo map can. */
  flat: boolean;
}

/** Natural Earth's borders are public domain; the chip says which borders they are. */
const BORDERS_CHIP: ShotCreditDto = {
  text: `${PERIOD_NOTE} · Natural Earth`,
  licence: 'Public domain',
  source: 'Natural Earth',
  url: 'https://www.naturalearthdata.com',
};

/** The classes today's map animates by: the shots engine's recipes do that now. */
const ANIMATED = new Set(['show', 'pop', 'route']);

/** Attributes that point at an id. */
const URL_REF = /url\(\s*#([^)\s]+)\s*\)/g;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Today's drawn map as a still asset: no animation, square corners, no
 * names or corner note, every id made the asset's own and every part
 * marked with data-part. Returns the markup, its root (for measuring) and
 * the ids of its parts.
 */
export function stillMap(
  svg: string,
  partIds: readonly string[],
  prefix: string,
): { svg: string; root: Element | null; parts: string[] } {
  const doc = parseDocument(svg, { xmlMode: true });
  const root = elements(doc.children).find((n) => n.name === 'svg') ?? null;
  if (!root) return { svg, root: null, parts: [] };
  const wanted = new Set(partIds);
  const doomed: Element[] = [];
  for (const node of walk(root)) {
    const id = node.attribs.id;
    if (node.name === 'style') doomed.push(node);
    // The map's own names and its corner note: a label recipe names a
    // region when the voice does, and the note is the shot's chip.
    else if (id && (id.startsWith('label-') || id === 'period'))
      doomed.push(node);
  }
  for (const node of doomed) removeNode(node);
  const parts: string[] = [];
  for (const node of walk(root)) {
    const a = node.attribs;
    if (a.class) {
      const kept = a.class.split(/\s+/).filter((c) => c && !ANIMATED.has(c));
      if (kept.length) a.class = kept.join(' ');
      else delete a.class;
    }
    if (a.style) {
      const kept = a.style
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s && !/^animation/i.test(s));
      if (kept.length) a.style = kept.join(';');
      else delete a.style;
    }
    if (node.name === 'rect' && a.rx) delete a.rx;
    if (a.id) {
      if (wanted.has(a.id)) {
        a['data-part'] = a.id;
        parts.push(a.id);
      }
      a.id = `${prefix}${a.id}`;
    }
    for (const key of ['href', 'xlink:href'])
      if (a[key]?.startsWith('#')) a[key] = `#${prefix}${a[key].slice(1)}`;
    for (const key of Object.keys(a))
      if (a[key].includes('url(#'))
        a[key] = a[key].replace(
          URL_REF,
          (_all, id: string) => `url(#${prefix}${id})`,
        );
  }
  return {
    svg: render(root, { xmlMode: true, selfClosingTags: true }),
    root,
    parts,
  };
}

/** A box round several: the smallest that holds them all. */
function union(boxes: readonly [number, number, number, number][]) {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2]));
  const y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
  return [round1(x0), round1(y0), round1(x1 - x0), round1(y1 - y0)] as [
    number,
    number,
    number,
    number,
  ];
}

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
 * process runs. `drawn` asks for today's drawing instead (drawnMapSet).
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
 * Today's drawing of the show's map, for the shape and the look's
 * colours, as a still asset whose regions and seams are measured parts.
 * Each show map, shape and theme is drawn and measured once while the
 * process runs.
 */
export function drawnMapSet(
  base: unknown,
  look: ShotLookDto,
  shape: FilmShape,
  theme: ThemeId = 'paper',
): Promise<ShotMapSet | null> {
  return keptMaking(
    JSON.stringify([base, shape, theme, look.palette.sides]),
    () => drawMapSet(base, look, shape, theme),
  );
}

/** The show's map read as scene-map reads a show's base: its regions, its seams, its year. */
function baseSpec(base: unknown) {
  const sound = readMapBase(base);
  if (!sound) return null;
  return readMap({
    region: sound.region,
    highlight: null,
    places: null,
    routes: null,
    groups: [...(sound.groups ?? [])],
    seams: [...(sound.seams ?? [])],
    year: sound.year ?? null,
    bordersDiffer: sound.bordersDiffer ?? null,
    base: sound,
  }).spec;
}

/** A target's centre on the earth, on a geo map: a point's own, a feature's middle. */
const centreOf = ([w, s, e, n]: GeoBounds): [number, number] => [
  (w + e) / 2,
  (s + n) / 2,
];

async function geoMapSet(base: unknown): Promise<ShotMapSet | null> {
  const spec = baseSpec(base);
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
    geoBoxes: geo.boxes,
    // Natural Earth's borders are today's; a map of a year whose borders differed says so on its chip.
    ...(spec.period ? { chip: BORDERS_CHIP } : {}),
    flat: false,
  };
}

/** A geo feature's middle on the earth, by id; null for one the map has not. */
export function featureCentre(
  map: ShotMapSet,
  id: string,
): [number, number] | null {
  const bounds = map.geoBoxes?.[id];
  return bounds ? centreOf(bounds) : null;
}

async function drawMapSet(
  base: unknown,
  look: ShotLookDto,
  shape: FilmShape,
  theme: ThemeId,
): Promise<ShotMapSet | null> {
  const spec = baseSpec(base);
  if (!spec) return null;
  const drawn = await renderMap(spec, shape);
  const coloured =
    theme === 'paper' ? drawn.svg : themedCode(drawn.svg, THEMES[theme]);
  const ids = Object.values(drawn.parts);
  const still = stillMap(coloured, ids, `${MAP_ASSET}-`);
  if (!still.root) return null;
  // Each part's ink, measured alone, in the drawing's units.
  const measured = await renderSvg(still.svg, undefined, {
    variants: still.parts.map(
      (id) =>
        isolate(still.root!, `${MAP_ASSET}-${id}`) ??
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
    ),
  });
  const box = drawn.viewBox;
  const sides = new Map(
    Object.keys(look.palette.sides).map((name) => [nameKey(name), name]),
  );
  const parts: Record<string, ShotPartDto> = {};
  still.parts.forEach((id, k) => {
    const ink = measured.inks?.[k];
    if (!ink || !(ink.width > 0) || !(ink.height > 0)) return;
    const name = Object.keys(drawn.parts).find((n) => drawn.parts[n] === id);
    const side = name ? sides.get(nameKey(name)) : undefined;
    parts[id] = {
      box: [
        round1(ink.x),
        round1(ink.y),
        round1(ink.width),
        round1(ink.height),
      ],
      ...(id.startsWith('seam-')
        ? { role: 'ink' }
        : side
          ? { role: side }
          : {}),
    };
  });
  const named: Record<string, string> = {};
  for (const [name, id] of Object.entries(drawn.parts))
    if (parts[id]) named[name] = id;
  const land = union(
    Object.entries(parts)
      .filter(([id]) => id.startsWith('group-'))
      .map(([, part]) => part.box),
  );
  const frame: MapFrame | null = spec.base
    ? await frameFor(spec.base, shape)
    : null;
  const projection = frame ? projectionOf(await d3Geo(), frame) : null;
  const [, , W, H] = box;
  return {
    id: MAP_ASSET,
    asset: {
      kind: 'svg',
      svg: still.svg,
      box,
      parts,
      ...(land ? { focal: land } : {}),
    },
    parts: named,
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
    ...(drawn.period ? { chip: BORDERS_CHIP } : {}),
    flat: true,
  };
}
