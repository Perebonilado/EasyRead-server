import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Element } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { elements, walk } from './scene-dom';
import { FIGURE_INK, HOUSE_PALETTE, KIT_LINE, lineFor } from './scene-ink';
import {
  deltaE,
  describePolish,
  findStrays,
  flatPaint,
  gradientMiddle,
  inkAndLine,
  inlinePaint,
  paintOf,
  parseColour,
  polishDrawing,
  snapColours,
  styleFaults,
  styleReport,
} from './scene-polish';
import type { GatedDrawing } from './scene-svg';

function parse(svg: string): Element {
  return elements(parseDocument(svg, { xmlMode: true }).children).find(
    (node) => node.name === 'svg',
  )!;
}

function drawingOf(
  svg: string,
  viewBox: [number, number, number, number],
  parts: Record<string, string> = {},
  states: Record<string, string> = {},
): GatedDrawing {
  return {
    svg,
    viewBox,
    aspect: viewBox[2] / viewBox[3],
    parts,
    labels: {},
    states,
    moves: false,
    callouts: [],
    field: null,
  };
}

/** Every shape by its kind and where it is: what "the same shape" means. */
const GEOMETRY = [
  'd',
  'points',
  'x',
  'y',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'x1',
  'y1',
  'x2',
  'y2',
  'transform',
];
const SHAPES = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);
const shapesOf = (svg: string) =>
  [...walk(parse(svg))]
    .filter((node) => SHAPES.has(node.name))
    .map((node) =>
      [node.name, ...GEOMETRY.map((k) => node.attribs[k] ?? '')].join('|'),
    );
const idsOf = (svg: string) =>
  [...walk(parse(svg))].map((node) => node.attribs.id).filter(Boolean);

describe('colours', () => {
  it('reads a colour however it is written', () => {
    expect(parseColour('#fff')).toEqual([255, 255, 255]);
    expect(parseColour('#2D2A32')).toEqual([45, 42, 50]);
    expect(parseColour('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColour('saddlebrown')).toEqual([139, 69, 19]);
    expect(parseColour('none')).toBeNull();
    expect(parseColour('url(#g)')).toBeNull();
  });

  it('tells how far apart two colours look', () => {
    expect(deltaE([255, 255, 255], [255, 255, 255])).toBe(0);
    expect(deltaE([0, 0, 0], [255, 255, 255])).toBeGreaterThan(99);
  });

  it('brings a colour to the house colour near it, and leaves one near none', () => {
    const map = snapColours(['#8a5f3d', '#123456']);
    expect(map.get('#8a5f3d')).toBe('#8b5e3c');
    expect(map.has('#123456')).toBe(false);
  });

  it('keeps two colours that were different different: only the nearer takes a house colour', () => {
    const map = snapColours(['#8b5e3c', '#8d5f3e'], ['#8b5e3c']);
    expect(map.get('#8b5e3c')).toBe('#8b5e3c');
    expect(map.has('#8d5f3e')).toBe(false);
  });

  it('has one entry a colour in the house palette', () => {
    const hexes = HOUSE_PALETTE.map((one) => one.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});

describe('flat paint', () => {
  it('makes a gradient its middle colour, and takes it away', () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>',
    );
    expect(flatPaint(root)).toEqual({ gradients: 1, patterns: 0, filters: 0 });
    const rect = [...walk(root)].find((node) => node.name === 'rect')!;
    expect(rect.attribs.fill).toBe('#808080');
    expect([...walk(root)].some((node) => node.name === 'linearGradient')).toBe(
      false,
    );
  });

  it('takes the middle stop of three, and follows a gradient that borrows its stops', () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg"><linearGradient id="a"><stop offset="0%" stop-color="red"/><stop offset="50%" style="stop-color:#00ff00"/><stop offset="100%" stop-color="blue"/></linearGradient><radialGradient id="b" href="#a"/></svg>',
    );
    const ids = new Map(
      [...walk(root)]
        .filter((n) => n.attribs.id)
        .map((n) => [n.attribs.id, n] as [string, Element]),
    );
    expect(gradientMiddle(ids.get('b')!, ids)).toBe('#00ff00');
  });

  it('makes a pattern its commonest colour and takes filters off', () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><pattern id="p"><rect fill="#aa0000"/><rect fill="#aa0000"/><circle fill="#00aa00"/></pattern><filter id="f"><feGaussianBlur stdDeviation="2"/></filter></defs><circle r="5" style="fill:url(#p);filter:url(#f)"/></svg>',
    );
    expect(flatPaint(root)).toEqual({ gradients: 0, patterns: 1, filters: 1 });
    const circle = [...walk(root)].filter((node) => node.name === 'circle')[0];
    expect(circle.attribs.style).toBe('fill:#aa0000');
    expect([...walk(root)].some((node) => node.name === 'filter')).toBe(false);
    expect([...walk(root)].some((node) => node.name === 'pattern')).toBe(false);
  });
});

