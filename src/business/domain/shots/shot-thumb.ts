/**
 * A scene of shots as one still, for its card (SceneProcessor.thumb): the
 * first shot that shows a drawn set or the show's map, framed on its
 * subject as the camera frames it, on the look's paper, the full frame of
 * the scene's shape. A geo map is drawn flat here (the player tilts it),
 * its regions in the colours the scene fills them with by its end.
 * Rendered by resvg on the server; the stills the frames work package
 * captures from the player replace it when they land.
 *
 * Pure: a scene gives the same still every time.
 */
import type {
  SceneDto,
  ShotBox,
  ShotDto,
  ShotGeoAssetDto,
  ShotLookDto,
  ShotSvgAssetDto,
  ShotTargetDto,
} from '../../../contracts';
import { mercator, mercatorBox, type GeoBounds } from './shot-geo';

/** Room round the subject, as a share of it: the camera never frames tight to the edge. */
const PADDING = 0.12;

/** The frame's optical centre sits a little above its middle. */
const OPTICAL_Y = 0.47;

/** The box a shot frames on its set: its subject's, else the set's own subject, else all of it. */
function framed(shot: ShotDto, asset: ShotSvgAssetDto): ShotBox {
  const focal = shot.focal;
  if (focal?.kind === 'box') return focal.box;
  if (focal?.kind === 'asset' && focal.part && asset.parts[focal.part])
    return asset.parts[focal.part].box;
  return asset.focal ?? asset.box;
}

const r1 = (n: number) => Math.round(n * 100) / 100;

// ── A geo map, drawn flat ─────────────────────────────────────────────────

