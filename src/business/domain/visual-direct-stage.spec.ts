import { directStage, formFor, type StageNarration } from './visual-direct';
import {
  layoutStage,
  stageProblems,
  stillProblems,
  wordsOnStage,
} from './visual-stage';

const sentences = [
  'Every order starts at the shop, and it has one job to do.',
  'The shop sends the order down to the store room below it.',
  'The store room holds it, and holds the next one too.',
  'When the shelf is empty the order fails, and nobody is served.',
  'A second store room fixes that, and the shop stops waiting.',
  'Now there are three of them, and the work is shared out.',
  'They line up down the side, and the counter takes the front.',
  'Three store rooms serve one shop, which is the number to hold.',
  'Drop the shop for a moment and look only at the rooms.',
  'That is the shape of it, from an order to a shelf.',
];

const narration: StageNarration = {
  title: 'How an order is filled',
  sentences,
  sections: [
    {
      title: '1. The parts',
      cast: [
        { name: 'shop', looksLike: 'a building with a counter' },
        { name: 'store room', looksLike: 'shelves of stock' },
      ],
      beats: [
        { sentence: 0, about: ['shop'], does: 'introduces' },
        {
          sentence: 1,
          about: ['shop', 'store room'],
          does: 'sends',
          word: 'order',
        },
        { sentence: 2, about: ['store room'], does: 'counts', word: '2' },
        { sentence: 3, about: ['store room'], does: 'fails' },
      ],
    },
    {
      title: '2. More rooms',
      cast: [
        { name: 'shop', looksLike: 'a building with a counter' },
        { name: 'store room', looksLike: 'shelves of stock' },
      ],
      beats: [
        { sentence: 4, about: ['store room'], does: 'fixes' },
        { sentence: 5, about: ['store room'], does: 'copies' },
        { sentence: 6, about: ['store room'], does: 'rearranges' },
        { sentence: 7, about: ['store room'], does: 'counts' },
        { sentence: 8, about: ['shop'], does: 'removes' },
        { sentence: 9, about: ['store room'], does: 'focuses' },
      ],
    },
  ],
};

const scene = directStage(narration);
const beat = (n: number) =>
  scene.sections.flatMap((s) => s.beats).find((b) => b.sentence === n);

describe('a verb becomes events', () => {
  it('brings a thing on, sends something down a link, and marks a failure', () => {
    expect(beat(0)?.events.map((e) => e.do)).toEqual(['place']);
    expect(beat(2)?.events[0]).toMatchObject({ do: 'count', text: '2' });
    expect(beat(1)?.events.map((e) => e.do)).toEqual(['link', 'send']);
    expect(beat(1)?.events[0].text).toBe('order');
    expect(beat(3)?.events[0]).toMatchObject({ do: 'mark', badge: 'cross' });
    expect(beat(4)?.events[0]).toMatchObject({ do: 'mark', badge: 'tick' });
  });

  it('multiplies, rearranges, counts, removes and lights', () => {
    expect(beat(5)?.events[0]).toMatchObject({ do: 'copy', n: 3 });
    expect(beat(6)?.events[0].do).toBe('move');
    // "Three store rooms serve one shop" has no numeral, so the count
    // takes nothing and the sentence still does something.
    expect(beat(7)?.events[0].do).toBe('focus');
    expect(beat(8)?.events[0].do).toBe('drop');
    expect(beat(9)?.events[0].do).toBe('focus');
  });

  it('reads a numeral off the sentence when the writer gives none', () => {
    const counted = directStage({
      ...narration,
      sentences: sentences.map((s, i) =>
        i === 7 ? 'One shop is served by 3 store rooms in all.' : s,
      ),
    });
    const seven = counted.sections
      .flatMap((s) => s.beats)
      .find((b) => b.sentence === 7);
    expect(seven?.events[0]).toMatchObject({ do: 'count', text: '3' });
  });

  it('gives two flows two colours so they never read as one', () => {
    const two = directStage({
      ...narration,
      sections: [
        {
          ...narration.sections[0],
          beats: [
            ...narration.sections[0].beats,
            {
              sentence: 2,
              about: ['store room', 'shop'],
              does: 'connects',
              word: 'back',
            },
          ],
        },
        narration.sections[1],
      ],
    });
    const colours = two.sections[0].beats
      .flatMap((b) => b.events)
      .filter((e) => e.do === 'link')
      .map((e) => e.color);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('never leaves a sentence doing nothing, whatever the verb could not find', () => {
    const lost = directStage({
      ...narration,
      sections: [
        {
          ...narration.sections[0],
          beats: [
            { sentence: 0, about: ['shop'], does: 'introduces' },
            // A link that names one end falls back to the thing itself.
            { sentence: 1, about: ['shop'], does: 'connects' },
            { sentence: 2, about: ['nobody'], does: 'introduces' },
            { sentence: 3, about: ['store room'], does: 'fails' },
          ],
        },
      ],
    });
    const one = lost.sections[0].beats.find((b) => b.sentence === 1);
    expect(one?.events[0].do).toBe('place');
    // A thing the section never cast is dropped rather than drawn.
    expect(lost.sections[0].beats.some((b) => b.sentence === 2)).toBe(false);
  });
});

describe('what a thing is drawn as', () => {
  it('reads a form off what it looks like', () => {
    expect(formFor('a person at a desk')).toBe('person');
    expect(formFor('shelves of stock in a pile')).toBe('stack');
    expect(formFor('a tank that holds water')).toBe('store');
    expect(formFor('a signed form')).toBe('doc');
    expect(formFor('a valve that opens and shuts')).toBe('gate');
    expect(formFor('something nobody described')).toBe('box');
  });

  it('gives every thing a form even when the library has no drawing', () => {
    for (const section of scene.sections)
      for (const thing of section.cast) expect(thing.form).toBeTruthy();
  });
});

describe('what the rules hand on', () => {
  it('lays out without a problem and puts no sentence on the stage', () => {
    expect(stageProblems(scene)).toEqual([]);
    expect(wordsOnStage(layoutStage(scene))).toEqual([]);
  });

  it('keeps every sentence doing something', () => {
    const laid = layoutStage(scene);
    for (const segment of laid.segments)
      expect(segment.cues.length).toBeGreaterThan(0);
    expect(stillProblems(laid)).toEqual([]);
  });

  it('guards the promise: it names a sentence the stage sleeps through', () => {
    const laid = layoutStage(scene);
    const asleep = {
      ...laid,
      segments: laid.segments.map((segment, i) =>
        i === 2
          ? // Nothing at all.
            { ...segment, cues: [] }
          : i === 0
            ? // Thirteen words, and the last change on the first of them.
              { ...segment, cues: [segment.cues[0]] }
            : segment,
      ),
    };
    const said = stillProblems(asleep).join(' ');
    expect(said).toContain('Sentence 3 does nothing to the stage');
    expect(said).toContain('nothing changes after its');
  });
});
