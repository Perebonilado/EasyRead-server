import {
  apply,
  distanceTo,
  inkBoxOf,
  invert,
  joined,
  joinedWithin,
  mendVector,
  multiply,
  parseTransform,
  relate,
  type ViewBox,
} from './scene-joints';
import type { InkMap } from './scene-raster';

/** A map from rows of '#' (ink) and '.' (room). */
function mapOf(rows: string[]): InkMap {
  return {
    cols: rows[0].length,
    rows: rows.length,
    bits: rows.join('').replace(/#/g, '1').replace(/\./g, '0'),
  };
}

/** A map `cols` by `rows` with ink in the box [x0, x1) by [y0, y1). */
function boxMap(
  cols: number,
  rows: number,
  [x0, y0, x1, y1]: [number, number, number, number],
): InkMap {
  let bits = '';
  for (let y = 0; y < rows; y += 1)
    for (let x = 0; x < cols; x += 1)
      bits += x >= x0 && x < x1 && y >= y0 && y < y1 ? '1' : '0';
  return { cols, rows, bits };
}

describe('how the parts of a drawn character meet', () => {
  it('measures how far every cell is from the ink, straight and diagonally', () => {
    const d = distanceTo(mapOf(['#...', '....', '....']));
    expect(d[0]).toBe(0);
    expect(d[3]).toBe(3);
    expect(d[5]).toBeCloseTo(Math.SQRT2);
    expect(d[10]).toBeCloseTo(2 * Math.SQRT2);
    expect(distanceTo(mapOf(['..'])).every((one) => one === Infinity)).toBe(
      true,
    );
  });

  // 100 cells across a drawing 200 units wide: two units a cell.
  const viewBox: ViewBox = [0, 0, 200, 200];
  const body = boxMap(100, 100, [20, 20, 60, 80]);

  it('finds a part that floats: how far, and where each is nearest', () => {
    const tail = boxMap(100, 100, [75, 40, 90, 45]);
    const relation = relate(tail, body, viewBox);
    // Cells 75 and 59 are 16 cells apart: 32 units.
    expect(relation.gap).toBe(32);
    expect(relation.seamCells).toBe(0);
    expect(relation.joint).toBeNull();
    expect(relation.nearestPart![0]).toBe(151);
    expect(relation.nearestTrunk![0]).toBe(119);
    expect(joined(relation, viewBox)).toBe(false);
  });

  it('finds where a part that overlaps meets the rest', () => {
    const tail = boxMap(100, 100, [55, 40, 90, 44]);
    const relation = relate(tail, body, viewBox);
    expect(relation.gap).toBe(0);
    expect(relation.seamCells).toBeGreaterThan(0);
    expect(joined(relation, viewBox)).toBe(true);
    // The seam is the tail's base, over the body's edge.
    expect(relation.joint![0]).toBeGreaterThan(110);
    expect(relation.joint![0]).toBeLessThan(126);
    expect(relation.joint![1]).toBeCloseTo(84, 0);
  });

  it('holds joining distance in units scaled to the sheet, never in cells', () => {
    expect(joinedWithin([0, 0, 200, 200])).toBe(2);
    expect(joinedWithin([0, 0, 800, 1200])).toBe(6);
  });

  it('moves a floating part in by its gap and a little more, along the shortest way', () => {
    const tail = boxMap(100, 100, [75, 40, 90, 45]);
    const relation = relate(tail, body, viewBox);
    const box = inkBoxOf(tail, viewBox)!;
    expect(box).toEqual({ x: 150, y: 80, width: 30, height: 10 });
    // A thin part overlaps by the least: six units.
    expect(mendVector(relation, box)).toEqual([-38, 0]);
    expect(mendVector({ ...relation, nearestTrunk: null }, box)).toBeNull();
  });

  it('reads a transform attribute as a matrix, and undoes it', () => {
    const m = parseTransform('translate(10 20) rotate(90) scale(2)')!;
    expect(apply(m, [1, 0]).map((n) => Math.round(n))).toEqual([10, 22]);
    const about = parseTransform('rotate(180 50 50)')!;
    expect(apply(about, [0, 0]).map((n) => Math.round(n))).toEqual([100, 100]);
    const back = invert(m)!;
    expect(apply(back, apply(m, [3, 4])).map((n) => Math.round(n))).toEqual([
      3, 4,
    ]);
    expect(multiply(m, back).map((n) => Math.round(n))).toEqual([
      1, 0, 0, 1, 0, 0,
    ]);
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('perspective(3)')).toBeNull();
    expect(parseTransform('translate(1 2) nonsense')).toBeNull();
  });
});
