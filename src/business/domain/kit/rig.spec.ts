/**
 * The rig format: a figure built to the standard is whole and nested as
 * the stage needs it, its pivots on its joints; a broken one is caught in
 * plain words; poses turn joints about their parents' joints as nested
 * SVG groups do; two segments reach a point as a knee or an elbow bends.
 */
import { Resvg } from '@resvg/resvg-js';
import type { ShotBox } from '../../../contracts';
import {
  FIGURE_PARENT,
  FIGURE_PARTS,
  GROWN_UP,
  type FigureDrawing,
  type FigurePart,
  type Joints,
  type KitPiece,
  assemble,
  figureParts,
  mirrored,
  partTree,
  posed,
  reach,
  standingJoints,
  svgOf,
  toAsset,
  turnBetween,
  validateRig,
} from './rig';
import { capsule, circle, dist, grow, type Pt } from './shape';

const END: Record<FigurePart, [keyof Joints, keyof Joints]> = {
  body: ['hip', 'hip'],
  torso: ['hip', 'neck'],
  head: ['neck', 'crown'],
  'arm-l': ['shoulder-l', 'elbow-l'],
  'forearm-l': ['elbow-l', 'wrist-l'],
  'hand-l': ['wrist-l', 'fingers-l'],
  'arm-r': ['shoulder-r', 'elbow-r'],
  'forearm-r': ['elbow-r', 'wrist-r'],
  'hand-r': ['wrist-r', 'fingers-r'],
  'thigh-l': ['hip-l', 'knee-l'],
  'shin-l': ['knee-l', 'ankle-l'],
  'foot-l': ['ankle-l', 'toe-l'],
  'thigh-r': ['hip-r', 'knee-r'],
  'shin-r': ['knee-r', 'ankle-r'],
  'foot-r': ['ankle-r', 'toe-r'],
};

/** Each part a capsule between its joints: the plainest figure the standard allows. */
function stick(joints: Joints, prefix = ''): KitPiece {
  const drawing: FigureDrawing = {};
  for (const part of FIGURE_PARTS) {
    if (part === 'body') continue;
    const [a, b] = END[part];
    const shape =
      part === 'head'
        ? circle(
            joints.crown.map((v, i) => (v + joints.neck[i]) / 2) as Pt,
            dist(joints.crown, joints.neck) / 2,
          )
        : capsule(joints[a], 4, joints[b], 3);
    drawing[part] = {
      markup: `<path d="${shape.d}" fill="#333"/>`,
      box: shape.box,
    };
  }
  const built = assemble(figureParts(prefix, joints, drawing, 'side'));
  const box: ShotBox = grow([-60, -180, 120, 180], 2);
  return {
    id: 'test.stick',
    svg: svgOf(box, built.markup),
    parts: built.parts,
    rig: {
      states: { rest: {} },
      moves: ['walk'],
      figures: [{ prefix, facing: 1 }],
    },
    focal: [-30, -175, 60, 175],
    box,
    colours: ['ink'],
  };
}

describe('a figure built to the standard', () => {
  const joints = standingJoints(GROWN_UP, 'side');

  it('stands with its feet on the ground, as tall as it is built', () => {
    expect(joints['heel-l'][1]).toBe(0);
    expect(joints.crown[1]).toBeCloseTo(-GROWN_UP.height, 5);
    expect(joints.hip[1]).toBeCloseTo(-GROWN_UP.legs * GROWN_UP.height, 5);
    // A grown-up's knee is about a quarter of the way up, the shoulder about four fifths.
    expect(-joints['knee-l'][1] / GROWN_UP.height).toBeGreaterThan(0.25);
    expect(-joints['knee-l'][1] / GROWN_UP.height).toBeLessThan(0.31);
    expect(-joints['shoulder-l'][1] / GROWN_UP.height).toBeGreaterThan(0.79);
    expect(-joints['shoulder-l'][1] / GROWN_UP.height).toBeLessThan(0.85);
  });

  it('is whole: every part drawn once, nested in its parent, its pivot on its joint', () => {
    const piece = stick(joints);
    expect(validateRig(piece)).toEqual([]);
    const { parent } = partTree(piece.svg);
    for (const part of FIGURE_PARTS)
      expect(parent.get(part)).toBe(FIGURE_PARENT[part]);
    // The shin turns about the knee: its pivot, as fractions of its box, is the knee.
    const shin = piece.parts['shin-l'];
    const [x, y, w, h] = shin.box;
    const [fx, fy] = shin.pivot!;
    expect(x + fx * w).toBeCloseTo(joints['knee-l'][0], 0);
    expect(y + fy * h).toBeCloseTo(joints['knee-l'][1], 0);
  });

  it('keeps each figure of a group under its own prefix', () => {
    const piece = stick(joints, 'f2.');
    expect(validateRig(piece)).toEqual([]);
    expect(Object.keys(piece.parts)).toContain('f2.shin-r');
    expect(partTree(piece.svg).parent.get('f2.foot-r')).toBe('f2.shin-r');
  });

  it('draws: resvg renders it with ink where the figure is', () => {
    const piece = stick(joints);
    const png = new Resvg(piece.svg, {
      fitTo: { mode: 'height', value: 180 },
    }).render();
    const px = png.pixels;
    let ink = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 128) ink += 1;
    expect(ink / (png.width * png.height)).toBeGreaterThan(0.03);
  });

  it('is played as the stage takes an asset', () => {
    const piece = stick(joints);
    const asset = toAsset(piece);
    expect(asset.kind).toBe('svg');
    expect(asset.rig?.figures).toEqual([{ prefix: '', facing: 1 }]);
    expect(asset.box).toEqual(piece.box);
    expect(asset.focal).toEqual(piece.focal);
  });
});

