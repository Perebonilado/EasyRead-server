/**
 * Maths worked through, and checked by code before a learner sees it.
 *
 * A worked solution is one shape for the reader, the videos, the voice and
 * the tutor: what the problem gives and wants, each step's line and what
 * is done to get it, and the answer with its units. The model writes it;
 * code reads every line of LaTeX into an expression and checks it:
 *
 * - arithmetic exactly, within the precision it is written to;
 * - a simplification by sampling, so both sides agree everywhere;
 * - an equation by its solution, which must satisfy every line: a slip in
 *   any line shows as a line the problem's own answer does not satisfy;
 * - definite integrals, sums and derivatives numerically, and an
 *   antiderivative by differentiating it back.
 *
 * What code cannot read is left unchecked, never called wrong. A line that
 * is wrong goes back to the writer; still wrong, the working stops at the
 * last true line and code gives the answer where it can.
 */
import { all, create, type MathNode } from 'mathjs';
import { numbersIn } from './scene-chart';

// ── The shape ──────────────────────────────────────────────────────────────

/** One step of a worked solution. */
export interface WorkedStep {
  /** The line after this step, display LaTeX. */
  latex: string;
  /** What is done to get it: "subtract 3 from both sides". */
  does: string;
  /** Why it is allowed or why it helps; null when what is done says it. */
  why: string | null;
  /** The parts of the line this step changes, as LaTeX pieces of it: coloured. */
  changes: string[];
  /** What the voice says for it. */
  says: string;
}

/**
 * A calculation worked through: the problem (what it gives, what it
 * wants), its steps, the answer with its units, and a check that puts the
 * answer back in.
 */
export interface WorkedSolution {
  /** What the problem gives, each a line of LaTeX ("u = 5\,\text{m/s}"). */
  given: string[];
  /** What it asks for, in words. */
  wanted: string | null;
  steps: WorkedStep[];
  /** The answer, LaTeX, with its units. */
  answer: string | null;
  /** The answer put back in, LaTeX. */
  check: string | null;
  /** The working stopped at the last line code could stand behind; the answer is code's. */
  cut?: true;
}

// ── Reading LaTeX ──────────────────────────────────────────────────────────

/** What code cannot read as an expression: the line goes unchecked. */
class Unreadable extends Error {}

type Tok =
  | { t: 'num'; v: string }
  | { t: 'sym'; v: string }
  | { t: 'cmd'; v: string }
  | { t: 'op'; v: string };

/** Characters written outside LaTeX, as LaTeX. */
const UNICODE: [RegExp, string][] = [
  [/[−–]/gu, '-'],
  [/×/gu, '\\times '],
  [/÷/gu, '\\div '],
  [/[·⋅]/gu, '\\cdot '],
  [/π/gu, '\\pi '],
  [/≈/gu, '\\approx '],
  [/≠/gu, '\\neq '],
  [/≤/gu, '\\le '],
  [/≥/gu, '\\ge '],
  [/√/gu, '\\sqrt '],
  [/²/gu, '^2'],
  [/³/gu, '^3'],
  [/½/gu, '\\frac{1}{2}'],
  [/¼/gu, '\\frac{1}{4}'],
  [/¾/gu, '\\frac{3}{4}'],
  [/θ/gu, '\\theta '],
  [/α/gu, '\\alpha '],
  [/β/gu, '\\beta '],
  [/Δ/gu, '\\Delta '],
  [/λ/gu, '\\lambda '],
  [/μ/gu, '\\mu '],
  [/σ/gu, '\\sigma '],
  [/Σ/gu, '\\sum '],
  [/∫/gu, '\\int '],
  [/∞/gu, '\\infty '],
  [/°/gu, '^\\circ '],
  // Money is a number: its sign is a unit.
  [/\\\$|[₦$£€¥]/gu, ''],
];

/** Commands that are only space, size or style: nothing to read. */
const SKIP = new Set([
  ',',
  ';',
  ':',
  '!',
  ' ',
  'quad',
  'qquad',
  'displaystyle',
  'textstyle',
  'left',
  'right',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'bigl',
  'bigr',
  'Bigl',
  'Bigr',
  'biggl',
  'biggr',
  'Biggl',
  'Biggr',
  'limits',
  'nolimits',
]);
/** Commands whose group is words, not maths: units, labels. */
const WORDS = new Set([
  'text',
  'textrm',
  'textit',
  'textbf',
  'mbox',
  'mathrm',
  'textnormal',
  'textsf',
]);
/** Commands that decorate a symbol: x̄, p̂, a vector. */
const DECORATIONS = new Set([
  'bar',
  'hat',
  'vec',
  'overline',
  'tilde',
  'dot',
  'ddot',
  'mathbf',
  'boldsymbol',
  'mathit',
  'mathcal',
  'bm',
]);
const GREEK = new Set([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'vartheta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'rho',
  'sigma',
  'tau',
  'upsilon',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega',
  'Gamma',
  'Delta',
  'Theta',
  'Lambda',
  'Xi',
  'Pi',
  'Sigma',
  'Phi',
  'Psi',
  'Omega',
]);
/** LaTeX's functions, as mathjs names them. */
const FUNCTIONS: Record<string, string> = {
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  sec: 'sec',
  csc: 'csc',
  cot: 'cot',
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  sinh: 'sinh',
  cosh: 'cosh',
  tanh: 'tanh',
  ln: 'log',
  log: 'log10',
  lg: 'log10',
  exp: 'exp',
  max: 'max',
  min: 'min',
  gcd: 'gcd',
  lcm: 'lcm',
};
/** Relations a line may state, by how LaTeX writes them. */
const RELATIONS: Record<string, Relation> = {
  '=': '=',
  '<': '<',
  '>': '>',
  approx: '≈',
  simeq: '≈',
  sim: '≈',
  equiv: '=',
  neq: '≠',
  ne: '≠',
  le: '≤',
  leq: '≤',
  leqslant: '≤',
  ge: '≥',
  geq: '≥',
  geqslant: '≥',
  lt: '<',
  gt: '>',
};
/** What joins two statements on a line: "2x = 8 ⇒ x = 4". */
const THEREFORE = new Set([
  'Rightarrow',
  'implies',
  'iff',
  'Leftrightarrow',
  'therefore',
  'to',
  'rightarrow',
  'Longrightarrow',
  'longrightarrow',
  'quad',
  'qquad',
]);

/** Words written in a line that join two statements. */
const JOINING = new Set([
  'or',
  'and',
  'so',
  'then',
  'hence',
  'thus',
  'therefore',
  'giving',
  'gives',
]);

type Relation = '=' | '≈' | '<' | '>' | '≤' | '≥' | '≠';

/** A marker for a degree sign read as a power: 30^\circ. */
const DEGREE = '\u0000deg';

/** LaTeX as tokens: numbers, single letters, commands, and every other mark. */
function tokensOf(tex: string): Tok[] {
  let text = tex;
  for (const [pattern, to] of UNICODE) text = text.replace(pattern, to);
  // Thousands: "200{,}000", "200,000", "200\,000".
  text = text
    .replace(/\{,\}/g, '')
    .replace(/(\d)(?:,|\\,)(?=\d{3}(?!\d))/g, '$1');
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|[^a-zA-Z])/.exec(text.slice(i));
      if (!m) break;
      out.push({ t: 'cmd', v: m[1] });
      i += m[0].length;
      continue;
    }
    const num = /^(?:\d+\.?\d*|\.\d+)/.exec(text.slice(i));
    if (num) {
      out.push({ t: 'num', v: num[0] });
      i += num[0].length;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) out.push({ t: 'sym', v: c });
    else out.push({ t: 'op', v: c });
    i += 1;
  }
  // Delimiters as brackets; space and size gone.
  const kept: Tok[] = [];
  for (let k = 0; k < out.length; k += 1) {
    const tok = out[k];
    if (tok.t === 'cmd' && SKIP.has(tok.v)) {
      // "\left." and "\right." mark no delimiter at all.
      if (
        (tok.v === 'left' || tok.v === 'right') &&
        out[k + 1]?.t === 'op' &&
        out[k + 1].v === '.'
      )
        k += 1;
      continue;
    }
    if (tok.t === 'cmd' && (tok.v === '{' || tok.v === 'lbrace'))
      kept.push({ t: 'op', v: '(' });
    else if (tok.t === 'cmd' && (tok.v === '}' || tok.v === 'rbrace'))
      kept.push({ t: 'op', v: ')' });
    else if (
      tok.t === 'cmd' &&
      ['lvert', 'rvert', 'vert', '|', 'lVert', 'rVert'].includes(tok.v)
    )
      kept.push({ t: 'op', v: '|' });
    else if (tok.t === 'op' && (tok.v === '&' || tok.v === '~')) continue;
    else kept.push(tok);
  }
  return kept;
}

