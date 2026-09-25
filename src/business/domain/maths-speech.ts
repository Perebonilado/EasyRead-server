/**
 * Maths said aloud, as a teacher says it to a learner: "x squared plus
 * three x equals ten", "a half", "the square root of two".
 *
 * LaTeX is read by MathJax into MathML and said by the Speech Rule Engine
 * in its ClearSpeak style, the one written for learners. Both load once,
 * on first use; until they have, a small reader of its own says the
 * common things (powers, fractions, roots, the signs), so no voice ever
 * says "backslash frac".
 */

type Speaker = (tex: string) => string;

let engine: Speaker | null = null;
let starting: Promise<void> | null = null;

/** LaTeX's units, said: \text{m/s} is metres per second. */
const UNITS: [RegExp, string][] = [
  // An antiderivative between its limits: "from 0 to 2", not "sub 0 squared".
  [
    /\\right\s*([\]|])\s*_\{?([^{}\s^]+)\}?\s*\^\{?([^{}\s]+)\}?/g,
    '\\right$1\\text{ evaluated from $2 to $3}',
  ],
  [
    /\\(?:text|mathrm)\{\s*m\/s\^?2\s*\}(?:\^\{?2\}?)?/g,
    '\\text{ metres per second squared}',
  ],
  [
    /\\(?:text|mathrm)\{\s*m\/s\s*\}(?:\^\{?2\}?)/g,
    '\\text{ metres per second squared}',
  ],
  [/\\(?:text|mathrm)\{\s*m\/s\s*\}/g, '\\text{ metres per second}'],
  [/\\(?:text|mathrm)\{\s*km\/h\s*\}/g, '\\text{ kilometres an hour}'],
  [/\\(?:text|mathrm)\{\s*kg\s*\}/g, '\\text{ kilograms}'],
  [/\\(?:text|mathrm)\{\s*cm\s*\}/g, '\\text{ centimetres}'],
  [/\\(?:text|mathrm)\{\s*m\s*\}/g, '\\text{ metres}'],
  [/\\(?:text|mathrm)\{\s*s\s*\}/g, '\\text{ seconds}'],
  [/\\(?:text|mathrm)\{\s*N\s*\}/g, '\\text{ newtons}'],
  [/\\(?:text|mathrm)\{\s*J\s*\}/g, '\\text{ joules}'],
];

/** What ClearSpeak says that a teacher would say otherwise. */
const SAID: [RegExp, string][] = [
  [/\bpercent sign\b/g, 'percent'],
  [/\balmost equals\b/g, 'is about'],
  [/\bnaira sign\b/g, 'naira'],
  [/₦\s?/g, 'naira '],
  [/\s{2,}/g, ' '],
];

/** Load MathJax's TeX reader and the Speech Rule Engine, once. */
export function startMathsSpeech(): Promise<void> {
  starting ??= (async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { mathjax } =
      require('mathjax-full/js/mathjax.js') as typeof import('mathjax-full/js/mathjax.js');
    const { TeX } =
      require('mathjax-full/js/input/tex.js') as typeof import('mathjax-full/js/input/tex.js');
    const { liteAdaptor } =
      require('mathjax-full/js/adaptors/liteAdaptor.js') as typeof import('mathjax-full/js/adaptors/liteAdaptor.js');
    const { RegisterHTMLHandler } =
      require('mathjax-full/js/handlers/html.js') as typeof import('mathjax-full/js/handlers/html.js');
    const { AllPackages } =
      require('mathjax-full/js/input/tex/AllPackages.js') as typeof import('mathjax-full/js/input/tex/AllPackages.js');
    const { STATE } =
      require('mathjax-full/js/core/MathItem.js') as typeof import('mathjax-full/js/core/MathItem.js');
    const { SerializedMmlVisitor } =
      require('mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js') as typeof import('mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js');
    const sre = require('speech-rule-engine') as {
      setupEngine: (options: Record<string, string>) => Promise<unknown>;
      engineReady: () => Promise<unknown>;
      toSpeech: (mml: string) => string;
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    // No output, so no proofs package, which needs one.
    const document = mathjax.document('', {
      InputJax: new TeX({
        packages: AllPackages.filter((name) => name !== 'bussproofs'),
      }),
    });
    const visitor = new SerializedMmlVisitor();
    await sre.setupEngine({
      locale: 'en',
      domain: 'clearspeak',
      modality: 'speech',
    });
    await sre.engineReady();
    engine = (tex: string) =>
      sre.toSpeech(
        visitor.visitTree(
          document.convert(tex, { display: true, end: STATE.CONVERT }) as never,
        ),
      );
  })().catch(() => {
    // Without it, the reader of our own says the maths.
    starting = null;
  });
  return starting ?? Promise.resolve();
}

