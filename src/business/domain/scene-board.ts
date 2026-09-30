/**
 * A continuous build (studio-explainer-plan, Asks 3 and 4, part C): one
 * diagram that grows across a section of a lesson, the heart chamber by
 * chamber or the water cycle stage by stage, instead of a new picture for
 * each idea.
 *
 *  - The board. A section has one board of BOARD_COLS × BOARD_ROWS cells,
 *    about twice the camera's usual frame across and one and a half times
 *    its height. A newcomer takes the free cell nearest what it connects to
 *    (an arrow's other end), else the one after the last placed. Placed
 *    things never move: only the camera does.
 *  - The camera frames the newest thing and what it connects to, never
 *    more than FRAME_MOST of the board across; at a recap sentence, and as
 *    the section ends, it pulls out to the whole board.
 *  - Receding. A thing the voice has not named for RECEDE_AFTER stage
 *    changes is set back (faded and greyed by the player), and comes back
 *    in full when it is named again.
 *  - Across scenes. The next scene of the section starts on this one's end
 *    (its things, their cells, their arrows, how long each has been quiet,
 *    what the camera was on), carried by `BoardCarry`: no entrance, and the
 *    film's join is a `continue`.
 *  - At most BOARD_MOST things. A newcomer past that pages the board: the
 *    columns up to the oldest thing's slide out to the left, the rest with
 *    them, and it goes in the room made.
 *
 * All code, from the script alone, so each scene of a section works out
 * the same board for itself whenever it is made, in any order.
 */
import type {
  SceneArrow,
  SceneScript,
  SceneStage,
  SceneStep,
  SceneThing,
} from './scene-script';
import { wordsOf } from './scene-script';

export const BOARD_COLS = 4;
export const BOARD_ROWS = 3;
/** The most things a board holds before it pages. */
export const BOARD_MOST = BOARD_COLS * BOARD_ROWS;
/** How many stage changes a thing may go unnamed before it recedes. */
export const RECEDE_AFTER = 2;
/** The most of the board's width the camera shows, but for a pull-out to the whole. */
export const FRAME_MOST = 0.6;
/** And the least: never closer in than this share of it. */
export const FRAME_LEAST = 0.5;
/** Where the first thing goes: the left, halfway down, with room all round it. */
export const BOARD_START: Cell = [0, 1];

/** A cell of the board: its column from the left, its row from the top. */
export type Cell = [number, number];

/** What the camera frames at a stage: these things (the newest first), or the whole board. */
export type BoardFrame = string[] | 'whole';

/** A stage of a build, as code sets it: where everything is, what has receded, what the camera frames. */
export interface BoardStage {
  cells: Record<string, Cell>;
  faded: string[];
  frame: BoardFrame;
  /** The board paged here: the oldest columns slid out to the left, the rest with them. */
  page?: true;
}

/** How a scene of a build leaves the board, for the scene after it. */
export interface BoardCarry {
  /** Each thing on the board as its script has it, so it is drawn once and kept under its id. */
  things: SceneThing[];
  /** Their ids, oldest first. */
  order: string[];
  cells: Record<string, Cell>;
  arrows: SceneArrow[];
  /** How many stage changes each has gone unnamed. */
  quiet: Record<string, number>;
  frame: BoardFrame;
}

const LITTLE = new Set(['a', 'an', 'the', 'of', 'its', 'their', 'and', 'to']);

/** A name as words to match: lower case, little words and plurals gone. */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !LITTLE.has(w))
    .map((w) =>
      w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w,
    );
}

/** What a thing is called: a drawing's name, a stat's caption, a card's words. */
export function nameOfThing(thing: SceneThing): string {
  if (thing.kind === 'words') return thing.text;
  if (thing.kind === 'stat') return thing.caption;
  return 'name' in thing && typeof thing.name === 'string' ? thing.name : '';
}

const keyOf = (thing: SceneThing) => nameWords(nameOfThing(thing)).join(' ');

/** A title card is the scene's, never part of its diagram. */
const onBoard = (thing: SceneThing | undefined) =>
  Boolean(thing) && !(thing!.kind === 'words' && thing.style === 'title');

/**
 * A scene of a build keeps the things the board carries under their ids:
 * a thing of its own of the same kind and name as one carried is that one
 * (its drawing as it was, not drawn again), and one of its own whose id a
 * carried thing already has is given another.
 */
