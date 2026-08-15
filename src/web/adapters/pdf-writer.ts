/**
 * A minimal PDF writer.
 *
 * Exports are plain typeset text — headings, paragraphs, bullets — so a
 * headless browser or a full typesetting engine would be a large dependency
 * (and, for Chromium, a large attack surface) to lay out what amounts to a
 * single column of prose. This emits the PDF directly using the base-14 fonts
 * every reader already has, which keeps exports fast and the deployment small.
 *
 * Deliberately not a general PDF library: no images, no tables, no embedded
 * fonts. If exports ever need those, this is the piece to replace.
 */

import type { DecodedImage } from './images/image-codec';

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 64;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export type FontName = 'regular' | 'bold' | 'italic' | 'mono';

const FONT_KEY: Record<FontName, string> = {
  regular: 'F1',
  bold: 'F2',
  italic: 'F3',
  mono: 'F4',
};

/** Base-14 Helvetica advance widths, in 1/1000 em, for the ASCII range. */
const WIDTHS_REGULAR = buildWidths(
  '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278',
  '556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556',
  '1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778',
  '667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556',
  '333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556',
  '556 556 333 500 278 556 500 722 500 500 500 334 260 334 584',
);

const WIDTHS_BOLD = buildWidths(
  '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278',
  '556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611',
  '975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778',
  '667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556',
  '333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611',
  '611 611 389 556 333 611 556 778 556 556 500 389 280 389 584',
);

function buildWidths(...rows: string[]): number[] {
  return rows.join(' ').split(/\s+/).map(Number);
}

function widthOf(char: string, font: FontName): number {
  // Courier is fixed-pitch: every glyph advances 600/1000 em.
  if (font === 'mono') return 600;
  const code = char.charCodeAt(0);
  if (code < 32 || code > 126) return font === 'bold' ? 556 : 500;
  const table = font === 'bold' ? WIDTHS_BOLD : WIDTHS_REGULAR;
  return table[code - 32] ?? 500;
}

/** `table` block text → rows: lines of " | "-separated cells. */
export function tableRowsOf(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
}

export function measure(text: string, font: FontName, size: number): number {
  let total = 0;
  for (const char of text) total += widthOf(char, font);
  return (total / 1000) * size;
}

/** Greedy wrap. Words longer than the line are broken rather than overflowing. */
export function wrap(
  text: string,
  font: FontName,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, font, size) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);

    if (measure(word, font, size) <= maxWidth) {
      line = word;
      continue;
    }

    // A single unbreakable token wider than the column: split it by character.
    let piece = '';
    for (const char of word) {
      if (measure(piece + char, font, size) > maxWidth) {
        lines.push(piece);
        piece = char;
      } else {
        piece += char;
      }
    }
    line = piece;
  }

  if (line) lines.push(line);
  return lines;
}

/** PDF string literals escape backslashes and parentheses. */
function escapeText(text: string): string {
  return text.replace(/[\\()]/g, (char) => `\\${char}`);
}

/** Non-Latin-1 characters have no glyph in the base-14 fonts. */
function toLatin1(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, (char) => {
    const replacements: Record<string, string> = {
      '‘': "'",
      '’': "'",
      '“': '"',
      '”': '"',
      '–': '-',
      '—': '-',
      '…': '...',
      '•': '-',
      ' ': ' ',
    };
    return replacements[char] ?? '?';
  });
}

interface TextOp {
  text: string;
  font: FontName;
  size: number;
  x: number;
  y: number;
  grey?: number;
}

/** A thin filled rectangle — the table's hairlines. */
interface RuleOp {
  rule: true;
  x: number;
  y: number;
  width: number;
  grey: number;
}

/** A placed figure, referencing an entry in the writer's image list. */
interface ImageOp {
  image: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type Op = TextOp | RuleOp | ImageOp;

/**
 * Accumulates text into pages, then serialises the whole file.
 *
 * Layout is single-pass and top-down: callers push blocks, the cursor
 * advances, and a new page starts when it runs out of room.
 */
export class PdfWriter {
  private readonly pages: Op[][] = [];
  private readonly images: DecodedImage[] = [];
  private current: Op[] = [];
  private cursor = MARGIN;

