import {
  acceptSegment,
  contentHash,
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
  type LecturePageInput,
  type LecturePlan,
  type LectureTopicInput,
  type TaughtChapter,
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
  const full = { weight: 'full' as const, bridge: false };
  const light = { weight: 'light' as const, bridge: false };

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
    expect(styleProblems(words(500), { weight: 'full', bridge: true })).toEqual(
      [],
    );
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