export function keepIds(
  script: SceneScript,
  carry: BoardCarry | null,
): { script: SceneScript; kept: string[] } {
  if (!carry?.things.length) return { script, kept: [] };
  const carried = new Map(carry.things.map((t) => [t.id, t]));
  const byKey = new Map(
    carry.things.flatMap((t) =>
      keyOf(t) ? [[`${t.kind}:${keyOf(t)}`, t]] : [],
    ),
  );
  const rename = new Map<string, string>();
  const taken = new Set([
    ...carry.things.map((t) => t.id),
    ...script.cast.map((t) => t.id),
  ]);
  const kept: string[] = [];
  for (const thing of script.cast) {
    const same = byKey.get(`${thing.kind}:${keyOf(thing)}`);
    if (same) {
      if (same.id !== thing.id) rename.set(thing.id, same.id);
      kept.push(same.id);
      continue;
    }
    const clash = carried.get(thing.id);
    if (clash) {
      let n = 2;
      while (taken.has(`${thing.id}-${n}`)) n += 1;
      rename.set(thing.id, `${thing.id}-${n}`);
      taken.add(`${thing.id}-${n}`);
    }
  }
  if (!rename.size && !kept.length) return { script, kept };
  const id = (one: string) => rename.get(one) ?? one;
  const cast: SceneThing[] = [];
  for (const thing of script.cast) {
    const same = byKey.get(`${thing.kind}:${keyOf(thing)}`);
    const next = same ?? { ...thing, id: id(thing.id) };
    if (!cast.some((t) => t.id === next.id)) cast.push(next);
  }
  const steps = script.steps.map((step): SceneStep => ({
    ...step,
    effects: step.effects.map((e) => ({ ...e, target: id(e.target) })),
    stage: step.stage
      ? {
          ...step.stage,
          show: [...new Set(step.stage.show.map(id))],
          arrows: step.stage.arrows.map((a) => ({
            ...a,
            from: id(a.from),
            to: id(a.to),
          })),
        }
      : null,
  }));
  return { script: { ...script, cast, steps }, kept };
}

/** Where a step is in the words: its sentence, and the word it lands on (after its sentence, past every word). */
const positionOf = (step: SceneStep) =>
  step.at.beat * 10_000 + (step.after !== undefined ? 9_999 : step.word);

/** The words said from one position to the next, as matching words. */
function saidBetween(
  script: SceneScript,
  from: number,
  to: number,
): Set<string> {
  const out = new Set<string>();
  script.beats.forEach((beat, b) => {
    wordsOf(beat.say).forEach((word, w) => {
      const at = b * 10_000 + w;
      if (at >= from && at < to)
        for (const one of nameWords(word)) out.add(one);
    });
  });
  return out;
}

/** Whether words said name a thing: its head word (the last of its name) is among them. */
const names = (said: Set<string>, thing: SceneThing | undefined) => {
  if (!thing) return false;
  const words = nameWords(nameOfThing(thing));
  return words.length > 0 && said.has(words[words.length - 1]);
};

/** The free cell nearest where a newcomer belongs: by what it connects to, else after the last placed, else the start. */
export function freeCellNear(
  taken: readonly Cell[],
  near: readonly Cell[],
  last: Cell | null,
): Cell | null {
  const target: [number, number] = near.length
    ? [
        near.reduce((n, c) => n + c[0], 0) / near.length,
        near.reduce((n, c) => n + c[1], 0) / near.length,
      ]
    : last
      ? [last[0] + 1, last[1]]
      : BOARD_START;
  let best: Cell | null = null;
  let score = Infinity;
  for (let c = 0; c < BOARD_COLS; c += 1)
    for (let r = 0; r < BOARD_ROWS; r += 1) {
      if (taken.some(([tc, tr]) => tc === c && tr === r)) continue;
      const dc = c - target[0];
      const dr = r - target[1];
      // Nearest; then on to the right, the way a diagram reads; then down.
      const s =
        Math.hypot(dc, dr * 1.1) + (dc < 0 ? 0.3 : 0) + r * 0.01 + c * 0.001;
      if (s < score) {
        score = s;
        best = [c, r];
      }
    }
  return best;
}

/** A pull-out to the whole board: at each run of recap sentences, and from the section's last sentence on. */
function pullOuts(
  script: SceneScript,
  end: boolean,
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const last = script.beats.length - 1;
  script.beats.forEach((beat, b) => {
    const recap = beat.delivery === 'recap' || (end && b === last);
    if (!recap) return;
    const open = out[out.length - 1];
    if (open && open.to === b * 10_000) open.to = (b + 1) * 10_000;
    else out.push({ from: b * 10_000, to: (b + 1) * 10_000 });
  });
  // The section's end holds on the whole board to the last.
  if (end && out.length) out[out.length - 1].to = Infinity;
  return out;
}

