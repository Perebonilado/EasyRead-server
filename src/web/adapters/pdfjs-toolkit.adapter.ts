import { Injectable, Logger } from '@nestjs/common';
import { EMPTY_PAGE_CHAR_THRESHOLD } from '../../business/domain/values';
import type {
  ExtractedPage,
  PdfToolkitPort,
} from '../../business/ports/pdf-toolkit.port';

/**
 * PDF reading via pdf.js.
 *
 * Imported lazily because pdfjs-dist evaluates browser globals at module load;
 * requiring it at the top of a Nest module breaks the bootstrap.
 */
@Injectable()
export class PdfjsToolkitAdapter implements PdfToolkitPort {
  private readonly logger = new Logger(PdfjsToolkitAdapter.name);
  private pdfjs: typeof import('pdfjs-dist') | null = null;

  private async lib() {
    if (!this.pdfjs) {
      this.pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    }
    return this.pdfjs;
  }

  private async load(pdf: Buffer) {
    const pdfjs = await this.lib();
    return pdfjs.getDocument({
      data: new Uint8Array(pdf),
      // Node has no worker; run on the main thread.
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
  }

  async pageCount(pdf: Buffer): Promise<number> {
    const doc = await this.load(pdf);
    const count = doc.numPages;
    await doc.destroy();
    return count;
  }

  async extractPages(pdf: Buffer): Promise<ExtractedPage[]> {
    const doc = await this.load(pdf);
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      // Group runs onto lines by baseline, and restore the spaces pdf.js drops
      // between runs by looking at the horizontal gap.
      type Part = { x: number; width: number; str: string };
      const rows: { y: number; height: number; parts: Part[] }[] = [];

      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const y = item.transform[5];
        const height = Math.abs(item.transform[3]) || 10;
        const row = rows.find(
          (r) => Math.abs(r.y - y) < Math.max(r.height, height) * 0.5,
        );
        const part = { x: item.transform[4], width: item.width, str: item.str };
        if (row) row.parts.push(part);
        else rows.push({ y, height, parts: [part] });
      }

      const text = rows
        .sort((a, b) => b.y - a.y) // PDF origin is bottom-left
        .map((row) => {
          const gap = row.height * 0.18;
          return row.parts
            .sort((a, b) => a.x - b.x)
            .reduce((line, part, index, parts) => {
              if (index === 0) return part.str;
              const previous = parts[index - 1];
              const distance = part.x - (previous.x + previous.width);
              const needsSpace =
                distance > gap && !/\s$/.test(line) && !/^\s/.test(part.str);
              return line + (needsSpace ? ' ' : '') + part.str;
            }, '')
            .replace(/[ \t]+/g, ' ')
            .trim();
        })
        .filter(Boolean)
        // Rejoin words split across a line break with a hyphen.
        .join('\n')
        .replace(/(\w)-\n(\w)/g, '$1$2');

      page.cleanup();
      const charCount = text.replace(/\s/g, '').length;
      pages.push({
        pageNumber,
        text,
        charCount,
        isEmpty: charCount < EMPTY_PAGE_CHAR_THRESHOLD,
      });
    }

    await doc.destroy();
    return pages;
  }

  /**
   * Deliberately not implemented.
   *
   * Rasterising a page needs a native canvas, and the one prebuilt backend
   * that installs cleanly here (`@napi-rs/canvas`) **segfaults** on real
   * documents — reproducibly on a lecture PDF with images, while rendering
   * simple ones fine. A native crash takes the whole worker process down and
   * with it every other document mid-pipeline, which is a catastrophic trade
   * for a decorative image.
   *
   * The library card generates its own cover from the document's type instead.
   * Returning null rather than throwing keeps that a caller's decision.
   */
  async renderThumbnail(): Promise<Buffer | null> {
    return null;
  }
}
