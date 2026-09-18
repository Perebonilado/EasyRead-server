import {
  AT_REST,
  MOTIONS,
  MOTION_MEANINGS,
  atRest,
  motionPose,
} from './living.generated/motion';

describe('how a drawn thing moves', () => {
  it('has a meaning for every motion the director may pick', () => {
    for (const motion of MOTIONS) {
      expect(MOTION_MEANINGS[motion].what.length).toBeGreaterThan(10);
      expect(MOTION_MEANINGS[motion].when.length).toBeGreaterThan(10);
    }
  });

  it('comes in from the left and rides, then rests once told to settle', () => {
    expect(motionPose('travel', 0).dx).toBeCloseTo(-70);
    expect(motionPose('travel', 2).dx).toBe(0);
    expect(Math.abs(motionPose('travel', 2.3).dy)).toBeGreaterThan(0);
    // Told to settle at 3 s, it is at rest a second later.
    expect(atRest(motionPose('travel', 4.2, 3))).toBe(true);
    expect(atRest(motionPose('hover', 4.2, 3))).toBe(true);
    expect(atRest(motionPose('bounce', 4.2, 3))).toBe(true);
  });

  it('spins until told to settle, then eases to a full turn', () => {
    expect(motionPose('spin', 1).rotate).toBeCloseTo(60);
    const rested = motionPose('spin', 5, 3);
    expect(rested.rotate % 360).toBeCloseTo(0, 0);
  });

  it('goes along to the next thing and stays; grows to its size and holds', () => {
    const to = { dx: 120, dy: 0 };
    expect(motionPose('along', 0, null, to).dx).toBe(0);
    expect(motionPose('along', 3, null, to).dx).toBeCloseTo(120);
    expect(motionPose('along', 3, null, null).dx).toBe(0);
    expect(motionPose('grow', 0).scale).toBeLessThan(0.5);
    expect(motionPose('grow', 3).scale).toBeCloseTo(1);
    expect(motionPose('shake', 2)).toEqual(AT_REST);
  });
});
