/**
 * A small HTML parser — enough DOM for reading documentation sites.
 *
 * Not a general parser, and deliberately so: the import feature needs to walk
 * nav trees and lift headings, paragraphs, lists and code out of pages that
 * static-site generators produced, which is the well-formed end of the web.
 * The full grown-up alternative (linkedom/parse5) is a dependency this module
 * is shaped to be replaced by — everything downstream sees only `HtmlElement`
 * and the helpers, never the parsing.
 *
 * What it handles: nested elements, attributes in any quoting style, void
 * elements, script/style/template as raw text, comments, doctypes, common
 * entities, and the implied closes that actually occur in generated HTML
 * (`li`, `p`, `dt/dd`, table rows). What it does not: the full spec's error
 * recovery. A page mangled enough to defeat this parser will read wrongly in
 * the picker, where the reader can see it — not silently corrupt a document.
 */

export interface HtmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: (HtmlElement | string)[];
  parent: HtmlElement | null;
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** Content is raw text up to the matching close tag. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'template', 'noscript']);

/** Opening one of these implicitly closes an open element of the same kind. */
const IMPLIED_CLOSE: Record<string, Set<string>> = {
  li: new Set(['li']),
  p: new Set(['p']),
  dt: new Set(['dt', 'dd']),
  dd: new Set(['dt', 'dd']),
  tr: new Set(['tr']),
  td: new Set(['td', 'th']),
  th: new Set(['td', 'th']),
  option: new Set(['option']),
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  trade: '™',
  reg: '®',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  rarr: '→',
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (whole, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        const code = parseInt(body.slice(2), 16);
        return Number.isNaN(code) ? whole : String.fromCodePoint(code);
      }
      if (body.startsWith('#')) {
        const code = parseInt(body.slice(1), 10);
        return Number.isNaN(code) ? whole : String.fromCodePoint(code);
      }
      return ENTITIES[body] ?? whole;
    },
  );
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern =
    /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = {
    tag: '#root',
    attrs: {},
    children: [],
    parent: null,
  };
  let current = root;
  let index = 0;

  const pushText = (raw: string) => {
    if (raw) current.children.push(decodeEntities(raw));
  };

  const closeTo = (tag: string) => {
    let node: HtmlElement | null = current;
    while (node && node !== root) {
      if (node.tag === tag) {
        current = node.parent ?? root;
        return;
      }
      node = node.parent;
    }
    // No matching open tag: a stray close, ignored.
  };

  while (index < html.length) {
    const open = html.indexOf('<', index);
    if (open === -1) {
      pushText(html.slice(index));
      break;
    }
    pushText(html.slice(index, open));

    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', open) || html.startsWith('<?', open)) {
      const end = html.indexOf('>', open);
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    const end = html.indexOf('>', open);
    if (end === -1) {
      pushText(html.slice(open));
      break;
    }

    const inside = html.slice(open + 1, end);
    index = end + 1;

    if (inside.startsWith('/')) {
      closeTo(inside.slice(1).trim().toLowerCase());
      continue;
    }

    const nameMatch = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(inside);
    if (!nameMatch) {
      // `<` that begins no real tag (e.g. "a < b") — keep it as text.
      pushText(html.slice(open, end + 1));
      continue;
    }

    const tag = nameMatch[1].toLowerCase();
    const selfClosing = inside.endsWith('/');
    const attrSource = inside.slice(
      nameMatch[1].length,
      selfClosing ? -1 : undefined,
    );

    const implied = IMPLIED_CLOSE[tag];
    if (implied && current.tag !== '#root' && implied.has(current.tag)) {
      current = current.parent ?? root;
    }

    const element: HtmlElement = {
      tag,
      attrs: parseAttrs(attrSource),
      children: [],
      parent: current,
    };
    current.children.push(element);

    if (selfClosing || VOID_TAGS.has(tag)) continue;

    if (RAW_TEXT_TAGS.has(tag)) {
      const closer = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = html.slice(index);
      const match = closer.exec(rest);
      const rawEnd = match ? index + match.index : html.length;
      element.children.push(html.slice(index, rawEnd));
      index = match ? rawEnd + match[0].length : html.length;
      continue;
    }

    current = element;
  }

  return root;
}

export function walk(
  node: HtmlElement,
  visit: (element: HtmlElement, depth: number) => void | false,
  depth = 0,
): void {
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (visit(child, depth) === false) continue; // false = don't descend
    walk(child, visit, depth + 1);
  }
}

export function findAll(
  node: HtmlElement,
  predicate: (element: HtmlElement) => boolean,
): HtmlElement[] {
  const found: HtmlElement[] = [];
  walk(node, (element) => {
    if (predicate(element)) found.push(element);
  });
  return found;
}

export function findFirst(
  node: HtmlElement,
  predicate: (element: HtmlElement) => boolean,
): HtmlElement | null {
  return findAll(node, predicate)[0] ?? null;
}

/** Visible text, whitespace collapsed; script/style contribute nothing. */
export function textOf(node: HtmlElement): string {
  const parts: string[] = [];
  const gather = (element: HtmlElement) => {
    if (RAW_TEXT_TAGS.has(element.tag)) return;
    for (const child of element.children) {
      if (typeof child === 'string') parts.push(child);
      else gather(child);
    }
  };
  gather(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Text with line structure kept — for `<pre>`, where whitespace is meaning.
 * Only the raw text nodes are joined; nested spans (syntax highlighting)
 * contribute their text in order.
 */
export function rawTextOf(node: HtmlElement): string {
  const parts: string[] = [];
  const gather = (element: HtmlElement) => {
    for (const child of element.children) {
      if (typeof child === 'string') parts.push(child);
      else if (child.tag === 'br') parts.push('\n');
      else gather(child);
    }
  };
  gather(node);
  return parts.join('');
}

export function classOf(element: HtmlElement): string {
  return element.attrs.class ?? '';
}

/** True when the element's class or id matches the pattern. */
export function classOrIdMatches(
  element: HtmlElement,
  pattern: RegExp,
): boolean {
  return (
    pattern.test(element.attrs.class ?? '') ||
    pattern.test(element.attrs.id ?? '')
  );
}

export function ancestors(element: HtmlElement): HtmlElement[] {
  const chain: HtmlElement[] = [];
  let node = element.parent;
  while (node) {
    chain.push(node);
    node = node.parent;
  }
  return chain;
}
