import {
  carryOver,
  describeNotes,
  drawnAsTheyAre,
  endingOf,
  firstSaid,
  joinDrafts,
  laterTerms,
  mendNotes,
  notesParts,
  notesProblems,
  pageSign,
  says,
  wordsPerMinute,
  type ChapterNotes,
  type NotesDraft,
} from './lesson-notes';
import type { SceneScript } from './scene-script';
import type { GatedDrawing } from './scene-svg';

const page = (
  n: number,
  extra: Partial<NotesDraft['pages'][number]> = {},
): NotesDraft['pages'][number] => ({
  page: n,
  relation: 'fresh',
  evidence: '',
  goal: `idea ${n}`,
  newHere: [],
  callback: null,
  points: [],
  lists: [],
  pitfall: null,
  check: null,
  handoff: null,
  endsOn: [],
  ...extra,
});

const chapter = (): ChapterNotes =>
  mendNotes(
    {
      thread: 'How one server grows to serve millions',
      example: 'a photo-sharing app',
      diagram: 'the system, a part at a time',
      pictures: [
        {
          name: 'Client',
          is: 'the app on a user’s device',
          draw: 'a laptop and a phone showing the app',
          person: false,
        },
        { name: 'User', is: 'a person', draw: 'a person', person: true },
        { name: 'client', is: 'twice', draw: 'again', person: false },
        { name: 'Nothing to draw', is: '', draw: '', person: false },
      ],
      pages: [
        page(10, {
          goal: 'why one server is not enough',
          newHere: ['web server'],
          handoff: 'so where does the data go?',
          endsOn: ['web server'],
        }),
        page(11, {
          relation: 'continues',
          evidence: 'the same system, a database added',
          goal: 'why the database moves to its own server',
          newHere: ['database'],
          callback: 'the web server, page 10',
          points: [
            { say: 'Recall the one server', show: 'web server', kind: 'hook' },
            { say: 'Data grows', show: 'database', kind: 'explain' },
            { say: 'Split them', show: 'arrow to database', kind: 'explain' },
            { say: 'Why it helps', show: 'scaling', kind: 'check' },
          ],
          check: 'Why split the database off?',
          handoff: 'but one database can fail',
          endsOn: ['web server', 'database'],
        }),
        page(12, { newHere: ['replication', 'Database'] }),
      ],
    },
    { topicId: 't1', from: 10, to: 12 },
  ).notes;

describe('the signs a page carries on from the one before', () => {
  it('sees a page that starts mid-sentence, says it is continued, or carries on a list', () => {
    expect(pageSign('The cache sits', 'in front of the database.')).toEqual({
      continues: true,
      why: 'it starts mid-sentence',
    });
    expect(pageSign('Limits', 'Limits (continued)\nMore')).toMatchObject({
      continues: true,
    });
    expect(
      pageSign('1. Speed\n2. Cost\n3. Size', '4. Safety\nIt matters.'),
    ).toEqual({
      continues: true,
      why: "it carries on the page before's numbered list at 4",
    });
  });

  it('takes a heading, a first page or a new list as a fresh start', () => {
    expect(pageSign('Done.', 'Caching\nA cache is...')).toEqual({
      continues: false,
      why: null,
    });
    expect(pageSign(null, 'in the middle')).toMatchObject({ continues: false });
    expect(pageSign('Intro.', '1. First\n2. Second')).toMatchObject({
      continues: false,
    });
    expect(pageSign('Intro.', 'a) the first option')).toMatchObject({
      continues: false,
    });
  });
});