/** Two colours mixed, `t` of the way from `a` to `b` (hex in, hex out): near enough to the player's OKLab for a card. */
function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    const full =
      h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
    const n = parseInt(full, 16);
    return Number.isFinite(n)
      ? [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      : [128, 128, 128];
  };
  const [x, y] = [parse(a), parse(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

type GeoFeature = {
  properties?: {
    id?: string;
    kind?: string;
    name?: string;
    colour?: string;
    region?: boolean;
  };
  geometry?: { type: string; coordinates: unknown };
};

/** A colour of the look by role, as the player gives one: ink, muted, accent, held, or a side's. */
function roleColour(look: ShotLookDto, role: string | undefined): string {
  const p = look.palette;
  if (!role || role === 'ink') return p.ink;
  if (role === 'muted') return p.muted;
  if (role === 'accent') return p.accent;
  if (role === 'held') return p.held ?? p.accent;
  if (role === 'paper') return p.paper;
  return p.sides[role] ?? p.accent;
}

/** What the camera frames on a geo map for a target, in Web Mercator pixels: a feature's bounds, a point with a third of the map round it. */
function geoFramed(
  target: ShotTargetDto | undefined,
  asset: ShotGeoAssetDto,
  boxes: Map<string, GeoBounds>,
): ShotBox {
  const whole = mercatorBox(asset.bounds);
  if (target?.kind === 'feature' && boxes.has(target.id))
    return mercatorBox(boxes.get(target.id)!);
  if (target?.kind === 'geo') {
    const [x, y] = mercator(target.lng, target.lat);
    const side = Math.min(whole[2], whole[3]) * 0.3;
    return [x - side / 2, y - side / 2, side, side];
  }
  return whole;
}

/** The bounds of a feature's coordinates, however nested. */
function boundsOfCoordinates(coordinates: unknown): GeoBounds | null {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[];
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/**
 * A geo map as the card shows it: flat, framed on the shot's subject, the
 * sea, the land (the show's own lighter), the regions in the colour the
 * scene leaves them, the borders, the coast and the seams.
 */
function geoThumb(
  scene: SceneDto,
  shot: ShotDto,
  asset: ShotGeoAssetDto,
  look: ShotLookDto,
  W: number,
  H: number,
): string {
  const features = (asset.features.features ?? []) as GeoFeature[];
  const boxes = new Map<string, GeoBounds>();
  for (const one of features) {
    const id = one.properties?.id;
    const b =
      id && one.geometry ? boundsOfCoordinates(one.geometry.coordinates) : null;
    if (id && b) boxes.set(id, b);
  }
  const [x, y, w, h] = geoFramed(shot.focal, asset, boxes);
  const pw = Math.max(1e-6, w * (1 + 2 * PADDING));
  const ph = Math.max(1e-6, h * (1 + 2 * PADDING));
  const k = Math.min(W / pw, H / ph);
  const tx = W / 2 - k * (x + w / 2);
  const ty = H * OPTICAL_Y - k * (y + h / 2);
  const point = (p: number[]) => {
    const [mx, my] = mercator(p[0], p[1]);
    return `${r1(tx + k * mx)} ${r1(ty + k * my)}`;
  };
  const ring = (points: number[][], close: boolean) =>
    `M${points.map(point).join('L')}${close ? 'Z' : ''}`;
  const pathOf = (geometry: GeoFeature['geometry']): string => {
    if (!geometry) return '';
    const c = geometry.coordinates as never;
    switch (geometry.type) {
      case 'Polygon':
        return (c as number[][][]).map((r) => ring(r, true)).join('');
      case 'MultiPolygon':
        return (c as number[][][][])
          .flatMap((p) => p.map((r) => ring(r, true)))
          .join('');
      case 'LineString':
        return ring(c as number[][], false);
      case 'MultiLineString':
        return (c as number[][][]).map((l) => ring(l, false)).join('');
      default:
        return '';
    }
  };
  // Each region's colour as the scene leaves it: its last fill that stays.
  const filled = new Map<string, string>();
  const fills = (scene.shots?.shots ?? [])
    .flatMap((one) => one.info)
    .filter(
      (info) =>
        info.recipe === 'fill' &&
        info.target?.kind === 'feature' &&
        info.untilMs === undefined,
    )
    .sort((a, b) => a.atMs - b.atMs);
  for (const info of fills)
    if (info.target?.kind === 'feature')
      filled.set(info.target.id, roleColour(look, info.colour ?? 'accent'));
  const { paper, ink, muted } = look.palette;
  const sea = mixHex(paper, ink, 0.1);
  const land = mixHex(paper, muted, 0.16);
  const own = mixHex(paper, '#ffffff', 0.55);
  const out: string[] = [];
  const draw = (kinds: string[], style: (one: GeoFeature) => string | null) => {
    for (const one of features) {
      if (!kinds.includes(one.properties?.kind ?? '')) continue;
      const look = style(one);
      const d = look ? pathOf(one.geometry) : '';
      if (d) out.push(`<path d="${d}" ${look}/>`);
    }
  };
  draw(['sea'], () => `fill="${sea}"`);
  draw(['land'], (one) => `fill="${one.properties?.region ? own : land}"`);
  draw(['lake'], () => `fill="${sea}"`);
  draw(['region', 'highlight', 'area'], (one) => {
    const colour = filled.get(one.properties?.id ?? '');
    return colour ? `fill="${colour}" fill-opacity="0.85"` : null;
  });
  draw(
    ['admin'],
    () =>
      `fill="none" stroke="${muted}" stroke-opacity="0.35" stroke-width="1"`,
  );
  draw(
    ['border'],
    () =>
      `fill="none" stroke="${muted}" stroke-opacity="0.7" stroke-width="1.4"`,
  );
  draw(['coast'], () => `fill="none" stroke="${muted}" stroke-width="1.6"`);
  draw(
    ['seam'],
    () =>
      `fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="12 9"`,
  );
  return out.join('');
}

/**
 * The still of a scene of shots: an SVG the size of its stage, its first
 * drawn set laid in as the camera frames it. Paper alone when no shot
 * shows a drawn set (a scene of photos, before the picture desk).
 */
export function shotsThumbSvg(scene: SceneDto): string {
  const { w: W, h: H } = scene.stagings.wide;
  const look = scene.shots?.look;
  const paper = look?.palette.paper ?? '#FBF7EF';
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${paper}"/>`;
  for (const shot of scene.shots?.shots ?? []) {
    const id = 'asset' in shot.set ? shot.set.asset : null;
    const asset = id ? scene.shots?.assets[id] : undefined;
    if (asset?.kind === 'geo' && look)
      return `${head}${geoThumb(scene, shot, asset, look, W, H)}</svg>`;
    if (asset?.kind !== 'svg') continue;
    const [x, y, w, h] = framed(shot, asset);
    const pw = Math.max(1, w * (1 + 2 * PADDING));
    const ph = Math.max(1, h * (1 + 2 * PADDING));
    const s = Math.min(W / pw, H / ph);
    const tx = W / 2 - s * (x + w / 2);
    const ty = H * OPTICAL_Y - s * (y + h / 2);
    const inner = asset.svg
      .replace(/^\s*<svg\b[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '');
    return `${head}<g transform="translate(${r1(tx)} ${r1(ty)}) scale(${Math.round(s * 10000) / 10000})">${inner}</g></svg>`;
  }
  return `${head}</svg>`;
}
