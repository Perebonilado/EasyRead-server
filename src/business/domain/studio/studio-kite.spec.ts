import { bibleOf, namesOf, storySheetOf } from './studio';
import { endStateOf, mendSheet, withFound } from './studio-check';
import { caughtUpIn, openedOut, paintedAt, stageStory } from './studio-stage';
import { voiced } from './__fixtures__/voiced';
import { ownWords } from '../scene-own';
import { drawPiece } from '../scene-set-pieces';
import type { OwnPropDrawing } from '../scene-props';

/** "Kofi and the Kite": a boy, his grandmother, their dog, a kite and a palm on the beach. */
const bible = bibleOf({
  characters: [
    { name: 'Kofi', kind: 'person', voice: 'boy', figure: { age: 'child' } },
    {
      id: 'grandma',
      name: 'Grandmother',
      kind: 'person',
      voice: 'old woman',
      figure: { age: 'elder' },
    },
    { name: 'Zuri', kind: 'animal', look: 'a small tan dog', size: 'small' },
  ],
  things: [{ id: 'kite', name: 'kite' }],
  sets: [
    {
      id: 'beach',
      name: 'Sunny beach',
      kind: 'outdoor',
      features: [
        { id: 'palm', name: 'tall palm tree', kind: 'tree', spot: 'right' },
      ],
    },
  ],
});

const sheetOf = (beats: Record<string, unknown>[], extra = {}) =>
  storySheetOf({
    title: 'The kite',
    set: 'beach',
    onStage: [
      { who: 'grandma', spot: 'left' },
      { who: 'kofi', spot: 'centre-left', holding: 'kite' },
      { who: 'zuri', spot: 'centre' },
    ],
    beats,
    ...extra,
  });

/** A kite as the artist drew it. */
const KITE: OwnPropDrawing = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-35 -103 70 106"><path d="M0,-100 L30,-60 L0,-20 L-30,-60 Z" fill="#e0463a"/></svg>',
  viewBox: [-35, -103, 70, 106],
  grip: [1, -6],
  mouth: [0, -90],
  bite: [1, -6],
  size: 'medium',
  loose: { bounce: 0, spins: true },
};

