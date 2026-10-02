/**
 * The sounds a scene's motion makes (explainer-animation-plan §8): one cue
 * for each heard event, by what moves, from the effects library the
 * player makes in code (client lib/scene/sound/shot-fx.ts).
 *
 * | Motion                                   | Sound  | Heard                  |
 * |------------------------------------------|--------|------------------------|
 * | a pin                                    | pop    | as it lands            |
 * | a stamp                                  | thump  | as it lands            |
 * | a label (not every one)                  | tick   | as it lands            |
 * | a bar grown, a part entering             | pop    | as it lands, softly    |
 * | a count                                  | ticks  | for as long as it runs |
 * | a draw, a seam, a mark, a strike         | pencil | along the stroke       |
 * | a morph, a transfer                      | whoosh | over the move          |
 * | a flow                                   | swell  | under the wave         |
 * | a question                               | rise   | as it is asked         |
 * | a document opened                        | paper  | as it comes in         |
 * | the camera's travel, push, pull, return  | air    | over the move          |
 * | a dive through; a push or match join     | whoosh | its loudest on the cut |
 * | the payoff: the held colour's first use  | swell  | cresting on it         |
 *
 * Everything else is silent: a fill, a spotlight, a machine running, an
 * exit, a slow drift, a cut, a dissolve. A label ticks only when it is the
 * first in a while, and no more than two cues start in any second: where
 * more would, the most important are kept. An ask's quiet is left quiet.
 *
 * The cues are on the voice's clock, each on its motion. Snapping to the
 * music's beat is the player's, because only the player knows where the
 * beats are: a scene's place on the film's bar grid depends on every
 * scene before it in the edit (their lengths, handles and joins, which
 * change whenever one is remade), and the live music starts its grid
 * wherever the viewer presses play. So each cue says how far it may move
 * (`snapMs`): a landing hardly at all, since its picture stays where it is
 * and a sound early by more than ~45 ms is heard as out of step; a soft
 * sound further; a join's whoosh not at all; and the payoff's swell
 * furthest, onto a bar's first beat (`downbeat`).
 */
import type {
  ShotDto,
  ShotInfoDto,
  ShotInfoRecipe,
  ShotJoin,
  ShotSoundDto,
} from '../../../contracts';
import { isDrift } from './shot-time';

/** The effects library's ids (client lib/scene/sound/shot-fx.ts SHOT_FX). */
export const SHOT_SOUNDS = [
  'tick',
  'ticks',
  'pop',
  'thump',
  'whoosh',
  'air',
  'pencil',
  'paper',
  'swell',
  'rise',
] as const;
export type ShotSound = (typeof SHOT_SOUNDS)[number];

/** The quietest and loudest a cue is, against the library's level. */
const GAIN = { least: 0.25, most: 1 } as const;

/** Two cues of one sound closer than this are one event, heard once. */
const SAME_EVENT_MS = 80;

/** At most this many cues start inside any window this long: the voice comes first. */
export const DENSITY = { count: 2, windowMs: 1000 } as const;

/** A label ticks only this long after the last one that did. */
export const LABEL_APART_MS = 2500;

/**
 * How far either way the player may move a cue onto the music's beat:
 * a landing barely (its picture does not move), a soft sound as the plan
 * says (±120 ms), the payoff's swell onto a downbeat (±250 ms).
 */
export const SNAP_MS = { landing: 40, soft: 120, reveal: 250 } as const;

/**
 * Where the library's swell is loudest, as a share of its length (shot-fx.ts
 * `swell`): the payoff's swell is placed so its crest is the payoff.
 */
export const SWELL_CREST = 0.78;
/** The payoff's swell: how long it builds and fades around its crest. */
export const REVEAL_MS = 1800;

/** The longest a join takes, as the stage makes it (client lib/shots/runs.ts JOIN_MOST_MS). */
const JOIN_MOST_MS = 2400;

type When = 'start' | 'land' | 'span';

