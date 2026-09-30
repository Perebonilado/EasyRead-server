/**
 * The camera chosen by the moment, and the acting seen (scene-shots,
 * scene-views, scene-acting-check): an argument cut shot and reverse shot
 * sooner; a joke framed with whom it is said to; the hero's close-up on
 * the line that says what they want; a reaction shot after a line that
 * lands, held into the answer; a new place seen whole before the first
 * line; a listener on the whole stage turned in three-quarter, never their
 * back; and a whole scene checked: every line acted as what it does, the
 * speakers' faces seen, and whoever it is said to seen taking it.
 */
import type { SceneDto, ScenePlaceDto, SceneThingDto } from '../../contracts';
import {
  REACTION_APART_MS,
  grammarCamera,
  type GrammarInput,
  type GrammarLine,
} from './scene-shots';
import { viewsOf } from './scene-views';
import { grammarRead } from './scene-performance';
import {
  FACES_SEEN_LEAST,
  actingNumbers,
  faceSeenAt,
  shotReport,
} from './scene-acting-check';
import { bibleOf, storySheetOf } from './studio/studio';
import { mendSheet, repairSheet, withFeatures } from './studio/studio-check';
import { ESTABLISH_S, stageStory } from './studio/studio-stage';
import { voiced } from './studio/__fixtures__/voiced';

const W = 1600;
const PLACES: Record<string, ScenePlaceDto> = {
  a: { x: 500, y: 320, w: 190, h: 400, d: 0.5 },
  b: { x: 900, y: 300, w: 200, h: 420, d: 0.45 },
  c: { x: 120, y: 360, w: 170, h: 380, d: 0.8 },
};

/** Lines one after another, 3 s each, their aims read from their words. */
const linesOf = (said: [string, string, string?][]): GrammarLine[] =>
  said.map(([speaker, say, to], i) => ({
    beat: i,
    speaker,
    to: to ?? null,
    startMs: 500 + i * 3000,
    endMs: 3000 + i * 3000,
    strong: false,
    sad: false,
    toCrowd: false,
    ...grammarRead(say),
  }));

const grammar = (lines: GrammarLine[], patch: Partial<GrammarInput> = {}) =>
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

describe('the camera chosen by the moment', () => {
  it('cuts an argument over the shoulder sooner than a chat', () => {
    const argue = grammar(
      linesOf([
        ['a', 'Where is my phone?', 'b'],
        ['b', 'No! It was not me.', 'a'],
        ['a', 'You took it. You always do!', 'b'],
      ]),
    );
    // Three lines of a chat are no conversation yet (more than three are).
    const chat = grammar(
      linesOf([
        ['a', 'The bus comes at noon.', 'b'],
        ['b', 'The shop shuts at six.', 'a'],
        ['a', 'The park is on the way.', 'b'],
      ]),
    );
    expect(argue.some((one) => one.shot === 'ots')).toBe(true);
    expect(chat.filter((one) => one.shot !== 'wide')).toEqual([]);
  });

  it('frames a joke with whom it is said to, so their face is seen', () => {
    const camera = grammar(
      linesOf([
        ['a', 'We are ready to go.', 'b'],
        ['b', 'Knock knock. A soggy scientist.', 'a'],
      ]),
    );
    expect(camera).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ beat: 1, shot: 'two', on: 'b', with: 'a' }),
      ]),
    );
  });

  it('goes close on the hero first on the line that says what they want', () => {
    const lines = linesOf([
      ['b', 'The race starts at noon.', 'a'],
      ['c', 'I want that cup more than anything.', 'a'],
      ['a', 'I need to win this race.', 'b'],
    ]);
    expect(grammar(lines)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ beat: 1, shot: 'close', on: 'c' }),
      ]),
    );
    // With the hero known, theirs only.
    const hero = grammar(lines, { hero: 'a' });
    expect(hero).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ beat: 2, shot: 'close', on: 'a' }),
      ]),
    );
    expect(hero.some((one) => one.beat === 1 && one.shot === 'close')).toBe(
      false,
    );
  });

  it('cuts to whom a line that lands is said to as it ends, held into their answer', () => {
    const camera = grammar(
      linesOf([
        ['a', 'Where were you all day?', 'b'],
        ['a', 'Tell me, or else I tell Mum.', 'b'],
        ['b', 'Fine. It was me.', 'a'],
      ]),
    );
    const reaction = camera.find((one) => one.after === 0);
    expect(reaction).toMatchObject({ beat: 1, shot: 'close', on: 'b' });
    // The answer is seen in it: no shot of its own.
    expect(
      camera.some((one) => one.beat === 2 && one.after === undefined),
    ).toBe(false);
  });

  it('keeps reaction shots apart, and closes on a reveal', () => {
    const camera = grammar(
      linesOf([
        ['a', 'Hello there.', 'b'],
        ['a', 'You took my pen!', 'b'],
        ['a', 'You broke my cup too!', 'b'],
        ['b', 'Guess what? I found the key!', 'a'],
      ]),
    );
    const reactions = camera.filter((one) => one.after === 0);
    const at = (beat: number) => 500 + beat * 3000;
    for (let i = 1; i < reactions.length; i += 1)
      expect(
        at(reactions[i].beat) - at(reactions[i - 1].beat),
      ).toBeGreaterThanOrEqual(REACTION_APART_MS);
    // The reveal close on who says it: its own close, or the reaction
    // shot before it held into it.
    expect(
      camera.some(
        (one) =>
          one.shot === 'close' &&
          one.on === 'b' &&
          (one.beat === 3 || (one.beat === 2 && one.after === 0)),
      ),
    ).toBe(true);
  });
});