describe('a kite caught up in a palm, and got down again', () => {
  const gust = sheetOf([
    {
      kind: 'business',
      who: 'kofi',
      do: 'raise',
      say: 'Kofi raises the kite into the wind.',
    },
    { kind: 'line', who: 'kofi', say: 'It is flying so high!' },
    {
      kind: 'narration',
      say: 'A sudden gust whips the kite into the tall palm tree.',
    },
    { kind: 'line', who: 'kofi', say: 'My kite is stuck in the palm!' },
  ]);

  it('reads the words that send a thing up into a feature, or find it caught there', () => {
    const things = [{ id: 'kite', words: ownWords('kite') }];
    const palm = bible.sets[0].features!;
    expect(
      caughtUpIn(
        'A sudden gust whips the kite into the tall palm tree.',
        things,
        palm,
      ),
    ).toEqual([{ thing: 'kite', feature: 'palm', at: 24 }]);
    expect(caughtUpIn('My kite is stuck in the palm!', things, palm)).toEqual([
      { thing: 'kite', feature: 'palm', at: 3 },
    ]);
    expect(
      caughtUpIn('Kofi flies his kite in the park.', things, palm),
    ).toEqual([]);
    expect(
      caughtUpIn('Kofi raises the kite into the wind.', things, palm),
    ).toEqual([]);
  });

  it('flies it out of his hand up into the palm as the gust is told, and leaves it there', () => {
    const mended = mendSheet(gust, bible);
    const grown = withFound(bible, 'beach', mended);
    const script = stageStory(mended.sheet, grown);
    const business = script.beats.flatMap((b) => b.business ?? []);
    expect(business.map((b) => [b.who, b.does, b.to])).toEqual([
      ['kofi', 'raise', null],
      ['kofi', 'throw', 'up:palm'],
    ]);
    // Once only: the line after finds it there already.
    const end = endStateOf(mended.sheet, grown);
    expect(end.props).toContainEqual({
      prop: 'kite',
      holder: null,
      gone: false,
      in: 'palm',
    });
    expect(end.held).toEqual([]);
    // The film: flown on its string once raised, and the palm drawn as a palm.
    const { scene } = voiced({
      ...script,
      drawn: { things: { kite: KITE } },
    });
    const kite = scene.props?.find((p) => p.id === 'kite');
    expect(kite?.flies).toBe(true);
    expect(kite?.does.map((d) => d[3] ?? null)).toEqual([null, 'up:palm']);
    const palm = scene.setting?.features?.find((f) => f.id === 'palm');
    expect(palm?.svg).toBe(drawPiece('tree', 'tall palm tree').svg);
    expect(palm?.up?.wide.y).toBeLessThan(palm!.at.wide.y + palm!.at.wide.h);
  });

  it('finds it still up there in the next scene: no one holds it, and no one lets go of it', () => {
    const before = endStateOf(
      mendSheet(gust, bible).sheet,
      withFound(bible, 'beach', mendSheet(gust, bible)),
    );
    // The writer has Kofi hold it, and let go of its string to climb.
    const next = sheetOf([
      { kind: 'line', who: 'kofi', say: 'Now I can climb!' },
      {
        kind: 'business',
        who: 'kofi',
        do: 'drop',
        say: 'Kofi lets go of the kite string.',
      },
      {
        kind: 'action',
        who: 'kofi',
        do: 'climb',
        target: 'palm',
        say: 'Kofi climbs the tall palm tree.',
      },
      {
        kind: 'action',
        who: 'kofi',
        do: 'walk',
        target: 'kite',
        spot: 'centre-left',
        say: 'Kofi goes over to the kite.',
      },
      {
        kind: 'business',
        who: 'kofi',
        do: 'take',
        say: 'Kofi pulls the kite free.',
      },
      {
        kind: 'business',
        who: 'kofi',
        do: 'drop',
        target: 'grandma',
        say: 'Kofi drops the kite down to Grandma.',
      },
      {
        kind: 'business',
        who: 'grandma',
        do: 'catch',
        say: 'Grandma catches the kite.',
      },
      { kind: 'line', who: 'grandma', say: 'Got it!' },
    ]);
    const mended = mendSheet(next, bible, before);
    expect(mended.sheet.onStage.find((p) => p.who === 'kofi')?.holding).toBe(
      null,
    );
    expect(mended.sheet.props).toContainEqual({
      prop: 'kite',
      near: null,
      in: 'palm',
    });
    expect(
      mended.sheet.beats
        .filter((b) => b.kind === 'business')
        .map((b) => [b.who, b.do]),
    ).toEqual([
      ['kofi', 'take'],
      ['kofi', 'drop'],
      ['grandma', 'catch'],
    ]);
    const grown = withFound(bible, 'beach', mended);
    const script = stageStory(mended.sheet, grown);
    expect(script.propsIn).toEqual({ kite: 'palm' });
    // Up the palm to it, and stays up there to take it.
    const kofi = script.steps
      .filter((s) => s.stage?.at?.kofi)
      .map((s) => s.stage!.at!.kofi);
    expect(kofi).toContain('up:palm');
    expect(kofi[kofi.length - 1]).toBe('up:palm');
    // Dropped down to Grandma, and caught as it comes.
    const business = script.beats.flatMap((b) => b.business ?? []);
    expect(business.map((b) => [b.who, b.does, b.to])).toEqual([
      ['kofi', 'take', null],
      ['kofi', 'throw', 'grandma'],
      ['grandma', 'catch', 'kofi'],
    ]);
    // Up the palm on the stage: his feet well above the people's ground.
    const { scene } = voiced({
      ...script,
      drawn: { things: { kite: KITE } },
    });
    const k = scene.steps.findIndex(
      (_, i) =>
        (scene.stagings.wide.places[i]?.kofi?.y ?? 900) <
        (scene.stagings.wide.places[0]?.kofi?.y ?? 0) - 100,
    );
    expect(k).toBeGreaterThan(0);
    expect(scene.props?.find((p) => p.id === 'kite')?.in).toBe('palm');
  });
});

