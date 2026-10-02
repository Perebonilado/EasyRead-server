import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import { mentionsOf, numbersSaid } from './shot-mentions';
import {
  PLAN_PACE,
  cutIn,
  planEvents,
  planGaps,
  planHolds,
  reframes,
  replaceSpan,
  spareShots,
  stallWords,
} from './shot-pace';
import { narrationOf, sceneNarration } from './shot-phrases';
import { buildRegistry, registryOf } from './shot-registry';
import type { PlanShot, ShotPlan } from './types';

const shot = (
  s: Partial<PlanShot> & Pick<PlanShot, 'on' | 'set'>,
): PlanShot => ({
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'cut',
  ...s,
});

/** Three regions on a show map, by their own points: a north, a west and an east. */
const threeRegions = registryOf([
  {
    name: 'region:North Region',
    kind: 'region',
    about: 'a region of the show’s map',
    geo: { lng: 8.67, lat: 10.39 },
    aliases: ['north'],
  },
  {
    name: 'region:West Region',
    kind: 'region',
    about: 'a region of the show’s map',
    geo: { lng: 4.7, lat: 7.08 },
    aliases: ['west'],
  },
  {
    name: 'region:East Region',
    kind: 'region',
    about: 'a region of the show’s map',
    geo: { lng: 7.55, lat: 5.6 },
    aliases: ['east'],
  },
]);

describe('what the narration names', () => {
  it('hears numbers in figures and in words', () => {
    const said = numbersSaid(
      narrationOf(
        'It ran 1,393 kilometres, three borders, twenty one gates and three million people.',
      ),
    ).map((x) => x.value);
    expect(said).toEqual(expect.arrayContaining([1393, 3, 21, 3e6]));
  });

  it('names a region by its name, its adjective, and a side of the map no region is named for', () => {
    const n = narrationOf(
      'Southern leaders pressed. The North waited, and northern delegates sat; the West was rooted.',
    );
    const named = mentionsOf(n, threeRegions).map(
      (m) => `${n.keys[m.at]}:${m.entry.name}`,
    );
    expect(named).toEqual([
      'southern:region:West Region',
      'southern:region:East Region',
      'north:region:North Region',
      'northern:region:North Region',
      'west:region:West Region',
    ]);
  });

  it('names places, people, dates and the numbers of the registry', () => {
    const registry = buildRegistry({
      rows: WALL_ROWS,
      research: WALL_RESEARCH,
      world: WALL_WORLD,
    });
    const n = narrationOf(sceneNarration(WALL_ROWS));
    const named = mentionsOf(n, registry).map((m) => m.entry.name);
    expect(named).toEqual(
      expect.arrayContaining([
        'place:Berlin',
        'date:1961',
        'seam:inner border',
        'number:Length of the inner border',
        'person:Ronald Reagan',
        'person:Erich Honecker',
        'region:East Germany',
        'date:1987',
      ]),
    );
  });
});

describe("a plan's pace, on its words", () => {
  const n = narrationOf(sceneNarration(WALL_ROWS));

  it('counts a shot, its information and a move to a new subject as news; a drift on the subject is not', () => {
    expect(reframes({ move: 'travel' }, {})).toBe(true);
    expect(
      reframes({ move: 'push', target: 'place:Berlin' }, { focal: 'set' }),
    ).toBe(true);
    expect(
      reframes(
        { move: 'push', target: 'place:Berlin' },
        { focal: 'place:Berlin' },
      ),
    ).toBe(false);
    expect(reframes({ move: 'pull' }, {})).toBe(false);
    const plan: ShotPlan = {
      shots: [
        shot({
          on: 'In 1961',
          set: { kind: 'map' },
          info: [
            { recipe: 'pin', target: 'place:Berlin', on: 'Berlin' },
            {
              recipe: 'label',
              target: 'place:Berlin',
              text: 'Berlin',
              on: 'was cut',
            },
          ],
          camera: [
            { move: 'push', target: 'place:Berlin', on: 'two overnight' },
            { move: 'pull', on: 'inner border' },
          ],
          focal: 'set',
        }),
      ],
    };
    // "Berlin" (2) and "was cut" (3) are one event; the push on Berlin is news.
    expect(planEvents(plan, n).map((e) => [e.at, e.kind])).toEqual([
      [0, 'shot'],
      [2, 'info'],
      [6, 'camera'],
    ]);
    const gaps = planGaps(plan, n);
    expect(gaps).toEqual([
      { from: 6, to: n.keys.length, words: n.keys.length - 6, shot: 0 },
    ]);
    expect(stallWords(plan, n)).toBe(n.keys.length - 6 - PLAN_PACE.maxWords);
  });

  it('counts the pauses between lines in a stretch', () => {
    const plan: ShotPlan = {
      shots: [shot({ on: 'In 1961', set: { kind: 'map' }, focal: 'set' })],
    };
    const [gap] = planGaps(plan, n, [8, 16, 24, 30, 37]);
    expect(gap.words).toBe(n.keys.length + 5);
  });

  it('spares only a shot whose going leaves no longer stretch with nothing new', () => {
    const plan: ShotPlan = {
      shots: [
        shot({ on: 'In 1961', set: { kind: 'map' }, focal: 'set' }),
        shot({ on: 'cut in two', set: { kind: 'map' }, focal: 'set' }),
        shot({ on: 'The inner border', set: { kind: 'map' }, focal: 'set' }),
        shot({ on: 'for 1,393', set: { kind: 'map' }, focal: 'set' }),
      ],
    };
    // Either of the shots at 4 and at 8 may go (8 words each side is
    // inside the pace); the last may not: the stretch to the end grows.
    expect(spareShots(plan, n)).toEqual([1, 2]);
  });
});

