/**
 * Maths on the tutor's board: each line of a worked solution as the pen
 * writes it, as it is set in type beside the handwriting, and as the voice
 * says it.
 *
 * The board's pen writes a single-stroke font of plain characters, so a
 * line of LaTeX is written as a learner would copy it: x^2, 3/4,
 * sqrt(2), 3 x 4. The typeset line beside it is the LaTeX itself.
 */
import type { WorkedSolution } from './maths-work';
import { sayLatex } from './maths-speech';
import { numbersIn } from './scene-chart';

/** One line of worked maths, for a board and a voice. */
export interface WorkLine {
  latex: string;
  plain: string;
  said: string;
  does: string | null;
  why: string | null;
  role: 'problem' | 'step' | 'answer' | 'check';
}

/** Greek letters and the like, written out. */
const NAMES = new Set([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'pi',
  'rho',
  'sigma',
  'tau',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega',
  'Gamma',
  'Delta',
  'Theta',
  'Lambda',
  'Sigma',
  'Phi',
  'Psi',
  'Omega',
  'sin',
  'cos',
  'tan',
  'sec',
  'csc',
  'cot',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'log',
  'ln',
  'exp',
  'lim',
  'max',
  'min',
  'det',
  'gcd',
  'mod',
  'int',
  'sum',
  'prod',
]);

/** Commands written as a sign. */
const SIGNS: Record<string, string> = {
  div: ' / ',
  pm: ' +/- ',
  mp: ' -/+ ',
  le: ' <= ',
  leq: ' <= ',
  leqslant: ' <= ',
  ge: ' >= ',
  geq: ' >= ',
  geqslant: ' >= ',
  ne: ' =/= ',
  neq: ' =/= ',
  approx: ' ~ ',
  sim: ' ~ ',
  simeq: ' ~ ',
  equiv: ' == ',
  to: ' -> ',
  rightarrow: ' -> ',
  Rightarrow: ' => ',
  implies: ' => ',
  therefore: ' so ',
  infty: 'infinity',
  degree: ' deg',
  circ: ' deg',
  angle: 'angle ',
  cdots: '...',
  ldots: '...',
  dots: '...',
  '%': '%',
  $: '$',
  '&': '&',
  '#': '#',
  _: '_',
  '{': '(',
  '}': ')',
  ',': ' ',
  ';': ' ',
  ':': ' ',
  ' ': ' ',
  '!': '',
  quad: '  ',
  qquad: '  ',
  left: '',
  right: '',
  big: '',
  Big: '',
  bigl: '',
  bigr: '',
  Bigl: '',
  Bigr: '',
  displaystyle: '',
  limits: '',
};

/** Unicode maths the pen's font lacks, in its characters. */
const UNICODE: [RegExp, string][] = [
  [/×/g, ' x '],
  [/÷/g, ' / '],
  [/[−–]/g, '-'],
  [/·/g, ' * '],
  [/²/g, '^2'],
  [/³/g, '^3'],
  [/√/g, 'sqrt'],
  [/π/g, 'pi'],
  [/θ/g, 'theta'],
  [/≤/g, ' <= '],
  [/≥/g, ' >= '],
  [/≠/g, ' =/= '],
  [/≈/g, ' ~ '],
  [/°/g, ' deg'],
  [/½/g, '1/2'],
  [/¼/g, '1/4'],
  [/¾/g, '3/4'],
  [/∞/g, 'infinity'],
  [/₦/g, 'N'],
  [/£/g, 'GBP '],
  [/€/g, 'EUR '],
];

/** The group that starts at `i` (a "{…}" or one character), and where it ends. */
function groupAt(tex: string, i: number): { body: string; end: number } {
  while (tex[i] === ' ') i += 1;
  if (tex[i] !== '{') {
    // A command as an argument ("\frac\pi2") is the whole command.
    if (tex[i] === '\\') {
      const name = /^\\([A-Za-z]+|.)/.exec(tex.slice(i));
      const length = name ? name[0].length : 1;
      return { body: tex.slice(i, i + length), end: i + length };
    }
    return { body: tex[i] ?? '', end: i + 1 };
  }
  let depth = 0;
  for (let j = i; j < tex.length; j += 1) {
    if (tex[j] === '\\') {
      j += 1;
      continue;
    }
    if (tex[j] === '{') depth += 1;
    else if (tex[j] === '}') {
      depth -= 1;
      if (depth === 0) return { body: tex.slice(i + 1, j), end: j + 1 };
    }
  }
  return { body: tex.slice(i + 1), end: tex.length };
}

