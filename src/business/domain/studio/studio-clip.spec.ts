import {
  bibleOf,
  explainerSheetOf,
  outlineOf,
  storySheetOf,
  type OutlineScene,
} from './studio';
import {
  CLIP_CARD,
  CLIP_HOLD_S,
  FREEZE_MS,
  clipBible,
  clipBrief,
  clipFreeze,
  clipJoin,
  clipLook,
  gateClips,
  hookFirst,
  mendClip,
  namesClip,
  presetLayout,
  withClipCard,
  withPresets,
  withStill,
} from './studio-clip';
import { checkOutline } from './studio-check';
import type { SceneScript } from '../scene-script';
import type { SceneDto } from '../../../contracts';

/**
 * Story clips inside explainers (studio-explainer-plan, Ask 5), all by
 * code: the outline's gate, the cast held to the kits, the clip's sheet
 * put right, the freeze, the card and the joins in and out.
 */

const bible = bibleOf({
  subject: 'health: fever',
  characters: [
    {
      id: 'amara',
      name: 'Nurse Amara',
      voice: 'woman',
      figure: { age: 'adult' },
    },
    { id: 'sam', name: 'Sam', voice: 'boy', figure: { age: 'child' } },
    { id: 'lea', name: 'Lea', voice: 'girl', figure: { age: 'child' } },
  ],
  sets: [{ id: 'clinic', name: 'The clinic room', kind: 'indoor' }],
});

const lesson = (title: string, seconds = 30): Record<string, unknown> => ({
  title,
  summary: `${title}.`,
  seconds,
  teach:
    'Your body likes to stay at about thirty-seven degrees, and a fever is when it turns up its own heat to fight germs.',
  points: [],
});
const clip = (title: string, over: Record<string, unknown> = {}) => ({
  title,
  summary: 'Nurse Amara takes Sam’s temperature.',
  kind: 'clip',
  set: 'clinic',
  cast: ['amara', 'sam'],
  seconds: 12,
  teach: 'The nurse reads the thermometer: thirty-nine degrees is a fever.',
  points: [],
  ...over,
});
const kinds = (scenes: OutlineScene[]) => scenes.map((s) => s.kind ?? 'lesson');

describe("an explainer's outline, its clips gated by code", () => {
  it('keeps a clip before the lesson that explains it, and gives it a hook', () => {
    const { outline, fixed } = gateClips(
      outlineOf({
        title: 'Fever',
        scenes: [lesson('One'), clip('Clinic'), lesson('Two')],
      }),
      bible,
    );
    expect(kinds(outline.scenes)).toEqual(['lesson', 'clip', 'lesson']);
    expect(outline.scenes[1].hook).toMatch(
      /^Think about what we just saw: the nurse reads/,
    );
    expect(fixed).toContain('clip 2 given its hook');
  });

  it('keeps a clip 6 to 20 seconds, reading it short where a lesson may not be', () => {
    const read = outlineOf({
      scenes: [lesson('One'), clip('A', { seconds: 7 }), lesson('Two')],
    });
    expect(read.scenes[1].seconds).toBe(7);
    const { outline } = gateClips(
      outlineOf({
        scenes: [
          lesson('One', 60),
          clip('A', { seconds: 45, hook: 'Did you see it?' }),
          lesson('Two', 60),
          lesson('Three', 60),
        ],
      }),
      bible,
    );
    expect(outline.scenes[1]).toMatchObject({ kind: 'clip', seconds: 20 });
  });

  it('makes one too many, one that ends the film or follows another, and one past a quarter of it a lesson scene, silently', () => {
    const { outline, fixed } = gateClips(
      outlineOf({
        scenes: [
          clip('Cold open'),
          clip('Second in a row'),
          lesson('One', 90),
          clip('Third'),
          lesson('Two', 90),
          clip('At the end'),
        ],
      }),
      bible,
    );
    expect(kinds(outline.scenes)).toEqual([
      'clip',
      'lesson',
      'lesson',
      'clip',
      'lesson',
      'lesson',
    ]);
    expect(fixed.join(' ')).toMatch(
      /scene 2 is a lesson, not a clip: it follows another clip/,
    );
    expect(fixed.join(' ')).toMatch(
      /scene 6 is a lesson, not a clip: the episode has room for 2 clips/,
    );
    // What it showed is what the lesson scene teaches; nothing of a clip is kept.
    expect(outline.scenes[1]).toMatchObject({
      set: null,
      cast: [],
    });
    expect(outline.scenes[1].teach).toMatch(/thermometer/);
    expect(outline.scenes[1].kind).toBeUndefined();
    // A one-minute film has room for one clip of a quarter of it.
    const short = gateClips(
      outlineOf({
        scenes: [
          lesson('One', 25),
          clip('A', { seconds: 20 }),
          lesson('Two', 25),
        ],
      }),
      bible,
    );
    expect(short.outline.scenes[1].kind).toBeUndefined();
    expect(short.fixed.join(' ')).toMatch(/more than a quarter of the film/);
  });

  it('keeps the same faces: after the first clip, one new face a clip', () => {
    const { outline } = gateClips(
      outlineOf({
        scenes: [
          clip('First', { cast: ['amara'] }),
          lesson('One', 90),
          clip('Second', { cast: ['amara', 'sam', 'lea'] }),
          lesson('Two', 90),
        ],
      }),
      bible,
    );
    expect(outline.scenes[2].cast).toEqual(['amara', 'sam']);
  });

  it('makes a clip in no place of the show, or with no one of it, a lesson scene', () => {
    const none = bibleOf({ subject: 'algebra' });
    const { outline } = gateClips(
      outlineOf({ scenes: [lesson('One'), clip('Clinic'), lesson('Two')] }),
      none,
    );
    expect(kinds(outline.scenes)).toEqual(['lesson', 'lesson', 'lesson']);
  });

  it("does not hold a clip's one line to a lesson's teaching length", () => {
    const { outline } = gateClips(
      outlineOf({ scenes: [lesson('One'), clip('Clinic'), lesson('Two')] }),
      bible,
    );
    expect(checkOutline(outline, bible, 1.2, false).join(' ')).not.toMatch(
      /Scene 2/,
    );
  });
});

