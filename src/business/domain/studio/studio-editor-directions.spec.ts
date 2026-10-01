import { researchOf, worldOf } from './studio-editor';
import { rowsOf, type EditorialRow } from './studio-editorial';
import {
  PLAIN_PACE,
  directionIn,
  mendRows,
  namedText,
  scriptProblems,
  withNames,
  withoutDirections,
  type WorldNames,
} from './studio-editor-checks';
import { describeWorld } from './studio-editor-words';

/** The world of a live run (leap years), as the script's writer had it. */
const world: WorldNames = {
  people: [
    { id: 'julius-caesar', name: 'Julius Caesar' },
    { id: 'sosigenes-of-alexandria', name: 'Sosigenes of Alexandria' },
    { id: 'pope-gregory-xiii', name: 'Pope Gregory XIII' },
    { id: 'a-calendar-user', name: 'A calendar user' },
  ],
  places: [
    { id: 'roman-forum', name: 'Roman Forum' },
    { id: 'alexandria-observatory', name: 'Alexandria observatory' },
    {
      id: 'papal-chambers-at-the-vatican-pa',
      name: 'Papal chambers at the Vatican Palace',
    },
    { id: 'modern-home-office', name: 'Modern home office' },
  ],
};

/** Its episode's two columns, word for word: say, then show. */
const LEAP: [string, string][] = [
  [
    'Some years divisible by four still skip February 29, which is the puzzle here.',
    'Calendar years "1900" crossed, "2000" checked.',
  ],
  [
    'Earth does not take exactly 365 days to get back around the Sun.',
    'Earth orbit, "365 days" marked.',
  ],
  [
    'It takes about 365.2422 days, so every civil year starts out short by a little.',
    'Orbit counter, "365.2422" beside calendar strip.',
  ],
  [
    'That tiny missing piece is why calendars need a repair day to stay aligned.',
    'Calendar page, one missing slice returns.',
  ],
  [
    'A 365-day year is tidy, but Earth keeps asking for a little more each circuit.',
    '365-day strip beside blue orbit path.',
  ],
  [
    'Without correction, dates slide through the seasons, one month at a time.',
    'Modern home office, a-calendar-user moves month labels, soft afternoon light.',
  ],
  [
    'Leap years are the repair that keeps dates with the seasons, year after year.',
    'Calendar page snaps a leap square into February.',
  ],
  [
    'Every missing quarter-day piles up, so a simple rule can still drift over time.',
    'Tiny gap widens across a long timeline.',
  ],
  [
    'The fix had to be simple enough to remember, but accurate enough to matter.',
    'Simple rule gears beside Earth orbit.',
  ],
  [
    'So what did older calendars do about it, once the gap kept adding up?',
    'Question mark over a timeline.',
  ],
  [
    'In 46 BCE, Julius Caesar pushed a reform with Sosigenes of Alexandria.',
    'Name cards: "Julius Caesar", "Sosigenes of Alexandria".',
  ],
  [
    'At the Alexandria observatory, Sosigenes studied the sky in bright coastal daylight.',
    'Alexandria observatory, Sosigenes of Alexandria watches bronze tools, bright daylight.',
  ],
  [
    'In the Roman Forum, Caesar and Sosigenes unrolled a tablet under hard sun.',
    'Roman Forum, Julius Caesar and Sosigenes of Alexandria unroll a tablet, dry heat.',
  ],
  [
    'The Julian calendar made every fourth year a leap year, with no exception at all.',
    'Four-year loop with no skipped boxes.',
  ],
  [
    'That rule was simple, but it made the year slightly too long for Earth.',
    '365.25 bar stretching past Earth year bar.',
  ],
  [
    "Earth's year is shorter than 365.25 days, so the calendar ran slightly fast.",
    '365.25 versus 365.2422 bars.',
  ],
  [
    'Dates kept inching through the seasons, and the shift built up year by year.',
    'Season labels slide past month names.',
  ],
  [
    'A rule can be close and still drift over centuries, which is the trouble.',
    'Two nearly matching lines slowly separate.',
  ],
  [
    'The next fix had to target the years where the simple pattern goes wrong.',
    'Century-year boxes turn red, then pause.',
  ],
  [
    'That is the cost of keeping a calendar simple for everyone over time.',
    'Simple rule gears beside a longer timeline.',
  ],
  [
    'In 1582, Pope Gregory XIII tightened the leap-day rule.',
    'Name card: "Pope Gregory XIII", "1582".',
  ],
  [
    'Century years skip February 29 unless they are divisible by 400.',
    'Decision tree with "4", "100", "400".',
  ],
  [
    'So 1700, 1800, and 1900 were common years, while 2000 was a leap year.',
    'Years "1700", "1800", "1900" crossed, "2000" checked.',
  ],
  [
    "The Gregorian average year is 365.2425 days, very close to Earth's about-365.2422-day year, but still an approximation.",
    'Two bars: "365.2425" and "365.2422".',
  ],
  [
    'That gives 97 leap days and 303 common years in each 400-year cycle.',
    '400-year loop, "97" highlighted, "303" plain.',
  ],
  [
    'Modern home office, a-calendar-user crosses out 1900, then circles 2000 in daylight.',
    'Modern home office, a-calendar-user crosses out 1900, circles 2000, daylight.',
  ],
  [
    'In the same office, the user marks February 29 in blue on the wall calendar.',
    'Modern home office, a-calendar-user inserts blue "29" square, daylight.',
  ],
  [
    "Leap years exist because Earth's year is not a whole number of days.",
    'Earth orbit with fractional day highlighted.',
  ],
  [
    'Why does February get the extra day in the first place?',
    'Question mark over February strip.',
  ],
];

