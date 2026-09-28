import { CLOTH, FIGURE_INK } from './scene-ink';
import { styleReport } from './scene-polish';
import { restLooksOf } from './scene-rest';

describe('clothes at rest', () => {
  it('folds a uniform as a jumper on its shirt, in the colours its words say, and hangs it on a peg in a room', () => {
    const looks = restLooksOf(
      { name: 'school uniform', look: 'white shirt and navy blue jumper' },
      null,
      true,
    )!;
    expect(looks.folded.svg).toContain(CLOTH.navy);
    expect(looks.folded.svg).toContain(CLOTH.white);
    // The jumper, its own colour, over the shirt: navy is drawn after white.
    expect(looks.folded.svg.indexOf(CLOTH.navy)).toBeGreaterThan(
      looks.folded.svg.indexOf(CLOTH.white),
    );
    expect(looks.hung).toBeDefined();
    for (const look of [looks.folded, looks.hung!]) {
      // It rests at its foot's middle, on its own ground.
      expect(look.anchor).toEqual([0, 0]);
      const [, y, , h] = look.viewBox;
      expect(y).toBeLessThan(0);
      expect(y + h).toBeGreaterThanOrEqual(0);
      const report = styleReport(look.svg, 1);
      expect(report.inked).toBe(report.outlines);
      expect(report.gradients).toBe(0);
      expect(look.svg).toContain(`stroke="${FIGURE_INK}"`);
    }
    // Folded it lies low; on its hanger its hem is well off the floor.
    expect(-looks.folded.viewBox[1]).toBeLessThan(40);
    expect(-looks.hung!.viewBox[1]).toBeGreaterThan(150);
  });

  it('only folds it out of doors, where there is no wall to hang it on', () => {
    const looks = restLooksOf(
      { name: 'raincoat', look: 'yellow' },
      null,
      false,
    )!;
    expect(looks.hung).toBeUndefined();
    expect(looks.folded.svg).toContain(CLOTH.yellow);
  });

  it('takes its colours from its drawing when its words say none', () => {
    const looks = restLooksOf(
      { name: 'cardigan' },
      {
        svg: '<svg><path fill="#8a6bd1"/><path fill="#8a6bd1"/><path fill="#2d2a32"/><circle fill="#f4c95d"/></svg>',
      },
      true,
    )!;
    expect(looks.folded.svg).toContain('#8a6bd1');
  });

  it('gives nothing but what is worn a look at rest, and nothing to what shows none (a hat, shoes)', () => {
    expect(restLooksOf({ name: 'kite', look: 'red' }, null, true)).toBeNull();
    expect(restLooksOf({ name: 'sun hat' }, null, true)).toBeNull();
    expect(restLooksOf({ name: 'school shoes' }, null, true)).toBeNull();
    // A scarf and clothes fold, and never hang.
    expect(
      restLooksOf({ name: 'scarf', look: 'red' }, null, true)?.hung,
    ).toBeUndefined();
    expect(
      restLooksOf({ name: 'party clothes' }, null, true)?.hung,
    ).toBeUndefined();
  });
});
