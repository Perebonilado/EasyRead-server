import { CHART_SPECS } from './__fixtures__/chart-specs';
import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import type { CriticFix } from './shot-critic';
import { WHOLE_SET, checkPlan, mendPlan } from './shot-check';
import { applyFixes, type BoardAsk, type FixContext } from './shot-fix';
import { sceneNarration } from './shot-phrases';
import { buildRegistry } from './shot-registry';
import type { PlanShot, ShotPlan } from './types';

const registry = buildRegistry({
  rows: WALL_ROWS,
  research: WALL_RESEARCH,
  world: WALL_WORLD,
});
const narration = sceneNarration(WALL_ROWS);
const ctx: FixContext = {
  rows: WALL_ROWS,
  registry,
  world: WALL_WORLD,
  options: { map: true },
};

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

/** The Wall's plan as the board left it: the map, the border's length, Reagan's words. */
const plan = (): ShotPlan =>
  mendPlan(
    {
      shots: [
        shot({
          on: 'In 1961',
          set: { kind: 'map', tilt: 'flat' },
          info: [
            { recipe: 'pin', target: 'place:Berlin', on: 'Berlin' },
            { recipe: 'seam', target: 'seam:inner border', on: 'cut in two' },
          ],
          camera: [
            { move: 'establish', on: 'In 1961' },
            {
              move: 'push',
              target: 'place:Berlin',
              on: 'Berlin',
              amount: 'small',
            },
          ],
          life: ['cloud-shadows'],
          focal: 'place:Berlin',
        }),
        shot({
          on: 'The inner border',
          set: {
            kind: 'chart',
            chart: {
              kind: 'counter',
              spec: {
                value: 1393,
                unit: 'km',
                prefix: null,
                label: 'inner border',
                then: null,
              },
            },
          },
          info: [
            {
              recipe: 'count',
              target: 'number:Length of the inner border',
              on: '1,393 kilometres',
              value: 1393,
              unit: 'km',
            },
          ],
          focal: WHOLE_SET,
        }),
        shot({
          on: 'In 1987',
          set: {
            kind: 'chart',
            chart: {
              kind: 'quote',
              spec: {
                text: 'Mr. Gorbachev, tear down this wall!',
                speaker: 'Ronald Reagan',
                when: '12 June 1987',
              },
            },
          },
          info: [{ recipe: 'mark', target: 'part:speaker', on: 'Reagan' }],
          camera: [
            { move: 'push', on: 'Tear down this wall', amount: 'small' },
          ],
          life: ['grain'],
          focal: WHOLE_SET,
        }),
      ],
    },
    narration,
    registry,
    { map: true },
  );

const fix = (
  kind: CriticFix['kind'],
  shotNo: number,
  more: Partial<CriticFix> = {},
): CriticFix => ({ kind, shot: shotNo, note: 'the critic says so', ...more });

const run = (fixes: CriticFix[], more: Partial<FixContext> = {}) =>
  applyFixes(plan(), fixes, { ...ctx, ...more });

