import { bibleOf, storySheetOf, type StorySheet } from './studio';
import { linesKept, mendSheet, sentBackFor } from './studio-check';

/**
 * The writer's slips put right without a word to the maker: an idiom read
 * as what it means ("takes a calm sip of tea" is a sip from the cup in
 * hand, never a thing called "calm"), a bus that goes by outside never
 * parked in the sitting room, and the lines of a scene written again as
 * asked kept, however the staging changes.
 */

const bible = bibleOf({
  characters: [
    { name: 'Ada', voice: 'girl', figure: { age: 'child' } },
    { name: 'Dad', voice: 'man', figure: { age: 'adult' } },
  ],
  sets: [
    {
      id: 'sitting-room',
      name: 'the sitting room',
      kind: 'indoor',
      look: 'a cosy sitting room with a sofa and a window',
      features: [
        { id: 'sofa', name: 'sofa', kind: 'sofa', spot: 'centre-left' },
        { id: 'window', name: 'window', kind: 'window', spot: 'back' },
        { id: 'door', name: 'door', kind: 'door', spot: 'right' },
      ],
    },
    {
      id: 'garage',
      name: 'the garage',
      kind: 'indoor',
      look: 'a garage with the family car and a workbench',
    },
  ],
});

const sheetOf = (
  set: string,
  beats: Record<string, unknown>[],
  holding: string | null = 'cup',
): StorySheet =>
  storySheetOf({
    title: 'Morning',
    set,
    onStage: [
      { who: 'ada', spot: 'left' },
      { who: 'dad', spot: 'centre-right', holding },
    ],
    beats,
  });

describe("the words' idioms, read as what they mean", () => {
  it('has "takes a sip" of tea drunk from the cup in hand, never a thing called "calm"', () => {
    for (const say of [
      'Dad takes a calm sip of tea.',
      'Dad takes a sip of his tea.',
      'Dad sips his tea.',
    ]) {
      const mended = mendSheet(
        sheetOf('sitting-room', [{ kind: 'action', who: 'dad', say }]),
        bible,
      );
      expect(mended.sheet.beats.map((b) => [b.do, b.thing])).toEqual([
        ['drink', 'cup'],
      ]);
      expect(mended.things).toEqual([]);
    }
  });

  it('never takes a word for a take', () => {
    const mended = mendSheet(
      sheetOf('sitting-room', [
        { kind: 'action', who: 'dad', say: 'Dad takes a quick look at Ada.' },
      ]),
      bible,
    );
    expect(mended.sheet.beats.map((b) => b.do)).toEqual(['look']);
    expect(mended.things).toEqual([]);
  });
});

describe('one thing by two names', () => {
  it('has "the red dress" and "the red party dress" on one sheet the one dress', () => {
    const dressed = bibleOf({
      ...bible,
      things: [
        { id: 'dress', name: 'dress', kind: 'thing', look: 'red' },
        { id: 'party-dress', name: 'party dress', kind: 'thing', look: 'red' },
      ],
    });
    const sheet = storySheetOf({
      title: 'Morning',
      set: 'sitting-room',
      onStage: [{ who: 'ada', spot: 'left' }],
      props: [
        { prop: 'party-dress', near: 'ada' },
        { prop: 'dress', near: 'ada' },
      ],
      beats: [
        {
          kind: 'business',
          who: 'ada',
          do: 'take',
          prop: 'dress',
          thing: 'dress',
          say: 'Ada takes the red dress from the sofa.',
        },
        {
          kind: 'business',
          who: 'ada',
          do: 'take',
          prop: 'party-dress',
          thing: 'party-dress',
          say: 'Ada takes the party-dress.',
        },
        {
          kind: 'business',
          who: 'ada',
          do: 'dress',
          prop: 'party-dress',
          thing: 'party-dress',
          say: 'Ada puts on the red party dress.',
        },
      ],
    });
    const mended = mendSheet(sheet, dressed);
    expect(mended.sheet.props.map((p) => p.prop)).toEqual(['party-dress']);
    expect(mended.sheet.beats.map((b) => [b.do, b.thing ?? b.prop])).toEqual([
      ['take', 'party-dress'],
      ['dress', 'party-dress'],
    ]);
  });
});

describe('clothes named by their own id', () => {
  it('reads "puts on the party-dress" as putting it on, never putting it down', () => {
    const dressed = bibleOf({
      ...bible,
      things: [{ id: 'party-dress', name: 'party dress', kind: 'thing' }],
    });
    const mended = mendSheet(
      storySheetOf({
        title: 'Morning',
        set: 'sitting-room',
        onStage: [{ who: 'ada', spot: 'left', holding: 'party-dress' }],
        beats: [
          {
            kind: 'business',
            who: 'ada',
            do: 'put',
            prop: 'party-dress',
            thing: 'party-dress',
            say: 'Ada puts on the party-dress.',
          },
        ],
      }),
      dressed,
    );
    expect(mended.sheet.beats.map((b) => [b.do, b.thing])).toEqual([
      ['dress', 'party-dress'],
    ]);
  });
});

describe('what goes by outside', () => {
  it('never parks a bus in a room it is only seen from', () => {
    const mended = mendSheet(
      sheetOf('sitting-room', [
        {
          kind: 'narration',
          say: 'Outside, the school bus drives past the window.',
        },
        {
          kind: 'action',
          who: 'dad',
          do: 'look',
          target: 'bus',
          say: 'Dad looks out at the school bus.',
        },
      ]),
      bible,
    );
    expect(mended.features.map((f) => f.kind)).not.toContain('vehicle');
  });

  it('keeps a car in the garage it is kept in', () => {
    const mended = mendSheet(
      sheetOf(
        'garage',
        [
          {
            kind: 'action',
            who: 'dad',
            do: 'walk',
            target: 'car',
            say: 'Dad walks over to the car.',
          },
        ],
        null,
      ),
      bible,
    );
    expect(mended.features.map((f) => f.kind)).toContain('vehicle');
  });
});

describe('a scene written again as asked', () => {
  const before = sheetOf('sitting-room', [
    { kind: 'line', who: 'ada', say: 'I could not sleep!' },
    {
      kind: 'action',
      who: 'ada',
      do: 'lie-down',
      target: 'sofa',
      say: 'Ada flops onto the sofa.',
    },
    { kind: 'line', who: 'dad', say: 'Come on, breakfast!' },
  ]);

  it('goes back to its writer for the lines it lost that no one asked to lose', () => {
    const after = sheetOf('sitting-room', [
      { kind: 'line', who: 'ada', say: 'I could not sleep!' },
      {
        kind: 'action',
        who: 'ada',
        do: 'sit',
        target: 'sofa',
        say: 'Ada sits on the sofa.',
      },
    ]);
    const lost = linesKept(before, after, 'Ada sits on the sofa instead');
    expect(lost).toHaveLength(1);
    expect(lost[0].message).toMatch(/dad: "Come on, breakfast!"/);
    expect(sentBackFor(lost)).toEqual(lost);
    // Asked to cut, or with every line kept: nothing.
    expect(linesKept(before, after, 'make it shorter')).toEqual([]);
    expect(linesKept(before, before, 'Ada sits on the sofa instead')).toEqual(
      [],
    );
  });
});
