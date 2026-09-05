import {
  blocksSchema,
  diagramClozeSchema,
  diagramSchema,
  lectureExtraSchema,
  lectureOutlineSchema,
  lectureBoardPlanSchema,
  lectureSegmentSchema,
  ocrPageSchema,
  previewSchema,
  questionCheckSchema,
  recallGradeSchema,
  sketchSchema,
  topicQuizSchema,
} from './schemas';

/**
 * The schema enum IS the capability: a block type missing here cannot be
 * emitted no matter what the prompt says — that is how the `table` block
 * silently never appeared. These tests pin every type both block schemas
 * must accept, so adding one to prompts without the schema fails loudly.
 */
describe('structured-output schemas', () => {
  const everyBlockType = [
    'headingOne',
    'headingTwo',
    'paragraph',
    'bullet',
    'code',
    'table',
    'math',
  ];

  it('blocksSchema accepts every block type the product renders', () => {
    for (const type of everyBlockType) {
      const parsed = blocksSchema.safeParse({
        blocks: [{ type, text: 'x' }],
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('ocrPageSchema accepts the same block types', () => {
    for (const type of everyBlockType) {
      const parsed = ocrPageSchema.safeParse({
        blocks: [{ type, text: 'x' }],
        handwritten: false,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('diagramSchema wants a title and a non-empty mermaid source', () => {
    expect(
      diagramSchema.safeParse({
        title: 'Cache states',
        mermaid: 'stateDiagram-v2',
      }).success,
    ).toBe(true);
    expect(diagramSchema.safeParse({ title: 'x', mermaid: '' }).success).toBe(
      false,
    );
  });

  it('diagramClozeSchema wants a "?" diagram with options and an answer', () => {
    expect(
      diagramClozeSchema.safeParse({
        title: 'The reflex arc',
        mermaid: 'flowchart LR\n  A[Stimulus] --> B["?"] --> C[Response]',
        options: ['Receptor', 'Effector', 'Synapse'],
        correctIndex: 0,
        explanation: 'The receptor senses the stimulus first.',
      }).success,
    ).toBe(true);
    expect(
      diagramClozeSchema.safeParse({
        title: 'x',
        mermaid: 'flowchart LR',
        options: ['a'],
        correctIndex: 0,
        explanation: 'e',
      }).success,
    ).toBe(false);
  });

  it('topicQuizSchema wants 2-3 questions with options and answers', () => {
    const q = {
      question: 'What comes after the bugfix phase?',
      options: ['security', 'alpha', 'feature'],
      correctIndex: 0,
      explanation: 'Security-only fixes follow bugfix support.',
    };
    expect(topicQuizSchema.safeParse({ questions: [q, q] }).success).toBe(true);
    expect(topicQuizSchema.safeParse({ questions: [q] }).success).toBe(false);
  });

  it('sketchSchema wants a title and a non-empty svg source', () => {
    expect(
      sketchSchema.safeParse({
        title: 'The eye',
        svg: '<svg viewBox="0 0 800 500"></svg>',
      }).success,
    ).toBe(true);
    expect(sketchSchema.safeParse({ title: 'x', svg: '' }).success).toBe(false);
  });

  it('previewSchema pins the preview parts, recall cues included', () => {
    const cues = [
      'How does it open?',
      'What gets compared?',
      'Where does it land?',
    ];
    expect(
      previewSchema.safeParse({
        about: 'What the chapter covers.',
        outline: ['First movement', 'Second movement'],
        keyTerms: [{ term: 'Osmosis', gloss: 'Water crossing a membrane' }],
        howItEnds: 'It lands on the pump model.',
        recallCues: cues,
      }).success,
    ).toBe(true);
    // One outline line is not a road; the skim needs at least two.
    expect(
      previewSchema.safeParse({
        about: 'x',
        outline: ['only one'],
        keyTerms: [],
        howItEnds: 'x',
        recallCues: cues,
      }).success,
    ).toBe(false);
    // Fewer than three cues is not a scaffold.
    expect(
      previewSchema.safeParse({
        about: 'x',
        outline: ['a', 'b'],
        keyTerms: [],
        howItEnds: 'x',
        recallCues: ['just one'],
      }).success,
    ).toBe(false);
  });

  it('recallGradeSchema bounds the score and allows empty lists', () => {
    expect(
      recallGradeSchema.safeParse({
        score: 0.7,
        nailed: ['The pump model'],
        missed: [],
        focus: [],
        nowCovered: [],
      }).success,
    ).toBe(true);
    expect(
      recallGradeSchema.safeParse({
        score: 1.2,
        nailed: [],
        missed: [],
        focus: [],
        nowCovered: [],
      }).success,
    ).toBe(false);
  });

  it('recallGradeSchema requires nowCovered, as whole-number indices', () => {
    const base = { score: 0.5, nailed: [], missed: [], focus: [] };
    // Absent entirely: the grader must always answer, even with [].
    expect(recallGradeSchema.safeParse(base).success).toBe(false);
    expect(
      recallGradeSchema.safeParse({ ...base, nowCovered: [0, 2] }).success,
    ).toBe(true);
    // Text would defeat the point — indices are what keep wording stable.
    expect(
      recallGradeSchema.safeParse({ ...base, nowCovered: ['idea'] }).success,
    ).toBe(false);
    expect(
      recallGradeSchema.safeParse({ ...base, nowCovered: [-1] }).success,
    ).toBe(false);
  });

  it('questionCheckSchema pins the three verdicts and rejects others', () => {
    for (const verdict of ['correct', 'partial', 'incorrect']) {
      expect(
        questionCheckSchema.safeParse({
          verdict,
          explanation: 'Because the document says so.',
          page: 3,
        }).success,
      ).toBe(true);
    }
    expect(
      questionCheckSchema.safeParse({
        verdict: 'maybe',
        explanation: 'x',
        page: 0,
      }).success,
    ).toBe(false);
  });

  it('lectureOutlineSchema pins the two page weights and wants the new-here line', () => {
    const beat = {
      pageNumber: 1,
      goal: 'g',
      callback: null,
      foreshadow: null,
      newHere: 'The one new thing',
      skip: null,
      moves: ['the problem', 'the mechanism'],
      moveBlocks: null,
      pitfall: null,
      turn: false,
      figure: { kind: 'none', shows: null },
    };
    const plan = (weight: string) => ({
      hook: 'h',
      arc: 'a',
      payoff: 'p',
      terms: [],
      problem: null,
      beats: [{ ...beat, weight }],
    });
    expect(lectureOutlineSchema.safeParse(plan('full')).success).toBe(true);
    expect(lectureOutlineSchema.safeParse(plan('light')).success).toBe(true);
    expect(lectureOutlineSchema.safeParse(plan('medium')).success).toBe(false);
    expect(
      lectureOutlineSchema.safeParse({
        ...plan('full'),
        beats: [
          {
            pageNumber: 1,
            goal: 'g',
            callback: null,
            foreshadow: null,
            skip: null,
            weight: 'full',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('lectureOutlineSchema wants one to four moves per beat', () => {
    const plan = (moves: string[]) => ({
      hook: 'h',
      arc: 'a',
      payoff: 'p',
      terms: [],
      problem: null,
      beats: [
        {
          pageNumber: 1,
          goal: 'g',
          callback: null,
          foreshadow: null,
          newHere: 'n',
          skip: null,
          weight: 'full',
          moves,
          moveBlocks: null,
          pitfall: null,
          turn: false,
          figure: { kind: 'none', shows: null },
        },
      ],
    });
    expect(lectureOutlineSchema.safeParse(plan(['one'])).success).toBe(true);
    expect(lectureOutlineSchema.safeParse(plan([])).success).toBe(false);
    expect(
      lectureOutlineSchema.safeParse(plan(['a', 'b', 'c', 'd', 'e'])).success,
    ).toBe(false);
  });

  it('lectureOutlineSchema wants the chapter terms, its problem, and a pitfall and turn per beat', () => {
    const beat = {
      pageNumber: 1,
      goal: 'g',
      callback: null,
      foreshadow: null,
      newHere: 'n',
      skip: null,
      weight: 'full',
      moves: ['m'],
      moveBlocks: null,
      pitfall: 'Mixing up the rate and the total',
      turn: true,
      figure: { kind: 'process', shows: 'the bucket refilling' },
    };
    const plan = {
      hook: 'h',
      arc: 'a',
      payoff: 'p',
      terms: [{ term: 'Refill rate', meaning: 'how fast tokens come back' }],
      problem: 'How do you stop a burst without stopping everyone?',
      beats: [beat],
    };
    expect(lectureOutlineSchema.safeParse(plan).success).toBe(true);
    expect(
      lectureOutlineSchema.safeParse({ ...plan, terms: undefined }).success,
    ).toBe(false);
    expect(
      lectureOutlineSchema.safeParse({
        ...plan,
        beats: [{ ...beat, turn: 'yes' }],
      }).success,
    ).toBe(false);
    expect(
      lectureOutlineSchema.safeParse({
        ...plan,
        terms: Array.from({ length: 9 }, () => plan.terms[0]),
      }).success,
    ).toBe(false);
  });

  it('lectureExtraSchema is one script, never empty', () => {
    expect(
      lectureExtraSchema.safeParse({ script: 'Words you will hear.' }).success,
    ).toBe(true);
    expect(lectureExtraSchema.safeParse({ script: '' }).success).toBe(false);
    expect(lectureExtraSchema.safeParse({ sections: [] }).success).toBe(false);
  });

  it('lectureSegmentSchema wants numbered sections, not one script', () => {
    expect(
      lectureSegmentSchema.safeParse({
        sections: [
          { move: 0, text: 'The problem.' },
          { move: 1, text: '[write 1] The mechanism.' },
        ],
      }).success,
    ).toBe(true);
    expect(lectureSegmentSchema.safeParse({ script: 'x' }).success).toBe(false);
    expect(lectureSegmentSchema.safeParse({ sections: [] }).success).toBe(
      false,
    );
  });

  it('lectureBoardPlanSchema wants a heading and lines that name their move', () => {
    expect(
      lectureBoardPlanSchema.safeParse({
        heading: 'Token bucket',
        lines: [
          {
            move: 0,
            kind: 'term',
            text: 'token bucket',
            meaning: 'holds fixed tokens, a request takes one',
            level: null,
            important: null,
          },
          {
            move: 1,
            kind: 'point',
            text: 'empty bucket: request dropped',
            meaning: null,
            level: 2,
            important: true,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      lectureBoardPlanSchema.safeParse({ heading: '', lines: [] }).success,
    ).toBe(false);
    expect(
      lectureBoardPlanSchema.safeParse({
        heading: 'x',
        lines: [{ move: 0, kind: 'note', text: 'y' }],
      }).success,
    ).toBe(false);
  });
});
