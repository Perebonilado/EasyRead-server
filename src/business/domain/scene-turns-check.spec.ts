import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto } from '../../contracts';
import { turnsCheck, turnsLine } from './scene-turns-check';
import {
  FLIP_BACK_MS,
  MIN_HOLD_MS,
  steadyFacings,
  withViews,
  type Facing,
} from './scene-views';

/** "The Star and the Manger" (a Nativity for young children), as it was made: its five scenes, drawings left out. */
const nativity = [0, 1, 2, 3, 4].map(
  (n) =>
    JSON.parse(
      readFileSync(
        join(__dirname, 'studio/__fixtures__/nativity', `made-s${n}.json`),
        'utf8',
      ),
    ) as SceneDto,
);

/** A scene's views worked out again, as a make now works them out. */
const remade = (scene: SceneDto): SceneDto => {
  const acting = Object.fromEntries(
    Object.entries(scene.acting ?? {}).map(([id, one]) => {
      const rest = { ...one };
      delete rest.view;
      return [id, rest];
    }),
  );
  return withViews({ ...scene, acting });
};

describe('the turn check', () => {
  it('finds what made the Nativity jerky: turns back and forth, and to the camera for nothing', () => {
    const made = nativity.map(turnsCheck);
    const sum = (k: 'turns' | 'flip-back' | 'to-camera') =>
      made.reduce((n, r) => n + r.counts[k], 0);
    expect(sum('turns')).toBeGreaterThan(100);
    expect(sum('flip-back')).toBeGreaterThan(20);
    expect(sum('to-camera')).toBeGreaterThan(40);
    // Mary, at 5.6 s of the first scene: to the front for 650 ms as she
    // glances down, and back to Joseph.
    expect(made[0].issues).toContainEqual(
      expect.objectContaining({ id: 'mary', kind: 'flip-back', atMs: 5581 }),
    );
    expect(turnsLine(made[0])).toMatch(/flip-backs/);
  });

  it('finds none of it in the views made now: a turn held, never undone, never to the camera for nothing', () => {
    for (const scene of nativity) {
      const report = turnsCheck(remade(scene));
      expect(report.counts['flip-back']).toBe(0);
      expect(report.counts['short-hold']).toBe(0);
      // Joseph looking at the shepherd straight in front of him is the one
      // the check cannot tell a reason for.
      expect(report.counts['to-camera']).toBeLessThanOrEqual(1);
      for (const one of report.people)
        expect(one.perMinute).toBeLessThanOrEqual(13);
    }
    const before = nativity.reduce((n, s) => n + turnsCheck(s).counts.turns, 0);
    const after = nativity.reduce(
      (n, s) => n + turnsCheck(remade(s)).counts.turns,
      0,
    );
    expect(after).toBeLessThan(before / 2.5);
  });

  it('keeps the baby lying in the manger facing up to us, never turned round to look', () => {
    const views = remade(nativity[4]).acting?.jesus?.view ?? [];
    expect(views.every(([, view]) => view === 'front')).toBe(true);
  });
});

describe('steady facings', () => {
  const at = (t: number, bin: number, why: Facing['why'] = 'look'): Facing => ({
    t,
    facing: bin * 45,
    why,
    cut: false,
    bin,
  });

  it('waits out the hold before a turn with no reason to be quick, and drops it if it is not wanted then', () => {
    expect(steadyFacings([at(0, 1), at(600, 2), at(3000, 3)])).toEqual([
      at(0, 1),
      { ...at(600, 2), t: MIN_HOLD_MS },
      at(3000, 3),
    ]);
    // Wanted only a moment: never turned to.
    expect(
      steadyFacings([at(0, 1), at(600, 2), at(900, 1), at(5000, 2)]),
    ).toEqual([at(0, 1), at(5000, 2)]);
  });

  it('turns at once for a walk, a new line, or a cut', () => {
    const quick = [
      at(0, 1),
      at(300, 2, 'walk'),
      at(900, 1, 'rest'),
      at(1200, 7, 'speak'),
    ];
    expect(steadyFacings(quick).map((f) => f.t)).toEqual([0, 300, 900, 1200]);
  });

  it('never turns to one side and back again within the flip-back time', () => {
    const kept = steadyFacings([
      at(0, 1),
      at(2000, 6, 'listen'),
      at(2000 + FLIP_BACK_MS - 100, 2),
    ]);
    // Out to the other side and back beside where they were: they turn
    // only the little way.
    expect(kept.map((f) => f.bin)).toEqual([1, 2]);
  });
});
