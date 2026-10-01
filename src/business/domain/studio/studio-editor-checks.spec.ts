import { anglesOf, planOf, researchOf, type EditorPlan } from './studio-editor';
import { beatsOf, rowsOf, type EditorialRow } from './studio-editorial';
import {
  applyFacts,
  attributed,
  beatProblems,
  budgetBeats,
  episodeSeconds,
  episodeTarget,
  fitBeats,
  hookPictureProblem,
  hookProblems,
  isFactual,
  mendHook,
  mendRows,
  pickedAngle,
  planLengthProblems,
  planProblems,
  promiseReturns,
  scriptProblems,
  softened,
  soundPackage,
  soundPlan,
  soundScenes,
  splitLongActs,
  splitSentence,
  withoutScreenTalk,
  spokenWords,
  unusedClaims,
} from './studio-editor-checks';

const research = researchOf({
  claims: [
    {
      id: 'c1',
      text: 'The Gregorian calendar began in 1582.',
      kind: 'date',
      confidence: 'high',
      sources: ['https://a.example.com/1', 'https://b.example.com/1'],
    },
    {
      id: 'c2',
      text: 'About 5 million people are leaplings.',
      kind: 'number',
      confidence: 'medium',
      sources: ['https://a.example.com/2'],
    },
    {
      id: 'c3',
      text: 'Some historians say the reform was rushed.',
      kind: 'claim',
      confidence: 'medium',
      contested: true,
      who: 'some historians',
      sources: ['https://a.example.com/3'],
    },
    {
      id: 'c4',
      text: 'The pope said the calendar must follow the sun.',
      kind: 'quote',
      confidence: 'low',
    },
  ],
});
const known = new Set(research.claims.map((c) => c.id));
const pace = { wpm: 150, sentence: [8, 18] as [number, number] };
const row = (patch: Partial<EditorialRow>): EditorialRow => ({
  say: 'A plain sentence about the calendar.',
  visual: 'why',
  show: 'A calendar on a wall',
  claims: [],
  act: 1,
  plant: null,
  payoff: null,
  delivery: 'explain',
  music: null,
  hold: false,
  ...patch,
});

describe('the angle the maker picks', () => {
  const angles = anglesOf([
    { question: 'A?', scores: { gap: 5, tension: 5, visual: 5, payoff: 5 } },
    { question: 'B?', scores: { gap: 4, tension: 4, visual: 4, payoff: 4 } },
    { question: 'C?', scores: { gap: 3, tension: 3, visual: 3, payoff: 3 } },
    { question: 'D?', scores: { gap: 2, tension: 2, visual: 2, payoff: 2 } },
  ]);

  it('is one of the three offered, or the best when left to the Studio', () => {
    expect(pickedAngle(angles, 1)?.angle.question).toBe('B?');
    expect(pickedAngle(angles, null)?.angle.question).toBe('A?');
    // The fourth was never offered.
    expect(pickedAngle(angles, 3)?.angle.question).toBe('A?');
    expect(pickedAngle(angles, 1)?.subThemes).toEqual(['A?', 'C?', 'D?']);
    expect(pickedAngle([], 0)).toBeNull();
  });
});

