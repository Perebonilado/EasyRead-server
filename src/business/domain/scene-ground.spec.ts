import {
  GROUND_COLS,
  closed,
  conventionGround,
  groundOf,
  groundVersions,
  measureGround,
  topAt,
} from './scene-ground';

/** A set as a painter draws one: the sky, the ground, and what stands on it. */
const set = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#cfe6f2"/>${body}</svg>`;
const SAND = '#e8d3a6';
const ROAD = '#9a9aa2';
const PAVING = '#cfc8bd';
const INK = 'stroke="#2d2a32" stroke-width="3"';

/** The ground's top at a point of the set, in its units. */
const at = (ground: ReturnType<typeof conventionGround>, x: number) =>
  topAt(ground, x / 1600) * 900;

describe('where a set’s ground is', () => {
  it('reads the far edge of flat ground, and the foot of a stall standing on it', async () => {
    const ground = (await measureGround({
      svg: set(
        `<rect y="560" width="1600" height="340" fill="${SAND}" ${INK}/>` +
          // A stall: a counter on the ground, its base at 0.74 of the height.
          `<rect x="500" y="520" width="300" height="146" fill="#e0785a" ${INK}/>`,
      ),
    }))!;
    expect(ground.source).toBe('colour');
    expect(ground.top).toHaveLength(GROUND_COLS);
    // Open ground: its far edge. Before the stall: the stall's foot.
    expect(at(ground, 200)).toBeCloseTo(560, -1);
    expect(at(ground, 1300)).toBeCloseTo(560, -1);
    for (const x of [520, 650, 780]) expect(at(ground, x)).toBeGreaterThan(660);
    expect(at(ground, 650)).toBeLessThan(680);
    // The horizon a little above the ground's nearest tenth.
    expect(ground.horizon * 900).toBeLessThan(562);
    expect(ground.horizon * 900).toBeGreaterThan(550);
  });

  it('takes a road and its pavement together as ground', async () => {
    const ground = (await measureGround({
      svg: set(
        `<rect y="560" width="1600" height="120" fill="${PAVING}" ${INK}/>` +
          `<rect y="680" width="1600" height="220" fill="${ROAD}" ${INK}/>`,
      ),
    }))!;
    for (const x of [100, 800, 1500])
      expect(Math.abs(at(ground, x) - 560)).toBeLessThan(8);
  });

  it('steps over tufts of grass on the ground', async () => {
    const tufts = Array.from(
      { length: 12 },
      (_, k) =>
        `<path d="M${60 + k * 130},700 l6,-14 l6,14 z" fill="#5f9a4e" stroke="none"/>`,
    ).join('');
    const ground = (await measureGround({
      svg: set(
        `<rect y="580" width="1600" height="320" fill="#a8d68c"/>${tufts}`,
      ),
    }))!;
    for (const x of [66, 196, 800, 1500])
      expect(Math.abs(at(ground, x) - 580)).toBeLessThan(8);
  });

  it('reads the painter’s own ground group, less what stands on it', async () => {
    const svg = set(
      `<g id="ground"><rect y="600" width="1600" height="300" fill="${SAND}"/></g>` +
        // A wall drawn after the ground, over it: no one stands in it.
        `<rect x="0" y="480" width="400" height="200" fill="#d8c7b4" ${INK}/>`,
    );
    const ground = (await measureGround({ svg, parts: { ground: 'ground' } }))!;
    expect(ground.source).toBe('group');
    expect(Math.abs(at(ground, 1000) - 600)).toBeLessThan(8);
    expect(at(ground, 200)).toBeGreaterThan(675);
  });

  it('reads a vessel’s deck from above the side that stands in front of people', async () => {
    const svg = set(
      `<rect y="520" width="1600" height="380" fill="#b98a5a" ${INK}/>` +
        `<g id="front"><rect y="720" width="1600" height="180" fill="#7b4f2c" ${INK}/></g>`,
    );
    const ground = (await measureGround({ svg, parts: { front: 'front' } }))!;
    expect(ground.source).toBe('colour');
    expect(Math.abs(at(ground, 800) - 520)).toBeLessThan(8);
    // The front is hidden where the set is read; the stage draws it.
    const versions = groundVersions(svg, { front: 'front' })!;
    expect(versions.set).toContain('display="none"');
    expect(versions.front).toContain('visibility="visible"');
  });

  it('falls back to the convention when no ground is likely', async () => {
    const ground = (await measureGround({ svg: set('') }))!;
    expect(ground.source).toBe('convention');
    expect(ground.top.every((top) => top === 0.66)).toBe(true);
    expect(ground.horizon).toBe(0.64);
  });

  it('measures nothing when the render fails, for it to be measured another time', async () => {
    const drawing = {
      svg: set(`<rect y="600" width="1600" height="300" fill="${SAND}"/>`),
    };
    const failed = () =>
      Promise.reject(new Error('the drawing will not render (SIGKILL)'));
    expect(await measureGround(drawing, failed)).toBeNull();
    expect(
      await measureGround(drawing, () => Promise.resolve({ ink: null })),
    ).toBeNull();
    // One that cannot be read at all reads no better another time: the convention.
    expect((await measureGround({ svg: '<svg' }))?.source).toBe('convention');
  });

  it('closes a gap under something on legs, and keeps open ground', () => {
    const top = [0.6, 0.6, 0.6, 0.74, 0.62, 0.74, 0.6, 0.6, 0.6, 0.6];
    expect(closed(top, 1)).toEqual([
      0.6, 0.6, 0.6, 0.74, 0.74, 0.74, 0.6, 0.6, 0.6, 0.6,
    ]);
  });

  it('keeps a ground read back only when it is one', () => {
    const good = conventionGround();
    expect(groundOf(good)).toEqual(good);
    expect(groundOf({ ...good, top: [2] })).toBeNull();
    expect(groundOf({ ...good, haze: 'blue' })).toBeNull();
    expect(groundOf(null)).toBeNull();
  });
});
