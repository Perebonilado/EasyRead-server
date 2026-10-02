import { FakeLlmAdapter } from '../../../web/adapters/fake-llm.adapter';
import type { LlmGatewayPort, StudioRevision } from '../../ports/llm.port';
import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import {
  boardShots,
  safePlan,
  shotParts,
  withPace,
  withSafeShots,
} from './shot-board';
import { checkPlan, WHOLE_SET } from './shot-check';
import {
  lineSpans,
  narrationOf,
  phraseAt,
  sceneNarration,
} from './shot-phrases';
import { buildRegistry } from './shot-registry';
import type { ShotPlan } from './types';

const input = {
  rows: WALL_ROWS,
  research: WALL_RESEARCH,
  world: WALL_WORLD,
  scene: {
    index: 0,
    of: 4,
    title: 'The Wall',
    seconds: 18,
    episode: 'Two Germanys',
  },
  audience: 'adults',
};
const narration = sceneNarration(WALL_ROWS);

/** The fake board, each call kept: what it was asked, and what it answered. */
function board(answers: Record<string, unknown>[] = []) {
  const fake = new FakeLlmAdapter();
  const calls: ({ parts: string[] } & StudioRevision)[] = [];
  const llm: Pick<LlmGatewayPort, 'shotsBoard'> = {
    shotsBoard: async (call) => {
      calls.push(call);
      const given = answers[calls.length - 1];
      return given
        ? { value: given, usage: (await fake.shotsBoard(call)).usage }
        : fake.shotsBoard(call);
    },
  };
  return { llm, calls };
}

/** Whether every line has a picture: a shot starts on it, or something of its shot comes on. */
function everyLineShown(plan: ShotPlan) {
  const n = narrationOf(narration);
  return lineSpans(WALL_ROWS).every(([a, b]) =>
    plan.shots.some((s) => {
      const from = phraseAt(n, s.on);
      if (from >= a && from < b) return true;
      return [...s.info, ...s.camera].some((x) => {
        const at = phraseAt(n, x.on, from);
        return at >= a && at < b;
      });
    }),
  );
}

