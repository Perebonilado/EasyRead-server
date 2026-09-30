/**
 * Text holds still while it is read (studio-explainer-plan, Ask 3 B): the
 * server's half. Every piece of text on a lesson's stage (a card, a stat,
 * a drawing's caption and labels, an arrow's label, a working's lines) has
 * a reading window from how fast its viewers read. The player holds the
 * camera and every text still inside one (the client's timeline.ts and
 * reading.ts keep these same rules); here, in code and never by a model,
 * what comes too fast to read is fixed before the scene is stored:
 *
 *  - a list shown faster than it can be read shows its items two at a time;
 *  - a stage change that would take text away (or move it) while it is
 *    still being read waits for the start of the next word after it is;
 *  - accents (a point, a pulse, a state shown) come one at a time, at least
 *    ACCENT_APART_MS apart, but for a thing and its own label;
 *  - a keyword card longer than its audience's `cardWords` is cut to its key
 *    noun phrase (before composing, so it is laid out as it will be read).
 *
 * All pure; nothing here is ever sent back to a writer.
 */
import type {
  SceneDto,
  SceneEffectDto,
  SceneReadingDto,
  SceneStepDto,
  SceneThingDto,
} from '../../contracts';
import type { SceneScript } from './scene-script';
import { settledOf } from './scene-film';

// ── How fast they read ────────────────────────────────────────────────────

/** How a scene's text is read and moves, and how long a keyword card may be. */
export interface SceneReading extends SceneReadingDto {
  /** Words on a keyword card, at most; absent, no card is cut. */
  cardWords?: number;
}

/** Reading starts this long after text comes up, and one word needs at least this long. */
export const READ_BASE_MS = 400;
export const READ_LEAST_MS = 1200;

/**
 * Each lesson stage's reading, where a page says only its stage (a book's
 * page): the audience bands' rates (studio-audience's readWpm and motion)
 * as the stage's middle band has them. The client's STAGE_READ_WPM.
 */
export const STAGE_READING: Record<
  NonNullable<SceneDto['stage']>,
  SceneReading
> = {
  early: { wpm: 130, motion: 0.8, cardWords: 3 },
  middle: { wpm: 160, motion: 0.9, cardWords: 5 },
  higher: { wpm: 200, motion: 1, cardWords: 7 },
  professional: { wpm: 200, motion: 1, cardWords: 7 },
};
export const ADULT_READING: SceneReading = {
  wpm: 200,
  motion: 1,
  cardWords: 7,
};

/** A scene's reading: its own, else its stage's, else a grown-up's. */
export function readingOf(
  scene: Pick<SceneDto, 'reading' | 'stage'>,
): SceneReading {
  if (scene.reading) return scene.reading;
  return scene.stage ? STAGE_READING[scene.stage] : ADULT_READING;
}

/** The words in some text. */
export const wordsIn = (text: string): number =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** How long `words` words take to read at `wpm`: a moment to find them, then their words, never under a single word's least. */
export function readMs(words: number, wpm: number): number {
  if (words <= 0) return 0;
  return Math.max(
    READ_LEAST_MS,
    READ_BASE_MS + (60_000 * words) / Math.max(20, wpm),
  );
}

// ── The player's timings, at a scene's motion ────────────────────────────

/** The player's timings (timeline.ts), in ms. */
const ENTER_MS = 520;
const DRAW_MS = 600;
const REVEAL_MS = 320;
const STAGGER_MS = 180;
const CLEAR_FIRST_MS = 190;

/** A duration at a scene's motion: a young child's ×1.25 (timeline.ts atMotion). */
export const atMotion = (ms: number, motion: number): number =>
  ms * (2 - Math.min(1.15, Math.max(0.6, motion)));

/**
 * Whether a scene is a lesson's: no one speaks lines or acts, and it has
 * no story's set (the client's isLesson). A lesson may show a person the
 * kit draws, who may turn to look at another. Only a lesson's text is
 * paced.
 */
export function isLesson(
  scene: Pick<SceneDto, 'effects' | 'setting' | 'acting' | 'things'>,
): boolean {
  if (scene.setting?.full) return false;
  // Someone who only turns to look at another (a clinician at the teenager
  // she asks) is still a lesson's picture; one who walks, moves or talks
  // acts.
  if (
    Object.values(scene.acting ?? {}).some((one) =>
      Object.keys(one).some((key) => key !== 'look'),
    )
  )
    return false;
  return !scene.effects.some((e) => e.do === 'say');
}