describe('the plan, checked and put right by code', () => {
  const base = (patch: Record<string, unknown> = {}): EditorPlan =>
    planOf(
      {
        spine: ['1', '2', '3', '4', '5', '6'],
        chain: [
          { beat: 'Rome counts by the moon' },
          { beat: 'The seasons drift', link: 'but' },
          { beat: 'Caesar adds a day', link: 'therefore' },
        ],
        items: [],
        episodes: [{ title: 'One', question: 'Why?' }],
        ...patch,
      },
      research,
    );

  it('sends back "and then", a long cast, and items kept on fewer than two yeses', () => {
    const plan = base({
      spine: ['1', '2'],
      chain: [{ beat: 'One' }, { beat: 'Two', link: 'and then' }],
      cast: ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({
        name,
        force: 'x',
      })),
      items: [{ item: 'Weak', moves: true, decision: 'keep', episode: 1 }],
    });
    const problems = planProblems(plan);
    expect(problems.join('\n')).toMatch(/six sentences/);
    expect(problems.join('\n')).toMatch(/"and then"/);
    expect(problems.join('\n')).toMatch(/6 recurring people/);
    expect(problems.join('\n')).toMatch(/fewer than two yeses/);
  });

  it('cuts what has fewer than two yeses, and gives a kept item an episode', () => {
    const { plan, fixed } = soundPlan(
      base({
        items: [
          {
            item: 'Strong',
            moves: true,
            visual: true,
            decision: 'keep',
            episode: 1,
            seconds: 60,
          },
          {
            item: 'Weak',
            moves: true,
            decision: 'keep',
            episode: 1,
            seconds: 30,
          },
          {
            item: 'Lost',
            moves: true,
            surprise: true,
            decision: 'keep',
            seconds: 60,
          },
        ],
      }),
    );
    expect(plan.items.map((i) => [i.decision, i.episode])).toEqual([
      ['keep', 1],
      ['cut', null],
      ['keep', 1],
    ]);
    expect(plan.leftOut).toContain('Weak');
    expect(fixed.join(';')).toMatch(/Weak" cut/);
  });

  it('keeps five recurring people, the rest on screen once', () => {
    const { plan } = soundPlan(
      base({
        cast: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name) => ({ name })),
      }),
    );
    expect(plan.cast.filter((c) => c.recurring)).toHaveLength(5);
  });

  const strong = (item: string, episode: number, seconds: number) => ({
    item,
    moves: true,
    visual: true,
    decision: 'keep',
    episode,
    seconds,
  });

  it('works out minutes from the items, and never pads a small topic', () => {
    const { plan } = soundPlan(
      base({ items: [strong('a', 1, 60), strong('b', 1, 40)] }),
    );
    expect(plan.episodes).toHaveLength(1);
    // 15 s hook + 12 s close + 100 s of items: about two minutes, not
    // stretched, and said to be short: nothing more to fill it with.
    expect(plan.episodes[0].minutes).toBe(2);
    expect(plan.episodes[0].short).toBe(true);
    expect(plan.notes).toEqual([
      '"One" runs about 2 minutes: the research holds no more for it.',
    ]);
  });

  /** A research of many sure claims of about fifteen words: eight seconds each as a line or two. */
  const deep = researchOf({
    claims: Array.from({ length: 14 }, (_, k) => ({
      id: `d${k + 1}`,
      text: `Fact ${k + 1} of the calendar story is a sentence of about fifteen words in all, sourced.`,
      kind: 'claim',
      confidence: k % 2 ? 'medium' : 'high',
      sources: [`https://a.example.com/d${k + 1}`],
    })),
  });

  /** A plan whose items rest on the deep research's claims. */
  const onDeep = (patch: Record<string, unknown>): EditorPlan =>
    planOf(
      {
        spine: ['1', '2', '3', '4', '5', '6'],
        episodes: [{ title: 'One', question: 'Why?' }],
        ...patch,
      },
      deep,
    );

  it('fills a short episode from its own cut items with two yeses, then the research, never past five minutes', () => {
    const { plan, fixed } = soundPlan(
      onDeep({
        items: [
          { ...strong('a', 1, 60), claims: ['d1'] },
          { ...strong('b', 1, 40), claims: ['d2'] },
          {
            item: 'Worth bringing back',
            moves: true,
            surprise: true,
            decision: 'cut',
            seconds: 30,
          },
          { item: 'Weak', moves: true, decision: 'cut', seconds: 30 },
        ],
        leftOut: ['Worth bringing back'],
      }),
      { wpm: 150 },
      deep,
    );
    const [episode] = plan.episodes;
    expect(episode.minutes).toBeGreaterThanOrEqual(3);
    expect(episode.minutes).toBeLessThanOrEqual(5);
    expect(episode.short).toBeUndefined();
    expect(plan.notes).toBeUndefined();
    // Its own cut item with two yeses first, as a line or two; the weak one stays out.
    expect(plan.items[2]).toMatchObject({ decision: 'compress', episode: 1 });
    expect(plan.items[3]).toMatchObject({ decision: 'cut', episode: null });
    expect(plan.leftOut).toEqual(['Weak']);
    // Then the research's claims no item uses, the surest first, in story order after.
    const added = plan.items.slice(4);
    expect(added.length).toBeGreaterThan(0);
    expect(added[0]).toMatchObject({
      claims: ['d3'],
      decision: 'compress',
      episode: 1,
      moves: true,
      visual: true,
    });
    expect(added.every((i) => !['d1', 'd2'].includes(i.claims[0]))).toBe(true);
    expect(episode.covers).toEqual([...episode.covers].sort((a, b) => a - b));
    expect(fixed.join('; ')).toMatch(
      /"Worth bringing back" brought back for episode 1; \d+ of the research's claims added to episode 1/,
    );
  });

  it("pulls the next episode's first items into a short one, in story order", () => {
    const { plan } = soundPlan(
      base({
        items: [
          strong('a', 1, 60),
          strong('b', 1, 40),
          strong('c', 2, 90),
          strong('d', 2, 90),
          strong('e', 2, 90),
        ],
        episodes: [
          { title: 'One', question: 'Why?' },
          { title: 'Two', question: 'How?' },
        ],
      }),
    );
    expect(plan.episodes.map((e) => e.covers)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    for (const e of plan.episodes) {
      expect(e.minutes).toBeGreaterThanOrEqual(3);
      expect(e.short).toBeUndefined();
    }
  });

  it('sends a short first episode back once, while the research holds more', () => {
    const short = onDeep({
      items: [
        { ...strong('a', 1, 60), claims: ['d1'] },
        { ...strong('b', 1, 40), claims: ['d2'] },
      ],
    });
    const [problem] = planLengthProblems(short, { wpm: 150 }, deep);
    expect(problem).toMatch(
      /^Episode 1 runs about 127 seconds of material; an episode runs three to five minutes, about four\. Keep more of the research that serves its question, as items of its own \(about 113 seconds more\)/,
    );
    expect(problem).toContain('Claims no kept item uses yet: d3, d4,');
    // Not when the research truly holds no more, nor when it is long enough.
    expect(planLengthProblems(short, { wpm: 150 }, research)).toEqual([]);
    expect(
      planLengthProblems(
        base({ items: [strong('a', 1, 90), strong('b', 1, 90)] }),
        { wpm: 150 },
        deep,
      ),
    ).toEqual([]);
  });

  it('writes an episode to its material: three to five minutes, under three only when it is short', () => {
    const plan = base({ items: [strong('a', 1, 60), strong('b', 1, 40)] });
    expect(episodeTarget(plan, 1, 150)).toEqual({ seconds: 180, short: false });
    const short = soundPlan(plan).plan;
    expect(episodeTarget(short, 1, 150)).toEqual({ seconds: 127, short: true });
    expect(episodeTarget(plan, 2, 150)).toBeNull();
  });

  it('moves an item to the next episode when one runs past five minutes', () => {
    const { plan } = soundPlan(
      base({
        items: [
          strong('a', 1, 90),
          strong('b', 1, 90),
          strong('c', 1, 90),
          strong('d', 1, 60),
          strong('e', 2, 90),
          strong('f', 2, 90),
        ],
        episodes: [
          { title: 'One', question: 'Why?' },
          { title: 'Two', question: 'How?' },
        ],
      }),
    );
    expect(plan.episodes.map((e) => e.covers)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    for (const e of plan.episodes) {
      expect(e.minutes).toBeGreaterThanOrEqual(3);
      expect(e.minutes).toBeLessThanOrEqual(5);
    }
    expect(plan.items[3].episode).toBe(2);
  });

  it('joins two short episodes that fit in five minutes', () => {
    const { plan } = soundPlan(
      base({
        items: [strong('a', 1, 60), strong('b', 2, 60), strong('c', 3, 70)],
        episodes: [
          { title: 'One', question: 'Why?' },
          {
            title: 'Two',
            question: 'How?',
            plants: [{ text: 'seed', paidIn: 3 }],
          },
          { title: 'Three', question: 'So?' },
        ],
      }),
    );
    expect(plan.episodes).toHaveLength(1);
    expect(plan.episodes[0].covers).toEqual([0, 1, 2]);
    // Its plant pays off where its payoff went: the one episode.
    expect(plan.episodes[0].plants[0].paidIn).toBe(1);
  });

  it('times an episode at the audience pace: slower for children', () => {
    const plan = base({ items: [strong('a', 1, 80)] });
    expect(episodeSeconds(plan, [0], 1, 150)).toBe(15 + 12 + 80);
    expect(episodeSeconds(plan, [0], 2, 120)).toBeCloseTo(15 + 12 + 8 + 100);
  });
});

