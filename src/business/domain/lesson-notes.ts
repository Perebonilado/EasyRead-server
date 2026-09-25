import {
  nameKeys,
  partNames,
  wordsOf,
  type SceneScript,
  type SceneThing,
} from './scene-script';
import type { GatedDrawing } from './scene-svg';

/**
 * Teacher's notes: a chapter read whole before any of its videos is
 * written, the way a teacher prepares a lesson. For each page, whether it
 * starts something new or carries on from the page before, what it is
 * for, the small ideas it moves through with what to show for each, and
 * what it leaves for the next page. Every page's video is written from
 * its part of the notes, so a chapter plays as one lesson rather than as
 * pages each starting afresh.
 */

/** Notes made under an older shape are made again. */
export const NOTES_VERSION = 2;

/** How a page stands to the page before it. */
export const PAGE_RELATIONS = [
  'fresh',
  'continues',
  'example',
  'recap',
  'exercise',
  'skip',
] as const;
export type PageRelation = (typeof PAGE_RELATIONS)[number];

/** What a small idea does in the lesson. */
export const POINT_KINDS = [
  'hook',
  'explain',
  'example',
  'list',
  'contrast',
  'pitfall',
  'check',
  'recap',
] as const;
export type PointKind = (typeof POINT_KINDS)[number];

/** Pages read in one call: a long chapter is read in parts, each told how the one before it ends. */
export const NOTES_PART_PAGES = 20;
/** Of each page's note, what the reader is given. */
export const NOTES_PAGE_CHARS = 3000;
/** The most small ideas a page is planned in. */
export const POINTS_MOST = 10;

/** One small idea: what the voice says, and what the stage shows for it. */
export interface TalkingPoint {
  say: string;
  /** What comes on or changes: a thing, a list, a part of the diagram; empty when nothing new is shown. */
  show: string;
  kind: PointKind;
}

export interface PageNotes {
  page: number;
  relation: PageRelation;
  /** Why, in a line: "starts mid-list: items 4 to 6 of the six limits". */
  evidence: string;
  /** What the learner can say after it, in a sentence. */
  goal: string;
  /** Ideas and terms first met here. */
  newHere: string[];
  /** What it builds on, with the page it was taught on. */
  callback: string | null;
  points: TalkingPoint[];
  /** The lists worth showing item by item. */
  lists: string[];
  /** The mistake learners make here. */
  pitfall: string | null;
  /** One question the learner can answer after it. */
  check: string | null;
  /** What it leaves open for the next page. */
  handoff: string | null;
  /** What stands on the stage as it ends. */
  endsOn: string[];
}

export interface ChapterNotes {
  version: number;
  topicId: string;
  from: number;
  to: number;
  /** The one question the chapter answers. */
  thread: string;
  /** The example the chapter keeps coming back to, if any. */
  example: string | null;
  /** The picture the chapter builds up page by page, if any. */
  diagram: string | null;
  /** What each thing the chapter keeps showing really is, and how it is drawn, the same on every page. */
  pictures: Picture[];
  pages: PageNotes[];
}

/**
 * One thing the chapter keeps showing, as it really is in the subject: a
 * "client" in computing is a device or an app, in law a person. Drawn the
 * same way on every page, and as a person only when it is one.
 */
export interface Picture {
  name: string;
  /** What it is, in this subject. */
  is: string;
  /** What to draw. */
  draw: string;
  person: boolean;
}

/** What the reader answers: every field present, as a structured answer holds best. */
export interface NotesDraft {
  thread: string;
  example: string | null;
  diagram: string | null;
  pictures?: { name: string; is: string; draw: string; person: boolean }[];
  pages: {
    page: number;
    relation: string;
    evidence: string;
    goal: string;
    newHere: string[];
    callback: string | null;
    points: { say: string; show: string; kind: string }[];
    lists: string[];
    pitfall: string | null;
    check: string | null;
    handoff: string | null;
    endsOn: string[];
  }[];
}

