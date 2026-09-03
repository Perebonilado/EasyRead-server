import {
  LATE_MS,
  LEAD_MS,
  LIFT_MS,
  MIN_COMPRESSION,
  naturalCostMs,
  boardLinesAt,
  boardProblems,
  buildBoardOps,
  capFigures,
  checkDraft,
  emptyTimeline,
  estimateWordTimes,
  findAnchor,
  nextFreeLine,
  readsAsSentence,
  sentenceAt,
  sentenceIndexAtMs,
  sentenceSpans,
  termsDraft,
  timeBoard,
  wordStartAt,
  wordTimesFromAligned,
  writingCostMs,
  type AlignedWord,
  type BoardContext,
  type BoardDraft,
  type BoardTimeline,
  asciiText,
  maxWrittenFor,
  shorten,
  endsMidPhrase,
  CHAR_LIMITS,
  WORD_LIMITS,
  findAnchorLoose,
  anchorFor,
  namesTopic,
  MAX_WRITTEN,
  moveSpansOf,
  grounded,
  contentWords,
  abbreviated,
  mergeDrafts,
  fittedMeaning,
  fittedText,
  ungroundedWords,
  readsAsHeading,
  BOARD_LINES,
  lostItems,
  mergeRepairs,
  anchorForItem,
  asDrafted,
  meaningSpokenNear,
  repeats,
  numberedSentences,
  sentenceAnchor,
  linesOf,
  charLimitOf,
} from './board';

/**
 * The board's rules and timing are pure functions, so they are pinned
 * here: what a teacher writes and never writes, when the pen starts and
 * what gives when the voice is ahead, and how word times come out of an
 * aligner and out of thin air.
 */

const SPOKEN =
  'A token bucket holds tokens. The refill rate is ten tokens per second. ' +
  'When the bucket is empty, the request is dropped. Burst capacity is the size of the bucket. ' +
  'So the bucket smooths a burst, and the refill rate sets the average.';
/** The page with a sign-off after it, so a claim near the end is not the closing sentence. */
const SPOKEN_LONGER =
  SPOKEN + ' That is all for now. On we go to the next page of the chapter.';
const PAGE =
  'Token bucket: a bucket holds tokens; refill rate of 10 tokens per second; when empty, requests are dropped; burst capacity equals bucket size.';

const ctx = (over: Partial<BoardContext> = {}): BoardContext => ({
  spoken: SPOKEN,
  pageText: PAGE,
  planLines: ['Token bucket: a bucket that holds tokens'],
  style: 'gentle',
  durationMs: 60_000,
  continues: false,
  light: false,
  ...over,
});

/** Distinct terms that fill lines: each anchored in its own sentence, with the meaning said there. */
const fillerTerms = (count: number): BoardDraft['items'] => {
  const rows = [
    { meaning: 'holds tokens', anchor: 'token bucket holds' },
    { meaning: 'ten tokens second', anchor: 'refill rate is ten' },
    { meaning: 'request dropped', anchor: 'bucket is empty' },
    { meaning: 'size of bucket', anchor: 'burst capacity is' },
    { meaning: 'smooths a burst', anchor: 'bucket smooths a burst' },
    { meaning: 'sets the average', anchor: 'refill rate sets' },
  ];
  return rows.slice(0, count).map((row, i) => ({
    kind: 'term' as const,
    text: `bucket tokens ${i + 10}`,
    ...row,
  }));
};

const draft = (
  items: BoardDraft['items'],
  heading: string | null = 'Token bucket basics',
): BoardDraft => ({
  heading,
  items,
});

describe('finding a phrase in the spoken text', () => {
  it('ignores case, punctuation and whitespace, and returns real offsets', () => {
    const at = findAnchor(SPOKEN, 'refill RATE is ten');
    expect(at).not.toBeNull();
    expect(SPOKEN.slice(at!.charStart, at!.charEnd)).toBe('refill rate is ten');
  });

  it('never matches inside a word, and searches from an offset', () => {
    expect(findAnchor('the tokens flow', 'okens')).toBeNull();
    const second = findAnchor(SPOKEN, 'the bucket', 40);
    expect(second!.charStart).toBeGreaterThan(40);
  });

  it('splits sentences with their offsets', () => {
    const spans = sentenceSpans(SPOKEN);
    expect(spans).toHaveLength(5);
    expect(SPOKEN.slice(spans[1].charStart, spans[1].charEnd)).toBe(
      'The refill rate is ten tokens per second.',
    );
  });
});

describe('what reads as a sentence', () => {
  it('rejects full stops, length and clauses', () => {
    expect(readsAsSentence('Refill rate')).toBe(false);
    expect(readsAsSentence('The bucket is empty now.')).toBe(true);
    expect(readsAsSentence('one two three four five six seven')).toBe(false);
    expect(
      readsAsSentence(
        'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty',
      ),
    ).toBe(true);
    // A claim with a verb is a note, not a sentence.
    expect(readsAsSentence('bucket is the size of it')).toBe(false);
  });
});

describe('the figures a chapter draws', () => {
  it('keeps one per two pages and three per chapter, preferring processes', () => {
    const beats = [
      { figure: { kind: 'structure' as const, shows: 'parts' } },
      { figure: { kind: 'process' as const, shows: 'steps' } },
      { figure: { kind: 'comparison' as const, shows: 'a vs b' } },
      { figure: { kind: 'none' as const, shows: null } },
      { figure: { kind: 'process' as const, shows: 'more steps' } },
      { figure: { kind: 'structure' as const, shows: 'more parts' } },
      { figure: { kind: 'process' as const, shows: 'yet more' } },
    ];
    const kept = capFigures(beats).map((beat) => beat.figure.kind);
    expect(kept.filter((kind) => kind !== 'none').length).toBeLessThanOrEqual(
      3,
    );
    // The first process wins its window over the structure beside it.
    expect(kept[1]).toBe('process');
    expect(kept[0]).toBe('none');
    for (let i = 1; i < kept.length; i += 1) {
      if (kept[i] !== 'none') expect(kept[i - 1]).toBe('none');
    }
  });

  it('is idempotent and leaves beats without figures alone', () => {
    const beats = [{ goal: 'x' }, { goal: 'y', figure: null }];
    expect(capFigures(beats)).toEqual(beats);
    const once = capFigures([
      { figure: { kind: 'process' as const, shows: 's' } },
    ]);
    expect(capFigures(once)).toEqual(once);
  });
});

