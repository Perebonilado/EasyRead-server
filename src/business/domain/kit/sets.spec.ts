import type { FilmShape, ShotLookDto } from '../../../contracts';
import {
  CHANGE_MS,
  SET_FRAME,
  SET_LANDS,
  SET_PLACES,
  SET_STATES,
  SET_TIMES,
  SET_TOWNS,
  SET_WEATHERS,
  drawSet,
  lightRank,
  setSettingsOf,
  type SetSettings,
} from './sets';

const LOOK: ShotLookDto = {
  palette: { paper: '#FBF7EF', ink: '#1F2A37', muted: '#5B6675', accent: '#E0663A', sides: {} },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};
const DARK: ShotLookDto = { ...LOOK, palette: { ...LOOK.palette, paper: '#111827', ink: '#F5F3FF', muted: '#B4B9CC' } };
const SHAPES: FilmShape[] = ['wide', 'tall'];

const settings = (more: Partial<SetSettings>): SetSettings => ({
  land: 'plain',
  time: 'day',
  weather: 'clear',
  town: 'none',
  era: 'today',
  place: 'open',
  ...more,
});

/** Every data-part a drawing has. */
const partsIn = (svg: string) => new Set([...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]));

/** A spread of sets: every land, time, weather, town and place at least once, both shapes. */
const SPREAD: SetSettings[] = [
  ...SET_LANDS.map((land, i) => settings({ land, time: SET_TIMES[i % 4], weather: SET_WEATHERS[i % 6], town: SET_TOWNS[i % 4] })),
  ...SET_PLACES.map((place, i) => settings({ place, time: SET_TIMES[(i + 1) % 4], town: 'town', era: i % 2 ? '1900-1945' : 'today' })),
  settings({ land: 'mountains', weather: 'snow', town: 'village', era: '1800-1900' }),
  settings({ land: 'desert', weather: 'haze', place: 'oilfield' }),
  settings({ land: 'coast', place: 'port', era: '1900-1945', time: 'dusk' }),
];

describe('a code-drawn set', () => {
  it.each(SHAPES)('is drawn sound in %s for every land, time, weather, town and place, for several seeds', (shape) => {
    const [, , W, H] = [0, 0, SET_FRAME[shape].w, SET_FRAME[shape].h];
    for (const one of SPREAD)
      for (const seed of [1, 99]) {
        const { asset, ground, unitsPerMetre, air } = drawSet(one, LOOK, { shape, seed });
        expect(asset.box).toEqual([0, 0, W, H]);
        expect(asset.svg).toMatch(new RegExp(`^<svg[^>]*viewBox="0 0 ${W} ${H}"`));
        // No words anywhere in a set.
        expect(asset.svg).not.toMatch(/<text|<tspan/);
        // Every part listed is drawn, and its box is inside the set.
        const drawn = partsIn(asset.svg);
        for (const [id, part] of Object.entries(asset.parts)) {
          expect(drawn.has(id)).toBe(true);
          const [x, y, w, h] = part.box;
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + w).toBeLessThanOrEqual(W + 0.01);
          expect(y + h).toBeLessThanOrEqual(H + 0.01);
          if (part.depth !== undefined) expect(part.depth).toBeGreaterThanOrEqual(0);
        }
        // Its ground is inside it, its air a colour.
        expect(ground).toBeGreaterThan(H * 0.5);
        expect(ground).toBeLessThan(H);
        if (unitsPerMetre !== undefined) expect(unitsPerMetre).toBeGreaterThan(0);
        expect(air).toMatch(/^#[0-9a-f]{6}$/i);
      }
  });

  it.each(SHAPES)('frames its opening subject whole in the largest view inside it (%s), as the camera’s rule says', (shape) => {
    const aspect = shape === 'wide' ? 16 / 9 : 9 / 16;
    for (const one of SPREAD) {
      const { asset } = drawSet(one, LOOK, { shape, seed: 3 });
      const [, , W, H] = asset.box;
      const fit = Math.min(H, W / aspect);
      const [fx, fy, fw, fh] = asset.focal!;
      expect(fx).toBeGreaterThanOrEqual(0);
      expect(fy).toBeGreaterThanOrEqual(0);
      expect(fw / aspect).toBeLessThanOrEqual(fit * 0.92 + 1);
      expect(fh).toBeLessThanOrEqual(fit * 0.92 + 1);
    }
  });

  it('is the same set for the same seed, and another for another', () => {
    const one = settings({ land: 'hills', town: 'town', time: 'dusk' });
    expect(drawSet(one, LOOK, { shape: 'wide', seed: 5 }).asset.svg).toBe(drawSet(one, LOOK, { shape: 'wide', seed: 5 }).asset.svg);
    expect(drawSet(one, LOOK, { shape: 'wide', seed: 5 }).asset.svg).not.toBe(drawSet(one, LOOK, { shape: 'wide', seed: 6 }).asset.svg);
  });

  it('is in the show’s colours: a dark show’s set is not a light show’s', () => {
    const one = settings({ town: 'village' });
    expect(drawSet(one, DARK, { shape: 'wide', seed: 1 }).asset.svg).not.toBe(drawSet(one, LOOK, { shape: 'wide', seed: 1 }).asset.svg);
    const illustrated = drawSet(one, LOOK, { shape: 'wide', seed: 1, kitLook: 'illustrated' }).asset.svg;
    expect(illustrated).not.toBe(drawSet(one, LOOK, { shape: 'wide', seed: 1 }).asset.svg);
  });
});

