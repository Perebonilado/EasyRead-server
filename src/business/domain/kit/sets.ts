/**
 * Code-drawn sets (explainer-animation-plan §6.4, tech §4.2): a kind of
 * place, never a named one, drawn whole in the show's colours: a port at
 * dusk, a farm in rain, a factory town as its lights come on, a city at
 * night, an assembly hall. It is the Steve Jobs film's look in Lukas
 * Margerie's video (a bridge at sunset, a night street), with no image
 * model.
 *
 * A set is drawn from settings alone, never a country preset:
 *  - the sky by time (day, dusk, night, dawn) and weather (clear, cloud,
 *    rain, snow, storm, haze): a gradient, the sun on its arc or the
 *    moon, stars, clouds that drift;
 *  - the land (plain, hills, mountains, coast, desert, forest, city,
 *    sea) as silhouette layers, each at its depth for parallax, the far
 *    ones fading into the sky's haze;
 *  - water with its glints and a shimmer anchor: by the coast the place
 *    stands on the far shore, across the water;
 *  - a townscape by density (village, town, city) and era, far off and
 *    near, its windows a `lights` part that lights one by one;
 *  - what the place is for (a farm, a port, industry, a market, a city's
 *    towers, an oil field), which sets what stands in it (the kit's
 *    buildings, drawn small);
 *  - a foreground that frames it (a fence, a lamp post, bollards, rocks);
 *  - two more places of their own: an assembly hall (inside) and a
 *    ceremony ground.
 *
 * Everything in a set can move, as a pure function of time on the
 * client (lib/shots/scenery): its `scenery` lists each state's look of
 * every part that changes (the sky's colours, the sun's turn about its
 * arc, the stars, the land's light, the veil over what is built, the
 * lights in the windows), and the parts that drift (clouds, rain, snow).
 * The drawing is the set as it opens, so a still or a thumbnail without
 * the client is right.
 *
 * No text anywhere in a set. Its parts carry their depth (the sky 0, a
 * far range 0.25, the ground 1, the framing foreground a little more),
 * and `ground-line` says where actors stand and at what scale (its value:
 * units a metre).
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotPartDto,
  ShotSceneryDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { ERA_IDS, type EraId } from './eras';
import {
  type BuildingKind,
  type Climate,
  type Size,
  buildingParts,
} from './buildings';
import {
  band,
  box,
  clipBox,
  dome,
  hashText,
  poly,
  seeded,
  type Seeded,
  vivid,
} from './paint';
import { type Pt, type Shape, circle, ellipse, n1, unionBox } from './shape';
import {
  type KitLook,
  type KitStyle,
  kitStyle,
  luminance,
  mixOk,
} from './style';

// ── Settings ──────────────────────────────────────────────────────────────

export const SET_LANDS = [
  'plain',
  'hills',
  'mountains',
  'coast',
  'desert',
  'forest',
  'city',
  'sea',
] as const;
export type SetLand = (typeof SET_LANDS)[number];
export const SET_TIMES = ['day', 'dusk', 'night', 'dawn'] as const;
export type SetTime = (typeof SET_TIMES)[number];
export const SET_WEATHERS = [
  'clear',
  'cloud',
  'rain',
  'snow',
  'storm',
  'haze',
] as const;
export type SetWeather = (typeof SET_WEATHERS)[number];
export const SET_TOWNS = ['none', 'village', 'town', 'city'] as const;
export type SetTown = (typeof SET_TOWNS)[number];
/** What the place is for: it sets what stands in it. The last two are places of their own. */
export const SET_PLACES = [
  'open',
  'farm',
  'port',
  'industry',
  'market',
  'city',
  'oilfield',
  'assembly-hall',
  'ceremony-ground',
  'display',
] as const;
export type SetPlace = (typeof SET_PLACES)[number];
/** The states a set can be in, and change between while a shot is on. */
export const SET_STATES = [
  'day',
  'dusk',
  'night',
  'dawn',
  'lights-on',
] as const;
export type SetState = (typeof SET_STATES)[number];

export interface SetSettings {
  land: SetLand;
  time: SetTime;
  weather: SetWeather;
  town: SetTown;
  era: EraId;
  place: SetPlace;
  /** The climate its buildings are built for; worked out from the land and weather when absent. */
  climate?: Climate;
}

/** How long a set takes to change to a state, ms: the sun setting is slow, the lights quicker. */
export const CHANGE_MS: Readonly<Record<SetState, number>> = {
  day: 4000,
  dusk: 4500,
  night: 4500,
  dawn: 4500,
  'lights-on': 2600,
};

/** A set's box per shape: a little wider than the film's frame, for the camera's travels. */
export const SET_FRAME: Readonly<Record<FilmShape, { w: number; h: number }>> =
  {
    wide: { w: 2000, h: 1000 },
    tall: { w: 1000, h: 1700 },
  };

/** A set made: the asset the stage plays, where actors stand on it and at what scale, the air far things fade into, and notes for the log. */
export interface DrawnSet {
  asset: ShotSvgAssetDto;
  /** The ground line actors stand on, in its units. */
  ground: number;
  /** Its units a metre at that ground line; absent on a display, where what stands is sized to be big. */
  unitsPerMetre?: number;
  /** The low sky's colour as it opens: what far people standing in it fade into (kitStyle's air). */
  air: string;
  notes: string[];
}

/**
 * Where a part's `n`th light comes in the order the lights come on, 0 to
 * 1: the same on the client (lib/shots/scenery's lightRank), so a still
 * drawn here and the player light the same windows.
 */
export const lightRank = (part: string, n: number): number =>
  hashText(`${part}:${n}`) / 4294967296;

// ── Light ─────────────────────────────────────────────────────────────────

/** How a time of day lights the set: the sky, the sun and moon, the stars, clouds, how the land is toned, the water, the veil over what is built, the windows lit. */
interface Light {
  sky: [string, string, string, string];
  sun: string;
  sunOpacity: number;
  glow: string;
  glowOpacity: number;
  moonOpacity: number;
  stars: number;
  cloud: string;
  /** The tone the land takes, and how much of it. */
  tone: string;
  dim: number;
  water: string;
  glint: number;
  veil: string;
  veilOpacity: number;
  lit: number;
  /** What the far layers fade into. */
  haze: string;
}

const TIME_LIGHT: Readonly<Record<SetTime, Light>> = {
  day: {
    sky: ['#4a89c9', '#79addd', '#afd1ea', '#d9e8ee'],
    sun: '#fff4d2',
    sunOpacity: 1,
    glow: '#fff6dc',
    glowOpacity: 0.4,
    moonOpacity: 0,
    stars: 0,
    cloud: '#f7f8f8',
    tone: '#ffffff',
    dim: 0,
    water: '#3d7fb3',
    glint: 0.55,
    veil: '#2b3350',
    veilOpacity: 0,
    lit: 0,
    haze: '#c6d9e5',
  },
  dusk: {
    sky: ['#232e58', '#55457d', '#c9726d', '#efad63'],
    sun: '#ffd27c',
    sunOpacity: 1,
    glow: '#ff9a58',
    glowOpacity: 1,
    moonOpacity: 0.3,
    stars: 0.14,
    cloud: '#e39c8a',
    tone: '#47386a',
    dim: 0.46,
    water: '#4a4878',
    glint: 0.85,
    veil: '#2b2450',
    veilOpacity: 0.5,
    lit: 0.16,
    haze: '#c4867c',
  },
  night: {
    sky: ['#060e20', '#0c1a36', '#142850', '#1f3563'],
    sun: '#ffd27c',
    sunOpacity: 0,
    glow: '#9fb6e6',
    glowOpacity: 0.12,
    moonOpacity: 1,
    stars: 1,
    cloud: '#25304c',
    tone: '#0a132d',
    dim: 0.82,
    water: '#0e1c39',
    glint: 0.35,
    veil: '#0a1228',
    veilOpacity: 0.8,
    lit: 0.62,
    haze: '#1c2c53',
  },
  dawn: {
    sky: ['#33507e', '#7a81b0', '#e4a396', '#f4d3a5'],
    sun: '#ffdca2',
    sunOpacity: 1,
    glow: '#ffbe88',
    glowOpacity: 0.85,
    moonOpacity: 0.15,
    stars: 0.08,
    cloud: '#efc2b2',
    tone: '#6a5985',
    dim: 0.32,
    water: '#596995',
    glint: 0.7,
    veil: '#3c3765',
    veilOpacity: 0.36,
    lit: 0.22,
    haze: '#d8b0a5',
  },
};

/** What weather does to a time's light: the sky pulled toward its own colour by `k`, the sun hidden as much, the land dimmer. */
const WEATHER_SKY: Readonly<
  Record<
    SetWeather,
    { k: number; colour: Record<SetTime, string>; sun: number; dim: number }
  >
> = {
  clear: {
    k: 0,
    colour: {
      day: '#ffffff',
      dusk: '#ffffff',
      night: '#ffffff',
      dawn: '#ffffff',
    },
    sun: 1,
    dim: 0,
  },
  cloud: {
    k: 0.42,
    colour: {
      day: '#a3adb7',
      dusk: '#6f6178',
      night: '#18203a',
      dawn: '#a497a8',
    },
    sun: 0.55,
    dim: 0.1,
  },
  rain: {
    k: 0.74,
    colour: {
      day: '#7c8794',
      dusk: '#4b4859',
      night: '#10182b',
      dawn: '#77778a',
    },
    sun: 0,
    dim: 0.42,
  },
  storm: {
    k: 0.86,
    colour: {
      day: '#4c5564',
      dusk: '#353148',
      night: '#0b111f',
      dawn: '#4f4d62',
    },
    sun: 0,
    dim: 0.55,
  },
  snow: {
    k: 0.55,
    colour: {
      day: '#cdd5dc',
      dusk: '#a49cb4',
      night: '#26314a',
      dawn: '#d3c9d1',
    },
    sun: 0.3,
    dim: 0.04,
  },
  haze: {
    k: 0.5,
    colour: {
      day: '#e4d2b2',
      dusk: '#e09d6e',
      night: '#2b2d42',
      dawn: '#ecd3b2',
    },
    sun: 0.6,
    dim: 0.06,
  },
};

/** A natural colour in the show's look: the editorial look pulls it a little toward the paper; the illustrated one makes it brighter. */
function toLook(style: KitStyle, colour: string): string {
  if (style.look === 'illustrated') return vivid(colour, 0.14);
  const dark = luminance(style.paper) < 0.35;
  return mixOk(colour, style.paper, dark ? 0.05 : 0.08);
}

/** A time's light under a weather, in the show's colours. */
function lightOf(time: SetTime, weather: SetWeather, style: KitStyle): Light {
  const base = TIME_LIGHT[time];
  const w = WEATHER_SKY[weather];
  const look = (c: string) => toLook(style, c);
  const grey = w.colour[time];
  return {
    ...base,
    sky: base.sky.map((c) => look(mixOk(c, grey, w.k))) as Light['sky'],
    sunOpacity: base.sunOpacity * w.sun,
    glowOpacity: base.glowOpacity * (0.3 + 0.7 * w.sun),
    moonOpacity:
      base.moonOpacity * (weather === 'clear' || weather === 'haze' ? 1 : 0.35),
    stars:
      base.stars * (weather === 'clear' ? 1 : weather === 'haze' ? 0.4 : 0.1),
    cloud: look(
      mixOk(
        base.cloud,
        grey,
        weather === 'rain' || weather === 'storm' ? 0.75 : w.k * 0.5,
      ),
    ),
    // Weather darkens the land toward its own grey, not toward the day's white.
    tone:
      w.dim > 0
        ? mixOk(base.tone, grey, Math.min(1, w.k + (time === 'day' ? 0.3 : 0)))
        : base.tone,
    dim: Math.min(0.9, base.dim + w.dim),
    water: look(mixOk(base.water, grey, w.k * 0.6)),
    glint: base.glint * (0.3 + 0.7 * w.sun),
    haze: look(mixOk(base.haze, grey, w.k)),
  };
}

/** A colour as a time of day's light tones it. */
const toned = (colour: string, light: Light): string =>
  mixOk(colour, light.tone, light.dim);

// ── The land ──────────────────────────────────────────────────────────────

/** Each land's colours by day: its far range, its middle, its near land and its ground. */
const LAND_COLOUR: Readonly<
  Record<SetLand, { far: string; mid: string; near: string; ground: string }>