const newcomersAt = (steps: readonly SceneStepDto[], k: number) =>
  steps[k].show.filter((id) => !steps[k - 1]?.show.includes(id));
const leaversAt = (steps: readonly SceneStepDto[], k: number) =>
  k > 0 ? steps[k - 1].show.filter((id) => !steps[k].show.includes(id)) : [];

/** How long a leaver takes to go, and a mover to move (timeline.ts EXIT_MS, MOVE_MS). */
const EXIT_MS = 380;
const MOVE_MS = 700;

/** A place on the stage, with the words it carries: its caption and its labels. */
type Placed = NonNullable<
  SceneDto['stagings']['wide']['places'][number][string]
>;
type Box = { x: number; y: number; w: number; h: number };

/** A place and everything set with it, as one box: its caption and labels too (timeline.ts extentOf). */
export function extentOf(at: Placed): Box {
  const c = at.caption;
  const boxes: Box[] = [
    at,
    ...(c
      ? [{ x: c.x, y: c.y, w: c.w, h: c.lines.length * c.size * 1.2 }]
      : []),
    ...(at.labels ?? []),
  ];
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const meets = (a: Box, b: Box) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;

/** The stage a newcomer waits on: where each thing stood, and how fast things move. */
export interface Room {
  places: readonly Record<string, Placed>[];
  motion: number;
}

/** The box a thing sweeps going from where it was at step `k - 1` to where it is at `k`; null when it stays. */
function wayOf(room: Room, k: number, id: string): Box | null {
  const from = room.places[k - 1]?.[id];
  const to = room.places[k]?.[id];
  if (
    !from ||
    !to ||
    (Math.abs(to.x - from.x) <= 2 &&
      Math.abs(to.y - from.y) <= 2 &&
      Math.abs(to.w - from.w) <= 2)
  )
    return null;
  const a = extentOf(from);
  const b = extentOf(to);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/**
 * How long a thing waits to move to its new place (timeline.ts moveWait):
 * where its way crosses something going, until that has mostly gone. So a
 * card never slides through one still fading.
 */
export function moveWait(
  steps: readonly SceneStepDto[],
  k: number,
  id: string,
  room: Room | null,
): number {
  if (!room || k === 0) return 0;
  const way = wayOf(room, k, id);
  if (!way) return 0;
  for (const other of leaversAt(steps, k)) {
    const was = room.places[k - 1]?.[other];
    if (was && meets(way, extentOf(was))) return Math.round(EXIT_MS * 0.85);
  }
  return 0;
}

/**
 * How long a newcomer waits for its room (timeline.ts roomWait): arriving
 * where something is still going, it comes once that has gone; where
 * something moves out of its way or past it, once that has mostly moved.
 * So a card never lands on the card it takes the place of, nor on one
 * still sliding aside (the list cards over one another at 3:32).
 */
export function roomWait(
  steps: readonly SceneStepDto[],
  k: number,
  id: string,
  room: Room | null,
): number {
  if (!room || k === 0) return 0;
  const target = room.places[k]?.[id];
  if (!target) return 0;
  const here = extentOf(target);
  let wait = 0;
  for (const other of steps[k - 1].show) {
    const was = room.places[k - 1]?.[other];
    if (!was) continue;
    if (!steps[k].show.includes(other)) {
      if (meets(here, extentOf(was))) wait = Math.max(wait, EXIT_MS * 0.85);
      continue;
    }
    const way = wayOf(room, k, other);
    if (way && meets(way, here))
      wait = Math.max(
        wait,
        moveWait(steps, k, other, room) + atMotion(MOVE_MS, room.motion) * 0.85,
      );
  }
  return Math.round(wait);
}

/** The room a lesson's scene makes, on its wide stage. */
export const roomOf = (
  scene: Pick<SceneDto, 'stagings'>,
  reading: Pick<SceneReading, 'motion'>,
): Room => ({ places: scene.stagings.wide.places, motion: reading.motion });

/** When a newcomer starts to arrive (timeline.ts entryStart). */
function entryStart(
  steps: readonly SceneStepDto[],
  k: number,
  id: string,
  room: Room | null = null,
): number {
  const newcomers = newcomersAt(steps, k);
  const clearing = newcomers.length > 0 && leaversAt(steps, k).length > 0;
  return (
    steps[k].atMs +
    Math.max(clearing ? CLEAR_FIRST_MS : 0, roomWait(steps, k, id, room)) +
    Math.max(0, newcomers.indexOf(id)) * STAGGER_MS
  );
}

/** When a newcomer starts to arrive on a lesson's stage, waiting for its room (or, `room` false, as it did before it waited). */
export function arrivalOf(
  scene: Pick<SceneDto, 'steps' | 'stagings'>,
  k: number,
  id: string,
  reading: Pick<SceneReading, 'motion'>,
  room = true,
): number {
  return entryStart(scene.steps, k, id, room ? roomOf(scene, reading) : null);
}

/** How long a newcomer takes to come up, and a mover to move, at a scene's motion. */
export const enterMsAt = (motion: number) => atMotion(ENTER_MS, motion);
export const moveMsAt = (motion: number) => atMotion(MOVE_MS, motion);
export { EXIT_MS };

/** When a new arrow starts to draw itself (timeline.ts drawStart). */
function drawStart(
  steps: readonly SceneStepDto[],
  k: number,
  arrow: { from: string; to: string },
  enterMs: number,
  room: Room | null = null,
): number {
  const newcomers = newcomersAt(steps, k);
  const late = Math.max(
    newcomers.indexOf(arrow.from),
    newcomers.indexOf(arrow.to),
  );
  return late >= 0
    ? entryStart(steps, k, newcomers[late], room) + enterMs * 0.6
    : steps[k].atMs;
}

// ── Words on the stage ────────────────────────────────────────────────────

/** The words code set inside a drawing (a working's lines, a graph's or a timeline's words). */
export function drawnWords(svg: string): number {
  let n = 0;
  for (const m of svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g))
    n += wordsIn(m[1].replace(/<[^>]+>/g, ' '));
  return n;
}

/** The words a thing brings onto the stage as it arrives (reading.ts wordsOnArrival). */
export function wordsOnArrival(thing: SceneThingDto): number {
  if (thing.kind === 'words') return wordsIn(thing.text);
  if (thing.kind === 'stat')
    return wordsIn(thing.value) + wordsIn(thing.caption);
  if (thing.backdrop || thing.rig) return 0;
  const later = new Set(thing.calloutsLater ?? []);
  let n = thing.caption ? wordsIn(thing.caption) : 0;
  for (const [part, text] of Object.entries(thing.callouts ?? {}))
    if (!later.has(part) && !/^trait-\d+$/.test(part)) n += wordsIn(text);
  if (thing.source) n += drawnWords(thing.svg);
  return n;
}

/** A label's words as its part is named: two where they cannot be told. */
export function labelWords(thing: SceneThingDto, part: string): number {
  if (thing.kind !== 'drawing') return 0;
  const set = thing.callouts?.[part];
  if (set) return wordsIn(set);
  return thing.labels[part] ? 2 : 0;
}

/** A span of the scene in which a thing's text is being read. */
export interface ReadingWindow {
  id: string;
  from: number;
  to: number;
  words: number;
}

/** Each text's reading window on a lesson's stage (timeline.ts readingWindows); none on a story's. */
export function windowsOf(
  scene: Pick<
    SceneDto,
    'steps' | 'things' | 'effects' | 'setting' | 'acting' | 'reading' | 'stage'
  > &
    Partial<Pick<SceneDto, 'stagings'>>,
  reading: SceneReading = readingOf(scene),
): ReadingWindow[] {
  if (!isLesson(scene)) return [];
  const byId = new Map(scene.things.map((t) => [t.id, t]));
  const room = scene.stagings ? roomOf(scene as SceneDto, reading) : null;
  const enter = atMotion(ENTER_MS, reading.motion);
  const out: ReadingWindow[] = [];
  const { steps } = scene;
  steps.forEach((step, k) => {
    for (const id of newcomersAt(steps, k)) {
      const thing = byId.get(id);
      const words = thing ? wordsOnArrival(thing) : 0;
      if (!words) continue;
      const from = entryStart(steps, k, id, room);
      out.push({
        id,
        from,
        to: from + enter + readMs(words, reading.wpm),
        words,
      });
    }
    const before = k > 0 ? steps[k - 1].arrows : [];
    for (const arrow of step.arrows) {
      if (!arrow.label || before.some((one) => one.id === arrow.id)) continue;
      const words = wordsIn(arrow.label);
      const from = drawStart(steps, k, arrow, enter, room);
      out.push({
        id: `arrow:${arrow.id}`,
        from,
        to: from + DRAW_MS + readMs(words, reading.wpm),
        words,
      });
    }
  });
  for (const effect of scene.effects) {
    if (effect.do !== 'point' || !effect.part) continue;
    const thing = byId.get(effect.target);
    const words = thing ? labelWords(thing, effect.part) : 0;
    if (!words) continue;
    out.push({
      id: effect.target,
      from: effect.atMs,
      to: effect.atMs + REVEAL_MS + readMs(words, reading.wpm),
      words,
    });
  }
  return out.sort((a, b) => a.from - b.from);
}

// ── Fixing what comes too fast ────────────────────────────────────────────

/** Two accents on the screen come at least this far apart, but for a thing and its own label. */
export const ACCENT_APART_MS = 600;
/** The accents: what the voice lands on in a thing already there. */
const ACCENTS: ReadonlySet<string> = new Set(['point', 'pulse', 'show']);
/** A step put off for its text to be read goes no further than this past where it was. */
export const STEP_WAIT_MOST_MS = 4000;
/** And never nearer the step after it than this. */
const STEP_ROOM_MS = 700;
/** A thing's place counts as moved past this, in stage units. */
const MOVED_UNITS = 2;

/** Whether text of `id` is taken away or moved at step `k`, on the wide stage. */
function disturbed(scene: SceneDto, k: number, id: string): boolean {
  const now = scene.steps[k];
  if (!now.show.includes(id)) return true;
  const places = scene.stagings.wide.places;
  const a = places[k - 1]?.[id];
  const b = places[k]?.[id];
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) > MOVED_UNITS ||
    Math.abs(a.y - b.y) > MOVED_UNITS ||
    Math.abs(a.w - b.w) > MOVED_UNITS ||
    Math.abs(a.h - b.h) > MOVED_UNITS
  );
}

