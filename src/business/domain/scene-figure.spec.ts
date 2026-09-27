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

describe('the rig a person is drawn on', () => {
  it('gives each arm of one person its shoulder, elbow and hand, where they are drawn', () => {
    const drawn = drawFigure(as({}), 'x');
    const { r, l } = drawn.joints!;
    for (const [S, E, H] of [r, l]) {
      // A straight arm at rest: the elbow halfway, the hand below the shoulder.
      expect(E).toEqual([(S[0] + H[0]) / 2, (S[1] + H[1]) / 2]);
      expect(H[1]).toBeGreaterThan(S[1]);
    }
    expect(r[0][0]).toBeGreaterThan(0);
    expect(l[0][0]).toBeLessThan(0);
    // The rotation's pivots in the drawing are those joints.
    expect(drawn.svg).toContain(`transform-origin:${r[0][0]}px ${r[0][1]}px`);
    expect(drawn.svg).toContain(`transform-origin:${r[1][0]}px ${r[1][1]}px`);
  });

  it('bends the arm where the pose bends it, and has no joints for a group or someone lying', () => {
    const holding = drawFigure(as({}), 'x', { holding: 'cup' });
    const bent = ([S, E, H]: [number, number][]) =>
      E[0] !== (S[0] + H[0]) / 2 || E[1] !== (S[1] + H[1]) / 2;
    expect([holding.joints!.r, holding.joints!.l].some(bent)).toBe(true);
    expect(drawFigure(as({}), 'x', { count: 3 }).joints).toBeUndefined();
    expect(drawFigure(as({}), 'x', { pose: 'lying' }).joints).toBeUndefined();
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
    // Twelve sheets rendered and measured: slow when the whole suite runs.
  }, 90_000);
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

describe('signs over someone the kit did not draw', () => {
  it('floats a Z over a sleeping dog, a bulb over an idea, each its own group, only those that float', () => {
    const { signsOver } =
      jest.requireActual<typeof import('./scene-figure')>('./scene-figure');
    const over = signsOver(
      [200, 120],
      4,
      ['sleeping', 'idea', 'tears'],
      'bingo-sign',
    );
    expect(Object.keys(over.states)).toEqual(['sleeping', 'idea']);
    expect(over.states.sleeping).toBe('bingo-sign-sleeping');
    expect(over.markup).toContain('id="bingo-sign-sleeping"');
    expect(over.markup).toContain('translate(200 120) scale(4)');
    // Its own motion, never the drawing's own classes.
    expect(over.markup).toContain('class="sgn-rise"');
    expect(over.css).toContain('.sgn-rise{animation:rise');
    expect(signsOver([0, 0], 1, ['tears'], 'x').markup).toBe('');
  });
});

describe('the kit’s own people, unchanged by the crowd', () => {
  it('draws everyone it drew before exactly as before, byte for byte', () => {
    const { createHash } =
      jest.requireActual<typeof import('node:crypto')>('node:crypto');
    // A sample of ages, clothes, hats, poses, props, signs, a group, one
    // lying down and one in bed. The hash is of the kit before extras were
    // drawn with it: a change to how the story's people look must be meant.
    const cases: [FigureSpec, string, FigureHow][] = [
      [PLAIN_FIGURE, 'plain', {}],
      [
        as({
          age: 'child',
          hair: 'braids',
          skin: 8,
          top: 'dress',
          topColour: 'yellow',
        }),
        'maya',
        { holding: 'ball' },
      ],
      [
        as({
          age: 'child',
          hair: 'short',
          headwear: 'cap',
          top: 't-shirt',
          topColour: 'green',
          bottom: 'shorts',
        }),
        'tobi',
        { holding: 'magnifier' },
      ],
      [
        as({
          age: 'adult',
          headwear: 'gele',
          top: 'kaftan',
          bottom: 'wrapper',
          build: 'broad',
          skin: 9,
        }),
        'mama',
        { pose: 'arms up' },
      ],
      [
        as({
          age: 'elder',
          hair: 'balding',
          hairColour: 'grey',
          facialHair: 'beard',
          top: 'agbada',
          headwear: 'kufi',
          extras: ['glasses', 'walking stick'],
        }),
        'elder',
        { pose: 'pointing' },
      ],
      [
        as({
          age: 'teen',
          hair: 'afro',
          top: 'hoodie',
          extras: ['backpack', 'earrings'],
        }),
        'teen',
        { pose: 'waving', signs: ['walking', 'tears'] },
      ],
      [
        as({
          headwear: 'headscarf',
          top: 'robe',
          extras: ['sandals', 'cloak'],
        }),
        'robe',
        { pose: 'hand on mouth', holding: 'staff' },
      ],
      [
        as({ headwear: 'nemes', top: 'tunic', extras: ['wings'] }),
        'nemes',
        { pose: 'hands on belly', count: 3 },
      ],
      [
        as({ hair: 'long', headwear: 'mantle', top: 'dress' }),
        'mantle',
        { pose: 'lying', signs: ['sleeping'] },
      ],
      [
        as({ hair: 'ponytail', top: 'lab coat', extras: ['stethoscope'] }),
        'bed',
        { pose: 'in bed', signs: ['fever'], old: true },
      ],
      [
        as({ headwear: 'crested helmet', top: 'armour' }),
        'soldier',
        {
          pose: 'hand on head',
          holding: 'umbrella',
          signs: ['shaking', 'idea'],
        },
      ],
    ];
    const all = cases.map(([spec, seed, how]) =>
      JSON.stringify(drawFigure(spec, seed, how)),
    );
    // As before, but that each leg now turns about its hip, for a kick,
    // and bends at a knee (drawn as one leg standing), and what is worn on
    // the legs sinks with the body.
    expect(createHash('sha256').update(all.join('\n')).digest('hex')).toBe(
      '238cca320af61802991e9eed875695c238259a794a87a0b571bec2eb75ca9190',
    );
  });
});

describe('someone in a crowd, drawn by the kit', () => {
  const { drawExtra, extraFor, readable, wardrobeOf } =
    jest.requireActual<typeof import('./scene-figure')>('./scene-figure');
  const spec = as({
    age: 'adult',
    hair: 'short',
    facialHair: 'moustache',
    extras: ['glasses'],
    top: 'kaftan',
  });
  const markup = (detail: 0 | 1 | 2, view: 'front' | 'back' = 'front') => {
    const drawn = drawExtra(spec, { detail, view, id: 'cr7' });
    return `${drawn.legs}${drawn.upper}`;
  };

  it('draws the kit’s face near, dots for eyes farther, and a shape far off', () => {
    const near = markup(0);
    expect(near).toContain('clip-path="url(#cr7-eyes)"');
    expect(near).toContain('<clipPath id="cr7-eyes">');
    expect(near).not.toContain('class="talk"');
    expect(near).not.toContain('class="vm');
    expect(near).not.toContain('class="blink');
    const middle = markup(1);
    expect(middle).not.toContain('clip-path');
    expect(middle).toMatch(/<ellipse cx="-15.5" cy="[-\d.]+" rx="6" ry="7"/);
    const far = markup(2);
    expect(far).not.toContain('class="fm"');
    expect(far).not.toContain(`stroke="#2d2a32"`);
    // Its hair and hat still show who they are.
    expect(far).toContain('class="hd"');
  });

  it('turns away with the back of the head and no face', () => {
    const back = markup(1, 'back');
    expect(back).not.toContain('class="fm"');
    expect(back).not.toContain('url(#');
    // A pose that needs the hands is dropped: arms at the sides.
    const drawn = drawExtra(spec, {
      detail: 0,
      view: 'back',
      pose: 'pointing',
      holding: 'bag',
      id: 'cr8',
    });
    expect(drawn.joints.r[2][1]).toBeGreaterThan(drawn.cy);
    // From behind, nothing of the front of what they wear: no hood's
    // collar, no pocket.
    const hoodie = as({ age: 'adult', top: 'hoodie' });
    const [front, behind] = (['front', 'back'] as const).map(
      (view) => drawExtra(hoodie, { detail: 0, view, id: 'cr6' }).upper,
    );
    expect(front).toContain('rx="38" ry="12"');
    expect(front).toContain('rx="6"');
    expect(behind).not.toContain('rx="38" ry="12"');
    expect(behind).not.toMatch(/<rect[^>]*rx="6"/);
  });

  it('frames them as the kit frames their age, their feet at 0', () => {
    const drawn = drawExtra(spec, { detail: 1, id: 'cr9' });
    expect(drawn.viewBox).toEqual(figureFrame('adult'));
    expect(drawn.top).toBe(rigOf('adult').top);
  });

  it('dresses a crowd for its world from the kit’s own lists, the same every time', () => {
    const lagos = {
      era: 'today',
      region: 'Lagos, Nigeria',
      culture: 'Yoruba',
      landscape: '',
      homes: '',
    };
    const people = Array.from({ length: 40 }, (_, i) =>
      extraFor(lagos, 'market', i),
    );
    expect(people).toEqual(
      Array.from({ length: 40 }, (_, i) => extraFor(lagos, 'market', i)),
    );
    const w = wardrobeOf(lagos);
    for (const one of people) {
      expect(TOPS).toContain(one.top);
      expect(w.tops).toContain(one.top);
      // Dressed as a woman, beardless; a child in a child's clothes.
      if (one.top === 'dress' || one.headwear === 'gele')
        expect(one.facialHair).toBe('none');
      if (one.age === 'child') expect(one.top).not.toBe('agbada');
    }
    expect(new Set(people.map((p) => p.age)).size).toBeGreaterThanOrEqual(3);
    expect(wardrobeOf(null).tops).not.toContain('agbada');
  });

  it('never has a dark head run into dark clothes or a dark hat, keeping skin tones as they are', () => {
    const lagos = {
      era: 'today',
      region: 'Lagos, Nigeria',
      culture: 'Yoruba',
      landscape: '',
      homes: '',
    };
    const people = Array.from({ length: 200 }, (_, i) =>
      extraFor(lagos, 'market', i),
    );
    const dark = new Set(['navy', 'black']);
    for (const one of people)
      if (one.skin >= 9) {
        expect(dark.has(one.topColour)).toBe(false);
        if (one.headwear !== 'none')
          expect(dark.has(one.accentColour)).toBe(false);
      }
    // Skin tones kept varied and true: the world's darkest are there.
    expect(people.some((p) => p.skin === 10)).toBe(true);
    // Only a dark head is dressed again: lighter skin keeps its navy.
    const navy = as({ age: 'adult', topColour: 'navy', skin: 10 });
    expect(readable(navy, ['navy', 'yellow'], 's').topColour).toBe('yellow');
    expect(
      readable({ ...navy, skin: 3 }, ['navy', 'yellow'], 's').topColour,
    ).toBe('navy');
    // Dots for eyes on dark skin are whites with a dot, so they show.
    const middle = drawExtra(navy, { detail: 1, id: 'cr5' }).upper;
    expect(middle).toContain('fill="#f5f1e8"');
  });
});

describe('the kit’s legs, bending', () => {
  it('bends each leg at its knee, the foot kept flat, and says where the joints are', () => {
    const drawn = drawFigure(PLAIN_FIGURE, 'legs');
    const { r, l } = drawn.legs!;
    for (const [hip, knee, foot] of [r, l]) {
      // Down the leg: the hip, the knee halfway, the foot on the ground.
      expect(hip[0]).toBe(knee[0]);
      expect(knee[0]).toBe(foot[0]);
      expect(hip[1]).toBeLessThan(knee[1]);
      expect(knee[1]).toBeLessThan(foot[1]);
      expect(Math.abs(knee[1] - (hip[1] + foot[1]) / 2)).toBeLessThan(0.1);
    }
    expect(r[0][0]).toBeGreaterThan(l[0][0]);
    // The shin turns about the knee inside the leg that turns about the
    // hip; the foot under it turns back, flat on the ground.
    expect(drawn.svg).toContain(
      `<g class="shin" style="transform-origin:${r[1][0]}px ${r[1][1]}px">`,
    );
    expect(drawn.svg).toContain(
      '.l1 .shin{transform:rotate(calc(var(--knr,0)*1deg))}',
    );
    expect(drawn.svg).toContain(
      '.l1 .foot{transform:rotate(calc((var(--legr,0) + var(--knr,0))*-1deg))}',
    );
    // The body sinks with the legs, and what is worn on them.
    expect(drawn.svg).toContain(
      '.leg,.breathe,.skirt{translate:0 calc(var(--low,0)*1px)}',
    );
    // A group, or one lying down, bends no legs.
    expect(drawFigure(PLAIN_FIGURE, 'g', { count: 2 }).legs).toBeUndefined();
    expect(
      drawFigure(PLAIN_FIGURE, 'l', { pose: 'lying' }).legs,
    ).toBeUndefined();
  });

  it('takes a wrapper up as the body sinks, so its hem stays off the ground', () => {
    const drawn = drawFigure(
      as({ bottom: 'wrapper', top: 'kaftan' }),
      'wrapped',
    );
    expect(drawn.svg).toMatch(
      /<g class="skirt wrap" style="transform-origin:0 [-\d.]+px;--reach:[\d.]+">/,
    );
    expect(drawn.svg).toContain(
      '.wrap{scale:1 calc(1 - var(--low,0) / var(--reach,100))}',
    );
  });
});

describe('someone who changes clothes', () => {
  const tobi = as({
    age: 'child',
    top: 'pyjamas',
    topColour: 'red',
    bottom: 'trousers',
    bottomColour: 'red',
  });
  const dressed = as({
    age: 'child',
    top: 'uniform',
    topColour: 'blue',
    bottom: 'trousers',
    bottomColour: 'grey',
    extras: ['backpack'],
  });
  const drawn = drawFigure(tobi, 'tobi', {
    dress: [{ state: 'dress-1', spec: dressed }],
  });
  const root = rootOf(drawn.svg);
  const within = (id: string) => {
    const group = byId(root, id)!;
    return elements(group.children)
      .map((el) => el.attribs.class)
      .filter(Boolean);
  };

  it("draws both outfits on one rig, each in its own class, in the rig's own groups", () => {
    for (const id of ['legs', 'body', 'arms', 'behind', 'head'])
      expect(within(id)).toEqual(
        expect.arrayContaining(['dress-0', 'dress-1']),
      );
    // The arms and legs of each turn about the same joints.
    const arms = render(byId(root, 'arms')!);
    expect(arms.match(/class="arm ar"/g)?.length).toBe(2);
    expect(render(byId(root, 'legs')!).match(/class="leg l1"/g)?.length).toBe(
      2,
    );
    // One face, one mouth, one blink: every id once.
    const ids = [...walk(root)].flatMap((el) =>
      el.attribs.id ? [el.attribs.id] : [],
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(drawn.joints).toBeDefined();
    expect(drawn.legs).toBeDefined();
  });

  it('shows the later outfit from when its state is on, and the one before no longer', () => {
    expect(drawn.states['dress-1']).toBe('dress-1');
    expect(drawn.svg).toContain('.dress-1{display:none}');
    expect(drawn.svg).toContain(
      '.on-dress-1 .dress-1{display:inline}.on-dress-1 .dress-0{display:none}',
    );
    // Pyjamas are drawn in their red, and the uniform after them in blue.
    const body = render(byId(root, 'body')!);
    expect(body.indexOf('#d9534f')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('#4a8fd9')).toBeGreaterThan(body.indexOf('#d9534f'));
  });

  it('draws one who never changes as before', () => {
    const plain = drawFigure(tobi, 'tobi');
    expect(plain.svg).not.toContain('dress-');
    expect(plain.states).not.toHaveProperty('dress-1');
  });
});