/**
 * Reads tokens into a mathjs expression, by the grammar a maths line is
 * written in: sums of products of powers, implicit products, fractions,
 * roots, functions, and the calculus a page works through. Every variable
 * is named "v_" and its letters, so none is ever read as a unit or a
 * constant; e and i are the constants, and π.
 */
class Reader {
  private k = 0;
  /** Absolute-value bars open: a bar inside closes one, never opens another. */
  private bars = 0;
  /** Letters an enclosing sum binds: its index. */
  private readonly bound: Set<string>;

  constructor(
    private readonly ts: Tok[],
    bound: ReadonlySet<string> = new Set(),
  ) {
    this.bound = new Set(bound);
  }

  private peek(o = 0): Tok | undefined {
    return this.ts[this.k + o];
  }
  private isOp(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t?.t === 'op' && t.v === v;
  }
  private isCmd(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t?.t === 'cmd' && t.v === v;
  }
  done(): boolean {
    return this.k >= this.ts.length;
  }

  /** The whole of what it was given, as one expression. */
  all(): string {
    const out = this.expr();
    if (!this.done()) throw new Unreadable('left over');
    return out;
  }

  expr(): string {
    let out = this.term();
    for (;;) {
      if (this.isOp('+') || this.isOp('-')) {
        const op = this.ts[this.k++].v;
        out = `${out} ${op} ${this.term()}`;
        continue;
      }
      if (this.isCmd('pm') || this.isCmd('mp')) throw new Unreadable('±');
      return out;
    }
  }

  private term(): string {
    let out = this.factor();
    for (;;) {
      if (
        this.isOp('*') ||
        this.isCmd('times') ||
        this.isCmd('cdot') ||
        this.isCmd('ast')
      ) {
        this.k += 1;
        out = `${out} * ${this.factor()}`;
        continue;
      }
      if (this.isOp('/') || this.isCmd('div')) {
        this.k += 1;
        out = `${out} / ${this.factor()}`;
        continue;
      }
      // Words after a value are its unit: 11\,\text{m/s}.
      const next = this.peek();
      if (next?.t === 'cmd' && WORDS.has(next.v) && !this.isDifferential()) {
        this.k += 1;
        this.rawGroup();
        // And its power: \text{m/s}^2.
        if (this.isOp('^')) {
          this.k += 1;
          this.rawGroup();
        }
        continue;
      }
      if (this.startsAtom()) {
        out = `${out} * ${this.factor()}`;
        continue;
      }
      return out;
    }
  }

  /** Whether "\mathrm{d}" comes next: the d of a differential, not a unit. */
  private isDifferential(): boolean {
    const t = this.peek();
    return (
      t?.t === 'cmd' &&
      WORDS.has(t.v) &&
      this.isOp('{', 1) &&
      this.peek(2)?.t === 'sym' &&
      this.peek(2)?.v === 'd' &&
      this.isOp('}', 3)
    );
  }

  private factor(): string {
    if (this.isOp('-')) {
      this.k += 1;
      return `-(${this.factor()})`;
    }
    if (this.isOp('+')) {
      this.k += 1;
      return this.factor();
    }
    let base = this.postfix(this.atom());
    while (this.isOp('^')) {
      this.k += 1;
      const power = this.script();
      base = power === DEGREE ? `(${base} * pi / 180)` : `(${base})^(${power})`;
      base = this.postfix(base);
    }
    return base;
  }

  /** Factorials and percentages after an atom. */
  private postfix(base: string): string {
    let out = base;
    for (;;) {
      if (this.isOp('!')) {
        this.k += 1;
        out = `(${out})!`;
        continue;
      }
      if (this.isCmd('%') || this.isOp('%')) {
        this.k += 1;
        out = `(${out} / 100)`;
        continue;
      }
      if (this.isOp("'")) throw new Unreadable('prime');
      return out;
    }
  }

  /** A superscript: a group, or the one token after the mark (only the first digit of a number). */
  private script(): string {
    const t = this.peek();
    if (!t) throw new Unreadable('empty script');
    if (t.t === 'op' && t.v === '{') {
      if (this.isCmd('circ', 1) && this.isOp('}', 2)) {
        this.k += 3;
        return DEGREE;
      }
      return this.group();
    }
    if (t.t === 'cmd' && t.v === 'circ') {
      this.k += 1;
      return DEGREE;
    }
    if (t.t === 'num' && t.v.length > 1) {
      this.ts[this.k] = { t: 'num', v: t.v.slice(1) };
      return t.v[0];
    }
    return this.atom();
  }

  /** A braced group read as an expression. */
  private group(): string {
    if (!this.isOp('{')) throw new Unreadable('expected a group');
    const end = this.closing(this.k, '{', '}');
    const inner = new Reader(this.ts.slice(this.k + 1, end), this.bound).all();
    this.k = end + 1;
    return `(${inner})`;
  }

  /** The tokens of a braced group, unread. */
  private rawGroup(): Tok[] {
    if (!this.isOp('{')) {
      // One token, unbraced: \frac12.
      const one = this.peek();
      if (!one) throw new Unreadable('expected a group');
      if (one.t === 'num' && one.v.length > 1) {
        this.ts[this.k] = { t: 'num', v: one.v.slice(1) };
        return [{ t: 'num', v: one.v[0] }];
      }
      this.k += 1;
      return [one];
    }
    const end = this.closing(this.k, '{', '}');
    const inner = this.ts.slice(this.k + 1, end);
    this.k = end + 1;
    return inner;
  }

