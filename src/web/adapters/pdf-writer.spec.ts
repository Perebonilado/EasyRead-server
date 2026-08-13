import { PdfWriter, measure, wrap } from './pdf-writer';

describe('wrap', () => {
  it('breaks a line at the column width', () => {
    const lines = wrap(
      'one two three four five six seven eight',
      'regular',
      11,
      60,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measure(line, 'regular', 11)).toBeLessThanOrEqual(60);
    }
  });

  it('splits a single token wider than the column rather than overflowing', () => {
    const lines = wrap(
      'Pneumonoultramicroscopicsilicovolcanoconiosis',
      'regular',
      11,
      50,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(
      'Pneumonoultramicroscopicsilicovolcanoconiosis',
    );
  });

  it('keeps short text on one line', () => {
    expect(wrap('Thyroid gland', 'regular', 11, 400)).toEqual([
      'Thyroid gland',
    ]);
  });
});

describe('PdfWriter', () => {
  it('emits a parseable PDF with a cross-reference table', () => {
    const writer = new PdfWriter();
    writer.text('Posterior pituitary', { font: 'bold', size: 18 });
    const pdf = writer.build().toString('latin1');

    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('xref');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('starts a new page when the column is full', () => {
    const writer = new PdfWriter();
    for (let i = 0; i < 200; i++)
      writer.text(`Line ${i} of the simplified page.`);

    const pdf = writer.build().toString('latin1');
    expect(pdf.match(/\/Type \/Page[^s]/g)?.length ?? 0).toBeGreaterThan(1);
  });

  it('escapes characters that would otherwise close a PDF string', () => {
    const writer = new PdfWriter();
    writer.text('T3 (free) \\ T4');
    const pdf = writer.build().toString('latin1');

    expect(pdf).toContain('T3 \\(free\\) \\\\ T4');
  });

  it('stamps the watermark on every page when asked', () => {
    const writer = new PdfWriter('Made with EasyRead');
    for (let i = 0; i < 200; i++) writer.text(`Line ${i}.`);

    const pdf = writer.build().toString('latin1');
    const stamps = pdf.match(/Made with EasyRead/g)?.length ?? 0;
    expect(stamps).toBeGreaterThan(1);
  });
});
