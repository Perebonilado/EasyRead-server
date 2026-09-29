/**
 * The screenwriting rules (studio-screenwriting.md), each a check by code:
 * the premise's parts (P1–P8), the cast against it (C1, C2), the beats'
 * links and luck (B1, B2, B4, B7), the scene plan's setup, values, starts
 * and links (S1–S7), lines as moves (W2–W11, C4), the timed opening (W1),
 * the clarity sentence against the premise (T1, T3, T4), the whole-film
 * retell (T2), and planted things handled on screen with an insert (K5).
 *
 * The fixtures are the New York opening of the research note (§6): the
 * film Richard could not follow, and the same opening done properly.
 */
import {
  aimOf,
  beatOf,
  bibleOf,
  outlineOf,
  storySheetOf,
  type StorySheet,
} from './studio';
import {
  beatSheetOf,
  checkCastForPremise,
  checkCatalyst,
  checkHeighten,
  checkLinks,
  checkPlan,
  checkPremise,
  isAbstractWant,
  premiseOf,
  scenePlanOf,
  spineFault,
  type Persona,
  type StudioStory,
} from './studio-story';
import {
  BAR,
  RUBRIC_KEYS,
  checkOpening,
  checkPlantsHandled,
  facesFor,
  insertsFor,
  judgeColdRead,
  lintLines,
  lintTelling,
  plantsOfScene,
  retellNotes,
  retellOf,
  scenesToRewrite,
  tableReadOf,
  unclear,
  type ColdRead,
} from './studio-script';

const bible = bibleOf({
  characters: [
    {
      id: 'dara',
      name: 'Dara',
      voice: 'woman',
      role: 'main',
      figure: { age: 'adult' },
    },
    {
      id: 'petrov',
      name: 'Mrs. Petrov',
      voice: 'old woman',
      role: 'supporting',
      figure: { age: 'old' },
    },
    {
      id: 'pigeon',
      name: 'Pigeon',
      kind: 'animal',
      voice: 'creature',
      role: 'supporting',
      animal: { species: 'pigeon', coat: 'grey' },
    },
  ],
  sets: [{ id: 'stoop', name: 'Brownstone stoop' }],
});

/** The premise as the new fields hold it (§6). */
const rawPremise = {
  title: 'Shiny Things',
  logline:
    "Dara must get her keys back from a pigeon and the rent under Mrs. Petrov's door before midnight, or she loses the flat.",
  theme: 'what we give away to get home',
  hook: 'A pigeon on a fire escape, her key ring in its beak.',
  genre: 'dark-comedy',
  ending: 'happy',
  stakes: 'she loses the flat',
  tools: ['ticking clock: midnight'],
  gag: 'the pigeon always wants something shinier',
  hero: 'dara',
  want: "get back into her flat and slide the rent envelope under Mrs. Petrov's door",
  obstacle: "a pigeon has her keys and won't let go",
  clock: 'midnight, when the locksmith Mrs. Petrov booked changes the lock',
  normalDay:
    'Dara comes home late from her shift and feeds the fire-escape pigeons her crusts',
  whyToday: 'tonight the rent is due, and one pigeon has taken her keys',
  whyCare: "she's the only one in the building who feeds them",
  oddity: {
    what: 'this pigeon trades',
    rule: 'it gives up what it holds for anything shinier, and only shinier',
  },
  spine: [
    'Once upon a time there was a nurse named Dara who rented the top flat from strict Mrs. Petrov.',
    'Every day she came home after midnight and fed the fire-escape pigeons her crusts.',
    'Until one day, with the rent due by midnight, a pigeon snatched her keys.',
    'Because of that she offered bread, but it only wanted things that shine.',
    'Because of that she traded up, but it always wanted something shinier.',
    'Until finally she gave it the glitter hair clip her niece made her, and the keys dropped into her hand.',
    "Ever since then the pigeon has been sitting on Mrs. Petrov's sill, wearing the clip.",
  ],
};
const premise = premiseOf(rawPremise);

const line = (
  who: string,
  to: string | null,
  say: string,
  aim: string | null,
  extra: Record<string, unknown> = {},
) => ({
  kind: 'line',
  who,
  to,
  say,
  aim,
  feeling: 'neutral',
  from: 'here',
  ...extra,
});
const act = (
  kind: 'action' | 'business',
  who: string,
  say: string,
  extra: Record<string, unknown> = {},
) => ({ kind, who, say, ...extra });