describe('the rules of the board', () => {
  const good = draft([
    {
      kind: 'term',
      text: 'token bucket',
      meaning: 'a bucket that holds tokens',
      anchor: 'token bucket holds tokens',
    },
    { kind: 'figure', text: '10 tokens/sec', anchor: 'ten tokens per second' },
    {
      kind: 'point',
      text: 'empty request dropped',
      anchor: 'the request is dropped',
    },
    {
      kind: 'cue',
      target: 'token bucket',
      shape: 'underline',
      anchor: 'bucket smooths a burst',
    },
    {
      kind: 'relation',
      from: 'token bucket',
      to: 'empty request dropped',
      label: 'when empty',
      anchor: 'refill rate sets',
    },
  ]);

  it('accepts a draft that follows them', () => {
    expect(boardProblems(good, ctx({ durationMs: 35_000 }))).toEqual([]);
  });

  it('rejects an anchor that is not said', () => {
    const bad = draft([
      { kind: 'term', text: 'cloud drifts', anchor: 'leaky bucket' },
    ]);
    expect(boardProblems(bad, ctx()).map((p) => p.kind)).toContain(
      'anchor_missing',
    );
  });

  it('rejects sentences, long items and short items', () => {
    const bad = draft([
      {
        kind: 'point',
        text: 'The bucket is empty.',
        anchor: 'the request is dropped',
      },
      { kind: 'term', text: 'a', anchor: 'token bucket' },
    ]);
    const kinds = boardProblems(bad, ctx()).map((p) => p.kind);
    expect(kinds).toContain('sentence');
    expect(kinds).toContain('incomplete');
  });

  it('rejects words the page does not use and numbers not on the page', () => {
    const bad = draft([
      { kind: 'term', text: 'elephant', anchor: 'token bucket' },
      { kind: 'figure', text: '42 tokens', anchor: 'ten tokens per second' },
    ]);
    const kinds = boardProblems(bad, ctx()).map((p) => p.kind);
    expect(kinds.filter((kind) => kind === 'ungrounded')).toHaveLength(2);
  });

  it('rejects a relation or cue on something not yet written, and two cues in a sentence', () => {
    const bad = draft([
      {
        kind: 'cue',
        target: 'refill',
        shape: 'circle',
        anchor: 'token bucket',
      },
      { kind: 'term', text: 'refill rate', anchor: 'refill rate is ten' },
      {
        kind: 'cue',
        target: 'refill rate',
        shape: 'box',
        anchor: 'refill rate is ten',
      },
      {
        kind: 'cue',
        target: 'refill rate',
        shape: 'box',
        anchor: 'tokens per second',
      },
    ]);
    const kinds = boardProblems(bad, ctx()).map((p) => p.kind);
    expect(kinds).toContain('relation_targets');
    expect(kinds).toContain('cue_density');
  });

  it('wants a heading on a fresh board and none on a continuing one', () => {
    expect(boardProblems(draft([], null), ctx()).map((p) => p.kind)).toContain(
      'heading_required',
    );
    expect(
      boardProblems(draft([], 'Token bucket'), ctx({ continues: true })).map(
        (p) => p.kind,
      ),
    ).toContain('heading_forbidden');
  });

  it('caps only what the pen can manage, and never rations', () => {
    const many = draft(
      Array.from({ length: 14 }, (_, i) => ({
        kind: 'point' as const,
        text: `bucket ${i + 10} tokens`,
        anchor: 'token bucket',
      })),
    );
    expect(
      boardProblems(many, ctx({ style: 'brisk' })).map((p) => p.kind),
    ).toContain('budget');
    const few = draft([
      { kind: 'term', text: 'token bucket', anchor: 'token bucket' },
    ]);
    // One item on a long page is not a problem in itself...
    expect(
      boardProblems(few, ctx({ style: 'gentle', durationMs: 90_000 })),
    ).toEqual([]);
    expect(MAX_WRITTEN.gentle).toBeGreaterThan(MAX_WRITTEN.brisk);
  });

  it('asks for a note under every move the page spends words on', () => {
    const cut = SPOKEN.indexOf('When the bucket is empty');
    const spans = [
      { label: 'the refill', charStart: 0, charEnd: cut },
      { label: 'dropping', charStart: cut, charEnd: SPOKEN.length },
    ];
    // ...but a move taught at length with nothing written under it is.
    const onlyFirst = draft([
      { kind: 'term', text: 'token bucket', anchor: 'token bucket' },
    ]);
    const problems = boardProblems(
      onlyFirst,
      ctx({ durationMs: 60_000, moveSpans: spans }),
    );
    expect(problems.map((p) => p.kind)).toEqual(['coverage']);
    expect(problems[0].detail).toContain('dropping');
    const both = draft([
      { kind: 'term', text: 'token bucket', anchor: 'token bucket' },
      {
        kind: 'point',
        text: 'empty request dropped',
        anchor: 'the request is dropped',
      },
    ]);
    expect(
      boardProblems(both, ctx({ durationMs: 60_000, moveSpans: spans })),
    ).toEqual([]);
    // A light page, or a move of a few words, passes without one.
    expect(
      boardProblems(onlyFirst, ctx({ moveSpans: spans, light: true })),
    ).toEqual([]);
    expect(moveSpansOf(['a', 'b'], [0, 40], 100)).toEqual([
      { label: 'a', charStart: 0, charEnd: 40 },
      { label: 'b', charStart: 40, charEnd: 100 },
    ]);
  });

  it('drops a duplicate', () => {
    const bad = draft([
      { kind: 'term', text: 'token bucket', anchor: 'token bucket' },
      { kind: 'term', text: 'Token Bucket', anchor: 'the bucket is empty' },
    ]);
    expect(boardProblems(bad, ctx()).map((p) => p.kind)).toContain('duplicate');
  });
});

describe('building the operations', () => {
  it('resolves anchors, drops the offending, assigns lines and ids', () => {
    const built = buildBoardOps(
      draft([
        {
          kind: 'term',
          text: 'token bucket',
          meaning: 'a bucket that holds tokens',
          anchor: 'token bucket holds tokens',
        },
        { kind: 'term', text: 'elephant', anchor: 'token bucket' },
        {
          kind: 'figure',
          text: '10 tokens/sec',
          anchor: 'ten tokens per second',
        },
        {
          kind: 'cue',
          target: 'token bucket',
          shape: 'circle',
          anchor: 'bucket smooths',
        },
      ]),
      ctx(),
      'b1-g',
      'b1-g-board',
    );
    expect(built.boards).toHaveLength(1);
    expect(built.boards[0].heading).toBe('Token bucket basics');
    const kinds = built.ops.map((op) => op.kind);
    expect(kinds).toEqual(['heading', 'term', 'figure', 'cue']);
    const term = built.ops[1];
    expect(term.slot).toBe(1);
    expect(built.ops[2].slot).toBe(3);
    expect(term.anchor.charStart).toBe(SPOKEN.indexOf('token bucket'));
    const cue = built.ops[3];
    expect(cue.kind === 'cue' && cue.targetId === term.id).toBe(true);
    expect(new Set(built.ops.map((op) => op.id)).size).toBe(4);
    expect(built.ops.every((op) => op.t0Ms === null)).toBe(true);
  });

  it('opens a fresh board when the column is full', () => {
    // Six terms with meanings take twelve lines: past the nine a board has.
    const items = fillerTerms(6);
    const built = buildBoardOps(
      draft(items),
      ctx({ durationMs: 120_000 }),
      'b2-g',
      'b2-g-board',
    );
    expect(built.boards.length).toBeGreaterThan(1);
    expect(built.ops.some((op) => op.kind === 'board')).toBe(true);
    const onSecond = built.ops.filter(
      (op) => op.boardId === built.boards[1].id,
    );
    expect(onSecond[0].slot).toBe(1);
  });

  it('continues from the line a page left free', () => {
    const page = buildBoardOps(
      draft([
        {
          kind: 'term',
          text: 'token bucket',
          meaning: 'holds tokens',
          anchor: 'token bucket',
        },
      ]),
      ctx(),
      'b3-g',
      'b3-g-board',
    );
    const timeline: BoardTimeline = {
      ...emptyTimeline(SPOKEN.length),
      boards: page.boards,
      ops: page.ops,
    };
    expect(nextFreeLine(timeline)).toBe(3);
    const part = buildBoardOps(
      draft(
        [
          {
            kind: 'point',
            text: 'burst capacity size',
            anchor: 'burst capacity is',
          },
        ],
        null,
      ),
      ctx({ continues: true, startLine: nextFreeLine(timeline) }),
      'b3-g-part',
      'b3-g-board',
    );
    expect(part.ops[0].kind).toBe('point');
    expect(part.ops[0].slot).toBe(3);
    expect(part.boards[0].continues).toBe(true);
  });
});

describe('the boards around a chapter', () => {
  it('writes the chapter words as terms and the check questions as points', () => {
    const terms = termsDraft('Rate limiting in depth', [
      {
        term: 'token bucket',
        meaning: 'a bucket that holds tokens and refills',
      },
    ]);
    expect(terms.heading).toBe('Rate limiting in depth');
    expect(terms.items[0]).toMatchObject({
      kind: 'term',
      text: 'token bucket',
    });
    const check = checkDraft(
      'That is the chapter. What does the refill rate set? [pause] The average. Why is a request dropped? [pause] The bucket is empty.',
    );
    expect(check.items.map((item) => item.text)).toEqual([
      'refill rate',
      'request dropped',
    ]);
    expect(check.items[0].anchor).toBe('What does the refill');
  });
});

