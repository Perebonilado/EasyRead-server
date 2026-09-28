import type { SceneDto } from '../../../contracts';
import { doingsIn } from '../scene-directions';
import {
  DOINGS,
  MOVE_PHASES,
  doingOf,
  moveIdealMs,
  moveLeastMs,
  movePhasesMs,
  type ActionMove,
} from '../scene-doings';
import { bibleOf, storySheetOf } from './studio';
import { auditMoves, describeMoves } from './studio-audit';
import { mendSheet, withFound } from './studio-check';
import { stageStory } from './studio-stage';
import { voiced } from './__fixtures__/voiced';

/**
 * The action moves (studio-world-plan §4.5): read from the words, mended,
 * staged (a leap onto a wall carries whoever makes it up onto its perch),
 * and audited as the film plays them.
 */

const bible = bibleOf({
  characters: [
    { name: 'Maya', kind: 'person', voice: 'girl', figure: { age: 'child' } },
    { name: 'Tobi', kind: 'person', voice: 'boy', figure: { age: 'child' } },
  ],
  sets: [
    {
      id: 'yard',
      name: 'the yard',
      kind: 'outdoor',
      features: [
        { id: 'wall', name: 'wall', kind: 'wall', spot: 'right' },
        { id: 'gate', name: 'gate', kind: 'gate', spot: 'left' },
      ],
    },
  ],
});

const sheetOf = (beats: Record<string, unknown>[]) =>
  storySheetOf({
    title: 'Over the wall',
    set: 'yard',
    onStage: [
      { who: 'maya', spot: 'centre-left' },
      { who: 'tobi', spot: 'left' },
    ],
    beats,
  });

const read = (who: string, words: string) =>
  doingsIn(words, {
    actors: [
      { id: 'maya', names: ['Maya'], gender: 'f' },
      { id: 'tobi', names: ['Tobi'], gender: 'm' },
    ],
    who,
  }).map((r) => `${r.do}${r.target ? ` >${r.target}` : ''}`);

describe('the action moves, in words', () => {
  it('reads each from the words that say it', () => {
    expect(read('maya', 'Maya springs onto the wall.')).toEqual(['leap >wall']);
    expect(read('maya', 'Maya leaps.')).toEqual(['leap']);
    expect(read('maya', 'Maya ducks.')).toEqual(['dodge']);
    expect(read('maya', 'Maya dodges the ball.')).toEqual(['dodge >ball']);
    expect(read('maya', 'Maya throws a punch at Tobi.')).toEqual([
      'punch >tobi',
    ]);
    expect(read('maya', 'Maya strikes a pose.')).toEqual(['hero']);
    expect(read('tobi', 'Tobi falls hard.')).toEqual(['fall-hard']);
    expect(read('maya', 'Maya jumps down off the wall.')).toEqual([
      'land >wall',
    ]);
    expect(read('maya', 'Maya runs as fast as she can to the gate.')).toEqual([
      'run-fast >gate',
    ]);
    // Everyday moves stay as they were.
    expect(read('maya', 'Maya jumps up and down for joy.')).toEqual(['hop']);
    expect(read('maya', 'Maya jumps over the fence.')).toEqual(['jump >fence']);
    expect(read('maya', 'Maya falls over.')).toEqual(['fall']);
    expect(read('maya', 'Maya gets up.')).toEqual(['stand-up']);
  });

  it('gives each its clip’s time: its least all its phases’ least, all it wants their ideal, its moment where its act ends', () => {
    for (const move of Object.keys(MOVE_PHASES) as ActionMove[]) {
      const doing = doingOf(move)!;
      expect(doing).toBeDefined();
      expect(doing.leastMs).toBe(moveLeastMs(move));
      if (move !== 'jump') expect(doing.idealMs).toBe(moveIdealMs(move));
      expect(doing.phases).toBeDefined();
      expect(doing.keyAt).toBeCloseTo(
        doing.phases!.windUp + doing.phases!.act,
        9,
      );
      expect(doing.fallback).not.toBeNull();
    }
    // Every doing's words are its own: no two doings are the same words.
    expect(new Set(DOINGS.map((d) => d.words.source)).size).toBe(DOINGS.length);
  });
});

