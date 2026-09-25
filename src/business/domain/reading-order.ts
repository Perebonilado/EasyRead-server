/**
 * A page's text in the order it is read, from where each run of text sits.
 *
 * Runs on one baseline make a line. A page set in two columns is read down
 * the left column and then the right, band by band: a line that crosses
 * the gutter (a heading, a rule) ends one band and stands where it is. The
 * notes in smaller type under the body come after it, set off by a rule,
 * read the same way. Read by line across the whole width, a two-column
 * page gives half a sentence from each column on every line.
 */

/** One run of text as the PDF places it: its left edge and baseline, in points. */
export interface TextRun {
  x: number;
  y: number;
  width: number;
  height: number;
  str: string;
}

/** The line set before a page's notes, in its text. */
export const NOTES_RULE = '———';

interface Row {
  y: number;
  height: number;
  parts: TextRun[];
}

/** The runs on one baseline, grouped; top of the page first. */
function rowsOf(runs: readonly TextRun[]): Row[] {
  const rows: Row[] = [];
  for (const run of runs) {
    if (!run.str) continue;
    const height = Math.abs(run.height) || 10;
    const row = rows.find(
      (r) => Math.abs(r.y - run.y) < Math.max(r.height, height) * 0.5,
    );
    const part = { ...run, height };
    if (row) {
      row.parts.push(part);
      row.height = Math.max(row.height, height);
    } else rows.push({ y: run.y, height, parts: [part] });
  }
  // PDF origin is bottom-left: the top of the page has the largest y.
  return rows.sort((a, b) => b.y - a.y);
}

