/**
 * The SVG map as a full-frame asset with named parts, until the MapLibre
 * stage lands (work package 8): scene-map's own drawing of real
 * geography, drawn straight into the frame of the film's shape (the
 * show's one projection scaled and centred, so a show's maps still line
 * up from scene to scene, and the land and sea run to the frame's edges),
 * its keyframes and classes taken off, its ids made data-part names, and
 * its colours the look's: the paper, the ink, the accent, and each named
 * region in its side's colour where the show's palette names it.
 *
 * Parts are named from the drawing's ids: `group-*` (named regions),
 * `country-*`, `area-*`, `seam-*` and `route-*` (with their paths),
 * `place-*`, `pin-*`, each name's label `label-*`, and the `key`; every
 * box and path in the frame's units. Null for a map of nowhere code knows.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotPartDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { EXACT_ROOM } from '../scene-exact-style';
import {
  frameFor,
  readMap,
  renderMap,
  type MapDraft,
  type MapFrame,
  type MapSpec,
  type ShowMapBase,
} from '../scene-map';
import { PAPER } from '../scene-themes';
import { TEXT } from '../studio/explainer-rules';
import {
  assetOf,
  boxR,
  defsPrefix,
  frameOf,
  mix,
  paintOf,
  PartBook,
  sideFor,
  union,
  wordsWidth,
} from './shot-chart-kit';

/** How much of the frame the show's region fills, the rest its neighbours and the sea. */
const FILL = 0.92;

/** What a map asset is drawn from: a scene's map, the show's one map, or a map already read. */
export type MapInput = MapDraft | ShowMapBase | MapSpec;

const isSpec = (input: MapInput): input is MapSpec =>
  typeof (input as MapSpec).region === 'object' &&
  Array.isArray((input as MapSpec).highlights);

const isBase = (input: MapInput): input is ShowMapBase =>
  (input as ShowMapBase).kind === 'map' &&
  typeof input.region === 'string' &&
  !('highlight' in input);

/** The map read: the show's base map as a map of itself, its regions and seams drawn. */
function specOf(input: MapInput): MapSpec | null {
  if (isSpec(input)) return input;
  const draft: MapDraft = isBase(input)
    ? {
        region: input.region,
        highlight: null,
        places: null,
        routes: null,
        groups: (input.groups ?? []).map((g) => ({
          name: g.name,
          members: g.members ?? null,
          colour: g.colour ?? null,
          label: g.label ?? null,
        })),
        year: input.year ?? null,
        bordersDiffer: input.bordersDiffer ?? null,
        base: input,
      }
    : input;
  return readMap(draft).spec;
}

/** Every point a path's commands pass through (and its curves' controls), absolute or relative. */
function pathPoints(d: string): [number, number][] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const points: [number, number][] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        points.push([x, y]);
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
      case 'T':
        x = ox + num();
        y = oy + num();
        points.push([x, y]);
        break;
      case 'H':
        x = ox + num();
        points.push([x, y]);
        break;
      case 'V':
        y = oy + num();
        points.push([x, y]);
        break;
      case 'Q':
      case 'S': {
        points.push([ox + num(), oy + num()]);
        x = ox + num();
        y = oy + num();
        points.push([x, y]);
        break;
      }
      case 'C': {
        points.push([ox + num(), oy + num()], [ox + num(), oy + num()]);
        x = ox + num();
        y = oy + num();
        points.push([x, y]);
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        i += 3;
        const px = x;
        const py = y;
        x = ox + num();
        y = oy + num();
        // An arc may bulge past its ends by its radii.
        points.push(
          [Math.min(px, x) - rx, Math.min(py, y) - ry],
          [Math.max(px, x) + rx, Math.max(py, y) + ry],
        );
        break;
      }
      case 'Z':
        x = sx;
        y = sy;
        break;
      default:
        i += 1;
    }
  }
  return points;
}

/** The box of everything some markup draws: paths, circles, rects and words. */
function inkOf(markup: string): ShotBox | null {
  const boxes: ShotBox[] = [];
  for (const m of markup.matchAll(/ d="([^"]+)"/g)) {
    const points = pathPoints(m[1]);
    if (points.length)
      boxes.push(union(...points.map(([x, y]): ShotBox => [x, y, 0, 0])));
  }
  for (const m of markup.matchAll(
    /<circle[^>]*cx="([-\d.]+)"[^>]*cy="([-\d.]+)"[^>]*r="([\d.]+)"/g,
  )) {
    const [cx, cy, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
    boxes.push([cx - r, cy - r, r * 2, r * 2]);
  }
  for (const m of markup.matchAll(
    /<rect[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/g,
  ))
    boxes.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);
  // Words: each line from its anchor, as wide as it is set.
  for (const m of markup.matchAll(/<(text|tspan)([^>]*)>([^<]*)/g)) {
    const attrs = m[2];
    const words = m[3].replace(/&[a-z]+;/g, 'x').trim();
    const x = /\bx="([-\d.]+)"/.exec(attrs);
    const y = /\by="([-\d.]+)"/.exec(attrs);
    if (!words || !x || !y) continue;
    const size = Number(
      /font-size="([\d.]+)"/.exec(attrs)?.[1] ??
        /font-size="([\d.]+)"/.exec(markup)?.[1] ??
        20,
    );
    const w = wordsWidth(words, size, 700);
    const anchor =
      /text-anchor="(middle|end)"/.exec(attrs)?.[1] ??
      /text-anchor="(middle|end)"/.exec(markup)?.[1];
    const x0 =
      Number(x[1]) - (anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0);
    boxes.push([x0, Number(y[1]) - size * 0.8, w, size]);
  }
  return boxes.length ? union(...boxes) : null;
}

