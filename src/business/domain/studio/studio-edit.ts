/**
 * How the film joins one scene to the next, from the two sheets. The
 * player keeps room at both ends of each scene (its edit, the client's
 * lib/scene/edit.ts) and makes every join inside it:
 *
 *  - A cut: the same place, time running on. Straight from one to the next.
 *  - A dissolve: a new place, or the weather changed. The next picture
 *    comes up over the last; an explainer's scenes, one idea giving way to
 *    the next, join so too.
 *  - A dip: time has passed. Down to black, a breath of it, and up again:
 *    where the writer says so ("fade"), or the light has changed.
 */
import type { FilmShape } from '../scene-shape';
import type { StudioJoinName, StudioJoinWithDto } from '../../../contracts';
import { groupId } from '../scene-ids';
import type {
  ExplainerSheet,
  OutlineScene,
  SceneSheet,
  StudioPicture,
} from './studio';

export type Join = 'cut' | 'dissolve' | 'dip';

/**
 * About how long each join adds to the film, in seconds: the room kept
 * after one scene and before the next, less what the two share.
 */
export const JOIN_SECONDS = 2;

/**
 * How the film comes into a scene from the one before. A sheet that is
 * not known (null) joins as a new place does.
 */
export function joinOf(
  before: SceneSheet | null,
  sheet: SceneSheet | null,
): Join {
  if (sheet?.transition === 'fade') return 'dip';
  if (before?.kind !== 'story' || sheet?.kind !== 'story') return 'dissolve';
  if (before.time !== sheet.time) return 'dip';
  if (before.set !== sheet.set || before.weather !== sheet.weather)
    return 'dissolve';
  return 'cut';
}

/** How many seconds the joins add to a film of this many scenes. */
export const joinsSeconds = (scenes: number) =>
  Math.max(0, scenes - 1) * JOIN_SECONDS;

// ── An explainer's joins (studio-explainer-plan, Ask 4 D) ─────────────────

/** Every way the film goes from one scene to the next: a story's three, and an explainer's own. */
export type JoinName = StudioJoinName;

/** A join and what it carries: the thing the scene before leaves on, the one this opens on, the part a zoom goes into (their ids on the stage). */
export interface JoinPlan {
  join: JoinName;
  joinWith?: StudioJoinWithDto;
}

/** One side of a join: the scene's sheet, and its outline scene where known (its teaching, and the part it goes into). */
export interface JoinSide {
  sheet: SceneSheet | null;
  scene?: Pick<
    OutlineScene,
    'title' | 'summary' | 'teach' | 'points' | 'into'
  > | null;
  /** E5's continuous build: this scene carries on the diagram before. */
  build?: 'start' | 'continue' | null;
}

type Cast = ExplainerSheet['draft']['cast'][number];

/** A thing's id on the stage, as the writer's is made one (scene-script's slug). */
const stageId = (id: string) => groupId(id).slice(0, 32);

/** Little words and plurals that do not tell two names apart. */
const LITTLE = new Set(['a', 'an', 'the', 'of', 'its', 'their', 'our', 'and']);
const nameKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !LITTLE.has(w))
    .map((w) =>
      w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w,
    )
    .join(' ');

/** What is on an explainer's stage at its end, and what it last landed on; and what it opens on. */
function stagesOf(sheet: ExplainerSheet): {
  last: string[];
  focus: string | null;
  first: string[];
} {
  let show: string[] = [];
  let first: string[] | null = null;
  let focus: string | null = null;
  for (const step of sheet.draft.steps) {
    if (step.show) {
      const added = step.show.filter((id) => !show.includes(id));
      show = step.show;
      if (!first && show.length) first = [...show];
      if (added.length) focus = added[added.length - 1];
    }
    for (const effect of step.effects ?? [])
      if (show.includes(effect.target) && effect.do !== 'hide')
        focus = effect.target;
  }
  if (focus && !show.includes(focus)) focus = show[show.length - 1] ?? null;
  return { last: show, focus, first: first ?? [] };
}

/** The show's picture a thing is, by its name: the bible's recurring pictures. */
const pictureOf = (thing: Cast, pictures: readonly StudioPicture[]) =>
  pictures.find((p) => {
    const key = nameKey(p.name);
    return key && ` ${nameKey(thing.name)} `.includes(` ${key} `);
  }) ?? null;

/** Code draws these from numbers or words: two of a kind are one shape. */
const SET_BY_CODE: ReadonlySet<Cast['kind']> = new Set([
  'chart',
  'plot',
  'timeline',
  'map',
  'math',
  'stat',
]);

/** A list's place in its order, from a scene's title: "Step 2", "Part three", "3. …", "Second, …". */
const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];
const ORDINALS = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];
export function placeInList(title: string): { list: string; n: number } | null {
  const t = title.toLowerCase().trim();
  const named =
    /\b(step|stage|part|phase|rule|reason|way|tip|level|law|layer|round|day)\s+(\d+|[a-z]+)\b/.exec(
      t,
    );
  if (named) {
    const n = /^\d+$/.test(named[2])
      ? Number(named[2])
      : NUMBER_WORDS.indexOf(named[2]);
    if (n > 0) return { list: named[1], n };
  }
  const numbered = /^(\d+)\s*[.):]/.exec(t);
  if (numbered) return { list: '#', n: Number(numbered[1]) };
  const ordinal =
    /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/.exec(
      t,
    );
  if (ordinal) return { list: 'ordinal', n: ORDINALS.indexOf(ordinal[1]) };
  return null;
}

