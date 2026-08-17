import {
  blocksSchema,
  diagramSchema,
  ocrPageSchema,
  sketchSchema,
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

  it('sketchSchema wants a title and a non-empty svg source', () => {
    expect(
      sketchSchema.safeParse({
        title: 'The eye',
        svg: '<svg viewBox="0 0 800 500"></svg>',
      }).success,
    ).toBe(true);
    expect(sketchSchema.safeParse({ title: 'x', svg: '' }).success).toBe(false);
  });
});
