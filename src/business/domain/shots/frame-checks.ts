/**
 * The frame checks (explainer-animation-plan.md §9.2; tech §4.1): code that
 * looks at a scene's stills, and at what the render page says was on the
 * frame in each (`__render.inspect`), and finds what breaks the rules. A
 * jet engine covering 0.7% of the frame and a word card up a third of the
 * time both shipped because nothing looked; these look, every time, for
 * free, before the critic (WP13) or anyone else does.
 *
 * Every threshold comes from the rules file (studio/explainer-rules.ts).
 * The checks, by axis:
 *  - composition: the subject's share of the frame (FOCAL), a frame of
 *    words with no picture, a blank frame, a flash between stills;
 *  - readability: text under the size floors (TEXT, against the frame's
 *    short side: the research gives its sizes at 1080 px, which is a wide
 *    frame's height and a tall one's width), text under its contrast floor
 *    against the pixels just outside it (CONTRAST), words on words, on
 *    their own subject or on the captions, text outside the safe area;
 *  - pace, from the scene's data: information events too close or too far
 *    apart (PACE), words up for less than their reading time (dwellMs),
 *    an episode that opens with nothing changing;
 *  - truth: word cards standing in for pictures, the figure kit's people
 *    in a lesson (stand-ins, stock figures, drawn likenesses), and
 *    subjects too small to be pictures at all.
 *
 * Each axis is scored 0 to 10 from the share of the scene that fails it,
 * so a long scene is not marked down for being long; the headline numbers
 * are the word cards' share of the scene's time and the subject's share
 * of the frame. Pure: the stills come in as decoded RGBA pixels.
 */
import type { FilmShape, SceneDto, SceneThingDto } from '../../../contracts';
import { isLesson, wordsIn } from '../scene-reading';
import { hexRgb, linearRgb, type Rgb } from '../scene-themes';
import {
  CONTRAST,
  FOCAL,
  FRAME_CHECKS,
  LOOP,
  PACE,
  SAFE,
  SAFETY,
  TEXT,
  dwellMs,
  type BannedThing,
} from '../studio/explainer-rules';

// ── What the render page reports (the client's InspectReport) ─────────────

/** A box on the frame, in its pixels: x, y, w, h. */
export type FrameBox = [number, number, number, number];

export type FrameRole =
  | 'focal'
  | 'label'
  | 'number'
  | 'chip'
  | 'tag'
  | 'caption'
  | 'actor'
  | 'set'
  | 'info';

/** One thing on the frame (the client's InspectItem, lib/shots/types.ts). */
export interface FrameItem {
  id: string;
  role: FrameRole;
  box: FrameBox;
  text?: string;
  /** In the frame's pixels. */
  fontPx?: number;
  /** Its font weight (400 regular, 700 bold), when the page says: bold text is large from TEXT.largeBold. */
  weight?: number;
  /** CSS colours: the text's, and what it sits on when the page knows it. */
  fg?: string;
  bg?: string;
  opacity?: number;
  /** A word card standing in for a picture (today's stage). */
  card?: boolean;
  /** What it names or belongs to, by id. */
  of?: string;
  /** The scene it is drawn in, by id. */
  scene?: string;
}

/** What was on the frame at a moment (the client's InspectReport). */
export interface FrameReport {
  ms: number;
  shape: FilmShape;
  width: number;
  height: number;
  shot?: string;
  items: FrameItem[];
}

/** A still, decoded: RGBA, four bytes a pixel, at any size (it is scaled to the frame's). */
export interface StillImage {
  width: number;
  height: number;
  data: Uint8Array;
}

// ── What the checks find ───────────────────────────────────────────────────

export const FRAME_AXES = [
  'readability',
  'composition',
  'pace',
  'truth',
] as const;
export type FrameAxis = (typeof FRAME_AXES)[number];

export type FrameCode =
  | 'focal-small'
  | 'no-picture'
  | 'blank'
  | 'flash'
  | 'text-small'
  | 'caption-small'
  | 'contrast-low'
  | 'words-overlap'
  | 'covers-subject'
  | 'on-caption'
  | 'outside-safe'
  | 'gap-short'
  | 'gap-long'
  | 'dwell-short'
  | 'first-late'
  | 'word-card'
  | 'person'
  | 'tiny-subject';

/** Which score each problem counts against. */
export const AXIS_OF: Readonly<Record<FrameCode, FrameAxis>> = {
  'focal-small': 'composition',
  'no-picture': 'composition',
  blank: 'composition',
  flash: 'composition',
  'text-small': 'readability',
  'caption-small': 'readability',
  'contrast-low': 'readability',
  'words-overlap': 'readability',
  'covers-subject': 'readability',
  'on-caption': 'readability',
  'outside-safe': 'readability',
  'gap-short': 'pace',
  'gap-long': 'pace',
  'dwell-short': 'pace',
  'first-late': 'pace',
  'word-card': 'truth',
  person: 'truth',
  'tiny-subject': 'truth',
};

export interface FrameProblem {
  code: FrameCode;
  axis: FrameAxis;
  /** Where in the scene, on its own clock. */
  ms: number;
  /** The still it was seen in, by index; absent for what the scene's data says. */
  still?: number;
  /** What it is about. */
  ids?: string[];
  /** What was measured, against what the rules ask. */
  value?: number;
  limit?: number;
  /** How badly, 0 to 1: 1 a failure outright (absent, 1); less for words a little under their floor. */
  severity?: number;
  /** For something an explainer never shows: which of the rules' bans. */
  banned?: BannedThing;
  message: string;
}

/** What one still came to: its subject's share of the frame, its brightness and ink, and what failed in it. */
export interface StillFacts {
  ms: number;
  /** The subject the frame was judged by, by id; null when it shows none. */
  subject: string | null;
  /** The subject's share of the frame's area and of its height. */
  area: number | null;
  height: number | null;
  /** Mean relative luminance, 0 to 1, and the share of it that is ink. */
  luminance: number | null;
  ink: number | null;
  codes: FrameCode[];
}

export interface FrameScores {
  readability: number;
  composition: number;
  pace: number;
  truth: number;
  /** The mean of the four. */
  overall: number;
  /** Every axis at the loop's pass score or over. */
  pass: boolean;
  /** The share of the scene's time a word card is on screen. */
  cardShare: number;
  /** The share of it the figure kit's people are on screen in a lesson. */
  personShare: number;
  /** The subject's share of the frame, the median over the stills that have one: of its area, and of its height. */
  focalShare: number | null;
  focalHeight: number | null;
  stills: number;
}