describe('a broken piece', () => {
  const joints = standingJoints(GROWN_UP, 'side');

  it('is caught, in plain words', () => {
    const piece = stick(joints);
    const lost = {
      ...piece,
      svg: piece.svg.replace('data-part="hand-l"', 'data-x="hand-l"'),
    };
    expect(validateRig(lost).join('\n')).toMatch(
      /"hand-l" is listed but not drawn/,
    );
    const loose = {
      ...piece,
      parts: {
        ...piece.parts,
        'shin-l': {
          ...piece.parts['shin-l'],
          pivot: [0.5, 1.6] as [number, number],
        },
      },
    };
    expect(validateRig(loose).join('\n')).toMatch(
      /"shin-l" turns about a point outside its box/,
    );
    const flat = {
      ...piece,
      svg: piece.svg.replace(
        /<g data-part="foot-l">/,
        '</g><g data-part="foot-l">',
      ),
    };
    expect(validateRig(flat).join('\n')).toMatch(/not nested/);
    const posing = {
      ...piece,
      rig: { ...piece.rig, states: { up: { tail: { rotate: 5 } } } },
    };
    expect(validateRig(posing).join('\n')).toMatch(/poses "tail"/);
    const still = { ...piece, rig: { ...piece.rig, moves: [] } };
    expect(validateRig(still).join('\n')).toMatch(/no moves/);
  });

  it('a vehicle whose wheel has no radius', () => {
    const piece: KitPiece = {
      id: 'test.cart',
      svg: svgOf(
        [0, 0, 100, 50],
        '<g data-part="body"><g data-part="wheel-1"><circle cx="50" cy="40" r="10"/></g></g>',
      ),
      parts: {
        body: { box: [0, 0, 100, 50] },
        'wheel-1': { box: [40, 30, 20, 20], pivot: [0.5, 0.5] },
      },
      rig: {
        states: {},
        moves: ['enter'],
        vehicle: { goes: 'road', facing: 1 },
      },
      focal: [0, 0, 100, 50],
      box: [0, 0, 100, 50],
      colours: ['side'],
    };
    expect(validateRig(piece)).toEqual(['wheel "wheel-1" has no radius']);
    piece.parts['wheel-1'].value = 10;
    expect(validateRig(piece)).toEqual([]);
  });
});

describe('posing', () => {
  const joints = standingJoints(GROWN_UP, 'side');

  it('turns a part about its joint, carrying what hangs from it, as nested groups do', () => {
    const out = posed(joints, { turns: { 'thigh-l': -30, 'shin-l': 45 } });
    // The hip stays; the knee swings forward (a figure facing right turns a thigh forward anticlockwise).
    expect(out['hip-l']).toEqual(joints['hip-l']);
    expect(out['knee-l'][0]).toBeGreaterThan(joints['knee-l'][0]);
    expect(dist(out['hip-l'], out['knee-l'])).toBeCloseTo(
      dist(joints['hip-l'], joints['knee-l']),
      6,
    );
    // The shin turned at the knee keeps its length, its angle the sum of both turns.
    expect(dist(out['knee-l'], out['ankle-l'])).toBeCloseTo(
      dist(joints['knee-l'], joints['ankle-l']),
      6,
    );
    expect(
      turnBetween(
        joints['knee-l'],
        joints['ankle-l'],
        out['knee-l'],
        out['ankle-l'],
      ),
    ).toBeCloseTo(15, 6);
    // The other leg is untouched.
    expect(out['ankle-r']).toEqual(joints['ankle-r']);
  });

  it('moves the whole figure', () => {
    const out = posed(joints, { move: [10, 20] });
    expect(out.crown).toEqual([joints.crown[0] + 10, joints.crown[1] + 20]);
  });

  it('mirrors a profile to face the other way', () => {
    const back = mirrored(joints, 0);
    expect(back['toe-l'][0]).toBeLessThan(back['heel-l'][0]);
    expect(back.crown[1]).toBe(joints.crown[1]);
  });

  it('reaches a point with two segments, bending the way it is told', () => {
    const hip: Pt = [0, -90];
    const ankle: Pt = [10, -8];
    const knee = reach(hip, ankle, 42, 42, 1);
    expect(dist(hip, knee)).toBeCloseTo(42, 6);
    expect(dist(knee, ankle)).toBeCloseTo(42, 6);
    expect(knee[0]).toBeGreaterThan(5);
    const back = reach(hip, ankle, 42, 42, -1);
    expect(back[0]).toBeLessThan(knee[0]);
    // Out of reach, it stretches straight toward the point.
    const far = reach(hip, [0, 200], 42, 42, 1);
    expect(far[0]).toBeCloseTo(0, 1);
    expect(far[1]).toBeCloseTo(-48, 1);
  });
});
