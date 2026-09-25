import { directionsIn, type Actor } from './scene-directions';

const goatCast: Actor[] = [
  { id: 'musa', names: ['Musa'], gender: 'm' },
  { id: 'zainab', names: ['Zainab'], gender: 'f' },
  { id: 'baba-sule', names: ['Baba Sule', 'old Baba Sule'], gender: 'm' },
  { id: 'goat', names: ['goat', 'brown goat'], gender: null },
];

/** Each act as "who does what toward whom @ the words", and each coming or going. */
const read = (
  sentences: string[],
  actors: Actor[],
  things: { id: string; names: string[] }[] = [],
  lines = new Map<number, { span: [number, number]; speaker: string }[]>(),
) => {
  const { acts, passages } = directionsIn(sentences, actors, things, lines);
  const at = (beat: number, i: number) =>
    sentences[beat].slice(i).split(/\s+/).slice(0, 2).join(' ');
  return {
    acts: acts.map(
      (a) =>
        `${a.who} ${a.do}${a.toward ? ` ${a.toward}` : ''} @ ${at(a.beat, a.at)}`,
    ),
    passages: passages.map((p) => `${p.who} ${p.how} @ ${at(p.beat, p.at)}`),
  };
};

describe('what the narration says the characters do', () => {
  it('finds every move, entrance and exit on a page the writer staged few of', () => {
    const page = [
      "Musa sat on a stool outside his father's shop, waiting for his friend.",
      'Zainab ran up the dusty path, out of breath. "Musa! Have you seen my goat?"',
      '"Your goat?" asked Musa. "The brown one with the little bell?"',
      '"Yes! She ran away this morning," said Zainab, and she began to cry.',
      'Musa stood up and put his arm around her. "Don\'t cry, Zainab."',
      'Just then, old Baba Sule came walking slowly along the road, leading a brown goat on a rope.',
      '"Is this the goat you are looking for?" he asked, smiling.',
      'Zainab hugged the goat, and then she hugged Baba Sule. "Thank you, Baba!"',
      'Baba Sule laughed, waved goodbye and walked on down the road.',
    ];
    const lines = new Map([
      [3, [{ span: [1, 32] as [number, number], speaker: 'zainab' }]],
    ]);
    expect(read(page, goatCast, [], lines)).toEqual({
      acts: [
        // "she" is Zainab: the last girl mentioned, speaking.
        'zainab sob @ began to',
        // "her" is whom Musa comforts: not him.
        'musa hug zainab @ put his',
        'zainab hug goat @ hugged the',
        'zainab hug baba-sule @ hugged Baba',
        // One who laughs, waves and walks on is the same one throughout.
        'baba-sule laugh @ laughed, waved',
        'baba-sule wave @ waved goodbye',
      ],
      passages: [
        'zainab enter @ ran up',
        'baba-sule enter @ came walking',
        'baba-sule leave @ walked on',
      ],
    });
  });

  it('reads a look up at the sky, and a laugh before a line', () => {
    const cast: Actor[] = [
      { id: 'nana', names: ['Nana Efua', 'Nana'], gender: 'f' },
      { id: 'kofi', names: ['Kofi'], gender: 'm' },
    ];
    expect(
      read(
        [
          "Nana Efua laughs and promises a new story: 'Tonight I will tell you about the moon.'",
          'Nana Efua gazes up at the sky and begins the tale.',
          'Kofi turned to Nana and nodded.',
        ],
        cast,
      ).acts,
    ).toEqual([
      'nana laugh @ laughs and',
      'nana look @up @ gazes up',
      'kofi look nana @ turned to',
      'kofi nod @ nodded.',
    ]);
  });

  it('acts nothing wanted, denied, habitual or said inside a quote', () => {
    expect(
      read(
        [
          'Musa wanted to go home.',
          'Zainab did not laugh.',
          '"Wave to Baba Sule!" said Zainab.',
          'Musa would never hug the goat.',
          // What happens as a rule, not now.
          'Every evening, Baba Sule walks out to the road.',
          'Zainab usually waves at the boats.',
        ],
        goatCast,
      ),
    ).toEqual({ acts: [], passages: [] });
  });

  it('knows "she" and "he" by the voice, and two names joined as both doing it', () => {
    expect(
      read(
        [
          'Musa looked at Zainab. She smiled and waved.',
          'He nodded.',
          'Musa and Zainab ran off together.',
          'Zainab hugged the goat and Baba Sule laughed.',
        ],
        goatCast,
      ),
    ).toEqual({
      acts: [
        'musa look zainab @ looked at',
        'zainab wave @ waved.',
        'musa nod @ nodded.',
        'zainab hug goat @ hugged the',
        'baba-sule laugh @ laughed.',
      ],
      passages: ['musa leave @ ran off', 'zainab leave @ ran off'],
    });
  });

  it('points at a thing on the page, and at no one when "her" is only whose', () => {
    expect(
      read(
        [
          'Zainab pointed at the lamp.',
          // Her brother is no one on the page: nothing to hug.
          'Zainab hugged her brother.',
        ],
        goatCast,
        [{ id: 'lamp', names: ['lamp'] }],
      ).acts,
    ).toEqual(['zainab point lamp @ pointed at']);
  });
});

