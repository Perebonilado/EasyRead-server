/**
 * The story's sheet carried through to the acting, the faces and the
 * camera: a line's aim wins over what its words would be read as (a lie
 * played as a dodge); a face shown over one felt, by the rigged face's
 * recipes; an insert on a planted thing, framed where it is, cut between
 * words, the 180° rule kept across it; an old sheet staged as it was; and
 * an action's words kept whole as the mender splits it.
 */
import type { SceneEffectDto, ScenePlaceDto } from '../../../contracts';
import * as acting from '../scene-acting';
import { readLine } from '../scene-performance';
import {
  INSERT_LEAST_MS,
  INSERT_MOST_MS,
  insertWindows,
  keepTheLine,
  lineCrossings,
  withInserts,
} from '../scene-shots';
import {
  INSERT_FILL,
  INSERT_MOST,
  heldBox,
  insertView,
  walksOf,
} from '../scene-film';
import {
  bibleOf,
  feelingNamed,
  kitFaceOf,
  storySheetOf,
  type StudioBible,
} from './studio';
import { mendSheet, repairSheet, withFeatures } from './studio-check';
import { stageStory } from './studio-stage';
import { voiced } from './__fixtures__/voiced';
import { figureDrawing } from '../scene-sheet';
import { VIEW_RIG } from '../scene-figure-views';
import { facesShown } from '../scene-script';
import type { GatedDrawing } from '../scene-svg';
import { INSERT_READS, insertReading, stillPlan } from '../scene-still';

const figure = (over: Record<string, unknown>) => ({
  age: 'adult',
  build: 'average',
  skin: 4,
  hair: 'short',
  hairColour: 'brown',
  facialHair: 'none',
  headwear: 'none',
  top: 't-shirt',
  topColour: 'blue',
  bottom: 'trousers',
  bottomColour: 'navy',
  accentColour: 'red',
  extras: [],
  ...over,
});
const person = (id: string, name: string, voice: string, age: string) => ({
  id,
  name,
  kind: 'person',
  role: 'main',
  look: `${name}, in everyday clothes`,
  figure: figure({ age }),
  size: null,
  voice,
  voicePick: 1,
  traits: ['kind'],
  carries: null,
});
const BIBLE: StudioBible = bibleOf({
  characters: [
    person('mia', 'Mia', 'girl', 'child'),
    person('dad', 'Dad', 'man', 'adult'),
  ],
  sets: [
    {
      id: 'kitchen',
      name: 'The Kitchen',
      look: 'a family kitchen with a table in the middle',
      kind: 'indoor',
      stand: 'on',
      front: null,
      sound: null,
    },
  ],
  world: { era: 'today', region: '', culture: '', landscape: '', homes: '' },
});

const blank = {
  feeling: null,
  sign: null,
  do: null,
  prop: null,
  spot: null,
  from: null,
  pace: null,
  seconds: null,
};
const line = (
  who: string,
  to: string,
  say: string,
  extra: Record<string, unknown> = {},
) => ({ ...blank, kind: 'line', who, to, say, from: 'here', ...extra });
const business = (
  who: string,
  say: string,
  extra: Record<string, unknown>,
) => ({
  ...blank,
  kind: 'business',
  who,
  to: null,
  say,
  ...extra,
});

/** A sheet as a writer sends it: aims, faces over felt, and inserts on a letter hidden and a key handed over. */
const RAW = {
  kind: 'story',
  title: 'The key to the shed',
  set: 'kitchen',
  time: 'day',
  weather: 'clear',
  crowd: 'none',
  mood: 'playful',
  music: 'calm',
  transition: 'cut',
  onStage: [
    {
      who: 'mia',
      spot: 'centre-left',
      pose: 'standing',
      face: 'neutral',
      holding: 'letter',
    },
    {
      who: 'dad',
      spot: 'centre-right',
      pose: 'standing',
      face: 'happy',
      holding: 'key',
    },
  ],
  props: [],
  beats: [
    line('dad', 'mia', 'You are up early. What is behind your back?', {
      aim: 'asks',
      feeling: 'curious',
    }),
    line('mia', 'dad', "Nothing at all. I'm fine, really.", {
      aim: 'lies',
      feeling: 'happy',
      felt: 'worried',
    }),
    business('mia', 'Mia sets the letter down behind her.', {
      do: 'put',
      prop: 'letter',
      thing: 'letter',
    }),
    line('dad', 'mia', 'No key for you, then.', {
      aim: 'teases',
      feeling: 'smirking',
    }),
    line('mia', 'dad', 'Please, Dad! I need the shed for a surprise.', {
      aim: 'begs',
      feeling: 'pleading',
    }),
    business('dad', 'Dad hands Mia the key.', {
      do: 'give',
      prop: 'key',
      thing: 'key',
      to: 'mia',
      target: 'mia',
    }),
    line('mia', 'dad', 'Thank you! This is going to be the best birthday.', {
      feeling: 'delight',
    }),
  ],
  camera: [],
  inserts: [
    { beat: 2, thing: 'letter' },
    { beat: 5, thing: 'key' },
  ],
};

