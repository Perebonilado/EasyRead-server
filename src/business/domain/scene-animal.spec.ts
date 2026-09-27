import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import {
  ANIMAL_SPECIES,
  SPECIES,
  animalFor,
  animalFromWords,
  animalOf,
  animalTall,
  describeAnimal,
  featuresOf,
  plainAnimal,
  speciesOf,
  type AnimalSpec,
} from './scene-animal';
import { ANIMAL_POSES, animalFace, drawAnimal } from './scene-animal-draw';
import { checkSheet, codeNotes } from './drawing-checks';
import { elements, walk } from './scene-dom';
import { FIGURE_FACES } from './scene-figure';
import { KIT_LINE, LINE_SLACK } from './scene-ink';
import { styleReport } from './scene-polish';
import { animalDrawing, animalSheet, castOf } from './scene-sheet';
import { holdsTogether, type Swing } from './scene-sheet-rig';

const parse = (svg: string) =>
  elements(parseDocument(svg, { xmlMode: true }).children)[0];

describe('an animal, as a writer or the maker says it', () => {
  it('reads a spec, each value one of the lists, other words for them taken', () => {
    const spec = animalOf({
      species: 'puppy',
      build: 'stout',
      size: 'small',
      coat: 'gray',
      second: 'white',
      pattern: 'spotted',
      ears: 'droopy',
      tail: 'fluffy',
      wear: { neck: 'bandana', back: 'blanket' },
      wearColour: 'blue',
    });
    expect(spec).toEqual({
      species: 'dog',
      build: 'stout',
      size: 'small',
      coat: 'grey',
      second: 'white',
      pattern: 'spots',
      ears: 'floppy',
      tail: 'bushy',
      mane: null,
      horns: null,
      wear: { neck: 'scarf', back: 'saddle blanket' },
      wearColour: 'blue',
    });
  });

  it('is none when the kit has no such species: the artist draws it', () => {
    expect(animalOf({ species: 'dragon' })).toBeNull();
    expect(animalOf({})).toBeNull();
    expect(animalOf(null)).toBeNull();
  });

  it("takes the species' own for what is missing, and none of a second colour the same as the coat", () => {
    const horse = animalOf({ species: 'horse' })!;
    expect(horse).toEqual(plainAnimal('horse'));
    expect(featuresOf(horse)).toEqual({
      ears: 'pointed',
      tail: 'long',
      mane: 'long',
      horns: 'none',
    });
    const same = animalOf({
      species: 'cat',
      coat: 'black',
      second: 'black',
      pattern: 'socks',
    })!;
    expect(same.second).toBeNull();
    expect(same.pattern).toBe('plain');
  });

  it('wears what it wears in red when no colour is said, and nothing in no colour', () => {
    expect(
      animalOf({ species: 'horse', wear: { back: 'saddle blanket' } })!
        .wearColour,
    ).toBe('red');
    expect(animalOf({ species: 'horse' })!.wearColour).toBeNull();
    // A saddle blanket is only ever on the back.
    expect(
      animalOf({ species: 'horse', wear: { neck: 'saddle blanket' } })!.wear,
    ).toEqual({});
  });

  it('is said in a few words', () => {
    expect(
      describeAnimal({
        ...plainAnimal('horse'),
        wear: { back: 'saddle blanket' },
        wearColour: 'red',
      }),
    ).toBe(
      'a chestnut horse with a white blaze, pointed ears, a long tail and a long mane, wearing a red saddle blanket',
    );
    expect(describeAnimal({ ...plainAnimal('duck'), size: 'small' })).toBe(
      'a small yellow duck with a short tail',
    );
  });

  it("reads a book's animal from its words", () => {
    const pip = animalFromWords(
      'a small scruffy brown dog with floppy ears, a white patch on his chest and a red collar',
    )!;
    expect(pip.species).toBe('dog');
    expect(pip.size).toBe('small');
    expect(pip.coat).toBe('brown');
    expect(pip.second).toBe('white');
    expect(pip.ears).toBe('floppy');
    expect(pip.wear).toEqual({ neck: 'collar' });
    expect(pip.wearColour).toBe('red');
    expect(animalFromWords('a friendly green dragon')).toBeNull();
    expect(speciesOf('a gentle brown pony')).toBe('horse');
  });

  it("is the bible's, and a book's only once books are drawn by the kit", () => {
    const spec = plainAnimal('cat');
    expect(animalFor({ kind: 'animal', animal: spec })).toBe(spec);
    const book = { kind: 'animal', look: 'a ginger cat with white socks' };
    expect(animalFor(book)).toBeNull();
    expect(animalFor(book, true)?.species).toBe('cat');
    expect(
      animalFor({ kind: 'creature', look: 'a cat-shaped cloud' }, true),
    ).toBeNull();
  });
});

