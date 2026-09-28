import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import {
  CREATURE_BODIES,
  CREATURE_TALL,
  creatureFor,
  creatureOf,
  describeCreature,
  plainCreature,
  type CreatureSpec,
} from './scene-creature';
import { creatureFace, drawCreature } from './scene-creature-draw';
import { ANIMAL_POSES, drawAnimal } from './scene-animal-draw';
import { plainAnimal } from './scene-animal';
import { reachOf } from './scene-animal-shapes';
import { checkSheet, codeNotes } from './drawing-checks';
import { walk, elements } from './scene-dom';
import { FIGURE_FACES } from './scene-figure';
import { KIT_LINE, LINE_SLACK } from './scene-ink';
import { styleReport } from './scene-polish';
import { castOf, creatureDrawing, creatureSheet } from './scene-sheet';
import { holdsTogether, type Swing } from './scene-sheet-rig';

const parse = (svg: string) =>
  elements(parseDocument(svg, { xmlMode: true }).children)[0];

/** A part's markup inside its groups' moves and line widths, as it is drawn. */
function inPlace(node: Element): string {
  let markup = render(node, { xmlMode: true });
  for (
    let up = node.parent as Element | null;
    up && up.name;
    up = up.parent as Element | null
  ) {
    const move = up.attribs.transform;
    const width = up.attribs['stroke-width'];
    if (move || width)
      markup = `<g${move ? ` transform="${move}"` : ''}${width ? ` stroke-width="${width}"` : ''}>${markup}</g>`;
  }
  return markup;
}

const extent = (points: [number, number][]) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

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

/** The bench's creatures, as their writer would give them. */
const CAST: Record<string, CreatureSpec> = {
  humpty: creatureOf({
    body: 'egg',
    bodyColour: 'white',
    arms: 'stick',
    legs: 'stick',
    wear: { neck: 'bow tie', body: 'belt' },
    wearColour: 'red',
  })!,
  eggbert: creatureOf({
    body: 'egg',
    size: 'small',
    build: 'stout',
    bodyColour: 'white',
    texture: 'crack',
    arms: 'stick',
    legs: 'stick',
    wear: { neck: 'bow tie' },
  })!,
  ember: creatureOf({
    body: 'pear',
    size: 'small',
    bodyColour: 'green',
    texture: 'belly',
    textureColour: 'yellow',
    head: 'round',
    nose: 'snout',
    top: 'spikes',
    arms: 'kit',
    legs: 'feet',
    wings: 'bat',
    tail: 'spiked',
  })!,
  grub: creatureOf({
    body: 'ball',
    bodyColour: 'purple',
    texture: 'fur',
    eyes: 1,
    top: 'horns',
    arms: 'none',
    legs: 'feet',
  })!,
  bolt: creatureOf({
    body: 'box',
    bodyColour: 'silver',
    texture: 'rivets',
    head: 'round',
    top: 'antennae',
    arms: 'kit',
    legs: 'kit',
  })!,
  frosty: creatureOf({
    body: 'stack',
    bodyColour: 'white',
    texture: 'buttons',
    head: 'round',
    nose: 'carrot',
    top: 'hat',
    arms: 'stick',
    limbColour: 'brown',
    legs: 'none',
    wear: { neck: 'scarf' },
    wearColour: 'red',
  })!,
  boo: creatureOf({ body: 'ghost', size: 'small', bodyColour: 'white' })!,
  twinkle: creatureOf({
    body: 'star',
    bodyColour: 'yellow',
    eyes: 3,
    top: 'halo',
    wings: 'insect',
    arms: 'tentacles',
    legs: 'tail',
    wear: { face: 'glasses' },
  })!,
  prof: creatureOf({
    body: 'column',
    bodyColour: 'teal',
    top: 'ears',
    head: 'box',
    arms: 'wings',
    legs: 'kit',
    tail: 'long',
    wear: { body: 'waistcoat', face: 'monocle', neck: 'collar' },
    wearColour: 'navy',
  })!,
};

/** Every body, plain, and the cast. */
const ALL: [string, CreatureSpec][] = [
  ...CREATURE_BODIES.map(
    (body) =>
      [`a plain ${body}`, plainCreature(body)] as [string, CreatureSpec],
  ),
  ...Object.entries(CAST),
];