describe('going somewhere to be seen going', () => {
  it('runs out and back where a run takes them nowhere new', () => {
    const sheet = sheetOf([
      { kind: 'line', who: 'kofi', say: 'Watch me!' },
      {
        kind: 'action',
        who: 'kofi',
        do: 'run',
        target: '@left',
        say: 'Kofi runs along the sand.',
      },
      { kind: 'line', who: 'grandma', say: 'So fast!' },
    ]);
    // Grandma stands where he would go: he runs out the other way and back.
    const mended = mendSheet(sheet, bible);
    const script = stageStory(mended.sheet, withFound(bible, 'beach', mended));
    const kofi = script.steps.flatMap((s) =>
      s.stage?.at?.kofi ? [s.stage.at.kofi] : [],
    );
    expect(kofi[0]).toBe('centre-left');
    expect(new Set(kofi).size).toBeGreaterThan(1);
    expect(kofi[kofi.length - 1]).toBe('centre-left');
  });

  it('has one the narrator says runs about with nowhere named run out and back as it is said', () => {
    const sheet = sheetOf([
      {
        kind: 'narration',
        say: "Zuri zigzags through the sand with Kofi's kite string.",
      },
      { kind: 'line', who: 'kofi', say: 'Silly dog!' },
    ]);
    const mended = mendSheet(sheet, bible);
    const script = stageStory(mended.sheet, withFound(bible, 'beach', mended));
    const zuri = script.steps.flatMap((s) =>
      s.stage?.at?.zuri ? [[s.stage.at.zuri, s.stage.going?.zuri?.pace]] : [],
    );
    expect(zuri.some(([at]) => at !== 'centre')).toBe(true);
    expect(zuri[zuri.length - 1]).toEqual(['centre', 'run']);
  });

  it('never runs on past the one gone after, and goes off after the last to go, the way they went', () => {
    const sheet = storySheetOf({
      title: 'Home',
      set: 'beach',
      onStage: [
        { who: 'kofi', spot: 'centre-left' },
        { who: 'zuri', spot: 'centre', holding: 'stick' },
        { who: 'grandma', spot: 'centre-right' },
      ],
      beats: [
        { kind: 'line', who: 'grandma', say: 'Wait for me!' },
        {
          kind: 'action',
          who: 'grandma',
          do: 'chase',
          target: 'kofi',
          say: 'Grandma runs after Kofi.',
        },
        { kind: 'line', who: 'kofi', say: 'Race you home!' },
        {
          kind: 'action',
          who: 'kofi',
          do: 'leave',
          say: 'Kofi runs off toward home.',
        },
        {
          kind: 'action',
          who: 'grandma',
          do: 'leave',
          say: 'Grandma follows.',
        },
        {
          kind: 'action',
          who: 'zuri',
          do: 'chase',
          say: 'Zuri runs after them with the stick.',
        },
      ],
    });
    const mended = mendSheet(sheet, bible);
    const script = stageStory(mended.sheet, withFound(bible, 'beach', mended));
    // Grandma stops this side of Kofi, with Zuri between them: never past him.
    const chased = script.steps.find((s) =>
      s.at.phrase.startsWith('Grandma runs'),
    )?.stage?.at?.grandma;
    expect(chased).toMatch(/^@0\.4/);
    // All three go off the same side, one after another.
    const sides = script.steps.flatMap((s) =>
      Object.entries(s.stage?.going ?? {}).flatMap(([who, how]) =>
        how.side ? [[who, how.side]] : [],
      ),
    );
    expect(new Set(sides.map(([, side]) => side)).size).toBe(1);
    expect(sides.map(([who]) => who)).toEqual(['kofi', 'grandma', 'zuri']);
  });

  it('calls someone by their id as a word as well as their name', () => {
    expect(namesOf(bible.characters.find((c) => c.id === 'grandma')!)).toEqual([
      'Grandmother',
      'Grandma',
    ]);
  });
});

describe('where the painting shows a feature', () => {
  it('stands it there as the stage reckons who goes where', () => {
    const painted = paintedAt({
      drawing: { parts: { 'f-palm': 'palm-group' } },
      ground: { boxes: { 'palm-group': [0.8, 0.4, 0.96, 0.8] } },
    });
    expect(painted).toEqual({ palm: 0.88 });
    // The list says the palm is on the left; the painting has it on the right.
    const left = {
      ...bible,
      sets: [
        {
          ...bible.sets[0],
          features: [{ ...bible.sets[0].features![0], spot: 'left' as const }],
        },
      ],
    };
    const sheet = sheetOf([
      { kind: 'line', who: 'kofi', say: 'Come on!' },
      {
        kind: 'action',
        who: 'kofi',
        do: 'run',
        target: 'palm',
        say: 'Kofi runs to the palm tree.',
      },
    ]);
    const mended = mendSheet(sheet, left);
    const script = stageStory(mended.sheet, withFound(left, 'beach', mended), {
      painted,
    });
    const to = script.steps.find((s) => s.at.phrase.startsWith('Kofi runs'))
      ?.stage?.at?.kofi;
    // Beside it on his side: its left, as it is painted on the right.
    expect(to).toBe('by:palm:-1');
    // Kept as the list says, for the set.
    expect(script.features?.[0].spot).toBe('left');
  });
});

describe('the camera', () => {
  it('opens out to the whole stage where the narrator tells of anyone not in the shot, or someone else makes a face', () => {
    const actors = bible.characters.map((c) => ({
      id: c.id,
      names: namesOf(c),
      gender: null,
    }));
    const sheet = sheetOf(
      [
        { kind: 'line', who: 'kofi', say: 'Look at my kite!' },
        { kind: 'narration', say: 'Kofi grins.' },
        { kind: 'narration', say: 'A bark comes from far away.' },
        { kind: 'line', who: 'kofi', say: 'Zuri?' },
        { kind: 'reaction', who: 'grandma', feeling: 'surprised' },
      ],
      {
        camera: [
          { beat: 0, shot: 'close', on: 'kofi' },
          { beat: 3, shot: 'close', on: 'kofi' },
        ],
      },
    );
    expect(openedOut(sheet, actors).map((s) => [s.beat, s.shot, s.on])).toEqual(
      [
        [0, 'close', 'kofi'],
        [2, 'wide', null],
        [3, 'close', 'kofi'],
        [4, 'wide', null],
      ],
    );
  });
});
