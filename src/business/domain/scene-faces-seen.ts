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
  floorFactor,
  isReverse,
  nearOf,
  reflectPlace,
  viewOf,
  wideView,
  type SetRoom,
  type View,
} from './scene-film';
import { BODY_SHARE, SAME_ROW_D } from './scene-spacing';

/**
 * A view the camera takes, and whom its shot cheats near the camera (over
 * whose shoulder it looks, or who stands near in deep staging): where
 * they stand for it. That one is the shot's own, never judged in it; they
 * stand before everyone else in it.
 */
type Framed = View & {
  near?: { id: string; place: Box };
  /** Taken from the place's other side (studio-views-plan §4.2): the stage reflected, the other side's things. */
  reverse?: true;
};

/** A shot's view, with whom it cheats near the camera. */
function framedBy(
  shot: SceneEffectDto,
  show: readonly string[],
  places: Record<string, Box>,
  W: number,
  H: number,
  room: SetRoom,
): Framed {
  const view = viewOf(shot, show, places, W, H, room);
  const near = nearOf(shot, show, places, W, H, room);
  return {
    ...view,
    ...(near ? { near: { id: near.id, place: near.place } } : {}),
    ...(isReverse(shot) ? { reverse: true as const } : {}),
  };
}

/** The set's other side as the checks judge a shot from there: its things before the camera and on its floor, on the stage (as the front's are given). */
export interface ReverseSide {
  fore: readonly { id: string; box: Box }[];
  foreDepth: number;
  floorThings?: readonly { id: string; box: Box; feet: number }[];
}

/**
 * What a view shows, from the front or the place's other side: where
 * someone at `box` on the stage is in it (reflected, turned round), the
 * room its camera pans in, and the set's things before the camera and on
 * its floor.
 */
