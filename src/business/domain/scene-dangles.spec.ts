import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import { plainAnimal, ANIMAL_SPECIES } from './scene-animal';
import { ANIMAL_POSES, drawAnimal } from './scene-animal-draw';
import { thingDto } from './scene-compose';
import {
  CREATURE_BODIES,
  CREATURE_TAILS,
  plainCreature,
} from './scene-creature';
import { drawCreature } from './scene-creature-draw';
import {
  ANIMAL_SWING,
  DANGLE_FEEL,
  PERSON_SWING,
  cutChain,
  dangleCss,
  posedDangles,
  strideLength,
  swapRigGroups,
} from './scene-dangles';
import { byId, elements, removeNode } from './scene-dom';
import {
  PLAIN_FIGURE,
  drawFigure,
  figureOf,
  type FigureExtra,
  type FigureSpec,
} from './scene-figure';
import { renderSvg } from './scene-raster';
import type { SceneThing } from './scene-script';
import { figureDrawing } from './scene-sheet';

/**
 * Dangles (studio-world-plan §4.3) and the kits' rig 2 (§4.6): what swings
 * drawn as chains of segments the player turns, on a drawing made with rig
 * 2; every drawing made as before byte for byte as it was.
 */

const as = (patch: Partial<FigureSpec>): FigureSpec => ({
  ...PLAIN_FIGURE,
  ...patch,
});
const swingers: FigureSpec[] = [
  as({ hair: 'ponytail', extras: ['cloak'] }),
  as({ age: 'child', hair: 'pigtails', extras: ['scarf'] }),
  as({ hair: 'braids', extras: ['wings'], skin: 8 }),
  as({ hair: 'locs', extras: ['cape'], skin: 9 }),
  as({ hair: 'long', extras: ['ribbon'], accentColour: 'pink' }),
  as({
    headwear: 'headscarf',
    top: 'dress',
    extras: ['headscarf tail'],
    accentColour: 'green',
  }),
];

