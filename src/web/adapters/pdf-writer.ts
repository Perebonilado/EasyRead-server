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

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 64;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export type FontName = 'regular' | 'bold' | 'italic';

const FONT_KEY: Record<FontName, string> = {
  regular: 'F1',
  bold: 'F2',
  italic: 'F3',
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
  const code = char.charCodeAt(0);
  if (code < 32 || code > 126) return font === 'bold' ? 556 : 500;
  const table = font === 'bold' ? WIDTHS_BOLD : WIDTHS_REGULAR;
  return table[code - 32] ?? 500;
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

interface Op {
  text: string;
  font: FontName;
  size: number;
  x: number;
  y: number;
  grey?: number;
}

/**
 * Accumulates text into pages, then serialises the whole file.
 *
 * Layout is single-pass and top-down: callers push blocks, the cursor
 * advances, and a new page starts when it runs out of room.
 */
export class PdfWriter {
  private readonly pages: Op[][] = [];
  private current: Op[] = [];
  private cursor = MARGIN;

  constructor(private readonly watermark: string | null = null) {
    this.pages.push(this.current);
  }

  get contentWidth(): number {
    return CONTENT_WIDTH;
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

  build(): Buffer {
    const objects: string[] = [];
    const pageObjectIds: number[] = [];

    // 1 = catalogue, 2 = page tree, 3..5 = fonts. Pages follow.
    const catalogueId = 1;
    const pagesId = 2;
    const fontIds = { F1: 3, F2: 4, F3: 5 };

    let nextId = 6;
    const contents: { id: number; body: string }[] = [];

    for (const page of this.pages) {
      const contentId = nextId++;
      const pageId = nextId++;
      pageObjectIds.push(pageId);
      contents.push({ id: contentId, body: this.streamFor(page) });

      objects[pageId] = [
        `<< /Type /Page /Parent ${pagesId} 0 R`,
        `/MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}]`,
        `/Resources << /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R >> >>`,
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

    return this.serialise(objects, nextId);
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
      const grey = op.grey ?? 0.1;
      parts.push(
        `BT /${FONT_KEY[op.font]} ${op.size} Tf ${grey} ${grey} ${grey} rg ` +
          `1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm ` +
          `(${escapeText(op.text)}) Tj ET`,
      );
    }

    return parts.join('\n');
  }

  private serialise(objects: string[], nextId: number): Buffer {
    let output = '%PDF-1.4\n';
    const offsets: number[] = [];

    for (let id = 1; id < nextId; id++) {
      const body = objects[id];
      if (!body) continue;
      offsets[id] = Buffer.byteLength(output, 'latin1');
      output += `${id} 0 obj\n${body}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(output, 'latin1');
    output += `xref\n0 ${nextId}\n0000000000 65535 f \n`;
    for (let id = 1; id < nextId; id++) {
      const offset = offsets[id] ?? 0;
      output += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }
    output += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(output, 'latin1');
  }
}