/** What one kind of event sounds like: the sound, how loud, when it is heard, and how it ranks beside others. */
interface Heard {
  sound: ShotSound;
  gain: number;
  /** As the motion starts, as it lands, or for as long as it runs. */
  on: When;
  /** Which of two too near each other is kept: the higher. */
  rank: number;
}

/** Each recipe's sound. The rest (fill, spotlight, run, exit) are silent. */
export const RECIPE_SOUND: Readonly<Partial<Record<ShotInfoRecipe, Heard>>> = {
  stamp: { sound: 'thump', gain: 0.9, on: 'land', rank: 9 },
  count: { sound: 'ticks', gain: 0.85, on: 'span', rank: 8 },
  ask: { sound: 'rise', gain: 0.85, on: 'start', rank: 8 },
  pin: { sound: 'pop', gain: 0.9, on: 'land', rank: 7 },
  morph: { sound: 'whoosh', gain: 0.7, on: 'span', rank: 6 },
  strike: { sound: 'pencil', gain: 0.75, on: 'span', rank: 6 },
  draw: { sound: 'pencil', gain: 0.8, on: 'span', rank: 5 },
  flow: { sound: 'swell', gain: 0.8, on: 'span', rank: 5 },
  grow: { sound: 'pop', gain: 0.55, on: 'land', rank: 4 },
  transfer: { sound: 'whoosh', gain: 0.45, on: 'span', rank: 4 },
  seam: { sound: 'pencil', gain: 0.6, on: 'span', rank: 3 },
  mark: { sound: 'pencil', gain: 0.55, on: 'span', rank: 3 },
  enter: { sound: 'pop', gain: 0.45, on: 'land', rank: 3 },
  label: { sound: 'tick', gain: 0.7, on: 'land', rank: 2 },
};

/** The camera's moves that move air (more than a drift), and a dive through. The rest are silent. */
const CAMERA_SOUND: Readonly<
  Partial<Record<ShotDto['camera'][number]['move'], Heard>>
> = {
  'zoom-through': { sound: 'whoosh', gain: 0.8, on: 'span', rank: 6 },
  travel: { sound: 'air', gain: 0.75, on: 'span', rank: 1 },
  push: { sound: 'air', gain: 0.65, on: 'span', rank: 1 },
  pull: { sound: 'air', gain: 0.65, on: 'span', rank: 1 },
  return: { sound: 'air', gain: 0.6, on: 'span', rank: 1 },
};

/** The joins that whoosh, loudest on their cut. A cut, a dip and a dissolve make none. */
const JOIN_SOUND: Readonly<Partial<Record<ShotJoin, Heard>>> = {
  'zoom-through': { sound: 'whoosh', gain: 0.85, on: 'span', rank: 7 },
  push: { sound: 'whoosh', gain: 0.7, on: 'span', rank: 5 },
  match: { sound: 'whoosh', gain: 0.5, on: 'span', rank: 4 },
  morph: { sound: 'whoosh', gain: 0.5, on: 'span', rank: 4 },
};

/** A document coming in: paper. */
const OPEN_DOCUMENT: Heard = {
  sound: 'paper',
  gain: 0.8,
  on: 'start',
  rank: 6,
};

/** The payoff, the first use of the colour held back for it: a swell cresting on it. */
const REVEAL: Heard = { sound: 'swell', gain: 0.9, on: 'span', rank: 10 };

const gainOf = (gain: number) =>
  Math.round(Math.max(GAIN.least, Math.min(GAIN.most, gain)) * 100) / 100;

/** How far a sound may move onto a beat: a landing's picture holds it close, as it does a count's ticks. */
const snapOf = (heard: Heard): number =>
  heard.on === 'land' || heard.sound === 'ticks'
    ? SNAP_MS.landing
    : SNAP_MS.soft;

/** Whether a shot shows another set than the one before it (not the same set carried on). */
const opensNew = (shots: readonly ShotDto[], i: number) => {
  const before = shots[i - 1];
  if (!before) return true;
  const a = shots[i].set;
  const b = before.set;
  return (
    a.kind !== b.kind ||
    ('asset' in a ? a.asset : null) !== ('asset' in b ? b.asset : null)
  );
};

