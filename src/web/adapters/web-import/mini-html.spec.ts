import {
  decodeEntities,
  findAll,
  parseHtml,
  rawTextOf,
  textOf,
} from './mini-html';
import { discoverNav, pagesFromSitemap } from './nav-discovery';

describe('parseHtml', () => {
  it('builds a tree with attributes in any quoting style', () => {
    const root = parseHtml(
      '<div class="a" id=\'b\' data-x=c hidden><span>hi</span></div>',
    );
    const div = findAll(root, (el) => el.tag === 'div')[0];
    expect(div.attrs).toEqual({
      class: 'a',
      id: 'b',
      'data-x': 'c',
      hidden: '',
    });
    expect(textOf(div)).toBe('hi');
  });

  it('treats script and style as raw text, not markup', () => {
    const root = parseHtml(
      '<p>before</p><script>if (a < b) { document.write("<div>") }</script><p>after</p>',
    );
    expect(findAll(root, (el) => el.tag === 'div')).toHaveLength(0);
    expect(findAll(root, (el) => el.tag === 'p')).toHaveLength(2);
  });

  it('closes li implicitly, the way generated navs rely on', () => {
    const root = parseHtml('<ul><li>one<li>two<li>three</ul>');
    const items = findAll(root, (el) => el.tag === 'li');
    expect(items.map(textOf)).toEqual(['one', 'two', 'three']);
    // All three are siblings, not a nesting staircase.
    expect(items.every((item) => item.parent?.tag === 'ul')).toBe(true);
  });

  it('keeps stray angle brackets as text', () => {
    const root = parseHtml('<p>x < y and y > z</p>');
    expect(textOf(root)).toBe('x < y and y > z');
  });

  it('preserves line structure inside pre through highlighting spans', () => {
    const root = parseHtml(
      '<pre><code><span>def f():</span>\n<span>    return 1</span></code></pre>',
    );
    const pre = findAll(root, (el) => el.tag === 'pre')[0];
    expect(rawTextOf(pre)).toBe('def f():\n    return 1');
  });

  it('decodes common and numeric entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#8594; &#x2192;')).toBe(
      'a & b <c> → →',
    );
  });
});

describe('discoverNav', () => {
  const BASE = 'https://docs.example.com/guide/intro';

  it('reads a sidebar in DOM order with depth, deduped and same-origin only', () => {
    const html = `
      <html><head><title>Intro | Example Docs</title></head><body>
      <nav class="sidebar"><ul>
        <li><a href="/guide/intro">Introduction</a></li>
        <li><a href="/guide/setup/">Setup</a>
          <ul>
            <li><a href="/guide/setup/install">Install</a></li>
            <li><a href="/guide/setup/install#linux">Install</a></li>
            <li><a href="https://elsewhere.com/x">External</a></li>
          </ul>
        </li>
        <li><a href="/guide/usage/index.html">Usage</a></li>
      </ul></nav>
      <main><a href="/unrelated">Skip to content</a></main>
      </body></html>`;

    const nav = discoverNav(html, BASE);
    expect(nav.title).toBe('Example Docs');
    expect(nav.pages.map((p) => [p.url, p.depth])).toEqual([
      ['https://docs.example.com/guide/intro', 0],
      ['https://docs.example.com/guide/setup', 0],
      ['https://docs.example.com/guide/setup/install', 1],
      ['https://docs.example.com/guide/usage', 0],
    ]);
  });

  it('recognises a Docusaurus sidebar by its theme classes', () => {
    const html = `
      <html><head><meta name="generator" content="Docusaurus v3.1"></head><body>
      <aside class="theme-doc-sidebar-container"><nav class="menu__list">
        <a class="menu__link" href="/docs/a">A</a>
        <a class="menu__link" href="/docs/b">B</a>
        <a class="menu__link" href="/docs/c">C</a>
      </nav></aside></body></html>`;

    const nav = discoverNav(html, 'https://site.com/docs/a');
    expect(nav.framework).toBe('Docusaurus');
    expect(nav.pages).toHaveLength(3);
  });

  it('returns no pages rather than guessing when there is no nav', () => {
    const nav = discoverNav('<html><body><p>hello</p></body></html>', BASE);
    expect(nav.pages).toEqual([]);
  });
});

describe('pagesFromSitemap', () => {
  it('confines to the path prefix and orders by path', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://docs.example.com/guide/z-last</loc></url>
      <url><loc>https://docs.example.com/guide/a-first</loc></url>
      <url><loc>https://docs.example.com/blog/post</loc></url>
      <url><loc>https://other.com/guide/x</loc></url>
    </urlset>`;

    const pages = pagesFromSitemap(xml, 'https://docs.example.com/guide/intro');
    expect(pages.map((p) => p.url)).toEqual([
      'https://docs.example.com/guide/a-first',
      'https://docs.example.com/guide/z-last',
    ]);
  });
});