const sheetOf = (beats: unknown[], onStage = ['dara', 'petrov', 'pigeon']) =>
  storySheetOf({
    title: 'The stoop',
    set: 'stoop',
    time: 'night',
    onStage: onStage.map((who, k) => ({
      who,
      spot: ['left', 'centre', 'right'][k],
      pose: 'standing',
      face: 'neutral',
      holding: who === 'dara' ? 'bread' : null,
    })),
    props: [{ prop: 'bell', near: 'dara' }],
    beats,
  });

/** Scene 1 done properly (§6): the want, the obstacle, the clock and the oddity landed by people, actions and things. */
const good = sheetOf([
  act('business', 'dara', 'Dara tosses a crust up to the fire escape.', {
    do: 'throw',
    thing: 'bread',
    target: '@up',
  }),
  act('action', 'dara', 'Dara pats one pocket, then the other.', {
    do: 'look',
    target: '@down',
  }),
  { kind: 'reaction', who: 'dara', feeling: 'surprised' },
  act(
    'action',
    'pigeon',
    'The pigeon on the rail holds her keys in its beak.',
    {
      do: 'look',
      target: 'dara',
    },
  ),
  line(
    'petrov',
    'dara',
    "Envelope under my door by midnight. The locksmith's booked for five past. He's already paid.",
    'warns',
  ),
  line(
    'dara',
    'petrov',
    "It's upstairs. On my table. With your name on it in glitter pen.",
    'bargains',
  ),
  line('petrov', 'dara', 'Then go upstairs.', 'dodges'),
  { kind: 'pause', seconds: 1 },
  line('dara', 'pigeon', 'Crust for the keys?', 'bargains'),
  act('business', 'dara', 'Dara holds up the roll.', {
    do: 'raise',
    thing: 'bread',
  }),
  act('action', 'pigeon', "The pigeon's head follows the shine of the bell.", {
    do: 'look',
    target: 'bell',
  }),
  line('dara', 'pigeon', "You're not hungry. You're shopping.", 'accuses'),
  act('business', 'dara', 'Dara takes up her bike bell.', {
    do: 'take',
    thing: 'bell',
  }),
]);

/** The opening Richard could not follow (§6): the time narrated, lines that report the picture. */
const bad = sheetOf(
  [
    { kind: 'narration', say: '11:52 p.m.' },
    line('dara', null, "It's 11:52. Door's locked. That's fine.", null),
    act('action', 'pigeon', 'A pigeon on the railing holds keys.', {
      do: 'look',
      target: 'dara',
    }),
    { kind: 'narration', say: '11:55 p.m.' },
  ],
  ['dara', 'pigeon'],
);

const beatsRaw = [
  {
    role: 'setup',
    what: 'Dara comes home and feeds the pigeons her crusts.',
    intensity: 2,
    plants: [{ id: 'bike-bell', what: 'bike bell' }],
    link: null,
  },
  {
    role: 'inciting',
    what: 'A pigeon snatches her keys as the rent falls due.',
    intensity: 4,
    link: 'but',
  },
  {
    role: 'attempt',
    what: 'She offers bread; the pigeon wants something shinier.',
    intensity: 5,
    link: 'therefore',
  },
  {
    role: 'relief',
    what: 'Mrs. Petrov snores at the window.',
    intensity: 3,
    link: 'but',
  },
  {
    role: 'attempt',
    what: 'She trades the bike bell; the pigeon wants something shinier still.',
    intensity: 6,
    pays: ['bike-bell'],
    link: 'therefore',
  },
  {
    role: 'turn',
    what: 'She finds the glitter hair clip.',
    intensity: 5,
    link: 'but',
  },
  {
    role: 'climax',
    what: 'Dara trades the clip for the keys as midnight strikes.',
    intensity: 9,
    link: 'therefore',
  },
  {
    role: 'resolution',
    what: "The pigeon wears the clip on Mrs. Petrov's sill.",
    intensity: 3,
    link: 'therefore',
  },
];

/** Scene 1's setup, each part by its means. */
const setup0 = [
  {
    part: 'want',
    how: 'line',
    by: 'dara',
    to: 'pigeon',
    what: 'Crust for the keys?',
  },
  {
    part: 'obstacle',
    how: 'action',
    by: 'pigeon',
    to: '',
    what: 'the pigeon holds her keys in its beak',
  },
  {
    part: 'stakes',
    how: 'line',
    by: 'petrov',
    to: 'dara',
    what: "The locksmith's booked for five past.",
  },
  {
    part: 'clock',
    how: 'line',
    by: 'petrov',
    to: 'dara',
    what: 'Envelope under my door by midnight.',
  },
  {
    part: 'oddity',
    how: 'action',
    by: 'pigeon',
    to: '',
    what: 'its head follows the shine of the bell',
  },
];