describe("the critic's fixes made into plan edits (applyFixes)", () => {
  it('starts from a plan the rules pass', () => {
    expect(checkPlan(plan(), narration, registry, { map: true })).toEqual([]);
  });

  it('enlarge: pushes in on the subject, harder where it already pushed', async () => {
    const out = await run([fix('enlarge', 1)]);
    expect(out.applied[0].outcome).toBe('applied');
    expect(out.plan.shots[0].camera).toContainEqual(
      expect.objectContaining({
        move: 'push',
        target: 'place:Berlin',
        amount: 'medium',
      }),
    );
    // A whole chart: the whole picture closer.
    const whole = await run([fix('enlarge', 2)]);
    expect(whole.plan.shots[1].camera).toContainEqual(
      expect.objectContaining({ move: 'push', amount: 'medium' }),
    );
  });

  it('enlarge and reframe: what comes on later in the shot is pushed in on or cut to as it comes, never framed before', async () => {
    // The seam is drawn on "cut in two", after the shot's first words.
    const big = await run([fix('enlarge', 1, { target: 'seam:inner border' })]);
    expect(big.plan.shots[0].focal).toBe('place:Berlin');
    expect(big.plan.shots[0].camera).toContainEqual(
      expect.objectContaining({
        move: 'push',
        target: 'seam:inner border',
        on: 'cut in two',
      }),
    );
    const framed = await run([
      fix('reframe', 1, { target: 'seam:inner border' }),
    ]);
    expect(framed.plan.shots[0].focal).toBe('place:Berlin');
    expect(framed.plan.shots[0].camera).toContainEqual(
      expect.objectContaining({
        move: 'cut-to',
        target: 'seam:inner border',
        on: 'cut in two',
      }),
    );
  });

  it('reframe: frames the target named, dropping moves that frame another', async () => {
    // Berlin is pinned on its own name, the shot's third word: there from
    // the start. A move that frames something else goes.
    const elsewhere = plan();
    elsewhere.shots[0].focal = 'seam:inner border';
    elsewhere.shots[0].camera[1].target = 'seam:inner border';
    const out = await applyFixes(
      elsewhere,
      [fix('reframe', 1, { target: 'place:Berlin' })],
      ctx,
    );
    expect(out.plan.shots[0].focal).toBe('place:Berlin');
    expect(
      out.plan.shots[0].camera.some((c) => c.target === 'seam:inner border'),
    ).toBe(false);
    // No target: the whole set.
    const whole = await run([fix('reframe', 1)]);
    expect(whole.plan.shots[0].focal).toBe(WHOLE_SET);
    expect(whole.plan.shots[0].camera.some((c) => c.move === 'push')).toBe(
      false,
    );
  });

  it('change-set: asks the board for that shot alone, with the note, and takes its shots for those words', async () => {
    const asks: BoardAsk[] = [];
    const board = (ask: BoardAsk) => {
      asks.push(ask);
      return Promise.resolve<ShotPlan>({
        shots: [
          // A shot for other words is not taken.
          shot({ on: 'In 1987', set: { kind: 'map', tilt: 'flat' } }),
          shot({
            on: 'ran for 1,393',
            set: { kind: 'map', tilt: 'flat' },
            info: [
              {
                recipe: 'seam',
                target: 'seam:inner border',
                on: '1,393 kilometres',
              },
            ],
            focal: 'seam:inner border',
          }),
        ],
      });
    };
    const out = await run(
      [fix('change-set', 2, { to: 'map', note: 'show the border itself' })],
      { board },
    );
    expect(asks).toEqual([
      expect.objectContaining({
        shot: 2,
        from: 'The inner border',
        set: 'map',
        note: 'show the border itself',
      }),
    ]);
    expect(asks[0].words).toBe('The inner border ran for 1,393 kilometres');
    expect(out.boardCalls).toBe(1);
    expect(out.applied[0].outcome).toBe('boarded');
    // The board's map shot, on the shot's own first words: the counter is gone.
    expect(out.plan.shots.map((s) => s.set.kind)).toEqual(['map', 'chart']);
    expect(
      out.plan.shots[0].info.some((i) => i.target === 'seam:inner border'),
    ).toBe(true);
  });

  it('change-set: with no board, or no answer, the shot becomes its safe shot', async () => {
    const out = await run([fix('change-set', 3, { to: 'split' })], {
      board: () => Promise.resolve(null),
    });
    expect(out.applied[0].outcome).toBe('fell-back');
    expect(out.boardCalls).toBe(1);
    // Never a card of words: the line's safe shot (here the shot before carried on).
    expect(out.plan.shots.every((s) => s.set.kind !== 'plain')).toBe(true);
  });

  it('split: the later part asked of the board from the words named', async () => {
    const asks: BoardAsk[] = [];
    // Two shots, so a third has room under the rules' eight a minute.
    const two = mendPlan(
      { shots: plan().shots.slice(0, 2) },
      narration,
      registry,
      { map: true },
    );
    const out = await applyFixes(two, [fix('split', 1, { to: 'cut in two' })], {
      ...ctx,
      board: (ask) => {
        asks.push(ask);
        return Promise.resolve<ShotPlan>({
          shots: [
            shot({
              on: 'cut in two',
              set: {
                kind: 'chart',
                chart: {
                  kind: 'split',
                  spec: CHART_SPECS.split.before.split as Record<
                    string,
                    unknown
                  >,
                },
              },
              focal: WHOLE_SET,
            }),
          ],
        });
      },
    });
    expect(asks[0]).toEqual(
      expect.objectContaining({
        from: 'cut in two',
        words: 'cut in two overnight',
      }),
    );
    expect(out.applied[0].outcome).toBe('boarded');
    // The map up to the words, then the board's new picture from them.
    expect(out.plan.shots.map((s) => s.set.kind)).toEqual([
      'map',
      'chart',
      'chart',
    ]);
    expect(out.plan.shots[1].on).toBe('cut in two');
    // With no room for another shot, the camera moves at the words instead.
    const full = await run([fix('split', 1, { to: 'cut in two' })], {
      board: () =>
        Promise.resolve<ShotPlan>({
          shots: [
            shot({
              on: 'cut in two',
              set: {
                kind: 'chart',
                chart: {
                  kind: 'split',
                  spec: CHART_SPECS.split.before.split as Record<
                    string,
                    unknown
                  >,
                },
              },
              focal: WHOLE_SET,
            }),
          ],
        }),
    });
    expect(full.applied[0].outcome).toBe('fell-back');
    expect(full.plan.shots).toHaveLength(3);
  });

  it('split: with no board, something new where it splits: the camera moving there', async () => {
    const out = await run([fix('split', 1, { to: 'overnight' })]);
    expect(out.applied[0].outcome).toBe('fell-back');
    expect(out.plan.shots[0].camera).toContainEqual(
      expect.objectContaining({ on: 'overnight' }),
    );
  });

  it('merge: the next shot folded into this one, the next shot gone', async () => {
    const out = await run([fix('merge', 2)]);
    expect(out.plan.shots).toHaveLength(2);
    expect(out.plan.shots[1].camera).toContainEqual(
      expect.objectContaining({ on: 'Tear down this wall' }),
    );
    // A later fix on the shot merged away is skipped, not applied elsewhere.
    const both = await run([fix('merge', 1), fix('enlarge', 2)]);
    expect(both.applied.map((a) => a.outcome)).toEqual(['applied', 'skipped']);
  });

  it('move-event: an item onto other words in its shot, or onto its nearest words when they are in another set', async () => {
    const out = await run([
      fix('move-event', 1, { target: 'pin Berlin', to: 'overnight' }),
    ]);
    expect(out.plan.shots[0].info).toContainEqual(
      expect.objectContaining({ recipe: 'pin', on: 'overnight' }),
    );
    const late = await run([
      fix('move-event', 1, { target: 'seam', to: 'inner border ran' }),
    ]);
    // Not dropped into the counter, which cannot show a seam: its own shot's last words.
    expect(late.plan.shots[0].info).toContainEqual(
      expect.objectContaining({ recipe: 'seam', on: 'two overnight' }),
    );
  });

  it('lengthen-hold: an item that leaves early kept up; with none, a hold', async () => {
    const leaving = plan();
    leaving.shots[0].info[0].until = 'cut in two';
    const out = await applyFixes(
      leaving,
      [fix('lengthen-hold', 1, { target: 'place:Berlin' })],
      ctx,
    );
    expect(out.plan.shots[0].info[0].until).toBeUndefined();
    const held = await run([fix('lengthen-hold', 3)]);
    expect(held.plan.shots[2].camera).toContainEqual(
      expect.objectContaining({ move: 'hold' }),
    );
  });

  it('add-camera: the move named, on the middle of the shot’s words, within its limit', async () => {
    const out = await run([fix('add-camera', 2, { to: 'push in' })]);
    expect(out.plan.shots[1].camera).toEqual([
      expect.objectContaining({ move: 'push', amount: 'small' }),
    ]);
    // A shot at its limit gives up its opening establish first.
    const full = await run([fix('add-camera', 1, { to: 'pull' })]);
    expect(full.plan.shots[0].camera.map((c) => c.move)).toEqual([
      'push',
      'pull',
    ]);
  });

  it('swap-recipe: the item’s recipe changed; one its target cannot take is undone, never dropped', async () => {
    const out = await run([
      fix('swap-recipe', 1, { target: 'pin', to: 'mark' }),
    ]);
    expect(out.plan.shots[0].info[0].recipe).toBe('mark');
    const wrong = await run([
      fix('swap-recipe', 1, { target: 'seam', to: 'count' }),
    ]);
    expect(wrong.applied[0].outcome).toBe('no-effect');
    expect(wrong.plan.shots[0].info.map((i) => i.recipe)).toEqual([
      'pin',
      'seam',
    ]);
  });

  it('remove-clutter: the thing named; with none, the least needed', async () => {
    const out = await run([
      fix('remove-clutter', 1, { target: 'cloud-shadows' }),
    ]);
    expect(out.plan.shots[0].life).toEqual([]);
    const busy = plan();
    busy.shots[0].info.push(
      { recipe: 'label', target: 'place:Berlin', on: 'Berlin' },
      { recipe: 'mark', target: 'place:Berlin', on: 'overnight' },
    );
    const fewer = await applyFixes(busy, [fix('remove-clutter', 1)], ctx);
    expect(fewer.plan.shots[0].info.length).toBeLessThanOrEqual(3);
  });

  it('safe-shot: the shot replaced by its line’s safe shot, never words', async () => {
    const out = await run([fix('safe-shot', 3)]);
    expect(out.applied[0].outcome).toBe('applied');
    expect(
      out.plan.shots.some(
        (s) => s.set.kind === 'chart' && s.set.chart.kind === 'quote',
      ),
    ).toBe(false);
  });

  it('a fix that changes nothing is said to', async () => {
    const out = await run([fix('remove-clutter', 1)]);
    expect(out.applied[0].outcome).toBe('no-effect');
  });

  it('always hands back a plan the rules pass', async () => {
    const out = await run([
      fix('merge', 1),
      fix('swap-recipe', 3, { target: 'mark', to: 'spotlight' }),
      fix('add-camera', 3, { to: 'travel', target: 'nowhere' }),
    ]);
    expect(out.problems).toEqual([]);
    expect(checkPlan(out.plan, narration, registry, { map: true })).toEqual([]);
  });
});