describe('word times', () => {
  it('spreads an estimate over the audio and builds sentences', () => {
    const times = estimateWordTimes(SPOKEN, 30_000, 'key');
    expect(times.source).toBe('estimate');
    expect(times.words[0][2]).toBe(0);
    expect(times.words[times.words.length - 1][3]).toBeLessThanOrEqual(30_000);
    expect(times.sentences).toHaveLength(5);
    expect(sentenceIndexAtMs(times, 0)).toBe(0);
    expect(sentenceIndexAtMs(times, 29_000)).toBe(4);
    expect(wordStartAt(times, SPOKEN.indexOf('refill'))).toBeGreaterThan(0);
    expect(sentenceAt(times, SPOKEN.indexOf('refill'))![0]).toBe(
      SPOKEN.indexOf('The refill'),
    );
  });

  const aligned = (drift = 0): AlignedWord[] => {
    const words: AlignedWord[] = [];
    const pattern = /\S+/g;
    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = pattern.exec(SPOKEN)) !== null) {
      words.push({
        text: match[0],
        charStart: match.index,
        charEnd: match.index + match[0].length,
        startMs: index * 400 + drift,
        endMs: index * 400 + 350 + drift,
      });
      index += 1;
    }
    return words;
  };

  it("takes an aligner's words by their offsets and fills the gaps", () => {
    const words = aligned();
    const durationMs = words[words.length - 1].endMs;
    const skipped = words.filter((_, i) => i % 15 !== 3);
    const times = wordTimesFromAligned(
      skipped,
      SPOKEN,
      durationMs,
      'key',
      'echogarden-whisper',
    );
    expect(times).not.toBeNull();
    expect(times!.words).toHaveLength(words.length);
    // A skipped word sits between its neighbours.
    const gap = times!.words[3];
    expect(gap[2]).toBeGreaterThanOrEqual(times!.words[2][3]);
    expect(gap[3]).toBeLessThanOrEqual(times!.words[4][2]);
    for (let i = 1; i < times!.words.length; i += 1) {
      expect(times!.words[i][2]).toBeGreaterThanOrEqual(times!.words[i - 1][2]);
    }
  });

  it('refuses times that go backwards, cover too little, or disagree with the audio', () => {
    const words = aligned();
    const durationMs = words[words.length - 1].endMs;
    const backwards = words.map((word, i) =>
      i === 5 ? { ...word, startMs: 0 } : word,
    );
    expect(
      wordTimesFromAligned(
        backwards,
        SPOKEN,
        durationMs,
        'k',
        'echogarden-whisper',
      ),
    ).toBeNull();
    expect(
      wordTimesFromAligned(
        words.slice(0, 10),
        SPOKEN,
        durationMs,
        'k',
        'echogarden-whisper',
      ),
    ).toBeNull();
    expect(
      wordTimesFromAligned(
        words,
        SPOKEN,
        durationMs * 3,
        'k',
        'echogarden-whisper',
      ),
    ).toBeNull();
    const dragging = words.map((word, i) =>
      i === 2 ? { ...word, endMs: word.startMs + 5000 } : word,
    );
    expect(
      wordTimesFromAligned(
        dragging,
        SPOKEN,
        durationMs,
        'k',
        'echogarden-whisper',
      ),
    ).toBeNull();
  });
});

describe('the timer', () => {
  const build = (style: 'gentle' | 'steady' | 'brisk' = 'gentle') => {
    const built = buildBoardOps(
      draft([
        {
          kind: 'term',
          text: 'token bucket',
          meaning: 'a bucket that holds tokens',
          anchor: 'token bucket holds tokens',
        },
        {
          kind: 'figure',
          text: '10 tokens/sec',
          anchor: 'ten tokens per second',
        },
        {
          kind: 'cue',
          target: 'token bucket',
          shape: 'underline',
          anchor: 'the bucket is empty',
        },
        {
          kind: 'point',
          text: 'burst capacity size',
          anchor: 'burst capacity is',
        },
      ]),
      ctx({ style }),
      'b1',
      'b1-board',
    );
    return {
      ...emptyTimeline(SPOKEN.length),
      boards: built.boards,
      ops: built.ops,
    };
  };

  it('starts a breath before the word, never late, one pen at a time', () => {
    const timeline = build();
    const times = estimateWordTimes(SPOKEN, 60_000, 'k');
    const timed = timeBoard(timeline, times, 60_000, 'gentle');
    expect(timed.timing).toBe('estimated');
    const writing = timed.ops.filter(
      (op) => op.kind !== 'cue' && op.kind !== 'board',
    );
    for (const op of writing) {
      const anchorMs = wordStartAt(times, op.anchor.charStart);
      const natural = naturalCostMs(op, timed.diagrams, 'gentle');
      // Never started after the late margin; finished within it, or else
      // compressed as far as the floor allows.
      expect(op.t0Ms!).toBeLessThanOrEqual(anchorMs + LATE_MS);
      expect(op.durMs!).toBeLessThanOrEqual(natural);
      const finishedInTime = op.t0Ms! + op.durMs! <= anchorMs + LATE_MS + 1;
      const atFloor = op.durMs! <= Math.round(natural * MIN_COMPRESSION) + 1;
      expect(finishedInTime || atFloor).toBe(true);
      if (op.kind !== 'heading')
        expect(op.t0Ms!).toBeGreaterThanOrEqual(anchorMs - LEAD_MS.gentle);
    }
    for (let i = 1; i < writing.length; i += 1) {
      expect(writing[i].t0Ms!).toBeGreaterThanOrEqual(
        writing[i - 1].t0Ms! + writing[i - 1].durMs! + LIFT_MS - 1,
      );
    }
    const cue = timed.ops.find((op) => op.kind === 'cue')!;
    const sentence = sentenceAt(times, cue.anchor.charStart)!;
    expect(cue.t0Ms).toBeGreaterThanOrEqual(sentence[2]);
    expect(cue.kind === 'cue' && cue.offMs! > cue.t0Ms!).toBe(true);
    expect(timed.boards[0].startsAtMs).toBe(timed.ops[0].t0Ms);
    expect(timed.ops.map((op) => op.t0Ms)).toEqual(
      [...timed.ops.map((op) => op.t0Ms)].sort((a, b) => a! - b!),
    );
  });

  it('writes late and fast rather than leaving an item off, and keeps what the audio ends before', () => {
    const timeline = build();
    // Everything is said in the first two seconds.
    const times = estimateWordTimes(SPOKEN, 2_000, 'k');
    const timed = timeBoard(timeline, times, 2_000, 'gentle');
    // Nothing is removed: what could not be placed stays, untimed, so a
    // later timing on measured words can still place it.
    expect(timed.ops).toHaveLength(timeline.ops.length);
    expect(timed.dropped).toBeGreaterThan(0);
    const placed = timed.ops.filter((op) => op.t0Ms !== null);
    for (const op of placed) {
      expect(op.t0Ms! + op.durMs!).toBeLessThanOrEqual(2_500);
    }
    expect(placed.some((op) => op.kind === 'term')).toBe(true);
    // Untimed ops sort last.
    const times2 = timed.ops.map((op) => op.t0Ms);
    const firstNull = times2.indexOf(null);
    expect(
      firstNull === -1 || times2.slice(firstNull).every((v) => v === null),
    ).toBe(true);
  });

  it('never drops a written item for being late: the pen writes fast and catches up', () => {
    // Three items said within four seconds, a page long enough to hold them.
    const built = buildBoardOps(
      draft([
        {
          kind: 'term',
          text: 'token bucket',
          meaning: 'holds tokens',
          anchor: 'token bucket holds tokens',
        },
        {
          kind: 'point',
          text: 'ten tokens per second',
          anchor: 'refill rate is ten',
        },
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'the request is dropped',
        },
      ]),
      ctx(),
      'l',
      'l-board',
    );
    const timeline = {
      ...emptyTimeline(SPOKEN.length),
      boards: built.boards,
      ops: built.ops,
    };
    const times = estimateWordTimes(SPOKEN, 8_000, 'k');
    const timed = timeBoard(timeline, times, 30_000, 'gentle');
    expect(timed.dropped).toBe(0);
    expect(
      timed.ops.filter((op) => op.kind === 'point' && op.t0Ms !== null),
    ).toHaveLength(2);
  });

  it('holds its invariants on random timelines', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let run = 0; run < 100; run += 1) {
      const duration = 3_000 + Math.floor(random() * 90_000);
      const timeline = build(
        ['gentle', 'steady', 'brisk'][run % 3] as 'gentle',
      );
      const times = estimateWordTimes(SPOKEN, duration, 'k');
      const timed = timeBoard(timeline, times, duration, 'steady');
      let penFree = 0;
      for (const op of timed.ops) {
        if (op.t0Ms === null) continue;
        expect(op.t0Ms).toBeGreaterThanOrEqual(0);
        expect(op.t0Ms + op.durMs!).toBeLessThanOrEqual(duration + 500);
        if (op.kind === 'cue') continue;
        expect(op.t0Ms).toBeGreaterThanOrEqual(penFree - 1);
        penFree = op.t0Ms + op.durMs!;
      }
    }
  });

  it('costs more to write more, and less at a brisk pace', () => {
    expect(writingCostMs('refill rate', 'gentle')).toBeGreaterThan(
      writingCostMs('rate', 'gentle'),
    );
    expect(writingCostMs('refill rate', 'brisk')).toBeLessThan(
      writingCostMs('refill rate', 'gentle'),
    );
    const point = writingCostMs('empty bucket drops request now', 'gentle');
    expect(point).toBeGreaterThan(2_500);
    expect(point).toBeLessThan(4_000);
  });
});

