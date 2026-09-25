/**
 * Office's maths, as LaTeX. PowerPoint and Word keep an equation as Office
 * Math Markup (OMML): runs of text inside fractions, powers, roots,
 * brackets and big operators. Read as plain text it is symbol soup ("x2+
 * 3x=10" for x² + 3x = 10); read as structure it is exact LaTeX, which
 * the rest of the pipeline typesets, checks and says aloud.
 */
import { parseDocument } from 'htmlparser2';
import { Element, Text, type ChildNode } from 'domhandler';

const kids = (node: Element): Element[] =>
  node.children.filter((child): child is Element => child instanceof Element);

/** A child element by its name, "m:num". */
const child = (node: Element, name: string): Element | undefined =>
  kids(node).find((one) => one.name === name);

/** A property's value: <m:chr m:val="∑"/>. */
const prop = (node: Element | undefined, name: string): string | undefined =>
  node ? child(node, name)?.attribs['m:val'] : undefined;

/** Characters that mean something in LaTeX, as LaTeX writes them. */
const CHARACTERS: Record<string, string> = {
  '×': '\\times ',
  '÷': '\\div ',
  '·': '\\cdot ',
  '⋅': '\\cdot ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\neq ',
  '≈': '\\approx ',
  '≡': '\\equiv ',
  '→': '\\to ',
  '⇒': '\\Rightarrow ',
  '∞': '\\infty ',
  '∂': '\\partial ',
  '∇': '\\nabla ',
  '∈': '\\in ',
  '∑': '\\sum ',
  '∏': '\\prod ',
  '∫': '\\int ',
  '∬': '\\iint ',
  '∮': '\\oint ',
  '√': '\\sqrt ',
  '°': '^{\\circ}',
  '−': '-',
  '′': "'",
  α: '\\alpha ',
  β: '\\beta ',
  γ: '\\gamma ',
  δ: '\\delta ',
  ε: '\\varepsilon ',
  θ: '\\theta ',
  λ: '\\lambda ',
  μ: '\\mu ',
  π: '\\pi ',
  ρ: '\\rho ',
  σ: '\\sigma ',
  τ: '\\tau ',
  φ: '\\varphi ',
  ω: '\\omega ',
  Δ: '\\Delta ',
  Σ: '\\Sigma ',
  Ω: '\\Omega ',
  '{': '\\{',
  '}': '\\}',
  '%': '\\%',
  '#': '\\#',
  '&': '\\&',
  _: '\\_',
};

const escape = (text: string) =>
  [...text].map((c) => CHARACTERS[c] ?? c).join('');

/** Function names written as words: sin, log. */
const FUNCTION_NAMES = new Set([
  'sin',
  'cos',
  'tan',
  'sec',
  'csc',
  'cot',
  'sinh',
  'cosh',
  'tanh',
  'ln',
  'log',
  'exp',
  'lim',
  'max',
  'min',
]);

/** The LaTeX of an element's children, in order. */
const all = (nodes: ChildNode[]): string =>
  nodes
    .map((node) =>
      node instanceof Element ? latexOf(node) : node instanceof Text ? '' : '',
    )
    .join('');

/** A part as a braced group. */
const group = (node: Element | undefined) =>
  `{${node ? all(node.children) : ''}}`;