const planRaw = {
  scenes: [
    {
      title: 'The stoop',
      beats: [0, 1],
      purpose: 'the setup',
      conflict: 'Dara wants her keys but the pigeon will not let go',
      turn: 'she learns it only trades for shine',
      shift: 'tired to alarmed',
      moment: 'the pigeon following the shine',
      set: 'stoop',
      cast: ['dara', 'petrov', 'pigeon'],
      seconds: 45,
      summary: 'Dara finds a pigeon has her keys.',
      setup: setup0,
      value: { name: 'home', from: '+', to: '-' },
      start: 'Dara pats her pockets on the stoop: no keys',
      link: null,
    },
    {
      title: 'Trading up',
      beats: [2, 3, 4, 5, 6, 7],
      purpose: 'the attempts and the climax',
      conflict: 'Dara wants the keys, but the pigeon wants shinier',
      turn: 'the keys drop into her hand',
      shift: 'panic to relief',
      moment: 'the clip on the pigeon',
      set: 'stoop',
      cast: ['dara', 'pigeon'],
      seconds: 60,
      summary: 'Dara trades up until the clip wins the keys.',
      setup: [],
      value: { name: 'home', from: '-', to: '+' },
      start: 'Dara holds out her bike bell',
      link: 'therefore',
    },
  ],
};

const story: StudioStory = {
  premise,
  beats: beatSheetOf({ beats: beatsRaw }, 'medium'),
  plan: scenePlanOf(planRaw),
};
const outline = outlineOf({
  title: 'Shiny Things',
  logline: premise.logline,
  scenes: story.plan.scenes.map((s) => ({
    title: s.title,
    summary: s.summary,
    set: s.set,
    cast: s.cast,
    seconds: s.seconds,
  })),
  story,
});

describe('the premise and its parts (P1–P8)', () => {
  it('passes the New York premise done properly', () => {
    expect(checkPremise(premise, bible)).toEqual([]);
  });

  it('keeps its parts from what the writer sent, and none from an older premise', () => {
    expect(premise.hero).toBe('dara');
    expect(premise.oddity?.rule).toMatch(/shinier/);
    expect(premiseOf({ title: 'Old', logline: 'x' })).toMatchObject({
      hero: '',
      want: '',
      clock: '',
      oddity: null,
      spine: [],
    });
    expect(
      premiseOf({ ...rawPremise, clock: 'none', oddity: { what: 'none' } }),
    ).toMatchObject({ clock: '', oddity: null });
  });

  it('asks for each part that is missing, and never without the cast', () => {
    const empty = premiseOf({
      title: 'T',
      logline: rawPremise.logline,
      stakes: 's',
      hook: 'h',
      tools: ['t'],
    });
    const found = checkPremise(empty, bible).join(' ');
    expect(found).toMatch(/whose story it is/);
    expect(found).toMatch(/Say the want/);
    expect(found).toMatch(/Say the obstacle/);
    expect(found).toMatch(/normalDay/);
    expect(found).toMatch(/whyToday/);
    expect(found).toMatch(/spine/);
    expect(found).toMatch(/whyCare/);
    expect(checkPremise(empty).join(' ')).not.toMatch(/whose story|want|spine/);
  });

  it('sends back a hero who is not a main character, and a logline without the hero or the shape', () => {
    expect(
      checkPremise(premiseOf({ ...rawPremise, hero: 'petrov' }), bible).join(
        ' ',
      ),
    ).toMatch(/"petrov" is not a main character/);
    expect(
      checkPremise(
        premiseOf({
          ...rawPremise,
          logline: 'A funny night in a city full of pigeons and rent.',
        }),
        bible,
      ).join(' '),
    ).toMatch(/Dara must \[a goal we can see achieved\]/);
  });

  it('sends back a want that is only a feeling (P3)', () => {
    expect(isAbstractWant('to be accepted')).toBe(true);
    expect(isAbstractWant('respect and happiness')).toBe(true);
    expect(isAbstractWant('to finally feel respected')).toBe(true);
    expect(isAbstractWant('get her keys back from the pigeon')).toBe(false);
    expect(
      checkPremise(
        premiseOf({ ...rawPremise, want: 'to be accepted' }),
        bible,
      ).join(' '),
    ).toMatch(/is a feeling/);
  });

  it('sends back a "today" that only says the ordinary day again (P4), and an oddity with no rule (P5)', () => {
    const found = checkPremise(
      premiseOf({
        ...rawPremise,
        whyToday: 'Dara comes home late from her shift and feeds the pigeons',
        oddity: { what: 'this pigeon trades', rule: '' },
      }),
      bible,
    ).join(' ');
    expect(found).toMatch(/only says the ordinary day again/);
    expect(found).toMatch(/Give the oddity \("this pigeon trades"\) its rule/);
  });

  it('holds the spine to its openers, in order, "Because of that" as often as needed (P6)', () => {
    expect(spineFault(rawPremise.spine)).toBeNull();
    expect(spineFault([])).toBe('no spine');
    expect(
      spineFault([
        'Once upon a time',
        'Until one day',
        'Every day',
        'Because of that',
        'Until finally',
        'Ever since then',
      ]),
    ).toMatch(/not in the order/);
    expect(
      spineFault([
        'Once upon a time',
        'Every day',
        'Then one day',
        'Because of that',
        'Until finally',
        'Ever since then',
      ]),
    ).toMatch(/sentence 3/);
  });
});

