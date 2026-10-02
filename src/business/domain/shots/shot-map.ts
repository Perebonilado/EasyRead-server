/**
 * The show's one map as a shot's set (explainer-animation-tech.md §4.1),
 * behind one function, mapSetAsset(), so the MapLibre work package (WP8)
 * swaps only this: today it is the map scene-map.ts draws for the show's
 * frame, made a still asset whose regions, seams and places are named
 * parts the recipes and the camera can point at; WP8 makes it a geo asset
 * the player draws, its places staying points on the earth.
 *
 * The drawing is today's map with what the shots engine does itself taken
 * out: its CSS animations (the recipes move the parts), its rounded card
 * corners (the map fills the frame), its region names (a label recipe
 * names a region when the voice does) and its "Today's borders" corner
 * note (which becomes the shot's source chip). Its ids are made its own,
 * so two assets on the stage at once never share one.
 */
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import type { Element } from 'domhandler';
import type {
  FilmShape,
  ShotCreditDto,
  ShotLookDto,
  ShotPartDto,
  ShotSvgAssetDto,
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

/** The map's id among a scene's assets. */
export const MAP_ASSET = 'map';

/** The show's map, ready to be a shot's set. */
export interface ShotMapSet {
  id: string;
  asset: ShotSvgAssetDto;
  /** Each region, seam and place it draws, by the name the show gives it, to its part. */
  parts: Record<string, string>;
  /**
   * A point on the drawn map in the asset's units, or null off it: how a
   * place is pointed at on a drawn map. Absent on a geo map (WP8), where a
   * place stays a point on the earth.
   */
  project?: (lng: number, lat: number) => [number, number] | null;
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

/**
 * The show's one map (the editor's world.base) as a shot's set, drawn for
 * the film's shape in the look's colours: its named regions, its seams,
 * each a part with its box in the drawing's units. Null for a show with no
 * map code can draw. Each show map, shape and theme is drawn and measured
 * once while the process runs.
 */
export function mapSetAsset(
  base: unknown,
  look: ShotLookDto,
  shape: FilmShape,
  theme: ThemeId = 'paper',
): Promise<ShotMapSet | null> {
  const key = JSON.stringify([base, shape, theme, look.palette.sides]);
  const kept = made.get(key);
  if (kept) return kept;
  const making = drawMapSet(base, look, shape, theme).catch(() => null);
  const oldest = made.keys().next();
  if (made.size >= MADE_KEPT && !oldest.done) made.delete(oldest.value);
  made.set(key, making);
  return making;
}

async function drawMapSet(
  base: unknown,
  look: ShotLookDto,
  shape: FilmShape,
  theme: ThemeId,
): Promise<ShotMapSet | null> {
  const sound = readMapBase(base);
  if (!sound) return null;
  const { spec } = readMap({
    region: sound.region,
    highlight: null,
    places: null,
    routes: null,
    groups: [...(sound.groups ?? [])],
    seams: [...(sound.seams ?? [])],
    year: sound.year ?? null,
    bordersDiffer: sound.bordersDiffer ?? null,
    base: sound,
  });
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
