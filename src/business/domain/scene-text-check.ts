/**
 * The text check (studio-glitch-plan §3): every run of words on a scene's
 * stage measured against every other and against the things, at every
 * step and on every staging, and, on a lesson's stage, while it changes:
 * a newcomer's words against what is still going and what still moves
 * aside. By code; what it finds is logged and tested, and what makes it
 * is put right where it is made (the layout, the gate, the arrival's
 * wait for its room).
 *
 * Words are measured as they are set: a caption's and a card's lines at
 * their size and weight, centred; a label's box; an arrow's label on its
 * arrow.
 */
import type { SceneDto, ScenePlaceDto } from '../../contracts';
import { measureText } from './scene-font';
import { arrowPath, pillBox } from './scene-labels';
import {
  EXIT_MS,
  arrivalOf,
  enterMsAt,
  extentOf,
  isLesson,
  moveMsAt,
  moveWait,
  roomOf,
  readingOf,
  type SceneReading,
} from './scene-reading';

type Box = { x: number; y: number; w: number; h: number };
type Staging = keyof SceneDto['stagings'];

/** A run of words on the stage: whose, which, and where. */
export interface WordsBox {
  owner: string;
  what: 'caption' | 'card' | 'label' | 'pill' | 'stat';
  text: string;
  box: Box;
  /** The size its words are set at, in stage units. */
  size: number;
}

/** Two things on the stage at once where they should not be. */
export interface TextOverlap {
  staging: Staging;
  step: number;
  atMs: number;
  /** `words`: words on words; `thing`: words on another thing; `passing`: while the stage changes. */
  kind: 'words' | 'thing' | 'passing';
  a: string;
  b: string;
}

const LINE = 1.2;

const shared = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const area = (b: Box) => b.w * b.h;

/** Lines of words centred in a width from a top, as set. */
function linesBox(
  lines: readonly string[],
  size: number,
  x: number,
  w: number,
  y: number,
  weight: 600 | 700,
): Box {
  const wide = Math.min(
    w,
    Math.max(...lines.map((line) => measureText(line, size, weight))),
  );
  return { x: x + (w - wide) / 2, y, w: wide, h: lines.length * size * LINE };
}

/** Every run of words set at one step of a staging. */
export function wordsAt(
  scene: Pick<SceneDto, 'things' | 'steps' | 'stagings'>,
  staging: Staging,
  k: number,
): WordsBox[] {
  const stage = scene.stagings[staging];
  const places = stage.places[k] ?? {};
  const byId = new Map(scene.things.map((t) => [t.id, t]));
  const out: WordsBox[] = [];
  for (const [id, at] of Object.entries(places)) {
    const thing = byId.get(id);
    const c = at.caption;
    if (c && c.lines.length)
      out.push({
        owner: id,
        what:
          thing?.kind === 'words'
            ? 'card'
            : thing?.kind === 'stat'
              ? 'stat'
              : 'caption',
        text: c.lines.join(' '),
        size: c.size,
        box: linesBox(
          c.lines,
          c.size,
          c.x,
          c.w,
          c.y,
          thing?.kind === 'words' ? 700 : 600,
        ),
      });
    for (const label of at.labels ?? [])
      out.push({
        owner: id,
        what: 'label',
        text: label.lines.join(' '),
        size: label.size,
        box: { x: label.x, y: label.y, w: label.w, h: label.h },
      });
  }
  const step = scene.steps[k];
  for (const arrow of step?.arrows ?? []) {
    const pill = stage.pills?.[k]?.[arrow.id];
    const a = places[arrow.from];
    const b = places[arrow.to];
    if (!pill || !a || !b || !arrow.label) continue;
    out.push({
      owner: arrow.id,
      what: 'pill',
      text: arrow.label,
      size: pill.size,
      box: pillBox(arrowPath(a, b, step.layout === 'cycle', stage), pill),
    });
  }
  return out;
}