function sideIn(
  view: Framed,
  W: number,
  room: SetRoom,
  front: ReverseSide,
  reverse: ReverseSide | undefined,
) {
  const turned = view.reverse === true;
  return {
    at: <T extends Box>(box: T): T => (turned ? reflectPlace(box, W) : box),
    span: (turned ? [room.span[1], room.span[0]] : room.span) as readonly [
      number,
      number,
    ],
    set: turned ? (reverse ?? { fore: [], foreDepth: front.foreDepth }) : front,
  };
}

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
  /** The set's other side, for a shot taken from there (studio-views-plan §4.2): its things, on the stage. Absent, none. */
  reverse?: ReverseSide;
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
  const viewsAt = (k: number, from: number, to: number): Framed[] => [
    wideView(steps[k].show, places[k], W, H, room),
    ...input.shots
      .filter(
        (shot) => shot.atMs < to && (shot.untilMs ?? input.durationMs) > from,
      )
      .map((shot) => framedBy(shot, steps[k].show, places[k], W, H, room)),
  ];
  const front: ReverseSide = { fore: input.fore, foreDepth: input.foreDepth };
  const side = (view: Framed) => sideIn(view, W, room, front, input.reverse);
  /** Where someone stands in a view: cheated near the camera, or at their place (reflected, turned round). */
  const placeIn = (k: number, id: string, view: Framed) =>
    view.near?.id === id
      ? view.near.place
      : places[k][id] && side(view).at(places[k][id]);
  /** Who and what covers someone's face at a step, in one view, with what is faded left out. */
  const covers = (
    k: number,
    who: string,
    view: Framed,
    faded: ReadonlySet<string>,
  ): { id: string; kind: 'person' | 'feature' | 'fore'; share: number }[] => {
    // The one a shot cheats near the camera is its own: not judged in it.
    if (view.near?.id === who) return [];
    const { at, span, set } = side(view);
    const me = placeIn(k, who, view);
    const face = onScreen(faceOf(me), view, 1, W, H, span);
    const out: {
      id: string;
      kind: 'person' | 'feature' | 'fore';
      share: number;
    }[] = [];
    for (const id of steps[k].show) {
      const other = placeIn(k, id, view);
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
        share: covered(face, [onScreen(body, view, 1, W, H, span)]),
      });
    }
    for (const f of input.features)
      if (f.feet > feetOf(me) + tie)
        out.push({
          id: f.id,
          kind: 'feature',
          share: covered(face, [onScreen(at(f.box), view, 1, W, H, span)]),
        });
    for (const f of set.fore)
      if (!faded.has(f.id))
        out.push({
          id: f.id,
          kind: 'fore',
          share: covered(face, [
            onScreen(f.box, view, set.foreDepth, W, H, span),
          ]),
        });
    return out.filter((one) => one.share > 0);
  };
  /** How much of someone's face is hidden at a step, at worst over the views then. */
  const hidden = (
    k: number,
    who: string,
    views: readonly Framed[],
    faded: ReadonlySet<string>,
  ): number =>
    Math.max(
      0,
      ...views.map((view) => {
        const { at, span, set } = side(view);
        const me = placeIn(k, who, view);
        const face = onScreen(faceOf(me), view, 1, W, H, span);
        const boxes = covers(k, who, view, faded).map((one) => {
          if (one.kind === 'person') {
            const o = placeIn(k, one.id, view);
            return onScreen(
              { x: o.x + o.w * 0.15, y: o.y, w: o.w * 0.7, h: o.h },
              view,
              1,
              W,
              H,
              span,
            );
          }
          if (one.kind === 'feature')
            return onScreen(
              at(input.features.find((f) => f.id === one.id)!.box),
              view,
              1,
              W,
              H,
              span,
            );
          return onScreen(
            set.fore.find((f) => f.id === one.id)!.box,
            view,
            set.foreDepth,
            W,
            H,
            span,
          );
        });
        return covered(face, boxes);
      }),
    );
  const runOf = (k: number, id: string) => runIn(places, steps.length, k, id);
  const move = (run: readonly number[], id: string, to: StandingPlace) =>
    moveIn(places, run, id, to);
  const showAt = (j: number) => steps[j]?.show ?? [];
  // A step that would put them in someone's body is never taken.
  const nudges = (k: number, id: string, away: number) =>
    nudgesIn(places[k][id], W, away, input.open(k, id), input.atDepth).filter(
      (nudge) => !bumpsInto(places, showAt, runOf(k, id), id, nudge.to),
    );

  /**
   * What the camera shows through a stretch of a step: a shot that holds
   * the whole of it alone; else the whole stage, and each shot then.
   */
  const shownAt = (k: number, from: number, to: number): Framed[] => {
    const shots = input.shots.filter(
      (shot) => shot.atMs < to && (shot.untilMs ?? input.durationMs) > from,
    );
    const whole = shots.find(
      (shot) => shot.atMs <= from && (shot.untilMs ?? input.durationMs) >= to,
    );
    return (whole ? [whole] : shots)
      .map((shot) => framedBy(shot, steps[k].show, places[k], W, H, room))
      .concat(whole ? [] : [wideView(steps[k].show, places[k], W, H, room)]);
  };
  /** How much of the frame's height someone fills at a step, at the least over what the camera shows; null where they are out of it. */
  const heightSeen = (k: number, who: string, views: readonly Framed[]) => {
    const seen = views.flatMap((view) => {
      const box = onScreen(
        placeIn(k, who, view),
        view,
        1,
        W,
        H,
        side(view).span,
      );
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
        // Never nearer into someone's body.
        if (bumpsInto(places, showAt, run, moment.who, nearer)) break;
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

/** The steps either side of k where someone stands just where they do at k: moved, they move together. */
function runIn(
  places: Record<string, StandingPlace>[],
  count: number,
  k: number,
  id: string,
): number[] {
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
  while (to < count - 1 && same(to + 1)) to += 1;
  return Array.from({ length: to - from + 1 }, (_, n) => from + n);
}

/**
 * Who someone at `to` would stand in the body of, over a run of steps: a
 * person in one row with them, their bodies meeting (scene-spacing). A
 * nudge that brings in someone new is not taken: a face is never made
 * seen by standing in another's body.
 */
function bodiesMet(
  places: Record<string, StandingPlace>[],
  show: (j: number) => readonly string[],
  run: readonly number[],
  id: string,
  to: StandingPlace,
): Set<string> {
  const out = new Set<string>();
  for (const j of run)
    for (const other of show(j)) {
      const p = places[j]?.[other];
      if (other === id || !p) continue;
      if (Math.abs((p.d ?? 0.5) - (to.d ?? 0.5)) >= SAME_ROW_D) continue;
      const apart = Math.abs(p.x + p.w / 2 - (to.x + to.w / 2));
      if (apart < (p.w + to.w) * BODY_SHARE * 0.95) out.add(other);
    }
  return out;
}

/** Whether a nudge over a run brings someone into another's body who was not before. */
function bumpsInto(
  places: Record<string, StandingPlace>[],
  show: (j: number) => readonly string[],
  run: readonly number[],
  id: string,
  to: StandingPlace,
): boolean {
  const now = bodiesMet(places, show, run, id, places[run[0]]?.[id] ?? to);
  return [...bodiesMet(places, show, run, id, to)].some((o) => !now.has(o));
}

/** Someone's place over a run of steps, set to `to`; the places they had, to put back. */
function moveIn(
  places: Record<string, StandingPlace>[],
  run: readonly number[],
  id: string,
  to: StandingPlace,
): () => void {
  const was = run.map((j) => places[j][id]);
  for (const j of run) places[j][id] = { ...to };
  return () => run.forEach((j, n) => (places[j][id] = was[n]));
}

/**
 * The places someone may step to, keeping the spot they stand at: a
 * step aside (a twentieth of the stage), then nearer or farther off (a
 * tenth of the floor, on the open floor); then two such steps, then three
 * aside, the smallest first. `away`: only that way aside, and only back.
 */
function nudgesIn(
  at: StandingPlace,
  W: number,
  away: number,
  open: boolean,
  atDepth: (place: StandingPlace, d: number) => StandingPlace | null,
): { to: StandingPlace; how: string }[] {
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
    if (!open || at.d === undefined) return;
    for (const dd of away ? [-NUDGE_D] : [NUDGE_D, -NUDGE_D]) {
      const d = Math.round((at.d + n * dd) * 100) / 100;
      if (d < 0 || d > 1) continue;
      const to = atDepth(at, d);
      if (to) out.push({ to, how: `steps ${dd > 0 ? 'nearer' : 'back'}` });
    }
  };
  aside(1);
  deeper(1);
  aside(2);
  deeper(2);
  aside(3);
  return out;
}

// ── Clear view ────────────────────────────────────────────────────────────

/**
 * Everyone who matters in clear view (the clear-view rule): at every
 * moment the camera takes, wide, close, two and pushed in, no thing of
 * the place hides them, only people may stand before people. Who matters:
 * whoever speaks, acts or is acted toward then, and every animal on the
 * stage all the while it is there. Their face is at most FACE_CLEAR
 * covered; their body at most BODY_CLEAR; a small one (a dog, a kitten)
 * or an animal at least 1 − SMALL_CLEAR seen.
 *
 * What covers them is what stands nearer the camera: the set's things
 * before the camera (its foreground layer, at its depth), the things of
 * its floor layer and the features the stage draws whose feet are nearer
 * than theirs, each moved by the camera as far as its depth on the floor
 * says (floorFactor), as the player moves it.
 *
 * Mended as films do, quietly, in this order: in a close, two or pushed
 * shot, the near things that cross them fade out for the shot's length
 * (a quick ease, never a pop: the player's own fade), and come back as
 * it ends; else they step aside, or nearer or farther off, as the faces'
 * check steps them; else the shot does not push in, and else it is not
 * taken (the wide shot instead). In the wide shot, whose things are kept
 * clear of the people where the set is built (keepForeToEdges), a step
 * aside, and last a fade to FADED while they matter. Each mend said, as
 * a "staging: hidden" note.
 */
export const FACE_CLEAR = 0.1;
export const BODY_CLEAR = 0.35;
export const SMALL_CLEAR = 0.3;
/** How much further in than its framing the player's camera may be at its fullest, a shot that pushes and any other: its slow push, the lean toward whoever speaks and a feeling's push, all at once. */
export const PUSHED_MOST = 1.07 * 1.03 * 1.06;
export const PUSHED_LEAST = 1.025 * 1.03 * 1.06;
/** Two fades of one thing nearer than this are one: it would only come back to go again. */
export const FADE_GAP_MS = 500;
/** A near thing crossing this much of someone in a shot is cheated out of it. */
export const CROSSES = 0.05;

/** Where someone's body is in their box: the kit's shoulders to its feet, its middle three fifths across. */
export const bodyOf = (p: Box): Box => ({
  x: p.x + p.w * 0.2,
  y: p.y + p.h * 0.12,
  w: p.w * 0.6,
  h: p.h * 0.86,
});
/** A small one's or an animal's whole, but for the frame's edges. */
export const wholeOf = (p: Box): Box => ({
  x: p.x + p.w * 0.1,
  y: p.y + p.h * 0.1,
  w: p.w * 0.8,
  h: p.h * 0.88,
});

export interface ClearInput extends Omit<
  FacesInput,
  'fore' | 'foreDepth' | 'features' | 'shots'
> {
  /** The camera's close and two shots: one that cannot be taken clear is taken out of this list. */
  shots: SceneEffectDto[];
  features: readonly { id: string; box: Box; feet: number }[];
  fore: readonly { id: string; box: Box }[];
  foreDepth: number;
  /** The things of the set's floor layer, by their groups: each box, and where its feet are. */
  floorThings?: readonly { id: string; box: Box; feet: number }[];
  /** The floor, its back and front edges on the stage: what stands on it moves by its depth there. Absent, as the people. */
  floor?: readonly [number, number] | null;
  /** An animal (or a creature): protected all the while it is on the stage. */
  animal: (id: string) => boolean;
  /** Small: judged by how much of it is seen. */
  small: (id: string) => boolean;
  /** Whether someone has a face the kit draws (a person). */
  face: (id: string) => boolean;
  /** A thing before the camera never faded in the wide shot (the people watching): there the one it hides steps aside instead; in any other shot it is cheated out like the rest. */
  keep?: (id: string) => boolean;
  /** Fades already planned (a face's): kept, and judged with. */
  fades?: readonly [number, number, string, number?][];
}

export interface ClearMended {
  /** From, to, the group, how faint (0: gone). */
  fades: [number, number, string, number][];
  notes: string[];
}

/** A view the camera takes, and the shot it is (null: the wide shot). */
interface Seen {
  view: Framed;
  shot: SceneEffectDto | null;
}

/** How much of someone is covered at worst: their face, their body, and (small) the whole of them, 0 to 1 each. */
export interface Cover {
  face: number;
  body: number;
  whole: number;
}

/**
 * Everyone who matters in clear view, as the section says: the places
 * mended in place, the shots that cannot be taken clear taken out of
 * `shots` (or their push dropped), the fades and the notes returned.
 */
export function keepInClearView(input: ClearInput): ClearMended {
  const { W, H, steps, places, room = NO_ROOM } = input;
  const tie = H * DEPTH_TIE;
  const notes: string[] = [];
  const fades: [number, number, string, number][] = [];
  const stepEnd = (k: number) => steps[k + 1]?.atMs ?? input.durationMs;
  const shotEnd = (shot: SceneEffectDto) =>
    shot.untilMs ??
    steps.find((s) => s.atMs > shot.atMs)?.atMs ??
    input.durationMs;
  const depthOf = (feet: number) => floorFactor(feet, input.floor);
  const front: ReverseSide = {
    fore: input.fore,
    foreDepth: input.foreDepth,
    ...(input.floorThings ? { floorThings: input.floorThings } : {}),
  };
  const side = (view: Framed) => sideIn(view, W, room, front, input.reverse);
  /** Where someone stands in a view: cheated near the camera, or at their place (reflected, turned round). */
  const placeIn = (k: number, id: string, view: Framed) =>
    view.near?.id === id
      ? view.near.place
      : places[k][id] && side(view).at(places[k][id]);
  /** What may be cheated out of a shot: every thing before the camera or on the floor, on either side. */
  const fadeable = new Set([
    ...input.fore.map((f) => f.id),
    ...(input.floorThings ?? []).map((f) => f.id),
    ...(input.reverse?.fore ?? []).map((f) => f.id),
    ...(input.reverse?.floorThings ?? []).map((f) => f.id),
  ]);
  /** What may be faded in the wide shot: the people watching are kept there. */
  const fadeableWide = new Set([...fadeable].filter((id) => !input.keep?.(id)));
  /** Whether a group is faded out over the whole of from..to. */
  const fadedOver = (id: string, from: number, to: number) =>
    [...(input.fades ?? []), ...fades].some(
      ([a, b, which, level]) =>
        which === id && a <= from && b >= to && (level ?? FADED) <= FADED,
    );
  /**
   * The views the camera takes over from..to at step k: each shot on then,
   * framed and at its fullest push; and the wide shot, unless a shot holds
   * the whole stretch.
   */
  const viewsAt = (k: number, from: number, to: number): Seen[] => {
    const wide = wideView(steps[k].show, places[k], W, H, room);
    const on = input.shots.filter(
      (shot) => shot.atMs < to && shotEnd(shot) > from,
    );
    const whole = on.some((shot) => shot.atMs <= from && shotEnd(shot) >= to);
    const out: Seen[] = whole
      ? []
      : [
          { view: wide, shot: null },
          { view: { ...wide, s: wide.s * PUSHED_LEAST }, shot: null },
        ];
    for (const shot of on) {
      const view = framedBy(shot, steps[k].show, places[k], W, H, room);
      out.push(
        { view, shot },
        {
          view: {
            ...view,
            s: view.s * (shot.pan === 'push' ? PUSHED_MOST : PUSHED_LEAST),
          },
          shot,
        },
      );
    }
    return out;
  };
  /** What stands nearer than someone at step k, as the camera on `seen` shows it: each thing, its box on the screen, and whether it can fade. */
  const nearer = (
    k: number,
    who: string,
    seen: Seen,
    from: number,
    to: number,
  ) => {
    const { at, span, set } = side(seen.view);
    const me = places[k][who];
    const feet = me.y + me.h;
    const [a, b] = seen.shot
      ? [Math.max(from, seen.shot.atMs), Math.min(to, shotEnd(seen.shot))]
      : [from, to];
    const out: { id: string; box: Box; fades: boolean }[] = [];
    for (const f of set.fore)
      if (!fadedOver(f.id, a, b))
        out.push({
          id: f.id,
          box: onScreen(f.box, seen.view, set.foreDepth, W, H, span),
          fades: true,
        });
    // A thing of the floor layer stands tall at the frame's edge (a palm,
    // a lamppost): its trunk or post, its middle two fifths, is what
    // stands before anyone; its crown is over their heads.
    for (const f of set.floorThings ?? [])
      if (f.feet > feet + tie && !fadedOver(f.id, a, b))
        out.push({
          id: f.id,
          box: onScreen(
            { ...f.box, x: f.box.x + f.box.w * 0.3, w: f.box.w * 0.4 },
            seen.view,
            depthOf(f.feet),
            W,
            H,
            span,
          ),
          fades: true,
        });
    for (const f of input.features)
      if (f.feet > feet + tie)
        out.push({
          id: f.id,
          box: onScreen(at(f.box), seen.view, depthOf(f.feet), W, H, span),
          fades: false,
        });
    // Whom the shot cheats near the camera, before everyone: their body.
    const near = seen.view.near;
    if (near && near.id !== who)
      out.push({
        id: near.id,
        box: onScreen(bodyOf(near.place), seen.view, 1, W, H, span),
        fades: false,
      });
    return out;
  };
  /** How much of someone the things nearer cover in one view. */
  const coverIn = (
    k: number,
    who: string,
    seen: Seen,
    from: number,
    to: number,
  ): Cover & { by: { id: string; fades: boolean; share: number }[] } => {
    // The one the shot cheats near the camera is its own: not judged in it.
    if (seen.view.near?.id === who)
      return { face: 0, body: 0, whole: 0, by: [] };
    const me = placeIn(k, who, seen.view);
    const at = onScreen(
      me,
      seen.view,
      depthOf(me.y + me.h),
      W,
      H,
      side(seen.view).span,
    );
    const things = nearer(k, who, seen, from, to);
    const boxes = things.map((t) => t.box);
    const whole = wholeOf(at);
    return {
      face: input.face(who) ? covered(faceOf(at), boxes) : 0,
      body: covered(bodyOf(at), boxes),
      whole: covered(whole, boxes),
      by: things.flatMap((t) => {
        const share = covered(whole, [t.box]);
        return share > 0 ? [{ ...t, share }] : [];
      }),
    };
  };
  const tooHidden = (who: string, c: Cover) =>
    c.face > FACE_CLEAR ||
    (input.small(who) || input.animal(who)
      ? c.whole > SMALL_CLEAR
      : c.body > BODY_CLEAR);
  const say = (c: Cover) =>
    `face ${Math.round(c.face * 100)}%, body ${Math.round(c.body * 100)}%, whole ${Math.round(c.whole * 100)}% covered`;
  /** The views someone is too hidden in over a stretch, with how. */
  const hiddenIn = (k: number, who: string, from: number, to: number) =>
    viewsAt(k, from, to).flatMap((seen) => {
      const c = coverIn(k, who, seen, from, to);
      return tooHidden(who, c) ? [{ seen, c }] : [];
    });

  // Who matters, and when: each line, each act and whoever it is toward;
  // and each animal all the while it is on the stage.
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
    ...steps.flatMap((step, k) =>
      step.show
        .filter((id) => input.animal(id))
        .map((id) => ({
          who: id,
          startMs: step.atMs,
          endMs: stepEnd(k),
          how: 'while on the stage',
        })),
    ),
  ].sort((a, b) => a.startMs - b.startMs);

  /**
   * How many faces are hidden by those standing nearer at step j, in the
   * wide shot or any shot then: a step aside that hides one more (theirs
   * or anyone's) is no step.
   */
  const facesHiddenAt = (j: number): number => {
    const from = steps[j].atMs;
    const to = stepEnd(j);
    const views: Framed[] = [
      wideView(steps[j].show, places[j], W, H, room),
      { s: 1, x: W / 2, y: H / 2 },
      ...input.shots
        .filter((shot) => shot.atMs < to && shotEnd(shot) > from)
        .map((shot) => {
          const view: Framed = viewOf(
            shot,
            steps[j].show,
            places[j],
            W,
            H,
            room,
          );
          return isReverse(shot) ? { ...view, reverse: true as const } : view;
        }),
    ];
    let n = 0;
    for (const id of steps[j].show) {
      if (!places[j][id] || !input.face(id)) continue;
      for (const other of steps[j].show) {
        const o0 = places[j][other];
        const me0 = places[j][id];
        if (other === id || !o0 || o0.y + o0.h <= me0.y + me0.h + tie) continue;
        if (
          views.some((view) => {
            const { at, span } = side(view);
            const me = at(me0);
            const o = at(o0);
            const body = { x: o.x + o.w * 0.15, y: o.y, w: o.w * 0.7, h: o.h };
            return (
              covered(faceOf(onScreen(me, view, 1, W, H, span)), [
                onScreen(body, view, 1, W, H, span),
              ]) > FACE_CLEAR
            );
          })
        )
          n += 1;
      }
    }
    return n;
  };
  /** A stretch cut where a shot begins or ends: each piece in one shot, or in the wide shot, throughout. */
  const piecesOf = (from: number, to: number): [number, number][] => {
    const cuts = [
      ...new Set([
        from,
        ...input.shots.flatMap((shot) => [shot.atMs, shotEnd(shot)]),
        to,
      ]),
    ]
      .filter((t) => t >= from && t <= to)
      .sort((a, b) => a - b);
    return cuts
      .slice(1)
      .flatMap((t, i): [number, number][] =>
        t - cuts[i] >= 1 ? [[cuts[i], t]] : [],
      );
  };
  for (const moment of moments)
    steps.forEach((step, k) => {
      const who = moment.who;
      if (!places[k]?.[who] || !step.show.includes(who)) return;
      if (input.hiding(k, who)) return;
      for (const [from, to] of piecesOf(
        Math.max(moment.startMs, step.atMs),
        Math.min(moment.endMs, stepEnd(k)),
      ))
        mend(k, who, from, to, moment.how);
    });
  /** Someone who matters over from..to at step k kept in clear view, as the section says. */
  function mend(k: number, who: string, from: number, to: number, how: string) {
    {
      const moment = { how };
      const name = input.name(who);
      // 1. In a close, two or pushed shot, a near thing that crosses them
      // fades for the shot's length, as a film cheats it out of the frame,
      // hidden or not yet.
      const faded: string[] = [];
      let crossed: Cover | null = null;
      for (const seen of viewsAt(k, from, to)) {
        if (!seen.shot) continue;
        const c = coverIn(k, who, seen, from, to);
        for (const one of c.by) {
          if (!one.fades || !fadeable.has(one.id) || one.share < CROSSES)
            continue;
          // Over the crowd, the people watching are the shot's own: kept.
          if (input.keep?.(one.id) && seen.shot.shot?.kind === 'crowd')
            continue;
          const span: [number, number] = [
            Math.round(seen.shot.atMs),
            Math.round(shotEnd(seen.shot)),
          ];
          if (fadedOver(one.id, span[0], span[1])) continue;
          crossed ??= c;
          fades.push([span[0], span[1], one.id, 0]);
          faded.push(one.id);
        }
      }
      if (crossed)
        notes.push(
          `staging: hidden ${name} ${moment.how} (${say(crossed)}); ${[...new Set(faded)].join(', ')} faded for the shot`,
        );
      let bad = hiddenIn(k, who, from, to);
      if (!bad.length) return;
      // 2. They step aside, or nearer or farther off.
      const run = runIn(places, steps.length, k, who);
      for (const nudge of nudgesIn(
        places[k][who],
        W,
        0,
        input.open(k, who),
        input.atDepth,
      ).filter(
        (one) =>
          !bumpsInto(places, (j) => steps[j]?.show ?? [], run, who, one.to),
      )) {
        const was = run.map((j) => facesHiddenAt(j));
        const back = moveIn(places, run, who, nudge.to);
        if (
          !hiddenIn(k, who, from, to).length &&
          run.every((j, n) => facesHiddenAt(j) <= was[n])
        ) {
          notes.push(
            `staging: hidden ${name} ${moment.how} (${say(bad[0].c)}); ${name} ${nudge.how}`,
          );
          return;
        }
        back();
      }
      // 3. The camera: a shot that pushes does not, and then one that
      // still hides them is not taken.
      for (const { seen } of bad) {
        const shot = seen.shot;
        if (!shot || !input.shots.includes(shot)) continue;
        if (shot.pan === 'push') {
          delete shot.pan;
          if (
            !hiddenIn(k, who, from, to).some((one) => one.seen.shot === shot)
          ) {
            notes.push(
              `staging: hidden ${name} ${moment.how} in a shot that pushed in; it does not push`,
            );
            continue;
          }
        }
        input.shots.splice(input.shots.indexOf(shot), 1);
        // What was cheated out of it comes back: the wide shot keeps it.
        for (let i = fades.length - 1; i >= 0; i -= 1)
          if (
            fades[i][3] === 0 &&
            fades[i][0] === Math.round(shot.atMs) &&
            fades[i][1] === Math.round(shotEnd(shot))
          )
            fades.splice(i, 1);
        notes.push(
          `staging: hidden ${name} ${moment.how} in a shot at ${Math.round(shot.atMs)} ms; the wide shot instead`,
        );
      }
      bad = hiddenIn(k, who, from, to);
      if (!bad.length) return;
      // 4. The wide shot: what can fade, faded while they matter.
      const last: string[] = [];
      for (const { seen } of bad)
        for (const one of coverIn(k, who, seen, from, to).by)
          if (one.fades && fadeableWide.has(one.id) && !last.includes(one.id)) {
            fades.push([Math.round(from), Math.round(to), one.id, FADED]);
            last.push(one.id);
          }
      bad = hiddenIn(k, who, from, to);
      notes.push(
        last.length
          ? `staging: hidden ${name} ${moment.how}; ${last.join(', ')} faded while they do${bad.length ? `, and still ${say(bad[0].c)}` : ''}`
          : `staging: hidden ${name} ${moment.how}, and stays so (${say(bad[0].c)})`,
      );
    }
  }
  // One fade a stretch: those of one thing at one level that meet are
  // one, and those too near to come back between (two shots a moment
  // apart): it is not seen to flicker.
  const merged: [number, number, string, number][] = [];
  for (const fade of [...fades].sort(
    (a, b) => a[2].localeCompare(b[2]) || a[3] - b[3] || a[0] - b[0],
  )) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last[2] === fade[2] &&
      last[3] === fade[3] &&
      // The people watching are kept in the wide shot, however short.
      fade[0] <= last[1] + (input.keep?.(fade[2]) ? 0 : FADE_GAP_MS)
    )
      last[1] = Math.max(last[1], fade[1]);
    else merged.push([...fade]);
  }
  return { fades: merged.sort((a, b) => a[0] - b[0]), notes };
}

