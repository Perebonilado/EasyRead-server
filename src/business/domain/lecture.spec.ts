import {
  acceptSegment,
  contentHash,
  LECTURE_STYLES,
  WORD_BUDGET,
  moveAt,
  moveOffsetsOf,
  offsetForMove,
  repeatedDevice,
  sectionProblems,
  sectionsToScript,
  joinOpening,
  listShape,
  openerProblems,
  outlineCorrection,
  styleProblems,
  taughtLines,
  unsupportedFigures,
  wordCount,
  MAX_HOOK_WORDS,
  HOOK_SHAPES,
  hookShapeFor,
  openingOf,
  openingsBefore,
  beatFor,
  cutPlanIntoJobs,
  isBridgePage,
  scriptForTts,
  tailOf,
  validateOutline,
  EXTRAS_BY_STYLE,
  EXTRA_BUDGET,
  KIND_RANK,
  extraSeeds,
  hasPause,
  isSegmentKind,
  playOrder,
  singleTurn,
  pageScripts,
  shouldSplit,
  splitSections,
  type LecturePageInput,
  type LecturePlan,
  type LectureTopicInput,
  type TaughtChapter,
  effectiveStatus,
  LECTURE_STALE_MS,
  hasBoardMarkers,
  markLabelProblems,
  pauseOffsets,
  plainWordsProblems,
  readsAsApplause,
  syllablesOf,
  withoutBoardMarkers,
} from './lecture';

const page = (
  pageNumber: number,
  text = 'x'.repeat(400),
  isEmpty = false,
): LecturePageInput => ({ pageNumber, text, isEmpty });

const topic = (
  id: string,
  startPage: number,
  endPage: number,
): LectureTopicInput => ({ id, title: id, startPage, endPage });

describe('cutPlanIntoJobs', () => {
  it('orders pages by topic and marks the ends of each topic', () => {
    const jobs = cutPlanIntoJobs(
      [topic('a', 1, 2), topic('b', 3, 4)],
      [page(1), page(2), page(3), page(4)],
    );

    expect(jobs.map((job) => [job.topicId, job.pageNumber, job.seq])).toEqual([
      ['a', 1, 0],
      ['a', 2, 1],
      ['b', 3, 2],
      ['b', 4, 3],
    ]);
    expect(
      jobs.filter((job) => job.isFirstOfTopic).map((j) => j.pageNumber),
    ).toEqual([1, 3]);
    expect(
      jobs.filter((job) => job.isLastOfTopic).map((j) => j.pageNumber),
    ).toEqual([2, 4]);
  });

  it('gives a one-page topic a segment that both opens and closes it', () => {
    const [job] = cutPlanIntoJobs([topic('a', 5, 5)], [page(5)]);
    expect(job.isFirstOfTopic).toBe(true);
    expect(job.isLastOfTopic).toBe(true);
  });

  it('attaches a page inside no topic to the topic before it', () => {
    // Page 3 falls in the gap between the two chapters.
    const jobs = cutPlanIntoJobs(
      [topic('a', 1, 2), topic('b', 4, 4)],
      [page(1), page(2), page(3), page(4)],
    );
    expect(jobs.find((job) => job.pageNumber === 3)?.topicId).toBe('a');
    // ...and it still counts as that topic's last page.
    expect(jobs.find((job) => job.pageNumber === 3)?.isLastOfTopic).toBe(true);
  });

  it('gives an overlapping page to the earliest topic, never to both', () => {
    const jobs = cutPlanIntoJobs(
      [topic('outer', 1, 4), topic('inner', 2, 3)],
      [page(1), page(2), page(3), page(4)],
    );
    expect(jobs).toHaveLength(4);
    expect(jobs.every((job) => job.topicId === 'outer')).toBe(true);
  });

  it('drops front matter that precedes every topic', () => {
    const jobs = cutPlanIntoJobs(
      [topic('a', 3, 4)],
      [page(1), page(2), page(3)],
    );
    expect(jobs.map((job) => job.pageNumber)).toEqual([3]);
  });

  it('flags empty and near-empty pages as bridges', () => {
    const jobs = cutPlanIntoJobs(
      [topic('a', 1, 3)],
      [page(1), page(2, 'Figure 3.1', false), page(3, '', true)],
    );
    expect(jobs.map((job) => job.bridge)).toEqual([false, true, true]);
  });

  it('returns nothing when the document has no topics', () => {
    expect(cutPlanIntoJobs([], [page(1)])).toEqual([]);
  });
});

describe('isBridgePage', () => {
  it('counts a page of whitespace as empty however long', () => {
    expect(isBridgePage(page(1, '   \n\n   \t  '))).toBe(true);
  });

  it('keeps a short but real paragraph as teachable', () => {
    expect(isBridgePage(page(1, 'a'.repeat(200)))).toBe(false);
  });
});

describe('validateOutline', () => {
  const plan = (beats: number[]): LecturePlan => ({
    hook: 'Why this matters',
    arc: 'From cause to consequence',
    beats: beats.map((pageNumber) => ({ pageNumber, goal: 'g' })),
  });

  it('passes a plan with exactly one beat per page', () => {
    expect(validateOutline(plan([1, 2, 3]), [1, 2, 3])).toEqual([]);
  });

  it('catches a beat for a page the topic does not own', () => {
    const problems = validateOutline(plan([1, 9]), [1]);
    expect(problems.map((p) => p.kind)).toContain('unknown_page');
  });

  it('catches a page with no beat', () => {
    const problems = validateOutline(plan([1]), [1, 2]);
    expect(problems.map((p) => p.kind)).toEqual(['missing_page']);
    expect(problems[0].detail).toContain('page 2');
  });

  it('catches two beats claiming one page', () => {
    const problems = validateOutline(plan([1, 1]), [1]);
    expect(problems.map((p) => p.kind)).toEqual(['duplicate_page']);
  });

  it('demands a hook and an arc', () => {
    const problems = validateOutline(
      { hook: '  ', arc: '', beats: [{ pageNumber: 1, goal: 'g' }] },
      [1],
    );
    expect(problems.map((p) => p.kind)).toEqual(['no_hook', 'no_arc']);
  });
});