describe('the board as the tutor reads it', () => {
  it('lists what has been written by a moment, with cues still showing', () => {
    const timeline = timeBoard(
      (() => {
        const built = buildBoardOps(
          draft([
            {
              kind: 'term',
              text: 'token bucket',
              meaning: 'a bucket that holds tokens',
              anchor: 'token bucket holds tokens',
            },
            {
              kind: 'point',
              text: 'burst capacity size',
              anchor: 'burst capacity is',
            },
          ]),
          ctx(),
          'b1',
          'b1-board',
        );
        return {
          ...emptyTimeline(SPOKEN.length),
          boards: built.boards,
          ops: built.ops,
        };
      })(),
      estimateWordTimes(SPOKEN, 60_000, 'k'),
      60_000,
      'gentle',
    );
    const early = boardLinesAt(timeline, 6_000);
    expect(early[0]).toBe('Board: Token bucket basics');
    expect(
      early.some((line) =>
        line.includes('token bucket: a bucket that holds tokens'),
      ),
    ).toBe(true);
    expect(early.some((line) => line.includes('burst capacity'))).toBe(false);
    const late = boardLinesAt(timeline, 60_000);
    expect(late.some((line) => line.includes('burst capacity'))).toBe(true);
  });
});

describe('quality rules', () => {
  it('caps a page at what the pen can write, fullest for a slow learner', () => {
    expect(maxWrittenFor('gentle', 10 * 60_000)).toBe(MAX_WRITTEN.gentle);
    expect(maxWrittenFor('brisk', 60_000)).toBe(MAX_WRITTEN.brisk);
    expect(maxWrittenFor('gentle', 20_000)).toBe(6);
    expect(maxWrittenFor('gentle', 5_000)).toBe(4);
  });

  it('writes plain ASCII: typographic marks are plainened, the rest is refused', () => {
    expect(asciiText('token \u2014 bucket \u2018rate\u2019')).toBe(
      "token - bucket 'rate'",
    );
    const plain = draft([
      {
        kind: 'point',
        text: 'empty \u2013 dropped',
        anchor: 'the request is dropped',
      },
    ]);
    expect(
      boardProblems(plain, ctx({ durationMs: 30_000 })).map((p) => p.kind),
    ).not.toContain('non_ascii');
    const arrow = draft([
      { kind: 'point', text: 'bucket \u2192 tokens', anchor: 'token bucket' },
    ]);
    expect(
      boardProblems(arrow, ctx({ durationMs: 30_000 })).map((p) => p.kind),
    ).toContain('non_ascii');
    const built = buildBoardOps(plain, ctx(), 'q', 'q-board');
    const point = built.ops.find((op) => op.kind === 'point');
    expect(point && 'text' in point ? point.text : '').toBe('empty - dropped');
  });

  it('keeps one important item, the first the writer marked', () => {
    const built = buildBoardOps(
      draft([
        { kind: 'term', text: 'token bucket', anchor: 'token bucket' },
        {
          kind: 'point',
          text: 'empty bucket dropped',
          anchor: 'bucket is empty',
          important: true,
        },
        {
          kind: 'point',
          text: 'refill sets average',
          anchor: 'refill rate sets',
          important: true,
        },
      ]),
      ctx(),
      'q',
      'q-board',
    );
    const flags = built.ops
      .filter((op) => op.kind === 'point')
      .map((op) => ('important' in op ? op.important : null));
    expect(flags).toEqual([true, false]);
    const important = built.ops.find(
      (op) => op.kind === 'point' && op.important,
    );
    expect(important?.priority).toBe(2);
  });

  it('indents a detail under the point before it, never the first line', () => {
    const built = buildBoardOps(
      draft([
        {
          kind: 'point',
          text: 'bucket holds tokens',
          anchor: 'token bucket',
          level: 2,
        },
        {
          kind: 'point',
          text: 'refill ten per second',
          anchor: 'refill rate',
          level: 2,
        },
      ]),
      ctx(),
      'q',
      'q-board',
    );
    const levels = built.ops
      .filter((op) => op.kind === 'point')
      .map((op) => ('level' in op ? op.level : null));
    expect(levels).toEqual([1, 2]);
  });
});

describe('writing a definition the way a teacher does', () => {
  const meaning = (text: string, term?: string) =>
    shorten(text, WORD_LIMITS.meaning.max, CHAR_LIMITS.meaning, term);

  it('paraphrases a long definition into a finished line in shorthand', () => {
    expect(
      meaning(
        'Diffusion is the movement of gases from an area of higher concentration to an area of lower concentration.',
        'Diffusion',
      ),
    ).toBe('movement of gases from higher conc to lower conc');
  });

  it('drops the empty opening and compresses a pair', () => {
    expect(
      meaning(
        'A technique to minimize data movement when servers are added or removed',
      ),
    ).toBe('minimize data movement when servers are added/removed');
  });

  it('never ends mid-phrase, even when it has to cut', () => {
    const cut = meaning(
      'Osmosis is the movement of water across a semi-permeable membrane from a region of high water potential to low water potential',
      'Osmosis',
    );
    expect(cut).toBe('movement of water across a semi-permeable membrane');
    expect(endsMidPhrase(cut)).toBe(false);
    expect(cut.length).toBeLessThanOrEqual(CHAR_LIMITS.meaning);
  });

  it('leaves a short definition alone', () => {
    expect(meaning('A circular mapping of keys and servers')).toBe(
      'circular mapping of keys and servers',
    );
  });

  it('refuses a written meaning that stops mid-phrase or runs too long', () => {
    const cut = draft([
      {
        kind: 'term',
        text: 'token bucket',
        meaning: 'holds tokens from',
        anchor: 'token bucket',
      },
    ]);
    expect(
      boardProblems(cut, ctx({ durationMs: 30_000 })).map((p) => p.kind),
    ).toContain('incomplete');
    // A line that runs long is shortened the way a teacher shortens, not
    // refused; only what still does not fit after that is a problem.
    const longText =
      'bucket tokens bucket tokens bucket tokens bucket tokens bucket tokens';
    expect(fittedText('point', longText).length).toBeLessThanOrEqual(
      charLimitOf('point'),
    );
    const long = draft([
      { kind: 'point', text: longText, anchor: 'token bucket' },
    ]);
    expect(
      boardProblems(long, ctx({ durationMs: 30_000 })).map((p) => p.kind),
    ).not.toContain('too_long');
  });

  it('writes the words-first board in finished shorthand', () => {
    const built = buildBoardOps(
      termsDraft('Token bucket', [
        {
          term: 'refill rate',
          meaning:
            'The refill rate is the number of tokens that are added to the bucket every second by the system',
        },
      ]),
      ctx({ spoken: 'We will meet refill rate first.', durationMs: 20_000 }),
      'w',
      'w-board',
    );
    const term = built.ops.find((op) => op.kind === 'term');
    const written = term && 'meaning' in term ? (term.meaning ?? '') : '';
    expect(written.length).toBeLessThanOrEqual(CHAR_LIMITS.meaning);
    expect(endsMidPhrase(written)).toBe(false);
    expect(written).not.toMatch(/^the refill rate is/i);
  });
});

