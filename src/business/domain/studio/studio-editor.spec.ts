import {
  EMPTY_EDITOR,
  anglesOf,
  editorOf,
  editorSwitchOn,
  eraNamed,
  mergedResearch,
  planOf,
  plainText,
  researchOf,
  urlKey,
  usesEditor,
  worldOf,
  type EditorSource,
} from './studio-editor';

describe("the editor's angles", () => {
  it('are summed and ranked by code, whatever the writer said of them', () => {
    const angles = anglesOf([
      {
        question: 'Why does February get the extra day?',
        pitch: 'A calendar fix. A Roman quirk.',
        scores: { gap: 3, tension: 2, visual: 4, payoff: 3 },
        total: 20,
        verdict: 'fine',
      },
      {
        question: 'How did a pope lose ten days?',
        pitch: 'In 1582 ten days vanished. Here is why.',
        scores: { gap: 5, tension: 5, visual: 4, payoff: 5 },
        verdict: 'the one',
      },
      {
        question: 'How did a pope lose ten days?',
        pitch: 'Said twice.',
        scores: { gap: 1, tension: 1, visual: 1, payoff: 1 },
      },
      { question: '', pitch: 'no question' },
      {
        question: 'Is a year really 365 days?',
        scores: { gap: 9, tension: 0, visual: 'three', payoff: 4 },
      },
    ]);
    expect(angles.map((a) => [a.question, a.total])).toEqual([
      ['How did a pope lose ten days?', 19],
      ['Is a year really 365 days?', 13],
      ['Why does February get the extra day?', 12],
    ]);
    // A score off the scale is held to it; one that is no number is the middle.
    expect(angles[1].scores).toEqual({
      gap: 5,
      tension: 1,
      visual: 3,
      payoff: 4,
    });
  });
});