/** A step of its own for the camera, where no stage change is: the board as it stands. */
const cameraStep = (script: SceneScript, beat: number): SceneStep => ({
  at: {
    beat,
    phrase: wordsOf(script.beats[beat]?.say ?? '')
      .slice(0, 3)
      .join(' '),
  },
  word: 0,
  stage: { layout: 'row', show: [], arrows: [] },
  effects: [],
});

/**
 * A lesson's script as a scene of a build: every stage the board as it
 * stands then, each with its cells, what has receded and what the camera
 * frames; the things the scene before left, carried on; and how it leaves
 * the board for the scene after. `end`: it is the section's last scene,
 * and ends on the whole board.
 */
export function boardOf(
  written: SceneScript,
  carry: BoardCarry | null,
  options: { end?: boolean } = {},
): { script: SceneScript; carry: BoardCarry; notes: string[] } {
  const notes: string[] = [];
  const { script: kept, kept: keptIds } = keepIds(written, carry);
  if (keptIds.length)
    notes.push(
      `board: ${keptIds.join(', ')} carried on under the ids they had`,
    );
  // The things carried, then the scene's own.
  const cast: SceneThing[] = [
    ...(carry?.things ?? []).filter(
      (t) => !kept.cast.some((own) => own.id === t.id),
    ),
    ...kept.cast,
  ];
  const byId = new Map(cast.map((t) => [t.id, t]));
  // The steps in the order they are said, with a stage for the camera
  // where a pull-out begins or ends between stage changes, and the board
  // carried on from the scene's first moment.
  const outs = pullOuts(kept, options.end === true);
  const inOut = (at: number) => outs.some((o) => at >= o.from && at < o.to);
  let steps = [...kept.steps].sort((a, b) => positionOf(a) - positionOf(b));
  const marks = new Set<number>();
  for (const o of outs) {
    marks.add(o.from);
    if (Number.isFinite(o.to) && o.to < kept.beats.length * 10_000)
      marks.add(o.to);
  }
  if (carry?.order.length) marks.add(0);
  for (const at of marks) {
    const there = steps.find((s) => s.stage && positionOf(s) === at);
    if (!there) steps.push(cameraStep(kept, Math.floor(at / 10_000)));
  }
  steps = steps.sort((a, b) => positionOf(a) - positionOf(b));

  const order = [...(carry?.order ?? [])];
  const cells: Record<string, Cell> = { ...(carry?.cells ?? {}) };
  let arrows = [...(carry?.arrows ?? [])];
  const quiet: Record<string, number> = { ...(carry?.quiet ?? {}) };
  let frame: BoardFrame = carry?.frame ?? [];
  let lastPlaced: Cell | null = order.length
    ? cells[order[order.length - 1]]
    : null;
  const neighboursOf = (id: string) =>
    arrows.flatMap((a) =>
      a.from === id && cells[a.to]
        ? [a.to]
        : a.to === id && cells[a.from]
          ? [a.from]
          : [],
    );

  const out: SceneStep[] = [];
  // What the scene before left set back is set back as this one opens.
  const faded = new Set<string>(
    carry && carry.frame !== 'whole'
      ? carry.order.filter(
          (id) =>
            (carry.quiet[id] ?? 0) >= RECEDE_AFTER &&
            !(carry.frame as string[]).includes(id),
        )
      : [],
  );
  /** The first moment in a stage's time that names a thing set back: a word said, or an effect on it. */
  const firstReturn = (from: number, until: number): number | null => {
    if (!faded.size) return null;
    let best: number | null = null;
    kept.beats.forEach((beat, b) =>
      wordsOf(beat.say).forEach((word, w) => {
        const at = b * 10_000 + w;
        if (at <= from || at >= until || (best !== null && at >= best)) return;
        const said = new Set(nameWords(word));
        if ([...faded].some((id) => names(said, byId.get(id)))) best = at;
      }),
    );
    for (const step of steps) {
      const at = positionOf(step);
      if (step.stage || at <= from || at >= until) continue;
      if (
        step.effects.some((e) => faded.has(e.target)) &&
        (best === null || at < best)
      )
        best = at;
    }
    return best;
  };
  let saidFrom = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (!step.stage) {
      out.push(step);
      continue;
    }
    const at = positionOf(step);
    let nextIndex = steps.findIndex((s, j) => j > i && s.stage);
    let until = nextIndex >= 0 ? positionOf(steps[nextIndex]) : Infinity;
    // A thing set back and named again before the next stage change comes
    // back then: a stage of its own at that word.
    const returnAt = (back: number) => {
      const beat = Math.floor(back / 10_000);
      const word = back % 10_000;
      const returning: SceneStep = {
        at: {
          beat,
          phrase: wordsOf(kept.beats[beat]?.say ?? '')
            .slice(word, word + 3)
            .join(' '),
        },
        word,
        stage: { layout: 'row', show: [], arrows: [] },
        effects: [],
      };
      // Among the steps, after any effects-only step at that very word.
      let j = i + 1;
      while (
        j < steps.length &&
        positionOf(steps[j]) <= back &&
        !steps[j].stage
      )
        j += 1;
      steps.splice(j, 0, returning);
      nextIndex = j;
      until = back;
    };
    const back = firstReturn(at, until);
    if (back !== null) returnAt(back);
    // What arrives: the stage's things and its arrows' ends not yet on the board.
    const asked = [
      ...step.stage.show,
      ...step.stage.arrows.flatMap((a) => [a.from, a.to]),
    ].filter((id, k, all) => all.indexOf(id) === k && onBoard(byId.get(id)));
    // At a pull-out the board is shown as it is: a recap's list of cards
    // would only say again what is on it.
    const newcomers = asked.filter(
      (id) => !cells[id] && !(inOut(at) && byId.get(id)?.kind === 'words'),
    );
    let paged = false;
    for (const id of newcomers) {
      if (order.length >= BOARD_MOST) {
        // Paged: the columns up to the oldest thing's go, the rest slide over.
        const col = cells[order[0]][0];
        const gone = order.filter((one) => cells[one][0] <= col);
        for (const one of gone) {
          delete cells[one];
          delete quiet[one];
          order.splice(order.indexOf(one), 1);
        }
        for (const one of order)
          cells[one] = [cells[one][0] - col - 1, cells[one][1]];
        arrows = arrows.filter((a) => cells[a.from] && cells[a.to]);
        lastPlaced = order.length ? cells[order[order.length - 1]] : null;
        paged = true;
        notes.push(
          `board: paged at "${step.at.phrase}", ${gone.join(', ')} slid out`,
        );
      }
      const links = [...step.stage.arrows, ...arrows].flatMap((a) =>
        a.from === id && cells[a.to]
          ? [cells[a.to]]
          : a.to === id && cells[a.from]
            ? [cells[a.from]]
            : [],
      );
      const cell = freeCellNear(Object.values(cells), links, lastPlaced);
      if (!cell) continue;
      cells[id] = cell;
      order.push(id);
      quiet[id] = 0;
      lastPlaced = cell;
    }
    // The diagram's arrows stay drawn: every one both of whose ends are on it.
    const fresh = step.stage.arrows.filter(
      (a) =>
        cells[a.from] &&
        cells[a.to] &&
        !arrows.some((b) => b.from === a.from && b.to === a.to),
    );
    arrows = [...arrows, ...fresh];
    // Named here: what arrives, what an effect is on until the next stage
    // change, the ends of a new arrow, and what the voice says by name.
    // Said since the last stage counted, to the end of this one's sentence.
    const saidTo = Math.min(until, (Math.floor(at / 10_000) + 1) * 10_000);
    const said = saidBetween(kept, Math.min(saidFrom, at), saidTo);
    saidFrom = saidTo;
    const acted = new Set(
      steps
        .slice(i, nextIndex >= 0 ? nextIndex : steps.length)
        .flatMap((s) => s.effects.map((e) => e.target)),
    );
    const named = new Set([
      ...newcomers.filter((id) => cells[id]),
      ...fresh.flatMap((a) => [a.from, a.to]),
      ...order.filter((id) => acted.has(id) || names(said, byId.get(id))),
    ]);
    const changed = newcomers.some((id) => cells[id]) || paged;
    for (const id of order)
      quiet[id] = named.has(id) ? 0 : (quiet[id] ?? 0) + (changed ? 1 : 0);
    // What the camera frames: the whole board at a pull-out; else the
    // newest and what they connect to; else what is named (a thing come
    // back first); else as it was.
    const arrived = newcomers.filter((id) => cells[id]).reverse();
    const returned = order.filter((id) => faded.has(id) && named.has(id));
    if (inOut(at)) frame = 'whole';
    else if (arrived.length)
      frame = [...new Set([...arrived, ...arrived.flatMap(neighboursOf)])];
    else {
      // A new arrow's ends, what comes back, what an effect is on and
      // what that connects to.
      const pointed = order.filter((id) => acted.has(id)).reverse();
      const seen = [
        ...fresh.flatMap((a) => [a.to, a.from]),
        ...returned,
        ...pointed,
        ...pointed.flatMap(neighboursOf),
      ];
      if (seen.length) frame = [...new Set(seen)];
      else if (frame === 'whole' || !frame.some((id) => cells[id]))
        frame = order.length ? [order[order.length - 1]] : 'whole';
      else frame = frame.filter((id) => cells[id]);
    }
    faded.clear();
    if (frame !== 'whole')
      for (const id of order)
        if (quiet[id] >= RECEDE_AFTER && !frame.includes(id)) faded.add(id);
    // One set back here and named before the next stage change comes back then.
    const later = firstReturn(Math.max(at, saidTo - 1), until);
    if (later !== null) returnAt(later);
    const board: BoardStage = {
      cells: Object.fromEntries(
        order.map((id) => [id, [...cells[id]] as Cell]),
      ),
      faded: order.filter((id) => faded.has(id)),
      frame: frame === 'whole' ? 'whole' : [...frame],
      ...(paged ? { page: true as const } : {}),
    };
    const stage: SceneStage & { board: BoardStage } = {
      ...step.stage,
      show: [...order],
      arrows: arrows.map((a) => ({ ...a })),
      board,
    };
    out.push({ ...step, stage });
  }
  const things = order.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  return {
    script: {
      ...kept,
      cast,
      steps: out,
      board: { carried: [...(carry?.order ?? [])] },
    },
    carry: {
      things,
      order: [...order],
      cells: Object.fromEntries(
        order.map((id) => [id, [...cells[id]] as Cell]),
      ),
      arrows: arrows.map((a) => ({ ...a })),
      quiet: { ...quiet },
      frame: frame === 'whole' ? 'whole' : [...frame],
    },
    notes,
  };
}

