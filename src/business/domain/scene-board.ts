/**
 * A continuous build (studio-explainer-plan, Asks 3 and 4, part C): one
 * diagram that grows across a section of a lesson, the heart chamber by
 * chamber or the water cycle stage by stage, instead of a new picture for
 * each idea.
 *
 *  - The board. A section has one board of BOARD_COLS × BOARD_ROWS cells
 *    over the whole stage, about twice the camera's usual frame across. A
 *    newcomer takes the free cell nearest what it connects to (an arrow's
 *    other end), else the one after the last placed. Placed things never
 *    move: only the camera does. The rows the whole section uses are
 *    spread down the stage (`rows`), so a diagram of two rows fills a
 *    16:9 frame as well as one of three, and there is room between rows
 *    for an arrow and its label.
 *  - The camera frames the newest thing and what it connects to, never
 *    more than FRAME_MOST of the board across, and never cutting through
 *    a thing: one at its edge is taken in whole or left out. At a recap
 *    sentence, and as the section ends, it pulls out to the whole board,
 *    the diagram fitted to the frame and centred in it.
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
 *
 * In a tall film (studio-vertical-plan §4.4) the stage shows the same
 * board turned: its columns are rows, 3 × 4, read top to bottom (the
 * first thing top middle), paging up and off rather than to the left.
 * The board is laid in the tall text area, so a pull-out to the whole is
 * inside the safe zone and its words large enough to read; the camera
 * frames a part of it by where the frame's text area falls, never more
 * than FRAME_MOST of the board's height, never less than FRAME_LEAST.
 */