describe('anchors that are nearly said, and points that only name a topic', () => {
  it('finds the spoken sentence for a phrase taken from the page', () => {
    // The page says it one way, the voice another.
    const at = findAnchorLoose(
      SPOKEN,
      'requests are dropped when the bucket is empty',
    );
    expect(at).not.toBeNull();
    expect(SPOKEN.slice(at!.charStart, at!.charEnd)).toBe(
      'bucket is empty, the request is dropped',
    );
    expect(findAnchorLoose(SPOKEN, 'nothing about elephants here')).toBeNull();
    expect(anchorFor(SPOKEN, 'refill rate is ten')).toEqual(
      findAnchor(SPOKEN, 'refill rate is ten'),
    );
  });

  it('keeps an item whose anchor is the page wording rather than dropping it', () => {
    const built = buildBoardOps(
      draft([
        {
          kind: 'point',
          text: 'empty bucket dropped',
          anchor: 'requests are dropped when empty',
        },
      ]),
      ctx(),
      'a',
      'a-board',
    );
    expect(built.ops.some((op) => op.kind === 'point')).toBe(true);
  });

  it('refuses a point that only names a move or the heading', () => {
    expect(
      namesTopic('challenges with refill', ['challenges with the refill rate']),
    ).toBe(true);
    expect(
      namesTopic('refill sets the average', [
        'challenges with the refill rate',
      ]),
    ).toBe(false);
    const problems = boardProblems(
      draft([
        {
          kind: 'point',
          text: 'refill rate challenges',
          anchor: 'refill rate is ten',
        },
        {
          kind: 'point',
          text: 'refill sets average',
          anchor: 'refill rate sets',
        },
      ]),
      ctx({ moves: ['challenges with the refill rate'], durationMs: 30_000 }),
    );
    expect(problems.map((p) => [p.index, p.kind])).toContainEqual([
      0,
      'topic_label',
    ]);
    expect(problems.some((p) => p.index === 1)).toBe(false);
  });
});

describe('a filter that keeps good notes', () => {
  it('stems a word and its inflections to the same thing', () => {
    const same = (a: string, b: string) =>
      expect(contentWords(a)).toEqual(contentWords(b));
    same('confuses', 'confuse');
    same('reduces', 'reduce');
    same('moved', 'move');
    same('changes', 'change');
    same('dropped', 'drops');
    same('minimizes', 'minimize');
    same('planned', 'plans');
  });

  it('grounds an abbreviation of a word the page says, and forgives one reworded word in a long line', () => {
    const page = ctx({
      pageText: 'Information about the bucket is kept per second.',
    });
    expect(grounded('bucket info', page)).toBe(true);
    expect(abbreviated('information and concentration')).toBe('info + conc');
    // Four content words, one of them new: kept. Two words, one new: not.
    expect(grounded('bucket holds tokens gently', ctx())).toBe(true);
    expect(grounded('bucket gently', ctx())).toBe(false);
  });

  it('does not call a seven-word point a sentence', () => {
    expect(readsAsSentence('only a few keys need to move')).toBe(false);
    expect(
      readsAsSentence(
        'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty',
      ),
    ).toBe(true);
    expect(
      readsAsSentence('The bucket is empty so the request is dropped.'),
    ).toBe(true);
  });

  it('places an item by its own words when its anchor was taken from the page', () => {
    const problems = boardProblems(
      draft([
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'requests get dropped once the bucket runs dry',
        },
      ]),
      ctx({ durationMs: 30_000 }),
    );
    expect(problems.map((p) => p.kind)).not.toContain('anchor_missing');
    const built = buildBoardOps(
      draft([
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'nothing like this is said',
        },
      ]),
      ctx(),
      'f',
      'f-board',
    );
    const point = built.ops.find((op) => op.kind === 'point');
    expect(point).toBeDefined();
    expect(
      SPOKEN.slice(point!.anchor.charStart, point!.anchor.charEnd),
    ).toContain('request is dropped');
  });

  it('flattens a detail whose parent was dropped, and keeps one whose parent stayed', () => {
    const built = buildBoardOps(
      draft([
        {
          kind: 'point',
          text: 'bucket holds tokens',
          anchor: 'token bucket holds tokens',
        },
        {
          kind: 'point',
          text: 'refill \u2192 tokens',
          anchor: 'refill rate is ten',
        },
        {
          kind: 'point',
          text: 'ten tokens per second',
          anchor: 'ten tokens per second',
          level: 2,
        },
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'the request is dropped',
        },
        {
          kind: 'point',
          text: 'burst capacity bucket size',
          anchor: 'burst capacity is',
          level: 2,
        },
      ]),
      ctx(),
      'n',
      'n-board',
    );
    const levels = built.ops
      .filter((op) => op.kind === 'point')
      .map((op) => ('level' in op ? op.level : null));
    // The arrow item is gone, so the detail under it stands alone; the
    // detail under the kept point stays under it.
    expect(levels).toEqual([1, 1, 1, 2]);
  });

  it('gives a page its red line when the writer marked none, preferring the point that states a move', () => {
    const built = buildBoardOps(
      draft([
        {
          kind: 'term',
          text: 'token bucket',
          meaning: 'holds tokens',
          anchor: 'token bucket holds tokens',
        },
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'the request is dropped',
        },
        {
          kind: 'point',
          text: 'refill sets average',
          anchor: 'refill rate sets',
        },
      ]),
      ctx({
        moves: ['the refill rate and the average'],
        spoken: SPOKEN_LONGER,
      }),
      'i',
      'i-board',
    );
    const important = built.ops.filter(
      (op) => (op.kind === 'term' || op.kind === 'point') && op.important,
    );
    expect(important).toHaveLength(1);
    expect(important[0].kind === 'point' && important[0].text).toBe(
      'refill sets average',
    );
  });

  it('opens the fresh board before a term whose detail would not fit under it', () => {
    const filler = fillerTerms(3);
    const built = buildBoardOps(
      draft([
        ...filler,
        {
          kind: 'point',
          text: 'empty bucket dropped',
          anchor: 'bucket is empty',
        },
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'the request is dropped',
        },
        {
          kind: 'term',
          text: 'burst capacity',
          meaning: 'size of the bucket',
          anchor: 'burst capacity is',
        },
        {
          kind: 'point',
          text: 'smooths a burst',
          anchor: 'bucket smooths a burst',
          level: 2,
        },
      ]),
      ctx({ durationMs: 120_000 }),
      'w',
      'w-board',
    );
    const term = built.ops.find(
      (op) => op.kind === 'term' && op.text === 'burst capacity',
    )!;
    const detail = built.ops.find(
      (op) => op.kind === 'point' && op.text === 'smooths a burst',
    )!;
    expect(term.boardId).toBe(detail.boardId);
    expect(term.slot).toBe(1);
    expect(detail.kind === 'point' && detail.level).toBe(2);
  });
});

