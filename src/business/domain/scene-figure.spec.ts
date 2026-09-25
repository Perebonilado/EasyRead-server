import { Resvg } from '@resvg/resvg-js';
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import { byId, elements, removeNode, walk } from './scene-dom';
import {
  FIGURE_AGES,
  FIGURE_POSES,
  FIGURE_PROPS,
  FIGURE_SIGNS,
  HAIR_STYLES,
  HEADWEAR,
  KIT_FACES,
  LYING_POSES,
  ON_FOOT,
  PLAIN_FIGURE,
  TOPS,
  oldWorld,
  describeFigure,
  drawFigure,
  figureFrame,
  figureOf,
  rigOf,
  signId,
  type FigureHow,
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
    expect(Object.keys(drawn.states)).toEqual([...EXPRESSIONS, ...KIT_FACES]);
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
    // The rig (its CSS, the mouth's shapes, the eye clip) is about 4 KB of it.
    expect(drawFigure(heavy).svg.length).toBeLessThan(16_000);
    // A sign adds what it draws, and only the signs the page shows are drawn.
    expect(
      drawFigure(heavy, 'x', {
        signs: ['shaking', 'tingling hands', 'tingling feet'],
      }).svg.length,
    ).toBeLessThan(20_000);
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
    const drawn = drawFigure(team, 'amundsen-team', { count: 3 });
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
    expect(drawFigure(team, 'amundsen-team', { count: 3 }).svg).toBe(drawn.svg);
    expect(drawFigure(team, 'scott-team', { count: 3 }).svg).not.toBe(
      drawn.svg,
    );
  });

  it('holds a group to four', () => {
    const shadows = (count: number) =>
      drawFigure(team, 'x', { count }).svg.match(/fill-opacity="0.16"/g)
        ?.length;
    expect(shadows(9)).toBe(4);
    expect(shadows(0)).toBe(1);
  });

  it('puts every face of a group on its heads', async () => {
    const drawn = drawFigure(team, 'x', { count: 4 });
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
    const drawn = drawFigure(patient, 'p', { pose: 'in bed' });
    const [, , w, h] = drawn.viewBox;
    expect(w).toBeGreaterThan(h);
    expect(Object.keys(drawn.states)).toEqual([...EXPRESSIONS, ...KIT_FACES]);
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
    const one = drawFigure(patient, 'p', { count: 3, pose: 'in bed' }).svg;
    expect(one.match(/fill-opacity="0.16"/g)).toHaveLength(1);
  });
});

const SIZE = 2;
/** The colour at a point of the figure drawn with no face and no sign on, in the frame's units. */
function colourAt(
  spec: FigureSpec,
  points: [number, number][],
  how: FigureHow = {},
): string[] {
  const drawn = drawFigure(spec, '', how);
  const doc = parseDocument(drawn.svg, { xmlMode: true });
  const root = elements(doc.children)[0];
  for (const id of Object.values(drawn.states)) {
    const group = byId(root, id);
    if (group) removeNode(group);
  }
  const [vx, vy, vw] = drawn.viewBox;
  // A whole number of pixels wide: resvg draws at the frame's own size otherwise.
  const image = new Resvg(render(doc, { xmlMode: true }), {
    fitTo: { mode: 'width', value: Math.round(vw * SIZE) },
    font: { loadSystemFonts: false },
  }).render();
  const k = image.width / vw;
  return points.map(([x, y]) => {
    const i =
      (Math.round((y - vy) * k) * image.width + Math.round((x - vx) * k)) * 4;
    const [r, g, b] = image.pixels.subarray(i, i + 3);
    return `${r},${g},${b}`;
  });
}

describe('a face nothing covers', () => {
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
        // The kit's own face, pain, sits there too.
        const pained = await measureSheet({
          ...sheet.drawing,
          states: { ...sheet.drawing.states, neutral: 'pain' },
        });
        expect([age, headwear, pained.notes]).toEqual([age, headwear, []]);
      }
  }, 30_000);
});

