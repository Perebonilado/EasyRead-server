/**
 * The shot grammar on today's sets (studio-views-plan V2): which shot code
 * picks for each line, over-the-shoulder framing that keeps the speaker's
 * face clear and crops the listener at the frame's edge, deep staging,
 * the crowd's own shot, low and high angles, views that match the shot,
 * the 180° rule, and stills that show the view and the cheat.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  SceneDto,
  SceneEffectDto,
  ScenePlaceDto,
  SceneThingDto,
} from '../../contracts';
import {
  CONVERSATION_LINES,
  grammarCamera,
  keepTheLine,
  lineCrossings,
  screenDirection,
  type GrammarInput,
  type GrammarLine,
} from './scene-shots';
import {
  NEAR_D,
  angleLayer,
  anglePeople,
  crowdView,
  deepView,
  lowView,
  nearOf,
  otsView,
  shotsApart,
  viewOf,
} from './scene-film';
import {
  covered,
  faceOf,
  fitCheatsToShots,
  onScreen,
} from './scene-faces-seen';
import { audienceOutOfShots } from './scene-set-audience';
import { OTS_YAW, shotFacing, viewAt, viewsOf } from './scene-views';
import { stillPlan, viewInStill } from './scene-still';
import {
  claimsText,
  pictureClaims,
  pictureMoments,
} from './scene-picture-check';
import { PLAIN_FIGURE, drawFigure } from './scene-figure';
import { VIEW_RIG } from './scene-figure-views';
import { thingDto } from './scene-compose';
import { bibleOf, storySheetOf } from './studio/studio';
import { mendSheet, repairSheet, withFeatures } from './studio/studio-check';
import { stageStory } from './studio/studio-stage';
import { voiced } from './studio/__fixtures__/voiced';

const W = 1600;
const H = 900;

// ── Code picks the shots (§3.2) ────────────────────────────────────────────

const A = { x: 500, y: 320, w: 190, h: 400, d: 0.5 };
const B = { x: 900, y: 300, w: 200, h: 420, d: 0.45 };
const C = { x: 120, y: 360, w: 170, h: 380, d: 0.8 };
const PLACES: Record<string, ScenePlaceDto> = { a: A, b: B, c: C };

/** Lines one after another, 3 s each, by whoever says them. */
const linesOf = (
  who: readonly string[],
  patch: Partial<GrammarLine>[] = [],
): GrammarLine[] =>
  who.map((speaker, i) => ({
    beat: i,
    speaker,
    to: null,
    startMs: 500 + i * 3000,
    endMs: 3000 + i * 3000,
    strong: false,
    sad: false,
    toCrowd: false,
    ...patch[i],
  }));

const grammar = (
  lines: GrammarLine[],
  patch: Partial<GrammarInput> = {},
): ReturnType<typeof grammarCamera> =>
  grammarCamera({
    lines,
    onAt: () => ['a', 'b', 'c'],
    placeAt: (id) => PLACES[id] ?? null,
    standing: () => true,
    small: () => false,
    addressed: false,
    heroes: [],
    W,
    asked: [],
    ...patch,
  });