describe('a creature, as a writer or the maker says it', () => {
  it('reads a spec, each value one of the lists, other words for them taken', () => {
    expect(
      creatureOf({
        body: 'boxy',
        build: 'chubby',
        size: 'big',
        bodyColour: 'gray',
        texture: 'bolts',
        eyes: 'three',
        nose: 'none',
        head: 'box',
        top: 'antenna',
        arms: 'kit',
        legs: 'stubby',
        limbColour: 'metal',
        wings: 'none',
        tail: 'none',
        wear: { neck: 'bowtie', face: 'specs' },
        wearColour: 'blue',
      }),
    ).toEqual({
      body: 'box',
      build: 'stout',
      size: 'large',
      bodyColour: 'grey',
      texture: 'rivets',
      textureColour: null,
      eyes: 3,
      nose: 'none',
      head: 'box',
      top: 'antennae',
      arms: 'kit',
      legs: 'feet',
      limbColour: 'silver',
      wings: 'none',
      tail: 'none',
      wear: { neck: 'bow tie', face: 'glasses' },
      wearColour: 'blue',
    });
  });

  it('is none when the kit has no such body: the artist draws it', () => {
    expect(creatureOf({ body: 'mermaid' })).toBeNull();
    expect(creatureOf({})).toBeNull();
    expect(creatureOf(null)).toBeNull();
  });

  it("takes the body's plain own for what is missing, and wears in red when no colour is said", () => {
    expect(creatureOf({ body: 'egg' })).toEqual(plainCreature('egg'));
    const snowman = creatureOf({ body: 'snowman' })!;
    expect(snowman.head).toBe('round');
    expect(snowman.nose).toBe('carrot');
    expect(
      creatureOf({ body: 'egg', wear: { neck: 'bow tie' } })!.wearColour,
    ).toBe('red');
    expect(
      creatureOf({ body: 'egg', wearColour: 'blue' })!.wearColour,
    ).toBeNull();
  });

  it('is said in a few words', () => {
    expect(describeCreature(CAST.humpty)).toBe(
      'a white egg-shaped creature with thin arms and thin legs, wearing a red bow tie and a red belt',
    );
    expect(describeCreature(CAST.grub)).toBe(
      'a purple round creature with fur, one big eye, horns and feet',
    );
  });

  it("is the bible's: a book's creatures stay the artist's", () => {
    expect(creatureFor({ creature: CAST.boo })).toBe(CAST.boo);
    expect(creatureFor({})).toBeNull();
  });
});