/** A part of a fraction or a power, bracketed where it holds more than one term. */
function bracketed(text: string): string {
  const bare = text.trim();
  if (/^[A-Za-z0-9.]+$/.test(bare) || /^\(.*\)$/.test(bare)) return bare;
  if (/^[A-Za-z]+\([^()]*\)$/.test(bare)) return bare;
  return `(${bare})`;
}

/** The pen's text of a stretch of LaTeX, recursively. */
function written(tex: string, crossIsX: boolean): string {
  let out = '';
  let i = 0;
  while (i < tex.length) {
    const char = tex[i];
    if (char === '\\') {
      const match = /^\\([A-Za-z]+|.)/.exec(tex.slice(i));
      const name = match ? match[1] : '';
      i += match ? match[0].length : 1;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const top = groupAt(tex, i);
        const bottom = groupAt(tex, top.end);
        i = bottom.end;
        out += `${bracketed(written(top.body, crossIsX))}/${bracketed(written(bottom.body, crossIsX))}`;
      } else if (name === 'sqrt') {
        let degree: string | null = null;
        while (tex[i] === ' ') i += 1;
        if (tex[i] === '[') {
          const close = tex.indexOf(']', i);
          degree = tex.slice(i + 1, close < 0 ? tex.length : close);
          i = close < 0 ? tex.length : close + 1;
        }
        const body = groupAt(tex, i);
        i = body.end;
        const inner = written(body.body, crossIsX).trim();
        out += degree
          ? `${bracketed(inner)}^(1/${degree.trim()})`
          : `sqrt(${inner})`;
      } else if (name === 'term') {
        // A change-mark: \term{id}{what it marks}.
        const id = groupAt(tex, i);
        const body = groupAt(tex, id.end);
        i = body.end;
        out += written(body.body, crossIsX);
      } else if (
        [
          'text',
          'mathrm',
          'textrm',
          'mathit',
          'textit',
          'mathbf',
          'textbf',
          'operatorname',
          'mbox',
          'hat',
          'vec',
          'mathbb',
          'mathcal',
          'boldsymbol',
        ].includes(name)
      ) {
        const body = groupAt(tex, i);
        i = body.end;
        const inner = written(body.body, crossIsX);
        // A unit after a number is written apart from it: "5 m/s".
        out +=
          name.startsWith('text') &&
          /[0-9)]\s*$/.test(out) &&
          !/^\s/.test(inner)
            ? ` ${inner}`
            : inner;
      } else if (name === 'bar' || name === 'overline') {
        const body = groupAt(tex, i);
        i = body.end;
        // Kept from the spacing of minus signs: "x-bar", not "x - bar".
        out += `${written(body.body, crossIsX)}\uE000bar`;
      } else if (name === 'times' || name === 'cdot') {
        out += crossIsX ? ' x ' : ' * ';
      } else if (name in SIGNS) {
        out += SIGNS[name];
      } else if (NAMES.has(name)) {
        // A name runs into what follows it only if that is a bracket.
        out += /[A-Za-z0-9]$/.test(out) ? ` ${name}` : name;
        if (/^[A-Za-z0-9]/.test(tex.slice(i))) out += ' ';
      }
      // Any other command is dropped, its arguments written as they come.
      continue;
    }
    if (char === '^' || char === '_') {
      const body = groupAt(tex, i + 1);
      i = body.end;
      const inner = written(body.body, crossIsX).trim();
      if (char === '^' && /^(\\circ|deg)$/.test(inner.replace(/\s/g, '')))
        out += ' deg';
      else if (char === '^') out += `^${bracketed(inner)}`;
      // A subscript is written after its letter: v0, x1, a_(n+1); a
      // limit's after its sign, int_0.
      else
        out +=
          /^[A-Za-z0-9]+$/.test(inner) &&
          !/(int|sum|prod|lim|[\])|])\s*$/.test(out)
            ? inner
            : `_${bracketed(inner)}`;
      continue;
    }
    if (char === '{' || char === '}') {
      i += 1;
      continue;
    }
    if (char === '&') {
      i += 1;
      continue;
    }
    out += char === '~' ? ' ' : char;
    i += 1;
  }
  return out;
}

