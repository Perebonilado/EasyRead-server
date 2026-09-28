import { writeFileSync } from 'node:fs';
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import { plainAnimal } from './scene-animal';
import { drawAnimal } from './scene-animal-draw';
import { plainCreature, type CreatureSpec } from './scene-creature';
import { drawCreature } from './scene-creature-draw';
import { byId, elements, removeNode } from './scene-dom';
import { eyesClosedIn, faceNamed } from './scene-feeling';
import {
  ASKED_FACES,
  EVERY_FACE,
  FIGURE_FACES,
  PLAIN_FIGURE,
  drawFigure,
  rigOf,
  type FigureSpec,
} from './scene-figure';
import { renderSvg } from './scene-raster';
import { FACES, facesShown, isFace, type SceneScript } from './scene-script';
import {
  animalPreview,
  creaturePreview,
  figurePreview,
} from './studio/studio-looks';

/**
 * The face with the eyes closed: the lids shut, the brows at rest, the
 * mouth calm and no Zs, for someone knocked out, fainted, resting or
 * praying. Drawn only on a page that shows it, for a person, an animal
 * and a creature, standing, sitting and lying; everyone else drawn as
 * before, byte for byte.
 */

const CLOSED = 'eyes closed';
const person: FigureSpec = { ...PLAIN_FIGURE, age: 'adult', skin: 5 };
const dog = plainAnimal('dog');
const creatures: CreatureSpec[] = [1, 2, 3].map((eyes) => ({
  ...plainCreature('egg'),
  eyes: eyes as CreatureSpec['eyes'],
}));

/** A drawing's group, by its id, as markup. */
const groupOf = (svg: string, id: string): string => {
  const root = elements(parseDocument(svg, { xmlMode: true }).children)[0];
  const group = byId(root, id);
  return group ? render(group, { xmlMode: true }) : '';
};

/** A drawing with only `face` of its states on, as a still shows it. */
function wearing(
  drawn: { svg: string; states: Record<string, string> },
  face: string,
): string {
  const doc = parseDocument(drawn.svg, { xmlMode: true });
  const root = elements(doc.children)[0];
  for (const [name, id] of Object.entries(drawn.states))
    if (name !== face) {
      const group = byId(root, id);
      if (group) removeNode(group);
    }
  return render(doc, { xmlMode: true });
}

describe('the eyes-closed face, on the lists', () => {
  it('is a face anyone can be asked to wear, drawn only when shown', () => {
    expect(ASKED_FACES).toEqual([CLOSED]);
    expect(EVERY_FACE).toEqual([...FIGURE_FACES, CLOSED]);
    expect(FIGURE_FACES).not.toContain(CLOSED);
    expect(FACES).toContain(CLOSED);
    expect(isFace(CLOSED)).toBe(true);
  });

  it('is the face words name for eyes shut and still, never for asleep', () => {
    for (const word of [
      'eyes closed',
      'unconscious',
      'knocked out',
      'fainted',
      'resting',
      'praying',
    ])
      expect(faceNamed(word)).toBe(CLOSED);
    for (const say of [
      'Goliath lies still, his eyes closed.',
      'Goliath falls to the ground, knocked out.',
      'Ada faints.',
      'Pip pretends to sleep.',
      'Goliath falls down dead.',
      'He is out cold.',
      'Mama closes her eyes.',
    ])
      expect(eyesClosedIn(say)).toBe(true);
    for (const say of [
      'Tobi is fast asleep.',
      'A faint sound comes from the hill.',
      'David looks at Goliath.',
      'Ada keeps an eye on the ball.',
    ])
      expect(eyesClosedIn(say)).toBe(false);
  });

  it('is drawn for someone a page shows wearing it: as they come on, or later', () => {
    const script = {
      cast: [
        { id: 'goliath', kind: 'character', state: 'neutral' },
        { id: 'david', kind: 'character', state: CLOSED },
        { id: 'saul', kind: 'character', state: 'happy' },
      ],
      steps: [
        {
          effects: [{ target: 'goliath', part: CLOSED, do: 'show' }],
        },
      ],
    } as unknown as SceneScript;
    expect(facesShown(script, 'goliath')).toEqual([CLOSED]);
    expect(facesShown(script, 'david')).toEqual([CLOSED]);
    expect(facesShown(script, 'saul')).toEqual([]);
  });
});