/** Where a chapter's notes are kept. */
export const notesKey = (
  documentId: string,
  contentVersion: number,
  topicId: string,
) => `documents/${documentId}/visuals/v${contentVersion}/notes-${topicId}.json`;

// ── What code can see for itself ─────────────────────────────────────────

/** What a page's own text shows about the page before it. */
export interface PageSign {
  continues: boolean;
  why: string | null;
}

/**
 * The plain signs that a page carries on from the one before: it says
 * "continued", it starts mid-sentence, or it carries on a numbered list.
 * The reader weighs the meaning; these it cannot miss.
 */
export function pageSign(before: string | null, text: string): PageSign {
  const start = text.trim();
  if (!start || !before?.trim()) return { continues: false, why: null };
  if (/\(?\bcontinued\b\)?|\bcont(?:'|’)?d\b/iu.test(start.slice(0, 120)))
    return { continues: true, why: 'the page says it is continued' };
  const firstLetter = /\p{L}/u.exec(start);
  const firstLine = start.split('\n')[0].trim();
  // A page that starts with a small letter starts in a sentence the page
  // before began; a heading, a list or a number does not.
  if (
    firstLetter &&
    firstLetter.index < 3 &&
    /\p{Ll}/u.test(firstLetter[0]) &&
    !/^[a-z]\s*[.)]\s/u.test(firstLine)
  )
    return { continues: true, why: 'it starts mid-sentence' };
  const numbered = /^\s*(\d{1,2})\s*[.)]\s+\S/u.exec(firstLine);
  if (numbered) {
    const n = Number(numbered[1]);
    if (n > 1 && new RegExp(`^\\s*${n - 1}\\s*[.)]\\s+\\S`, 'mu').test(before))
      return {
        continues: true,
        why: `it carries on the page before's numbered list at ${n}`,
      };
  }
  return { continues: false, why: null };
}

/** What a page must be to go unmade: never a page with something to teach. */
const SKIPPED =
  /\b(?:title page|cover|contents|index|referenc|bibliograph|further reading|acknowledg|copyright|dedication|blank|about the author|colophon|imprint)/iu;

const text = (value: unknown, most: number): string =>
  typeof value === 'string'
    ? value.replace(/\s+/gu, ' ').trim().slice(0, most)
    : '';
const texts = (value: unknown, most: number, each: number): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.map((one) => text(one, each)).filter((one) => one.length > 0),
        ),
      ].slice(0, most)
    : [];

/**
 * A chapter's notes made sound: one entry for each of its pages and no
 * others, known relations and kinds, a page's small ideas between none
 * (a page not made) and ten. The code's own signs win over a reading
 * that calls a page fresh, and a page is left unmade only when the
 * reader says why in words that name a page with nothing to teach.
 */