/**
 * A line of LaTeX as the board's pen writes it, in plain characters:
 * "\frac{3}{4}x^{2} \times 2 = 1{,}500" is "3/4 x^2 x 2 = 1,500". A
 * cross is an x where the line has no x of its own, else a star.
 */
export function penText(latex: string): string {
  let tex = latex.replace(/\{,\}/g, ',');
  for (const [pattern, to] of UNICODE) tex = tex.replace(pattern, to);
  // The letter x as a quantity, anywhere in the line.
  const crossIsX = !/(^|[^A-Za-z\\])x(?![A-Za-z])/.test(
    tex.replace(/\\text\{[^{}]*\}/g, ''),
  );
  let out = written(tex, crossIsX);
  out = out
    // The signs set apart, as a teacher writes them.
    .replace(/\s*(<=|>=|=\/=|==|=>|->|\+\/-|-\/\+)\s*/g, ' $1 ')
    .replace(/\s*(?<![<>=/!-])=(?![=>/])\s*/g, ' = ')
    .replace(/\s*(?<![+/-])\+(?![/])\s*/g, ' + ')
    .replace(/(?<=[A-Za-z0-9)])\s*-\s*(?=[A-Za-z0-9(.])/g, ' - ')
    .replace(/\s*~\s*/g, ' ~ ')
    .replace(/\uE000/g, '-')
    // Anything the pen cannot write is left out.
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/([([])\s+/g, '$1')
    .replace(/\s+([)\]])/g, '$1')
    .trim();
  return out;
}

/** Number words, for reading the numbers a sentence says. */
const UNITS_SAID: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS_SAID: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES_SAID: Record<string, number> = {
  thousand: 1_000,
  million: 1_000_000,
};

/** The numbers a sentence says, in figures or in words ("seventy-five", "two hundred thousand"). */
export function numbersSaid(text: string): number[] {
  const out = numbersIn(text);
  let total = 0;
  let current = 0;
  let running = false;
  // "and" goes on with a number only after a hundred or a thousand: "two
  // hundred and five" is one number, "seven and eight" two.
  let scaled = false;
  const close = () => {
    if (running) out.push(total + current);
    total = 0;
    current = 0;
    running = false;
    scaled = false;
  };
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (word === 'and' && running && scaled) continue;
    if (word in UNITS_SAID || word in TENS_SAID) {
      // A second tens or units word after a whole one starts a new number:
      // "seven eight", "twenty thirty".
      const value = UNITS_SAID[word] ?? TENS_SAID[word];
      if (running && !scaled && current % 10 !== 0 && value >= 1) close();
      else if (running && !scaled && current >= 20 && value >= 10) close();
      current += value;
    } else if (word === 'hundred' && running) {
      current *= 100;
      scaled = true;
    } else if (word in SCALES_SAID && running) {
      total += current * SCALES_SAID[word];
      current = 0;
      scaled = true;
    } else {
      close();
      continue;
    }
    running = true;
  }
  close();
  return out;
}

/**
 * Whether the words a writer gave for a step can be said as they are:
 * every number in them is a number of the step's line, the line before,
 * or what the problem gives. Numbers the words make up are not said.
 */
export function wordsHold(says: string, lines: readonly string[]): boolean {
  const known = lines.flatMap((line) => numbersIn(penText(line)));
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  return numbersSaid(says).every((n) =>
    known.some((k) => close(Math.abs(n), Math.abs(k))),
  );
}

