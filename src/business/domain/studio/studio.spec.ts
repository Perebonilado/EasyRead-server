import {
  bibleOf,
  briefMissing,
  briefOf,
  explainerSheetOf,
  outlineOf,
  secondsOf,
  storySheetOf,
  EMPTY_BRIEF,
  type SceneSheet,
} from './studio';
import {
  checkBible,
  checkExplainer,
  checkOutline,
  checkSheet,
  distinctVoices,
  endStateOf,
  foundIn,
  errorsIn,
  mendSheet,
  repairExplainer,
  repairSheet,
  spelledNumbers,
  type EndState,
} from './studio-check';
import { JOIN_SECONDS, joinOf, joinsSeconds, type Join } from './studio-edit';
import {
  fliesS,
  placeThingId,
  quietItem,
  stageStory,
  storyBibleFor,
  timeQuiet,
} from './studio-stage';
import {
  describeEnd,
  endBefore,
  pickedBeats,
  withFeatures,
  wordsFor,
} from './studio-check';
import { DOINGS, doingOf, featureStatesIn } from '../scene-doings';
import {
  featureStill,
  featureSvgAt,
  stepSvg,
  withoutStandIns,
} from '../scene-compose';
import { doingsIn } from '../scene-directions';
import { sceneFingerprint } from '../../handlers/studio/studio-views';
import { voiced } from './__fixtures__/voiced';
import { conventionGround } from '../scene-ground';
import type { GatedDrawing } from '../scene-svg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** "Tobi and Bingo": a boy loses his dog at the market. */
const bible = bibleOf({
  characters: [
    {
      name: 'Tobi',
      kind: 'person',
      role: 'main',
      voice: 'boy',
      traits: ['brave', 'curious'],
      figure: {
        age: 'child',
        hair: 'short',
        top: 't-shirt',
        topColour: 'yellow',
        skin: 8,
      },
    },
    {
      name: 'Mama',
      kind: 'person',
      role: 'supporting',
      voice: 'woman',
      traits: ['warm'],
      figure: {
        age: 'adult',
        hair: 'bun',
        top: 'dress',
        topColour: 'green',
        headwear: 'gele',
        skin: 8,
      },
    },
    {
      name: 'Bingo',
      kind: 'animal',
      role: 'main',
      voice: 'creature',
      look: 'a small brown dog with a white patch over one eye',
      size: 'small',
    },
  ],
  sets: [
    {
      name: 'Market',
      look: 'a busy open-air market in Lagos, stalls of fruit',
      kind: 'outdoor',
    },
    {
      name: 'Home',
      look: 'a small kitchen with a table',
      kind: 'indoor',
      stand: 'in',
      front: 'table',
    },
  ],
  world: { era: 'today', region: 'Lagos, Nigeria' },
});

const beat = (b: Record<string, unknown>) => b;

describe('the Studio: a scene decided before it is drawn', () => {
  it('makes a brief sound, and says what it still needs', () => {
    const brief = briefOf({
      format: 'story',
      idea: 'A boy loses his dog',
      minutes: 9,
      tone: 'nope',
    });
    expect(brief.minutes).toBe(5);
    expect(brief.tone).toBeNull();
    expect(briefMissing(brief)).toEqual(['audience', 'tone']);
    expect(
      briefMissing(briefOf({ audience: 'children', tone: 'gentle' }, brief)),
    ).toEqual([]);
    expect(briefMissing(EMPTY_BRIEF)).toContain('format');
  });

  it('keeps each character an id of their own, a person a figure, and each a voice apart', () => {
    expect(bible.characters.map((c) => c.id)).toEqual([
      'tobi',
      'mama',
      'bingo',
    ]);
    expect(bible.characters[0].figure?.age).toBe('child');
    expect(bible.characters[2].figure).toBeNull();
    const twins = bibleOf({
      characters: [
        { name: 'Ada', voice: 'girl', figure: { age: 'child', hair: 'afro' } },
        { name: 'Ada', voice: 'girl', figure: { age: 'child', hair: 'afro' } },
      ],
      sets: [{ name: 'School' }],
    });
    expect(twins.characters.map((c) => c.id)).toEqual(['ada', 'ada-2']);
    expect(checkBible(twins, true).join(' ')).toMatch(/look almost the same/);
    expect(checkBible(twins, true).join(' ')).toMatch(/same voice/);
    expect(checkBible(distinctVoices(twins), true).join(' ')).not.toMatch(
      /same voice/,
    );
  });

  it('holds an outline to the show: its places and people, and its length', () => {
    const outline = outlineOf({
      title: 'Where is Bingo?',
      scenes: [
        {
          title: 'Lost',
          summary: 'Bingo runs off',
          set: 'market',
          cast: ['tobi', 'bingo'],
          seconds: 40,
        },
        {
          title: 'Home',
          summary: 'Mama helps',
          set: 'the moon',
          cast: ['tobi', 'baba'],
          seconds: 40,
        },
      ],
    });
    const problems = checkOutline(outline, bible, 1.5, true);
    expect(problems.join(' ')).toMatch(/Scene 2 is set in "the moon"/);
    expect(problems.join(' ')).toMatch(/baba/);
    expect(problems.join(' ')).toMatch(/Mama is in no scene/);
  });

  it("holds a lesson's outline to what its narrator has time to say", () => {
    const page = (n: number) => Array(n).fill('word').join(' ');
    const lesson = (teach: string, seconds: number) =>
      outlineOf({
        title: 'Vaccines',
        scenes: [
          { title: 'Antigens', summary: 'What an antigen is', teach, seconds },
        ],
      });
    // 120 words is fifty seconds of talk: too much for twenty.
    expect(
      checkOutline(lesson(page(120), 20), bible, 0.33, false).join(' '),
    ).toMatch(/Scene 1 teaches 120 words in 20 seconds/);
    expect(checkOutline(lesson(page(120), 45), bible, 0.75, false)).toEqual([]);
    expect(
      checkOutline(lesson(page(10), 30), bible, 0.5, false).join(' '),
    ).toMatch(/says too little/);
  });

  const market = storySheetOf({
    title: 'Where is Bingo?',
    set: 'Market',
    time: 'day',
    crowd: 'many',
    mood: 'curious',
    music: 'curious',
    onStage: [
      { who: 'Tobi', spot: 'centre-left', face: 'happy' },
      { who: 'bingo', spot: 'centre-left' },
    ],
    props: [{ prop: 'fruit', near: 'mama' }],
    beats: [
      beat({
        kind: 'narration',
        say: 'The market was loud and full of people.',
      }),
      beat({
        kind: 'line',
        who: 'tobi',
        to: 'bingo',
        say: 'Stay close, Bingo!',
        feeling: 'happy',
      }),
      beat({
        kind: 'action',
        who: 'bingo',
        do: 'leave',
        say: 'Bingo runs off after a cat.',
      }),
      beat({ kind: 'reaction', who: 'tobi', feeling: 'afraid' }),
      beat({
        kind: 'line',
        who: 'Mama',
        to: 'tobi',
        say: 'Tobi, why are you shouting?',
        feeling: 'worried',
      }),
      beat({
        kind: 'business',
        who: 'mama',
        do: 'give',
        prop: 'fruit',
        to: 'tobi',
        say: 'Mama hands him a mango.',
      }),
      beat({
        kind: 'line',
        who: 'tobi',
        to: 'mama',
        say: 'Bingo is gone!',
        feeling: 'sad',
        pace: 'shout',
      }),
      beat({
        kind: 'business',
        who: 'tobi',
        do: 'eat',
        prop: 'fruit',
        say: 'He bites the mango.',
      }),
    ],
    camera: [{ beat: 6, shot: 'close', on: 'tobi' }],
  });

  it('mends what it can without changing the story, and says what it did', () => {
    const { sheet, mended } = mendSheet(market, bible);
    // Two on one spot: the second moves over.
    expect(sheet.onStage.map((p) => `${p.who}@${p.spot}`)).toEqual([
      'tobi@centre-left',
      'bingo@centre',
    ]);
    // Mama speaks without being there: she walks on first.
    const mama = sheet.beats.findIndex(
      (b) => b.kind === 'line' && b.who === 'mama',
    );
    expect(sheet.beats[mama - 1]).toMatchObject({
      kind: 'action',
      who: 'mama',
      do: 'enter',
    });
    // A feeling in other words is the nearest face.
    expect(sheet.beats[mama].feeling).toBe('afraid');
    // She takes the fruit up before she gives it.
    const give = sheet.beats.findIndex((b) => b.do === 'give');
    expect(sheet.beats[give - 1]).toMatchObject({
      kind: 'business',
      who: 'mama',
      do: 'take',
      prop: 'fruit',
    });
    expect(mended.join('; ')).toMatch(/walks on first/);
    expect(errorsIn(checkSheet(sheet, bible, 30))).toEqual([]);
  });

  it("finds what no mend can put right: a stranger speaking, a line in the narrator's mouth", () => {
    const bad = storySheetOf({
      ...market,
      beats: [
        beat({ kind: 'line', who: 'baba', say: 'Hello there, children.' }),
        beat({
          kind: 'narration',
          say: 'Mama said, "Come here this minute, Tobi, and help me."',
        }),
        beat({
          kind: 'business',
          who: 'tobi',
          do: 'break',
          prop: 'fruit',
          say: '',
        }),
      ],
    });
    const { sheet, mended } = mendSheet(bad, bible);
    const rules = errorsIn(checkSheet(sheet, bible)).map((p) => p.rule);
    expect(rules).toContain('speaker');
    expect(rules).toContain('narrator');
    // Only bread breaks: the fruit is not broken, and Tobi does the
    // closest thing he can, quietly, never a problem for anyone.
    expect(rules).not.toContain('prop');
    expect(sheet.beats[2]).toMatchObject({ who: 'tobi', do: 'nod' });
    expect(mended.join('; ')).toMatch(/only bread is broken/);
  });

  it('plays exactly the sheet: its people in their spots, entrances and exits where it says, the camera where it says', () => {
    const { sheet } = mendSheet(market, bible);
    const script = stageStory(sheet, bible);
    expect(script.cast.map((t) => t.id)).toEqual([
      placeThingId('market'),
      'tobi',
      'bingo',
      'mama',
    ]);
    expect(script.steps[0].stage).toMatchObject({
      show: ['tobi', 'bingo'],
      backdrop: 'place-market',
    });
    const leave = script.steps.find((s) => s.stage?.leave);
    expect(leave?.stage?.leave).toEqual(['bingo']);
    expect(leave?.stage?.show).toEqual(['tobi']);
    const arrive = script.steps.find((s) => s.stage?.arrive);
    expect(arrive?.stage?.arrive).toEqual(['mama']);
    // Every line is said by its own speaker, whole.
    const lines = script.beats.filter((b) => b.kind === 'line');
    expect(lines.map((b) => b.speaker)).toEqual(['tobi', 'mama', 'tobi']);
    expect(lines.every((b) => b.lines?.[0].span[1] === b.say.length)).toBe(
      true,
    );
    // The fruit: before Mama, taken, given, eaten.
    expect(script.propsNear).toEqual({ fruit: 'mama' });
    expect(
      script.beats.flatMap((b) =>
        (b.business ?? []).map((x) => `${x.who} ${x.does}`),
      ),
    ).toEqual(['mama take', 'mama give', 'tobi eat']);
    // Close on Tobi as he shouts.
    expect(script.camera).toEqual([
      { beat: 3, shot: 'close', on: 'tobi', with: null },
    ]);
    expect(script.setting?.crowd).toBe('many');
    // The crowd stands as its place has room for it: out of doors here.
    expect(script.setting?.place).toBe('outdoor');
  });

  it('quietly keeps a vessel to a few people, never a crowd', () => {
    const boat = {
      ...bible,
      sets: [
        ...bible.sets,
        {
          id: 'boat',
          name: 'Boat',
          look: 'a small fishing boat',
          kind: 'vessel' as const,
          stand: 'in' as const,
          front: "the boat's side",
          sound: null,
        },
      ],
    };
    const { sheet } = mendSheet(storySheetOf({ ...market, set: 'boat' }), boat);
    expect(sheet.crowd).toBe('few');
    expect(stageStory(sheet, boat).setting).toMatchObject({
      crowd: 'few',
      place: 'vessel',
    });
    // Nothing is said to the maker about it.
    expect(errorsIn(checkSheet(sheet, boat, 30))).toEqual([]);
  });

  it('carries the scene on: who it leaves on the stage, and what with', () => {
    const { sheet } = mendSheet(market, bible);
    const end = endStateOf(sheet);
    expect(end.onStage.map((p) => p.who).sort()).toEqual(['mama', 'tobi']);
    expect(end.props).toEqual([{ prop: 'fruit', holder: 'tobi', gone: true }]);
    expect(secondsOf(sheet)).toBeGreaterThan(8);
  });

  it("keeps the show as a book's story is kept, for the drawings and the voices", () => {
    const story = storyBibleFor(
      bible,
      [mendSheet(market, bible).sheet],
      'Where is Bingo?',
    );
    expect(story.characters.find((c) => c.id === 'bingo')).toMatchObject({
      kind: 'animal',
      size: 'small',
      voice: 'creature',
    });
    expect(story.places[0]).toMatchObject({ id: 'market', firstPage: 1 });
    expect(story.pages[0].present.map((p) => p.id)).toEqual(['tobi', 'bingo']);
  });
});