const staged = (raw: Record<string, unknown>) => {
  const sheet = storySheetOf(JSON.parse(JSON.stringify(raw)));
  const show = withFeatures(
    BIBLE,
    sheet.set,
    mendSheet(sheet, BIBLE, null).features,
  );
  return stageStory(repairSheet(sheet, show, null), show, { before: null });
};

describe('a face shown, and one felt beneath it, on the sheet', () => {
  it("takes any recipe as the face shown, the kit's faces as they were", () => {
    expect(feelingNamed('happy')).toBe('happy');
    expect(feelingNamed('eyes closed')).toBe('eyes closed');
    expect(feelingNamed('smug')).toBe('smug');
    expect(feelingNamed('smirking')).toBe('smug');
    // A recipe that is one of the kit's faces is called as the kit calls it.
    expect(feelingNamed('joy')).toBe('happy');
    expect(feelingNamed('fear')).toBe('afraid');
    expect(feelingNamed('serious')).toBe('sad');
    expect(feelingNamed('purple')).toBeNull();
    // What a drawing with no rigged face wears for it.
    expect(kitFaceOf('smug')).toBe('happy');
    expect(kitFaceOf('worried')).toBe('afraid');
  });

  it('keeps what a line feels beneath where it differs, and on lines only', () => {
    const sheet = storySheetOf(RAW);
    expect(sheet.beats[1]).toMatchObject({
      aim: 'lies',
      feeling: 'happy',
      felt: 'worried',
    });
    expect(sheet.beats[3]).toMatchObject({ aim: 'teases', feeling: 'smug' });
    expect(sheet.beats[3].felt).toBeUndefined();
    const same = storySheetOf({
      ...RAW,
      beats: [
        line('mia', 'dad', 'Fine.', { feeling: 'sad', felt: 'sad' }),
        {
          ...blank,
          kind: 'reaction',
          who: 'mia',
          feeling: 'happy',
          felt: 'sad',
        },
      ],
    });
    expect(same.beats[0].felt).toBeUndefined();
    expect(same.beats[1].felt).toBeUndefined();
  });
});

describe('the sheet carried through to the acting', () => {
  it("stages each line with its aim, and its faces where the writer gave more than the kit's", () => {
    const script = staged(RAW);
    const lines = script.beats.filter((b) => b.kind === 'line');
    expect(lines.map((b) => [b.aim, b.said, b.felt])).toEqual([
      ['asks', 'curious', undefined],
      ['lies', 'joy', 'worried'],
      ['teases', 'smug', undefined],
      ['begs', 'pleading', undefined],
      [undefined, 'delight', undefined],
    ]);
  });

  it("gives the acting the writer's aim and faces, and the aim wins over the words", () => {
    const spy = jest.spyOn(acting, 'actingOf');
    const { scene } = voiced(staged(RAW));
    const lines = spy.mock.calls[0][0].lines;
    spy.mockRestore();
    const tease = lines.find((one) =>
      one.words
        .map((w) => w.text)
        .join(' ')
        .startsWith('No key'),
    )!;
    const words = tease.words.map((w) => w.text);
    // Its words alone read as a giving ("for you"); the writer's aim wins.
    expect(readLine(words).aim).not.toBe('teases');
    expect(tease).toMatchObject({ aim: 'teases', said: 'smug' });
    expect(readLine(words, { aim: tease.aim }).aim).toBe('teases');
    // A lie is played as a dodge, its felt face flashing first.
    const lie = lines.find((one) => one.aim === 'lies')!;
    expect(lie).toMatchObject({ said: 'joy', felt: 'worried' });
    expect(
      readLine(
        lie.words.map((w) => w.text),
        { aim: 'lies' },
      ).aim,
    ).toBe('dodges');
    const faces = scene.acting?.mia?.face ?? [];
    expect(
      faces.some(([, said, , , how]) => said === 'worried' && how === 'flash'),
    ).toBe(true);
    expect(
      faces.some(([, said, , felt]) => said === 'joy' && felt === 'worried'),
    ).toBe(true);
    expect(
      (scene.acting?.dad?.face ?? []).some(([, said]) => said === 'smug'),
    ).toBe(true);
  });

  it('stages a sheet written before aims and felt faces as it was', () => {
    const old = {
      ...RAW,
      inserts: undefined,
      beats: RAW.beats.map((b) => {
        const rest: Record<string, unknown> = { ...b };
        delete rest.aim;
        delete rest.felt;
        return {
          ...rest,
          feeling:
            rest.feeling === 'smirking' || rest.feeling === 'delight'
              ? 'happy'
              : rest.feeling === 'curious'
                ? 'thinking'
                : rest.feeling === 'pleading'
                  ? 'sad'
                  : rest.feeling,
        };
      }),
    };
    const script = staged(old);
    for (const beat of script.beats) {
      expect(beat.aim).toBeUndefined();
      expect(beat.said).toBeUndefined();
      expect(beat.felt).toBeUndefined();
    }
    expect(script.inserts).toBeUndefined();
  });
});