> = {
  plain: { far: '#9fb08c', mid: '#8aa271', near: '#94ab69', ground: '#9db26c' },
  hills: { far: '#90a782', mid: '#76976a', near: '#86a35f', ground: '#93ad63' },
  mountains: {
    far: '#8f9db4',
    mid: '#7f907f',
    near: '#86996a',
    ground: '#96a96a',
  },
  coast: { far: '#9aab90', mid: '#8ba077', near: '#a5a99a', ground: '#cdb98a' },
  desert: {
    far: '#cfae84',
    mid: '#ddbb8a',
    near: '#e3c491',
    ground: '#e6cc9b',
  },
  forest: {
    far: '#6c9273',
    mid: '#4d7b58',
    near: '#3f6c47',
    ground: '#5a8247',
  },
  city: { far: '#a3a9b3', mid: '#959ca6', near: '#8d939b', ground: '#8c9097' },
  sea: { far: '#9aab90', mid: '#8ba077', near: '#a5a99a', ground: '#cdb98a' },
};

/** The climate a set's buildings are built for, from its land and weather when the board names none. */
export function climateOf(
  settings: Pick<SetSettings, 'land' | 'weather' | 'climate'>,
): Climate {
  if (settings.climate) return settings.climate;
  if (settings.land === 'desert') return 'arid';
  if (settings.weather === 'snow') return 'cold';
  return 'temperate';
}

/** A seeded wavy line: the sum of a few sines with seeded phases, between 0 and 1. */
function waves(rng: Seeded, count: number): (u: number) => number {
  const parts = Array.from({ length: count }, (_, i) => ({
    f: (i + 1) * rng.between(0.8, 1.4),
    a: 1 / (i + 1),
    p: rng.between(0, Math.PI * 2),
  }));
  const total = parts.reduce((s, one) => s + one.a, 0);
  return (u) =>
    0.5 +
    parts.reduce(
      (s, one) => s + one.a * Math.sin(u * one.f * Math.PI * 2 + one.p),
      0,
    ) /
      (2 * total);
}

/** A layer's silhouette: its top edge from x0 to x1 (`top(x)`), down to `bottom`. */
function silhouette(
  x0: number,
  x1: number,
  bottom: number,
  top: (x: number) => number,
  steps: number,
): Shape {
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    points.push([x, top(x)]);
  }
  points.push([x1, bottom], [x0, bottom]);
  return poly(points);
}

/** A range of peaks: a jagged ridge (straight slopes between peaks and saddles), and the snow on its peaks. */
function peaks(
  x0: number,
  x1: number,
  bottom: number,
  base: number,
  height: number,
  rng: Seeded,
): { ridge: Shape; caps: Shape[] } {
  const points: Pt[] = [[x0, base - height * 0.3]];
  const caps: Shape[] = [];
  let x = x0;
  while (x < x1) {
    const step = rng.between(0.07, 0.14) * (x1 - x0);
    const peak = base - height * rng.between(0.55, 1);
    const saddle = base - height * rng.between(0.15, 0.45);
    const left = points[points.length - 1];
    const top: Pt = [x + step * 0.5, peak];
    points.push(top, [x + step, saddle]);
    // Snow on each peak: down a quarter of its slopes, its lower edge ragged.
    const k = 0.28;
    const rightFoot: Pt = [top[0] + step * 0.5 * k, peak + (saddle - peak) * k];
    const leftFoot: Pt = [
      top[0] - (top[0] - left[0]) * k,
      peak + (left[1] - peak) * k,
    ];
    caps.push(
      poly([
        top,
        rightFoot,
        [top[0] + step * 0.06, peak + (saddle - peak) * k * 0.62],
        [top[0] - step * 0.04, peak + (saddle - peak) * k * 0.85],
        leftFoot,
      ]),
    );
    x += step;
  }
  points.push([x1, bottom], [x0, bottom]);
  return { ridge: poly(points), caps };
}

/** Flat-topped hills of a dry land, far off: trapezoids along the horizon. */
function mesas(
  x0: number,
  x1: number,
  bottom: number,
  base: number,
  height: number,
  rng: Seeded,
): Shape {
  const points: Pt[] = [[x0, base]];
  let x = x0 + (x1 - x0) * rng.between(0.02, 0.1);
  while (x < x1) {
    const w = (x1 - x0) * rng.between(0.08, 0.2);
    const h = height * rng.between(0.4, 1);
    const slope = w * rng.between(0.08, 0.16);
    points.push(
      [x, base],
      [x + slope, base - h],
      [x + w - slope, base - h],
      [Math.min(x1, x + w), base],
    );
    x += w + (x1 - x0) * rng.between(0.05, 0.22);
  }
  points.push([x1, base], [x1, bottom], [x0, bottom]);
  return poly(points);
}

/** Tree crowns along a line: rounded tops (or pointed ones where it is cold), each a circle on a base band. */
function treeLine(
  x0: number,
  x1: number,
  bottom: number,
  base: number,
  size: number,
  rng: Seeded,
  pointed: boolean,
): Shape[] {
  const shapes: Shape[] = [box(x0, base - size * 0.35, x1, bottom)];
  let x = x0;
  while (x < x1) {
    const r = size * rng.between(0.32, 0.55);
    const y = base - size * rng.between(0.35, 0.75);
    shapes.push(
      pointed
        ? poly([
            [x - r * 0.75, base - size * 0.2],
            [x, y - r * 1.2],
            [x + r * 0.75, base - size * 0.2],
          ])
        : circle([x, y], r),
    );
    x += r * rng.between(1.1, 1.6);
  }
  return shapes;
}

/** A flat cloud: a level base with rounded ends, and a few puffs over it, its bottom straight. */
function cloudShapes(cx: number, cy: number, w: number, rng: Seeded): Shape[] {
  const h = w * rng.between(0.11, 0.15);
  const shapes: Shape[] = [box(cx - w / 2, cy - h, cx + w / 2, cy, h / 2)];
  const n = rng.int(2, 4);
  for (let k = 0; k < n; k += 1) {
    const u = (k + 0.5) / n;
    const r = w * rng.between(0.11, 0.18) * (1 - Math.abs(u - 0.5) * 0.7);
    const x = cx - w / 2 + w * (0.18 + 0.64 * u);
    // Each puff's foot on the base line, so the cloud's bottom stays straight.
    shapes.push(dome(x, cy - h * 0.4, r, r * 1.05));
  }
  return shapes;
}

// ── Building a set ────────────────────────────────────────────────────────

/** A part of the set as it is laid down: its markup, its box, depth and pivot. */
interface Layer {
  id: string;
  markup: string;
  box: ShotBox;
  depth?: number;
  pivot?: Pt;
  attrs?: Record<string, string | number>;
  value?: number;
}

type Look = { fill?: string; rotate?: number; opacity?: number; lit?: number };

/** A set being drawn: its layers back to front, its defs, and each state's look of every part that changes. */
class SetCanvas {
  readonly layers: Layer[] = [];
  readonly defs: string[] = [];
  readonly states: Record<string, Record<string, Look>> = {};
  readonly drift: Record<string, { dx?: number; dy?: number; wrap?: number }> =
    {};

  constructor(
    readonly W: number,
    readonly H: number,
    readonly style: KitStyle,
    readonly times: Record<SetState, { time: SetTime; lit?: number }>,
    readonly lights: Record<SetTime, Light>,
    readonly opening: SetTime,
  ) {}

  /** The light a set opens in. */
  get open(): Light {
    return this.lights[this.opening];
  }

  /** A layer of shapes in one colour (the colour on its group, so a state can change it). */
  flat(
    id: string,
    shapes: readonly Shape[],
    fill: string,
    options: Omit<Layer, 'id' | 'markup' | 'box'> = {},
  ): Layer {
    const real = shapes.filter((s) => s.d);
    const layer: Layer = {
      id,
      markup: real.map((s) => `<path d="${s.d}"/>`).join(''),
      box: real.length ? unionBox(real.map((s) => s.box)) : [0, 0, 0, 0],
      ...options,
      attrs: { fill, ...(options.attrs ?? {}) },
    };
    this.layers.push(layer);
    return layer;
  }

  /** A flat layer whose colour each state works out from its light (a land layer, a mast). */
  lit(
    id: string,
    shapes: readonly Shape[],
    colourIn: (light: Light) => string,
    options: Omit<Layer, 'id' | 'markup' | 'box'> = {},
  ): Layer {
    const layer = this.flat(id, shapes, colourIn(this.open), options);
    for (const state of SET_STATES)
      this.look(state, id, {
        fill: colourIn(this.lights[this.times[state].time]),
      });
    return layer;
  }

  /** A layer of markup drawn elsewhere (a building's own colours), with its box. */
  raw(
    id: string,
    markup: string,
    box: ShotBox,
    options: Omit<Layer, 'id' | 'markup' | 'box'> = {},
  ): Layer {
    const layer: Layer = { id, markup, box, ...options };
    this.layers.push(layer);
    return layer;
  }

  /** A veil over what is drawn in its own colours: it darkens it as the light goes. */
  veil(
    id: string,
    shapes: readonly Shape[],
    depth: number,
    strength = 1,
  ): void {
    const open = this.open;
    this.flat(id, shapes, open.veil, {
      depth,
      attrs: { opacity: Math.round(open.veilOpacity * strength * 100) / 100 },
    });
    for (const state of SET_STATES) {
      const light = this.lights[this.times[state].time];
      this.look(state, id, {
        fill: light.veil,
        opacity: Math.round(light.veilOpacity * strength * 100) / 100,
      });
    }
  }

  /**
   * Windows (or lamps) as a lights part: each its own shape, lit by its
   * rank as each state lights them, never fewer than `least` of them;
   * `lamps` are all on as soon as the light goes (street lamps, floodlights).
   */
  windows(
    id: string,
    shapes: readonly Shape[],
    depth: number,
    colour = '#ffd88a',
    least = 0,
    lamps = false,
  ): void {
    if (!shapes.length) return;
    const levelOf = (state: SetState) => {
      const level = Math.max(
        least,
        this.times[state].lit ?? this.lights[this.times[state].time].lit,
      );
      return lamps ? (level >= 0.1 ? 1 : 0) : level;
    };
    const open = levelOf(this.opening);
    this.raw(
      id,
      shapes
        .map(
          (s, n) =>
            `<path d="${s.d}"${lightRank(id, n) < open ? '' : ' opacity="0"'}/>`,
        )
        .join(''),
      unionBox(shapes.map((s) => s.box)),
      { depth, attrs: { fill: colour } },
    );
    for (const state of SET_STATES)
      this.look(state, id, { lit: Math.round(levelOf(state) * 100) / 100 });
  }

  /** A part's look in a state. */
  look(state: string, part: string, look: Look): void {
    this.states[state] ??= {};
    this.states[state][part] = { ...(this.states[state][part] ?? {}), ...look };
  }

  /** The set put together: the svg, its parts (boxes inside the set), its scenery. */
  asset(focal: ShotBox): ShotSvgAssetDto {
    const frame: ShotBox = [0, 0, this.W, this.H];
    const parts: Record<string, ShotPartDto> = {};
    const markup = this.layers
      .map((layer) => {
        const attrs = Object.entries(layer.attrs ?? {})
          .map(
            ([k, v]) =>
              ` ${k}="${typeof v === 'number' ? Math.round(v * 1000) / 1000 : v}"`,
          )
          .join('');
        const inside = clipBox(layer.box, frame);
        const part: ShotPartDto = { box: inside };
        if (layer.pivot) {
          const [bx, by, bw, bh] = inside;
          part.pivot = [
            Math.round(((layer.pivot[0] - bx) / Math.max(1e-6, bw)) * 1000) /
              1000,
            Math.round(((layer.pivot[1] - by) / Math.max(1e-6, bh)) * 1000) /
              1000,
          ];
        }
        if (layer.depth !== undefined && layer.depth !== 1)
          part.depth = layer.depth;
        if (layer.value !== undefined) part.value = layer.value;
        parts[layer.id] = part;
        return `<g data-part="${layer.id}"${attrs}>${layer.markup}</g>`;
      })
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}">${this.defs.length ? `<defs>${this.defs.join('')}</defs>` : ''}${markup}</svg>`;
    const scenery: ShotSceneryDto = {
      state: this.opening,
      states: this.states,
      ...(Object.keys(this.drift).length ? { drift: this.drift } : {}),
    };
    return { kind: 'svg', svg, box: frame, parts, focal, scenery };
  }
}

/** The states a set describes, each with the time of day it shows and its lights (lights-on keeps the opening's time). */
function stateTimes(
  opening: SetTime,
): Record<SetState, { time: SetTime; lit?: number }> {
  return {
    day: { time: 'day' },
    dusk: { time: 'dusk' },
    night: { time: 'night' },
    dawn: { time: 'dawn' },
    'lights-on': { time: opening, lit: 1 },
  };
}