// ── The whole stage: a listener turned in, never their back ────────────────

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

describe('a listener on the whole stage', () => {
  it('is turned in three-quarter to someone behind who speaks, not shown from behind', () => {
    const near = { x: 700, y: 360, w: 220, h: 440, d: 0.95 };
    const far = { x: 820, y: 330, w: 150, h: 300, d: 0.1 };
    const scene = {
      things: [person('ada'), person('kofi')],
      steps: [
        {
          atMs: 0,
          layout: 'one' as const,
          show: ['ada', 'kofi'],
          arrows: [],
          enter: {},
          focus: null,
        },
      ],
      stagings: {
        wide: { w: 1600, h: 900, places: [{ ada: near, kofi: far }] },
        box: { w: 1600, h: 900, places: [{ ada: near, kofi: far }] },
      },
      acting: {
        // Kofi, far back, speaks; Ada, near, listens to him.
        kofi: { look: [[1000, 'ada', 0.5]], mouth: [[1100, '1'.repeat(60)]] },
        ada: { look: [[1200, 'kofi', 0.5]] },
      },
      durationMs: 6000,
    } as Parameters<typeof viewsOf>[0];
    const views = viewsOf(scene).ada;
    const at = (t: number) => [...views].reverse().find(([k]) => k <= t)!;
    expect(at(2000)[1]).toBe('3q');
    expect(views.some(([at, view]) => at < 3300 && view === 'back')).toBe(
      false,
    );
    // Once he stops, she looks back at him round as far as profile: a
    // look never turns her back to the camera.
    expect(at(4000)[1]).toBe('profile');
  });
});