describe("the Studio's lessons, held to their own words", () => {
  const lesson = (when: string[]) =>
    explainerSheetOf({
      kind: 'explainer',
      title: 'The first response',
      draft: {
        fit: 'good',
        fitReason: null,
        title: 'The first response',
        mood: 'curious',
        beats: [
          {
            say: 'Antibody takes three to seven days to appear.',
            pause: 'short',
            delivery: 'explain',
          },
          {
            say: 'It peaks in one to two weeks.',
            pause: 'short',
            delivery: 'explain',
          },
          {
            say: 'Speed is exactly what is missing.',
            pause: 'long',
            delivery: 'key',
          },
        ],
        cast: [
          {
            id: 'timeline',
            kind: 'timeline',
            name: 'First response',
            brief: null,
            motion: null,
            parts: null,
            states: null,
            shape: null,
            value: null,
            style: null,
            sound: null,
            lines: null,
            plot: null,
            quote: null,
            phrases: null,
            ref: null,
            state: null,
            timeline: when.map((w) => ({ when: w, name: 'A step' })),
            chart: null,
          },
        ],
        steps: [
          {
            beat: 0,
            phrase: 'Antibody',
            layout: 'one',
            show: ['timeline'],
            arrows: null,
            effects: null,
          },
        ],
      },
    });
  const options = {
    teach: 'How slow the first response is',
    stage: null,
    maths: false,
    planned: null,
  };

  it('reads numbers said in words as digits', () => {
    expect(spelledNumbers('three to seven days, one to two weeks')).toEqual([
      3, 7, 1, 2,
    ]);
    expect(
      spelledNumbers('two thousand and five, forty-two, a hundred'),
    ).toEqual([2005, 42]);
  });

  it('shows the dates the scene says, and sends back one it never says', () => {
    const said = checkExplainer(lesson(['Days 3–7', '1–2 weeks']), options);
    expect(said.problems.map((p) => p.message).join(' ')).not.toMatch(/dates/);
    const made = checkExplainer(lesson(['Days 3–7', 'Day 30']), options);
    expect(made.problems.map((p) => p.message).join(' ')).toContain(
      'dates the scene never says: Day 30',
    );
    // Left so by the writer, it is set in type: nothing made up is drawn.
    const repaired = repairExplainer(lesson(['Days 3–7', 'Day 30']), options);
    expect(repaired.draft.cast[0]).toMatchObject({
      kind: 'words',
      timeline: null,
    });
    expect(errorsIn(checkExplainer(repaired, options).problems)).toEqual([]);
  });
});

describe('a story scene the writer left wrong', () => {
  it("is put right, never handed back: a line by a stranger left out, the place made the show's", () => {
    const wrong = storySheetOf({
      title: 'Lost',
      set: 'the moon',
      onStage: [{ who: 'tobi', spot: 'left' }],
      beats: [
        { kind: 'narration', say: 'The market is busy.' },
        { kind: 'line', who: 'tobi', say: 'Where is Bingo?' },
        { kind: 'line', who: 'zorg', say: 'I am not in this show.' },
        { kind: 'narration', say: 'Tobi looks everywhere.' },
      ],
      camera: [{ beat: 3, shot: 'wide' }],
    });
    expect(errorsIn(checkSheet(wrong, bible)).length).toBeGreaterThan(0);
    const fixed = repairSheet(wrong, bible);
    expect(errorsIn(checkSheet(fixed, bible))).toEqual([]);
    expect(fixed.set).toBe(bible.sets[0].id);
    expect(fixed.beats.map((b) => b.say)).toEqual([
      'The market is busy.',
      'Where is Bingo?',
      'Tobi looks everywhere.',
    ]);
    expect(fixed.camera.map((c) => c.beat)).toEqual([2]);
  });
});

describe('how the film joins one scene to the next', () => {
  const at = (more: Record<string, unknown>) =>
    storySheetOf({
      title: 'A scene',
      set: 'market',
      time: 'day',
      weather: 'clear',
      transition: 'cut',
      beats: [{ kind: 'narration', say: 'The market is busy.' }],
      ...more,
    });
  const market = at({});
  const lesson = explainerSheetOf({
    kind: 'explainer',
    title: 'Antigens',
    transition: 'cut',
    draft: { title: 'Antigens', beats: [], cast: [], steps: [] },
  });

  const joins: [string, Join, SceneSheet | null, SceneSheet][] = [
    ['the same place, time running on', 'cut', market, at({})],
    ['a new place', 'dissolve', market, at({ set: 'yard' })],
    ['the weather changing', 'dissolve', market, at({ weather: 'rain' })],
    ['the light changing', 'dip', market, at({ time: 'night' })],
    [
      'the writer saying time passes',
      'dip',
      market,
      at({ transition: 'fade' }),
    ],
    [
      'time passing in a new place',
      'dip',
      market,
      at({ set: 'yard', transition: 'fade' }),
    ],
    ["an explainer's next idea", 'dissolve', lesson, lesson],
    [
      "an explainer's scene where time passes",
      'dip',
      lesson,
      { ...lesson, transition: 'fade' },
    ],
    ['a scene before it not known', 'dissolve', null, market],
  ];
  it.each(joins)('%s: a %s', (_, join, before, sheet) => {
    expect(joinOf(before, sheet)).toBe(join);
  });

  it('counts the joins in the length of an outline', () => {
    expect(joinsSeconds(1)).toBe(0);
    expect(joinsSeconds(5)).toBe(4 * JOIN_SECONDS);
    // Six scenes of 13 s: 78 s said, and 10 s of joins. For a minute's
    // episode that is too long only once the joins are counted.
    const outline = outlineOf({
      title: 'Where is Bingo?',
      scenes: Array.from({ length: 6 }, (_, k) => ({
        title: `Scene ${k + 1}`,
        summary: 'Tobi looks for Bingo with Mama',
        set: 'market',
        cast: ['tobi', 'mama', 'bingo'],
        seconds: 13,
      })),
    });
    expect(checkOutline(outline, bible, 1.5, true).join(' ')).not.toMatch(
      /add up/,
    );
    expect(checkOutline(outline, bible, 1.0, true).join(' ')).toMatch(
      /add up to 78 seconds, and the joins between them about 10 more/,
    );
  });
});