// ── On the stage ──────────────────────────────────────────────────────────

/** A box on a staging: x, y, w, h. */
export type Box = [number, number, number, number];

/** The board on a staging: the content box, as tall as a board twice the frame across and half again its height would be. */
export function boardArea(
  W: number,
  H: number,
  margin: number,
): { x: number; y: number; w: number; h: number } {
  const w = W - margin * 2;
  const h = Math.min(H - margin * 2, w * 0.75 * (H / W));
  return { x: margin, y: (H - h) / 2, w, h };
}

/** The room between cells: an arrow runs through it. */
export const BOARD_GAP = 48;

/** A cell's box on a staging. */
export function cellBox(
  cell: Cell,
  W: number,
  H: number,
  margin: number,
): { x: number; y: number; w: number; h: number } {
  const area = boardArea(W, H, margin);
  const w = (area.w - BOARD_GAP * (BOARD_COLS - 1)) / BOARD_COLS;
  const h = (area.h - BOARD_GAP * (BOARD_ROWS - 1)) / BOARD_ROWS;
  return {
    x: area.x + cell[0] * (w + BOARD_GAP),
    y: area.y + cell[1] * (h + BOARD_GAP),
    w,
    h,
  };
}

/**
 * Where the camera looks at a stage of a build, as a box of the staging's
 * shape: around what it frames and a little room, centred on the newest
 * where that is more than FRAME_MOST of the board across, and never nearer
 * than FRAME_LEAST; at a pull-out, all of the diagram, however much of
 * the stage it takes.
 */
