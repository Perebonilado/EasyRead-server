import type { Block } from '../../contracts';
import {
  alignSentences,
  cosine,
  meaningScores,
  noteAddressed,
  noteCuts,
  noteLevelFor,
  noteUnits,
  sectionTags,
  sentenceCuts,
  taggedUnits,
  similarity,
  spanAt,
  splitSentences,
  spokenSentences,
  trackFromAlignment,
  trackFromEstimate,
  trackFromMoves,
} from './follow';

const NOTE: Block[] = [
  { type: 'headingOne', text: 'The rehashing problem' },
  {
    type: 'paragraph',
    text: 'A **hash function** turns any name into a number. The number picks the server. When a server leaves, most keys move.',
  },
  { type: 'bullet', text: 'Four servers hold eight keys.' },
  { type: 'code', text: 'serverIndex = hash(key) % N' },
];

describe('follow-along: the note as units', () => {
  it('splits prose into sentences, and cuts the stored text at the same places', () => {
    expect(splitSentences('One thing. Another thing! A third? Yes.')).toEqual([
      'One thing.',
      'Another thing!',
      'A third?',
      'Yes.',
    ]);
    // A decimal or a lowercase continuation is not a boundary.
    expect(splitSentences('It costs 2.5 units. so it says')).toHaveLength(1);
    expect(splitSentences('It costs 2.5 units. So it says.')).toHaveLength(2);
    expect(splitSentences('e.g. this and that.')).toEqual([
      'e.g. this and that.',
    ]);
    // A closing quote or a bold mark after the full stop belongs to the sentence.
    expect(
      splitSentences('A problem called "rehashing." Rehashing moves keys.'),
    ).toEqual(['A problem called "rehashing."', 'Rehashing moves keys.']);
    expect(splitSentences('The **key term.** The next thing.')).toEqual([
      'The **key term.**',
      'The next thing.',
    ]);
    // Cuts are ranges into the text as stored, marks included, trimmed.
    const raw = '  A **hash** turns names into numbers.  The number picks. ';
    const cuts = sentenceCuts(raw);
    expect(cuts.map(([from, to]) => raw.slice(from, to))).toEqual([
      'A **hash** turns names into numbers.',
      'The number picks.',
    ]);
  });

  it('numbers the sentences of every block, headings as one, a code block as one whole', () => {
    const units = noteUnits(NOTE);
    expect(units.map((unit) => `${unit.block}.${unit.sentence}`)).toEqual([
      '0.0',
      '1.0',
      '1.1',
      '1.2',
      '2.0',
      '3.0',
    ]);
    expect(units[1].text).toBe('A hash function turns any name into a number.');
    // The unit's range is into the stored text, marks and all.
    expect(NOTE[1].text.slice(units[1].start, units[1].end)).toBe(
      'A **hash function** turns any name into a number.',
    );
    // Numbers are matched as the voice says them.
    expect(units[4].words).toContain('four');
    // A code block is matched as a whole and never lit sentence by sentence.
    expect(units[5].whole).toBe(true);
    expect(units[5].words).toContain('hash');
    // The cuts the client renders from mirror the units, and skip the whole blocks.
    const cuts = noteCuts(NOTE);
    expect(cuts[1]).toHaveLength(3);
    expect(cuts[0]).toHaveLength(1);
    expect(cuts[3]).toEqual([]);
  });

  it('teaches the slow learner from the easiest note', () => {
    expect(noteLevelFor('gentle')).toBe('easiest');
    expect(noteLevelFor('steady')).toBe('standard');
    expect(noteLevelFor('brisk')).toBe('standard');
  });
});

