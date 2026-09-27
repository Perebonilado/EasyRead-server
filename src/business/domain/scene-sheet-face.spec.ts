import render from 'dom-serializer';
import type { Element } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { byId, elements, removeNode, walk } from './scene-dom';
import { relate, type Point, type ViewBox } from './scene-joints';
import { renderSvg } from './scene-raster';
import { SHEET_VERSION, type CharacterSheet } from './scene-sheet';
import {
  MOUTH_MARK,
  faceMoved,
  faceNotes,
  measureFace,
  unmarked,
  withFace,
  type SheetFace,
} from './scene-sheet-face';
import { SWINGS, rigSheet, stillSheet, variant } from './scene-sheet-rig';
import { EXPRESSIONS } from './scene-story';
import type { GatedDrawing } from './scene-svg';

/**
 * Humpty, as the artist is now asked to draw him: an egg with a head,
 * each arm and leg a group of its own, every face's eyes and brows and
 * no mouth, and the mouth's place marked. `mouths` draws a mouth on the
 * faces named, as an artist who ignores the brief would.
 */
function egg(mouths: string[] = []): string {
  const ink = 'stroke="#2d2a32" stroke-width="3"';
  const face = (name: string) =>
    `<g id="${name}">` +
    `<circle cx="165" cy="215" r="18" fill="#ffffff" ${ink}/>` +
    `<circle cx="235" cy="215" r="18" fill="#ffffff" ${ink}/>` +
    `<circle cx="165" cy="219" r="6" fill="#2d2a32"/>` +
    `<circle cx="235" cy="219" r="6" fill="#2d2a32"/>` +
    `<path d="M147 188 L183 186" fill="none" ${ink}/>` +
    `<path d="M217 186 L253 188" fill="none" ${ink}/>` +
    (mouths.includes(name)
      ? `<path d="M178 262 Q200 284 222 262" fill="none" ${ink}/>`
      : '') +
    `</g>`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 100 340 490">',
    '<g id="legs">',
    `<g id="leg-left"><rect x="146" y="470" width="36" height="110" rx="12" fill="#e8d3a8" ${ink}/></g>`,
    `<g id="leg-right"><rect x="218" y="470" width="36" height="110" rx="12" fill="#e8d3a8" ${ink}/></g>`,
    '</g>',
    '<g id="arms">',
    `<g id="arm-left"><rect x="60" y="310" width="34" height="100" rx="15" fill="#f5e6c8" ${ink}/></g>`,
    `<g id="arm-right"><rect x="306" y="310" width="34" height="100" rx="15" fill="#f5e6c8" ${ink}/></g>`,
    '</g>',
    `<g id="body"><ellipse cx="200" cy="350" rx="120" ry="145" fill="#f5e6c8" ${ink}/></g>`,
    `<g id="head"><ellipse cx="200" cy="232" rx="104" ry="96" fill="#f5e6c8" ${ink}/></g>`,
    ...EXPRESSIONS.map(face),
    `<g id="${MOUTH_MARK}"><circle cx="200" cy="264" r="4" fill="#e04040"/></g>`,
    '</svg>',
  ].join('');
}

const EGG_BOX: ViewBox = [30, 100, 340, 490];

function drawingOf(svg: string, viewBox: ViewBox = EGG_BOX): GatedDrawing {
  const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const parts = Object.fromEntries(
    ['head', 'body', 'arms', 'legs', MOUTH_MARK]
      .filter((name) => ids.includes(name))
      .map((name) => [name, name]),
  );
  return {
    svg,
    viewBox,
    aspect: viewBox[2] / viewBox[3],
    parts,
    labels: {},
    states: Object.fromEntries(
      EXPRESSIONS.filter((name) => ids.includes(name)).map((name) => [
        name,
        name,
      ]),
    ),
    moves: false,
    callouts: [],
    field: null,
  };
}

function parse(svg: string): Element {
  return elements(parseDocument(svg, { xmlMode: true }).children).find(
    (node) => node.name === 'svg',
  )!;
}

const near = (a: number, b: number, within: number) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(within);

