import { Injectable } from '@nestjs/common';
import type {
  ExportRendererPort,
  ExportSection,
} from '../../business/ports/export-renderer.port';
import { PdfWriter } from './pdf-writer';

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
  async render(input: {
    title: string;
    sections: ExportSection[];
    watermark: boolean;
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
          default:
            pdf.text(block.text, { size: 11, leading: 17 });
            pdf.space(6);
        }
      }

      pdf.space(16);
    }

    return pdf.build();
  }
}