describe('a declared hold, and a picture cut into a shot', () => {
  const n = narrationOf(sceneNarration(WALL_ROWS));
  const photo = (on: string): PlanShot =>
    shot({
      on,
      set: { kind: 'photo', photo: 'photo:Berlin 1961' },
      camera: [{ move: 'push', on, amount: 'small' }],
      focal: 'set',
    });

  it('excuses a stretch a hold runs through at least half of, as the frames checker does', () => {
    const still: ShotPlan = { shots: [photo('In 1961, Berlin')] };
    expect(planGaps(still, n)).toHaveLength(1);
    const held: ShotPlan = {
      shots: [
        {
          ...still.shots[0],
          camera: [
            ...still.shots[0].camera,
            { move: 'hold', on: 'two overnight' },
          ],
        },
      ],
    };
    // The hold runs from its words to the shot's end.
    expect(planHolds(held, n)).toEqual([[6, n.keys.length]]);
    expect(planGaps(held, n)).toEqual([]);
    // A hold that comes too late leaves the stretch.
    const late: ShotPlan = {
      shots: [
        {
          ...still.shots[0],
          camera: [...still.shots[0].camera, { move: 'hold', on: 'held on' }],
        },
      ],
    };
    expect(planGaps(late, n)).toHaveLength(1);
  });

  it('puts a picture over a shot’s words, the shot going on after it with what it brings on there', () => {
    const map: PlanShot = shot({
      on: 'In 1961',
      set: { kind: 'map', tilt: 'flat' },
      info: [
        { recipe: 'pin', target: 'place:Berlin', on: 'Berlin' },
        { recipe: 'seam', target: 'seam:inner border', on: 'inner border' },
        { recipe: 'mark', target: 'place:Berlin', on: 'Brandenburg Gate' },
      ],
      focal: 'place:Berlin',
    });
    const shots = [map];
    // Over "The inner border ran for 1,393 kilometres" (8 to 16).
    expect(replaceSpan(shots, 0, 8, 16, photo('The inner border'), n)).toBe(
      true,
    );
    expect(shots.map((s) => [s.on, s.set.kind, s.info.length])).toEqual([
      ['In 1961', 'map', 1],
      ['The inner border', 'photo', 0],
      ['In 1987, Reagan', 'map', 1],
    ]);
    expect(shots[0].join).toBe('cut');
    expect(shots[2].focal).toBe('place:Berlin');
    // Too few words for the picture: nothing changes.
    expect(replaceSpan(shots, 1, 12, 13, photo('Berlin'), n)).toBe(false);
    expect(shots).toHaveLength(3);
  });

  it('cuts a picture in as its subject is named, holding until the shot’s next change', () => {
    const quote: PlanShot = shot({
      on: 'In 1987',
      set: {
        kind: 'chart',
        chart: {
          kind: 'quote',
          spec: { text: 'Mr. Gorbachev, tear down this wall!', speaker: null },
        },
      },
      info: [{ recipe: 'mark', target: 'part:speaker', on: 'Reagan' }],
      camera: [{ move: 'push', on: 'Tear down this wall', amount: 'small' }],
      focal: 'set',
    });
    const before = shot({ on: 'In 1961', set: { kind: 'map' }, focal: 'set' });
    const shots = [before, quote];
    // Reagan, named as the quote's shot begins: his picture takes its
    // first words, the quote goes on at its push, the mark with it.
    expect(cutIn(shots, 18, photo('Reagan'), n)).toBe(true);
    expect(shots.map((s) => [s.on, s.set.kind])).toEqual([
      ['In 1961', 'map'],
      ['In 1987', 'photo'],
      ['Tear down this', 'chart'],
    ]);
    expect(shots[2].info).toEqual([
      { recipe: 'mark', target: 'part:speaker', on: 'Tear down this' },
    ]);
    // Nothing before the first shot to cut into.
    expect(cutIn([], 3, photo('Berlin'), n)).toBe(false);
  });

  it('is the same every time for the same plan', () => {
    const plan: ShotPlan = {
      shots: [
        {
          ...photo('In 1961, Berlin'),
          camera: [{ move: 'hold', on: 'two overnight' }],
        },
      ],
    };
    expect(planGaps(plan, n)).toEqual(planGaps(plan, n));
    expect(planHolds(plan, n)).toEqual(planHolds(plan, n));
  });
});