/** Every part of a still that moves about its joint, with its pivot. */
function movers(
  root: Element,
): { el: Element; kind: string; at: [number, number] }[] {
  return [...walk(root)]
    .filter(
      (node) =>
        node.name === 'g' &&
        /\brig-(tail|leg|ear|arm|flap|head)\b/.test(node.attribs.class ?? ''),
    )
    .map((el) => {
      const m = /transform-origin:\s*([-\d.]+)px\s+([-\d.]+)px/.exec(
        el.attribs.style ?? '',
      );
      return {
        el,
        kind: /rig-(tail|leg|ear|arm|flap|head)/.exec(el.attribs.class)![1],
        at: [Number(m?.[1]), Number(m?.[2])] as [number, number],
      };
    });
}

/** How many legs each plan stands on, as drawn: a lizard's, a crocodile's and a turtle's four. */
const LEGS: Record<string, number> = {
  quadruped: 4,
  bird: 2,
  hopper: 2,
  climber: 2,
  fish: 0,
  long: 0,
};

describe('every species, drawn by the kit', () => {
  it.each(ANIMAL_SPECIES)(
    '%s draws whole: its parts, every face, its mouth, its joints',
    (species) => {
      const drawn = drawAnimal(plainAnimal(species), species);
      const root = parse(drawn.svg);
      const ids = [...walk(root)]
        .map((node) => node.attribs.id)
        .filter(Boolean);
      // Every id once: faces and parts are found by them.
      expect(new Set(ids).size).toBe(ids.length);
      for (const part of ['head', 'body', 'legs'])
        expect(ids).toContain(drawn.parts[part]);
      for (const face of FIGURE_FACES) {
        expect(drawn.states[face]).toBe(face);
        expect(ids).toContain(face);
      }
      // Its frame: its bottom the ground its feet stand on, as tall as its
      // kind stands, its head in it.
      const [x, y, w, h] = drawn.viewBox;
      expect(y + h).toBeCloseTo(KIT_LINE / 2, 5);
      expect(drawn.units).toBe(h);
      expect(-y).toBeGreaterThan(animalTall(plainAnimal(species)) * 0.85);
      const inFrame = ([px, py]: [number, number]) =>
        px >= x && px <= x + w && py >= y && py <= y + h;
      expect(inFrame(drawn.anchors.head)).toBe(true);
      expect(inFrame(drawn.anchors.mouth)).toBe(true);
      // Its mouth near its head, lower than its eyes (on the muzzle or at the beak).
      const eyeLine = Math.max(...drawn.eyes.map((e) => e.y + e.height / 2));
      expect(drawn.anchors.mouth[1]).toBeGreaterThan(eyeLine);
      // Each leg a joint at its hip, stepping in two alternate sets.
      const legs = drawn.joints.legs;
      const plan = SPECIES[species].plan;
      const expected =
        species === 'lizard' || species === 'crocodile' || species === 'turtle'
          ? 4
          : LEGS[plan];
      expect(legs).toHaveLength(expected);
      if (legs.length)
        expect(new Set(legs.map((leg) => leg.step))).toEqual(
          new Set(['a', 'b']),
        );
      const pivots = movers(root);
      expect(pivots.every(({ at }) => at.every(Number.isFinite))).toBe(true);
      const standing = [...walk(root)].find((node) =>
        /\ba-stand\b/.test(node.attribs.class ?? ''),
      )!;
      expect(movers(standing).filter((one) => one.kind === 'leg')).toHaveLength(
        legs.length,
      );
      // Its head turns about its neck, but a fish's.
      if (species === 'fish') expect(drawn.neck).toBeNull();
      else {
        expect(drawn.neck).not.toBeNull();
        expect(drawn.dip).toBeGreaterThan(0);
      }
    },
  );

  it.each(ANIMAL_SPECIES)(
    '%s draws in the house style, small enough',
    (species) => {
      const { svg } = drawAnimal(plainAnimal(species), species);
      const report = styleReport(svg, 1);
      expect(report.inked / report.outlines).toBeGreaterThanOrEqual(0.95);
      expect(Math.abs(report.line! - KIT_LINE)).toBeLessThanOrEqual(
        KIT_LINE * LINE_SLACK + 0.05,
      );
      expect(report.gradients + report.patterns + report.filters).toBe(0);
      // Four poses and eight faces, each a few hundred bytes: under 56 KB.
      expect(svg.length).toBeLessThan(56_000);
    },
  );

  it.each(ANIMAL_SPECIES)(
    '%s draws in every pose, and the stage holds each it has',
    (species) => {
      const spec = plainAnimal(species);
      const stage = drawAnimal(spec, species);
      for (const pose of ANIMAL_POSES) {
        const still = drawAnimal(spec, species, { pose });
        // A still is one pose alone, shown as drawn, with its head carried there.
        expect(still.svg.match(/class="a-pose /g)).toHaveLength(1);
        expect(still.svg).not.toMatch(/class="a-pose [^"]*" opacity="0"/);
      }
      // The stage's drawing: every pose it has, standing shown, the rest
      // hidden until the body sinks; a fish swims in one.
      expect(stage.svg).toMatch(/class="a-pose a-stand">/);
      expect(stage.svg).not.toMatch(/class="a-pose a-stand" opacity/);
      const poses = stage.svg.match(/class="a-pose /g) ?? [];
      if (species === 'fish') expect(poses).toHaveLength(1);
      else {
        expect(poses.length).toBeGreaterThan(1);
        expect(stage.svg).toContain('--a-lie:clamp(0,(var(--low,0)');
      }
    },
  );

  it('turns to face where it goes: drawn facing right, the stage mirroring it', async () => {
    const drawing = await animalDrawing(plainAnimal('dog'), 'rex');
    expect(drawing.faces).toBe(1);
    // On the artist's path, never the people's.
    expect(drawing.acts).toBeUndefined();
    expect(drawing.lips).toBe(true);
    expect(drawing.limbs).toBe(true);
    expect(drawing.mouth).toEqual(drawing.anchors.mouth);
    expect(drawing.stands?.units).toBe(drawing.viewBox[3]);
    expect(drawing.neck && drawing.dip).toBeTruthy();
    expect(drawing.sinks).toBeGreaterThan(0.1);
  });

  it('speaks with the kit’s mouths: a muzzle’s six shapes, a beak that opens, a fish’s lips', () => {
    const dog = drawAnimal(plainAnimal('dog'), 'dog').svg;
    expect(dog.match(/class="vm v\d"/g)).toHaveLength(6);
    expect(dog).toContain('.lipsync.v0 .v0');
    expect(dog).toContain('.talking .mouth{animation:shut');
    const duck = drawAnimal(plainAnimal('duck'), 'duck').svg;
    expect(duck.match(/class="vm v\d"/g)).toHaveLength(6);
    // The beak's lower half open, with the mouth inside it, in the open shapes.
    const open = /<g class="vm v2">(.*?)<\/g>/.exec(duck)![1];
    expect(open).toContain('#6b2a2e');
    const shut = /<g class="vm v0">(.*?)<\/g>/.exec(duck)![1];
    expect(shut).not.toContain('#6b2a2e');
    const fish = drawAnimal(plainAnimal('fish'), 'fish').svg;
    expect(fish.match(/class="vm v\d"/g)).toHaveLength(6);
  });

  it('wears a saddle blanket on its back, and a collar round its neck', () => {
    const clover = drawAnimal(
      {
        ...plainAnimal('horse'),
        wear: { back: 'saddle blanket' },
        wearColour: 'red',
      },
      'clover',
    );
    const root = parse(clover.svg);
    const body = [...walk(root)].find((node) => node.attribs.id === 'body')!;
    // Red, on the body: over its back, not round its neck.
    expect(parseDocument(clover.svg).children.length).toBeGreaterThan(0);
    const red = [...walk(body)].filter(
      (node) => node.attribs.fill === '#d9534f',
    );
    expect(red.length).toBeGreaterThan(0);
    const head = [...walk(root)].find((node) => node.attribs.id === 'head')!;
    expect(
      [...walk(head)].some((node) => node.attribs.fill === '#d9534f'),
    ).toBe(false);
    const rex = drawAnimal(
      { ...plainAnimal('dog'), wear: { neck: 'collar' }, wearColour: 'blue' },
      'rex',
    );
    expect(rex.svg).toContain('#4a8fd9');
  });

  it('shows its signs: a Z over its head asleep, its eyes shut, curled up when it lies', () => {
    const drawn = drawAnimal(plainAnimal('dog'), 'rex', {
      signs: ['sleeping', 'idea'],
    });
    expect(drawn.states.sleeping).toBe('a-sleeping');
    expect(drawn.states.idea).toBe('a-idea');
    expect(drawn.svg).toContain('id="a-sleeping-face"');
    expect(drawn.svg).toContain('.on-a-sleeping .a-curl{opacity:var(--a-lie)}');
  });

  it('measures its own face exactly: eyes that read, the mouth below them', () => {
    const face = animalFace(plainAnimal('pigeon'));
    expect(face.eyes).toHaveLength(2);
    // The kit's least readable eye on the stage: six units tall.
    expect(
      Math.min(...face.eyes.map((e) => e.box.height)),
    ).toBeGreaterThanOrEqual(6);
  });

  it('is read back from a kept cast, and drawn again when its kind cannot be read', async () => {
    const sheet = await animalSheet(plainAnimal('pig'), 'wilbur');
    const cast = castOf({
      wilbur: sheet,
      gone: { ...sheet, animal: { species: 'unicorn' } },
    });
    expect(cast.wilbur.animal).toEqual(plainAnimal('pig'));
    expect(cast.gone).toBeUndefined();
  });
});

describe('every species stays joined as it moves', () => {
  const AMPLITUDE: Record<string, number> = {
    tail: 40,
    leg: 22,
    ear: 4,
    arm: 110,
    flap: 30,
  };
  it.each(ANIMAL_SPECIES)(
    '%s: its head, tail, legs, ears, arms and wings at their widest',
    async (species) => {
      const drawn = drawAnimal(plainAnimal(species), species, {
        pose: 'stand',
      });
      const root = parse(drawn.svg);
      // Room round it: a part is proved joined, not kept in its frame.
      const [x, y, w, h] = drawn.viewBox;
      const viewBox: [number, number, number, number] = [
        x - w * 0.4,
        y - h * 0.4,
        w * 1.8,
        h * 1.8,
      ];
      root.attribs.viewBox = viewBox.join(' ');
      const all = movers(root);
      const heads = all.filter((one) => one.kind === 'head');
      const swings: Swing[] = all
        .filter((one) => one.kind !== 'head')
        .map(({ el, kind, at: [px, py] }) => ({
          part: { keep: [el], drop: [] },
          ref: { keep: null, drop: [el] },
          moved: (a: number) => new Map([[el, `rotate(${a} ${px} ${py})`]]),
          amplitude: AMPLITUDE[kind],
          both: true,
        }));
      if (heads.length && drawn.dip) {
        const [px, py] = heads[heads.length - 1].at;
        swings.push({
          part: { keep: heads.map((one) => one.el), drop: [] },
          ref: { keep: null, drop: heads.map((one) => one.el) },
          moved: (a: number) =>
            new Map(heads.map((one) => [one.el, `rotate(${a} ${px} ${py})`])),
          amplitude: drawn.dip,
          both: true,
        });
      }
      const proved = await holdsTogether(root, viewBox, swings);
      expect(proved.amplitudes).toEqual(swings.map((one) => one.amplitude));
    },
    60_000,
  );
});

describe("the drawing checks' scorecard", () => {
  it.each([
    'dog',
    'horse',
    'duck',
    'fish',
    'snake',
    'monkey',
    'crocodile',
  ] as const)(
    '%s passes every point code checks',
    async (species) => {
      const spec: AnimalSpec = plainAnimal(species);
      const sheet = await animalSheet(spec, species);
      const checks = await checkSheet(sheet, { unjoined: [] });
      expect(codeNotes(checks)).toEqual([]);
    },
    60_000,
  );
});
