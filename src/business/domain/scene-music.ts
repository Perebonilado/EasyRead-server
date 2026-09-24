/**
 * Where the music changes on a page. The writer says what each stretch
 * feels like, a sentence at a time; code decides where the changes land.
 *
 * - A change starts with a sentence, and a state lasts long enough to be
 *   heard as one: at least two sentences and ten seconds, or it merges
 *   into its neighbour (a flurry of short changes into its strongest
 *   feeling). A page changes at most three times.
 * - Maths being worked and a passage read closely are the subject: the
 *   music leaves them the quiet (none) while they are on the stage, when
 *   they stay long enough for a fade out and back to be worth it, and
 *   stays out between two of them unless it would be back for a while.
 * - The book's tone bounds the palette: a light book is never tense, a
 *   serious one never playful.
 *
 * The player turns these cues into the score (the client's conductor):
 * each lands on the bar line nearest it, through a chord the two share.
 */
import type { ProfileKind, ProfileTone } from './scene-profile';
import {
  MUSIC_WITH_ENERGY,
  type SceneMood,
  type SceneMusic,
} from './scene-script';

export interface MusicCue {
  atMs: number;
  state: SceneMusic;
  energy?: 'high';
}

/** Which family of instruments plays a document's score. */
export type MusicPalette = 'lesson' | 'story' | 'verse';

/** The shortest stretch a state holds: shorter, it merges into its neighbour. */
export const MUSIC_MIN_MS = 10_000;
export const MUSIC_MIN_SENTENCES = 2;
/** The shortest quiet worth fading out for; a working shown for less keeps the music. */
export const QUIET_MIN_MS = 6_000;
/** The most changes on a page. */
export const MUSIC_MOST_CHANGES = 3;
/**
 * Music between two quiet workings comes back only for this long at
 * least: in for a moment and out again is the jolt the quiet was for.
 */
export const QUIET_BRIDGE_MS = 20_000;

/** Things whose words are the subject, left in quiet while they are on the stage. */
const QUIET_SOURCES = new Set(['math', 'plot', 'quote']);

/** The music a page made before the score plays, from its mood: serious is calm in a minor colour. */
export function moodMusic(mood: SceneMood): SceneMusic {
  return mood === 'serious' ? 'calm' : mood;
}

/** A document's instruments, from its profile: a story's, poetry's, or a lesson's. */
export function paletteOf(
  profile?: { kind: ProfileKind; story?: boolean } | null,
): MusicPalette {
  if (!profile) return 'lesson';
  if (profile.kind === 'poetry') return 'verse';
  if (profile.kind === 'fiction' || profile.kind === 'drama' || profile.story)
    return 'story';
  return 'lesson';
}

/** A state inside the book's tone. */
function bounded(state: SceneMusic, tone?: ProfileTone): SceneMusic {
  if (tone === 'light' && state === 'tense') return 'curious';
  if (tone === 'serious' && state === 'playful') return 'calm';
  return state;
}

interface Run {
  state: SceneMusic;
  energy?: 'high';
  /** Its sentences, first and last. */
  first: number;
  last: number;
  /** Quiet because a working or a passage is on the stage, not by the writer. */
  forced: boolean;
}

const same = (a: Run, b: Run) =>
  a.state === b.state && a.energy === b.energy && a.forced === b.forced;

/**
 * Which feeling wins when short changes merge: grief and danger over a
 * journey, a journey over good news, good news over a question, a
 * question over plain explaining. A working's quiet wins over everything.
 * A quiet the writer asked for wins over nothing: a sentence of silence
 * (a flame going out) cannot be faded out for and back, so a short one is
 * taken into the music around it; only a quiet stretch of its own stays.
 */
const STRENGTH: Record<SceneMusic, number> = {
  none: 0,
  solemn: 6,
  tense: 5,
  motion: 4,
  bright: 3,
  playful: 3,
  curious: 2,
  calm: 1,
};
const strength = (run: Run) => (run.forced ? 10 : STRENGTH[run.state]);
/** Feelings this strong grow into the sentences after them rather than be lost. */
const GROWS = STRENGTH.motion;