describe("an explainer's cast for its clips", () => {
  it('keeps three people the kits draw and two places, one of them painted', () => {
    const held = clipBible(
      bibleOf({
        characters: [
          { name: 'Ana', figure: {} },
          { name: 'Dragon', kind: 'creature', look: 'a purple dragon' },
          { name: 'Kofi', figure: {} },
          { name: 'Mei', figure: {} },
          { name: 'Luca', figure: {} },
        ],
        sets: [
          { name: 'A lighthouse' },
          { name: 'A windmill' },
          { name: 'The classroom', kind: 'indoor' },
        ],
      }),
    );
    expect(held.bible.characters.map((c) => c.name)).toEqual([
      'Ana',
      'Kofi',
      'Mei',
    ]);
    expect(held.bible.sets.map((s) => s.name)).toEqual([
      'The classroom',
      'A lighthouse',
    ]);
    expect(held.dropped.join(' ')).toMatch(/Dragon \(no kit draws them\)/);
    expect(held.dropped.join(' ')).toMatch(
      /A windmill \(one painted place a show\)/,
    );
  });

  it('builds a common place from a layout code has, and paints any other once', () => {
    expect(presetLayout({ name: 'The clinic room', look: '' })).toMatchObject({
      ground: 'tiles',
    });
    expect(
      presetLayout({ name: 'A market stall', look: 'fruit' }),
    ).toMatchObject({ backdrop: 'city' });
    expect(
      presetLayout({ name: 'A lighthouse', look: 'on a cliff' }),
    ).toBeNull();
    const story = withPresets({
      characters: [],
      pages: [],
      places: [
        {
          id: 'clinic',
          name: 'The clinic room',
          aliases: [],
          look: '',
          firstPage: 1,
          sound: null,
        },
        {
          id: 'light',
          name: 'A lighthouse',
          aliases: [],
          look: '',
          firstPage: 1,
          sound: null,
        },
      ],
    });
    expect(story.places[0].layout).toBeDefined();
    expect(story.places[1]).toMatchObject({ once: true });
  });

  it("tints a clip's set in the explainer's look, and writes it as a story with a light narrator", () => {
    expect(clipLook('paper')).toBeNull();
    expect(clipLook('chalkboard')).toMatchObject({
      tint: '#1F3B34',
      tintK: 0.1,
    });
    const brief = clipBrief({
      format: 'explainer',
      idea: 'Fever',
      audience: 'children',
      minutes: 1,
      tone: 'calm',
      setting: null,
      characters: null,
      include: null,
      source: null,
      genre: 'comedy',
    });
    expect(brief).toMatchObject({ format: 'story', narrator: 'light' });
    expect(brief.genre).toBeUndefined();
  });
});