describe('the beat sheet', () => {
  const acts = (...seconds: number[]) =>
    beatsOf({
      acts: seconds.map((n, k) => ({ title: `Act ${k + 1}`, seconds: n })),
    });

  it("is laid out to its episode's length: scaled up when short of it, down past five minutes", () => {
    const target = { seconds: 180, short: false };
    expect(fitBeats(acts(40, 40), target).acts.map((a) => a.seconds)).toEqual([
      90, 90,
    ]);
    expect(fitBeats(acts(200, 200), target).acts.map((a) => a.seconds)).toEqual(
      [150, 150],
    );
    // Within its length, its seconds are its own.
    expect(fitBeats(acts(100, 140), target).acts.map((a) => a.seconds)).toEqual(
      [100, 140],
    );
    // A short episode keeps to its material.
    expect(
      fitBeats(acts(100, 100), { seconds: 120, short: true }).acts.map(
        (a) => a.seconds,
      ),
    ).toEqual([60, 60]);
    expect(fitBeats(acts(40, 40), null).seconds).toBe(80);
  });

  it('budgets words at the pace, fewer in a grave act', () => {
    const beats = budgetBeats(
      beatsOf({
        acts: [
          { title: 'One', seconds: 60 },
          { title: 'Two', seconds: 60, grave: true },
        ],
      }),
      { wpm: 150 },
    );
    expect(beats.acts.map((a) => a.words)).toEqual([150, 128]);
    expect(beats.words).toBe(278);
  });

  it('finds an act past two minutes, a missing re-hook, a plant with no act', () => {
    const beats = beatsOf({
      acts: [
        { title: 'One', seconds: 150, rehook: '' },
        { title: 'Two', seconds: 60, payoffs: ['p2'] },
      ],
    });
    const problems = beatProblems(beats, { plants: ['p1'], payoffs: ['p2'] });
    expect(problems.join('\n')).toMatch(/Act 1 runs 150 seconds/);
    expect(problems.join('\n')).toMatch(/Act 1 has no re-hook/);
    expect(problems.join('\n')).toMatch(/Plant p1 is planted/);
    expect(problems.join('\n')).not.toMatch(/p2/);
  });

  it('splits an act past two minutes in two', () => {
    const split = splitLongActs(
      budgetBeats(
        beatsOf({ acts: [{ title: 'Long', seconds: 160, rehook: 'But?' }] }),
      ),
    );
    expect(split.acts.map((a) => [a.title, a.seconds])).toEqual([
      ['Long', 80],
      ['Long, continued', 80],
    ]);
    expect(split.seconds).toBe(160);
  });
});

