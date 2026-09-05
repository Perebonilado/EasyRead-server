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
  wordEndAt,
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
  boardMarks,
  cutWordAtEnd,
  labelForMove,
  linesOfTimeline,
  listEndOffsets,
  listsFromRuns,
  markedDraft,
  mergePlanLines,
  repairCutWords,
  withoutCutWord,
  planProblems,
  type PlanLineDraft,
  boardTimeOf,
  audioTimeOf,
  MAX_IMPORTANT,
  OVERRUN_MS,
  PAUSE_MS,
  numbersAsWords,
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

  it('keeps up to three important items, the first three the writer marked', () => {
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
    expect(flags).toEqual([true, true]);
    const many = buildBoardOps(
      draft([
        { kind: 'term', text: 'token bucket', anchor: 'token bucket' },
        ...fillerTerms(4).map((term) => ({ ...term, important: true })),
      ]),
      ctx(),
      'q',
      'q-board',
    );
    expect(
      many.ops.filter((op) => 'important' in op && op.important).length,
    ).toBe(MAX_IMPORTANT);
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

describe('a planned board held to the rules before the speech exists', () => {
  const PAGE =
    'A token bucket holds a fixed number of tokens, and a request takes one. ' +
    'When the bucket is empty the request is dropped, which is the whole point. ' +
    'The refill rate is 10 tokens a second.';
  const ctx = {
    pageText: PAGE,
    planLines: ['Teach the token bucket', 'token bucket a bucket of tokens'],
    moves: ['introduce the bucket', 'what happens when it is empty'],
  };
  const line = (
    move: number,
    kind: 'term' | 'point' | 'figure',
    text: string,
    meaning: string | null = null,
  ) => ({ move, kind, text, meaning, level: null, important: null });

  it('passes a board of short grounded notes and refuses the rest, naming why', () => {
    const good = {
      heading: 'Token bucket',
      lines: [
        line(
          0,
          'term',
          'token bucket',
          'holds fixed tokens, a request takes one',
        ),
        line(0, 'figure', '10 tokens/s'),
        line(1, 'point', 'empty bucket: request dropped'),
      ],
    };
    expect(planProblems(good, ctx)).toEqual([]);
    const bad = {
      heading: 'Notes',
      lines: [
        line(0, 'point', 'The bucket holds a fixed number of tokens.'),
        line(0, 'point', 'importance of the bucket'),
        line(0, 'term', 'leaky bucket', 'a queue that drains at a fixed rate'),
        line(3, 'point', 'empty bucket: request dropped'),
        line(1, 'figure', '99 tokens/s'),
        line(1, 'point', 'empty bucket: request dropped'),
      ],
    };
    const problems = planProblems(bad, ctx);
    const kinds = problems.map((problem) => problem.kind);
    expect(kinds).toContain('too_short');
    expect(kinds).toContain('sentence');
    expect(kinds).toContain('topic_label');
    expect(kinds).toContain('ungrounded');
    expect(kinds).toContain('anchor_missing');
    // Cheering is not a note.
    expect(
      planProblems(
        {
          heading: 'Token bucket',
          lines: [line(0, 'point', 'keep learning about token buckets')],
        },
        ctx,
      ).map((problem) => problem.kind),
    ).toContain('topic_label');
    expect(kinds).toContain('duplicate');
    expect(
      problems.find((problem) => problem.kind === 'anchor_missing')?.detail,
    ).toContain('move 3');
    // The heading problem carries no index; every line problem does.
    expect(
      problems.filter((problem) => problem.index === undefined),
    ).toHaveLength(1);
  });
});

describe('a word cut short at the end of a line', () => {
  const PAGE =
    'Consistent hashing distributes data across servers so that few keys are remapped when servers are added or removed.';
  const pool = ctx({ spoken: PAGE, pageText: PAGE });

  it('is seen by the rules, at plan time and at build time', () => {
    expect(
      cutWordAtEnd('keys remapped when servers are added/remo', pool),
    ).toBe('remo');
    expect(
      cutWordAtEnd('keys remapped when servers are added', pool),
    ).toBeNull();
    // A word the page has in another form is a word, not a cut.
    expect(
      cutWordAtEnd(
        'a rule that turns any name into a number',
        ctx({ spoken: 'It turns names into numbers.', pageText: '' }),
      ),
    ).toBeNull();
    // A short tail, a number, or a word of the page is not a cut.
    expect(cutWordAtEnd('few keys are', pool)).toBeNull();
    expect(cutWordAtEnd('hash space 2^160', pool)).toBeNull();
    expect(cutWordAtEnd('data across servers', pool)).toBeNull();
    const planned = planProblems(
      {
        heading: 'Consistent hashing',
        lines: [
          {
            move: 0,
            kind: 'term',
            text: 'consistent hashing',
            meaning: 'few keys remapped when servers are added/remo',
            level: null,
            important: null,
          },
        ],
      },
      { pageText: PAGE, planLines: [], moves: ['what it is'] },
    );
    expect(planned.some((problem) => problem.kind === 'incomplete')).toBe(true);
    expect(
      planned.find((problem) => problem.kind === 'incomplete')?.detail,
    ).toContain('cut word "remo"');
  });

  it('is mended before the board is built: the cut word goes, the phrase stays whole', () => {
    const draft = {
      heading: 'Consistent hashing',
      items: [
        {
          kind: 'term' as const,
          text: 'consistent hashing',
          meaning: 'few keys remapped when servers are added/remo',
          at: 0,
        },
        {
          kind: 'point' as const,
          text: 'keys remapped when servers are remo',
          at: 40,
        },
      ],
    };
    const mended = repairCutWords(draft, pool);
    expect(mended.items[0].meaning).toBe(
      'few keys remapped when servers are added',
    );
    // "servers are" would hang, so the line is left for the rules.
    expect(mended.items[1].text).toBe('keys remapped when servers are remo');
    expect(withoutCutWord('added/remo')).toBe('added');
  });
});

describe('the lines a stored board carries', () => {
  it('are read back in order with the heading, and nothing for a board with no writing', () => {
    const timeline: BoardTimeline = {
      ...emptyTimeline(100),
      boards: [
        { id: 'b-0', heading: 'Token bucket', startsAtMs: 0, continues: false },
      ],
      ops: [
        {
          id: 'h',
          kind: 'heading',
          boardId: 'b-0',
          slot: 0,
          text: 'Token bucket',
          anchor: { charStart: 0, charEnd: 5 },
          priority: 1,
          seed: 1,
          t0Ms: 0,
          durMs: 1000,
        },
        {
          id: 't',
          kind: 'term',
          boardId: 'b-0',
          slot: 1,
          text: 'refill rate',
          meaning: 'ten tokens a second',
          anchor: { charStart: 10, charEnd: 20 },
          priority: 1,
          seed: 2,
          t0Ms: 1000,
          durMs: 1000,
          important: true,
        },
        {
          id: 'p',
          kind: 'point',
          boardId: 'b-0',
          slot: 3,
          text: 'empty bucket: request dropped',
          level: 2,
          anchor: { charStart: 30, charEnd: 40 },
          priority: 2,
          seed: 3,
          t0Ms: 2000,
          durMs: 1000,
        },
      ] as BoardTimeline['ops'],
      marked: true,
    };
    const lines = linesOfTimeline(timeline)!;
    expect(lines.heading).toBe('Token bucket');
    expect(
      lines.lines.map((line) => [line.number, line.kind, line.text]),
    ).toEqual([
      [1, 'term', 'refill rate'],
      [2, 'point', 'empty bucket: request dropped'],
    ]);
    expect(lines.lines[0].meaning).toBe('ten tokens a second');
    expect(lines.lines[0].important).toBe(true);
    expect(lines.lines[1].level).toBe(2);
    expect(linesOfTimeline({ ...emptyTimeline(10), marked: true })).toBeNull();
  });
});

describe('what the fan-out review taught the rules', () => {
  const spokenOf = (script: string) =>
    script
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  it('places a figure the voice said in words', () => {
    expect(numbersAsWords('4 cache keys')).toBe('four cache keys');
    const spoken = 'We start with four cache keys. Each lands somewhere.';
    const marks = boardMarks(spoken, spoken, [{ move: 0, text: spoken }], {
      heading: 'Keys',
      lines: [
        {
          number: 1,
          move: 0,
          kind: 'figure',
          text: '4 cache keys',
          meaning: null,
          level: null,
          important: null,
        },
      ],
    })!;
    expect(marks.lines[0].placed).toBe('words');
    expect(spoken.slice(marks.lines[0].at).startsWith('four cache keys')).toBe(
      true,
    );
  });

  it('backs a move label off to a whole phrase, or gives up', () => {
    expect(labelForMove('how to pick a hash function')).toBe('How to pick');
    expect(labelForMove('real-world uses: Dynamo, Cassandra, Discord')).toBe(
      'Real-world uses',
    );
    expect(labelForMove('a')).toBe('');
  });

  it('treats a shared name as the same member only among list members', () => {
    const claim = (text: string, level: 1 | 2 | null = null) => ({
      move: 0,
      kind: 'point' as const,
      text,
      meaning: null,
      level,
      important: null,
    });
    expect(
      mergePlanLines(
        [claim('Virtual nodes spread the load evenly')],
        [claim('Virtual nodes are copies of one server on the ring')],
      ),
    ).toHaveLength(2);
    expect(
      mergePlanLines(
        [claim('1 server hands out every ID')],
        [claim('1 in 1000 requests collide')],
      ),
    ).toHaveLength(2);
    expect(
      mergePlanLines(
        [claim('Apache Cassandra partitions data', 2)],
        [claim('used in Apache Cassandra', 2)],
      ),
    ).toHaveLength(1);
    // A draft deduplicated against itself, one line at a time.
    expect(
      mergePlanLines(
        [],
        [
          claim('Discord chat app uses consistent hashing', 2),
          claim('employed in Discord chat application', 2),
        ],
      ),
    ).toHaveLength(1);
  });

  it('knows a cut word from a plural, and a fragment from a figure', () => {
    const pool = ctx({
      spoken: 'Old entries are removed. It turns names into numbers.',
      pageText: '',
    });
    expect(cutWordAtEnd('old entries remov', pool)).toBe('remov');
    expect(cutWordAtEnd('turns a name into a number', pool)).toBeNull();
    const problems = planProblems(
      {
        heading: 'Modulo hashing',
        lines: [
          {
            move: 0,
            kind: 'figure',
            text: '% 4',
            meaning: null,
            level: null,
            important: null,
          },
        ],
      },
      {
        pageText: 'hash(key) % 4 picks the server',
        planLines: [],
        moves: ['the formula'],
      },
    );
    expect(problems.some((problem) => problem.kind === 'incomplete')).toBe(
      true,
    );
  });

  it('waits at the end of the sentence a list ends in, and gives a red line a breath', () => {
    const script =
      'Three uses. [write 1] Real-world uses. [write 2] Dynamo. [write 3] Cassandra. Finally [write 4] Discord routes chat with it too. [write 5] Few keys move when a server joins, which is the whole point. And so on it goes.';
    const spoken = spokenOf(script);
    const line = (
      number: number,
      text: string,
      level: 1 | 2 | null,
      kind: 'term' | 'point',
      important = false,
    ) => ({ number, move: 0, kind, text, meaning: null, level, important });
    const marks = boardMarks(script, spoken, [{ move: 0, text: script }], {
      heading: 'Uses',
      lines: [
        line(1, 'Real-world uses', null, 'term'),
        line(2, 'Dynamo', 2, 'point'),
        line(3, 'Cassandra', 2, 'point'),
        line(4, 'Discord routes chat with it too', 2, 'point'),
        line(5, 'few keys move when a server joins', null, 'point', true),
      ],
    })!;
    const built = buildBoardOps(
      markedDraft(marks),
      ctx({ spoken, pageText: spoken, durationMs: 30_000 }),
      'm',
      'm-board',
    );
    const times = estimateWordTimes(spoken, 30_000, 'k');
    const timed = timeBoard(
      {
        ...emptyTimeline(spoken.length),
        boards: built.boards,
        ops: built.ops,
        marked: true,
      },
      times,
      30_000,
      'gentle',
      spoken,
    );
    const listEnd = spoken.indexOf('too.') + 'too.'.length;
    const redEnd = spoken.indexOf('whole point.') + 'whole point.'.length;
    expect(timed.holds!.map((hold) => hold.atMs)).toEqual([
      wordEndAt(times, listEnd),
      wordEndAt(times, redEnd),
    ]);
    expect(timed.holds![0].forMs).toBe(PAUSE_MS.gentle);
    expect(timed.holds![1].forMs).toBe(Math.round(PAUSE_MS.gentle / 2));
    // The board break before an echo does not end a list.
    expect(
      listEndOffsets([
        ...built.ops.slice(0, 3),
        { ...built.ops[0], kind: 'board', nextBoardId: 'x' } as never,
        ...built.ops.slice(3),
      ]).length,
    ).toBe(1);
  });
});

describe('a run of flat points is a list', () => {
  const point = (move: number, text: string, important = false) => ({
    move,
    kind: 'point' as const,
    text,
    meaning: null,
    level: null,
    important,
  });

  it("puts three or more flat points of one move under the move's name, and leaves shorter runs and red lines alone", () => {
    const shaped = listsFromRuns(
      [
        point(0, 'few keys move when a server joins', true),
        point(1, 'Amazon Dynamo stores data this way'),
        point(1, 'Apache Cassandra partitions with it'),
        point(1, 'Discord routes chat with it'),
      ],
      ['summarizing benefits', 'real-world applications'],
    );
    expect(
      shaped.map(
        (line) => `${line.kind}${line.level === 2 ? '2' : ''}:${line.text}`,
      ),
    ).toEqual([
      'point:few keys move when a server joins',
      'term:Real-world applications',
      'point2:Amazon Dynamo stores data this way',
      'point2:Apache Cassandra partitions with it',
      'point2:Discord routes chat with it',
    ]);
    expect(labelForMove('explaining the rehashing problem')).toBe(
      'Rehashing problem',
    );
    // Two points are not a list; a run with the red line is not regrouped.
    expect(
      listsFromRuns(
        [point(0, 'one claim'), point(0, 'another claim')],
        ['benefits'],
      ).map((line) => line.kind),
    ).toEqual(['point', 'point']);
    expect(
      listsFromRuns(
        [point(0, 'one', true), point(0, 'two'), point(0, 'three')],
        ['benefits'],
      ).map((line) => line.kind),
    ).toEqual(['point', 'point', 'point']);
  });
});

describe('two plans for a page, merged so the retry can only add', () => {
  const line = (
    move: number,
    text: string,
    meaning: string | null = null,
  ): PlanLineDraft => ({
    move,
    kind: 'point',
    text,
    meaning,
    level: null,
    important: null,
  });

  it('keeps every line of the first, adds what the second says anew, in move order', () => {
    const first = [
      line(0, 'token bucket holds fixed tokens'),
      line(1, 'empty bucket: request dropped'),
    ];
    const second = [
      line(0, 'token bucket holds fixed tokens'),
      line(0, 'refill rate sets the average'),
      line(1, 'request dropped when the bucket is empty'),
      line(1, 'no queue, no waiting'),
    ];
    const merged = mergePlanLines(first, second);
    expect(merged.map((entry) => entry.text)).toEqual([
      'token bucket holds fixed tokens',
      'refill rate sets the average',
      'empty bucket: request dropped',
      'no queue, no waiting',
    ]);
    expect(mergePlanLines(first, [])).toEqual(first);
    // A member naming the same thing in other words is the same member.
    const member = (text: string) => ({ ...line(1, text), level: 2 as const });
    const uses = [
      member('Apache Cassandra for data partitioning'),
      member('Akamai content delivery network uses it'),
    ];
    const again = [
      member('used in Apache Cassandra'),
      member('utilized by Akamai CDN'),
      member('Maglev network load balancer implements it'),
    ];
    expect(mergePlanLines(uses, again).map((entry) => entry.text)).toEqual([
      'Apache Cassandra for data partitioning',
      'Akamai content delivery network uses it',
      'Maglev network load balancer implements it',
    ]);
  });
});

describe('a board planned before the speech and placed by it', () => {
  const SCRIPT =
    'A token bucket holds tokens. So, [write 1] the refill rate: ten tokens per second. ' +
    'Every second, ten more tokens. [write 2] When the bucket is empty, the request is dropped. ' +
    'Look at [point 1] the refill rate again: it sets the average.';
  const SECTIONS = [{ move: 0, text: SCRIPT }];
  const BOARD = {
    heading: 'Token bucket',
    lines: [
      {
        number: 1,
        move: 0,
        kind: 'term' as const,
        text: 'refill rate',
        meaning: 'ten tokens per second',
        level: null,
        important: null,
      },
      {
        number: 2,
        move: 0,
        kind: 'point' as const,
        text: 'empty bucket: request dropped',
        meaning: null,
        level: null,
        important: true,
      },
    ],
  };
  const spokenOf = (script: string) =>
    script
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();

  it('places each line where its words are said, and a cue where the speech comes back', () => {
    const spoken = spokenOf(SCRIPT);
    const marks = boardMarks(SCRIPT, spoken, SECTIONS, BOARD)!;
    expect(marks.heading).toBe('Token bucket');
    expect(marks.lines).toHaveLength(2);
    expect(spoken.slice(marks.lines[0].at).startsWith('refill rate: ten')).toBe(
      true,
    );
    expect(spoken.slice(marks.lines[1].at).startsWith('bucket is empty')).toBe(
      true,
    );
    expect(marks.cues).toHaveLength(1);
    expect(marks.cues[0].line).toBe(0);
    expect(spoken.slice(marks.cues[0].at, marks.cues[0].at + 15)).toBe(
      'the refill rate',
    );
    expect(marks.lines.every((line) => line.placed === 'words')).toBe(true);
    expect(
      boardMarks(SCRIPT, spoken, SECTIONS, { heading: 'x', lines: [] }),
    ).toBeNull();
  });

  it('falls back to the mark, then the move, for a line whose words are not said, and orders the lines as written', () => {
    const spoken = spokenOf(SCRIPT);
    const board = {
      heading: 'Token bucket',
      lines: [
        BOARD.lines[1],
        { ...BOARD.lines[0], number: 1 },
        {
          number: 3,
          move: 0,
          kind: 'point' as const,
          text: 'rate sets the average',
          meaning: null,
          level: null,
          important: null,
        },
      ],
    };
    const marks = boardMarks(SCRIPT, spoken, SECTIONS, board)!;
    expect(marks.lines.map((line) => line.number)).toEqual([1, 2, 3]);
    const last = marks.lines[2];
    expect(last.placed).toBe('words');
    // Placed where its words are said: the closing "rate again: it sets the average".
    expect(spoken.slice(last.at).startsWith('rate again')).toBe(true);
    expect(last.at).toBeGreaterThan(marks.lines[1].at);
    // Words not said: the writer's mark stands in.
    const byMark = boardMarks(SCRIPT, spoken, SECTIONS, {
      heading: 'x',
      lines: [{ ...BOARD.lines[1], text: 'nothing of this is said' }],
    })!;
    expect(byMark.lines[0].placed).toBe('mark');
    expect(spoken.slice(byMark.lines[0].at).startsWith('When the bucket')).toBe(
      true,
    );
    // Neither said nor marked: the start of its move's section.
    const lost = boardMarks(SCRIPT, spoken, SECTIONS, {
      heading: 'x',
      lines: [
        { ...board.lines[2], number: 9, text: 'nothing of this is said' },
      ],
    })!;
    expect(lost.lines[0].placed).toBe('move');
    expect(lost.lines[0].at).toBe(0);
    // A full stop on a planned line never reaches the pen.
    const dotted = markedDraft(
      boardMarks(SCRIPT, spoken, SECTIONS, {
        heading: 'x',
        lines: [{ ...BOARD.lines[1], text: 'empty bucket: request dropped.' }],
      })!,
    );
    expect(dotted.items[0].text).toBe('empty bucket: request dropped');
  });

  it('builds the ops from the marks with exact anchors, the cue on its line', () => {
    const spoken = spokenOf(SCRIPT);
    const marks = boardMarks(SCRIPT, spoken, SECTIONS, BOARD)!;
    const built = buildBoardOps(
      markedDraft(marks),
      ctx({ spoken, pageText: spoken, durationMs: 30_000 }),
      'm',
      'm-board',
    );
    const term = built.ops.find((op) => op.kind === 'term')!;
    const point = built.ops.find((op) => op.kind === 'point')!;
    const cue = built.ops.find((op) => op.kind === 'cue');
    expect(term.anchor.charStart).toBe(marks.lines[0].at);
    expect(point.anchor.charStart).toBe(marks.lines[1].at);
    expect(point.kind === 'point' && point.important).toBe(true);
    expect(cue && cue.kind === 'cue' && cue.targetId).toBe(term.id);
  });

  it('lets the pen follow the voice: a line said as written starts with its first word, ends with its last, and paces by the words', () => {
    const spoken = spokenOf(SCRIPT);
    const marks = boardMarks(SCRIPT, spoken, SECTIONS, BOARD)!;
    expect(marks.lines[0].until).toBeGreaterThan(marks.lines[0].at);
    const built = buildBoardOps(
      markedDraft(marks),
      ctx({ spoken, pageText: spoken, durationMs: 8_000 }),
      'm',
      'm-board',
    );
    const term = built.ops.find((op) => op.kind === 'term')!;
    expect(term.dictated).toBe(true);
    expect(spoken.slice(term.anchor.charStart, term.anchor.charEnd)).toBe(
      'refill rate: ten tokens per second',
    );
    const timeline = {
      ...emptyTimeline(spoken.length),
      boards: built.boards,
      ops: built.ops,
      marked: true,
    };
    const times = estimateWordTimes(spoken, 8_000, 'k');
    const timed = timeBoard(timeline, times, 8_000, 'gentle', spoken);
    expect(timed.marked).toBe(true);
    // No waiting for the pen: the voice is the pace. The one hold is the
    // breath after the red line's sentence.
    expect(timed.holds).toHaveLength(1);
    expect(timed.holds![0].forMs).toBe(Math.round(PAUSE_MS.gentle / 2));
    const timedTerm = timed.ops.find((op) => op.kind === 'term')!;
    // Starts with its first word, or the moment the heading's pen lifts.
    const first = wordStartAt(times, term.anchor.charStart);
    expect(timedTerm.t0Ms).toBeGreaterThanOrEqual(first);
    expect(timedTerm.t0Ms).toBeLessThanOrEqual(first + 300);
    expect(timedTerm.t0Ms! + timedTerm.durMs!).toBe(
      wordEndAt(times, term.anchor.charEnd),
    );
    // "refill rate" and "ten tokens per second": six words, seven marks.
    expect(timedTerm.pace).toHaveLength(7);
    expect(timedTerm.pace![0]).toBe(0);
    expect(timedTerm.pace![6]).toBe(timedTerm.durMs);
    for (let i = 1; i < 7; i += 1) {
      expect(timedTerm.pace![i]).toBeGreaterThanOrEqual(timedTerm.pace![i - 1]);
    }
    // Nothing is left half-written when the row ends.
    for (const op of timed.ops) {
      if (op.t0Ms === null || op.durMs === null) continue;
      expect(op.t0Ms + op.durMs).toBeLessThanOrEqual(8_000 + OVERRUN_MS);
    }
  });

  it("waits at a pause in the script: a hold of the style's length, and every later line moves by it", () => {
    const spoken = spokenOf(SCRIPT);
    const marks = boardMarks(SCRIPT, spoken, SECTIONS, BOARD)!;
    const built = buildBoardOps(
      markedDraft(marks),
      ctx({ spoken, pageText: spoken, durationMs: 30_000 }),
      'm',
      'm-board',
    );
    const timeline = {
      ...emptyTimeline(spoken.length),
      boards: built.boards,
      ops: built.ops,
      marked: true,
    };
    const times = estimateWordTimes(spoken, 30_000, 'k');
    // A pause after the first line's sentence ("...per second.").
    const pauseAt = spoken.indexOf('Every second');
    const timed = timeBoard(timeline, times, 30_000, 'gentle', spoken, [
      pauseAt,
    ]);
    // The script's pause, and the breath after the red point's sentence.
    expect(timed.holds).toHaveLength(2);
    expect(timed.holds![0].forMs).toBe(PAUSE_MS.gentle);
    expect(timed.holds![0].atMs).toBe(wordEndAt(times, pauseAt));
    const point = timed.ops.find((op) => op.kind === 'point')!;
    const plain = timeBoard(timeline, times, 30_000, 'gentle', spoken);
    const plainPoint = plain.ops.find((op) => op.kind === 'point')!;
    // The point is spoken after the pause, so its board time carries it.
    expect(point.t0Ms).toBe(plainPoint.t0Ms! + PAUSE_MS.gentle);
    expect(plain.holds).toHaveLength(1);
  });

  it('waits after a list on the board even when the script did not pause', () => {
    const script =
      'Three real uses. [write 1] Real-world uses. [write 2] Dynamo. [write 3] Cassandra. [write 4] Discord. Each of these spreads its data this way.';
    const spoken = spokenOf(script);
    const line = (number: number, text: string, level: 1 | 2 | null) => ({
      number,
      move: 0,
      kind: level === 2 ? ('point' as const) : ('term' as const),
      text,
      meaning: null,
      level,
      important: null,
    });
    const marks = boardMarks(script, spoken, [{ move: 0, text: script }], {
      heading: 'Uses',
      lines: [
        line(1, 'Real-world uses', null),
        line(2, 'Dynamo', 2),
        line(3, 'Cassandra', 2),
        line(4, 'Discord', 2),
      ],
    })!;
    const built = buildBoardOps(
      markedDraft(marks),
      ctx({ spoken, pageText: spoken, durationMs: 20_000 }),
      'm',
      'm-board',
    );
    expect(listEndOffsets(built.ops)).toHaveLength(1);
    const times = estimateWordTimes(spoken, 20_000, 'k');
    const timed = timeBoard(
      {
        ...emptyTimeline(spoken.length),
        boards: built.boards,
        ops: built.ops,
        marked: true,
      },
      times,
      20_000,
      'gentle',
      spoken,
    );
    expect(timed.holds).toHaveLength(1);
    expect(timed.holds![0].forMs).toBe(PAUSE_MS.gentle);
    // At the end of "Discord", before the explanation.
    const discord = spoken.indexOf('Discord.') + 'Discord.'.length;
    expect(timed.holds![0].atMs).toBe(wordEndAt(times, discord));
    // A script pause at the same moment is not doubled.
    const both = timeBoard(
      {
        ...emptyTimeline(spoken.length),
        boards: built.boards,
        ops: built.ops,
        marked: true,
      },
      times,
      20_000,
      'gentle',
      spoken,
      [discord],
    );
    expect(both.holds).toHaveLength(1);
    expect(both.holds![0].forMs).toBe(PAUSE_MS.gentle);
  });

  it('gives a line it never says as written no span, so the old timing applies to it', () => {
    const spoken = spokenOf(SCRIPT);
    const marks = boardMarks(SCRIPT, spoken, SECTIONS, {
      heading: 'x',
      lines: [
        {
          ...BOARD.lines[1],
          text: 'nothing of this line is ever said aloud on the page',
        },
      ],
    })!;
    expect(marks.lines[0].until).toBeUndefined();
    const built = buildBoardOps(
      markedDraft(marks),
      ctx({
        spoken,
        pageText: `${spoken} nothing of this line is ever said aloud on the page`,
        durationMs: 8_000,
      }),
      'm',
      'm-board',
    );
    const point = built.ops.find((op) => op.kind === 'point');
    expect(point?.dictated).toBeUndefined();
    // A figure is placed only where its numbers are said: "ten tokens per
    // second" is not "10 tokens/s", so it goes to its move, not to the
    // sentence that happens to share a word.
    const figure = boardMarks(SCRIPT, spoken, SECTIONS, {
      heading: 'x',
      lines: [
        {
          number: 3,
          move: 0,
          kind: 'figure',
          text: '10 tokens/s',
          meaning: null,
          level: null,
          important: null,
        },
      ],
    })!;
    expect(figure.lines[0].placed).toBe('move');
  });

  it('converts between audio time and board time across holds', () => {
    const timeline = {
      holds: [
        { atMs: 5_000, forMs: 2_000 },
        { atMs: 12_000, forMs: 1_000 },
      ],
    };
    expect(boardTimeOf(timeline, 4_000)).toBe(4_000);
    expect(boardTimeOf(timeline, 6_000)).toBe(8_000);
    expect(boardTimeOf(timeline, 13_000)).toBe(16_000);
    expect(audioTimeOf(timeline, 4_000)).toBe(4_000);
    expect(audioTimeOf(timeline, 6_000)).toBe(5_000);
    expect(audioTimeOf(timeline, 8_000)).toBe(6_000);
    expect(audioTimeOf(timeline, 16_000)).toBe(13_000);
  });
});