describe("a lesson scene's shots boarded", () => {
  it('tells the board the scene, what it may name and its lines, and nothing it may not name', () => {
    const registry = buildRegistry({
      rows: WALL_ROWS,
      research: WALL_RESEARCH,
      world: WALL_WORLD,
    });
    const parts = shotParts(input, registry).join('\n\n');
    expect(parts).toContain(
      'scene 1 of 4 of "Two Germanys", "The Wall", about 18 seconds. It opens the episode',
    );
    expect(parts).toContain("The show's map: Germany, in 1961");
    expect(parts).toContain(
      'The colour held back: "held", only for the open gate.',
    );
    expect(parts).toContain('- place:Berlin [pin]');
    expect(parts).toContain(
      '1. say: In 1961, Berlin was cut in two overnight.\n   about: place · claims: c1',
    );
    expect(parts).toContain(
      '5. say: East Germany’s leader, Erich Honecker, held on.\n   about: who · claims: none',
    );
    expect(parts).not.toContain('A border kiosk at dawn');
  });

  it('boards with the fake: a plan every check passes, every line with a picture, no card of words', async () => {
    const { llm, calls } = board();
    const made = await boardShots(input, llm);
    expect(calls).toHaveLength(1);
    expect(made.usage).toHaveLength(1);
    expect(
      checkPlan(made.plan, narration, made.registry, { map: true }),
    ).toEqual([]);
    expect(everyLineShown(made.plan)).toBe(true);
    // The map's pin on Berlin, the border's length counted, Reagan's own words.
    const sets = made.plan.shots.map((s) =>
      s.set.kind === 'chart' ? s.set.chart.kind : s.set.kind,
    );
    // The last line, about when, its date's calendar as the voice moves on to it.
    expect(sets).toEqual([
      'map',
      'counter',
      'calendar',
      'quote',
      'map',
      'calendar',
    ]);
    // The episode's opening: the pin lands as Berlin is named, by the third word.
    expect(made.plan.shots[0].info[0]).toEqual({
      recipe: 'pin',
      target: 'place:Berlin',
      on: 'Berlin was cut',
    });
    expect(made.plan.shots[1].info[0]).toMatchObject({
      recipe: 'count',
      value: 1393,
      unit: 'km',
    });
    expect(made.plan.shots[3].set).toMatchObject({
      chart: { spec: { text: 'Mr. Gorbachev, tear down this wall!' } },
    });
    expect(JSON.stringify(made.plan)).not.toMatch(/"kind":"(?:words|plain)"/u);
  });

  it('sends a plan back once with its problems in plain words, and keeps the better answer', async () => {
    const bad = {
      shots: [
        {
          on: 'In 1961',
          set: { kind: 'map' },
          info: [
            { recipe: 'pin', target: 'place:Checkpoint Charlie', on: 'Berlin' },
          ],
          camera: [],
          life: [],
          join: 'cut',
          focal: 'place:Checkpoint Charlie',
        },
      ],
    };
    const { llm, calls } = board([bad]);
    const made = await boardShots(input, llm);
    expect(calls).toHaveLength(2);
    expect(made.sentBack).toBe(true);
    expect(made.usage).toHaveLength(2);
    expect(calls[1].previous).toEqual(bad);
    expect(calls[1].problems!.join(' ')).toContain(
      '"place:Checkpoint Charlie" is not in the list of what you may name',
    );
    // The fake's second answer named only what the list gives; what it
    // left to the pace and the opening, code gave it.
    expect(made.problems.map((p) => p.code)).not.toContain('unknown-target');
    expect(made.plan.shots[0].info[0].target).toBe('place:Berlin');
  });

  it('gives every line a safe shot when the board gives nothing', async () => {
    const { llm } = board([{ shots: [] }, { shots: [] }]);
    const made = await boardShots(input, llm);
    expect(made.plan.shots.length).toBeGreaterThan(0);
    expect(
      checkPlan(made.plan, narration, made.registry, { map: true }),
    ).toEqual([]);
    expect(everyLineShown(made.plan)).toBe(true);
  });

  it('boards by code alone when the board cannot be had: safe shots, never a card', () => {
    const { plan, registry } = safePlan(input);
    expect(checkPlan(plan, narration, registry, { map: true })).toEqual([]);
    expect(everyLineShown(plan)).toBe(true);
    expect(plan.shots[0]).toMatchObject({
      on: 'In 1961, Berlin',
      set: { kind: 'map' },
      focal: 'place:Berlin',
    });
    expect(JSON.stringify(plan)).not.toMatch(/"kind":"(?:words|plain)"/u);
  });

  it('carries the shot before on with its camera moving, where it has a move to spare', () => {
    const registry = buildRegistry({
      rows: WALL_ROWS,
      research: WALL_RESEARCH,
      world: null,
    });
    // The last line resting on nothing: no picture of its own.
    const rows = [WALL_ROWS[1], { ...WALL_ROWS[5], claims: [] }];
    const counter: ShotPlan = {
      shots: [
        {
          on: 'The inner border',
          set: {
            kind: 'chart',
            chart: {
              kind: 'counter',
              spec: {
                value: 1393,
                unit: 'km',
                prefix: null,
                label: null,
                then: null,
              },
            },
          },
          actors: [],
          info: [
            {
              recipe: 'count',
              target: 'number:Length of the inner border',
              on: '1,393 kilometres',
            },
          ],
          life: [],
          camera: [],
          join: 'cut',
          focal: WHOLE_SET,
        },
      ],
    };
    const covered = withSafeShots(counter, rows, registry, null);
    expect(covered.shots).toHaveLength(1);
    expect(covered.shots[0].camera).toEqual([
      { move: 'push', on: 'Two years later', amount: 'small' },
    ]);
  });
});

describe('the kit on the board', () => {
  const registry = buildRegistry({
    rows: WALL_ROWS,
    research: WALL_RESEARCH,
    world: WALL_WORLD,
  });

  it('offers the kit for the show’s look, each piece with its settings and moves', () => {
    const parts = shotParts(input, registry).join('\n\n');
    expect(parts).toContain('The kit (pieces that may stand');
    expect(parts).toMatch(/- people\.crowd: .*Settings: .*count/);
    expect(parts).toMatch(/- vehicle\.train: /);
    // The illustrated look: its own characters, never the silhouettes (the things are drawn in both looks).
    const other = shotParts({ ...input, look: 'illustrated' }, registry).join(
      '\n\n',
    );
    expect(other).toMatch(/- character\.person: .*Settings: .*dress in words/);
    expect(other).toMatch(/- character\.group: /);
    expect(other).not.toMatch(/- people\./);
    expect(parts).not.toMatch(/- character\./);
    expect(other).not.toContain('- people.crowd:');
    expect(other).toMatch(/- building: .*Settings: kind/);
    expect(other).toMatch(/- machine\.turbofan: /);
  });

  it('stands a counted crowd where the line says people gathered, its count the line’s own', async () => {
    const rows = [
      { ...WALL_ROWS[0], say: 'In 1961, 300 people gathered in Berlin.' },
      ...WALL_ROWS.slice(1),
    ];
    const { llm } = board();
    const made = await boardShots({ ...input, rows }, llm);
    const crowd = made.plan.shots
      .flatMap((s) => s.actors)
      .find((a) => a.kit === 'people.crowd');
    expect(crowd).toMatchObject({
      place: 'place:Berlin',
      params: { count: 300 },
    });
    expect(
      made.problems.filter((p) => /count|silhouette|audience/.test(p.code)),
    ).toEqual([]);
  });
});

