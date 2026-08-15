import { extractBlocks } from './content-extract';

describe('extractBlocks', () => {
  it('lifts headings, prose, lists and code from the content region only', () => {
    const html = `
      <html><body>
        <nav class="sidebar"><a href="/x">Not content</a></nav>
        <main>
          <h1>Installation</h1>
          <p>Install the package with your package manager.</p>
          <pre><code>npm install example
cd example</code></pre>
          <h2>Requirements</h2>
          <ul><li>Node 18+</li><li>A terminal</li></ul>
        </main>
        <footer><p>© Example</p></footer>
      </body></html>`;

    const { title, blocks } = extractBlocks(html);
    expect(title).toBe('Installation');
    expect(blocks).toEqual([
      { type: 'headingOne', text: 'Installation' },
      {
        type: 'paragraph',
        text: 'Install the package with your package manager.',
      },
      { type: 'code', text: 'npm install example\ncd example' },
      { type: 'headingOne', text: 'Requirements' },
      { type: 'bullet', text: 'Node 18+' },
      { type: 'bullet', text: 'A terminal' },
    ]);
  });

  it('keeps code indentation through syntax-highlighting spans', () => {
    const html = `
      <main><pre><code><span class="k">def</span> <span>f():</span>
<span>    return 1</span></code></pre></main>`;
    const { blocks } = extractBlocks(html);
    expect(blocks).toEqual([{ type: 'code', text: 'def f():\n    return 1' }]);
  });

  it('flattens nested lists without duplicating parent text', () => {
    const html = `
      <main><ul>
        <li>Fruit
          <ul><li>Apple</li><li>Pear</li></ul>
        </li>
        <li>Veg</li>
      </ul></main>`;
    const { blocks } = extractBlocks(html);
    expect(blocks).toEqual([
      { type: 'bullet', text: 'Fruit' },
      { type: 'bullet', text: 'Apple' },
      { type: 'bullet', text: 'Pear' },
      { type: 'bullet', text: 'Veg' },
    ]);
  });

  it('keeps a table as a table block, pipes escaped', () => {
    const html = `
      <main><table>
        <tr><th>Version</th><th>Status</th></tr>
        <tr><td>1.x | 2.x</td><td>Supported</td></tr>
      </table></main>`;
    const { blocks } = extractBlocks(html);
    expect(blocks).toEqual([
      { type: 'table', text: 'Version | Status\n1.x ¦ 2.x | Supported' },
    ]);
  });

  it('skips in-content chrome like breadcrumbs and edit links', () => {
    const html = `
      <main>
        <div class="breadcrumbs"><a href="/">Home</a></div>
        <h1>Real</h1>
        <div class="theme-edit-this-page"><a href="/edit">Edit this page</a></div>
      </main>`;
    const { blocks } = extractBlocks(html);
    expect(blocks).toEqual([{ type: 'headingOne', text: 'Real' }]);
  });

  it('prefers the framework content container over body', () => {
    const html = `
      <body>
        <div class="promo"><p>Buy our merch and other things we sell, a long promotional sentence to clear the length gate.</p></div>
        <div class="theme-doc-markdown"><p>The actual documentation content of this page, which is also comfortably long enough to matter here.</p></div>
      </body>`;
    const { blocks } = extractBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('actual documentation');
  });
});

describe('figures', () => {
  it('collects content images with position, alt and resolved URLs', () => {
    const html = `
      <main>
        <h1>Widgets</h1>
        <p>The architecture is shown below.</p>
        <p><img src="/img/arch.png" alt="Architecture diagram"></p>
        <img src="https://cdn.example.com/pixel.gif">
        <img src="data:image/png;base64,AAAA">
        <p>More prose.</p>
      </main>`;
    const { figures, blocks } = extractBlocks(
      html,
      'https://docs.example.com/guide/widgets',
    );
    expect(figures).toEqual([
      {
        src: 'https://docs.example.com/img/arch.png',
        alt: 'Architecture diagram',
        afterBlock: 2,
      },
    ]);
    expect(blocks.map((b) => b.type)).toEqual([
      'headingOne',
      'paragraph',
      'paragraph',
    ]);
  });

  it('collects nothing without a base URL', () => {
    const { figures } = extractBlocks('<main><img src="/x.png"></main>');
    expect(figures).toEqual([]);
  });
});