describe('the retry can only add', () => {
  it('merges the two drafts by sentence: good first-draft items stay, the second stands in where the first failed, then fills what was bare', () => {
    const first = draft([
      {
        kind: 'term',
        text: 'token bucket',
        meaning: 'holds tokens',
        anchor: 'token bucket holds tokens',
      },
      {
        kind: 'point',
        text: 'refill \u2192 ten',
        anchor: 'refill rate is ten',
      },
      {
        kind: 'point',
        text: 'empty request dropped',
        anchor: 'the request is dropped',
      },
    ]);
    const second = draft([
      {
        kind: 'term',
        text: 'token bucket',
        meaning: 'a bucket of tokens',
        anchor: 'token bucket holds tokens',
      },
      {
        kind: 'point',
        text: 'ten tokens per second',
        anchor: 'refill rate is ten',
      },
      {
        kind: 'point',
        text: 'burst capacity bucket size',
        anchor: 'burst capacity is',
      },
    ]);
    const merged = mergeDrafts(first, second, ctx());
    expect(merged.items.map((item) => item.text)).toEqual([
      'token bucket',
      'ten tokens per second',
      'empty request dropped',
      'burst capacity bucket size',
    ]);
    // The first draft's meaning stays; the arrow item was replaced by the
    // second draft's line for the same sentence, not by nothing.
    expect(merged.items[0].meaning).toBe('holds tokens');
    expect(merged.heading).toBe('Token bucket basics');
  });

  it('shortens a long meaning the way a teacher would instead of refusing it', () => {
    const meaning = fittedMeaning(
      'A universally unique identifier that is represented as a 128-bit number for every record',
    );
    expect(meaning.length).toBeLessThanOrEqual(charLimitOf('meaning'));
    expect(endsMidPhrase(meaning)).toBe(false);
    expect(fittedText('point', 'a few keys move')).toBe('a few keys move');
    const long = fittedText(
      'point',
      'a technique to minimize data movement when servers are added or removed',
    );
    // Within the two lines a point may take, it is kept whole and wraps.
    expect(long).toBe(
      'a technique to minimize data movement when servers are added or removed',
    );
    const beyond = fittedText(
      'point',
      'a technique to minimize data movement when servers are added or removed from the ring of servers in the cluster at any time',
    );
    expect(beyond.length).toBeLessThanOrEqual(charLimitOf('point'));
    expect(beyond.startsWith('minimize data movement')).toBe(true);
    const problems = boardProblems(
      draft([
        {
          kind: 'term',
          text: 'token bucket',
          meaning:
            'a bucket that holds tokens and smooths a burst of requests when the bucket is emptied',
          anchor: 'token bucket holds tokens',
        },
      ]),
      ctx({ durationMs: 30_000 }),
    );
    expect(problems.map((p) => p.kind)).not.toContain('too_long');
  });

  it('grounds efficiency with efficient, a modal swap, and three words with one new one, and names the words that fail', () => {
    const page = ctx({ pageText: 'The bucket handles requests efficiently.' });
    expect(grounded('handles requests for efficiency', page)).toBe(true);
    expect(grounded('bucket may drop', ctx())).toBe(true);
    expect(grounded('bucket drops gently', ctx())).toBe(true);
    expect(ungroundedWords('bucket drops gently', ctx())).toEqual(['gently']);
    // A meaning is in the lecturer's words: the page's wording alone does not ground it.
    const printed = ctx({
      pageText: 'A bucket is a leaky container of quota.',
    });
    expect(grounded('leaky container of quota', printed, true)).toBe(true);
    expect(grounded('leaky container of quota', printed)).toBe(true);
  });

  it('refuses a line that ends on a verb waiting for its object', () => {
    const problems = boardProblems(
      draft([
        {
          kind: 'point',
          text: 'set up filters that recognize',
          anchor: 'the request is dropped',
        },
      ]),
      ctx({ durationMs: 30_000 }),
    );
    expect(problems.map((p) => p.kind)).toContain('incomplete');
  });

  it("chooses the red line by the page's idea, later over earlier, and vetoes a mark on the opening line", () => {
    const built = buildBoardOps(
      draft([
        {
          kind: 'point',
          text: 'bucket holds tokens',
          anchor: 'token bucket holds tokens',
          important: true,
        },
        {
          kind: 'point',
          text: 'ten tokens per second',
          anchor: 'refill rate is ten',
        },
        {
          kind: 'point',
          text: 'refill sets average',
          anchor: 'refill rate sets',
        },
      ]),
      ctx({
        goal: 'the refill rate sets the average rate',
        spoken: SPOKEN_LONGER,
      }),
      'g',
      'g-board',
    );
    const important = built.ops.filter(
      (op) => op.kind === 'point' && op.important,
    );
    expect(important).toHaveLength(1);
    expect(important[0].kind === 'point' && important[0].text).toBe(
      'refill sets average',
    );
    // A mark that is not on the opening line stands.
    const kept = buildBoardOps(
      draft([
        {
          kind: 'point',
          text: 'bucket holds tokens',
          anchor: 'token bucket holds tokens',
        },
        {
          kind: 'point',
          text: 'ten tokens per second',
          anchor: 'refill rate is ten',
          important: true,
        },
        {
          kind: 'point',
          text: 'refill sets average',
          anchor: 'refill rate sets',
        },
      ]),
      ctx({
        goal: 'the refill rate sets the average rate',
        spoken: SPOKEN_LONGER,
      }),
      'g',
      'g-board',
    );
    const marked = kept.ops.find((op) => op.kind === 'point' && op.important);
    expect(marked?.kind === 'point' && marked.text).toBe(
      'ten tokens per second',
    );
  });

  it("brings the move's parent, not a sibling detail, onto a fresh board when a detail lands there", () => {
    const filler = fillerTerms(4);
    const built = buildBoardOps(
      draft([
        ...filler,
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'the request is dropped',
        },
        {
          kind: 'point',
          text: 'dropped when bucket empty',
          anchor: 'bucket is empty',
          level: 2,
        },
        {
          kind: 'point',
          text: 'smooths a burst',
          anchor: 'bucket smooths a burst',
          level: 2,
        },
      ]),
      ctx({ durationMs: 120_000 }),
      'e',
      'e-board',
    );
    expect(BOARD_LINES).toBe(10);
    const detail = built.ops.find(
      (op) => op.kind === 'point' && op.text === 'smooths a burst',
    )!;
    const onNewBoard = built.ops.filter(
      (op) => op.boardId === detail.boardId && op.kind === 'point',
    );
    expect(
      onNewBoard.map((op) =>
        op.kind === 'point' ? [op.text, op.level, op.slot] : null,
      ),
    ).toEqual([
      ['empty request dropped', 1, 1],
      ['smooths a burst', 2, 2],
    ]);
  });
});

describe('parents that are claims, details that add', () => {
  it('refuses a heading-shaped point', () => {
    expect(readsAsHeading('understand the problem')).toBe(true);
    expect(readsAsHeading('importance of flexibility')).toBe(true);
    expect(readsAsHeading('consistent hashing as a solution')).toBe(true);
    expect(readsAsHeading('refill sets average')).toBe(false);
    const problems = boardProblems(
      draft([
        {
          kind: 'point',
          text: 'understand the refill rate',
          anchor: 'refill rate is ten',
        },
      ]),
      ctx({ durationMs: 30_000 }),
    );
    expect(problems.map((p) => p.kind)).toContain('topic_label');
  });

  it('refuses a detail that only says its parent again', () => {
    const problems = boardProblems(
      draft([
        {
          kind: 'term',
          text: 'token bucket',
          meaning: 'holds tokens',
          anchor: 'token bucket holds tokens',
        },
        {
          kind: 'point',
          text: 'bucket holds tokens',
          anchor: 'token bucket holds tokens',
          level: 2,
        },
        {
          kind: 'point',
          text: 'ten tokens per second',
          anchor: 'refill rate is ten',
          level: 2,
        },
      ]),
      ctx({ durationMs: 30_000 }),
    );
    expect(problems.map((p) => [p.index, p.kind])).toContainEqual([
      1,
      'restates',
    ]);
    expect(problems.some((p) => p.index === 2)).toBe(false);
  });

  it('keeps a four-word term whole and never cuts a term that fits the line', () => {
    expect(fittedText('term', 'server side API rate limiter')).toBe(
      'server side API rate limiter',
    );
    const problems = boardProblems(
      draft([
        {
          kind: 'term',
          text: 'refill rate per second',
          anchor: 'refill rate is ten',
        },
      ]),
      ctx({ durationMs: 30_000 }),
    );
    expect(problems.map((p) => p.kind)).not.toContain('too_long');
  });

  it("grounds a meaning in the page's words with no slack for an invented one", () => {
    const printed = ctx({
      pageText: 'A bucket is a leaky container of quota.',
    });
    expect(grounded('leaky container of quota', printed, true)).toBe(true);
    expect(grounded('leaky container of magic quota', printed, true)).toBe(
      false,
    );
    expect(grounded('leaky container of magic quota', printed)).toBe(true);
  });

  it('does not make the closing sentence the red line', () => {
    const built = buildBoardOps(
      draft([
        {
          kind: 'point',
          text: 'bucket holds tokens',
          anchor: 'token bucket holds tokens',
        },
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'the request is dropped',
        },
        {
          kind: 'point',
          text: 'refill sets average',
          anchor: 'refill rate sets the average',
        },
      ]),
      ctx({ goal: 'requests are dropped when the bucket is empty' }),
      'c',
      'c-board',
    );
    const marked = built.ops.find((op) => op.kind === 'point' && op.important);
    expect(marked?.kind === 'point' && marked.text).toBe(
      'empty request dropped',
    );
  });
});

