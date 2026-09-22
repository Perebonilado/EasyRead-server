import { STAGES } from './visual';
import {
  STAGE_LIMITS,
  layoutStage,
  placesFor,
  shapeOf,
  shorten,
  stageProblems,
  wordsOnStage,
  type StageScene,
} from './visual-stage';
import { knownPicture } from './visual-presets';

const sentences = [
  'A payment looks simple, so here is what moves.',
  'Start with the buyer, the person who taps the card.',
  'On the other side sits the seller, waiting to be paid.',
  'Between them is the bank, and nothing reaches the seller without it.',
  'The buyer sends the bank a request to pay, and the money does not move yet.',
  'The bank checks the account and either holds the amount or turns it down.',
  'When the account is short the request fails, and the buyer sees it fail.',
  'When there is enough the bank clears it, and the amount is set aside.',
  'Only then does the bank push the amount across to the seller.',
  'The seller now holds the money, and the buyer holds a receipt.',
  'One bank is a bottleneck, so a real network runs several of them.',
  'They sit in a line and share the work between them.',
  'That is the whole path, from a tap to a receipt.',
];

const scene: StageScene = {
  title: 'How a payment reaches a seller',
  sentences,
  sections: [
    {
      title: '1. Who is involved',
      cast: [
        { name: 'buyer', form: 'person' },
        { name: 'bank', form: 'box', color: 'blue' },
        { name: 'seller', form: 'person' },
      ],
      beats: [
        { sentence: 0, events: [{ do: 'place', what: ['bank'] }] },
        {
          sentence: 1,
          events: [
            { do: 'place', what: ['buyer'] },
            { do: 'name', what: ['buyer'] },
          ],
        },
        {
          sentence: 2,
          events: [
            { do: 'place', what: ['seller'] },
            { do: 'name', what: ['seller'] },
          ],
        },
        {
          sentence: 3,
          events: [
            { do: 'name', what: ['bank'] },
            { do: 'focus', what: ['bank'] },
          ],
        },
      ],
    },
    {
      title: '2. What moves',
      cast: [
        { name: 'buyer', form: 'person' },
        { name: 'bank', form: 'box', color: 'blue' },
        { name: 'seller', form: 'person' },
      ],
      beats: [
        {
          sentence: 4,
          events: [
            { do: 'link', what: ['buyer', 'bank'], text: 'request' },
            { do: 'count', what: ['bank'], text: '0' },
          ],
        },
        {
          sentence: 5,
          events: [
            { do: 'mark', what: ['bank'], badge: 'warn' },
            { do: 'focus', what: ['bank'] },
          ],
        },
        {
          sentence: 6,
          events: [
            { do: 'mark', what: ['buyer'], badge: 'cross' },
            { do: 'drop', what: ['buyer'] },
          ],
        },
        {
          sentence: 7,
          events: [
            { do: 'place', what: ['buyer'] },
            { do: 'mark', what: ['bank'], badge: 'tick' },
          ],
        },
        {
          sentence: 8,
          events: [
            { do: 'link', what: ['bank', 'seller'], text: 'payout' },
            { do: 'send', what: ['bank', 'seller'] },
          ],
        },
        {
          sentence: 9,
          events: [
            { do: 'count', what: ['seller'], text: '1' },
            { do: 'mark', what: ['seller'], badge: 'tick' },
          ],
        },
      ],
    },
    {
      title: '3. More than one',
      cast: [
        { name: 'bank', form: 'box', color: 'blue' },
        { name: 'queue', form: 'stack' },
      ],
      beats: [
        {
          sentence: 10,
          events: [
            { do: 'place', what: ['bank'] },
            { do: 'copy', what: ['bank'], n: 3 },
          ],
        },
        {
          sentence: 11,
          events: [
            { do: 'move', what: ['bank'] },
            { do: 'place', what: ['queue'] },
          ],
        },
        { sentence: 12, events: [{ do: 'focus', what: ['queue'] }] },
      ],
    },
  ],
};

const script = layoutStage(scene);
const cuesOf = (sentence: number) => script.segments[sentence].cues;
const did = (sentence: number) => cuesOf(sentence).map((c) => c.do);

describe('a scene a writer could hand in', () => {
  it('has nothing wrong with it', () => {
    expect(stageProblems(scene)).toEqual([]);
  });

  it('never leaves a sentence with nothing to do', () => {
    script.segments.forEach((segment, i) => {
      expect(segment.cues.length).toBeGreaterThan(0);
      expect(`${i}: ${segment.cues.length}`).not.toBe(`${i}: 0`);
    });
  });

  it('keeps the words on the stage down to names and marks', () => {
    expect(wordsOnStage(script)).toEqual([]);
  });

  it('wipes the stage once a section and never inside one', () => {
    const clears = script.segments.flatMap((s, i) =>
      s.cues.filter((c) => c.do === 'clear').map(() => i),
    );
    expect(clears).toEqual([4, 10]);
  });
});

