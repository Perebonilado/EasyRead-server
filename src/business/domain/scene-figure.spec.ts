import { Resvg } from '@resvg/resvg-js';
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import { byId, elements, removeNode, walk } from './scene-dom';
import {
  FIGURE_AGES,
  HAIR_STYLES,
  HEADWEAR,
  PLAIN_FIGURE,
  TOPS,
  describeFigure,
  drawFigure,
  figureFrame,
  figureOf,
  rigOf,
  type FigureSpec,
} from './scene-figure';
import { measureSheet } from './scene-sheet';
import { figureSheet } from './scene-sheet';
import { EXPRESSIONS, SHEET_PARTS } from './scene-story';
import { sanitizeTree } from './scene-svg';

const as = (patch: Partial<FigureSpec>): FigureSpec => ({
  ...PLAIN_FIGURE,
  ...patch,
});

/** A drawing's markup parsed, its root element. */
const rootOf = (svg: string) =>
  elements(parseDocument(svg, { xmlMode: true }).children)[0];

describe('reading who someone is', () => {
  it('keeps what is on the lists and makes the rest plain', () => {
    const spec = figureOf({
      age: 'teen',
      build: 'broad',
      skin: 7,
      hair: 'afro',
      hairColour: 'black',
      headwear: 'a wizard hat',
      top: 'hoodie',
      topColour: 'purple',
      bottom: 'shorts',
      bottomColour: 'green',
      accentColour: 'teal',
      extras: ['glasses'],
    });
    expect(spec).toMatchObject({
      age: 'teen',
      build: 'broad',
      skin: 7,
      hair: 'afro',
      headwear: 'none',
      top: 'hoodie',
      extras: ['glasses'],
    });
    expect(figureOf(null)).toEqual(PLAIN_FIGURE);
    expect(figureOf({ skin: 'deep' }).skin).toBe(PLAIN_FIGURE.skin);
  });

  it('takes the other words people use for the same thing', () => {
    const spec = figureOf({
      hairColour: 'Gray',
      top: 'sweater',
      bottom: 'jeans',
      headwear: 'hijab',
      facialHair: 'mustache',
      extras: ['spectacles', 'cane'],
    });
    expect(spec).toMatchObject({
      hairColour: 'grey',
      top: 'jumper',
      bottom: 'trousers',
      headwear: 'headscarf',
      facialHair: 'moustache',
      extras: ['glasses', 'walking stick'],
    });
  });

  it('holds a skin tone to the ten, extras to two, and children beardless', () => {
    expect(figureOf({ skin: 14 }).skin).toBe(10);
    expect(figureOf({ skin: 0 }).skin).toBe(PLAIN_FIGURE.skin);
    expect(figureOf({ skin: '3' }).skin).toBe(3);
    expect(
      figureOf({ extras: ['glasses', 'scarf', 'freckles', 'glasses'] }).extras,
    ).toEqual(['glasses', 'scarf']);
    expect(figureOf({ age: 'child', facialHair: 'beard' }).facialHair).toBe(
      'none',
    );
  });

  it('says in a few words who someone is', () => {
    expect(
      describeFigure(
        as({
          age: 'elder',
          hair: 'balding',
          hairColour: 'white',
          facialHair: 'beard',
          extras: ['walking stick'],
        }),
      ),
    ).toBe(
      'average elder, skin 4, white balding hair, beard, blue jumper, navy trousers, walking stick',
    );
  });
});