describe('the hook', () => {
  it('may not greet, talk of the video, or rest on what is not sure', () => {
    const problems = hookProblems(
      'Hi everyone! In this video, 5 million people share a birthday. Why?',
      ['c2'],
      research,
    );
    expect(problems.join('\n')).toMatch(/greets the viewer/);
    expect(problems.join('\n')).toMatch(/talks about the video/);
    expect(problems.join('\n')).toMatch(/rests on c2/);
    expect(
      hookProblems(
        'In 1582, ten days vanished. Where did they go?',
        ['c1'],
        research,
      ),
    ).toEqual([]);
    expect(
      hookProblems(
        'In 1582, ten days vanished. Where did they go?',
        [],
        research,
      ),
    ).toEqual(['The hook states a number or a date with no claim: cite it.']);
  });

  it('opens on a picture, someone in it when people drive the story, and ends on its question', () => {
    const people = {
      ...research,
      people: researchOf({
        people: [
          { name: 'Sir Abubakar Tafawa Balewa' },
          { name: 'Ahmadu Bello' },
        ],
      }).people,
    };
    // An abstraction, or a place with no one in it, is no picture.
    for (const hook of [
      'Three regions. One country. Why did independence take so long?',
      'After the 1945 strikes, colonial Nigeria began shifting power into regional legislatures. Why?',
      'In 1953, regional bargaining power reshaped the timetable. Why?',
    ])
      expect(hookProblems(hook, [], people).join('\n')).toMatch(
        /not a picture: open on one moment someone could film/,
      );
    // One moment, with someone in it, at a time and in a place.
    for (const hook of [
      'On 31 March 1953, in Lagos, Ahmadu Bello led the Northern members out of the House. Why did they walk out?',
      'In 1957, Balewa stood in the House in Lagos. What would he ask for?',
      'At dawn, delegates crowded the hall in London. Who would speak first?',
    ])
      expect(
        hookPictureProblem(
          hook,
          people.people!.map((p) => p.name),
        ),
      ).toBeNull();
    // A story with no people: a time or a place is enough.
    expect(
      hookPictureProblem('In 1582, ten days vanished from the calendar.'),
    ).toBeNull();
    expect(
      hookProblems('In 1582, ten days vanished.', ['c1'], research),
    ).toEqual([
      'The hook ends without its question: end on the question the episode answers.',
    ]);
  });

  it('loses its greeting and its talk of the video, by code', () => {
    expect(mendHook('Hello and welcome! In this video, ten days vanish.')).toBe(
      'Ten days vanish.',
    );
  });

  it('keeps its promise in the last rows', () => {
    const rows = [
      row({ say: 'The calendar drifted.' }),
      row({ say: 'So the ten missing days bought back the spring equinox.' }),
    ];
    expect(promiseReturns('Where did ten days go?', rows)).toBe(true);
    expect(promiseReturns('Why do cats purr at night?', rows)).toBe(false);
  });
});