describe('the events', () => {
  it('brings a thing on with its name', () => {
    const shown = cuesOf(1)
      .filter((c) => c.do === 'draw' || c.do === 'fade')
      .map((c) => c.target);
    expect(shown).toContain('s0t0');
    expect(shown).toContain('s0t0_n');
  });

  it('lands a cue on the word that says the thing', () => {
    // "Start with the buyer, ..." is the fourth word.
    const buyer = cuesOf(1).find((c) => c.target === 's0t0');
    expect(buyer?.at).toBe(3);
  });

  it('grows an arrow between two things and hangs its word on it', () => {
    const arrow = script.elements.find((e) => e.type === 'arrow');
    expect(arrow).toBeDefined();
    if (arrow?.type !== 'arrow') throw new Error('no arrow');
    expect(arrow.from).toBe('s1t0');
    expect(arrow.to).toBe('s1t1');
    const label = script.elements.find((e) => e.id === `${arrow.id}_n`);
    expect(label && 'text' in label ? label.text : null).toBe('request');
    expect(label?.on?.of).toBe(arrow.id);
  });

  it('sends a thing down the link and takes it off at the far end', () => {
    const packet = script.elements.find((e) => e.id.startsWith('s1p'));
    // It starts where the bank stands and lands where the seller does.
    const [, bank, seller] = placesFor(3).row;
    expect(packet && 'x' in packet ? [packet.x, packet.y] : null).toEqual([
      bank.x,
      bank.y,
    ]);
    expect(packet?.places?.[0]).toEqual({ x: seller.x, y: seller.y });
    const mine = cuesOf(8).filter((c) => c.target === packet?.id);
    expect(mine.map((c) => c.do)).toEqual(['fade', 'move', 'hide']);
    expect(mine[1].to).toBe(0);
  });

  it('lays a badge on the thing it marks, not beside it', () => {
    const badge = script.elements.find(
      (e) => e.type === 'icon' && e.on?.of === 's1t1',
    );
    expect(badge?.on?.corner).toBe('topRight');
  });

  it('takes a thing off with the arrows that touched it', () => {
    const gone = cuesOf(6)
      .filter((c) => c.do === 'hide')
      .map((c) => c.target);
    expect(gone).toContain('s1t0');
    expect(gone).toContain('s1t0_n');
    // The request arrow ran to the buyer, so it goes too.
    expect(gone.some((id) => /^s1l/.test(id))).toBe(true);
  });

  it('dims everything but the thing in focus, and lights it again after', () => {
    const dimmed = cuesOf(5).filter((c) => c.do === 'dim');
    expect(dimmed.length).toBeGreaterThan(0);
    expect(dimmed.every((c) => c.target !== 's1t1')).toBe(true);
    expect(did(6)).toContain('undim');
  });

  it('multiplies a thing out of itself', () => {
    const copies = script.elements.filter((e) => e.id.startsWith('s2c'));
    expect(copies).toHaveLength(2);
    expect(copies.every((c) => c.bornAt === 's2t0')).toBe(true);
    const at = cuesOf(10)
      .filter((c) => copies.some((copy) => copy.id === c.target))
      .map((c) => c.at);
    expect(at[0]).toBeLessThan(at[1]);
  });

  it('moves what is on the stage to its other place', () => {
    const moves = cuesOf(11).filter((c) => c.do === 'move');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((c) => c.to === 0)).toBe(true);
    const bank = script.elements.find((e) => e.id === 's2t0');
    expect(bank?.places?.[0]).toBeDefined();
  });

  it('gives two events of one sentence two different moments', () => {
    // The arrow is the first event, the count on the bank the second.
    const arrow = cuesOf(4).find((c) => /^s1l\d+$/.test(c.target));
    const count = cuesOf(4).find((c) => /^s1n\d+$/.test(c.target));
    expect(arrow).toBeDefined();
    expect(count).toBeDefined();
    expect(count!.at).toBeGreaterThan(arrow!.at);
  });
});

describe('what the writer is told off for', () => {
  const broken = (change: (s: StageScene) => StageScene) =>
    stageProblems(change(JSON.parse(JSON.stringify(scene)) as StageScene));

  it('a sentence that does nothing', () => {
    expect(
      broken((s) => {
        s.sections[0].beats = s.sections[0].beats.slice(0, 2);
        return s;
      }).join(' '),
    ).toContain('does nothing to the stage');
  });

  it('too many events for one sentence to show', () => {
    expect(
      broken((s) => {
        s.sections[1].beats[0].events = [
          { do: 'link', what: ['buyer', 'bank'] },
          { do: 'count', what: ['bank'], text: '1' },
          { do: 'mark', what: ['bank'], badge: 'tick' },
        ];
        return s;
      }).join(' '),
    ).toContain('two is as many as one sentence can show');
  });

  it('a thing the stage never brought on', () => {
    expect(
      broken((s) => {
        s.sections[0].beats[0].events = [{ do: 'place', what: ['courier'] }];
        return s;
      }).join(' '),
    ).toContain('not on this stage');
  });

  it('a sentence on the stage', () => {
    expect(
      broken((s) => {
        s.sections[1].beats[0].events[0].text =
          'the buyer asks the bank to pay';
        return s;
      }).join(' '),
    ).toContain('nothing on the stage runs past 4');
  });

  it('a cast nobody could hold', () => {
    expect(
      broken((s) => {
        s.sections[0].cast = [
          ...s.sections[0].cast,
          { name: 'a' },
          { name: 'b' },
          { name: 'c' },
          { name: 'd' },
          { name: 'e' },
        ];
        return s;
      }).join(' '),
    ).toContain('as many as a learner can hold');
  });

  it('a link that names one end', () => {
    expect(
      broken((s) => {
        s.sections[1].beats[0].events[0].what = ['buyer'];
        return s;
      }).join(' '),
    ).toContain('it needs 2');
  });
});