  /** Where the bracket opened at `at` closes. */
  private closing(at: number, open: string, close: string): number {
    let depth = 0;
    for (let i = at; i < this.ts.length; i += 1) {
      const t = this.ts[i];
      if (t.t !== 'op') continue;
      if (t.v === open) depth += 1;
      else if (t.v === close) {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    throw new Unreadable(`no closing ${close}`);
  }

  /** Whether what comes next begins another factor: an implicit product. */
  private startsAtom(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.t === 'num' || t.t === 'sym') return true;
    if (t.t === 'op')
      return (
        t.v === '(' || t.v === '[' || t.v === '{' || (t.v === '|' && !this.bars)
      );
    return (
      GREEK.has(t.v) ||
      t.v in FUNCTIONS ||
      DECORATIONS.has(t.v) ||
      WORDS.has(t.v) ||
      [
        'frac',
        'dfrac',
        'tfrac',
        'cfrac',
        'sqrt',
        'pi',
        'int',
        'sum',
        'prod',
        'binom',
        'infty',
        'operatorname',
      ].includes(t.v)
    );
  }

  /** A letter as a variable, with what is written under it: x₁, v₀, x_max. */
  private symbol(letters: string): string {
    let name = letters;
    if (this.isOp('_')) {
      this.k += 1;
      const sub = this.rawGroup()
        .map((t) => (t.t === 'cmd' ? t.v : t.v))
        .join('')
        .replace(/[^A-Za-z0-9]/g, '');
      if (sub) name = `${name}_${sub}`;
    }
    return `v_${name}`;
  }

  private atom(): string {
    const t = this.peek();
    if (!t) throw new Unreadable('ended early');
    if (t.t === 'num') {
      this.k += 1;
      // A subscript on a number means nothing to its value.
      if (this.isOp('_')) {
        this.k += 1;
        this.rawGroup();
      }
      return t.v;
    }
    if (t.t === 'sym') {
      this.k += 1;
      const next = this.peek();
      // e and i are constants, unless a sum binds i or one is subscripted.
      if (
        (t.v === 'e' || t.v === 'i') &&
        !this.bound.has(t.v) &&
        !(next?.t === 'op' && next.v === '_')
      )
        return t.v;
      return this.symbol(t.v);
    }
    if (t.t === 'op') {
      if (t.v === '(' || t.v === '[' || t.v === '{') {
        const close = t.v === '(' ? ')' : t.v === '[' ? ']' : '}';
        const end = this.closing(this.k, t.v, close);
        const inner = new Reader(
          this.ts.slice(this.k + 1, end),
          this.bound,
        ).all();
        this.k = end + 1;
        // [F]ₐᵇ: F at b less F at a. Only a square bracket with both
        // limits; (1 + r)^t is a power.
        if (t.v === '[' && (this.isOp('_') || this.isOp('^'))) {
          const at = this.k;
          const { lower, upper } = this.limits();
          if (lower !== null && upper !== null)
            return `__between((${inner}), (${lower}), (${upper}))`;
          this.k = at;
        }
        return `(${inner})`;
      }
      if (t.v === '|') {
        this.k += 1;
        this.bars += 1;
        const inner = this.expr();
        if (!this.isOp('|')) throw new Unreadable('no closing bar');
        this.k += 1;
        this.bars -= 1;
        return `abs(${inner})`;
      }
      throw new Unreadable(`unexpected ${t.v}`);
    }
    // A command.
    const name = t.v;
    this.k += 1;
    if (
      name === 'frac' ||
      name === 'dfrac' ||
      name === 'tfrac' ||
      name === 'cfrac'
    )
      return this.fraction();
    if (name === 'sqrt') {
      let index: string | null = null;
      if (this.isOp('[')) {
        const end = this.closing(this.k, '[', ']');
        index = new Reader(this.ts.slice(this.k + 1, end), this.bound).all();
        this.k = end + 1;
      }
      const inner = this.isOp('{') ? this.group() : this.factor();
      return index ? `nthRoot(${inner}, ${index})` : `sqrt(${inner})`;
    }
    if (name === 'pi') return 'pi';
    if (name === 'infty') return 'Infinity';
    if (GREEK.has(name)) return this.symbol(name);
    if (DECORATIONS.has(name)) {
      const inner = this.rawGroup()
        .map((tok) => tok.v)
        .join('')
        .replace(/[^A-Za-z0-9]/g, '');
      if (!inner) throw new Unreadable('empty decoration');
      const kept = ['mathbf', 'boldsymbol', 'mathit', 'mathcal', 'bm'].includes(
        name,
      )
        ? inner
        : `${inner}${name}`;
      return this.symbol(kept);
    }
    if (WORDS.has(name)) {
      const inner = this.rawGroup();
      // "\mathrm{d}x" is the d of a differential; words where a value
      // stands are a quantity by that name: \text{Total payable} = P + I.
      if (inner.length === 1 && inner[0].t === 'sym' && inner[0].v === 'd')
        return this.symbol('d');
      const words = inner
        .map((tok) => tok.v)
        .join('')
        .replace(/[^A-Za-z0-9]+/g, '');
      if (!words) return this.startsAtom() ? this.factor() : '1';
      return `v_${words}`;
    }
    if (name === 'operatorname') {
      const fn = this.rawGroup()
        .map((tok) => tok.v)
        .join('');
      if (!(fn in FUNCTIONS)) throw new Unreadable(`function ${fn}`);
      return this.apply(FUNCTIONS[fn]);
    }
    if (name in FUNCTIONS) {
      if (name === 'log' && this.isOp('_')) {
        this.k += 1;
        const base = new Reader(this.rawGroup(), this.bound).all();
        const arg = this.argument();
        return `log(${arg}, ${base})`;
      }
      return this.apply(FUNCTIONS[name]);
    }
    if (name === 'binom') {
      const n = new Reader(this.rawGroup(), this.bound).all();
      const r = new Reader(this.rawGroup(), this.bound).all();
      return `combinations(${n}, ${r})`;
    }
    if (name === 'int') return this.integral();
    if (name === 'sum' || name === 'prod') return this.series(name);
    throw new Unreadable(`\\${name}`);
  }

  /** A function applied: to what is bracketed after it, or to the product that follows. \sin^2 x is (sin x)². */
  private apply(fn: string): string {
    let power: string | null = null;
    if (this.isOp('^')) {
      this.k += 1;
      power = this.script();
    }
    const call = `${fn}(${this.argument()})`;
    return power ? `(${call})^(${power})` : call;
  }

  /** A function's argument: bracketed, or a product of factors up to the next function or sign. */
  private argument(): string {
    if (this.isOp('(')) {
      const end = this.closing(this.k, '(', ')');
      const inner = new Reader(
        this.ts.slice(this.k + 1, end),
        this.bound,
      ).all();
      this.k = end + 1;
      return inner;
    }
    let out = this.factor();
    while (this.startsAtom()) {
      const t = this.peek();
      if (t?.t === 'cmd' && (t.v in FUNCTIONS || t.v === 'int')) break;
      out = `${out} * ${this.factor()}`;
    }
    return out;
  }

  /**
   * A fraction; or d/dx, applied to what follows it (a derivative); or
   * dy/dx, a quantity of its own.
   */
  private fraction(): string {
    const top = this.rawGroup();
    const bottom = this.rawGroup();
    const letters = (toks: Tok[]) =>
      toks.every((tok) => tok.t === 'sym')
        ? toks.map((tok) => tok.v).join('')
        : null;
    const up = letters(top);
    const down = letters(bottom);
    if (up && down && /^d[a-zA-Z]$/.test(down) && up.startsWith('d')) {
      const variable = `v_${down[1]}`;
      if (up === 'd') return `__diff((${this.factor()}), ${variable})`;
      if (/^d[a-zA-Z]$/.test(up)) return `v_d${up[1]}_d${down[1]}`;
    }
    const n = new Reader(top, this.bound).all();
    const d = new Reader(bottom, this.bound).all();
    return `((${n}) / (${d}))`;
  }

  /** The limits written on an integral, a sum or a bracket: _{a}^{b}, in either order. */
  private limits(): {
    lower: string | null;
    upper: string | null;
    index: string | null;
  } {
    let lower: string | null = null;
    let upper: string | null = null;
    let index: string | null = null;
    for (let n = 0; n < 2; n += 1) {
      if (this.isOp('_')) {
        this.k += 1;
        const toks = this.rawGroup();
        // A sum's index: i = 1.
        const at = toks.findIndex((tok) => tok.t === 'op' && tok.v === '=');
        if (at === 1 && toks[0].t === 'sym') {
          index = toks[0].v;
          lower = new Reader(toks.slice(2), this.bound).all();
        } else lower = new Reader(toks, this.bound).all();
      } else if (this.isOp('^')) {
        this.k += 1;
        upper = new Reader(this.rawGroup(), this.bound).all();
      }
    }
    return { lower, upper, index };
  }

  /** ∫ₐᵇ f dx, numerically; ∫ f dx, an antiderivative, checked by differentiating back. */
  private integral(): string {
    const { lower, upper } = this.limits();
    // The integrand runs to its differential: d and a letter, outside brackets.
    let depth = 0;
    let at = -1;
    for (let i = this.k; i < this.ts.length - 1; i += 1) {
      const tok = this.ts[i];
      if (tok.t === 'op' && ['(', '[', '{'].includes(tok.v)) depth += 1;
      if (tok.t === 'op' && [')', ']', '}'].includes(tok.v)) depth -= 1;
      const d =
        (tok.t === 'sym' && tok.v === 'd') ||
        (tok.t === 'cmd' && tok.v === 'mathrm' && this.ts[i + 2]?.v === 'd');
      if (!depth && d) {
        const skip = tok.t === 'cmd' ? 4 : 1;
        const variable = this.ts[i + skip];
        if (variable?.t === 'sym') {
          at = i;
          const integrand = new Reader(
            this.ts.slice(this.k, i),
            this.bound,
          ).all();
          this.k = i + skip + 1;
          const v = `v_${variable.v}`;
          if (lower !== null && upper !== null)
            return `__integral((${integrand}), ${v}, (${lower}), (${upper}))`;
          return `__indef((${integrand}), ${v})`;
        }
      }
    }
    void at;
    throw new Unreadable('no differential');
  }

  /** Σ and Π over an index, from one number to another. */
  private series(name: 'sum' | 'prod'): string {
    const { lower, upper, index } = this.limits();
    if (!index || lower === null || upper === null)
      throw new Unreadable('a sum with no index');
    const body = new Reader(
      this.ts.slice(this.k),
      new Set([...this.bound, index]),
    );
    const inner = body.termOnly();
    this.k += body.k;
    return `__${name}((${inner}), v_${index}, (${lower}), (${upper}))`;
  }

  /** One product, as a sum's body is. */
  termOnly(): string {
    return this.term();
  }
}

/** One statement of a line: its sides as expressions, and the relations between them. */
export interface Statement {
  sides: string[];
  relations: Relation[];
  /** Each side as written, for the precision its numbers are given to. */
  written: string[];
  /** It goes on from the line before ("= x + 6"): a link in a chain, never a new equation. */
  continued?: true;
}

/**
 * A line of LaTeX as the statements it makes: split at its relations
 * (=, ≈, <, …), and at ⇒ or a comma between two statements. Null when
 * code cannot read it; a statement with one side (an expression alone)
 * relates nothing.
 */
export function statementsOf(latex: string): Statement[] | null {
  const lines = latex
    .split(/\\\\|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const out: Statement[] = [];
  for (const line of lines) {
    let toks: Tok[];
    try {
      toks = tokensOf(line);
    } catch {
      return null;
    }
    // Statements: split at ⇒, at a comma between two relations, and at
    // the words that join two ("x = 2 or x = 3").
    const parts: Tok[][] = [[]];
    let depth = 0;
    for (let k = 0; k < toks.length; k += 1) {
      const tok = toks[k];
      if (tok.t === 'cmd' && WORDS.has(tok.v) && toks[k + 1]?.v === '{') {
        let end = k + 2;
        while (end < toks.length && toks[end].v !== '}') end += 1;
        const word = toks
          .slice(k + 2, end)
          .map((one) => one.v)
          .join('')
          .toLowerCase();
        if (!depth && JOINING.has(word)) {
          parts.push([]);
          k = end;
          continue;
        }
      }
      if (tok.t === 'op' && ['(', '[', '{'].includes(tok.v)) depth += 1;
      if (tok.t === 'op' && [')', ']', '}'].includes(tok.v)) depth -= 1;
      if (!depth && tok.t === 'cmd' && THEREFORE.has(tok.v)) {
        parts.push([]);
        continue;
      }
      if (!depth && tok.t === 'op' && (tok.v === ',' || tok.v === ';')) {
        parts.push([]);
        continue;
      }
      parts[parts.length - 1].push(tok);
    }
    for (const part of parts) {
      if (!part.length) continue;
      const sides: Tok[][] = [[]];
      const relations: Relation[] = [];
      let level = 0;
      for (const tok of part) {
        if (tok.t === 'op' && ['(', '[', '{'].includes(tok.v)) level += 1;
        if (tok.t === 'op' && [')', ']', '}'].includes(tok.v)) level -= 1;
        const relation =
          !level && (tok.t === 'op' || tok.t === 'cmd')
            ? RELATIONS[tok.v]
            : undefined;
        if (relation) {
          relations.push(relation);
          sides.push([]);
          continue;
        }
        sides[sides.length - 1].push(tok);
      }
      try {
        const read = sides.map((side) =>
          side.length ? new Reader(side).all() : '',
        );
        out.push({
          sides: read,
          relations,
          written: sides.map((side) =>
            side
              .map((tok) => (tok.t === 'cmd' ? `\\${tok.v}` : tok.v))
              .join(' '),
          ),
        });
      } catch {
        return null;
      }
    }
  }
  return out;
}

// ── Evaluating ─────────────────────────────────────────────────────────────

/** A scope a raw-argument function evaluates in: its own values, then its caller's. */
class Layer extends Map<string, unknown> {
  constructor(
    private readonly parent: {
      get(k: string): unknown;
      has(k: string): boolean;
    },
  ) {
    super();
  }
  override get(key: string): unknown {
    return super.has(key) ? super.get(key) : this.parent.get(key);
  }
  override has(key: string): boolean {
    return super.has(key) || this.parent.has(key);
  }
}

type Scope = { get(k: string): unknown; has(k: string): boolean };
type Raw = ((args: MathNode[], math: unknown, scope: Scope) => unknown) & {
  rawArgs?: boolean;
};

/** A symbol node's name. */
const nameOf = (node: MathNode): string =>
  (node as unknown as { name?: string }).name ?? '';

const realOf = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('not a real number');
  return n;
};

/** ∫ₐᵇ f dx by Simpson's rule. */
const integral: Raw = (args, _math, scope) => {
  const [f, v, a, b] = args;
  const name = nameOf(v);
  const body = f.compile();
  const lo = realOf(a.compile().evaluate(scope));
  const hi = realOf(b.compile().evaluate(scope));
  const n = 2000;
  const h = (hi - lo) / n;
  const local = new Layer(scope);
  let sum = 0;
  for (let k = 0; k <= n; k += 1) {
    local.set(name, lo + k * h);
    const w = k === 0 || k === n ? 1 : k % 2 ? 4 : 2;
    sum += w * realOf(body.evaluate(local));
  }
  return (sum * h) / 3;
};
integral.rawArgs = true;

/** d/dx f, at the x in scope, by a central difference. */
const diff: Raw = (args, _math, scope) => {
  const [f, v] = args;
  const name = nameOf(v);
  const at = realOf(scope.get(name));
  const body = f.compile();
  const local = new Layer(scope);
  const h = 1e-5 * Math.max(1, Math.abs(at));
  local.set(name, at + h);
  const up = realOf(body.evaluate(local));
  local.set(name, at - h);
  const down = realOf(body.evaluate(local));
  return (up - down) / (2 * h);
};
diff.rawArgs = true;

/** Σ or Π over whole numbers from one bound to the other. */
const series = (product: boolean): Raw => {
  const run: Raw = (args, _math, scope) => {
    const [f, v, a, b] = args;
    const name = nameOf(v);
    const body = f.compile();
    const lo = Math.round(realOf(a.compile().evaluate(scope)));
    const hi = Math.round(realOf(b.compile().evaluate(scope)));
    if (hi - lo > 100_000) throw new Error('too long a sum');
    const local = new Layer(scope);
    let out = product ? 1 : 0;
    for (let k = lo; k <= hi; k += 1) {
      local.set(name, k);
      const term = realOf(body.evaluate(local));
      out = product ? out * term : out + term;
    }
    return out;
  };
  run.rawArgs = true;
  return run;
};

/** [F]ₐᵇ: F at the top less F at the bottom, in its one variable not already known. */
const between: Raw = (args, _math, scope) => {
  const [f, a, b] = args;
  const free = [...symbolsOf(f)].filter((name) => !scope.has(name));
  if (free.length !== 1) throw new Error('no one variable to evaluate in');
  const body = f.compile();
  const local = new Layer(scope);
  local.set(free[0], realOf(b.compile().evaluate(scope)));
  const top = realOf(body.evaluate(local));
  local.set(free[0], realOf(a.compile().evaluate(scope)));
  return top - realOf(body.evaluate(local));
};
between.rawArgs = true;

/** An antiderivative is checked by differentiating back, never evaluated. */
const indefinite: Raw = () => {
  throw new Error('an antiderivative has no value');
};
indefinite.rawArgs = true;

const mj = create(all);
mj.import(
  {
    __integral: integral,
    __diff: diff,
    __sum: series(false),
    __prod: series(true),
    __between: between,
    __indef: indefinite,
  },
  { override: true },
);
/** Kept before the lock: code's own expressions, read by code's own reader. */
const parseExpr = mj.parse.bind(mj) as (expr: string) => MathNode;
const refuse = () => {
  throw new Error('not available here');
};
mj.import(
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

/**
 * The variables an expression's value depends on: every "v_" name, less
 * the one an integral, a sum or a product binds, and anything inside an
 * evaluated bracket, whose variable is its own.
 */
function symbolsOf(node: MathNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: MathNode, bound: ReadonlySet<string>) => {
    const any = n as MathNode & {
      name?: string;
      fn?: MathNode & { name?: string };
      args?: MathNode[];
    };
    if (n.type === 'SymbolNode') {
      if (any.name?.startsWith('v_') && !bound.has(any.name)) out.add(any.name);
      return;
    }
    if (n.type === 'FunctionNode' && any.fn?.name && any.args) {
      const fn = any.fn.name;
      if (fn === '__between') {
        walk(any.args[1], bound);
        walk(any.args[2], bound);
        return;
      }
      if (fn === '__integral' || fn === '__sum' || fn === '__prod') {
        const v = (any.args[1] as { name?: string }).name ?? '';
        walk(any.args[0], new Set([...bound, v]));
        walk(any.args[2], bound);
        walk(any.args[3], bound);
        return;
      }
      for (const arg of any.args) walk(arg, bound);
      return;
    }
    n.forEach((child: MathNode) => walk(child, bound));
  };
  walk(node, new Set());
  return out;
}

interface Value {
  re: number;
  im: number;
}

const compiled = new Map<
  string,
  { node: MathNode; run: (scope: Map<string, unknown>) => unknown } | null
>();

/** An expression read once, and kept. */
function readExpr(expr: string) {
  if (compiled.has(expr)) return compiled.get(expr)!;
  let out: {
    node: MathNode;
    run: (scope: Map<string, unknown>) => unknown;
  } | null = null;
  try {
    const node = parseExpr(expr);
    const code = node.compile();
    out = { node, run: (scope) => code.evaluate(scope) as unknown };
  } catch {
    out = null;
  }
  if (compiled.size > 5000) compiled.clear();
  compiled.set(expr, out);
  return out;
}

/** An expression's value in a scope: a real or a complex number; null for anything else. */
function valueOf(
  expr: string,
  scope: ReadonlyMap<string, number>,
): Value | null {
  const read = readExpr(expr);
  if (!read) return null;
  try {
    const value = read.run(new Map(scope));
    if (typeof value === 'number')
      return Number.isFinite(value) ? { re: value, im: 0 } : null;
    const c = value as { re?: unknown; im?: unknown };
    if (typeof c?.re === 'number' && typeof c.im === 'number')
      return Number.isFinite(c.re) && Number.isFinite(c.im)
        ? { re: c.re, im: c.im }
        : null;
    return null;
  } catch {
    return null;
  }
}

/** Every variable a statement's sides depend on. */
function freeIn(statement: Statement): Set<string> {
  const out = new Set<string>();
  for (const side of statement.sides) {
    const read = readExpr(side);
    if (read) for (const name of symbolsOf(read.node)) out.add(name);
  }
  return out;
}

/** How many places after the point a number in these words is written to. */
const placesIn = (written: string) =>
  Math.max(0, ...[...written.matchAll(/\d+\.(\d+)/g)].map((m) => m[1].length));

/** Whether two values are the same, within a tolerance for their size. */
function same(a: Value, b: Value, tolerance: number): boolean {
  const scale = Math.max(1, Math.abs(a.re), Math.abs(b.re));
  const allowed = tolerance + scale * 1e-7;
  return Math.abs(a.re - b.re) <= allowed && Math.abs(a.im - b.im) <= allowed;
}

/** Whether a relation holds between two values. */
function holdsBetween(
  relation: Relation,
  a: Value,
  b: Value,
  tolerance: number,
): boolean {
  switch (relation) {
    case '=':
      return same(a, b, tolerance);
    case '≈':
      return same(a, b, Math.max(tolerance, Math.abs(b.re) * 0.01));
    case '≠':
      return !same(a, b, tolerance);
    case '<':
      return a.re < b.re;
    case '>':
      return a.re > b.re;
    case '≤':
      return a.re <= b.re + tolerance;
    case '≥':
      return a.re >= b.re - tolerance;
  }
}

/**
 * Whether a statement holds in a scope: each relation between its
 * neighbouring sides. Null when a side has no value there (a variable
 * unknown, a function it cannot take).
 */
function holdsIn(
  statement: Statement,
  scope: ReadonlyMap<string, number>,
  sampled = false,
): boolean | null {
  const values = statement.sides.map((side) => valueOf(side, scope));
  if (values.some((v) => v === null)) return null;
  return statement.relations.every((relation, i) => {
    // A written number holds to the places it is written to; a sampled
    // identity to the precision of the sums.
    const places = Math.max(
      placesIn(statement.written[i]),
      placesIn(statement.written[i + 1]),
    );
    const tolerance = sampled ? 1e-6 : places ? 0.5 * 10 ** -places : 1e-9;
    return holdsBetween(relation, values[i]!, values[i + 1]!, tolerance);
  });
}

/** A few values to try a variable at: none special, none the same. */
const SAMPLES = [1.37, 2.61, -0.83, 3.94, 0.57];

/** Whether a statement holds whatever its variables are: a simplification, an identity. */
function identity(
  statement: Statement,
  scope: ReadonlyMap<string, number>,
  free: readonly string[],
): boolean {
  let tried = 0;
  for (let s = 0; s < SAMPLES.length; s += 1) {
    const local = new Map(scope);
    free.forEach((name, j) =>
      local.set(name, SAMPLES[(s + j * 2) % SAMPLES.length] + j * 0.113),
    );
    const held = holdsIn(statement, local, true);
    if (held === null) continue;
    if (!held) return false;
    tried += 1;
  }
  return tried >= 3;
}

/** The real roots of f in a wide range: sign changes found by a scan, then halved down; and touches. */
function rootsOf(f: (x: number) => number | null): number[] {
  const xs: number[] = [0];
  for (let k = -400; k <= 400; k += 1) xs.push(k / 4);
  for (let k = -300; k <= 900; k += 2) {
    const m = 10 ** (k / 100);
    xs.push(m, -m);
  }
  xs.sort((a, b) => a - b);
  const roots: number[] = [];
  const add = (x: number) => {
    if (!roots.some((r) => Math.abs(r - x) <= 1e-7 * Math.max(1, Math.abs(x))))
      roots.push(x);
  };
  let px = xs[0];
  let py = f(px);
  for (let i = 1; i < xs.length; i += 1) {
    const x = xs[i];
    const y = f(x);
    if (y !== null && Math.abs(y) < 1e-12) add(x);
    else if (py !== null && y !== null && Math.sign(py) !== Math.sign(y)) {
      let lo = px;
      let hi = x;
      let flo = py;
      for (
        let n = 0;
        n < 200 && hi - lo > 1e-12 * Math.max(1, Math.abs(lo));
        n += 1
      ) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (fm === null) break;
        if (Math.sign(fm) === Math.sign(flo)) {
          lo = mid;
          flo = fm;
        } else hi = mid;
      }
      const mid = (lo + hi) / 2;
      const fm = f(mid);
      // A jump across a pole is no root.
      if (
        fm !== null &&
        Math.abs(fm) < 1e-6 * Math.max(1, Math.abs(py), Math.abs(y))
      )
        add(mid);
    }
    px = x;
    py = y;
  }
  // A root the curve only touches, (x - 2)² = 0: where |f| dips to nothing.
  for (let i = 1; i < xs.length - 1; i += 1) {
    const [a, b, c] = [f(xs[i - 1]), f(xs[i]), f(xs[i + 1])];
    if (a === null || b === null || c === null) continue;
    if (Math.abs(b) <= Math.abs(a) && Math.abs(b) <= Math.abs(c)) {
      let lo = xs[i - 1];
      let hi = xs[i + 1];
      for (let n = 0; n < 100; n += 1) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        const f1 = f(m1);
        const f2 = f(m2);
        if (f1 === null || f2 === null) break;
        if (Math.abs(f1) < Math.abs(f2)) hi = m2;
        else lo = m1;
      }
      const x = (lo + hi) / 2;
      const y = f(x);
      if (y !== null && Math.abs(y) < 1e-9 * Math.max(1, Math.abs(x))) add(x);
    }
  }
  return roots.sort((a, b) => a - b);
}