/** The Maya show, as it was written and made: its cast and places, and each scene's sheet. */
const maya = (file: string): unknown =>
  JSON.parse(
    readFileSync(join(__dirname, '__fixtures__', 'maya', file), 'utf8'),
  );
const mayaBible = bibleOf(maya('bible.json'));
const mayaSheet = (n: number) => storySheetOf(maya(`s${n}-sheet.json`));

describe('the words win', () => {
  it("does what an action's words say, not the move the writer picked", () => {
    const { sheet, mended } = mendSheet(mayaSheet(1), mayaBible);
    const byWords = (say: string) => sheet.beats.find((b) => b.say === say);
    expect(byWords('Maya throws the ball for Pip.')).toMatchObject({
      kind: 'business',
      who: 'maya',
      do: 'throw',
      thing: 'ball',
      target: 'pip',
    });
    expect(byWords('Pip bounds after it.')).toMatchObject({
      do: 'chase',
      target: 'ball',
      pace: 'run',
    });
    expect(byWords('Pip races toward the gate.')).toMatchObject({
      do: 'run',
      target: 'gate',
      pace: 'run',
    });
    expect(byWords('Maya races out the gate.')).toMatchObject({
      do: 'leave',
      via: 'gate',
      pace: 'run',
    });
    expect(mended).toContain('beat 3: "throws" is a throw, not a reach');
  });

  it('reads "still" and a doing none of the list by their words, and never loses the beat', () => {
    const still = storySheetOf({
      ...(maya('s5-sheet.json') as object),
    });
    // "still" is no doing: kept as it was written, for its words.
    const chew = still.beats[8];
    expect(chew).toMatchObject({ do: null, doSaid: 'still' });
    const { sheet } = mendSheet(still, mayaBible);
    expect(
      sheet.beats.find((b) => b.say === "Pip chews Maya's shoe."),
    ).toMatchObject({
      who: 'pip',
      do: 'chew',
      target: 'maya',
    });
    // Two doings in one beat's words: a beat each, in order.
    const both = sheet.beats.findIndex((b) => b.say === 'Pip drops the ball.');
    expect(sheet.beats[both]).toMatchObject({ do: 'drop', thing: 'ball' });
    expect(sheet.beats[both + 1]).toMatchObject({
      who: 'pip',
      do: 'wag',
      say: 'Wags his tail.',
    });
    // Words that name nothing the stage does: the closest it has, a nod.
    const odd = mendSheet(
      storySheetOf({
        ...(maya('s5-sheet.json') as object),
        beats: [
          { kind: 'narration', say: 'Home at last.' },
          { kind: 'action', who: 'pip', do: 'teleport', say: 'Pip is here.' },
          { kind: 'line', who: 'maya', say: 'Hello, Pip!' },
        ],
      }),
      mayaBible,
    ).sheet;
    expect(odd.beats[1]).toMatchObject({
      who: 'pip',
      do: 'nod',
      doSaid: 'teleport',
    });
  });

  it('gives a thrower the thing first, and falls back for one who cannot', () => {
    const { sheet, mended } = mendSheet(
      storySheetOf({
        ...(maya('s2-sheet.json') as object),
        onStage: [
          { who: 'maya', spot: 'centre-left' },
          { who: 'tobi', spot: 'centre-right' },
        ],
        props: [{ prop: 'fruit', near: 'tobi' }],
        beats: [
          { kind: 'narration', say: 'The market is loud.' },
          {
            kind: 'action',
            who: 'tobi',
            do: 'reach',
            say: 'Tobi throws the fruit to Maya.',
          },
          {
            kind: 'action',
            who: 'maya',
            do: 'hop',
            say: 'Maya throws the ball to Tobi.',
          },
          {
            kind: 'action',
            who: 'tobi',
            do: 'nod',
            say: 'Tobi wags his finger.',
          },
          { kind: 'line', who: 'maya', say: 'Catch!' },
        ],
      }),
      mayaBible,
    );
    // The fruit was on the stall: taken up, then thrown.
    expect(sheet.beats[1]).toMatchObject({ do: 'take', prop: 'fruit' });
    expect(sheet.beats[2]).toMatchObject({ do: 'throw', prop: 'fruit' });
    // The ball in no one's hand: Maya has it from the start.
    expect(sheet.onStage.find((p) => p.who === 'maya')?.holding).toBe('ball');
    // A person has no tail to wag: a nod.
    expect(sheet.beats[4]).toMatchObject({ who: 'tobi', do: 'nod' });
    expect(mended.join('; ')).toMatch(/cannot do a wag/);
  });

  it('changes nothing when a mended sheet is mended again', () => {
    for (let n = 1; n <= 5; n += 1) {
      const once = mendSheet(mayaSheet(n), mayaBible).sheet;
      expect(mendSheet(once, mayaBible).sheet).toEqual(once);
    }
  });

  it('never leaves out a beat of the cast once repaired: the closest move, the words kept', () => {
    const fixed = repairSheet(
      storySheetOf({
        title: 'Hugs',
        set: 'market',
        onStage: [{ who: 'tobi', spot: 'left' }],
        beats: [
          { kind: 'narration', say: 'The market is busy.' },
          { kind: 'action', who: 'tobi', do: 'hug', say: 'Tobi hugs himself.' },
          { kind: 'line', who: 'tobi', say: 'Where is Bingo?' },
        ],
      }),
      bible,
    );
    expect(fixed.beats.map((b) => [b.who, b.do, b.say])).toEqual([
      [null, null, 'The market is busy.'],
      ['tobi', 'point', 'Tobi hugs himself.'],
      ['tobi', null, 'Where is Bingo?'],
    ]);
  });
});

describe('named things are there', () => {
  it('puts a thing a beat handles on the stage, and a feature the words name on the set for good', () => {
    const { sheet, features } = mendSheet(mayaSheet(1), mayaBible);
    // A way out on Pip's side, where no one stands to hide it.
    expect(features).toEqual([
      {
        id: 'gate',
        name: 'gate',
        kind: 'gate',
        spot: 'centre-right',
        opens: true,
      },
    ]);
    const grown = withFeatures(mayaBible, 'yard', features);
    expect(grown.sets.find((s) => s.id === 'yard')?.features?.[0].id).toBe(
      'gate',
    );
    // Once there, the next scene there finds it, and adds nothing.
    expect(mendSheet(mayaSheet(5), grown).features).toEqual([]);
    // Pip goes out by it, and Maya after him by the same.
    expect(
      sheet.beats.filter((b) => b.via === 'gate').map((b) => [b.who, b.do]),
    ).toEqual([
      ['pip', 'squeeze'],
      ['maya', 'leave'],
    ]);
    // A cup picked up that the sheet never set out is set out; so is the
    // shoe Pip chews, which the words name.
    const cup = mendSheet(
      storySheetOf({ ...(maya('s5-sheet.json') as object), props: [] }),
      mayaBible,
    ).sheet;
    expect(cup.props.map((p) => p.prop)).toEqual(['cup', 'shoe']);
    // A set's own vehicle is no feature of it: the danfo they ride in.
    const bus = mendSheet(mayaSheet(3), mayaBible);
    expect(bus.features.map((f) => f.id)).toEqual(['bench', 'door']);
  });

  it('keeps a scene made before a feature joined its set as it was made', () => {
    const sheet = mendSheet(mayaSheet(5), mayaBible).sheet;
    const grown = withFeatures(mayaBible, 'yard', [
      { id: 'well', name: 'well', kind: 'well', spot: 'back', opens: false },
    ]);
    expect(sceneFingerprint(sheet, grown, EMPTY_BRIEF)).toBe(
      sceneFingerprint(sheet, mayaBible, EMPTY_BRIEF),
    );
  });
});

describe('held things carry on', () => {
  it('ends with the ball where the scene left it, and says so to the next writer', () => {
    const s4 = mendSheet(mayaSheet(4), mayaBible).sheet;
    const end = endStateOf(s4);
    expect(end.held).toContainEqual({ who: 'pip', thing: 'ball' });
    expect(describeEnd(end, mayaBible)).toMatch(
      /Pip has the ball in their mouth/,
    );
    // The next scene has Maya holding it too: Pip keeps it.
    const s5 = mendSheet(
      storySheetOf({
        ...(maya('s5-sheet.json') as object),
        onStage: [
          { who: 'maya', spot: 'left', holding: 'ball' },
          { who: 'pip', spot: 'right', holding: null },
        ],
      }),
      mayaBible,
      end,
    );
    expect(s5.sheet.onStage.map((p) => [p.who, p.holding])).toEqual([
      ['maya', null],
      ['pip', 'ball'],
    ]);
  });

  it('never gives someone their usual thing when the sheet says their hands are empty', () => {
    const s2 = mendSheet(mayaSheet(2), mayaBible).sheet;
    const script = stageStory(s2, mayaBible);
    const cast = (id: string) =>
      script.cast.find((t) => t.id === id) as { holding?: string };
    // Maya always carries a ball, but not in this scene.
    expect(mayaBible.characters.find((c) => c.id === 'maya')?.carries).toBe(
      'ball',
    );
    expect(cast('maya').holding).toBeUndefined();
    expect(script.props).not.toContain('ball');
    // Tobi's magnifier is a thing of its own, in his hand as it opens.
    expect(cast('tobi').holding).toBeUndefined();
    expect(script.propsHeld?.magnifier).toEqual({ by: 'tobi', in: 'hand' });
  });
});

