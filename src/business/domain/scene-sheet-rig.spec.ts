import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import render from 'dom-serializer';
import type { Element } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { byId, elements } from './scene-dom';
import { relate, type Point, type ViewBox } from './scene-joints';
import { renderSvg } from './scene-raster';
import {
  measureSheet,
  SHEET_VERSION,
  type CharacterSheet,
} from './scene-sheet';
import {
  RIG_VERSION,
  STILL_AT_S,
  SWINGS,
  holdsTogether,
  restDelay,
  rigSheet,
  stillSheet,
  variant,
} from './scene-sheet-rig';
import { EXPRESSIONS } from './scene-story';

function parse(svg: string): Element {
  return elements(parseDocument(svg, { xmlMode: true }).children).find(
    (node) => node.name === 'svg',
  )!;
}

const faces = Object.fromEntries(EXPRESSIONS.map((name) => [name, name]));

function sheetOf(
  svg: string,
  viewBox: ViewBox,
  parts: Record<string, string>,
): CharacterSheet {
  return {
    version: SHEET_VERSION,
    drawing: {
      svg,
      viewBox,
      aspect: viewBox[2] / viewBox[3],
      parts,
      labels: {},
      states: Object.fromEntries(
        Object.entries(faces).filter(([name]) => svg.includes(`id="${name}"`)),
      ),
      moves: true,
      callouts: [],
      field: null,
    },
    anchors: { head: null, body: null, legs: null },
  };
}

/**
 * The tail against the trunk (everything but the tail, the head and the
 * faces), as still as drawn, and turned about a point when asked.
 */
async function tailOn(
  svg: string,
  viewBox: ViewBox,
  turn?: { degrees: number; about: Point },
) {
  const root = parse(svg);
  stillSheet(root);
  const tail = byId(root, 'tail')!;
  const parent = tail.parent as Element;
  const outer = /rig-mend/.test(parent.attribs?.class ?? '') ? parent : tail;
  const drop = [
    ...EXPRESSIONS.map((id) => byId(root, id)).filter((node): node is Element =>
      Boolean(node),
    ),
  ];
  const head = byId(root, 'head');
  const part = variant(
    root,
    [tail],
    drop,
    turn
      ? new Map([
          [outer, `rotate(${turn.degrees} ${turn.about[0]} ${turn.about[1]})`],
        ])
      : undefined,
  );
  const trunk = variant(root, null, [tail, ...(head ? [head] : []), ...drop]);
  const { masks } = await renderSvg(part, undefined, {
    masks: { svgs: [part, trunk], cols: 400 },
  });
  return relate(masks![0], masks![1], viewBox);
}

const PIP_BOX: ViewBox = [212.73, 224.72, 463.25, 599.07];
const pipSvg = readFileSync(join(__dirname, '__fixtures__', 'pip.svg'), 'utf8');
const pip: CharacterSheet = {
  ...sheetOf(pipSvg, PIP_BOX, {
    head: 'head',
    body: 'body',
    arms: 'arms',
    legs: 'legs',
  }),
  anchors: { head: [400, 370], body: [400, 590], legs: [399, 731.8] },
  size: 'small',
};