describe('the shots code picks', () => {
  it('opens on the master, then cuts over the shoulder of whoever listens onto whoever speaks, line by line', () => {
    const camera = grammar(linesOf(['a', 'b', 'a', 'b', 'a']));
    // Nothing on the first line: the whole stage.
    expect(camera.find((one) => one.beat === 0)).toBeUndefined();
    expect(
      camera
        .filter((one) => one.shot === 'ots')
        .map((one) => [one.on, one.with]),
    ).toEqual([
      ['b', 'a'],
      ['a', 'b'],
      ['b', 'a'],
      ['a', 'b'],
    ]);
  });

  it('opens a conversation after the first line on the two face to face in profile, and breathes on it in a long one', () => {
    const lines = linesOf(['c', 'a', 'b', 'a', 'b', 'a', 'b', 'a']);
    // A narration between the first line and the rest: two runs.
    for (const line of lines.slice(1)) line.beat += 1;
    const camera = grammar(lines);
    expect(camera.find((one) => one.beat === 2)).toMatchObject({
      shot: 'profile',
      on: 'a',
      with: 'b',
    });
    // Seven lines between the two: the fourth is the profile two-shot again.
    expect(camera.find((one) => one.beat === 5)).toMatchObject({
      shot: 'profile',
    });
    expect(camera.filter((one) => one.shot === 'ots').length).toBe(5);
  });

  it('does not cut up an exchange of three lines or fewer', () => {
    expect(CONVERSATION_LINES).toBe(3);
    const camera = grammar(
      linesOf(['c', 'a', 'b', 'a']).map((l, i) => ({ ...l, beat: i * 2 })),
    );
    expect(camera.filter((one) => one.shot !== 'wide')).toEqual([]);
    const three = grammar(
      linesOf(['c', 'a', 'b', 'a']).map((l, i) =>
        i === 0 ? { ...l, beat: -5 } : l,
      ),
    );
    expect(three.filter((one) => one.shot === 'ots')).toEqual([]);
  });

  it('closes on a strong line, from high on someone sad or small', () => {
    const camera = grammar(
      linesOf(['a', 'b', 'a', 'b', 'a'], [{}, {}, { strong: true, sad: true }]),
    );
    expect(camera.find((one) => one.beat === 2)).toEqual({
      beat: 2,
      shot: 'close',
      on: 'a',
      with: null,
      angle: 'high',
    });
    const alone = grammar(
      linesOf(['c', 'a'], [{}, { strong: true }]).map((l, i) => ({
        ...l,
        beat: i * 2,
      })),
    );
    expect(alone.find((one) => one.beat === 2)).toMatchObject({
      shot: 'close',
      on: 'a',
    });
    expect(alone.find((one) => one.beat === 2)?.angle).toBeUndefined();
  });

  it('stages deep a third who speaks into a conversation on their feet, and not one sat down', () => {
    const lines = linesOf(['a', 'b', 'a', 'c', 'b', 'a']);
    expect(grammar(lines).find((one) => one.beat === 3)).toMatchObject({
      shot: 'deep',
      on: 'c',
    });
    const sat = grammar(lines, { standing: (id) => id !== 'c' });
    expect(sat.find((one) => one.beat === 3)?.shot ?? 'wide').toBe('wide');
  });

  it('looks over the crowd onto one who speaks to them, only in a scene about them', () => {
    const lines = linesOf(['a', 'a', 'b'], [{}, { toCrowd: true }]);
    expect(
      grammar(lines, { addressed: true }).find((one) => one.beat === 1),
    ).toMatchObject({ shot: 'crowd', on: 'a' });
    expect(grammar(lines).find((one) => one.beat === 1)?.shot ?? 'wide').toBe(
      'wide',
    );
  });

  it('sees a hero from low from their pose, and the whole stage once it is struck', () => {
    const camera = grammar(linesOf(['a', 'b']), {
      heroes: [{ who: 'c', atMs: 7000, ms: 1500 }],
    });
    expect(camera.filter((one) => one.atMs !== undefined)).toEqual([
      { beat: -1, shot: 'low', on: 'c', with: null, atMs: 7000 },
      { beat: -1, shot: 'wide', on: null, with: null, atMs: 8500 },
    ]);
  });

  it("keeps the writer's asks on their lines, and goes back to the whole stage after code's own", () => {
    const lines = linesOf(['a', 'b', 'a', 'b', 'a', 'c']);
    // c's line after a narration: no conversation of theirs.
    lines[5].beat = 6;
    const camera = grammar(lines, {
      asked: [{ beat: 3, shot: 'close', on: 'b', with: null }],
    });
    expect(camera.filter((one) => one.beat === 3)).toEqual([
      { beat: 3, shot: 'close', on: 'b', with: null },
    ]);
    // c's line after the conversation: the whole stage again.
    expect(camera.find((one) => one.beat === 6)).toMatchObject({
      shot: 'wide',
    });
  });
});

// ── Framing (§3.1), as the player frames it (shots.ts keeps the same numbers) ──

const ots = (target: string, part: string): SceneEffectDto => ({
  atMs: 1000,
  untilMs: 4000,
  target,
  part,
  do: 'zoom',
  shot: { enter: 'cut', kind: 'ots' },
});

