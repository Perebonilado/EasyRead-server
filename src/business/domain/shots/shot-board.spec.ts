import { FakeLlmAdapter } from '../../../web/adapters/fake-llm.adapter';
import type { LlmGatewayPort, StudioRevision } from '../../ports/llm.port';
import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import { boardShots, safePlan, shotParts, withSafeShots } from './shot-board';
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
    expect(sets).toEqual(['map', 'counter', 'quote']);
    expect(made.plan.shots[0].info[0]).toEqual({
      recipe: 'pin',
      target: 'place:Berlin',
      on: 'In 1961, Berlin',
    });
    expect(made.plan.shots[1].info[0]).toMatchObject({
      recipe: 'count',
      value: 1393,
      unit: 'km',
    });
    expect(made.plan.shots[2].set).toMatchObject({
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
    // The fake's second answer was better: its problems are none.
    expect(made.problems).toEqual([]);
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
    const rows = [WALL_ROWS[1], WALL_ROWS[5]];
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