/** The markup of the element that starts at an index, to its own closing tag. */
function elementAt(svg: string, start: number): string {
  let depth = 0;
  const tags = /<\/?g\b[^>]*>/g;
  tags.lastIndex = start;
  for (let m = tags.exec(svg); m; m = tags.exec(svg)) {
    if (m[0].startsWith('</')) depth -= 1;
    else if (!m[0].endsWith('/>')) depth += 1;
    if (depth === 0) return svg.slice(start, m.index + m[0].length);
  }
  return svg.slice(start);
}

/**
 * A map drawn as a full-frame asset, or null for one that names nowhere
 * code knows. Async: the projection library is an ES module, loaded once.
 */
export async function mapAsset(
  input: MapInput,
  look: ShotLookDto,
  shape: FilmShape,
): Promise<ShotSvgAssetDto | null> {
  try {
    const spec = specOf(input);
    if (!spec) return null;
    const frame = frameOf(shape);
    const paint = paintOf(look);
    const { W, H } = frame;
    // The show's frame (or the region's own), scaled to fill the film's.
    const own = await frameFor(spec.base ?? spec.region, shape);
    const k = Math.min(W / own.width, H / own.height) * FILL;
    const ox = (W - own.width * k) / 2;
    const oy = (H - own.height * k) / 2;
    const full: MapFrame = {
      ...own,
      width: W,
      height: H,
      projection: {
        ...own.projection,
        scale: own.projection.scale * k,
        translate: [
          own.projection.translate[0] * k + ox,
          own.projection.translate[1] * k + oy,
        ],
      },
    };
    // Its names at the reading floor: renderMap sets them at 0.9 of its size, the size scaled from its room.
    const room = EXACT_ROOM[shape];
    const scale = 1 / Math.min(room.w / W, room.h / H);
    const text = (TEXT.mustRead * H) / 0.9 / scale;
    const drawn = await renderMap(spec, shape, text, full);
    const prefix = defsPrefix(`map|${JSON.stringify(spec)}|${shape}`);
    let svg = drawn.svg
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '')
      .replace(/<style>[\s\S]*?<\/style>/g, '')
      .replace(/ class="[^"]*"/g, '')
      .replace(/ style="[^"]*"/g, '')
      .replace(/ rx="14"/g, '')
      .replace(/id="(map-frame|map-land)"/g, `id="${prefix}-$1"`)
      .replace(/url\(#map-frame\)/g, `url(#${prefix}-map-frame)`)
      .replace(/href="#map-land"/g, `href="#${prefix}-map-land"`)
      .replace(/<g id="([^"]+)"/g, '<g data-part="$1"');
    // The house colours as the look's.
    const land = paint.dark
      ? mix(paint.paper, paint.ink, 0.1)
      : mix(paint.paper, '#FFFFFF', 0.8);
    const swaps: [string, string][] = [
      [PAPER.paper, paint.paper],
      [PAPER.card, land],
      [PAPER.grid, mix(paint.paper, paint.muted, 0.2)],
      [PAPER.ink, paint.ink],
      [PAPER.muted, paint.muted],
      [PAPER.accent, paint.accent],
    ];
    for (const [from, to] of swaps)
      svg = svg.replace(new RegExp(`"${from}"`, 'gi'), `"${to}"`);
    const book = new PartBook();
    const names = new Map<string, string>();
    for (const [name, id] of Object.entries(drawn.parts))
      if (!names.has(id)) names.set(id, name);
    // Each named region, country and area in its side's colour where the show names it.
    for (const [id, name] of names) {
      if (!/^(group|country|area)-/.test(id)) continue;
      const side = sideFor(paint, name);
      if (!side) continue;
      const at = svg.indexOf(`data-part="${id}"`);
      const fill = svg.indexOf('fill="', at);
      if (at < 0 || fill < 0) continue;
      const end = svg.indexOf('"', fill + 6);
      svg = `${svg.slice(0, fill + 6)}${side.colour}${svg.slice(end)}`;
    }
    const ids = [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) {
      const at = svg.indexOf(`<g data-part="${id}"`);
      if (at < 0) continue;
      const markup = elementAt(svg, at);
      const box = inkOf(markup);
      if (!box) continue;
      const name = names.get(id) ?? null;
      const side = name ? sideFor(paint, name) : null;
      const path = /^(route|seam)-/.test(id)
        ? / d="([^"]+)"/.exec(markup)?.[1]
        : undefined;
      const part: ShotPartDto = {
        box: boxR([
          Math.max(0, box[0]),
          Math.max(0, box[1]),
          Math.min(W, box[0] + box[2]) - Math.max(0, box[0]),
          Math.min(H, box[1] + box[3]) - Math.max(0, box[1]),
        ]),
        ...(path ? { path } : {}),
        ...(side ? { role: side.name } : {}),
      };
      book.add(id, part);
    }
    // Ids the drawing gave nothing to measure are not parts.
    svg = svg.replace(/<g data-part="([^"]+)"/g, (all, id: string) =>
      book.parts[id] ? all : '<g',
    );
    const focal: ShotBox = [ox, oy, own.width * k, own.height * k];
    return assetOf(frame, paint, svg, book, focal);
  } catch {
    return null;
  }
}