describe('the cast against the premise (C1, C2)', () => {
  const persona = (
    want: string,
    relationships: Persona['relationships'] = [],
  ): Persona => ({
    want,
    need: '',
    flaw: 'too tired to argue',
    fear: '',
    personality: ['counts her change twice'],
    voice: 'short sentences',
    habits: [],
    relationships,
    arc: { from: '', to: '' },
  });

  it("passes a hero whose want is the premise's, and a rival in the way who wants something of the hero", () => {
    const withRival = premiseOf({
      ...rawPremise,
      obstacle: 'Mrs. Petrov will change the lock at midnight',
    });
    expect(
      checkCastForPremise(
        withRival,
        bible,
        new Map([
          [
            'dara',
            persona(
              'slide the rent envelope under the door and get back into her flat',
            ),
          ],
          [
            'petrov',
            persona('the rent on time', [
              {
                with: 'dara',
                is: 'her landlady, calls her "Miss Dara"',
                tension: 'rent',
              },
            ]),
          ],
        ]),
      ),
    ).toEqual([]);
  });

  it('sends back a hero wanting something else, and someone in the way who wants nothing and is nothing to the hero', () => {
    const withRival = premiseOf({
      ...rawPremise,
      obstacle: 'Mrs. Petrov will change the lock at midnight',
    });
    const found = checkCastForPremise(
      withRival,
      bible,
      new Map([
        ['dara', persona('to win a baking contest')],
        ['petrov', persona('')],
      ]),
    ).join(' ');
    expect(found).toMatch(
      /Dara's want \("to win a baking contest"\) is not the premise's want/,
    );
    expect(found).toMatch(/say what Mrs. Petrov wants/);
    expect(found).toMatch(/say what they are to Dara/);
  });
});

describe('the beats: therefore or but, the catalyst early, no luck, the gag heightened (B1, B2, B4, B7)', () => {
  it('passes the New York beats', () => {
    const sheet = beatSheetOf({ beats: beatsRaw }, 'medium');
    expect(checkLinks(sheet)).toEqual([]);
    expect(checkCatalyst(sheet)).toEqual([]);
    expect(checkHeighten(sheet, premise)).toEqual([]);
  });

  it('reads the links as written, and "and then" as none', () => {
    const sheet = beatSheetOf(
      {
        beats: [
          { what: 'a', link: 'Therefore' },
          { what: 'b', link: 'and then' },
          { what: 'c', link: 'BUT' },
        ],
      },
      'short',
    );
    expect(sheet.beats.map((b) => b.link)).toEqual(['therefore', null, 'but']);
  });

  it('sends back beats with no link, all "therefore", or four "therefore" in a row', () => {
    const none = beatSheetOf(
      { beats: beatsRaw.map((b) => ({ ...b, link: 'and then' })) },
      'medium',
    );
    expect(checkLinks(none).join(' ')).toMatch(
      /Beats 2, 3, 4, 5, 6, 7, 8 have no link/,
    );
    const all = beatSheetOf(
      {
        beats: beatsRaw.map((b, k) => ({ ...b, link: k ? 'therefore' : null })),
      },
      'medium',
    );
    const found = checkLinks(all).join(' ');
    expect(found).toMatch(/put a "but" in/);
    expect(found).toMatch(/four times in a row/);
  });

  it('sends back a problem that comes late, and a climax saved by luck', () => {
    const late = beatSheetOf(
      {
        beats: [
          { role: 'setup', what: 'a', intensity: 2 },
          { role: 'setup', what: 'b', intensity: 2, link: 'therefore' },
          { role: 'inciting', what: 'c', intensity: 4, link: 'but' },
          {
            role: 'climax',
            what: 'Luckily a passer-by finds the keys.',
            intensity: 9,
            link: 'but',
          },
        ],
      },
      'medium',
    );
    const found = checkCatalyst(late).join(' ');
    expect(found).toMatch(/The problem comes too late \(beat 3\)/);
    expect(found).toMatch(/saved by luck \("Luckily"\)/);
  });

  it('asks a comedy to bring its running gag back in two beats or more', () => {
    const flat = beatSheetOf(
      {
        beats: beatsRaw.map((b) => ({ ...b, what: 'Something else happens.' })),
      },
      'medium',
    );
    expect(checkHeighten(flat, premise).join(' ')).toMatch(/shows in no beat/);
    expect(checkHeighten(flat, { ...premise, genre: 'drama' })).toEqual([]);
  });
});

