import { cleanMarkdown } from './mistral-ocr.adapter';

describe('cleanMarkdown', () => {
  it('drops image placeholders that point at files never fetched', () => {
    const cleaned = cleanMarkdown(
      '# Title\n\n![img-0.jpeg](img-0.jpeg)\n\nReal text here.',
    );
    expect(cleaned).not.toContain('![');
    expect(cleaned).toContain('Real text here.');
  });

  it('strips scanner watermark lines', () => {
    const cleaned = cleanMarkdown(
      'The lens capsule thickens with age.\n\nScanned with CamScanner',
    );
    expect(cleaned).toBe('The lens capsule thickens with age.');
  });

  it('collapses the blank-line craters left by removals', () => {
    const cleaned = cleanMarkdown('One.\n\n![a](a)\n\n\n\nTwo.');
    expect(cleaned).toBe('One.\n\nTwo.');
  });

  it('keeps headings, pipes and lists intact', () => {
    const table = '| Branch | Status |\n| --- | --- |\n| main | active |';
    expect(cleanMarkdown(table)).toBe(table);
  });
});