/** Words on words, and words on another thing, at every step of a staging as it stands. */
export function standingOverlaps(
  scene: Pick<SceneDto, 'things' | 'steps' | 'stagings'>,
  staging: Staging,
): TextOverlap[] {
  const out: TextOverlap[] = [];
  const byId = new Map(scene.things.map((t) => [t.id, t]));
  scene.steps.forEach((step, k) => {
    const words = wordsAt(scene, staging, k);
    for (let i = 0; i < words.length; i += 1)
      for (let j = i + 1; j < words.length; j += 1) {
        const a = words[i];
        const b = words[j];
        const both = shared(a.box, b.box);
        if (both > 20 && both > Math.min(area(a.box), area(b.box)) * 0.02)
          out.push({
            staging,
            step: k,
            atMs: step.atMs,
            kind: 'words',
            a: `${a.owner}:${a.what}`,
            b: `${b.owner}:${b.what}`,
          });
      }
    // Words over another thing's picture (a card is all words).
    const places = scene.stagings[staging].places[k] ?? {};
    for (const w of words)
      for (const [id, at] of Object.entries(places)) {
        if (id === w.owner || byId.get(id)?.kind === 'words') continue;
        if (shared(w.box, at) > area(w.box) * 0.15)
          out.push({
            staging,
            step: k,
            atMs: step.atMs,
            kind: 'thing',
            a: `${w.owner}:${w.what}`,
            b: id,
          });
      }
  });
  return out;
}

/** Whether a place carries words. */
const worded = (
  scene: Pick<SceneDto, 'things'>,
  id: string,
  at: ScenePlaceDto | undefined,
) =>
  Boolean(at?.caption?.lines.length || at?.labels?.length) ||
  scene.things.some(
    (t) => t.id === id && (t.kind === 'words' || t.kind === 'stat'),
  );

const lerp = (a: Box, b: Box, p: number): Box => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: a.w + (b.w - a.w) * p,
  h: a.h + (b.h - a.h) * p,
});
const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/**
 * On a lesson's stage, while it changes: a newcomer with words, once it
 * shows, against what is still going (until it has mostly gone) and what
 * still moves aside, sampled every 40 ms. `room` false times arrivals as
 * the player did before they waited for their room.
 */
export function passingOverlaps(
  scene: SceneDto,
  reading: Pick<SceneReading, 'motion'> = readingOf(scene),
  room = true,
): TextOverlap[] {
  if (!isLesson(scene)) return [];
  const out: TextOverlap[] = [];
  const places = scene.stagings.wide.places;
  const enter = enterMsAt(reading.motion);
  const move = moveMsAt(reading.motion);
  for (let k = 1; k < scene.steps.length; k += 1) {
    const now = scene.steps[k];
    const was = scene.steps[k - 1];
    const seen = new Set<string>();
    for (const id of now.show.filter((one) => !was.show.includes(one))) {
      const at = places[k]?.[id];
      if (!at || !worded(scene, id, at)) continue;
      const here = extentOf(at);
      const shows = arrivalOf(scene, k, id, reading, room) + enter * 0.15;
      const until = now.atMs + Math.max(move, EXIT_MS);
      for (const other of was.show) {
        const from = places[k - 1]?.[other];
        if (!from || seen.has(other)) continue;
        const going = !now.show.includes(other);
        const to = places[k]?.[other];
        for (let t = Math.max(shows, now.atMs); t <= until; t += 40) {
          let box: Box | null;
          if (going) box = t < now.atMs + EXIT_MS * 0.7 ? extentOf(from) : null;
          else {
            if (!to) break;
            const p = easeInOut(
              Math.max(
                0,
                Math.min(
                  1,
                  (t -
                    now.atMs -
                    (room
                      ? moveWait(scene.steps, k, other, roomOf(scene, reading))
                      : 0)) /
                    move,
                ),
              ),
            );
            box = lerp(extentOf(from), extentOf(to), p);
          }
          if (!box) continue;
          const both = shared(here, box);
          if (both > 20 && both > Math.min(area(here), area(box)) * 0.02) {
            seen.add(other);
            out.push({
              staging: 'wide',
              step: k,
              atMs: Math.round(t),
              kind: 'passing',
              a: id,
              b: other,
            });
            break;
          }
        }
      }
    }
  }
  return out;
}

/** Everything the text check finds in a scene, on both stagings and in passing. */
export function textOverlaps(
  scene: SceneDto,
  reading: Pick<SceneReading, 'motion'> = readingOf(scene),
): TextOverlap[] {
  return [
    ...standingOverlaps(scene, 'box'),
    ...standingOverlaps(scene, 'wide'),
    ...passingOverlaps(scene, reading),
  ];
}