describe('a leap onto the wall, mended, staged and audited', () => {
  const sheet = sheetOf([
    { kind: 'line', who: 'maya', say: 'Watch this, Tobi!' },
    // The writer picked a jump; the words say a leap at the wall.
    {
      kind: 'action',
      who: 'maya',
      do: 'jump',
      say: 'Maya springs onto the wall.',
    },
    { kind: 'line', who: 'tobi', say: 'Wow! You made it!' },
  ]);
  const mended = mendSheet(sheet, bible);
  const grown = withFound(bible, 'yard', mended);
  const script = stageStory(mended.sheet, grown);

  it('mends the words into a leap at the wall', () => {
    const beat = mended.sheet.beats.find((b) => b.kind === 'action')!;
    expect(beat).toMatchObject({ who: 'maya', do: 'leap', target: 'wall' });
    expect(mended.mended.join('\n')).toMatch(/is a leap, not a jump/);
  });

  it('carries her up onto its perch as the leap begins: the "up:wall" station and the move at once', () => {
    const effects = script.steps.flatMap((s) => s.effects);
    expect(effects).toContainEqual(
      expect.objectContaining({ target: 'maya', do: 'leap', part: 'f:wall' }),
    );
    const step = script.steps.find((s) =>
      s.effects.some((e) => e.do === 'leap'),
    )!;
    expect(step.stage?.at?.maya).toBe('up:wall');
  });

  it('plays in the film on the perch, landed to the unit, with nothing for the audit', () => {
    const { scene } = voiced(script);
    const wall = scene.setting?.features?.find((f) => f.id === 'wall');
    expect(wall?.perch?.wide).toBeDefined();
    const [at, move, , toward] = scene.acting!.maya.moves!.find(
      ([, m]) => m === 'leap',
    )!;
    expect([move, toward]).toEqual(['leap', 'f:wall']);
    const k = scene.steps.findIndex((s) => Math.abs(s.atMs - at) <= 250);
    expect(k).toBeGreaterThan(0);
    const up = scene.stagings.wide.places[k].maya;
    expect(Math.abs(up.y + up.h - wall!.perch!.wide.y)).toBeLessThanOrEqual(1);
    expect(describeMoves(auditMoves(scene))).toEqual([]);
  });
});

describe('getting up after a hard fall', () => {
  it('is up off the ground, as the get-up move does it', () => {
    const sheet = sheetOf([
      { kind: 'action', who: 'tobi', do: 'fall', say: 'Tobi falls hard.' },
      { kind: 'line', who: 'tobi', say: 'Ow!' },
      { kind: 'action', who: 'tobi', do: 'stand-up', say: 'Tobi gets up.' },
    ]);
    const mended = mendSheet(sheet, bible);
    expect(
      mended.sheet.beats.filter((b) => b.kind === 'action').map((b) => b.do),
    ).toEqual(['fall-hard', 'get-up']);
    const script = stageStory(mended.sheet, withFound(bible, 'yard', mended));
    const moves = script.steps
      .flatMap((s) => s.effects)
      .filter((e) => e.target === 'tobi')
      .map((e) => e.do);
    expect(moves).toEqual(expect.arrayContaining(['fall-hard', 'get-up']));
  });

  it('gets up first, off the ground, when they go anywhere still down', () => {
    const sheet = sheetOf([
      { kind: 'action', who: 'tobi', do: 'fall', say: 'Tobi falls hard.' },
      { kind: 'line', who: 'tobi', say: 'Ow!' },
      {
        kind: 'action',
        who: 'tobi',
        do: 'walk',
        target: 'gate',
        say: 'Tobi walks over to the gate.',
      },
    ]);
    const mended = mendSheet(sheet, bible);
    const script = stageStory(mended.sheet, withFound(bible, 'yard', mended));
    const moves = script.steps
      .flatMap((s) => s.effects)
      .filter((e) => e.target === 'tobi')
      .map((e) => e.do);
    expect(moves).toContain('get-up');
    expect(moves).not.toContain('stand');
  });
});