describe('a show as its scenes find it', () => {
  it('has every feature the words name on its set, the scenes in order, and writes nothing', () => {
    const bare = {
      ...mayaBible,
      sets: mayaBible.sets.map((set) => ({ ...set, features: undefined })),
    };
    const rows = [1, 2, 3, 4, 5].map((n) => ({
      position: n - 1,
      sheet: mayaSheet(n),
    }));
    const found = foundIn(bare, rows);
    const ids = (set: string) =>
      found.sets.find((s) => s.id === set)?.features?.map((f) => f.id) ?? [];
    expect(ids('yard')).toContain('gate');
    expect(ids('field')).toContain('goalpost');
    expect(ids('bus')).toContain('bench');
    expect(bare.sets.every((set) => !set.features)).toBe(true);
    // Found again, nothing more.
    expect(foundIn(found, rows)).toEqual(found);
  });
});

describe('a place on the move', () => {
  it('rattles a danfo on the road and slides the road past; a yard stays put', () => {
    const scene = (n: number) =>
      voiced(stageStory(repairSheet(mayaSheet(n), mayaBible), mayaBible), [
        'pip',
      ]).scene;
    expect(scene(3).setting?.moving).toBe(true);
    expect(scene(1).setting?.moving).toBeUndefined();
  });
});

describe('things in order', () => {
  const staged = () => {
    const s5 = repairSheet(mayaSheet(5), mayaBible);
    return { sheet: s5, ...voiced(stageStory(s5, mayaBible), ['pip']) };
  };

  it('hands the cup over at its own moment, after the line, one after another', () => {
    const { scene, beats } = staged();
    const line = beats.find((b) => b.text === 'He led us all over town!')!;
    const does = scene.props?.find((p) => p.id === 'cup')?.does ?? [];
    expect(
      does.map(([, who, what, to]) => `${who} ${what}${to ? ` ${to}` : ''}`),
    ).toEqual(['mama take', 'mama give maya', 'maya drink']);
    const times = does.map(([at]) => at);
    for (let i = 1; i < times.length; i += 1)
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    // None during the line: its clip starts after the last word.
    expect(times[0] - 1100 * 0.5).toBeGreaterThanOrEqual(line.endMs);
    // The drink starts only once the cup is in Maya's hand.
    const give = times[1];
    const drink = times[2];
    expect(drink - 1800 * 0.5).toBeGreaterThanOrEqual(give);
    // And all of it in the quiet: none runs on into the next line.
    const next = beats[beats.indexOf(line) + 1];
    const shoe = scene.props?.find((p) => p.id === 'shoe')?.does ?? [];
    for (const [at] of [...does, ...shoe])
      expect(at).toBeLessThan(next.startMs);
  });

  it('brings the giver beside the one she gives to, never reaching through someone', () => {
    const { sheet } = staged();
    const give = sheet.beats.findIndex((b) => b.do === 'give');
    expect(sheet.beats[give - 1]).toMatchObject({
      who: 'mama',
      do: 'walk',
      target: 'maya',
    });
  });

  it('shows every laugh at the end in full, one joining the next', () => {
    const { scene } = staged();
    const laughs = ['tobi', 'maya', 'mama'].map((id) =>
      scene.acting?.[id]?.moves?.find(([, move]) => move === 'laugh'),
    );
    expect(laughs.every(Boolean)).toBe(true);
    const starts = laughs.map((l) => l![0]);
    expect(starts[1]).toBeGreaterThan(starts[0]);
    expect(starts[2]).toBeGreaterThan(starts[1]);
    // They overlap, each joining in at the one before's moment…
    expect(starts[1]).toBeLessThan(starts[0] + laughs[0]![2]);
    // …and the scene holds until the last is done.
    const last = laughs[2]!;
    expect(scene.settledMs ?? 0).toBeGreaterThanOrEqual(last[0] + last[2]);
    expect(scene.durationMs).toBeGreaterThanOrEqual(last[0] + last[2]);
  });
});

describe('directions from targets', () => {
  it('looks after the one who went, down the street, never at the ground', () => {
    const { sheet } = mendSheet(mayaSheet(1), mayaBible);
    const look = sheet.beats.find(
      (b) => b.say === 'Mama looks down the street.',
    );
    // Maya went off out of the gate, on the right.
    expect(look).toMatchObject({ do: 'look', target: '@right' });
    const script = stageStory(sheet, mayaBible);
    const effects = script.steps.flatMap((s) => s.effects);
    expect(effects).toContainEqual(
      expect.objectContaining({ target: 'mama', do: 'look', part: '@right' }),
    );
    expect(effects.some((e) => e.part === '@down')).toBe(false);
  });

  it('points and leans toward a feature itself, wherever the stage stands it', () => {
    const grown = withFeatures(
      mayaBible,
      'bus',
      mendSheet(mayaSheet(3), mayaBible).features,
    );
    const sheet = repairSheet(mayaSheet(3), grown);
    const effects = stageStory(sheet, grown).steps.flatMap((s) => s.effects);
    // Tobi points out to the door.
    expect(effects).toContainEqual(
      expect.objectContaining({ target: 'tobi', do: 'point', part: 'f:door' }),
    );
    // He looks under the bench: down low on bent legs, toward it.
    expect(effects).toContainEqual(
      expect.objectContaining({
        target: 'tobi',
        do: 'crouch',
        part: 'f:bench',
      }),
    );
  });
});

describe('animals and people act the words', () => {
  const acted = (n: number) => {
    let before: EndState | null = null;
    let show = mayaBible;
    for (let k = 1; k <= n; k += 1) {
      const raw = mayaSheet(k);
      show = withFeatures(show, raw.set, mendSheet(raw, show, before).features);
      const sheet = repairSheet(raw, show, before);
      if (k === n)
        return { sheet, script: stageStory(sheet, show, { before }) };
      before = endStateOf(sheet, show, before);
    }
    throw new Error('no scene');
  };

  it("plays each of the body's own doings as its own move, never a hop in its place", () => {
    const { sheet, script } = acted(4);
    const effects = script.steps.flatMap((s) => s.effects);
    // "Pip wags his tail and licks Maya's face": a wag, and a lick toward her.
    expect(sheet.beats.some((b) => b.do === 'wag')).toBe(true);
    expect(effects).toContainEqual(
      expect.objectContaining({ target: 'pip', do: 'wag' }),
    );
    expect(effects).toContainEqual(
      expect.objectContaining({ target: 'pip', do: 'lick', part: 'maya' }),
    );
    for (const doing of ['wag', 'lick', 'sniff', 'jump', 'sit', 'lie-down'])
      expect(doingOf(doing)!.plays).not.toEqual({ move: 'hop' });
  });

  it('has an animal jump for its sign of jumping, which it has not got drawn', () => {
    const { script } = acted(4);
    expect(script.steps.flatMap((s) => s.effects)).toContainEqual(
      expect.objectContaining({ target: 'pip', do: 'jump', ms: 1100 }),
    );
  });

  it('has an animal lying as the scene opens lie there, until it gets up', () => {
    const { script } = acted(3);
    expect(script.steps[0].effects).toContainEqual({
      target: 'pip',
      part: null,
      do: 'lie',
    });
  });

  it('kicks at nothing, and chews on nothing, as moves of their own', () => {
    expect(doingOf('kick')!.bare).toBe('kick');
    expect(doingOf('chew')!.bare).toBe('chew');
    const sheet = repairSheet(
      storySheetOf({
        title: 'Kick',
        set: 'field',
        onStage: [
          { who: 'tobi', spot: 'left' },
          { who: 'pip', spot: 'right' },
        ],
        beats: [
          { kind: 'narration', say: 'The field is wide.' },
          {
            kind: 'action',
            who: 'tobi',
            do: 'kick',
            say: 'Tobi kicks the air.',
          },
          { kind: 'action', who: 'pip', do: 'chew', say: 'Pip chews.' },
          { kind: 'line', who: 'tobi', say: 'Missed!' },
        ],
      }),
      mayaBible,
    );
    const effects = stageStory(sheet, mayaBible).steps.flatMap(
      (s) => s.effects,
    );
    expect(effects).toContainEqual(
      expect.objectContaining({ target: 'tobi', do: 'kick' }),
    );
    expect(effects).toContainEqual(
      expect.objectContaining({ target: 'pip', do: 'chew' }),
    );
  });
});

describe('the quiet between lines', () => {
  const item = (who: string, s: number, keyAt = 0.5, handles = false) => ({
    who,
    s,
    leastS: s / 2,
    keyAt,
    handles,
    pause: false,
  });

  it('starts what someone else does at the moment of the one before, and waits for the same one', () => {
    // A throw (its release at 0.45), a chase after it, a pick-up by the chaser.
    const { starts, total } = timeQuiet([
      item('maya', 1.4, 0.45),
      item('pip', 1.2, 0.6),
      item('pip', 1.1, 0.5, true),
    ]);
    expect(starts).toEqual([0, 0.78, 1.98]);
    expect(total).toBe(3.08);
  });

  it('hands things over one after another, and a pause waits for all', () => {
    const { starts } = timeQuiet([
      item('mama', 1.1, 0.5, true),
      item('mama', 1.6, 0.62, true),
      item('maya', 1.8, 0.5, true),
      { who: null, s: 1, leastS: 1, keyAt: 1, handles: false, pause: true },
    ]);
    expect(starts).toEqual([0, 1.1, 2.7, 4.5]);
  });

  it('quickens a quiet longer than six seconds to fit, and the writer is asked to break it', () => {
    const long = Array.from({ length: 6 }, () => item('tobi', 1.5));
    const { total, asked } = timeQuiet(long);
    expect(asked).toBe(9);
    expect(total).toBeLessThanOrEqual(6);
    const sheet = storySheetOf({
      title: 'Crying',
      set: 'market',
      onStage: [{ who: 'tobi', spot: 'left' }],
      beats: [
        beat({ kind: 'narration', say: 'The market is busy today.' }),
        ...Array.from({ length: 5 }, () =>
          beat({ kind: 'action', who: 'tobi', do: 'sob', say: 'Tobi sobs.' }),
        ),
        beat({ kind: 'line', who: 'tobi', say: 'Where is Bingo?' }),
      ],
    });
    expect(
      checkSheet(mendSheet(sheet, bible).sheet, bible).map((p) => p.rule),
    ).toContain('quiet');
    expect(quietItem(sheet.beats[1])).toMatchObject({ s: 2.6, who: 'tobi' });
  });
});

