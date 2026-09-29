/**
 * Faces stay visible (studio-scenery-plan §4.4): at every moment someone
 * speaks, in every shot the camera takes then, their face is no more than
 * FACE_COVERED hidden by what stands nearer the camera than they do: the
 * set's things before the camera (its foreground layer, which the camera
 * moves farther than the people), someone standing nearer, or a feature
 * the stage draws that stands nearer.
 *
 * A face that is hidden is mended, in this order: the speaker steps a
 * little aside (a twentieth of the stage) or a little nearer or farther
 * off (a tenth of the floor), keeping the spot they stand at, a step or
 * two more where one will not do; else the one nearer steps aside or
 * back, likewise; else the thing before the camera is faded to 40%
 * while the line is said. The scenery itself is never moved. Each mend is
 * said, as a "staging:" note.
 *
 * And no one who matters at a moment (they speak, they act, or someone
 * acts toward them) is too small to see then: shorter on the screen than
 * SEEN_SMALLEST of its height, in what the camera shows, they step nearer,
 * a tenth of the floor at a time, where they stand on the open floor or
 * beside a feature (a step in front of it, they are beside it still);
 * this is looked to first, so a face is judged where they end up. One
 * under a feature, behind it or up it is left there, and said.
 */
import type { SceneEffectDto } from '../../contracts';
import {
  NO_ROOM,
  viewOf,
  wideView,
  type SetRoom,
  type View,
} from './scene-film';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A face hidden more than this is not seen. */
export const FACE_COVERED = 0.15;
/**
 * Two whose feet are nearer than this, as a share of the stage's height,
 * stand side by side: neither is in front of the other, and someone by a
 * feature stands before it. The player's DEPTH_TIE.
 */
export const DEPTH_TIE = 0.015;
/** How faint a thing before the camera is while a face behind it speaks. */
export const FADED = 0.4;
/** A step aside, as a share of the stage's width; and nearer or farther off, of the floor's depth. */
export const NUDGE_X = 0.05;
export const NUDGE_D = 0.1;
/**
 * The least share of the frame's height someone who matters at a moment
 * fills, from the top of their box to their feet, in what the camera
 * shows then. A small dog (the kit's 95 units, two fifths of a grown-up)
 * where people have always stood (0.5) fills about a quarter of it, and a
 * step nearer a little more; a step back of that (0.38, the middle of
 * three) still over a fifth; at the back of the floor (0.15) about a
 * fifth, and by a thing at the back of the set less still: too small to
 * read his face or see what he does. A child or a grown-up is about a
 * third of it or more anywhere on the floor, so is not held too small.
 */
export const SEEN_SMALLEST = 0.22;
/** As near as someone steps to be seen: where the words "in front" stand them. */
export const NEAREST_D = 0.85;

/** Where someone's face is in their box: the kit's head, high in the middle of it. */
export const faceOf = (p: Box): Box => ({
  x: p.x + p.w * 0.3,
  y: p.y + p.h * 0.03,
  w: p.w * 0.4,
  h: p.h * 0.2,
});

/**
 * A box of the stage as the camera shows it on `view`, on a layer at
 * `depth` (1: the people's own): scaled 1 + (s − 1)·depth about the point
 * the camera holds still, as the player moves each layer.
 */
export function onScreen(
  box: Box,
  view: View,
  depth: number,
  W: number,
  H: number,
  /** On a set wider than the frame, how far past it the set runs, left and right: a view past the frame is a pan (studio-scenery-plan §6.1). */
  span: readonly [number, number] = [0, 0],
): Box {
  const s = Math.max(1, view.s);
  const k = 1 + (s - 1) * depth;
  // The zoom kept inside the frame; the rest of the way across, a pan
  // each layer takes its depth's share of, never past the set's edge.
  const hw = W / (2 * s);
  const vx = Math.min(W - hw, Math.max(hw, view.x));
  const pan = Math.min(
    span[1] * k,
    Math.max(-span[0] * k, (view.x - vx) * s * depth),
  );
  if (Math.abs(s - 1) < 1e-6) return pan ? { ...box, x: box.x - pan } : box;
  const cx = (W / 2 - s * vx) / (1 - s);
  const cy = (H / 2 - s * view.y) / (1 - s);
  return {
    x: cx + k * (box.x - cx) - pan,
    y: cy + k * (box.y - cy),
    w: box.w * k,
    h: box.h * k,
  };
}