/** When the first word said at or after `ms` starts, or null past the last. */
function wordFrom(scene: SceneDto, ms: number): number | null {
  for (const beat of scene.beats)
    for (const word of beat.words) if (word[2] >= ms) return word[2];
  return null;
}

/** A step taken out of the scene, with its layouts on every staging. */
function withoutStep(scene: SceneDto, k: number): void {
  scene.steps.splice(k, 1);
  for (const staging of Object.values(scene.stagings)) {
    staging.places.splice(k, 1);
    staging.pills?.splice(k, 1);
    staging.views?.splice(k, 1);
  }
}

/**
 * A list shown faster than it can be read, two items at a time: a run of
 * steps each adding one thing with words and taking none away, where the
 * next comes before the last is read. Each pair's first step is folded
 * into its second, which shows both, at the first's time.
 */
export function listsTwoAtATime(
  scene: SceneDto,
  reading: SceneReading,
): number {
  const byId = new Map(scene.things.map((t) => [t.id, t]));
  const enter = atMotion(ENTER_MS, reading.motion);
  const addsOne = (k: number) => {
    if (k < 0 || k >= scene.steps.length) return false;
    const added = newcomersAt(scene.steps, k);
    if (added.length !== 1 || leaversAt(scene.steps, k).length) return false;
    const thing = byId.get(added[0]);
    return Boolean(thing && wordsOnArrival(thing));
  };
  const readFor = (k: number) => {
    const thing = byId.get(newcomersAt(scene.steps, k)[0])!;
    return enter + readMs(wordsOnArrival(thing), reading.wpm);
  };
  let folded = 0;
  for (let k = 0; k < scene.steps.length; k += 1) {
    // A run of one-at-a-time items, each come before the one before is read.
    let end = k;
    while (
      addsOne(end) &&
      addsOne(end + 1) &&
      scene.steps[end + 1].atMs - scene.steps[end].atMs < readFor(end)
    )
      end += 1;
    if (end === k) continue;
    // Items k..end: fold k into k+1, k+2 into k+3, ...
    let i = k;
    let last = end;
    while (i < last) {
      scene.steps[i + 1].atMs = scene.steps[i].atMs;
      withoutStep(scene, i);
      folded += 1;
      last -= 1;
      i += 1;
    }
    k = i;
  }
  return folded;
}