describe('the move audit', () => {
  const W = 1600;
  const H = 900;
  const box = (x: number, feet = 800, h = 400) => ({
    x,
    y: feet - h,
    w: 270,
    h,
  });
  const person = (id: string) => ({
    id,
    kind: 'drawing' as const,
    svg: '<svg viewBox="-80 -224 160 234"/>',
    aspect: 160 / 234,
    caption: null,
    parts: {},
    labels: {},
    states: {},
    hidden: [],
    moves: true,
    rig: true as const,
  });
  const wall = {
    id: 'wall',
    name: 'wall',
    kind: 'wall',
    at: {
      wide: { x: 1000, y: 600, w: 420, h: 200 },
      box: { x: 1000, y: 600, w: 420, h: 200 },
    },
    way: { wide: { x: 1210, y: 800, k: 1 }, box: { x: 1210, y: 800, k: 1 } },
    perch: { wide: { x: 1260, y: 610 }, box: { x: 1260, y: 610 } },
  };
  const sceneOf = (
    moves: SceneDto['acting'],
    places: Record<string, { x: number; y: number; w: number; h: number }>[] = [
      { maya: box(300), tobi: box(700) },
    ],
    stepsAt: number[] = [0],
  ): SceneDto =>
    ({
      version: 4,
      title: 'a scuffle',
      durationMs: 9000,
      timing: 'voice',
      beats: [],
      things: [person('maya'), person('tobi')],
      steps: stepsAt.map((atMs) => ({
        atMs,
        layout: 'row',
        show: ['maya', 'tobi'],
        arrows: [],
        enter: {},
        focus: null,
      })),
      effects: [],
      acting: moves,
      setting: { film: true, features: [wall] },
      stagings: {
        wide: { w: W, h: H, places },
        box: { w: W, h: H, places },
      },
    }) as unknown as SceneDto;
  const ids = (scene: SceneDto) => auditMoves(scene).map((f) => f.id);

  it('passes a move given its time, on its own', () => {
    expect(ids(sceneOf({ maya: { moves: [[1000, 'hero', 1600]] } }))).toEqual(
      [],
    );
  });

  it('catches a squeezed move: given too little, or cut short by the next', () => {
    const squeezed = auditMoves(
      sceneOf({ maya: { moves: [[1000, 'hero', 600]] } }),
    );
    expect(squeezed.map((f) => f.id)).toContain('squeezed');
    expect(squeezed[0].why).toMatch(/plays \d+ ms of its least \d+/);
    // Cut short: the next move of hers 500 ms in.
    expect(
      ids(
        sceneOf({
          maya: {
            moves: [
              [1000, 'punch', 1000, 'tobi'],
              [1500, 'nod', 600],
            ],
          },
        }),
      ),
    ).toContain('squeezed');
    // Its phases, as the player shares them: each at least its least.
    const played = movePhasesMs('leap', moveLeastMs('leap'));
    for (const [phase, [least]] of Object.entries(MOVE_PHASES.leap))
      expect(played[phase as keyof typeof played]).toBeGreaterThanOrEqual(
        least - 1e-9,
      );
  });

  it('catches a leap at the wall that never lands on its perch, and one that does', () => {
    // Her place never changes: the leap goes nowhere.
    expect(
      ids(sceneOf({ maya: { moves: [[1000, 'leap', 1600, 'f:wall']] } })),
    ).toContain('not-landed');
    // Carried up onto it at the leap: on the perch.
    const onIt = { ...box(0, 610), x: 1260 - 270 * 0.3 - 135 };
    expect(
      ids(
        sceneOf(
          { maya: { moves: [[1000, 'leap', 1600, 'f:wall']] } },
          [
            { maya: box(300), tobi: box(700) },
            { maya: onIt, tobi: box(700) },
          ],
          [0, 1000],
        ),
      ),
    ).toEqual([]);
  });

  it('catches someone run through, or landed in, and a punch near enough to touch', () => {
    expect(
      ids(
        sceneOf(
          { maya: { moves: [[1000, 'run-fast', 1600, 'gate']] } },
          [
            { maya: box(300), tobi: box(700) },
            { maya: box(1100), tobi: box(700) },
          ],
          [0, 1000],
        ),
      ),
    ).toContain('passes-through');
    expect(
      ids(
        sceneOf(
          { maya: { moves: [[1000, 'leap', 1600, 'tobi']] } },
          [
            { maya: box(300), tobi: box(700) },
            { maya: box(720), tobi: box(700) },
          ],
          [0, 1000],
        ),
      ),
    ).toContain('passes-through');
    expect(
      ids(
        sceneOf({ maya: { moves: [[1000, 'punch', 1000, 'tobi']] } }, [
          { maya: box(300), tobi: box(450) },
        ]),
      ),
    ).toContain('passes-through');
  });

  it('warns of more than two big moves in a scene', () => {
    const faults = auditMoves(
      sceneOf({
        maya: {
          moves: [
            [1000, 'hero', 1600],
            [4000, 'dodge', 1100],
          ],
        },
        tobi: { moves: [[6000, 'hero', 1600]] },
      }),
    );
    expect(faults.map((f) => f.id)).toEqual(['too-many']);
    expect(faults[0].why).toMatch(/3 big moves/);
  });
});