// ── A new place seen whole first (K1) ──────────────────────────────────────

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
const line = (who: string, to: string, say: string) => ({
  ...blank,
  kind: 'line',
  who,
  to,
  say,
  from: 'here',
});
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
const BIBLE = bibleOf({
  characters: [
    {
      id: 'sam',
      name: 'Sam',
      kind: 'person',
      role: 'lead',
      look: 'a teenage girl in a yellow hoodie',
      figure: figure({ age: 'teen', hair: 'ponytail', topColour: 'yellow' }),
      size: null,
      voice: 'girl',
      voicePick: 1,
      traits: ['proud', 'stern'],
      carries: null,
    },
    {
      id: 'alex',
      name: 'Alex',
      kind: 'person',
      role: 'supporting',
      look: 'a small boy in a green t-shirt',
      figure: figure({ age: 'child', hair: 'curly', topColour: 'green' }),
      size: null,
      voice: 'boy',
      voicePick: 1,
      traits: ['cheeky', 'guilty'],
      carries: null,
    },
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
const ARGUMENT = [
  line('sam', 'alex', 'Who ate the last piece of my cake?'),
  line('alex', 'sam', 'Not me. I was out in the garden all day.'),
  line('sam', 'alex', 'You were the only one home. You did this!'),
  line('alex', 'sam', 'No! Why do you always blame me?'),
  line('sam', 'alex', 'Tell me the truth, or else I tell Mum.'),
  line('alex', 'sam', 'Okay, okay. It was me. I am sorry.'),
  line('sam', 'alex', 'Careful, you still have cream on your nose.'),
  line('alex', 'sam', 'Please, can we share the next one?'),
];
const staged = (before?: { set?: string } | null) => {
  const sheet = storySheetOf({
    kind: 'story',
    title: 'Who ate the cake?',
    set: 'kitchen',
    time: 'day',
    weather: 'clear',
    crowd: 'none',
    mood: 'serious',
    music: 'calm',
    transition: 'cut',
    onStage: [
      {
        who: 'sam',
        spot: 'centre-left',
        pose: 'standing',
        face: 'angry',
        holding: null,
      },
      {
        who: 'alex',
        spot: 'centre-right',
        pose: 'standing',
        face: 'neutral',
        holding: null,
      },
    ],
    props: [],
    beats: ARGUMENT,
    camera: [],
  });
  const show = withFeatures(
    BIBLE,
    sheet.set,
    mendSheet(sheet, BIBLE, null).features,
  );
  return stageStory(
    repairSheet(sheet, show, null),
    show,
    before === undefined ? {} : { before },
  );
};

describe('a new place, seen whole first (K1)', () => {
  it('holds on the whole stage before the first line when the scene before was elsewhere, or there was none', () => {
    expect(staged(null).lead).toBeGreaterThanOrEqual(ESTABLISH_S);
    expect(staged({ set: 'garden' }).lead).toBeGreaterThanOrEqual(ESTABLISH_S);
    expect(staged({ set: 'kitchen' }).lead ?? 0).toBeLessThan(ESTABLISH_S);
  });
});

describe('a kitchen argument, made and checked', () => {
  const scene: SceneDto = voiced(staged(null)).scene;

  it('acts every line as what it does, on its key word', () => {
    const n = actingNumbers([scene]);
    expect(n.lines).toBe(ARGUMENT.length);
    expect(n.unacted).toEqual([]);
    expect(n.matching / n.lines).toBeGreaterThanOrEqual(0.9);
    expect(n.onKey / n.lines).toBeGreaterThanOrEqual(0.85);
    expect(n.reactedTo / n.lines).toBeGreaterThanOrEqual(0.75);
  });

  it("keeps the speakers' faces seen over 90% of the time they speak, and shows reactions", () => {
    const n = actingNumbers([scene]);
    expect(n.facesSeen).toBeGreaterThanOrEqual(FACES_SEEN_LEAST);
    expect(n.reactionsSeen).toBeGreaterThan(0.5);
    const report = shotReport(scene);
    // The shots cut the argument up: more than the whole stage.
    expect(report.some((shot) => shot.what !== 'wide')).toBe(true);
    // A reaction shot: close on whom a line that lands is said to.
    expect(
      report.some(
        (shot) =>
          shot.what.startsWith('close on') &&
          shot.lines.length > 0 &&
          shot.fromMs <
            (scene.beats.find((b) => b.startMs >= shot.fromMs)?.startMs ??
              Infinity),
      ),
    ).toBe(true);
  });

  it('never sees a speaker from behind as the one speaking', () => {
    const says = scene.effects.filter((e) => e.do === 'say' && e.say);
    for (const said of says) {
      const t = said.atMs + 400;
      const view = [...(scene.acting?.[said.target]?.view ?? [])]
        .reverse()
        .find(([at]) => at <= t)?.[1];
      expect(view === 'back' || view === 'back3q').toBe(false);
      expect(faceSeenAt(scene, said.target, t)).toBe(true);
    }
  });
});