/** The sun's arc: its middle and radius, so the sun stands high by day and touches the horizon at dusk and dawn, inside the frame. */
function sunArc(
  W: number,
  H: number,
  horizon: number,
): { c: Pt; r: number; angle: Record<SetTime, number> } {
  const dusk = 70;
  const r = (0.28 * W) / Math.sin((dusk * Math.PI) / 180);
  const k = r * Math.cos((dusk * Math.PI) / 180) - 0.035 * H;
  return {
    c: [W / 2, horizon + k],
    r,
    angle: { day: 34, dusk, night: 118, dawn: -dusk },
  };
}

const onArc = (c: Pt, r: number, deg: number): Pt => [
  c[0] + r * Math.sin((deg * Math.PI) / 180),
  c[1] - r * Math.cos((deg * Math.PI) / 180),
];

/** A path's numbers moved by dx, dy (the kit's paths are absolute M, L, C and Z only). */
function shift(d: string, dx: number, dy: number): string {
  let k = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (m) =>
    n1(Number(m) + (k++ % 2 === 0 ? dx : dy)),
  );
}

/** A path's numbers scaled by k and moved by x, y (absolute commands only, as the kit draws). */
function scalePath(d: string, k: number, x: number, y: number): string {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (m) =>
    n1(Number(m) * k + (i++ % 2 === 0 ? x : y)),
  );
}

/**
 * The subject box the camera frames at a set's opening, made to fit whole
 * in the largest view inside the set (the camera's rule: lib/shots/
 * camera's frameFor), so the opening never shows past the set's edges.
 */
function fitFocal(
  focal: ShotBox,
  W: number,
  H: number,
  shape: FilmShape,
): ShotBox {
  const aspect = shape === 'wide' ? 16 / 9 : 9 / 16;
  const fit = Math.min(H, W / aspect);
  const most = { w: fit * aspect * 0.9, h: fit * 0.9 };
  const w = Math.min(focal[2], most.w);
  const h = Math.min(focal[3], most.h);
  const cx = focal[0] + focal[2] / 2;
  const y = focal[1] + focal[3] - h;
  return [
    Math.round(cx - w / 2),
    Math.round(Math.max(0, y)),
    Math.round(w),
    Math.round(h),
  ];
}

/**
 * A set drawn from its settings, in the show's look (the editorial look
 * by default, the illustrated one brighter); as it opens (its `time`),
 * with the look of every state it may change to.
 */