const beat = (over: Record<string, unknown>) => over;
const sheet = storySheetOf({
  title: 'Sam at the clinic with Nurse Amara today',
  set: 'clinic',
  onStage: [
    { who: 'amara', spot: 'centre-left', holding: 'thermometer' },
    { who: 'sam', spot: 'centre-right' },
  ],
  beats: [
    beat({ kind: 'narration', say: 'Monday morning at the clinic.' }),
    beat({
      kind: 'line',
      who: 'sam',
      to: 'amara',
      say: 'My head feels so hot and my arms ache all over, and I could not sleep at all last night.',
      feeling: 'sad',
    }),
    beat({
      kind: 'business',
      who: 'amara',
      say: 'Nurse Amara reads the thermometer.',
      do: 'use',
      thing: 'thermometer',
    }),
    beat({
      kind: 'line',
      who: 'amara',
      to: 'sam',
      say: 'Thirty-nine degrees. That is a fever.',
      feeling: 'neutral',
    }),
    beat({ kind: 'reaction', who: 'sam', feeling: 'surprised' }),
    beat({
      kind: 'line',
      who: 'sam',
      to: 'amara',
      say: 'Is that bad?',
      feeling: 'afraid',
    }),
    beat({
      kind: 'line',
      who: 'amara',
      to: 'sam',
      say: 'It means you are fighting a germ.',
      feeling: 'happy',
    }),
    beat({
      kind: 'line',
      who: 'sam',
      to: 'amara',
      say: 'Can I go home?',
      feeling: 'curious',
    }),
    beat({ kind: 'narration', say: 'And off they went.' }),
  ],
});

describe("a clip's sheet held to its profile by code", () => {
  const mended = mendClip(
    sheet,
    'The nurse reads the thermometer: thirty-nine degrees is a fever.',
  );

  it('sets its label, one narration, short lines and six beats that act or speak', () => {
    expect(mended.sheet.title).toBe('Sam at the clinic with Nurse');
    const acted = mended.sheet.beats.filter(
      (b) => b.kind !== 'reaction' && b.kind !== 'pause',
    );
    expect(acted.length).toBeLessThanOrEqual(6);
    expect(
      mended.sheet.beats.filter((b) => b.kind === 'narration'),
    ).toHaveLength(1);
    expect(mended.sheet.beats[1].say).toBe(
      'My head feels so hot and my arms ache all over.',
    );
  });

  it('closes on the key thing: an insert on it at the idea, and the 600 ms hold right after', () => {
    const k = mended.sheet.beats.findIndex((b) => b.do === 'use');
    expect(mended.sheet.inserts).toEqual([{ beat: k, thing: 'thermometer' }]);
    expect(mended.sheet.beats[k + 1]).toMatchObject({
      kind: 'pause',
      seconds: CLIP_HOLD_S,
    });
  });
});