/**
 * A stage change that would take away or move text still being read,
 * put off to the start of the next word after it has been, where that is
 * near enough and leaves room before the step after it. What arrives at
 * it, and what the voice does to that meanwhile, waits with it.
 */
export function stepsAfterReading(
  scene: SceneDto,
  reading: SceneReading,
): number {
  let moved = 0;
  for (let k = 1; k < scene.steps.length; k += 1) {
    const at = scene.steps[k].atMs;
    let need = at;
    for (const w of windowsOf(scene, reading))
      if (
        w.from < at &&
        w.to > at &&
        !w.id.startsWith('arrow:') &&
        disturbed(scene, k, w.id)
      )
        need = Math.max(need, w.to);
    if (need <= at) continue;
    const to = wordFrom(scene, need) ?? need;
    const next = scene.steps[k + 1]?.atMs ?? Infinity;
    if (to - at > STEP_WAIT_MOST_MS || to > next - STEP_ROOM_MS) continue;
    if (to > scene.durationMs) continue;
    const arriving = new Set(newcomersAt(scene.steps, k));
    scene.steps[k].atMs = to;
    for (const effect of scene.effects)
      if (effect.atMs >= at && effect.atMs < to && arriving.has(effect.target))
        effect.atMs = to;
    moved += 1;
  }
  return moved;
}