describe('a face the artist drew without a mouth, measured', () => {
  let measured: Awaited<ReturnType<typeof measureFace>>;
  beforeAll(async () => {
    measured = await measureFace(drawingOf(egg()));
  }, 30_000);

  it('finds the mouth where the artist marked it', () => {
    expect(measured.marked).toBe(true);
    const [x, y] = measured.face!.mouth;
    near(x, 200, 2);
    near(y, 264, 2);
  });

  it('finds each eye, and sizes the face against the kit’s by them', () => {
    const { eyes, scale } = measured.face!;
    expect(eyes).toHaveLength(2);
    near(eyes[0].box.x + eyes[0].box.width / 2, 165, 3);
    near(eyes[1].box.x + eyes[1].box.width / 2, 235, 3);
    near(eyes[0].box.y + eyes[0].box.height / 2, 215, 3);
    // Eyes about 106 across, the kit's 61: drawn about 1.7 times as large.
    near(scale, 1.7, 0.15);
  });

  it('reads the face’s colour where the mouth goes, for a lid and for a cover', () => {
    expect(measured.face!.skin).toBe('#f5e6c8');
    expect(measured.face!.eyes.every((eye) => eye.lid === '#f5e6c8')).toBe(
      true,
    );
    expect(measured.face!.line).toBe(3);
  });

  it('asks nothing more of a face drawn as asked', () => {
    expect(measured.drawn).toEqual([]);
    expect(measured.face!.covered).toEqual({});
    expect(faceNotes(measured)).toEqual([]);
  });
});

