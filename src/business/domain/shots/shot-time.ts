/**
 * The shots put on the voice's clock (explainer-animation-tech.md §4.1):
 * every phrase a shot, a piece of information, a camera move or an
 * actor's move is anchored to is found in the narration as it was spoken,
 * and the change is timed so it has settled a breath before its word
 * (research §3.2's sync: −150 to −50 ms, never late). Each shot starts on
 * its phrase, just before the word, and runs to the next; the last runs
 * to the end of the voice.
 *
 * Pure: the same shots and the same words give the same times, so the
 * player, the stills and the export all see one film.
 */
import type {
  SceneDto,
  ShotActorDto,
  ShotCameraDto,
  ShotCameraMove,
  ShotCreditDto,
  ShotDto,
  ShotInfoDto,
  ShotInfoRecipe,
  ShotJoin,
  ShotLifeDto,
  ShotMoveDto,
  ShotSetDto,
  ShotTargetDto,
} from '../../../contracts';
import { PACE } from '../studio/explainer-rules';

// ── The shots before their times ──────────────────────────────────────────

/** A piece of information built but not timed: on the words that cause it, and until the words that end it. */
export type UntimedInfo = Omit<ShotInfoDto, 'atMs' | 'durMs' | 'untilMs'> & {
  on: string;
  until?: string;
  /** Its own length, when code knows better than the recipe's (a transfer of many tokens). */
  durMs?: number;
};

/** A camera move built but not timed. */
export type UntimedCamera = Omit<ShotCameraDto, 'atMs' | 'durMs'> & {
  on: string;
  /** Its own length, when code knows it (a travel across a known distance). */
  durMs?: number;
};

/** One of an actor's moves, not timed. */
export type UntimedMove = Omit<ShotMoveDto, 'atMs' | 'durMs'> & {
  on: string;
  durMs?: number;
};

export type UntimedActor = Omit<ShotActorDto, 'moves'> & {
  moves: UntimedMove[];
};

/** A shot built (its set, actors, information and camera resolved), each change still on its words. */
export interface UntimedShot {
  id: string;
  /** The words of the narration it starts on. */
  on: string;
  set: ShotSetDto;
  actors: UntimedActor[];
  info: UntimedInfo[];
  life: ShotLifeDto[];
  camera: UntimedCamera[];
  focal?: ShotTargetDto;
  join: ShotJoin;
  chip?: ShotCreditDto;
  illustration?: boolean;
}

// ── How long things take ──────────────────────────────────────────────────

/**
 * Each recipe's length when the plan gives none: research §3.2's closed
 * verb list, at the middle of each range (house values, to tune on the
 * bench). Draw is per stroke group; a transfer is one token's journey.
 */
export const RECIPE_MS: Readonly<Record<ShotInfoRecipe, number>> = {
  draw: 600,
  label: 250,
  pin: 350,
  fill: 600,
  seam: 900,
  count: 1500,
  grow: 850,
  transfer: 750,
  morph: 1000,
  run: 1200,
  strike: 600,
  stamp: 400,
  flow: 2500,
  spotlight: 500,
  mark: 400,
  enter: 500,
  exit: 400,
  ask: 600,
};

/**
 * Each camera move's length when the plan gives none (research §3.2):
 * a travel's middle (its 0.4–1.2 s range by distance, when code cannot
 * measure it), a zoom-through's push. Follow and hold run until something
 * else moves the camera, so theirs is worked out per shot.
 */
export const CAMERA_MS: Readonly<Record<ShotCameraMove, number>> = {
  establish: 1200,
  travel: 900,
  push: 800,
  pull: 800,
  follow: 0,
  'cut-to': 0,
  'zoom-through': 1200,
  return: 900,
  hold: 0,
};

/** A small push or pull is a slow drift that starts on its word and runs on (the Kano portrait's 5% over 2.5 s). */
export const DRIFT_MS = 2500;