/**
 * Accents one at a time: a point, pulse or state shown on another thing
 * less than ACCENT_APART_MS after the last waits until then, where the
 * stage does not change before; a filler that cannot wait is left out.
 */
export function oneAccentAtATime(scene: SceneDto): number {
  let changed = 0;
  const effects = [...scene.effects].sort((a, b) => a.atMs - b.atMs);
  const placed: SceneEffectDto[] = [];
  const dropped = new Set<SceneEffectDto>();
  for (const effect of effects) {
    if (!ACCENTS.has(effect.do)) continue;
    // After the latest accent on anything else so far.
    const others = placed.filter((one) => one.target !== effect.target);
    const want = others.length
      ? Math.max(...others.map((one) => one.atMs)) + ACCENT_APART_MS
      : -Infinity;
    if (effect.atMs < want) {
      const change = scene.steps.find(
        (s) => s.atMs > effect.atMs && s.atMs <= want,
      );
      if (!change && want < scene.durationMs) {
        effect.atMs = want;
        changed += 1;
      } else if (effect.filler) {
        dropped.add(effect);
        changed += 1;
        continue;
      }
    }
    placed.push(effect);
  }
  scene.effects = scene.effects
    .filter((e) => !dropped.has(e))
    .sort((a, b) => a.atMs - b.atMs);
  return changed;
}

// ── Holding still: no flicker ─────────────────────────────────────────────

/**
 * The least a stage stays on the screen before it changes again, for a
 * grown-up; longer at a child's motion (atMotion). Anything quicker reads
 * as a glitch, not a cut: the eye has not found what changed before it
 * changes back.
 */
export const HOLD_MS = 1200;

/** The hold at a scene's motion. */
export const holdMsOf = (reading: Pick<SceneReading, 'motion'>): number =>
  Math.round(atMotion(HOLD_MS, reading.motion));

/** A change of the picture that comes too soon after the one before it. */
export interface Flicker {
  /** When the change comes, in the scene's time. */
  atMs: number;
  /** How long the picture before it stayed. */
  heldMs: number;
  /**
   * `stage`: a stage that stays less than the hold; `flip`: one that goes
   * and comes straight back (A, B, A); `camera`: a zoom straight after a
   * change of the stage or another zoom.
   */
  kind: 'stage' | 'flip' | 'camera';
  /** The step the change is, or the zoom's target. */
  what: string;
}

const sameShow = (a: SceneStepDto, b: SceneStepDto) =>
  a.show.length === b.show.length && a.show.every((id) => b.show.includes(id));

/**
 * Every change of a scene's picture that comes too soon after the last
 * (the flicker check, for the rhythm log and the tests): a stage held
 * less than `hold`, a stage that flips back, a zoom straight after a
 * change. The last stage holds to the scene's end.
 */