describe('the script, checked and mended', () => {
  it('knows a factual row from a question', () => {
    expect(isFactual('In 1582 the calendar changed.')).toBe(true);
    expect(isFactual('Then Pope Gregory stepped in.')).toBe(true);
    expect(isFactual('So where did the days go?')).toBe(false);
    expect(isFactual('The days simply vanished.')).toBe(false);
  });

  it('softens a number with one source, never a year', () => {
    expect(softened('5 million people share it.')).toBe(
      'about 5 million people share it.',
    );
    expect(softened('In 1582, 10 days went.')).toBe(
      'In 1582, about 10 days went.',
    );
    expect(softened('Roughly 5 million people.')).toBe(
      'Roughly 5 million people.',
    );
    expect(softened('In 1582 it changed.')).toBe('In 1582 it changed.');
  });

  it("says a contested claim is someone's", () => {
    expect(attributed('The reform was rushed.', 'some historians')).toBe(
      'According to some historians, the reform was rushed.',
    );
    expect(attributed('Historians say it was rushed.', 'x')).toBe(
      'Historians say it was rushed.',
    );
  });

  it('takes talk of the screen out where the sentence still reads', () => {
    expect(withoutScreenTalk('As you can see, the seasons drift.')).toBe(
      'The seasons drift.',
    );
    expect(withoutScreenTalk('On the left.')).toBeNull();
  });

  it('splits a long sentence at the joint nearest its middle', () => {
    expect(
      splitSentence(
        'The Romans counted their year by the moon for centuries, but the seasons slowly slid away from the festivals they were meant to mark.',
      ),
    ).toEqual([
      'The Romans counted their year by the moon for centuries.',
      'But the seasons slowly slid away from the festivals they were meant to mark.',
    ]);
    expect(splitSentence('Short and sweet.')).toBeNull();
  });

  it('names what goes back once: a fact with no claim, the screen, loaded words, a contested claim', () => {
    const rows = rowsOf(
      [
        { say: 'In 1582, ten days vanished.', show: 'A calendar', act: 1 },
        {
          say: 'As you can see, the tribes were angry.',
          show: 'A crowd',
          claims: ['c1'],
          act: 1,
        },
        {
          say: 'The reform was rushed.',
          show: 'A pope',
          claims: ['c3'],
          act: 1,
        },
        {
          say: 'Some 5 million people have it.',
          show: 'A counter',
          claims: ['c2'],
          act: 1,
        },
        { say: 'A sentence with no picture.', show: '', act: 1 },
      ],
      known,
    );
    const problems = scriptProblems(rows, { research, pace }).join('\n');
    expect(problems).toMatch(/Row 1 states a fact with no claim/);
    expect(problems).toMatch(/Row 2 talks about the screen/);
    expect(problems).toMatch(/Row 2 says "tribes": say "peoples"/);
    expect(problems).toMatch(/Row 3 rests on c3, which is contested/);
    expect(problems).not.toMatch(/Row 4 gives/);
    expect(problems).toMatch(/Row 5 shows nothing/);
  });

  it('mends what still comes back, silently', () => {
    const { rows, fixed } = mendRows(
      rowsOf(
        [
          { say: 'And then the tribes rode north.', show: 'Riders', act: 1 },
          {
            say: 'The reform was rushed.',
            show: 'A pope',
            claims: ['c3'],
            act: 1,
          },
          {
            say: '5 million people share the day.',
            show: 'Counter "5 million"',
            claims: ['c2'],
            act: 1,
          },
          {
            say: 'He wrote "the calendar must follow the sun" to the bishops.',
            visual: 'exact-words',
            show: 'A letter',
            claims: ['c4'],
            act: 1,
          },
          {
            say: 'The Romans counted their year by the moon for centuries, but the seasons slowly slid away from the festivals they were meant to mark.',
            show: 'A moon',
            act: 2,
          },
        ],
        known,
      ),
      { research, pace },
    );
    expect(rows.map((r) => r.say)).toEqual([
      'The peoples rode north.',
      'According to some historians, the reform was rushed.',
      'about 5 million people share the day.',
      'He wrote the calendar must follow the sun to the bishops.',
      'The Romans counted their year by the moon for centuries.',
      'But the seasons slowly slid away from the festivals they were meant to mark.',
    ]);
    expect(rows[2].show).toBe('Counter "about 5 million"');
    expect(rows[3].visual).toBe('who');
    expect(rows[5].act).toBe(2);
    expect(fixed.length).toBeGreaterThanOrEqual(5);
  });
});