export function mendNotes(
  draft: NotesDraft,
  chapter: { topicId: string; from: number; to: number },
  signs: ReadonlyMap<number, PageSign> = new Map(),
): { notes: ChapterNotes; mended: string[] } {
  const mended: string[] = [];
  const pages: PageNotes[] = [];
  for (let page = chapter.from; page <= chapter.to; page += 1) {
    const raw = (draft.pages ?? []).find((one) => one.page === page);
    const sign = signs.get(page);
    if (!raw) {
      mended.push(`page ${page}: not in the notes`);
      pages.push({
        page,
        relation: sign?.continues ? 'continues' : 'fresh',
        evidence: sign?.why ?? '',
        goal: '',
        newHere: [],
        callback: null,
        points: [],
        lists: [],
        pitfall: null,
        check: null,
        handoff: null,
        endsOn: [],
      });
      continue;
    }
    let relation: PageRelation = PAGE_RELATIONS.includes(
      raw.relation as PageRelation,
    )
      ? (raw.relation as PageRelation)
      : 'fresh';
    let evidence = text(raw.evidence, 200);
    if (relation === 'skip' && !SKIPPED.test(evidence)) {
      mended.push(
        `page ${page}: "${evidence}" names no page without a lesson; taught`,
      );
      relation = 'fresh';
    }
    if (relation === 'fresh' && sign?.continues) {
      mended.push(`page ${page}: carries on (${sign.why})`);
      relation = 'continues';
      evidence = sign.why ?? evidence;
    }
    const points: TalkingPoint[] =
      relation === 'skip'
        ? []
        : (raw.points ?? [])
            .map((point) => ({
              say: text(point?.say, 240),
              show: text(point?.show, 120),
              kind: POINT_KINDS.includes(point?.kind as PointKind)
                ? (point.kind as PointKind)
                : ('explain' as const),
            }))
            .filter((point) => point.say.length > 0)
            .slice(0, POINTS_MOST);
    pages.push({
      page,
      relation,
      evidence,
      goal: text(raw.goal, 240),
      newHere: texts(raw.newHere, 8, 60),
      callback: text(raw.callback, 200) || null,
      points,
      lists: texts(raw.lists, 4, 160),
      pitfall: text(raw.pitfall, 200) || null,
      check: text(raw.check, 200) || null,
      handoff: text(raw.handoff, 200) || null,
      endsOn: texts(raw.endsOn, 6, 60),
    });
  }
  return {
    notes: {
      version: NOTES_VERSION,
      topicId: chapter.topicId,
      from: chapter.from,
      to: chapter.to,
      thread: text(draft.thread, 300),
      example: text(draft.example, 240) || null,
      diagram: text(draft.diagram, 240) || null,
      pictures: picturesOf(draft.pictures),
      pages,
    },
    mended,
  };
}

/** The most things a chapter's pictures name. */
const PICTURES_MOST = 16;