describe('Pip, as the artist drew him: a tail that swung off his body', () => {
  let rigged: { sheet: CharacterSheet; notes: string[] };
  beforeAll(async () => {
    rigged = await rigSheet(pip);
  }, 60_000);

  it('finds the tail drawn 30 units from the body, touching nowhere, and tells the artist', async () => {
    const relation = await tailOn(pipSvg, PIP_BOX);
    expect(relation.gap).toBeGreaterThanOrEqual(27);
    expect(relation.gap).toBeLessThanOrEqual(33);
    expect(relation.seamCells).toBe(0);
    const { notes } = await measureSheet(pip.drawing);
    expect(notes.join(' ')).toMatch(
      /The tail floats \d+ units from the body: draw its base overlapping the body, behind it\./,
    );
  }, 30_000);

  it('moves the tail in to meet the body and finds its joint there', async () => {
    const { rig } = rigged.sheet;
    expect(rig?.version).toBe(RIG_VERSION);
    const tail = rig!.mended.find((one) => one.part === 'tail')!;
    expect(Math.abs(tail.dx + 43)).toBeLessThanOrEqual(6);
    expect(Math.abs(tail.dy - 9)).toBeLessThanOrEqual(6);
    const [x, y] = rig!.joints.tail;
    expect(Math.abs(x - 509)).toBeLessThanOrEqual(8);
    expect(Math.abs(y - 568)).toBeLessThanOrEqual(8);
    // Nothing else floated, so nothing else moved.
    expect(rig!.mended).toHaveLength(1);
    expect(rigged.notes).toEqual([]);
    const relation = await tailOn(rigged.sheet.drawing.svg, PIP_BOX);
    expect(relation.gap).toBe(0);
    expect(relation.seamCells).toBeGreaterThan(0);
  }, 30_000);

  it("ships none of the artist's motion: no wag of its own, no origin off the drawing", () => {
    const { svg } = rigged.sheet.drawing;
    expect(svg).not.toContain('@keyframes wag');
    expect(svg).not.toMatch(/animation\s*:\s*(wag|breathe|earflop)/);
    expect(svg).not.toMatch(/transform-origin\s*:\s*545px/);
    expect(svg).not.toContain('fill-box');
    // Only the rig's own motion, on its own classes, never on the ids.
    const frames = [...svg.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((name) => name.startsWith('rig-'))).toBe(true);
    expect(svg).not.toMatch(/#(head|body|tail)\b/);
    for (const id of ['head', 'body', 'arms', 'legs', 'tail', 'neutral'])
      expect(svg).toContain(`id="${id}"`);
    expect(svg).toContain('class="rig-tail"');
    expect(svg).toContain('class="rig-breathe"');
    expect(rigged.sheet.drawing.moves).toBe(true);
    // The frame is kept, so where Pip stands on the stage is too.
    expect(rigged.sheet.drawing.viewBox).toEqual(PIP_BOX);
  });

  it('keeps the tail joined wagging about its joint, however wide', async () => {
    const about = rigged.sheet.rig!.joints.tail;
    for (const degrees of [-20, -12, 12, 20]) {
      const relation = await tailOn(rigged.sheet.drawing.svg, PIP_BOX, {
        degrees,
        about,
      });
      expect(relation.gap).toBe(0);
      expect(relation.seamCells).toBeGreaterThan(0);
    }
  }, 30_000);

  it('turns the tail about its joint, and shows it as drawn on the still frame', () => {
    const { svg } = rigged.sheet.drawing;
    const [x, y] = rigged.sheet.rig!.joints.tail;
    expect(svg).toContain(
      `class="rig-tail" style="transform-origin:${x}px ${y}px"`,
    );
    expect(svg).toContain('.rig-tail,.rig-ear{transform-box:view-box}');
    const wag =
      /\.rig-tail\{animation:rig-wag ([\d.]+)s ease-in-out (-?[\d.]+)s infinite\}/.exec(
        svg,
      )!;
    const [cycle, delay] = [Number(wag[1]), Number(wag[2])];
    expect(svg).toContain(
      '@keyframes rig-wag{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(12deg)}}',
    );
    // A quarter through, the ease-in-out from -12° to 12° is at 0°.
    const phase = ((((STILL_AT_S - delay) % cycle) + cycle) % cycle) / cycle;
    expect(phase).toBeCloseTo(0.25, 5);
    expect(restDelay(3.2)).toBe(-2.5);
  });

  it('gives the tail a feeling of its own, drooping away from the body', () => {
    const { svg } = rigged.sheet.drawing;
    expect(svg).toContain('.feel-happy .rig-tail{animation:rig-happy');
    expect(svg).toContain(
      '@keyframes rig-sad{0%,100%{transform:rotate(25deg)}',
    );
    expect(svg).toContain(
      '.feel-surprised .rig-tail{animation:none;transform:rotate(-15deg)}',
    );
    // Pip's ears, each its own group, twitch about their own joints.
    expect(svg).toMatch(/class="rig-ear" style="transform-origin:/);
    expect(svg).toMatch(/class="rig-ear rig-ear-r" style="transform-origin:/);
  });

  it('wags wider on cue, about the same joint, and stays joined', async () => {
    const { svg } = rigged.sheet.drawing;
    // How far the stage may wag it (--tail, -1 to 1), proved; its own wag
    // let go while it does.
    const most = Number(
      /\.rig-tail\{transform-box:view-box;rotate:calc\(var\(--tail,0\)\*([\d.]+)deg\)\}/.exec(
        svg,
      )![1],
    );
    expect(most).toBe(SWINGS.wagAct);
    expect(most).toBeGreaterThan(SWINGS.wag);
    expect(svg).toContain('.wagging .rig-tail{animation:none;transform:none}');
    const about = rigged.sheet.rig!.joints.tail;
    for (const degrees of [-most, most]) {
      const relation = await tailOn(svg, PIP_BOX, { degrees, about });
      expect(relation.gap).toBe(0);
      expect(relation.seamCells).toBeGreaterThan(0);
    }
    // And as the rig proved it: holdsTogether keeps it whole at both ends.
    const root = parse(svg);
    stillSheet(root);
    const tail = byId(root, 'tail')!;
    const outer = (tail.parent as Element).attribs.class?.includes('rig-mend')
      ? (tail.parent as Element)
      : tail;
    const faces = EXPRESSIONS.map((id) => byId(root, id)).filter(
      (node): node is Element => Boolean(node),
    );
    const head = byId(root, 'head')!;
    const { amplitudes } = await holdsTogether(root, PIP_BOX, [
      {
        part: { keep: [tail], drop: faces },
        ref: { keep: null, drop: [tail, head, ...faces] },
        moved: (degrees) =>
          new Map([[outer, `rotate(${degrees} ${about[0]} ${about[1]})`]]),
        amplitude: most,
        both: true,
      },
    ]);
    expect(amplitudes).toEqual([most]);
  }, 60_000);

  it('dips his head about where it joins him, his faces with it, and it stays joined', async () => {
    const { svg } = rigged.sheet.drawing;
    const dip = rigged.sheet.rig!.dip!;
    expect(dip).toBe(SWINGS.dip);
    expect(svg).toContain(
      `.rig-head{transform-box:view-box;rotate:calc(var(--head,0)*${dip}deg)}`,
    );
    const [x, y] = rigged.sheet.rig!.joints.head;
    expect(svg).toContain(
      `class="rig-head" style="transform-origin:${x}px ${y}px"`,
    );
    // Every face turns with the head.
    const root = parse(svg);
    for (const face of ['neutral', 'happy', 'sad']) {
      let turns = false;
      for (
        let at = byId(root, face)!.parent as Element | null;
        at;
        at = at.parent as Element | null
      )
        if (/\brig-head\b/.test(at.attribs?.class ?? '')) turns = true;
      expect(turns).toBe(true);
    }
    // Joined at either end of the dip.
    const still = parse(svg);
    stillSheet(still);
    const head = byId(still, 'head')!;
    const faces = EXPRESSIONS.map((id) => byId(still, id)).filter(
      (node): node is Element => Boolean(node),
    );
    const tail = byId(still, 'tail')!;
    for (const degrees of [-dip, dip]) {
      const part = variant(
        still,
        [head],
        faces,
        new Map([[head, `rotate(${degrees} ${x} ${y})`]]),
      );
      const trunk = variant(still, null, [head, tail, ...faces]);
      const { masks } = await renderSvg(part, undefined, {
        masks: { svgs: [part, trunk], cols: 400 },
      });
      const relation = relate(masks![0], masks![1], PIP_BOX);
      expect(relation.gap).toBe(0);
    }
  }, 60_000);

  it('sinks on his legs, the legs folding from the ground as far as he comes down', () => {
    const { svg } = rigged.sheet.drawing;
    const fold = Number(
      /\.rig-legs\{transform-box:view-box;scale:1 calc\(1 - var\(--low,0\)\*([\d.]+)\)\}/.exec(
        svg,
      )![1],
    );
    const sinks = Number(
      /\.rig-breathe\{translate:calc\(var\(--low,0\)\*0px\) calc\(var\(--low,0\)\*([\d.]+)px\)\}/.exec(
        svg,
      )![1],
    );
    expect(fold).toBeGreaterThan(0.3);
    expect(fold).toBeLessThanOrEqual(0.55);
    // Their tops come down exactly as far as the body: the legs' height
    // folded by `fold` is how far it sinks.
    const legsTall = sinks / fold;
    expect(legsTall).toBeGreaterThan(60);
    expect(legsTall).toBeLessThan(PIP_BOX[3] / 2);
    // And they fold about their feet: the foot of their ink, half their
    // height below their middle.
    const [, originY] =
      /class="rig-legs" style="transform-origin:([-\d.]+)px ([-\d.]+)px"/
        .exec(svg)!
        .slice(1)
        .map(Number);
    expect(
      Math.abs(originY - (pip.anchors.legs![1] + legsTall / 2)),
    ).toBeLessThan(8);
  });

  it('faces the viewer, as he was drawn standing', () => {
    expect(rigged.sheet.rig!.faces).toBeUndefined();
  });

  it('rigs a rigged sheet again to the same drawing', async () => {
    const again = await rigSheet(rigged.sheet);
    expect(again.sheet.rig?.mended).toEqual([]);
    expect(again.sheet.drawing.svg).toBe(rigged.sheet.drawing.svg);
  }, 30_000);
});

/** The animal's parts, as the artist might draw them: a head on a body on legs, and a tail. */
function animalParts(
  tail: string,
  { legsAt = 600, headAt = 300 }: { legsAt?: number; headAt?: number } = {},
): string {
  return `<g id="tail">${tail}</g>
    <g id="legs"><rect x="300" y="${legsAt}" width="40" height="${780 - legsAt}" fill="#8B5E3C"/><rect x="460" y="${legsAt}" width="40" height="${780 - legsAt}" fill="#8B5E3C"/></g>
    <g id="body"><ellipse cx="400" cy="520" rx="150" ry="110" fill="#8B5E3C"/></g>
    <g id="head"><circle cx="400" cy="${headAt}" r="120" fill="#A0714F"/></g>
    <g id="neutral"><circle cx="360" cy="${headAt - 10}" r="10"/><circle cx="440" cy="${headAt - 10}" r="10"/></g>`;
}

/** An animal as the artist might draw one. */
function animal(tail: string, style = '', width = 800): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 800">${style}
    ${animalParts(tail)}
  </svg>`;
}
const ANIMAL_PARTS = {
  head: 'head',
  body: 'body',
  legs: 'legs',
  tail: 'tail',
};
const stroke =
  'stroke="#8B5E3C" stroke-width="20" fill="none" stroke-linecap="round"';

describe('an animal the artist drew, rigged by code', () => {
  it('leaves a tail that already meets the body where it is', async () => {
    const svg = animal(`<path d="M530 500 Q620 440 680 470" ${stroke}/>`);
    const { sheet, notes } = await rigSheet(
      sheetOf(svg, [0, 0, 800, 800], ANIMAL_PARTS),
    );
    expect(sheet.rig!.mended).toEqual([]);
    expect(notes).toEqual([]);
    expect(sheet.rig!.joints.tail[0]).toBeGreaterThan(520);
    expect(sheet.rig!.joints.tail[0]).toBeLessThan(570);
    expect(sheet.drawing.svg).toContain('class="rig-tail"');
  }, 30_000);

  it('never pulls in a tail drawn far off, and says so', async () => {
    const svg = animal(
      `<path d="M870 480 Q910 440 970 470" ${stroke}/>`,
      '',
      1200,
    );
    const drawn = sheetOf(svg, [0, 0, 1200, 800], ANIMAL_PARTS);
    const { sheet, notes } = await rigSheet(drawn);
    expect(sheet.rig!.mended).toEqual([]);
    expect(sheet.rig!.joints.tail).toBeUndefined();
    expect(notes.join(' ')).toMatch(
      /The tail floats 3\d\d units from the body/,
    );
    // Kept still, where it was drawn.
    expect(sheet.drawing.svg).not.toContain('rig-tail"');
    const measured = await measureSheet(drawn.drawing);
    expect(measured.notes.join(' ')).toContain('The tail floats');
  }, 30_000);

  it('turns a tail about its base, whichever side its base is on', async () => {
    // Its base on the right, at the body; the artist's own pivot was its tip.
    const svg = animal(
      `<g class="tailwag"><path d="M150 450 Q200 420 275 480" ${stroke}/></g>`,
      '<style>.tailwag{transform-box:fill-box;transform-origin:left center;animation:wag 1s ease-in-out infinite}@keyframes wag{50%{transform:rotate(15deg)}}</style>',
    );
    const { sheet } = await rigSheet(
      sheetOf(svg, [0, 0, 800, 800], ANIMAL_PARTS),
    );
    const [x] = sheet.rig!.joints.tail;
    expect(x).toBeGreaterThan(250);
    expect(x).toBeLessThan(290);
    expect(sheet.drawing.svg).not.toContain('left center');
    // It hangs down away from the body: turned the other way.
    expect(sheet.drawing.svg).toContain(
      '@keyframes rig-sad{0%,100%{transform:rotate(-25deg)}',
    );
  }, 30_000);

  it('halves a wag that would pull a part off, and keeps it still when halving is not enough', async () => {
    const root =
      parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
      <g id="body"><rect x="200" y="300" width="300" height="300" fill="#8B5E3C"/></g>
      <g id="tail"><rect x="490" y="400" width="160" height="20" fill="#8B5E3C"/></g>
    </svg>`);
    const tail = byId(root, 'tail')!;
    const swing = (about: Point) => ({
      part: { keep: [tail], drop: [] },
      ref: { keep: null, drop: [tail] },
      moved: (degrees: number) =>
        new Map([[tail, `rotate(${degrees} ${about[0]} ${about[1]})`]]),
      amplitude: 12,
      both: true,
    });
    const { amplitudes } = await holdsTogether(
      root,
      [0, 0, 800, 800],
      [
        // About its base: it holds.
        swing([495, 410]),
        // About a point 100 below: 12° slides it off, 6° does not.
        swing([495, 510]),
        // About a point 1000 below, as Pip's was: nothing holds.
        swing([495, 1410]),
      ],
    );
    expect(amplitudes).toEqual([12, 6, 0]);
  }, 30_000);
});