describe('the scene plan: setup, values, starts and links (S1–S7)', () => {
  const opts = { premise, minutes: 2, bible };

  it('passes the New York plan', () => {
    expect(checkPlan(story.plan, story.beats, opts)).toEqual([]);
  });

  it('reads a setup, a value and a link as written', () => {
    const plan = scenePlanOf({
      scenes: [
        {
          title: 'A',
          summary: 's',
          setup: [
            { part: 'Want', how: 'narrator', by: null, to: null, what: 'x' },
            { part: 'want', how: 'line', what: 'again' },
            { part: 'mood', how: 'line', what: 'no such part' },
          ],
          value: { name: 'safe', from: 'positive', to: 'negative' },
          link: 'But',
        },
      ],
    });
    const [scene] = plan.scenes;
    expect(scene.setup).toEqual([
      { part: 'want', how: 'narration', by: '', to: '', what: 'x' },
    ]);
    expect(scene.value).toEqual({ name: 'safe', from: '+', to: '-' });
    expect(scene.link).toBe('but');
  });

  it('sends back a scene 1 whose setup is missing parts or narrated, too short, too crowded', () => {
    const plan = scenePlanOf({
      scenes: [
        {
          ...planRaw.scenes[0],
          seconds: 15,
          cast: ['dara', 'petrov', 'pigeon', 'extra'],
          setup: [
            {
              part: 'want',
              how: 'narration',
              what: 'NARRATOR: Dara wants in.',
            },
          ],
        },
        planRaw.scenes[1],
      ],
    });
    const found = checkPlan(plan, story.beats, opts).join(' ');
    expect(found).toMatch(/no entry for obstacle, stakes, clock, oddity/);
    expect(found).toMatch(/gives want to the narrator/);
    expect(found).toMatch(/Scene 1 is 15 seconds: .* 25 seconds or more/);
    expect(found).toMatch(/Scene 1 has 4 people/);
  });

  it('sends back a line in the setup said by someone not in scene 1', () => {
    const plan = scenePlanOf({
      scenes: [
        {
          ...planRaw.scenes[0],
          setup: setup0.map((p) =>
            p.part === 'clock' ? { ...p, by: 'locksmith' } : p,
          ),
        },
        planRaw.scenes[1],
      ],
    });
    expect(checkPlan(plan, story.beats, opts).join(' ')).toMatch(
      /clock is a line said by "locksmith" to "dara": both are in scene 1's cast/,
    );
  });

  it('sends back a value that does not flip, a start that is an arrival, a scene with no link, and three newcomers at once', () => {
    const plan = scenePlanOf({
      scenes: [
        planRaw.scenes[0],
        {
          ...planRaw.scenes[1],
          cast: ['dara', 'ana', 'bo', 'cy'],
          value: { name: 'home', from: '-', to: '-' },
          start: 'Dara arrives at the corner shop',
          link: 'and then',
        },
      ],
    });
    const found = checkPlan(plan, story.beats, opts).join(' ');
    expect(found).toMatch(/starts and ends "-" on home: nothing flips/);
    expect(found).toMatch(/starts with an arrival or a hello/);
    expect(found).toMatch(/Scene 2 has no link/);
    expect(found).toMatch(/brings in 3 people we have not met/);
  });

  it('holds a plan made before these rules only to the old ones', () => {
    const old = scenePlanOf({
      scenes: planRaw.scenes.map((scene) =>
        Object.fromEntries(
          Object.entries(scene).filter(
            ([key]) => !['setup', 'value', 'start', 'link'].includes(key),
          ),
        ),
      ),
    });
    expect(checkPlan(old, story.beats)).toEqual([]);
  });
});