import { TALL_AREA } from './scene-lesson-shape';
import { sameSubject } from './scene-picture-label';
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
/** The board as each shape's stage shows it: a tall one's turned, its columns rows (§4.4). */
export const BOARD_GRID = {
  wide: { cols: BOARD_COLS, rows: BOARD_ROWS },
  tall: { cols: BOARD_ROWS, rows: BOARD_COLS },
} as const;
/** The least an arrow's label or a caption may be, seen at a pull-out to the whole board, for the pull-out to be taken (§4.4). */
export const PULL_OUT_LEAST = 32;

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
  // The same kind and name is the same thing only when it is drawn as
  // the same thing: a drawing's brief of another subject is another one.
  const sameOf = (thing: SceneThing) => {
    const same = byKey.get(`${thing.kind}:${keyOf(thing)}`);
    if (!same || thing.kind !== 'drawing' || same.kind !== 'drawing')
      return same;
    return sameSubject(same, thing) ? same : undefined;
  };
  for (const thing of script.cast) {
    const same = sameOf(thing);
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
    const same = sameOf(thing);
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
  options: {
    end?: boolean;
    /** The rows the whole section uses (sectionRows): the stage spreads them the same in every scene of it. */
    rows?: RowSpan;
  } = {},
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
  // The rows spread down the stage: the section's, and at least this scene's own.
  const own = out.flatMap((s) =>
    Object.values(s.stage?.board?.cells ?? {}).map((c) => c[1]),
  );
  const rows = spanOf([...own, ...(options.rows ?? [])]);
  return {
    script: {
      ...kept,
      cast,
      steps: out,
      board: { carried: [...(carry?.order ?? [])], ...(rows ? { rows } : {}) },
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

/** The first and last row of the board a section uses. */
export type RowSpan = [number, number];

/** The span of some rows, or null for none. */
export function spanOf(rows: readonly number[]): RowSpan | null {
  return rows.length ? [Math.min(...rows), Math.max(...rows)] : null;
}

/** A box on a staging: x, y, w, h. */
export type Box = [number, number, number, number];

type Rect = { x: number; y: number; w: number; h: number };

/** The board on a staging: the whole content box. */
export function boardArea(W: number, H: number, margin: number): Rect {
  return { x: margin, y: margin, w: W - margin * 2, h: H - margin * 2 };
}

/** The room between columns: an arrow runs through it. */
export const BOARD_GAP = 48;
/**
 * The room between rows, more than between columns: a thing's caption
 * hangs below it, and an arrow down to the row below and its label need
 * room past the caption.
 */
export const BOARD_ROW_GAP = 96;
/** How much taller than a board of BOARD_ROWS rows a cell may grow when the section uses fewer. */
export const CELL_GROW = 1.45;

/**
 * A cell's box on a staging. The rows the section uses (`rows`, all of
 * them unless said) are spread down the stage: when there are fewer than
 * BOARD_ROWS, taller cells (up to CELL_GROW times), BOARD_ROW_GAP between
 * them, the whole centred. So a diagram of two rows fills a 16:9 frame
 * top to bottom as one of three does, and a pan from row to row stays
 * short.
 */
export function cellBox(
  cell: Cell,
  W: number,
  H: number,
  margin: number,
  rows: RowSpan = [0, BOARD_ROWS - 1],
  /** A tall stage's board: turned, in its text area (tallCellBox). */
  shape: 'wide' | 'tall' = 'wide',
): Rect {
  if (shape === 'tall') return tallCellBox(cell, rows);
  const area = boardArea(W, H, margin);
  const w = (area.w - BOARD_GAP * (BOARD_COLS - 1)) / BOARD_COLS;
  const n = Math.max(1, rows[1] - rows[0] + 1);
  const usual = (area.h - BOARD_ROW_GAP * (BOARD_ROWS - 1)) / BOARD_ROWS;
  const h = Math.min(
    usual * (n < BOARD_ROWS ? CELL_GROW : 1),
    (area.h - BOARD_ROW_GAP * (n - 1)) / n,
  );
  const gap = n > 1 ? BOARD_ROW_GAP : 0;
  const top = area.y + (area.h - (h * n + gap * (n - 1))) / 2;
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    x: round(area.x + cell[0] * (w + BOARD_GAP)),
    y: round(top + (cell[1] - rows[0]) * (h + gap)),
    w: round(w),
    h: round(h),
  };
}

/**
 * A cell's box on a tall stage (§4.4): the board turned, a cell's column
 * its row down the tall text area and its row its column across, the
 * columns the section uses (its rows, turned) spread across and centred,
 * as a wide board spreads its rows down.
 */
export function tallCellBox(
  cell: Cell,
  rows: RowSpan = [0, BOARD_ROWS - 1],
): Rect {
  const area = TALL_AREA;
  const { cols, rows: down } = BOARD_GRID.tall;
  const n = Math.max(1, rows[1] - rows[0] + 1);
  const usual = (area.w - BOARD_GAP * (cols - 1)) / cols;
  const w = Math.min(
    usual * (n < cols ? CELL_GROW : 1),
    (area.w - BOARD_GAP * (n - 1)) / n,
  );
  const gap = n > 1 ? BOARD_GAP : 0;
  const left = area.x + (area.w - (w * n + gap * (n - 1))) / 2;
  const h = (area.h - TALL_ROW_GAP * (down - 1)) / down;
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    x: round(left + (cell[1] - rows[0]) * (w + gap)),
    y: round(area.y + cell[0] * (h + TALL_ROW_GAP)),
    w: round(w),
    h: round(h),
  };
}
/** The room between a tall board's rows, for an arrow down and its label past a caption. */
export const TALL_ROW_GAP = 72;

/** How far a thing may reach past a view's edge and still count as out of it, or in it. */
const HAIR = 1;

/** Whether a view cuts through a thing: some of it in the view and some out. */
export function slices(view: Rect, thing: Rect): boolean {
  const inX =
    Math.min(view.x + view.w, thing.x + thing.w) - Math.max(view.x, thing.x);
  const inY =
    Math.min(view.y + view.h, thing.y + thing.h) - Math.max(view.y, thing.y);
  if (inX <= HAIR || inY <= HAIR) return false;
  return !contains(view, thing);
}

const contains = (view: Rect, thing: Rect) =>
  thing.x >= view.x - HAIR &&
  thing.y >= view.y - HAIR &&
  thing.x + thing.w <= view.x + view.w + HAIR &&
  thing.y + thing.h <= view.y + view.h + HAIR;

/** How much a view may widen to keep the arrows' labels whole, not cut at its edge. */
export const LABELS_WIDEN = 1.25;

/** The room kept round the whole diagram when the camera pulls out to it, each side, as a share of the frame. */
export const WHOLE_ROOM = 0.04;

/**
 * Where the camera looks at a stage of a build, as a box of the staging's
 * shape: around what it frames and a little room, centred on the newest
 * where that is more than FRAME_MOST of the board across, and never nearer
 * than FRAME_LEAST; then moved or widened as little as it may be so that
 * it cuts through no thing on the board (`extents`, all of them): each is
 * in the view whole, or out of it. At a pull-out, all of the diagram,
 * fitted to the frame and centred in it.
 */
export function frameBox(
  frame: BoardFrame,
  extents: ReadonlyMap<string, Rect>,
  W: number,
  H: number,
  margin: number,
  /** The arrows' labels on the board: kept whole in a view too, where that widens it by at most LABELS_WIDEN. */
  labels: readonly Rect[] = [],
  shape: 'wide' | 'tall' = 'wide',
): Box {
  if (shape === 'tall') return tallFrameBox(frame, extents, W, H, labels);
  const whole: Box = [0, 0, W, H];
  const round = (n: number) => Math.round(n * 10) / 10;
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
  const within = (w: number, cx: number, cy: number): Rect => {
    const h = w / aspect;
    return {
      x: Math.min(W - w, Math.max(0, cx - w / 2)),
      y: Math.min(H - h, Math.max(0, cy - h / 2)),
      w,
      h,
    };
  };
  if (all) {
    // The whole diagram, as big as the frame lets it be, in its middle.
    const fit = 1 / (1 - WHOLE_ROOM * 2);
    const w = Math.min(
      W,
      Math.max(area.w * FRAME_LEAST, (x1 - x0) * fit, (y1 - y0) * fit * aspect),
    );
    const view = within(w, (x0 + x1) / 2, (y0 + y1) / 2);
    return [round(view.x), round(view.y), round(view.w), round(view.h)];
  }
  const room = 1.18;
  let w = Math.max((x1 - x0) * room, (y1 - y0) * room * aspect);
  w = Math.min(area.w * FRAME_MOST, Math.max(area.w * FRAME_LEAST, w));
  const h = w / aspect;
  // Too much to frame whole: on the newest, as much of the rest as fits.
  const newest = boxes[0];
  const fits = (x1 - x0) * room <= w && (y1 - y0) * room <= h;
  const cx = fits ? (x0 + x1) / 2 : newest.x + newest.w / 2;
  const cy = fits ? (y0 + y1) / 2 : newest.y + newest.h / 2;
  const want = within(w, cx, cy);
  const keep = fits ? boxes : [newest];
  // The arrows' labels kept whole too where that costs little; the things always.
  const view =
    (labels.length
      ? unsliced(
          want,
          keep,
          [...extents.values(), ...labels],
          { w: W, h: H },
          want.w * LABELS_WIDEN,
        )
      : null) ?? unsliced(want, keep, [...extents.values()], { w: W, h: H })!;
  return [round(view.x), round(view.y), round(view.w), round(view.h)];
}

/**
 * Where the camera looks at a stage of a tall build (§4.4): a view of the
 * stage's shape whose text area (where the frame's words are safe from
 * the platforms' own buttons and captions) holds what it frames, a little
 * room round it; that text area never more than FRAME_MOST of the board's
 * height and never less than FRAME_LEAST; on the newest where it cannot
 * hold them all; moved or widened as little as it may be to cut through
 * no thing. At a pull-out, the whole stage: the board is its text area.
 */
export function tallFrameBox(
  frame: BoardFrame,
  extents: ReadonlyMap<string, Rect>,
  W: number,
  H: number,
  labels: readonly Rect[] = [],
): Box {
  const whole: Box = [0, 0, W, H];
  const round = (n: number) => Math.round(n * 10) / 10;
  const boxes =
    frame === 'whole'
      ? []
      : frame.flatMap((id) => (extents.get(id) ? [extents.get(id)!] : []));
  if (!boxes.length) return whole;
  const area = TALL_AREA;
  const aspect = W / H;
  // The text area, as shares of a view.
  const t = {
    x0: area.x / W,
    x1: (area.x + area.w) / W,
    y0: area.y / H,
    y1: (area.y + area.h) / H,
  };
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const room = 1.18;
  /** The view's width whose text area holds a box so wide and so tall. */
  const holds = (bw: number, bh: number) =>
    Math.max(bw / (t.x1 - t.x0), (bh / (t.y1 - t.y0)) * aspect);
  /** A view's width whose text area is this share of the board's height. */
  const byShare = (share: number) =>
    ((share * area.h) / (t.y1 - t.y0)) * aspect;
  let w = holds((x1 - x0) * room, (y1 - y0) * room);
  w = Math.min(W, byShare(FRAME_MOST), Math.max(byShare(FRAME_LEAST), w));
  const h = w / aspect;
  const fits = holds((x1 - x0) * room, (y1 - y0) * room) <= w + HAIR;
  const newest = boxes[0];
  const cx = fits ? (x0 + x1) / 2 : newest.x + newest.w / 2;
  const cy = fits ? (y0 + y1) / 2 : newest.y + newest.h / 2;
  // The middle of the text area on the middle of what it frames.
  const want: Rect = {
    x: Math.min(W - w, Math.max(0, cx - ((t.x0 + t.x1) / 2) * w)),
    y: Math.min(H - h, Math.max(0, cy - ((t.y0 + t.y1) / 2) * h)),
    w,
    h,
  };
  // Everything on the board, and the arrows' labels: none seen in the
  // frame but outside its text area (under the platforms' buttons, in the
  // subtitles' band, or cut at its edge). The nearest view so, widened as
  // little as may be; the whole stage always is (the board is its text area).
  const all = [...extents.values(), ...labels];
  const keep = fits ? boxes : [newest];
  const faults = (v: Rect) => {
    const safe = {
      x: v.x + t.x0 * v.w,
      y: v.y + t.y0 * v.h,
      w: (t.x1 - t.x0) * v.w,
      h: (t.y1 - t.y0) * v.h,
    };
    return all.filter((b) => {
      const seen =
        b.x < v.x + v.w - HAIR &&
        b.x + b.w > v.x + HAIR &&
        b.y < v.y + v.h - HAIR &&
        b.y + b.h > v.y + HAIR;
      return seen && !contains(safe, b);
    }).length;
  };
  const holdsAll = (v: Rect) =>
    keep.every((b) =>
      contains(
        {
          x: v.x + t.x0 * v.w,
          y: v.y + t.y0 * v.h,
          w: (t.x1 - t.x0) * v.w,
          h: (t.y1 - t.y0) * v.h,
        },
        b,
      ),
    );
  let best = null as { view: Rect; cost: number } | null;
  for (let grow = 1; grow <= W / want.w + 1e-6; grow *= 1.08) {
    const vw = Math.min(W, want.w * grow);
    const vh = vw / aspect;
    const steps = 8;
    for (let i = -steps; i <= steps; i += 1)
      for (let j = -steps; j <= steps; j += 1) {
        const v = {
          x: Math.min(
            W - vw,
            Math.max(0, cx - ((t.x0 + t.x1) / 2) * vw + (i * vw) / (steps * 3)),
          ),
          y: Math.min(
            H - vh,
            Math.max(0, cy - ((t.y0 + t.y1) / 2) * vh + (j * vh) / (steps * 3)),
          ),
          w: vw,
          h: vh,
        };
        if (faults(v) || !holdsAll(v)) continue;
        // Widening dearer than moving, as unsliced has it.
        const cost = Math.hypot(v.x - want.x, v.y - want.y) + (vw - want.w) * 3;
        if (!best || cost < best.cost) best = { view: v, cost };
      }
    if (best) break;
    if (vw >= W) break;
  }
  const view = best?.view ?? { x: 0, y: 0, w: W, h: H };
  return [round(view.x), round(view.y), round(view.w), round(view.h)];
}

/**
 * Whether a pull-out to the whole board may be taken (§4.4): every word on
 * it, at the scale the whole is seen at, at least PULL_OUT_LEAST. Else the
 * camera stays on what it framed last.
 */
export function pullOutReadable(sizes: readonly number[], scale = 1): boolean {
  return sizes.every((size) => size * scale >= PULL_OUT_LEAST);
}

/**
 * The view nearest `want` that cuts through none of `things`, and still has
 * all of `keep` in it: moved along, or widened, as little as it may be.
 * Moving is dearer than nothing, widening dearer than moving: a wider view
 * is a short pull back, where a move away to leave a thing out is a long
 * pan at the camera's close scale. The whole stage cuts through nothing on
 * it, so there is always one.
 */
export function unsliced(
  want: Rect,
  keep: readonly Rect[],
  things: readonly Rect[],
  stage: { w: number; h: number },
  most = stage.w,
): Rect | null {
  const { h: H } = stage;
  const W = Math.min(stage.w, most);
  const clear = (view: Rect) =>
    keep.every((k) => contains(view, k)) &&
    !things.some((t) => slices(view, t));
  if (clear(want)) return want;
  const aspect = want.w / want.h;
  const pad = 12;
  let best: { view: Rect; cost: number } | null = null;
  const widths: number[] = [];
  for (let w = want.w; w < W; w *= 1.04) widths.push(w);
  widths.push(W);
  for (const w of widths) {
    const h = w / aspect;
    if (h > H + 0.5) break;
    const grow = (w / want.w - 1) * 4;
    if (best && grow >= best.cost) break;
    const cx = want.x + want.w / 2;
    const cy = want.y + want.h / 2;
    // Where an edge of the view may go: as wanted, or just past a thing's edge.
    const xs = [cx - w / 2];
    const ys = [cy - h / 2];
    for (const t of things) {
      xs.push(t.x - pad, t.x + t.w + pad, t.x + t.w + pad - w, t.x - pad - w);
      ys.push(t.y - pad, t.y + t.h + pad, t.y + t.h + pad - h, t.y - pad - h);
    }
    const clamp = (v: number, top: number) => Math.min(top, Math.max(0, v));
    const xOk = [...new Set(xs.map((x) => clamp(x, stage.w - w)))];
    const yOk = [...new Set(ys.map((y) => clamp(y, H - h)))];
    for (const x of xOk)
      for (const y of yOk) {
        const cost =
          grow +
          Math.abs(x + w / 2 - cx) / want.w +
          Math.abs(y + h / 2 - cy) / want.h;
        if (best && cost >= best.cost) continue;
        const view = { x, y, w, h };
        if (clear(view)) best = { view, cost };
      }
  }
  if (best) return best.view;
  return most < stage.w ? null : { x: 0, y: 0, w: W, h: W / aspect };
}

/** Something on a board at a step the eye must read or see whole: a thing, its caption, a label, an arrow's label. */
export interface BoardItem {
  owner: string;
  what: 'thing' | 'caption' | 'label' | 'pill';
  box: Rect;
}

/**
 * Whatever overlaps on a board at one step, strictly: no words on words,
 * no words on a thing (its own caption and labels beside it apart), no
 * thing on a thing. A board has room for everything, so any overlap past
 * a hair is a fault.
 */
export function boardOverlaps(items: readonly BoardItem[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += 1)
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      // A thing's own words are set by it, never on it.
      if (a.owner === b.owner && (a.what === 'thing' || b.what === 'thing'))
        continue;
      const x =
        Math.min(a.box.x + a.box.w, b.box.x + b.box.w) -
        Math.max(a.box.x, b.box.x);
      const y =
        Math.min(a.box.y + a.box.h, b.box.y + b.box.h) -
        Math.max(a.box.y, b.box.y);
      if (x > HAIR && y > HAIR)
        out.push(`${a.owner} ${a.what} / ${b.owner} ${b.what}`);
    }
  return out;
}