/** Runs on a line joined as they read, with the spaces pdf.js drops restored. */
function lineOf(parts: readonly TextRun[], height: number): string {
  const gap = height * 0.18;
  return [...parts]
    .sort((a, b) => a.x - b.x)
    .reduce((line, part, index, sorted) => {
      if (index === 0) return part.str;
      const previous = sorted[index - 1];
      const distance = part.x - (previous.x + previous.width);
      const needsSpace =
        distance > gap && !/\s$/.test(line) && !/^\s/.test(part.str);
      return line + (needsSpace ? ' ' : '') + part.str;
    }, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * The type size the body is set in: the size most of the characters in
 * the top part of the page are set in. Not the whole page's: under a short
 * passage, its notes can hold more words than it does.
 */
function bodySize(rows: readonly Row[]): number {
  const sizes: [number, number][] = [];
  for (const row of rows.slice(0, Math.max(1, Math.ceil(rows.length * 0.4))))
    for (const part of row.parts)
      sizes.push([part.height, part.str.replace(/\s/g, '').length]);
  sizes.sort((a, b) => a[0] - b[0]);
  const total = sizes.reduce((n, [, chars]) => n + chars, 0);
  let seen = 0;
  for (const [size, chars] of sizes) {
    seen += chars;
    if (seen >= total / 2) return size;
  }
  return sizes[sizes.length - 1]?.[0] ?? 10;
}

/** A row's own type size: that of the run with the most of its characters. */
const sizeOf = (row: Row) =>
  [...row.parts].sort(
    (a, b) => b.str.replace(/\s/g, '').length - a.str.replace(/\s/g, '').length,
  )[0]?.height ?? row.height;

/**
 * Where two columns part, if they do: an x no run crosses on nearly every
 * line, near the middle, with full lines on both sides of it. A table's
 * short cells are not columns: each side's lines must fill most of it.
 */
function gutterOf(rows: readonly Row[]): number | null {
  if (rows.length < 4) return null;
  const parts = rows.flatMap((row) => row.parts);
  const left = Math.min(...parts.map((p) => p.x));
  const right = Math.max(...parts.map((p) => p.x + p.width));
  const span = right - left;
  if (!(span > 0)) return null;
  const crossing = (x: number) =>
    rows.filter((row) =>
      row.parts.some((p) => p.x < x - 0.5 && p.x + p.width > x + 0.5),
    ).length;
  // The run of x from 30% to 70% of the width that the fewest lines cross.
  let best: { from: number; to: number; count: number } | null = null;
  for (
    let x = left + span * 0.3;
    x <= left + span * 0.7;
    x += Math.max(0.5, span / 400)
  ) {
    const count = crossing(x);
    if (!best || count < best.count) best = { from: x, to: x, count };
    else if (count === best.count && x - best.to <= span / 200) best.to = x;
  }
  if (!best) return null;
  const gutter = (best.from + best.to) / 2;
  // A heading or two may cross; a column's lines do not.
  if (best.count > Math.max(1, rows.length * 0.1)) return null;
  let both = 0;
  let leftFill = 0;
  let rightFill = 0;
  let leftLines = 0;
  let rightLines = 0;
  for (const row of rows) {
    const l = row.parts.filter((p) => p.x + p.width <= gutter + 0.5);
    const r = row.parts.filter((p) => p.x >= gutter - 0.5);
    if (l.length && r.length) both += 1;
    if (l.length) {
      leftLines += 1;
      leftFill +=
        (Math.max(...l.map((p) => p.x + p.width)) -
          Math.min(...l.map((p) => p.x))) /
        (gutter - left);
    }
    if (r.length) {
      rightLines += 1;
      rightFill +=
        (Math.max(...r.map((p) => p.x + p.width)) -
          Math.min(...r.map((p) => p.x))) /
        (right - gutter);
    }
  }
  if (both < rows.length * 0.4) return null;
  if (!leftLines || !rightLines) return null;
  if (leftFill / leftLines < 0.6 || rightFill / rightLines < 0.6) return null;
  return gutter;
}

/**
 * The running head: a short line at the top of the page, set off from the
 * body by more than its lines are apart from each other. Read first and
 * whole, wherever its parts stand: split at the gutter, its page number
 * would begin one column and its title the other, in the middle of the
 * page's words.
 */
function headOf(rows: readonly Row[], body: number): Row | null {
  const lines = rows.filter((row) => sizeOf(row) >= body * 0.85);
  if (lines.length < 4) return null;
  const gaps = lines
    .slice(1, -1)
    .map((row, i) => row.y - lines[i + 2].y)
    .sort((a, b) => a - b);
  const usual = gaps[Math.floor(gaps.length / 2)];
  const [top, next] = lines;
  const words = lineOf(top.parts, top.height)
    .split(/\s+/)
    .filter(Boolean).length;
  return usual > 0 && top.y - next.y > usual * 1.35 && words <= 8 ? top : null;
}

/** A line of one column: its words and its type size. */
interface Line {
  text: string;
  size: number;
}

/** A column's lines split where its notes, set smaller at its foot, begin. */
function footOf(lines: readonly Line[], body: number): [Line[], Line[]] {
  let at = lines.length;
  while (at > 0 && lines[at - 1].size < body * 0.85) at -= 1;
  return [lines.slice(0, at), lines.slice(at)];
}

/**
 * The page in reading order, as its body and its notes. In two columns,
 * band by band: each band's left column, then its right; a line across
 * the gutter between bands. The notes are the smaller lines at the foot
 * of each column of the last band, which can start higher in one column
 * than the other.
 */
function readRows(rows: readonly Row[], body: number): [string[], string[]] {
  const gutter = gutterOf(rows);
  if (gutter === null) {
    const lines = rows
      .map((row) => ({
        text: lineOf(row.parts, row.height),
        size: sizeOf(row),
      }))
      .filter((line) => line.text);
    const [main, notes] = footOf(lines, body);
    return [main.map((l) => l.text), notes.map((l) => l.text)];
  }
  const head = headOf(rows, body);
  const out: string[] = [];
  let left: Line[] = [];
  let right: Line[] = [];
  const flush = (last: boolean): string[] => {
    if (!last) {
      out.push(...left.map((l) => l.text), ...right.map((l) => l.text));
      left = [];
      right = [];
      return [];
    }
    const [leftBody, leftNotes] = footOf(left, body);
    const [rightBody, rightNotes] = footOf(right, body);
    out.push(...leftBody.map((l) => l.text), ...rightBody.map((l) => l.text));
    return [...leftNotes, ...rightNotes].map((l) => l.text);
  };
  for (const row of rows) {
    const crosses =
      row === head ||
      row.parts.some((p) => p.x < gutter - 0.5 && p.x + p.width > gutter + 0.5);
    if (crosses) {
      flush(false);
      const line = lineOf(row.parts, row.height);
      if (line) out.push(line);
      continue;
    }
    const sides: [TextRun[], Line[]][] = [
      [row.parts.filter((p) => p.x + p.width / 2 < gutter), left],
      [row.parts.filter((p) => p.x + p.width / 2 >= gutter), right],
    ];
    for (const [parts, column] of sides) {
      if (!parts.length) continue;
      const text = lineOf(parts, row.height);
      if (text)
        column.push({
          text,
          size: sizeOf({ y: row.y, height: row.height, parts }),
        });
    }
  }
  const notes = flush(true);
  return [out, notes];
}

/**
 * The page's text in reading order: the body, then, after a rule, the
 * notes set smaller at the foot of its columns. Words broken with a
 * hyphen at a line's end are joined again.
 */
export function readingOrder(runs: readonly TextRun[]): string {
  const rows = rowsOf(runs);
  if (!rows.length) return '';
  const [main, notes] = readRows(rows, bodySize(rows));
  // A lone small line under the body (a page number) is no set of notes.
  const text = (
    notes.length >= 2
      ? [...main, '', NOTES_RULE, ...notes]
      : [...main, ...notes]
  )
    .join('\n')
    // Rejoin words split across a line break with a hyphen ("ser -\nvant"
    // too, and past a footnote's mark set before the hyphen).
    .replace(/(\w)-\n(\w)/g, '$1$2')
    // eslint-disable-next-line no-control-regex -- a footnote's mark, which pdf.js gives as control characters
    .replace(/(\w)[\u0000-\u0008\u000e-\u001f]* -\n(\p{Ll})/gu, '$1$2');
  return text;
}