describe('lines that do things (W2–W11, C4)', () => {
  it('passes scene 1 done properly', () => {
    expect(
      lintLines([good], bible, { genre: 'dark-comedy', minutes: 2 }),
    ).toEqual([]);
  });

  it("flags Richard's opening: a line with no aim, said to no one while the pigeon is there", () => {
    const found = lintLines([bad], bible, { genre: 'dark-comedy', minutes: 2 })
      .map((n) => `${n.kind}: ${n.message}`)
      .join(' ');
    expect(found).toMatch(
      /aim: Lines with no aim: beat 2: "It's 11:52\. Door's locked\. That's fine\."/,
    );
    expect(found).toMatch(/aim: Lines said to no one while others are there/);
    // And the telling lint: the time narrated, the picture reported.
    const told = lintTelling([bad], bible)
      .map((n) => n.message)
      .join(' ');
    expect(told).toMatch(/the narration announces the time/);
  });

  it('flags the deadline first said as anything but a threat, a warning or a bargain', () => {
    const sheet = sheetOf([
      line('petrov', 'dara', 'The rent is due at midnight.', 'reveals'),
    ]);
    expect(
      lintLines([sheet], bible)
        .map((n) => n.message)
        .join(' '),
    ).toMatch(
      /the deadline is first said as "The rent is due at midnight\." \(reveals\)/,
    );
  });

  it('flags the same aim three times running from one speaker', () => {
    const sheet = sheetOf([
      line('dara', 'pigeon', 'Give them back.', 'orders'),
      line('pigeon', 'dara', 'Coo.', 'refuses'),
      line('dara', 'pigeon', 'Now.', 'orders'),
      { kind: 'reaction', who: 'pigeon', feeling: 'neutral' },
      line('dara', 'pigeon', 'I said now.', 'orders'),
    ]);
    expect(
      lintLines([sheet], bible)
        .map((n) => n.message)
        .join(' '),
    ).toMatch(/Dara orders three times running/);
  });

  it('flags "as you know", a feeling said outright, a hello to open on, long lines and three lines running', () => {
    const long =
      'I have been standing out here on these cold steps for what feels like an hour and a half at the very least';
    const sheet = sheetOf([
      line('dara', 'petrov', 'Hello, Mrs. Petrov!', 'asks'),
      line('dara', 'petrov', "As you know, the rent's in my flat.", 'reveals'),
      line('dara', 'petrov', "I'm so nervous about the lock.", 'confesses'),
      line('petrov', 'dara', long, 'accuses'),
      line('petrov', 'dara', `${long} again`, 'accuses'),
    ]);
    const found = lintLines([sheet], bible)
      .map((n) => n.message)
      .join(' ');
    expect(found).toMatch(/opens on a hello/);
    expect(found).toMatch(/tells Mrs\. Petrov what they already know/);
    expect(found).toMatch(/says the feeling outright/);
    expect(found).toMatch(/2 lines over twenty words/);
    expect(found).toMatch(/Dara has three lines running/);
  });

  it('keeps a feeling said in a thought, and a moral ending said at the end', () => {
    const sheet = sheetOf([
      line('dara', null, "I'm so tired.", 'confesses', { from: 'thought' }),
    ]);
    expect(
      lintLines([sheet], bible)
        .map((n) => n.message)
        .join(' '),
    ).not.toMatch(/outright/);
    const moral = sheetOf([
      line('dara', 'pigeon', "I'm so happy you came back.", 'confesses'),
    ]);
    expect(
      lintLines([moral], bible, { ending: 'moral' })
        .map((n) => n.message)
        .join(' '),
    ).not.toMatch(/outright/);
  });

  it('in a comedy, flags a joke with no take and anyone remarking on how absurd it is', () => {
    const sheet = sheetOf([
      line('dara', 'pigeon', 'You take cards?', 'jokes'),
      line('petrov', 'dara', 'This is insane.', 'accuses'),
    ]);
    const found = lintLines([sheet], bible, { genre: 'comedy' })
      .map((n) => n.message)
      .join(' ');
    expect(found).toMatch(/the joke "You take cards\?" has no take/);
    expect(found).toMatch(/remarks on how strange it is/);
    expect(
      lintLines([sheet], bible, { genre: 'drama' })
        .map((n) => n.message)
        .join(' '),
    ).not.toMatch(/no take|remarks on/);
  });

  it('flags a film ending on a lesson, never a moral ending', () => {
    const last = sheetOf([
      line('dara', 'pigeon', "And that's why you never feed pigeons.", 'jokes'),
      { kind: 'reaction', who: 'pigeon', feeling: 'happy' },
    ]);
    expect(
      lintLines([good, last], bible)
        .map((n) => n.message)
        .join(' '),
    ).toMatch(/ends on a summary/);
    expect(
      lintLines([good, last], bible, { ending: 'moral' })
        .map((n) => n.message)
        .join(' '),
    ).not.toMatch(/ends on a summary/);
  });

  it('flags a fourth speaking face in a film of two minutes', () => {
    expect(facesFor(2)).toBe(3);
    expect(facesFor(4)).toBe(4);
    const four = bibleOf({
      characters: ['a', 'b', 'c', 'd'].map((id) => ({
        id,
        name: id.toUpperCase(),
        voice: 'woman',
        role: 'main',
      })),
    });
    const sheet = storySheetOf({
      set: 'stoop',
      onStage: ['a', 'b', 'c', 'd'].map((who, k) => ({
        who,
        spot: ['left', 'centre-left', 'centre-right', 'right'][k],
      })),
      beats: ['a', 'b', 'c', 'd'].map((who) =>
        line(who, 'a', 'Mine.', 'refuses'),
      ),
    });
    expect(
      lintLines([sheet], four, { minutes: 2 })
        .map((n) => n.message)
        .join(' '),
    ).toMatch(/D is the 4th person to speak/);
  });
});