/** The cues for a page: the first at zero, then one per change. */
export function placeMusic(input: {
  beats: {
    startMs: number;
    endMs: number;
    music?: SceneMusic;
    energy?: 'high';
  }[];
  mood: SceneMood;
  steps: { atMs: number; show: string[] }[];
  things: { id: string; source?: string }[];
  durationMs: number;
  tone?: ProfileTone;
}): MusicCue[] {
  const { beats, tone, durationMs } = input;
  const opening = bounded(moodMusic(input.mood), tone);
  if (!beats.length) return [{ atMs: 0, state: opening }];

  // Each sentence's state: the writer's, carried on until they change it.
  let state = opening;
  let energy: 'high' | undefined;
  const written = beats.map((beat) => {
    if (beat.music) {
      state = bounded(beat.music, tone);
      energy = undefined;
    }
    if (beat.energy === 'high') energy = 'high';
    return {
      state,
      energy: energy && MUSIC_WITH_ENERGY.includes(state) ? energy : undefined,
    };
  });

  // Quiet wherever a working or a passage is on the stage mid-sentence.
  const quietIds = new Set(
    input.things
      .filter((thing) => thing.source && QUIET_SOURCES.has(thing.source))
      .map((thing) => thing.id),
  );
  const steps = [...input.steps].sort((a, b) => a.atMs - b.atMs);
  const showing = (ms: number) => {
    let found: string[] = [];
    for (const step of steps) if (step.atMs <= ms) found = step.show;
    return found;
  };
  const quiet = beats.map((beat) =>
    showing((beat.startMs + beat.endMs) / 2).some((id) => quietIds.has(id)),
  );

  const fromMs = (run: Run, i: number) =>
    i === 0 ? 0 : beats[run.first].startMs;
  const lengthMs = (runs: Run[], i: number) =>
    (i + 1 < runs.length ? fromMs(runs[i + 1], i + 1) : durationMs) -
    fromMs(runs[i], i);

  const runsOf = (quietAt: boolean[]): Run[] => {
    const runs: Run[] = [];
    beats.forEach((_, k) => {
      const run: Run = quietAt[k]
        ? { state: 'none', first: k, last: k, forced: true }
        : {
            state: written[k].state,
            ...(written[k].energy ? { energy: written[k].energy } : {}),
            first: k,
            last: k,
            forced: false,
          };
      const last = runs[runs.length - 1];
      if (last && same(last, run)) last.last = k;
      else runs.push(run);
    });
    return runs;
  };

  // A working shown too briefly to fade for keeps the music.
  let runs = runsOf(quiet);
  const brief = new Set<number>();
  runs.forEach((run, i) => {
    if (run.forced && lengthMs(runs, i) < QUIET_MIN_MS)
      for (let k = run.first; k <= run.last; k += 1) brief.add(k);
  });
  if (brief.size) runs = runsOf(quiet.map((q, k) => q && !brief.has(k)));
  // Music that would come back for a moment between two workings stays out.
  const bridged = new Set<number>();
  runs.forEach((run, i) => {
    if (
      !run.forced &&
      runs[i - 1]?.forced &&
      runs[i + 1]?.forced &&
      lengthMs(runs, i) < QUIET_BRIDGE_MS
    )
      for (let k = run.first; k <= run.last; k += 1) bridged.add(k);
  });
  if (bridged.size)
    runs = runsOf(quiet.map((q, k) => (q && !brief.has(k)) || bridged.has(k)));

  /** Two neighbouring runs made one, playing what `keep` plays. */
  const join = (a: number, keep: Run) => {
    runs.splice(a, 2, {
      ...keep,
      first: runs[a].first,
      last: runs[a + 1].last,
    });
    // Neighbours that now match are one run.
    for (let k = runs.length - 1; k > 0; k -= 1)
      if (same(runs[k - 1], runs[k])) {
        runs[k - 1].last = runs[k].last;
        runs.splice(k, 1);
      }
  };
  const sentences = (run: Run) => run.last - run.first + 1;
  const isShort = (i: number) => {
    const run = runs[i];
    if (run.forced) return false;
    const ms = lengthMs(runs, i);
    // An opening before a working needs only to be long enough to be heard.
    if (i === 0 && runs[1]?.forced) return ms < QUIET_MIN_MS;
    return ms < MUSIC_MIN_MS || sentences(run) < MUSIC_MIN_SENTENCES;
  };

  // A state too short to be heard as one merges into a neighbour, the
  // shortest first. A run of short changes merges into its strongest
  // feeling: a sad sentence after a flurry of others is still sad. A short
  // stray beside a long stretch is taken into that stretch.
  for (let guard = 0; guard < beats.length * 3 && runs.length > 1; guard += 1) {
    const shorts = runs.map((_, i) => i).filter(isShort);
    if (!shorts.length) break;
    const i = shorts.sort((a, b) => lengthMs(runs, a) - lengthMs(runs, b))[0];
    const run = runs[i];
    const near = [i - 1, i + 1].filter((k) => k >= 0 && k < runs.length);
    // A strong feeling (grief, danger, a journey) too
    // short on its own, and stronger than what is either side, takes the
    // sentences after it until it is long enough: the aftermath of a
    // death stays solemn a while rather than being lost in what came before.
    const next = runs[i + 1];
    if (
      strength(run) >= GROWS &&
      next &&
      !next.forced &&
      near.every((k) => strength(runs[k]) < strength(run))
    ) {
      while (isShort(i) && runs[i + 1] && !runs[i + 1].forced) {
        run.last += 1;
        if (runs[i + 1].first === runs[i + 1].last) runs.splice(i + 1, 1);
        else runs[i + 1].first += 1;
      }
      continue;
    }
    // A short neighbour first (the flurry becomes one), then one that plays
    // the same, then the one before (the music carries on), then after.
    const into =
      near.find((k) => isShort(k)) ??
      near.find(
        (k) => runs[k].state === run.state && runs[k].energy === run.energy,
      ) ??
      near[0];
    const other = runs[into];
    const keep =
      other.forced || !isShort(into)
        ? other
        : strength(run) > strength(other)
          ? run
          : other;
    join(Math.min(i, into), keep);
  }
  // At most three changes: the shortest stretches give way to the stretch
  // before them, and the page's opening last of all.
  while (runs.length - 1 > MUSIC_MOST_CHANGES) {
    const order = runs
      .map((run, i) => ({ i, forced: run.forced, ms: lengthMs(runs, i) }))
      .sort(
        (a, b) =>
          Number(a.forced) - Number(b.forced) ||
          Number(a.i === 0) - Number(b.i === 0) ||
          a.ms - b.ms,
      );
    const i = order[0].i;
    const into = i > 0 ? i - 1 : 1;
    join(Math.min(i, into), runs[into]);
  }

  const cues: MusicCue[] = [];
  runs.forEach((run, i) => {
    const last = cues[cues.length - 1];
    // A quiet the writer asked for and one a working asks for are one quiet.
    if (last && last.state === run.state && last.energy === run.energy) return;
    cues.push({
      atMs: fromMs(run, i),
      state: run.state,
      ...(run.energy ? { energy: run.energy } : {}),
    });
  });
  return cues;
}