describe('paint said in CSS', () => {
  it('moves it onto the shapes it styles, leaving motion where it is', () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.ol{stroke:#553311;stroke-width:4;animation:spin 2s infinite}@keyframes spin{to{transform:rotate(1turn)}}</style><circle class="ol" r="4" fill="#ff0000"/><circle class="ol" r="4" style="stroke:#00ff00"/></svg>',
    );
    inlinePaint(root);
    const [one, two] = [...walk(root)].filter((node) => node.name === 'circle');
    expect(one.attribs.style).toBe('stroke:#553311;stroke-width:4');
    // What a shape said itself wins.
    expect(two.attribs.style).toBe('stroke:#00ff00;stroke-width:4');
    const css = [...walk(root)].find((node) => node.name === 'style')!;
    const text = (css.children[0] as unknown as { data: string }).data;
    expect(text).toContain('animation:spin 2s infinite');
    expect(text).toContain('@keyframes spin');
    expect(text).not.toContain('stroke:');
  });
});

describe('ink and line', () => {
  it('inks every outline and scales every line so the commonest is the target, detail keeping its weight', () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><g stroke="#5a3a1a" stroke-width="4"><circle cx="100" cy="100" r="50" fill="#c9a074"/><rect x="200" y="200" width="50" height="50" fill="#ffffff" stroke="#ff6699"/><path d="M0,0 L100,100" fill="none" stroke-width="2"/></g><ellipse cx="400" cy="400" rx="40" ry="30" fill="#f1e2c4" stroke="#f1e2c4" stroke-width="4"/></svg>',
    );
    const done = inkAndLine(root, 16);
    expect(done.from).toBe(4);
    const painted = paintOf(root);
    const [circle, rect, path, ellipse] = painted;
    expect(circle.stroke).toBe(FIGURE_INK);
    expect(circle.width).toBe(16);
    // A coloured outline round a filled shape is the kit's ink too.
    expect(rect.stroke).toBe(FIGURE_INK);
    // A detail line keeps its weight beside the outline: half of it.
    expect(path.width).toBe(8);
    // Stroked in its own colour, a shape keeps it: no outline was drawn.
    expect(ellipse.stroke).toBe('#f1e2c4');
    expect(root.attribs['stroke-linejoin']).toBe('round');
  });

  it('gives a shape that took the width of one the factor, through its transforms', () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg"><g transform="scale(2)"><circle r="50" fill="#fff" stroke="#000"/></g></svg>',
    );
    inkAndLine(root, 8);
    expect(paintOf(root)[0].width).toBe(8);
  });

  it("never lets a small shape's outline swallow it: an eye keeps its white, a brow is no blot", () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><g stroke="#2d2a32" stroke-width="3"><ellipse cx="400" cy="400" rx="300" ry="250" fill="#8b5e3c"/><circle cx="300" cy="300" r="15" fill="#ffffff"/><path d="M280,270 L310,262" fill="none"/></g></svg>',
    );
    inkAndLine(root, 20);
    const [body, eye, brow] = paintOf(root);
    expect(body.width).toBe(20);
    expect(eye.width).toBe(9);
    expect(brow.width).toBe(9);
  });

  it('works the outline out for the canvas: 2.6 of the kit on the stage', () => {
    expect(lineFor(800, 130)).toBe(16);
    expect(lineFor(600, 95)).toBe(16.4);
    expect(KIT_LINE).toBe(2.6);
  });
});

describe('strays', () => {
  // A dog of three shapes, a whisker at its muzzle, a ground line under
  // its feet, a floating speed line behind it, a speck in the air, and a
  // kite string held in its grip.
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">',
    '<g id="body"><ellipse cx="200" cy="160" rx="100" ry="60" fill="#8b5e3c" stroke="#2d2a32" stroke-width="4"/></g>',
    '<g id="head"><circle cx="300" cy="110" r="45" fill="#8b5e3c" stroke="#2d2a32" stroke-width="4"/>',
    '<path id="whisker" d="M335,120 L372,114" fill="none" stroke="#2d2a32" stroke-width="3"/></g>',
    '<g id="legs"><rect x="130" y="200" width="20" height="70" fill="#8b5e3c" stroke="#2d2a32" stroke-width="4"/><rect x="250" y="200" width="20" height="70" fill="#8b5e3c" stroke="#2d2a32" stroke-width="4"/></g>',
    '<path id="ground" d="M60,275 L360,276" fill="none" stroke="#2d2a32" stroke-width="4"/>',
    '<path id="speed" d="M40,120 L80,120 M40,140 L85,140" fill="none" stroke="#2d2a32" stroke-width="4"/>',
    '<circle id="speck" cx="60" cy="40" r="2" fill="#2d2a32"/>',
    '<g id="grip"><path id="string" d="M20,280 L20,20" fill="none" stroke="#2d2a32" stroke-width="2"/></g>',
    '</svg>',
  ].join('');

  it('finds the ground line, the floating lines and the speck, and never a whisker or what a grip holds', async () => {
    const root = parse(svg);
    const found = await findStrays(
      root,
      [0, 0, 400, 300],
      ['body', 'head', 'legs', 'grip'],
      {
        protect: ['grip'],
      },
    );
    expect(found.map((node) => node.attribs.id).sort()).toEqual([
      'ground',
      'speck',
      'speed',
    ]);
  }, 30_000);

  it('in a set, finds only a line lying on the ground on its own', async () => {
    const set = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">',
      '<rect width="1600" height="560" fill="#cfe6f3"/>',
      '<rect id="ground" y="560" width="1600" height="340" fill="#a7d58c"/>',
      '<rect id="stall" x="200" y="400" width="300" height="250" fill="#b9875f" stroke="#2d2a32" stroke-width="6"/>',
      '<path id="pane" d="M250,450 L450,450" fill="none" stroke="#2d2a32" stroke-width="6"/>',
      '<path id="line" d="M600,760 L1400,770" fill="none" stroke="#2d2a32" stroke-width="6"/>',
      '<path id="bird" d="M900,120 L920,135 L940,120" fill="none" stroke="#2d2a32" stroke-width="6"/>',
      '</svg>',
    ].join('');
    const found = await findStrays(parse(set), [0, 0, 1600, 900], [], {
      backdrop: true,
    });
    expect(found.map((node) => node.attribs.id)).toEqual(['line']);
  }, 30_000);
});