/** The pictures made sound: named, said what they are and how drawn, each name once. */
function picturesOf(raw: NotesDraft['pictures']): Picture[] {
  const seen = new Set<string>();
  const out: Picture[] = [];
  for (const one of raw ?? []) {
    const name = text(one?.name, 60);
    const draw = text(one?.draw, 200);
    if (!name || !draw || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({
      name,
      is: text(one?.is, 160),
      draw,
      person: one?.person === true,
    });
  }
  return out.slice(0, PICTURES_MOST);
}

/** Parts of a chapter read at once, each at most NOTES_PART_PAGES long. */
export function notesParts(
  from: number,
  to: number,
): { from: number; to: number }[] {
  const parts: { from: number; to: number }[] = [];
  const count = Math.max(1, Math.ceil((to - from + 1) / NOTES_PART_PAGES));
  const size = Math.ceil((to - from + 1) / count);
  for (let start = from; start <= to; start += size)
    parts.push({ from: start, to: Math.min(to, start + size - 1) });
  return parts;
}

/** Parts read apart, as one chapter's draft: the first part's thread, every page. */
export function joinDrafts(drafts: NotesDraft[]): NotesDraft {
  const first = drafts.find((one) => one.thread?.trim()) ?? drafts[0];
  return {
    thread: first?.thread ?? '',
    example: drafts.find((one) => one.example)?.example ?? null,
    diagram: drafts.find((one) => one.diagram)?.diagram ?? null,
    pictures: drafts.flatMap((one) => one.pictures ?? []),
    pages: drafts.flatMap((one) => one.pages ?? []),
  };
}

// ── Terms ────────────────────────────────────────────────────────────────

/** Each term the chapter teaches, lowercased, and the page it is first taught on. */
export function termsTaught(notes: ChapterNotes): Map<string, number> {
  const taught = new Map<string, number>();
  for (const page of notes.pages)
    for (const term of page.newHere) {
      const key = term.toLowerCase();
      if (!taught.has(key)) taught.set(key, page.page);
    }
  return taught;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Whether a text says a term: as whole words, a plural allowed. */
export function says(text: string, term: string): boolean {
  const words = term.trim();
  if (!words) return false;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escape(words)}(?:e?s)?(?![\\p{L}\\p{N}])`,
    'iu',
  ).test(text);
}

/** Terms the chapter teaches on a later page than this one, never before it. */
export function laterTerms(
  notes: ChapterNotes,
  page: number,
): { term: string; page: number }[] {
  const own = new Set(
    (notes.pages.find((one) => one.page === page)?.newHere ?? []).map((term) =>
      term.toLowerCase(),
    ),
  );
  return [...termsTaught(notes)]
    .filter(([term, at]) => at > page && !own.has(term))
    .map(([term, at]) => ({ term, page: at }));
}

// ── The page before, as it ended ─────────────────────────────────────────

/** How a made page ended: its last words, and what stood on the stage, with the drawings to carry on. */
export interface PageEnding {
  page: number;
  said: string;
  show: string[];
  things: SceneThing[];
  drawings: Record<string, GatedDrawing>;
}

/** Where a made page's ending is kept, for the page after it. */
export const endingKey = (
  documentId: string,
  contentVersion: number,
  page: number,
  generator: string,
) =>
  `documents/${documentId}/visuals/v${contentVersion}/p${page}-${generator}-end.json`;

/** A page's ending, from its script and its drawings. */
export function endingOf(
  script: SceneScript,
  page: number,
  drawings: ReadonlyMap<string, GatedDrawing | null>,
): PageEnding {
  const last = [...script.steps].reverse().find((step) => step.stage)?.stage;
  const show = last?.show ?? [];
  const things = script.cast.filter((thing) => show.includes(thing.id));
  const kept: Record<string, GatedDrawing> = {};
  for (const thing of things) {
    const drawing = drawings.get(thing.id);
    if (thing.kind === 'drawing' && drawing) kept[thing.id] = drawing;
  }
  return {
    page,
    said: script.beats
      .slice(-2)
      .map((beat) => beat.say)
      .join(' '),
    show,
    things,
    drawings: kept,
  };
}

/** One thing as the writer should keep it, to carry it on under its id. */
function thingLine(thing: SceneThing): string {
  switch (thing.kind) {
    case 'drawing':
      return `"${thing.id}": a drawing, name "${thing.name}", brief "${thing.brief}"${thing.parts.length ? `, parts ${thing.parts.map((p) => `"${p.name}"`).join(', ')}` : ''}${thing.states.length ? `, states ${thing.states.map((s) => `"${s.name}"`).join(', ')}` : ''}, shape ${thing.shape}`;
    case 'words':
      return `"${thing.id}": words "${thing.text}"`;
    case 'stat':
      return `"${thing.id}": a stat, ${thing.value} "${thing.caption}"`;
    default:
      return `"${thing.id}": a ${thing.kind}${'name' in thing && thing.name ? ` "${thing.name}"` : ''}`;
  }
}

/**
 * A made page's drawings carried on to the page after it: each the
 * writer brought back under its id is the one drawn before, parts and
 * all, so it is not drawn again and looks the same. A pointer at a part
 * the drawing does not have is left out.
 */
export function carryOver(
  script: SceneScript,
  ending: PageEnding | null,
): {
  script: SceneScript;
  reuse: Map<string, GatedDrawing>;
  mended: string[];
} {
  const reuse = new Map<string, GatedDrawing>();
  const mended: string[] = [];
  if (!ending) return { script, reuse, mended };
  const before = new Map(ending.things.map((thing) => [thing.id, thing]));
  const cast = script.cast.map((thing) => {
    const kept = before.get(thing.id);
    const drawing = ending.drawings[thing.id];
    if (thing.kind !== 'drawing' || kept?.kind !== 'drawing' || !drawing)
      return thing;
    reuse.set(thing.id, drawing);
    return kept;
  });
  if (!reuse.size) return { script, reuse, mended };
  const steps = script.steps.map((step) => ({
    ...step,
    effects: step.effects.filter((effect) => {
      const kept = reuse.has(effect.target)
        ? cast.find((thing) => thing.id === effect.target)
        : null;
      if (!kept || !effect.part) return true;
      const known = partNames(kept).some(
        (name) => name.toLowerCase() === effect.part!.toLowerCase(),
      );
      if (!known)
        mended.push(
          `a ${effect.do} on ${effect.target}.${effect.part}, which the drawing carried on does not have; left out`,
        );
      return known;
    }),
  }));
  mended.unshift(
    `${[...reuse.keys()].join(', ')} carried on from page ${ending.page}, not drawn again`,
  );
  return { script: { ...script, cast, steps }, reuse, mended };
}

// ── For the writer ───────────────────────────────────────────────────────

const RELATION_ASK: Record<Exclude<PageRelation, 'skip'>, string> = {
  fresh:
    'This page starts a new idea. Open with a hook tied to the thread, and say in a line what it builds on.',
  continues:
    'This page carries straight on from the page before, in the same lesson. Do not open as a new video, greet, or introduce the topic again. Open with one sentence of your own that links where the page before stopped to what this page adds, then go on, with the stage as it was left. Never open with a stock phrase.',
  example:
    'This page works through an example of the idea before. Say so in a line, then go straight into it, on the same stage.',
  recap:
    'This page sums up. Ask the learner to recall each idea before you remind them, and show each as it is recalled.',
  exercise:
    'This page sets exercises. Work one through as a teacher would, step by step, and leave the rest to the learner to try.',
};

const KIND_WORD: Record<PointKind, string> = {
  hook: 'hook',
  explain: 'explain',
  example: 'example',
  list: 'list',
  contrast: 'contrast',
  pitfall: 'mistake to avoid',
  check: 'check',
  recap: 'recap',
};

/**
 * A page's part of the notes, for its writer: the chapter's thread, the
 * page before and after, and this page's small ideas, each to be given
 * its own change of the stage as the voice reaches it.
 */
export function describeNotes(
  notes: ChapterNotes,
  page: number,
  ending: PageEnding | null = null,
): string {
  const here = notes.pages.find((one) => one.page === page);
  if (!here) return '';
  const before = notes.pages.find((one) => one.page === page - 1);
  const after = notes.pages.find((one) => one.page === page + 1);
  const carriesOn = here.relation !== 'fresh' && here.relation !== 'skip';
  const lines: string[] = [
    "Teacher's notes: a teacher read the whole chapter before any of its videos was made, and planned this page as one part of one lesson. Follow them: they say what to teach here and what to show. The page itself stays the source of every fact.",
  ];
  if (notes.thread) lines.push(`The chapter's thread: ${notes.thread}`);
  if (notes.example)
    lines.push(
      `The example the chapter keeps coming back to: ${notes.example}. Use it wherever it helps, drawn the same way each time.`,
    );
  if (notes.diagram)
    lines.push(`The picture the chapter builds up: ${notes.diagram}.`);
  if (notes.pictures?.length)
    lines.push(
      `What the chapter's things really are, and how each is drawn on every page (keep to these; only one marked a person is drawn as a person):\n- ${notes.pictures
        .map(
          (one) =>
            `${one.name}: ${one.is ? `${one.is}; ` : ''}draw ${one.draw}${one.person ? ' (a person)' : ' (never a person)'}`,
        )
        .join('\n- ')}`,
    );
  if (page === notes.from) lines.push('This is the first page of the chapter.');
  else if (before)
    lines.push(
      `The page before (${before.page}) taught: ${before.goal || 'its own idea'}.${before.handoff ? ` It left open: ${before.handoff}` : ''}${before.endsOn.length ? ` It ends showing: ${before.endsOn.join(', ')}.` : ''}`,
    );
  if (here.relation !== 'skip')
    lines.push(
      `${RELATION_ASK[here.relation]}${here.evidence ? ` (Why: ${here.evidence}.)` : ''}`,
    );
  if (carriesOn && ending?.things.length)
    lines.push(
      `As the page before ended, the voice said: "${ending.said}" The stage showed:\n- ${ending.things.map(thingLine).join('\n- ')}\nOpen on these same things, under the same ids, with the same names, briefs, parts and shapes, so they carry on as they are; then change the stage as this page's ideas come.`,
    );
  if (here.goal)
    lines.push(`This page's goal: the learner can say ${here.goal}`);
  if (here.newHere.length)
    lines.push(
      `New here: ${here.newHere.join(', ')}. Say each clearly the first time, explain it in plain words, and bring its keyword card on at that word.`,
    );
  if (here.callback)
    lines.push(
      `It builds on: ${here.callback}. Ask the learner to recall it (a question, then a beat) before you remind them.`,
    );
  if (here.points.length)
    lines.push(
      `The small ideas, in order. Give each its own change of the stage as the voice reaches it, with what it says to show:\n${here.points
        .map(
          (point, k) =>
            `${k + 1}. [${KIND_WORD[point.kind]}] ${point.say}${point.show ? ` Show: ${point.show}.` : ''}`,
        )
        .join('\n')}`,
    );
  if (here.lists.length)
    lines.push(
      `Lists to show item by item, each as it is said: ${here.lists.join('; ')}.`,
    );
  if (here.pitfall)
    lines.push(
      `The mistake learners make here: ${here.pitfall}. Name it in a line and show it beside the right idea.`,
    );
  if (here.check)
    lines.push(
      `Near the end, put this question to the learner, leave a beat, then answer it in a line: ${here.check}`,
    );
  if (after && after.relation !== 'skip')
    lines.push(
      `The page after teaches: ${after.goal || 'its own idea'}. End by leading toward it${here.handoff ? ` (${here.handoff})` : ''}, without teaching it.`,
    );
  const later = laterTerms(notes, page);
  if (later.length)
    lines.push(
      `Terms the chapter teaches later, not yet: ${later
        .slice(0, 12)
        .map((one) => `${one.term} (page ${one.page})`)
        .join(
          ', ',
        )}. Do not use them unless this page does, and then explain them in a few plain words.`,
    );
  return lines.join('\n');
}

// ── Checks on what was written ───────────────────────────────────────────

/** The keys a thing can be found by: its id, name, words and parts. */
function thingKeys(thing: SceneThing): string[] {
  const names = [
    thing.id.replace(/[-_]/gu, ' '),
    ...('name' in thing && typeof thing.name === 'string' ? [thing.name] : []),
    ...(thing.kind === 'words' ? [thing.text] : []),
    ...(thing.kind === 'stat' ? [thing.caption] : []),
    ...partNames(thing),
  ];
  return [...new Set(names.flatMap(nameKeys))];
}

/**
 * What the notes planned against what was written: each small idea with
 * something to show, shown; the stage changed about as often as the
 * page has ideas; and no term the chapter teaches later used before its
 * time. Each a reason to write the page again.
 */
export function notesProblems(
  script: SceneScript,
  notes: ChapterNotes,
  page: number,
  material: string,
): { problems: string[]; points: number; shown: number } {
  const here = notes.pages.find((one) => one.page === page);
  if (!here || script.fit === 'poor')
    return { problems: [], points: 0, shown: 0 };
  const problems: string[] = [];
  const stages = script.steps.filter((step) => step.stage).length;
  const onStage = new Set(script.steps.flatMap((s) => s.stage?.show ?? []));
  const keysOnStage = new Set(
    script.cast
      .filter((thing) => onStage.has(thing.id))
      .flatMap((thing) => thingKeys(thing)),
  );
  const planned = here.points.filter((point) => point.show);
  const missing = planned.filter(
    (point) => !nameKeys(point.show).some((key) => keysOnStage.has(key)),
  );
  const shown = planned.length - missing.length;
  if (here.points.length >= 3 && stages < here.points.length - 1)
    problems.push(
      `The teacher's notes plan ${here.points.length} small ideas for this page, but the stage changes only ${stages} times: give each idea its own change of the stage as the voice reaches it.`,
    );
  if (planned.length >= 3 && missing.length > planned.length / 3)
    problems.push(
      `Nothing on the stage shows these ideas from the notes: ${missing
        .slice(0, 4)
        .map((point) => `"${point.show}"`)
        .join(', ')}. Bring each on as the voice says it.`,
    );
  const said = script.beats.map((beat) => beat.say).join(' ');
  const early = laterTerms(notes, page).filter(
    (one) => says(said, one.term) && !says(material, one.term),
  );
  if (early.length)
    problems.push(
      `The narration uses ${early
        .slice(0, 3)
        .map((one) => `"${one.term}", taught on page ${one.page}`)
        .join(
          '; ',
        )}, before the chapter teaches it. Leave it for that page, or say it in plain words here.`,
    );
  return { problems, points: planned.length, shown };
}

/**
 * Each new term's first sentence on the page: where the voice gives it
 * weight, the first time the learner hears it.
 */
export function firstSaid(
  beats: readonly { say: string }[],
  terms: readonly string[],
): Map<number, string[]> {
  const at = new Map<number, string[]>();
  for (const term of terms) {
    const k = beats.findIndex((beat) => says(beat.say, term));
    if (k >= 0) at.set(k, [...(at.get(k) ?? []), term]);
  }
  return at;
}

/** Words a minute: the words spoken over the time spent saying them, pauses left out. */
export function wordsPerMinute(
  beats: readonly { text: string; startMs: number; endMs: number }[],
): number {
  const words = beats.reduce((sum, beat) => sum + wordsOf(beat.text).length, 0);
  const ms = beats.reduce(
    (sum, beat) => sum + Math.max(0, beat.endMs - beat.startMs),
    0,
  );
  return ms > 0 ? Math.round(words / (ms / 60000)) : 0;
}

/** The picture the notes give a thing, found by its name or id. */
export function pictureFor(
  notes: ChapterNotes,
  thing: { id: string; name?: string },
): Picture | null {
  const keys = new Set(
    [thing.name ?? '', thing.id.replace(/[-_]/gu, ' ')].flatMap(nameKeys),
  );
  if (!keys.size) return null;
  // The picture whose name's words the thing's name shares most.
  let best: Picture | null = null;
  let most = 0;
  for (const one of notes.pictures ?? []) {
    const shared = nameKeys(one.name).filter((key) => keys.has(key)).length;
    if (shared > most) {
      best = one;
      most = shared;
    }
  }
  return best;
}

/**
 * Each thing drawn as the notes say it really is: a person the notes call
 * a machine or a program ("Client 2" in a system's design) becomes a
 * drawing of it, and pointers at a person's head or arms, or a face, go.
 */
export function drawnAsTheyAre(
  script: SceneScript,
  notes: ChapterNotes | null,
): { script: SceneScript; mended: string[] } {
  const mended: string[] = [];
  if (!notes?.pictures?.length) return { script, mended };
  const recast = new Set<string>();
  const cast = script.cast.map((thing): SceneThing => {
    if (thing.kind !== 'person') return thing;
    const picture = pictureFor(notes, thing);
    if (!picture || picture.person) return thing;
    recast.add(thing.id);
    mended.push(
      `"${thing.name}" is ${picture.is || 'not a person'}: drawn as ${picture.draw}, not as a person`,
    );
    return {
      id: thing.id,
      kind: 'drawing',
      name: thing.name,
      brief: `${picture.draw}. It is ${picture.is || picture.name}, not a person: no people or faces.`,
      motion: 'a gentle glow, as if at work',
      parts: [],
      states: [],
      shape: 'square',
      sound: null,
    };
  });
  if (!recast.size) return { script, mended };
  const steps = script.steps.map((step) => ({
    ...step,
    effects: step.effects.filter(
      (effect) => !(recast.has(effect.target) && effect.part),
    ),
  }));
  return { script: { ...script, cast, steps }, mended };
}
