/**
 * An editor's script cut into scenes (infographic-editor-plan §3, stage
 * 5's seam): the two-column rows become the Studio's own outline, so the
 * boards, the voice and the player work on it as they do on any
 * explainer's. All code, and pure.
 *
 *  - Rows that are scenes of people and places (visual "scene") side by
 *    side are one illustrated scene: a narrated shot, or a short run of
 *    them, 4 to 30 seconds, in one of the world's places.
 *  - The rest are lesson scenes, kept to their act, and to one base
 *    picture where they share one: a run of places stays one map scene,
 *    a run of whens one timeline scene. Each 10 to 60 seconds; a scrap too
 *    short to stand alone joins the scene beside it in its act.
 *  - Each scene keeps the rows it is (first and last), its narration as
 *    its teaching (what the lesson writer reads), each row's picture as
 *    one of its points, and its seconds from its words at the audience's
 *    pace.
 */
import {
  EDITOR_MAX_SCENES,
  ILLUSTRATED_SECONDS,
  SCENE_SECONDS,
  type OutlineScene,
  type StudioOutline,
} from './studio';
import { rowSeconds } from './studio-editor-checks';
import type { EditorWorld } from './studio-editor';
import type { EditorialBeats, EditorialRow } from './studio-editorial';

/** How long a lesson scene the editor cuts runs, least and most, in seconds. */
export const EDITOR_LESSON_SECONDS = [10, 60] as const;

/** The base picture a row is shown on: the map, the timeline, a scene, or the lesson's own stage. */
type Family = 'scene' | 'map' | 'timeline' | 'lesson';

const familyOf = (
  row: Pick<EditorialRow, 'visual'>,
  illustrated = true,
): Family =>
  row.visual === 'scene'
    ? illustrated
      ? 'scene'
      : 'lesson'
    : row.visual === 'place'
      ? 'map'
      : row.visual === 'when'
        ? 'timeline'
        : 'lesson';

/**
 * Whether an editor's scenes of people and places are made illustrated
 * (STUDIO_ILLUSTRATED, off unless set on): off, a scene row is a lesson's,
 * its board drawing the moment as a picture.
 */
export function illustratedSwitchOn(setting: string | undefined | null) {
  return /^(?:on|true|1|yes)$/iu.test((setting ?? '').trim());
}

/**
 * Whether an editor's lesson scenes are boarded as shots (EXPLAINER_SHOTS,
 * explainer-animation-tech §1; off unless set on): on, each lesson scene's
 * board is a plan of shots (shots/shot-board), stored on its sheet with
 * engine 'shots', so its make, twin, repace and recompose follow the sheet,
 * never the switch at that moment; off, today's storyboard.
 */
export function shotsSwitchOn(setting: string | undefined | null) {
  return /^(?:on|true|1|yes)$/iu.test((setting ?? '').trim());
}

/**
 * Whether a scene of shots is looked at by the critic once made
 * (EXPLAINER_CRITIC, explainer-animation-plan §9.3; WP13): on with shots
 * unless set off, so every film of shots is scored and fixed before it is
 * shown.
 */
export function criticSwitchOn(setting: string | undefined | null) {
  return !/^(?:off|false|0|no)$/iu.test((setting ?? '').trim());
}