describe('beatFor', () => {
  const plan: LecturePlan = {
    hook: 'h',
    arc: 'the arc',
    beats: [{ pageNumber: 2, goal: 'explain inflation' }],
  };

  it('finds the beat written for a page', () => {
    expect(beatFor(plan, 2).goal).toBe('explain inflation');
  });

  it('falls back to the arc rather than leaving a page unscripted', () => {
    expect(beatFor(plan, 7)).toEqual({
      pageNumber: 7,
      goal: 'the arc',
      callback: null,
      foreshadow: null,
    });
  });
});

describe('acceptSegment', () => {
  const ok = { grounded: true, problems: [] };
  const bad = { grounded: false, problems: ['Invented a date'] };

  it('accepts a grounded script', () => {
    expect(acceptSegment('Real script.', ok, 1)).toEqual({ action: 'accept' });
  });

  it('retries an ungrounded script once, carrying the reason', () => {
    expect(acceptSegment('Wrong.', bad, 1)).toEqual({
      action: 'retry',
      reason: 'Invented a date',
    });
  });

  it('allows a second rewrite, then keeps the page over the verifier alone', () => {
    expect(acceptSegment('Wrong.', bad, 2).action).toBe('retry');
    const kept = acceptSegment('Wrong.', bad, 3);
    expect(kept.action).toBe('accept');
    expect(kept.action === 'accept' ? kept.warning : '').toContain(
      'Invented a date',
    );
  });

  it('drops a page on the last attempt only for a figure the material lacks', () => {
    const figures = ['1913'];
    expect(acceptSegment('The tax of 1913.', ok, 1, [], figures)).toEqual({
      action: 'retry',
      reason: 'These figures are not in the material: 1913',
    });
    expect(acceptSegment('The tax of 1913.', ok, 3, [], figures).action).toBe(
      'fail',
    );
    expect(acceptSegment('The tax of 1913.', bad, 3, [], figures)).toEqual({
      action: 'fail',
      reason: 'These figures are not in the material: 1913; Invented a date',
    });
  });

  it('treats an empty script as ungrounded even when the check passed', () => {
    expect(acceptSegment('   ', ok, 1)).toEqual({
      action: 'retry',
      reason: 'The writer returned nothing',
    });
  });
});

describe('scriptForTts', () => {
  it('removes stage directions meant for the writer, not the ear', () => {
    expect(
      scriptForTts('[warmly] Money got scarce. (beat) Banks failed.'),
    ).toBe('Money got scarce. Banks failed.');
  });

  it('strips markdown emphasis that would be read aloud', () => {
    expect(scriptForTts('The **wage-price spiral** is _the_ loop.')).toBe(
      'The wage-price spiral is the loop.',
    );
  });

  it('collapses runaway blank lines but keeps paragraph breaks', () => {
    expect(scriptForTts('One.\n\n\n\nTwo.')).toBe('One.\n\nTwo.');
  });
});

describe('tailOf', () => {
  it('returns a short script whole', () => {
    expect(tailOf('Short tail.')).toBe('Short tail.');
  });

  it('keeps the END of a long script, which is what follows on', () => {
    const tail = tailOf(`${'a'.repeat(400)}THE END`, 20);
    expect(tail.endsWith('THE END')).toBe(true);
    expect(tail).toHaveLength(20);
  });
});

describe('hookShapeFor', () => {
  it('rotates through every shape by chapter order before repeating', () => {
    const names = HOOK_SHAPES.map((_, index) => hookShapeFor(index, true).name);
    expect(new Set(names).size).toBe(HOOK_SHAPES.length);
    expect(hookShapeFor(HOOK_SHAPES.length, true)).toEqual(
      hookShapeFor(0, true),
    );
  });

  it('never asks a first chapter to pick up a thread from earlier', () => {
    const thread = HOOK_SHAPES.findIndex(
      (shape) => shape.name === 'a thread from earlier',
    );
    expect(thread).toBeGreaterThan(-1);
    expect(hookShapeFor(thread, true).name).toBe('a thread from earlier');
    expect(hookShapeFor(thread, false).name).not.toBe('a thread from earlier');
  });

  it('survives a job with no usable order', () => {
    expect(hookShapeFor(Number.NaN, false)).toEqual(HOOK_SHAPES[0]);
    expect(hookShapeFor(-3, false)).toEqual(HOOK_SHAPES[0]);
  });
});

describe('openingOf', () => {
  it('keeps a short opening whole', () => {
    expect(openingOf('Why prices rise. Two reasons.')).toBe(
      'Why prices rise. Two reasons.',
    );
  });

  it('cuts a long opening at the end of a sentence', () => {
    const script = `First sentence here. ${'x'.repeat(300)}`;
    expect(openingOf(script)).toBe('First sentence here.');
  });

  it('strips stage directions and markdown before quoting', () => {
    expect(openingOf('[warmly] *Hello* there.')).toBe('Hello there.');
  });
});

describe('openingsBefore', () => {
  const rows = [
    { topicId: 'a', seq: 0, scriptText: null }, // a's opening page failed
    { topicId: 'a', seq: 1, scriptText: 'A carries on.' },
    { topicId: 'b', seq: 2, scriptText: 'B opens.' },
    { topicId: 'b', seq: 3, scriptText: 'B goes on.' },
    { topicId: 'c', seq: 4, scriptText: null },
    { topicId: 'd', seq: 5, scriptText: 'D opens.' },
  ];

  it('quotes the first spoken words of every earlier chapter, in play order', () => {
    expect(openingsBefore(rows, 5)).toEqual(['A carries on.', 'B opens.']);
  });

  it('leaves out the chapter itself and chapters with nothing written', () => {
    expect(openingsBefore(rows, 2)).toEqual(['A carries on.']);
    expect(openingsBefore(rows, 0)).toEqual([]);
  });

  it('ignores the order rows arrive in', () => {
    expect(openingsBefore([...rows].reverse(), 6)).toEqual([
      'A carries on.',
      'B opens.',
      'D opens.',
    ]);
  });
});