/** What a set is, to tell whether two shots share one (client lib/shots/runs.ts setKey). */
const setKey = (set: ShotDto['set']) =>
  set.kind === 'plain' ? 'plain' : `${set.kind}:${set.asset}`;

/** A hand-over between two runs of shots: the shot handing over, how, where its cut is, and half its length. */
export interface ShotJoinAt {
  shot: ShotDto;
  kind: ShotJoin;
  cutMs: number;
  halfMs: number;
}

/**
 * Each hand-over between runs of shots as the stage makes it (client
 * lib/shots/runs.ts runsOf): shots joined by continue on one set are one
 * run; the cut is at the next run's start, the join half its length
 * either side, no longer than either run can give it.
 */
export function joinsOf(given: readonly ShotDto[]): ShotJoinAt[] {
  const shots = [...given].sort((a, b) => a.startMs - b.startMs);
  const runs: { shots: ShotDto[]; fromMs: number; toMs: number }[] = [];
  shots.forEach((shot, i) => {
    const before = shots[i - 1];
    if (
      before &&
      before.join === 'continue' &&
      setKey(before.set) === setKey(shot.set)
    ) {
      const run = runs[runs.length - 1];
      run.shots.push(shot);
      run.toMs = Math.max(run.toMs, shot.endMs);
      return;
    }
    runs.push({ shots: [shot], fromMs: shot.startMs, toMs: shot.endMs });
  });
  const out: ShotJoinAt[] = [];
  for (let k = 1; k < runs.length; k += 1) {
    const from = runs[k - 1];
    const into = runs[k];
    const last = from.shots[from.shots.length - 1];
    const kind: ShotJoin = last.join === 'continue' ? 'cut' : last.join;
    const room = Math.min(
      into.fromMs - from.fromMs,
      (runs[k + 1]?.fromMs ?? into.toMs) - into.fromMs,
    );
    const halfMs =
      kind === 'cut'
        ? 0
        : Math.max(0, Math.min(last.joinMs, JOIN_MOST_MS, room) / 2);
    out.push({
      shot: last,
      kind: halfMs > 0 ? kind : 'cut',
      cutMs: into.fromMs,
      halfMs,
    });
  }
  return out;
}

/** When the payoff is seen: as a change settles, or as a process starts. */
const revealMs = (item: ShotInfoDto): number =>
  item.recipe === 'flow' || item.recipe === 'run'
    ? item.atMs
    : item.atMs + item.durMs;

/** A cue as planned, with its rank: what the density cap and the merging keep by. */
interface Planned {
  cue: ShotSoundDto;
  rank: number;
}

/**
 * One cue per heard event of the shots, in time order (the table above):
 * at most DENSITY's cues in any second, the most important kept, the same
 * sound twice at one moment heard once, and an ask's quiet left quiet.
 * Each cue says what makes it, how long it lasts where it lasts, and how
 * far the player may move it onto the music's beat.
 */