/** What the critic may spend on an episode, in dollars (EXPLAINER_CRITIC_BUDGET): $0.60 unless set. */
export function criticBudget(setting: string | undefined | null): number {
  const n = Number.parseFloat((setting ?? '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0.6;
}

/** A run of rows that will be one scene: from `first` to `last`, of one act and family. */
interface Run {
  first: number;
  last: number;
  act: number;
  family: Family;
}

const isScene = (run: Run) => run.family === 'scene';

/**
 * Runs split where they run long, at row boundaries: as even as the rows
 * allow, none past `most` unless one row alone is.
 */
function splitRuns(run: Run, seconds: (k: number) => number, most: number) {
  const total = (a: number, b: number) => {
    let n = 0;
    for (let k = a; k <= b; k += 1) n += seconds(k);
    return n;
  };
  const all = total(run.first, run.last);
  if (all <= most) return [run];
  const pieces = Math.ceil(all / most);
  const target = all / pieces;
  const out: Run[] = [];
  let start = run.first;
  let sum = 0;
  for (let k = run.first; k <= run.last; k += 1) {
    sum += seconds(k);
    const rest = run.last - k;
    if (k > start && sum > most) {
      // Over: this row starts the next piece.
      out.push({ ...run, first: start, last: k - 1 });
      start = k;
      sum = seconds(k);
    } else if (sum >= target && rest > 0 && out.length < pieces - 1) {
      out.push({ ...run, first: start, last: k });
      start = k + 1;
      sum = 0;
    }
  }
  if (start <= run.last) out.push({ ...run, first: start, last: run.last });
  return out;
}

/** A few words of a sentence, for a scene's title. */
function titleOf(say: string): string {
  const words = say
    .replace(/[.!?]+$/u, '')
    .split(/\s+/u)
    .filter(Boolean);
  return words.length > 7 ? `${words.slice(0, 7).join(' ')}…` : words.join(' ');
}

/** The world's place a scene's rows are in, by its name in their words; else the first place. */
function placeIn(world: EditorWorld | null, words: string): string | null {
  if (!world?.places.length) return null;
  const said = words.toLowerCase();
  const named = world.places.find((p) => said.includes(p.name.toLowerCase()));
  if (named) return named.id;
  // A place of its kind, by the kind's word ("the hall", "a market").
  const kind = world.places.find((p) =>
    new RegExp(`\\b${p.kind}\\b`, 'u').test(said),
  );
  return (kind ?? world.places[0]).id;
}

/** Words of a name that are no one's in particular: titles. */
const TITLES = new Set([
  'pope',
  'king',
  'queen',
  'saint',
  'prince',
  'princess',
  'emperor',
  'empress',
  'president',
  'prime',
  'minister',
  'general',
  'doctor',
  'lord',
  'lady',
  'chief',
  'sultan',
  'sir',
]);

/** The world's people a scene's rows name: by their whole name, or a word of it that is theirs (not a title). */
function peopleIn(world: EditorWorld | null, words: string): string[] {
  if (!world) return [];
  const said = words.toLowerCase();
  return world.people
    .filter((p) => {
      const name = p.name.toLowerCase();
      if (said.includes(name)) return true;
      return name
        .split(/[\s.,'’-]+/u)
        .filter((w) => w.length > 3 && !TITLES.has(w))
        .some((w) =>
          new RegExp(
            `(?:^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|[^\\p{L}])`,
            'u',
          ).test(said),
        );
    })
    .map((p) => p.id)
    .slice(0, 4);
}

/**
 * An editor's rows cut into the outline's scenes, in order: illustrated
 * scenes where people and places carry the line, lesson scenes for the
 * rest, at most EDITOR_MAX_SCENES, each the rows it is.
 */
export function cutScenes(
  rows: readonly EditorialRow[],
  beats: Pick<EditorialBeats, 'acts'> | null,
  world: EditorWorld | null,
  wpm: number,
  /** Illustrated scenes made as such (STUDIO_ILLUSTRATED); off, every row is a lesson's. */
  illustrated = true,
): OutlineScene[] {
  if (!rows.length) return [];
  const seconds = (k: number) => rowSeconds(rows[k], wpm);
  const span = (run: Run) => {
    let n = 0;
    for (let k = run.first; k <= run.last; k += 1) n += seconds(k);
    return n;
  };
  // Runs of one act and one family.
  let runs: Run[] = [];
  rows.forEach((row, k) => {
    const family = familyOf(row, illustrated);
    const last = runs[runs.length - 1];
    if (last && last.act === row.act && last.family === family) last.last = k;
    else runs.push({ first: k, last: k, act: row.act, family });
  });
  // A lesson scrap too short to stand alone joins the lesson beside it in
  // its act (the one before first), whatever picture it is on: a map's
  // one line belongs to the lesson it is said in.
  // One alone in its act between illustrated scenes stands as it is.
  for (let round = 0; round < rows.length; round += 1) {
    let joined = false;
    for (let at = 0; at < runs.length && !joined; at += 1) {
      const run = runs[at];
      if (isScene(run) || span(run) >= EDITOR_LESSON_SECONDS[0]) continue;
      const before = runs[at - 1];
      const after = runs[at + 1];
      const into =
        before && !isScene(before) && before.act === run.act
          ? before
          : after && !isScene(after) && after.act === run.act
            ? after
            : null;
      if (!into) continue;
      into.first = Math.min(into.first, run.first);
      into.last = Math.max(into.last, run.last);
      if (into.family !== run.family) into.family = 'lesson';
      runs.splice(at, 1);
      joined = true;
    }
    if (!joined) break;
  }
  // Neighbours the joins left alike (an act, a picture) are one run again.
  runs = runs.reduce<Run[]>((out, run) => {
    const last = out[out.length - 1];
    if (last && last.act === run.act && last.family === run.family)
      last.last = run.last;
    else out.push({ ...run });
    return out;
  }, []);
  // Long runs split: an illustrated scene at thirty seconds, a lesson at sixty.
  runs = runs.flatMap((run) =>
    splitRuns(
      run,
      seconds,
      isScene(run) ? ILLUSTRATED_SECONDS[1] : EDITOR_LESSON_SECONDS[1],
    ),
  );
  // Too many: the two shortest lessons side by side in an act made one.
  while (runs.length > EDITOR_MAX_SCENES) {
    let best = -1;
    let bestSpan = Infinity;
    for (let k = 0; k < runs.length - 1; k += 1) {
      const a = runs[k];
      const b = runs[k + 1];
      if (a.act !== b.act || isScene(a) !== isScene(b)) continue;
      const both = span(a) + span(b);
      if (both < bestSpan) {
        bestSpan = both;
        best = k;
      }
    }
    if (best < 0) break;
    const [a, b] = [runs[best], runs[best + 1]];
    runs.splice(best, 2, {
      ...a,
      last: b.last,
      family: a.family === b.family ? a.family : 'lesson',
    });
  }
  const acts = beats?.acts ?? [];
  return runs.map((run): OutlineScene => {
    const mine = rows.slice(run.first, run.last + 1);
    const said = mine.map((r) => r.say).join(' ');
    const shown = mine.map((r) => r.show).filter(Boolean);
    const words = `${said} ${shown.join(' ')}`;
    const illustrated = isScene(run);
    const [least, most] = illustrated ? ILLUSTRATED_SECONDS : SCENE_SECONDS;
    const opensAct = runs.find((r) => r.act === run.act) === run;
    return {
      title:
        opensAct && acts[run.act - 1]?.title
          ? acts[run.act - 1].title
          : titleOf(mine[0].say),
      summary: said.slice(0, 500),
      set: illustrated ? placeIn(world, words) : null,
      cast: illustrated ? peopleIn(world, words) : [],
      seconds: Math.round(Math.min(most, Math.max(least, span(run)))),
      teach: said,
      points: shown.slice(0, 16),
      rows: [run.first, run.last],
      ...(illustrated ? { kind: 'illustrated' as const } : {}),
    };
  });
}

/** An editor's episode as the Studio's outline: its scenes cut from its script, marked the editor's. */
export function editorOutline(input: {
  title: string;
  question: string;
  rows: readonly EditorialRow[];
  beats: Pick<EditorialBeats, 'acts'> | null;
  world: EditorWorld | null;
  wpm: number;
  /** Illustrated scenes made as such; absent, they are. */
  illustrated?: boolean;
}): StudioOutline {
  return {
    title: input.title,
    logline: input.question,
    scenes: cutScenes(
      input.rows,
      input.beats,
      input.world,
      input.wpm,
      input.illustrated ?? true,
    ),
    editor: true,
  };
}

/** The scene a row of the script is in, by its place in the outline; null for none. */
export function sceneOfRow(
  scenes: readonly Pick<OutlineScene, 'rows'>[],
  row: number,
): number | null {
  const at = scenes.findIndex(
    (s) => s.rows && s.rows[0] <= row && row <= s.rows[1],
  );
  return at < 0 ? null : at;
}
