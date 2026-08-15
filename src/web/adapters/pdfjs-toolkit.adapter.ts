import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EMPTY_PAGE_CHAR_THRESHOLD } from '../../business/domain/values';
import type {
  ExtractedFigure,
  ExtractedPage,
  PdfToolkitPort,
} from '../../business/ports/pdf-toolkit.port';
import { encodePng } from './images/image-codec';

/** Filters that separate a figure from furniture. */
const MIN_FIGURE_EDGE = 100;
const MAX_ASPECT = 8;
const MAX_FIGURES_PER_PAGE = 3;
const MAX_FIGURES_PER_DOCUMENT = 40;

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

  /**
   * Embedded images per page, without rasterising anything.
   *
   * `getOperatorList` makes pdf.js decode each image XObject to raw pixels
   * on the page's object store — pure JS, no canvas, which matters here
   * because the one native canvas that installs cleanly segfaults (see
   * renderThumbnail above). The pixels are re-encoded as PNGs.
   *
   * Repeats are the enemy of usefulness: the same logo sits on every page of
   * a lecture deck. A content hash drops anything seen before.
   */
  async extractFigures(pdf: Buffer): Promise<ExtractedFigure[]> {
    const pdfjs = await this.lib();
    const doc = await this.load(pdf);
    const figures: ExtractedFigure[] = [];
    const seen = new Set<string>();

    try {
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        if (figures.length >= MAX_FIGURES_PER_DOCUMENT) break;
        let onThisPage = 0;

        try {
          const page = await doc.getPage(pageNumber);
          const ops = await page.getOperatorList();

          for (let i = 0; i < ops.fnArray.length; i++) {
            if (onThisPage >= MAX_FIGURES_PER_PAGE) break;
            if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;

            const args = ops.argsArray[i] as unknown[];
            const name = typeof args?.[0] === 'string' ? args[0] : '';
            if (!name) continue;
            const image = await new Promise<{
              width: number;
              height: number;
              data?: Uint8ClampedArray | Uint8Array;
              kind?: number;
            } | null>((resolve) => {
              try {
                if (page.objs.has(name)) {
                  page.objs.get(name, (value: never) => resolve(value));
                } else {
                  resolve(null);
                }
              } catch {
                resolve(null);
              }
            });

            if (!image?.data || !image.width || !image.height) continue;
            if (image.width < MIN_FIGURE_EDGE || image.height < MIN_FIGURE_EDGE)
              continue;
            const aspect = image.width / image.height;
            if (aspect > MAX_ASPECT || aspect < 1 / MAX_ASPECT) continue;

            const rgba = toRgba(image);
            if (!rgba) continue;

            const hash = createHash('sha1')
              .update(
                Buffer.from(
                  image.data.buffer,
                  image.data.byteOffset,
                  image.data.byteLength,
                ),
              )
              .digest('hex');
            if (seen.has(hash)) continue;
            seen.add(hash);

            figures.push({
              pageNumber,
              width: image.width,
              height: image.height,
              png: encodePng(rgba, image.width, image.height),
            });
            onThisPage += 1;
          }

          page.cleanup();
        } catch (error) {
          this.logger.warn(
            `Figures on page ${pageNumber} skipped: ${(error as Error).message}`,
          );
        }
      }
    } finally {
      await doc.destroy();
    }

    return figures;
  }
}

/**
 * pdf.js image kinds → RGBA. 1 = packed 1-bit greyscale, 2 = RGB, 3 = RGBA.
 * Anything else (or an ImageBitmap-only image) is skipped rather than
 * guessed at.
 */
function toRgba(image: {
  width: number;
  height: number;
  data?: Uint8ClampedArray | Uint8Array;
  kind?: number;
}): Buffer | null {
  const { width, height, data, kind } = image;
  if (!data) return null;
  const out = Buffer.alloc(width * height * 4);

  if (kind === 3 || data.length === width * height * 4) {
    Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(out);
    return out;
  }
  if (kind === 2 || data.length === width * height * 3) {
    for (let i = 0; i < width * height; i++) {
      out[i * 4] = data[i * 3];
      out[i * 4 + 1] = data[i * 3 + 1];
      out[i * 4 + 2] = data[i * 3 + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  if (kind === 1) {
    const rowBytes = Math.ceil(width / 8);
    if (data.length < rowBytes * height) return null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const value = bit ? 255 : 0;
        const at = (y * width + x) * 4;
        out[at] = value;
        out[at + 1] = value;
        out[at + 2] = value;
        out[at + 3] = 255;
      }
    }
    return out;
  }
  return null;
}