describe('a move picked by hand', () => {
  it('becomes words that say it, for every doing, so the words still win', () => {
    const actors = mayaBible.characters.map((c) => ({
      id: c.id,
      names: [c.name, c.name.split(/\s+/)[0]],
    }));
    const wrong = DOINGS.flatMap((doing) => {
      const who = doing.by.includes('person') ? 'maya' : 'pip';
      const target = doing.aims.includes('character')
        ? 'tobi'
        : doing.aims.includes('feature')
          ? 'gate'
          : undefined;
      const said = wordsFor(
        {
          kind: doing.kind === 'handle' ? 'business' : 'action',
          who,
          to: null,
          say: '',
          feeling: null,
          sign: null,
          do: doing.id,
          prop: null,
          spot: null,
          from: null,
          pace: null,
          seconds: null,
          // Only a thing worn is put on, as only food is eaten.
          ...(doing.thing
            ? { thing: doing.id === 'dress' ? 'coat' : 'ball' }
            : {}),
          ...(target ? { target } : {}),
        },
        mayaBible,
      );
      const read = doingsIn(said, { actors, who }).map((r) => r.do);
      return read.length === 1 && read[0] === doing.id
        ? []
        : [`${doing.id}: "${said}" reads as ${read.join(', ') || 'nothing'}`];
    });
    expect(wrong).toEqual([]);
  });
});

describe('things apart from the people who hold them', () => {
  /** The five Maya scenes, each mended and staged on how the one before it left things. */
  const episode = () => {
    let show = mayaBible;
    let before: ReturnType<typeof endStateOf> | null = null;
    return [1, 2, 3, 4, 5].map((n) => {
      show = withFeatures(
        show,
        mayaSheet(n).set,
        mendSheet(mayaSheet(n), show, before).features,
      );
      const sheet = repairSheet(mayaSheet(n), show, before);
      const script = stageStory(sheet, show, { before });
      const was = before;
      before = endStateOf(sheet, show, before);
      return { sheet, script, before: was, end: before, show };
    });
  };

  it('sees a throw for Pip: the ball in her hand as it opens, let go after her line, past him, run to and taken up in his mouth', () => {
    const [s1] = episode();
    // Her ball is a thing of its own, in her hand; never drawn into her.
    expect(s1.script.propsHeld?.ball).toEqual({ by: 'maya', in: 'hand' });
    expect(
      (s1.script.cast.find((t) => t.id === 'maya') as { holding?: string })
        .holding,
    ).toBeUndefined();
    const { scene, beats } = voiced(s1.script, ['pip']);
    const ball = scene.props?.find((p) => p.id === 'ball');
    expect(ball?.held).toEqual({ by: 'maya', in: 'r' });
    expect(ball).toMatchObject({ bounce: 2, rolls: true, spins: true });
    const [throwIt, takeIt] = ball?.does ?? [];
    // "Pip bounds after it": it goes onto the ground away from him (short
    // of him, with the gate in the way past him), for him to run to.
    expect(throwIt.slice(1, 3)).toEqual(['maya', 'throw']);
    const lands = Number(String(throwIt[3]).slice(1));
    const pip = (k: number) => scene.stagings.wide.places[k].pip;
    const across = (k: number) =>
      (pip(k).x + pip(k).w / 2) / scene.stagings.wide.w;
    expect(Math.abs(lands - across(0))).toBeGreaterThan(0.1);
    // He runs to it, and takes it up there, after it lands.
    const ran = scene.steps.findIndex(
      (step, k) =>
        k > 0 &&
        pip(k) &&
        pip(k - 1) &&
        Math.abs(across(k) - across(k - 1)) > 0.05,
    );
    expect(ran).toBeGreaterThan(0);
    expect(scene.steps[ran].atMs).toBeGreaterThan(throwIt[0]);
    expect(Math.abs(across(ran) - lands)).toBeLessThan(0.1);
    expect(takeIt.slice(1, 3)).toEqual(['pip', 'take']);
    expect(takeIt[0]).toBeGreaterThan(scene.steps[ran].atMs);
    // Let go after "Catch the ball!", its wind-up starting only then.
    const line = beats.find((b) => b.text === 'Ready, Pip? Catch the ball!')!;
    expect(throwIt[0] - 1400 * 0.45).toBeGreaterThanOrEqual(line.endMs);
    // Pip is drawn by the artist: he takes it up with his mouth.
    expect(scene.things.find((t) => t.id === 'pip')).not.toHaveProperty('rig');
  });

  it('has a thing thrown to someone who does not go after it caught as it arrives', () => {
    const sheet = storySheetOf({
      ...(maya('s1-sheet.json') as object),
      onStage: [
        { who: 'maya', spot: 'left', holding: 'ball' },
        { who: 'tobi', spot: 'centre' },
      ],
      props: [],
      beats: [
        { kind: 'line', who: 'maya', say: 'Catch, Tobi!' },
        {
          kind: 'business',
          who: 'maya',
          say: 'Maya throws the ball to Tobi.',
        },
        { kind: 'line', who: 'tobi', say: 'Got it!' },
      ],
    });
    const { scene } = voiced(
      stageStory(repairSheet(sheet, mayaBible), mayaBible),
      ['pip'],
    );
    const [throwIt, catchIt] =
      scene.props?.find((p) => p.id === 'ball')?.does ?? [];
    expect(throwIt.slice(1)).toEqual(['maya', 'throw', 'tobi']);
    expect(catchIt.slice(1)).toEqual(['tobi', 'catch', 'maya']);
    // Caught as long after as it flies, from the left to the centre.
    expect(catchIt[0] - throwIt[0]).toBe(Math.round(fliesS(2) * 1000));
  });

  it('carries who holds what from scene to scene, and where things lie', () => {
    const [s1, s2, s3, s4, s5] = episode();
    // Pip ran off with the ball in his mouth.
    expect(s1.end.held).toContainEqual({ who: 'pip', thing: 'ball' });
    expect(describeEnd(s1.end, mayaBible)).toMatch(
      /Pip has the ball in their mouth/,
    );
    // Tobi picks up the chewed pepper, and comes onto the bus with it and
    // his magnifier; Maya, empty-handed at the market, comes on with nothing.
    expect(s2.end.held).toEqual(
      expect.arrayContaining([
        { who: 'tobi', thing: 'pepper' },
        { who: 'tobi', thing: 'magnifier' },
      ]),
    );
    expect(s3.script.propsHeld?.magnifier?.by).toBe('tobi');
    expect(s3.script.propsHeld?.pepper?.by).toBe('tobi');
    expect(s3.script.propsHeld?.ball).toBeUndefined();
    // On the field he has the ball again, as the sheet says; at home he
    // drops it, and it lies where he stood.
    expect(s4.script.propsHeld?.ball).toEqual({ by: 'pip', in: 'mouth' });
    const ball = s5.end.props.find((p) => p.prop === 'ball');
    expect(ball).toMatchObject({ holder: null, at: 'right' });
    expect(describeEnd(s5.end, mayaBible)).toMatch(
      /Things left lying there: the ball on the right/,
    );
  });

  it('mends a scene that has the ball in two places: whoever the scene before left it with keeps it', () => {
    const [, , , s4] = episode();
    const s5 = mendSheet(
      storySheetOf({
        ...(maya('s5-sheet.json') as object),
        onStage: [
          { who: 'maya', spot: 'left', holding: 'ball' },
          { who: 'pip', spot: 'right', holding: null },
        ],
        props: [{ prop: 'ball', near: 'maya' }],
      }),
      mayaBible,
      s4.end,
    );
    expect(s5.sheet.onStage.map((p) => [p.who, p.holding])).toEqual([
      ['maya', null],
      ['pip', 'ball'],
    ]);
    // And it is not on the ground as well.
    expect(s5.sheet.props.map((p) => p.prop)).not.toContain('ball');
    expect(
      checkSheet(s5.sheet, mayaBible, null, s4.end).filter(
        (p) => p.rule === 'continuity' && p.level === 'error',
      ),
    ).toEqual([]);
  });

  it("keeps one thing in an animal's mouth: a second is taken only once the first is dropped", () => {
    const { sheet } = mendSheet(
      storySheetOf({
        ...(maya('s4-sheet.json') as object),
        props: [{ prop: 'bone', near: 'pip' }],
        beats: [
          { kind: 'line', who: 'maya', to: 'pip', say: 'Look, Pip!' },
          { kind: 'business', who: 'pip', say: 'Pip picks up the bone.' },
          { kind: 'line', who: 'tobi', to: 'maya', say: 'He loves bones.' },
        ],
      }),
      mayaBible,
    );
    expect(
      sheet.beats
        .filter((b) => b.kind === 'business')
        .map((b) => `${b.who} ${b.do} ${b.prop}`),
    ).toEqual(['pip drop ball', 'pip take bone']);
    const end = endStateOf(sheet, mayaBible);
    expect(end.held).toContainEqual({ who: 'pip', thing: 'bone' });
    expect(end.props.find((p) => p.prop === 'ball')?.holder).toBeNull();
  });

  it('never has someone let go of what they do not hold', () => {
    const sheet = storySheetOf({
      ...(maya('s1-sheet.json') as object),
      onStage: [
        { who: 'maya', spot: 'left', holding: null },
        { who: 'pip', spot: 'centre', holding: 'ball' },
      ],
      props: [],
      beats: [
        { kind: 'line', who: 'maya', to: 'pip', say: 'Ready, Pip?' },
        {
          kind: 'business',
          who: 'maya',
          do: 'throw',
          prop: 'ball',
          to: 'pip',
          say: 'Maya throws the ball.',
        },
        { kind: 'line', who: 'maya', to: 'pip', say: 'Go on!' },
      ],
    });
    // As written, she throws what Pip has.
    expect(
      checkSheet(sheet, mayaBible).some(
        (p) => p.rule === 'prop' && /does not have the ball/.test(p.message),
      ),
    ).toBe(true);
    // Mended, she does the nearest she can instead, and nothing is taken from him.
    const fixed = mendSheet(sheet, mayaBible).sheet;
    expect(fixed.beats[1]).toMatchObject({ who: 'maya', do: 'point' });
    expect(endStateOf(fixed, mayaBible).held).toContainEqual({
      who: 'pip',
      thing: 'ball',
    });
  });
});