/** A push's or a pull's size, as a fraction of the frame: the plan says small, medium or large, code says how much. */
export const CAMERA_AMOUNT = {
  small: 0.05,
  medium: 0.12,
  large: 0.25,
} as const;

/** How long each join takes, around the cut point. */
export const JOIN_MS: Readonly<Record<ShotJoin, number>> = {
  cut: 0,
  continue: 0,
  dissolve: 600,
  dip: 700,
  push: 500,
  match: 500,
  morph: 900,
  'zoom-through': 1200,
};

/** An actor's moves: enter and exit as recipes do, a walk as far as a stage crossing takes. */
export const MOVE_MS: Readonly<Record<string, number>> = {
  enter: 600,
  exit: 500,
  walk: 1200,
  point: 500,
  turn: 400,
  sit: 600,
  stand: 600,
  wave: 800,
  run: 1200,
};
const MOVE_DEFAULT_MS = 800;

/**
 * How far before its word a change settles: the middle of the rules'
 * window (−150 to −50 ms), so it is there as the word is heard.
 */
export const SETTLE_LEAD_MS =
  -(PACE.settleLeadMs[0] + PACE.settleLeadMs[1]) / 2;

/** A cut lands this far before its word: the new picture is there as the word begins. */
export const CUT_LEAD_MS = 100;

/** The shortest a shot may be: anything shorter is a flash, not a picture. */
export const MIN_SHOT_MS = PACE.minGapMs;

/**
 * Recipes that are a process, not a change: a flow's wave along the causal
 * path and a machine starting run as the words that name them are said, so
 * they start on their word rather than settle before it.
 */
export const STARTS_ON_WORD: ReadonlySet<ShotInfoRecipe> =
  new Set<ShotInfoRecipe>(['flow', 'run']);

// ── The words ─────────────────────────────────────────────────────────────

/**
 * A word reduced to what it says, for matching a plan's phrase to the
 * narration: lower case, accents and marks gone, punctuation and quotes
 * (straight or curly) gone, letters of any script kept.
 */
export const keyOf = (word: string): string =>
  word
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

/** One spoken word of a scene: its key, its sentence, and when it is said. */
export interface SpokenWord {
  key: string;
  beat: number;
  startMs: number;
  endMs: number;
}

type TimedBeats = readonly Pick<
  SceneDto['beats'][number],
  'text' | 'startMs' | 'endMs' | 'words'
>[];

/**
 * Every word of the narration in order, across its sentences, with the
 * times the voice said it ([charStart, charEnd, startMs, endMs] into each
 * beat's text). Words that are only punctuation are left out: nothing is
 * anchored to a dash.
 */
export function spokenWordsOf(beats: TimedBeats): SpokenWord[] {
  const out: SpokenWord[] = [];
  beats.forEach((beat, k) => {
    for (const [from, to, startMs, endMs] of beat.words) {
      const key = keyOf(beat.text.slice(from, to));
      if (key) out.push({ key, beat: k, startMs, endMs });
    }
  });
  return out;
}

/** Two words the same, or one the other with an ending: "region" and "regions". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    short.length >= 4 &&
    long.startsWith(short) &&
    long.length - short.length <= 3
  );
}

/**
 * Where a phrase starts among the spoken words, at or after `from`, or
 * null. Matched as letters, word boundaries kept, so "eighty one" finds
 * "eighty-one" and "1951's" finds "1951's"; failing that, the window that
 * shares the most words with it, if it shares at least three in five (a
 * phrase the board wrote a little differently from the line).
 */