describe('where things stand', () => {
  it('spreads a cast across the stage and stacks it when it grows', () => {
    const three = placesFor(3);
    expect(three.row).toHaveLength(3);
    expect(three.row[0].x).toBeLessThan(three.row[2].x);
    expect(new Set(three.row.map((p) => p.y)).size).toBe(1);
    const five = placesFor(5);
    expect(five.row).toHaveLength(5);
    expect(new Set(five.row.map((p) => p.y)).size).toBe(2);
  });

  it('keeps everything inside the stage', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const { row, column } = placesFor(n);
      for (const p of [...row, ...column]) {
        expect(p.x - p.w / 2).toBeGreaterThanOrEqual(STAGES.box.M - 0.01);
        expect(p.x + p.w / 2).toBeLessThanOrEqual(
          STAGES.box.W - STAGES.box.M + 0.01,
        );
        expect(p.y - p.h / 2).toBeGreaterThanOrEqual(30);
        expect(p.y + p.h / 2).toBeLessThanOrEqual(STAGES.box.H - 20);
      }
    }
  });

  it('draws a thing smaller when it shares the stage', () => {
    expect(placesFor(1).row[0].w).toBeGreaterThan(placesFor(5).row[0].w);
  });
});

describe('cutting text', () => {
  it('cuts at a word, never mid-word, and keeps nothing empty', () => {
    expect(shorten('a very long label indeed', 3)).toBe('a very long');
    expect(shorten('kept')).toBe('kept');
    expect(shorten('  ')).toBeNull();
    expect(shorten(null)).toBeNull();
    expect(shorten('trailing,', 4)).toBe('trailing');
    expect(shorten('one two three four five')).toBe(
      'one two three four'.slice(0, 18),
    );
    expect(STAGE_LIMITS.maxRunWords).toBe(4);
  });
});

describe('what a thing is drawn as when the library is short', () => {
  it("takes the library's drawing when it has one", () => {
    expect(
      shapeOf({ name: 'kidney', picture: 'kidney' }, knownPicture),
    ).toEqual({ kind: 'kidney', words: false });
  });

  it('finds the name the library files it under', () => {
    // "screen images" is not a drawing; `images` is, and only a search
    // by meaning gets from one to the other.
    expect(
      shapeOf(
        { name: 'screen images', picture: 'screen images' },
        knownPicture,
      ),
    ).toEqual({ kind: 'images', words: false });
  });

  it("keeps the form's shape, and puts the name in it", () => {
    // The narrator gives nearly everything form "box". Treating a named
    // form as a drawing in its own right turned every undrawable thing
    // into an empty rounded rectangle with its name underneath.
    // A form the library has a drawing for keeps that drawing, and its
    // name goes underneath as any drawing's does.
    expect(
      shapeOf(
        { name: 'a decision', picture: 'decision', form: 'gate' },
        knownPicture,
      ),
    ).toEqual({ kind: 'diamond', words: false });
    expect(
      shapeOf(
        { name: 'EasiRead', picture: 'EasiRead', form: 'box' },
        knownPicture,
      ),
    ).toEqual({ kind: 'roundRect', words: true });
  });

  it('writes the words when nothing draws it and no form was named', () => {
    // The whole defect in one case: `film` has no drawing and no form,
    // and used to become an empty rounded box with its name underneath.
    const drawn = shapeOf({ name: 'film', picture: 'film' }, knownPicture);
    expect(drawn.words).toBe(true);
    expect(knownPicture('film')).toBe(false);
  });

  it('puts the name inside that card, and not underneath it as well', () => {
    const scene: StageScene = {
      title: 'What Visualize is trying to do',
      sentences,
      sections: [
        {
          title: 'Page to film',
          cast: [{ name: 'film', picture: 'film' }],
          beats: [{ sentence: 0, events: [{ do: 'place', what: ['film'] }] }],
        },
      ],
    };
    const script = layoutStage(scene, {
      known: knownPicture,
      stage: STAGES.box,
    });
    const shape = script.elements.find((e) => e.type === 'shape');
    expect(shape).toBeTruthy();
    expect((shape as { text?: string }).text).toBe('film');
    // No separate label under it: the card already says what it is.
    expect(
      script.elements.filter((e) => e.type === 'label' && e.id.endsWith('_n')),
    ).toEqual([]);
  });
});
