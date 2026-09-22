import {
  framedBox,
  gateDrawing,
  inspectSvg,
  numbersSane,
  sanitizeCss,
  svgFromReply,
} from './scene-svg';

const leaf = {
  parts: [
    { name: 'chloroplasts', label: true },
    { name: 'stomata', label: true },
  ],
  states: [{ name: 'lit', look: 'glowing' }],
  motion: 'bubbles rise',
};

const good = `Here is the drawing:
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600">
  <style>
    @keyframes rise { to { transform: translateY(-70px); opacity: 0 } }
    .bubble { animation: rise 2.6s ease-out infinite }
  </style>
  <rect width="100%" height="100%" fill="#fff"/>
  <g id="leaf"><path d="M100 300 Q480 60 860 300 Q480 540 100 300 Z" fill="#6c6"/></g>
  <g id="Chloroplasts"><ellipse cx="400" cy="300" rx="30" ry="14" fill="#2a2"/></g>
  <g id="chloroplasts-label"><line x1="400" y1="300" x2="400" y2="120"/><text x="400" y="110" font-size="30">chloroplasts</text></g>
  <g id="stomata"><circle class="bubble" cx="480" cy="480" r="10"/></g>
  <g id="stomata_label"><text x="560" y="520" font-size="30">stomata</text></g>
  <g id="lit"><circle cx="480" cy="300" r="60" fill="yellow"/></g>
</svg>
\`\`\``;