export interface FrameCheckInput {
  scene: SceneDto;
  /** What the render page reported at each still, `ms` on the scene's own clock; null where it could not say. */
  reports: (FrameReport | null)[];
  /** The stills themselves, decoded, in the same order; absent, the pixel checks (contrast, blank, flash) are not run. */
  pixels?: (StillImage | null)[];
  shape: FilmShape;
  /** The scene's id: in a join, the other scene's things share the frame and are not this one's. */
  sceneId?: string;
  /** Stills taken in a join, where two pictures share the frame by design. */
  joins?: boolean[];
  /** The episode's first scene: its first change must come by PACE.firstChangeMs. */
  first?: boolean;
}

export interface FrameCheckResult {
  problems: FrameProblem[];
  scores: FrameScores;
  stills: StillFacts[];
}

// ── Colour and pixels ──────────────────────────────────────────────────────

/** A CSS colour as the page writes it (#hex, rgb(), rgba()), with its alpha; null for none. */
export function colourOf(
  css: string | undefined | null,
): { rgb: Rgb; alpha: number } | null {
  if (!css) return null;
  const said = css.trim().toLowerCase();
  if (!said || said === 'none' || said === 'transparent') return null;
  const hex = said.startsWith('#') ? hexRgb(said) : null;
  if (hex) {
    const long = /^#[0-9a-f]{8}$/.exec(said);
    return {
      rgb: hex,
      alpha: long ? parseInt(said.slice(7, 9), 16) / 255 : 1,
    };
  }
  const rgb =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(
      said,
    );
  if (!rgb) return null;
  const alpha =
    rgb[4] === undefined
      ? 1
      : rgb[4].endsWith('%')
        ? parseFloat(rgb[4]) / 100
        : parseFloat(rgb[4]);
  return {
    rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])],
    alpha: Math.min(1, Math.max(0, alpha)),
  };
}