describe("the fact check's verdicts", () => {
  it('soften rows as rewritten, cut the rest of a cut claim, and mark every claim used', () => {
    const rows = rowsOf(
      [
        { say: 'In 1582, ten days vanished.', claims: ['c1'] },
        { say: '5 million people share it.', claims: ['c2'] },
        { say: 'The pope wrote to the bishops.', claims: ['c4'] },
        { say: 'Nobody slept through it.', claims: ['c3'] },
      ],
      known,
    );
    const done = applyFacts(
      rows,
      [
        {
          claim: 'c1',
          verdict: 'verified',
          note: '',
          rewrites: [],
          sources: [],
        },
        {
          claim: 'c2',
          verdict: 'soften',
          note: 'one source',
          rewrites: [{ row: 1, say: 'Millions of people share it.' }],
          sources: [{ url: 'https://c.example.com', title: 'C' }],
        },
        {
          claim: 'c4',
          verdict: 'cut',
          note: 'no source',
          rewrites: [],
          sources: [],
        },
      ],
      research,
    );
    expect(done.rows.map((r) => r.say)).toEqual([
      'In 1582, ten days vanished.',
      'Millions of people share it.',
      'Nobody slept through it.',
    ]);
    expect(done.softened).toBe(1);
    expect(done.cut).toBe(1);
    const status = Object.fromEntries(
      done.research.claims.map((c) => [c.id, c.status]),
    );
    expect(status).toEqual({
      c1: 'verified',
      c2: 'soften',
      c3: 'unverified',
      c4: 'cut',
    });
    expect(done.research.claims[1].sources).toHaveLength(2);
  });
});

describe('the package and the palette, put right by code', () => {
  const pack = {
    title: 'Ten Days Gone',
    titles: [
      { text: 'Ten Days Gone', verdict: 'best' },
      { text: 'The Calendar Glitch Nobody Noticed', verdict: 'good' },
    ],
    thumbnail: { words: 'TEN DAYS GONE', row: 3 },
    description: 'Why leap years exist.',
    leftOut: '',
  };

  it('keeps the title and the thumbnail saying different things', () => {
    expect(soundPackage(pack, []).title).toBe(
      'The Calendar Glitch Nobody Noticed',
    );
  });

  it('always says what was left out, in the description too', () => {
    const sound = soundPackage(pack, ['The French calendar']);
    expect(sound.leftOut).toBe('What we left out: The French calendar.');
    expect(sound.description).toBe(
      'Why leap years exist.\n\nWhat we left out: The French calendar.',
    );
  });
});