/**
 * The fades that cheat a thing out of a shot (level 0) fitted to the
 * shots as they are finally taken (after jump cuts are joined and walks
 * given room): each kept only where a shot is on, cut where one ends, and
 * gone with a shot not taken; so nothing is cheated out of the wide shot.
 * Every other fade as it was.
 */
export function fitCheatsToShots(
  fades: readonly [number, number, string, number?][],
  shots: readonly SceneEffectDto[],
  steps: readonly { atMs: number }[],
  durationMs: number,
  /** A thing a shot keeps, never cheated out of it: the people watching, over whom a crowd's shot looks. */
  keeps: (id: string, shot: SceneEffectDto) => boolean = () => false,
): [number, number, string, number?][] {
  const endOf = (shot: SceneEffectDto) =>
    shot.untilMs ?? steps.find((s) => s.atMs > shot.atMs)?.atMs ?? durationMs;
  /** The shots one straight after another as one stretch, but those keeping `id`. */
  const stretches = (id: string): [number, number][] => {
    const spans = shots
      .filter((shot) => !keeps(id, shot))
      .map((shot): [number, number] => [shot.atMs, endOf(shot)])
      .sort((a, b) => a[0] - b[0]);
    const joined: [number, number][] = [];
    for (const [a, b] of spans) {
      const last = joined[joined.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else joined.push([a, b]);
    }
    return joined;
  };
  return fades.flatMap((fade): [number, number, string, number?][] => {
    if (fade[3] !== 0) return [fade];
    return stretches(fade[2]).flatMap(
      ([a, b]): [number, number, string, number?][] => {
        const from = Math.max(fade[0], a);
        const to = Math.min(fade[1], b);
        return to - from >= 1
          ? [[Math.round(from), Math.round(to), fade[2], 0]]
          : [];
      },
    );
  });
}