describe('over the shoulder', () => {
  const view = otsView(B, A, W, H);
  const near = nearOf(ots('b', 'a'), ['a', 'b', 'c'], PLACES, W, H)!;

  it('frames the one speaking from the chest up, off the middle away from the one listening', () => {
    expect(view).toEqual({
      s: 2.1428571428571432,
      x: 880.5333333333333,
      y: 426,
    });
    const face = onScreen(faceOf(B), view, 1, W, H);
    expect(face.x + face.w / 2).toBeGreaterThan(W / 2);
  });

  it('crops the one listening at the frame’s edge, big, before the floor, and a little soft', () => {
    expect(near).toEqual({
      id: 'a',
      place: { x: 422.3, y: 258, w: 259.3, h: 546, d: NEAR_D },
      view,
      soft: true,
    });
    expect(NEAR_D).toBeGreaterThan(1);
    const box = onScreen(near.place, view, 1, W, H);
    expect(box.x).toBeLessThan(0);
    expect(box.x + box.w).toBeGreaterThan(0);
    expect(box.y + box.h).toBeGreaterThan(H);
    expect(box.h).toBeGreaterThan(H);
  });

  it("never covers the speaker's face, however near the two stand", () => {
    for (const gap of [40, 120, 260, 500]) {
      const a = { ...A, x: B.x - gap - A.w };
      const shot = nearOf(ots('b', 'a'), ['a', 'b'], { a, b: B }, W, H)!;
      const seen = otsView(B, a, W, H);
      const body = onScreen(
        {
          x: shot.place.x + shot.place.w * 0.15,
          y: shot.place.y,
          w: shot.place.w * 0.7,
          h: shot.place.h,
        },
        seen,
        1,
        W,
        H,
      );
      expect(covered(onScreen(faceOf(B), seen, 1, W, H), [body])).toBe(0);
    }
  });

  it('is always a cut from one shoulder to the other, however near the two views are', () => {
    const one = ots('b', 'a');
    const other = ots('a', 'b');
    const same = { s: 1.5, x: 800, y: 450 };
    expect(shotsApart(one, other, same, same, W, H)).toBe(true);
    expect(shotsApart(one, { ...one }, same, same, W, H)).toBe(false);
  });
});

describe('deep staging, over the crowd, and from low', () => {
  it('stands the one near big and partly off the frame, the others framed on its far side', () => {
    const deep = deepView('c', ['a', 'b', 'c'], PLACES, W, H)!;
    expect(deep).toEqual({ view: { s: 1.25, x: 640, y: 460 }, side: -1 });
    const near = nearOf(
      { target: 'c', part: null, shot: { enter: 'cut', kind: 'deep' } },
      ['a', 'b', 'c'],
      PLACES,
      W,
      H,
    )!;
    expect(near.place).toEqual({ x: -25, y: 172, w: 306, h: 684, d: NEAR_D });
    expect(near.soft).toBe(false);
    const box = onScreen(near.place, deep.view, 1, W, H);
    expect(box.x).toBeLessThan(0);
    for (const other of [A, B])
      expect(
        covered(onScreen(faceOf(other), deep.view, 1, W, H), [box]),
      ).toBeLessThan(0.05);
  });

  it('looks over the crowd with the one speaking high in the frame, and from low takes a hero whole', () => {
    expect(crowdView(B, W, H)).toEqual({
      s: 1.35,
      x: 1000,
      y: 446.66666666666663,
    });
    expect(lowView(B, W, H)).toEqual({ s: 1.6, x: 1000, y: 501.6 });
    const low = {
      target: 'b',
      part: null,
      shot: { enter: 'cut' as const, angle: 'low' as const },
    };
    expect(viewOf(low, ['b'], PLACES, W, H)).toEqual(lowView(B, W, H));
  });

  it('cheats a low or high angle on a flat set: the far layers tilt, the floor and people do not, the people a little larger or smaller', () => {
    expect(angleLayer('low', 0.03)).toEqual({ k: 1.154, pivot: 0 });
    expect(angleLayer('high', 0.45)).toEqual({ k: 1.07, pivot: 1 });
    expect(angleLayer('low', 0.9)).toEqual({ k: 1, pivot: 0 });
    expect(anglePeople('low')).toBeCloseTo(1.06);
    expect(anglePeople('high')).toBeCloseTo(0.94);
    expect(anglePeople(undefined)).toBe(1);
  });
});