/** Where the next scene's words go into a part: "inside the nucleus", "into the lungs", "a closer look at the valve". */
function namesPartOf(side: JoinSide, parts: readonly string[]): string | null {
  const into = side.scene?.into ? nameKey(side.scene.into) : '';
  if (into) {
    const part = parts.find((p) => {
      const key = nameKey(p);
      return key && (key === into || into.includes(key) || key.includes(into));
    });
    if (part) return part;
  }
  const words = [
    side.scene?.title,
    side.scene?.teach,
    side.scene?.summary,
    ...(side.scene?.points ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  for (const part of parts) {
    const key = part
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, ' ')
      .trim();
    if (!key) continue;
    const said = new RegExp(
      `\\b(?:inside|into|within|zoom(?:s|ing)? in(?:to)?(?: on)?|closer look at|close up on|deep in(?:side)?)\\s+(?:the |a |an |its |their )?${key.replace(/\s+/g, '\\s+')}`,
    );
    if (said.test(words)) return part;
  }
  return null;
}

/**
 * How the film comes into a scene from the one before, chosen by code
 * (studio-explainer-plan, Ask 4 D), never a model, and falling back to a
 * dissolve:
 *
 *  - continue: E5's build carries the diagram on;
 *  - dip: the writer marked time passing ("fade");
 *  - zoom-through: the next scene names a part of what the last one ended
 *    on ("inside the nucleus"), or its outline says `into` it;
 *  - morph: the same thing in both, at the end of one and the start of
 *    the next (its place, and a chart's or graph's numbers, change);
 *  - match: what the last ended on and the next opens on are one of the
 *    show's pictures, or the same shape (a chart and a chart);
 *  - push: two steps of one list ("Step 2", "Step 3"); in a tall film a
 *    push-up, the next coming up from below as a phone's feed scrolls
 *    (studio-vertical-plan §4.6);
 *  - a story's scenes as joinOf has them.
 */
export function joinFor(
  before: JoinSide | null,
  after: JoinSide,
  pictures: readonly StudioPicture[] = [],
  /** The film's shape: absent, wide. */
  shape: FilmShape = 'wide',
): JoinPlan {
  if (after.build === 'continue') return { join: 'continue' };
  const a = before?.sheet ?? null;
  const b = after.sheet;
  if (b?.transition === 'fade') return { join: 'dip' };
  if (a?.kind !== 'explainer' || b?.kind !== 'explainer')
    return { join: joinOf(a, b) };
  const was = stagesOf(a);
  const now = stagesOf(b);
  const castA = new Map(a.draft.cast.map((c) => [c.id, c]));
  const castB = new Map(b.draft.cast.map((c) => [c.id, c]));
  const focus = was.focus ? castA.get(was.focus) : undefined;
  // Into a part of what the last scene ended on.
  if (focus?.kind === 'drawing' && focus.parts?.length) {
    const part = namesPartOf(
      after,
      focus.parts.map((p) => p.name),
    );
    if (part)
      return {
        join: 'zoom-through',
        joinWith: { from: stageId(focus.id), part },
      };
  }
  // The same thing at the end of one and the start of the next.
  const ends = was.last
    .map((id) => castA.get(id))
    .filter((c): c is Cast => Boolean(c));
  const opens = now.first
    .map((id) => castB.get(id))
    .filter((c): c is Cast => Boolean(c));
  const sameThing = (x: Cast, y: Cast) =>
    x.kind === y.kind &&
    nameKey(x.name) !== '' &&
    nameKey(x.name) === nameKey(y.name);
  const ranked = [...ends].sort(
    (x, y) => Number(SET_BY_CODE.has(y.kind)) - Number(SET_BY_CODE.has(x.kind)),
  );
  for (const x of ranked) {
    const y = opens.find((one) => sameThing(x, one));
    if (y)
      return {
        join: 'morph',
        joinWith: { from: stageId(x.id), to: stageId(y.id) },
      };
  }
  // What it ended on and what the next opens on, of one shape.
  const opening = opens[0];
  if (focus && opening) {
    const shared = pictureOf(focus, pictures);
    const matched =
      (shared && pictureOf(opening, pictures) === shared) ||
      (focus.kind === opening.kind && SET_BY_CODE.has(focus.kind)) ||
      (focus.kind === 'drawing' &&
        opening.kind === 'drawing' &&
        focus.shape !== null &&
        focus.shape === opening.shape &&
        Boolean(shared));
    if (matched)
      return {
        join: 'match',
        joinWith: { from: stageId(focus.id), to: stageId(opening.id) },
      };
  }
  // The next step of one list.
  const one = placeInList(before?.scene?.title ?? a.title);
  const two = placeInList(after.scene?.title ?? b.title);
  if (one && two && one.list === two.list && two.n === one.n + 1)
    return { join: shape === 'tall' ? 'push-up' : 'push' };
  return { join: 'dissolve' };
}