describe('a clip in the film', () => {
  const scene = {
    durationMs: 12_000,
    beats: [
      { text: 'a', startMs: 500, endMs: 2000, words: [] },
      { text: 'b', startMs: 5000, endMs: 7000, words: [] },
    ],
    effects: [
      {
        atMs: 3000,
        untilMs: 5200,
        target: 'thermometer',
        part: null,
        do: 'zoom',
        shot: { enter: 'cut', kind: 'insert' },
      },
    ],
  } as unknown as SceneDto;

  it('freezes 600 ms once its insert has come in on the key thing, its label set', () => {
    expect(clipFreeze(scene, '39 degrees is a fever')).toEqual({
      atMs: 3900,
      ms: FREEZE_MS,
      label: '39 degrees is a fever',
    });
    // With no insert, three fifths of the way through its words.
    expect(clipFreeze({ ...scene, effects: [] }, 'x')?.atMs).toBe(7000);
  });

  it('becomes a card: the first thing on the next lesson’s stage while the hook is said', () => {
    const script = {
      fit: 'good',
      fitReason: null,
      title: 'Why',
      mood: 'curious',
      beats: [],
      cast: [{ id: 'body', kind: 'words', text: 'body', style: 'keyword' }],
      steps: [
        {
          at: { beat: 0, phrase: '' },
          word: 0,
          stage: { layout: 'one', show: ['body'], arrows: [] },
          effects: [],
        },
        {
          at: { beat: 1, phrase: '' },
          word: 0,
          stage: { layout: 'one', show: ['body'], arrows: [] },
          effects: [],
        },
        {
          at: { beat: 3, phrase: '' },
          word: 0,
          stage: { layout: 'one', show: ['body'], arrows: [] },
          effects: [],
        },
      ],
    } as unknown as SceneScript;
    const carded = withClipCard(script, '39 degrees is a fever');
    expect(carded.cast.find((c) => c.id === CLIP_CARD)).toMatchObject({
      kind: 'drawing',
      name: '39 degrees is a fever',
      shape: 'wide',
    });
    expect(carded.steps.map((s) => s.stage?.show)).toEqual([
      [CLIP_CARD, 'body'],
      [CLIP_CARD, 'body'],
      ['body'],
    ]);
    expect(carded.steps[0].stage?.layout).toBe('row');
    const made = withStill(
      {
        things: [
          { id: CLIP_CARD, kind: 'drawing' },
          { id: 'body', kind: 'words' },
        ],
      } as unknown as SceneDto,
      'c2',
    );
    expect(made.things[0]).toMatchObject({
      still: { sceneId: 'c2', atMs: null },
    });
    expect(made.things[1]).not.toHaveProperty('still');
  });

  it('opens the lesson after it on the hook, said first where its writer did not point back', () => {
    const lessonSheet = explainerSheetOf({
      kind: 'explainer',
      title: 'Heat',
      draft: {
        fit: 'good',
        fitReason: null,
        title: 'Heat',
        mood: 'curious',
        beats: [
          {
            say: 'Your body has a thermostat.',
            pause: 'short',
            delivery: 'explain',
          },
        ],
        cast: [],
        steps: [
          {
            beat: 0,
            phrase: 'thermostat',
            layout: 'one',
            show: [],
            arrows: null,
            effects: null,
          },
        ],
      },
    });
    const hooked = hookFirst(
      lessonSheet,
      'Did you see the number on the thermometer?',
    );
    expect(hooked.fixed).toBe(true);
    expect(hooked.sheet.draft.beats.map((b) => b.say)).toEqual([
      'Did you see the number on the thermometer?',
      'Your body has a thermostat.',
    ]);
    expect(hooked.sheet.draft.steps[0].beat).toBe(1);
    // One that points back already is left as it is.
    expect(
      hookFirst(hooked.sheet, 'Did you see the number on the thermometer?')
        .fixed,
    ).toBe(false);
  });

  it('comes in by a dissolve (an iris on Sunny and Chalkboard), and goes out by a match into its card', () => {
    const lessonSheet = explainerSheetOf({ kind: 'explainer', title: 'A' });
    expect(clipJoin(lessonSheet, sheet, 'explainer', 'paper')).toEqual({
      join: 'dissolve',
    });
    expect(clipJoin(lessonSheet, sheet, 'explainer', 'sunny')).toEqual({
      join: 'iris',
    });
    expect(clipJoin(sheet, lessonSheet, 'explainer', 'sunny')).toEqual({
      join: 'match',
      joinWith: { whole: true, to: CLIP_CARD },
    });
    expect(clipJoin(sheet, sheet, 'story', null)).toBeNull();
    expect(clipJoin(lessonSheet, lessonSheet, 'explainer', null)).toBeNull();
  });
});

describe('the clarity bench: each clip is named in the lesson line after it', () => {
  const clipScene = gateClips(
    outlineOf({
      scenes: [
        lesson('One'),
        clip('Clinic', { hook: 'Did you see the number on the thermometer?' }),
        lesson('Two'),
      ],
    }),
    bible,
  ).outline.scenes[1];
  const after = (say: string) =>
    explainerSheetOf({
      kind: 'explainer',
      draft: {
        fit: 'good',
        fitReason: null,
        title: 'x',
        mood: 'curious',
        beats: [{ say, pause: 'short', delivery: 'hook' }],
        cast: [],
        steps: [],
      },
    });

  it('passes a lesson that points back or names what was shown, and fails one that moves on', () => {
    expect(
      namesClip(after('Did you see the number on the thermometer?'), clipScene),
    ).toBe(true);
    expect(
      namesClip(after('That thermometer read thirty-nine degrees.'), clipScene),
    ).toBe(true);
    expect(namesClip(after('Now, germs come in many shapes.'), clipScene)).toBe(
      false,
    );
    // Put right by code: the hook first.
    expect(
      namesClip(
        hookFirst(after('Now, germs come in many shapes.'), clipScene.hook!)
          .sheet,
        clipScene,
      ),
    ).toBe(true);
  });
});