  constructor(private readonly watermark: string | null = null) {
    this.pages.push(this.current);
  }

  get contentWidth(): number {
    return CONTENT_WIDTH;
  }

  /** 1-based number of the page currently being written. */
  get currentPage(): number {
    return this.pages.length;
  }

  private newPage(): void {
    this.current = [];
    this.pages.push(this.current);
    this.cursor = MARGIN;
  }

  /** Reserves vertical space, breaking to a new page when it doesn't fit. */
  private reserve(height: number): void {
    if (this.cursor + height > PAGE_HEIGHT - MARGIN) this.newPage();
  }

  /**
   * Starts the next block on a fresh page.
   *
   * No-op when the current page is still empty, so a caller that breaks
   * before every section doesn't open the document with a blank sheet.
   */
  pageBreak(): void {
    if (this.current.length === 0) return;
    this.newPage();
  }

  space(amount: number): void {
    this.cursor = Math.min(this.cursor + amount, PAGE_HEIGHT - MARGIN);
  }

  text(
    raw: string,
    options: {
      font?: FontName;
      size?: number;
      leading?: number;
      indent?: number;
      grey?: number;
    } = {},
  ): void {
    const font = options.font ?? 'regular';
    const size = options.size ?? 11;
    const leading = options.leading ?? size * 1.45;
    const indent = options.indent ?? 0;

    const lines = wrap(toLatin1(raw), font, size, CONTENT_WIDTH - indent);
    for (const line of lines) {
      this.reserve(leading);
      this.current.push({
        text: line,
        font,
        size,
        x: MARGIN + indent,
        y: PAGE_HEIGHT - this.cursor - size,
        grey: options.grey,
      });
      this.cursor += leading;
    }
  }

  /**
   * A block of code, verbatim.
   *
   * `text()` collapses whitespace when it wraps, which for code is
   * destruction: indentation is meaning. Each source line is set as its own
   * line in Courier with leading spaces kept, and a line wider than the
   * column is broken by character with a gutter marker rather than reflowed.
   */
  code(raw: string): void {
    const size = 9;
    const leading = 13;
    const indent = 10;

    for (const sourceLine of raw.replace(/\t/g, '  ').split('\n')) {
      const line = toLatin1(sourceLine.replace(/\s+$/, ''));
      const pieces: string[] = [];
      let piece = '';
      for (const char of line) {
        if (measure(piece + char, 'mono', size) > CONTENT_WIDTH - indent) {
          pieces.push(piece);
          piece = char;
        } else {
          piece += char;
        }
      }
      pieces.push(piece);

      pieces.forEach((text, index) => {
        this.reserve(leading);
        this.current.push({
          // Continuation lines carry a marker so a broken line cannot be
          // mistaken for a real newline in the source.
          text: index === 0 ? text : `\u00bb ${text}`,
          font: 'mono',
          size,
          x: MARGIN + indent,
          y: PAGE_HEIGHT - this.cursor - size,
          grey: 0.25,
        });
        this.cursor += leading;
      });
    }
  }