describe('openerProblems', () => {
  it.each([
    'Imagine a bank with no vault.',
    'Now imagine the same bank on a Friday.',
    'Picture this: a queue at dawn.',
    'Have you ever waited for a page to load?',
    "Let's dive in.",
    'Welcome to the chapter on caches.',
    'Today we look at rate limiting.',
    'In this chapter we cover three designs.',
    'Think about the last time a site went down.',
    'Ever wondered why IDs are so long?',
  ])('flags a hook that opens with "%s"', (hook) => {
    expect(openerProblems(hook, 'hook').map((p) => p.kind)).toEqual([
      'banned_opener',
    ]);
  });

  it('lets a real opening through', () => {
    expect(openerProblems('Why does a cache lie to you?', 'hook')).toEqual([]);
    expect(
      openerProblems('You would think more servers means more room.', 'hook'),
    ).toEqual([]);
  });

  it('does not mind the word mid-sentence', () => {
    expect(openerProblems('You can imagine how that ends.', 'script')).toEqual(
      [],
    );
  });

  it('catches a later sentence that starts with Imagine, in script scope only', () => {
    const script = 'Prices rise. Imagine the queue outside. Then they fall.';
    expect(openerProblems(script, 'script').map((p) => p.kind)).toEqual([
      'banned_opener',
    ]);
    expect(openerProblems(script, 'hook')).toEqual([]);
  });

  it('ignores a leading quote mark or dash', () => {
    expect(openerProblems('"Imagine a bank," he said.', 'hook')).toHaveLength(
      1,
    );
  });
});

describe('HOOK_SHAPES', () => {
  it('has ten shapes with the thread from earlier last', () => {
    expect(HOOK_SHAPES).toHaveLength(10);
    expect(HOOK_SHAPES[HOOK_SHAPES.length - 1].name).toBe(
      'a thread from earlier',
    );
  });

  it('gives every shape an example that passes its own rules', () => {
    for (const shape of HOOK_SHAPES) {
      expect(openerProblems(shape.example, 'hook')).toEqual([]);
      expect(wordCount(shape.example)).toBeLessThanOrEqual(MAX_HOOK_WORDS);
    }
  });

  it('starts every example with a different word, so none teaches a tic', () => {
    const firsts = HOOK_SHAPES.map((shape) => shape.example.split(' ')[0]);
    expect(new Set(firsts).size).toBe(HOOK_SHAPES.length);
  });
});

describe('styleProblems', () => {
  const words = (n: number) =>
    Array.from({ length: n }, () => 'word').join(' ');
  const full = {
    style: 'steady' as const,
    weight: 'full' as const,
    bridge: false,
  };
  const light = {
    style: 'steady' as const,
    weight: 'light' as const,
    bridge: false,
  };

  it('passes a clean full page', () => {
    expect(
      styleProblems(`Prices rise. ${words(200)}. They fall.`, full),
    ).toEqual([]);
  });

  it('sends back a full page over 260 words, and a light page over 130', () => {
    expect(styleProblems(words(261), full).map((p) => p.kind)).toEqual([
      'too_long',
    ]);
    expect(styleProblems(words(260), full)).toEqual([]);
    expect(styleProblems(words(131), light).map((p) => p.kind)).toEqual([
      'too_long',
    ]);
    expect(styleProblems(words(130), light)).toEqual([]);
  });

  it('says how long the page ran and what the budget was', () => {
    const [problem] = styleProblems(words(294), full);
    expect(problem.detail).toContain('294 words');
    expect(problem.detail).toContain('220');
  });

  it('never measures a bridge page', () => {
    expect(
      styleProblems(words(500), {
        style: 'steady',
        weight: 'full',
        bridge: true,
      }),
    ).toEqual([]);
  });

  it('catches a page that clears its throat before starting', () => {
    expect(
      styleProblems("Now, let's talk about caches. They lie.", full).map(
        (p) => p.kind,
      ),
    ).toEqual(['throat_clearing']);
    expect(
      styleProblems("Let's look at the timestamp. It is 41 bits.", full).map(
        (p) => p.kind,
      ),
    ).toEqual(['throat_clearing']);
    expect(styleProblems('Now the system has two choices.', full)).toEqual([]);
  });

  it('catches an ending that sums up instead of landing', () => {
    expect(
      styleProblems('Caches lie. In summary, they are bets.', full).map(
        (p) => p.kind,
      ),
    ).toEqual(['recap_ending']);
    expect(
      styleProblems(
        'Caches lie. Understanding how caches work is key to design.',
        full,
      ).map((p) => p.kind),
    ).toEqual(['recap_ending']);
  });

  it('reports every problem at once, so one rewrite can fix them all', () => {
    const kinds = styleProblems(
      `So, imagine a bank. ${words(300)}. To sum up, banks.`,
      full,
    ).map((p) => p.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['banned_opener', 'too_long', 'recap_ending']),
    );
  });
});

describe('validateOutline: the hook is spoken word for word', () => {
  const plan = (hook: string): LecturePlan => ({
    hook,
    arc: 'From cause to consequence',
    beats: [{ pageNumber: 1, goal: 'g' }],
  });

  it('rejects a hook that opens with a banned opener', () => {
    const problems = validateOutline(
      plan('Imagine a world without prices.'),
      [1],
    );
    expect(problems.map((p) => p.kind)).toEqual(['banned_opener']);
    expect(problems[0].detail).toContain('Imagine');
  });

  it('rejects a hook that runs past sixty words', () => {
    const long = Array.from({ length: 70 }, () => 'word').join(' ');
    expect(validateOutline(plan(long), [1]).map((p) => p.kind)).toEqual([
      'hook_too_long',
    ]);
  });

  it('turns the problems into one correction line for the planner', () => {
    const problems = validateOutline(plan('Imagine a bank.'), [1, 2]);
    expect(outlineCorrection(problems)).toMatch(
      /Imagine.*; No beat for page 2/,
    );
  });
});

