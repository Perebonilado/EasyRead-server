import {
  EMPTY_EDITOR,
  anglesOf,
  planOf,
  researchOf,
  worldOf,
  type StudioEditor,
} from './studio-editor';
import { editorialOf } from './studio-editorial';
import {
  editorDto,
  editorPlay,
  editorialDto,
  packageDto,
  planNext,
} from './studio-editor-views';

const research = researchOf({
  claims: [
    {
      id: 'c1',
      text: 'Ten days were skipped in 1582.',
      kind: 'date',
      confidence: 'high',
      sources: [{ url: 'https://a.example.com', title: 'A' }],
      status: 'verified',
    },
  ],
  timeline: [{ date: '1582', event: 'The reform', claims: ['c1'] }],
  myths: [{ belief: 'Leap years are Roman', truth: 'Partly', claims: [] }],
  searched: 14,
});
const editor: StudioEditor = {
  ...EMPTY_EDITOR,
  stage: 'world',
  question: 'Where did ten days go?',
  angles: anglesOf([
    {
      question: 'Where did ten days go?',
      pitch: 'Two sentences.',
      scores: { gap: 5, tension: 4, visual: 4, payoff: 5 },
    },
  ]),
  takeaway: 'Calendars are fixes for a sky that does not divide evenly.',
  research,
  plan: planOf(
    {
      spine: ['1', '2', '3', '4', '5', '6'],
      episodes: [
        {
          title: 'The lost days',
          question: 'Where did ten days go?',
          episodeId: 'e1',
        },
        { title: 'The rule of 400', question: 'Why skip a leap year?' },
      ],
      leftOut: ['The French republican calendar'],
    },
    research,
  ),
  world: worldOf({
    era: '1582',
    palette: [{ thing: 'the old calendar', token: 'chart1' }],
    held: { token: 'accent', for: 'the corrected date' },
    places: [{ name: 'Rome', kind: 'square' }],
    people: [
      {
        name: 'Clavius',
        role: 'astronomer',
        likeness: 'bearded, in a black robe',
      },
    ],
  }),
};

describe("the editor's views", () => {
  it('show nothing of a show the editor has not begun', () => {
    expect(editorDto(null)).toBeNull();
    expect(editorDto(EMPTY_EDITOR)).toBeNull();
  });

  it("show the show's question, research, plan and world", () => {
    const dto = editorDto(editor)!;
    expect(dto.stage).toBe('world');
    expect(dto.angles[0].total).toBe(18);
    expect(dto.research?.claims[0]).toMatchObject({
      id: 'c1',
      status: 'verified',
      sources: [{ url: 'https://a.example.com/', title: 'A' }],
    });
    expect(dto.research?.searched).toBe(14);
    expect(dto.plan?.episodes.map((e) => [e.number, e.episodeId])).toEqual([
      [1, 'e1'],
      [2, null],
    ]);
    expect(dto.world).toMatchObject({
      era: '1500–1800',
      palette: [{ thing: 'the old calendar', colour: 'chart1' }],
      held: { colour: 'accent', for: 'the corrected date' },
      people: [
        {
          id: 'clavius',
          name: 'Clavius',
          likeness: 'bearded, in a black robe',
        },
      ],
    });
  });

  it("offer the plan's episodes not begun as what comes next", () => {
    expect(planNext(editor)).toEqual(['Why skip a leap year?']);
    expect(planNext(null)).toEqual([]);
  });

  const editorial = editorialOf({
    number: 1,
    question: 'Where did ten days go?',
    stage: 'ready',
    beats: {
      acts: [
        { title: 'The drift', seconds: 60, words: 150 },
        { title: 'The fix', seconds: 90, words: 225 },
      ],
    },
    hook: 'In 1582, ten days vanished.',
    rows: [
      { say: 'One.', visual: 'when', show: 'x', claims: ['c1'], act: 1 },
      { say: 'Two.', visual: 'scene', show: 'y', act: 1 },
      { say: 'Three.', visual: 'why', show: 'z', act: 2 },
      { say: 'Four.', visual: 'why', show: 'w', act: 2 },
    ],
    facts: [
      { claim: 'c1', verdict: 'verified' },
      { claim: 'c1x', verdict: 'soften' },
    ],
    package: {
      title: 'The Ten Days That Never Happened',
      titles: [{ text: 'The Ten Days That Never Happened', verdict: 'best' }],
      thumbnail: { words: 'TEN DAYS GONE', row: 3 },
      description: 'Why leap years exist.',
      pinned: 'Which calendar fact surprised you?',
      hashtags: ['calendar'],
    },
  })!;
  const outline = [
    { seconds: 12, rows: [0, 0] as [number, number] },
    { seconds: 8, rows: [1, 1] as [number, number] },
    { seconds: 20, rows: [2, 3] as [number, number] },
  ];

  it("put the chapters at the acts, on the film's clock once made", () => {
    const made = [
      { id: 's1', position: 0, durationMs: 14_000, made: true },
      { id: 's2', position: 1, durationMs: 9_000, made: true },
      { id: 's3', position: 2, durationMs: 21_000, made: true },
    ];
    const pack = packageDto(editorial, outline, made)!;
    expect(pack.chapters).toEqual([
      { atMs: 0, title: 'The drift' },
      { atMs: 23_000, title: 'The fix' },
    ]);
    // The thumbnail's row is the second of the third scene's two: halfway through it.
    expect(pack.thumbnail).toEqual({
      words: 'TEN DAYS GONE',
      sceneId: 's3',
      atMs: 23_000 + 10_500,
    });
    // Before it is made, the planned seconds stand in.
    expect(packageDto(editorial, outline, [])!.chapters[1].atMs).toBe(20_000);
  });

  it('count what the fact check did', () => {
    const dto = editorialDto(editorial, outline, []);
    // Read back, the check's verdicts stand as they were kept.
    expect(dto.facts).toEqual({ checked: 2, softened: 1, cut: 0 });
    expect(dto.acts).toEqual([
      { title: 'The drift', seconds: 60 },
      { title: 'The fix', seconds: 90 },
    ]);
    expect(dto.rows[0]).toEqual({
      say: 'One.',
      visual: 'when',
      show: 'x',
      claims: ['c1'],
      act: 1,
    });
  });

  it("give the player an editor's next questions and package, and nothing otherwise", () => {
    const play = editorPlay(editor, editorial, outline, []);
    expect(play.next).toEqual(['Why skip a leap year?']);
    expect(play.package?.title).toBe('The Ten Days That Never Happened');
    expect(editorPlay(null, editorial, outline, [])).toEqual({});
  });
});