describe('the whole polish', () => {
  it('flattens, inks, scales, snaps and cleans, and says what it did', async () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">',
      '<defs><radialGradient id="fur"><stop offset="0" stop-color="#9a6a45"/><stop offset="1" stop-color="#7a4f2f"/></radialGradient></defs>',
      '<g id="body"><ellipse cx="200" cy="160" rx="100" ry="60" fill="url(#fur)" stroke="#402010" stroke-width="2" filter="url(#none)"/></g>',
      '<g id="legs"><rect x="130" y="200" width="20" height="70" fill="#8a5f3d" stroke="#402010" stroke-width="2"/><rect x="250" y="200" width="20" height="70" fill="#8a5f3d" stroke="#402010" stroke-width="2"/></g>',
      '<path d="M60,275 L360,276" fill="none" stroke="#402010" stroke-width="2"/>',
      '</svg>',
    ].join('');
    const { drawing, changes } = await polishDrawing(
      drawingOf(svg, [0, 0, 400, 300], { body: 'body', legs: 'legs' }),
      { line: 12 },
    );
    expect(changes.gradients).toBe(1);
    expect(changes.strays).toBe(1);
    expect(changes.line).toEqual({ from: 2, to: 12 });
    expect(changes.snapped).toBeGreaterThan(0);
    expect(describePolish(changes)).toMatch(/gradients made flat/);
    const report = styleReport(drawing.svg, KIT_LINE / 12);
    expect(styleFaults(report)).toEqual([]);
    expect(report.gradients).toBe(0);
    expect(drawing.svg).not.toContain('radialGradient');
  }, 30_000);

  it('works the line out from where the ink is, for a thing drawn at its true size', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><circle cx="120" cy="200" r="30" fill="#e0463a" stroke="#2d2a32" stroke-width="1"/></svg>';
    const seen: number[] = [];
    const { changes } = await polishDrawing(drawingOf(svg, [0, 0, 240, 240]), {
      line: (ink) => {
        seen.push(Math.round(ink.width));
        return 5;
      },
    });
    expect(seen).toEqual([61]);
    expect(changes.line.to).toBe(5);
  }, 30_000);
});

describe('Pip and Bingo, as the artist drew them: polished without a shape changed', () => {
  const cases: [string, [number, number, number, number]][] = [
    ['pip.svg', [212.73, 224.72, 463.25, 599.07]],
    ['bingo.svg', [228.75, 255.75, 369.5, 484.5]],
  ];
  const expressions = [
    'neutral',
    'happy',
    'sad',
    'angry',
    'afraid',
    'surprised',
    'thinking',
  ];
  for (const [file, viewBox] of cases)
    it(`keeps every shape of ${file} where it is, its groups and its colours' variety, in the house style`, async () => {
      const svg = readFileSync(join(__dirname, '__fixtures__', file), 'utf8');
      const states = Object.fromEntries(
        expressions
          .filter((name) => svg.includes(`id="${name}"`))
          .map((name) => [name, name]),
      );
      const line = lineFor(viewBox[3], 95);
      const { drawing, changes } = await polishDrawing(
        drawingOf(
          svg,
          viewBox,
          { head: 'head', body: 'body', legs: 'legs', arms: 'arms' },
          states,
        ),
        { line, protect: Object.values(states) },
      );
      expect(changes.strays).toBe(0);
      expect(shapesOf(drawing.svg)).toEqual(shapesOf(svg));
      expect(idsOf(drawing.svg)).toEqual(idsOf(svg));
      const fills = (s: string) =>
        new Set(
          paintOf(parse(s))
            .map((one) => one.fill)
            .filter(Boolean),
        ).size;
      expect(fills(drawing.svg)).toBe(fills(svg));
      const report = styleReport(drawing.svg, 95 / viewBox[3]);
      expect(styleFaults(report)).toEqual([]);
    }, 60_000);
});
