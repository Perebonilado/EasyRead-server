import {
  beatsOf,
  editorialOf,
  factsOf,
  freshEditorial,
  hooksOf,
  packageOf,
  rowVisualOf,
  rowsOf,
} from './studio-editorial';

const known = new Set(['c1', 'c2', 'c3']);

describe("an episode's editorial, made sound", () => {
  it('reads a beat sheet, its seconds held to an act', () => {
    const beats = beatsOf({
      acts: [
        {
          title: 'The missing days',
          job: 'Set up the mystery',
          seconds: 70,
          rehook: 'But who decided?',
          plants: ['P1', 'p2!'],
          grave: false,
        },
        { title: '', seconds: 900, payoffs: ['p1'], grave: true },
      ],
    });
    expect(
      beats.acts.map((a) => [a.title, a.seconds, a.plants, a.payoffs, a.grave]),
    ).toEqual([
      ['The missing days', 70, ['p1', 'p2'], [], false],
      ['Act 2', 200, [], ['p1'], true],
    ]);
    expect(beats.seconds).toBe(270);
  });

  it('reads the hooks, each of a kind, and the one made of them', () => {
    const { hooks, hook } = hooksOf(
      {
        hooks: [
          {
            text: 'In 1582, ten days vanished.',
            kind: 'paradox',
            verdict: 'strong',
            claims: ['c1', 'c9'],
          },
          { text: 'A birthday every four years.', kind: 'weird' },
        ],
        hook: 'In 1582, ten days vanished overnight. Nobody lost a minute of sleep. So where did they go?',
      },
      known,
    );
    expect(hooks.map((h) => [h.kind, h.claims])).toEqual([
      ['paradox', ['c1']],
      ['question', []],
    ]);
    expect(hook).toMatch(/^In 1582/);
  });

  it('reads the rows of the script, what each shows by the decision rule', () => {
    const rows = rowsOf(
      [
        {
          say: 'In 1582, Europe went to bed on the fourth.',
          visual: 'when',
          show: 'A calendar flips',
          claims: ['c1', 'cX'],
          act: 1,
        },
        {
          say: 'Rome was furious.',
          visual: 'feeling',
          show: 'A crowd in a square',
          act: 7,
        },
        { say: '', visual: 'when' },
        {
          say: 'Ten days.',
          visual: 'counter',
          delivery: 'key',
          music: 'tense',
          hold: true,
        },
      ],
      known,
      3,
    );
    expect(rows.map((r) => [r.visual, r.claims, r.act])).toEqual([
      ['when', ['c1'], 1],
      ['scene', [], 3],
      ['how-many', [], 1],
    ]);
    expect(rows[2]).toMatchObject({
      delivery: 'key',
      music: 'tense',
      hold: true,
    });
  });

  it.each([
    ['map', 'place'],
    ['timeline', 'when'],
    ['How many', 'how-many'],
    ['name card', 'who'],
    ['flow', 'why'],
    ['split screen', 'comparison'],
    ['quote card', 'exact-words'],
    ['illustrated scene', 'scene'],
    ['anything else', 'why'],
  ])('takes a visual said as "%s" to be %s', (said, visual) => {
    expect(rowVisualOf(said)).toBe(visual);
  });

  it("keeps the fact check's verdicts to the log's claims and the script's rows", () => {
    const facts = factsOf(
      {
        checks: [
          {
            claim: 'c1',
            verdict: 'soften',
            note: 'one source',
            rewrites: [
              { row: 0, say: 'About ten days went.' },
              { row: 9, say: 'No row.' },
            ],
          },
          { claim: 'c1', verdict: 'cut' },
          { claim: 'c7', verdict: 'cut' },
          {
            claim: 'c2',
            verdict: 'maybe',
            sources: ['https://a.example.com/x', 'nonsense'],
          },
        ],
      },
      known,
      2,
    );
    expect(
      facts.map((f) => [
        f.claim,
        f.verdict,
        f.rewrites.length,
        f.sources.length,
      ]),
    ).toEqual([
      ['c1', 'soften', 1, 0],
      ['c2', 'verified', 0, 1],
    ]);
    // A search's answer names its claims with their words after the id.
    expect(
      factsOf(
        {
          checks: [
            { claim: 'c2: Ten days went in 1582.', verdict: 'verified' },
          ],
        },
        known,
        2,
      ).map((f) => f.claim),
    ).toEqual(['c2']);
  });

  it('reads the package: hashtags tidy, a thumbnail of four words at most', () => {
    const pack = packageOf(
      {
        titles: [
          { text: 'The 10 Days That Never Happened', verdict: 'best' },
          'Why Leap Years Exist',
        ],
        thumbnail: { words: 'TEN DAYS JUST VANISHED OVERNIGHT', row: 3 },
        description: 'Why leap years exist.',
        hashtags: ['#calendar', 'leap year', 'calendar'],
      },
      2,
    );
    expect(pack.title).toBe('The 10 Days That Never Happened');
    expect(pack.titles).toHaveLength(2);
    expect(pack.thumbnail).toEqual({
      words: 'TEN DAYS JUST VANISHED',
      row: null,
    });
    expect(pack.hashtags).toEqual(['#calendar', '#leapyear']);
  });

  it('is read back as kept, and none for an episode without one', () => {
    expect(editorialOf(null)).toBeNull();
    const fresh = freshEditorial(2, 'Why did it nearly fall apart?');
    expect(editorialOf(fresh)).toEqual(fresh);
    const kept = editorialOf({
      ...fresh,
      stage: 'ready',
      beats: { acts: [{ title: 'One', seconds: 60, words: 140 }] },
      rows: [{ say: 'Hello there.', visual: 'scene', claims: ['c4'], act: 1 }],
    });
    expect(kept?.beats?.acts[0].words).toBe(140);
    // Read back, a row keeps the claims it was kept with.
    expect(kept?.rows[0].claims).toEqual(['c4']);
  });
});