/** The roots of an equation in one variable, in a scope: where its two sides meet. */
function solve(
  statement: Statement,
  variable: string,
  scope: ReadonlyMap<string, number>,
): number[] {
  if (statement.sides.length < 2) return [];
  const [left, right] = [
    statement.sides[0],
    statement.sides[statement.sides.length - 1],
  ];
  const local = new Map(scope);
  return rootsOf((x) => {
    local.set(variable, x);
    const a = valueOf(left, local);
    const b = valueOf(right, local);
    if (!a || !b || Math.abs(a.im) > 1e-9 || Math.abs(b.im) > 1e-9) return null;
    return a.re - b.re;
  });
}

// ── Checking ───────────────────────────────────────────────────────────────

/** What code found of one line: it holds, it does not, or code could not tell. */
export type LineVerdict = 'true' | 'false' | 'unchecked';

/**
 * An antiderivative checked by differentiating back: ∫ f dx = F is true
 * when F' = f wherever it is tried.
 */
function antiderivative(
  statement: Statement,
  scope: ReadonlyMap<string, number>,
): LineVerdict | null {
  if (statement.sides.length !== 2) return null;
  const at = statement.sides.findIndex((side) => /^__indef\(/.test(side));
  if (at < 0) return null;
  const read = readExpr(statement.sides[at]);
  const args = (read?.node as unknown as { args?: MathNode[] } | undefined)
    ?.args;
  const variable = args?.[1] ? nameOf(args[1]) : '';
  if (!args || args.length !== 2 || !variable) return 'unchecked';
  const f = args[0].toString();
  const other = statement.sides[1 - at];
  const back: Statement = {
    sides: [f, `__diff((${other}), ${variable})`],
    relations: ['='],
    written: ['', ''],
  };
  const free = [...freeIn(back)].filter((name) => !scope.has(name));
  return identity(back, scope, free) ? 'true' : 'false';
}

/** The values a line of givens sets: "u = 5 m/s" sets u. */
function givenScope(given: readonly string[]): Map<string, number> {
  const scope = new Map<string, number>();
  for (const line of given) {
    for (const statement of statementsOf(line) ?? []) {
      if (statement.sides.length < 2 || statement.relations[0] !== '=')
        continue;
      const name = /^v_[A-Za-z0-9_]+$/.exec(statement.sides[0].trim())?.[0];
      if (!name) continue;
      const value = valueOf(statement.sides[statement.sides.length - 1], scope);
      if (value && Math.abs(value.im) < 1e-12) scope.set(name, value.re);
    }
  }
  return scope;
}

/** A statement as the working reaches it: what is known by then, and whether it names a new quantity. */
interface Reached {
  statement: Statement;
  scope: Map<string, number>;
  /** It gives a new quantity its value: "I = 200{,}000 \times 0.05 \times 3". */
  defines: boolean;
}

/**
 * A working's statements in order, each with what is known when it is
 * reached: the givens, and every quantity a line before named and gave a
 * value ("I = P r t", its letters known, names I). A line that goes on
 * from the one before ("= 3x + 6") goes on from that line's last side.
 * Null for a line code cannot read.
 */
function reach(
  lines: readonly string[],
  given: readonly string[],
): (Reached[] | null)[] {
  const scope = givenScope(given);
  const seen = new Set<string>(scope.keys());
  const out: (Reached[] | null)[] = [];
  let last: string | null = null;
  let lastWritten = '';
  for (const line of lines) {
    const statements = statementsOf(line);
    if (!statements) {
      out.push(null);
      last = null;
      continue;
    }
    const reached: Reached[] = [];
    for (const statement of statements) {
      if (statement.sides[0] === '' && statement.relations.length && last) {
        statement.sides[0] = last;
        statement.written[0] = lastWritten;
        statement.continued = true;
      }
      const end = statement.sides.length - 1;
      if (statement.sides[end] !== '') {
        last = statement.sides[end];
        lastWritten = statement.written[end];
      }
      const snapshot = new Map(scope);
      // A new name given a value: it is known from here on.
      const name = /^v_[A-Za-z0-9_]+$/.exec(
        statement.sides[0]?.trim() ?? '',
      )?.[0];
      let defines = false;
      if (
        name &&
        !seen.has(name) &&
        !statement.continued &&
        statement.relations.length &&
        statement.relations.every((r) => r === '=' || r === '≈')
      ) {
        const values = statement.sides
          .slice(1)
          .map((side) => valueOf(side, snapshot));
        const value = values[values.length - 1];
        if (values.every(Boolean) && value && Math.abs(value.im) < 1e-12) {
          scope.set(name, value.re);
          defines = true;
        }
      }
      for (const side of statement.sides) {
        const read = readExpr(side);
        if (read) for (const one of symbolsOf(read.node)) seen.add(one);
      }
      reached.push({ statement, scope: snapshot, defines });
    }
    out.push(reached);
  }
  return out;
}

/**
 * Every line of a working checked, in order:
 *
 * - a line of numbers only, as arithmetic, once what is known is put in;
 * - a line that names a new quantity and gives its value, by its numbers;
 * - a line true whatever its variables are (a simplification), by samples;
 * - an equation by the problem's solution: the first equation's roots
 *   must satisfy every line after it, so the first line the solution does
 *   not satisfy is where the slip is. With several unknowns, the one the
 *   last line isolates is solved for, the others tried at a few values.
 *
 * A line code cannot read is unchecked.
 */
export function checkLines(
  lines: readonly string[],
  given: readonly string[] = [],
): LineVerdict[] {
  const read = reach(lines, given);
  const all = read.flatMap((reached) => reached ?? []);
  // The problem: the first equation code can read that still has unknowns
  // and is no identity, and names nothing new.
  let problem: Reached | null = null;
  let unknowns: string[] = [];
  for (const one of all) {
    const { statement, scope } = one;
    if (
      one.defines ||
      statement.continued ||
      !statement.relations.length ||
      statement.relations.some((r) => r !== '=' && r !== '≈') ||
      statement.sides.some((side) => side.includes('__indef'))
    )
      continue;
    const free = [...freeIn(statement)].filter((name) => !scope.has(name));
    if (!free.length || identity(statement, scope, free)) continue;
    problem = one;
    unknowns = free;
    break;
  }
  // Its solutions: for one unknown, its roots; for several, the one the
  // last line isolates, solved for at a few values of the rest.
  const lastLeft = [...all]
    .reverse()
    .find((one) => one.statement.relations.length)
    ?.statement.sides[0]?.trim();
  const target =
    unknowns.length > 1 && lastLeft && unknowns.includes(lastLeft)
      ? lastLeft
      : [...unknowns].sort()[0];
  const trials: Map<string, number>[] = [];
  if (problem && target) {
    const others = unknowns.filter((name) => name !== target);
    const tries = others.length ? 3 : 1;
    for (let s = 0; s < tries; s += 1) {
      const local = new Map(problem.scope);
      others.forEach((name, j) =>
        local.set(name, SAMPLES[(s + j) % SAMPLES.length] + 1.5 + j * 0.37),
      );
      const roots = solve(problem.statement, target, local);
      for (const root of roots.slice(0, 6))
        trials.push(new Map([...local, [target, root]]));
      if (!roots.length) {
        trials.length = 0;
        break;
      }
    }
  }
  return read.map((reached) => {
    if (!reached) return 'unchecked';
    let verdict: LineVerdict = 'true';
    let related = false;
    for (const one of reached) {
      const { statement, scope } = one;
      if (!statement.relations.length) continue;
      related = true;
      if (statement.sides.some((side) => side === '')) return 'unchecked';
      const anti = antiderivative(statement, scope);
      if (anti) {
        if (anti !== 'true') return anti;
        continue;
      }
      // Every link between two sides of numbers alone is arithmetic, whatever
      // the rest: x̄ = 20/4 = 6 is wrong at its second sign.
      const numeric = statement.sides.map(
        (side) =>
          [
            ...(readExpr(side) ? symbolsOf(readExpr(side)!.node) : ['?']),
          ].filter((name) => !scope.has(name)).length === 0,
      );
      for (let i = 0; i < statement.relations.length; i += 1) {
        if (!numeric[i] || !numeric[i + 1]) continue;
        const link: Statement = {
          sides: [statement.sides[i], statement.sides[i + 1]],
          relations: [statement.relations[i]],
          written: [statement.written[i], statement.written[i + 1]],
        };
        if (holdsIn(link, scope) === false) return 'false';
      }
      // A new name with its value: its numbers are all there is to it.
      if (one.defines) continue;
      const free = [...freeIn(statement)].filter((name) => !scope.has(name));
      if (!free.length) {
        const held = holdsIn(statement, scope);
        if (held === null) verdict = 'unchecked';
        else if (!held) return 'false';
        continue;
      }
      if (statement.relations.some((r) => r !== '=' && r !== '≈')) {
        verdict = 'unchecked';
        continue;
      }
      if (identity(statement, scope, free)) continue;
      // A link in a chain of equal things must hold everywhere.
      if (statement.continued) return 'false';
      if (one === problem) continue;
      if (
        !problem ||
        !trials.length ||
        free.some((name) => !unknowns.includes(name))
      ) {
        verdict = 'unchecked';
        continue;
      }
      // Each trial of the rest must have a solution this line keeps.
      const groups = new Map<string, Map<string, number>[]>();
      for (const trial of trials) {
        const key = unknowns
          .filter((name) => name !== target)
          .map((name) => trial.get(name))
          .join();
        groups.set(key, [...(groups.get(key) ?? []), trial]);
      }
      const kept = [...groups.values()].every((group) =>
        group.some((trial) =>
          holdsIn(statement, new Map([...scope, ...trial]), true),
        ),
      );
      if (!kept) return 'false';
    }
    return related ? verdict : 'true';
  });
}

/**
 * A variable's name as LaTeX: x, x_{1}, \bar{x}; a quantity named in words
 * as those words.
 */
function texName(variable: string): string {
  const name = variable.slice(2);
  const decorated = /^([A-Za-z])(bar|hat|vec|tilde|dot)$/.exec(name);
  if (decorated) return `\\${decorated[2]}{${decorated[1]}}`;
  if (GREEK.has(name)) return `\\${name}`;
  if (/^[A-Za-z]$/.test(name)) return name;
  const sub = /^([A-Za-z]+)_(\w+)$/.exec(name);
  if (sub && (sub[1].length === 1 || GREEK.has(sub[1])))
    return `${GREEK.has(sub[1]) ? `\\${sub[1]}` : sub[1]}_{${sub[2]}}`;
  return `\\text{${name.replace(/_/g, ' ')}}`;
}

/** A number as a line shows it: up to six significant figures, no trailing noughts. */
export function numberTex(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    const text = Math.abs(value).toString();
    const grouped =
      text.length > 4 ? text.replace(/\B(?=(\d{3})+(?!\d))/g, '{,}') : text;
    return value < 0 ? `-${grouped}` : grouped;
  }
  return String(Number(value.toPrecision(6)));
}