export function drawSet(
  settings: SetSettings,
  look: ShotLookDto,
  options: { shape: FilmShape; kitLook?: KitLook; seed: number },
): DrawnSet {
  const { shape } = options;
  const { w: W, h: H } = SET_FRAME[shape];
  const style = kitStyle(look, { look: options.kitLook ?? 'editorial', shape });
  const rng = seeded(options.seed ^ 0x5e75e7);
  const place: SetPlace =
    settings.place === 'open' && settings.land === 'city'
      ? 'city'
      : settings.place;
  // A port needs its coast.
  const s: SetSettings = {
    ...settings,
    place,
    land: place === 'port' ? 'coast' : settings.land,
  };
  const times = stateTimes(s.time);
  const lights = Object.fromEntries(
    SET_TIMES.map((t) => [t, lightOf(t, s.weather, style)]),
  ) as Record<SetTime, Light>;
  const canvas = new SetCanvas(W, H, style, times, lights, s.time);
  if (place === 'assembly-hall') return assemblyHall(canvas, s, shape);
  if (place === 'display') return display(canvas, shape);

  const notes: string[] = [
    `${s.land}, ${s.time}, ${s.weather}, ${s.town}, ${place}, ${s.era}`,
  ];
  const watery = s.land === 'coast' || s.land === 'sea';
  // The frame's bands: the horizon; the line the place's buildings stand on (by the coast, the far shore); the line actors stand on.
  const horizon = H * (s.land === 'mountains' ? 0.56 : watery ? 0.5 : 0.54);
  const farShore = H * 0.6;
  const nearBase = s.land === 'coast' ? farShore : H * 0.8;
  const nearShore = H * 0.9;
  const groundY = H * (s.land === 'sea' ? 0.88 : 0.935);
  const over = W * 0.06;
  const x0 = -over;
  const x1 = W + over;
  const bottom = H + over;
  const open = lights[s.time];
  const tall = shape === 'tall';

  // ── The sky: a gradient whose four stops change with the state.
  const stops = [0, 0.42, 0.8, 1];
  canvas.defs.push(
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="${n1(horizon)}" gradientUnits="userSpaceOnUse">${stops
      .map(
        (o, i) =>
          `<stop offset="${o}" stop-color="${open.sky[i]}" data-part="sky-${i + 1}"/>`,
      )
      .join('')}</linearGradient>`,
  );
  canvas.raw(
    'sky',
    `<rect x="${-over}" y="${-over}" width="${W + 2 * over}" height="${H + 2 * over}" fill="url(#sky)"/>`,
    [0, 0, W, H],
    { depth: 0 },
  );
  for (let i = 0; i < 4; i += 1)
    for (const state of SET_STATES)
      canvas.look(state, `sky-${i + 1}`, {
        fill: lights[times[state].time].sky[i],
      });

  // ── Stars, the moon, the sun and its glow on their arc.
  const stars: Shape[] = [];
  // Stars as small diamonds: a few points each, light to send.
  for (let i = 0; i < 70; i += 1) {
    const [x, y] = [rng.between(0, W), rng.between(0, horizon * 0.72)];
    const r = rng.between(1.4, 3.6);
    stars.push(
      poly([
        [x, y - r],
        [x + r, y],
        [x, y + r],
        [x - r, y],
      ]),
    );
  }
  canvas.flat('stars', stars, '#fdf6e3', {
    depth: 0,
    attrs: { opacity: open.stars },
  });
  const moonAt: Pt = [W * (tall ? 0.26 : 0.2), horizon * 0.28];
  const moonR = Math.min(W, H) * 0.034;
  canvas.raw(
    'moon',
    `<circle cx="${n1(moonAt[0])}" cy="${n1(moonAt[1])}" r="${n1(moonR * 2.8)}" fill="#dfe7ff" opacity="0.1"/><circle cx="${n1(moonAt[0])}" cy="${n1(moonAt[1])}" r="${n1(moonR)}" fill="#f4f1e6"/><circle cx="${n1(moonAt[0] - moonR * 0.3)}" cy="${n1(moonAt[1] - moonR * 0.2)}" r="${n1(moonR * 0.22)}" fill="#ddd8c8"/><circle cx="${n1(moonAt[0] + moonR * 0.35)}" cy="${n1(moonAt[1] + moonR * 0.3)}" r="${n1(moonR * 0.15)}" fill="#ddd8c8"/>`,
    [
      moonAt[0] - moonR * 2.8,
      moonAt[1] - moonR * 2.8,
      moonR * 5.6,
      moonR * 5.6,
    ],
    { depth: 0.02, attrs: { opacity: open.moonOpacity } },
  );
  const arc = sunArc(W, H, horizon);
  const sunR = Math.min(W, H) * 0.05;
  const sunAt = onArc(arc.c, arc.r, arc.angle[s.time]);
  const glowR = Math.min(W, H) * 0.55;
  canvas.defs.push(
    `<radialGradient id="glow"><stop offset="0" stop-color="${open.glow}" stop-opacity="0.95" data-part="glow-1"/><stop offset="0.3" stop-color="${open.glow}" stop-opacity="0.42" data-part="glow-2"/><stop offset="1" stop-color="${open.glow}" stop-opacity="0" data-part="glow-3"/></radialGradient>`,
  );
  canvas.raw(
    'sun',
    `<circle cx="${n1(sunAt[0])}" cy="${n1(sunAt[1])}" r="${n1(glowR)}" fill="url(#glow)" opacity="${Math.round(open.glowOpacity * 100) / 100}" data-part="glow"/><circle cx="${n1(sunAt[0])}" cy="${n1(sunAt[1])}" r="${n1(sunR)}" fill="${open.sun}" data-part="sun-disc"/>`,
    // Its box reaches to the arc's middle, so its pivot is inside it.
    unionBox([
      [sunAt[0] - sunR, sunAt[1] - sunR, 2 * sunR, 2 * sunR],
      [arc.c[0] - 1, arc.c[1] - 1, 2, 2],
    ]),
    { depth: 0.04, pivot: arc.c, attrs: { opacity: open.sunOpacity } },
  );
  for (const state of SET_STATES) {
    const light = lights[times[state].time];
    canvas.look(state, 'stars', { opacity: light.stars });
    canvas.look(state, 'moon', { opacity: light.moonOpacity });
    canvas.look(state, 'sun', {
      rotate: arc.angle[times[state].time] - arc.angle[s.time],
      opacity: light.sunOpacity,
    });
    canvas.look(state, 'glow', { opacity: light.glowOpacity });
    for (let i = 1; i <= 3; i += 1)
      canvas.look(state, `glow-${i}`, { fill: light.glow });
    canvas.look(state, 'sun-disc', { fill: light.sun });
  }

  // ── Clouds, drifting (each with a copy a wrap behind it, so it comes in on one side as it leaves the other).
  const cloudCount = {
    clear: 3,
    cloud: 6,
    rain: 7,
    storm: 8,
    snow: 6,
    haze: 2,
  }[s.weather];
  const heavy = s.weather === 'rain' || s.weather === 'storm';
  for (let i = 0; i < cloudCount; i += 1) {
    const cw =
      W * rng.between(0.14, 0.28) * (heavy ? 1.5 : 1) * (tall ? 1.4 : 1);
    const cx = rng.between(0, W);
    const cy = rng.between(horizon * 0.14, horizon * (heavy ? 0.5 : 0.7));
    const shapes = cloudShapes(cx, cy, cw, rng);
    const wrap = W + cw * 2.4;
    const both = [
      ...shapes,
      ...shapes.map((p) => ({
        d: shift(p.d, -wrap, 0),
        box: [p.box[0] - wrap, p.box[1], p.box[2], p.box[3]] as ShotBox,
      })),
    ];
    const id = `cloud-${i + 1}`;
    canvas.flat(id, both, open.cloud, {
      depth: Math.round(rng.between(0.06, 0.16) * 100) / 100,
      attrs: { opacity: s.weather === 'haze' ? 0.55 : 0.94 },
    });
    canvas.drift[id] = {
      dx: Math.round(rng.between(4, 11) * (W / 2000) * 10) / 10,
      wrap: Math.round(wrap),
    };
    for (const state of SET_STATES)
      canvas.look(state, id, { fill: lights[times[state].time].cloud });
  }

  // ── The land, far to near, each layer's colour toned by the light and hazed by its distance.
  const colours = LAND_COLOUR[s.land];
  const snowy = s.weather === 'snow';
  const landColour = (base: string, depth: number) => (light: Light) => {
    const hazed = mixOk(
      toned(base, light),
      light.haze,
      (1 - depth) * (0.6 + (s.weather === 'haze' ? 0.2 : 0)),
    );
    return toLook(
      style,
      snowy
        ? mixOk(hazed, mixOk('#f1f4f7', light.tone, light.dim), 0.62 * depth)
        : hazed,
    );
  };
  if (s.land === 'mountains') {
    const range = peaks(x0, x1, bottom, horizon, H * 0.34, rng);
    canvas.lit('land-far', [range.ridge], landColour(colours.far, 0.22), {
      depth: 0.22,
    });
    canvas.lit(
      'snowcaps',
      range.caps,
      (light) =>
        toLook(
          style,
          mixOk(
            mixOk('#f4f6f8', light.tone, light.dim * 0.85),
            light.haze,
            0.3,
          ),
        ),
      { depth: 0.22 },
    );
    const roll = waves(rng, 3);
    canvas.lit(
      'land-mid',
      [
        silhouette(
          x0,
          x1,
          bottom,
          (x) => horizon + H * 0.04 - H * 0.1 * roll(x / W),
          40,
        ),
      ],
      landColour(colours.mid, 0.45),
      { depth: 0.45 },
    );
  } else if (s.land === 'desert') {
    canvas.lit(
      'land-far',
      [mesas(x0, x1, bottom, horizon, H * 0.13, rng)],
      landColour(colours.far, 0.25),
      { depth: 0.25 },
    );
    const dune = waves(rng, 3);
    canvas.lit(
      'land-mid',
      [
        silhouette(
          x0,
          x1,
          bottom,
          (x) => horizon + H * 0.05 - H * 0.07 * dune(x / W),
          60,
        ),
      ],
      landColour(colours.mid, 0.5),
      { depth: 0.5 },
    );
  } else if (s.land === 'forest') {
    const pointed = snowy || climateOf(s) === 'cold';
    canvas.lit(
      'land-far',
      treeLine(x0, x1, bottom, horizon, H * 0.09, rng, pointed),
      landColour(colours.far, 0.28),
      { depth: 0.28 },
    );
    canvas.lit(
      'land-mid',
      treeLine(x0, x1, bottom, horizon + H * 0.09, H * 0.15, rng, pointed),
      landColour(colours.mid, 0.55),
      { depth: 0.55 },
    );
  } else if (s.land !== 'sea') {
    const roll = waves(rng, 3);
    const height =
      s.land === 'hills'
        ? 0.12
        : s.land === 'city'
          ? 0.02
          : s.land === 'coast'
            ? 0.07
            : 0.05;
    canvas.lit(
      'land-far',
      [
        silhouette(
          x0,
          x1,
          bottom,
          (x) => horizon - H * height * roll(x / W),
          60,
        ),
      ],
      landColour(colours.far, 0.25),
      { depth: 0.25 },
    );
    if (s.land === 'hills') {
      const roll2 = waves(rng, 2);
      canvas.lit(
        'land-mid',
        [
          silhouette(
            x0,
            x1,
            bottom,
            (x) => horizon + H * 0.08 - H * 0.12 * roll2(x / W),
            50,
          ),
        ],
        landColour(colours.mid, 0.5),
        { depth: 0.5 },
      );
    }
  }

  // ── The far townscape along the horizon (or the far shore): blocks by density and era, its windows lighting.
  const climate = climateOf(s);
  const town: SetTown =
    s.town === 'none' &&
    (place === 'industry' || place === 'city' || place === 'port')
      ? 'town'
      : s.town;
  if (town !== 'none') {
    const far = farTownscape(
      rng,
      W,
      H,
      s.land === 'coast' ? farShore - H * 0.02 : horizon,
      town,
      s.era,
      place,
    );
    canvas.lit(
      'town-far',
      far.blocks,
      (light) =>
        toLook(
          style,
          mixOk(
            mixOk('#7d8592', light.tone, light.dim * 0.9),
            light.haze,
            0.35,
          ),
        ),
      { depth: 0.45 },
    );
    canvas.windows('lights-far', far.windows, 0.45);
    far.smoke
      .filter(([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H)
      .forEach((p, i) =>
        canvas.raw(
          `smoke-far${i ? `-${i + 1}` : ''}`,
          '',
          [p[0] - 1, p[1] - 1, 2, 2],
          { depth: 0.45 },
        ),
      );
  }

  // ── The coast: the far shore the place stands on, across the water.
  if (s.land === 'coast')
    canvas.lit(
      'far-shore',
      [box(x0, farShore - H * 0.02, x1, farShore + H * 0.014)],
      landColour(place === 'port' ? '#9a9993' : colours.near, 0.62),
      { depth: 0.62 },
    );
  if (s.land !== 'coast' && s.land !== 'sea')
    canvas.lit(
      'ground',
      [
        silhouette(
          x0,
          x1,
          bottom,
          (x) => nearBase - H * 0.015 + H * 0.008 * waves(rng, 2)(x / W),
          30,
        ),
      ],
      landColour(colours.ground, 1),
    );

  // ── The place's own buildings on the near ground (or the far shore), the veil that darkens them, their lights.
  // A tall frame is half as wide: what stands in it is drawn twice as big, so it fills the frame's width as it does a wide one.
  const scale = tall ? 2 : 1;
  const hero = heroes(place, town, s, climate, rng, W, scale);
  const cargo =
    place === 'port' && ERA_IDS.indexOf(s.era) >= ERA_IDS.indexOf('1945-1975')
      ? containers(rng, style, W * 0.28, W * 0.62, nearBase, W, scale)
      : [];
  if (hero.length || cargo.length) {
    const near = placeBuildings(hero, style, s, climate, rng, nearBase, W);
    const depth = s.land === 'coast' ? 0.62 : 0.8;
    canvas.raw(
      'town',
      cargo.map(([sh, f]) => `<path d="${sh.d}" fill="${f}"/>`).join('') +
        near.markup,
      unionBox([near.box, ...cargo.map(([sh]) => sh.box)]),
      { depth },
    );
    canvas.veil(
      'town-veil',
      [...cargo.map(([sh]) => sh), ...near.silhouettes],
      depth,
    );
    canvas.windows('lights', near.windows, depth);
    near.smoke.forEach((p, i) =>
      canvas.raw(
        i ? `smoke-${i + 1}` : 'smoke',
        '',
        [p[0] - 1, p[1] - 1, 2, 2],
        { depth },
      ),
    );
    notes.push(...near.notes);
  }
  if (place === 'ceremony-ground') ceremonyGround(canvas, nearBase);
  if (place === 'oilfield') oilField(canvas, nearBase, rng);

  // ── Water: the harbour or the bay before the far shore (the open sea from the horizon), its glints, a shimmer anchor.
  if (watery) {
    const top = s.land === 'sea' ? horizon : farShore + H * 0.014;
    const bottomOfWater = s.land === 'sea' ? bottom : nearShore + H * 0.004;
    canvas.lit(
      'water',
      [box(x0, top, x1, bottomOfWater)],
      (light) => light.water,
      { depth: 0.8 },
    );
    // The far shore's shadow on the water, and the glints of the light on it.
    canvas.lit(
      'water-shade',
      [box(x0, top, x1, top + H * 0.04)],
      (light) => mixOk(light.water, '#000000', 0.3),
      { depth: 0.8, attrs: { opacity: 0.5 } },
    );
    const glints: Shape[] = [];
    for (let i = 0; i < 60; i += 1) {
      const y = rng.between(top + H * 0.045, bottomOfWater - H * 0.01);
      const near = (y - top) / Math.max(1, bottomOfWater - top);
      const x = rng.between(x0, x1);
      const len = W * rng.between(0.012, 0.04) * (0.5 + near);
      glints.push(box(x - len / 2, y, x + len / 2, y + 1.5 + near * 3, 1));
    }
    canvas.flat('glints', glints, '#fff3d8', {
      depth: 0.85,
      attrs: { opacity: open.glint },
    });
    for (const state of SET_STATES)
      canvas.look(state, 'glints', {
        opacity: lights[times[state].time].glint,
      });
    canvas.raw('shimmer', '', [0, top, W, Math.min(H, bottomOfWater) - top], {
      depth: 0.85,
    });
    // A port's ship, moored at the far quay in front of its cranes.
    if (place === 'port') {
      const ship = mooredShip(
        rng,
        style,
        s.era,
        W,
        top + H * 0.034,
        (W / 2000) * scale,
      );
      const shapes = ship.shapes.map(([sh]) => sh);
      canvas.raw(
        'ship',
        ship.shapes
          .map(([sh, f]) => `<path d="${sh.d}" fill="${f}"/>`)
          .join(''),
        unionBox(shapes.map((sh) => sh.box)),
        { depth: 0.66 },
      );
      canvas.veil('ship-veil', shapes, 0.66);
      canvas.windows('ship-lights', ship.windows, 0.66);
    }
    if (s.land === 'coast') {
      // The near shore: a quay at a port, a beach elsewhere.
      const shore =
        place === 'port'
          ? box(x0, nearShore, x1, bottom)
          : silhouette(
              x0,
              x1,
              bottom,
              (x) => nearShore - H * 0.014 * waves(rng, 2)(x / W),
              30,
            );
      canvas.lit(
        'ground',
        [shore],
        landColour(place === 'port' ? '#a19d94' : colours.ground, 1),
      );
    }
  }

  // ── The near ground's marks, and what frames the picture in front.
  if (s.land !== 'sea') {
    const marks = groundMarks(
      place,
      s,
      rng,
      W,
      H,
      nearBase,
      groundY,
      bottom,
      x0,
      x1,
    );
    if (marks.length)
      canvas.lit('ground-marks', marks, (light) =>
        mixOk(
          landColour(
            s.land === 'coast' && place === 'port' ? '#a19d94' : colours.ground,
            1,
          )(light),
          '#000000',
          0.13,
        ),
      );
    const front = framing(place, s, rng, W, H, groundY, bottom);
    if (front.shapes.length) {
      canvas.lit(
        'foreground',
        front.shapes,
        (light) => toLook(style, toned(front.colour, light)),
        { depth: 1.12 },
      );
      canvas.windows('lamps', front.lamps, 1.12, '#ffe6a8', 0, true);
    }
  }

  // ── Weather that falls: rain streaks or snow, tiled so it falls for ever.
  if (heavy || snowy) {
    const tile = snowy ? H * 0.4 : H * 0.3;
    const shapes: Shape[] = [];
    const count = s.weather === 'storm' ? 120 : heavy ? 85 : 70;
    const drops = Array.from({ length: count }, () => ({
      x: rng.between(-W * 0.05, W * 1.05),
      y: rng.between(0, tile),
      l: rng.between(0.6, 1.2),
    }));
    const unit = Math.min(W, H) / 1000;
    for (let k = -1; k * tile < H + tile; k += 1)
      for (const drop of drops) {
        const y = drop.y + k * tile;
        if (snowy) shapes.push(circle([drop.x, y], 3 * drop.l * unit));
        else
          shapes.push(
            band(
              [drop.x, y],
              [drop.x - 12 * drop.l * unit, y + 46 * drop.l * unit],
              1.8 * unit,
            ),
          );
      }
    const id = snowy ? 'snow' : 'rain';
    canvas.flat(id, shapes, snowy ? '#ffffff' : '#e3ebf2', {
      depth: 1,
      attrs: { opacity: snowy ? 0.85 : 0.4 },
    });
    canvas.drift[id] = {
      dy: Math.round(snowy ? H * 0.05 : H * 1.1),
      wrap: Math.round(tile),
    };
    notes.push(`${id} falling`);
  }

  // ── Where actors stand, and at what scale: a person about a third of the set's height in front.
  const unitsPerMetre =
    Math.round(((H * (tall ? 0.24 : 0.34)) / 1.75) * 10) / 10;
  canvas.raw('ground-line', '', [0, groundY, W, H - groundY], {
    value: unitsPerMetre,
  });
  // The opening's subject: the band from above the place's tallest to its ground, framed whole.
  const focalTop = Math.max(
    0,
    Math.min(nearBase - H * 0.38, horizon - H * 0.22),
  );
  const focal = fitFocal(
    [W * 0.06, focalTop, W * 0.88, groundY - focalTop],
    W,
    H,
    shape,
  );
  return {
    asset: canvas.asset(focal),
    ground: groundY,
    unitsPerMetre,
    air: open.sky[3],
    notes,
  };
}

// ── The townscape ─────────────────────────────────────────────────────────

/** The far town: blocks of its density and era along a line, small windows that light, and the tops of its chimneys. */
function farTownscape(
  rng: Seeded,
  W: number,
  H: number,
  line: number,
  town: SetTown,
  era: EraId,
  place: SetPlace,
): { blocks: Shape[]; windows: Shape[]; smoke: Pt[] } {
  const blocks: Shape[] = [];
  const windows: Shape[] = [];
  const smoke: Pt[] = [];
  const index = ERA_IDS.indexOf(era);
  const modern = index >= ERA_IDS.indexOf('1945-1975');
  const industrial =
    index >= ERA_IDS.indexOf('1800-1900') &&
    index <= ERA_IDS.indexOf('1945-1975');
  const tall =
    town === 'city' ? (modern ? 0.24 : 0.12) : town === 'town' ? 0.07 : 0.035;
  const base = line + H * 0.012;
  const unit = Math.min(W, H);
  let x = -W * 0.04;
  while (x < W * 1.04) {
    const w = unit * rng.between(0.035, 0.09) * (town === 'village' ? 1.2 : 1);
    if (town === 'village' && rng.chance(0.45)) {
      x += w * rng.between(1, 3);
      continue;
    }
    const h =
      H *
      tall *
      rng.between(0.35, 1) *
      (town === 'city' && modern && rng.chance(0.25) ? 1.5 : 1);
    blocks.push(box(x, base - h, x + w, base + H * 0.02));
    if ((!modern || town !== 'city') && h < H * 0.1 && rng.chance(0.6))
      blocks.push(
        poly([
          [x - w * 0.04, base - h],
          [x + w / 2, base - h - w * 0.32],
          [x + w * 1.04, base - h],
        ]),
      );
    if (
      (place === 'industry' || (industrial && town !== 'village')) &&
      rng.chance(place === 'industry' ? 0.3 : 0.1)
    ) {
      const cx = x + w * 0.5;
      const ch = H * rng.between(0.07, 0.13);
      blocks.push(
        poly([
          [cx - w * 0.12, base - h + 2],
          [cx - w * 0.08, base - h - ch],
          [cx + w * 0.08, base - h - ch],
          [cx + w * 0.12, base - h + 2],
        ]),
      );
      smoke.push([cx, base - h - ch]);
    }
    const cols = Math.max(1, Math.floor(w / (unit * 0.016)));
    const rows = Math.max(1, Math.floor(h / (unit * 0.03)));
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        if (!rng.chance(0.6)) continue;
        const wx = x + (w / cols) * (c + 0.3);
        const wy = base - h + (h / rows) * (r + 0.3);
        windows.push(
          box(
            wx,
            wy,
            wx + Math.max(2.5, (w / cols) * 0.4),
            wy + Math.max(2.5, (h / rows) * 0.38),
          ),
        );
      }
    x += w * rng.between(0.9, 1.12);
  }
  return { blocks, windows, smoke };
}

/** One building the place puts on its near ground: its kind and size, where across the set (a share of its width), and its scale (units a metre). */
interface Hero {
  kind: BuildingKind;
  size: Size;
  at: number;
  scale: number;
}

/** A row of buildings of one kind across the set, side by side, each its own size: a terrace, a street. */
function row(
  list: Hero[],
  kind: BuildingKind,
  from: number,
  to: number,
  scale: number,
  rng: Seeded,
  W: number,
  widthM: number,
  gapM: number,
): void {
  let u = from;
  while (u <= to) {
    list.push({
      kind,
      size: rng.pick(['small', 'medium'] as const),
      at: u,
      scale,
    });
    u += ((widthM * rng.between(0.9, 1.1) + gapM) * scale) / W;
  }
}

/** What stands on a place's near ground: a farm's barn, a port's cranes and warehouses, a works and its terraces, a market's stalls, a city's towers, a village's houses. */
function heroes(
  place: SetPlace,
  town: SetTown,
  s: SetSettings,
  climate: Climate,
  rng: Seeded,
  W: number,
  scale: number,
): Hero[] {
  const k = (W / 2000) * scale;
  const list: Hero[] = [];
  const modern = ERA_IDS.indexOf(s.era) >= ERA_IDS.indexOf('1945-1975');
  switch (place) {
    case 'farm':
      list.push({ kind: 'farm', size: 'medium', at: 0.42, scale: 24 * k });
      if (town !== 'none') row(list, 'house', 0.8, 0.95, 14 * k, rng, W, 10, 6);
      break;
    case 'port':
      // Cranes of iron or steel from the steam age on (before it, a ship was worked by its own tackle).
      if (ERA_IDS.indexOf(s.era) >= ERA_IDS.indexOf('1800-1900'))
        list.push({
          kind: 'cranes',
          size: 'medium',
          at: 0.2,
          scale: (modern ? 10 : 12) * k,
        });
      if (modern)
        list.push({ kind: 'cranes', size: 'medium', at: 0.44, scale: 9 * k });
      list.push({
        kind: 'warehouse',
        size: 'medium',
        at: modern ? 0.72 : 0.52,
        scale: 9 * k,
      });
      list.push({
        kind: 'warehouse',
        size: 'small',
        at: modern ? 0.9 : 0.76,
        scale: 9 * k,
      });
      break;
    case 'industry':
      list.push({ kind: 'factory', size: 'large', at: 0.52, scale: 16 * k });
      row(list, 'house', 0.0, 0.25, 17 * k, rng, W, 8.5, 0.2);
      row(list, 'house', 0.82, 1.02, 17 * k, rng, W, 8.5, 0.2);
      break;
    case 'market':
      list.push({ kind: 'market', size: 'large', at: 0.5, scale: 44 * k });
      row(list, 'house', 0.0, 0.22, 20 * k, rng, W, 9, 0.4);
      row(list, 'house', 0.8, 1.02, 20 * k, rng, W, 9, 0.4);
      break;
    case 'city': {
      let u = -0.02;
      while (u < 1.02) {
        const tower = modern ? rng.chance(0.55) : rng.chance(0.2);
        list.push({
          kind: tower ? 'tower' : 'flats',
          size: rng.pick(['small', 'medium', 'large'] as const),
          at: u,
          scale: (tower ? 4.4 : 6.5) * k,
        });
        u += rng.between(0.09, 0.13);
      }
      break;
    }
    case 'oilfield':
    case 'ceremony-ground':
      break;
    default:
      if (town === 'village')
        row(list, 'house', 0.08, 0.92, 15 * k, rng, W, 10, 9);
      else if (town === 'town') {
        row(list, 'house', -0.02, 0.38, 17 * k, rng, W, 9, 0.4);
        list.push({
          kind: climate === 'arid' ? 'flats' : 'school',
          size: 'small',
          at: 0.53,
          scale: 10 * k,
        });
        row(list, 'house', 0.68, 1.02, 17 * k, rng, W, 9, 0.4);
      } else if (town === 'city') {
        let u = -0.02;
        while (u < 1.02) {
          list.push({
            kind: rng.chance(0.5) ? 'flats' : 'tower',
            size: 'small',
            at: u,
            scale: 5.5 * k,
          });
          u += rng.between(0.1, 0.15);
        }
      }
  }
  return list;
}

/**
 * The near townscape: each building drawn by the kit (kit/buildings),
 * seen small, at its place's scale, standing on its line; its windows'
 * glows gathered into the set's `lights` (one shape each, to light one by
 * one), the shapes it is built of gathered for the veil that darkens it
 * as the light goes, and the tops of its chimneys.
 */
function placeBuildings(
  list: Hero[],
  style: KitStyle,
  s: SetSettings,
  climate: Climate,
  rng: Seeded,
  base: number,
  W: number,
): {
  markup: string;
  box: ShotBox;
  silhouettes: Shape[];
  windows: Shape[];
  smoke: Pt[];
  notes: string[];
} {
  const parts: string[] = [];
  const silhouettes: Shape[] = [];
  const windows: Shape[] = [];
  const boxes: ShotBox[] = [];
  const smoke: Pt[] = [];
  const notes: string[] = [];
  // The farther (the smaller) first, so the nearer stand over them.
  const sorted = [...list].sort((a, b) => a.scale - b.scale);
  for (const hero of sorted) {
    const made = buildingParts(
      hero.kind,
      { era: s.era, climate, size: hero.size, material: 'auto', small: true },
      style,
      rng.int(1, 1e6),
    );
    const k = hero.scale / 100;
    const x = hero.at * W;
    const y = base + (hero.kind === 'market' ? W * 0.05 : 0);
    const mine = made.drawing.parts.filter((p) => p.id !== 'building');
    parts.push(
      `<g transform="translate(${n1(x)} ${n1(y)}) scale(${Math.round(k * 10000) / 10000})">${mine
        .filter((p) => p.id !== 'lights')
        .map((p) => p.markup)
        .join('')}</g>`,
    );
    // The shapes it is built of (not its windows, door or glows) for the veil.
    for (const p of mine) {
      if (['lights', 'windows', 'door'].includes(p.id) || !p.markup) continue;
      for (const m of p.markup.matchAll(/<path d="([^"]+)"/g))
        silhouettes.push({
          d: scalePath(m[1], k, x, y),
          box: p.box
            ? [x + p.box[0] * k, y + p.box[1] * k, p.box[2] * k, p.box[3] * k]
            : [x, y, 0, 0],
        });
    }
    const lit = mine.find((p) => p.id === 'lights');
    if (lit?.markup)
      for (const m of lit.markup.matchAll(/<path d="([^"]+)"/g)) {
        const d = scalePath(m[1], k, x, y);
        const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        const xs = nums.filter((_, i) => i % 2 === 0);
        const ys = nums.filter((_, i) => i % 2 === 1);
        windows.push({
          d,
          box: [
            Math.min(...xs),
            Math.min(...ys),
            Math.max(...xs) - Math.min(...xs),
            Math.max(...ys) - Math.min(...ys),
          ],
        });
      }
    for (const p of made.smoke) smoke.push([x + p[0] * k, y + p[1] * k]);
    const all = unionBox(mine.filter((p) => p.box).map((p) => p.box!));
    boxes.push([x + all[0] * k, y + all[1] * k, all[2] * k, all[3] * k]);
    notes.push(`${hero.kind} (${made.material})`);
  }
  return {
    markup: parts.join(''),
    box: boxes.length ? unionBox(boxes) : [0, 0, 0, 0],
    silhouettes,
    windows,
    smoke,
    notes: [...new Set(notes)],
  };
}

/** Containers stacked on a quay, one to three high, in the muted colours of shipping (never a real line's). */
function containers(
  rng: Seeded,
  style: KitStyle,
  from: number,
  to: number,
  base: number,
  W: number,
  scale: number,
): (readonly [Shape, string])[] {
  const k = (W / 2000) * scale;
  const cw = 64 * k;
  const ch = 26 * k;
  const colours = [
    '#9b4a3c',
    '#3d6b8e',
    '#c48a3a',
    '#4f7d5c',
    '#7b5a8a',
    '#b8b2a7',
  ].map((c) => toLook(style, c));
  const out: (readonly [Shape, string])[] = [];
  for (let x = from; x + cw < to; x += cw + 3 * k) {
    if (rng.chance(0.2)) continue;
    const high = rng.int(1, 3);
    for (let h = 0; h < high; h += 1) {
      const y = base - (h + 1) * (ch + 1.5 * k);
      const colour = rng.pick(colours);
      out.push([box(x, y, x + cw, y + ch), colour]);
      out.push([
        box(x + cw * 0.06, y + ch * 0.22, x + cw * 0.94, y + ch * 0.32),
        mixOk(colour, '#000000', 0.18),
      ]);
    }
  }
  return out;
}

/**
 * A ship moored at a port's far quay, its waterline on `waterline`, its
 * bow to the left, at the set's scale (`k`: ten units a metre in a wide
 * frame): a container ship (its boxes stacked in bays on deck, its bridge
 * and funnel aft) once containers came, a steamer (a funnel amidships,
 * masts with their derricks) before them, a sailing ship (three masts,
 * sails furled on their yards) before steam; never a real line's colours
 * or name. Its bridge's or cabins' windows are lights.
 */
function mooredShip(
  rng: Seeded,
  style: KitStyle,
  era: EraId,
  W: number,
  waterline: number,
  k: number,
): { shapes: (readonly [Shape, string])[]; windows: Shape[] } {
  const at = ERA_IDS.indexOf(era);
  const shapes: (readonly [Shape, string])[] = [];
  const windows: Shape[] = [];
  const look = (colour: string) => toLook(style, colour);
  const add = (shape: Shape, colour: string) => shapes.push([shape, colour]);
  // A row of small windows from x to x + w at height y.
  const row = (x: number, w: number, y: number, size: number, step: number) => {
    for (let wx = x; wx + size <= x + w; wx += step)
      windows.push(box(wx, y, wx + size, y + size * 0.8));
  };
  const pale = look('#ebe6dc');
  const mast = look('#8f877c');

  if (at >= ERA_IDS.indexOf('1945-1975')) {
    // A container ship (a feeder, about a hundred metres long).
    const L = Math.min(1050 * k, W * 0.92);
    const x0 = W * 0.04;
    const x1 = x0 + L;
    const deck = waterline - 50 * k;
    add(
      poly([
        [x0, deck - 10 * k],
        [x0 + 0.09 * L, deck],
        [x1, deck],
        [x1 - 0.006 * L, waterline + 4 * k],
        [x0 + 0.075 * L, waterline + 4 * k],
        [x0 + 0.03 * L, deck + 22 * k],
      ]),
      look('#34404f'),
    );
    add(
      poly([
        [x0 + 0.062 * L, waterline - 9 * k],
        [x1 - 0.004 * L, waterline - 9 * k],
        [x1 - 0.006 * L, waterline + 4 * k],
        [x0 + 0.075 * L, waterline + 4 * k],
      ]),
      look('#8a3a30'),
    );
    // The boxes, bay by bay, most three or four high.
    const colours = [
      '#9b4a3c',
      '#3d6b8e',
      '#c48a3a',
      '#4f7d5c',
      '#7b5a8a',
      '#b8b2a7',
    ].map(look);
    const cw = 61 * k;
    const ch = 26 * k;
    for (let x = x0 + 0.1 * L; x + cw <= x1 - 0.235 * L; x += cw + 2.5 * k) {
      const high = rng.chance(0.15) ? 2 : rng.int(3, 4);
      for (let h = 0; h < high; h += 1) {
        const y = deck - (h + 1) * (ch + 1.2 * k);
        const colour = rng.pick(colours);
        add(box(x, y, x + cw, y + ch), colour);
        add(
          box(x + cw * 0.06, y + ch * 0.2, x + cw * 0.94, y + ch * 0.3),
          mixOk(colour, '#000000', 0.18),
        );
      }
    }
    // The bridge aft: its decks, its wings, the funnel behind it, a mast forward.
    const b0 = x1 - 0.2 * L;
    const b1 = x1 - 0.1 * L;
    const top = deck - 135 * k;
    add(box(b0, top + 14 * k, b1, deck), pale);
    add(box(b0 - 0.02 * L, top, b1 + 0.006 * L, top + 15 * k), pale);
    add(
      box(b0 - 0.02 * L, top + 15 * k, b1 + 0.006 * L, top + 18 * k),
      mixOk(pale, '#000000', 0.25),
    );
    windows.push(
      box(b0 - 0.012 * L, top + 4 * k, b1 - 0.004 * L, top + 10 * k),
    );
    for (let y = top + 30 * k; y < deck - 14 * k; y += 22 * k)
      row(b0 + 6 * k, b1 - b0 - 12 * k, y, 7 * k, 15 * k);
    add(
      poly([
        [x1 - 0.092 * L, deck],
        [x1 - 0.098 * L, top - 18 * k],
        [x1 - 0.05 * L, top - 18 * k],
        [x1 - 0.045 * L, deck],
      ]),
      look('#46525f'),
    );
    add(
      box(x1 - 0.098 * L, top - 18 * k, x1 - 0.05 * L, top - 6 * k),
      look('#23272c'),
    );
    add(
      band(
        [x0 + 0.04 * L, deck - 8 * k],
        [x0 + 0.04 * L, deck - 72 * k],
        3 * k,
      ),
      mast,
    );
  } else if (at >= ERA_IDS.indexOf('1800-1900')) {
    // A cargo steamer: a black hull, a white house amidships, a funnel, masts and derricks.
    const L = Math.min(880 * k, W * 0.8);
    const x0 = W * 0.06;
    const x1 = x0 + L;
    const deck = waterline - 46 * k;
    add(
      poly([
        [x0, deck - 14 * k],
        [x0 + 0.12 * L, deck],
        [x1 - 0.1 * L, deck],
        [x1, deck - 10 * k],
        [x1 - 0.02 * L, waterline + 4 * k],
        [x0 + 0.06 * L, waterline + 4 * k],
      ]),
      look('#2b2d30'),
    );
    add(
      poly([
        [x0 + 0.05 * L, waterline - 8 * k],
        [x1 - 0.017 * L, waterline - 8 * k],
        [x1 - 0.02 * L, waterline + 4 * k],
        [x0 + 0.06 * L, waterline + 4 * k],
      ]),
      look('#8a3a30'),
    );
    const h0 = x0 + 0.42 * L;
    const h1 = x0 + 0.64 * L;
    add(box(h0, deck - 40 * k, h1, deck), pale);
    add(box(h0 + 0.02 * L, deck - 66 * k, h0 + 0.1 * L, deck - 40 * k), pale);
    windows.push(
      box(h0 + 0.026 * L, deck - 60 * k, h0 + 0.094 * L, deck - 53 * k),
    );
    row(h0 + 8 * k, h1 - h0 - 16 * k, deck - 28 * k, 6 * k, 14 * k);
    add(
      poly([
        [h0 + 0.13 * L, deck - 40 * k],
        [h0 + 0.125 * L, deck - 150 * k],
        [h0 + 0.18 * L, deck - 150 * k],
        [h0 + 0.185 * L, deck - 40 * k],
      ]),
      look('#c9a66b'),
    );
    add(
      box(h0 + 0.125 * L, deck - 150 * k, h0 + 0.18 * L, deck - 132 * k),
      look('#23272c'),
    );
    // The cargo hatches, and a mast forward and aft, each with its derrick.
    for (const u of [0.2, 0.3, 0.72, 0.82])
      add(
        box(x0 + u * L, deck - 9 * k, x0 + (u + 0.07) * L, deck),
        look('#5a554e'),
      );
    for (const u of [0.26, 0.78]) {
      const mx = x0 + u * L;
      add(band([mx, deck], [mx, deck - 170 * k], 4 * k), mast);
      add(
        band(
          [mx, deck - 20 * k],
          [mx + (u < 0.5 ? -1 : 1) * 0.1 * L, deck - 95 * k],
          2.5 * k,
        ),
        mast,
      );
    }
  } else {
    // A sailing ship: a wooden hull with its raised stern, three masts, its sails furled on their yards.
    const L = Math.min(420 * k, W * 0.5);
    const x0 = W * 0.12;
    const x1 = x0 + L;
    const deck = waterline - 40 * k;
    add(
      poly([
        [x0, deck - 12 * k],
        [x0 + 0.15 * L, deck],
        [x1 - 0.22 * L, deck],
        [x1 - 0.2 * L, deck - 20 * k],
        [x1 + 0.01 * L, deck - 24 * k],
        [x1 - 0.03 * L, waterline + 4 * k],
        [x0 + 0.1 * L, waterline + 4 * k],
      ]),
      look('#6b4a32'),
    );
    add(
      box(x0 + 0.13 * L, deck + 8 * k, x1 - 0.04 * L, deck + 13 * k),
      look('#d9c9a3'),
    );
    for (let i = 0; i < 3; i += 1)
      windows.push(
        box(
          x1 - 0.15 * L + i * 0.045 * L,
          deck - 15 * k,
          x1 - 0.12 * L + i * 0.045 * L,
          deck - 9 * k,
        ),
      );
    add(
      band(
        [x0 + 0.06 * L, deck - 6 * k],
        [x0 - 0.12 * L, deck - 60 * k],
        4 * k,
      ),
      mast,
    );
    const sail = look('#e6dcc4');
    for (const [u, h] of [
      [0.24, 250],
      [0.5, 290],
      [0.74, 230],
    ] as const) {
      const mx = x0 + u * L;
      add(band([mx, deck], [mx, deck - h * k], 4.5 * k), mast);
      for (const [j, up] of [0.42, 0.66, 0.88].entries()) {
        const y = deck - h * k * up;
        const half = (0.13 - j * 0.03) * L;
        add(band([mx - half, y], [mx + half, y], 3 * k), mast);
        add(
          box(mx - half * 0.9, y - 6 * k, mx + half * 0.9, y + 2 * k, 4 * k),
          sail,
        );
      }
    }
  }
  return { shapes, windows };
}

/** The near ground's marks: a field's furrows, a road's edges, a quay's stones, a desert's ripples, grass. */
function groundMarks(
  place: SetPlace,
  s: SetSettings,
  rng: Seeded,
  W: number,
  H: number,
  nearBase: number,
  groundY: number,
  bottom: number,
  x0: number,
  x1: number,
): Shape[] {
  const marks: Shape[] = [];
  const top = nearBase + H * 0.008;
  if (s.land === 'coast') {
    if (place === 'port') {
      // The near quay's edge and its stones' joints.
      marks.push(box(x0, H * 0.9, x1, H * 0.912));
      for (let x = x0; x < x1; x += W * 0.08)
        marks.push(box(x, H * 0.955, x + W * 0.055, H * 0.959));
    }
    return marks;
  }
  if (
    place === 'farm' ||
    ((place === 'open' || place === 'oilfield') &&
      (s.land === 'plain' || s.land === 'hills'))
  ) {
    // Furrows fanning toward the horizon from a point far off.
    const vx = W * rng.between(0.4, 0.6);
    for (let i = -16; i <= 16; i += 1) {
      const bx = vx + i * W * 0.085;
      marks.push(
        poly([
          [vx + i * W * 0.01, top],
          [vx + i * W * 0.01 + 3, top],
          [bx + W * 0.012, bottom],
          [bx - W * 0.012, bottom],
        ]),
      );
    }
  } else if (
    place === 'industry' ||
    place === 'market' ||
    place === 'city' ||
    s.land === 'city' ||
    s.town === 'town'
  ) {
    // A road across the front: its kerb, its far edge and its middle line.
    marks.push(box(x0, top + H * 0.012, x1, top + H * 0.02));
    marks.push(box(x0, groundY - H * 0.035, x1, groundY - H * 0.028));
    for (let x = x0; x < x1; x += W * 0.09)
      marks.push(
        box(x, groundY + H * 0.02, x + W * 0.045, groundY + H * 0.026),
      );
  } else if (s.land === 'desert') {
    for (let i = 0; i < 14; i += 1)
      marks.push(
        ellipse(
          [rng.between(0, W), rng.between(top + H * 0.03, bottom - H * 0.02)],
          W * rng.between(0.03, 0.08),
          H * 0.004,
        ),
      );
  } else {
    for (let i = 0; i < 28; i += 1) {
      const x = rng.between(0, W);
      const y = rng.between(top + H * 0.02, bottom - H * 0.02);
      const h = H * rng.between(0.012, 0.024);
      marks.push(
        poly([
          [x - h * 0.6, y],
          [x - h * 0.2, y - h],
          [x, y - h * 0.3],
          [x + h * 0.25, y - h * 1.1],
          [x + h * 0.6, y],
        ]),
      );
    }
  }
  return marks;
}

/**
 * What frames the picture in front, at the near edge (a little nearer
 * than the ground, so it slides past as the camera moves): a lamp post on
 * a street, a fence by a field, bollards on a quay, a trunk at a forest's
 * edge, rocks elsewhere. Its lamps light.
 */
function framing(
  place: SetPlace,
  s: SetSettings,
  rng: Seeded,
  W: number,
  H: number,
  groundY: number,
  bottom: number,
): { shapes: Shape[]; colour: string; lamps: Shape[] } {
  const u = Math.min(W, H) / 1000;
  const shapes: Shape[] = [];
  const lamps: Shape[] = [];
  const left = rng.chance(0.5);
  const side = (x: number) => (left ? x : W - x);
  if (
    place === 'industry' ||
    place === 'market' ||
    place === 'city' ||
    s.land === 'city' ||
    (place === 'open' && s.town === 'town')
  ) {
    // A street lamp to one side.
    const x = side(W * 0.07);
    const top = groundY - 430 * u;
    const arm = left ? 1 : -1;
    shapes.push(
      band([x, groundY + 20 * u], [x, top], 14 * u),
      box(x - 22 * u, groundY - 30 * u, x + 22 * u, groundY + 20 * u),
      band([x, top + 12 * u], [x + arm * 70 * u, top + 12 * u], 9 * u),
      box(
        x + arm * 70 * u - 24 * u,
        top + 8 * u,
        x + arm * 70 * u + 24 * u,
        top + 30 * u,
      ),
    );
    lamps.push(
      box(
        x + arm * 70 * u - 18 * u,
        top + 30 * u,
        x + arm * 70 * u + 18 * u,
        top + 44 * u,
      ),
    );
    return { shapes, colour: '#3b4048', lamps };
  }
  if (place === 'ceremony-ground') {
    // Two rope posts and the rope between them, at the near edge.
    const a = side(W * 0.05);
    const b = side(W * 0.3);
    for (const x of [a, b])
      shapes.push(
        box(x - 9 * u, groundY - 110 * u, x + 9 * u, bottom),
        ellipse([x, groundY - 112 * u], 15 * u, 15 * u),
      );
    const sag: Pt[] = Array.from({ length: 13 }, (_, i) => {
      const t = i / 12;
      return [
        a + (b - a) * t,
        groundY - 96 * u + Math.sin(t * Math.PI) * 40 * u,
      ];
    });
    for (let i = 0; i < sag.length - 1; i += 1)
      shapes.push(band(sag[i], sag[i + 1], 7 * u));
    return { shapes, colour: '#7a2f2f', lamps };
  }
  if (place === 'farm' || s.land === 'plain' || s.land === 'hills') {
    // A fence along the bottom, its posts leaning a little.
    const from = left ? -W * 0.05 : W * 0.62;
    const to = left ? W * 0.38 : W * 1.05;
    for (let x = from; x <= to; x += 120 * u)
      shapes.push(
        poly([
          [x - 7 * u, bottom],
          [x - 6 * u, groundY - 90 * u],
          [x + 6 * u, groundY - 92 * u],
          [x + 7 * u, bottom],
        ]),
      );
    shapes.push(
      band([from, groundY - 70 * u], [to, groundY - 66 * u], 9 * u),
      band([from, groundY - 30 * u], [to, groundY - 26 * u], 9 * u),
    );
    return { shapes, colour: '#6e5640', lamps };
  }
  if (place === 'port') {
    for (let i = 0; i < 3; i += 1) {
      const x = side(W * (0.06 + i * 0.13));
      shapes.push(
        box(x - 26 * u, H * 0.9 - 50 * u, x + 26 * u, H * 0.9 + 4 * u, 10 * u),
        ellipse([x, H * 0.9 - 50 * u], 32 * u, 10 * u),
      );
    }
    return { shapes, colour: '#3b4048', lamps };
  }
  if (s.land === 'coast') {
    // A boat drawn up on the beach, and a rock or two.
    const x = side(W * 0.12);
    const y = H * 0.965;
    shapes.push(
      poly([
        [x - 150 * u, y - 58 * u],
        [x - 112 * u, y - 4 * u],
        [x - 80 * u, y],
        [x + 104 * u, y],
        [x + 134 * u, y - 46 * u],
        [x + 120 * u, y - 44 * u],
        [x - 130 * u, y - 50 * u],
      ]),
      band([x - 12 * u, y - 48 * u], [x - 4 * u, y - 210 * u], 7 * u),
    );
    for (let i = 0; i < 2; i += 1) {
      const r = rng.between(36, 70) * u;
      shapes.push(
        dome(side(W * rng.between(0.3, 0.42)), H + H * 0.01, r * 1.5, r),
      );
    }
    return { shapes, colour: '#3b4048', lamps };
  }
  if (s.land === 'forest') {
    // A tree at the near edge: its trunk, and its crown reaching in from above the frame.
    const x = side(W * 0.04);
    shapes.push(
      poly([
        [x - 34 * u, bottom],
        [x - 22 * u, H * 0.18],
        [x + 22 * u, H * 0.18],
        [x + 34 * u, bottom],
      ]),
    );
    for (let i = 0; i < 6; i += 1) {
      const cx = side(W * rng.between(-0.02, 0.16));
      shapes.push(
        circle([cx, H * rng.between(-0.06, 0.12)], H * rng.between(0.08, 0.14)),
      );
    }
    return { shapes, colour: '#2f4430', lamps };
  }
  for (let i = 0; i < 3; i += 1) {
    const x = side(W * rng.between(0.02, 0.2));
    const r = rng.between(40, 90) * u;
    shapes.push(dome(x, H + H * 0.01, r * 1.4, r));
  }
  return { shapes, colour: s.land === 'desert' ? '#a98a64' : '#6f7268', lamps };
}

// ── Places of their own ───────────────────────────────────────────────────

/**
 * A ceremony ground: a covered stand at the back (its roof on posts, its
 * tiers of seats), a dais before it, a tall flagpole (the stage flies a
 * flag from its anchor; none is drawn here), floodlights that light at
 * night, rows of chairs on the parade ground, bunting in plain colours.
 */
function ceremonyGround(canvas: SetCanvas, base: number): void {
  const { W, H, style } = canvas;
  const roof = toLook(style, '#e6e1d6');
  const post = toLook(style, '#8b8f96');
  const seats = toLook(style, mixOk('#3d6b8e', style.muted, 0.2));
  const dais = toLook(style, '#8a5a3c');
  const tall = H > W;
  const standW = W * (tall ? 0.9 : 0.6);
  const sx0 = W / 2 - standW / 2;
  const sx1 = W / 2 + standW / 2;
  const standTop = base - H * (tall ? 0.12 : 0.2);
  const shapes: (readonly [Shape, string])[] = [
    [box(sx0, base - H * 0.12, sx1, base), seats],
    [
      box(sx0, base - H * 0.085, sx1, base - H * 0.078),
      mixOk(seats, '#ffffff', 0.25),
    ],
    [
      box(sx0, base - H * 0.045, sx1, base - H * 0.038),
      mixOk(seats, '#ffffff', 0.25),
    ],
    [
      poly([
        [sx0 - W * 0.02, standTop],
        [sx1 + W * 0.02, standTop],
        [sx1, standTop + H * 0.03],
        [sx0, standTop + H * 0.03],
      ]),
      roof,
    ],
    ...Array.from({ length: 6 }, (_, i): readonly [Shape, string] => {
      const x = sx0 + (standW / 5) * i;
      return [
        box(x - W * 0.003, standTop + H * 0.03, x + W * 0.003, base),
        post,
      ];
    }),
    [
      box(
        W / 2 - W * 0.08,
        base + H * 0.02,
        W / 2 + W * 0.08,
        base + H * 0.065,
      ),
      dais,
    ],
    [
      box(
        W / 2 - W * 0.085,
        base + H * 0.015,
        W / 2 + W * 0.085,
        base + H * 0.026,
      ),
      mixOk(dais, '#ffffff', 0.2),
    ],
  ];
  canvas.raw(
    'stand',
    shapes.map(([sh, f]) => `<path d="${sh.d}" fill="${f}"/>`).join(''),
    unionBox(shapes.map(([sh]) => sh.box)),
    { depth: 0.85 },
  );
  canvas.veil(
    'stand-veil',
    shapes.map(([sh]) => sh),
    0.85,
  );
  const bunting = ['#c4573a', '#e2b04a', '#3d78b5', '#f2efe8'].map((c) =>
    toLook(style, c),
  );
  const flags: string[] = [];
  const flagShapes: Shape[] = [];
  for (let x = sx0; x < sx1; x += W * 0.018) {
    const f = poly([
      [x, standTop + H * 0.032],
      [x + W * 0.012, standTop + H * 0.032],
      [x + W * 0.006, standTop + H * 0.052],
    ]);
    flagShapes.push(f);
    flags.push(
      `<path d="${f.d}" fill="${bunting[flags.length % bunting.length]}"/>`,
    );
  }
  canvas.raw(
    'bunting',
    flags.join(''),
    unionBox(flagShapes.map((f) => f.box)),
    { depth: 0.85 },
  );
  const fx = W * (tall ? 0.88 : 0.82);
  const poleTop = base - H * (tall ? 0.3 : 0.44);
  canvas.lit(
    'flagpole',
    [
      band([fx, base + H * 0.02], [fx, poleTop], Math.max(4, W * 0.003)),
      circle([fx, poleTop], W * 0.004),
    ],
    (light) => toned(post, light),
    { depth: 0.85 },
  );
  canvas.raw('flag', '', [fx - 1, poleTop - 1, 2, 2], { depth: 0.85 });
  const lamps: Shape[] = [];
  const masts: Shape[] = [];
  for (const mx of tall ? [W * 0.1] : [sx0 - W * 0.06, sx1 + W * 0.06]) {
    const top = base - H * (tall ? 0.26 : 0.38);
    masts.push(
      band([mx, base], [mx, top], Math.max(5, W * 0.004)),
      box(mx - W * 0.03, top - H * 0.035, mx + W * 0.03, top),
    );
    for (let i = 0; i < 4; i += 1)
      lamps.push(
        box(
          mx - W * 0.026 + i * W * 0.0135,
          top - H * 0.03,
          mx - W * 0.026 + i * W * 0.0135 + W * 0.011,
          top - H * 0.008,
        ),
      );
  }
  canvas.lit('masts', masts, (light) => toned(post, light), { depth: 0.85 });
  canvas.windows('lights', lamps, 0.85, '#fff4cf', 0, true);
  const chairs: Shape[] = [];
  for (let r = 0; r < 3; r += 1) {
    const y = base + H * 0.12 + r * H * 0.05;
    const cw = W * (0.012 + r * 0.002) * (tall ? 1.6 : 1);
    for (
      let x = W * 0.12 + r * W * 0.01;
      x < W * 0.88 - r * W * 0.01;
      x += cw * 1.7
    ) {
      if (Math.abs(x - W / 2) < W * 0.03) continue;
      chairs.push(
        box(x, y - cw * 1.6, x + cw, y - cw * 0.8),
        box(x, y - cw * 0.85, x + cw, y - cw * 0.6),
      );
    }
  }
  const chair = toLook(style, '#5e6670');
  canvas.lit('chairs', chairs, (light) => toned(chair, light), { depth: 0.95 });
}

/** An oil field: pump jacks over their wells (each a walking beam on a post, its horse's head and counterweight), and storage tanks. */
function oilField(canvas: SetCanvas, base: number, rng: Seeded): void {
  const { W, H, style } = canvas;
  const steel = toLook(style, '#4d5560');
  const red = toLook(style, '#9b4a3c');
  const tank = toLook(style, '#c9c6bd');
  const shapes: (readonly [Shape, string])[] = [];
  const count = W > H ? 4 : 2;
  const u = Math.min(W, H) / 1000;
  for (let i = 0; i < count; i += 1) {
    const x =
      W * (0.12 + (0.7 * i) / Math.max(1, count - 1)) +
      rng.between(-W * 0.02, W * 0.02);
    const k = 1.5 * u * rng.between(0.8, 1.15) * (i % 2 ? 0.8 : 1);
    const y = base + H * (i % 2 ? 0 : 0.05);
    shapes.push(
      [box(x - 90 * k, y - 12 * k, x + 90 * k, y), steel],
      [
        poly([
          [x - 30 * k, y - 12 * k],
          [x - 6 * k, y - 120 * k],
          [x + 6 * k, y - 120 * k],
          [x + 30 * k, y - 12 * k],
          [x + 18 * k, y - 12 * k],
          [x, y - 100 * k],
          [x - 18 * k, y - 12 * k],
        ]),
        steel,
      ],
      [
        band([x - 110 * k, y - 116 * k], [x + 80 * k, y - 130 * k], 10 * k),
        red,
      ],
      [
        poly([
          [x - 110 * k, y - 132 * k],
          [x - 132 * k, y - 112 * k],
          [x - 126 * k, y - 92 * k],
          [x - 104 * k, y - 104 * k],
        ]),
        red,
      ],
      [
        band([x - 126 * k, y - 96 * k], [x - 126 * k, y - 10 * k], 3 * k),
        steel,
      ],
      [circle([x + 62 * k, y - 70 * k], 20 * k), steel],
    );
  }
  for (const [tx, r] of [
    [W * 0.86, 90],
    [W * 0.95, 70],
  ] as const) {
    const rr = r * u;
    shapes.push(
      [box(tx - rr, base - rr * 1.3, tx + rr, base), tank],
      [dome(tx, base - rr * 1.3, rr, rr * 0.25), mixOk(tank, '#000000', 0.12)],
    );
  }
  canvas.raw(
    'pumps',
    shapes.map(([sh, f]) => `<path d="${sh.d}" fill="${f}"/>`).join(''),
    unionBox(shapes.map(([sh]) => sh.box)),
    { depth: 0.85 },
  );
  canvas.veil(
    'pumps-veil',
    shapes.map(([sh]) => sh),
    0.85,
  );
}

/**
 * An assembly hall, seen from the back of its public gallery: the rows
 * of a hemicycle in tiers round the well (each a desk and a bench of
 * seats, their backs to us), the aisles down through them, the dais with
 * the presiding chair under a canopy against the panelled far wall, the
 * galleries along its sides, the tall windows whose light is the hour's,
 * and the lamps that light at night. No emblem, no words: over the chair,
 * a plain medallion.
 */
function assemblyHall(
  canvas: SetCanvas,
  s: SetSettings,
  shape: FilmShape,
): DrawnSet {
  const { W, H, style } = canvas;
  const tall = shape === 'tall';
  const wall = toLook(style, mixOk('#e5d9c6', style.paper, 0.15));
  const panel = toLook(style, '#8a5a3c');
  const panelDark = mixOk(panel, '#000000', 0.24);
  const seat = toLook(style, mixOk('#2f6f62', style.muted, 0.1));
  const seatLit = mixOk(seat, '#ffffff', 0.2);
  const desk = toLook(style, '#a2714c');
  const carpet = toLook(style, '#94503f');
  const floor = toLook(style, '#6f5a4a');
  const well = toLook(style, '#b49a7a');
  const gold = toLook(style, '#c9a44e');
  const u = Math.min(W, H) / 1000;
  // The far wall and its tall windows, whose light is the hour's.
  canvas.flat('wall', [box(-40, -40, W + 40, H * 0.4)], wall);
  // An even number of windows, so a pier of wall stands over the chair for its medallion.
  const count = tall ? 4 : 6;
  const winTop = H * (tall ? 0.04 : 0.05);
  const winH = H * (tall ? 0.12 : 0.16);
  const glass: Shape[] = [];
  for (let i = 0; i < count; i += 1) {
    const cx = W * ((i + 0.5) / count);
    const w = W * (tall ? 0.1 : 0.05);
    glass.push(
      poly([
        [cx - w / 2, winTop + winH],
        [cx - w / 2, winTop + w * 0.5],
        [cx, winTop],
        [cx + w / 2, winTop + w * 0.5],
        [cx + w / 2, winTop + winH],
      ]),
    );
  }
  canvas.lit('windows', glass, (light) =>
    light.lit > 0.5 ? light.sky[1] : light.sky[2],
  );
  // Its panelling behind the dais, and the galleries along its sides.
  const panelTop = winTop + winH + H * 0.04;
  const floorTop = H * (tall ? 0.36 : 0.42);
  canvas.flat('panelling', [box(-40, panelTop, W + 40, floorTop)], panel);
  const ribs: Shape[] = [];
  for (let x = W * 0.025; x < W; x += W * (tall ? 0.08 : 0.05))
    ribs.push(box(x - 2.5 * u, panelTop, x + 2.5 * u, floorTop));
  canvas.flat('panel-lines', ribs, panelDark);
  const gy = panelTop + (floorTop - panelTop) * 0.25;
  const gw = W * (tall ? 0.2 : 0.26);
  canvas.flat(
    'gallery',
    [box(-40, gy, gw, gy + H * 0.045), box(W - gw, gy, W + 40, gy + H * 0.045)],
    panelDark,
  );
  // The chamber's floor, stepped down to the well.
  canvas.flat('floor', [box(-40, floorTop, W + 40, H + 40)], floor);
  // The dais against the far wall: the chair under its canopy, a plain medallion, the clerks' desk before it.
  const cx = W / 2;
  const daisY = floorTop + H * 0.03;
  const dw = W * (tall ? 0.42 : 0.22);
  const chairW = W * (tall ? 0.08 : 0.04);
  canvas.raw(
    'chair',
    [
      `<path d="${box(cx - dw / 2, daisY - H * 0.04, cx + dw / 2, daisY + H * 0.01).d}" fill="${panelDark}"/>`,
      `<path d="${box(cx - chairW * 1.3, panelTop + H * 0.01, cx + chairW * 1.3, panelTop + H * 0.035, H * 0.008).d}" fill="${panelDark}"/>`,
      `<path d="${box(cx - chairW / 2, panelTop + H * 0.04, cx + chairW / 2, daisY - H * 0.04, chairW * 0.18).d}" fill="${seat}"/>`,
      `<path d="${box(cx - chairW / 2, panelTop + H * 0.04, cx + chairW / 2, panelTop + H * 0.06, chairW * 0.18).d}" fill="${seatLit}"/>`,
      // Its seat, and its arms on their posts: a high-backed chair, not a cabinet.
      ...((chairH: number, foot: number) => [
        `<path d="${box(cx - chairW * 0.6, foot - chairH * 0.3, cx + chairW * 0.6, foot - chairH * 0.2, chairW * 0.06).d}" fill="${seatLit}"/>`,
        ...[-1, 1].map(
          (side) =>
            `<path d="${box(cx + side * chairW * 0.42, foot - chairH * 0.46, cx + side * chairW * 0.8, foot - chairH * 0.39, chairW * 0.04).d}" fill="${panelDark}"/><path d="${box(cx + side * chairW * 0.66, foot - chairH * 0.42, cx + side * chairW * 0.76, foot).d}" fill="${panelDark}"/>`,
        ),
      ])(daisY - H * 0.04 - (panelTop + H * 0.04), daisY - H * 0.04),
      `<path d="${box(cx - dw * 0.42, daisY - H * 0.012, cx + dw * 0.42, daisY + H * 0.03).d}" fill="${desk}"/>`,
      `<path d="${circle([cx, winTop + winH * 0.55], Math.min(W, H) * 0.03).d}" fill="${gold}"/>`,
    ].join(''),
    [
      cx - dw / 2,
      winTop + winH * 0.55 - Math.min(W, H) * 0.03,
      dw,
      daisY + H * 0.03 - (winTop + winH * 0.55 - Math.min(W, H) * 0.03),
    ],
  );
  // The well: the open floor before the dais, a half oval.
  const centre: Pt = [cx, daisY + H * 0.03];
  const halfOval = (
    rx: number,
    ry: number,
    from = 0,
    to = Math.PI,
    n = 40,
  ): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = from + ((to - from) * i) / n;
      return [centre[0] + rx * Math.cos(a), centre[1] + ry * Math.sin(a)];
    });
  const wellRx = W * (tall ? 0.34 : 0.17);
  const wellRy = H * (tall ? 0.07 : 0.09);
  canvas.flat('well', [poly(halfOval(wellRx, wellRy))], well);
  // The rows round the well, far to near: each a desk and a bench of seats, bigger as they come nearer.
  const rows = 7;
  const desks: Shape[] = [];
  const benches: Shape[] = [];
  const tops: Shape[] = [];
  const gaps: Shape[] = [];
  for (let r = 0; r < rows; r += 1) {
    const t = r / (rows - 1);
    const rx = wellRx + W * (tall ? 0.03 : 0.02) + r * W * (tall ? 0.12 : 0.09);
    const ry = wellRy + H * 0.015 + r * H * (tall ? 0.065 : 0.085);
    const deep = H * ((tall ? 0.018 : 0.024) + 0.02 * t);
    desks.push(
      poly([...halfOval(rx, ry), ...halfOval(rx, ry + deep * 0.4).reverse()]),
    );
    benches.push(
      poly([
        ...halfOval(rx + W * 0.006, ry + deep * 0.5),
        ...halfOval(rx + W * 0.012, ry + deep * 1.2).reverse(),
      ]),
    );
    tops.push(
      poly([
        ...halfOval(rx + W * 0.006, ry + deep * 0.5),
        ...halfOval(rx + W * 0.008, ry + deep * 0.68).reverse(),
      ]),
    );
    // The gaps between seats: short dark strokes across the bench.
    const seats = Math.round(12 + r * 4);
    for (let k = 1; k < seats; k += 1) {
      const a = (Math.PI * k) / seats;
      const p0: Pt = [
        centre[0] + (rx + W * 0.006) * Math.cos(a),
        centre[1] + (ry + deep * 0.5) * Math.sin(a),
      ];
      const p1: Pt = [
        centre[0] + (rx + W * 0.012) * Math.cos(a),
        centre[1] + (ry + deep * 1.2) * Math.sin(a),
      ];
      gaps.push(band(p0, p1, (1.6 + t * 2) * u));
    }
  }
  canvas.flat('desks', desks, desk);
  canvas.flat('seats', benches, seat);
  canvas.flat('seat-tops', tops, seatLit);
  canvas.flat('seat-gaps', gaps, mixOk(seat, '#000000', 0.35));
  // The aisles: stairs from the well up through the rows, in the carpet's colour, their steps marked.
  const aisles: Shape[] = [];
  const steps: Shape[] = [];
  for (const a of [Math.PI * 0.28, Math.PI * 0.5, Math.PI * 0.72]) {
    const along = (k: number): Pt => [
      centre[0] + (wellRx + k * W * (tall ? 0.95 : 0.7)) * Math.cos(a),
      centre[1] + (wellRy + k * H * (tall ? 0.52 : 0.68)) * Math.sin(a),
    ];
    const p0 = along(0);
    const p1 = along(1);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const w0 = W * 0.008;
    const w1 = W * (tall ? 0.04 : 0.03);
    aisles.push(
      poly([
        [p0[0] - nx * w0, p0[1] - ny * w0],
        [p1[0] - nx * w1, p1[1] - ny * w1],
        [p1[0] + nx * w1, p1[1] + ny * w1],
        [p0[0] + nx * w0, p0[1] + ny * w0],
      ]),
    );
    for (let k = 1; k < 14; k += 1) {
      const q = along(k / 14);
      const w = w0 + (w1 - w0) * (k / 14);
      steps.push(
        band(
          [q[0] - nx * w, q[1] - ny * w],
          [q[0] + nx * w, q[1] + ny * w],
          2 * u + k * 0.3 * u,
        ),
      );
    }
  }
  canvas.flat('aisles', aisles, carpet);
  canvas.flat('aisle-steps', steps, mixOk(carpet, '#000000', 0.25));
  // Lamps along the galleries that light at night (half of them always on).
  const lamps: Shape[] = [];
  for (let i = 0; i <= count; i += 1)
    lamps.push(
      circle([W * (i / count), gy - H * 0.012], Math.min(W, H) * 0.011),
    );
  // The hour's light over the room: a veil that warms at dusk and dims it a little at night (the room is lit), the lamps glowing over it.
  canvas.veil('veil', [box(-40, -40, W + 40, H + 40)], 1, 0.32);
  canvas.windows('lights', lamps, 1, '#ffe2a0', 0.45);
  const groundY = H * 0.95;
  const unitsPerMetre = Math.round(((H * (tall ? 0.2 : 0.3)) / 1.75) * 10) / 10;
  canvas.raw('ground-line', '', [0, groundY, W, H - groundY], {
    value: unitsPerMetre,
  });
  const focal = fitFocal([W * 0.05, winTop, W * 0.9, H * 0.86], W, H, shape);
  return {
    asset: canvas.asset(focal),
    ground: groundY,
    unitsPerMetre,
    air: wall,
    notes: [`assembly hall, ${s.time}`, `${rows} rows`],
  };
}

/**
 * A display: a clean studio backdrop for a machine or a thing shown on
 * its own, as a museum or a catalogue shows it, its wall a soft gradient
 * of the show's paper, a floor and the light pooled where the subject
 * stands. It has no scale of its own: what stands on it is sized big.
 */
function display(canvas: SetCanvas, shape: FilmShape): DrawnSet {
  const { W, H, style } = canvas;
  const wallTop = mixOk(
    style.paper,
    '#ffffff',
    luminance(style.paper) < 0.35 ? 0.04 : 0.35,
  );
  const wallFoot = mixOk(style.paper, style.muted, 0.12);
  const floor = mixOk(style.paper, style.muted, 0.2);
  // In a tall frame the thing stands higher, so it sits in the frame's middle with floor below it.
  const groundY = H * (shape === 'tall' ? 0.64 : 0.84);
  canvas.defs.push(
    `<linearGradient id="wall" x1="0" y1="0" x2="0" y2="${n1(groundY)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${wallTop}"/><stop offset="1" stop-color="${wallFoot}"/></linearGradient>`,
    `<radialGradient id="pool" cx="${n1(W / 2)}" cy="${n1(groundY)}" r="${n1(W * 0.42)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`,
  );
  canvas.raw(
    'wall',
    `<rect x="${-W * 0.06}" y="${-H * 0.06}" width="${W * 1.12}" height="${n1(groundY + H * 0.06)}" fill="url(#wall)"/>`,
    [0, 0, W, groundY],
    { depth: 0.3 },
  );
  canvas.flat('floor', [box(-W * 0.06, groundY, W * 1.06, H * 1.06)], floor, {
    depth: 1,
  });
  canvas.raw(
    'pool',
    `<ellipse cx="${n1(W / 2)}" cy="${n1(groundY)}" rx="${n1(W * 0.42)}" ry="${n1(H * 0.1)}" fill="url(#pool)"/>`,
    [W * 0.08, groundY - H * 0.1, W * 0.84, H * 0.2],
    { depth: 1 },
  );
  canvas.raw('ground-line', '', [0, groundY, W, H - groundY]);
  const focal = fitFocal(
    [W * 0.1, H * 0.12, W * 0.8, groundY - H * 0.08],
    W,
    H,
    shape,
  );
  return {
    asset: canvas.asset(focal),
    ground: groundY,
    air: wallFoot,
    notes: ['display backdrop'],
  };
}

