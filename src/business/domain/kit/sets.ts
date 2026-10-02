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
 *  - water with a shimmer anchor;
 *  - a townscape by density (village, town, city) and era, its windows a
 *    `lights` part that lights one by one;
 *  - what the place is for (a farm, a port, industry, a market, a city's
 *    towers, an oil field), which sets the buildings that stand in it
 *    (kit/buildings);
 *  - two interiors: an assembly hall and a ceremony ground.
 *
 * Everything in a set can move, as a pure function of time on the
 * client (lib/shots/scenery): its `scenery` lists each state's look of
 * every part that changes (the sky's colours, the sun's turn about its
 * arc, the stars, the land's light, the lights in the windows), and the
 * parts that drift (clouds, rain, snow). The drawing itself is the set as
 * it opens, so a still or a thumbnail without the client is right.
 *
 * No text anywhere in a set. Its parts carry their depth (the sky 0, a
 * far range 0.25, the ground 1) and the `ground` part says where actors
 * stand and at what scale (its value: units a metre).
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
/** What the place is for: it sets what stands in it. Two are interiors. */
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

/** A set's frame per shape: its box (a little wider than the film's frame, for the camera's travels), its horizon and its ground line as shares of its height. */
export const SET_FRAME: Readonly<
  Record<FilmShape, { w: number; h: number; horizon: number; ground: number }>
> = {
  wide: { w: 2000, h: 1000, horizon: 0.6, ground: 0.9 },
  tall: { w: 1000, h: 1700, horizon: 0.6, ground: 0.9 },
};

/** A set made: the asset the stage plays, where actors stand on it and at what scale, and notes for the log. */
export interface DrawnSet {
  asset: ShotSvgAssetDto;
  /** The ground line actors stand on, in its units. */
  ground: number;
  /** Its units a metre at that ground line. */
  unitsPerMetre: number;
  notes: string[];
}

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
    sky: ['#4c8bcb', '#7cb0df', '#b2d3ec', '#dbe9ef'],
    sun: '#fff4d2',
    sunOpacity: 1,
    glow: '#fff8e0',
    glowOpacity: 0.35,
    moonOpacity: 0,
    stars: 0,
    cloud: '#f7f8f8',
    tone: '#ffffff',
    dim: 0,
    water: '#3f80b4',
    glint: 0.55,
    veil: '#2b3350',
    veilOpacity: 0,
    lit: 0,
    haze: '#c8dbe6',
  },
  dusk: {
    sky: ['#26315c', '#58477f', '#cc7670', '#f0b066'],
    sun: '#ffd27c',
    sunOpacity: 1,
    glow: '#ff9d5c',
    glowOpacity: 0.85,
    moonOpacity: 0.25,
    stars: 0.12,
    cloud: '#e59f8c',
    tone: '#4a3a66',
    dim: 0.42,
    water: '#4d4c7a',
    glint: 0.8,
    veil: '#2e2650',
    veilOpacity: 0.42,
    lit: 0.16,
    haze: '#c98a7f',
  },
  night: {
    sky: ['#070f22', '#0d1b38', '#152a52', '#203766'],
    sun: '#ffd27c',
    sunOpacity: 0,
    glow: '#9fb6e6',
    glowOpacity: 0.12,
    moonOpacity: 1,
    stars: 1,
    cloud: '#26314e',
    tone: '#0b1430',
    dim: 0.8,
    water: '#0f1d3b',
    glint: 0.35,
    veil: '#0a1228',
    veilOpacity: 0.78,
    lit: 0.82,
    haze: '#1d2d55',
  },
  dawn: {
    sky: ['#34507f', '#7b82b1', '#e5a597', '#f5d4a6'],
    sun: '#ffdca2',
    sunOpacity: 1,
    glow: '#ffc08a',
    glowOpacity: 0.7,
    moonOpacity: 0.15,
    stars: 0.08,
    cloud: '#f0c3b3',
    tone: '#6b5a86',
    dim: 0.3,
    water: '#5a6a96',
    glint: 0.7,
    veil: '#3d3866',
    veilOpacity: 0.32,
    lit: 0.22,
    haze: '#d9b1a6',
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
    dim: 0.08,
  },
  rain: {
    k: 0.72,
    colour: {
      day: '#7f8a96',
      dusk: '#4b4859',
      night: '#10182b',
      dawn: '#77778a',
    },
    sun: 0,
    dim: 0.22,
  },
  storm: {
    k: 0.84,
    colour: {
      day: '#4f5867',
      dusk: '#353148',
      night: '#0b111f',
      dawn: '#4f4d62',
    },
    sun: 0,
    dim: 0.38,
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

/** A time's light under a weather, in the show's colours: its sky pulled a little toward the show's paper, brighter in the illustrated look. */
function lightOf(time: SetTime, weather: SetWeather, style: KitStyle): Light {
  const base = TIME_LIGHT[time];
  const w = WEATHER_SKY[weather];
  const sky = base.sky.map((c) =>
    mixOk(c, w.colour[time], w.k),
  ) as Light['sky'];
  const lookOf = (c: string) => toLook(style, c);
  return {
    ...base,
    sky: sky.map(lookOf) as Light['sky'],
    sunOpacity: base.sunOpacity * w.sun,
    glowOpacity: base.glowOpacity * (0.35 + 0.65 * w.sun),
    moonOpacity:
      base.moonOpacity * (weather === 'clear' || weather === 'haze' ? 1 : 0.35),
    stars:
      base.stars * (weather === 'clear' ? 1 : weather === 'haze' ? 0.4 : 0.1),
    cloud: lookOf(
      weather === 'rain' || weather === 'storm'
        ? mixOk(base.cloud, w.colour[time], 0.7)
        : mixOk(base.cloud, w.colour[time], w.k * 0.5),
    ),
    dim: Math.min(0.9, base.dim + w.dim),
    tone: base.tone,
    water: lookOf(mixOk(base.water, w.colour[time], w.k * 0.6)),
    glint: base.glint * (0.3 + 0.7 * w.sun),
    haze: lookOf(mixOk(base.haze, w.colour[time], w.k)),
  };
}

/** A colour as a time of day's light tones it. */
const toned = (colour: string, light: Light): string =>
  mixOk(colour, light.tone, light.dim);

/** A natural colour in the show's look: the editorial look pulls it a little toward the paper; the illustrated one makes it brighter. */
function toLook(style: KitStyle, colour: string): string {
  if (style.look === 'illustrated') return vivid(colour, 0.14);
  const dark = luminance(style.paper) < 0.35;
  return mixOk(colour, style.paper, dark ? 0.05 : 0.08);
}

// ── The land ──────────────────────────────────────────────────────────────

/** Each land's colours by day, far to near: what its far range, its middle and its ground are. */
const LAND_COLOUR: Readonly<
  Record<SetLand, { far: string; mid: string; near: string; ground: string }>
> = {
  plain: { far: '#9fb08c', mid: '#8aa271', near: '#94ab69', ground: '#a3b56e' },
  hills: { far: '#90a782', mid: '#76976a', near: '#86a35f', ground: '#97b065' },
  mountains: {
    far: '#8f9db4',
    mid: '#7f907f',
    near: '#86996a',
    ground: '#9aac6b',
  },
  coast: { far: '#9aab90', mid: '#8ba077', near: '#d8c79a', ground: '#cdb98a' },
  desert: {
    far: '#cfae84',
    mid: '#ddbb8a',
    near: '#e3c491',
    ground: '#e8cf9f',
  },
  forest: {
    far: '#6c9273',
    mid: '#4d7b58',
    near: '#3f6c47',
    ground: '#5d8549',
  },
  city: { far: '#a3a9b3', mid: '#959ca6', near: '#8d939b', ground: '#8f9399' },
  sea: { far: '#9aab90', mid: '#8ba077', near: '#d8c79a', ground: '#cdb98a' },
};

/** The climate a set's buildings are built for, from its land and weather when the board names none: dry deserts, snowy cold, green forests wet. */
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

/** A range of peaks: a jagged ridge (straight slopes between peaks and saddles). */
function peaks(
  x0: number,
  x1: number,
  bottom: number,
  base: number,
  height: number,
  rng: Seeded,
): Shape {
  const points: Pt[] = [[x0, base - height * 0.3]];
  let x = x0;
  while (x < x1) {
    const step = rng.between(0.06, 0.13) * (x1 - x0);
    const peak = base - height * rng.between(0.55, 1);
    const saddle = base - height * rng.between(0.15, 0.45);
    points.push([x + step * 0.5, peak], [x + step, saddle]);
    x += step;
  }
  points.push([x1, bottom], [x0, bottom]);
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

// ── Building a set ────────────────────────────────────────────────────────

/** A part of the set as it is laid down: its markup (or children), its box, depth, and how each state changes it. */
interface Layer {
  id: string;
  markup: string;
  box: ShotBox;
  depth?: number;
  pivot?: Pt;
  attrs?: Record<string, string | number>;
  value?: number;
}

/** A set being drawn: its layers back to front, its defs, and each state's look of every part that changes. */
class SetCanvas {
  readonly layers: Layer[] = [];
  readonly defs: string[] = [];
  readonly states: Record<
    string,
    Record<
      string,
      { fill?: string; rotate?: number; opacity?: number; lit?: number }
    >
  > = {};
  readonly drift: Record<string, { dx?: number; dy?: number; wrap?: number }> =
    {};
  readonly notes: string[] = [];

  constructor(
    readonly W: number,
    readonly H: number,
    readonly style: KitStyle,
  ) {}

  /** A layer of shapes in one colour (the colour on its group, so a state can change it): paths without a fill of their own. */
  flat(
    id: string,
    shapes: readonly Shape[],
    fill: string,
    options: Omit<Layer, 'id' | 'markup' | 'box'> & { stroke?: number } = {},
  ): Layer {
    const real = shapes.filter((s) => s.d);
    const stroke = options.stroke
      ? ` stroke="${this.style.lineColour}" stroke-width="${n1(options.stroke)}" stroke-linejoin="round"`
      : '';
    const layer: Layer = {
      id,
      markup: real.map((s) => `<path d="${s.d}"${stroke}/>`).join(''),
      box: real.length ? unionBox(real.map((s) => s.box)) : [0, 0, 0, 0],
      ...options,
      attrs: { fill, ...(options.attrs ?? {}) },
    };
    this.layers.push(layer);
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

  /** A part's look in a state. */
  look(
    state: string,
    part: string,
    look: { fill?: string; rotate?: number; opacity?: number; lit?: number },
  ): void {
    this.states[state] ??= {};
    this.states[state][part] = { ...(this.states[state][part] ?? {}), ...look };
  }

  /** The set put together: the svg, its parts (boxes inside the set), its scenery. */
  asset(state: string, focal: ShotBox): ShotSvgAssetDto {
    const frame: ShotBox = [0, 0, this.W, this.H];
    const parts: Record<string, ShotPartDto> = {};
    const markup = this.layers
      .map((layer) => {
        const attrs = Object.entries(layer.attrs ?? {})
          .map(([k, v]) => ` ${k}="${typeof v === 'number' ? n1(v) : v}"`)
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
      state,
      states: this.states,
      ...(Object.keys(this.drift).length ? { drift: this.drift } : {}),
    };
    return { kind: 'svg', svg, box: frame, parts, focal, scenery };
  }
}

/** The states a set describes, each with the time of day it shows and its lights. */
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

/** The sun's arc: its middle and radius, so that it stands high by day and touches the horizon at dusk and dawn, inside the frame. */
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

const at = (c: Pt, r: number, deg: number): Pt => [
  c[0] + r * Math.sin((deg * Math.PI) / 180),
  c[1] - r * Math.cos((deg * Math.PI) / 180),
];

/**
 * A set drawn from its settings, in the show's look: the editorial look
 * by default, the illustrated one brighter and outlined near; as it
 * opens (its `time`), with the look of every state it may change to.
 */
export function drawSet(
  settings: SetSettings,
  look: ShotLookDto,
  options: { shape: FilmShape; kitLook?: KitLook; seed: number },
): DrawnSet {
  const { shape } = options;
  const frame = SET_FRAME[shape];
  const W = frame.w;
  const H = frame.h;
  const style = kitStyle(look, { look: options.kitLook ?? 'editorial', shape });
  const rng = seeded(options.seed ^ 0x5e75e7);
  const canvas = new SetCanvas(W, H, style);
  const notes: string[] = [];
  if (settings.place === 'assembly-hall')
    return assemblyHall(canvas, settings, rng, options.seed);
  const place = placeFor(settings);
  const s: SetSettings = { ...settings, place };
  const horizon =
    H *
    (s.land === 'mountains'
      ? 0.62
      : s.land === 'sea' || s.land === 'coast'
        ? 0.58
        : frame.horizon);
  const groundY = H * frame.ground;
  const times = stateTimes(s.time);
  const lights = Object.fromEntries(
    SET_TIMES.map((t) => [t, lightOf(t, s.weather, style)]),
  ) as Record<SetTime, Light>;
  const open = lights[s.time];
  const over = W * 0.06;

  // ── The sky: a gradient whose four stops change with the state.
  const stops = [0, 0.42, 0.78, 1];
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
  // The stops are parts too (no box of their own: the sky's).
  for (let i = 0; i < 4; i += 1) {
    for (const state of SET_STATES)
      canvas.look(state, `sky-${i + 1}`, {
        fill: lights[times[state].time].sky[i],
      });
  }

  // ── Stars, the moon, the sun with its glow.
  const starShapes: Shape[] = [];
  for (let i = 0; i < (shape === 'wide' ? 70 : 60); i += 1) {
    const x = rng.between(0, W);
    const y = rng.between(0, horizon * 0.7);
    starShapes.push(
      circle([x, y], rng.between(1.2, 3.2) * (shape === 'wide' ? 1 : 1.1)),
    );
  }
  canvas.flat('stars', starShapes, '#fdf6e3', {
    depth: 0,
    attrs: { opacity: open.stars },
  });
  const moonAt: Pt = [W * (shape === 'wide' ? 0.2 : 0.24), horizon * 0.28];
  const moonR = Math.min(W, H) * 0.035;
  canvas.raw(
    'moon',
    `<circle cx="${n1(moonAt[0])}" cy="${n1(moonAt[1])}" r="${n1(moonR * 2.6)}" fill="#dfe7ff" opacity="0.12"/><circle cx="${n1(moonAt[0])}" cy="${n1(moonAt[1])}" r="${n1(moonR)}" fill="#f4f1e6"/><circle cx="${n1(moonAt[0] - moonR * 0.3)}" cy="${n1(moonAt[1] - moonR * 0.2)}" r="${n1(moonR * 0.22)}" fill="#ddd8c8"/><circle cx="${n1(moonAt[0] + moonR * 0.35)}" cy="${n1(moonAt[1] + moonR * 0.3)}" r="${n1(moonR * 0.15)}" fill="#ddd8c8"/>`,
    [
      moonAt[0] - moonR * 2.6,
      moonAt[1] - moonR * 2.6,
      moonR * 5.2,
      moonR * 5.2,
    ],
    { depth: 0.02, attrs: { opacity: open.moonOpacity } },
  );
  const arc = sunArc(W, H, horizon);
  const sunR = Math.min(W, H) * 0.05;
  const sunAt = at(arc.c, arc.r, arc.angle[s.time]);
  canvas.defs.push(
    `<radialGradient id="glow"><stop offset="0" stop-color="${open.glow}" stop-opacity="0.9" data-part="glow-1"/><stop offset="0.35" stop-color="${open.glow}" stop-opacity="0.35" data-part="glow-2"/><stop offset="1" stop-color="${open.glow}" stop-opacity="0" data-part="glow-3"/></radialGradient>`,
  );
  const glowR = Math.min(W, H) * 0.42;
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

  // ── Clouds, drifting: a few by fair weather, many under rain.
  const cloudCount = {
    clear: 3,
    cloud: 6,
    rain: 7,
    storm: 8,
    snow: 6,
    haze: 2,
  }[s.weather];
  for (let i = 0; i < cloudCount; i += 1) {
    const cw =
      W *
      rng.between(0.12, 0.26) *
      (s.weather === 'storm' || s.weather === 'rain' ? 1.4 : 1);
    const cx = rng.between(0, W);
    const cy = rng.between(horizon * 0.12, horizon * 0.62);
    const puffs: Shape[] = [
      box(cx - cw / 2, cy - cw * 0.06, cx + cw / 2, cy + cw * 0.06, cw * 0.06),
    ];
    const n = rng.int(3, 5);
    for (let k = 0; k < n; k += 1) {
      const u = (k + 0.5) / n;
      const r = cw * rng.between(0.12, 0.22) * (1 - Math.abs(u - 0.5));
      puffs.push(circle([cx - cw / 2 + cw * u, cy - r * 0.35], r + cw * 0.05));
    }
    const wrap = W + cw * 2.2;
    // A copy one wrap behind it, so it comes in on one side as it leaves on the other.
    const copies = [
      ...puffs,
      ...puffs.map((p) => ({
        d: shift(p.d, -wrap, 0),
        box: [p.box[0] - wrap, p.box[1], p.box[2], p.box[3]] as ShotBox,
      })),
    ];
    const depth = Math.round(rng.between(0.06, 0.16) * 100) / 100;
    canvas.flat(`cloud-${i + 1}`, copies, open.cloud, {
      depth,
      attrs: { opacity: s.weather === 'haze' ? 0.55 : 0.92 },
    });
    canvas.drift[`cloud-${i + 1}`] = {
      dx: Math.round(rng.between(4, 11) * (W / 2000) * 10) / 10,
      wrap: Math.round(wrap),
    };
    for (const state of SET_STATES)
      canvas.look(state, `cloud-${i + 1}`, {
        fill: lights[times[state].time].cloud,
      });
  }

  // ── The land, far to near, each layer's colour toned and hazed by the light.
  const colours = LAND_COLOUR[s.land];
  const snowy = s.weather === 'snow';
  const landColour = (base: string, depth: number, light: Light): string => {
    const toned = mixOk(base, light.tone, light.dim);
    const hazed = mixOk(
      toned,
      light.haze,
      (1 - depth) * (0.62 + (s.weather === 'haze' ? 0.2 : 0)),
    );
    return toLook(
      style,
      snowy && depth < 0.9
        ? mixOk(hazed, '#eef2f5', 0.55 * (1 - light.dim))
        : hazed,
    );
  };
  const layerLand = (
    id: string,
    shapes: Shape[],
    base: string,
    depth: number,
  ) => {
    canvas.flat(id, shapes, landColour(base, depth, open), { depth });
    for (const state of SET_STATES)
      canvas.look(state, id, {
        fill: landColour(base, depth, lights[times[state].time]),
      });
  };
  const x0 = -over;
  const x1 = W + over;
  const bottom = H + over;
  const farBase = horizon - H * 0.005;
  const isWater = s.land === 'sea' || s.land === 'coast';
  if (s.land === 'mountains') {
    layerLand(
      'land-far',
      [peaks(x0, x1, bottom, farBase, H * 0.36, rng)],
      colours.far,
      0.22,
    );
    layerLand(
      'land-mid',
      [
        silhouette(
          x0,
          x1,
          bottom,
          (x) => farBase - H * 0.1 * waves(rng, 3)(x / W),
          40,
        ),
      ],
      colours.mid,
      0.45,
    );
  } else if (s.land === 'desert') {
    const mesa = (x: number) => {
      const u = x / W;
      const flat = waves(rng, 2)(u);
      return farBase - H * (flat > 0.62 ? 0.14 : 0.03);
    };
    layerLand(
      'land-far',
      [silhouette(x0, x1, bottom, mesa, 120)],
      colours.far,
      0.25,
    );
    const dune = waves(rng, 3);
    layerLand(
      'land-mid',
      [
        silhouette(
          x0,
          x1,
          bottom,
          (x) => horizon + H * 0.03 - H * 0.07 * dune(x / W),
          60,
        ),
      ],
      colours.mid,
      0.5,
    );
  } else if (s.land === 'forest') {
    layerLand(
      'land-far',
      treeLine(
        x0,
        x1,
        bottom,
        farBase,
        H * 0.1,
        rng,
        s.weather === 'snow' || climateOf(s) === 'cold',
      ),
      colours.far,
      0.28,
    );
    layerLand(
      'land-mid',
      treeLine(
        x0,
        x1,
        bottom,
        horizon + H * 0.06,
        H * 0.16,
        rng,
        s.weather === 'snow' || climateOf(s) === 'cold',
      ),
      colours.mid,
      0.55,
    );
  } else if (!isWater || s.land === 'coast') {
    const roll = waves(rng, 3);
    const height = s.land === 'hills' ? 0.12 : s.land === 'city' ? 0.02 : 0.05;
    layerLand(
      'land-far',
      [
        silhouette(
          x0,
          x1,
          bottom,
          (x) => farBase - H * height * roll(x / W),
          60,
        ),
      ],
      colours.far,
      0.25,
    );
    if (s.land === 'hills') {
      const roll2 = waves(rng, 2);
      layerLand(
        'land-mid',
        [
          silhouette(
            x0,
            x1,
            bottom,
            (x) => horizon + H * 0.05 - H * 0.12 * roll2(x / W),
            50,
          ),
        ],
        colours.mid,
        0.5,
      );
    }
  }

  // ── Water: the sea from the horizon down (or the harbour's), with its glints and a shimmer anchor.
  const waterLeft = s.land === 'coast' ? x0 : x0;
  const waterRight =
    s.land === 'coast' ? W * (place === 'port' ? 0.5 : 0.45) : x1;
  const quayY = horizon + H * 0.13;
  if (isWater) {
    const waterTop = s.land === 'sea' ? horizon : horizon + H * 0.005;
    const waterShape = box(waterLeft, waterTop, waterRight, bottom);
    canvas.flat('water', [waterShape], open.water, { depth: 0.6 });
    for (const state of SET_STATES)
      canvas.look(state, 'water', { fill: lights[times[state].time].water });
    // Glints: short strokes of light on the water, thicker toward the sun's side.
    const glints: Shape[] = [];
    for (let i = 0; i < 46; i += 1) {
      const y = rng.between(
        waterTop + H * 0.01,
        Math.min(bottom, waterTop + H * 0.3),
      );
      const near = (y - waterTop) / (H * 0.3);
      const x = rng.between(waterLeft + 20, waterRight - 20);
      const len = W * rng.between(0.01, 0.035) * (0.6 + near);
      glints.push(box(x - len / 2, y, x + len / 2, y + 1.6 + near * 2.4, 1));
    }
    canvas.flat('glints', glints, '#fff3d8', {
      depth: 0.6,
      attrs: { opacity: open.glint },
    });
    for (const state of SET_STATES)
      canvas.look(state, 'glints', {
        opacity: lights[times[state].time].glint,
      });
    // Where the life layer's shimmer plays: the band of water nearest the light.
    canvas.raw(
      'shimmer',
      '',
      [
        waterLeft + 20,
        waterTop,
        Math.max(1, Math.min(waterRight, W) - waterLeft - 40),
        H * 0.3,
      ],
      { depth: 0.6 },
    );
    if (s.land === 'coast') {
      // The land the town stands on, its edge a quay or a beach toward the water.
      const shore =
        place === 'port'
          ? box(waterRight, waterTop + H * 0.004, x1, bottom)
          : silhouette(
              waterRight - W * 0.03,
              x1,
              bottom,
              (x) =>
                waterTop +
                H * 0.004 +
                Math.max(0, (waterRight + W * 0.04 - x) * 0.4),
              20,
            );
      layerLand(
        'land-shore',
        [shore],
        place === 'port' ? '#9b9a95' : colours.near,
        0.7,
      );
    }
  }

  // ── The townscape far off: simple blocks by density and era, its windows a part of their own.
  const climate = climateOf(s);
  const town =
    s.town === 'none' && (place === 'industry' || place === 'city')
      ? 'town'
      : s.town;
  if (town !== 'none') {
    const farTown = farTownscape(
      rng,
      W,
      H,
      horizon,
      town,
      s.era,
      place,
      isWater && s.land === 'coast' ? waterRight : 0,
    );
    const farColour = (light: Light) =>
      toLook(
        style,
        mixOk(mixOk('#7d8592', light.tone, light.dim * 0.9), light.haze, 0.35),
      );
    canvas.flat('town-far', farTown.blocks, farColour(open), { depth: 0.5 });
    for (const state of SET_STATES)
      canvas.look(state, 'town-far', {
        fill: farColour(lights[times[state].time]),
      });
    if (farTown.windows.length) {
      canvas.raw(
        'lights-far',
        farTown.windows.map((w) => `<path d="${w.d}"/>`).join(''),
        unionBox(farTown.windows.map((w) => w.box)),
        {
          depth: 0.5,
          attrs: { fill: '#ffd88a' },
        },
      );
      for (const state of SET_STATES)
        canvas.look(state, 'lights-far', {
          lit: times[state].lit ?? lights[times[state].time].lit,
        });
    }
    if (farTown.smoke.length)
      farTown.smoke.forEach((p, i) =>
        canvas.raw(
          `smoke-far${i ? `-${i + 1}` : ''}`,
          '',
          [p[0] - 1, p[1] - 1, 2, 2],
          { depth: 0.5 },
        ),
      );
  }

  // ── The near ground and what stands on it: the place's own buildings.
  const nearBase =
    s.land === 'coast' || s.land === 'sea' ? quayY : horizon + H * 0.1;
  const groundTop = s.land === 'sea' ? bottom : nearBase - H * 0.012;
  if (s.land !== 'sea') {
    const groundShape =
      s.land === 'coast'
        ? box(waterRight, groundTop, x1, bottom)
        : silhouette(
            x0,
            x1,
            bottom,
            (x) => groundTop + H * 0.01 * waves(rng, 2)(x / W),
            30,
          );
    layerLand('ground', [groundShape], colours.ground, 1);
  }
  const hero = heroes(
    place,
    town,
    s,
    climate,
    rng,
    W,
    s.land === 'coast' ? waterRight : 0,
  );
  const cargo =
    place === 'port' && ERA_IDS.indexOf(s.era) >= ERA_IDS.indexOf('1945-1975')
      ? containers(rng, style, waterRight + W * 0.03, W * 0.98, nearBase, W)
      : [];
  if (hero.length || cargo.length) {
    const near = placeBuildings(
      hero,
      style,
      s,
      climate,
      rng,
      nearBase,
      W,
      cargo,
    );
    canvas.raw('town', near.markup, near.box, { depth: 0.8 });
    // The veil that darkens what is built as the light goes, its windows lit over it.
    canvas.flat('town-veil', near.silhouettes, open.veil, {
      depth: 0.8,
      attrs: { opacity: open.veilOpacity },
    });
    for (const state of SET_STATES) {
      const light = lights[times[state].time];
      canvas.look(state, 'town-veil', {
        fill: light.veil,
        opacity: light.veilOpacity,
      });
    }
    if (near.windows.length) {
      canvas.raw('lights', near.windows.join(''), near.windowBox, {
        depth: 0.8,
        attrs: { fill: '#ffd88a' },
      });
      for (const state of SET_STATES)
        canvas.look(state, 'lights', {
          lit: times[state].lit ?? lights[times[state].time].lit,
        });
    }
    near.smoke.forEach((p, i) =>
      canvas.raw(
        i ? `smoke-${i + 1}` : 'smoke',
        '',
        [p[0] - 1, p[1] - 1, 2, 2],
        { depth: 0.8 },
      ),
    );
    notes.push(...near.notes);
  }

  // ── A ceremony ground's stand, flagpole, floodlights and chairs; an oil field's pump jacks and tanks.
  if (place === 'ceremony-ground')
    ceremonyGround(canvas, s, lights, times, nearBase, groundY, rng);
  if (place === 'oilfield') oilField(canvas, s, lights, times, nearBase, rng);

  // ── The foreground: what the place's ground is (furrows of a field, a road, a quay's edge), where actors stand.
  if (s.land !== 'sea') {
    const marks = foreground(
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
      s.land === 'coast' ? waterRight : x0,
    );
    if (marks.length) {
      const markColour = (light: Light) =>
        mixOk(landColour(colours.ground, 1, light), '#000000', 0.12);
      canvas.flat('ground-marks', marks, markColour(open), { depth: 1 });
      for (const state of SET_STATES)
        canvas.look(state, 'ground-marks', {
          fill: markColour(lights[times[state].time]),
        });
    }
  }

  // ── Weather that falls: rain streaks or snow, tiled so it drifts down for ever.
  if (s.weather === 'rain' || s.weather === 'storm' || s.weather === 'snow') {
    const tile = s.weather === 'snow' ? H * 0.4 : H * 0.3;
    const shapes: Shape[] = [];
    const count = s.weather === 'storm' ? 120 : s.weather === 'rain' ? 80 : 70;
    const drops: { x: number; y: number; l: number }[] = Array.from(
      { length: count },
      () => ({
        x: rng.between(-W * 0.05, W * 1.05),
        y: rng.between(0, tile),
        l: rng.between(0.6, 1.2),
      }),
    );
    for (let k = -1; k * tile < H + tile; k += 1)
      for (const drop of drops) {
        const y = drop.y + k * tile;
        if (s.weather === 'snow')
          shapes.push(circle([drop.x, y], 2.2 * drop.l * (W / 2000 + 0.5)));
        else
          shapes.push(
            band(
              [drop.x, y],
              [drop.x - H * 0.012 * drop.l, y + H * 0.045 * drop.l],
              1.6 * (W / 2000 + 0.4),
            ),
          );
      }
    const id = s.weather === 'snow' ? 'snow' : 'rain';
    canvas.flat(id, shapes, s.weather === 'snow' ? '#ffffff' : '#dfe8f0', {
      depth: 1,
      attrs: { opacity: s.weather === 'snow' ? 0.85 : 0.42 },
    });
    canvas.drift[id] = {
      dy: Math.round(s.weather === 'snow' ? H * 0.05 : H * 1.1),
      wrap: Math.round(tile),
    };
    notes.push(`${id} falling`);
  }

  // ── Where actors stand, and at what scale (a person a little over a third of the set's height).
  const unitsPerMetre =
    Math.round(((H * (shape === 'wide' ? 0.36 : 0.26)) / 1.75) * 10) / 10;
  canvas.raw('ground-line', '', [0, groundY, W, H - groundY], {
    value: unitsPerMetre,
  });
  // The opening's subject: the band from the sky above the place to the ground line, inside what the camera may frame whole.
  const focalTop = Math.max(
    0,
    Math.min(nearBase - H * 0.34, horizon - H * 0.2),
  );
  const focal = fitFocal(
    [W * 0.08, focalTop, W * 0.84, groundY - focalTop],
    W,
    H,
    shape,
  );
  notes.unshift(
    `${s.land}, ${s.time}, ${s.weather}, ${town}, ${place}, ${s.era}`,
  );
  return {
    asset: canvas.asset(s.time, focal),
    ground: groundY,
    unitsPerMetre,
    notes: [...notes, ...canvas.notes],
  };
}

/** A path's numbers moved by dx, dy (the kit's paths are absolute M, L, C and Z only). */
function shift(d: string, dx: number, dy: number): string {
  let k = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (m) =>
    n1(Number(m) + (k++ % 2 === 0 ? dx : dy)),
  );
}

/**
 * The subject box the camera frames at a set's opening, made to fit
 * whole in the largest view inside the set (the camera's rule), so the
 * opening never shows past the set's edges.
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
  return [Math.round(cx - w / 2), Math.round(y), Math.round(w), Math.round(h)];
}

/** The place a set's settings come to: what it is for, read with its land (a port needs the coast; a set by the coast with a town is one). */
function placeFor(s: SetSettings): SetPlace {
  if (s.place !== 'open') return s.place;
  if (s.land === 'city') return 'city';
  return 'open';
}

// ── The townscape ─────────────────────────────────────────────────────────

/** The far town: blocks of its density and era along the horizon, small windows that light, and the tops of its chimneys. */
function farTownscape(
  rng: Seeded,
  W: number,
  H: number,
  horizon: number,
  town: SetTown,
  era: EraId,
  place: SetPlace,
  from: number,
): { blocks: Shape[]; windows: Shape[]; smoke: Pt[] } {
  const blocks: Shape[] = [];
  const windows: Shape[] = [];
  const smoke: Pt[] = [];
  const modern = ERA_IDS.indexOf(era) >= ERA_IDS.indexOf('1945-1975');
  const industrial =
    ERA_IDS.indexOf(era) >= ERA_IDS.indexOf('1800-1900') &&
    ERA_IDS.indexOf(era) <= ERA_IDS.indexOf('1945-1975');
  const tall =
    town === 'city' ? (modern ? 0.3 : 0.14) : town === 'town' ? 0.075 : 0.04;
  const base = horizon + H * 0.012;
  let x = from - W * 0.04;
  while (x < W * 1.04) {
    const w = W * rng.between(0.018, 0.05) * (town === 'village' ? 1.2 : 1);
    if (town === 'village' && rng.chance(0.45)) {
      x += w * rng.between(1, 3);
      continue;
    }
    const h =
      H *
      tall *
      rng.between(0.35, 1) *
      (town === 'city' && modern && rng.chance(0.25) ? 1.6 : 1);
    blocks.push(box(x, base - h, x + w, base + H * 0.02));
    if (!modern || town !== 'city') {
      // A roof: pitched on most, flat on the tallest.
      if (h < H * 0.1 && rng.chance(0.6))
        blocks.push(
          poly([
            [x - w * 0.04, base - h],
            [x + w / 2, base - h - w * 0.32],
            [x + w * 1.04, base - h],
          ]),
        );
    }
    // A chimney or two over an industrial town.
    if (
      (place === 'industry' || (industrial && town !== 'village')) &&
      rng.chance(place === 'industry' ? 0.28 : 0.1)
    ) {
      const cx = x + w * 0.5;
      const ch = H * rng.between(0.08, 0.15);
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
    // Windows in rows, small.
    const cols = Math.max(1, Math.floor(w / (W * 0.009)));
    const rows = Math.max(1, Math.floor(h / (H * 0.022)));
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        if (!rng.chance(0.55)) continue;
        const wx = x + (w / cols) * (c + 0.3);
        const wy = base - h + (h / rows) * (r + 0.3);
        windows.push(
          box(
            wx,
            wy,
            wx + Math.max(2, (w / cols) * 0.4),
            wy + Math.max(2, (h / rows) * 0.38),
          ),
        );
      }
    x += w * rng.between(0.9, 1.15);
  }
  return { blocks, windows, smoke };
}

/** One building the place puts on its near ground: its kind and settings, where across the set (a share of its width), and its scale. */
interface Hero {
  kind: BuildingKind;
  size: Size;
  at: number;
  /** Units a metre for it: the place's scale. */
  scale: number;
  material?:
    'brick' | 'stone' | 'timber' | 'concrete' | 'glass' | 'mud' | 'metal';
}

/** What stands on a place's near ground: a farm's barn, a port's cranes and warehouses, a works and its terraces, a market's stalls, a city's towers, a village's houses. */
function heroes(
  place: SetPlace,
  town: SetTown,
  s: SetSettings,
  climate: Climate,
  rng: Seeded,
  W: number,
  waterEdge: number,
): Hero[] {
  const k = W / 2000;
  const list: Hero[] = [];
  const houses = (from: number, to: number, scale: number, gap = 0.12) => {
    for (let u = from; u <= to; u += gap * rng.between(0.85, 1.15))
      list.push({
        kind: 'house',
        size: rng.pick(['small', 'medium'] as const),
        at: u,
        scale,
      });
  };
  switch (place) {
    case 'farm':
      list.push({ kind: 'farm', size: 'medium', at: 0.46, scale: 15 * k });
      if (town !== 'none') houses(0.78, 0.92, 9 * k, 0.14);
      break;
    case 'port': {
      const edge = waterEdge / W;
      const modern = ERA_IDS.indexOf(s.era) >= ERA_IDS.indexOf('1945-1975');
      list.push({
        kind: 'cranes',
        size: 'medium',
        at: edge + 0.08,
        scale: (modern ? 9 : 11) * k,
      });
      if (modern)
        list.push({
          kind: 'cranes',
          size: 'medium',
          at: edge + 0.25,
          scale: 8 * k,
        });
      list.push({
        kind: 'warehouse',
        size: 'medium',
        at: edge + (modern ? 0.4 : 0.26),
        scale: 8 * k,
      });
      list.push({
        kind: 'warehouse',
        size: 'small',
        at: edge + (modern ? 0.52 : 0.42),
        scale: 8 * k,
      });
      break;
    }
    case 'industry':
      list.push({ kind: 'factory', size: 'large', at: 0.52, scale: 12 * k });
      houses(0.03, 0.3, 11 * k, 0.058);
      houses(0.79, 0.99, 11 * k, 0.058);
      break;
    case 'market':
      list.push({ kind: 'market', size: 'large', at: 0.5, scale: 32 * k });
      houses(0.04, 0.2, 14 * k, 0.12);
      houses(0.82, 0.98, 14 * k, 0.12);
      break;
    case 'city':
      for (let u = 0.04; u < 1; u += rng.between(0.09, 0.14)) {
        const kind = rng.chance(0.55) ? 'tower' : 'flats';
        list.push({
          kind,
          size: rng.pick(['small', 'medium', 'large'] as const),
          at: u,
          scale: (kind === 'tower' ? 4.2 : 6) * k,
        });
      }
      break;
    case 'oilfield':
      break;
    default:
      if (town === 'village') houses(0.12, 0.88, 13 * k, 0.2);
      else if (town === 'town') {
        houses(0.05, 0.42, 12 * k, 0.09);
        list.push({
          kind: climate === 'arid' ? 'flats' : 'school',
          size: 'small',
          at: 0.55,
          scale: 9 * k,
        });
        houses(0.68, 0.96, 12 * k, 0.09);
      } else if (town === 'city') {
        for (let u = 0.06; u < 1; u += rng.between(0.1, 0.16))
          list.push({
            kind: rng.chance(0.5) ? 'flats' : 'tower',
            size: 'small',
            at: u,
            scale: 5 * k,
          });
      }
  }
  return list;
}

/**
 * The near townscape: each building drawn by the kit (kit/buildings) at
 * its place's scale, standing on the near ground; its windows' glows
 * gathered into the set's `lights` (one shape each, to light one by
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
  extras: readonly (readonly [Shape, string])[] = [],
): {
  markup: string;
  box: ShotBox;
  silhouettes: Shape[];
  windows: string[];
  windowBox: ShotBox;
  smoke: Pt[];
  notes: string[];
} {
  const parts: string[] = extras.map(
    ([shape, fill]) => `<path d="${shape.d}" fill="${fill}"/>`,
  );
  const silhouettes: Shape[] = extras.map(([shape]) => shape);
  const windows: string[] = [];
  const windowBoxes: ShotBox[] = [];
  const boxes: ShotBox[] = [];
  const smoke: Pt[] = [];
  const notes: string[] = [];
  // Farther first (the smaller), so the nearer stand over them.
  const sorted = [...list].sort((a, b) => a.scale - b.scale);
  sorted.forEach((hero, i) => {
    const made = buildingParts(
      hero.kind,
      {
        era: s.era,
        climate,
        size: hero.size,
        material: hero.material ?? 'auto',
      },
      style,
      rng.int(1, 1e6),
    );
    const k = hero.scale / 100;
    const x = hero.at * W;
    const y = base + (hero.kind === 'market' ? 0.06 * W : 0);
    const transform = `translate(${n1(x)} ${n1(y)}) scale(${Math.round(k * 10000) / 10000})`;
    const mine = made.drawing.parts.filter((p) => p.id !== 'building');
    const bodyMarkup = mine
      .filter((p) => p.id !== 'lights')
      .map((p) => p.markup)
      .join('');
    parts.push(`<g transform="${transform}">${bodyMarkup}</g>`);
    // The shapes it is built of (not its windows, door or glows) for the veil.
    for (const p of mine) {
      if (['lights', 'windows', 'door'].includes(p.id) || !p.markup) continue;
      for (const m of p.markup.matchAll(/<path d="([^"]+)"/g)) {
        const d = scalePath(m[1], k, x, y);
        silhouettes.push({
          d,
          box: p.box
            ? [x + p.box[0] * k, y + p.box[1] * k, p.box[2] * k, p.box[3] * k]
            : [x, y, 0, 0],
        });
      }
    }
    const lights = mine.find((p) => p.id === 'lights');
    if (lights?.markup)
      for (const m of lights.markup.matchAll(/<path d="([^"]+)"[^>]*\/>/g))
        windows.push(`<path d="${scalePath(m[1], k, x, y)}"/>`);
    if (lights?.box)
      windowBoxes.push([
        x + lights.box[0] * k,
        y + lights.box[1] * k,
        lights.box[2] * k,
        lights.box[3] * k,
      ]);
    for (const p of made.smoke) smoke.push([x + p[0] * k, y + p[1] * k]);
    const all = unionBox(mine.filter((p) => p.box).map((p) => p.box!));
    boxes.push([x + all[0] * k, y + all[1] * k, all[2] * k, all[3] * k]);
    void all;
    if (i === sorted.length - 1 || hero.kind !== 'house')
      notes.push(`${hero.kind} (${made.material})`);
  });
  for (const [shape] of extras) boxes.push(shape.box);
  return {
    markup: parts.join(''),
    box: unionBox(boxes),
    silhouettes,
    windows,
    windowBox: windowBoxes.length ? unionBox(windowBoxes) : [0, 0, 0, 0],
    smoke,
    notes: [...new Set(notes)],
  };
}

/** A path's numbers scaled by k and moved by x, y (absolute commands only, as the kit draws). */
function scalePath(d: string, k: number, x: number, y: number): string {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (m) =>
    n1(Number(m) * k + (i++ % 2 === 0 ? x : y)),
  );
}

/** The near ground's marks: a field's furrows, a road's edges, a quay's stones, a square's paving. */
function foreground(
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
  from: number,
): Shape[] {
  const marks: Shape[] = [];
  const top = nearBase + H * 0.01;
  if (
    place === 'farm' ||
    (place === 'open' && (s.land === 'plain' || s.land === 'hills'))
  ) {
    // Furrows that run toward the horizon: lines fanning from a point far off.
    const vx = W * rng.between(0.4, 0.6);
    for (let i = -14; i <= 14; i += 1) {
      const bx = vx + i * W * 0.09;
      marks.push(
        poly([
          [vx + i * W * 0.012, top],
          [vx + i * W * 0.012 + 3, top],
          [bx + W * 0.012, bottom],
          [bx - W * 0.012, bottom],
        ]),
      );
    }
  } else if (place === 'port') {
    // The quay's edge along the water, and its stones' joints.
    marks.push(box(from, top - H * 0.012, x1, top + H * 0.006));
    for (let x = from + W * 0.04; x < x1; x += W * 0.07)
      marks.push(box(x, top + H * 0.03, x + W * 0.05, top + H * 0.034));
  } else if (
    place === 'industry' ||
    place === 'market' ||
    place === 'city' ||
    s.land === 'city'
  ) {
    // A road across the front, its kerb and its middle line.
    marks.push(box(x0, groundY - H * 0.06, x1, groundY - H * 0.052));
    for (let x = x0; x < x1; x += W * 0.09)
      marks.push(
        box(x, groundY + H * 0.02, x + W * 0.045, groundY + H * 0.026),
      );
  } else if (s.land === 'desert') {
    for (let i = 0; i < 12; i += 1) {
      const y = rng.between(top + H * 0.03, bottom - H * 0.02);
      const x = rng.between(0, W);
      marks.push(ellipse([x, y], W * rng.between(0.03, 0.08), H * 0.004));
    }
  } else {
    // Grass tufts.
    for (let i = 0; i < 26; i += 1) {
      const x = rng.between(0, W);
      const y = rng.between(groundY - H * 0.05, bottom - H * 0.02);
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

/** Containers stacked on a quay, two or three high, in the muted colours of shipping lines (never a real line's). */
function containers(
  rng: Seeded,
  style: KitStyle,
  from: number,
  to: number,
  base: number,
  W: number,
): (readonly [Shape, string])[] {
  const k = W / 2000;
  const cw = 60 * k;
  const ch = 24 * k;
  const colours = [
    '#9b4a3c',
    '#3d6b8e',
    '#c48a3a',
    '#4f7d5c',
    '#7b5a8a',
    '#b8b2a7',
  ].map((c) => toLook(style, c));
  const out: (readonly [Shape, string])[] = [];
  for (let x = from + W * 0.14; x + cw < to; x += cw + 3 * k) {
    if (rng.chance(0.18)) continue;
    const high = rng.int(1, 3);
    for (let h = 0; h < high; h += 1) {
      const y = base - (h + 1) * (ch + 1.5 * k);
      const colour = rng.pick(colours);
      out.push([box(x, y, x + cw, y + ch), colour]);
      out.push([
        box(x + cw * 0.08, y + ch * 0.2, x + cw * 0.92, y + ch * 0.3),
        mixOk(colour, '#000000', 0.18),
      ]);
    }
  }
  return out;
}

type Lights = Record<SetTime, Light>;
type Times = Record<SetState, { time: SetTime; lit?: number }>;

/**
 * A ceremony ground: a covered stand at the back (its roof on posts, its
 * tiers of seats), a dais before it, a tall flagpole (the stage flies a
 * flag from its anchor), floodlight masts that light at night, and rows
 * of chairs on the parade ground. Bunting in plain colours, never a
 * country's.
 */
function ceremonyGround(
  canvas: SetCanvas,
  s: SetSettings,
  lights: Lights,
  times: Times,
  base: number,
  groundY: number,
  rng: Seeded,
): void {
  const { W, H, style } = canvas;
  const roof = toLook(style, '#e6e1d6');
  const post = toLook(style, '#8b8f96');
  const seats = toLook(style, mixOk('#3d6b8e', style.muted, 0.2));
  const dais = toLook(style, '#8a5a3c');
  const standW = W * (H > W ? 0.86 : 0.56);
  const sx0 = W / 2 - standW / 2;
  const sx1 = W / 2 + standW / 2;
  const standTop = base - H * 0.17;
  const shapes: (readonly [Shape, string])[] = [
    // The stand: tiers rising to the back, a roof over them on posts.
    [box(sx0, base - H * 0.1, sx1, base), seats],
    [
      box(sx0, base - H * 0.07, sx1, base - H * 0.064),
      mixOk(seats, '#ffffff', 0.25),
    ],
    [
      box(sx0, base - H * 0.04, sx1, base - H * 0.034),
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
    // The dais before it.
    [
      box(W / 2 - W * 0.07, base + H * 0.02, W / 2 + W * 0.07, base + H * 0.06),
      dais,
    ],
    [
      box(
        W / 2 - W * 0.075,
        base + H * 0.015,
        W / 2 + W * 0.075,
        base + H * 0.025,
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
  veil(
    canvas,
    'stand-veil',
    shapes.map(([sh]) => sh),
    lights,
    times,
    0.85,
    s.time,
  );
  // Bunting along the stand's roof: small flags in plain colours.
  const flags: Shape[] = [];
  const bunting = ['#c4573a', '#e2b04a', '#3d78b5', '#f2efe8'].map((c) =>
    toLook(style, c),
  );
  const flagMarkup: string[] = [];
  for (let x = sx0; x < sx1; x += W * 0.018) {
    const f = poly([
      [x, standTop + H * 0.032],
      [x + W * 0.012, standTop + H * 0.032],
      [x + W * 0.006, standTop + H * 0.052],
    ]);
    flags.push(f);
    flagMarkup.push(
      `<path d="${f.d}" fill="${bunting[flagMarkup.length % bunting.length]}"/>`,
    );
  }
  canvas.raw(
    'bunting',
    flagMarkup.join(''),
    unionBox(flags.map((f) => f.box)),
    { depth: 0.85 },
  );
  // The flagpole, to one side, its anchor at the top.
  const fx = W * (H > W ? 0.86 : 0.8);
  const poleTop = base - H * 0.42;
  canvas.flat(
    'flagpole',
    [
      band([fx, base + H * 0.02], [fx, poleTop], Math.max(4, W * 0.003)),
      circle([fx, poleTop], W * 0.004),
    ],
    post,
    { depth: 0.85 },
  );
  for (const state of SET_STATES)
    canvas.look(state, 'flagpole', {
      fill: toned(post, lights[times[state].time]),
    });
  canvas.raw('flag', '', [fx - 1, poleTop - 1, 2, 2], { depth: 0.85 });
  // Floodlight masts, their lamps a lights part.
  const lamps: Shape[] = [];
  const masts: Shape[] = [];
  for (const mx of [sx0 - W * 0.06, sx1 + W * 0.06]) {
    const top = base - H * 0.36;
    masts.push(band([mx, base], [mx, top], Math.max(5, W * 0.004)));
    masts.push(box(mx - W * 0.03, top - H * 0.035, mx + W * 0.03, top));
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
  canvas.flat('masts', masts, post, { depth: 0.85 });
  for (const state of SET_STATES)
    canvas.look(state, 'masts', {
      fill: toned(post, lights[times[state].time]),
    });
  canvas.raw(
    'lights',
    lamps.map((l) => `<path d="${l.d}"/>`).join(''),
    unionBox(lamps.map((l) => l.box)),
    { depth: 0.85, attrs: { fill: '#fff4cf' } },
  );
  for (const state of SET_STATES)
    canvas.look(state, 'lights', {
      lit: times[state].lit ?? Math.min(1, lights[times[state].time].lit * 1.2),
    });
  // Rows of chairs on the parade ground before the dais.
  const chairs: Shape[] = [];
  const rows = 3;
  for (let r = 0; r < rows; r += 1) {
    const y = base + H * 0.11 + r * H * 0.05;
    const cw = W * (0.012 + r * 0.002);
    for (
      let x = W * 0.18 + r * W * 0.01;
      x < W * 0.82 - r * W * 0.01;
      x += cw * 1.7
    ) {
      if (Math.abs(x - W / 2) < W * 0.03) continue;
      chairs.push(box(x, y - cw * 1.6, x + cw, y - cw * 0.8));
      chairs.push(box(x, y - cw * 0.85, x + cw, y - cw * 0.6));
    }
  }
  const chair = toLook(style, '#5e6670');
  canvas.flat('chairs', chairs, chair, { depth: 1 });
  for (const state of SET_STATES)
    canvas.look(state, 'chairs', {
      fill: toned(chair, lights[times[state].time]),
    });
  void groundY;
  void rng;
  void s;
}

/** An oil field: pump jacks nodding over their wells (each a walking beam on a post, its horse's head and counterweight), and storage tanks. */
function oilField(
  canvas: SetCanvas,
  s: SetSettings,
  lights: Lights,
  times: Times,
  base: number,
  rng: Seeded,
): void {
  const { W, H, style } = canvas;
  const steel = toLook(style, '#4d5560');
  const red = toLook(style, '#9b4a3c');
  const tank = toLook(style, '#c9c6bd');
  const shapes: (readonly [Shape, string])[] = [];
  const count = W > H ? 4 : 2;
  for (let i = 0; i < count; i += 1) {
    const x =
      W * (0.12 + (0.76 * i) / Math.max(1, count - 1)) +
      rng.between(-W * 0.02, W * 0.02);
    const k = (W / 2000) * rng.between(0.8, 1.15) * (i % 2 ? 0.8 : 1);
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
    [W * 0.86, 70],
    [W * 0.95, 55],
  ] as const) {
    const rr = r * (W / 2000);
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
  veil(
    canvas,
    'pumps-veil',
    shapes.map(([sh]) => sh),
    lights,
    times,
    0.85,
    s.time,
  );
}

/** A veil over what is drawn in its own colours (a stand, pump jacks): it darkens them as the light goes, as the town's does. */
function veil(
  canvas: SetCanvas,
  id: string,
  shapes: Shape[],
  lights: Lights,
  times: Times,
  depth: number,
  opening: SetTime,
): void {
  canvas.flat(id, shapes, lights[opening].veil, {
    depth,
    attrs: { opacity: lights[opening].veilOpacity },
  });
  for (const state of SET_STATES) {
    const light = lights[times[state].time];
    canvas.look(state, id, { fill: light.veil, opacity: light.veilOpacity });
  }
}

// ── Interiors ─────────────────────────────────────────────────────────────

/**
 * An assembly hall, seen from its public gallery: the rows of a
 * hemicycle curving round the speaker's chair on its dais, the members'
 * desks in the house's leather, the galleries along the back wall under
 * tall windows whose light is the time of day's, and the lamps that light
 * at night. No emblem, no words: a crest is a plain medallion.
 */
function assemblyHall(
  canvas: SetCanvas,
  s: SetSettings,
  rng: Seeded,
  seed: number,
): DrawnSet {
  const { W, H, style } = canvas;
  void seed;
  void rng;
  const times = stateTimes(s.time);
  const lights = Object.fromEntries(
    SET_TIMES.map((t) => [t, lightOf(t, s.weather, style)]),
  ) as Record<SetTime, Light>;
  const open = lights[s.time];
  const wall = toLook(style, mixOk('#e7dccb', style.paper, 0.2));
  const wallShade = mixOk(wall, '#7a6a58', 0.25);
  const wood = toLook(style, '#8a5a3c');
  const woodDark = mixOk(wood, '#000000', 0.25);
  const leather = toLook(style, mixOk('#2f6f62', style.muted, 0.15));
  const carpet = toLook(style, '#8f4a3c');
  const floor = toLook(style, '#b9a68c');
  const tall = H > W;
  // The back wall, its windows' light, its galleries.
  canvas.flat('wall', [box(-40, -40, W + 40, H + 40)], wall);
  const winTop = H * (tall ? 0.08 : 0.06);
  const winH = H * (tall ? 0.16 : 0.2);
  const count = tall ? 4 : 7;
  const glass: Shape[] = [];
  for (let i = 0; i < count; i += 1) {
    const cx = W * ((i + 0.5) / count);
    const w = W * (tall ? 0.1 : 0.06);
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
  canvas.flat('windows', glass, open.sky[2]);
  for (const state of SET_STATES)
    canvas.look(state, 'windows', {
      fill: lights[times[state].time].sky[
        times[state].time === 'night' ? 1 : 2
      ],
    });
  const gallery = H * (tall ? 0.3 : 0.34);
  canvas.flat(
    'gallery',
    [
      box(-40, gallery - H * 0.025, W + 40, gallery + H * 0.05),
      box(-40, gallery + H * 0.05, W + 40, gallery + H * 0.065),
    ],
    wood,
  );
  // Pilasters between the windows, and a plain medallion over the chair.
  const pil: Shape[] = [];
  for (let i = 0; i <= count; i += 1)
    pil.push(
      box(
        W * (i / count) - W * 0.008,
        0,
        W * (i / count) + W * 0.008,
        gallery - H * 0.025,
      ),
    );
  canvas.flat('pilasters', pil, wallShade);
  // The floor of the well, the dais, the speaker's chair under its canopy.
  const well = H * (tall ? 0.46 : 0.5);
  canvas.flat('floor', [box(-40, well, W + 40, H + 40)], floor);
  const cx = W / 2;
  const chairW = W * (tall ? 0.14 : 0.07);
  canvas.flat(
    'dais',
    [
      box(
        cx - chairW * 1.6,
        well - H * 0.02,
        cx + chairW * 1.6,
        well + H * 0.035,
      ),
    ],
    woodDark,
  );
  canvas.raw(
    'chair',
    `<path d="${box(cx - chairW / 2, well - H * 0.16, cx + chairW / 2, well - H * 0.02, chairW * 0.12).d}" fill="${leather}"/><path d="${dome(cx, well - H * 0.16, chairW * 0.62, H * 0.05).d}" fill="${woodDark}"/><path d="${box(cx - chairW * 0.7, well - H * 0.06, cx + chairW * 0.7, well - H * 0.02).d}" fill="${wood}"/><path d="${circle([cx, gallery - H * 0.1], Math.min(W, H) * 0.035).d}" fill="${toLook(style, '#c9a44e')}"/>`,
    [
      cx - chairW * 0.7,
      gallery - H * 0.14,
      chairW * 1.4,
      well - gallery + H * 0.14,
    ],
  );
  // The rows of the hemicycle: arcs about a point behind the chair, nearer rows wider and lower.
  const rows = tall ? 5 : 6;
  const rowShapes: Shape[] = [];
  const deskShapes: Shape[] = [];
  const centre: Pt = [cx, well - H * 0.08];
  for (let r = 0; r < rows; r += 1) {
    const rx = W * (tall ? 0.24 : 0.17) + r * W * (tall ? 0.1 : 0.075);
    const ry = H * 0.06 + r * H * (tall ? 0.055 : 0.07);
    const thick = H * (tall ? 0.028 : 0.032);
    const arcPts = (
      ox: number,
      oy: number,
      a0: number,
      a1: number,
      n: number,
    ): Pt[] =>
      Array.from({ length: n + 1 }, (_, i) => {
        const a = a0 + ((a1 - a0) * i) / n;
        return [centre[0] + ox * Math.cos(a), centre[1] + oy * Math.sin(a)];
      });
    const a0 = Math.PI * 0.06;
    const a1 = Math.PI * 0.94;
    const outer = arcPts(rx + W * 0.03, ry + thick, a0, a1, 30);
    const inner = arcPts(rx, ry, a1, a0, 30);
    rowShapes.push(poly([...outer, ...inner]));
    const deskOuter = arcPts(rx + W * 0.03, ry + thick, a0, a1, 30);
    const deskInner = arcPts(rx + W * 0.03, ry + thick * 0.55, a1, a0, 30);
    deskShapes.push(poly([...deskOuter, ...deskInner]));
  }
  canvas.flat('benches', rowShapes, leather);
  canvas.flat('desks', deskShapes, wood);
  // The aisles cutting the rows, in the carpet's colour.
  const aisles: Shape[] = [];
  for (const a of [Math.PI * 0.32, Math.PI * 0.5, Math.PI * 0.68]) {
    const p0: Pt = [
      centre[0] + W * 0.15 * Math.cos(a),
      centre[1] + H * 0.05 * Math.sin(a),
    ];
    const p1: Pt = [
      centre[0] + W * 0.9 * Math.cos(a),
      centre[1] + H * 0.62 * Math.sin(a),
    ];
    aisles.push(band(p0, p1, W * 0.018));
  }
  canvas.flat('aisles', aisles, carpet);
  // Lamps along the gallery that light at night.
  const lamps: Shape[] = [];
  for (let i = 0; i < count; i += 1)
    lamps.push(
      circle(
        [W * ((i + 1) / (count + 1)), gallery + H * 0.012],
        Math.min(W, H) * 0.012,
      ),
    );
  canvas.raw(
    'lights',
    lamps.map((l) => `<path d="${l.d}"/>`).join(''),
    unionBox(lamps.map((l) => l.box)),
    { attrs: { fill: '#ffe2a0' } },
  );
  for (const state of SET_STATES)
    canvas.look(state, 'lights', {
      lit: Math.max(0.5, times[state].lit ?? lights[times[state].time].lit),
    });
  // The light of the hour over the room: a soft veil that warms at dusk and darkens at night.
  canvas.flat('veil', [box(-40, -40, W + 40, H + 40)], open.veil, {
    attrs: { opacity: open.veilOpacity * 0.55 },
  });
  for (const state of SET_STATES) {
    const light = lights[times[state].time];
    canvas.look(state, 'veil', {
      fill: light.veil,
      opacity: light.veilOpacity * 0.55,
    });
  }
  const groundY = H * 0.94;
  const unitsPerMetre =
    Math.round(((H * (tall ? 0.24 : 0.32)) / 1.75) * 10) / 10;
  canvas.raw('ground-line', '', [0, groundY, W, H - groundY], {
    value: unitsPerMetre,
  });
  const focal = fitFocal(
    [W * 0.06, gallery - H * 0.18, W * 0.88, H * 0.66],
    W,
    H,
    tall ? 'tall' : 'wide',
  );
  return {
    asset: canvas.asset(s.time, focal),
    ground: groundY,
    unitsPerMetre,
    notes: [`assembly hall, ${s.time}`, `${rows} rows`],
  };
}

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