describe('a set’s scenery', () => {
  const factoryTown = drawSet(settings({ land: 'plain', time: 'dusk', town: 'town', place: 'industry', era: '1900-1945' }), LOOK, { shape: 'wide', seed: 1 });

  it('opens in its time, and says how it looks in every state it may change to', () => {
    const scenery = factoryTown.asset.scenery!;
    expect(scenery.state).toBe('dusk');
    for (const state of SET_STATES) expect(Object.keys(scenery.states[state] ?? {}).length).toBeGreaterThan(10);
    // Every part a state changes is drawn.
    const drawn = partsIn(factoryTown.asset.svg);
    for (const state of SET_STATES) for (const part of Object.keys(scenery.states[state])) expect(drawn.has(part)).toBe(true);
  });

  it('turns the sun about its arc, below the horizon at night, and mixes the sky’s colours', () => {
    const { states } = factoryTown.asset.scenery!;
    expect(states.dusk.sun.rotate).toBe(0);
    expect(states.night.sun.rotate).toBeGreaterThan(0);
    expect(states.night.sun.opacity).toBe(0);
    expect(states.day.sun.rotate).toBeLessThan(0);
    expect(states.night['sky-1'].fill).not.toBe(states.day['sky-1'].fill);
    expect(states.night.stars.opacity).toBe(1);
    expect(states.day.stars.opacity).toBe(0);
    // The sun's pivot is the arc's middle, below the horizon.
    const sun = factoryTown.asset.parts.sun;
    expect(sun.pivot![1]).toBeGreaterThan(0.9);
  });

  it('lights its windows: none by day, a few at dusk, all with the lights on, the opening’s lit ones drawn lit in the shared order', () => {
    const { states, state } = factoryTown.asset.scenery!;
    expect(states.day.lights.lit).toBe(0);
    expect(states['lights-on'].lights.lit).toBe(1);
    expect(states.dusk.lights.lit).toBeGreaterThan(0);
    expect(states.dusk.lights.lit).toBeLessThan(0.5);
    expect(state).toBe('dusk');
    const group = /<g data-part="lights"[^>]*>(.*?)<\/g>/.exec(factoryTown.asset.svg)![1];
    const windows = [...group.matchAll(/<path d="[^"]+"( opacity="0")?\/>/g)];
    expect(windows.length).toBeGreaterThan(20);
    windows.forEach((m, n) => expect(!m[1]).toBe(lightRank('lights', n) < states.dusk.lights.lit!));
    // Lights-on keeps the opening's sky.
    expect(states['lights-on']['sky-1'].fill).toBe(states.dusk['sky-1'].fill);
  });

  it('ranks lights in a fixed order of their own, the same on the client', () => {
    const ranks = Array.from({ length: 200 }, (_, n) => lightRank('lights', n));
    for (const rank of ranks) {
      expect(rank).toBeGreaterThanOrEqual(0);
      expect(rank).toBeLessThan(1);
    }
    // Spread through the order, not bunched.
    expect(ranks.filter((r) => r < 0.5).length).toBeGreaterThan(70);
    expect(ranks.filter((r) => r < 0.5).length).toBeLessThan(130);
    // The client's lib/shots/scenery has these same three.
    expect([lightRank('lights', 0), lightRank('lights', 1), lightRank('lights-far', 7)].map((r) => Math.round(r * 1e6) / 1e6)).toEqual(LIGHT_RANKS);
  });

  it('drifts its clouds across and its rain down, each round again within its wrap', () => {
    const rain = drawSet(settings({ weather: 'rain', place: 'farm' }), LOOK, { shape: 'wide', seed: 2 }).asset.scenery!;
    expect(rain.drift!.rain.dy).toBeGreaterThan(0);
    expect(rain.drift!.rain.wrap).toBeGreaterThan(0);
    const clouds = Object.entries(rain.drift!).filter(([id]) => id.startsWith('cloud-'));
    expect(clouds.length).toBeGreaterThan(3);
    for (const [, drift] of clouds) {
      expect(drift.dx).toBeGreaterThan(0);
      expect(drift.wrap).toBeGreaterThan(SET_FRAME.wide.w);
    }
  });

  it('gives far layers less depth than near ones, the sky none', () => {
    const { parts } = drawSet(settings({ land: 'mountains', town: 'village' }), LOOK, { shape: 'wide', seed: 4 }).asset;
    expect(parts.sky.depth).toBe(0);
    expect(parts['land-far'].depth!).toBeLessThan(parts['land-mid'].depth!);
    expect(parts['land-mid'].depth!).toBeLessThan(parts.town.depth!);
    expect(parts.ground.depth).toBeUndefined();
  });

  it('changes its light in its own time: a sunset slowly, the lights quicker', () => {
    expect(CHANGE_MS.dusk).toBeGreaterThan(CHANGE_MS['lights-on']);
  });
});

describe('what stands in a place', () => {
  it('stands a works with smoking stacks in an industrial town, its smoke where the life layer starts', () => {
    const { parts } = drawSet(settings({ place: 'industry', town: 'town', era: '1900-1945' }), LOOK, { shape: 'wide', seed: 1 }).asset;
    expect(parts.smoke).toBeDefined();
    expect(parts['smoke-2']).toBeDefined();
    expect(parts.smoke.box[1]).toBeLessThan(parts.town.box[1] + parts.town.box[3] * 0.4);
  });

  it('stands a port across the water: water with its glints and a shimmer anchor, the cranes on the far quay', () => {
    const { parts } = drawSet(settings({ land: 'coast', place: 'port', town: 'town' }), LOOK, { shape: 'wide', seed: 1 }).asset;
    for (const part of ['water', 'glints', 'shimmer', 'far-shore', 'town', 'lights']) expect(parts[part]).toBeDefined();
    expect(parts.water.box[1]).toBeGreaterThan(parts.town.box[1]);
  });

  it('takes a port’s coast whatever land it was given, and reads a place from the plan’s words', () => {
    const { asset } = drawSet(settings({ land: 'plain', place: 'port' }), LOOK, { shape: 'wide', seed: 1 });
    expect(asset.parts.water).toBeDefined();
    expect(setSettingsOf({ land: 'coast', place: 'nowhere', town: 'city' }, null)).toEqual(settings({ land: 'coast', town: 'city' }));
  });

  it('draws an assembly hall inside: its rows, aisles, dais and chair, its windows the hour’s light, lamps that light', () => {
    const { asset, unitsPerMetre } = drawSet(settings({ place: 'assembly-hall', time: 'night' }), LOOK, { shape: 'wide', seed: 1 });
    for (const part of ['wall', 'windows', 'seats', 'desks', 'aisles', 'chair', 'well', 'lights', 'veil']) expect(asset.parts[part]).toBeDefined();
    expect(asset.parts.sky).toBeUndefined();
    expect(asset.scenery!.states.night.lights.lit).toBeGreaterThanOrEqual(0.45);
    expect(asset.scenery!.states.day.lights.lit).toBeGreaterThanOrEqual(0.45);
    expect(unitsPerMetre).toBeGreaterThan(0);
  });

  it('draws a ceremony ground’s stand, flagpole with its anchor, floodlights and chairs', () => {
    const { parts } = drawSet(settings({ place: 'ceremony-ground', time: 'dusk' }), LOOK, { shape: 'wide', seed: 1 }).asset;
    for (const part of ['stand', 'bunting', 'flagpole', 'flag', 'masts', 'lights', 'chairs']) expect(parts[part]).toBeDefined();
  });

  it('draws a display for a thing shown on its own: no scale of its own, so what stands there is sized big', () => {
    const made = drawSet(settings({ place: 'display' }), LOOK, { shape: 'wide', seed: 1 });
    expect(made.unitsPerMetre).toBeUndefined();
    expect(made.asset.parts.floor).toBeDefined();
    expect(made.ground).toBeCloseTo(SET_FRAME.wide.h * 0.84, 5);
  });
});

/** The first lights' ranks, as the client's scenery computes them (its test holds the same numbers). */
const LIGHT_RANKS = [lightRankOf('lights', 0), lightRankOf('lights', 1), lightRankOf('lights-far', 7)];

/** FNV-1a of "part:n" with murmur3's finish, over 2^32: written out again here, so a change to either side shows. */
function lightRankOf(part: string, n: number): number {
  let h = 0x811c9dc5;
  const text = `${part}:${n}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return Math.round(((h >>> 0) / 4294967296) * 1e6) / 1e6;
}