/** A long check, "… = 0 and … = 0", as one line for each part. */
function checkParts(latex: string): string[] {
  return latex
    .split(/\\text\{\s*and\s*\}|\\quad|\\qquad|;|\\text\{\s*,\s*\}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * A worked solution's lines, in the order the board writes them: what
 * the problem gives (each a statement: a bare number is the tutor's to
 * say), each step but one that only writes the line before again, the
 * answer where the last step does not already say it, and the check, a
 * line for each part. A step is said in the writer's words where every
 * number in them holds; else as the line reads.
 */
export function workLines(working: WorkedSolution): WorkLine[] {
  const line = (
    latex: string,
    role: WorkLine['role'],
    does: string | null = null,
    why: string | null = null,
    says: string | null = null,
  ): WorkLine => ({
    latex,
    plain: penText(latex),
    said: says?.trim() || sayLatex(latex),
    does,
    why,
    role,
  });
  const flat = (tex: string) => penText(tex).replace(/\s/g, '');
  const out: WorkLine[] = working.given
    .filter((given) => /=|<|>|\\le|\\ge|\\neq|\\approx/.test(given))
    .map((given) => line(given, 'problem'));
  let previous = out[out.length - 1]?.latex ?? '';
  for (const step of working.steps) {
    if (previous && flat(step.latex) === flat(previous)) continue;
    const says = wordsHold(step.says, [step.latex, previous, ...working.given])
      ? step.says
      : null;
    out.push(line(step.latex, 'step', step.does, step.why, says));
    previous = step.latex;
  }
  const last = working.steps[working.steps.length - 1]?.latex ?? '';
  if (working.answer && flat(working.answer) !== flat(last))
    out.push(line(working.answer, 'answer'));
  if (working.check)
    for (const part of checkParts(working.check)) out.push(line(part, 'check'));
  return out;
}

// ── A board's figure, set in type ──────────────────────────────────────────

/** Greek letters and functions a figure may name, set as LaTeX commands. */
const COMMANDS = new Set([
  ...[...NAMES].filter(
    (name) => !['int', 'sum', 'prod', 'mod', 'det', 'gcd'].includes(name),
  ),
]);

/** Units written after a number: set upright, apart from it. */
const UNITS = new Set([
  'm',
  's',
  'kg',
  'g',
  'mg',
  'cm',
  'mm',
  'km',
  'h',
  'hr',
  'min',
  'N',
  'J',
  'kJ',
  'W',
  'kW',
  'kWh',
  'Hz',
  'mol',
  'K',
  'A',
  'V',
  'Pa',
  'kPa',
  'L',
  'mL',
  'ms',
]);

/** Unicode a figure may be written with, as the plain signs read below. */
const FIGURE_UNICODE: [RegExp, string][] = [
  [/×/g, '*'],
  [/÷/g, '/'],
  [/[−–]/g, '-'],
  [/·/g, '*'],
  [/²/g, '^2'],
  [/³/g, '^3'],
  [/√/g, 'sqrt'],
  [/π/g, 'pi'],
  [/θ/g, 'theta'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/≠/g, '!='],
  [/≈/g, '~='],
  [/±/g, '+/-'],
];

/** Signs, as LaTeX. */
const FIGURE_SIGNS: Record<string, string> = {
  '<=': '\\le ',
  '>=': '\\ge ',
  '!=': '\\neq ',
  '=/=': '\\neq ',
  '~=': '\\approx ',
  '~': '\\approx ',
  '->': '\\to ',
  '+/-': '\\pm ',
  '%': '\\%',
};

/**
 * A board's figure, written in plain characters, set in type: "E = mc^2"
 * is E = mc², "A = pi r^2" is A = πr², "1/2 m v^2" has its half. Null for
 * a figure that is not maths, or has nothing type would show better than
 * the handwriting beside it ("N = 4 servers", "30%").
 */
export function figureLatex(text: string): string | null {
  let source = text.trim();
  for (const [pattern, to] of FIGURE_UNICODE)
    source = source.replace(pattern, to);
  // What type shows better: a power, an index, a root, a fraction of
  // numbers, a product sign, a relation, a Greek letter or a function.
  const shaped =
    /\^|_|sqrt\s*\(|\d\s*\/\s*\d|\*|<=|>=|!=|=\/=|~=|\+\/-|\b(?:pi|theta|alpha|beta|gamma|delta|lambda|mu|sigma|omega|phi|rho|tau|sin|cos|tan|log|ln|exp)\b|\b[A-Za-z]\d\b|\d\s+x\s+\d/.test(
      source,
    );
  if (!shaped) return null;
  // A formula's characters only.
  if (!/^[A-Za-z0-9\s.,+\-*/^_=<>!()[\]|%~:']+$/.test(source)) return null;
  const tokens =
    source.match(
      /\d[\d,]*(?:\.\d+)?|[A-Za-z]+\d*|<=|>=|=\/=|!=|~=|->|\+\/-|\S/g,
    ) ?? [];
  const isNumber = (token: string | undefined) =>
    token !== undefined && /^\d/.test(token);
  const number = (token: string) => token.replace(/,(?=\d{3})/g, '{,}');

  let i = 0;
  // One operand of a power or an index: a bracketed group, or a token
  // with its sign.
  const operand = (): string => {
    if (tokens[i] === '(') {
      let depth = 0;
      const start = i;
      for (; i < tokens.length; i += 1) {
        if (tokens[i] === '(') depth += 1;
        else if (tokens[i] === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const inner = tokens.slice(start + 1, i);
      i += 1;
      return run(inner);
    }
    let sign = '';
    if (tokens[i] === '-' || tokens[i] === '+') sign = tokens[i++];
    const token = tokens[i++] ?? '';
    return sign + run([token]);
  };
  const run = (list: string[]): string => {
    const saved = { tokens: [...tokens], i };
    tokens.splice(0, tokens.length, ...list);
    i = 0;
    let out = '';
    while (i < tokens.length) {
      const token = tokens[i];
      const next = tokens[i + 1];
      if (isNumber(token)) {
        // A fraction of numbers, set as one.
        if (
          next === '/' &&
          isNumber(tokens[i + 2]) &&
          !/[.,]/.test(tokens[i + 2])
        ) {
          out += `\\frac{${number(token)}}{${number(tokens[i + 2])}} `;
          i += 3;
          continue;
        }
        out += number(token);
        i += 1;
        // A unit after it, with any "/unit" and power it has.
        if (next && UNITS.has(next)) {
          let unit = next;
          i += 1;
          while (
            tokens[i] === '/' &&
            tokens[i + 1] &&
            UNITS.has(tokens[i + 1])
          ) {
            unit += `/${tokens[i + 1]}`;
            i += 2;
          }
          out += `\\,\\text{${unit}}`;
        }
        continue;
      }
      if (/^[A-Za-z]/.test(token)) {
        i += 1;
        if (token === 'sqrt' && tokens[i] === '(') {
          out += `\\sqrt{${operand()}} `;
          continue;
        }
        // "x" between two numbers is a times sign.
        if (token === 'x' && isNumber(tokens[i - 2]) && isNumber(tokens[i])) {
          out += '\\times ';
          continue;
        }
        const indexed = /^([A-Za-z])(\d+)$/.exec(token);
        if (indexed) out += `${indexed[1]}_{${indexed[2]}}`;
        else if (COMMANDS.has(token)) out += `\\${token} `;
        else if (token.length >= 4) out += `\\text{${token}}`;
        else out += `${token} `;
        continue;
      }
      if (token === '^' || token === '_') {
        i += 1;
        out = out.trimEnd() + `${token}{${operand()}}`;
        continue;
      }
      if (token === '*') {
        // Between numbers (a percentage is one), a times sign.
        const before =
          isNumber(tokens[i - 1]) ||
          (tokens[i - 1] === '%' && isNumber(tokens[i - 2]));
        out += before && isNumber(next) ? '\\times ' : '\\cdot ';
        i += 1;
        continue;
      }
      out += FIGURE_SIGNS[token] ?? token;
      i += 1;
    }
    const result = out;
    tokens.splice(0, tokens.length, ...saved.tokens);
    i = saved.i;
    return result.trim();
  };
  const latex = run([...tokens])
    .replace(/\s+([=+\-<>])/g, ' $1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return latex || null;
}