describe('acceptSegment with style problems', () => {
  const ok = { grounded: true, problems: [] };
  const bad = { grounded: false, problems: ['Invented a date'] };
  const style = [
    { kind: 'banned_opener' as const, detail: 'Opens with "Imagine"' },
  ];

  it('sends a grounded but badly-read page back while attempts remain', () => {
    expect(acceptSegment('Imagine a bank.', ok, 1, style)).toEqual({
      action: 'retry',
      reason: 'Opens with "Imagine"',
    });
    expect(acceptSegment('Imagine a bank.', ok, 2, style).action).toBe('retry');
  });

  it('keeps the page on the last attempt rather than leaving a hole, with a warning', () => {
    expect(acceptSegment('Imagine a bank.', ok, 3, style)).toEqual({
      action: 'accept',
      warning: 'Opens with "Imagine"',
    });
  });

  it('keeps an objected-to page with every reason in the warning, unless a figure is missing', () => {
    expect(acceptSegment('Imagine a bank.', bad, 3, style)).toEqual({
      action: 'accept',
      warning:
        'Kept over the verifier\'s objection: Invented a date; Opens with "Imagine"',
    });
    expect(acceptSegment('Imagine 1913.', bad, 3, style, ['1913']).action).toBe(
      'fail',
    );
  });

  it('accepts a clean page without a warning key', () => {
    expect(acceptSegment('Real script.', ok, 3, [])).toEqual({
      action: 'accept',
    });
  });
});

describe('joinOpening', () => {
  it('speaks the hook first and the continuation after it', () => {
    expect(joinOpening('Why do caches lie?', 'Because they guess.')).toBe(
      'Why do caches lie? Because they guess.',
    );
  });

  it('ends the hook with a full stop when the planner forgot one', () => {
    expect(joinOpening('Caches are bets', 'About the future.')).toBe(
      'Caches are bets. About the future.',
    );
  });

  it('drops a continuation that repeats the opening it was told not to repeat', () => {
    expect(
      joinOpening(
        'Why do caches lie?',
        'Why do caches lie? Because they guess. And they are usually right.',
      ),
    ).toBe(
      'Why do caches lie? Because they guess. And they are usually right.',
    );
  });

  it('survives an empty continuation', () => {
    expect(joinOpening('Caches are bets.', '   ')).toBe('Caches are bets.');
  });
});

describe('taughtLines', () => {
  const planned = (
    title: string,
    payoff: string,
    goals: string[],
  ): TaughtChapter => ({
    title,
    shortDescription: null,
    plan: {
      hook: 'h',
      arc: 'a',
      payoff,
      beats: goals.map((goal, i) => ({ pageNumber: i + 1, goal })),
    },
  });

  it('lists the payoff then each page, chapter by chapter, in order', () => {
    expect(
      taughtLines([
        planned('One', 'You can size a cache.', ['Why caches', 'Eviction']),
        planned('Two', 'You can shard.', ['Keys']),
      ]),
    ).toEqual([
      'You can size a cache.',
      'Why caches',
      'Eviction',
      'You can shard.',
      'Keys',
    ]);
  });

  it('prefers what a beat says is new over its goal', () => {
    const chapter: TaughtChapter = {
      title: 'One',
      shortDescription: null,
      plan: {
        hook: 'h',
        arc: 'a',
        payoff: 'P',
        beats: [{ pageNumber: 1, goal: 'Goal', newHere: 'The new bit' }],
      },
    };
    expect(taughtLines([chapter])).toEqual(['P', 'The new bit']);
  });

  it('falls back to the description of a chapter not planned yet', () => {
    expect(
      taughtLines([
        {
          title: 'Caches',
          shortDescription: 'Why systems remember',
          plan: null,
        },
        { title: 'Shards', shortDescription: null, plan: null },
      ]),
    ).toEqual(['Caches: Why systems remember', 'Shards']);
  });

  it('keeps the nearest chapters when the budget runs out', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      planned(`C${i}`, `P${i}`, ['g1', 'g2', 'g3']),
    );
    const lines = taughtLines(many, 6);
    expect(lines).toHaveLength(6);
    expect(lines).toEqual(['P3', 'g1', 'P4', 'g1', 'g2', 'g3']);
  });
});

describe('listShape', () => {
  it('sees bullets, dashes, numbers and steps', () => {
    expect(listShape('Roles:\n• assess\n• stabilise\n• transport')).toEqual({
      items: 3,
    });
    expect(listShape('- one\n- two\n- three\n- four')).toEqual({ items: 4 });
    expect(listShape('1. plan\n2) build\n(3) ship')).toEqual({ items: 3 });
    expect(listShape('Step 1 gather\nStep 2 sort\nStep 3 act')).toEqual({
      items: 3,
    });
  });

  it('needs three marked lines to call it a list', () => {
    expect(listShape('- one\n- two\nand prose.')).toBeNull();
    expect(listShape('Just a paragraph about lists, with no list.')).toBeNull();
  });
});

describe('contentHash', () => {
  it('is stable, short and different for different words', () => {
    expect(contentHash('Caches lie.')).toBe(contentHash('Caches lie.'));
    expect(contentHash('Caches lie.')).toMatch(/^[0-9a-f]{10}$/);
    expect(contentHash('Caches lie.')).not.toBe(contentHash('Caches lie!'));
  });
});

describe('unsupportedFigures', () => {
  const page =
    'UUIDs are 128 bits long. Twitter chose Nov 04, 2010 as its epoch; 100,000 requests a day.';

  it('finds a number the material never mentions', () => {
    expect(
      unsupportedFigures('The tax was 4096 dollars in 1913.', [page]),
    ).toEqual(['4096', '1913']);
  });

  it('accepts numbers that are there, however the commas fall', () => {
    expect(
      unsupportedFigures('128 bits, 2010, and 100000 requests.', [page]),
    ).toEqual([]);
    expect(unsupportedFigures('about 100,000 requests', [page])).toEqual([]);
  });

  it('leaves short numbers alone: arithmetic and rounding are not invention', () => {
    expect(
      unsupportedFigures('2 tokens a second, 2.2 trillion, 69 years.', [page]),
    ).toEqual([]);
  });

  it('counts the plan and the neighbouring pages as sources', () => {
    expect(
      unsupportedFigures('Since 2010, 4096 IDs a millisecond.', [
        page,
        'a machine can support 4096 new IDs per millisecond',
      ]),
    ).toEqual([]);
  });

  it('names each missing figure once', () => {
    expect(unsupportedFigures('1913 came, and 1913 went.', [page])).toEqual([
      '1913',
    ]);
  });
});