describe('an insert on a planted thing', () => {
  const W = 1600;
  const H = 900;

  it('frames a small thing so it fills two fifths of the frame, no closer than it may', () => {
    const big = { x: 600, y: 500, w: 200, h: 180 };
    const view = insertView(big, W, H);
    expect((big.h * view.s) / H).toBeCloseTo(INSERT_FILL, 5);
    expect(view.x).toBe(700);
    const tiny = insertView({ x: 700, y: 600, w: 30, h: 20 }, W, H);
    expect(tiny.s).toBe(INSERT_MOST);
  });

  it('follows the hand that holds it: where they stand, it goes', () => {
    const thing = {
      viewBox: [-20, -15, 38, 18] as const,
      grip: [-11, -6] as const,
    };
    const at: ScenePlaceDto = { x: 400, y: 300, w: 200, h: 400, d: 0.5 };
    const a = heldBox(thing, { place: at }, 'r');
    const b = heldBox(thing, { place: { ...at, x: 700 } }, 'r');
    expect(b.x - a.x).toBeCloseTo(300, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
    // In the right hand, on their right; in the left, on their left.
    expect(a.x).toBeGreaterThan(at.x + at.w / 2);
    expect(heldBox(thing, { place: at }, 'l').x).toBeLessThan(at.x + at.w / 2);
  });

  it('is on for a second or two from just before its moment, never cutting in a word', () => {
    // Words of 320 ms with 80 ms between, from 1 s.
    const words = Array.from({ length: 30 }, (_, i) => ({
      startMs: 1000 + i * 400,
      endMs: 1320 + i * 400,
    }));
    const inWord = (t: number) =>
      words.some((w) => w.startMs < t && t < w.endMs);
    const got = insertWindows(
      [
        { thing: 'key', atMs: 2150 },
        { thing: 'letter', atMs: 7000 },
        // The same thing again too soon: not shown again.
        { thing: 'key', atMs: 9000 },
      ],
      words,
      20_000,
    );
    expect(got.map((one) => one.thing)).toEqual(['key', 'letter']);
    for (const one of got) {
      expect(inWord(one.fromMs)).toBe(false);
      expect(inWord(one.untilMs)).toBe(false);
      expect(one.untilMs - one.fromMs).toBeGreaterThanOrEqual(INSERT_LEAST_MS);
      expect(one.untilMs - one.fromMs).toBeLessThanOrEqual(INSERT_MOST_MS);
    }
    expect(got[0].fromMs).toBeGreaterThanOrEqual(2150 - 250);
    expect(got[0].fromMs).toBeLessThan(2150 + 500);
    // No room before the scene ends: not taken.
    expect(
      insertWindows([{ thing: 'key', atMs: 19_500 }], words, 20_000),
    ).toEqual([]);
  });

  it('cuts into the shot it falls in, and the 180° rule holds across it', () => {
    const shot = (
      atMs: number,
      untilMs: number,
      target: string,
      part: string | null,
      kind?: 'ots' | 'insert',
    ): SceneEffectDto => ({
      atMs,
      untilMs,
      target,
      part,
      do: 'zoom',
      shot: { enter: 'cut', ...(kind ? { kind } : {}) },
    });
    const places = [
      {
        a: { x: 400, y: 300, w: 200, h: 400, d: 0.5 },
        b: { x: 900, y: 300, w: 200, h: 400, d: 0.5 },
      },
    ];
    const steps = [{ atMs: 0, show: ['a', 'b'] }];
    const insert = shot(4000, 5600, 'key', null, 'insert');
    const cut = withInserts(
      [shot(2000, 9000, 'a', 'b', 'ots')],
      [insert],
      1200,
    );
    expect(cut.map((one) => [one.atMs, one.untilMs, one.target])).toEqual([
      [2000, 4000, 'a'],
      [4000, 5600, 'key'],
      [5600, 9000, 'a'],
    ]);
    expect(keepTheLine(cut, steps, places)).toHaveLength(3);
    // An insert is no whole stage: two seen the other way about after it
    // still cross the line, and are not taken.
    const swapped = [
      { a: places[0].a, b: places[0].b },
      { a: places[0].b, b: places[0].a },
    ];
    const kept = keepTheLine(
      [
        shot(2000, 4000, 'a', 'b', 'two' as never),
        insert,
        shot(5600, 9000, 'a', 'b', 'two' as never),
      ],
      [
        { atMs: 0, show: ['a', 'b'] },
        { atMs: 5000, show: ['a', 'b'] },
      ],
      swapped,
    );
    expect(kept.map((one) => one.target)).toEqual(['a', 'key']);
  });

  it('is made from the sheet: each planted thing close, as it is handled, between words', () => {
    const { scene } = voiced(staged(RAW));
    const inserts = scene.effects.filter(
      (e) => e.do === 'zoom' && e.shot?.kind === 'insert',
    );
    expect(inserts.map((e) => e.target)).toEqual(['letter', 'key']);
    const words = scene.beats.flatMap((b) => b.words.map((w) => [w[2], w[3]]));
    for (const e of inserts) {
      expect(e.untilMs! - e.atMs).toBeGreaterThanOrEqual(INSERT_LEAST_MS);
      expect(e.untilMs! - e.atMs).toBeLessThanOrEqual(INSERT_MOST_MS);
      for (const t of [e.atMs, e.untilMs!])
        expect(words.some(([a, b]) => a < t && t < b)).toBe(false);
      expect(e.shot?.box?.length).toBe(4);
    }
    // The key is shown as it is handed over, the letter as it is set down.
    const given = scene.props?.find((p) => p.id === 'key')?.does[0][0] ?? 0;
    expect(inserts[1].atMs).toBeLessThanOrEqual(given);
    expect(inserts[1].untilMs).toBeGreaterThan(given);
    expect(lineCrossings(scene, walksOf(scene))).toEqual([]);
  });

  /** The scene with the kit's own people, rigged and drawn from every side, as the film draws them. */
  const withKit = async () => {
    const script = staged(RAW);
    const drawn = new Map<string, GatedDrawing>();
    for (const one of BIBLE.characters)
      drawn.set(
        one.id,
        await figureDrawing(one.figure!, one.id, {
          rig: VIEW_RIG,
          faceRig: true,
          faces: facesShown(script, one.id),
        }),
      );
    return voiced(script, [], {}, {}, { drawn }).scene;
  };

  it('reads as a close-up in its stills: the thing centred, filling about two fifths of the frame, little else of anyone', async () => {
    const scene = await withKit();
    const inserts = scene.effects.filter(
      (e) => e.do === 'zoom' && e.shot?.kind === 'insert',
    );
    expect(inserts.length).toBeGreaterThanOrEqual(2);
    for (const e of inserts)
      for (const at of [0.25, 0.5, 0.75]) {
        const t = Math.round(e.atMs + (e.untilMs! - e.atMs) * at);
        const read = insertReading(stillPlan(scene, t, 480), e.target);
        const said = `${e.target} at ${t}: ${JSON.stringify(read)}`;
        expect(read).not.toBeNull();
        expect([said, read!.off <= INSERT_READS.off]).toEqual([said, true]);
        expect([said, read!.fill >= INSERT_READS.fill[0]]).toEqual([
          said,
          true,
        ]);
        expect([said, read!.fill <= INSERT_READS.fill[1]]).toEqual([
          said,
          true,
        ]);
        expect([
          said,
          read!.bodies <= INSERT_READS.bodies[read!.held ? 'held' : 'alone'],
        ]).toEqual([said, true]);
        expect([said, read!.faces <= INSERT_READS.faces]).toEqual([said, true]);
      }
    // The letter set down is seen on the floor alone, where it lies: no
    // hand it left, and no face.
    const set = inserts.find((e) => e.target === 'letter')!;
    const read = insertReading(
      stillPlan(scene, Math.round((set.atMs + set.untilMs!) / 2), 480),
    )!;
    expect(read.thing).toBe('letter');
    expect(read.faces).toBe(0);
  });

  it("draws a thing held in the hand, at the kit's size: a letter about A5", async () => {
    const scene = await withKit();
    // As the scene opens Mia has the letter, Dad the key.
    const plan = stillPlan(scene, 1000, 960);
    for (const [id, by] of [
      ['letter', 'mia'],
      ['key', 'dad'],
    ] as const) {
      const thing = plan.things.find((one) => one.id === id)!;
      expect(thing.by).toBe(by);
      const prop = scene.props!.find((p) => p.id === id)!;
      const [vx, vy, vw, vh] = prop.viewBox;
      // Its grip, the other way round in a left hand, is at the hand as posed.
      const across = (prop.grip[0] - vx) / vw;
      const grip = [
        thing.box.x + thing.box.w * (thing.hand === 'l' ? 1 - across : across),
        thing.box.y + (thing.box.h * (prop.grip[1] - vy)) / vh,
      ];
      const hand = plan.bodies
        .find((one) => one.id === by)!
        .shapes.find(
          (shape) => shape.part === 'hand' && shape.hand === thing.hand,
        ) as { a: [number, number]; r: number };
      expect(Math.hypot(grip[0] - hand.a[0], grip[1] - hand.a[1])).toBeLessThan(
        hand.r * 0.1,
      );
    }
    // The letter's drawing (its viewBox less the room framed about it) at
    // the kit's scale, a grown-up 224 of its units to 1.7 m: about A5
    // (210 × 148 mm), neither a stamp nor a poster.
    const letter = scene.props!.find((p) => p.id === 'letter')!;
    const mm = (units: number) => (units * 1700) / 224;
    expect(mm(letter.viewBox[2] - 6)).toBeGreaterThan(190);
    expect(mm(letter.viewBox[2] - 6)).toBeLessThan(280);
    expect(mm(letter.viewBox[3] - 6)).toBeGreaterThan(130);
    expect(mm(letter.viewBox[3] - 6)).toBeLessThan(190);
  });
});

describe("an action's words, split, kept whole", () => {
  it('never drops what someone reaches for when a name reads as a verb', () => {
    const bible: StudioBible = {
      ...BIBLE,
      characters: BIBLE.characters.map((c) =>
        c.id === 'dad' ? { ...c, id: 'pip', name: 'Pip' } : c,
      ),
      things: [{ id: 'squeak', name: 'Squeak', kind: 'thing' }],
    };
    const sheet = storySheetOf({
      ...RAW,
      onStage: [
        {
          who: 'pip',
          spot: 'centre',
          pose: 'standing',
          face: 'neutral',
          holding: null,
        },
      ],
      beats: [
        {
          ...blank,
          kind: 'action',
          who: 'pip',
          say: 'Pip reaches for Squeak as the gust carries him into the oak.',
          do: 'reach',
        },
        {
          ...blank,
          kind: 'action',
          who: 'pip',
          say: "The branch slips from Pip's hands.",
          do: 'fall',
        },
        {
          ...blank,
          kind: 'action',
          who: 'pip',
          say: 'Pip waves and jumps.',
          do: 'wave',
        },
      ],
      inserts: undefined,
    });
    const says = mendSheet(sheet, bible, null).sheet.beats.map((b) => b.say);
    expect(says).toContain(
      'Pip reaches for Squeak as the gust carries him into the oak.',
    );
    expect(says).toContain("The branch slips from Pip's hands.");
    // Split, each says who does it.
    expect(says).toEqual(expect.arrayContaining(['Pip waves.', 'Pip jumps.']));
  });
});
