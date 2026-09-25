/**
 * Maths on the stage, set by code.
 *
 * The writer gives a worked block as lines of TeX and marks the terms the
 * voice will point at with \term{name}{...}. MathJax sets each side of
 * each line as paths (no font to load, nothing to fetch), and code stacks
 * the lines with their equals signs in one column, the way a teacher
 * works down a board: each line its own group, so the stage shows it as
 * it is said, and each marked term its own group, so the voice can point
 * at it. The drawing never guesses at maths; the artist is never asked.
 *
 * The arithmetic a line claims is checked, with mathjs locked down as its
 * security guide says, before a wrong sum can reach the screen.
 */
import { all, create } from 'mathjs';
import { groupId } from './scene-ids';
import { drawNumbers, type NumberPicture } from './scene-numbers';

/** One line of the working: its TeX, and a plain equality to check when it is arithmetic. */
export interface MathLine {
  latex: string;
  /** "50/0.1 = 500": numbers only; null for a line that is not arithmetic. */
  check: string | null;
}

// ── A calculator that can only calculate ───────────────────────────────────

const math = create(all);
/** Kept before the lock: what the checks and plots use. */
export const calculate = math.evaluate.bind(math) as (
  expr: string,
  scope?: Record<string, number>,
) => unknown;
export const compileExpression = math.compile.bind(math) as (expr: string) => {
  evaluate: (scope?: Record<string, number>) => unknown;
};
const refuse = () => {
  throw new Error('not available here');
};
math.import(
  {
    import: refuse,
    createUnit: refuse,
    evaluate: refuse,
    parse: refuse,
    simplify: refuse,
    derivative: refuse,
    resolve: refuse,
    reviver: refuse,
  },
  { override: true },
);

/** How many places after the point a number is written with. */
const places = (text: string) => /\.(\d+)/.exec(text)?.[1].length ?? 0;

/**
 * Whether a line's arithmetic holds, within the precision it is written
 * to ("22/7 = 3.14" holds; "50/0.1 = 5000" does not). Null when the
 * check is not plain arithmetic (it names a variable, or does not parse):
 * nothing is said about what cannot be checked.
 */
export function checkArithmetic(
  check: string,
): { holds: boolean; value: number } | null {
  const sides = check.split('=').map((side) => side.trim());
  if (sides.length < 2 || sides.some((side) => !side)) return null;
  const values: number[] = [];
  for (const side of sides) {
    // Arithmetic only: digits, operators, brackets, a point, a percent, powers.
    if (!/^[\d\s.+\-*/^()%,]+$/.test(side)) return null;
    try {
      const value = Number(
        calculate(side.replace(/(\d),(\d{3})/g, '$1$2').replace(/%/g, '/100')),
      );
      if (!Number.isFinite(value)) return null;
      values.push(value);
    } catch {
      return null;
    }
  }
  const [first, ...rest] = values;
  const holds = rest.every((value, i) => {
    const written = sides[i + 1];
    const tolerance = Math.max(
      0.5 * 10 ** -places(written),
      Math.abs(value) * 1e-9,
    );
    return Math.abs(first - value) <= tolerance + 1e-12;
  });
  return { holds, value: first };
}

// ── Terms ──────────────────────────────────────────────────────────────────