export function findPhrase(
  words: readonly SpokenWord[],
  phrase: string,
  from = 0,
  to = words.length,
): number | null {
  const wanted = phrase.split(/\s+/).map(keyOf).filter(Boolean);
  if (!wanted.length) return null;
  const joined = wanted.join('');
  const end = Math.min(to, words.length);
  for (let i = Math.max(0, from); i < end; i += 1) {
    let have = '';
    for (let j = i; j < words.length && have.length < joined.length; j += 1) {
      have += words[j].key;
      if (!joined.startsWith(have)) break;
      if (have === joined) return i;
    }
  }
  let best: number | null = null;
  let bestScore = 0;
  const span = wanted.length;
  for (let i = Math.max(0, from); i + span <= end; i += 1) {
    let matched = 0;
    for (let k = 0; k < span; k += 1)
      if (sameWord(words[i + k].key, wanted[k])) matched += 1;
    const score = matched / span;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

// ── Putting the shots on the clock ────────────────────────────────────────

/** What the timer was told, beyond the shots and the words. */
export interface TimeOptions {
  /** Where to say what could not be placed as planned; read by the make's log. */
  notes?: string[];
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/** Whether a push or a pull is a slow drift: a small one, which starts on its word and runs on. */
export const isDrift = (camera: { move: ShotCameraMove; amount?: number }) =>
  (camera.move === 'push' || camera.move === 'pull') &&
  (camera.amount ?? CAMERA_AMOUNT.small) <= CAMERA_AMOUNT.small;

/**
 * The shots on the voice's clock. Each starts on its phrase's first word
 * less the cut's lead and runs to the next (the first from the scene's
 * start, the last to `durationMs`); one whose phrase is lost, or comes
 * too soon after the one before, starts as soon after it as a shot may,
 * or is left out when there is no room. Each change inside a shot has
 * settled SETTLE_LEAD_MS before its word: it starts its own length before
 * that, never before its shot. A slow drift, a follow and a hold start on
 * their word instead and run on.
 */
export function timeShots(
  untimed: readonly UntimedShot[],
  beats: TimedBeats,
  durationMs: number,
  options: TimeOptions = {},
): ShotDto[] {
  const notes = options.notes ?? [];
  const words = spokenWordsOf(beats);
  const end = Math.max(0, durationMs);
  // Where each shot's phrase is, in order: a phrase found before the shot
  // before it is out of order, and lost.
  const found: (number | null)[] = [];
  let cursor = 0;
  untimed.forEach((shot, i) => {
    const at = findPhrase(words, shot.on, cursor);
    if (at === null && i > 0)
      notes.push(`shot ${i + 1}: "${shot.on}" is not said after shot ${i}`);
    found.push(at);
    if (at !== null) cursor = at + 1;
  });
  const wanted = untimed.map((_, i) =>
    i === 0
      ? 0
      : found[i] !== null
        ? Math.max(0, words[found[i]].startMs - CUT_LEAD_MS)
        : null,
  );
  // Each start at least a shot's length after the last, and room left
  // before the next one wanted and the end.
  const placed: { shot: UntimedShot; startMs: number; word: number }[] = [];
  untimed.forEach((shot, i) => {
    const previous = placed[placed.length - 1];
    const earliest = previous ? previous.startMs + MIN_SHOT_MS : 0;
    const want = wanted[i] ?? earliest;
    const startMs = i === 0 ? 0 : Math.max(want, earliest);
    const next = wanted.slice(i + 1).find((w): w is number => w !== null);
    const room = Math.min(next ?? end, end) - MIN_SHOT_MS;
    if (i > 0 && startMs > room) {
      notes.push(`shot ${i + 1}: no room for it, left out`);
      return;
    }
    if (i > 0 && startMs !== want)
      notes.push(
        `shot ${i + 1}: starts at ${Math.round(startMs)}ms, not ${Math.round(want)}ms`,
      );
    placed.push({
      shot,
      startMs,
      word:
        found[i] ??
        Math.max(
          0,
          words.findIndex((w) => w.startMs >= startMs),
        ),
    });
  });
  return placed.map((one, k) => {
    const next = placed[k + 1];
    const startMs = Math.round(one.startMs);
    const endMs = Math.round(next ? next.startMs : Math.max(end, startMs));
    const span = {
      startMs,
      endMs,
      fromWord: one.word,
      toWord: next ? next.word : words.length,
    };
    const where = `shot ${k + 1}`;
    /** When a phrase of this shot is said: in the shot first, else anywhere after its start, else anywhere; the shot's own first word when it is not said. */
    const wordMs = (phrase: string, after = span.fromWord): number => {
      const at =
        findPhrase(words, phrase, after, span.toWord) ??
        findPhrase(words, phrase, span.fromWord, span.toWord) ??
        findPhrase(words, phrase, span.fromWord) ??
        findPhrase(words, phrase, 0);
      if (at === null) {
        notes.push(`${where}: "${phrase}" is not said; put at its start`);
        return startMs + CUT_LEAD_MS;
      }
      const ms = words[at].startMs;
      if (ms < startMs || ms >= endMs)
        notes.push(`${where}: "${phrase}" is said outside it; kept inside`);
      return clamp(ms, startMs, endMs);
    };
    const indexOf = (phrase: string, after: number) =>
      findPhrase(words, phrase, after, span.toWord) ??
      findPhrase(words, phrase, after);
    /** A change settled before its word: started its length before, inside the shot. */
    const settled = (word: number, durMs: number) => {
      const dur = Math.max(0, Math.min(durMs, endMs - startMs));
      return {
        atMs: Math.round(
          clamp(word - dur - SETTLE_LEAD_MS, startMs, endMs - dur),
        ),
        durMs: Math.round(dur),
      };
    };
    /** A process started on its word and run on, inside the shot. */
    const started = (word: number, durMs: number) => {
      const atMs = clamp(word - SETTLE_LEAD_MS, startMs, endMs);
      return {
        atMs: Math.round(atMs),
        durMs: Math.round(Math.max(0, Math.min(durMs, endMs - atMs))),
      };
    };

    const info = one.shot.info
      .map((item) => {
        const { on, until, durMs: own, ...rest } = item;
        const word = wordMs(on);
        const length = own ?? RECIPE_MS[item.recipe];
        const timed = STARTS_ON_WORD.has(item.recipe)
          ? started(word, length)
          : settled(word, length);
        let untilMs: number | undefined;
        if (until) {
          const from = indexOf(on, span.fromWord) ?? span.fromWord;
          const at = indexOf(until, from + 1);
          if (at !== null)
            untilMs = Math.round(
              clamp(
                words[at].startMs - SETTLE_LEAD_MS,
                timed.atMs + timed.durMs,
                endMs,
              ),
            );
          else notes.push(`${where}: "${until}" is not said; ${item.id} stays`);
        }
        const out: ShotInfoDto = {
          ...rest,
          atMs: timed.atMs,
          durMs: timed.durMs,
          ...(untilMs !== undefined ? { untilMs } : {}),
        };
        return out;
      })
      .sort((a, b) => a.atMs - b.atMs);

    const moves = one.shot.camera
      .map((camera) => {
        const { on, durMs: own, ...rest } = camera;
        if (camera.move === 'establish')
          return {
            ...rest,
            atMs: startMs,
            durMs: Math.round(
              Math.min(own ?? CAMERA_MS.establish, endMs - startMs),
            ),
          };
        const word = wordMs(on);
        if (camera.move === 'cut-to')
          return {
            ...rest,
            atMs: Math.round(clamp(word - CUT_LEAD_MS, startMs, endMs)),
            durMs: 0,
          };
        // A slow drift, a follow and a hold start on their word and run on.
        if (
          isDrift(camera) ||
          camera.move === 'follow' ||
          camera.move === 'hold'
        ) {
          const atMs = Math.round(clamp(word - SETTLE_LEAD_MS, startMs, endMs));
          const runs =
            camera.move === 'follow' || camera.move === 'hold'
              ? endMs - atMs
              : (own ?? DRIFT_MS);
          return {
            ...rest,
            atMs,
            durMs: Math.round(Math.max(0, Math.min(runs, endMs - atMs))),
          };
        }
        return { ...rest, ...settled(word, own ?? CAMERA_MS[camera.move]) };
      })
      .sort((a, b) => a.atMs - b.atMs);
    // A hold lasts until the camera's next move.
    const camera: ShotCameraDto[] = moves.map((move, i) => {
      if (move.move !== 'hold') return move;
      const next = moves.slice(i + 1).find((m) => m.atMs > move.atMs);
      return next
        ? { ...move, durMs: Math.max(0, next.atMs - move.atMs) }
        : move;
    });

    const actors: ShotActorDto[] = one.shot.actors.map((actor) => ({
      ...actor,
      moves: actor.moves
        .map((move) => {
          const { on, durMs: own, ...rest } = move;
          return {
            ...rest,
            ...settled(
              wordMs(on),
              own ?? MOVE_MS[move.move] ?? MOVE_DEFAULT_MS,
            ),
          };
        })
        .sort((a, b) => a.atMs - b.atMs),
    }));

    const shot: ShotDto = {
      id: one.shot.id,
      startMs,
      endMs,
      set: one.shot.set,
      actors,
      info,
      life: one.shot.life,
      camera,
      ...(one.shot.focal ? { focal: one.shot.focal } : {}),
      join: one.shot.join,
      joinMs: JOIN_MS[one.shot.join],
      ...(one.shot.chip ? { chip: one.shot.chip } : {}),
      ...(one.shot.illustration ? { illustration: true } : {}),
    };
    return shot;
  });
}

// ── Timed again, when the voice is ────────────────────────────────────────

/**
 * Shots moved with their voice when it is played quicker or slower
 * (SceneProcessor.repace): each change keeps its length and settles where
 * its word now is (the moment it settled at, moved by `map`); each shot
 * starts where its first word now is. Pure in `map`.
 */
export function retimeShots(
  shots: readonly ShotDto[],
  map: (ms: number) => number,
  durationMs: number,
): ShotDto[] {
  const starts = shots.map((shot, i) =>
    i === 0 ? 0 : Math.max(0, map(shot.startMs + CUT_LEAD_MS) - CUT_LEAD_MS),
  );
  return shots.map((shot, i) => {
    const startMs = Math.round(starts[i]);
    const endMs = Math.round(
      i + 1 < shots.length ? starts[i + 1] : Math.max(durationMs, startMs),
    );
    const inside = (atMs: number, durMs: number) =>
      Math.round(clamp(atMs, startMs, Math.max(startMs, endMs - durMs)));
    /** A change that settles on its word: its settling point moved. */
    const settles = (atMs: number, durMs: number) =>
      inside(
        map(atMs + durMs + SETTLE_LEAD_MS) - durMs - SETTLE_LEAD_MS,
        durMs,
      );
    return {
      ...shot,
      startMs,
      endMs,
      info: shot.info.map((item) => {
        // A process keeps its start on its word; a change its settling.
        const atMs = STARTS_ON_WORD.has(item.recipe)
          ? inside(map(item.atMs + SETTLE_LEAD_MS) - SETTLE_LEAD_MS, item.durMs)
          : settles(item.atMs, item.durMs);
        return {
          ...item,
          atMs,
          ...(item.untilMs !== undefined
            ? {
                untilMs: Math.round(
                  clamp(map(item.untilMs), atMs + item.durMs, endMs),
                ),
              }
            : {}),
        };
      }),
      camera: shot.camera.map((move) => {
        const runs =
          move.move === 'follow' || move.move === 'hold' || isDrift(move);
        const atMs = runs
          ? inside(map(move.atMs), 0)
          : settles(move.atMs, move.durMs);
        const durMs =
          move.move === 'follow' || move.move === 'hold'
            ? Math.max(0, Math.round(map(move.atMs + move.durMs)) - atMs)
            : move.durMs;
        return { ...move, atMs, durMs: Math.min(durMs, endMs - atMs) };
      }),
      actors: shot.actors.map((actor) => ({
        ...actor,
        moves: actor.moves.map((move) => ({
          ...move,
          atMs: settles(move.atMs, move.durMs),
        })),
      })),
    };
  });
}