/**
 * What code can say the answer is, from the lines it can stand behind:
 * the problem's unknown at its solutions, or the value of a line of
 * numbers. Null where it cannot say.
 */
export function answerOf(
  lines: readonly string[],
  given: readonly string[] = [],
): string | null {
  const scope = givenScope(given);
  for (const line of lines) {
    for (const statement of statementsOf(line) ?? []) {
      if (statement.relations[0] !== '=' || statement.sides.some((s) => !s))
        continue;
      const free = [...freeIn(statement)].filter((name) => !scope.has(name));
      if (free.length === 1 && !identity(statement, scope, free)) {
        const roots = solve(statement, free[0], scope).slice(0, 3);
        if (!roots.length) return null;
        const name = texName(free[0]);
        return roots
          .map((root) => `${name} = ${numberTex(root)}`)
          .join(' \\text{ or } ');
      }
      if (!free.length) {
        const value = valueOf(statement.sides[0], scope);
        return value && Math.abs(value.im) < 1e-12 ? numberTex(value.re) : null;
      }
    }
  }
  return null;
}

/** Whether a number is the page's, or the page's in another form: 5% is 0.05, 2 km is 2000 m. */
function onPage(n: number, page: readonly number[]): boolean {
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  return page.some((p) =>
    [
      p,
      p * 100,
      p / 100,
      p * 1000,
      p / 1000,
      p * 60,
      p / 60,
      p * 3600,
      p / 3600,
    ].some((form) => close(Math.abs(n), Math.abs(form))),
  );
}