describe('a creature whose look lived by its own motion', () => {
  const fill = 'fill="#E0463A" stroke="#2d2a32" stroke-width="3"';
  /** A creature with wings on its body, a flame on its head and a halo over it: each named as the artist names them. */
  const creature = (wingAt = 260) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
      ${animalParts(`<path d="M530 500 Q620 440 680 470" ${stroke}/>`)}
      <g id="wing-l"><path d="M${wingAt + 20} 470 L${wingAt - 140} 380 L${wingAt - 80} 520 Z" ${fill}/></g>
      <g id="wing-r"><path d="M520 470 L680 380 L620 520 Z" ${fill}/></g>
      <g id="flame"><path d="M375 200 Q400 110 425 200 Z" ${fill}/></g>
      <g class="halo"><ellipse cx="400" cy="130" rx="60" ry="12" fill="none" stroke="#F2C14E" stroke-width="8"/></g>
    </svg>`;

  it('flaps its wings about where they join it, the right mirrored, flickers its flame about its foot, and pulses its halo', async () => {
    const { sheet, notes } = await rigSheet(
      sheetOf(creature(), [0, 0, 800, 800], ANIMAL_PARTS),
    );
    expect(sheet.rig!.version).toBe(RIG_VERSION);
    const svg = sheet.drawing.svg;
    expect(svg).toContain('class="rig-flap"');
    expect(svg).toContain('class="rig-flap rig-flap-r"');
    expect(svg).toMatch(/@keyframes rig-flap\{0%,100%\{transform:rotate\(-\d/);
    expect(svg).toContain('@keyframes rig-flap-r{');
    // The flame about its foot, on the head.
    const flame =
      /class="rig-flicker" style="transform-origin:([\d.]+)px ([\d.]+)px"/.exec(
        svg,
      );
    expect(Number(flame![1])).toBeCloseTo(400, -1);
    expect(Number(flame![2])).toBeGreaterThan(185);
    expect(svg).toContain('@keyframes rig-flicker{');
    // The halo floats over the head: it brightens and dims, and is never
    // moved in, nor told of.
    expect(svg).toContain('class="rig-pulse"');
    expect(svg).toContain('@keyframes rig-pulse{');
    expect(sheet.rig!.mended).toEqual([]);
    expect(notes.join(' ')).not.toMatch(/halo|float/i);
    expect(sheet.drawing.moves).toBe(true);
  }, 60_000);

  it('keeps a wing that would come off still, and takes the motion out again when rigged again', async () => {
    // The left wing drawn far off the body: it cannot flap and stay on.
    const { sheet } = await rigSheet(
      sheetOf(creature(80), [0, 0, 800, 800], ANIMAL_PARTS),
    );
    expect(sheet.drawing.svg).not.toMatch(
      /class="rig-flap"[^>]*>\s*<g id="wing-l"/,
    );
    expect(sheet.drawing.svg).toContain('class="rig-flap rig-flap-r"');
    const again = await rigSheet({ ...sheet, rig: undefined });
    expect(again.sheet.drawing.svg.match(/rig-flap-r"/g)).toHaveLength(1);
  }, 60_000);
});

describe('which way an animal on all fours faces', () => {
  /** A dog seen from the side, its head at one end: at the right, or mirrored. */
  const dog = (mirror: boolean) => {
    const at = (x: number) => (mirror ? 800 - x : x);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
      <g id="tail"><path d="M${at(240)} 490 Q${at(170)} 430 ${at(140)} 460" ${stroke}/></g>
      <g id="legs">${[270, 330, 460, 520].map((x) => `<rect x="${Math.min(at(x), at(x + 30))}" y="560" width="30" height="220" fill="#8B5E3C"/>`).join('')}</g>
      <g id="body"><ellipse cx="${at(400)}" cy="520" rx="170" ry="80" fill="#8B5E3C"/></g>
      <g id="head"><circle cx="${at(590)}" cy="420" r="80" fill="#A0714F"/></g>
      <g id="neutral"><circle cx="${at(570)}" cy="410" r="10"/><circle cx="${at(620)}" cy="410" r="10"/></g>
    </svg>`;
  };

  it('faces the way its head is, and turns it about its neck', async () => {
    const right = await rigSheet(
      sheetOf(dog(false), [0, 0, 800, 800], ANIMAL_PARTS),
    );
    const left = await rigSheet(
      sheetOf(dog(true), [0, 0, 800, 800], ANIMAL_PARTS),
    );
    expect(right.sheet.rig!.faces).toBe(1);
    expect(left.sheet.rig!.faces).toBe(-1);
    // Its neck is between its head and its body, on the side it faces.
    expect(right.sheet.rig!.joints.head[0]).toBeGreaterThan(480);
    expect(left.sheet.rig!.joints.head[0]).toBeLessThan(320);
    expect(right.sheet.rig!.dip).toBeGreaterThan(0);
    expect(right.sheet.drawing.svg).toContain('class="rig-head"');
  }, 60_000);
});