const research = researchOf({
  claims: [
    {
      id: 'c5',
      text: 'Under the Gregorian rule, 2000 was a leap year even though it was divisible by 100.',
      sources: ['https://a.example.com/5'],
    },
    {
      id: 'c6',
      text: 'Years such as 1700, 1800, and 1900 are common years in the Gregorian calendar.',
      sources: ['https://a.example.com/6'],
    },
    {
      id: 'c12',
      text: 'Julius Caesar’s calendar reform is usually dated to 46 BCE.',
      sources: ['https://a.example.com/12'],
    },
    {
      id: 'c13',
      text: 'The Julian reform was developed with advice from Sosigenes of Alexandria.',
      sources: ['https://a.example.com/13'],
    },
  ],
});
const known = new Set(research.claims.map((c) => c.id));

const row = (
  say: string,
  show: string,
  patch: Partial<EditorialRow> = {},
): EditorialRow => ({
  ...rowsOf([{ say, show, visual: 'why', act: 1 }], known)[0],
  ...patch,
});

describe('narration, never a stage direction', () => {
  it('finds the rows of a live run that read out their pictures, and no other', () => {
    const flagged = LEAP.flatMap(([say, show], k) =>
      directionIn({ say, show }, world) ? [k + 1] : [],
    );
    expect(flagged).toEqual([12, 13, 26]);
  });

  it('says why each is a direction', () => {
    expect(directionIn({ say: LEAP[25][0], show: LEAP[25][1] }, world)).toMatch(
      /"a-calendar-user" by an id/,
    );
    expect(
      directionIn(
        {
          say: 'Modern home office, the calendar waits on the wall.',
          show: 'A wall calendar.',
        },
        world,
      ),
    ).toMatch(/opens on "Modern home office," set down as a label/);
    expect(
      directionIn(
        { say: 'Soft afternoon light, the year turns.', show: 'A window.' },
        world,
      ),
    ).toMatch(/label/);
    expect(directionIn({ say: LEAP[11][0], show: LEAP[11][1] }, world)).toBe(
      'it reads out its own picture (bright, daylight)',
    );
  });

  it('never takes a quote card, a name card or a date for a direction', () => {
    for (const [say, show] of [
      [
        'Nobody lost any sleep over the ten lost days.',
        'Quote card: "Nobody lost any sleep over the ten lost days."',
      ],
      [
        'In 1582, Pope Gregory XIII tightened the rule.',
        'Name card: "Pope Gregory XIII".',
      ],
      ['Later, the council voted to keep the rule.', 'The council votes.'],
    ])
      expect(directionIn({ say, show }, world)).toBeNull();
  });

  it('says every id as its name, an article lower-cased mid-sentence', () => {
    expect(namedText(LEAP[25][0], world)).toBe(
      'Modern home office, a calendar user crosses out 1900, then circles 2000 in daylight.',
    );
    expect(namedText('a-calendar-user marks the day.', world)).toBe(
      'A calendar user marks the day.',
    );
    expect(namedText('Then pope-gregory-xiii signs.', world)).toBe(
      'Then Pope Gregory XIII signs.',
    );
    // Hyphenated words that are no one's id are left as they are.
    expect(namedText('A well-to-do 365-day year.', world)).toBe(
      'A well-to-do 365-day year.',
    );
    const [named] = withNames([row('Dates slide.', LEAP[5][1])], world);
    expect(named.show).toBe(
      'Modern home office, a calendar user moves month labels, soft afternoon light.',
    );
  });

  it('sends a direction back in the one revision, with its reason', () => {
    const problems = scriptProblems(
      [row(LEAP[12][0], LEAP[12][1], { claims: ['c12'] })],
      { research, pace: PLAIN_PACE, world },
    );
    expect(problems).toContainEqual(
      expect.stringMatching(
        /^Row 1 is a stage direction, not narration .*: it reads out its own picture \(unroll, tablet\)\. Say is only what the narrator speaks aloud/,
      ),
    );
  });

  it('after it, says a direction as the claim it rests on, else drops it: never voiced', () => {
    const rows = [
      row(LEAP[10][0], LEAP[10][1], { claims: ['c12', 'c13'], visual: 'who' }),
      // Its claim is said already, by the row before: dropped.
      row(LEAP[11][0], LEAP[11][1], { claims: ['c13'], visual: 'scene' }),
      // One of its claims no row says yet: said as that, its picture kept.
      row(LEAP[25][0], LEAP[25][1], { claims: ['c6', 'c5'], visual: 'scene' }),
      row(LEAP[22][0], LEAP[22][1], { claims: ['c6'], visual: 'when' }),
      // No claim at all: dropped.
      row('Dusk, the forum empties.', 'The Roman Forum at dusk.'),
    ];
    const { rows: out, fixed } = withoutDirections(rows, {
      research,
      pace: PLAIN_PACE,
      world,
    });
    expect(out.map((r) => r.say)).toEqual([
      LEAP[10][0],
      'Under the Gregorian rule, 2000 was a leap year even though it was divisible by 100.',
      LEAP[22][0],
    ]);
    expect(out[1]).toMatchObject({
      claims: ['c5'],
      visual: 'scene',
      show: 'Modern home office, a calendar user crosses out 1900, circles 2000, daylight.',
    });
    expect(fixed).toEqual([
      'row 2: a stage direction dropped',
      'row 3: a stage direction said as what it means',
      'row 5: a stage direction dropped',
    ]);
    expect(out.every((r) => !directionIn(r, world))).toBe(true);
  });

  it('mends every id into its name, silently', () => {
    const { rows, fixed } = mendRows([row('Dates slide.', LEAP[5][1])], {
      research,
      pace: PLAIN_PACE,
      world,
    });
    expect(rows[0].show).not.toContain('a-calendar-user');
    expect(fixed).toContain('row 1: an id said as its name');
  });

  it("tells a writer the world's people and places by their names, never their ids", () => {
    const told = describeWorld(
      worldOf({
        places: [{ name: 'Modern home office', kind: 'home' }],
        people: [{ name: 'A calendar user', role: 'keeps the calendar' }],
      }),
    );
    expect(told).toContain('- Modern home office (');
    expect(told).toContain('- A calendar user, keeps the calendar');
    expect(told).not.toMatch(/modern-home-office|a-calendar-user/);
  });
});