/** The numbers a given line states that the page never gives. */
export function strangersIn(
  given: readonly string[],
  pageText: string,
): number[] {
  const page = numbersIn(pageText.replace(/\{,\}/g, ''));
  const out: number[] = [];
  for (const line of given) {
    const text = line
      .replace(/\{,\}/g, '')
      .replace(/\\text\{[^}]*\}|\\mathrm\{[^}]*\}/g, ' ')
      .replace(/\^\{?\d+\}?/g, ' ')
      .replace(/_\{?\w+\}?/g, ' ');
    for (const n of numbersIn(text))
      if (!onPage(n, page) && !out.includes(n)) out.push(n);
  }
  return out;
}

/** What code found of a worked solution. */
export interface SolutionCheck {
  /** Each step's line: true, false, or not something code could read. */
  steps: LineVerdict[];
  answer: LineVerdict;
  check: LineVerdict;
  /** Numbers the givens state that are not on the page. */
  strangers: number[];
  /** What the writer is told to put right. */
  problems: string[];
}

/** A line's words, cut short for a message. */
const shortly = (latex: string) =>
  latex.length > 60 ? `${latex.slice(0, 57)}…` : latex;

/**
 * A worked solution checked: its steps, its answer against its last line,
 * its check, and its givens against the page. Each wrong line is a
 * problem for the writer.
 */