describe('a person drawn by the kit', () => {
  it('draws the same person the same way every time', () => {
    const spec = as({ hair: 'braids', headwear: 'crown' });
    expect(drawFigure(spec, 'mira').svg).toBe(drawFigure(spec, 'mira').svg);
    // Two people blink on their own beats.
    expect(drawFigure(spec, 'mira').svg).not.toBe(drawFigure(spec, 'tobi').svg);
  });

  it('has every part and every face as its own group, once', () => {
    const drawn = drawFigure(as({}), 'x');
    expect(Object.keys(drawn.parts)).toEqual([...SHEET_PARTS]);
    expect(Object.keys(drawn.states)).toEqual([...EXPRESSIONS]);
    const root = rootOf(drawn.svg);
    const ids = [...walk(root)].map((n) => n.attribs.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      ...Object.values(drawn.parts),
      ...Object.values(drawn.states),
    ])
      expect(byId(root, id)).not.toBeNull();
  });

  it('is drawn from nothing the gate would cut', () => {
    for (const top of TOPS)
      for (const headwear of HEADWEAR) {
        const root = rootOf(
          drawFigure(as({ top, headwear, extras: ['glasses', 'stethoscope'] }))
            .svg,
        );
        expect(sanitizeTree(root)).toEqual([]);
      }
  });

  it('stays small, whatever it wears', () => {
    const heavy = as({
      hair: 'braids',
      headwear: 'graduation cap',
      facialHair: 'beard',
      top: 'uniform',
      extras: ['stethoscope', 'backpack'],
    });
    expect(drawFigure(heavy).svg.length).toBeLessThan(10_000);
  });

  it('frames every age alike: the same width, the head as tall, the ground at 0', () => {
    const heights = FIGURE_AGES.map((age) => {
      const [x, y, w, h] = figureFrame(age);
      expect(x).toBe(-w / 2);
      expect(y + h).toBeGreaterThan(0);
      return -rigOf(age).top;
    });
    // A child is the shortest, a grown-up the tallest.
    expect(heights[0]).toBeLessThan(heights[1]);
    expect(heights[1]).toBeLessThan(heights[2]);
    expect(heights[3]).toBeLessThan(heights[2]);
    // The head is the same size at every age: a child is mostly head.
    expect(80 / heights[0]).toBeGreaterThan(0.5);
    expect(80 / heights[2]).toBeLessThan(0.45);
  });

  it('shows its face at rest in a still: eyes open, mouth shut', () => {
    const svg = drawFigure(as({})).svg;
    expect(svg).toContain('<g class="blink b0" opacity="0">');
    expect(svg).toContain('<g class="talk" opacity="0">');
    expect(svg).toContain('.talking .talk{animation:talk');
  });
});