/** A drawing with only `face` of its states on, as a still shows it. */
function wearing(
  drawn: { svg: string; states: Record<string, string> },
  face = 'neutral',
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

const sha = (xs: unknown[]) =>
  createHash('sha256')
    .update(xs.map((x) => JSON.stringify(x)).join('\n'))
    .digest('hex');

describe('rig 1, byte for byte', () => {
  it('is what every kit draws unless asked, and asking for it changes nothing', () => {
    for (const spec of swingers) {
      const plain = drawFigure(spec, 'x');
      expect(drawFigure(spec, 'x', { rig: 1 })).toEqual(plain);
      expect(plain.svg).not.toContain('class="dg');
      expect(plain.rig).toBeUndefined();
      expect(plain.dangles).toBeUndefined();
    }
    const dog = plainAnimal('dog');
    expect(drawAnimal(dog, 'rex', { rig: 1 })).toEqual(drawAnimal(dog, 'rex'));
    expect(drawAnimal(dog, 'rex').svg).not.toContain('class="dg');
    const blob = { ...plainCreature('egg'), tail: 'long' as const };
    expect(drawCreature(blob, 'b', { rig: 1 })).toEqual(
      drawCreature(blob, 'b'),
    );
  });

  it('draws every animal and creature it drew before exactly as before', () => {
    // Hashed from the kits before rig 2 was drawn: a change to how the
    // story's animals and creatures look on rig 1 must be meant.
    const animals = ANIMAL_SPECIES.flatMap((sp) => [
      drawAnimal(plainAnimal(sp), sp),
      ...ANIMAL_POSES.map((pose) => drawAnimal(plainAnimal(sp), sp, { pose })),
    ]);
    const creatures = CREATURE_BODIES.flatMap((body) =>
      CREATURE_TAILS.map((tail) =>
        drawCreature({ ...plainCreature(body), tail, top: 'antennae' }, body),
      ),
    );
    expect(sha(animals)).toBe(
      '5412d9810cf8e17fbc43531a686b31508f60aed804f78cd2d5adc8747ca4db33',
    );
    expect(sha(creatures)).toBe(
      '10df5efead570558aafa266acf8b47b271e4f3b1db9e7ba73e75ac0f62b7d72b',
    );
  });
});

describe('the new extras', () => {
  it('reads a cape as a cape, apart from the long cloak, and names a ribbon and a headscarf’s end', () => {
    const read = (extras: string[]) => figureOf({ extras }).extras;
    expect(read(['cape'])).toEqual(['cape']);
    expect(read(['cloak'])).toEqual(['cloak']);
    expect(read(['hair ribbon', 'scarf tail'])).toEqual([
      'ribbon',
      'headscarf tail',
    ]);
  });

  it('draws each on rig 1 too, where it hangs', () => {
    for (const extra of ['cape', 'ribbon', 'headscarf tail'] as FigureExtra[]) {
      const without = drawFigure(as({ headwear: 'headscarf' }), 'x').svg;
      const withIt = drawFigure(
        as({ headwear: 'headscarf', extras: [extra] }),
        'x',
      ).svg;
      expect(withIt.length).toBeGreaterThan(without.length);
    }
  });
});

describe('a person on rig 2', () => {
  it('draws each part that swings as a chain, turned by its variables', () => {
    const expected: Record<string, [string, number][]> = {
      0: [
        ['cloak', 3],
        ['pony', 3],
      ],
      1: [
        ['scarf', 2],
        ['pig-l', 2],
        ['pig-r', 2],
      ],
      2: [
        ['wing-l', 1],
        ['wing-r', 1],
        ['braid-l', 2],
        ['braid-r', 2],
      ],
      3: [
        ['cape', 3],
        ['locs-l', 2],
        ['locs-r', 2],
      ],
      4: [
        ['hair', 2],
        ['ribbon', 2],
      ],
      5: [['headscarf', 2]],
    };
    swingers.forEach((spec, i) => {
      const drawn = drawFigure(spec, `p${i}`, { rig: 2 });
      expect(drawn.rig).toBe(2);
      expect(drawn.dangles!.map((d) => [d.id, d.segments])).toEqual(
        expected[i],
      );
      for (const one of drawn.dangles!) {
        expect(drawn.svg).toContain(`class="dg dg-${one.id}"`);
        for (let k = 0; k < one.segments; k += 1) {
          expect(drawn.svg).toContain(
            `class="dg-${one.id}-${k}" style="transform-origin:`,
          );
          expect(drawn.svg).toContain(
            `.dg-${one.id}-${k}{rotate:calc(var(--dg-${one.id}-${k},0)*1deg)}`,
          );
        }
        // Its root in the frame, and how it swings.
        const [x, y, w, h] = drawn.viewBox;
        expect(one.root[0]).toBeGreaterThan(x);
        expect(one.root[0]).toBeLessThan(x + w);
        expect(one.root[1]).toBeGreaterThan(y);
        expect(one.root[1]).toBeLessThan(y + h);
        expect(one.length).toBeGreaterThan(5);
        expect(one.limit).toBeGreaterThan(0);
      }
      // Its clip paths its own, so two people in one picture never share one.
      const other = drawFigure(spec, 'someone else', { rig: 2 }).svg;
      const ids = (svg: string) =>
        [...svg.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
      expect(ids(drawn.svg).filter((one) => ids(other).includes(one))).toEqual([
        'eyes',
      ]);
      // A stride: as far as the legs carry them swung 24 degrees either
      // way, each foot planted.
      expect(drawn.stride!.gait).toBe('walk');
      expect(drawn.stride!.length).toBeGreaterThan(10);
      // Each part says which way it hangs from its root.
      for (const one of drawn.dangles!)
        expect(Math.hypot(...one.dir)).toBeCloseTo(1, 2);
    });
  });

  it('walks as the player walks them: no loop of its own steps the legs or bobs the body', () => {
    for (const spec of swingers) {
      const two = drawFigure(spec, 'x', { rig: 2 }).svg;
      expect(two).not.toContain('@keyframes step');
      expect(two).not.toContain('.on-walking .leg');
      expect(two).not.toContain('@keyframes bob');
      // Still the rig's legs, knees and sink, which the player sets.
      expect(two).toContain('.l1{transform:rotate(calc(var(--legr,0)*1deg))}');
      const one = drawFigure(spec, 'x').svg;
      expect(one).toContain('.on-walking .leg{animation:step');
    }
    const walker = drawFigure(swingers[0], 'x', {
      rig: 2,
      signs: ['walking'],
    }).svg;
    expect(walker).not.toContain('@keyframes step');
  });

  it('strides as far as the legs carry them, each foot planted', () => {
    // An adult's legs, hip to ankle: 38 + 4 units.
    const drawn = drawFigure(PLAIN_FIGURE, 'x', { rig: 2 });
    expect(drawn.stride!.length).toBeCloseTo(
      Math.round(strideLength(42, PERSON_SWING) * 10) / 10,
      5,
    );
    expect(strideLength(50, 24)).toBeCloseTo(4 * 50 * Math.sin(0.4189), 2);
  });

  it('stands exactly as rig 1 draws them, at rest', async () => {
    jest.setTimeout(60000);
    const svgs = swingers.flatMap((spec) => [
      wearing(drawFigure(spec, 'x')),
      wearing(drawFigure(spec, 'x', { rig: 2 })),
    ]);
    const { ground } = await renderSvg(svgs[0], undefined, {
      ground: { svgs, cols: 160 },
    });
    for (let i = 0; i < svgs.length; i += 2) {
      const [a, b] = [ground![i].rgba, ground![i + 1].rgba];
      let off = 0;
      for (let p = 0; p < a.length; p += 4)
        if (Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) > 60)
          off += 1;
      // A pixel or two where an edge is drawn twice, no more.
      expect(off).toBeLessThan((a.length / 4) * 0.004);
    }
  }, 60000);

  it('says where each swings in a group, lying down and in bed', () => {
    const three = drawFigure(swingers[0], 'g', { rig: 2, count: 3 });
    expect(three.dangles!.length).toBeGreaterThanOrEqual(2);
    const standing = drawFigure(swingers[0], 'g', { rig: 2 });
    const lying = drawFigure(swingers[0], 'g', { rig: 2, pose: 'lying' });
    expect(lying.stride).toBeUndefined();
    const pony = (d: typeof lying) => d.dangles!.find((x) => x.id === 'pony')!;
    // Lying on their side, the rig's points turned a quarter.
    expect(pony(lying).root).not.toEqual(pony(standing).root);
    const bed = drawFigure(swingers[0], 'g', { rig: 2, pose: 'in bed' });
    expect(bed.rig).toBe(2);
    expect(bed.svg).toContain('class="dg dg-pony"');
  });

  it('is what a page draws a person with when asked, its dangles on the drawing', async () => {
    const drawn = await figureDrawing(swingers[0], 'maya', { rig: 2 });
    expect(drawn.rigVersion).toBe(2);
    expect(drawn.dangles!.map((d) => d.id)).toEqual(['cloak', 'pony']);
    expect(drawn.stride!.gait).toBe('walk');
    expect(drawn.stride!.length).toBeGreaterThan(10);
    const kept = await figureDrawing(swingers[0], 'maya');
    expect(kept.rigVersion).toBeUndefined();
    expect(kept.dangles).toBeUndefined();
  });
});

describe('an animal and a creature on rig 2', () => {
  it('cuts a tail three or four, a stub one, long ears two, a mane two', () => {
    const ids = (d: { dangles?: { id: string; segments: number }[] }) =>
      Object.fromEntries(d.dangles!.map((x) => [x.id, x.segments]));
    const dog = drawAnimal(plainAnimal('dog'), 'rex', { rig: 2 });
    expect(dog.rig).toBe(2);
    expect(ids(dog).tail).toBeGreaterThanOrEqual(3);
    expect(ids(drawAnimal(plainAnimal('pig'), 'p', { rig: 2 })).tail).toBe(1);
    const rabbit = ids(drawAnimal(plainAnimal('rabbit'), 'r', { rig: 2 }));
    expect(rabbit['ear-0']).toBe(2);
    const horse = ids(drawAnimal(plainAnimal('horse'), 'h', { rig: 2 }));
    expect(horse.mane).toBe(2);
    expect(horse.tail).toBeGreaterThanOrEqual(3);
    expect(dog.stride!.gait).toBe('walk');
    expect(dog.stride!.length).toBeGreaterThan(5);
    const bug = drawCreature(
      { ...plainCreature('ball'), tail: 'long', top: 'antennae' },
      'bug',
      { rig: 2 },
    );
    expect(Object.keys(ids(bug)).sort()).toEqual(['ear-0', 'ear-1', 'tail']);
    expect(bug.svg).toContain(
      '.dg-tail-0{rotate:calc(var(--dg-tail-0,0)*1deg)}',
    );
  });

  it('goes as the player walks it: its legs, bob, waddle, hop and slither by variables, no loops', () => {
    for (const species of ANIMAL_SPECIES) {
      const one = drawAnimal(plainAnimal(species), species);
      const two = drawAnimal(plainAnimal(species), species, { rig: 2 });
      expect(two.svg).not.toContain('@keyframes step');
      expect(two.svg).not.toContain('.on-walking .a-gait');
      expect(two.svg).not.toContain('.on-walking .rig-leg');
      expect(two.svg).toContain('translate:0 calc(var(--gait-y,0)*-1px)');
      if (two.joints.legs.length) {
        expect(two.svg).toContain(
          '.rig-leg-a{rotate:calc(var(--step-a,0)*1deg)}',
        );
        expect(two.svg).toContain(
          '.rig-leg-b{rotate:calc(var(--step-b,0)*1deg)}',
        );
      }
      // Rig 1 as it was.
      expect(one.svg).toContain('.on-walking');
      expect(one.svg).not.toContain('--step-a');
      // A stride its legs carry it, each foot planted, by how it goes.
      const legs = two.joints.legs.map((leg) =>
        Math.hypot(leg.foot[0] - leg.hip[0], leg.foot[1] - leg.hip[1]),
      );
      if (legs.length && two.stride!.gait === 'walk')
        expect(two.stride!.length).toBeCloseTo(
          strideLength(
            legs.reduce((a, b) => a + b, 0) / legs.length,
            ANIMAL_SWING,
          ),
          0,
        );
    }
    const snake = drawAnimal(plainAnimal('snake'), 'sss', { rig: 2 });
    if (snake.stride!.gait === 'slither')
      expect(snake.svg).toContain('skewX(calc(var(--gait-k,0)*1deg))');
    const boo = drawCreature(plainCreature('ghost'), 'boo', { rig: 2 });
    expect(boo.svg).toContain('@keyframes float');
  });

  it('cuts every pose’s tail as its standing one, and keeps its frame', () => {
    const plain = drawAnimal(plainAnimal('cat'), 'tom');
    const cat = drawAnimal(plainAnimal('cat'), 'tom', { rig: 2 });
    expect(cat.viewBox).toEqual(plain.viewBox);
    const tail = cat.dangles!.find((d) => d.id === 'tail')!;
    expect(tail.root[0]).toBeCloseTo(plain.joints.tail![0], 0);
    expect(tail.root[1]).toBeCloseTo(plain.joints.tail![1], 0);
    for (const pose of ['sit', 'lie'])
      expect(cat.svg).toContain(`${tail.segments - 1}-${pose}"`);
    expect(cat.svg).not.toContain(`class="dg-tail-${tail.segments}"`);
  });
});

describe('the chain', () => {
  it('bands a part so the bands at rest are the whole of it, each segment in the one before', () => {
    const made = cutChain({
      id: 't',
      markup:
        '<path d="M0,0 L0,90" fill="none" stroke="#000" stroke-width="6"/>',
      root: [0, 0],
      segments: 3,
      clip: 'c',
    });
    expect(made.segments).toBe(3);
    expect(made.length).toBeCloseTo(93, 0);
    // Nested: the third inside the second inside the first.
    expect(made.markup).toMatch(
      /class="dg-t-0"[^]*class="dg-t-1"[^]*class="dg-t-2"[^]*<\/g><\/g><\/g><\/g>$/,
    );
    expect(made.markup.match(/<clipPath /g)).toHaveLength(3);
  });

  it('turns a rig group’s inside, finding its end past groups within it', () => {
    const markup =
      '<g class="rig-tail" style="transform-origin:1px 2px"><g><path/></g><circle/></g><rect/>';
    const seen: string[] = [];
    const out = swapRigGroups(markup, 'rig-tail', (inner, pivot) => {
      seen.push(`${inner}@${pivot.join(',')}`);
      return 'X';
    });
    expect(seen).toEqual(['<g><path/></g><circle/>@1,2']);
    expect(out).toBe(
      '<g class="rig-tail" style="transform-origin:1px 2px">X</g><rect/>',
    );
  });

  it('writes a pose into a drawing for a still, and its CSS for the player', () => {
    const svg = '<g class="dg-wing-l-0" style="transform-origin:3px -4.5px"/>';
    expect(posedDangles(svg, 20)).toBe(
      '<g class="dg-wing-l-0" transform="rotate(20 3 -4.5)"/>',
    );
    expect(dangleCss([{ id: 'a', segments: 2 }])).toBe(
      '.dg g{transform-box:view-box}.dg-a-0{rotate:calc(var(--dg-a-0,0)*1deg)}.dg-a-1{rotate:calc(var(--dg-a-1,0)*1deg)}',
    );
    expect(dangleCss([])).toBe('');
  });
});

describe('the scene the player gets', () => {
  it('carries the rig, the dangles and the stride of a drawing made on rig 2, and nothing of one made before', async () => {
    const thing = {
      id: 'maya',
      kind: 'person',
      name: 'Maya',
    } as unknown as SceneThing;
    const drawn = await figureDrawing(swingers[0], 'maya', { rig: 2 });
    const dto = thingDto(thing, drawn, true);
    if (dto.kind !== 'drawing') throw new Error('not a drawing');
    expect(dto.rigVersion).toBe(2);
    expect(dto.dangles).toEqual(drawn.dangles);
    expect(dto.stride).toEqual(drawn.stride);
    const old = thingDto(thing, await figureDrawing(swingers[0], 'maya'), true);
    expect(old).not.toHaveProperty('rigVersion');
    expect(old).not.toHaveProperty('dangles');
    expect(old).not.toHaveProperty('stride');
  });
});

describe('the contact sheet', () => {
  it('renders people, animals and creatures with every segment turned, and holds together', async () => {
    const people = swingers.map((spec, i) =>
      drawFigure(spec, `p${i}`, { rig: 2 }),
    );
    const beasts = [
      drawAnimal(plainAnimal('dog'), 'rex', { rig: 2, pose: 'stand' }),
      drawAnimal(plainAnimal('cat'), 'tom', { rig: 2, pose: 'stand' }),
      drawAnimal(plainAnimal('horse'), 'h', { rig: 2, pose: 'stand' }),
      drawAnimal(plainAnimal('fox'), 'f', { rig: 2, pose: 'stand' }),
      drawAnimal(plainAnimal('mouse'), 'm', { rig: 2, pose: 'stand' }),
      drawAnimal(plainAnimal('rabbit'), 'r', { rig: 2, pose: 'stand' }),
      drawAnimal(plainAnimal('lion'), 'l', { rig: 2, pose: 'stand' }),
      drawAnimal(plainAnimal('crocodile'), 'c', { rig: 2, pose: 'stand' }),
      drawCreature(
        { ...plainCreature('ball'), tail: 'spiked', top: 'antennae' },
        'bug',
        { rig: 2, pose: 'stand' },
      ),
      drawCreature(
        { ...plainCreature('drop'), tail: 'long', top: 'ears' },
        'drop',
        { rig: 2, pose: 'stand' },
      ),
    ];
    const rows = [...people, ...beasts];
    // At rest; every segment at 20° and at -20°; and each at its own limit.
    const limitOf = (drawn: (typeof rows)[number]) => (id: string) =>
      drawn.dangles?.find((one) => one.id === id)?.limit ?? 0;
    const columns: {
      label: string;
      angle: (d: (typeof rows)[number]) => number | ((id: string) => number);
    }[] = [
      { label: 'rest', angle: () => 0 },
      { label: '+20°', angle: () => 20 },
      { label: '−20°', angle: () => -20 },
      { label: '+limit', angle: (d) => limitOf(d) },
    ];
    const W = 260;
    const H = 260;
    const cells = rows.flatMap((drawn, r) =>
      columns.map(({ angle }, c) => {
        const how = angle(drawn);
        const svg = posedDangles(
          wearing(drawn),
          typeof how === 'number' ? how : (id) => how(id),
        );
        return `<svg x="${c * W + 8}" y="${r * H + 30}" width="${W - 16}" height="${H - 16}" viewBox="${drawn.viewBox.join(' ')}">${svg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;
      }),
    );
    const width = W * columns.length;
    const height = H * rows.length + 30;
    const sheet = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
      `<rect width="${width}" height="${height}" fill="#f4efe6"/>`,
      ...columns.map(
        ({ label }, c) =>
          `<text x="${c * W + W / 2}" y="22" font-size="18" font-family="sans-serif" text-anchor="middle" fill="#2d2a32">${label}</text>`,
      ),
      ...cells,
      '</svg>',
    ].join('');
    const { png, ink } = await renderSvg(sheet, 1400);
    expect(ink).not.toBeNull();
    expect(png!.length).toBeGreaterThan(20000);
    // DANGLES_PNG=<path> npm test -- scene-dangles: the sheet, to look at.
    if (process.env.DANGLES_PNG) writeFileSync(process.env.DANGLES_PNG, png!);
    expect(Object.keys(DANGLE_FEEL).length).toBeGreaterThan(10);
  }, 120000);
});
