/**
 * The kit's geometry: each shape's box is the shape's own (so a piece
 * knows its parts' boxes without a renderer), a capsule's ends are round
 * where a limb meets the next, a mirrored shape is the same shape turned
 * round, and a lit part keeps its rim inside its own outline.
 */
import { Resvg } from '@resvg/resvg-js';
import {
  blob,
  boxOf,
  capsule,
  circle,
  ellipse,
  litShape,
  mapShape,
  rect,
  awayFrom,
  type Shape,
} from './shape';

/** The ink a shape draws, rendered alone at one pixel a unit, and the box round it. */
function inked(
  shape: Shape,
  pad = 4,
): { box: [number, number, number, number]; count: number } {
  const [x, y, w, h] = shape.box;
  const view = [x - pad, y - pad, w + 2 * pad, h + 2 * pad];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.join(' ')}" width="${Math.ceil(view[2])}" height="${Math.ceil(view[3])}"><path d="${shape.d}" fill="#000"/></svg>`;
  const png = new Resvg(svg).render();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let count = 0;
  for (let j = 0; j < png.height; j += 1)
    for (let i = 0; i < png.width; i += 1)
      if (png.pixels[(j * png.width + i) * 4 + 3] > 127) {
        count += 1;
        x0 = Math.min(x0, i);
        y0 = Math.min(y0, j);
        x1 = Math.max(x1, i + 1);
        y1 = Math.max(y1, j + 1);
      }
  return { box: [view[0] + x0, view[1] + y0, x1 - x0, y1 - y0], count };
}

const near = (a: number[], b: number[], tol: number) =>
  a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(tol));

describe('the kit’s shapes', () => {
  it('a circle and a turned ellipse cover exactly their boxes', () => {
    const c = circle([50, 40], 20);
    expect(c.box).toEqual([30, 20, 40, 40]);
    near(inked(c).box, c.box, 1.01);
    const e = ellipse([0, 0], 30, 10, Math.PI / 6);
    near(inked(e).box, e.box, 1.01);
  });

  it('a capsule is round at both ends and covers its box, whichever end is bigger', () => {
    for (const [a, ra, b, rb] of [
      [[0, 0], 10, [60, 30], 5],
      [[0, 0], 4, [0, 50], 9],
      [[10, 10], 6, [-40, 70], 6],
    ] as const) {
      const shape = capsule([...a], ra, [...b], rb);
      const drawn = inked(shape);
      near(drawn.box, shape.box, 1.01);
      // Its area is about the hull of its two circles: more than both, far less than its box.
      expect(drawn.count).toBeGreaterThan(Math.PI * (ra * ra + rb * rb) * 0.9);
      expect(drawn.count).toBeLessThan(shape.box[2] * shape.box[3]);
    }
  });

  it('a capsule whose one end holds the other is that end’s circle', () => {
    expect(capsule([0, 0], 10, [2, 0], 3).box).toEqual(circle([0, 0], 10).box);
  });

  it('a smooth shape and a rounded rectangle stay inside their boxes', () => {
    const torso = blob([
      [0, 0],
      [30, 5],
      [28, 60],
      [-4, 62],
    ]);
    const drawn = inked(torso);
    expect(drawn.box[0]).toBeGreaterThanOrEqual(torso.box[0] - 1);
    expect(drawn.box[0] + drawn.box[2]).toBeLessThanOrEqual(
      torso.box[0] + torso.box[2] + 1,
    );
    const card = rect(0, 0, 80, 40, 8);
    near(inked(card).box, [0, 0, 80, 40], 1.01);
  });

  it('a shape mirrored is the same shape facing the other way', () => {
    const shape = capsule([0, 0], 10, [60, 30], 5);
    const back = mapShape(shape, ([x, y]) => [-x, y]);
    // Its box is the hull of its points, a hair round the circles' own.
    expect(Math.abs(back.box[0] + shape.box[0] + shape.box[2])).toBeLessThan(1);
    expect(Math.abs(back.box[2] - shape.box[2])).toBeLessThan(1.5);
    expect(Math.abs(inked(back).count - inked(shape).count)).toBeLessThan(
      inked(shape).count * 0.02,
    );
  });

  it('boxes the points it is given', () => {
    expect(
      boxOf([
        [1, 2],
        [5, -3],
        [2, 9],
      ]),
    ).toEqual([1, -3, 4, 12]);
  });

  it('lights a part with a rim on the side the light comes from, inside its own outline', () => {
    const shape = rect(0, 0, 100, 100);
    // Light from the upper left: the rim shows along the top and the left.
    const markup = litShape('p', shape, {
      fill: '#000000',
      rim: '#ffffff',
      away: awayFrom((225 * Math.PI) / 180, 6),
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120" width="120" height="120">${markup}</svg>`;
    const png = new Resvg(svg).render();
    const at = (x: number, y: number) => {
      const i = ((y + 10) * 120 + (x + 10)) * 4;
      return [png.pixels[i], png.pixels[i + 3]];
    };
    expect(at(2, 50)[0]).toBeGreaterThan(200); // the lit left edge
    expect(at(50, 2)[0]).toBeGreaterThan(200); // the lit top edge
    expect(at(97, 50)[0]).toBeLessThan(40); // the right edge, away from the light
    expect(at(50, 50)[0]).toBeLessThan(40); // the middle
    expect(at(-5, 50)[1]).toBe(0); // nothing outside the shape
  });
});