/** One OMML element as LaTeX. */
function latexOf(node: Element): string {
  switch (node.name) {
    case 'm:r': {
      const text = kids(node)
        .filter((one) => one.name === 'm:t')
        .map((one) =>
          one.children.map((c) => (c instanceof Text ? c.data : '')).join(''),
        )
        .join('');
      const word = text.trim();
      if (FUNCTION_NAMES.has(word)) return `\\${word} `;
      // Plain words inside an equation: a label or a unit.
      if (child(node, 'm:rPr') && child(child(node, 'm:rPr')!, 'm:nor'))
        return `\\text{${text}}`;
      return escape(text);
    }
    case 'm:f':
      return `\\frac${group(child(node, 'm:num'))}${group(child(node, 'm:den'))}`;
    case 'm:sSup':
      return `${group(child(node, 'm:e'))}^${group(child(node, 'm:sup'))}`;
    case 'm:sSub':
      return `${group(child(node, 'm:e'))}_${group(child(node, 'm:sub'))}`;
    case 'm:sSubSup':
      return `${group(child(node, 'm:e'))}_${group(child(node, 'm:sub'))}^${group(child(node, 'm:sup'))}`;
    case 'm:sPre':
      return `{}_${group(child(node, 'm:sub'))}^${group(child(node, 'm:sup'))}${group(child(node, 'm:e'))}`;
    case 'm:rad': {
      const degree = child(node, 'm:deg');
      const shown = degree && all(degree.children).trim();
      return shown
        ? `\\sqrt[${shown}]${group(child(node, 'm:e'))}`
        : `\\sqrt${group(child(node, 'm:e'))}`;
    }
    case 'm:d': {
      const pr = child(node, 'm:dPr');
      const open = prop(pr, 'm:begChr') ?? '(';
      const close = prop(pr, 'm:endChr') ?? ')';
      const separator = prop(pr, 'm:sepChr') ?? '|';
      const parts = kids(node)
        .filter((one) => one.name === 'm:e')
        .map((one) => all(one.children));
      const side = (c: string) =>
        c === ''
          ? '.'
          : c === '{'
            ? '\\{'
            : c === '}'
              ? '\\}'
              : c === '|'
                ? '|'
                : c;
      return `\\left${side(open)}${parts.join(escape(separator))}\\right${side(close)}`;
    }
    case 'm:nary': {
      const pr = child(node, 'm:naryPr');
      const chr = prop(pr, 'm:chr') ?? '∫';
      const op = (CHARACTERS[chr] ?? chr).trim();
      const sub = child(node, 'm:sub');
      const sup = child(node, 'm:sup');
      const low = sub && all(sub.children).trim() ? `_${group(sub)}` : '';
      const high = sup && all(sup.children).trim() ? `^${group(sup)}` : '';
      return `${op}${low}${high}${group(child(node, 'm:e'))}`;
    }
    case 'm:func':
      return `${all(child(node, 'm:fName')?.children ?? [])}${group(child(node, 'm:e'))}`;
    case 'm:limLow':
      return `${all(child(node, 'm:e')?.children ?? [])}_${group(child(node, 'm:lim'))}`;
    case 'm:limUpp':
      return `${all(child(node, 'm:e')?.children ?? [])}^${group(child(node, 'm:lim'))}`;
    case 'm:acc': {
      const chr = prop(child(node, 'm:accPr'), 'm:chr') ?? '\u0302';
      const accent =
        chr === '\u0304' || chr === '¯'
          ? 'bar'
          : chr === '\u20D7' || chr === '→'
            ? 'vec'
            : chr === '\u0307'
              ? 'dot'
              : chr === '\u0303'
                ? 'tilde'
                : 'hat';
      return `\\${accent}${group(child(node, 'm:e'))}`;
    }
    case 'm:bar':
      return `\\overline${group(child(node, 'm:e'))}`;
    case 'm:eqArr':
      return kids(node)
        .filter((one) => one.name === 'm:e')
        .map((one) => all(one.children))
        .join(' \\\\ ');
    case 'm:m':
      return `\\begin{matrix}${kids(node)
        .filter((one) => one.name === 'm:mr')
        .map((row) =>
          kids(row)
            .filter((one) => one.name === 'm:e')
            .map((one) => all(one.children))
            .join(' & '),
        )
        .join(' \\\\ ')}\\end{matrix}`;
    // Properties describe; they say nothing.
    case 'm:rPr':
    case 'm:ctrlPr':
    case 'm:fPr':
    case 'm:dPr':
    case 'm:naryPr':
    case 'm:radPr':
    case 'm:sSupPr':
    case 'm:sSubPr':
    case 'm:funcPr':
    case 'm:accPr':
    case 'm:oMathParaPr':
    case 'w:rPr':
    case 'a:rPr':
      return '';
    default:
      return all(node.children);
  }
}

/** One equation, <m:oMath>, as LaTeX. */
export function ommlToLatex(math: Element): string {
  return all(math.children).replace(/\s+/g, ' ').trim();
}

/** Every equation in a piece of XML, as LaTeX, in order. */
export function equationsIn(xml: string): string[] {
  const doc = parseDocument(xml, { xmlMode: true });
  const out: string[] = [];
  const visit = (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      if (node.name === 'm:oMath') out.push(ommlToLatex(node));
      else visit(node.children);
    }
  };
  visit(doc.children);
  return out.filter(Boolean);
}