// ── The crowd's own shot ──────────────────────────────────────────────────

describe('over the crowd, the people watching are the shot’s own', () => {
  const crowd: SceneEffectDto = {
    atMs: 2000,
    untilMs: 5000,
    target: 'a',
    part: null,
    do: 'zoom',
    shot: { enter: 'cut', kind: 'crowd' },
  };
  const close: SceneEffectDto = {
    ...crowd,
    atMs: 5000,
    untilMs: 8000,
    shot: { enter: 'cut' },
  };

  it('is left out when they are eased out of the shots', () => {
    expect(
      audienceOutOfShots(['fg-au-1'], [crowd, close], [{ atMs: 0 }], 9000),
    ).toEqual([[5000, 8000, 'fg-au-1', 0]]);
  });

  it('keeps them when what is cheated out of a shot is fitted to the shots taken', () => {
    const fitted = fitCheatsToShots(
      [
        [2000, 8000, 'fg-au-1', 0],
        [2000, 8000, 'crate', 0],
      ],
      [crowd, close],
      [{ atMs: 0 }],
      9000,
      (id, shot) => id.startsWith('fg-au') && shot.shot?.kind === 'crowd',
    );
    expect(fitted).toEqual([
      [5000, 8000, 'fg-au-1', 0],
      [2000, 8000, 'crate', 0],
    ]);
  });
});

// ── Views that match the shot, and the 180° rule (§3.3) ──────────────────────

const person = (id: string): SceneThingDto => ({
  id,
  kind: 'drawing',
  svg: '<svg/>',
  aspect: 0.5,
  caption: null,
  parts: {},
  labels: {},
  states: {},
  hidden: [],
  moves: true,
  rig: true,
  rigVersion: 3,
  views: ['view-front', 'view-3q', 'view-profile', 'view-back3q', 'view-back'],
});

/** Two who talk, a on the left and b on the right, with the shots given. */
function talk(
  shots: SceneEffectDto[],
  places: Record<string, ScenePlaceDto>[] = [{ a: A, b: B }],
  at: number[] = [0],
): SceneDto {
  return {
    version: 4,
    generator: 'test',
    title: 'talk',
    durationMs: 12000,
    timing: 'voice',
    beats: [],
    things: [person('a'), person('b')],
    steps: places.map((p, k) => ({
      atMs: at[k],
      layout: 'one',
      show: Object.keys(p),
      arrows: [],
      enter: { a: { how: 'fade' }, b: { how: 'fade' } },
      focus: null,
    })),
    effects: shots,
    acting: {
      a: { look: [[0, 'b', 0.6]] },
      b: { look: [[0, 'a', 0.6]] },
    },
    stagings: {
      wide: { w: W, h: H, places },
      box: { w: W, h: H, places },
    },
  } as unknown as SceneDto;
}

describe('the views in a shot', () => {
  it('turns the one spoken to three-quarter to us and the one near from behind, each looking to their side', () => {
    expect(shotFacing(ots('b', 'a'), { a: A, b: B })).toEqual({
      yaw: -OTS_YAW,
      facing: { b: -90, a: 90 },
    });
    expect(viewAt(-90, -OTS_YAW)).toEqual({ view: '3q', mirror: -1 });
    expect(viewAt(90, -OTS_YAW)).toEqual({ view: 'back3q', mirror: 1 });
    const views = viewsOf(
      talk([ots('b', 'a'), { ...ots('a', 'b'), atMs: 4000, untilMs: 7000 }]),
    );
    const now = (id: string, t: number) => {
      let key: [number, string, number] | undefined;
      for (const one of views[id] ?? []) if (one[0] <= t) key = one;
      return key && [key[1], key[2]];
    };
    expect(now('b', 2000)).toEqual(['3q', -1]);
    expect(now('a', 2000)).toEqual(['back3q', 1]);
    expect(now('a', 5000)).toEqual(['3q', 1]);
    expect(now('b', 5000)).toEqual(['back3q', -1]);
  });

  it('puts the two of a profile two-shot face to face, both in profile', () => {
    const views = viewsOf(
      talk([{ ...ots('a', 'b'), shot: { enter: 'cut', kind: 'profile' } }]),
    );
    const at2 = (id: string) =>
      (views[id] ?? []).filter((k) => k[0] <= 2000).pop();
    expect(at2('a')?.slice(1)).toEqual(['profile', 1]);
    expect(at2('b')?.slice(1)).toEqual(['profile', -1]);
  });
});