describe('the eyes-closed face on a person', () => {
  it('is drawn only when asked for: without it, no group and no state', () => {
    const plain = drawFigure(person, 'goliath');
    expect(plain.states[CLOSED]).toBeUndefined();
    expect(plain.svg).not.toContain('eyes-closed');
    // Asked for with nothing, or with a face drawn anyway: as before.
    expect(drawFigure(person, 'goliath', { faces: [] })).toEqual(plain);
    expect(drawFigure(person, 'goliath', { faces: ['pain'] })).toEqual(plain);
  });

  it('shuts the lids, rests the brows and keeps a mouth that talks, standing, in a group, lying and in bed', () => {
    for (const how of [
      {},
      { count: 3 },
      { pose: 'lying' as const },
      { pose: 'in bed' as const },
      { pose: 'in bed' as const, old: true },
    ]) {
      const drawn = drawFigure(person, 'goliath', { ...how, faces: [CLOSED] });
      expect(drawn.states[CLOSED]).toBe('eyes-closed');
      const face = groupOf(drawn.svg, 'eyes-closed');
      expect(face).not.toBe('');
      // No pupils to see, no Zs: only lids, brows and a mouth.
      expect(face).not.toContain('pupils');
      expect(face).not.toContain('class="rise"');
      expect(face).toContain('class="brows"');
      expect(face).toContain('class="mouth"');
      expect(face).toContain('class="talk" opacity="0"');
      // No blink opens the eyes while it is on.
      expect(drawn.svg).toContain('.on-eyes-closed .blink{display:none}');
      // Its other faces and signs as they were.
      for (const other of FIGURE_FACES) expect(drawn.states[other]).toBe(other);
    }
    // One face for each of a group, all shut together.
    const three = groupOf(
      drawFigure(person, 'goliath', { count: 3, faces: [CLOSED] }).svg,
      'eyes-closed',
    );
    expect(three.match(/class="brows"/g)).toHaveLength(3);
  });

  it('draws everything else exactly as it is drawn without it', () => {
    const plain = drawFigure(person, 'goliath', { pose: 'lying' });
    const shut = drawFigure(person, 'goliath', {
      pose: 'lying',
      faces: [CLOSED],
    });
    const without = shut.svg
      .replace(
        /<g id="eyes-closed">.*?<\/g><\/g><g class="mouths">/,
        '<g class="mouths">',
      )
      .replace('.on-eyes-closed .blink{display:none}', '');
    expect(without).toBe(plain.svg);
  });

  it('is on the cast card when asked for, alone', () => {
    const card = figurePreview(person, 'goliath', CLOSED);
    expect(card).toContain('id="eyes-closed"');
    expect(card).not.toContain('id="neutral"');
    expect(card).not.toContain('id="pain"');
  });
});