describe('what the narration says people do with things', () => {
  const supper: Actor[] = [
    { id: 'jesus', names: ['Jesus'], gender: 'm' },
    { id: 'disciples', names: ['the disciples', 'disciples'], gender: null },
    { id: 'judas', names: ['Judas'], gender: 'm' },
  ];
  const business = (
    sentences: string[],
    props: Parameters<typeof directionsIn>[4] = [],
  ) =>
    directionsIn(sentences, supper, [], new Map(), props).business.map((b) => {
      const word = sentences[b.beat]
        .slice(b.at)
        .split(/\s+/)[0]
        .replace(/[.,]$/u, '');
      return `${b.who} ${b.does} ${b.prop}${b.to ? ` to ${b.to}` : ''} @ ${word}`;
    });

  it('reads the bread taken, blessed, broken and given, each on its word', () => {
    expect(
      business([
        'While they were eating, Jesus took bread, blessed it, broke it, and gave it to the disciples.',
      ]),
    ).toEqual([
      'jesus take bread @ took',
      'jesus raise bread @ blessed',
      'jesus break bread @ broke',
      'jesus give bread to disciples @ gave',
    ]);
  });

  it('reads a cup taken with thanks and handed on, and what "it" is from before', () => {
    expect(
      business([
        'Jesus sat down with them.',
        'Then he took the cup.',
        'Jesus gave thanks and handed it to them.',
      ]),
    ).toEqual([
      'jesus take cup @ took',
      'jesus raise cup @ gave',
      'jesus give cup @ handed',
    ]);
  });

  it('lets people eat and drink what is on the table when nothing is named', () => {
    expect(
      business(['Judas ate quietly.', 'Jesus drank.'], ['bread', 'cup']),
    ).toEqual(['judas eat bread @ ate', 'jesus drink cup @ drank']);
    // Nothing to eat on the page: nothing acted.
    expect(business(['Judas ate quietly.'])).toEqual([]);
  });

  it('takes the meal going on for a background, not a bite', () => {
    expect(
      business(['While they eat, Jesus takes bread and breaks it.']),
    ).toEqual(['jesus take bread @ takes', 'jesus break bread @ breaks']);
    expect(
      business(['As Judas was drinking, Jesus looked at him.'], ['cup']),
    ).toEqual([]);
  });

  it('dips into the bowl, and never acts what is only wanted or said', () => {
    expect(business(['Judas dipped his hand into the bowl.'])).toEqual([
      'judas dip bowl @ dipped',
    ]);
    expect(business(['Judas wanted to take the bread.'])).toEqual([]);
    expect(business(['Jesus said, "Take the bread and eat it."'])).toEqual([]);
  });

  it('still gives a hand held out when nothing is given', () => {
    const { acts, business: none } = directionsIn(
      ['Jesus gave Judas a long look.'],
      supper,
    );
    expect(none).toEqual([]);
    expect(acts.map((a) => `${a.who} ${a.do} ${a.toward}`)).toEqual([
      'jesus reach judas',
    ]);
  });
});