describe('the opening, timed (W1, S1)', () => {
  it('passes scene 1 done properly: every part lands by its time', () => {
    expect(checkOpening(good, story, bible, 2)).toEqual([]);
  });

  it("flags every part Richard's opening never gave", () => {
    const found = checkOpening(bad, story, bible, 2).join(' ');
    expect(found).toMatch(
      /By about 25 seconds into scene 1, nothing said or shown gives what the hero wants/,
    );
    // The pigeon is seen with the keys: what is in the way is on screen.
    expect(found).not.toMatch(/what stands in their way/);
    expect(found).toMatch(/what they lose if they fail/);
    expect(found).toMatch(
      /By about 40 seconds.*the one impossible thing working/,
    );
    expect(found).toMatch(
      /as the plan has it, a line from dara to pigeon: "Crust for the keys\?"/,
    );
  });

  it('counts only what comes before the time: a want said a minute in is late', () => {
    const slow = sheetOf([
      ...Array.from({ length: 10 }, () =>
        act('action', 'dara', 'Dara paces the stoop.', {
          do: 'walk',
          spot: 'left',
        }),
      ),
      ...good.beats,
    ]);
    expect(checkOpening(slow, story, bible, 2).join(' ')).toMatch(
      /what the hero wants/,
    );
  });

  it('asks nothing of a story developed before the premise had its parts', () => {
    const old = {
      ...story,
      premise: premiseOf({ title: 'Old', logline: 'x' }),
    };
    expect(checkOpening(bad, old, bible, 2)).toEqual([]);
  });
});