describe('the eyes-closed face on an animal and a creature', () => {
  it('is drawn only when asked for', () => {
    expect(drawAnimal(dog, 'rex').states[CLOSED]).toBeUndefined();
    expect(drawAnimal(dog, 'rex', { faces: [] })).toEqual(
      drawAnimal(dog, 'rex'),
    );
    expect(drawCreature(creatures[1], 'blob').svg).not.toContain('eyes-closed');
  });

  it('shuts every eye it has, one, two or three, in every pose, and its mouth still talks', () => {
    const drawings = [
      drawAnimal(dog, 'rex', { faces: [CLOSED] }),
      drawAnimal(dog, 'rex', { faces: [CLOSED], pose: 'lie' }),
      drawAnimal(dog, 'rex', { faces: [CLOSED], pose: 'sit' }),
      drawAnimal(plainAnimal('chicken'), 'hen', { faces: [CLOSED] }),
      ...creatures.map((spec) =>
        drawCreature(spec, 'blob', { faces: [CLOSED] }),
      ),
      drawCreature(creatures[1], 'blob', { faces: [CLOSED], pose: 'lie' }),
    ];
    for (const drawn of drawings) {
      expect(drawn.states[CLOSED]).toBe('eyes-closed');
      const face = groupOf(drawn.svg, 'eyes-closed');
      expect(face).not.toContain('pupils');
      expect(face).toContain('class="brows"');
      expect(face).toContain('class="mouth"');
      expect(face).toContain('opacity="0"');
      expect(drawn.svg).toContain('.on-eyes-closed .blink{display:none}');
      // It sits in the head, so it goes wherever the head does.
      expect(groupOf(drawn.svg, 'head')).toContain('id="eyes-closed"');
    }
    // A third eye shut too: three lids, two brows.
    const three = groupOf(drawings[6].svg, 'eyes-closed');
    expect(three.match(/<ellipse/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('is on the cast card when asked for, alone', () => {
    expect(animalPreview(dog, 'rex', CLOSED)).toContain('id="eyes-closed"');
    expect(creaturePreview(creatures[0], 'blob', CLOSED)).toContain(
      'id="eyes-closed"',
    );
  });
});

/** Pure white pixels in a picture: the eyes' whites, where they show. */
const whites = (rgba: Buffer): number => {
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4)
    if (
      rgba[i] > 245 &&
      rgba[i + 1] > 245 &&
      rgba[i + 2] > 245 &&
      rgba[i + 3] > 200
    )
      n += 1;
  return n;
};

/** A drawing cut down to a box of it: its viewBox that box. */
const cropped = (svg: string, [x, y, w, h]: number[]) =>
  svg.replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`);

describe('the eyes-closed face, rendered', () => {
  jest.setTimeout(60000);

  it('hides the whites of the eyes that the calm face shows', async () => {
    const R = rigOf(person.age, person.build);
    const box = [-36, R.eyes.y - 22, 72, 44];
    const eyesOf = (face: string) =>
      cropped(
        wearing(drawFigure(person, 'goliath', { faces: [CLOSED] }), face),
        box,
      );
    const dogEyes = drawAnimal(dog, 'rex').eyes;
    const around = (
      e: { x: number; y: number; width: number; height: number }[],
    ) => {
      const x0 = Math.min(...e.map((b) => b.x)) - 2;
      const y0 = Math.min(...e.map((b) => b.y)) - 2;
      const x1 = Math.max(...e.map((b) => b.x + b.width)) + 2;
      const y1 = Math.max(...e.map((b) => b.y + b.height)) + 2;
      return [x0, y0, x1 - x0, y1 - y0];
    };
    const dogOf = (face: string) =>
      cropped(
        wearing(drawAnimal(dog, 'rex', { faces: [CLOSED] }), face),
        around(dogEyes),
      );
    const svgs = [
      eyesOf('neutral'),
      eyesOf(CLOSED),
      dogOf('neutral'),
      dogOf(CLOSED),
    ];
    const { ground } = await renderSvg(svgs[0], undefined, {
      ground: { svgs, cols: 120 },
    });
    const [open, shut, dogOpen, dogShut] = ground!.map((p) => whites(p.rgba));
    expect(open).toBeGreaterThan(200);
    expect(shut).toBeLessThan(open / 20);
    expect(dogOpen).toBeGreaterThan(200);
    expect(dogShut).toBeLessThan(dogOpen / 20);
  });

  it('renders on a person, an animal and a creature, standing and lying', async () => {
    const cells: { svg: string; viewBox: number[] }[] = [
      drawFigure(person, 'goliath', { faces: [CLOSED] }),
      drawFigure(person, 'goliath', { pose: 'lying', faces: [CLOSED] }),
      drawFigure(person, 'goliath', { pose: 'in bed', faces: [CLOSED] }),
      drawAnimal(dog, 'rex', { faces: [CLOSED], pose: 'stand' }),
      drawAnimal(dog, 'rex', { faces: [CLOSED], pose: 'lie' }),
      drawCreature(creatures[1], 'blob', { faces: [CLOSED], pose: 'stand' }),
      drawCreature(creatures[2], 'blob', { faces: [CLOSED], pose: 'lie' }),
    ].map((drawn) => ({
      svg: wearing(
        drawn as { svg: string; states: Record<string, string> },
        CLOSED,
      ),
      viewBox: drawn.viewBox,
    }));
    const W = 360;
    const H = 360;
    const sheet = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * cells.length} ${H}">`,
      `<rect width="${W * cells.length}" height="${H}" fill="#f4efe6"/>`,
      ...cells.map(
        (cell, k) =>
          `<svg x="${k * W + 10}" y="10" width="${W - 20}" height="${H - 20}" viewBox="${cell.viewBox.join(' ')}">${cell.svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`,
      ),
      '</svg>',
    ].join('');
    const { png, ink } = await renderSvg(sheet, 2000);
    expect(ink).not.toBeNull();
    expect(png!.length).toBeGreaterThan(10000);
    // EYES_CLOSED_PNG=<path> npm test -- scene-eyes-closed: the sheet, to look at.
    if (process.env.EYES_CLOSED_PNG)
      writeFileSync(process.env.EYES_CLOSED_PNG, png!);
  });
});