describe('follow-along: the alignment', () => {
  const spoken =
    'A hash function is a rule that turns any name into a number. That is all it does. The number picks the server. ' +
    'Think of a coat check: your ticket number says which hook. When a server leaves, most keys move. Four servers hold eight keys.';
  const sentences = (() => {
    // Sentence spans by position, one second each, the way the aligner reports them.
    const out: number[][] = [];
    let cursor = 0;
    for (const sentence of splitSentences(spoken)) {
      const start = spoken.indexOf(sentence, cursor);
      out.push([
        start,
        start + sentence.length,
        out.length * 1000,
        (out.length + 1) * 1000,
      ]);
      cursor = start + sentence.length;
    }
    return out;
  })();

  it('rates a paraphrase above an unrelated sentence', () => {
    const units = noteUnits(NOTE);
    const said = spokenSentences(spoken, sentences);
    expect(similarity(said[0].words, units[1].words)).toBeGreaterThan(
      similarity(said[0].words, units[3].words),
    );
  });

  it("walks the note in order, stays put through the tutor's own words, and never goes back", () => {
    const units = noteUnits(NOTE);
    const said = spokenSentences(spoken, sentences);
    const assigned = alignSentences(said, units);
    // hash function sentence, "that is all it does" (stays), number picks server,
    // coat check (stays), keys move, four servers.
    expect(assigned).toEqual([1, 1, 2, 2, 3, 4]);
    for (let i = 1; i < assigned.length; i += 1) {
      expect(assigned[i]).toBeGreaterThanOrEqual(assigned[i - 1]);
    }
  });

  it('makes a track of merged spans, from the start, with flickers absorbed', () => {
    const track = trackFromAlignment(spoken, sentences, NOTE, 'standard');
    expect(track.timing).toBe('aligned');
    expect(track.spans[0].fromMs).toBe(0);
    expect(
      track.spans.map(
        (span) => `${span.block}.${span.sentence}:${span.fromMs}-${span.toMs}`,
      ),
    ).toEqual([
      '1.0:0-2000',
      '1.1:2000-4000',
      '1.2:4000-5000',
      '2.0:5000-6000',
    ]);
    expect(spanAt(track, 2500)?.sentence).toBe(1);
    expect(spanAt(track, 5999)?.block).toBe(2);
  });

  it('finds the block from the words themselves before alignment, at a steady pace', () => {
    const script =
      'When one server goes offline, only three servers are left. ' +
      'We use a method called the modular operation to divide the keys among the remaining servers. ' +
      'Figure two shows how the keys are spread out after that.';
    const blocks = [
      {
        type: 'paragraph',
        text: 'This method works well when the number of servers stays the same.',
      },
      {
        type: 'paragraph',
        text: 'If server 1 goes offline, there are only 3 servers left.',
      },
      {
        type: 'paragraph',
        text: 'We use a method called the modular operation, which helps us divide the keys among the remaining servers.',
      },
      {
        type: 'paragraph',
        text: 'Figure 5-2 then shows how the keys are spread out.',
      },
    ] as never;
    const track = trackFromEstimate(script, 20_000, blocks, 'standard');
    expect(track?.timing).toBe('estimate');
    expect(track?.spans.every((span) => span.sentence === null)).toBe(true);
    expect(track?.spans.map((span) => span.block)).toEqual([1, 2, 3]);
    expect(track?.spans[0].fromMs).toBe(0);
    expect(track?.spans[track.spans.length - 1].toMs).toBe(20_000);
    // A note that is only a table is matched as its one block, never a sentence.
    const table = trackFromEstimate(
      script,
      20_000,
      [{ type: 'table', text: 'Server | Keys\n1 | A' }] as never,
      'standard',
    );
    expect(
      table?.spans.map((span) => `${span.block}.${span.sentence}`),
    ).toEqual(['0.null']);
    expect(table?.cuts).toEqual([[]]);
    // Nothing to match against at all: the caller falls back to the plan's blocks.
    expect(trackFromEstimate(script, 20_000, [], 'standard')).toBeNull();
  });

  it('gives a page a block-level track from its moves before alignment', () => {
    const track = trackFromMoves(
      [0, 300, 600],
      900,
      90_000,
      [[0, 1], [2], null],
      'easiest',
    );
    expect(track.timing).toBe('moves');
    expect(
      track.spans.map((span) => `${span.block}:${span.fromMs}-${span.toMs}`),
    ).toEqual(['0:0-30000', '2:30000-60000', 'null:60000-90000']);
    expect(
      trackFromMoves([], 100, 10_000, null, 'standard').spans,
    ).toHaveLength(1);
  });
});