export function checkSolution(
  solution: WorkedSolution,
  pageText: string | null = null,
): SolutionCheck {
  const lines = solution.steps.map((step) => step.latex);
  // An equation among the givens is the problem itself: the first step is
  // checked against it, not taken for it.
  const problem = solution.given.filter((given) =>
    (statementsOf(given) ?? []).some(
      (statement) =>
        statement.relations.length > 0 &&
        !/^v_[A-Za-z0-9_]+$/.test(statement.sides[0]?.trim() ?? ''),
    ),
  );
  const all = checkLines(
    [...problem, ...lines, ...(solution.answer ? [solution.answer] : [])],
    solution.given,
  ).slice(problem.length);
  const steps = all.slice(0, lines.length);
  let answer: LineVerdict = solution.answer ? all[lines.length] : 'unchecked';
  // A bare answer ("11 m/s") is the last line's value.
  if (solution.answer && answer === 'true') {
    const alone = statementsOf(solution.answer);
    if (alone?.length === 1 && !alone[0].relations.length) {
      const last = [...lines]
        .reverse()
        .map(statementsOf)
        .find((s) => s?.length);
      const final = last?.[last.length - 1];
      const scope = givenScope(solution.given);
      const want = final
        ? valueOf(final.sides[final.sides.length - 1], scope)
        : null;
      const got = valueOf(alone[0].sides[0], scope);
      answer =
        want && got
          ? same(
              want,
              got,
              Math.max(0.5 * 10 ** -placesIn(solution.answer), 1e-9),
            )
            ? 'true'
            : 'false'
          : 'unchecked';
    }
  }
  const check = solution.check
    ? (checkLines([solution.check], solution.given)[0] ?? 'unchecked')
    : 'unchecked';
  const strangers = pageText ? strangersIn(solution.given, pageText) : [];
  const problems: string[] = [];
  steps.forEach((verdict, i) => {
    if (verdict === 'false')
      problems.push(
        `Step ${i + 1}, "${shortly(lines[i])}", is not true: it does not follow from the problem. Work it again from the step before.`,
      );
  });
  if (answer === 'false')
    problems.push(
      `The answer "${shortly(solution.answer ?? '')}" is not what the last step gives.`,
    );
  if (check === 'false')
    problems.push(
      `The check "${shortly(solution.check ?? '')}" does not hold: put the answer back in again.`,
    );
  if (strangers.length)
    problems.push(
      `The givens use numbers the page does not give: ${strangers.slice(0, 5).join(', ')}. Take the givens from the page.`,
    );
  return { steps, answer, check, strangers, problems };
}