describe('a chapter’s notes, made sound', () => {
  it('keeps one entry per page, fills a page the reader left out, and lets code’s signs win', () => {
    const { notes, mended } = mendNotes(
      {
        thread: 'x',
        example: null,
        diagram: null,
        pages: [
          page(1, { relation: 'nonsense' }),
          page(3, { relation: 'fresh' }),
          page(9),
        ],
      },
      { topicId: 't', from: 1, to: 3 },
      new Map([[3, { continues: true, why: 'it starts mid-sentence' }]]),
    );
    expect(notes.pages.map((p) => [p.page, p.relation])).toEqual([
      [1, 'fresh'],
      [2, 'fresh'],
      [3, 'continues'],
    ]);
    expect(notes.pages[2].evidence).toBe('it starts mid-sentence');
    expect(mended).toEqual([
      'page 2: not in the notes',
      'page 3: carries on (it starts mid-sentence)',
    ]);
  });

  it('leaves a page unmade only when the reason names a page with nothing to teach', () => {
    const { notes } = mendNotes(
      {
        thread: '',
        example: null,
        diagram: null,
        pages: [
          page(1, {
            relation: 'skip',
            evidence: 'the index',
            points: [{ say: 'a', show: 'b', kind: 'explain' }],
          }),
          page(2, { relation: 'skip', evidence: 'short page' }),
          page(3, { relation: 'skip', evidence: 'reference list; no lesson' }),
        ],
      },
      { topicId: 't', from: 1, to: 3 },
    );
    expect(notes.pages.map((p) => p.relation)).toEqual([
      'skip',
      'fresh',
      'skip',
    ]);
    expect(notes.pages[0].points).toEqual([]);
  });

  it('reads a long chapter in even parts, and joins them', () => {
    expect(notesParts(1, 45)).toEqual([
      { from: 1, to: 15 },
      { from: 16, to: 30 },
      { from: 31, to: 45 },
    ]);
    expect(notesParts(5, 9)).toEqual([{ from: 5, to: 9 }]);
    const joined = joinDrafts([
      { thread: 'a', example: null, diagram: null, pages: [page(1)] },
      { thread: 'b', example: 'e', diagram: null, pages: [page(2)] },
    ]);
    expect(joined.thread).toBe('a');
    expect(joined.example).toBe('e');
    expect(joined.pages.map((p) => p.page)).toEqual([1, 2]);
  });
});

describe('terms, in their time', () => {
  it('finds a term as whole words, and the terms taught after a page', () => {
    expect(says('Two databases share the load.', 'database')).toBe(true);
    expect(says('A databank', 'database')).toBe(false);
    const notes = chapter();
    expect(laterTerms(notes, 10)).toEqual([
      { term: 'database', page: 11 },
      { term: 'replication', page: 12 },
    ]);
    expect(laterTerms(notes, 12)).toEqual([]);
  });

  it('finds the sentence each new term is first said in', () => {
    const at = firstSaid(
      [
        { say: 'Start here.' },
        { say: 'A database keeps data.' },
        { say: 'The database again, and replication.' },
      ],
      ['database', 'replication', 'sharding'],
    );
    expect([...at]).toEqual([
      [1, ['database']],
      [2, ['replication']],
    ]);
  });
});

const script = (over: Partial<SceneScript> = {}): SceneScript => ({
  fit: 'good',
  fitReason: null,
  title: 't',
  mood: 'calm',
  beats: [
    { say: 'So the web server is busy.', pause: 'short', delivery: 'explain' },
    { say: 'Now the database moves out.', pause: 'short', delivery: 'key' },
  ],
  cast: [
    {
      id: 'server',
      kind: 'drawing',
      name: 'web server',
      brief: 'a rack server',
      motion: 'lights blink',
      parts: [{ name: 'disk', label: true }],
      states: [],
      shape: 'tall',
      sound: null,
    },
    {
      id: 'db',
      kind: 'drawing',
      name: 'database',
      brief: 'a cylinder',
      motion: 'sway',
      parts: [],
      states: [],
      shape: 'square',
      sound: null,
    },
  ],
  steps: [
    {
      at: { beat: 0, phrase: 'So the' },
      word: 0,
      stage: { layout: 'one', show: ['server'], arrows: [] },
      effects: [],
    },
    {
      at: { beat: 1, phrase: 'the database' },
      word: 1,
      stage: { layout: 'row', show: ['server', 'db'], arrows: [] },
      effects: [{ target: 'server', part: 'fan', do: 'point' }],
    },
  ],
  ...over,
});

const drawing = { svg: '<g/>' } as unknown as GatedDrawing;

describe('the page before, carried on', () => {
  it('keeps how a page ends: its last words, its stage, its drawings', () => {
    const ending = endingOf(
      script(),
      11,
      new Map([
        ['server', drawing],
        ['db', null],
      ]),
    );
    expect(ending.said).toBe(
      'So the web server is busy. Now the database moves out.',
    );
    expect(ending.show).toEqual(['server', 'db']);
    expect(Object.keys(ending.drawings)).toEqual(['server']);
  });

  it('uses the drawing made before for a thing brought back under its id, and drops a pointer at a part it lacks', () => {
    const ending = endingOf(script(), 11, new Map([['server', drawing]]));
    const next = script({
      cast: [
        { ...script().cast[0], brief: 'a different server', parts: [] },
        script().cast[1],
      ],
    } as Partial<SceneScript>);
    const carried = carryOver(next, ending);
    expect([...carried.reuse.keys()]).toEqual(['server']);
    const server = carried.script.cast[0];
    expect(server.kind === 'drawing' && server.brief).toBe('a rack server');
    expect(carried.script.steps[1].effects).toEqual([]);
    expect(carried.mended[0]).toBe(
      'server carried on from page 11, not drawn again',
    );
    expect(carryOver(next, null).reuse.size).toBe(0);
  });
});