describe('styles', () => {
  it('names three ways of teaching, steady being what the lecture was', () => {
    expect(Object.keys(LECTURE_STYLES)).toEqual(['gentle', 'steady', 'brisk']);
    expect(LECTURE_STYLES.gentle.name).toBe('I learn slowly');
    expect(LECTURE_STYLES.brisk.name).toBe("I'm a quick learner");
  });

  it('gives gentle more room and brisk less, light pages included', () => {
    expect(WORD_BUDGET.gentle.full.max).toBeGreaterThan(
      WORD_BUDGET.steady.full.max,
    );
    expect(WORD_BUDGET.brisk.full.max).toBeLessThan(
      WORD_BUDGET.steady.full.max,
    );
    expect(WORD_BUDGET.gentle.light.hard).toBeGreaterThan(
      WORD_BUDGET.brisk.light.hard,
    );
    expect(WORD_BUDGET.steady).toEqual({
      full: { min: 120, max: 220, hard: 260 },
      light: { min: 60, max: 110, hard: 130 },
    });
  });

  it('measures each style against its own budget', () => {
    // Short plain sentences, so only the budget is measured.
    const words = (n: number) =>
      Array.from(
        { length: Math.ceil(n / 5) },
        () => 'The word is a word.',
      ).join(' ');
    const at = (style: 'gentle' | 'steady' | 'brisk', n: number) =>
      styleProblems(words(n), { style, weight: 'full', bridge: false }).map(
        (p) => p.kind,
      );
    expect(at('brisk', 180)).toEqual(['too_long']);
    expect(at('steady', 180)).toEqual([]);
    expect(at('gentle', 300)).toEqual([]);
    expect(at('gentle', 305)).toEqual(['too_long']);
  });

  it('lets gentle say the idea a second way; the others must land', () => {
    const recap = 'Prices rise. In summary, easy money lifts prices.';
    const kinds = (style: 'gentle' | 'steady' | 'brisk') =>
      styleProblems(recap, { style, weight: 'full', bridge: false }).map(
        (p) => p.kind,
      );
    expect(kinds('gentle')).toEqual([]);
    expect(kinds('steady')).toEqual(['recap_ending']);
    expect(kinds('brisk')).toEqual(['recap_ending']);
  });

  it('keeps every style direction free of the writer tics it forbids', () => {
    for (const spec of Object.values(LECTURE_STYLES)) {
      expect(spec.direction).not.toMatch(/\bimagine\b/i);
      expect(spec.direction.length).toBeGreaterThan(100);
    }
  });
});

describe('sections and moves', () => {
  const sections = [
    { move: 0, text: 'The problem: prices rise.' },
    { move: 1, text: 'The mechanism: more money chases the same goods.' },
    { move: 2, text: 'So the bank tightens.' },
  ];

  it('joins the sections into one script with paragraph breaks', () => {
    expect(sectionsToScript(sections)).toBe(
      'The problem: prices rise.\n\nThe mechanism: more money chases the same goods.\n\nSo the bank tightens.',
    );
  });

  it('finds where each move begins, the first always at the start', () => {
    const script = `Why prices rise. ${sectionsToScript(sections)}`;
    const offsets = moveOffsetsOf(script, sections);
    expect(offsets[0]).toBe(0);
    expect(script.slice(offsets[1])).toMatch(/^The mechanism/);
    expect(script.slice(offsets[2])).toMatch(/^So the bank/);
  });

  it('falls back to the previous end when a section was altered by the joiner', () => {
    const script =
      'Only the first two survive.\n\nThe mechanism: more money chases the same goods.';
    const offsets = moveOffsetsOf(script, sections);
    expect(offsets).toHaveLength(3);
    expect(offsets[2]).toBe(script.length);
  });

  it('maps a position to its move and back by proportion', () => {
    const scriptLength = 1000;
    const durationMs = 60_000;
    const offsets = [0, 400, 700];
    expect(moveAt(0, durationMs, offsets, scriptLength)).toBe(0);
    expect(moveAt(23_999, durationMs, offsets, scriptLength)).toBe(0);
    expect(moveAt(24_000, durationMs, offsets, scriptLength)).toBe(1);
    expect(moveAt(59_000, durationMs, offsets, scriptLength)).toBe(2);
    expect(offsetForMove(1, durationMs, offsets, scriptLength)).toBe(24_000);
    expect(offsetForMove(2, durationMs, offsets, scriptLength)).toBe(42_000);
    // A shorter version of the same page lands on the same idea.
    expect(offsetForMove(1, 30_000, [0, 150, 320], 500)).toBe(9_000);
  });

  it('is safe on a page with no moves or no duration yet', () => {
    expect(moveAt(5_000, 0, [0, 10], 20)).toBe(0);
    expect(moveAt(5_000, 10_000, [], 20)).toBe(0);
    expect(offsetForMove(3, 10_000, [0, 10], 20)).toBe(5_000);
    expect(offsetForMove(1, 10_000, [], 20)).toBe(0);
  });

  it('demands one section per move, in order', () => {
    const moves = ['the problem', 'the mechanism'];
    expect(sectionProblems(sections.slice(0, 2), moves)).toEqual([]);
    expect(sectionProblems([sections[0]], moves)[0].detail).toMatch(
      /one section per move/,
    );
    expect(sectionProblems([sections[1], sections[0]], moves)[0].kind).toBe(
      'moves',
    );
    expect(sectionProblems([], moves)[0].detail).toMatch(/no sections/);
  });

  it('accepts whatever comes back for a page with one move, as older plans have', () => {
    expect(sectionProblems(sections, ['the page'])).toEqual([]);
    expect(sectionProblems(sections, [])).toEqual([]);
  });
});