describe("the set's features, and everyone at a station of their own", () => {
  /** A Maya scene staged on its set as the episode has grown it, with a made-up voice. */
  const staged = (n: number) => {
    let grown = mayaBible;
    for (let k = 1; k <= n; k += 1)
      grown = withFeatures(
        grown,
        mayaSheet(k).set,
        mendSheet(mayaSheet(k), grown).features,
      );
    const sheet = repairSheet(mayaSheet(n), grown);
    const script = stageStory(sheet, grown);
    return { sheet, script, ...voiced(script, ['pip']) };
  };
  const middle = (p: { x: number; w: number }) => p.x + p.w / 2;

  it('goes out by the gate on its side, and Maya after him the same way', () => {
    const { scene } = staged(1);
    const gate = scene.setting?.features?.find((f) => f.id === 'gate');
    // The gate is the stage's own drawing: its leaf swings about its hinge.
    expect(gate?.svg).toContain('id="leaf"');
    expect(gate?.leaf?.id).toBe('leaf');
    expect(gate?.way.wide.x).toBeGreaterThan(800);
    const exits = scene.steps.flatMap((step) =>
      Object.entries(step.exit ?? {}).map(([who, exit]) => ({ who, ...exit })),
    );
    expect(exits).toEqual([
      { who: 'pip', side: 'right', via: 'gate', how: 'squeeze' },
      { who: 'maya', side: 'right', via: 'gate', how: 'run' },
    ]);
  });

  it('runs to the gate and stands beside it, not on it, quicker than a walk', () => {
    const { scene } = staged(1);
    const gate = scene.setting!.features!.find((f) => f.id === 'gate')!;
    // The run just before he goes under it (the one before is to the ball).
    const k = scene.steps.findIndex(
      (step, i) =>
        step.pace?.pip === 'run' &&
        scene.steps[i + 1] &&
        !scene.steps[i + 1].show.includes('pip'),
    );
    expect(k).toBeGreaterThan(0);
    for (const staging of ['box', 'wide'] as const) {
      const was = scene.stagings[staging].places[k - 1].pip;
      const now = scene.stagings[staging].places[k].pip;
      const at = gate.at[staging];
      // Across toward it, and beside it: at its post, clear of its way through.
      expect(Math.abs(middle(now) - middle(at))).toBeLessThan(
        Math.abs(middle(was) - middle(at)),
      );
      expect(Math.abs(middle(now) - gate.way[staging].x)).toBeGreaterThan(
        at.w / 3,
      );
      expect(Math.abs(middle(now) - middle(was))).toBeGreaterThan(
        scene.stagings[staging].w * 0.02,
      );
    }
  });

  it('hides nothing with a close shot: the gate is seen swing shut, a shot on Pip going comes as he goes', () => {
    const { scene } = staged(1);
    const zooms = scene.effects.filter((e) => e.do === 'zoom');
    const shut = scene.setting!.featureStates!.find(
      ([, id, state]) => id === 'gate' && state === 'shut',
    )!;
    for (const zoom of zooms)
      expect(zoom.atMs > shut[0] || zoom.untilMs! < shut[0]).toBe(true);
    // No close shot is on anyone while Pip goes under the gate.
    const gone = scene.steps.findIndex(
      (step, k) => k > 0 && !step.show.includes('pip'),
    );
    const going = scene.steps[gone].atMs;
    for (const zoom of zooms.filter((z) => z.target !== 'pip'))
      expect(zoom.atMs >= going + 1100 || zoom.untilMs! <= going).toBe(true);
  });

  it('keeps everyone where they stand when someone comes or goes: no one drifts', () => {
    let checked = 0;
    for (const n of [1, 3, 5]) {
      const { scene, script } = staged(n);
      expect(script.stations).toBe(true);
      scene.steps.forEach((step, k) => {
        const before = scene.steps[k - 1];
        if (!before) return;
        const came = step.show.filter((id) => !before.show.includes(id));
        const went = before.show.filter((id) => !step.show.includes(id));
        if (!came.length && !went.length) return;
        for (const staging of ['box', 'wide'] as const) {
          const places = scene.stagings[staging].places;
          for (const id of step.show)
            if (before.show.includes(id)) {
              checked += 1;
              expect(places[k][id]).toEqual(places[k - 1][id]);
            }
        }
      });
    }
    expect(checked).toBeGreaterThan(4);
  });

  it('swings the gate shut at the word, as the scene finds it open', () => {
    const { scene, beats } = staged(1);
    const gate = scene.setting!.features!.find((f) => f.id === 'gate')!;
    // "The gate is open a crack": open as the scene opens.
    expect(gate.open).toBe(true);
    const line = beats.find(
      (b) => b.text === 'The gate swings shut behind her.',
    )!;
    // As the word "shut" is said, a moment early as every step is.
    const shut = line.words[3][2];
    const [[at, id, state]] = scene.setting!.featureStates!;
    expect([id, state]).toEqual(['gate', 'shut']);
    expect(at).toBeLessThanOrEqual(shut);
    expect(at).toBeGreaterThan(shut - 300);
    // The film holds until it has swung.
    expect(scene.settledMs ?? 0).toBeGreaterThanOrEqual(at + 300);
    // "Mama shuts the gate": open until she does.
    const home = staged(5);
    const s5gate = home.scene.setting!.features!.find((f) => f.id === 'gate')!;
    expect(s5gate.open).toBe(true);
    expect(
      home.scene.setting?.featureStates?.map(([, id, state]) => [id, state]),
    ).toEqual([['gate', 'shut']]);
  });

  it('reads a feature opening or shutting, or how it stands, from the words', () => {
    const read = (text: string) =>
      featureStatesIn(text).map((one) => [one.word, one.state, one.still]);
    expect(read('The gate is open a crack.')).toEqual([['gate', 'open', true]]);
    // Only a little, which the stage shows so.
    expect(featureStatesIn('The gate is open a crack.')[0].ajar).toBe(true);
    expect(featureStatesIn('The door is slightly open.')[0].ajar).toBe(true);
    expect(featureStatesIn('The gate is open.')[0].ajar).toBeUndefined();
    expect(read('The gate swings shut behind her.')).toEqual([
      ['gate', 'shut', false],
    ]);
    expect(read('Back at the compound, Mama shuts the gate.')).toEqual([
      ['gate', 'shut', false],
    ]);
    expect(read('Tobi points to the open door.')).toEqual([
      ['door', 'open', true],
    ]);
    expect(read('The door opens and Tobi comes in.')).toEqual([
      ['door', 'open', false],
    ]);
    expect(read('Pip runs to the gate.')).toEqual([]);
    expect(read('That puppy is faster than a danfo!')).toEqual([]);
  });

  it('shows the stage’s own pieces on a still, as open as they are then, with the painter’s left out', () => {
    const { scene } = staged(1);
    const gate = scene.setting!.features!.find((f) => f.id === 'gate')!;
    // Open a crack as it opens, shut at the end.
    expect(featureSvgAt(scene, gate, 0)).toContain(
      '<g id="leaf" transform="translate(-76 -70) scale(0.18 1)',
    );
    expect(featureSvgAt(scene, gate, scene.durationMs)).toBe(gate.svg);
    const png = Buffer.from('png');
    const still = stepSvg(
      scene,
      new Map([[featureStill('gate'), png]]),
      'wide',
      0,
    );
    expect(still).toContain(
      `<image x="${gate.at.wide.x}" y="${gate.at.wide.y}" width="${gate.at.wide.w}"`,
    );
    const painted = {
      ...scene,
      setting: {
        ...scene.setting,
        features: [{ ...gate, painted: 'f-gate' }],
      },
    };
    expect(withoutStandIns(painted, '<svg viewBox="0 0 10 10"></svg>')).toBe(
      '<svg viewBox="0 0 10 10"><style>[id="f-gate"]{visibility:hidden}</style></svg>',
    );
  });

  it('stands its gate where the painter drew one, as large, and hides the painted one', () => {
    let grown = mayaBible;
    grown = withFeatures(
      grown,
      'yard',
      mendSheet(mayaSheet(1), grown).features,
    );
    const script = stageStory(repairSheet(mayaSheet(1), grown), grown);
    const yard: GatedDrawing = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><g id="f-gate"><rect x="1300" y="480" width="200" height="360"/></g></svg>',
      viewBox: [0, 0, 1600, 900],
      aspect: 16 / 9,
      parts: {},
      labels: {},
      states: {},
      moves: false,
      callouts: [],
      field: null,
      ground: {
        ...conventionGround(),
        boxes: { 'f-gate': [1300 / 1600, 480 / 900, 1500 / 1600, 840 / 900] },
      },
    };
    const { scene } = voiced(script, ['pip'], { 'place-yard': yard });
    const gate = scene.setting!.features!.find((f) => f.id === 'gate')!;
    expect(gate.painted).toBe('f-gate');
    // On the wide stage the set is the stage: the painter's own place.
    expect(gate.way.wide.y).toBeCloseTo(840, 0);
    expect(gate.at.wide.y + gate.at.wide.h).toBeGreaterThan(840);
    expect(gate.at.wide.x + gate.at.wide.w / 2).toBeCloseTo(1400, -1);
    // As tall as the painter drew it.
    expect(gate.at.wide.h).toBeGreaterThan(350);
    expect(gate.at.wide.h).toBeLessThan(420);
  });

  it('hides someone behind a feature, where it stands, drawn over them', () => {
    const sheet = storySheetOf({
      ...(maya('s1-sheet.json') as object),
      beats: [
        { kind: 'narration', say: 'Maya counts to ten by the mango tree.' },
        { kind: 'action', who: 'pip', say: 'Pip hides behind the tree.' },
        { kind: 'line', who: 'maya', say: 'Ready or not!' },
      ],
    });
    const grown = withFeatures(
      mayaBible,
      'yard',
      mendSheet(sheet, mayaBible).features,
    );
    const { scene } = voiced(stageStory(repairSheet(sheet, grown), grown), [
      'pip',
    ]);
    const k = scene.steps.findIndex((step) => step.behind?.pip);
    expect(scene.steps[k]?.behind).toEqual({ pip: 'tree' });
    const tree = scene.setting!.features!.find((f) => f.id === 'tree')!;
    const pip = scene.stagings.wide.places[k].pip;
    expect(pip.x + pip.w / 2).toBeCloseTo(
      tree.at.wide.x + tree.at.wide.w / 2,
      0,
    );
  });

  it('opens a way through that is shut for whoever goes out by it, never for a squeeze under it', () => {
    const sheet = storySheetOf({
      ...(maya('s1-sheet.json') as object),
      beats: [
        { kind: 'narration', say: 'The gate is shut.' },
        { kind: 'action', who: 'pip', say: 'Pip squeezes under the gate.' },
        { kind: 'line', who: 'maya', say: 'Pip, come back!' },
        { kind: 'action', who: 'maya', say: 'Maya runs out the gate.' },
      ],
    });
    const grown = withFeatures(
      mayaBible,
      'yard',
      mendSheet(sheet, mayaBible).features,
    );
    const script = stageStory(repairSheet(sheet, grown), grown);
    expect(script.features?.[0]).toMatchObject({ id: 'gate', opens: true });
    expect(script.features?.[0].open).toBeUndefined();
    // One opening, as Maya goes: after her line, not as Pip squeezes under.
    expect(
      script.featureStates?.map(({ beat, feature, state }) => ({
        beat,
        feature,
        state,
      })),
    ).toEqual([{ beat: 1, feature: 'gate', state: 'open' }]);
    expect(script.featureStates?.[0].after).toBeGreaterThanOrEqual(0);
  });
});