/** The argument in braces starting at `open`, and where it ends. */
function braced(
  text: string,
  open: number,
): { body: string; end: number } | null {
  if (text[open] !== '{') return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return { body: text.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

/**
 * A line's marked terms made into groups the stage can find: \term{image
 * size}{h_i} becomes \cssId{term-image-size-2}{h_i} on the second line.
 * Returns the TeX and the terms it marks, in order.
 */
export function markTerms(
  latex: string,
  line: number,
): { tex: string; terms: { name: string; id: string }[] } {
  const terms: { name: string; id: string }[] = [];
  let out = '';
  let i = 0;
  while (i < latex.length) {
    const at = latex.indexOf('\\term', i);
    if (at < 0) {
      out += latex.slice(i);
      break;
    }
    out += latex.slice(i, at);
    const name = braced(latex, at + 5);
    const body = name ? braced(latex, name.end) : null;
    if (!name || !body) {
      // Not a term after all: the command's name is dropped, what follows kept.
      i = at + 5;
      continue;
    }
    const clean = name.body.replace(/\s+/g, ' ').trim();
    const id = `term-${groupId(clean) || 'x'}-${line}`;
    terms.push({ name: clean, id });
    out += `\\cssId{${id}}{${body.body}}`;
    i = body.end;
  }
  return { tex: out, terms };
}

/** A line split at its first equals sign outside any group: the left side, and the equals sign with the rest. */
export function splitAtEquals(tex: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < tex.length; i += 1) {
    const ch = tex[i];
    if (ch === '\\') {
      // A command: skip its name, so \neq and the like are not read as signs.
      let j = i + 1;
      while (j < tex.length && /[a-zA-Z]/.test(tex[j])) j += 1;
      i = Math.max(i, j - 1);
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (
      ch === '=' &&
      depth === 0 &&
      !['<', '>', '!', ':'].includes(tex[i - 1] ?? '') &&
      tex[i + 1] !== '='
    )
      return [tex.slice(0, i).trim(), tex.slice(i).trim()];
  }
  return null;
}

// ── Setting it ─────────────────────────────────────────────────────────────

interface Set {
  /** The paths, as MathJax drew them, their baseline at 0. */
  inner: string;
  minX: number;
  /** Above the baseline (positive) and below it. */
  ascent: number;
  descent: number;
  width: number;
}

let typesetter: ((tex: string) => string) | null = null;

/** TeX to MathJax's SVG, as paths; made once. */
function typeset(tex: string): string {
  if (!typesetter) {
    // Loaded on first use: MathJax is large, and most pages have no maths.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { mathjax } =
      require('mathjax-full/js/mathjax.js') as typeof import('mathjax-full/js/mathjax.js');
    const { TeX } =
      require('mathjax-full/js/input/tex.js') as typeof import('mathjax-full/js/input/tex.js');
    const { SVG } =
      require('mathjax-full/js/output/svg.js') as typeof import('mathjax-full/js/output/svg.js');
    const { liteAdaptor } =
      require('mathjax-full/js/adaptors/liteAdaptor.js') as typeof import('mathjax-full/js/adaptors/liteAdaptor.js');
    const { RegisterHTMLHandler } =
      require('mathjax-full/js/handlers/html.js') as typeof import('mathjax-full/js/handlers/html.js');
    const { AllPackages } =
      require('mathjax-full/js/input/tex/AllPackages.js') as typeof import('mathjax-full/js/input/tex/AllPackages.js');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const document = mathjax.document('', {
      InputJax: new TeX({ packages: AllPackages }),
      OutputJax: new SVG({ fontCache: 'none' }),
    });
    typesetter = (source: string) =>
      adaptor.innerHTML(document.convert(source, { display: true }) as never);
  }
  return typesetter(tex);
}

/** One side of a line set, and measured from its viewBox. */
function setSide(tex: string): Set {
  const svg = typeset(tex);
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/\s+/).map(Number) ?? [
    0, -800, 0, 1000,
  ];
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  // A TeX error is set as a red message: not something to put on a stage.
  if (/data-mjx-error|<g data-mml-node="merror"/.test(svg))
    throw new Error(`the TeX will not set: ${tex.slice(0, 80)}`);
  const [minX, minY, width, height] = box;
  return { inner, minX, ascent: -minY, descent: height + minY, width };
}

/** A block of working set: one SVG, its lines and its terms as groups. */
export interface SetMath {
  svg: string;
  viewBox: [number, number, number, number];
  /** Term name to the id of its group, where it first appears. */
  parts: Record<string, string>;
  /** "line 2" to the id of that line's group; the first line is always shown. */
  states: Record<string, string>;
}

/** Room between lines, and round the block, in thousandths of an em. */
const LINE_GAP = 420;
const PAD = 160;

/**
 * The whole working, set: lines stacked, equals signs in one column; and
 * for a young learner, its sum as a picture under the lines, as wide as
 * they are.
 */
export function renderMath(
  lines: MathLine[],
  picture: NumberPicture | null = null,
): SetMath {
  const parts: Record<string, string> = {};
  const states: Record<string, string> = {};
  const rows = lines.map((line, k) => {
    const { tex, terms } = markTerms(line.latex, k + 1);
    for (const term of terms) parts[term.name] ??= term.id;
    const split = splitAtEquals(tex);
    // The right side keeps the space a relation has before it: `{}=`,
    // as it would have with its left side beside it.
    return split
      ? {
          left: setSide(split[0] || '{}'),
          right: setSide(`{}${split[1]}`),
          equals: true,
        }
      : { left: null, right: setSide(tex), equals: false };
  });
  // The column the equals signs stand in: after the widest left side.
  const column = Math.max(
    0,
    ...rows.map((row) => (row.left ? row.left.width : 0)),
  );
  let y = PAD;
  let width = 0;
  const groups = rows.map((row, k) => {
    const ascent = Math.max(row.left?.ascent ?? 0, row.right.ascent);
    const descent = Math.max(row.left?.descent ?? 0, row.right.descent);
    const baseline = y + ascent;
    const place = (set: Set, x: number) =>
      `<g transform="translate(${round(x - set.minX)} ${round(baseline)})">${set.inner}</g>`;
    const left = row.left ? place(row.left, PAD + column - row.left.width) : '';
    // A line with no equals sign starts under the left sides.
    const rightX = row.equals ? PAD + column : PAD;
    const right = place(row.right, rightX);
    width = Math.max(width, rightX + row.right.width + PAD);
    y = baseline + descent + LINE_GAP;
    const id = `line-${k + 1}`;
    if (k > 0) states[`line ${k + 1}`] = id;
    return `<g id="${id}">${left}${right}</g>`;
  });
  let height = y - LINE_GAP + PAD;
  if (picture) {
    // The picture drawn 1000 across, set to the working's width, below it.
    const drawn = drawNumbers(picture);
    const across = Math.max(width, 6000) - PAD * 2;
    const k = across / 1000;
    groups.push(
      `<g id="numbers" transform="translate(${PAD} ${round(height)}) scale(${round(k * 100) / 100})">${drawn.markup}</g>`,
    );
    width = Math.max(width, across + PAD * 2);
    height += drawn.height * k + PAD;
  }
  const viewBox: [number, number, number, number] = [
    0,
    0,
    round(width),
    round(height),
  ];
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">${groups.join('')}</svg>`,
    viewBox,
    parts,
    states,
  };
}

const round = (n: number) => Math.round(n * 10) / 10;