// ── Reading settings ──────────────────────────────────────────────────────

/** Every land, time, weather, town and place: for specs and contact sheets. */
export const SET_SETTINGS_LISTS = {
  land: SET_LANDS,
  time: SET_TIMES,
  weather: SET_WEATHERS,
  town: SET_TOWNS,
  place: SET_PLACES,
  era: ERA_IDS,
} as const;

/** A set's settings from the plan's words, each made sound (closed lists, defaults). */
export function setSettingsOf(
  raw: Partial<Record<keyof SetSettings, unknown>>,
  era: EraId | null,
): SetSettings {
  const one = <T extends string>(
    list: readonly T[],
    value: unknown,
    fallback: T,
  ): T =>
    (list as readonly unknown[]).includes(value) ? (value as T) : fallback;
  return {
    land: one(SET_LANDS, raw.land, 'plain'),
    time: one(SET_TIMES, raw.time, 'day'),
    weather: one(SET_WEATHERS, raw.weather, 'clear'),
    town: one(SET_TOWNS, raw.town, 'none'),
    era: era ?? 'today',
    place: one(SET_PLACES, raw.place, 'open'),
    ...(typeof raw.climate === 'string' &&
    ['temperate', 'arid', 'tropical', 'cold'].includes(raw.climate)
      ? { climate: raw.climate as Climate }
      : {}),
  };
}
