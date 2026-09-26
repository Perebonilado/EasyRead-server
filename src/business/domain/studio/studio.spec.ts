import {
  bibleOf,
  briefMissing,
  briefOf,
  explainerSheetOf,
  outlineOf,
  secondsOf,
  storySheetOf,
  EMPTY_BRIEF,
} from './studio';
import {
  checkBible,
  checkExplainer,
  checkOutline,
  checkSheet,
  distinctVoices,
  endStateOf,
  errorsIn,
  mendSheet,
  repairExplainer,
  repairSheet,
  spelledNumbers,
} from './studio-check';
import { placeThingId, stageStory, storyBibleFor } from './studio-stage';

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
    const { sheet } = mendSheet(bad, bible);
    const rules = errorsIn(checkSheet(sheet, bible)).map((p) => p.rule);
    expect(rules).toContain('speaker');
    expect(rules).toContain('narrator');
    expect(rules).toContain('prop');
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