describe('repeatedDevice', () => {
  it('sends back two ideas in a row that both open on an example', () => {
    const problems = repeatedDevice([
      { move: 0, text: 'For example, a bakery raises prices.' },
      { move: 1, text: 'Think of a bank printing notes.' },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(['repetition']);
    expect(problems[0].detail).toContain('"for example", then "think of"');
  });

  it('allows an example when the next idea is broken down instead', () => {
    expect(
      repeatedDevice([
        { move: 0, text: 'For example, a bakery raises prices.' },
        { move: 1, text: 'The bank has two levers. The first is the rate.' },
        { move: 2, text: "It's like a tap on a pipe." },
      ]),
    ).toEqual([]);
  });

  it('only counts an example that opens a section', () => {
    expect(
      repeatedDevice([
        { move: 0, text: 'Prices rise. For example, bread costs more.' },
        { move: 1, text: 'Wages lag. Think of the last raise you had.' },
      ]),
    ).toEqual([]);
  });
});

describe('the turn and its pause', () => {
  it('keeps at most one turn per chapter, the first the planner marked', () => {
    const beats = singleTurn([{ turn: false }, { turn: true }, { turn: true }]);
    expect(beats.map((beat) => beat.turn)).toEqual([false, true, false]);
    expect(singleTurn([{ turn: false }]).map((beat) => beat.turn)).toEqual([
      false,
    ]);
  });

  it('turns [pause] into a silence for the voice and nothing for the ear', () => {
    const script = 'What happens next? [pause] The bucket empties.';
    expect(hasPause(script)).toBe(true);
    expect(scriptForTts(script)).toBe(
      'What happens next?\n\nThe bucket empties.',
    );
    expect(hasPause(scriptForTts(script))).toBe(false);
    // The pause is not a word, and the count is the spoken words.
    expect(wordCount(script)).toBe(6);
  });
});

describe('the segments around a chapter', () => {
  const cut = [
    { topicId: 't1', pageNumber: 1, seq: 0, bridge: false },
    { topicId: 't1', pageNumber: 2, seq: 1, bridge: true },
    { topicId: 't2', pageNumber: 3, seq: 2, bridge: true },
  ];

  it('gives a slow learner the words before a chapter and the check after it', () => {
    expect(
      extraSeeds(cut, 'gentle').map((seed) => [
        seed.kind,
        seed.pageNumber,
        seed.seq,
        seed.bridge,
      ]),
    ).toEqual([
      ['terms', 1, 0, false],
      ['check', 2, 1, false],
    ]);
  });

  it('gives a normal pace and a quick learner the check only', () => {
    expect(extraSeeds(cut, 'steady').map((seed) => seed.kind)).toEqual([
      'check',
    ]);
    expect(extraSeeds(cut, 'brisk').map((seed) => seed.kind)).toEqual([
      'check',
    ]);
    expect(EXTRAS_BY_STYLE.brisk).not.toContain('review');
    expect(EXTRAS_BY_STYLE.gentle).toContain('review');
  });

  it('gives a chapter with nothing to teach no extras at all', () => {
    expect(
      extraSeeds(cut, 'gentle').some((seed) => seed.topicId === 't2'),
    ).toBe(false);
  });

  it('plays the extras around their page: review, words, page, check', () => {
    const rows = [
      { seq: 1, kind: 'check' as const },
      { seq: 0, kind: 'page' as const },
      { seq: 0, kind: 'terms' as const },
      { seq: 0, kind: 'review' as const },
      { seq: 1, kind: 'page' as const },
    ];
    expect(playOrder(rows).map((row) => `${row.seq}:${row.kind}`)).toEqual([
      '0:review',
      '0:terms',
      '0:page',
      '1:page',
      '1:check',
    ]);
    expect(KIND_RANK.review).toBeLessThan(KIND_RANK.page);
  });

  it('keeps the extras short', () => {
    for (const budget of Object.values(EXTRA_BUDGET)) {
      expect(budget.max).toBeLessThanOrEqual(170);
      expect(budget.hard).toBeGreaterThan(budget.max);
    }
  });

  it('knows a kind from a stray query string', () => {
    expect(isSegmentKind('check')).toBe(true);
    expect(isSegmentKind('pages')).toBe(false);
    expect(isSegmentKind(undefined)).toBe(false);
  });
});

describe('a long gentle page voiced as two pieces', () => {
  const section = (move: number, words: number, word = 'idea') => ({
    move,
    text: Array.from({ length: words }, () => `${word}${move}`).join(' ') + '.',
  });

  it("splits only a slow learner's page, only past its budget, only with a boundary to cut at", () => {
    const long = [section(0, 110), section(1, 110), section(2, 110)];
    expect(shouldSplit('gentle', 'full', long)).toBe(true);
    expect(shouldSplit('steady', 'full', long)).toBe(false);
    expect(shouldSplit('brisk', 'full', long)).toBe(false);
    expect(
      shouldSplit('gentle', 'full', [section(0, 200), section(1, 200)]),
    ).toBe(false);
    expect(
      shouldSplit('gentle', 'full', [
        section(0, 80),
        section(1, 80),
        section(2, 80),
      ]),
    ).toBe(false);
    // A light page has the smaller budget.
    expect(
      shouldSplit('gentle', 'light', [
        section(0, 60),
        section(1, 60),
        section(2, 60),
      ]),
    ).toBe(true);
  });

  it('cuts at the move boundary nearest the middle by words', () => {
    const [head, tail] = splitSections([
      section(0, 40),
      section(1, 40),
      section(2, 40),
      section(3, 200),
    ]);
    expect(head.map((s) => s.move)).toEqual([0, 1, 2]);
    expect(tail.map((s) => s.move)).toEqual([3]);
    const [first, rest] = splitSections([
      section(0, 200),
      section(1, 40),
      section(2, 40),
    ]);
    expect(first.map((s) => s.move)).toEqual([0]);
    expect(rest.map((s) => s.move)).toEqual([1, 2]);
  });

  it('never leaves a piece empty', () => {
    const [head, tail] = splitSections([
      section(0, 1),
      section(1, 1),
      section(2, 500),
    ]);
    expect(head.length).toBeGreaterThan(0);
    expect(tail.length).toBeGreaterThan(0);
  });

  it('joins the opening to the first piece and keeps offsets relative to each piece', () => {
    const sections = [
      section(0, 5, 'a'),
      section(1, 5, 'b'),
      section(2, 5, 'c'),
    ];
    const whole = pageScripts('Why it matters', sections, false);
    expect(whole.part).toBeNull();
    expect(whole.script.startsWith('Why it matters.')).toBe(true);
    expect(whole.moveOffsets).toHaveLength(3);

    const split = pageScripts('Why it matters', sections, true);
    expect(split.script.startsWith('Why it matters.')).toBe(true);
    expect(split.part).not.toBeNull();
    expect(split.moveOffsets[0]).toBe(0);
    expect(split.part!.moveOffsets[0]).toBe(0);
    expect(split.moveOffsets.length + split.part!.moveOffsets.length).toBe(3);
    expect(split.part!.script).not.toContain('Why it matters');
    expect(`${split.script}\n\n${split.part!.script}`).toContain(
      sections[2].text,
    );
  });
});

describe('how each style is delivered by the voice', () => {
  it('slows down for a slow learner and quickens for a quick one', () => {
    expect(LECTURE_STYLES.gentle.delivery).toMatch(/slowly/i);
    expect(LECTURE_STYLES.gentle.delivery).toMatch(/pause/i);
    expect(LECTURE_STYLES.brisk.delivery).toMatch(/brisk/i);
    expect(LECTURE_STYLES.gentle.speed).toBeLessThan(
      LECTURE_STYLES.steady.speed,
    );
    expect(LECTURE_STYLES.steady.speed).toBeLessThan(
      LECTURE_STYLES.brisk.speed,
    );
    expect(LECTURE_STYLES.steady.speed).toBe(1);
  });
});

describe('effectiveStatus', () => {
  const now = Date.parse('2026-09-03T12:00:00Z');
  const at = (msAgo: number) => new Date(now - msAgo);

  it('reads a row still moving as what it says', () => {
    expect(
      effectiveStatus({ status: 'voicing', updatedAt: at(60_000) }, now),
    ).toBe('voicing');
    expect(effectiveStatus({ status: 'pending', updatedAt: at(0) }, now)).toBe(
      'pending',
    );
  });

  it('reads a row lost in flight as failed', () => {
    expect(
      effectiveStatus(
        { status: 'voicing', updatedAt: at(LECTURE_STALE_MS + 1) },
        now,
      ),
    ).toBe('failed');
    expect(
      effectiveStatus(
        { status: 'writing', updatedAt: at(LECTURE_STALE_MS * 5) },
        now,
      ),
    ).toBe('failed');
  });

  it('never touches a finished or failed row, and trusts a row with no time', () => {
    expect(
      effectiveStatus(
        { status: 'done', updatedAt: at(LECTURE_STALE_MS * 5) },
        now,
      ),
    ).toBe('done');
    expect(effectiveStatus({ status: 'failed', updatedAt: null }, now)).toBe(
      'failed',
    );
    expect(effectiveStatus({ status: 'voicing' }, now)).toBe('voicing');
  });
});

describe('the gentle style, measured', () => {
  const PAGE =
    'Consistent hashing distributes keys across servers so that few keys move when a server is added or removed. A hash function turns a key into a number.';
  const options = {
    pageText: PAGE,
    terms: ['consistent hashing', 'hash function'],
    taughtSoFar: [],
  };

  it('passes plain speech that explains each term in the same breath', () => {
    const plain =
      'Picture a few computers holding your files. One computer that answers requests is a server. ' +
      'A hash function is just a rule that turns any name into a number. ' +
      'That number says which computer holds the file. ' +
      'Consistent hashing, which just means arranging those numbers on a circle, moves few files when a computer is added.';
    expect(plainWordsProblems(plain, options)).toEqual([]);
  });

  it("sends back textbook register: long sentences, the lecturer's own long words, terms left unexplained", () => {
    const textbook =
      'To achieve horizontal scaling, it is important to distribute requests and data efficiently and evenly across servers, ensuring that all servers work together optimally and that the whole system remains robust as demand grows significantly over time. ' +
      'Consistent hashing addresses the flaws of traditional methods. ' +
      'The hash function determines placement.';
    const kinds = plainWordsProblems(textbook, options).map(
      (problem) => problem.kind,
    );
    expect(kinds).toContain('long_sentences');
    expect(kinds).toContain('hard_words');
    expect(kinds).toContain('term_unexplained');
    const detail = plainWordsProblems(textbook, options).find(
      (problem) => problem.kind === 'hard_words',
    )?.detail;
    expect(detail).toContain('"efficiently"');
    expect(detail).toContain('"optimally"');
  });

  it('lets a term taught on an earlier page pass unexplained, and refuses two new terms in one sentence', () => {
    const later =
      'Consistent hashing helps here. The hash function is a rule that turns a name into a number.';
    expect(
      plainWordsProblems(later, {
        ...options,
        taughtSoFar: ['Teach what consistent hashing is'],
      }),
    ).toEqual([]);
    const crowded =
      'Consistent hashing uses a hash function, which is a rule that turns a name into a number. It moves few keys.';
    const kinds = plainWordsProblems(crowded, options).map(
      (problem) => problem.kind,
    );
    expect(kinds).toContain('two_terms');
  });

  it('counts syllables roughly and only for words the page does not use', () => {
    expect(syllablesOf('efficiently')).toBe(4);
    expect(syllablesOf('server')).toBe(2);
    expect(syllablesOf('move')).toBe(1);
    // "redistribution" is long, but the page says it: not the lecturer's word.
    const said =
      "Keys move. A server is one computer. Redistribution is the page's own word here.";
    expect(
      plainWordsProblems(said, {
        ...options,
        pageText: `${PAGE} redistribution`,
      }).map((problem) => problem.kind),
    ).not.toContain('hard_words');
  });

  it('runs only for the gentle style, and not on a bridge', () => {
    const textbook =
      'To achieve horizontal scaling, it is important to distribute requests and data efficiently and evenly across servers, ensuring that all servers work together optimally and that the whole system remains robust as demand grows significantly over time.';
    const gentle = styleProblems(textbook, {
      style: 'gentle',
      weight: 'full',
      bridge: false,
      pageText: PAGE,
      terms: options.terms,
      taughtSoFar: [],
    }).map((problem) => problem.kind);
    expect(gentle).toContain('long_sentences');
    const steady = styleProblems(textbook, {
      style: 'steady',
      weight: 'full',
      bridge: false,
      pageText: PAGE,
      terms: options.terms,
      taughtSoFar: [],
    }).map((problem) => problem.kind);
    expect(steady).not.toContain('long_sentences');
    expect(steady).not.toContain('hard_words');
  });
});

describe('a page never ends on applause', () => {
  it('knows a move that is applause rather than teaching', () => {
    expect(readsAsApplause('encouragement to continue learning')).toBe(true);
    expect(readsAsApplause('wrapping up the chapter')).toBe(true);
    expect(readsAsApplause('the refill rate')).toBe(false);
    expect(readsAsApplause('why one server cannot hand out IDs')).toBe(false);
    // Teaching moves that merely contain the stems are teaching.
    expect(readsAsApplause('the motivation for consistent hashing')).toBe(
      false,
    );
    expect(readsAsApplause('motivating the need for a load balancer')).toBe(
      false,
    );
    expect(readsAsApplause('what inspired the token bucket design')).toBe(
      false,
    );
    expect(readsAsApplause('encouragement to keep going')).toBe(true);
  });

  it('hears applause in its common forms and not in a claim that shares a word', () => {
    for (const ending of [
      'Good job.',
      'Great work today.',
      'You have learned a lot today.',
      'Keep practicing these steps.',
      'You’ve made real progress.',
    ]) {
      expect(
        styleProblems(`Keys move to the next server. ${ending}`, {
          style: 'steady',
          weight: 'full',
          bridge: false,
        }).map((problem) => problem.kind),
      ).toContain('recap_ending');
    }
    for (const ending of [
      'The pendulum will keep going until friction stops it.',
      'The fascinating part is that the ring never changes.',
    ]) {
      expect(
        styleProblems(`Keys move to the next server. ${ending}`, {
          style: 'steady',
          weight: 'full',
          bridge: false,
        }).map((problem) => problem.kind),
      ).not.toContain('recap_ending');
    }
  });

  it('sends back a closing that cheers, in every style', () => {
    const cheer =
      'Consistent hashing keeps most keys in place. Great job following along! Keep diving deeper into this topic.';
    for (const style of ['gentle', 'steady', 'brisk'] as const) {
      const kinds = styleProblems(cheer, {
        style,
        weight: 'full',
        bridge: false,
      }).map((problem) => problem.kind);
      expect(kinds).toContain('recap_ending');
    }
    const lands =
      'Consistent hashing keeps most keys in place. That is why a server can join without the whole map changing.';
    expect(
      styleProblems(lands, {
        style: 'steady',
        weight: 'full',
        bridge: false,
      }).map((problem) => problem.kind),
    ).not.toContain('recap_ending');
  });
});

describe('pauses and labels in a board-aware script', () => {
  it('finds where the script pauses, as offsets into the spoken words', () => {
    const script =
      'Three uses. [write 1] Dynamo. [write 2] Cassandra.\n[pause]\nNow, why these two? What happens next?\n[pause]\nThe page tells you.';
    const spoken = scriptForTts(script);
    const offsets = pauseOffsets(script);
    expect(offsets).toHaveLength(2);
    expect(spoken.slice(0, offsets[0])).toMatch(/Cassandra\.$/);
    expect(spoken.slice(0, offsets[1])).toMatch(/next\?$/);
    expect(pauseOffsets('No pause here.')).toEqual([]);
  });

  it('sends back a section that reads the kind label aloud', () => {
    expect(
      markLabelProblems([
        { move: 0, text: '[write 2] point prevention is key. It matters.' },
      ]),
    ).toHaveLength(1);
    expect(
      markLabelProblems([
        { move: 0, text: '[write 2] Term: consistent hashing.' },
      ])[0]?.kind,
    ).toBe('label');
    expect(
      markLabelProblems([
        {
          move: 0,
          text: '[write 2] Prevention is key. The point is, it matters.',
        },
      ]),
    ).toEqual([]);
    // A line that happens to begin with the word is the line, not a label.
    expect(
      markLabelProblems(
        [
          {
            move: 0,
            text: '[write 1] Term frequency: how often a word appears.',
          },
        ],
        { lines: [{ number: 1, text: 'term frequency' }] },
      ),
    ).toEqual([]);
    expect(
      markLabelProblems(
        [{ move: 0, text: '[write 1] point prevention is key.' }],
        { lines: [{ number: 1, text: 'prevention is key' }] },
      ),
    ).toHaveLength(1);
  });
});

describe('board marks in a script', () => {
  const line = (number: number, move: number, text: string) => ({
    number,
    move,
    kind: 'term' as const,
    text,
    meaning: null,
    level: null,
    important: null,
  });

  it('are seen, stripped for readers and the voice, and carried with the pieces', () => {
    const script =
      'So, [write 1] the refill rate: ten a second. [point 1] That rate again.';
    expect(hasBoardMarkers(script)).toBe(true);
    expect(hasBoardMarkers('No marks here.')).toBe(false);
    expect(withoutBoardMarkers(script)).toBe(
      'So, the refill rate: ten a second. That rate again.',
    );
    expect(scriptForTts(script)).toBe(
      'So, the refill rate: ten a second. That rate again.',
    );
    // An underscore in a name is a space for the voice, never deleted.
    expect(scriptForTts('k0 maps to node s1_1 in auto_increment mode')).toBe(
      'k0 maps to node s1 1 in auto increment mode',
    );
    const pieces = pageScripts(null, [{ move: 0, text: script }], false, {
      heading: 'Token bucket',
      lines: [line(1, 0, 'refill rate')],
    });
    expect(pieces.board?.heading).toBe('Token bucket');
    expect(pieces.board?.lines).toHaveLength(1);
    expect(pieces.script).toContain('[write 1]');
    expect(
      pageScripts(null, [{ move: 0, text: script }], false).board,
    ).toBeNull();
  });

  it('gives each piece of a split page the lines of its own moves, the heading with the first', () => {
    const piece = (move: number, word: string) => ({
      move,
      text: `${`${word} `.repeat(30).trim()}.`,
    });
    const sections = [piece(0, 'a'), piece(1, 'b'), piece(2, 'c')];
    const board = {
      heading: 'Three moves',
      lines: [line(1, 0, 'first'), line(2, 1, 'second'), line(3, 2, 'third')],
    };
    const split = pageScripts(null, sections, true, board);
    expect(split.board?.heading).toBe('Three moves');
    // The part keeps the page's heading for a board that overflows.
    expect(split.part?.board?.heading).toBe('Three moves');
    const headNumbers = split.board!.lines.map((entry) => entry.number);
    const tailNumbers = split.part!.board!.lines.map((entry) => entry.number);
    expect([...headNumbers, ...tailNumbers]).toEqual([1, 2, 3]);
    expect(tailNumbers.length).toBeGreaterThan(0);
    // A line whose move no section carries still goes with the first piece.
    const stray = pageScripts(null, sections, true, {
      heading: 'x',
      lines: [line(1, 7, 'lost')],
    });
    expect(stray.board?.lines.map((entry) => entry.number)).toEqual([1]);
  });
});
