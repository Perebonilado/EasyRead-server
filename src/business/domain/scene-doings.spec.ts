import { DOINGS, doingOf, isAction, phasesMs } from './scene-doings';

describe('how long a doing takes', () => {
  it('takes at least as long given its time as it always did, and never less than its least', () => {
    const wrong = DOINGS.filter(
      (d) => !(d.leastMs <= d.ms && d.ms <= d.idealMs),
    ).map((d) => d.id);
    expect(wrong).toEqual([]);
  });

  it('gives the moves with a wind-up and a settle more time than before, and a small gesture none', () => {
    for (const id of ['throw', 'kick', 'jump', 'fall', 'lie-down', 'sit']) {
      const doing = doingOf(id)!;
      expect(doing.idealMs).toBeGreaterThan(doing.ms);
      expect(doing.phases).toBeDefined();
      expect(isAction(doing)).toBe(true);
    }
    for (const id of ['nod', 'look', 'point', 'wave', 'laugh']) {
      const doing = doingOf(id)!;
      expect(doing.idealMs).toBe(doing.ms);
      expect(isAction(doing)).toBe(false);
    }
    // A thing handled is an action; going somewhere is neither.
    expect(isAction(doingOf('take')!)).toBe(true);
    expect(isAction(doingOf('walk')!)).toBe(false);
  });

  it('shares a move between its phases, its moment where the act ends', () => {
    const wrong = DOINGS.filter((d) => d.phases).flatMap((d) => {
      const { windUp, act, follow, settle } = d.phases!;
      const sum = windUp + act + follow + settle;
      return Math.abs(sum - 1) < 1e-9 && Math.abs(windUp + act - d.keyAt) < 1e-9
        ? []
        : [d.id];
    });
    expect(wrong).toEqual([]);
  });

  it('winds a throw up for a quarter of a second or more, and settles it for longer, given its time', () => {
    const throwIt = doingOf('throw')!;
    const given = phasesMs(throwIt, throwIt.idealMs)!;
    expect(given.windUp).toBeGreaterThanOrEqual(250);
    expect(given.settle).toBeGreaterThanOrEqual(300);
    // Quickened to its least, as a crowded quiet had it, both are lost.
    const least = phasesMs(throwIt, throwIt.leastMs)!;
    expect(least.windUp).toBeLessThan(250);
    expect(least.settle).toBeLessThan(300);
    expect(phasesMs(doingOf('nod')!, 600)).toBeNull();
  });
});