describe('an animal whose parts are not all where they should be', () => {
  const tail = `<path d="M530 500 Q620 440 680 470" ${stroke}/>`;

  it('leaves legs that float where they stand, feet on the ground, and says so', async () => {
    // Legs from 650, 20 below the body, their feet at the frame's foot.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 780">${animalParts(tail, { legsAt: 650 })}</svg>`;
    const { sheet, notes } = await rigSheet(
      sheetOf(svg, [0, 0, 800, 780], ANIMAL_PARTS),
    );
    expect(sheet.rig!.mended.map((one) => one.part)).not.toContain('legs');
    expect(notes.join(' ')).toMatch(
      /The legs float \d+ units from the body: .* They are left standing where they are drawn\./,
    );
    const legs = byId(parse(sheet.drawing.svg), 'legs')!;
    expect((legs.parent as Element).attribs.class ?? '').not.toContain(
      'rig-mend',
    );
    expect(render(legs, { xmlMode: true })).toContain('y="650"');
  }, 30_000);

  it('points the notes at the head where it was moved to', async () => {
    // A head 30 above the body.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${animalParts(tail, { headAt: 260 })}</svg>`;
    const drawn = {
      ...sheetOf(svg, [0, 0, 800, 800], ANIMAL_PARTS),
      anchors: { head: [400, 260], body: [400, 520], legs: [400, 690] },
    } satisfies CharacterSheet;
    const { sheet } = await rigSheet(drawn);
    const head = sheet.rig!.mended.find((one) => one.part === 'head')!;
    expect(head.dy).toBeGreaterThan(20);
    expect(sheet.anchors.head![0]).toBeCloseTo(400 + head.dx, 1);
    expect(sheet.anchors.head![1]).toBeCloseTo(260 + head.dy, 1);
    expect(sheet.anchors.body).toEqual([400, 520]);
  }, 30_000);

  it('lifts everything above the legs as it breathes, each group as far on the screen in its own units', async () => {
    // Drawn at twice its size inside a scaled group, with a collar drawn
    // outside it, in the sheet's own units.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600">
      <g transform="scale(2)">${animalParts(tail)}</g>
      <g id="collar"><rect x="640" y="800" width="320" height="40" fill="#C0392B"/></g>
    </svg>`;
    const { sheet } = await rigSheet(
      sheetOf(svg, [0, 0, 1600, 1600], ANIMAL_PARTS),
    );
    const out = sheet.drawing.svg;
    const collar = byId(parse(out), 'collar')!;
    expect((collar.parent as Element).attribs.class).toBe(
      'rig-breathe rig-breathe-1',
    );
    const rise = (name: string) =>
      Number(
        new RegExp(
          `@keyframes ${name}\\{0%,100%\\{transform:translateY\\(0\\)\\}50%\\{transform:translateY\\((-[\\d.]+)px\\)`,
        ).exec(out)![1],
      );
    // In the scaled group, half as far in its units as the collar in the sheet's.
    expect(rise('rig-breathe')).toBeLessThan(0);
    expect(rise('rig-breathe-1')).toBeCloseTo(2 * rise('rig-breathe'), 1);
    expect(out).toContain('.rig-breathe-1{animation-name:rig-breathe-1}');
    // The legs stay down.
    const legs = byId(parse(out), 'legs')!;
    expect((legs.parent as Element).attribs.class ?? '').not.toContain(
      'rig-breathe',
    );
  }, 30_000);
});

describe("taking an artist's motion out of a drawing", () => {
  it('keeps where everything is drawn and how it is coloured', () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>@keyframes wag{0%{transform:rotate(1deg)}}.a{fill:red;animation:wag 1s infinite;transform-origin:5px 5px;transform-box:fill-box}@media (prefers-reduced-motion:reduce){.a{animation:none}}</style><g class="a" transform="translate(1 1)" style="fill:blue;transform:rotate(3deg)"><rect width="5" height="5"><animate attributeName="opacity" values="0;1" dur="1s" repeatCount="indefinite"/></rect></g></svg>',
    );
    expect(stillSheet(root).sort()).toEqual([
      'CSS motion',
      'SMIL',
      'inline motion',
    ]);
    const svg = render(root, { xmlMode: true });
    expect(svg).toContain('<style>.a{fill:red}</style>');
    expect(svg).toContain('transform="translate(1 1)"');
    expect(svg).toContain('style="fill:blue"');
    expect(svg).not.toMatch(/keyframes|animate|@media|rotate\(3deg\)/);
  });
});

describe('Bingo, as the artist drew him: a tail drawn inside the body', () => {
  const BINGO_BOX: ViewBox = [228.75, 255.75, 369.5, 484.5];
  const bingoSvg = readFileSync(
    join(__dirname, '__fixtures__', 'bingo.svg'),
    'utf8',
  );
  const bingo = sheetOf(bingoSvg, BINGO_BOX, {
    head: 'head',
    body: 'body',
    arms: 'arms',
    legs: 'legs',
  });

  it('finds the tail by the name it was given, takes it out of the body, and wags it about its base', async () => {
    const { sheet } = await rigSheet(bingo);
    const root = parse(sheet.drawing.svg);
    const tail = [...elements(root.children)]
      .flatMap(function all(node: Element): Element[] {
        return [node, ...elements(node.children).flatMap(all)];
      })
      .find((node) => /\btailwag\b/.test(node.attribs.class ?? ''))!;
    expect(tail).toBeTruthy();
    // No longer inside the body, so it turns without the body.
    for (
      let at = tail.parent as Element | null;
      at;
      at = at.parent as Element | null
    )
      expect(at.attribs?.id).not.toBe('body');
    expect(sheet.rig!.joints.tail).toBeDefined();
    expect(sheet.drawing.svg).toMatch(/rig-tail/);
    // Drawn exactly where it was: the rest frame's ink is the same.
    const before = parse(bingoSvg);
    stillSheet(before);
    const { masks } = await renderSvg(render(before), undefined, {
      masks: { svgs: [render(before), sheet.drawing.svg], cols: 300 },
    });
    const [a, b] = masks!;
    let differ = 0;
    for (let i = 0; i < a.bits.length; i += 1)
      if (a.bits[i] !== b.bits[i]) differ += 1;
    expect(differ / a.bits.length).toBeLessThan(0.002);
  }, 60_000);
});