describe('the 180° rule', () => {
  it('catches a cut that flips a speaker’s screen direction, and not one after the whole stage', () => {
    const scene = talk([
      ots('b', 'a'),
      { ...ots('a', 'b'), atMs: 4000, untilMs: 7000 },
    ]);
    // Their views as made: a looks right, b left, in both shots.
    scene.acting = {
      a: {
        view: [
          [0, 'back3q', 1],
          [4000, '3q', 1],
        ],
      },
      b: {
        view: [
          [0, '3q', -1],
          [4000, 'back3q', -1],
        ],
      },
    };
    expect(lineCrossings(scene)).toEqual([]);
    expect(screenDirection(scene.acting.a.view, 5000)).toBe(1);
    // The second shot has a looking left: across the line.
    scene.acting.a.view = [
      [0, 'back3q', 1],
      [4000, '3q', -1],
    ];
    expect(lineCrossings(scene)).toEqual([
      { atMs: 4000, who: 'a', toward: 'b', was: 1, now: -1 },
    ]);
    // With the whole stage between, the line may be crossed.
    scene.effects[1] = { ...scene.effects[1], atMs: 5500 };
    expect(lineCrossings(scene)).toEqual([]);
  });

  it('does not take a shot of the two on the other sides with no whole stage between, unless one walks across', () => {
    const swapped = { a: { ...A, x: 1100 }, b: { ...B, x: 300 } };
    const shots = [
      ots('b', 'a'),
      { ...ots('a', 'b'), atMs: 4000, untilMs: 7000 },
    ];
    const steps = [
      { atMs: 0, show: ['a', 'b'] },
      { atMs: 3900, show: ['a', 'b'] },
    ];
    const kept = keepTheLine(shots, steps, [{ a: A, b: B }, swapped]);
    expect(kept.map((s) => s.atMs)).toEqual([1000]);
    // Seen walking across her, it may.
    expect(
      keepTheLine(
        shots,
        steps,
        [{ a: A, b: B }, swapped],
        [{ id: 'a', from: 2000, to: 3900, start: A, end: swapped.a }],
      ).map((s) => s.atMs),
    ).toEqual([1000, 4000]);
    // Or after the whole stage.
    expect(
      keepTheLine([shots[0], { ...shots[1], atMs: 5000 }], steps, [
        { a: A, b: B },
        swapped,
      ]).map((s) => s.atMs),
    ).toEqual([1000, 5000]);
  });
});

// ── A conversation made as the Studio makes it ─────────────────────────────