describe('what the check and the stage agree on', () => {
  const line = (who: string, say: string) => ({ kind: 'line', who, say });
  const act = (who: string, say: string, extra: object = {}) => ({
    kind: 'action',
    who,
    say,
    ...extra,
  });
  const yard = (onStage: object[], beats: object[], props: object[] = []) =>
    storySheetOf({
      ...(maya('s1-sheet.json') as object),
      props,
      onStage,
      beats,
    });

  it('makes no feature of words said in passing: a seat, a goal, the bus, her mother stands; only one someone is found by', () => {
    const sheet = yard(
      [
        { who: 'maya', spot: 'left' },
        { who: 'mama', spot: 'right' },
      ],
      [
        line('mama', 'Take a seat, Maya.'),
        line('maya', 'Our goal is to find Pip!'),
        line('mama', 'We must not miss the bus.'),
        { kind: 'narration', say: 'Her mother stands by the gate.' },
      ],
    );
    // Only the gate she stands by is there: no bench, goalpost, bus or stall.
    expect(mendSheet(sheet, mayaBible).features.map((f) => f.id)).toEqual([
      'gate',
    ]);
    // The narration telling one open or shut puts it there.
    const told = yard(
      [{ who: 'maya', spot: 'left' }],
      [
        { kind: 'narration', say: 'The gate is open a crack.' },
        line('maya', 'Hello!'),
      ],
    );
    expect(mendSheet(told, mayaBible).features.map((f) => f.id)).toEqual([
      'gate',
    ]);
  });

  it('never stands two people in one place: one walked over to, then one coming on', () => {
    const sheet = repairSheet(
      yard(
        [
          { who: 'maya', spot: 'left' },
          { who: 'mama', spot: 'right' },
        ],
        [
          line('maya', 'Mama, look at this.'),
          act('maya', 'Maya walks over to Mama.', { do: 'walk' }),
          line('mama', 'What is it?'),
          act('tobi', 'Tobi comes in.', { do: 'enter' }),
          line('tobi', 'Hello everyone.'),
        ],
      ),
      mayaBible,
    );
    // The check says where Maya went, so Tobi comes on somewhere else.
    const walk = sheet.beats.find((b) => b.do === 'walk');
    const enter = sheet.beats.find((b) => b.do === 'enter');
    expect(walk?.spot).toBe('centre-right');
    expect(enter?.spot).not.toBe(walk?.spot);
    const { scene } = voiced(stageStory(sheet, mayaBible), ['pip']);
    for (const places of scene.stagings.wide.places) {
      const xs = Object.values(places).map((p) => p.x + p.w / 2);
      for (const [i, a] of xs.entries())
        for (const b of xs.slice(i + 1))
          expect(Math.abs(a - b)).toBeGreaterThan(60);
    }
  });

  it('gets up before going anywhere: no one crosses the stage sitting', () => {
    const sheet = repairSheet(
      yard(
        [
          { who: 'maya', spot: 'left' },
          { who: 'mama', spot: 'right' },
        ],
        [
          line('maya', 'I am so tired today.'),
          act('maya', 'Maya sits down.'),
          line('mama', 'Come here, Maya.'),
          act('maya', 'Maya walks over to Mama.'),
          line('maya', 'Here I am, Mama.'),
        ],
      ),
      mayaBible,
    );
    const { scene } = voiced(stageStory(sheet, mayaBible), ['pip']);
    const sit = scene.acting?.maya?.moves?.find(([, move]) => move === 'sit');
    const k = scene.steps.findIndex(
      (step, i) =>
        i > 0 &&
        scene.stagings.wide.places[i].maya?.x !==
          scene.stagings.wide.places[i - 1].maya?.x,
    );
    expect(sit).toBeDefined();
    expect(k).toBeGreaterThan(0);
    expect(sit![0] + sit![2]).toBeLessThanOrEqual(scene.steps[k].atMs);
  });

  it('keeps the pace, the thing and the one given to that the maker picks', () => {
    const picked = (beat: object) =>
      mendSheet(
        yard(
          [
            { who: 'maya', spot: 'left', holding: 'cup' },
            { who: 'mama', spot: 'centre' },
            { who: 'tobi', spot: 'right' },
          ],
          [line('maya', 'Here we go.'), beat, line('mama', 'Thank you.')],
          [{ prop: 'ball', near: 'maya' }],
        ),
        mayaBible,
      ).sheet;
    // A run picked for a walk: said so, and run.
    const walk = picked(act('maya', 'Maya walks over to Mama.'));
    const k = walk.beats.findIndex((b) => b.do === 'walk');
    const ran = pickedBeats(
      walk.beats,
      walk.beats.map((b, i) => (i === k ? { ...b, pace: 'run' } : b)),
      mayaBible,
    );
    expect(ran[k].say).toBe('Maya runs over to Mama Nkechi.');
    const run = mendSheet({ ...walk, beats: ran }, mayaBible).sheet;
    expect(run.beats.find((b) => b.who === 'maya' && b.pace)?.pace).toBe('run');
    // The cup given to Tobi, not Mama, once picked.
    const give = picked({
      kind: 'business',
      who: 'maya',
      do: 'give',
      prop: 'cup',
      to: 'mama',
      say: 'Maya gives the cup to Mama.',
    });
    const g = give.beats.findIndex((b) => b.do === 'give');
    expect(give.beats[g]).toMatchObject({ target: 'mama', thing: 'cup' });
    const toTobi = pickedBeats(
      give.beats,
      give.beats.map((b, i) => (i === g ? { ...b, to: 'tobi' } : b)),
      mayaBible,
    );
    expect(toTobi[g].say).toBe('Maya gives the cup to Tobi.');
    expect(
      mendSheet({ ...give, beats: toTobi }, mayaBible).sheet.beats.find(
        (b) => b.do === 'give',
      ),
    ).toMatchObject({ to: 'tobi', target: 'tobi' });
    // The ball, not the cup, once picked.
    const ball = pickedBeats(
      give.beats,
      give.beats.map((b, i) => (i === g ? { ...b, prop: 'ball' } : b)),
      mayaBible,
    );
    expect(ball[g].say).toBe('Maya gives the ball to Mama Nkechi.');
  });

  it('holds a second thing in the other hand, and throws to a feature wherever each staging stands it', () => {
    const s2 = repairSheet(mayaSheet(2), mayaBible);
    const script = stageStory(s2, mayaBible);
    const { scene } = voiced(
      {
        ...script,
        props: [...new Set([...(script.props ?? []), 'fruit' as const])],
        propsHeld: {
          ...script.propsHeld,
          fruit: { by: 'tobi', in: 'hand' },
        },
      },
      ['pip'],
    );
    const held = (id: string) => scene.props?.find((p) => p.id === id)?.held;
    expect([held('magnifier')?.in, held('fruit')?.in].sort()).toEqual([
      'l',
      'r',
    ]);
    const sheet = storySheetOf({
      ...(maya('s1-sheet.json') as object),
      beats: [
        { kind: 'line', who: 'maya', say: 'Fetch, Pip!' },
        {
          kind: 'business',
          who: 'maya',
          say: 'Maya throws the ball over the gate.',
        },
        { kind: 'line', who: 'maya', say: 'Oh no.' },
      ],
    });
    const grown = withFeatures(
      mayaBible,
      'yard',
      mendSheet(sheet, mayaBible).features,
    );
    const thrown = voiced(stageStory(repairSheet(sheet, grown), grown), [
      'pip',
    ]).scene;
    expect(
      thrown.props?.find((p) => p.id === 'ball')?.does.map((d) => d[3]),
    ).toContain('f:gate');
  });

  it('carries on past a scene that is no story: what the one before left', () => {
    const s4 = { kind: 'story', ...(maya('s4-sheet.json') as object) };
    const end = endBefore(
      [
        { position: 0, sheet: storySheetOf(s4) },
        { position: 1, sheet: null },
        {
          position: 2,
          sheet: explainerSheetOf({ kind: 'explainer', draft: {} }),
        },
      ],
      3,
      mayaBible,
    );
    expect(end?.held).toContainEqual({ who: 'pip', thing: 'ball' });
  });
});