export function frameBox(
  frame: BoardFrame,
  extents: ReadonlyMap<string, { x: number; y: number; w: number; h: number }>,
  W: number,
  H: number,
  margin: number,
): Box {
  const whole: Box = [0, 0, W, H];
  // The whole board: all of the diagram, as much of the stage as it takes.
  const all = frame === 'whole';
  const boxes = all
    ? [...extents.values()]
    : frame.flatMap((id) => (extents.get(id) ? [extents.get(id)!] : []));
  if (!boxes.length) return whole;
  const area = boardArea(W, H, margin);
  const aspect = W / H;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const room = all ? 1.1 : 1.18;
  let w = Math.max((x1 - x0) * room, (y1 - y0) * room * aspect);
  w = all
    ? Math.min(W, Math.max(area.w * FRAME_MOST, w))
    : Math.min(area.w * FRAME_MOST, Math.max(area.w * FRAME_LEAST, w));
  const h = w / aspect;
  // Too much to frame whole: on the newest, as much of the rest as fits.
  const newest = boxes[0];
  const fits = (x1 - x0) * room <= w && (y1 - y0) * room <= h;
  const cx = fits ? (x0 + x1) / 2 : newest.x + newest.w / 2;
  const cy = fits ? (y0 + y1) / 2 : newest.y + newest.h / 2;
  const x = Math.min(W - w, Math.max(0, cx - w / 2));
  const y = Math.min(H - h, Math.max(0, cy - h / 2));
  const round = (n: number) => Math.round(n * 10) / 10;
  return [round(x), round(y), round(w), round(h)];
}
