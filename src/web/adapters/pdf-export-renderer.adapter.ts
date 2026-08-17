import { Injectable } from '@nestjs/common';
import type {
  ExportNote,
  ExportRendererPort,
  ExportSection,
} from '../../business/ports/export-renderer.port';
import { PdfWriter, tableRowsOf } from './pdf-writer';
import { decodeImage } from './images/image-codec';

const WATERMARK = 'Made with EasyRead — easyread.app';

/**
 * Typesets simplified text as a PDF (§4.8).
 *
 * The layout mirrors the reader's own type scale so an export doesn't read as
 * a different document from the one on screen: the same heading hierarchy, the
 * same generous leading, the same bullet treatment.
 */
@Injectable()
export class PdfExportRendererAdapter implements ExportRendererPort {
  /**
   * The reader's own notes, printed after the document.
   *
   * Ordered by page rather than by when they were written, so the appendix
   * can be read alongside the chapters it belongs to; notes with no page —
   * taken in a lesson, or about the document as a whole — come last under
   * their own heading rather than being filed under a page they never had.
   */
  private appendNotes(pdf: PdfWriter, notes: ExportNote[]): void {
    if (!notes.length) return;

    const ordered = [...notes].sort((a, b) => {
      if (a.pageNumber === b.pageNumber) return 0;
      if (a.pageNumber === null) return 1;
      if (b.pageNumber === null) return -1;
      return a.pageNumber - b.pageNumber;
    });

    pdf.pageBreak();
    pdf.text('Your notes', { font: 'bold', size: 22, leading: 28 });
    pdf.space(4);
    pdf.text(
      `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} you wrote while reading`,
      { font: 'italic', size: 11, grey: 0.45 },
    );
    pdf.space(20);

    let headed = false;
    for (const note of ordered) {
      if (note.pageNumber === null && !headed) {
        headed = true;
        pdf.space(10);
        pdf.text('About the document', {
          font: 'bold',
          size: 13,
          leading: 18,
        });
        pdf.space(6);
      }

      if (note.pageNumber !== null) {
        pdf.text(`Page ${note.pageNumber}`, {
          font: 'regular',
          size: 9,
          grey: 0.55,
        });
        pdf.space(3);
      }

      if (note.quotedText) {
        pdf.text(`“${note.quotedText}”`, {
          font: 'italic',
          size: 10,
          leading: 15,
          indent: 12,
          grey: 0.4,
        });
        pdf.space(4);
      }

      // Paragraph breaks the reader typed are kept — a note is quoted, not
      // reflowed.
      for (const paragraph of note.body.split(/\n{2,}/)) {
        pdf.text(paragraph, { size: 11, leading: 17 });
        pdf.space(4);
      }

      pdf.space(14);
    }
  }

  async render(input: {
    title: string;
    sections: ExportSection[];
    watermark: boolean;
    notes?: ExportNote[];
  }): Promise<Buffer> {
    const pdf = new PdfWriter(input.watermark ? WATERMARK : null);

    pdf.text(input.title, { font: 'bold', size: 24, leading: 30 });
    pdf.space(6);
    pdf.text('Simplified with EasyRead', {
      font: 'italic',
      size: 11,
      grey: 0.45,
    });
    pdf.space(24);

    let lastTopic: string | undefined;

    for (const section of input.sections) {
      // Topic headings are printed once at the boundary rather than on every
      // page, so a 20-page chapter doesn't repeat its own title 20 times.
      if (section.topicTitle && section.topicTitle !== lastTopic) {
        pdf.space(14);
        pdf.text(section.topicTitle, { font: 'bold', size: 17, leading: 22 });
        pdf.space(6);
        lastTopic = section.topicTitle;
      }

      pdf.text(`Page ${section.pageNumber}`, {
        font: 'regular',
        size: 9,
        grey: 0.55,
      });
      pdf.space(4);

      for (const block of section.blocks) {
        switch (block.type) {
          case 'headingOne':
            pdf.space(10);
            pdf.text(block.text, { font: 'bold', size: 16, leading: 21 });
            pdf.space(4);
            break;
          case 'headingTwo':
            pdf.space(8);
            pdf.text(block.text, { font: 'bold', size: 13, leading: 18 });
            pdf.space(3);
            break;
          case 'bullet':
            pdf.text(`•  ${block.text}`, { size: 11, leading: 17, indent: 14 });
            pdf.space(2);
            break;
          case 'code':
            pdf.space(4);
            pdf.code(block.text);
            pdf.space(6);
            break;
          case 'math':
            // No LaTeX typesetting in the PDF pipeline — the raw LaTeX in
            // the monospace well is the honest fallback, same as notes.
            pdf.space(4);
            pdf.code(block.text);
            pdf.space(6);
            break;
          case 'table':
            pdf.space(6);
            pdf.table(tableRowsOf(block.text));
            pdf.space(6);
            break;
          default:
            pdf.text(block.text, { size: 11, leading: 17 });
            pdf.space(6);
        }
      }

      for (const figure of section.figures ?? []) {
        try {
          pdf.image(decodeImage(figure.bytes), figure.caption);
        } catch {
          // An undecodable stored figure is dropped, not fatal.
        }
      }

      pdf.space(16);
    }

    this.appendNotes(pdf, input.notes ?? []);

    return pdf.build();
  }
}