describe('a face the artist drew a mouth on anyway', () => {
  it('is sent back once, saying which faces; then code covers the drawn mouth', async () => {
    const measured = await measureFace(drawingOf(egg(['happy', 'sad'])));
    expect(measured.drawn.sort()).toEqual(['happy', 'sad']);
    expect(faceNotes(measured).join(' ')).toContain(
      'The faces happy, sad draw a mouth',
    );
    const cover = measured.face!.covered.happy!;
    // The drawn mouth, 178 to 222 across and 262 down to about 273.
    expect(cover.x).toBeLessThanOrEqual(180);
    expect(cover.x + cover.width).toBeGreaterThanOrEqual(220);
    expect(cover.y).toBeLessThanOrEqual(264);
    expect(measured.face!.covered.neutral).toBeUndefined();
    // Put on the drawing, the cover is in the face's own colour, over it.
    const drawn = withFace(
      drawingOf(egg(['happy', 'sad'])),
      measured.face!,
      'humpty',
    );
    const happy = byId(parse(drawn.svg), 'happy')!;
    const covers = [...walk(happy)].filter(
      (node) => node.name === 'ellipse' && node.attribs.fill === '#f5e6c8',
    );
    expect(covers.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('asks for the mark when it is missing, and still finds a place below the eyes', async () => {
    const svg = egg().replace(/<g id="mouth-at">.*?<\/g>/, '');
    const measured = await measureFace(drawingOf(svg));
    expect(measured.marked).toBe(false);
    expect(faceNotes(measured)[0]).toContain('<g id="mouth-at">');
    const [x, y] = measured.face!.mouth;
    near(x, 200, 3);
    // Below the eyes (215), where the kit's mouth sits below its own.
    expect(y).toBeGreaterThan(235);
    expect(y).toBeLessThan(290);
  }, 30_000);
});

describe('code’s mouth and lids on a face the artist drew', () => {
  let face: SheetFace;
  let drawn: GatedDrawing;
  beforeAll(async () => {
    face = (await measureFace(drawingOf(egg()))).face!;
    drawn = withFace(unmarked(drawingOf(egg())), face, 'humpty');
  }, 30_000);

  it('takes the mark out: code draws the mouth there', () => {
    const plain = unmarked(drawingOf(egg()));
    expect(plain.svg).not.toContain(`id="${MOUTH_MARK}"`);
    expect(plain.parts[MOUTH_MARK]).toBeUndefined();
  });

  it('gives every face its resting mouth, its talking one, and the six shapes of speech', () => {
    const root = parse(drawn.svg);
    for (const name of EXPRESSIONS) {
      const group = byId(root, name)!;
      const classes = [...walk(group)].map((node) => node.attribs.class ?? '');
      expect(classes).toContain('cm-rest');
      expect(classes).toContain('cm-talk');
      for (let k = 0; k < 6; k += 1) expect(classes).toContain(`cm-v cm-v${k}`);
      expect(classes).toContain('cm-blink');
    }
  });

  it('draws each face’s resting mouth as the kit’s: a smile happy, a down-turn sad, round surprised', () => {
    const rest = (name: string) =>
      render(
        [...walk(byId(parse(drawn.svg), name)!)].find(
          (node) => node.attribs.class === 'cm-rest',
        )!,
        { xmlMode: true },
      );
    // The kit's smile is a filled open curve; its frown a line bowed up; its "o" an ellipse.
    expect(rest('happy')).toMatch(/<path d="M-14,-3 Q0,1 14,-3/);
    expect(rest('sad')).toMatch(/<path d="M-11,5 Q0,-5 11,5"/);
    expect(rest('surprised')).toMatch(
      /<ellipse cx="0" cy="1" rx="6.5" ry="8.5"/,
    );
  });

  it('moves the mouth by the voice’s shapes, as the stage marks the drawing', () => {
    // The stage sets lipsync and v0 to v5 on the drawing as each frame of a
    // line's mouth plan says, and talking when there is none.
    expect(drawn.svg).toContain(
      '.lipsync .cm-rest,.lipsync .cm-talk{opacity:0}',
    );
    for (let k = 0; k < 6; k += 1)
      expect(drawn.svg).toContain(`.lipsync.v${k} .cm-v${k}`);
    expect(drawn.svg).toContain(
      '.talking .cm-talk{animation:cm-talk 1.2s linear infinite}',
    );
  });

  it('puts the mouth at the face’s place, at the face’s size', async () => {
    // One shape alone: the wide-open "ah", in the neutral face.
    const root = parse(drawn.svg);
    for (const node of [...walk(root)])
      if (
        node.name === 'style' ||
        /\bcm-(?:rest|talk|blink)\b/.test(node.attribs.class ?? '') ||
        (/\bcm-v\d\b/.test(node.attribs.class ?? '') &&
          !node.attribs.class.includes('cm-v2'))
      )
        removeNode(node);
    for (const name of EXPRESSIONS)
      if (name !== 'neutral') removeNode(byId(root, name)!);
    const neutral = byId(root, 'neutral')!;
    const only = variant(root, [neutral], []);
    const cm = parse(only);
    // Just the mouth: the eyes and brows out.
    for (const node of [...walk(byId(cm, 'neutral')!)])
      if (['circle', 'path'].includes(node.name) && !isInCm(node))
        removeNode(node);
    const { ink } = await renderSvg(render(cm, { xmlMode: true }));
    near(ink!.x + ink!.width / 2, face.mouth[0], 2);
    near(ink!.y + ink!.height / 2, face.mouth[1] + 2 * face.scale, 3);
    // The kit's "ah" is 18 wide (and its line): as much larger as the face.
    near(ink!.width, 18 * face.scale + face.line, 4);
  }, 30_000);

  it('blinks over each eye, in the face’s colour, on its own beat of the kit’s', () => {
    const blink = [...walk(byId(parse(drawn.svg), 'neutral')!)].find(
      (node) => node.attribs.class === 'cm-blink',
    )!;
    expect(blink.attribs.opacity).toBe('0');
    const lids = elements(blink.children).filter(
      (node) => node.name === 'ellipse',
    );
    expect(lids).toHaveLength(2);
    near(Number(lids[0].attribs.cx), 165, 3);
    near(Number(lids[1].attribs.cx), 235, 3);
    expect(lids[0].attribs.fill).toBe('#f5e6c8');
    // Shut a moment near the end of every 5.3 seconds, as the kit's people.
    expect(drawn.svg).toMatch(
      /\.cm-blink\{animation:cm-blink 5\.3s linear -[\d.]+s infinite\}@keyframes cm-blink\{0%,95\.4%\{opacity:0\}95\.5%,98%\{opacity:1\}/,
    );
  });

  it('moves with the head when the head is moved in', () => {
    const moved = faceMoved(face, [4, -6]);
    expect(moved.mouth).toEqual([face.mouth[0] + 4, face.mouth[1] - 6]);
    expect(moved.eyes[0].box.x).toBeCloseTo(face.eyes[0].box.x + 4, 5);
  });
});

function isInCm(node: Element): boolean {
  for (let at: Element | null = node; at; at = at.parent as Element | null)
    if (at.attribs?.class === 'cm') return true;
  return false;
}

/**
 * A limb against what it joins (the body, less every other limb and the
 * faces), turned about a point when asked, as the rig proves it.
 */
async function limbOn(
  svg: string,
  viewBox: ViewBox,
  id: string,
  ref: string[],
  turn?: { degrees: number; about: Point },
) {
  const root = parse(svg);
  stillSheet(root);
  const limb = byId(root, id)!;
  let outer = limb;
  while (
    /\brig-/.test((outer.parent as Element).attribs?.class ?? '') &&
    !/\brig-breathe\b/.test((outer.parent as Element).attribs.class)
  )
    outer = outer.parent as Element;
  const faces = EXPRESSIONS.map((one) => byId(root, one)).filter(
    (node): node is Element => Boolean(node),
  );
  const part = variant(
    root,
    [limb],
    faces,
    turn
      ? new Map([
          [outer, `rotate(${turn.degrees} ${turn.about[0]} ${turn.about[1]})`],
        ])
      : undefined,
  );
  const rest = variant(
    root,
    ref.map((one) => byId(root, one)!),
    faces,
  );
  const { masks } = await renderSvg(part, undefined, {
    masks: { svgs: [part, rest], cols: 400 },
  });
  return relate(masks![0], masks![1], viewBox);
}

describe('an artist’s character that points, waves, nods and steps', () => {
  let rigged: CharacterSheet;
  beforeAll(async () => {
    const drawing = unmarked(drawingOf(egg()));
    const face = (await measureFace(drawingOf(egg()))).face!;
    rigged = (
      await rigSheet({
        version: SHEET_VERSION,
        drawing,
        anchors: { head: [200, 232], body: [200, 350], legs: [200, 525] },
        face,
      })
    ).sheet;
  }, 120_000);

  it('finds each arm’s shoulder and each leg’s hip, and turns each about it', () => {
    const { rig } = rigged;
    for (const id of ['arm-left', 'arm-right', 'leg-left', 'leg-right'])
      expect(rig!.joints[id]).toBeDefined();
    expect(rig!.arms?.r).toBeGreaterThan(0);
    expect(rig!.arms?.l).toBeGreaterThan(0);
    expect(rig!.steps).toBe(true);
    const { svg } = rigged.drawing;
    const [x, y] = rig!.joints['arm-right'];
    expect(svg).toContain(
      `class="rig-arm rig-arm-r" style="transform-origin:${x}px ${y}px"`,
    );
    expect(svg).toContain(
      `.rig-arm-r{rotate:calc(clamp(${-rig!.arms!.r!}, var(--ar,0), ${rig!.arms!.r!})*1deg)}`,
    );
    expect(svg).toMatch(/class="rig-leg rig-leg-a"/);
    expect(svg).toMatch(/class="rig-leg rig-leg-b"/);
    expect(svg).toContain('.on-walking .rig-leg-a{animation:rig-step');
    expect(rig!.onePiece).toBeUndefined();
  });

  it('keeps each arm joined at both ends of its swing', async () => {
    const { rig } = rigged;
    for (const [id, side] of [
      ['arm-right', 'r'],
      ['arm-left', 'l'],
    ] as const) {
      const most = rig!.arms![side]!;
      expect(most).toBeLessThanOrEqual(SWINGS.arm);
      for (const degrees of [-most, most]) {
        const relation = await limbOn(
          rigged.drawing.svg,
          EGG_BOX,
          id,
          ['body'],
          { degrees, about: rig!.joints[id] },
        );
        expect(relation.gap).toBe(0);
      }
    }
  }, 60_000);

  it('keeps each leg joined at both ends of its step', async () => {
    const { rig } = rigged;
    const most = Number(
      /@keyframes rig-step\{0%,100%\{transform:rotate\((-?[\d.]+)deg\)\}/.exec(
        rigged.drawing.svg,
      )![1],
    );
    expect(Math.abs(most)).toBeGreaterThan(0);
    expect(Math.abs(most)).toBeLessThanOrEqual(SWINGS.step);
    for (const id of ['leg-left', 'leg-right'])
      for (const degrees of [most, -most]) {
        const relation = await limbOn(
          rigged.drawing.svg,
          EGG_BOX,
          id,
          ['body'],
          { degrees, about: rig!.joints[id] },
        );
        expect(relation.gap).toBe(0);
      }
  }, 60_000);

  it('nods and tilts its head about its neck', () => {
    const { rig } = rigged;
    expect(rig!.joints.head).toBeDefined();
    expect(rig!.dip).toBeGreaterThan(0);
    expect(rig!.nods).toBe(true);
    expect(rigged.drawing.svg).toMatch(
      /\.rig-head\{scale:1 calc\(1 - clamp\(0, var\(--nod,0\), 7\)\*[\d.]+\)\}/,
    );
  });

  it('turns an arm less far when all the way would take it off the drawing', async () => {
    // A long right arm reaching to the frame's edge: swung all the way up,
    // most of it would leave the drawing.
    const long = egg().replace(
      '<rect x="306" y="310" width="34" height="100"',
      '<rect x="306" y="310" width="34" height="270"',
    );
    const drawing = unmarked(drawingOf(long));
    const face = (await measureFace(drawingOf(long))).face!;
    const { sheet } = await rigSheet({
      version: SHEET_VERSION,
      drawing,
      anchors: { head: null, body: null, legs: null },
      face,
    });
    expect(sheet.rig!.arms?.l).toBe(SWINGS.arm);
    expect(sheet.rig!.arms?.r ?? 0).toBeLessThan(SWINGS.arm);
  }, 120_000);

  it('moves a drawing in one piece as a whole: it squashes, stretches, leans and hops', async () => {
    const blob = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 60 320 360">',
      '<g id="body"><ellipse cx="200" cy="260" rx="150" ry="150" fill="#9ad0f5" stroke="#2d2a32" stroke-width="3"/></g>',
      ...EXPRESSIONS.map(
        (name) =>
          `<g id="${name}"><circle cx="165" cy="220" r="16" fill="#fff" stroke="#2d2a32" stroke-width="3"/><circle cx="235" cy="220" r="16" fill="#fff" stroke="#2d2a32" stroke-width="3"/></g>`,
      ),
      `<g id="${MOUTH_MARK}"><circle cx="200" cy="270" r="4" fill="#e04040"/></g>`,
      '</svg>',
    ].join('');
    const box: ViewBox = [40, 60, 320, 360];
    const face = (await measureFace(drawingOf(blob, box))).face!;
    const { sheet } = await rigSheet({
      version: SHEET_VERSION,
      drawing: unmarked(drawingOf(blob, box)),
      anchors: { head: null, body: null, legs: null },
      face,
    });
    expect(sheet.rig!.onePiece).toBe(true);
    expect(sheet.rig!.arms).toBeUndefined();
  }, 120_000);
});

describe('a character drawn before mouths were code’s', () => {
  it('is rigged as it was: no arms turned, no legs stepping, its own mouths', async () => {
    // The same egg with its mouths drawn in its faces, as the old brief
    // asked, and no face measured: nothing new is done to it.
    const drawing = drawingOf(egg([...EXPRESSIONS]));
    const { sheet } = await rigSheet({
      version: SHEET_VERSION,
      drawing,
      anchors: { head: null, body: null, legs: null },
    });
    expect(sheet.rig!.arms).toBeUndefined();
    expect(sheet.rig!.steps).toBeUndefined();
    expect(sheet.rig!.onePiece).toBeUndefined();
    expect(sheet.drawing.svg).not.toContain('cm-rest');
    expect(sheet.drawing.svg).not.toContain('rig-arm');
  }, 120_000);
});
