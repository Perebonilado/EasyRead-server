import { PdfWriter, measure, tableRowsOf, wrap } from './pdf-writer';
import { decodeImage, encodePng } from './images/image-codec';

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

describe('code blocks', () => {
  it('keeps indentation and line structure', () => {
    const writer = new PdfWriter();
    writer.code('def f(x):\n    return x * 2\n\nprint(f(2))');
    const pdf = writer.build().toString('latin1');
    // Leading spaces survive: the indented line is set with its spaces.
    expect(pdf).toContain('(    return x * 2)');
    expect(pdf).toContain('(def f\\(x\\):)');
    // Courier is registered and used.
    expect(pdf).toContain('/BaseFont /Courier');
    expect(pdf).toContain('/F4 9 Tf');
  });

  it('breaks an over-wide line by character instead of reflowing', () => {
    const writer = new PdfWriter();
    writer.code(`const x = "${'a'.repeat(200)}";`);
    const pdf = writer.build().toString('latin1');
    // The continuation marker distinguishes a visual break from a newline.
    expect(pdf).toContain('\xbb ');
  });

  it('reports the page being written', () => {
    const writer = new PdfWriter();
    expect(writer.currentPage).toBe(1);
    writer.text('x', { size: 11 });
    writer.pageBreak();
    expect(writer.currentPage).toBe(2);
  });
});

describe('tables', () => {
  it('parses pipe rows and typesets header + cells with hairlines', () => {
    const writer = new PdfWriter();
    const rows = tableRowsOf('Name | Purpose\nrate limit | protects the API');
    expect(rows).toEqual([
      ['Name', 'Purpose'],
      ['rate limit', 'protects the API'],
    ]);
    writer.table(rows);
    const pdf = writer.build().toString('latin1');
    expect(pdf).toContain('(Name)');
    expect(pdf).toContain('(protects the API)');
    // The hairline rule ops made it into the content stream.
    expect(pdf).toMatch(/re f/);
  });

  it('survives ragged rows and empty text', () => {
    const writer = new PdfWriter();
    writer.table(tableRowsOf('A | B | C\nonly-one'));
    writer.table([]);
    expect(() => writer.build()).not.toThrow();
  });
});

describe('images', () => {
  it('embeds a PNG as a flate XObject with an smask, placed on the page', () => {
    const rgba = Buffer.alloc(4 * 4 * 4, 255);
    rgba[3] = 128; // one translucent pixel so an smask exists
    const decoded = decodeImage(encodePng(rgba, 4, 4));
    const writer = new PdfWriter();
    writer.text('Before', { size: 11 });
    writer.image(decoded, 'Figure 1 — a test card');
    const pdf = writer.build();
    const text = pdf.toString('latin1');
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('/SMask');
    expect(text).toContain('/Im0 Do');
    expect(text).toContain('(Figure 1 - a test card)');
    // The xref still parses: last line is %%EOF and startxref points inside.
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(
      text.split('startxref')[1].split('%%EOF')[0].trim(),
    );
    expect(pdf.subarray(startxref, startxref + 4).toString('latin1')).toBe(
      'xref',
    );
  });
});