describe('a few people standing together', () => {
  const team = as({
    headwear: 'beanie',
    top: 'coat',
    topColour: 'navy',
    extras: ['glasses'],
  });

  it('draws each of a group as their own person, in the same clothes', () => {
    const drawn = drawFigure(team, 'amundsen-team', 3);
    const root = rootOf(drawn.svg);
    // Three shadows, three pairs of eyes, and a frame three people wide.
    expect(drawn.svg.match(/fill-opacity="0.16"/g)).toHaveLength(3);
    const [, , one] = drawFigure(team, 'amundsen-team').viewBox;
    expect(drawn.viewBox[2]).toBeGreaterThan(one * 2);
    const neutral = byId(root, 'neutral')!;
    const pupils = [...walk(neutral)].filter((n) => n.name === 'circle');
    expect(pupils).toHaveLength(6);
    // The glasses are the described one's own.
    expect(drawn.svg.match(/r="18.5"/g)).toHaveLength(2);
    // Every part and face is still one group.
    const ids = [...walk(root)].map((n) => n.attribs.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    // The same group every time; another group, other people.
    expect(drawFigure(team, 'amundsen-team', 3).svg).toBe(drawn.svg);
    expect(drawFigure(team, 'scott-team', 3).svg).not.toBe(drawn.svg);
  });

  it('holds a group to four', () => {
    const shadows = (count: number) =>
      drawFigure(team, 'x', count).svg.match(/fill-opacity="0.16"/g)?.length;
    expect(shadows(9)).toBe(4);
    expect(shadows(0)).toBe(1);
  });

  it('puts every face of a group on its heads', async () => {
    const drawn = drawFigure(team, 'x', 4);
    const { notes } = await measureSheet({
      svg: drawn.svg,
      viewBox: drawn.viewBox,
      aspect: drawn.viewBox[2] / drawn.viewBox[3],
      parts: drawn.parts,
      labels: {},
      states: drawn.states,
      moves: true,
      callouts: [],
      field: null,
    });
    expect(notes).toEqual([]);
  });
});

describe('someone in bed', () => {
  const patient = as({ age: 'child', hair: 'curly', skin: 7 });

  it('draws them sitting up in bed, their faces on their head as standing', async () => {
    const drawn = drawFigure(patient, 'p', 1, 'in bed');
    const [, , w, h] = drawn.viewBox;
    expect(w).toBeGreaterThan(h);
    expect(Object.keys(drawn.states)).toEqual([...EXPRESSIONS]);
    const { notes } = await measureSheet({
      svg: drawn.svg,
      viewBox: drawn.viewBox,
      aspect: w / h,
      parts: drawn.parts,
      labels: {},
      states: drawn.states,
      moves: true,
      callouts: [],
      field: null,
    });
    expect(notes).toEqual([]);
    // They blink and talk as they do standing.
    expect(drawn.svg).toContain('class="blink b0"');
    expect(drawn.svg).toContain('<g class="talk" opacity="0">');
  });

  it('is one person in a bed, however many were asked for', () => {
    const one = drawFigure(patient, 'p', 3, 'in bed').svg;
    expect(one.match(/fill-opacity="0.16"/g)).toHaveLength(1);
  });
});

describe('a face nothing covers', () => {
  const SIZE = 2;
  /** The colour at a point of the figure drawn with no face on, in the frame's units. */
  function colourAt(spec: FigureSpec, points: [number, number][]): string[] {
    const drawn = drawFigure(spec);
    const doc = parseDocument(drawn.svg, { xmlMode: true });
    const root = elements(doc.children)[0];
    for (const name of EXPRESSIONS) {
      const group = byId(root, name);
      if (group) removeNode(group);
    }
    const [vx, vy, vw] = drawn.viewBox;
    const image = new Resvg(render(doc, { xmlMode: true }), {
      fitTo: { mode: 'width', value: vw * SIZE },
      font: { loadSystemFonts: false },
    }).render();
    return points.map(([x, y]) => {
      const i =
        (Math.round((y - vy) * SIZE) * image.width +
          Math.round((x - vx) * SIZE)) *
        4;
      const [r, g, b] = image.pixels.subarray(i, i + 3);
      return `${r},${g},${b}`;
    });
  }

  it('leaves the eyes clear under every hat and every hair', () => {
    for (const headwear of HEADWEAR)
      for (const hair of HAIR_STYLES) {
        const spec = as({ headwear, hair });
        const R = rigOf(spec.age);
        const { y, dx } = R.eyes;
        // Their whites, under no face: nothing drawn over them.
        const eyes = colourAt(spec, [
          [-dx, y],
          [dx, y],
          [-dx, y - 10],
          [dx, y - 10],
        ]);
        for (const eye of eyes)
          expect([headwear, hair, eye]).toEqual([
            headwear,
            hair,
            '255,255,255',
          ]);
      }
  });

  it('leaves the mouth clear, unless a beard grows round it', () => {
    for (const headwear of HEADWEAR) {
      const spec = as({ headwear, hair: 'long', extras: ['glasses'] });
      const R = rigOf(spec.age);
      // A cheek, below the eye: the face's own skin.
      const [skin, mouth] = colourAt(spec, [
        [-20, R.cy + 30],
        [0, R.mouthY],
      ]);
      expect([headwear, mouth]).toEqual([headwear, skin]);
    }
  });

  it('puts every face on the head, as a sheet is checked', async () => {
    for (const age of FIGURE_AGES)
      for (const headwear of ['none', 'headscarf', 'sun hat'] as const) {
        const sheet = await figureSheet(as({ age, headwear }), 'x');
        const { notes } = await measureSheet(sheet.drawing);
        expect([age, headwear, notes]).toEqual([age, headwear, []]);
      }
  }, 30_000);
});
