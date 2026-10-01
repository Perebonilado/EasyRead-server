import { anglesOf, planOf, researchOf, type EditorPlan } from './studio-editor';
import { beatsOf, rowsOf, type EditorialRow } from './studio-editorial';
import {
  applyFacts,
  attributed,
  beatProblems,
  budgetBeats,
  episodeSeconds,
  hookProblems,
  isFactual,
  mendHook,
  mendRows,
  pickedAngle,
  planProblems,
  promiseReturns,
  scriptProblems,
  softened,
  soundPlan,
  splitLongActs,
  splitSentence,
  withoutScreenTalk,
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
    // 15 s hook + 12 s close + 100 s of items: about two minutes, not stretched.
    expect(plan.episodes[0].minutes).toBe(2);
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
      'Hi everyone! In this video, 5 million people share a birthday.',
      ['c2'],
      research,
    );
    expect(problems).toHaveLength(3);
    expect(
      hookProblems('In 1582, ten days vanished.', ['c1'], research),
    ).toEqual([]);
    expect(
      hookProblems('In 1582, ten days vanished.', [], research),
    ).toHaveLength(1);
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