describe("the editor's research", () => {
  const found = new Map<string, EditorSource>([
    [
      urlKey('https://aa.usno.navy.mil/faq/leap_years?utm_source=openai'),
      {
        url: 'https://aa.usno.navy.mil/faq/leap_years?utm_source=openai',
        title: 'Leap Years',
      },
    ],
    [
      urlKey('https://www.britannica.com/topic/Gregorian-calendar'),
      {
        url: 'https://www.britannica.com/topic/Gregorian-calendar',
        title: 'Gregorian calendar',
      },
    ],
  ]);

  it('keeps only the sources the search really found, matched without its tracking', () => {
    const research = researchOf(
      {
        claims: [
          {
            id: 'c1',
            text: 'The Gregorian reform began in 1582. ([aa.usno.navy.mil](https://aa.usno.navy.mil/faq/leap_years?utm_source=openai))',
            kind: 'date',
            confidence: 'high',
            sources: [
              { url: 'https://aa.usno.navy.mil/faq/leap_years', title: '' },
              { url: 'https://made-up.example.com/page', title: 'Invented' },
            ],
          },
          {
            id: 'c2',
            text: 'A year is about 365.2422 days.',
            kind: 'number',
            confidence: 'high',
            sources: [{ url: 'https://elsewhere.example.org/x' }],
          },
        ],
      },
      found,
      4,
    );
    expect(research.claims[0].text).toBe('The Gregorian reform began in 1582.');
    expect(research.claims[0].sources).toEqual([
      {
        url: 'https://aa.usno.navy.mil/faq/leap_years?utm_source=openai',
        title: 'Leap Years',
      },
    ]);
    expect(research.claims[0].confidence).toBe('high');
    // A claim whose only source no search found stands on nothing: low, unverified.
    expect(research.claims[1].sources).toEqual([]);
    expect(research.claims[1].confidence).toBe('low');
    expect(research.claims[1].status).toBe('unverified');
    expect(research.searched).toBe(4);
  });

  it("takes a page of the maker's document as a source", () => {
    const research = researchOf(
      {
        claims: [
          {
            id: 'c1',
            text: 'The heart has four chambers.',
            sources: [{ url: 'document:doc-7#p12', title: 'Biology, page 12' }],
          },
        ],
      },
      new Map(),
    );
    expect(research.claims[0].sources[0].url).toBe('document:doc-7#p12');
  });

  it('checks a number against two sources by code', () => {
    const research = researchOf({
      claims: [
        {
          id: 'c1',
          text: 'About 4.1 million people are born on 29 February.',
          kind: 'number',
          sources: [{ url: 'https://a.example.com/x' }],
        },
        {
          id: 'c2',
          text: 'The tropical year is 365.2422 days.',
          kind: 'number',
          sources: [
            { url: 'https://a.example.com/y' },
            { url: 'https://b.example.org/z' },
          ],
        },
      ],
      numbers: [
        {
          label: 'People born on 29 February',
          value: '4.1 million',
          claims: ['c1'],
        },
        {
          label: 'Tropical year',
          value: '365.2422 days',
          claims: ['c2', 'c9'],
        },
      ],
    });
    expect(research.numbers.map((n) => [n.checked, n.claims])).toEqual([
      [false, ['c1']],
      [true, ['c2']],
    ]);
  });

  it('gives a claim with no id, or one taken, an id of its own', () => {
    const research = researchOf({
      claims: [
        { id: 'c1', text: 'One.' },
        { id: 'c1', text: 'Two.' },
        { text: 'Three.' },
      ],
    });
    expect(research.claims.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('is topped up with new claims numbered after the old', () => {
    const old = researchOf({
      claims: [
        { id: 'c1', text: 'Old fact.', sources: ['https://a.example.com'] },
      ],
      searched: 10,
    });
    const more = researchOf({
      claims: [
        { id: 'c1', text: 'New fact.', sources: ['https://b.example.com'] },
        { id: 'c2', text: 'Old fact.' },
      ],
      timeline: [{ date: '1582', event: 'Ten days skipped', claims: ['c1'] }],
      searched: 3,
    });
    const merged = mergedResearch(old, more);
    expect(merged.claims.map((c) => [c.id, c.text])).toEqual([
      ['c1', 'Old fact.'],
      ['c2', 'New fact.'],
    ]);
    expect(merged.timeline[0].claims).toEqual(['c2']);
    expect(merged.searched).toBe(13);
  });
});

describe("the editor's plan and world, made sound", () => {
  it('holds a plan to what exists: claims of the log, items, episodes', () => {
    const research = researchOf({
      claims: [{ id: 'c1', text: 'A fact.' }],
    });
    const plan = planOf(
      {
        spine: [
          'Once',
          'Every day',
          'Until one day',
          'Because',
          'Because',
          'Until finally',
          'Seventh',
        ],
        chain: [
          { beat: 'Rome kept a lunar year', link: 'but' },
          { beat: 'Caesar fixed it', link: 'Therefore' },
          { beat: 'Too long by minutes', link: 'nonsense' },
        ],
        items: [
          {
            item: 'Caesar adds a day',
            claims: ['c1', 'c7'],
            moves: true,
            visual: true,
            decision: 'keep',
            episode: 1,
            seconds: 400,
          },
          { item: 'Cut thing', decision: 'cut', episode: 1 },
        ],
        episodes: [
          {
            title: 'The lost days',
            question: 'Where did ten days go?',
            covers: [0, 5],
            plants: [{ text: 'the extra minutes', paidIn: 2 }],
          },
        ],
      },
      research,
    );
    expect(plan.spine).toHaveLength(6);
    expect(plan.chain.map((c) => c.link)).toEqual([
      null,
      'therefore',
      'and then',
    ]);
    expect(plan.items[0].claims).toEqual(['c1']);
    expect(plan.items[0].seconds).toBe(90);
    expect(plan.items[1].episode).toBeNull();
    expect(plan.episodes[0].covers).toEqual([0]);
    expect(plan.episodes[0].plants[0]).toEqual({
      id: 'p1-1',
      text: 'the extra minutes',
      paidIn: 2,
    });
  });

  it("keeps a world's colours to the theme's own tokens", () => {
    const world = worldOf({
      era: 'the 1960s',
      palette: [
        { thing: 'the North', token: 'chart0' },
        { thing: 'the South', token: '#ff0000' },
        { thing: 'the North', token: 'chart1' },
      ],
      held: { token: 'chart0', for: 'independence' },
      places: [
        { name: 'The chamber', kind: 'hall', time: 'night' },
        { name: 'Somewhere', kind: 'castle' },
      ],
      people: [
        {
          name: 'A leader',
          figure: { age: 'elder', top: 'robe', headwear: 'kufi' },
        },
      ],
    });
    expect(world.era).toBe('1945-1975');
    expect(world.palette).toEqual([{ thing: 'the North', token: 'chart0' }]);
    // The held colour is never one already given to a thing.
    expect(world.held).toBeNull();
    expect(world.places.map((p) => [p.id, p.kind, p.time])).toEqual([
      ['the-chamber', 'hall', 'night'],
      ['somewhere', 'street', 'day'],
    ]);
    expect(world.people[0].figure).toMatchObject({
      age: 'elder',
      top: 'robe',
      headwear: 'kufi',
    });
  });

  it('reads an era as people write it', () => {
    expect(eraNamed('1945–1975')).toBe('1945-1975');
    expect(eraNamed('the present day')).toBe('today');
    expect(eraNamed('1582')).toBe('1500-1800');
    expect(eraNamed('ancient Rome, 46 BC')).toBe('ancient');
    expect(eraNamed('who knows')).toBeNull();
  });
});

describe("a show's editor", () => {
  it('is read back as kept, and none for a show without one', () => {
    expect(editorOf(null)).toBeNull();
    expect(editorOf('nonsense')).toBeNull();
    const kept = editorOf({
      ...EMPTY_EDITOR,
      stage: 'angles',
      question: 'Why?',
    });
    expect(kept).toMatchObject({ stage: 'angles', question: 'Why?' });
    expect(editorOf({ stage: 'nowhere' })?.stage).toBeNull();
  });

  it("is an explainer's only, marked when the show was made", () => {
    expect(usesEditor({ format: 'explainer', editor: EMPTY_EDITOR })).toBe(
      true,
    );
    expect(usesEditor({ format: 'explainer', editor: null })).toBe(false);
    expect(usesEditor({ format: 'story', editor: EMPTY_EDITOR })).toBe(false);
    expect(usesEditor({ format: null, editor: EMPTY_EDITOR })).toBe(false);
  });

  it('is on unless the switch says off', () => {
    expect(editorSwitchOn(undefined)).toBe(true);
    expect(editorSwitchOn('on')).toBe(true);
    expect(editorSwitchOn('off')).toBe(false);
    expect(editorSwitchOn('FALSE')).toBe(false);
    expect(editorSwitchOn('0')).toBe(false);
  });

  it("takes a search's links out of text, keeping their words", () => {
    expect(
      plainText(
        'Caesar fixed it in 46 BC ([britannica.com](https://www.britannica.com/x)) after [Sosigenes](https://en.wikipedia.org/wiki/Sosigenes) advised him.',
      ),
    ).toBe('Caesar fixed it in 46 BC after Sosigenes advised him.');
  });
});

describe('how sure a claim is', () => {
  it('is never sure of a number one source gives', () => {
    const research = researchOf({
      claims: [
        {
          id: 'c1',
          text: 'About 5 million.',
          kind: 'number',
          confidence: 'high',
          sources: ['https://a.example.com'],
        },
        {
          id: 'c2',
          text: 'About 6 million.',
          kind: 'number',
          confidence: 'high',
          sources: ['https://a.example.com', 'https://b.example.com'],
        },
        {
          id: 'c3',
          text: 'In 1582.',
          kind: 'date',
          confidence: 'high',
          sources: ['https://a.example.com'],
        },
      ],
    });
    expect(research.claims.map((c) => c.confidence)).toEqual([
      'medium',
      'high',
      'high',
    ]);
  });
});