/** Whether the full reader has loaded. */
export const mathsSpeechReady = () => engine !== null;

/** Words for what a small reader can say of LaTeX: the common signs and shapes. */
const PLAIN: [RegExp, string][] = [
  [/\\frac\{1\}\{2\}/g, ' a half '],
  [/\\frac\{1\}\{4\}/g, ' a quarter '],
  [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, ' $1 over $2 '],
  [/\\sqrt\{([^{}]+)\}/g, ' the square root of $1 '],
  [/\^\{?2\}?/g, ' squared '],
  [/\^\{?3\}?/g, ' cubed '],
  [/\^\{([^{}]+)\}/g, ' to the power $1 '],
  [/\^(\w)/g, ' to the power $1 '],
  [/_\{([^{}]+)\}/g, ' $1 '],
  [/\\times|\\cdot/g, ' times '],
  [/\\div/g, ' divided by '],
  [/\\pm/g, ' plus or minus '],
  [/\\approx/g, ' is about '],
  [/\\neq/g, ' is not equal to '],
  [/\\le(?:q)?\b/g, ' is at most '],
  [/\\ge(?:q)?\b/g, ' is at least '],
  [/\\pi\b/g, ' pi '],
  [/\\infty/g, ' infinity '],
  [/\\%|%/g, ' percent '],
  [/\\(?:text|mathrm)\{([^{}]*)\}/g, ' $1 '],
  [/\\(?:left|right|,|;|!|quad|qquad)/g, ' '],
  [/\\[a-zA-Z]+/g, ' '],
  [/=/g, ' equals '],
  [/\+/g, ' plus '],
  [/(?<=[\w)}\s])-(?=[\s\w({])/g, ' minus '],
  [/[{}]/g, ' '],
  [/\s{2,}/g, ' '],
];

/**
 * A line of LaTeX as it is said aloud: by the Speech Rule Engine once it
 * has loaded, else by the small reader. Units and signs as a teacher
 * says them.
 */
export function sayLatex(tex: string): string {
  // Thousands are marked "{,}", as MathJax reads one number.
  let source = tex.replace(/(\d),(?=\d{3}(?!\d))/g, '$1{,}');
  for (const [pattern, to] of UNITS) source = source.replace(pattern, to);
  let said: string;
  if (engine) {
    try {
      said = engine(source);
    } catch {
      said = plain(source);
    }
  } else said = plain(source);
  for (const [pattern, to] of SAID) said = said.replace(pattern, to);
  return said.trim();
}

function plain(tex: string): string {
  let out = tex.replace(/\{,\}/g, ',');
  for (const [pattern, to] of PLAIN) out = out.replace(pattern, to);
  return out.trim();
}

/** Signs written in plain text, as words: "4 × 5 = 20". */
export const SIGNS: Record<string, string> = {
  '=': 'equals',
  '+': 'plus',
  '×': 'times',
  '÷': 'divided by',
  '−': 'minus',
  '±': 'plus or minus',
  '≈': 'is about',
  '≠': 'is not equal to',
  '≤': 'is at most',
  '≥': 'is at least',
  '√': 'the square root of',
  π: 'pi',
  '∞': 'infinity',
  '½': 'a half',
  '¼': 'a quarter',
  '¾': 'three quarters',
};