describe('something new every few words (withPace)', () => {
  const registry = buildRegistry({
    rows: WALL_ROWS,
    research: WALL_RESEARCH,
    world: WALL_WORLD,
  });
  const still = (on: string, set: ShotPlan['shots'][number]['set']) => ({
    on,
    set,
    actors: [],
    info: [],
    life: [],
    camera: [],
    join: 'cut' as const,
    focal: WHOLE_SET,
  });

  it('goes on from a full shot as its continuation, framed on what the voice now names', () => {
    const rows = [WALL_ROWS[0], WALL_ROWS[4]];
    const full: ShotPlan = {
      shots: [
        {
          ...still('In 1961, Berlin', { kind: 'map', tilt: 'flat' }),
          info: [
            { recipe: 'pin', target: 'place:Berlin', on: 'Berlin was cut' },
            { recipe: 'label', target: 'place:Berlin', on: 'Berlin was cut' },
            { recipe: 'seam', target: 'seam:inner border', on: 'cut in two' },
            { recipe: 'mark', target: 'place:Berlin', on: 'two overnight' },
          ],
          camera: [
            { move: 'establish', on: 'In 1961, Berlin' },
            { move: 'push', target: 'place:Berlin', on: 'Berlin was cut' },
          ],
          focal: 'place:Berlin',
        },
      ],
    };
    const paced = withPace(full, rows, registry, WALL_WORLD);
    expect(paced.shots).toHaveLength(2);
    expect(paced.shots[0].join).toBe('continue');
    expect(paced.shots[0].info).toHaveLength(4);
    expect(paced.shots[1]).toMatchObject({
      on: 'East Germany’s leader',
      set: { kind: 'map' },
      info: [
        {
          recipe: 'fill',
          target: 'region:East Germany',
          on: 'East Germany’s leader',
        },
      ],
      focal: 'region:East Germany',
    });
  });

  it('shows a date said as a shot begins on its calendar first, the shot after it', () => {
    const rows = [WALL_ROWS[0], WALL_ROWS[1]];
    const counter: ShotPlan = {
      shots: [
        {
          ...still('In 1961, Berlin', {
            kind: 'chart',
            chart: {
              kind: 'counter',
              spec: {
                value: 1393,
                unit: 'km',
                prefix: null,
                label: null,
                then: null,
              },
            },
          }),
          info: [
            {
              recipe: 'count',
              target: 'number:Length of the inner border',
              on: '1,393 kilometres',
            },
          ],
        },
      ],
    };
    const paced = withPace(counter, rows, registry, WALL_WORLD);
    expect(paced.shots[0]).toMatchObject({
      on: 'In 1961, Berlin',
      set: {
        kind: 'chart',
        chart: { kind: 'calendar', spec: { calendars: [{ dates: ['1961'] }] } },
      },
    });
    // The calendar holds the opening's first words; the counter comes on the fourth.
    expect(paced.shots[1]).toMatchObject({
      on: 'was cut in',
      set: { kind: 'chart', chart: { kind: 'counter' } },
    });
  });

  it('brings on what the board put before its name as the voice first names it', () => {
    const rows = [WALL_ROWS[3], WALL_ROWS[4]];
    const early: ShotPlan = {
      shots: [
        {
          ...still('Tear down this', { kind: 'map', tilt: 'flat' }),
          info: [
            {
              recipe: 'fill',
              target: 'region:East Germany',
              on: 'Tear down this',
            },
          ],
        },
      ],
    };
    const paced = withPace(early, rows, registry, WALL_WORLD);
    expect(paced.shots[0].info[0]).toEqual({
      recipe: 'fill',
      target: 'region:East Germany',
      on: 'East Germany’s leader',
    });
  });
});