describe('a conversation at the market, made', () => {
  const fixture = (file: string): unknown =>
    JSON.parse(
      readFileSync(
        join(__dirname, 'studio', '__fixtures__', 'maya', file),
        'utf8',
      ),
    );
  const line = (
    who: string,
    to: string,
    say: string,
    feeling: string | null = 'happy',
  ) => ({
    kind: 'line',
    who,
    to,
    say,
    feeling,
    sign: null,
    do: null,
    prop: null,
    spot: null,
    from: 'here',
    pace: null,
    seconds: null,
  });
  const made = (beats: unknown[]) => {
    const bible = bibleOf(fixture('bible.json'));
    const sheet = storySheetOf({
      kind: 'story',
      title: 'Where did Pip go?',
      set: 'market',
      time: 'day',
      weather: 'clear',
      crowd: 'none',
      mood: 'playful',
      music: 'calm',
      transition: 'cut',
      onStage: [
        {
          who: 'tobi',
          spot: 'left',
          pose: 'standing',
          face: 'neutral',
          holding: null,
          depth: 'front',
        },
        {
          who: 'maya',
          spot: 'centre-left',
          pose: 'standing',
          face: 'happy',
          holding: null,
        },
        {
          who: 'mama',
          spot: 'centre-right',
          pose: 'standing',
          face: 'happy',
          holding: null,
        },
      ],
      props: [],
      beats,
      camera: [],
    });
    const show = withFeatures(
      bible,
      sheet.set,
      mendSheet(sheet, bible, null).features,
    );
    return voiced(stageStory(repairSheet(sheet, show, null), show, {})).scene;
  };

  it('cuts from the master over each shoulder in turn, to Tobi near in deep staging and the two in profile, never a shot under 1.2 s', () => {
    const scene = made([
      line('maya', 'mama', 'Mama Nkechi, have you seen Pip anywhere today?'),
      line(
        'mama',
        'maya',
        'Pip? That little pup ran past my stall this morning.',
      ),
      line(
        'maya',
        'mama',
        'Which way did he go? We have looked for him all day.',
      ),
      line(
        'mama',
        'maya',
        'Towards the bus park, with one of my yams in his mouth.',
      ),
      line('tobi', 'maya', 'A whole yam? He will be far too full to run far!'),
      line('maya', 'mama', 'Thank you, Mama. We will find him before dark.'),
      line(
        'mama',
        'maya',
        'Take this bread for him. He will come to its smell.',
      ),
      line('maya', 'mama', 'You are the best, Mama Nkechi!'),
    ]);
    const shots = scene.effects
      .filter((e) => e.do === 'zoom')
      .sort((a, b) => a.atMs - b.atMs);
    // The master as it opens: no shot before the first line is said.
    expect(shots[0].atMs).toBeGreaterThanOrEqual(scene.beats[0].endMs);
    const kinds = shots.map((s) => s.shot?.kind ?? 'close');
    expect(kinds).toEqual([
      'ots',
      'ots',
      'profile',
      'deep',
      'ots',
      'ots',
      'ots',
    ]);
    expect(shots.find((s) => s.shot?.kind === 'deep')?.target).toBe('tobi');
    // Over each shoulder in turn: onto whoever speaks, past the other.
    for (const [i, s] of shots.entries())
      if (i && s.shot?.kind === 'ots' && shots[i - 1].shot?.kind === 'ots')
        expect(s.target).not.toBe(shots[i - 1].target);
    const over = shots.filter((s) => s.shot?.kind === 'ots');
    for (const s of over)
      expect(s.part).toBe(s.target === 'maya' ? 'mama' : 'maya');
    for (const s of shots)
      expect((s.untilMs ?? 0) - s.atMs).toBeGreaterThanOrEqual(1200);
  });

  it('does not cut up three lines between the two', () => {
    const scene = made([
      line('maya', 'mama', 'Mama Nkechi, have you seen Pip anywhere today?'),
      line(
        'mama',
        'maya',
        'Pip? That little pup ran past my stall this morning.',
      ),
      line('maya', 'mama', 'Thank you, Mama. We will find him before dark.'),
    ]);
    expect(scene.effects.filter((e) => e.do === 'zoom')).toEqual([]);
  });
});

// ── Stills show the view, the cheat and the angle ──────────────────────────