describe('the gate', () => {
  it('takes the markup out of whatever the artist said around it', () => {
    expect(svgFromReply(good)?.startsWith('<svg')).toBe(true);
    expect(svgFromReply('no drawing here')).toBeNull();
  });

  it('reduces CSS to what stays inside the drawing', () => {
    const css = sanitizeCss(
      '@import url(https://evil.test/x.css); .a { fill: url(#grad); } .b { fill: url(https://evil.test/p.png) } .c { width: expression(alert(1)); color: red } .d { animation: spin 0.2s linear infinite 0.1s }',
    );
    expect(css).not.toMatch(/import|evil|expression/);
    expect(css).toContain('url(#grad)');
    expect(css).toContain('color: red');
    // The flash is slowed; the delay after it is left alone.
    expect(css).toContain('spin 1s linear infinite 0.1s');
  });

  it('closes every way a drawing could run script or reach outside', () => {
    const inspected = inspectSvg(
      `<svg viewBox="0 0 100 100" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject><div>hi</div></foreignObject>
        <image href="https://evil.test/a.png"/>
        <a href="javascript:alert(1)"><circle cx="50" cy="50" r="40" onclick="x()"/></a>
        <animate attributeName="href" to="javascript:alert(1)"/>
        <use href="https://evil.test/sprite.svg#a"/>
        <use href="#kept"/>
        <rect id="r" style="fill: url(http://evil.test)" width="10" height="10"/>
      </svg>`,
      { parts: [], states: [], motion: '' },
    );
    if (!inspected.root) throw new Error('should parse');
    expect(JSON.stringify(inspected.root.attribs)).not.toContain('onload');
    // What went inside something removed is not reported twice.
    expect(inspected.mended).not.toContain('removed <div>');
    const names: string[] = [];
    const visit = (node: {
      name?: string;
      attribs?: Record<string, string>;
      children?: unknown[];
    }) => {
      if (node.name) names.push(`${node.name}${JSON.stringify(node.attribs)}`);
      for (const child of node.children ?? []) visit(child as typeof node);
    };
    visit(inspected.root);
    const all = names.join('\n');
    expect(all).not.toMatch(
      /script|foreignObject|<image|javascript|evil|onclick/i,
    );
    expect(all).toContain('#kept');
    // The link is unwrapped, and what it held stays.
    expect(all).toContain('circle');
  });

  it('finds parts, labels and states whatever the ids are spelled like', () => {
    const inspected = inspectSvg(good, leaf);
    if (!inspected.root) throw new Error('should parse');
    expect(inspected.short.missingParts).toEqual([]);
    expect(inspected.short.missingLabels).toEqual([]);
    expect(inspected.short.missingStates).toEqual([]);
    expect(inspected.short.still).toBe(false);
    expect(inspected.mended).toContain('removed a backdrop');
  });

  it('says a drawing without its parts or its motion is worth drawing again', async () => {
    const result = await gateDrawing(
      '<svg viewBox="0 0 800 800"><circle cx="400" cy="400" r="300" fill="#6c6"/></svg>',
      leaf,
    );
    expect(result.drawing).not.toBeNull();
    expect(result.retry).toBe(true);
    expect(result.notes.join(' ')).toMatch(/chloroplasts/);
    expect(result.notes.join(' ')).toMatch(/Nothing moves/);
    expect(result.score).toBeLessThan(100);
  });

  it('passes a drawing that is as asked, framed round its ink', async () => {
    const result = await gateDrawing(good, leaf);
    expect(result.drawing).not.toBeNull();
    expect(result.retry).toBe(false);
    expect(result.drawing!.parts.chloroplasts).toBe('Chloroplasts');
    expect(result.drawing!.labels.stomata).toBe('stomata_label');
    expect(result.drawing!.states.lit).toBe('lit');
    expect(result.drawing!.moves).toBe(true);
    expect(result.drawing!.svg).not.toContain('100%');
  });

  it('pulls the frame in round a small drawing in a big canvas', async () => {
    const result = await gateDrawing(
      '<svg viewBox="0 0 800 800"><rect x="100" y="100" width="120" height="80" fill="#333"/><circle cx="160" cy="140" r="20" fill="#f00"/></svg>',
      { parts: [], states: [], motion: '' },
    );
    const box = result.drawing!.viewBox;
    expect(box[2]).toBeLessThan(200);
    expect(box[0]).toBeGreaterThan(80);
  });

  it('refuses a blank drawing and one whose numbers would crash the renderer', async () => {
    const blank = await gateDrawing('<svg viewBox="0 0 800 800"><g/></svg>', {
      parts: [],
      states: [],
      motion: '',
    });
    expect(blank.drawing).toBeNull();
    const root = (svg: string) =>
      inspectSvg(svg, { parts: [], states: [], motion: '' }).root!;
    expect(
      numbersSane(
        root('<svg viewBox="0 0 10 10"><rect width="1e12" height="4"/></svg>'),
      ),
    ).toBe(false);
    expect(
      numbersSane(
        root('<svg viewBox="0 0 10 10"><rect width="12" height="NaN"/></svg>'),
      ),
    ).toBe(false);
    expect(
      numbersSane(
        root('<svg viewBox="0 0 10 10"><rect width="12" height="4"/></svg>'),
      ),
    ).toBe(true);
    // A colour is not a number: #1e90ff once read as 1e90 and sent a good drawing back.
    expect(
      numbersSane(
        root(
          '<svg viewBox="0 0 10 10"><rect width="12" height="4" fill="#1e90ff" stroke="#2e8b57"/></svg>',
        ),
      ),
    ).toBe(true);
  });

  it('takes out a title that repeats the caption, and keeps a part named after the whole', () => {
    const inspected = inspectSvg(
      `<svg viewBox="0 0 400 300"><g id="body"><ellipse cx="200" cy="150" rx="120" ry="80"/></g>
        <text x="200" y="280">The Kidney</text>
        <g id="kidney-cortex-label"><text x="20" y="20">Kidney cortex</text></g>
        <g id="kidney-cortex"><path d="M100 100 L150 150"/></g></svg>`,
      {
        name: 'Kidney',
        parts: [{ name: 'kidney cortex', label: true }],
        states: [],
        motion: '',
      },
    );
    if (!inspected.root) throw new Error('should parse');
    const texts: string[] = [];
    const visit = (node: {
      name?: string;
      children?: unknown[];
      data?: string;
      type?: string;
    }) => {
      if (node.type === 'text' && node.data?.trim())
        texts.push(node.data.trim());
      for (const child of node.children ?? []) visit(child as typeof node);
    };
    visit(inspected.root);
    expect(texts).toEqual(['Kidney cortex']);
    expect(inspected.mended).toContain(
      'removed a title that repeated the caption',
    );
  });

  it('grows the frame for a label a few units over the edge rather than cut it', () => {
    const box = framedBox([0, 0, 960, 600], {
      x: 62,
      y: 57,
      width: 901.2,
      height: 492,
    });
    expect(box[0] + box[2]).toBeGreaterThan(963.2);
    expect(box[0]).toBeLessThanOrEqual(0);
  });

  it('takes the first drawing whole from a reply that offers two', () => {
    const reply =
      'One:\n<svg viewBox="0 0 10 10"><svg x="1"><rect/></svg><circle/></svg>\nOr:\n<svg viewBox="0 0 5 5"><rect/></svg>';
    expect(svgFromReply(reply)).toBe(
      '<svg viewBox="0 0 10 10"><svg x="1"><rect/></svg><circle/></svg>',
    );
  });
});