describe('where the words put people and things', () => {
  const withSet = (
    set: string,
    features: {
      id: string;
      kind: 'gate' | 'bench' | 'door' | 'goalpost' | 'crate';
      spot:
        'left' | 'centre-left' | 'centre' | 'centre-right' | 'right' | 'back';
    }[],
  ) =>
    withFeatures(
      mayaBible,
      set,
      features.map((f) => ({
        ...f,
        name: f.id,
        opens: f.kind === 'gate' || f.kind === 'door',
      })),
    );
  const staged = (sheet: SceneSheet, show: typeof mayaBible) => {
    const fixed = repairSheet(sheet as never, show);
    return { sheet: fixed, script: stageStory(fixed, show) };
  };

  it('finds someone where the words find them: under the bench from the first, by the goalpost where they ran', () => {
    const bus = withSet('bus', [{ id: 'bench', kind: 'bench', spot: 'right' }]);
    const found = staged(
      storySheetOf({
        ...(maya('s3-sheet.json') as object),
        onStage: [{ who: 'pip', spot: 'centre', pose: 'lying' }],
        beats: [
          {
            kind: 'action',
            who: 'maya',
            do: 'enter',
            spot: 'left',
            say: 'Maya comes in.',
          },
          { kind: 'line', who: 'maya', say: 'Where is Pip?' },
          { kind: 'line', who: 'maya', say: 'There! Under the bench!' },
        ],
      }),
      bus,
    );
    expect(found.script.steps[0].stage?.at?.pip).toBe('under:bench');
    const field = withSet('field', [
      { id: 'goalpost', kind: 'goalpost', spot: 'right' },
    ]);
    const ran = staged(
      storySheetOf({
        ...(maya('s4-sheet.json') as object),
        beats: [
          { kind: 'narration', say: 'The field is wide.' },
          { kind: 'action', who: 'pip', do: 'hop', say: 'Pip darts away.' },
          {
            kind: 'line',
            who: 'tobi',
            to: 'maya',
            say: 'There he is, by the goalpost!',
          },
        ],
      }),
      field,
    );
    expect(ran.sheet.beats.find((b) => b.who === 'pip')).toMatchObject({
      do: 'run',
      target: 'goalpost',
    });
    const at = ran.script.steps
      .filter((s) => s.stage)
      .map((s) => s.stage!.at!.pip);
    expect(at[at.length - 1]).toMatch(/^by:goalpost:/);
  });

  it('has one the narration says shuts the gate go to it and shut it with a hand', () => {
    const yard = withSet('yard', [
      { id: 'gate', kind: 'gate', spot: 'centre-right' },
    ]);
    const { script } = staged(
      storySheetOf({
        ...(maya('s5-sheet.json') as object),
        beats: [
          {
            kind: 'narration',
            say: 'Back at the compound, Mama shuts the gate.',
          },
          { kind: 'line', who: 'mama', say: 'Home safe.' },
        ],
      }),
      yard,
    );
    const went = script.steps.find((s) =>
      s.stage?.at?.mama?.startsWith('by:gate:'),
    );
    expect(went?.at.beat).toBe(0);
    expect(
      script.steps
        .flatMap((s) => s.effects)
        .find((e) => e.target === 'mama' && e.do === 'reach'),
    ).toMatchObject({ part: 'f:gate' });
    expect(script.featureStates).toEqual([
      expect.objectContaining({ feature: 'gate', state: 'shut' }),
    ]);
  });

  it('has one who shut a gate at the back go back over to the cup they left there before taking it up, as the stage has them', () => {
    const yard = withSet('yard', [{ id: 'gate', kind: 'gate', spot: 'back' }]);
    const { sheet, script } = staged(
      storySheetOf({
        ...(maya('s5-sheet.json') as object),
        beats: [
          {
            kind: 'narration',
            say: 'Back at the compound, Mama shuts the gate.',
          },
          { kind: 'line', who: 'mama', say: 'Home safe.' },
          {
            kind: 'business',
            who: 'mama',
            do: 'take',
            prop: 'cup',
            say: 'Mama picks up the cup.',
          },
        ],
      }),
      yard,
    );
    const take = sheet.beats.findIndex((b) => b.do === 'take');
    expect(sheet.beats[take - 1]).toMatchObject({
      who: 'mama',
      do: 'walk',
      target: 'cup',
    });
    // The stage has her by the gate, then back where the cup lies.
    const at = script.steps
      .filter((s) => s.stage?.at?.mama)
      .map((s) => s.stage!.at!.mama);
    expect(at[1]).toMatch(/^by:gate:/);
    expect(at[at.length - 1]).toBe('left');
  });

  it('brings one who comes in after someone in the way they came, and into a vessel by its door', () => {
    const bus = withSet('bus', [
      { id: 'door', kind: 'door', spot: 'centre-right' },
    ]);
    const { sheet, script } = staged(
      storySheetOf({
        ...(maya('s3-sheet.json') as object),
        onStage: [],
        beats: [
          { kind: 'narration', say: 'The danfo rattles on.' },
          {
            kind: 'action',
            who: 'maya',
            say: 'Maya jumps into the moving danfo.',
            spot: 'left',
          },
          {
            kind: 'action',
            who: 'tobi',
            say: 'Tobi jumps in after her.',
            spot: 'right',
          },
          { kind: 'line', who: 'maya', say: 'We made it!' },
        ],
      }),
      bus,
    );
    expect(
      sheet.beats.filter((b) => b.do === 'enter').map((b) => b.via),
    ).toEqual(['door', 'door']);
    const going = script.steps.flatMap((s) =>
      Object.entries(s.stage?.going ?? {}),
    );
    expect(going.map(([who, g]) => [who, g.via])).toEqual([
      ['maya', 'door'],
      ['tobi', 'door'],
    ]);
  });

  it('sets out a thing the words find, and goes over to a feature to do something close to it', () => {
    const market = withSet('market', [
      { id: 'crate', kind: 'crate', spot: 'right' },
    ]);
    const { sheet } = staged(
      storySheetOf({
        ...(maya('s2-sheet.json') as object),
        onStage: [
          { who: 'maya', spot: 'left' },
          { who: 'tobi', spot: 'centre-left' },
        ],
        props: [],
        beats: [
          { kind: 'narration', say: 'Market Road is loud.' },
          {
            kind: 'action',
            who: 'tobi',
            say: 'Tobi leans in close to a tomato crate.',
          },
          { kind: 'line', who: 'tobi', say: 'A tuft of white fur!' },
        ],
      }),
      market,
    );
    expect(sheet.props).toContainEqual({ prop: 'fur', near: 'tobi' });
    // A tomato crate is a crate, not a tomato.
    expect(sheet.props.map((p) => p.prop)).not.toContain('tomato');
    const lean = sheet.beats.findIndex((b) => b.do === 'lean-in');
    expect(sheet.beats[lean - 1]).toMatchObject({
      who: 'tobi',
      do: 'walk',
      target: 'crate',
    });
  });

  it('runs somewhere when it says so with nowhere named, and goes over to reach someone far off', () => {
    const { sheet } = staged(
      storySheetOf({
        ...(maya('s4-sheet.json') as object),
        beats: [
          { kind: 'narration', say: 'The field is wide.' },
          { kind: 'action', who: 'pip', do: 'hop', say: 'Pip darts away.' },
          { kind: 'action', who: 'maya', say: 'Maya reaches for Pip.' },
          { kind: 'line', who: 'maya', say: 'Got you!' },
        ],
      }),
      mayaBible,
    );
    // Pip opens at the right: across to the free spot farthest off.
    expect(sheet.beats.find((b) => b.who === 'pip')).toMatchObject({
      do: 'run',
      spot: 'centre-left',
    });
    const reach = sheet.beats.findIndex((b) => b.do === 'reach');
    expect(sheet.beats[reach].target).toBe('pip');
  });
});
