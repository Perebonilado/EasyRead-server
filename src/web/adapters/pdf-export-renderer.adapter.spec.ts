import { PdfExportRendererAdapter } from './pdf-export-renderer.adapter';
import type { ExportNote } from '../../business/ports/export-renderer.port';

/**
 * The appendix is the only part of an export that contains the reader's own
 * writing, so the things worth pinning down are that it appears, that it is
 * ordered by page rather than by when it was written, and that a document
 * with no notes is unchanged by the feature.
 */
const renderer = new PdfExportRendererAdapter();

const sections = [
  {
    pageNumber: 1,
    blocks: [{ type: 'paragraph' as const, text: 'The kidney concentrates.' }],
  },
];

const note = (over: Partial<ExportNote>): ExportNote => ({
  body: 'a note',
  pageNumber: null,
  quotedText: null,
  source: 'typed',
  ...over,
});

/** The writer emits uncompressed text operators, so the copy is readable. */
const textOf = (pdf: Buffer) => pdf.toString('latin1');

describe('PdfExportRendererAdapter', () => {
  it('prints the appendix after the document', async () => {
    const pdf = await renderer.render({
      title: 'Renal Physiology',
      sections,
      watermark: false,
      notes: [note({ body: 'ADH opens the tap', pageNumber: 12 })],
    });

    const text = textOf(pdf);
    expect(text).toContain('Your notes');
    expect(text).toContain('ADH opens the tap');
    expect(text).toContain('1 note you wrote while reading');
    // After the document, not before it.
    expect(text.indexOf('Your notes')).toBeGreaterThan(
      text.indexOf('The kidney concentrates'),
    );
  });

  it('orders notes by page and puts pageless ones last', async () => {
    const pdf = await renderer.render({
      title: 'Renal Physiology',
      sections,
      watermark: false,
      notes: [
        note({ body: 'about the whole thing', pageNumber: null }),
        note({ body: 'on twenty', pageNumber: 20 }),
        note({ body: 'on three', pageNumber: 3 }),
      ],
    });

    const text = textOf(pdf);
    expect(text.indexOf('on three')).toBeLessThan(text.indexOf('on twenty'));
    expect(text.indexOf('on twenty')).toBeLessThan(
      text.indexOf('about the whole thing'),
    );
    expect(text).toContain('About the document');
  });

  it('quotes the passage a note was written against', async () => {
    const pdf = await renderer.render({
      title: 'Renal Physiology',
      sections,
      watermark: false,
      notes: [
        note({
          body: 'check this later',
          pageNumber: 4,
          quotedText: 'the thick ascending limb',
          source: 'highlight',
        }),
      ],
    });

    const text = textOf(pdf);
    expect(text).toContain('the thick ascending limb');
    expect(text.indexOf('the thick ascending limb')).toBeLessThan(
      text.indexOf('check this later'),
    );
  });

  it('adds nothing at all when there are no notes', async () => {
    const withNone = await renderer.render({
      title: 'Renal Physiology',
      sections,
      watermark: false,
      notes: [],
    });
    const withoutField = await renderer.render({
      title: 'Renal Physiology',
      sections,
      watermark: false,
    });

    expect(textOf(withNone)).not.toContain('Your notes');
    expect(withNone.length).toBe(withoutField.length);
  });
});
