import type { MapDraft } from '../scene-map';
import type { ExplainerSheet, StorySheet } from './studio';
import { joinFor, joinOf, placeInList, type JoinSide } from './studio-edit';
import { motionFor, studioReading } from './studio-motion';

type Cast = ExplainerSheet['draft']['cast'][number];

/** A thing on an explainer's stage: a drawing unless said. */
const thing = (id: string, name: string, extra: Partial<Cast> = {}): Cast => ({
  id,
  kind: 'drawing',
  name,
  brief: name,
  motion: null,
  parts: null,
  states: null,
  shape: 'square',
  value: null,
  style: null,
  sound: null,
  lines: null,
  plot: null,
  quote: null,
  phrases: null,
  ref: null,
  state: null,
  timeline: null,
  chart: null,
  ...extra,
});

/** An explainer's scene: its things, shown in the steps given, the voice landing on `effects`. */
const sheet = (
  title: string,
  cast: Cast[],
  shows: string[][],
  effects: { target: string; do: 'point' | 'zoom' | 'pulse' }[] = [],
): ExplainerSheet => ({
  kind: 'explainer',
  title,
  transition: 'cut',
  draft: {
    fit: 'good',
    fitReason: null,
    title,
    mood: 'calm',
    beats: [{ say: 'Words.', pause: 'short', delivery: 'explain' }],
    cast,
    steps: shows.map((show, i) => ({
      beat: 0,
      phrase: 'Words',
      layout: 'row',
      show,
      arrows: null,
      effects: i === shows.length - 1 ? effects : null,
    })),
  },
});

const side = (
  one: ExplainerSheet | StorySheet | null,
  scene: Partial<NonNullable<JoinSide['scene']>> = {},
): JoinSide => ({
  sheet: one,
  scene: {
    title: one?.title ?? '',
    summary: '',
    teach: null,
    points: [],
    ...scene,
  },
});

const CELL = thing('Cell', 'A cell', {
  parts: [
    { name: 'nucleus', label: true },
    { name: 'membrane', label: true },
  ],
});

