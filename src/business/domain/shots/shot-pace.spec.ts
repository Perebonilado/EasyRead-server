import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import { mentionsOf, numbersSaid } from './shot-mentions';
import {
  PLAN_PACE,
  planEvents,
  planGaps,
  reframes,
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
