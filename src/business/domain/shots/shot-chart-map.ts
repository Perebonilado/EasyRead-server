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

/** A part's group as a move wraps it: its drawing inside a translate. */
const MOVED = /^<g[^>]*><g transform="translate\((-?[\d.]+) (-?[\d.]+)\)">/;

/** The box of a part's markup where it is drawn: its ink, and the move a translate made. */
function placedInk(markup: string): ShotBox | null {
  const raw = inkOf(markup);
  const shift = MOVED.exec(markup);
  return raw && shift
    ? [raw[0] + Number(shift[1]), raw[1] + Number(shift[2]), raw[2], raw[3]]
    : raw;
}

/** A part's group moved by so much across and down, its own attributes kept. */
function movedBy(markup: string, dx: number, dy: number): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  return markup.replace(
    /^<g data-part="([^"]+)"([^>]*)>([\s\S]*)<\/g>$/,
    (_all, name: string, attrs: string, inner: string) =>
      `<g data-part="${name}"${attrs}><g transform="translate(${r(dx)} ${r(dy)})">${inner}</g></g>`,
  );
}

/** The rings a path draws, each from a move to the next (the drawing's paths are absolute). */
function ringsOf(d: string): [number, number][][] {
  return d
    .split(/(?=M)/)
    .map((piece) => pathPoints(piece))
    .filter((ring) => ring.length > 2);
}

/** Whether a point is inside rings (even-odd, so a hole is outside). */
function inRings(rings: [number, number][][], [x, y]: [number, number]) {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
  return inside;
}

/**
 * The frame a map asset is drawn into: the show's own frame (or the
 * region's), scaled and centred to fill the film's, and the box the
 * show's region takes in it. Shared with the shots builder, which puts a
 * place's point on the drawing with the same projection.
 */
async function fullFrameOf(
  spec: MapSpec,
  shape: FilmShape,
): Promise<{ full: MapFrame; region: ShotBox }> {
  const { W, H, text } = frameOf(shape);
  const own = await frameFor(spec.base ?? spec.region, shape);
  // The show's region inside the words' area (clear of the captions' band
  // at the foot, and of a tall frame's overlays), so the names drawn in it
  // are too; its neighbours and the sea run on to the frame's edges.
  const tw = text.x1 - text.x0;
  const th = text.y1 - text.y0;
  const k = Math.min(tw / own.width, th / own.height) * FILL;
  const ox = text.x0 + (tw - own.width * k) / 2;
  const oy = text.y0 + (th - own.height * k) / 2;
  return {
    full: {
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
    },
    region: [ox, oy, own.width * k, own.height * k],
  };
}

/** The frame a map asset of this input is drawn into (mapAsset's own), or null for a map of nowhere code knows. */
export async function mapAssetFrame(
  input: MapInput,
  shape: FilmShape,
): Promise<MapFrame | null> {
  try {
    const spec = specOf(input);
    return spec ? (await fullFrameOf(spec, shape)).full : null;
  } catch {
    return null;
  }
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
    const { full, region } = await fullFrameOf(spec, shape);
    // Its names at the reading floor: renderMap sets them at 0.9 of its size, the size scaled from its room.
    const room = EXACT_ROOM[shape];
    const scale = 1 / Math.min(room.w / W, room.h / H);
    const text = frame.size.label / 0.9 / scale;
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
    // A name the drawing set past the words' area (beside a region at the
    // frame's side, or under one near the captions' band) comes in, with
    // its tick, as far as it must.
    {
      const area = frame.text;
      const labels = [...svg.matchAll(/<g data-part="label-[^"]+"/g)];
      for (const m of labels.reverse()) {
        const markup = elementAt(svg, m.index);
        const box = inkOf(markup);
        if (!box) continue;
        const [x, y, w, h] = box;
        const into = (from: number, size: number, lo: number, hi: number) =>
          size > hi - lo
            ? 0
            : from < lo
              ? lo - from
              : from + size > hi
                ? hi - (from + size)
                : 0;
        const dx = into(x, w, area.x0, area.x1);
        const dy = into(y, h, area.y0, area.y1);
        if (!dx && !dy) continue;
        svg =
          svg.slice(0, m.index) +
          movedBy(markup, dx, dy) +
          svg.slice(m.index + markup.length);
      }
    }
    // The key (each named group's colour) and the note of a past map's
    // borders are words: the drawing sets them in the frame's corners, so
    // each goes to the corner of the words' area (clear of the captions'
    // band at the foot, and of a tall frame's overlays) where it hides
    // least, as the drawing chooses: no name or mark, then as little of
    // what is coloured and of the region's land as it can, then the
    // nearest to where the drawing set it.
    {
      const area = frame.text;
      const written: ShotBox[] = [];
      for (const m of svg.matchAll(
        /<g data-part="(?:label|place|pin)-[^"]+"/g,
      )) {
        const box = placedInk(elementAt(svg, m.index));
        if (box) written.push(box);
      }
      const land = ringsOf(
        new RegExp(`id="${prefix}-map-land" d="([^"]+)"`).exec(svg)?.[1] ?? '',
      );
      const coloured = [
        ...svg.matchAll(/<g data-part="(?:group|country|area)-[^"]+"/g),
      ].flatMap((m) =>
        [...elementAt(svg, m.index).matchAll(/ d="([^"]+)"/g)].flatMap((d) =>
          ringsOf(d[1]),
        ),
      );
      const hides = ([bx, by, bw, bh]: ShotBox) => {
        let n = 0;
        for (let i = 0; i <= 6; i++)
          for (let j = 0; j <= 4; j++) {
            const q: [number, number] = [bx + (bw * i) / 6, by + (bh * j) / 4];
            if (inRings(coloured, q)) n += 3;
            else if (inRings(land, q)) n += 1;
          }
        for (const [ox, oy, ow, oh] of written)
          if (bx < ox + ow && bx + bw > ox && by < oy + oh && by + bh > oy)
            n += 100;
        return n;
      };
      for (const id of ['key', 'period']) {
        const at = svg.indexOf(`<g data-part="${id}"`);
        const note = at >= 0 ? elementAt(svg, at) : null;
        const box = note ? inkOf(note) : null;
        if (!note || !box) continue;
        const [x, y, w, h] = box;
        const inside =
          x >= area.x0 && y >= area.y0 && x + w <= area.x1 && y + h <= area.y1;
        if (inside) {
          written.push(box);
          continue;
        }
        const left = area.x0;
        const right = Math.max(area.x0, area.x1 - w);
        const top = area.y0;
        const foot = Math.max(area.y0, area.y1 - h);
        const [best] = (
          [
            [left, top],
            [right, top],
            [left, foot],
            [right, foot],
          ] as [number, number][]
        )
          .map(([sx, sy]) => ({
            sx,
            sy,
            n: hides([sx, sy, w, h]),
            d: Math.hypot(sx - x, sy - y),
          }))
          .sort((a, b) => a.n - b.n || a.d - b.d);
        svg =
          svg.slice(0, at) +
          movedBy(note, best.sx - x, best.sy - y) +
          svg.slice(at + note.length);
        written.push([best.sx, best.sy, w, h]);
      }
    }
    const ids = [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) {
      const at = svg.indexOf(`<g data-part="${id}"`);
      if (at < 0) continue;
      const markup = elementAt(svg, at);
      // Measured where it is drawn (a name, key or note brought into the words' area where it went).
      const box = placedInk(markup);
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
    return assetOf(frame, paint, svg, book, region);
  } catch {
    return null;
  }
}
