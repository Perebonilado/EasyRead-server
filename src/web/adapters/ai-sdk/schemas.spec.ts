import {
  blocksSchema,
  diagramClozeSchema,
  diagramSchema,
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

  it('previewSchema pins the four preview parts', () => {
    expect(
      previewSchema.safeParse({
        about: 'What the chapter covers.',
        outline: ['First movement', 'Second movement'],
        keyTerms: [{ term: 'Osmosis', gloss: 'Water crossing a membrane' }],
        howItEnds: 'It lands on the pump model.',
      }).success,
    ).toBe(true);
    // One outline line is not a road; the skim needs at least two.
    expect(
      previewSchema.safeParse({
        about: 'x',
        outline: ['only one'],
        keyTerms: [],
        howItEnds: 'x',
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
      }).success,
    ).toBe(true);
    expect(
      recallGradeSchema.safeParse({
        score: 1.2,
        nailed: [],
        missed: [],
        focus: [],
      }).success,
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
});
