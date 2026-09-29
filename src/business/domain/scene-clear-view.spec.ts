/**
 * Everyone who matters in clear view (the clear-view rule), on the market
 * close-up: Kofi speaks in a close shot that pushes in and pats Bingo in
 * a two shot, with a white plastic chair, a basket, a fruit cart and a
 * blue water drum before the camera.
 */
import type { SceneDto } from '../../contracts';
import {
  BODY_CLEAR,
  FACE_CLEAR,
  PUSHED_LEAST,
  PUSHED_MOST,
  SMALL_CLEAR,
  bodyOf,
  covered,
  faceOf,
  keepInClearView,
  onScreen,
  wholeOf,
  type ClearInput,
} from './scene-faces-seen';
import { floorFactor, viewOf, wideView, type View } from './scene-film';
import { fadeAt } from './scene-still';
import { FORE_EDGE, SET_W } from './scene-set-layout';
import {
  marketFore,
  marketInput,
  marketSet,
} from './studio/__fixtures__/market';

jest.setTimeout(60_000);

/** The painter's things before the camera as they stood before the rule: across the middle of the frame's foot. */
const ACROSS = [
  { id: 'fg-1', box: { x: 150, y: 640, w: 220, h: 300 } },
  { id: 'fg-2', box: { x: 420, y: 700, w: 260, h: 220 } },
  { id: 'fg-3', box: { x: 600, y: 630, w: 380, h: 300 } },
  { id: 'fg-4', box: { x: 1050, y: 650, w: 200, h: 280 } },
];

/** Who matters at `t`: Kofi while he speaks and acts, Bingo all the while. */
const mattersAt = (t: number) => [
  ...((t >= 1000 && t < 3200) || (t >= 3600 && t < 5200) ? ['kofi'] : []),
  'bingo',
];

/**
 * The worst each one who matters is covered at `t`, in every view the
 * camera may take then (the shot on then, framed and pushed in as far as
 * it goes; else the wide shot), with each thing as faded as it is then:
 * one faded below half is seen through.
 */
function worstAt(input: ClearInput, fades: SceneDto['setting'], t: number) {
  const { W, H } = input;
  const places = input.places[0];
  const show = input.steps[0].show;
  const shot = input.shots.find(
    (one) => one.atMs <= t && t < (one.untilMs ?? input.durationMs),
  );
  const base = shot
    ? viewOf(shot, show, places, W, H, input.room)
    : wideView(show, places, W, H, input.room);
  const push = shot
    ? shot.pan === 'push'
      ? PUSHED_MOST
      : PUSHED_LEAST
    : PUSHED_LEAST;
  const views: View[] = [base, { ...base, s: base.s * push }];
  const scene = { setting: fades } as unknown as SceneDto;
  const seen = input.fore.filter((f) => fadeAt(scene, f.id, t) > 0.5);
  return mattersAt(t).map((who) => {
    const me = places[who];
    const worst = { who, face: 0, body: 0, whole: 0 };
    for (const view of views) {
      const at = onScreen(
        me,
        view,
        floorFactor(me.y + me.h, input.floor),
        W,
        H,
        input.room?.span,
      );
      const boxes = seen.map((f) =>
        onScreen(f.box, view, input.foreDepth, W, H, input.room?.span),
      );
      worst.face = Math.max(
        worst.face,
        input.face(who) ? covered(faceOf(at), boxes) : 0,
      );
      worst.body = Math.max(worst.body, covered(bodyOf(at), boxes));
      worst.whole = Math.max(worst.whole, covered(wholeOf(at), boxes));
    }
    return worst;
  });
}

const clear = (w: { who: string; face: number; body: number; whole: number }) =>
  w.face <= FACE_CLEAR + 1e-9 &&
  (w.who === 'bingo'
    ? w.whole <= SMALL_CLEAR + 1e-9
    : w.body <= BODY_CLEAR + 1e-9);

const moments = Array.from({ length: 121 }, (_, i) => i * 50);

describe('the market close-up', () => {
  it('builds the things before the camera at the frame’s edges, every one kept', () => {
    const set = marketSet();
    const near = set.placed.filter((p) => p.band === 'foreground');
    // The chair, the basket, the cart and the drum: none left out.
    expect(near.map((p) => p.kind).sort()).toEqual(
      ['basket', 'cart', 'plastic chair', 'water drum'].sort(),
    );
    for (const p of near) {
      const [a, , w] = p.box;
      const left = a + w / 2 < SET_W / 2;
      if (left) expect(a + w).toBeLessThanOrEqual(FORE_EDGE * SET_W + 0.5);
      else expect(a).toBeGreaterThanOrEqual((1 - FORE_EDGE) * SET_W - 0.5);
    }
  });

  it('hides Kofi and Bingo with the things across the middle, until they are mended; then both are clear at every moment of every shot', () => {
    const input = marketInput(undefined, ACROSS);
    const before = moments.flatMap((t) => worstAt(input, undefined, t));
    expect(before.some((w) => !clear(w))).toBe(true);
    const { fades, notes } = keepInClearView(input);
    const setting = { fades } as SceneDto['setting'];
    for (const t of moments)
      for (const w of worstAt(input, setting, t))
        expect({ t, ...w, clear: clear(w) }).toEqual({ t, ...w, clear: true });
    expect(notes.every((n) => n.startsWith('staging: hidden '))).toBe(true);
    // Cheated out only for the shots' length (two a moment apart as one),
    // never in the wide shot.
    for (const [from, to, , level] of fades)
      if (level === 0) {
        expect(input.shots.some((s) => s.atMs === from)).toBe(true);
        expect(input.shots.some((s) => s.untilMs === to)).toBe(true);
      }
  });

  it('keeps the wide shot’s clutter, and cheats a near thing out of a close shot that a push brings across Kofi', () => {
    const set = marketSet();
    const input = marketInput(set);
    const { fades } = keepInClearView(input);
    for (const t of moments)
      for (const w of worstAt(input, { fades }, t))
        expect({ t, ...w, clear: clear(w) }).toEqual({ t, ...w, clear: true });
    // Nothing faded where the wide shot is on: before and after the shots.
    const scene = { setting: { fades } } as unknown as SceneDto;
    for (const t of [0, 500, 5600])
      for (const f of marketFore(set)) expect(fadeAt(scene, f.id, t)).toBe(1);
    // The people watching are cheated out of the shots they cross, and
    // never faded in the wide shot.
    const au = fades.filter(([, , id]) => id.startsWith('fg-au'));
    expect(au.length).toBeGreaterThan(0);
    for (const [from, to] of au)
      expect(
        input.shots.some(
          (s) => s.atMs <= from && to <= (s.untilMs ?? input.durationMs),
        ),
      ).toBe(true);
    // In the close shot, what crosses Kofi is gone.
    expect(
      fades.some(([from, , , level]) => from === 1000 && level === 0),
    ).toBe(true);
  });

  it('never pops anything mid-line: each fade eases in and out', () => {
    const input = marketInput(undefined, ACROSS);
    const { fades } = keepInClearView(input);
    const scene = { setting: { fades } } as unknown as SceneDto;
    for (const f of ACROSS) {
      let last = fadeAt(scene, f.id, -300);
      for (let t = -290; t <= 6300; t += 10) {
        const now = fadeAt(scene, f.id, t);
        expect(Math.abs(now - last)).toBeLessThan(0.05);
        last = now;
      }
    }
  });
});