export function flickersOf(
  scene: Pick<SceneDto, 'steps' | 'effects' | 'durationMs'>,
  hold = HOLD_MS,
): Flicker[] {
  const out: Flicker[] = [];
  const { steps } = scene;
  for (let k = 1; k < steps.length; k += 1) {
    const held = steps[k].atMs - steps[k - 1].atMs;
    if (k >= 2 && sameShow(steps[k - 2], steps[k]) && held < hold * 2)
      out.push({
        atMs: steps[k].atMs,
        heldMs: held,
        kind: 'flip',
        what: `step ${k}`,
      });
    else if (held < hold)
      out.push({
        atMs: steps[k].atMs,
        heldMs: held,
        kind: 'stage',
        what: `step ${k}`,
      });
  }
  const changes = steps.map((step) => step.atMs);
  const zooms = scene.effects.filter((e) => e.do === 'zoom');
  for (const zoom of zooms) {
    const last = [
      ...changes,
      ...zooms.filter((z) => z !== zoom).map((z) => z.atMs),
    ]
      .filter((at) => at <= zoom.atMs)
      .reduce((a, b) => Math.max(a, b), -Infinity);
    const next = changes.find((at) => at > zoom.atMs) ?? Infinity;
    const held = Math.min(zoom.atMs - last, next - zoom.atMs);
    if (held < hold)
      out.push({
        atMs: zoom.atMs,
        heldMs: Math.round(held),
        kind: 'camera',
        what: zoom.target,
      });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** The effects between two times on things not on a stage, left out: they would act on nothing. */
function dropStrays(
  scene: SceneDto,
  from: number,
  to: number,
  shown: readonly string[],
): void {
  scene.effects = scene.effects.filter(
    (e) =>
      e.atMs < from ||
      e.atMs >= to ||
      shown.includes(e.target) ||
      e.do === 'say',
  );
}

/**
 * Every stage held at least `hold` (the flicker fix), by code, never by a
 * model, over and over until none is quicker:
 *
 *  - a stage that goes and comes straight back (A, B, A) is not shown:
 *    A stays, and what was done to B's own things meanwhile is left out;
 *  - a stage that only adds to the one before it comes with it, at its
 *    time: two items of a list arrive together rather than one a blink
 *    after the other;
 *  - else the next change waits until this one has held, where it can
 *    (before the change after it, and in the scene), bringing what
 *    arrives at it and what is done to them;
 *  - else the quick stage is not shown: the one before it goes straight
 *    to the one after.
 *
 * A zoom straight after a change, or before one, is left out: the camera
 * stays. What was done, for the log.
 */
export function steadyStages(scene: SceneDto, hold: number): string[] {
  const notes: string[] = [];
  let flips = 0;
  let joined = 0;
  let waited = 0;
  let dropped = 0;
  for (let guard = 0; guard < 400; guard += 1) {
    const { steps } = scene;
    const k = steps.findIndex(
      (step, i) => i + 1 < steps.length && steps[i + 1].atMs - step.atMs < hold,
    );
    if (k < 0) break;
    const now = steps[k];
    const next = steps[k + 1];
    const prev = steps[k - 1];
    if (prev && sameShow(prev, next)) {
      dropStrays(scene, now.atMs, next.atMs, prev.show);
      withoutStep(scene, k + 1);
      withoutStep(scene, k);
      flips += 1;
      continue;
    }
    // A, then B for a blink, then A again: B is not shown, and A stays.
    const back = steps[k + 2];
    if (back && sameShow(now, back) && back.atMs - next.atMs < hold) {
      dropStrays(scene, next.atMs, back.atMs, now.show);
      withoutStep(scene, k + 2);
      withoutStep(scene, k + 1);
      flips += 1;
      continue;
    }
    if (now.show.every((id) => next.show.includes(id)) && !next.cut) {
      next.atMs = now.atMs;
      for (const [id, how] of Object.entries(now.enter)) next.enter[id] ??= how;
      withoutStep(scene, k);
      joined += 1;
      continue;
    }
    const want = now.atMs + hold;
    const after = steps[k + 2]?.atMs ?? scene.durationMs + hold;
    if (want <= after - hold) {
      const arriving = new Set(
        next.show.filter((id) => !now.show.includes(id)),
      );
      for (const effect of scene.effects)
        if (
          effect.atMs >= next.atMs &&
          effect.atMs < want &&
          arriving.has(effect.target)
        )
          effect.atMs = want;
      next.atMs = want;
      waited += 1;
      continue;
    }
    if (k === 0) {
      next.atMs = now.atMs;
      withoutStep(scene, 0);
    } else {
      dropStrays(scene, now.atMs, next.atMs, next.show);
      withoutStep(scene, k);
    }
    dropped += 1;
  }
  // The camera stays where a zoom would come straight after a change, or
  // straight before one.
  const zooms = flickersOf(scene, hold).filter((f) => f.kind === 'camera');
  if (zooms.length) {
    const at = new Set(zooms.map((f) => `${f.atMs}:${f.what}`));
    scene.effects = scene.effects.filter(
      (e) => e.do !== 'zoom' || !at.has(`${e.atMs}:${e.target}`),
    );
  }
  if (flips)
    notes.push(
      `${flips} stage${flips === 1 ? '' : 's'} that flipped straight back not shown`,
    );
  if (joined)
    notes.push(
      `${joined} quick stage${joined === 1 ? '' : 's'} brought on with the next`,
    );
  if (waited)
    notes.push(
      `${waited} stage change${waited === 1 ? '' : 's'} held back to hold ${hold}ms`,
    );
  if (dropped)
    notes.push(
      `${dropped} stage${dropped === 1 ? '' : 's'} too quick to see not shown`,
    );
  if (zooms.length)
    notes.push(
      `${zooms.length} zoom${zooms.length === 1 ? '' : 's'} straight after a change left out`,
    );
  return notes;
}

/**
 * A lesson's text paced to be read (Ask 3 B), by code: lists two at a
 * time, stage changes after their text is read, accents one at a time,
 * and every stage held long enough to see (steadyStages).
 * The scene is changed where it stands; what was done, for the log.
 */
export function textPacing(
  scene: SceneDto,
  reading: SceneReading = readingOf(scene),
): string[] {
  if (!isLesson(scene)) return [];
  const notes: string[] = [];
  // A build's diagram grows a thing at a time, each drawn on: not folded.
  const folded = scene.board ? 0 : listsTwoAtATime(scene, reading);
  if (folded)
    notes.push(
      `a list too quick to read shown two at a time (${folded} step${folded === 1 ? '' : 's'} folded)`,
    );
  const waited = stepsAfterReading(scene, reading);
  if (waited)
    notes.push(
      `${waited} stage change${waited === 1 ? '' : 's'} put off until its text is read`,
    );
  const spaced = oneAccentAtATime(scene);
  if (spaced)
    notes.push(
      `${spaced} accent${spaced === 1 ? '' : 's'} spaced one at a time`,
    );
  // No stage quicker than the eye (the flicker fix), whatever made it so.
  const steadied = steadyStages(scene, holdMsOf(reading));
  notes.push(...steadied);
  if (
    (folded || waited || spaced || steadied.length) &&
    scene.settledMs !== undefined
  )
    scene.settledMs = settledOf(scene);
  return notes;
}

// ── Cards ────────────────────────────────────────────────────────────────

/** Words a key noun phrase does not begin or end with. */
const EDGE_WORDS = new Set(
  'a an the this that these those its their our your his her of and or to in on for with by from at as is are'.split(
    ' ',
  ),
);
/** Where a noun phrase ends: a verb or a word that starts a clause. */
const PHRASE_ENDS = new Set(
  'is are was were be been has have had can could will would should may might must do does did never always often makes make made turns turn becomes become keeps keep gives give needs need uses use means mean stops stop helps help lets let gets get goes go comes come takes take moves move changes change grows grow carries carry contains contain holds hold produces produce stores store sends send pumps pump flows flow works work happens happen lives live eats eat causes cause creates create protects protect controls control depends depend which that who where when because so but if than then while'.split(
    ' ',
  ),
);

/**
 * A card's words cut to its key noun phrase, `most` words at most: the
 * term before a colon or a dash, else its words up to where a verb or a
 * clause begins, its edges' little words left off. Unchanged when short
 * enough already.
 */
export function keyPhrase(text: string, most: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= most) return text.trim();
  const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '');
  const trim = (list: string[]) => {
    const out = [...list];
    while (out.length > 1 && EDGE_WORDS.has(bare(out[0]))) out.shift();
    while (out.length > 1 && EDGE_WORDS.has(bare(out[out.length - 1])))
      out.pop();
    return out;
  };
  // The term before a colon, a dash or a comma.
  const head = text.split(/\s*(?::|—|–|\s-\s|,|;|\()\s*/)[0];
  const headWords = trim(head.split(/\s+/).filter(Boolean));
  if (head !== text && headWords.length && headWords.length <= most)
    return headWords.join(' ').replace(/[.,;:!?]+$/, '');
  // Its words until a verb or a clause begins.
  const phrase: string[] = [];
  for (const [i, w] of words.entries()) {
    if (i > 0 && PHRASE_ENDS.has(bare(w))) break;
    phrase.push(w);
  }
  return trim(phrase)
    .slice(0, most)
    .join(' ')
    .replace(/[.,;:!?]+$/, '');
}

/**
 * A script's keyword cards cut to their audience's `cardWords` (Ask 3 B):
 * on-screen text stays at keywords, never the narration. Titles are kept.
 */
export function trimCards(
  script: SceneScript,
  cardWords: number | undefined,
): SceneScript {
  if (!cardWords) return script;
  let changed = false;
  const cast = script.cast.map((thing) => {
    if (thing.kind !== 'words' || thing.style !== 'keyword') return thing;
    const text = keyPhrase(thing.text, cardWords);
    if (text === thing.text) return thing;
    changed = true;
    return { ...thing, text };
  });
  return changed ? { ...script, cast } : script;
}

// ── The rhythm log ───────────────────────────────────────────────────────

/** A scene's accents: what the voice lands on (points, pulses, states shown, zooms) and every arrival. */
export function accentTimes(
  scene: Pick<SceneDto, 'steps' | 'effects'>,
): number[] {
  const out: number[] = [];
  scene.steps.forEach((_, k) => {
    for (const id of newcomersAt(scene.steps, k))
      out.push(entryStart(scene.steps, k, id));
  });
  for (const e of scene.effects)
    if (ACCENTS.has(e.do) || e.do === 'zoom' || e.do === 'hide')
      out.push(e.atMs);
  return out.sort((a, b) => a - b);
}

/**
 * How a lesson reads (the rhythm log's additions): the shortest time a
 * text is left after it has been read before it goes or moves (below 0,
 * taken too soon), accents a minute, the longest the camera holds still
 * for reading, and the longest stretch without an accent (over 12 s is
 * still; the ambient layer is always on).
 */
export function readingRhythm(
  scene: SceneDto,
  reading: SceneReading = readingOf(scene),
): {
  readLeftMs: number | null;
  accentsPerMinute: number;
  heldMs: number;
  quietMs: number;
} {
  const windows = windowsOf(scene, reading);
  let left: number | null = null;
  for (const w of windows) {
    if (w.id.startsWith('arrow:')) continue;
    const k = scene.steps.findIndex(
      (step, i) => step.atMs > w.from && disturbed(scene, i, w.id),
    );
    const stays = k >= 0 ? scene.steps[k].atMs : Infinity;
    if (Number.isFinite(stays))
      left = Math.min(left ?? Infinity, Math.round(stays - w.to));
  }
  const merged: [number, number][] = [];
  for (const w of [...windows].sort((a, b) => a.from - b.from)) {
    const last = merged[merged.length - 1];
    if (last && w.from <= last[1]) last[1] = Math.max(last[1], w.to);
    else merged.push([w.from, w.to]);
  }
  const accents = accentTimes(scene);
  const times = [0, ...accents, scene.durationMs].sort((a, b) => a - b);
  let quietMs = 0;
  for (let i = 1; i < times.length; i += 1)
    quietMs = Math.max(quietMs, times[i] - times[i - 1]);
  const minutes = Math.max(scene.durationMs, 1) / 60_000;
  return {
    readLeftMs: left,
    accentsPerMinute: Math.round((accents.length / minutes) * 10) / 10,
    heldMs: Math.round(
      merged.reduce((most, [a, b]) => Math.max(most, b - a), 0),
    ),
    quietMs: Math.round(quietMs),
  };
}