describe('the script held to its length and its scenes', () => {
  it('never softens a number that is part of a word', () => {
    expect(softened('A fixed 365-day calendar slips by 6 hours.')).toBe(
      'A fixed 365-day calendar slips by about 6 hours.',
    );
  });

  it('says when the script, or an act, falls short of its material', () => {
    const beats = budgetBeats(
      beatsOf({
        acts: [
          { title: 'One', seconds: 60 },
          { title: 'Two', seconds: 60 },
        ],
      }),
      { wpm: 150 },
    );
    const rows = rowsOf(
      [
        { say: 'One short line here.', show: 'x', act: 1 },
        { say: 'Another short line.', show: 'y', act: 2 },
      ],
      known,
    );
    const problems = scriptProblems(rows, { research, pace, beats });
    expect(problems[0]).toMatch(/^The script runs about 7 words/);
    // How much it still needs, in words and in rows of its pace's length.
    expect(problems[0]).toContain(
      'It needs about 293 more words: about 21 more rows of about 14 words.',
    );
    expect(problems.join('\n')).toMatch(/Act 1 runs only 4 words of its 150/);
  });

  it('keeps scenes to people in places, and never a lone shot between diagrams', () => {
    const rows = rowsOf(
      [
        {
          say: 'Farmers sow too early.',
          visual: 'scene',
          show: 'A farmer in a field',
          act: 1,
        },
        {
          say: 'The year drifts.',
          visual: 'why',
          show: 'A drift line',
          act: 1,
        },
        {
          say: 'The calendar slips.',
          visual: 'scene',
          show: 'A desk with pages',
          act: 1,
        },
        {
          say: 'Clavius checks the sums.',
          visual: 'scene',
          show: 'Clavius at a table',
          act: 1,
        },
        { say: 'Spring returns.', visual: 'why', show: 'A loop', act: 1 },
        {
          say: 'People celebrate.',
          visual: 'scene',
          show: 'A crowd in a square',
          act: 1,
        },
        { say: 'The rule holds.', visual: 'why', show: 'A rule card', act: 1 },
      ],
      known,
    );
    const { rows: sound, fixed } = soundScenes(rows, {
      places: [{ name: 'The square' }],
      people: [{ name: 'Christopher Clavius' }],
    });
    expect(sound.map((r) => r.visual)).toEqual([
      'scene',
      'why',
      'why',
      'why',
      'why',
      'why',
      'why',
    ]);
    expect(fixed).toBe(3);
  });
});

describe('an episode keeps its length with new matter', () => {
  const research = {
    claims: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id) => ({ id })),
  } as unknown as Parameters<typeof unusedClaims>[1];
  const plan = {
    items: [
      { claims: ['c1', 'c2'], episode: 1, decision: 'keep' },
      { claims: ['c3'], episode: 1, decision: 'compress' },
      { claims: ['c4'], episode: 2, decision: 'keep' },
      { claims: ['c5'], episode: null, decision: 'cut' },
    ],
  } as unknown as Parameters<typeof unusedClaims>[0];

  it("offers the episode's own claims not yet said, then claims no episode was given", () => {
    const rows = [{ claims: ['c1'] }];
    // c2 and c3 are episode 1's; c6 was given to none (c5 sits on a cut item, given to none too);
    // c4 is episode 2's and stays for it.
    expect(unusedClaims(plan, research, 1, rows)).toEqual([
      'c2',
      'c3',
      'c5',
      'c6',
    ]);
  });

  it('never offers what an earlier episode already said', () => {
    expect(
      unusedClaims(
        plan,
        research,
        1,
        [],
        [{ rows: [{ claims: ['c2', 'c6'] }] }],
      ),
    ).toEqual(['c1', 'c3', 'c5']);
  });

  it('counts the words a script says', () => {
    expect(
      spokenWords([
        { say: 'Three regions, three plans.' },
        { say: 'One date.' },
      ]),
    ).toBe(6);
  });
});