/** WCAG's relative luminance, 0 to 1. */
export function luminanceOf(rgb: Rgb): number {
  const [r, g, b] = linearRgb(rgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG's contrast ratio, 1 to 21. */
export function contrastOf(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A colour laid over another at an alpha. */
export const over = (top: Rgb, alpha: number, under: Rgb): Rgb =>
  top.map((c, i) => c * alpha + under[i] * (1 - alpha)) as Rgb;

/** Each 8-bit value's linear light, once. */
const LINEAR = Array.from({ length: 256 }, (_, v) => linearRgb([v, v, v])[0]);

/**
 * A still's brightness and how much of it is ink, from a grid of about
 * 200 × 120 of its pixels: its mean relative luminance, and the share of
 * them whose luma is off the frame's median (its paper) by FRAME_CHECKS.inkLuma.
 * Ink is the stage's own: what lies in `except` (the captions, the chip,
 * boxes in the frame's pixels) is left out of it, so a frame of nothing
 * but its captions is blank.
 */
export function stillStats(
  image: StillImage,
  except: { boxes: FrameBox[]; width: number; height: number } | null = null,
): {
  luminance: number;
  ink: number;
} {
  const stepX = Math.max(1, Math.floor(image.width / 200));
  const stepY = Math.max(1, Math.floor(image.height / 120));
  const sx = except ? except.width / image.width : 1;
  const sy = except ? except.height / image.height : 1;
  const outside = (x: number, y: number) =>
    !except?.boxes.some(
      ([bx, by, bw, bh]) =>
        x * sx >= bx && x * sx < bx + bw && y * sy >= by && y * sy < by + bh,
    );
  const lumas: number[] = [];
  const stage: number[] = [];
  let light = 0;
  for (let y = 0; y < image.height; y += stepY)
    for (let x = 0; x < image.width; x += stepX) {
      const at = (y * image.width + x) * 4;
      const r = image.data[at];
      const g = image.data[at + 1];
      const b = image.data[at + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumas.push(luma);
      if (outside(x, y)) stage.push(luma);
      light += 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
    }
  if (!lumas.length) return { luminance: 0, ink: 0 };
  if (!stage.length) return { luminance: round3(light / lumas.length), ink: 0 };
  const median = medianOf(stage);
  const far = FRAME_CHECKS.inkLuma * 255;
  const ink = stage.filter((l) => Math.abs(l - median) > far).length;
  return {
    luminance: round3(light / lumas.length),
    ink: round3(ink / stage.length),
  };
}

/**
 * The colour just outside a box (FRAME_CHECKS.ringPx out from its edges):
 * the median of each channel, so a stray line through the band does not
 * move it. Null when the band is off the still.
 */
export function ringColour(
  image: StillImage,
  box: FrameBox,
  frame: { width: number; height: number },
): Rgb | null {
  const sx = image.width / frame.width;
  const sy = image.height / frame.height;
  const [near, far] = FRAME_CHECKS.ringPx;
  const x0 = Math.max(0, Math.floor((box[0] - far) * sx));
  const y0 = Math.max(0, Math.floor((box[1] - far) * sy));
  const x1 = Math.min(image.width, Math.ceil((box[0] + box[2] + far) * sx));
  const y1 = Math.min(image.height, Math.ceil((box[1] + box[3] + far) * sy));
  const ix0 = (box[0] - near) * sx;
  const iy0 = (box[1] - near) * sy;
  const ix1 = (box[0] + box[2] + near) * sx;
  const iy1 = (box[1] + box[3] + near) * sy;
  const counts = [
    new Uint32Array(256),
    new Uint32Array(256),
    new Uint32Array(256),
  ];
  let n = 0;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      if (x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue;
      const at = (y * image.width + x) * 4;
      counts[0][image.data[at]] += 1;
      counts[1][image.data[at + 1]] += 1;
      counts[2][image.data[at + 2]] += 1;
      n += 1;
    }
  if (!n) return null;
  return counts.map((hist) => {
    let seen = 0;
    for (let v = 0; v < 256; v += 1) {
      seen += hist[v];
      if (seen * 2 >= n) return v;
    }
    return 255;
  }) as Rgb;
}

/**
 * Whether a box's ink reaches the frame's edge where the box meets it (within
 * `edge` frame pixels): words whose glyphs run off the frame are cut; words
 * whose box only runs past it (to the font's descent, below its glyphs) are
 * not. Read along the frame's outermost 2 px across the box, against the
 * colour around the box; a few stray marks of the picture under it are not ink.
 */
export function inkAtEdge(
  image: StillImage,
  box: FrameBox,
  frame: { width: number; height: number },
  edge: number,
): boolean {
  const ground = ringColour(image, box, frame);
  if (!ground) return true;
  const sx = image.width / frame.width;
  const sy = image.height / frame.height;
  const [x, y, w, h] = box;
  const across = [
    Math.max(0, Math.floor(x * sx)),
    Math.min(image.width, Math.ceil((x + w) * sx)),
  ];
  const down = [
    Math.max(0, Math.floor(y * sy)),
    Math.min(image.height, Math.ceil((y + h) * sy)),
  ];
  const band = Math.max(1, Math.round(2 * Math.min(sx, sy)));
  const groundLuma =
    0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2];
  const far = FRAME_CHECKS.inkLuma * 255;
  let ink = 0;
  let seen = 0;
  const read = (x0: number, x1: number, y0: number, y1: number) => {
    for (let py = y0; py < y1; py += 1)
      for (let px = x0; px < x1; px += 1) {
        const at = (py * image.width + px) * 4;
        const luma =
          0.2126 * image.data[at] +
          0.7152 * image.data[at + 1] +
          0.0722 * image.data[at + 2];
        if (Math.abs(luma - groundLuma) > far) ink += 1;
        seen += 1;
      }
  };
  if (x <= edge) read(0, band, down[0], down[1]);
  if (y <= edge) read(across[0], across[1], 0, band);
  if (x + w >= frame.width - edge)
    read(image.width - band, image.width, down[0], down[1]);
  if (y + h >= frame.height - edge)
    read(across[0], across[1], image.height - band, image.height);
  return seen > 0 && ink / seen > FRAME_CHECKS.edgeInk;
}

// ── The scene's data ───────────────────────────────────────────────────────

/** When the voice speaks: its first word to its last. */
export function voicedSpan(scene: SceneDto): [number, number] {
  const beats = scene.beats ?? [];
  return beats.length
    ? [beats[0].startMs, beats[beats.length - 1].endMs]
    : [0, scene.durationMs];
}

/** When each thing is on the stage (today's engine): its runs of steps, from one to the first without it, the last to the scene's end. */
export function windowsOf(scene: SceneDto): Map<string, [number, number][]> {
  const out = new Map<string, [number, number][]>();
  const steps = scene.steps ?? [];
  steps.forEach((step, k) => {
    const end =
      k + 1 < steps.length
        ? steps[k + 1].atMs
        : Math.max(scene.durationMs, step.atMs);
    for (const id of step.show) {
      const runs = out.get(id) ?? [];
      const last = runs[runs.length - 1];
      if (last && Math.abs(last[1] - step.atMs) < 1) last[1] = end;
      else runs.push([step.atMs, end]);
      out.set(id, runs);
    }
  });
  return out;
}

/** A person the figure kit drew: its rig, its arms or its clothes say so. */
export function isPerson(thing: SceneThingDto): boolean {
  return (
    thing.kind === 'drawing' &&
    !thing.backdrop &&
    Boolean(thing.rig || thing.joints || thing.wears)
  );
}

/** A word card: words standing in for a picture (a failed drawing's card, a mended keyword). */
export const isWordCard = (thing: SceneThingDto): boolean =>
  thing.kind === 'words' &&
  (thing.style === 'card' || thing.style === 'keyword');

const GROUP_WORDS =
  /\b(people|crowds?|workers|farmers|students|pupils|villagers|voters|citizens|soldiers|traders|merchants|residents|staff|teams?|famil(y|ies)|groups?|mobs?|men|women|children|kids|audience|class)\b/i;
const ROLE_WORDS =
  /\b(students?|pupils?|learners?|teen(ager)?s?|child|kid|boy|girl|man|woman|person|someone|viewers?|readers?|host|narrator|teachers?|mechanics?|engineers?|workers?|farmers?|clerks?|traders?|merchants?|doctors?|nurses?|scientists?|soldiers?|officers?|officials?|drivers?|pilots?|chefs?|cooks?|shopkeepers?|customers?|citizens?|voters?|villagers?|residents?|you|me|guide|presenter|expert)\b/i;

/**
 * Which ban a kit person in a lesson breaks, from what it is called: a
 * group ("Workers", "Northern leaders", "Delegates") is a stock figure; a
 * role ("Student", "Retail investor") is a stand-in for the audience; a
 * name ("Nnamdi Azikiwe") is a drawn likeness of someone real.
 */
export function personBan(name: string): BannedThing {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'audience-on-screen';
  if (GROUP_WORDS.test(name)) return 'stock-figure-for-group';
  // Every word capitalised, as a name is; a plural's last word ends in s (but a name's may: "King Charles").
  const titled = words.every((word) => /^\p{Lu}/u.test(word));
  const plural = /[^s']s$/i.test(words[words.length - 1]);
  if (plural && !(titled && words.length > 1)) return 'stock-figure-for-group';
  if (ROLE_WORDS.test(name) || !titled) return 'audience-on-screen';
  return 'drawn-likeness';
}

/** The share of [0, end) that a set of runs covers, overlaps counted once. */
function coveredShare(runs: [number, number][], end: number): number {
  if (end <= 0) return 0;
  const sorted = runs
    .map(([a, b]): [number, number] => [Math.max(0, a), Math.min(end, b)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let from = -Infinity;
  let to = -Infinity;
  for (const [a, b] of sorted) {
    if (a > to) {
      if (to > from) total += to - from;
      from = a;
      to = b;
    } else to = Math.max(to, b);
  }
  if (to > from) total += to - from;
  return total / end;
}

/** The share of the scene's time a word card is on screen (today's engine; a shots scene has none). */
export function cardShareOf(scene: SceneDto): number {
  if (scene.engine === 'shots') return 0;
  const windows = windowsOf(scene);
  const runs = (scene.things ?? [])
    .filter(isWordCard)
    .flatMap((thing) => windows.get(thing.id) ?? []);
  return round3(coveredShare(runs, scene.durationMs));
}

/** The share of a lesson's time the figure kit's people are on screen. */
export function personShareOf(scene: SceneDto): number {
  if (scene.engine === 'shots' || !isLesson(scene)) return 0;
  const windows = windowsOf(scene);
  const runs = (scene.things ?? [])
    .filter(isPerson)
    .flatMap((thing) => windows.get(thing.id) ?? []);
  return round3(coveredShare(runs, scene.durationMs));
}

/** What draws the eye to a thing in today's engine: pointing at it, showing a part, a pulse, a zoom. */
const ATTENDS = new Set(['point', 'show', 'pulse', 'zoom']);

/**
 * The subject the voice is on at a moment (today's engine): what the last
 * cue of the stage now pointed at (a point, a part shown, a pulse, a zoom,
 * none of them a filler), else what the stage focuses. The jet engine's
 * opening stage focused the classroom while every cue pointed at the
 * engine: the engine was the subject, at 0.7% of the frame.
 */
export function subjectAt(scene: SceneDto, ms: number): string | null {
  if (scene.engine === 'shots') return null;
  const steps = scene.steps ?? [];
  let k = -1;
  for (let i = 0; i < steps.length; i += 1) if (steps[i].atMs <= ms) k = i;
  if (k < 0) return null;
  const step = steps[k];
  const cues = (scene.effects ?? [])
    .filter(
      (e) =>
        !e.filler &&
        ATTENDS.has(e.do) &&
        e.atMs >= step.atMs &&
        e.atMs <= ms &&
        step.show.includes(e.target),
    )
    .sort((a, b) => a.atMs - b.atMs);
  if (cues.length) return cues[cues.length - 1].target;
  return step.focus && step.show.includes(step.focus) ? step.focus : null;
}

/**
 * The scene's information events, on its clock: what puts something new
 * on the screen. Today's engine: each change of the stage, and each part
 * shown or pointed at (not a filler); the shots engine: each shot and each
 * piece of information. A cue within PACE.subStepMs of the one before is
 * part of it, not an event of its own.
 */
export function eventsOf(scene: SceneDto): number[] {
  const times: number[] = [];
  if (scene.engine === 'shots' && scene.shots) {
    for (const shot of scene.shots.shots) {
      times.push(shot.startMs);
      for (const info of shot.info) times.push(info.atMs);
    }
  } else {
    for (const step of scene.steps ?? []) times.push(step.atMs);
    for (const effect of scene.effects ?? [])
      if (!effect.filler && (effect.do === 'show' || effect.do === 'point'))
        times.push(effect.atMs);
  }
  const out: number[] = [];
  for (const at of times.sort((a, b) => a - b))
    if (!out.length || at - out[out.length - 1] >= PACE.subStepMs) out.push(at);
  return out;
}

/** The shots engine's declared rests: a camera's hold, an ask and its quiet. */
function holdsOf(scene: SceneDto): [number, number][] {
  if (scene.engine !== 'shots' || !scene.shots) return [];
  return scene.shots.shots.flatMap((shot) => [
    ...shot.camera
      .filter((move) => move.move === 'hold')
      .map((move): [number, number] => [move.atMs, move.atMs + move.durMs]),
    ...shot.info
      .filter((info) => info.recipe === 'ask')
      .map((info): [number, number] => [
        info.atMs,
        (info.untilMs ?? info.atMs + info.durMs) + PACE.askQuietMs,
      ]),
  ]);
}

/** Words that must be read, and how long they are up: a thing's caption, labels and figures, or a shot's text. */
interface TextWindow {
  id: string;
  words: number;
  from: number;
  to: number;
}

function textWindowsOf(scene: SceneDto): TextWindow[] {
  if (scene.engine === 'shots' && scene.shots)
    return scene.shots.shots.flatMap((shot) =>
      shot.info.flatMap((info) => {
        const words =
          wordsIn(info.text ?? '') + (info.value !== undefined ? 1 : 0);
        return words
          ? [
              {
                id: info.id,
                words,
                from: info.atMs,
                to: info.untilMs ?? shot.endMs,
              },
            ]
          : [];
      }),
    );
  const windows = windowsOf(scene);
  return (scene.things ?? []).flatMap((thing) => {
    const runs = windows.get(thing.id) ?? [];
    const texts: { id: string; words: number }[] =
      thing.kind === 'stat'
        ? [{ id: thing.id, words: 1 + wordsIn(thing.caption) }]
        : thing.kind === 'words'
          ? [{ id: thing.id, words: wordsIn(thing.text) }]
          : [
              { id: thing.id, words: wordsIn(thing.caption ?? '') },
              ...Object.entries(thing.callouts ?? {}).map(([part, said]) => ({
                id: `${thing.id}.${part}`,
                words: wordsIn(said),
              })),
            ];
    return texts
      .filter((one) => one.words > 0)
      .flatMap((one) =>
        runs.map(([from, to]) => ({ id: one.id, words: one.words, from, to })),
      );
  });
}

// ── Boxes ──────────────────────────────────────────────────────────────────

const areaOf = (b: FrameBox) => Math.max(0, b[2]) * Math.max(0, b[3]);
function overlapOf(a: FrameBox, b: FrameBox): number {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

const TEXT_ROLES = new Set<FrameRole>([
  'label',
  'number',
  'chip',
  'tag',
  'caption',
  'info',
]);
const DRAWN_ROLES = new Set<FrameRole>(['focal', 'actor', 'set']);
const isText = (item: FrameItem) =>
  TEXT_ROLES.has(item.role) && Boolean(item.text);
/** Words drawn into a drawing (a chart's figures): part of its design, never "on" it. */
const drawnIn = (item: FrameItem) => /#text-\d+$/.test(item.id);

/** The size a text must be read at: chips and tags smaller, captions their own, the rest TEXT.mustRead, of the frame's short side. */
export function sizeFloor(
  item: Pick<FrameItem, 'role'>,
  report: Pick<FrameReport, 'width' | 'height'>,
): number {
  const base = Math.min(report.width, report.height);
  if (item.role === 'chip' || item.role === 'tag') return TEXT.chip * base;
  if (item.role === 'caption') return TEXT.caption * base;
  return TEXT.mustRead * base;
}

/** Large text in WCAG's sense (TEXT.large, or TEXT.largeBold when bold), as shares of the frame's short side: read against CONTRAST.large. */
export function isLargeText(
  item: Pick<FrameItem, 'fontPx' | 'weight'>,
  report: Pick<FrameReport, 'width' | 'height'>,
): boolean {
  if (item.fontPx === undefined) return false;
  const base = Math.min(report.width, report.height);
  return (
    item.fontPx >= TEXT.large * base - 0.5 ||
    ((item.weight ?? 400) >= 700 && item.fontPx >= TEXT.largeBold * base - 0.5)
  );
}

/** Small print: a chip or a tag, which a caption may cover and which may sit at the frame's edge. */
const smallPrint = (item: Pick<FrameItem, 'role'>) =>
  item.role === 'chip' || item.role === 'tag';

/**
 * Where a text's glyphs are: its box, which runs from the font's ascent to
 * its descent, in by FRAME_CHECKS.glyphInset of its size at the top and the
 * bottom (its box as it is, when its size is not known).
 */
export function glyphBox(item: Pick<FrameItem, 'box' | 'fontPx'>): FrameBox {
  const inset = (item.fontPx ?? 0) * FRAME_CHECKS.glyphInset;
  const [x, y, w, h] = item.box;
  return h - 2 * inset > 1 ? [x, y + inset, w, h - 2 * inset] : item.box;
}

/** The box a subject is judged by: the named thing's drawing, else its figure (a stat), else its card; else the frame's own focal. */
function subjectItem(
  items: FrameItem[],
  named: string | null,
): FrameItem | null {
  if (named) {
    const drawn = items.find((i) => i.id === named && DRAWN_ROLES.has(i.role));
    if (drawn) return drawn;
    const figure = items.find((i) => i.id === `${named}#value`);
    if (figure) return figure;
    const card = items.find((i) => i.id === named);
    if (card) return card;
  }
  return items.find((i) => i.role === 'focal') ?? null;
}

// ── The checks ─────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** One still's checks: what is on the frame against the rules, and against its pixels when there are any. */
function checkStill(
  input: FrameCheckInput,
  index: number,
  report: FrameReport,
  image: StillImage | null,
  voiced: boolean,
): { problems: FrameProblem[]; facts: StillFacts } {
  const problems: FrameProblem[] = [];
  const at = report.ms;
  const add = (problem: Omit<FrameProblem, 'axis' | 'ms' | 'still'>) =>
    problems.push({
      ...problem,
      axis: AXIS_OF[problem.code],
      ms: at,
      still: index,
    });
  const W = report.width;
  const H = report.height;
  // This scene's own things; in a join the other scene's share the frame, by design.
  const items = report.items.filter(
    (item) => !item.scene || !input.sceneId || item.scene === input.sceneId,
  );
  const judged = items.filter(
    (item) => isText(item) && (item.opacity ?? 1) >= FRAME_CHECKS.judgedOpacity,
  );
  const captions = items.filter(
    (item) =>
      item.role === 'caption' &&
      (item.opacity ?? 1) >= FRAME_CHECKS.judgedOpacity,
  );
  // The stage's own ink: the captions and the chips laid over it are not part of its picture.
  const stats = image
    ? stillStats(image, {
        boxes: report.items
          .filter((item) => ['caption', 'chip', 'tag'].includes(item.role))
          .map((item) => item.box),
        width: W,
        height: H,
      })
    : null;

  // The subject: the one the voice is on, big enough to be the picture.
  const named = subjectAt(input.scene, at);
  const subject = subjectItem(items, named);
  let area: number | null = null;
  let height: number | null = null;
  if (subject) {
    area = round3(areaOf(subject.box) / (W * H));
    height = round3(subject.box[3] / H);
    const small =
      report.shape === 'tall'
        ? height < FOCAL.tallMinHeight
        : height < FOCAL.wideMinHeight && area < FOCAL.wideMinArea;
    if (small)
      add({
        code: 'focal-small',
        ids: [subject.id],
        severity: round3(
          1 -
            (report.shape === 'tall'
              ? height / FOCAL.tallMinHeight
              : Math.max(
                  height / FOCAL.wideMinHeight,
                  area / FOCAL.wideMinArea,
                )),
        ),
        value: report.shape === 'tall' ? height : area,
        limit:
          report.shape === 'tall' ? FOCAL.tallMinHeight : FOCAL.wideMinArea,
        message: `"${subject.id}" fills ${percent(area)} of the frame and ${percent(height)} of its height: the subject fills at least ${report.shape === 'tall' ? `${percent(FOCAL.tallMinHeight)} of a tall frame's height` : `${percent(FOCAL.wideMinHeight)} of the height or ${percent(FOCAL.wideMinArea)} of the frame`}`,
      });
    if (area < FRAME_CHECKS.tinyArea)
      add({
        code: 'tiny-subject',
        ids: [subject.id],
        severity: round3(1 - area / FRAME_CHECKS.tinyArea),
        value: area,
        limit: FRAME_CHECKS.tinyArea,
        message: `"${subject.id}" is a strip at ${percent(area)} of the frame, not a picture`,
      });
  } else if (
    voiced &&
    judged.some(
      (item) =>
        item.role !== 'caption' && item.role !== 'chip' && item.role !== 'tag',
    )
  )
    add({
      code: 'no-picture',
      ids: judged.map((item) => item.id),
      message:
        'words on the frame and no picture: the voice is on nothing drawn',
    });

  // Blank: the voice speaks over an empty frame.
  if (stats && voiced && stats.ink < FRAME_CHECKS.blankInk)
    add({
      code: 'blank',
      value: stats.ink,
      limit: FRAME_CHECKS.blankInk,
      message: `the frame is blank (${percent(stats.ink)} of it is ink) while the voice speaks`,
    });

  // Readable size.
  for (const item of judged) {
    const floor = sizeFloor(item, report);
    if (item.fontPx === undefined || item.fontPx >= floor - 0.5) continue;
    add({
      code: item.role === 'caption' ? 'caption-small' : 'text-small',
      ids: [item.id],
      severity: round3(1 - item.fontPx / floor),
      value: item.fontPx,
      limit: round1(floor),
      message: `"${item.text}" is set at ${round1(item.fontPx)} px; it is read at ${round1(floor)} px or more`,
    });
  }

  // Contrast, against what the page says is behind the words, else the pixels just outside them.
  for (const item of [
    ...judged,
    ...items.filter((i) => i.role === 'info' && !i.text && i.fg),
  ]) {
    const fg = colourOf(item.fg);
    if (!fg) continue;
    const said = colourOf(item.bg);
    const ring = image ? ringColour(image, item.box, report) : null;
    const behind = said
      ? said.alpha >= 1 || !ring
        ? said.rgb
        : over(said.rgb, said.alpha, ring)
      : ring;
    if (!behind) continue;
    const shown = over(
      fg.rgb,
      fg.alpha * Math.min(1, item.opacity ?? 1),
      behind,
    );
    const ratio = round1(contrastOf(shown, behind));
    const floor = !item.text
      ? CONTRAST.marks
      : isLargeText(item, report)
        ? CONTRAST.large
        : CONTRAST.text;
    if (ratio < floor)
      add({
        code: 'contrast-low',
        ids: [item.id],
        severity: round3(Math.min(1, (floor - ratio) / (floor - 1))),
        value: ratio,
        limit: floor,
        message: `${item.text ? `"${item.text}"` : `"${item.id}"`} stands at ${ratio}:1 against what is behind it; ${floor}:1 is the floor`,
      });
  }

  // Words on words, on their own subject, on the captions.
  const words = judged.filter((item) => item.role !== 'caption');
  for (let i = 0; i < words.length; i += 1)
    for (let j = i + 1; j < words.length; j += 1) {
      const a = words[i];
      const b = words[j];
      // Two words one drawing sets (stacked lines, a figure and its label)
      // are judged where their glyphs are; words of two drawings, or a
      // callout on a drawing's word, by their whole boxes.
      const same = Boolean(a.of) && a.of === b.of;
      const [boxA, boxB] = same ? [glyphBox(a), glyphBox(b)] : [a.box, b.box];
      const shared = overlapOf(boxA, boxB);
      if (
        shared >
        FRAME_CHECKS.overlapShare * Math.min(areaOf(boxA), areaOf(boxB))
      )
        add({
          code: 'words-overlap',
          ids: [a.id, b.id],
          message: `"${a.text}" and "${b.text}" are set over each other`,
        });
    }
  for (const item of words) {
    if (item.card || drawnIn(item)) continue;
    const own = item.of
      ? items.find((one) => one.id === item.of && DRAWN_ROLES.has(one.role))
      : subject && DRAWN_ROLES.has(subject.role) && subject.id !== item.id
        ? subject
        : undefined;
    if (!own) continue;
    const shared = overlapOf(item.box, own.box);
    if (shared > FRAME_CHECKS.coverShare * areaOf(own.box))
      add({
        code: 'covers-subject',
        ids: [item.id, own.id],
        value: round3(shared / Math.max(1, areaOf(own.box))),
        limit: FRAME_CHECKS.coverShare,
        message: `"${item.text}" covers ${percent(shared / Math.max(1, areaOf(own.box)))} of "${own.id}", the thing it names`,
      });
  }
  // The caption band is reserved in both shapes (rules v2): words a viewer
  // must read never sit where the captions go, wide or tall.
  const band: FrameBox =
    report.shape === 'tall'
      ? [
          SAFE.tall.x0 * W,
          SAFE.tall.captionY0 * H,
          (SAFE.tall.x1 - SAFE.tall.x0) * W,
          (SAFE.tall.y1 - SAFE.tall.captionY0) * H,
        ]
      : [
          SAFE.wide.x0 * W,
          SAFE.wide.captionY0 * H,
          (SAFE.wide.x1 - SAFE.wide.x0) * W,
          (SAFE.wide.y1 - SAFE.wide.captionY0) * H,
        ];
  for (const item of words) {
    // Small print (a credit, a source) may lie under a caption.
    if (smallPrint(item)) continue;
    const hit = [...captions.map((c) => c.box), band].some(
      (box) =>
        overlapOf(item.box, box) > FRAME_CHECKS.overlapShare * areaOf(item.box),
    );
    if (hit)
      add({
        code: 'on-caption',
        ids: [item.id],
        message: `"${item.text}" sits where the captions go`,
      });
  }

  // The safe area: every word inside it, the picture full-bleed.
  const safe = SAFE[report.shape];
  const [sx0, sy0, sx1, sy1] = [
    safe.x0 * W - 2,
    safe.y0 * H - 2,
    safe.x1 * W + 2,
    safe.y1 * H + 2,
  ];
  // Small print may sit at the frame's edge: it is judged only as cut by it.
  const edge = FRAME_CHECKS.chipEdge * Math.min(W, H);
  for (const item of judged) {
    const [x, y, w, h] = item.box;
    const small = smallPrint(item);
    const [x0, y0, x1, y1] = small
      ? [edge, edge, W - edge, H - edge]
      : [sx0, sy0, sx1, sy1];
    if (x >= x0 && y >= y0 && x + w <= x1 && y + h <= y1) continue;
    // Small print whose box meets the edge is cut only where its ink does.
    if (small && image && !inkAtEdge(image, item.box, report, edge)) continue;
    add({
      code: 'outside-safe',
      ids: [item.id],
      message: small
        ? `"${item.text}" is cut by the frame's edge`
        : `"${item.text}" runs outside the ${report.shape} frame's safe area`,
    });
  }

  // A word card seen on the frame.
  for (const item of items)
    if (item.card && (item.opacity ?? 1) >= FRAME_CHECKS.judgedOpacity)
      add({
        code: 'word-card',
        ids: [item.id],
        banned: 'word-card',
        message: `a word card ("${item.text}") stands in for a picture`,
      });

  return {
    problems,
    facts: {
      ms: at,
      subject: subject?.id ?? null,
      area,
      height,
      luminance: stats?.luminance ?? null,
      ink: stats?.ink ?? null,
      codes: [...new Set(problems.map((p) => p.code))],
    },
  };
}

/** Flashes: neighbouring stills, outside a join, whose brightness jumps by SAFETY.flicker and straight back. */
function flashesOf(
  stills: { fact: StillFacts; index: number }[],
  joins: boolean[] | undefined,
): FrameProblem[] {
  const order = stills
    .filter(({ fact, index }) => fact.luminance !== null && !joins?.[index])
    .sort((a, b) => a.fact.ms - b.fact.ms);
  const out: FrameProblem[] = [];
  for (let k = 1; k + 1 < order.length; k += 1) {
    const [a, b, c] = [order[k - 1], order[k], order[k + 1]];
    if (c.fact.ms - a.fact.ms > FRAME_CHECKS.flashWithinMs) continue;
    const up = b.fact.luminance! - a.fact.luminance!;
    const back = c.fact.luminance! - b.fact.luminance!;
    const darker = Math.min(
      a.fact.luminance!,
      b.fact.luminance!,
      c.fact.luminance!,
    );
    if (
      Math.abs(up) >= SAFETY.flicker &&
      Math.abs(back) >= SAFETY.flicker &&
      Math.sign(up) !== Math.sign(back) &&
      darker < 0.8
    )
      out.push({
        code: 'flash',
        axis: 'composition',
        ms: b.fact.ms,
        still: b.index,
        value: round3(Math.abs(up)),
        limit: SAFETY.flicker,
        message: `the frame flashes: its brightness jumps by ${percent(Math.abs(up))} and back within ${seconds(c.fact.ms - a.fact.ms)}`,
      });
  }
  return out;
}

/** The scene's pace and dwell, from its data. */
function checkPace(
  scene: SceneDto,
  first: boolean,
): {
  problems: FrameProblem[];
  /** The gaps between events, and how short the short ones are, summed (each 0 to 1). */
  gaps: number;
  shortGaps: number;
  /** How long the stalls run past PACE.maxGapMs, together. */
  longMs: number;
  /** The words judged for dwell, and how short the short ones fall, summed (each 0 to 1). */
  windows: number;
  shortWindows: number;
  /** How late the first change is, 0 (in time) to 1. */
  firstLate: number;
} {
  const problems: FrameProblem[] = [];
  const add = (problem: Omit<FrameProblem, 'axis'>) =>
    problems.push({ ...problem, axis: AXIS_OF[problem.code] });
  const [v0, v1] = voicedSpan(scene);
  const events = eventsOf(scene).filter((at) => at <= v1);
  const holds = holdsOf(scene);
  const held = (from: number, to: number) =>
    holds.some(
      ([a, b]) => Math.min(b, to) - Math.max(a, from) >= (to - from) / 2,
    );
  let shortGaps = 0;
  let longMs = 0;
  // The events, then the voice's last word: nothing new to the end is a gap too; with no event at all, the whole of it.
  const marks = [...(events.length ? events : [0]), v1];
  for (let k = 1; k < marks.length; k += 1) {
    const gap = marks[k] - marks[k - 1];
    const closing = k === marks.length - 1;
    if (!closing && gap < PACE.minGapMs) {
      const severity = round3(1 - gap / PACE.minGapMs);
      shortGaps += severity;
      add({
        code: 'gap-short',
        ms: marks[k],
        severity,
        value: gap,
        limit: PACE.minGapMs,
        message: `two cues ${seconds(gap)} apart at ${seconds(marks[k])}: one thing at a time, at least ${seconds(PACE.minGapMs)} apart`,
      });
    }
    // Before the voice starts, the picture may wait; after it, nothing new for this long is a stall.
    const from = Math.max(marks[k - 1], v0);
    if (marks[k] - from > PACE.maxGapMs && !held(from, marks[k])) {
      longMs += marks[k] - from - PACE.maxGapMs;
      add({
        code: 'gap-long',
        ms: from,
        severity: round3(
          Math.min(1, (marks[k] - from - PACE.maxGapMs) / PACE.maxGapMs),
        ),
        value: marks[k] - from,
        limit: PACE.maxGapMs,
        message: `nothing new for ${seconds(marks[k] - from)} from ${seconds(from)} while the voice speaks`,
      });
    }
  }
  let firstLate = 0;
  if (first) {
    const next = events.find((at) => at > 50);
    if (next === undefined || next > PACE.firstChangeMs) {
      firstLate = round3(
        Math.min(
          1,
          ((next ?? Infinity) - PACE.firstChangeMs) / PACE.firstChangeMs,
        ),
      );
      add({
        code: 'first-late',
        ms: next ?? 0,
        severity: firstLate,
        value: next ?? scene.durationMs,
        limit: PACE.firstChangeMs,
        message: `the episode's first change comes at ${seconds(next ?? scene.durationMs)}; the hook changes something by ${seconds(PACE.firstChangeMs)}`,
      });
    }
  }
  const windows = textWindowsOf(scene).filter(
    // Up to the scene's end, it may carry on in the next: not judged.
    (one) => one.to < scene.durationMs - 1,
  );
  let shortWindows = 0;
  for (const one of windows) {
    const need = dwellMs(one.words);
    if (one.to - one.from >= need) continue;
    const severity = round3(1 - (one.to - one.from) / need);
    shortWindows += severity;
    add({
      code: 'dwell-short',
      ms: one.from,
      ids: [one.id],
      severity,
      value: one.to - one.from,
      limit: need,
      message: `"${one.id}" (${one.words} word${one.words === 1 ? '' : 's'}) is up ${seconds(one.to - one.from)}; it needs ${seconds(need)} to be read`,
    });
  }
  return {
    problems,
    gaps: Math.max(0, events.length - 1),
    shortGaps,
    longMs,
    windows: windows.length,
    shortWindows,
    firstLate,
  };
}

/** The bans the scene's data shows: its word cards and its kit people, by how long they are up. */
function checkBans(scene: SceneDto): FrameProblem[] {
  if (scene.engine === 'shots') return [];
  const windows = windowsOf(scene);
  const out: FrameProblem[] = [];
  const lesson = isLesson(scene);
  for (const thing of scene.things ?? []) {
    const runs = windows.get(thing.id) ?? [];
    if (!runs.length) continue;
    const share = round3(coveredShare(runs, scene.durationMs));
    if (isWordCard(thing))
      out.push({
        code: 'word-card',
        axis: 'truth',
        ms: runs[0][0],
        ids: [thing.id],
        value: share,
        banned: 'word-card',
        message: `a word card ("${thing.kind === 'words' ? thing.text : thing.id}") stands in for a picture for ${percent(share)} of the scene`,
      });
    else if (lesson && isPerson(thing)) {
      const name =
        thing.kind === 'drawing' ? (thing.caption ?? thing.id) : thing.id;
      const banned = personBan(name);
      out.push({
        code: 'person',
        axis: 'truth',
        ms: runs[0][0],
        ids: [thing.id],
        value: share,
        banned,
        message: `"${name}", a figure the kit drew, is on screen for ${percent(share)} of a lesson: ${banned === 'drawn-likeness' ? 'a real person shows only as a verified portrait' : banned === 'stock-figure-for-group' ? 'a group shows as silhouettes' : 'the audience is never on screen'}`,
      });
    }
  }
  return out;
}

/**
 * A score out of 10 from what each failure takes (its weight times how much
 * of the scene it covers, and how badly): each takes its part of what the
 * others leave, so two failures cost more than either and never less than 0.
 */
const scoreOf = (takes: number[]) =>
  round1(
    10 *
      takes.reduce(
        (left, take) => left * (1 - Math.min(1, Math.max(0, take))),
        1,
      ),
  );

/** Checks a scene's stills and its data against the rules, and scores it. */
export function checkFrames(input: FrameCheckInput): FrameCheckResult {
  const { scene } = input;
  const [v0, v1] = voicedSpan(scene);
  const pad = FRAME_CHECKS.voicedPadMs;
  const problems: FrameProblem[] = [];
  // Each still's facts, by the report it came from (a still with no report has none).
  const checked: { fact: StillFacts; index: number }[] = [];
  input.reports.forEach((report, index) => {
    if (!report) return;
    const voiced = report.ms >= v0 - pad && report.ms <= v1 + pad;
    const one = checkStill(
      input,
      index,
      report,
      input.pixels?.[index] ?? null,
      voiced,
    );
    problems.push(...one.problems);
    checked.push({ fact: one.facts, index });
  });
  const flashes = flashesOf(checked, input.joins);
  for (const flash of flashes) {
    const still = checked.find((one) => one.index === flash.still);
    if (still && !still.fact.codes.includes('flash'))
      still.fact.codes.push('flash');
  }
  problems.push(...flashes);
  const facts = checked.map((one) => one.fact);
  const pace = checkPace(scene, input.first === true);
  problems.push(...pace.problems);
  problems.push(...checkBans(scene));

  // How much of the scene each failure covers, and how badly: for each
  // still, the worst of it there (1 for a failure outright, less for words
  // a little under their floor), averaged over the stills it is judged in:
  // those with words to read for readability, those the voice speaks over
  // for the rest. Each axis keeps what every one of its failures leaves.
  const worst = new Map<number, Map<FrameCode, number>>();
  for (const problem of problems) {
    if (problem.still === undefined) continue;
    const seen = worst.get(problem.still) ?? new Map<FrameCode, number>();
    seen.set(
      problem.code,
      Math.max(seen.get(problem.code) ?? 0, problem.severity ?? 1),
    );
    worst.set(problem.still, seen);
  }
  const worded = checked.filter(({ index }) =>
    input.reports[index]?.items.some(
      (item) =>
        isText(item) && (item.opacity ?? 1) >= FRAME_CHECKS.judgedOpacity,
    ),
  );
  const spokenOver = checked.filter(
    ({ fact }) => fact.ms >= v0 - pad && fact.ms <= v1 + pad,
  );
  const amount = (among: { index: number }[], codes: FrameCode[]) =>
    among.length
      ? among.reduce(
          (sum, { index }) =>
            sum +
            Math.max(
              0,
              ...codes.map((code) => worst.get(index)?.get(code) ?? 0),
            ),
          0,
        ) / among.length
      : 0;
  const W = FRAME_CHECKS.weights;
  const readability = scoreOf([
    W.textSmall * amount(worded, ['text-small']),
    W.captionSmall * amount(worded, ['caption-small']),
    W.contrast * amount(worded, ['contrast-low']),
    W.overlap *
      amount(worded, ['words-overlap', 'covers-subject', 'on-caption']),
    W.safe * amount(worded, ['outside-safe']),
  ]);
  const composition = scoreOf([
    W.focal * amount(spokenOver, ['focal-small']),
    W.noPicture * amount(spokenOver, ['no-picture']),
    W.blank * amount(spokenOver, ['blank']),
    W.flash * flashes.length,
  ]);
  const spoken = Math.max(1, v1 - v0);
  const paceScore = scoreOf([
    W.gapShort * (pace.gaps ? pace.shortGaps / pace.gaps : 0),
    W.gapLong * (pace.longMs / spoken),
    W.dwell * (pace.windows ? pace.shortWindows / pace.windows : 0),
    W.firstLate * pace.firstLate,
  ]);
  const cardShare = cardShareOf(scene);
  const personShare = personShareOf(scene);
  const truth = scoreOf([
    W.card * cardShare,
    W.person * personShare,
    W.tiny * amount(spokenOver, ['tiny-subject']),
  ]);
  const axes = { readability, composition, pace: paceScore, truth };
  const overall = round1(
    FRAME_AXES.reduce((sum, axis) => sum + axes[axis], 0) / FRAME_AXES.length,
  );
  const areas = facts.flatMap((fact) =>
    fact.area === null ? [] : [fact.area],
  );
  const heights = facts.flatMap((fact) =>
    fact.height === null ? [] : [fact.height],
  );
  return {
    problems: problems.sort((a, b) => a.ms - b.ms),
    scores: {
      ...axes,
      overall,
      pass: FRAME_AXES.every((axis) => axes[axis] >= LOOP.passScore),
      cardShare,
      personShare,
      focalShare: areas.length ? round3(medianOf(areas)) : null,
      focalHeight: heights.length ? round3(medianOf(heights)) : null,
      stills: facts.length,
    },
    stills: facts,
  };
}

/** An episode's scores from its scenes': each axis and share by the scenes' lengths, the subject's shares the median over every still. */
export function episodeScores(
  scenes: { scores: FrameScores; durationMs: number; stills: StillFacts[] }[],
): FrameScores {
  const total =
    scenes.reduce((sum, one) => sum + Math.max(0, one.durationMs), 0) || 1;
  const mean = (pick: (scores: FrameScores) => number) =>
    scenes.reduce(
      (sum, one) => sum + pick(one.scores) * Math.max(0, one.durationMs),
      0,
    ) / total;
  const axes = {
    readability: round1(mean((s) => s.readability)),
    composition: round1(mean((s) => s.composition)),
    pace: round1(mean((s) => s.pace)),
    truth: round1(mean((s) => s.truth)),
  };
  const facts = scenes.flatMap((one) => one.stills);
  const areas = facts.flatMap((fact) =>
    fact.area === null ? [] : [fact.area],
  );
  const heights = facts.flatMap((fact) =>
    fact.height === null ? [] : [fact.height],
  );
  return {
    ...axes,
    overall: round1(
      FRAME_AXES.reduce((sum, axis) => sum + axes[axis], 0) / FRAME_AXES.length,
    ),
    pass: FRAME_AXES.every((axis) => axes[axis] >= LOOP.passScore),
    cardShare: round3(mean((s) => s.cardShare)),
    personShare: round3(mean((s) => s.personShare)),
    focalShare: areas.length ? round3(medianOf(areas)) : null,
    focalHeight: heights.length ? round3(medianOf(heights)) : null,
    stills: facts.length,
  };
}