describe('the notes, for the writer', () => {
  it('tells a carrying-on page not to start again, with the page before’s ending, its ideas and what comes later', () => {
    const notes = chapter();
    const ending = endingOf(script(), 10, new Map([['server', drawing]]));
    const told = describeNotes(notes, 11, ending);
    expect(told).toContain('carries straight on from the page before');
    expect(told).toContain('It left open: so where does the data go?');
    expect(told).toContain('Open on these same things, under the same ids');
    expect(told).toContain('"server": a drawing, name "web server"');
    expect(told).toContain('1. [hook] Recall the one server Show: web server.');
    expect(told).toContain('Ask the learner to recall it');
    expect(told).toContain('Why split the database off?');
    expect(told).toContain('replication (page 12)');
    expect(describeNotes(notes, 10)).toContain(
      'This is the first page of the chapter.',
    );
    expect(describeNotes(notes, 99)).toBe('');
  });
});

describe('what was written, held to the notes', () => {
  it('sends back a page whose stage changes less often than its ideas, or uses a later term early', () => {
    const notes = chapter();
    const { problems, points, shown } = notesProblems(
      script({
        beats: [
          { say: 'The web server.', pause: 'short', delivery: 'explain' },
          { say: 'Replication copies it.', pause: 'short', delivery: 'key' },
        ],
        steps: [script().steps[0]],
      }),
      notes,
      11,
      'The page text says nothing of it.',
    );
    expect(points).toBe(4);
    expect(shown).toBe(1);
    expect(problems.join(' ')).toContain('the stage changes only 1 times');
    expect(problems.join(' ')).toContain('Nothing on the stage shows');
    expect(problems.join(' ')).toContain('"replication", taught on page 12');
  });

  it('lets a later term stand when the page itself uses it', () => {
    const { problems } = notesProblems(
      script({
        beats: [
          { say: 'Replication, briefly.', pause: 'short', delivery: 'explain' },
        ],
      }),
      chapter(),
      11,
      'It mentions replication in passing.',
    );
    expect(problems.join(' ')).not.toContain('replication');
  });
});

it('measures words a minute over the time spoken', () => {
  expect(
    wordsPerMinute([
      { text: 'one two three four five', startMs: 0, endMs: 2000 },
      { text: 'six seven eight nine ten', startMs: 3000, endMs: 5000 },
    ]),
  ).toBe(150);
  expect(wordsPerMinute([])).toBe(0);
});

describe('things drawn as they really are', () => {
  const person = (id: string, name: string) =>
    ({
      id,
      kind: 'person',
      name,
      figure: {},
      state: null,
    }) as unknown as SceneScript['cast'][number];

  it('keeps each picture once, and tells the writer what each thing is', () => {
    const notes = chapter();
    expect(notes.pictures.map((p) => p.name)).toEqual(['Client', 'User']);
    expect(describeNotes(notes, 11)).toContain(
      'Client: the app on a user’s device; draw a laptop and a phone showing the app (never a person)',
    );
  });

  it('draws a "person" the notes call a machine as the machine, and keeps a real person', () => {
    const drawn = drawnAsTheyAre(
      script({
        cast: [person('client-2', 'Client 2'), person('user', 'User')],
        steps: [
          {
            at: { beat: 0, phrase: 'So the' },
            word: 0,
            stage: { layout: 'row', show: ['client-2', 'user'], arrows: [] },
            effects: [
              { target: 'client-2', part: 'head', do: 'point' },
              { target: 'client-2', part: null, do: 'pulse' },
            ],
          },
        ],
      }),
      chapter(),
    );
    const [client, user] = drawn.script.cast;
    expect(client.kind).toBe('drawing');
    expect(client.kind === 'drawing' && client.brief).toContain(
      'a laptop and a phone showing the app',
    );
    expect(user.kind).toBe('person');
    expect(drawn.script.steps[0].effects).toEqual([
      { target: 'client-2', part: null, do: 'pulse' },
    ]);
    expect(drawn.mended[0]).toContain('"Client 2" is the app');
    expect(drawnAsTheyAre(script(), null).mended).toEqual([]);
  });
});
