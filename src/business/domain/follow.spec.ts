import type { Block } from '../../contracts';
import {
  alignSentences,
  noteLevelFor,
  noteUnits,
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
  it('splits prose into sentences the client can count the same way', () => {
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
  });

  it('numbers the sentences of every block, headings as one, code as none', () => {
    const units = noteUnits(NOTE);
    expect(units.map((unit) => `${unit.block}.${unit.sentence}`)).toEqual([
      '0.0',
      '1.0',
      '1.1',
      '1.2',
      '2.0',
    ]);
    expect(units[1].text).toBe('A hash function turns any name into a number.');
    // Numbers are matched as the voice says them.
    expect(units[4].words).toContain('four');
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
    // Nothing to match against: the caller falls back to the plan's blocks.
    expect(
      trackFromEstimate(
        script,
        20_000,
        [{ type: 'table', text: 'a | b' }] as never,
        'standard',
      ),
    ).toBeNull();
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