describe("follow-along: the writer's tags", () => {
  it('addresses every block and sentence for the writer, a code block as one', () => {
    const text = noteAddressed(NOTE);
    expect(text).toContain('[0.0] The rehashing problem');
    expect(text).toContain('[1.1] The number picks the server.');
    expect(text).toContain('[2.0] Four servers hold eight keys.');
    expect(text).toContain('[3] (a code sample: serverIndex = hash(key) % N)');
  });

  it('keeps the tags the note can honour and drops the rest', () => {
    const units = noteUnits(NOTE);
    const tags = sectionTags(
      [
        // Right, in the writer's own words.
        {
          text: 'A hash function turns a name into a number.',
          teaches: ['1.0'],
        },
        // Names a sentence the block does not have, and a block that is not there.
        { text: 'The number picks the server.', teaches: ['1.1', '1.9', '7'] },
        // Points at a block sharing no word with what it says.
        { text: 'A story of my own, about nothing here.', teaches: ['2.0'] },
        // Named far too much to have chosen anything.
        {
          text: 'Everything at once.',
          teaches: ['0', '1.0', '1.1', '1.2', '2', '3', '1'],
        },
        // Says nothing.
        { text: 'An aside of my own.' },
      ],
      units,
    );
    expect(tags.map((tag) => tag.teaches)).toEqual([
      ['1.0'],
      ['1.1'],
      [],
      [],
      [],
    ]);
    expect(tags[0].head).toBe('A hash function turns a name into a number.');
  });

  it('gives each spoken sentence the units of the section it falls in', () => {
    const units = noteUnits(NOTE);
    const spoken =
      'A hash function turns a name into a number. That is all it does. Four servers hold the keys.';
    const sentences = [
      [0, 43, 0, 2000],
      [44, 64, 2000, 3500],
      [65, 92, 3500, 5000],
    ];
    const tags = sectionTags(
      [
        {
          text: 'A hash function turns a name into a number. That is all it does.',
          teaches: ['1.0'],
        },
        { text: 'Four servers hold the keys.', teaches: ['2'] },
      ],
      units,
    );
    const tagged = taggedUnits(spoken, sentences, tags, units);
    const names = (set: Set<number> | null) =>
      set
        ? [...set].map(
            (index) => `${units[index].block}.${units[index].sentence}`,
          )
        : null;
    expect(names(tagged[0])).toEqual(['1.0']);
    expect(names(tagged[1])).toEqual(['1.0']);
    expect(names(tagged[2])).toEqual(['2.0']);
    expect(taggedUnits(spoken, sentences, null, units)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('lets a tag decide where the words alone would not, and ignores a tag the words contradict', () => {
    const units = noteUnits(NOTE);
    // Paraphrase: no content word in common with the sentence it explains.
    const paraphrase = {
      words: ['every', 'label', 'becom', 'figur'],
      startMs: 0,
      endMs: 1000,
    };
    const index = (block: number, sentence: number) =>
      units.findIndex(
        (unit) => unit.block === block && unit.sentence === sentence,
      );
    // Without a tag the walk stays at the top; with one the words are trusted only if they share something.
    expect(alignSentences([paraphrase], units)[0]).toBe(0);
    const shares = {
      words: ['hash', 'function', 'give', 'figur'],
      startMs: 0,
      endMs: 1000,
    };
    expect(
      alignSentences([shares], units, { tagged: [new Set([index(1, 0)])] })[0],
    ).toBe(index(1, 0));
    // A tag on a sentence the words share nothing with is a mistake, and the words decide.
    expect(
      alignSentences([shares], units, { tagged: [new Set([index(2, 0)])] })[0],
    ).toBe(index(1, 0));
  });
});

describe('follow-along: meaning', () => {
  it('measures how much more a unit is about a sentence than the page in general', () => {
    // Three units all lean the same way; the second leans further.
    const units = [
      [1, 0.2, 0],
      [1, 0.9, 0],
      [1, 0.1, 0.1],
    ];
    const spoken = [[1, 1, 0]];
    const scores = meaningScores(spoken, units);
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    // The median unit scores nothing; only what stands out from the page counts.
    expect(scores[0][0]).toBe(0);
    expect(scores[0][1]).toBeGreaterThan(0.1);
    expect(scores[0][2]).toBe(0);
  });

  it('lets meaning move a paraphrase the words cannot', () => {
    const units = noteUnits(NOTE);
    const index = (block: number, sentence: number) =>
      units.findIndex(
        (unit) => unit.block === block && unit.sentence === sentence,
      );
    // No content word in common with "When a server leaves, most keys move."
    const paraphrase = {
      words: ['machin', 'goe', 'away', 'nearli', 'everyth', 'relocat'],
      startMs: 0,
      endMs: 1000,
    };
    expect(alignSentences([paraphrase], units)[0]).toBe(0);
    const meaning = units.map(() => 0);
    meaning[index(1, 2)] = 0.4;
    expect(alignSentences([paraphrase], units, { meaning: [meaning] })[0]).toBe(
      index(1, 2),
    );
  });
});

describe('follow-along: a step back', () => {
  it('goes back for a callback the writer tagged, and not for a faint echo', () => {
    const units = noteUnits(NOTE);
    const index = (block: number, sentence: number) =>
      units.findIndex(
        (unit) => unit.block === block && unit.sentence === sentence,
      );
    const forward = [
      {
        words: ['hash', 'function', 'turn', 'name', 'number'],
        startMs: 0,
        endMs: 1000,
      },
      {
        words: ['four', 'server', 'hold', 'eight', 'key'],
        startMs: 1000,
        endMs: 2000,
      },
      // "Remember, the number picks the server": a callback to block 1.
      {
        words: ['rememb', 'number', 'pick', 'server'],
        startMs: 2000,
        endMs: 3000,
      },
    ];
    // Untagged, the echo is not worth the price of going back.
    expect(alignSentences(forward, units)[2]).toBe(index(2, 0));
    // Tagged by the writer, it is.
    const tagged = [null, null, new Set([index(1, 1)])];
    expect(alignSentences(forward, units, { tagged })[2]).toBe(index(1, 1));
    // With no step back allowed, the walk stays monotone whatever the tag
    // asks: it can only hold the earlier sentence back to honour it.
    const held = alignSentences(forward, units, {
      tagged,
      back: { penalty: 1, perUnit: 0.1, maxUnits: 0 },
    });
    expect(held.every((unit, i) => i === 0 || unit >= held[i - 1])).toBe(true);
  });
});