describe('someone doing something', () => {
  const spec = as({ hair: 'long', extras: ['glasses'] });
  const everything = (pose: (typeof FIGURE_POSES)[number]): FigureHow => ({
    pose,
    signs: FIGURE_SIGNS,
    holding: pose === 'holding' ? 'book' : null,
  });

  it('draws every pose with every part, face and sign as its own group, once', () => {
    for (const pose of FIGURE_POSES) {
      const drawn = drawFigure(spec, 'x', everything(pose));
      const root = rootOf(drawn.svg);
      const ids = [...walk(root)].map((n) => n.attribs.id).filter(Boolean);
      expect([pose, new Set(ids).size]).toEqual([pose, ids.length]);
      const signs = FIGURE_SIGNS.filter(
        (sign) => !(LYING_POSES.includes(pose) && ON_FOOT.includes(sign)),
      );
      expect([pose, Object.keys(drawn.states)]).toEqual([
        pose,
        [...EXPRESSIONS, ...KIT_FACES, ...signs],
      ]);
      for (const id of [
        ...Object.values(drawn.parts),
        ...Object.values(drawn.states),
      ])
        expect([pose, id, byId(root, id) !== null]).toEqual([pose, id, true]);
      // Nothing the gate would cut.
      expect([pose, sanitizeTree(root)]).toEqual([pose, []]);
    }
  });

  it('names each sign’s group for the sign', () => {
    const drawn = drawFigure(spec, 'x', { signs: ['tingling hands'] });
    expect(drawn.states['tingling hands']).toBe(signId('tingling hands'));
    expect(drawn.svg).toContain('<g id="tingling-hands">');
    // Only the signs asked for are drawn.
    expect(drawn.states.shaking).toBeUndefined();
    expect(drawn.svg).not.toContain('<g id="shaking">');
  });

  it('leaves the eyes clear with the signs off, in every pose', () => {
    for (const pose of FIGURE_POSES.filter(
      (one) => !LYING_POSES.includes(one),
    )) {
      const { y, dx } = rigOf(spec.age).eyes;
      const eyes = colourAt(
        spec,
        [
          [-dx, y],
          [dx, y],
        ],
        everything(pose),
      );
      // Glasses ring the eyes; their middles are clear.
      expect([pose, eyes]).toEqual([pose, ['255,255,255', '255,255,255']]);
    }
  });

  it('keeps every face on the head in every standing pose', async () => {
    for (const pose of FIGURE_POSES.filter(
      (one) => !LYING_POSES.includes(one),
    )) {
      const drawn = drawFigure(spec, 'x', everything(pose));
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
      expect([pose, notes]).toEqual([pose, []]);
    }
  }, 30_000);

  it('widens the frame for what reaches past it, and lies down wide', () => {
    const [, , standing, tall] = drawFigure(spec).viewBox;
    const [, , pointing] = drawFigure(spec, 'x', { pose: 'pointing' }).viewBox;
    expect(pointing).toBeGreaterThan(standing);
    const [, , lyingW, lyingH] = drawFigure(spec, 'x', {
      pose: 'lying',
    }).viewBox;
    expect(lyingW).toBeGreaterThan(lyingH);
    // An umbrella over the head raises the frame; the ground stays at its foot.
    const [, top, , umbrellaH] = drawFigure(spec, 'x', {
      holding: 'umbrella',
    }).viewBox;
    expect(umbrellaH).toBeGreaterThan(tall);
    expect(top + umbrellaH).toBe(figureFrame(spec.age)[1] + tall);
  });

  it('draws a prop at the hand that holds it', () => {
    const R = rigOf(spec.age);
    const heldAt = (how: FigureHow) => {
      const root = rootOf(drawFigure(spec, 'x', how).svg);
      const arms = byId(root, 'arms')!;
      const held = [...walk(arms)].find((n) =>
        /^translate\(/.test(n.attribs.transform ?? ''),
      );
      const [x, y] = (held?.attribs.transform ?? '')
        .match(/-?[\d.]+/g)!
        .map(Number);
      return { x, y, mirrored: /scale\(-1 1\)/.test(held!.attribs.transform) };
    };
    for (const holding of FIGURE_PROPS) {
      const { x, y, mirrored } = heldAt({ holding });
      // In the right hand, beside the body, between the shoulders and the ground.
      expect([holding, x > R.halfShoulder, mirrored]).toEqual([
        holding,
        true,
        false,
      ]);
      expect([holding, y > R.sY - 10 && y < 0]).toEqual([holding, true]);
    }
    // Pointing with the right hand, the left holds it.
    const left = heldAt({ pose: 'pointing', holding: 'book' });
    expect(left.x).toBeLessThan(0);
    expect(left.mirrored).toBe(true);
    // Both hands busy, or lying down: no prop.
    for (const pose of ['arms up', 'hands on belly', 'lying'] as const)
      expect(drawFigure(spec, 'x', { pose, holding: 'book' }).svg).toBe(
        drawFigure(spec, 'x', { pose }).svg,
      );
  });

  it('moves the body, and the marks, only while a sign is on', () => {
    const drawn = drawFigure(spec, 'x', {
      signs: ['shaking', 'tingling hands', 'walking'],
    });
    expect(drawn.svg).toContain('.on-shaking .whole{animation:shake');
    expect(drawn.svg).toContain('.on-tingling-hands .tw{animation:twinkle');
    expect(drawn.svg).toContain('.on-walking .leg{animation:step');
    // A still, or a stage with motion reduced, sets no class: all at rest.
    expect(drawn.svg).not.toMatch(/[{}]\.tw\{animation/);
    expect(drawn.svg).not.toMatch(/[{}]\.whole\{animation/);
    // Each leg its own group, to step.
    expect(drawn.svg.match(/class="leg l[01]"/g)).toHaveLength(2);
  });

  it('lets a group take a pose and a prop together', () => {
    const drawn = drawFigure(spec, 'x', { count: 3, pose: 'waving' });
    expect(drawn.svg.match(/class="wave"/g)).toHaveLength(3);
    const held = drawFigure(spec, 'x', { count: 2, holding: 'flag' });
    expect(held.svg.match(/d="M2,-?[\d.]+ Q12,/g)).toHaveLength(2);
  });

  it('lies one person down, with what floats over the head upright', () => {
    const drawn = drawFigure(spec, 'x', {
      pose: 'lying',
      count: 3,
      signs: ['sleeping', 'walking', 'shaking'],
    });
    expect(drawn.svg.match(/fill-opacity="0.16"/g)).toHaveLength(1);
    expect(drawn.states.walking).toBeUndefined();
    const root = rootOf(drawn.svg);
    const zeds = byId(root, 'sleeping')!;
    expect(render(zeds, { xmlMode: true })).toContain(
      `rotate(90 0 ${rigOf(spec.age).cy})`,
    );
  });
});

describe('a bed as the story’s world has them', () => {
  it('knows a world before metal beds by its era', () => {
    expect(
      [
        'first century AD',
        'ancient Egypt',
        'medieval England',
        '12th century',
        'the 1990s',
        'modern Lagos',
        null,
      ].map(oldWorld),
    ).toEqual([true, true, true, true, false, false, false]);
  });

  it('draws someone in bed on a wooden pallet and a mat there, with no rails', () => {
    const spec = figureOf({});
    const modern = drawFigure(spec, 'patient', { pose: 'in bed' }).svg;
    const old = drawFigure(spec, 'patient', { pose: 'in bed', old: true }).svg;
    expect(modern).toContain('#b9c0ca');
    expect(old).not.toContain('#b9c0ca');
    expect(old).toContain('#9a6b3f');
  });
});