describe('nothing said twice, nothing lost', () => {
  it('refuses any line that only repeats an earlier line, meaning or heading', () => {
    const problems = boardProblems(
      draft(
        [
          {
            kind: 'term',
            text: 'token bucket',
            meaning: 'holds tokens',
            anchor: 'token bucket holds tokens',
          },
          {
            kind: 'point',
            text: 'bucket holds tokens',
            anchor: 'token bucket holds tokens',
          },
          {
            kind: 'point',
            text: 'ten tokens per second',
            anchor: 'refill rate is ten',
          },
          {
            kind: 'point',
            text: 'tokens per second',
            anchor: 'tokens per second',
            level: 2,
          },
          { kind: 'point', text: 'bucket basics', anchor: 'burst capacity is' },
        ],
        'Token bucket basics',
      ),
      ctx({ durationMs: 30_000 }),
    );
    const restated = problems
      .filter((p) => p.kind === 'restates')
      .map((p) => p.index);
    expect(restated).toEqual([1, 3, 4]);
  });

  it('lets a list, a number or an example through the heading test, and refuses a verbless label', () => {
    expect(readsAsHeading('covers home, education, activities, drugs')).toBe(
      false,
    );
    expect(readsAsHeading('ages 10 to 24')).toBe(false);
    expect(readsAsHeading('filters catch repetitive URLs like linkbacks')).toBe(
      false,
    );
    expect(readsAsHeading('user experience consideration')).toBe(true);
    expect(readsAsHeading('roles of trained responders')).toBe(true);
    expect(readsAsHeading('few keys move')).toBe(false);
  });

  it('places a term where the lecturer names it, not where a stray anchor points', () => {
    const at = anchorForItem(
      {
        kind: 'term',
        text: 'burst capacity',
        meaning: 'size of the bucket',
        anchor: 'token bucket holds tokens',
      },
      SPOKEN,
      0,
    );
    expect(SPOKEN.slice(at!.charStart, at!.charEnd).toLowerCase()).toBe(
      'burst capacity',
    );
  });

  it('brings the parent onto a fresh board even when a figure came between', () => {
    const filler = fillerTerms(4);
    const built = buildBoardOps(
      draft([
        ...filler,
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'the request is dropped',
        },
        { kind: 'figure', text: '10', anchor: 'ten tokens' },
        {
          kind: 'point',
          text: 'smooths a burst',
          anchor: 'bucket smooths a burst',
          level: 2,
        },
      ]),
      ctx({ durationMs: 120_000 }),
      'e',
      'e-board',
    );
    const detail = built.ops.find(
      (op) => op.kind === 'point' && op.text === 'smooths a burst',
    )!;
    const first = built.ops.find(
      (op) => op.boardId === detail.boardId && op.slot === 1,
    )!;
    expect(first.kind === 'point' && first.text).toBe('empty request dropped');
    expect(detail.kind === 'point' && detail.level).toBe(2);
  });
  it('prefers the sentence the lecturer stresses for the red line, and never the last tenth', () => {
    const spoken =
      'A token bucket holds tokens. The crucial thing is that the refill rate sets the average. ' +
      'When the bucket is empty, the request is dropped. And that is all for this page, on we go.';
    const built = buildBoardOps(
      draft([
        {
          kind: 'point',
          text: 'bucket holds tokens',
          anchor: 'token bucket holds tokens',
        },
        {
          kind: 'point',
          text: 'refill sets average',
          anchor: 'refill rate sets the average',
        },
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'the request is dropped',
        },
        {
          kind: 'point',
          text: 'all for this page',
          anchor: 'all for this page',
        },
      ]),
      ctx({ spoken, pageText: spoken, goal: 'the bucket and its requests' }),
      'r',
      'r-board',
    );
    const marked = built.ops.find((op) => op.kind === 'point' && op.important);
    expect(marked?.kind === 'point' && marked.text).toBe('refill sets average');
  });

  it('lists what both drafts lost and folds valid repairs back in', () => {
    const first = draft([
      {
        kind: 'term',
        text: 'token bucket',
        meaning: 'holds tokens',
        anchor: 'token bucket holds tokens',
      },
      {
        kind: 'point',
        text: 'understand the refill rate',
        anchor: 'refill rate is ten',
      },
    ]);
    const second = draft([
      {
        kind: 'term',
        text: 'token bucket',
        meaning: 'holds tokens',
        anchor: 'token bucket holds tokens',
      },
      {
        kind: 'point',
        text: 'importance of refill',
        anchor: 'refill rate is ten',
      },
    ]);
    const merged = mergeDrafts(first, second, ctx());
    const lost = lostItems([first, second], merged, ctx());
    expect(lost.map((line) => line.text)).toEqual([
      'understand the refill rate',
      'importance of refill',
    ]);
    expect(lost[0].reason).toContain('heading');
    const repaired = mergeRepairs(
      merged,
      draft(
        [
          {
            kind: 'point',
            text: 'ten tokens per second',
            anchor: 'refill rate is ten',
          },
          {
            kind: 'point',
            text: 'still a heading of refill',
            anchor: 'refill rate is ten',
          },
        ],
        null,
      ),
      ctx(),
    );
    expect(repaired.items.map((item) => item.text)).toEqual([
      'token bucket',
      'ten tokens per second',
    ]);
    expect(repaired.heading).toBe('Token bucket basics');
  });
});

describe('no prefixes, no paraphrased repeats, no unspoken meanings', () => {
  it('never writes a prefix: a cut ends on a whole phrase or the line goes back whole', () => {
    const original =
      'Medication taken by people who are not yet infected to prevent HIV infection before';
    const cut = fittedMeaning(original);
    expect(cut === original || !endsMidPhrase(cut)).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(original.length);
    // Within two lines a meaning comes back whole; the rules then refuse
    // one that stops mid-phrase, and the writer condenses it.
    const hanging =
      'assistance provided to help individuals stick to their plan before';
    expect(fittedMeaning(hanging)).toBe(hanging);
    const flagged = boardProblems(
      draft([
        {
          kind: 'term',
          text: 'adherence support',
          meaning: hanging,
          anchor: 'token bucket',
        },
      ]),
      ctx({ durationMs: 30_000 }),
    );
    expect(flagged.map((p) => p.kind)).toContain('incomplete');
    // A line that cannot be cut cleanly is handed back over the limit and refused.
    const uncuttable =
      'of to from with by and or into onto via toward against among';
    expect(fittedText('point', uncuttable)).toBe(uncuttable);
  });
  it('refuses a paraphrase that only adds one word to an earlier line', () => {
    expect(
      repeats(
        ['adherence', 'support', 'help', 'stick', 'treatment'],
        new Set([
          'adherence',
          'support',
          'assist',
          'help',
          'individual',
          'stick',
        ]),
      ),
    ).toBe(true);
    expect(
      repeats(
        ['prep', 'reduc', 'risk', 'infect'],
        new Set(['prep', 'medic', 'prevent', 'hiv', 'infect']),
      ),
    ).toBe(false);
  });

  it('treats a point that carries a meaning as a term', () => {
    expect(
      asDrafted({
        kind: 'point',
        text: 'vertical scaling',
        meaning: 'adding power to one server',
        anchor: 'x',
        level: 2,
      }).kind,
    ).toBe('term');
    expect(
      asDrafted({ kind: 'point', text: 'few keys move', anchor: 'x' }).kind,
    ).toBe('point');
  });

  it('writes the bare term when the meaning is not what the lecturer says there', () => {
    const at = findAnchor(SPOKEN, 'burst capacity')!;
    expect(meaningSpokenNear('size of the bucket', SPOKEN, at)).toBe(true);
    expect(meaningSpokenNear('a leaky container of quota', SPOKEN, at)).toBe(
      false,
    );
    const built = buildBoardOps(
      draft([
        {
          kind: 'term',
          text: 'burst capacity',
          meaning: 'a leaky container of quota',
          anchor: 'burst capacity is',
        },
      ]),
      ctx({ pageText: `${PAGE} A leaky container of quota.` }),
      'm',
      'm-board',
    );
    const term = built.ops.find((op) => op.kind === 'term');
    expect(term?.kind === 'term' && term.meaning).toBeNull();
  });

  it('folds a repair in even when its sentence already has a term, unless it repeats', () => {
    const merged = draft([
      {
        kind: 'term',
        text: 'token bucket',
        meaning: 'holds tokens',
        anchor: 'token bucket holds tokens',
      },
    ]);
    const repaired = mergeRepairs(
      merged,
      draft(
        [
          {
            kind: 'point',
            text: 'bucket holds tokens',
            anchor: 'token bucket holds tokens',
          },
          {
            kind: 'point',
            text: 'ten tokens per second',
            anchor: 'refill rate is ten',
          },
        ],
        null,
      ),
      ctx(),
    );
    expect(repaired.items.map((item) => item.text)).toEqual([
      'token bucket',
      'ten tokens per second',
    ]);
  });

  it('calls a plural abstract label a heading', () => {
    expect(readsAsHeading('scalability concerns')).toBe(true);
    expect(readsAsHeading('mass casualty situations')).toBe(true);
    expect(readsAsHeading('few keys move')).toBe(false);
  });
});