describe('the clarity sentence against the premise (T1, T3, T4)', () => {
  const viewer = (over: Partial<ColdRead> = {}): ColdRead => ({
    about: 'A tired nurse locked out by a pigeon that stole her keys.',
    sentence:
      "Dara wants her keys back so she can get the rent under her landlady's door, but a pigeon has them, by midnight or the lock is changed.",
    who: 'Dara',
    wants: "her keys back, to get the rent under her landlady's door",
    obstacle: "the pigeon won't give the keys back",
    stakes: 'the lock is changed',
    clock: 'midnight',
    confused: [],
    sure: 8,
    people: [{ who: 'the woman at the window', is: 'her landlady' }],
    impossible: 'the pigeon trades the keys for anything shinier',
    ...over,
  });

  it('passes a viewer who got it', () => {
    expect(judgeColdRead(viewer(), premise, bible)).toEqual({
      misses: [],
      unsure: [],
    });
  });

  it('misses the wrong hero, a want or an obstacle they could not tell', () => {
    const judged = judgeColdRead(
      viewer({
        who: 'Mrs. Petrov',
        wants: 'could not tell',
        obstacle: 'the traffic',
      }),
      premise,
      bible,
    );
    expect(judged.misses.join(' ')).toMatch(/took it for Mrs\. Petrov's story/);
    expect(judged.misses.join(' ')).toMatch(
      /said the hero wants "could not tell"/,
    );
    expect(judged.misses.join(' ')).toMatch(
      /what is in the way is "the traffic"/,
    );
  });

  it('is unsure of the clock, the impossible thing and who someone is', () => {
    const judged = judgeColdRead(
      viewer({
        clock: '',
        impossible: '',
        people: [{ who: 'the woman at the window', is: 'could not tell' }],
      }),
      premise,
      bible,
    );
    expect(judged.misses).toEqual([]);
    expect(judged.unsure).toHaveLength(3);
  });

  it('puts the film below the clarity floor for any miss, or for two things unsure, whatever the critic scored', () => {
    const critic = {
      scores: Object.fromEntries(RUBRIC_KEYS.map((k) => [k, 8])),
      overall: 8,
      scenes: [],
    };
    expect(
      unclear(tableReadOf(critic, 2, viewer(), { misses: [], unsure: [] })),
    ).toBe(false);
    const missed = tableReadOf(critic, 2, viewer(), {
      misses: ['wrong hero'],
      unsure: [],
    });
    expect(missed.scores.clarity).toBe(BAR.clarity - 1);
    expect(missed.overall).toBe(BAR.clarity - 1);
    expect(
      unclear(
        tableReadOf(critic, 2, viewer({ confused: ['who the man is'] }), {
          misses: [],
          unsure: ['no clock'],
        }),
      ),
    ).toBe(true);
    expect(
      unclear(
        tableReadOf(critic, 2, viewer(), { misses: [], unsure: ['no clock'] }),
      ),
    ).toBe(false);
  });

  it('asks nothing of a premise developed before it had its parts', () => {
    expect(
      judgeColdRead(
        viewer({ who: 'Mrs. Petrov' }),
        premiseOf({ title: 'Old' }),
        bible,
      ),
    ).toEqual({
      misses: [],
      unsure: [],
    });
  });
});

describe('the whole film, retold (T2)', () => {
  it('notes each join the viewer could only make with "and then", and a climax they took for another', () => {
    const retell = retellOf(
      {
        scenes: [
          { scene: 1, link: '', what: 'A pigeon takes her keys.' },
          { scene: 2, link: 'and then', what: 'She rings a bell at it.' },
          { scene: 9, link: 'but', what: 'out of range' },
        ],
        finally: 'the landlady opens the door for her',
        about: 'a lockout',
      },
      2,
    )!;
    expect(retell.scenes.map((s) => s.link)).toEqual([null, 'and then']);
    const notes = retellNotes(retell, story, outline, bible);
    expect(notes.map((n) => n.scene)).toEqual([1, 1]);
    expect(notes[0].message).toMatch(
      /could only join scene 1 to scene 2 with "and then"/,
    );
    expect(notes[1].message).toMatch(
      /took the climax to be "the landlady opens the door for her"/,
    );
  });

  it('writes again a scene the viewer could not join, when the read is below the bar', () => {
    const read = tableReadOf(
      {
        scores: { clarity: 8 },
        overall: 6,
        scenes: [
          { scene: 1, score: 8 },
          { scene: 2, score: 8 },
        ],
      },
      2,
    );
    expect(scenesToRewrite(read)).toEqual([]);
    expect(
      scenesToRewrite(read, [
        { scene: 1, kind: 'retell', message: 'and then' },
      ]),
    ).toEqual([1]);
  });
});

describe('planted things handled on screen, with an insert for the camera (K5)', () => {
  it('finds the bike bell planted in scene 1, handled there, and asks for a close shot of it', () => {
    const plants = plantsOfScene(story, outline, bible, 0);
    expect(plants.map((p) => p.plant.id)).toEqual(['bike-bell']);
    expect(checkPlantsHandled(story, [good], outline, bible)).toEqual([]);
    expect(insertsFor(good, plants, bible)).toEqual([
      { beat: 12, thing: 'bell' },
    ]);
  });

  it('notes a planted thing only talked about', () => {
    const talked = sheetOf([
      line('dara', 'pigeon', 'Not the bike bell.', 'refuses'),
    ]);
    expect(
      checkPlantsHandled(story, [talked], outline, bible)[0].message,
    ).toMatch(
      /"bike bell" is planted here for later: let someone handle it on screen/,
    );
  });

  it('keeps the inserts on the sheet, and drops one past its beats', () => {
    const kept: StorySheet = storySheetOf({
      ...good,
      inserts: [
        { beat: 12, thing: 'bell' },
        { beat: 99, thing: 'moon' },
      ],
    });
    expect(kept.inserts).toEqual([{ beat: 12, thing: 'bell' }]);
    expect(
      storySheetOf({ ...good, inserts: undefined }).inserts,
    ).toBeUndefined();
  });
});

describe("a line's aim", () => {
  it('is one of the list, read from the verb a writer used, and only on a line', () => {
    expect(aimOf('warns')).toBe('warns');
    expect(aimOf('Bargain')).toBe('bargains');
    expect(aimOf('teasing')).toBe('teases');
    expect(aimOf('explains')).toBeNull();
    expect(aimOf(null)).toBeNull();
    expect(
      beatOf(line('dara', 'pigeon', 'Crust for the keys?', 'bargains'))?.aim,
    ).toBe('bargains');
    expect(
      beatOf({ kind: 'reaction', who: 'dara', aim: 'warns' })?.aim,
    ).toBeUndefined();
    // A sheet written before aims reads as it was.
    expect(beatOf(line('dara', 'pigeon', 'Hm.', null))).not.toHaveProperty(
      'aim',
    );
  });
});
