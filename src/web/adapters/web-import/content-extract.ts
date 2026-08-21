/**
 * One docs page → the block contract the rest of EasiRead speaks.
 *
 * Not Readability: docs pages mark their content region explicitly (`main`,
 * `article`, the framework's content class), so extraction here is choosing
 * the right container and walking it in order — headings, paragraphs, lists,
 * code — rather than scoring text density. Code is the load-bearing case:
 * `<pre>` survives with its whitespace intact, because for the developer
 * audience one mangled snippet discredits every simplified page around it.
 */
import type { Block } from '../../../contracts';
import {
  classOrIdMatches,
  findAll,
  findFirst,
  parseHtml,
  rawTextOf,
  textOf,
  type HtmlElement,
} from './mini-html';

/** Elements whose subtree is page chrome, not content. */
const CHROME_TAGS = new Set(['nav', 'aside', 'header', 'footer', 'form']);
const CHROME_CLASS =
  /\b(sidebar|breadcrumb|pagination|page-nav|prev-next|edit-page|toc|table-of-contents|announcement|banner|cookie|feedback|search)\b/i;

/** Content containers, most specific first. */
const CONTENT_SELECTORS: ((el: HtmlElement) => boolean)[] = [
  (el) =>
    classOrIdMatches(
      el,
      /\b(theme-doc-markdown|md-content|vp-doc|rst-content|markdown-body|docMainContainer)\b/i,
    ),
  (el) => el.tag === 'article',
  (el) => el.tag === 'main' || (el.attrs.role ?? '') === 'main',
];

const MAX_BLOCKS_PER_PAGE = 400;

export function contentRoot(root: HtmlElement): HtmlElement {
  for (const matches of CONTENT_SELECTORS) {
    const found = findFirst(root, matches);
    if (found && textOf(found).length > 80) return found;
  }
  const body = findFirst(root, (el) => el.tag === 'body');
  return body ?? root;
}

function isChrome(element: HtmlElement): boolean {
  return (
    CHROME_TAGS.has(element.tag) || classOrIdMatches(element, CHROME_CLASS)
  );
}

/**
 * A real table block: one row per line, cells pipe-separated. Pipes inside a
 * cell become a broken bar so they cannot masquerade as a separator.
 */
function tableBlocks(table: HtmlElement): Block[] {
  const rows = findAll(table, (el) => el.tag === 'tr');
  const lines: string[] = [];
  for (const row of rows.slice(0, 60)) {
    const cells = findAll(row, (el) => el.tag === 'td' || el.tag === 'th')
      .map((cell) => textOf(cell).replace(/\|/g, '¦'))
      .filter(Boolean);
    if (cells.length) lines.push(cells.join(' | '));
  }
  return lines.length ? [{ type: 'table', text: lines.join('\n') }] : [];
}

/** A figure found in the content, remembered at its reading position. */
export interface ExtractedFigure {
  /** Resolved absolute URL. */
  src: string;
  alt: string | null;
  /** The figure appears after this many blocks — its place in the flow. */
  afterBlock: number;
}

const MAX_FIGURES_PER_PAGE = 6;

/** Walk the content region in document order, emitting blocks and figures. */
export function extractBlocks(
  html: string,
  baseUrl?: string,
): {
  title: string | null;
  blocks: Block[];
  figures: ExtractedFigure[];
} {
  const root = parseHtml(html);
  const region = contentRoot(root);
  const blocks: Block[] = [];
  const figures: ExtractedFigure[] = [];
  let title: string | null = null;

  const noteFigure = (element: HtmlElement) => {
    if (!baseUrl || figures.length >= MAX_FIGURES_PER_PAGE) return;
    const src = element.attrs.src || element.attrs['data-src'] || '';
    // Inline data URIs are icons and trackers, not figures.
    if (!src || src.startsWith('data:')) return;
    let resolved: URL;
    try {
      resolved = new URL(src, baseUrl);
    } catch {
      return;
    }
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') return;
    // Obvious chrome: pixel trackers, favicons, badges.
    if (/pixel|favicon|badge|logo|avatar|emoji/i.test(resolved.pathname))
      return;
    figures.push({
      src: resolved.toString(),
      alt: (element.attrs.alt ?? '').trim() || null,
      afterBlock: blocks.length,
    });
  };

  const emit = (block: Block) => {
    const text = block.text.trim();
    if (!text) return;
    if (blocks.length >= MAX_BLOCKS_PER_PAGE) return;
    blocks.push({ ...block, text });
  };

  // Sphinx and MkDocs append a "¶" headerlink anchor to every heading; it's
  // navigation chrome, not part of the heading's words.
  const headingText = (element: HtmlElement): string =>
    textOf(element).replace(/\s*¶\s*$/, '');

  const visit = (element: HtmlElement): void => {
    if (isChrome(element)) return;

    if (element.tag === 'img') {
      noteFigure(element);
      return;
    }

    switch (element.tag) {
      case 'h1': {
        const text = headingText(element);
        if (!title) title = text;
        emit({ type: 'headingOne', text });
        return;
      }
      case 'h2':
        emit({ type: 'headingOne', text: headingText(element) });
        return;
      case 'h3':
      case 'h4':
        emit({ type: 'headingTwo', text: headingText(element) });
        return;
      case 'pre':
        emit({
          type: 'code',
          text: rawTextOf(element).replace(/^\n+|\s+$/g, ''),
        });
        return;
      case 'p':
      case 'blockquote': {
        // Figures often live inside paragraphs; note them before the text so
        // they keep their reading position.
        for (const img of findAll(element, (el) => el.tag === 'img')) {
          noteFigure(img);
        }
        // A paragraph that only wraps a pre (some highlighters do) descends.
        const pre = findFirst(element, (el) => el.tag === 'pre');
        if (pre) {
          emit({
            type: 'code',
            text: rawTextOf(pre).replace(/^\n+|\s+$/g, ''),
          });
          return;
        }
        emit({ type: 'paragraph', text: textOf(element) });
        return;
      }
      case 'li': {
        // Nested lists flatten; the bullet carries its own line only.
        const own = element.children
          .filter(
            (child) =>
              typeof child === 'string' ||
              (child.tag !== 'ul' && child.tag !== 'ol'),
          )
          .map((child) => (typeof child === 'string' ? child : textOf(child)))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        emit({ type: 'bullet', text: own });
        for (const child of element.children) {
          if (
            typeof child !== 'string' &&
            (child.tag === 'ul' || child.tag === 'ol')
          ) {
            visit(child);
          }
        }
        return;
      }
      case 'table':
        for (const block of tableBlocks(element)) emit(block);
        return;
      case 'dt':
        emit({ type: 'headingTwo', text: headingText(element) });
        return;
      case 'dd':
        emit({ type: 'paragraph', text: textOf(element) });
        return;
      default:
        for (const child of element.children) {
          if (typeof child !== 'string') visit(child);
        }
    }
  };

  visit(region);
  return { title, blocks, figures };
}