export function soundsOf(shots: readonly ShotDto[]): ShotSoundDto[] {
  const planned: Planned[] = [];
  const endMs = shots.reduce((most, shot) => Math.max(most, shot.endMs), 0);
  const add = (
    heard: Heard,
    of: string,
    o: { atMs: number; durMs?: number; snapMs: number; downbeat?: boolean },
  ) => {
    if (!Number.isFinite(o.atMs)) return;
    planned.push({
      rank: heard.rank,
      cue: {
        atMs: Math.round(Math.max(0, Math.min(endMs, o.atMs))),
        sound: heard.sound,
        gain: gainOf(heard.gain),
        ...(o.durMs !== undefined && o.durMs > 0
          ? { durMs: Math.round(o.durMs) }
          : {}),
        of,
        ...(o.snapMs > 0 ? { snapMs: o.snapMs } : {}),
        ...(o.downbeat ? { downbeat: true } : {}),
      },
    });
  };

  // The payoff: the first use of the held colour, by when it is seen.
  const held = shots
    .flatMap((shot) => shot.info)
    .filter((item) => item.colour === 'held')
    .sort((a, b) => revealMs(a) - revealMs(b))[0];
  const asks: [number, number][] = [];
  let lastLabel = -Infinity;

  for (const [i, shot] of shots.entries()) {
    if (shot.set.kind === 'document' && opensNew(shots, i))
      add(OPEN_DOCUMENT, `${shot.id}:set`, {
        atMs: shot.startMs,
        snapMs: SNAP_MS.soft,
      });
    const info = [...shot.info].sort((a, b) => a.atMs - b.atMs);
    for (const item of info) {
      if (item.recipe === 'ask')
        asks.push([item.atMs, item.atMs + Math.max(0, item.durMs)]);
      const heard = RECIPE_SOUND[item.recipe];
      if (!heard) continue;
      const landsAt = item.atMs + item.durMs;
      // Not every label ticks: the first in a while does.
      if (item.recipe === 'label') {
        if (landsAt - lastLabel < LABEL_APART_MS) continue;
        lastLabel = landsAt;
      }
      add(heard, item.id, {
        atMs: heard.on === 'land' ? landsAt : item.atMs,
        ...(heard.on === 'span' ? { durMs: item.durMs } : {}),
        snapMs: snapOf(heard),
      });
    }
    shot.camera.forEach((move, k) => {
      const heard = CAMERA_SOUND[move.move];
      // A small push or pull is a drift: life, not an event, and silent.
      if (!heard || isDrift(move)) return;
      add(heard, `${shot.id}:camera:${k}`, {
        atMs: move.atMs,
        durMs: move.durMs,
        snapMs: SNAP_MS.soft,
      });
    });
  }

  // The joins between runs: a whoosh as long as the join, its middle (its loudest) on the cut.
  for (const join of joinsOf(shots)) {
    const heard = JOIN_SOUND[join.kind];
    if (!heard) continue;
    add(heard, `${join.shot.id}:join`, {
      atMs: join.cutMs - join.halfMs,
      durMs: join.halfMs * 2,
      snapMs: 0,
    });
  }

  if (held)
    add(REVEAL, `${held.id}:reveal`, {
      atMs: revealMs(held) - SWELL_CREST * REVEAL_MS,
      durMs: REVEAL_MS,
      snapMs: SNAP_MS.reveal,
      downbeat: true,
    });

  return thinned(planned, asks);
}

/** Whether a start among others makes some second hold more than DENSITY's cues. */
const crowds = (starts: readonly number[], at: number): boolean => {
  const all = [...starts, at].sort((a, b) => a - b);
  return all.some(
    (start) =>
      all.filter((t) => t >= start && t < start + DENSITY.windowMs).length >
      DENSITY.count,
  );
};

/**
 * The cues kept: the most important first, each kept if it is not the same
 * sound as a kept one at the same moment, does not start in an ask's
 * quiet (unless it is the ask's own), and leaves no second with more than
 * DENSITY's cues starting in it. In time order.
 */
function thinned(
  planned: readonly Planned[],
  asks: readonly [number, number][],
): ShotSoundDto[] {
  const order = [...planned].sort(
    (a, b) => b.rank - a.rank || a.cue.atMs - b.cue.atMs,
  );
  const kept: ShotSoundDto[] = [];
  for (const { cue } of order) {
    if (
      kept.some(
        (k) =>
          k.sound === cue.sound && Math.abs(k.atMs - cue.atMs) < SAME_EVENT_MS,
      )
    )
      continue;
    // The quiet after a question: the viewer thinks.
    if (
      cue.sound !== 'rise' &&
      asks.some(([from, to]) => cue.atMs > from + 150 && cue.atMs < to)
    )
      continue;
    if (
      crowds(
        kept.map((k) => k.atMs),
        cue.atMs,
      )
    )
      continue;
    kept.push(cue);
  }
  return kept.sort((a, b) => a.atMs - b.atMs || a.sound.localeCompare(b.sound));
}
