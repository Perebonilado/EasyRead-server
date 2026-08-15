/**
 * Reading a docs site's own table of contents.
 *
 * The nav tree is the ground truth for both scope (what the reader can pick)
 * and structure (what becomes a chapter), so discovery works down a ladder of
 * trust: the framework's own sidebar first, any recognisable nav container
 * second, the sitemap as a last resort. Order is DOM order throughout —
 * that IS the reading order, and sorting by URL would shuffle it.
 */
import {
  ancestors,
  classOrIdMatches,
  findAll,
  findFirst,
  parseHtml,
  textOf,
  type HtmlElement,
} from './mini-html';

export interface DiscoveredPage {
  url: string;
  title: string;
  /** Nesting depth in the nav tree; the picker indents by this. */
  depth: number;
}

export interface DiscoveredNav {
  title: string;
  framework: string | null;
  pages: DiscoveredPage[];
}

/** Framework fingerprints, checked against generator meta and signature DOM. */
const FRAMEWORKS: { name: string; sidebar: RegExp; fingerprint: RegExp }[] = [
  {
    name: 'Docusaurus',
    sidebar: /theme-doc-sidebar|menu__list/,
    fingerprint: /docusaurus/i,
  },
  {
    name: 'MkDocs',
    sidebar: /md-nav|wy-menu|nav-list/,
    fingerprint: /mkdocs/i,
  },
  {
    name: 'VitePress',
    sidebar: /VPSidebar|VPDocAsideOutline/,
    fingerprint: /vitepress/i,
  },
  {
    name: 'Sphinx',
    sidebar: /wy-menu|sphinxsidebar|toctree/,
    fingerprint: /sphinx/i,
  },
  {
    name: 'GitBook',
    sidebar: /book-summary|css-175oi2r/,
    fingerprint: /gitbook/i,
  },
  {
    name: 'Mintlify',
    sidebar: /sidebar-content|nav-group/,
    fingerprint: /mintlify/i,
  },
];

export function detectFramework(
  root: HtmlElement,
  html: string,
): string | null {
  const generator = findFirst(
    root,
    (el) =>
      el.tag === 'meta' && (el.attrs.name ?? '').toLowerCase() === 'generator',
  )?.attrs.content;

  for (const framework of FRAMEWORKS) {
    if (generator && framework.fingerprint.test(generator))
      return framework.name;
  }
  for (const framework of FRAMEWORKS) {
    if (framework.fingerprint.test(html)) return framework.name;
  }
  return null;
}

export function pageTitle(root: HtmlElement, fallback: string): string {
  const title = findFirst(root, (el) => el.tag === 'title');
  const text = title ? textOf(title) : '';
  // Docs titles carry the site name after a separator; the site name alone
  // is the better document title, so prefer the last segment's prefix.
  return (
    (text.split(/\s+[|·–—-]\s+/).pop() || text || fallback).trim() || fallback
  );
}

/** Anchors that are navigation chrome rather than content. */
const NOISE_TEXT =
  /^(skip to|edit this page|on this page|previous|next|home)$/i;

function normaliseUrl(href: string, base: URL): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.origin !== base.origin) return null;
  url.hash = '';
  // index.html and trailing slashes are the same page said three ways.
  url.pathname = url.pathname.replace(/\/index\.html?$/, '/');
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString();
}

/**
 * The best nav container: framework sidebar, else the nav/aside with the
 * most internal links — a docs page's densest link cluster is its ToC.
 */
function navContainer(
  root: HtmlElement,
  framework: string | null,
): HtmlElement | null {
  const spec = FRAMEWORKS.find((entry) => entry.name === framework);
  if (spec) {
    const themed = findFirst(root, (el) => classOrIdMatches(el, spec.sidebar));
    if (themed) return themed;
  }

  const candidates = findAll(
    root,
    (el) =>
      el.tag === 'nav' ||
      el.tag === 'aside' ||
      classOrIdMatches(
        el,
        /\b(sidebar|side-nav|sidenav|toc|table-of-contents|docs-nav|menu)\b/i,
      ),
  );

  let best: HtmlElement | null = null;
  let bestCount = 0;
  for (const candidate of candidates) {
    // A container nested in an already-counted better one shouldn't win.
    const links = findAll(
      candidate,
      (el) => el.tag === 'a' && Boolean(el.attrs.href),
    );
    if (links.length > bestCount) {
      best = candidate;
      bestCount = links.length;
    }
  }
  return bestCount >= 3 ? best : null;
}

/** Nav nesting depth: how many list levels sit between the link and the container. */
function depthWithin(link: HtmlElement, container: HtmlElement): number {
  let depth = 0;
  for (const ancestor of ancestors(link)) {
    if (ancestor === container) break;
    if (ancestor.tag === 'ul' || ancestor.tag === 'ol') depth += 1;
  }
  return Math.max(0, depth - 1);
}

export function discoverNav(html: string, baseUrl: string): DiscoveredNav {
  const root = parseHtml(html);
  const base = new URL(baseUrl);
  const framework = detectFramework(root, html.slice(0, 20_000));
  const container = navContainer(root, framework);

  const pages: DiscoveredPage[] = [];
  const seen = new Set<string>();

  if (container) {
    const links = findAll(
      container,
      (el) => el.tag === 'a' && Boolean(el.attrs.href),
    );
    for (const link of links) {
      const url = normaliseUrl(link.attrs.href, base);
      const title = textOf(link);
      if (!url || !title || NOISE_TEXT.test(title)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      pages.push({
        url,
        title: title.slice(0, 200),
        depth: depthWithin(link, container),
      });
    }
  }

  return { title: pageTitle(root, base.hostname), framework, pages };
}

/**
 * `sitemap.xml` fallback: a flat list confined to the entry URL's path
 * prefix, ordered by path so siblings at least stay together.
 */
export function pagesFromSitemap(
  xml: string,
  entryUrl: string,
): DiscoveredPage[] {
  const base = new URL(entryUrl);
  const prefix = base.pathname.replace(/\/[^/]*$/, '/');

  const pages: DiscoveredPage[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = normaliseUrl(match[1], base);
    if (!url) continue;
    const path = new URL(url).pathname;
    if (!path.startsWith(prefix)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    pages.push({
      url,
      title: decodeURIComponent(path.split('/').filter(Boolean).pop() ?? path)
        .replace(/[-_]/g, ' ')
        .replace(/\.\w+$/, ''),
      depth: 0,
    });
  }

  return pages.sort((a, b) => a.url.localeCompare(b.url));
}