  /**
   * A table, typeset as aligned columns with hairlines.
   *
   * Column widths are shared out by each column's longest natural line, so a
   * "Name | Description" table gives the prose the room. Cells wrap inside
   * their column; a row is kept together and moves to the next page whole.
   */
  table(rows: string[][]): void {
    if (!rows.length) return;
    const size = 9;
    const leading = 13;
    const gutter = 8;
    const columns = Math.max(...rows.map((row) => row.length));
    if (columns === 0) return;

    // Natural width of each column, then normalised into the content width.
    const natural = Array.from({ length: columns }, (_, column) =>
      Math.max(
        24,
        ...rows.map((row) =>
          measure(toLatin1(row[column] ?? ''), 'regular', size),
        ),
      ),
    );
    const available = CONTENT_WIDTH - gutter * (columns - 1);
    const total = natural.reduce((sum, width) => sum + width, 0);
    const widths = natural.map((width) =>
      Math.max(30, (width / total) * available),
    );

    rows.forEach((row, rowIndex) => {
      const font: FontName = rowIndex === 0 ? 'bold' : 'regular';
      const cells = Array.from({ length: columns }, (_, column) =>
        wrap(toLatin1(row[column] ?? ''), font, size, widths[column]),
      );
      const height =
        Math.max(...cells.map((lines) => lines.length), 1) * leading;

      // The whole row moves together; a row split across pages is unreadable.
      if (height < PAGE_HEIGHT - MARGIN * 2) this.reserve(height + 4);

      let x = MARGIN;
      cells.forEach((lines, column) => {
        lines.forEach((line, lineIndex) => {
          this.current.push({
            text: line,
            font,
            size,
            x,
            y: PAGE_HEIGHT - this.cursor - size - lineIndex * leading,
            grey: rowIndex === 0 ? 0.1 : 0.2,
          });
        });
        x += widths[column] + gutter;
      });
      this.cursor += height + 4;

      // Hairline under the header, and a fainter one under each row.
      this.current.push({
        rule: true,
        x: MARGIN,
        y: PAGE_HEIGHT - this.cursor + 2,
        width: CONTENT_WIDTH,
        grey: rowIndex === 0 ? 0.55 : 0.85,
      });
      this.cursor += 3;
    });
  }

  /**
   * A figure, scaled into the column and kept whole.
   *
   * Images are placed at 72dpi-honest size — a 600px-wide screenshot is not
   * blown up to fill the page — capped at the content width, and never split
   * across pages: a figure that doesn't fit here starts the next page.
   */
  image(image: DecodedImage, caption?: string | null): void {
    const natural = image.width * 0.75; // px at 96dpi → pt at 72dpi
    const width = Math.min(CONTENT_WIDTH, Math.max(90, natural));
    const height = (image.height / image.width) * width;
    // Taller than a page: scale to fit rather than truncate.
    const maxHeight = PAGE_HEIGHT - MARGIN * 2 - 40;
    const scale = height > maxHeight ? maxHeight / height : 1;
    const w = width * scale;
    const h = height * scale;

    this.reserve(h + 6);
    const index = this.images.push(image) - 1;
    this.current.push({
      image: index,
      x: MARGIN,
      y: PAGE_HEIGHT - this.cursor - h,
      width: w,
      height: h,
    });
    this.cursor += h + 6;

    if (caption) {
      this.text(caption, {
        font: 'italic',
        size: 9.5,
        leading: 13,
        grey: 0.45,
      });
      this.space(4);
    }
  }

  build(): Buffer {
    const objects: string[] = [];
    const pageObjectIds: number[] = [];

    // 1 = catalogue, 2 = page tree, 3..5 = fonts. Pages follow.
    const catalogueId = 1;
    const pagesId = 2;
    const fontIds = { F1: 3, F2: 4, F3: 5, F4: 6 };

    let nextId = 7;
    const contents: { id: number; body: string }[] = [];
    const binaries: { id: number; dict: string; body: Buffer }[] = [];

    // Every image becomes an XObject (alpha channels as attached SMasks).
    const imageIds: number[] = [];
    for (const image of this.images) {
      let smaskId: number | null = null;
      if (image.kind === 'raw' && image.smask) {
        smaskId = nextId++;
        binaries.push({
          id: smaskId,
          dict:
            `<< /Type /XObject /Subtype /Image /Width ${image.width} ` +
            `/Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 ` +
            `/Filter /FlateDecode /Length ${image.smask.length} >>`,
          body: image.smask,
        });
      }

      const id = nextId++;
      imageIds.push(id);
      const colourSpace = image.components === 1 ? '/DeviceGray' : '/DeviceRGB';
      const filter = image.kind === 'jpeg' ? '/DCTDecode' : '/FlateDecode';
      binaries.push({
        id,
        dict:
          `<< /Type /XObject /Subtype /Image /Width ${image.width} ` +
          `/Height ${image.height} /ColorSpace ${colourSpace} /BitsPerComponent 8 ` +
          `/Filter ${filter}${smaskId ? ` /SMask ${smaskId} 0 R` : ''} ` +
          `/Length ${image.data.length} >>`,
        body: image.data,
      });
    }
    const xobjects = imageIds.length
      ? `/XObject << ${imageIds.map((id, i) => `/Im${i} ${id} 0 R`).join(' ')} >> `
      : '';

    for (const page of this.pages) {
      const contentId = nextId++;
      const pageId = nextId++;
      pageObjectIds.push(pageId);
      contents.push({ id: contentId, body: this.streamFor(page) });

      objects[pageId] = [
        `<< /Type /Page /Parent ${pagesId} 0 R`,
        `/MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}]`,
        `/Resources << /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R /F4 ${fontIds.F4} 0 R >> ${xobjects}>>`,
        `/Contents ${contentId} 0 R >>`,
      ].join(' ');
    }

    for (const { id, body } of contents) {
      objects[id] =
        `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`;
    }

    objects[catalogueId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId] =
      `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds
        .map((id) => `${id} 0 R`)
        .join(' ')}] >>`;
    objects[fontIds.F1] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[fontIds.F2] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objects[fontIds.F3] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';
    objects[fontIds.F4] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';

    return this.serialise(objects, binaries, nextId);
  }