/** How much of `face` the boxes cover, 0 to 1: by points across it, so boxes that overlap count once. */
export function covered(face: Box, boxes: readonly Box[]): number {
  if (!boxes.length || face.w <= 0 || face.h <= 0) return 0;
  const nx = 10;
  const ny = 8;
  let hit = 0;
  for (let i = 0; i < nx; i += 1)
    for (let j = 0; j < ny; j += 1) {
      const x = face.x + ((i + 0.5) / nx) * face.w;
      const y = face.y + ((j + 0.5) / ny) * face.h;
      if (
        boxes.some(
          (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
        )
      )
        hit += 1;
    }
  return hit / (nx * ny);
}

/** Someone's place at a step: their box, and how far back they stand, where they stand on the floor. */
export type StandingPlace = Box & { d?: number };

export interface FacesInput {
  W: number;
  H: number;
  steps: readonly { atMs: number; show: readonly string[] }[];
  /** Each step's places, mended where they stand. */
  places: Record<string, StandingPlace>[];
  /** Each line said on the stage: who, and when. */
  lines: readonly { who: string; startMs: number; endMs: number }[];
  /** Each thing someone does, and toward whom (if anyone), and when: both matter then, and are seen. */
  acts?: readonly {
    who: string;
    toward?: string | null;
    startMs: number;
    endMs: number;
  }[];
  /** The camera's close and two shots. */
  shots: readonly SceneEffectDto[];
  /** The features the stage draws among the people: the box each fills, and its feet. */
  features: readonly { id: string; box: Box; feet: number }[];
  /** The set's things before the camera, by their groups, and how far nearer than the people their layer is. */
  fore: readonly { id: string; box: Box }[];
  foreDepth: number;
  /** Whether someone stands on the open floor at a step (a spot, a point on it): they may step nearer or farther off. */
  open: (k: number, id: string) => boolean;
  /** Whether someone too small to see at a step may step nearer: on the open floor, or beside a feature. Absent, as `open`. */
  nearer?: (k: number, id: string) => boolean;
  /** Whether someone is hidden on purpose at a step (behind a tree, under a bench): their face is theirs to hide. */
  hiding: (k: number, id: string) => boolean;
  /** Someone's place stood at depth d instead; null where they cannot be. */
  atDepth: (place: StandingPlace, d: number) => StandingPlace | null;
  name: (id: string) => string;
  durationMs: number;
  /** On a set wider than the frame, the room its camera pans in: the wide shot is on where the action is (scene-film's wideView). */
  room?: SetRoom;
}

/** What was mended: things before the camera faded while a line is said, and the notes. */
export interface FacesMended {
  fades: [number, number, string][];
  notes: string[];
}

/**
 * Every line's speaker's face kept in view, as the module says: the
 * places mended in place, the fades and the notes returned.
 */
export function keepFacesSeen(input: FacesInput): FacesMended {
  const { W, H, steps, places, room = NO_ROOM } = input;
  const fades: [number, number, string][] = [];
  const notes: string[] = [];
  const tie = H * DEPTH_TIE;
  const feetOf = (p: Box) => p.y + p.h;
  const stepEnd = (k: number) => steps[k + 1]?.atMs ?? input.durationMs;
  /** The views the camera takes on a stretch of a step: the whole stage, and each shot then. */
  const viewsAt = (k: number, from: number, to: number): View[] => [
    wideView(steps[k].show, places[k], W, H, room),
    ...input.shots
      .filter(
        (shot) => shot.atMs < to && (shot.untilMs ?? input.durationMs) > from,
      )
      .map((shot) => viewOf(shot, steps[k].show, places[k], W, H, room)),
  ];
  /** Who and what covers someone's face at a step, in one view, with what is faded left out. */
  const covers = (
    k: number,
    who: string,
    view: View,
    faded: ReadonlySet<string>,
  ): { id: string; kind: 'person' | 'feature' | 'fore'; share: number }[] => {
    const me = places[k][who];
    const face = onScreen(faceOf(me), view, 1, W, H, room.span);
    const out: {
      id: string;
      kind: 'person' | 'feature' | 'fore';
      share: number;
    }[] = [];
    for (const id of steps[k].show) {
      const other = places[k][id];
      if (id === who || !other || feetOf(other) <= feetOf(me) + tie) continue;
      const body = {
        x: other.x + other.w * 0.15,
        y: other.y,
        w: other.w * 0.7,
        h: other.h,
      };
      out.push({
        id,
        kind: 'person',
        share: covered(face, [onScreen(body, view, 1, W, H, room.span)]),
      });
    }
    for (const f of input.features)
      if (f.feet > feetOf(me) + tie)
        out.push({
          id: f.id,
          kind: 'feature',
          share: covered(face, [onScreen(f.box, view, 1, W, H, room.span)]),
        });
    for (const f of input.fore)
      if (!faded.has(f.id))
        out.push({
          id: f.id,
          kind: 'fore',
          share: covered(face, [
            onScreen(f.box, view, input.foreDepth, W, H, room.span),
          ]),
        });
    return out.filter((one) => one.share > 0);
  };
  /** How much of someone's face is hidden at a step, at worst over the views then. */
  const hidden = (
    k: number,
    who: string,
    views: readonly View[],
    faded: ReadonlySet<string>,
  ): number =>
    Math.max(
      0,
      ...views.map((view) => {
        const me = places[k][who];
        const face = onScreen(faceOf(me), view, 1, W, H, room.span);
        const boxes = covers(k, who, view, faded).map((one) => {
          if (one.kind === 'person') {
            const o = places[k][one.id];
            return onScreen(
              { x: o.x + o.w * 0.15, y: o.y, w: o.w * 0.7, h: o.h },
              view,
              1,
              W,
              H,
              room.span,
            );
          }
          if (one.kind === 'feature')
            return onScreen(
              input.features.find((f) => f.id === one.id)!.box,
              view,
              1,
              W,
              H,
              room.span,
            );
          return onScreen(
            input.fore.find((f) => f.id === one.id)!.box,
            view,
            input.foreDepth,
            W,
            H,
            room.span,
          );
        });
        return covered(face, boxes);
      }),
    );
  /** The steps either side of k where someone stands just where they do at k: moved, they move together. */
  const runOf = (k: number, id: string): number[] => {
    const same = (j: number) => {
      const a = places[j]?.[id];
      const b = places[k][id];
      return (
        a !== undefined &&
        a.x === b.x &&
        a.y === b.y &&
        a.w === b.w &&
        a.h === b.h
      );
    };
    let from = k;
    let to = k;
    while (from > 0 && same(from - 1)) from -= 1;
    while (to < steps.length - 1 && same(to + 1)) to += 1;
    return Array.from({ length: to - from + 1 }, (_, n) => from + n);
  };
  /** Someone's place over a run of steps, set to `to`; the places they had, to put back. */
  const move = (run: readonly number[], id: string, to: StandingPlace) => {
    const was = run.map((j) => places[j][id]);
    for (const j of run) places[j][id] = { ...to };
    return () => run.forEach((j, n) => (places[j][id] = was[n]));
  };
  /**
   * The places someone may step to, keeping the spot they stand at: a
   * step aside (a twentieth of the stage), then nearer or farther off (a
   * tenth of the floor); then two such steps, then three aside, the
   * smallest first.
   */
  const nudges = (
    k: number,
    id: string,
    away: number,
  ): { to: StandingPlace; how: string }[] => {
    const at = places[k][id];
    const out: { to: StandingPlace; how: string }[] = [];
    const round = (n: number) => Math.round(n * 10) / 10;
    const aside = (n: number) => {
      for (const side of away ? [away] : [1, -1]) {
        const x = at.x + side * n * W * NUDGE_X;
        if (x >= -at.w * 0.2 && x + at.w * 0.8 <= W)
          out.push({
            to: { ...at, x: round(x) },
            how: `steps ${side > 0 ? 'right' : 'left'}`,
          });
      }
    };
    const deeper = (n: number) => {
      if (!input.open(k, id) || at.d === undefined) return;
      for (const dd of away ? [-NUDGE_D] : [NUDGE_D, -NUDGE_D]) {
        const d = Math.round((at.d + n * dd) * 100) / 100;
        if (d < 0 || d > 1) continue;
        const to = input.atDepth(at, d);
        if (to) out.push({ to, how: `steps ${dd > 0 ? 'nearer' : 'back'}` });
      }
    };
    aside(1);
    deeper(1);
    aside(2);
    deeper(2);
    aside(3);
    return out;
  };

  /**
   * What the camera shows through a stretch of a step: a shot that holds
   * the whole of it alone; else the whole stage, and each shot then.
   */
  const shownAt = (k: number, from: number, to: number): View[] => {
    const shots = input.shots.filter(
      (shot) => shot.atMs < to && (shot.untilMs ?? input.durationMs) > from,
    );
    const whole = shots.find(
      (shot) => shot.atMs <= from && (shot.untilMs ?? input.durationMs) >= to,
    );
    return (whole ? [whole] : shots)
      .map((shot) => viewOf(shot, steps[k].show, places[k], W, H, room))
      .concat(whole ? [] : [wideView(steps[k].show, places[k], W, H, room)]);
  };
  /** How much of the frame's height someone fills at a step, at the least over what the camera shows; null where they are out of it. */
  const heightSeen = (k: number, who: string, views: readonly View[]) => {
    const seen = views.flatMap((view) => {
      const box = onScreen(places[k][who], view, 1, W, H, room.span);
      const middle = box.x + box.w / 2;
      return middle >= 0 && middle <= W && box.y < H ? [box.h / H] : [];
    });
    return seen.length ? Math.min(...seen) : null;
  };
  /** Each moment someone matters: speaking, doing something, or done to. */
  const moments = [
    ...input.lines.map((line) => ({ ...line, how: 'as they spoke' })),
    ...(input.acts ?? []).flatMap((act) => [
      {
        who: act.who,
        startMs: act.startMs,
        endMs: act.endMs,
        how: 'as they acted',
      },
      ...(act.toward && act.toward !== act.who
        ? [
            {
              who: act.toward,
              startMs: act.startMs,
              endMs: act.endMs,
              how: 'as someone acted toward them',
            },
          ]
        : []),
    ]),
  ].sort((a, b) => a.startMs - b.startMs);
  /** Where each one was found too small already: the first step of where they stood. */
  const smallSaid = new Set<string>();
  for (const moment of moments)
    steps.forEach((step, k) => {
      const from = Math.max(moment.startMs, step.atMs);
      const to = Math.min(moment.endMs, stepEnd(k));
      if (to <= from || !places[k]?.[moment.who]) return;
      if (!step.show.includes(moment.who) || input.hiding(k, moment.who))
        return;
      const size = () => heightSeen(k, moment.who, shownAt(k, from, to));
      const was = size();
      if (was === null || was >= SEEN_SMALLEST) return;
      const run = runOf(k, moment.who);
      const said = `${moment.who}|${run[0]}`;
      if (smallSaid.has(said)) return;
      smallSaid.add(said);
      const who = input.name(moment.who);
      const share = `${Math.round(was * 100)}% of the frame's height`;
      const at = places[k][moment.who];
      // A stage with no floor to step along: nothing to be done.
      if (at.d === undefined) return;
      if (!(input.nearer ?? input.open)(k, moment.who)) {
        notes.push(
          `staging: ${who} is small (${share}) ${moment.how}, where they stand at a feature, at its own depth; left there`,
        );
        return;
      }
      // Nearer a tenth of the floor at a time, until they are seen.
      let tries = 0;
      let back: (() => void) | null = null;
      for (
        let d = Math.round((at.d + NUDGE_D) * 100) / 100;
        d <= NEAREST_D + 1e-6;
        d = Math.round((d + NUDGE_D) * 100) / 100
      ) {
        const nearer = input.atDepth(at, d);
        if (!nearer) break;
        back?.();
        back = move(run, moment.who, nearer);
        tries += 1;
        if ((size() ?? 1) >= SEEN_SMALLEST) break;
      }
      const now = size() ?? was;
      notes.push(
        tries
          ? `staging: ${who} was small (${share}) ${moment.how}; ${who} steps nearer${tries > 1 ? ` ${tries} times` : ''}${now < SEEN_SMALLEST ? `, and is still small (${Math.round(now * 100)}%)` : ''}`
          : `staging: ${who} is small (${share}) ${moment.how}, and can come no nearer`,
      );
    });

  for (const line of input.lines) {
    steps.forEach((step, k) => {
      const from = Math.max(line.startMs, step.atMs);
      const to = Math.min(line.endMs, stepEnd(k));
      if (to <= from || !places[k]?.[line.who]) return;
      if (!step.show.includes(line.who) || input.hiding(k, line.who)) return;
      const views = viewsAt(k, from, to);
      const none = new Set<string>();
      // Judged again as each step is tried: a shot on them frames them where they now are.
      const worst = () => hidden(k, line.who, viewsAt(k, from, to), none);
      if (worst() <= FACE_COVERED) return;
      const who = input.name(line.who);
      // Which covers most, in the view it is worst in.
      const blame = views
        .flatMap((view) => covers(k, line.who, view, none))
        .sort((a, b) => b.share - a.share)[0];
      // First the speaker steps aside, or nearer or farther off.
      for (const nudge of nudges(k, line.who, 0)) {
        const back = move(runOf(k, line.who), line.who, nudge.to);
        if (worst() <= FACE_COVERED) {
          notes.push(
            `staging: ${who}'s face was hidden${blame ? ` by ${blame.kind === 'person' ? input.name(blame.id) : `the ${blame.id}`}` : ''} as they spoke; ${who} ${nudge.how}`,
          );
          return;
        }
        back();
      }
      // Then whoever stands nearer steps away from them.
      const nearer = [
        ...new Set(
          views.flatMap((view) =>
            covers(k, line.who, view, none)
              .filter((one) => one.kind === 'person')
              .map((one) => one.id),
          ),
        ),
      ];
      for (const id of nearer) {
        const at = places[k][id];
        const me = places[k][line.who];
        const away = at.x + at.w / 2 >= me.x + me.w / 2 ? 1 : (-1 as 1 | -1);
        for (const nudge of nudges(k, id, away)) {
          const back = move(runOf(k, id), id, nudge.to);
          if (worst() <= FACE_COVERED) {
            notes.push(
              `staging: ${who}'s face was hidden by ${input.name(id)} as they spoke; ${input.name(id)} ${nudge.how}`,
            );
            return;
          }
          back();
        }
      }
      // Last, what stands before the camera is faded while they speak.
      const before = [
        ...new Set(
          views.flatMap((view) =>
            covers(k, line.who, view, none)
              .filter((one) => one.kind === 'fore')
              .map((one) => one.id),
          ),
        ),
      ];
      for (const id of before) {
        fades.push([Math.round(from), Math.round(to), id]);
        none.add(id);
      }
      if (before.length)
        notes.push(
          `staging: ${who}'s face was hidden before the camera as they spoke; ${before.join(', ')} faded while they do`,
        );
      if (worst() > FACE_COVERED)
        notes.push(
          `staging: ${who}'s face stays ${Math.round(worst() * 100)}% hidden as they speak at ${Math.round(from)} ms`,
        );
    });
  }
  // One fade a stretch: those of one thing that meet are one.
  const merged: [number, number, string][] = [];
  for (const fade of [...fades].sort(
    (a, b) => a[2].localeCompare(b[2]) || a[0] - b[0],
  )) {
    const last = merged[merged.length - 1];
    if (last && last[2] === fade[2] && fade[0] <= last[1])
      last[1] = Math.max(last[1], fade[1]);
    else merged.push([...fade]);
  }
  return { fades: merged.sort((a, b) => a[0] - b[0]), notes };
}