describe('every creature, drawn by the kit', () => {
  it.each(ALL)(
    '%s draws whole: its parts, every face, its mouth, its joints',
    (_, spec) => {
      const drawn = drawCreature(spec, 'c');
      const root = parse(drawn.svg);
      const ids = [...walk(root)]
        .map((node) => node.attribs.id)
        .filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
      for (const part of ['head', 'body', 'legs'])
        expect(ids).toContain(drawn.parts[part]);
      for (const face of FIGURE_FACES) {
        expect(drawn.states[face]).toBe(face);
        expect(ids).toContain(face);
      }
      const [x, y, w, h] = drawn.viewBox;
      expect(y + h).toBeCloseTo(KIT_LINE / 2, 5);
      expect(drawn.units).toBe(h);
      // As tall as its size stands, its top things above.
      expect(-y).toBeGreaterThan(CREATURE_TALL[spec.size] * 0.95);
      const inFrame = ([px, py]: [number, number]) =>
        px >= x && px <= x + w && py >= y && py <= y + h;
      expect(inFrame(drawn.anchors.head)).toBe(true);
      expect(inFrame(drawn.anchors.mouth)).toBe(true);
      // As many eyes as it has, its mouth below them.
      expect(drawn.eyes).toHaveLength(spec.eyes);
      const eyeLine = Math.max(...drawn.eyes.map((e) => e.y + e.height / 2));
      expect(drawn.anchors.mouth[1]).toBeGreaterThan(eyeLine);
      // Its arms turn about their shoulders, its legs step in turn.
      expect(drawn.joints.arms).toHaveLength(spec.arms === 'none' ? 0 : 2);
      const legs = drawn.joints.legs;
      if (['stick', 'kit', 'feet'].includes(spec.legs)) {
        expect(legs).toHaveLength(2);
        expect(new Set(legs.map((leg) => leg.step))).toEqual(
          new Set(['a', 'b']),
        );
      } else expect(legs).toHaveLength(0);
      expect(movers(root).every(({ at }) => at.every(Number.isFinite))).toBe(
        true,
      );
      // Its head nods about its neck when it has one apart; else it is one piece.
      if (spec.head === 'none') expect(drawn.neck).toBeNull();
      else expect(drawn.dip).toBeGreaterThan(0);
    },
  );

  it.each(ALL)('%s draws in the house style, small enough', (_, spec) => {
    const { svg } = drawCreature(spec, 'c');
    const report = styleReport(svg, 1);
    expect(report.inked / report.outlines).toBeGreaterThanOrEqual(0.95);
    expect(Math.abs(report.line! - KIT_LINE)).toBeLessThanOrEqual(
      KIT_LINE * LINE_SLACK + 0.05,
    );
    expect(report.gradients + report.patterns + report.filters).toBe(0);
    expect(svg.length).toBeLessThan(64_000);
  });

  it.each(ALL)(
    '%s stands (and sits, with legs) on the ground, not in it',
    (_, spec) => {
      for (const pose of ANIMAL_POSES) {
        const { svg } = drawCreature(spec, 'c', { pose });
        const drawn = svg
          .replace(/<style>[\s\S]*?<\/style>/, '')
          .replace(/<ellipse cx="0" cy="-0.6"[^>]*\/>/, '');
        const lowest = Math.max(...reachOf(drawn).map((p) => p[1]));
        expect(lowest).toBeLessThanOrEqual(KIT_LINE / 2 + 1);
      }
      const stage = drawCreature(spec, 'c').svg;
      const poses = stage.match(/class="a-pose /g) ?? [];
      expect(poses).toHaveLength(
        spec.legs === 'stick' || spec.legs === 'kit' ? 4 : 1,
      );
    },
  );

  it.each(ALL)('%s talks with a mouth that reads on the stage', (_, spec) => {
    const drawn = drawCreature(spec, 'c', { pose: 'stand' });
    const root = parse(drawn.svg);
    const shape = (k: number) =>
      extent(
        reachOf(
          inPlace(
            [...walk(root)].find((node) => node.attribs.class === `vm v${k}`)!,
          ),
          0,
        ),
      );
    const [w, h] = shape(2);
    expect(w).toBeGreaterThanOrEqual(KIT_LINE * 2.5);
    expect(h).toBeGreaterThanOrEqual(KIT_LINE * 1.75);
    expect(h).toBeGreaterThan(shape(0)[1]);
  });

  it('keeps its face in the upper part of its body, as large as it is wide', () => {
    for (const spec of [CAST.humpty, CAST.eggbert, plainCreature('bean')]) {
      const drawn = drawCreature(spec, 'c', { pose: 'stand' });
      const [, y, w, h] = drawn.viewBox;
      const top = y;
      const eyes = drawn.eyes;
      const middle =
        eyes.reduce((n, e) => n + e.y + e.height / 2, 0) / eyes.length;
      // The eyes above the body's middle, not on its belly.
      expect(middle).toBeLessThan(drawn.anchors.body[1]);
      expect(middle - top).toBeLessThan(h * 0.45);
      // The pair spans a good share of the body.
      const span =
        Math.max(...eyes.map((e) => e.x + e.width)) -
        Math.min(...eyes.map((e) => e.x));
      expect(span).toBeGreaterThan(w * 0.22);
    }
  });

  it('draws one eye under one pair of brows, and three with the third above', () => {
    const one = drawCreature(CAST.grub, 'grub');
    const angry = /<g id="angry">([\s\S]*?)<g class="mouth"/.exec(one.svg)![1];
    expect(angry.match(/<g class="brows">/g)).toHaveLength(1);
    expect(one.eyes).toHaveLength(1);
    const three = drawCreature(CAST.twinkle, 'twinkle');
    expect(three.eyes).toHaveLength(3);
    expect(three.eyes[2].y).toBeLessThan(three.eyes[0].y);
    expect(three.svg).toMatch(/clipPath id="c[a-z0-9]+-eyes3"/);
  });

  it('plays on the artist path: facing the viewer, its arms turning, or in one piece', async () => {
    const humpty = await creatureDrawing(CAST.humpty, 'humpty');
    expect(humpty.acts).toBeUndefined();
    expect(humpty.faces).toBeUndefined();
    expect(humpty.lips).toBe(true);
    expect(humpty.limbs).toBe(true);
    expect(humpty.onePiece).toBeUndefined();
    expect(humpty.sinks).toBeGreaterThan(0.1);
    expect(humpty.svg).toContain(
      '.rig-arm-r{rotate:calc(clamp(-110, var(--ar,0), 110)*1deg)}',
    );
    const grub = await creatureDrawing(CAST.grub, 'grub');
    expect(grub.limbs).toBeUndefined();
    expect(grub.onePiece).toBe(true);
    const bolt = await creatureDrawing(CAST.bolt, 'bolt');
    expect(bolt.neck && bolt.dip).toBeTruthy();
    // A ghost floats.
    expect(drawCreature(CAST.boo, 'boo').svg).toContain('@keyframes float');
  });

  it('wears a bow tie below its mouth and a belt round its middle, in their colour', () => {
    const drawn = drawCreature(
      { ...CAST.humpty, wearColour: 'blue' },
      'humpty',
    );
    expect(drawn.svg).toContain('#4a8fd9');
    const blue = [...walk(parse(drawn.svg))].filter(
      (node) => node.attribs.fill === '#4a8fd9',
    );
    // The bow tie's two wings and the belt, all on the body.
    expect(blue.length).toBeGreaterThanOrEqual(3);
  });

  it('draws a crack as a jagged line with a darker inner edge, clipped to the body', () => {
    const { svg } = drawCreature(CAST.eggbert, 'eggbert', { pose: 'stand' });
    const clipped =
      /<g clip-path="url\(#(c[a-z0-9]+-body)\)">([\s\S]*?)<\/g>/.exec(svg)!;
    expect(
      clipped[2].match(/<path d="M[^"]* L[^"]* L[^"]* L/g)!.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('measures its own face exactly: eyes that read, the mouth below them', () => {
    const face = creatureFace(CAST.eggbert);
    expect(face.eyes).toHaveLength(2);
    expect(
      Math.min(...face.eyes.map((e) => e.box.height)),
    ).toBeGreaterThanOrEqual(6);
  });

  it('is read back from a kept cast, and drawn again when its body cannot be read', async () => {
    const sheet = await creatureSheet(CAST.boo, 'boo');
    const cast = castOf({
      boo: sheet,
      gone: { ...sheet, creature: { body: 'mermaid' } },
    });
    expect(cast.boo.creature).toEqual(CAST.boo);
    expect(cast.gone).toBeUndefined();
  });

  it("leaves the animal kit's drawings as they were", () => {
    // The animal kit's own drawing, which the creature kit shares, still
    // draws two eyes and no glasses.
    const dog = drawAnimal(plainAnimal('dog'), 'rex');
    expect(dog.eyes).toHaveLength(2);
    expect(dog.svg).not.toContain('-eyes3');
  });
});

describe('every creature stays joined as it moves', () => {
  const AMPLITUDE: Record<string, number> = {
    tail: 40,
    leg: 22,
    ear: 4,
    arm: 110,
    flap: 30,
  };
  it.each(Object.entries(CAST))(
    '%s: its head, tail, legs, ears, arms and wings at their widest',
    async (_, spec) => {
      const drawn = drawCreature(spec, 'c', { pose: 'stand' });
      const root = parse(drawn.svg);
      const [x, y, w, h] = drawn.viewBox;
      const viewBox: [number, number, number, number] = [
        x - w * 0.6,
        y - h * 0.6,
        w * 2.2,
        h * 2.2,
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
    ['humpty', 2],
    ['eggbert', 2],
    ['ember', null],
    ['grub', 2],
    ['bolt', 2],
    ['frosty', null],
    ['boo', null],
  ] as const)(
    '%s passes every point code checks',
    async (name, legs) => {
      const sheet = await creatureSheet(CAST[name], name);
      const checks = await checkSheet(sheet, { unjoined: [], legs });
      expect(codeNotes(checks)).toEqual([]);
    },
    60_000,
  );
});