describe('how an explainer joins its scenes (Ask 4 D), by code', () => {
  it('zooms through a part the next scene goes inside', () => {
    const before = sheet('The cell', [CELL], [['Cell']]);
    const after = sheet('The nucleus', [thing('dna', 'DNA')], [['dna']]);
    expect(
      joinFor(
        side(before),
        side(after, { teach: 'Inside the nucleus is the DNA.' }),
      ),
    ).toEqual({
      join: 'zoom-through',
      joinWith: { from: 'cell', part: 'nucleus' },
    });
    // Or where its outline says so.
    expect(
      joinFor(side(before), side(after, { into: 'the membrane' })).joinWith,
    ).toEqual({
      from: 'cell',
      part: 'membrane',
    });
  });

  it("morphs the same thing, a chart's above all, from the end of one scene to the start of the next", () => {
    const chart = (id: string) =>
      thing(id, 'Rainfall by month', {
        kind: 'chart',
        chart: { kind: 'bar', unit: 'mm', bars: [{ label: 'Jan', value: 3 }] },
      });
    const before = sheet(
      'Rain this year',
      [thing('sky', 'Clouds'), chart('rain1')],
      [['sky', 'rain1']],
    );
    const after = sheet(
      'Rain last year',
      [chart('rain2'), thing('sun', 'The sun')],
      [['rain2', 'sun']],
    );
    expect(joinFor(side(before), side(after))).toEqual({
      join: 'morph',
      joinWith: { from: 'rain1', to: 'rain2' },
    });
  });

  it("morphs one map into the next where both are in the show's one frame, however each is captioned", () => {
    const base = { kind: 'map' as const, region: 'Germany', year: 1961 };
    const map = (id: string, name: string, more: Partial<MapDraft>) =>
      thing(id, name, {
        kind: 'map',
        map: {
          region: 'Germany',
          highlight: null,
          places: null,
          routes: null,
          ...more,
        },
      });
    const before = sheet(
      'Two Germanys',
      [map('m1', 'A divided country', { areas: ['Bavaria'], base })],
      [['m1']],
    );
    const after = sheet(
      'The wall',
      [map('m2', 'Berlin in 1961', { places: ['Berlin'], base })],
      [['m2']],
    );
    expect(joinFor(side(before), side(after))).toEqual({
      join: 'morph',
      joinWith: { from: 'm1', to: 'm2' },
    });
    // Without the show's frame, two maps of other captions are two shapes
    // of one kind: matched, as before.
    const own = (one: typeof before) => ({
      ...one,
      draft: {
        ...one.draft,
        cast: one.draft.cast.map((c) => ({
          ...c,
          map: c.map ? { ...c.map, base: null } : c.map,
        })),
      },
    });
    expect(joinFor(side(own(before)), side(own(after))).join).toBe('match');
  });

  it("matches what one ended on and the next opens on where they are one of the show's pictures, or two of a kind code draws", () => {
    const pictures = [{ name: 'heart', is: 'the organ', draw: 'a heart' }];
    const before = sheet(
      'The pump',
      [thing('h1', 'The heart pumping')],
      [['h1']],
      [{ target: 'h1', do: 'point' }],
    );
    const after = sheet(
      'Blood',
      [thing('h2', 'Heart valves', { shape: 'tall' })],
      [['h2']],
    );
    expect(joinFor(side(before), side(after), pictures)).toEqual({
      join: 'match',
      joinWith: { from: 'h1', to: 'h2' },
    });
    const plot = (id: string, name: string) =>
      thing(id, name, { kind: 'plot' });
    expect(
      joinFor(
        side(sheet('Speed', [plot('p1', 'Speed over time')], [['p1']])),
        side(sheet('Distance', [plot('p2', 'Distance over time')], [['p2']])),
      ).join,
    ).toBe('match');
    // Two drawings of one shape but no picture in common are not a match.
    expect(joinFor(side(before), side(after)).join).toBe('dissolve');
  });

  it('pushes on to the next step of a list', () => {
    const one = sheet('Step 1: Rinse', [thing('a', 'A tap')], [['a']]);
    const two = sheet('Step 2: Soap', [thing('b', 'A bar of soap')], [['b']]);
    expect(joinFor(side(one), side(two)).join).toBe('push');
    // A tall film's comes up from below, as a phone's feed scrolls (studio-vertical-plan §4.6).
    expect(joinFor(side(one), side(two), [], 'tall').join).toBe('push-up');
    expect(placeInList('Part three: the end')).toEqual({ list: 'part', n: 3 });
    expect(placeInList('2. Soap')).toEqual({ list: '#', n: 2 });
    expect(placeInList('Second, the soap')).toEqual({ list: 'ordinal', n: 2 });
    expect(placeInList('Why soap works')).toBeNull();
  });

  it('dissolves otherwise, dips where time passes, carries on a build, and joins a story as it always has', () => {
    const one = sheet('Plants', [thing('a', 'A plant')], [['a']]);
    const two = sheet('Animals', [thing('b', 'A fox')], [['b']]);
    expect(joinFor(side(one), side(two)).join).toBe('dissolve');
    expect(joinFor(side(one), side({ ...two, transition: 'fade' })).join).toBe(
      'dip',
    );
    expect(joinFor(side(one), { ...side(two), build: 'continue' }).join).toBe(
      'continue',
    );
    const story = {
      kind: 'story',
      title: 'A',
      transition: 'cut',
      set: 'park',
      time: 'day',
      weather: null,
    } as unknown as StorySheet;
    expect(joinFor(side(story), side({ ...story })).join).toBe(
      joinOf(story, story),
    );
    expect(joinFor(null, side(two)).join).toBe('dissolve');
  });
});

describe("an explainer's reading and motion (Ask 3)", () => {
  it("reads at its audience's rate and moves at its pace, leaned by the maker's", () => {
    expect(
      studioReading({ audience: null, who: { band: 'early-years' } }),
    ).toEqual({
      wpm: 60,
      motion: 0.75,
      cardWords: 2,
    });
    expect(studioReading({ audience: 'adults' })).toEqual({
      wpm: 200,
      motion: 1,
      cardWords: 7,
    });
    expect(studioReading({ audience: null })).toEqual({
      wpm: 200,
      motion: 1,
      cardWords: 7,
    });
    expect(
      studioReading({ audience: null, who: { band: 'university' } }, 1.08)
        .motion,
    ).toBe(1.08);
    // The maker's Pace chip, as E1's motion factor leans it.
    expect(
      studioReading({
        audience: null,
        who: { band: 'university' },
        pace: 'snappy',
      }).motion,
    ).toBe(1.08);
    expect(
      studioReading({
        audience: null,
        who: { band: 'early-years' },
        pace: 'gentle',
      }).motion,
    ).toBe(0.7);
    expect(motionFor(0.75, 0.93)).toBe(0.7);
    expect(motionFor(1, 1.2)).toBe(1.1);
  });
});