  private streamFor(page: Op[]): string {
    const parts: string[] = [];

    if (this.watermark) {
      // Light grey, bottom of every page — visible but not disruptive.
      parts.push(
        'BT /F3 9 Tf 0.65 0.65 0.65 rg ' +
          `1 0 0 1 ${MARGIN} ${(MARGIN / 2).toFixed(2)} Tm ` +
          `(${escapeText(toLatin1(this.watermark))}) Tj ET`,
      );
    }

    for (const op of page) {
      if ('image' in op) {
        parts.push(
          `q ${op.width.toFixed(2)} 0 0 ${op.height.toFixed(2)} ` +
            `${op.x.toFixed(2)} ${op.y.toFixed(2)} cm /Im${op.image} Do Q`,
        );
        continue;
      }
      if ('rule' in op) {
        parts.push(
          `${op.grey} ${op.grey} ${op.grey} rg ` +
            `${op.x.toFixed(2)} ${op.y.toFixed(2)} ${op.width.toFixed(2)} 0.6 re f`,
        );
        continue;
      }
      const grey = op.grey ?? 0.1;
      parts.push(
        `BT /${FONT_KEY[op.font]} ${op.size} Tf ${grey} ${grey} ${grey} rg ` +
          `1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm ` +
          `(${escapeText(op.text)}) Tj ET`,
      );
    }

    return parts.join('\n');
  }

  private serialise(
    objects: string[],
    binaries: { id: number; dict: string; body: Buffer }[],
    nextId: number,
  ): Buffer {
    const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
    let length = chunks[0].length;
    const offsets: number[] = [];
    const binaryById = new Map(binaries.map((entry) => [entry.id, entry]));

    for (let id = 1; id < nextId; id++) {
      const binary = binaryById.get(id);
      if (binary) {
        offsets[id] = length;
        const head = Buffer.from(
          `${id} 0 obj\n${binary.dict}\nstream\n`,
          'latin1',
        );
        const tail = Buffer.from('\nendstream\nendobj\n', 'latin1');
        chunks.push(head, binary.body, tail);
        length += head.length + binary.body.length + tail.length;
        continue;
      }
      const body = objects[id];
      if (!body) continue;
      offsets[id] = length;
      const chunk = Buffer.from(`${id} 0 obj\n${body}\nendobj\n`, 'latin1');
      chunks.push(chunk);
      length += chunk.length;
    }

    const xrefOffset = length;
    let tail = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
    for (let id = 1; id < nextId; id++) {
      tail += `${(offsets[id] ?? 0).toString().padStart(10, '0')} 00000 n \n`;
    }
    tail += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    chunks.push(Buffer.from(tail, 'latin1'));

    return Buffer.concat(chunks);
  }
}