describe('finishing touches from the sixth round', () => {
  it('keeps a claim with a verb, hangs an inflected verb, and refuses a cut list', () => {
    expect(readsAsSentence('Nigeria has poor road networks')).toBe(false);
    expect(endsMidPhrase('adherence support means helping')).toBe(true);
    expect(endsMidPhrase('assistance kindly provided')).toBe(true);
    expect(endsMidPhrase('few keys move')).toBe(false);
    const list =
      'covers home, education, activities, drugs, sexuality, suicide, safety';
    expect(fittedText('point', list)).toBe(list);
  });

  it('takes a definition given two sentences after the term is named', () => {
    const spoken =
      'Now the burst capacity. It matters a great deal here. It is the size of the bucket, nothing more.';
    const at = findAnchor(spoken, 'burst capacity')!;
    expect(meaningSpokenNear('size of the bucket', spoken, at)).toBe(true);
  });

  it('marks a point rather than a better-scoring term, and never one in the closing stretch', () => {
    const spoken =
      'A token bucket holds tokens. The refill rate is ten tokens per second. When the bucket is empty, the request is dropped. And that is all for this page, on we go.';
    const built = buildBoardOps(
      draft([
        {
          kind: 'term',
          text: 'refill rate',
          meaning: 'ten tokens per second',
          anchor: 'refill rate is ten',
        },
        {
          kind: 'point',
          text: 'empty request dropped',
          anchor: 'the request is dropped',
        },
        {
          kind: 'point',
          text: 'all for this page',
          anchor: 'all for this page',
        },
      ]),
      ctx({
        spoken,
        pageText: spoken,
        goal: 'the refill rate in tokens per second',
      }),
      'h',
      'h-board',
    );
    const marked = built.ops.find(
      (op) => (op.kind === 'point' || op.kind === 'term') && op.important,
    );
    expect(marked?.kind === 'point' && marked.text).toBe(
      'empty request dropped',
    );
  });
});

describe('notes keyed to numbered sentences, and lines that wrap', () => {
  it('numbers the spoken sentences the way the writer sees them', () => {
    const numbered = numberedSentences(SPOKEN).split('\n');
    expect(numbered[0]).toBe('1. A token bucket holds tokens.');
    expect(numbered[2]).toBe(
      '3. When the bucket is empty, the request is dropped.',
    );
    expect(numbered).toHaveLength(5);
  });

  it('places a sentence-keyed item in its sentence, on its own words when they are there', () => {
    const whole = sentenceAnchor(
      { kind: 'point', text: 'nothing of note', sentence: 3 },
      SPOKEN,
    )!;
    expect(SPOKEN.slice(whole.charStart, whole.charEnd)).toBe(
      'When the bucket is empty, the request is dropped.',
    );
    const narrowed = sentenceAnchor(
      { kind: 'point', text: 'request dropped', sentence: 3 },
      SPOKEN,
    )!;
    expect(SPOKEN.slice(narrowed.charStart, narrowed.charEnd)).toBe(
      'request is dropped',
    );
    expect(
      sentenceAnchor({ kind: 'point', text: 'x', sentence: 9 }, SPOKEN),
    ).toBeNull();
    const problems = boardProblems(
      draft([{ kind: 'point', text: 'empty request dropped', sentence: 9 }]),
      ctx({ durationMs: 30_000 }),
    );
    expect(problems[0]).toMatchObject({ kind: 'anchor_missing', index: 0 });
    expect(problems[0].detail).toContain('sentence 9');
    const built = buildBoardOps(
      draft([
        {
          kind: 'term',
          text: 'token bucket',
          meaning: 'holds tokens',
          sentence: 1,
        },
        { kind: 'point', text: 'ten tokens per second', sentence: 2 },
        { kind: 'point', text: 'empty request dropped', sentence: 3 },
      ]),
      ctx(),
      's',
      's-board',
    );
    const starts = built.ops
      .filter((op) => op.kind !== 'heading')
      .map((op) => op.anchor.charStart);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(built.ops.filter((op) => op.kind !== 'heading')).toHaveLength(3);
  });

  it('lets a point or a meaning wrap onto a second line instead of cutting it, and books the lines', () => {
    const long =
      'when the bucket is empty the request is dropped and the refill rate then sets the average';
    expect(linesOf(long, 'point')).toBe(2);
    expect(charLimitOf('point')).toBe(96);
    expect(fittedText('point', long)).toBe(long);
    const built = buildBoardOps(
      draft([
        { kind: 'point', text: long, anchor: 'refill rate sets' },
        {
          kind: 'term',
          text: 'burst capacity',
          meaning: 'the size of the bucket that smooths a burst of requests',
          anchor: 'burst capacity is',
        },
        {
          kind: 'point',
          text: 'ten tokens per second',
          anchor: 'refill rate is ten',
        },
      ]),
      ctx(),
      'l',
      'l-board',
    );
    const [point, term, next] = built.ops.filter((op) => op.kind !== 'heading');
    expect(point.lines).toBe(2);
    expect(term.slot).toBe(3);
    expect(term.lines).toBe(3);
    expect(next.slot).toBe(6);
    expect(
      nextFreeLine({
        ...emptyTimeline(SPOKEN.length),
        boards: built.boards,
        ops: built.ops,
      }),
    ).toBe(7);
  });
});

describe('the words-first board finishes its meanings', () => {
  it('lets a chapter term take two lines rather than cutting it at one', () => {
    const drafted = termsDraft('Design consistent hashing', [
      {
        term: 'consistent hashing',
        meaning:
          'A technique used to distribute data across servers while minimizing rehashing when servers are added or removed',
      },
    ]);
    const meaning = drafted.items[0].meaning ?? '';
    expect(meaning.length).toBeGreaterThan(54);
    expect(meaning.length).toBeLessThanOrEqual(charLimitOf('meaning'));
    expect(endsMidPhrase(meaning)).toBe(false);
    expect(meaning).toContain('rehashing');
    expect(linesOf(meaning, 'meaning')).toBe(2);
  });

  it('knows a clause that never came', () => {
    expect(
      endsMidPhrase('distribute data across servers while minimizing'),
    ).toBe(true);
    expect(endsMidPhrase('distribute data across servers while')).toBe(true);
    expect(endsMidPhrase('keys remapped when server count changes')).toBe(
      false,
    );
    expect(endsMidPhrase('remapping keys when server count changes')).toBe(
      false,
    );
    expect(
      shorten(
        'distribute data across servers while minimizing rehashing',
        6,
        60,
      ),
    ).not.toMatch(/minimizing$/);
  });
});