/**
 * A solution cut to what code can stand behind: every step up to the
 * first that is not true, and the answer code finds from them, when the
 * steps a model wrote could not all be checked true. The givens and what
 * is wanted stay; no wrong line is kept.
 */
export function trimSolution(
  solution: WorkedSolution,
  found: SolutionCheck,
): WorkedSolution {
  const wrong = found.steps.indexOf('false');
  if (wrong < 0 && found.answer !== 'false' && found.check !== 'false')
    return solution;
  const steps = wrong < 0 ? solution.steps : solution.steps.slice(0, wrong);
  // Code's answer, from the problem as the first true line states it;
  // none where not even that stood.
  const answer =
    wrong < 0 && found.answer !== 'false'
      ? solution.answer
      : steps.length
        ? answerOf([steps[0].latex], solution.given)
        : null;
  // A check of an answer code replaced checks nothing.
  const kept = answer === solution.answer && found.check === 'true';
  return {
    ...solution,
    steps,
    answer,
    check: kept ? solution.check : null,
    cut: true,
  };
}

// ── Finding maths on a page ────────────────────────────────────────────────

/** How strongly a page's text looks like maths, and whether it is a maths page. */
export interface MathsSignals {
  /** Operators, relations and maths symbols, per hundred characters. */
  density: number;
  /** Lines that are mostly maths: an equation, a working line. */
  lines: number;
  /** Characters a symbol font lost, between or beside digits. */
  lost: number;
  maths: boolean;
}

const LOST = /[\uFFFD\uE000-\uF8FF]/gu;
const SYMBOLS = /[=+×÷±√∑∫π≈≠≤≥∞∂∆Δθλμσ²³½¼¾^]/gu;

/**
 * Whether a page's text is maths, before anything tidies it: equations and
 * working lines, the density of operators and digits, and the traces a
 * symbol font leaves where it loses a glyph (the character that replaces
 * it, or one from the private-use area, beside a digit). A page with a
 * worked calculation or two is a maths page; prose that cites a number is
 * not.
 */
export function mathsSignals(raw: string): MathsSignals {
  const text = raw.slice(0, 20_000);
  const chars = Math.max(1, text.replace(/\s/g, '').length);
  const symbols = (text.match(SYMBOLS) ?? []).length;
  const lost = [...text.matchAll(LOST)].filter((m) => {
    const around = text.slice(Math.max(0, m.index - 2), m.index + 3);
    return /\d|[a-z]\s*$/iu.test(around);
  }).length;
  const lines = text.split(/\n/).filter((line) => {
    const clean = line.trim();
    if (clean.length < 3 || clean.length > 160) return false;
    const letters = (clean.match(/\p{L}{3,}/gu) ?? []).length;
    const ops = (
      clean.match(/[=+×÷*/^<>≈≤≥±−-]|\\(?:frac|sqrt|times|cdot|int|sum)/gu) ??
      []
    ).length;
    const digits = (clean.match(/\d/g) ?? []).length;
    // An equation: a relation, with operators or digits either side, and few words.
    return /[=≈<>≤≥]/u.test(clean) && ops + digits >= 3 && letters <= 6;
  }).length;
  const density = ((symbols + lost) / chars) * 100;
  const maths =
    lines >= 2 || (lines >= 1 && density > 0.6) || density > 2 || lost >= 4;
  return { density: Math.round(density * 100) / 100, lines, lost, maths };
}

// ── A maths page's note ────────────────────────────────────────────────────

/** A block of a note, as far as its maths goes. */
interface NoteBlock {
  type: string;
  text: string;
  working?: WorkedSolution;
}

/** Every number a stretch of text or LaTeX gives, thousands marks and all. */
const numbersOfText = (text: string) =>
  numbersIn(text.replace(/\{,\}/g, '').replace(/\\,/g, ''));

/**
 * The page's numbers the note lost: every number the page gives, in any of
 * its forms (5% is 0.05), should be somewhere in the note. Years and
 * numbers of one digit are let go; a page's furniture has plenty.
 */
export function lostNumbers(
  pageText: string,
  blocks: readonly NoteBlock[],
): number[] {
  const note = blocks.flatMap((block) => [
    ...numbersOfText(block.text),
    ...(block.working
      ? numbersOfText(
          [
            ...block.working.given,
            ...block.working.steps.map((step) => step.latex),
            block.working.answer ?? '',
            block.working.check ?? '',
          ].join(' '),
        )
      : []),
  ]);
  const wanted = [...new Set(numbersOfText(pageText).map(Math.abs))].filter(
    (n) => n >= 10 && !(Number.isInteger(n) && n >= 1900 && n <= 2100),
  );
  return wanted.filter((n) => !onPage(n, note));
}

/**
 * What code finds wrong with a maths page's note: each working's wrong
 * lines, wrong answer or check, and givens not on the page; and the page's
 * numbers the note lost, when it lost more than a few.
 */
export function checkNote(
  blocks: readonly NoteBlock[],
  pageText: string,
): string[] {
  const problems: string[] = [];
  for (const block of blocks) {
    if (block.type !== 'working' || !block.working) continue;
    const found = checkSolution(block.working, pageText);
    for (const problem of found.problems)
      problems.push(`In the working "${shortly(block.text)}": ${problem}`);
  }
  const lost = lostNumbers(pageText, blocks);
  const all = new Set(numbersOfText(pageText).map(Math.abs)).size;
  if (lost.length >= 3 && lost.length > all * 0.15)
    problems.push(
      `These numbers from the page are missing from the rewrite: ${lost.slice(0, 8).join(', ')}. Keep every number the page gives.`,
    );
  return problems;
}

/**
 * A maths page's note with no wrong line in it: each working whose lines
 * code cannot all stand behind is cut at its last true line, with the
 * answer code finds; a working left with no step and no answer is kept as
 * the problem in words.
 */
export function settleNote<B extends NoteBlock>(
  blocks: readonly B[],
  pageText: string,
): B[] {
  return blocks.map((block) => {
    if (block.type !== 'working' || !block.working) return block;
    const found = checkSolution(block.working, pageText);
    const working = trimSolution(block.working, found);
    if (!working.steps.length && !working.answer)
      return { ...block, type: 'paragraph', working: undefined };
    return working === block.working ? block : { ...block, working };
  });
}

// ── LaTeX through JSON ─────────────────────────────────────────────────────

/** What a JSON escape made of a LaTeX command's backslash and first letter. */
const MANGLED: Record<string, string> = {
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\v': '\\v',
  '\f': '\\f',
  '\r': '\\r',
};

/**
 * LaTeX a model wrote into JSON with one backslash where two were due:
 * \times arrives as a tab and "imes", \frac as a form feed, \neq as a
 * new line. A control character before a letter is put back as the
 * command it was.
 */
export function repairLatex(tex: string): string {
  return tex.replace(/[\b\t\n\v\f\r](?=[a-zA-Z])/g, (c) => MANGLED[c] ?? c);
}

/** Prose with LaTeX inside dollar signs: only the LaTeX is repaired; a new line in the words is a new line. */
export function repairInlineLatex(text: string): string {
  return text.replace(/\$[^$]*\$/g, (maths) => repairLatex(maths));
}

/** A worked solution's LaTeX repaired, field by field. */
export function repairWorking(working: WorkedSolution): WorkedSolution {
  return {
    ...working,
    given: working.given.map(repairLatex),
    wanted: working.wanted === null ? null : repairInlineLatex(working.wanted),
    steps: working.steps.map((step) => ({
      latex: repairLatex(step.latex),
      does: repairInlineLatex(step.does),
      why: step.why === null ? null : repairInlineLatex(step.why),
      changes: step.changes.map(repairLatex),
      says: step.says,
    })),
    answer: working.answer === null ? null : repairLatex(working.answer),
    check: working.check === null ? null : repairLatex(working.check),
  };
}