describe('a still of a shot', () => {
  const drawn = drawFigure(PLAIN_FIGURE, 'ada', { rig: VIEW_RIG });
  const dto = (id: string): SceneThingDto => {
    const thing = thingDto(
      {
        id,
        kind: 'character',
        name: id,
        ref: id,
        intro: [],
        first: false,
        met: 0,
      } as never,
      {
        svg: drawn.svg,
        viewBox: drawn.viewBox,
        aspect: drawn.viewBox[2] / drawn.viewBox[3],
        parts: drawn.parts,
        labels: {},
        states: drawn.states,
        moves: true,
        callouts: [],
        field: null,
        acts: true,
        joints: drawn.joints,
        rigVersion: 3,
        views: drawn.views,
        viewJoints: drawn.viewJoints,
      },
      true,
    );
    // Every face hidden until shown, as the scene has them.
    if (thing.kind === 'drawing') thing.hidden = Object.values(thing.states);
    return thing;
  };

  it('gives each view its arms, and the stage their shares, as the front has them', () => {
    expect(Object.keys(drawn.viewJoints ?? {})).toEqual([
      'front',
      '3q',
      'profile',
      'back3q',
      'back',
    ]);
    expect(drawn.viewJoints?.front).toEqual(drawn.joints);
    // In profile the shoulders are nearer the middle than from the front.
    const apart = (view: 'front' | 'profile') =>
      drawn.viewJoints![view]!.r[0][0] - drawn.viewJoints![view]!.l[0][0];
    expect(Math.abs(apart('profile'))).toBeLessThan(Math.abs(apart('front')));
    const thing = dto('ada');
    const shoulder =
      thing.kind === 'drawing' ? thing.viewJoints?.profile?.r[0] : undefined;
    const [x, y] = drawn.viewJoints!.profile!.r[0];
    expect(shoulder?.[0]).toBeCloseTo(
      (x - drawn.viewBox[0]) / drawn.viewBox[2],
      3,
    );
    expect(shoulder?.[1]).toBeCloseTo(
      (y - drawn.viewBox[1]) / drawn.viewBox[3],
      3,
    );
  });

  it('shows the view someone is in then, mirrored facing left, and the one near a shoulder big and soft', () => {
    const scene = talk([ots('b', 'a')]);
    scene.things = [dto('a'), dto('b')];
    scene.acting = {
      a: { view: [[0, 'back3q', 1]] },
      b: { view: [[0, '3q', -1]] },
    };
    expect(viewInStill(scene, 'b', 2000)).toEqual({ view: '3q', mirror: -1 });
    const plan = stillPlan(scene, 2000);
    const part = (id: string) =>
      plan.parts.find((p) => p.key === `thing:${id}`)!;
    const b = part('b');
    expect(b.view).toBe('3q');
    expect(b.mirror).toBe(true);
    expect(b.svg).toContain('id="view-3q" class="view vq-3q">');
    expect(b.svg).toContain(
      'id="view-front" class="view vq-front" display="none"',
    );
    // Every face but the one shown hidden in the view too.
    expect(b.svg).toMatch(/\[id="happy--3q"\]/);
    const a = part('a');
    expect(a.view).toBe('back3q');
    expect(a.soft).toBe(true);
    expect(a.box.x).toBeLessThan(0);
    expect(a.box.h).toBeGreaterThan(H);
    // Drawn before everyone.
    expect(plan.parts.indexOf(a)).toBeGreaterThan(plan.parts.indexOf(b));
  });
});

// ── The writer's hints, and the picture check at the new shots ──────────────

describe("the writer's hints and the picture check", () => {
  it('keeps a hint the writer gives on the sheet, with whom it looks past', () => {
    const sheet = storySheetOf({
      kind: 'story',
      title: 'A talk',
      set: 'market',
      onStage: [],
      beats: [],
      camera: [
        { beat: 2, shot: 'ots', on: 'maya', with: 'mama' },
        { beat: 4, shot: 'low', on: 'tobi', with: null },
        { beat: 5, shot: 'sideways', on: 'tobi', with: null },
      ],
    });
    expect(sheet.camera).toEqual([
      { beat: 2, shot: 'ots', on: 'maya', with: 'mama' },
      { beat: 4, shot: 'low', on: 'tobi', with: null },
    ]);
  });

  it('looks at a still of the first shot over a shoulder, and tells the judge who is near the camera', () => {
    const scene = talk([ots('b', 'a')]);
    scene.durationMs = 9000;
    const moments = pictureMoments(scene);
    expect(moments.map((m) => m.why)).toContain('an over-the-shoulder shot');
    const t = moments.find((m) => m.why === 'an over-the-shoulder shot')!.t;
    expect(t).toBe(2500);
    const claims = pictureClaims(scene, t, [
      { id: 'a', name: 'Ada', look: 'a woman' },
      { id: 'b', name: 'Bola', look: 'a man' },
    ]);
    expect(claims.shot).toMatch(
      /over-the-shoulder shot: Ada is near the camera, seen from behind/,
    );
    expect(claimsText(claims, 'an over-the-shoulder shot')).toContain(
      'each but the one near the camera is in clear view',
    );
  });
});
