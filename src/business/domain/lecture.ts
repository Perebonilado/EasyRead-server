/**
 * Lectures: the rules that turn a document into a spoken lecture.
 *
 * The whole feature rests on one decision recorded here: a lecture is
 * planned per TOPIC and cut per PAGE. Scripting each page on its own
 * produces competent little summaries with no through-line, which is
 * audiobook-with-extra-steps — the exact thing this feature exists to
 * beat. The arc (hook, build, callback, payoff) lives on the plan; the
 * segments are slices of it that happen to align with what the student
 * sees on screen.
 *
 * Everything here is pure: no repositories, no model calls, no clock.
 */

import type { LectureSegmentStatus } from '../../contracts';
import { createHash } from 'node:crypto';
import type { LectureStyle } from '../../contracts';

/**
 * The generator's identity, stamped on every row it writes and baked into
 * every audio key. Bumped whenever the prompts change enough that audio
 * made by the previous generator must not be served for a new script.
 */
export const LECTURE_GENERATOR_VERSION = 'lecture-6';

/** A page with fewer readable characters than this carries no lecture. */
export const MIN_PAGE_CHARS = 120;

/**
 * How many times a segment may be written. The first attempt is the
 * lecture as planned, the second carries the verifier's objections or the
 * style check's, and the last stays strictly on the page when it was the
 * grounding that failed: a plain page beats a hole.
 */
export const MAX_SEGMENT_ATTEMPTS = 3;

export type BeatWeight = 'full' | 'light';

export interface WordBudget {
  min: number;
  max: number;
  /** Where the code steps in and asks for the page again. */
  hard: number;
}

/**
 * Spoken-word budgets by style and page weight. `min` and `max` are what
 * the writer is asked for; `hard` is where the code steps in and asks
 * again. The slack between them is deliberate: a writer told to cut from
 * 230 words loses its rhythm, one told to cut from 300 was not listening.
 */
export const WORD_BUDGET: Record<
  LectureStyle,
  Record<BeatWeight, WordBudget>
> = {
  // Gentle is not the longest: it says fewer things, each in more steps.
  gentle: {
    full: { min: 160, max: 260, hard: 300 },
    light: { min: 80, max: 130, hard: 160 },
  },
  steady: {
    full: { min: 120, max: 220, hard: 260 },
    light: { min: 60, max: 110, hard: 130 },
  },
  brisk: {
    full: { min: 70, max: 140, hard: 170 },
    light: { min: 40, max: 80, hard: 100 },
  },
};

export const DEFAULT_LECTURE_STYLE: LectureStyle = 'steady';

/**
 * What a row of the lecture is. A page is the lecture proper; the others
 * sit around a chapter: the words a slow learner hears before it, the
 * check of what stuck after it, and the review a returning learner hears
 * before carrying on. Play order within one page number follows KIND_RANK.
 */
export type LectureExtraKind = 'terms' | 'check' | 'review';
/** A page, the second piece of a page voiced as two, or an extra. */
export type SegmentKind = 'page' | 'part' | LectureExtraKind;
export const SEGMENT_KINDS: SegmentKind[] = [
  'review',
  'terms',
  'page',
  'part',
  'check',
];
export const KIND_RANK: Record<SegmentKind, number> = {
  review: 0,
  terms: 1,
  page: 2,
  part: 3,
  check: 4,
};

export function isSegmentKind(value: unknown): value is SegmentKind {
  return (
    typeof value === 'string' && (SEGMENT_KINDS as string[]).includes(value)
  );
}

/** Which extras each style gets. A quick learner is spared the words and the review. */
export const EXTRAS_BY_STYLE: Record<LectureStyle, LectureExtraKind[]> = {
  gentle: ['terms', 'check', 'review'],
  steady: ['check', 'review'],
  brisk: ['check'],
};

/** Spoken-word budgets for the extras; short by design. */
export const EXTRA_BUDGET: Record<LectureExtraKind, WordBudget> = {
  terms: { min: 40, max: 130, hard: 170 },
  check: { min: 60, max: 170, hard: 220 },
  review: { min: 50, max: 160, hard: 210 },
};

/**
 * The extra rows a style gets around each chapter of the cut: the words
 * before its first page, the check after its last. Each sits on its page's
 * number, so play order and the player's page mapping are untouched. A
 * chapter with nothing to teach (all bridges) gets neither.
 */
export function extraSeeds<
  T extends {
    topicId: string;
    pageNumber: number;
    seq: number;
    bridge: boolean;
  },
>(segments: T[], style: LectureStyle): (T & { kind: LectureExtraKind })[] {
  const extras = EXTRAS_BY_STYLE[style];
  const byTopic = new Map<string, T[]>();
  for (const segment of segments) {
    const rows = byTopic.get(segment.topicId) ?? [];
    rows.push(segment);
    byTopic.set(segment.topicId, rows);
  }
  const out: (T & { kind: LectureExtraKind })[] = [];
  for (const rows of byTopic.values()) {
    if (!rows.some((row) => !row.bridge)) continue;
    const ordered = [...rows].sort((a, b) => a.seq - b.seq);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (extras.includes('terms')) {
      out.push({ ...first, bridge: false, kind: 'terms' });
    }
    if (extras.includes('check')) {
      out.push({ ...last, bridge: false, kind: 'check' });
    }
  }
  return out;
}

/**
 * A slow learner's page that runs past its budget is voiced as two pieces,
 * cut at a move boundary, so each piece is one idea and the learner paces
 * themselves between them (Mayer and Chandler's learner-paced novices). A
 * page needs this many moves to have a boundary worth cutting at.
 */
export const SPLIT_MIN_MOVES = 3;

export function shouldSplit(
  style: LectureStyle,
  weight: BeatWeight,
  sections: LectureSection[],
): boolean {
  if (style !== 'gentle' || sections.length < SPLIT_MIN_MOVES) return false;
  return wordCount(sectionsToScript(sections)) > WORD_BUDGET.gentle[weight].max;
}

/** The two halves of a page's sections, cut at the move boundary nearest the middle by words. */
export function splitSections(
  sections: LectureSection[],
): [LectureSection[], LectureSection[]] {
  const words = sections.map((section) => wordCount(section.text));
  const total = words.reduce((sum, count) => sum + count, 0);
  let best = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  let before = 0;
  for (let cut = 1; cut < sections.length; cut += 1) {
    before += words[cut - 1];
    const gap = Math.abs(before - (total - before));
    if (gap < bestGap) {
      bestGap = gap;
      best = cut;
    }
  }
  return [sections.slice(0, best), sections.slice(best)];
}

export interface PageScripts {
  script: string;
  moveOffsets: number[];
  /** The sections this piece is made of. */
  sections: LectureSection[];
  /** The board this piece writes: the page's heading and the lines of its moves; null when the page has none. */
  board: PageBoard | null;
  /** The second piece of a page voiced as two; null for a page voiced whole. */
  part: {
    script: string;
    moveOffsets: number[];
    sections: LectureSection[];
    /** The lines of the second piece's moves, on the board the first piece opened. */
    board: PageBoard | null;
  } | null;
}

/**
 * A page's final script, and its second piece when it is split. The
 * opening is joined to the first piece; move offsets are relative to the
 * piece they belong to, so each piece maps time to ideas on its own. The
 * board's lines go with the piece that speaks their move.
 */
export function pageScripts(
  opening: string | null,
  sections: LectureSection[],
  split: boolean,
  board: PageBoard | null = null,
): PageScripts {
  const [head, tail] = split ? splitSections(sections) : [sections, []];
  const headText = sectionsToScript(head);
  const script = opening ? joinOpening(opening, headText) : headText;
  const partText = sectionsToScript(tail);
  const headMoves = new Set(head.map((section) => section.move));
  const tailMoves = new Set(tail.map((section) => section.move));
  const linesOf = (moves: Set<number>, rest: boolean) =>
    (board?.lines ?? []).filter(
      (line) =>
        moves.has(line.move) ||
        // A line whose move no section carries goes with the first piece.
        (rest && !headMoves.has(line.move) && !tailMoves.has(line.move)),
    );
  return {
    script,
    moveOffsets: moveOffsetsOf(script, head),
    sections: head,
    board: board
      ? { heading: board.heading, lines: linesOf(headMoves, true) }
      : null,
    part: partText
      ? {
          script: partText,
          moveOffsets: moveOffsetsOf(partText, tail),
          sections: tail,
          board: board
            ? { heading: null, lines: linesOf(tailMoves, false) }
            : null,
        }
      : null,
  };
}

/** Rows in play order: by position in the document, then by kind. */
export function playOrder<T extends { seq: number; kind: SegmentKind }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) => a.seq - b.seq || KIND_RANK[a.kind] - KIND_RANK[b.kind],
  );
}

export interface LectureStyleSpec {
  key: LectureStyle;
  name: string;
  /** One line in the tutor's voice, for the cards and the bar's popover. */
  subtext: string;
  /** The paragraph of direction the writer gets for this style. */
  direction: string;
  /**
   * Whether a closing that sums up is sent back. Gentle says the idea a
   * second way on purpose; the other two do not.
   */
  recapCheck: boolean;
  /** How much of the previous page the writer is shown. */
  tailChars: number;
  /**
   * How the voice delivers this style: pace, warmth, where it pauses. A
   * slow learner takes each idea in as it is said, so the words are not
   * enough; the delivery has to leave room for that.
   */
  delivery: string;
  /** The rate for voices that take a number instead of words; 1 is natural. */
  speed: number;
}

/**
 * The same lecture taught three ways.
 *
 * Learners differ in how much hand-holding they need, and one script
 * written for the middle serves neither end. The plan of a chapter (hook,
 * arc, payoff, beats and their moves) is shared by every style; only the
 * words are written per style. The names say how the learner learns,
 * which is the question they can answer, rather than how the tutor talks.
 */
export const LECTURE_STYLES: Record<LectureStyle, LectureStyleSpec> = {
  gentle: {
    key: 'gentle',
    name: 'I learn slowly',
    subtext: 'One idea at a time, in plain words, nothing assumed.',
    direction: [
      'You are explaining to a friend who has never met this subject, in',
      'the words you would use over coffee. Everyday words first: say what',
      'a thing is or does in plain words, then give it its name, then say',
      '"which just means" and its meaning in the same breath, for example',
      '"one computer that answers requests, a server, which just means a',
      'machine other machines ask for things". Every technical term the',
      'page uses is kept and said, and each is explained the first time it',
      'appears, never two new terms in one sentence. Short sentences, about',
      'ten words, one thing each; never a sentence that stacks clauses.',
      'Teach the one or two things this page turns on, in the smallest',
      'steps they break into, and leave the rest: fewer things, each fully,',
      'never everything quickly. No abstract nouns where a concrete thing',
      'will do: not "data", but the customer order or the photo the page',
      'talks about; not "the system", but the computers involved. Never',
      'say efficiently, optimally, robust, leverage, ensure, significant or',
      'their kind; say what actually happens instead. Where the page has an',
      'example, walk the whole of it, step by step, thinking aloud, then',
      'say the general rule it shows: one example carried through beats',
      'two mentioned. Ask one small question the listener can answer, then',
      'answer it yourself at once. Before you leave the page, say the one',
      'idea a second way, in a different shape: restate fully on the',
      "chapter's early pages and only in a clause by its last. Assume",
      'nothing was known before this page except what the lecture has',
      'already taught. Do not explain this page the way you explained the',
      'last one.',
    ].join(' '),
    recapCheck: false,
    tailChars: 500,
    delivery: [
      'Speak slowly and gently, unhurried, at about a hundred and twenty',
      'words a minute, as if to someone writing each idea down as you say',
      'it. Pause clearly at every full stop and longer between paragraphs.',
      'A short sentence that states a term and its meaning, or a single',
      'claim, is read slowly and evenly, every word clear, as if you were',
      'writing it on the board while you say it. Never rush a technical',
      'term: say it a little more slowly than the words around it. Warm,',
      'calm and even, never sing-song, and never faster towards the end of',
      'a sentence.',
    ].join(' '),
    speed: 0.9,
  },
  steady: {
    key: 'steady',
    name: 'I learn at a normal pace',
    subtext: 'Clear and concrete, the way most people like to be taught.',
    direction: [
      'Concrete beats abstract: when the page gives a number, a case or an',
      'example, build the explanation on it rather than around it. Say why',
      'before what: before a mechanism, the problem it solves; before a rule,',
      'the situation that needs it. Make the turn visible: most pages have a',
      'moment where the obvious approach breaks or the real idea appears,',
      'and that is where you slow down, because that is what the listener',
      'remembers. At most one rhetorical question, and only if you answer it',
      'yourself.',
    ].join(' '),
    recapCheck: true,
    tailChars: 320,
    delivery: [
      'Speak at a natural teaching pace, clear and warm, with a short pause at',
      'every full stop and a longer one between paragraphs. Even, unhurried,',
      'never breathless.',
    ].join(' '),
    speed: 1,
  },
  brisk: {
    key: 'brisk',
    name: "I'm a quick learner",
    subtext: 'The point, the example if there is one, and on to the next page.',
    direction: [
      "Say the idea, then the page's own example if it has one, then stop.",
      'No scene-setting, no rhetorical questions, no callbacks beyond half a',
      'sentence, no foreshadowing, no closing line. Anything the lecture has',
      'already taught is left out entirely, not shortened, and a term the',
      'lecture has used is used, not defined again. Where the page describes',
      'a procedure, tell the listener to run it in their head before the',
      "page's example confirms it. Write for a listener at double speed:",
      'short sentences, one clause each. The listener is quick and wants the',
      'point; when the page is taught, you are done.',
    ].join(' '),
    recapCheck: true,
    tailChars: 320,
    delivery: [
      'Speak briskly and crisply, like a confident lecturer talking to a quick',
      'listener: no drawn-out pauses, no lingering, every word still clear.',
    ].join(' '),
    speed: 1.1,
  },
};

export function isLectureStyle(value: unknown): value is LectureStyle {
  return value === 'gentle' || value === 'steady' || value === 'brisk';
}

/** A hook longer than this is a paragraph, not an opening. */
export const MAX_HOOK_WORDS = 60;

export interface LectureTopicInput {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
}

export interface LecturePageInput {
  pageNumber: number;
  text: string;
  isEmpty: boolean;
}

/** One page's place in the lecture, handed to the segment writer. */
export interface SegmentJob {
  topicId: string;
  pageNumber: number;
  /** Global play order across the whole document, from 0. */
  seq: number;
  isFirstOfTopic: boolean;
  isLastOfTopic: boolean;
  /** A page with nothing to teach: one spoken line, then move on. */
  bridge: boolean;
}

export interface LectureBeat {
  pageNumber: number;
  goal: string;
  callback?: string | null;
  foreshadow?: string | null;
  /** The one thing this page adds that the listener has not been taught. */
  newHere?: string | null;
  /** What the page repeats from earlier: a clause at most, or nothing. */
  skip?: string | null;
  /** Light pages mostly restate, recap or list; they get the small budget. */
  weight?: BeatWeight;
  /**
   * The two to four steps in which the page's idea is taught, in order.
   * Shared by every style, which is what lets a learner switch style and
   * land on the same idea. Plans from before moves existed have none.
   */
  moves?: string[];
  /** The mistake a student is most likely to make here, where the page shows it. */
  pitfall?: string | null;
  /**
   * The one page of the chapter where the listener is asked to predict
   * before they are told. Problem-first works when it is one moment, not a
   * habit; the plan carries at most one.
   */
  turn?: boolean;
  /** What the page's idea would be drawn as on the board; absent on older plans. */
  figure?: {
    kind: 'process' | 'structure' | 'comparison' | 'none';
    shows: string | null;
  } | null;
}

/** A word the chapter turns on, with its plain meaning beside it. */
export interface LectureTerm {
  term: string;
  meaning: string;
}

export interface LecturePlan {
  hook: string;
  arc: string;
  /** The chapter's words, spoken first for a slow learner. Older plans have none. */
  terms?: LectureTerm[];
  /** The problem the chapter answers, for a quick learner to hear first. */
  problem?: string | null;
  /**
   * What the listener can do at the end that they could not before. The
   * chapter's last page lands on it. Plans written before it existed
   * have none.
   */
  payoff?: string | null;
  /**
   * False when the planner could not produce a hook fit to be spoken word
   * for word (banned opener, too long, or not supported by the material
   * after a rewrite). The writer then opens the chapter itself, under the
   * same style checks. Absent on older plans, which means spoken.
   */
  hookSpoken?: boolean;
  beats: LectureBeat[];
}

export interface HookShape {
  name: string;
  direction: string;
  /** The shape on an unrelated subject: imitation moves a writer that prohibition does not. */
  example: string;
}

/**
 * The shapes a chapter may open with.
 *
 * Left to itself the writer opens every chapter the same way ("Imagine
 * ..."), because a cold open through a concrete situation is the default
 * a language model reaches for, and each chapter is planned blind to the
 * others. So the shape is chosen here, rotating with the chapter's place
 * in the document, and the planner is also shown how the chapters before
 * it actually opened. The thread shape needs an earlier chapter to pick
 * up, so it stays LAST and a document's first chapter is never given it.
 */
export const HOOK_SHAPES: readonly HookShape[] = [
  {
    name: 'a question',
    direction:
      'Ask the one question this chapter answers, in words the listener would use themselves, and let it hang for a moment before you start answering it.',
    example:
      'What actually happens to a request in the half second after you press send?',
  },
  {
    name: 'a surprising specific',
    direction:
      'Open on the most surprising number, fact or claim in the material, stated plainly, then make the listener feel why it is surprising.',
    example:
      'Two out of every three of these systems fail for the same reason, and it is not the one most engineers guess.',
  },
  {
    name: 'a consequence',
    direction:
      'Open on what goes wrong, or what becomes possible, when this idea is missing or in place: the cost or the gain, in concrete terms the material supports.',
    example:
      'Get this wrong and one busy afternoon takes the whole service down with it.',
  },
  {
    name: 'a concrete moment',
    direction:
      'Put the listener inside one specific moment from the material where this idea is needed: what is happening and what is at stake.',
    example:
      'It is two in the morning, the pager goes off, and the dashboard shows every request being refused.',
  },
  {
    name: 'a contrast',
    direction:
      'Open on the gap between what seems reasonable and what the material says is actually true, and make that gap the reason to keep listening.',
    example:
      'You would think more servers means more capacity. Here it means more collisions.',
  },
  {
    name: 'a plain promise',
    direction:
      'Say directly what the listener will be able to do by the end, in one sentence, with none of the ceremony.',
    example:
      'By the end of this you will be able to size one of these systems on the back of an envelope.',
  },
  {
    name: 'a definition turned over',
    direction:
      "State the idea's textbook definition and then what it actually means in practice, in one turn: the gap between the two is the opening.",
    example: 'A cache is not a faster database. It is a bet about the future.',
  },
  {
    name: 'a decision',
    direction:
      'Put the listener in front of a choice the material forces, both options on the table, before saying which one it takes.',
    example:
      'One server, a million users, and something has to give. You choose what.',
  },
  {
    name: 'a number with a face',
    direction:
      'Open on one number from the material and say what it stands for in human terms, so the figure has a face.',
    example:
      'Forty-one bits. That is how much of every one of these IDs is nothing but the time it was made.',
  },
  {
    name: 'a thread from earlier',
    direction:
      'Pick up something from an earlier chapter and show that it left a problem this chapter solves.',
    example:
      'Last chapter left one question open: who decides which request has to wait.',
  },
];

/** The opening shape for a chapter, by its place in the document. */
export function hookShapeFor(
  orderIndex: number,
  hasEarlierChapters: boolean,
): HookShape {
  const index = Number.isFinite(orderIndex) ? Math.max(0, orderIndex) : 0;
  const shape = HOOK_SHAPES[index % HOOK_SHAPES.length];
  const thread = HOOK_SHAPES[HOOK_SHAPES.length - 1];
  return shape === thread && !hasEarlierChapters ? HOOK_SHAPES[0] : shape;
}

/**
 * How a chapter began: its first sentence or two, for the chapters after
 * it to open differently from.
 */
export function openingOf(script: string, maxChars = 160): string {
  const clean = scriptForTts(script).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const end = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('? '),
    cut.lastIndexOf('! '),
  );
  return end > 0 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

/**
 * The first spoken words of every chapter that plays before `beforeSeq`
 * and has been written, in play order.
 *
 * Chapters are written alongside each other, so early in a lecture this is
 * often empty and the rotating shape carries the variety alone; later
 * chapters see the whole lecture so far.
 */
export function openingsBefore(
  rows: { topicId: string | null; seq: number; scriptText: string | null }[],
  beforeSeq: number,
): string[] {
  const first = new Map<string, string>();
  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    if (!row.topicId || !row.scriptText || row.seq >= beforeSeq) continue;
    if (!first.has(row.topicId)) first.set(row.topicId, row.scriptText);
  }
  return [...first.values()].map((script) => openingOf(script));
}

// ── style: the checks the prompts could not enforce ─────────────────────────

/**
 * Sentence-initial openers that mark a lecture as machine-written. The
 * planner is told not to use them and the writer is told not to use them,
 * and neither listens reliably (eleven of sixteen chapters opened with
 * "Imagine" under a prompt that banned the word), so the check lives here
 * and a script that trips it is written again with the reason.
 */
const BANNED_OPENERS: readonly RegExp[] = [
  /^(?:(?:now|just|so|and|let'?s),?\s+)?imagine\b/i,
  /^picture\s+(?:this|that|a|an|the|yourself|you)\b/i,
  /^have you ever\b/i,
  /^let'?s\s+(?:dive|talk|explore|take a look|start|begin|get started)\b/i,
  /^welcome\b/i,
  /^today,?\s+(?:we|you|i)\b/i,
  /^in this (?:chapter|section|lesson|lecture)\b/i,
  /^think about\b/i,
  /^(?:have you )?ever wondered\b/i,
];

/** The two that are banned in EVERY sentence, not only the first. */
const BANNED_ANYWHERE: readonly RegExp[] = [
  /^(?:(?:now|just|so|and|let'?s),?\s+)?imagine\b/i,
  /^picture\s+(?:this|that|a|an|the|yourself|you)\b/i,
];

/** How a page must not begin: audibly clearing its throat. */
const THROAT_CLEARERS: readonly RegExp[] = [
  /^(?:now|so|right),\s/i,
  /^(?:alright|okay)\b/i,
  /^let'?s\b/i,
];

/** A closing sentence that sums up instead of landing. */
const RECAP_ENDING =
  /^(?:in (?:summary|short|conclusion)|to (?:sum up|summari[sz]e|recap)|so,? to recap|overall,|understanding .{0,60} is (?:key|crucial|essential))/i;

export interface StyleProblem {
  kind:
    | 'banned_opener'
    | 'throat_clearing'
    | 'too_long'
    | 'recap_ending'
    | 'moves'
    | 'repetition'
    | 'long_sentences'
    | 'hard_words'
    | 'term_unexplained'
    | 'two_terms';
  detail: string;
}

/**
 * Keeps at most one turn per chapter: the first the planner marked. A
 * chapter that asks for a prediction on every page is a quiz, not a
 * lecture, and the writer is told to mark the pause only at the turn.
 */
export function singleTurn<T extends { turn?: boolean }>(beats: T[]): T[] {
  let seen = false;
  return beats.map((beat) => {
    if (!beat.turn) return beat;
    if (seen) return { ...beat, turn: false };
    seen = true;
    return beat;
  });
}

/** Words in the spoken form of a script. */
export function wordCount(text: string): number {
  const clean = scriptForTts(text);
  return clean ? clean.split(/\s+/).length : 0;
}

/** The spoken sentences of a script, leading quotes and dashes removed. */
export function sentencesOf(text: string): string[] {
  return scriptForTts(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/^["'“”‘’(\-–—\s]+/, '').trim())
    .filter(Boolean);
}

const firstWords = (sentence: string, count = 6) =>
  sentence.split(/\s+/).slice(0, count).join(' ');

/**
 * Openers that must not appear. `hook` scope checks the first sentence
 * against the whole list; `script` scope additionally checks every
 * sentence for the two tics that recur mid-page.
 */
export function openerProblems(
  text: string,
  scope: 'hook' | 'script',
): StyleProblem[] {
  const sentences = sentencesOf(text);
  const problems: StyleProblem[] = [];
  const first = sentences[0] ?? '';
  if (BANNED_OPENERS.some((re) => re.test(first))) {
    problems.push({
      kind: 'banned_opener',
      detail: `Opens with "${firstWords(first)}", which is a banned opener`,
    });
  }
  if (scope === 'script') {
    const offender = sentences
      .slice(1)
      .find((sentence) => BANNED_ANYWHERE.some((re) => re.test(sentence)));
    if (offender) {
      problems.push({
        kind: 'banned_opener',
        detail: `A sentence starts with "${firstWords(offender, 3)}"; never start a sentence that way`,
      });
    }
  }
  return problems;
}

/**
 * Everything wrong with how a written page reads, as opposed to what it
 * claims. Each problem is a reason the writer is handed for another go;
 * none of them ever fails a page on its own. The budget and the recap
 * rule depend on the style being written.
 */
export function styleProblems(
  text: string,
  options: {
    style: LectureStyle;
    weight: BeatWeight;
    bridge: boolean;
    /** The sections as written, for the checks that look between them. */
    sections?: LectureSection[];
    /** For the gentle style's promise of plain words: the page, the chapter's terms, what was taught before. */
    pageText?: string;
    terms?: string[];
    taughtSoFar?: string[];
  },
): StyleProblem[] {
  const problems = openerProblems(text, 'script');
  const sentences = sentencesOf(text);
  const first = sentences[0] ?? '';

  if (THROAT_CLEARERS.some((re) => re.test(first))) {
    problems.push({
      kind: 'throat_clearing',
      detail: `Starts by clearing its throat ("${firstWords(first, 3)}"); start inside the idea`,
    });
  }

  if (!options.bridge) {
    const words = wordCount(text);
    const limit = WORD_BUDGET[options.style][options.weight];
    if (words > limit.hard) {
      problems.push({
        kind: 'too_long',
        detail: `Too long: ${words} words. Cut to under ${limit.max} by leaving things out, not by compressing`,
      });
    }
  }

  if (LECTURE_STYLES[options.style].recapCheck) {
    const closing = sentences
      .slice(-2)
      .find((sentence) => RECAP_ENDING.test(sentence));
    if (closing) {
      problems.push({
        kind: 'recap_ending',
        detail: `Ends on a recap ("${firstWords(closing, 4)}"); land the idea instead`,
      });
    }
  }

  if (options.style === 'gentle' && options.sections) {
    problems.push(...repeatedDevice(options.sections));
  }
  if (options.style === 'gentle' && !options.bridge) {
    problems.push(
      ...plainWordsProblems(text, {
        pageText: options.pageText ?? '',
        terms: options.terms ?? [],
        taughtSoFar: options.taughtSoFar ?? [],
      }),
    );
  }
  return problems;
}

// ── the gentle style's promise, measured ────────────────────────────────────

/** Words that sound like teaching and say nothing; refused unless the page itself uses them. */
const EMPTY_WORDS = new Set([
  'efficient',
  'efficiently',
  'effective',
  'effectively',
  'optimal',
  'optimally',
  'optimize',
  'optimizes',
  'optimized',
  'robust',
  'leverage',
  'leverages',
  'leveraging',
  'facilitate',
  'facilitates',
  'utilize',
  'utilizes',
  'seamless',
  'seamlessly',
  'streamline',
  'streamlined',
  'comprehensive',
  'significant',
  'significantly',
  'essential',
  'essentially',
  'crucial',
  'fundamental',
  'fundamentally',
  'holistic',
  'paradigm',
  'methodology',
  'ensure',
  'ensures',
  'ensuring',
]);

/** Long words a listener knows anyway. */
const EVERYDAY_LONG_WORDS = new Set([
  'everything',
  'everybody',
  'everyone',
  'anything',
  'anybody',
  'anyone',
  'everywhere',
  'anywhere',
  'understanding',
  'information',
  'usually',
  'actually',
  'especially',
  'ordinary',
  'another',
  'remember',
  'together',
  'whatever',
  'whenever',
  'particular',
  'situation',
  'computer',
  'computers',
  'television',
  'telephone',
  'interesting',
  'immediately',
  'automatically',
  'individual',
  'individually',
  'necessarily',
  'temporarily',
  'occasionally',
  'unfortunately',
  'complicated',
]);

/** A rough syllable count: vowel groups, less a silent e. */
export function syllablesOf(word: string): number {
  const lower = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!lower) return 0;
  const groups = lower.match(/[aeiouy]+/g)?.length ?? 0;
  const silent = /[^aeiouy]e$/.test(lower) && groups > 1 ? 1 : 0;
  return Math.max(1, groups - silent);
}

/** The words of a text, lowercased, letters and apostrophes only. */
function plainWordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .split(/[^a-z']+/)
    .filter(Boolean);
}

/**
 * What says a term is being explained, before or after it in the same
 * breath: "which just means", "that is,", "is a", "called", and their kin.
 */
const MEANING_SIGNALS =
  /\b(?:which|that|this|it)\s+(?:just\s+|simply\s+)?means?\b|\bin other words\b|\bthat is,|\b(?:which|that|this|these|those|it|there)(?:\s+is|\s+are|'s|'re)\s+(?:just\s+|simply\s+|only\s+)?(?:a|an|the|when|what|how|where|like|one|any|some|about)\b|\b(?:is|are) (?:just|simply|only)\b|\bthink of (?:it|them|this|that) as\b|\b(?:is|are) (?:a|an|the|when|what|how|where|like)\b|,\s*(?:which|or|meaning)\b|[-\u2013\u2014]\s*(?:which|these are|this is|that is|meaning)\b|\bcalled\b|\bwe call\b|\bknown as\b|\bmeaning\b|\bthe name for\b|\bthe word for\b|: /i;

/** A light stem, so "distributing" is the page's "distribute" and "distribution". */
function plainStem(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(
      /(?:ations?|ation|tions?|ions?|ing|ed|es|s|ly|ness|ment|ments)$/,
      '',
    )
    .replace(/e$/, '')
    .replace(/([bdgmnprt])\1$/, '$1');
}

/**
 * The gentle style's promise, measured, so a page in textbook register
 * is sent back the way a page with a bad opener is: short sentences,
 * everyday words, and every term of the chapter explained in the same
 * breath the first time it is said.
 */
export function plainWordsProblems(
  text: string,
  options: { pageText: string; terms: string[]; taughtSoFar: string[] },
): StyleProblem[] {
  const problems: StyleProblem[] = [];
  const sentences = sentencesOf(text);
  if (!sentences.length) return problems;

  // Sentences: about ten words each; one long one is a stacked clause.
  const lengths = sentences.map((sentence) => wordCount(sentence));
  const average = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  const longest = Math.max(...lengths);
  if (average > 14 || longest > 25) {
    const worst = sentences[lengths.indexOf(longest)];
    problems.push({
      kind: 'long_sentences',
      detail: `Sentences average ${Math.round(average)} words and the longest has ${longest} ("${firstWords(worst, 8)}..."); a slow learner needs short ones, about ten words, one thing each`,
    });
  }

  // Words: the lecturer's own long words, and the ones that say nothing,
  // when the page itself does not use them.
  const pageWords = new Set(plainWordsOf(options.pageText));
  const pageStems = new Set([...pageWords].map(plainStem));
  const termWords = new Set(options.terms.flatMap(plainWordsOf));
  const known = (word: string) =>
    pageWords.has(word) ||
    termWords.has(word) ||
    EVERYDAY_LONG_WORDS.has(word) ||
    pageStems.has(plainStem(word));
  const hard = new Set<string>();
  const empty = new Set<string>();
  for (const word of plainWordsOf(scriptForTts(text))) {
    if (known(word)) continue;
    if (EMPTY_WORDS.has(word)) empty.add(word);
    else if (
      syllablesOf(word) >= 5 ||
      (syllablesOf(word) >= 4 && word.length >= 11) ||
      word.length >= 13
    ) {
      hard.add(word);
    }
  }
  // One word that says nothing is one too many; long words get some room.
  if (empty.size || hard.size > 2) {
    const named = [...empty, ...hard].slice(0, 6);
    problems.push({
      kind: 'hard_words',
      detail: `Words the page does not use and a slow learner may not know: ${named
        .map((word) => `"${word}"`)
        .join(', ')}; say what actually happens, in everyday words`,
    });
  }

  // Terms: each of the chapter's terms, the first time this page says it,
  // is explained in the same breath, and never two in one sentence.
  const lower = scriptForTts(text).toLowerCase();
  const taught = options.taughtSoFar.map((line) => line.toLowerCase());
  const firstUses: { term: string; sentence: number }[] = [];
  for (const term of options.terms) {
    const needle = term.toLowerCase().trim();
    if (!needle) continue;
    const at = lower.indexOf(needle);
    if (at < 0) continue;
    if (taught.some((line) => line.includes(needle))) continue;
    // The sentence the term is first said in, and the one after it.
    let offset = 0;
    let index = -1;
    const lowered = sentences.map((sentence) => sentence.toLowerCase());
    for (let i = 0; i < lowered.length; i += 1) {
      const start = lower.indexOf(lowered[i], offset);
      if (start < 0) continue;
      offset = start + lowered[i].length;
      if (at >= start && at < offset) {
        index = i;
        break;
      }
    }
    if (index < 0) continue;
    firstUses.push({ term, sentence: index });
    // The same breath: the sentence it is said in and the two after it.
    // A sentence that opens on the term and says what it is counts too
    // ("Virtual nodes are duplicate points on the ring").
    const window = sentences.slice(index, index + 3).join(' ');
    const subjectFirst = new RegExp(
      `^(?:a |an |the )?${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:'s|'re|\\s+(?:is|are|means|refers))\\b`,
      'i',
    );
    const explained =
      MEANING_SIGNALS.test(window) ||
      sentences
        .slice(index, index + 3)
        .some((sentence) => subjectFirst.test(sentence.toLowerCase()));
    if (!explained) {
      problems.push({
        kind: 'term_unexplained',
        detail: `"${term}" is said without its plain meaning beside it; the first time a term appears, say what it means in everyday words in the same breath`,
      });
    }
  }
  const bySentence = new Map<number, string[]>();
  for (const use of firstUses) {
    bySentence.set(use.sentence, [
      ...(bySentence.get(use.sentence) ?? []),
      use.term,
    ]);
  }
  for (const terms of bySentence.values()) {
    if (terms.length > 1) {
      problems.push({
        kind: 'two_terms',
        detail: `"${terms[0]}" and "${terms[1]}" are introduced in the same sentence; one new term per sentence, each explained before the next`,
      });
      break;
    }
  }
  return problems;
}

// ── sections: the moves of a page, as written ───────────────────────────────

/**
 * One line the board writer planned for a page, before the speech was
 * written. The speech writer is given the lines numbered and writes each
 * one as it teaches: "[write n]" before the words spoken while line n is
 * written, "[point n]" where the speech comes back to it.
 */
export interface BoardLine {
  /** The line's number on the page, from 1, as the speech refers to it. */
  number: number;
  /** Which of the beat's moves the line is written during, from 0. */
  move: number;
  kind: 'term' | 'point' | 'figure';
  text: string;
  meaning: string | null;
  level: 1 | 2 | null;
  important: boolean | null;
}

/** The board planned for a page: its heading and its lines in writing order. */
export interface PageBoard {
  heading: string | null;
  lines: BoardLine[];
}

export interface LectureSection {
  /** Which of the beat's moves this section teaches, from 0. */
  move: number;
  text: string;
}

/** The markers a board-aware script carries; the voice never hears them. */
export const WRITE_MARKER = /\[\s*write\s+(\d+)\s*\]/gi;
export const POINT_MARKER = /\[\s*point\s+(\d+)\s*\]/gi;

/** Whether a script was written with its board: it carries write markers. */
export function hasBoardMarkers(script: string): boolean {
  return new RegExp(WRITE_MARKER.source, 'i').test(script);
}

/** The script with its board marks removed, for readers that must not see them. */
export function withoutBoardMarkers(script: string): string {
  return script
    .replace(new RegExp(WRITE_MARKER.source, 'gi'), ' ')
    .replace(new RegExp(POINT_MARKER.source, 'gi'), ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}

/** The spoken script: the sections in order, a paragraph break between them. */
export function sectionsToScript(sections: LectureSection[]): string {
  return sections
    .map((section) => section.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Where each move begins in the final script, as character offsets. The
 * opening is part of the first move, so the first offset is always 0. A
 * section the joiner altered (a repeated hook stripped) falls back to
 * where the section before it ended.
 */
export function moveOffsetsOf(
  script: string,
  sections: LectureSection[],
): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  sections.forEach((section, index) => {
    const text = section.text.trim();
    const at = text ? script.indexOf(text, cursor) : -1;
    offsets.push(index === 0 ? 0 : at >= 0 ? at : cursor);
    if (at >= 0) cursor = at + text.length;
  });
  return offsets;
}

/**
 * Which move a position in the audio falls in.
 *
 * Speech runs at a steady rate (a measured 15 characters a second, the
 * same figure the duration estimate uses), so a time offset maps to a
 * character offset by proportion, and the character offset to a move.
 */
export function moveAt(
  offsetMs: number,
  durationMs: number,
  moveOffsets: number[],
  scriptLength: number,
): number {
  if (!moveOffsets.length || durationMs <= 0 || scriptLength <= 0) return 0;
  const chars = (Math.max(0, offsetMs) / durationMs) * scriptLength;
  let move = 0;
  moveOffsets.forEach((offset, index) => {
    if (chars >= offset) move = index;
  });
  return move;
}

/** Where a move begins, in milliseconds of the page's audio. */
export function offsetForMove(
  move: number,
  durationMs: number,
  moveOffsets: number[],
  scriptLength: number,
): number {
  if (!moveOffsets.length || durationMs <= 0 || scriptLength <= 0) return 0;
  const index = Math.min(Math.max(0, move), moveOffsets.length - 1);
  return Math.max(
    0,
    Math.floor((moveOffsets[index] / scriptLength) * durationMs),
  );
}

/**
 * The sections must follow the beat's moves in order, one each: that is
 * what keeps three styles of the same page aligned. A plan from before
 * moves existed has one move, and whatever comes back counts as it.
 */
export function sectionProblems(
  sections: LectureSection[],
  moves: string[],
): StyleProblem[] {
  if (!sections.length) {
    return [{ kind: 'moves', detail: 'The page came back with no sections' }];
  }
  if (moves.length <= 1) return [];
  const order = sections.map((section) => section.move);
  const inOrder =
    order.length === moves.length && order.every((move, i) => move === i);
  if (inOrder) return [];
  return [
    {
      kind: 'moves',
      detail: `Write exactly one section per move, in this order: ${moves
        .map((move, i) => `${i}: ${move}`)
        .join('; ')}. You returned move numbers ${order.join(', ')}`,
    },
  ];
}

/**
 * The gentle style's one failure mode: a pattern. Hand-holding invites
 * "term, example, term, example", and a learner hears the shape of it
 * within a page. Two ideas in a row that both open on an example go back.
 */
const EXAMPLE_DEVICE =
  /^(?:for (?:example|instance)|think of|imagine|it(?:'s| is) (?:a bit )?(?:like|as if)|picture|say you|suppose|let(?:'s| us) say|consider)\b/i;

export function repeatedDevice(sections: LectureSection[]): StyleProblem[] {
  let previous: string | null = null;
  for (const section of sections) {
    const first = sentencesOf(section.text)[0] ?? '';
    const device = EXAMPLE_DEVICE.exec(first)?.[0]?.toLowerCase() ?? null;
    if (device && previous) {
      return [
        {
          kind: 'repetition',
          detail: `Two ideas in a row open on an example ("${previous}", then "${device}"). Break the second idea into its steps instead of illustrating it`,
        },
      ];
    }
    previous = device;
  }
  return [];
}

/**
 * The opening and the continuation as one script. The writer sometimes
 * says the opening again despite being told it has been spoken, so a
 * repeat at the head of the continuation is dropped.
 */
export function joinOpening(hook: string, continuation: string): string {
  const opening = hook.trim().replace(/\s+/g, ' ');
  const spoken = /[.!?…"”’']$/.test(opening) ? opening : `${opening}.`;
  const normalise = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  let rest = continuation.trim();
  const hookNorm = normalise(opening);
  if (hookNorm && normalise(rest).startsWith(hookNorm)) {
    const sentences = sentencesOf(rest);
    let taken = '';
    let cut = 0;
    while (cut < sentences.length && taken.length < hookNorm.length) {
      taken = normalise(`${taken} ${sentences[cut]}`);
      cut += 1;
    }
    rest = sentences.slice(cut).join(' ');
  }
  return rest ? `${spoken} ${rest}` : spoken;
}

/** One earlier chapter, as the planner and the writer are told about it. */
export interface TaughtChapter {
  title: string;
  shortDescription: string | null;
  /** Null when the chapter has not been planned yet (chapters run alongside each other). */
  plan: LecturePlan | null;
}

/**
 * What the chapters before this one taught, one line per idea, in
 * document order. Filled from the nearest chapter backwards, because the
 * chapter just before is the one the listener still has in their head.
 * A chapter with no plan yet contributes its description, so even the
 * first few chapters, planned together, know each other's subject.
 */
export function taughtLines(chapters: TaughtChapter[], max = 40): string[] {
  const perChapter = chapters.map((chapter) => {
    if (!chapter.plan) {
      return [
        chapter.shortDescription
          ? `${chapter.title}: ${chapter.shortDescription}`
          : chapter.title,
      ];
    }
    const lines: string[] = [];
    if (chapter.plan.payoff?.trim()) lines.push(chapter.plan.payoff.trim());
    for (const beat of chapter.plan.beats ?? []) {
      lines.push(beat.newHere?.trim() || beat.goal);
    }
    return lines;
  });

  const kept: string[][] = perChapter.map(() => []);
  let budget = Math.max(0, max);
  for (
    let index = perChapter.length - 1;
    index >= 0 && budget > 0;
    index -= 1
  ) {
    kept[index] = perChapter[index].slice(0, budget);
    budget -= kept[index].length;
  }
  return kept.flat();
}

/**
 * Whether a page is built around a list, and how long it is. Extracted
 * pages keep their bullet glyphs; OCR'd pages arrive as "- " lines; a
 * numbered list or a run of "Step N" headings counts too. Three marked
 * lines make a list.
 */
const LIST_MARKER =
  /^\s*(?:[•▪◦·*\-–]|\(?\d{1,2}[.)]|\(?[ivx]{1,4}[.)]|step\s+\d+)\s+\S/i;

export function listShape(pageText: string): { items: number } | null {
  const items = pageText
    .split(/\r?\n/)
    .filter((line) => LIST_MARKER.test(line)).length;
  return items >= 3 ? { items } : null;
}

/**
 * Figures in a script that appear nowhere in its sources.
 *
 * The verifier is a language model, and on a real book it rejected a third
 * of the pages over wording ("does not emphasize", "Nov 04" versus
 * "November 4") while the two or three genuine inventions hid among them.
 * A number the material does not contain is a fabrication however it is
 * worded, so numbers are checked here, in code: every run of three or
 * more digits in the script must appear in the page, its neighbours or
 * the plan. Thousands separators are ignored, so 100,000 matches 100000.
 * Shorter numbers are left alone: "2 tokens" and "2.2 trillion" are
 * arithmetic and rounding, not invention.
 */
export function unsupportedFigures(
  script: string,
  sources: string[],
): string[] {
  const plain = (text: string) => text.replace(/(\d),(?=\d)/g, '$1');
  const haystack = plain(sources.join('\n'));
  const missing = new Set<string>();
  for (const match of plain(scriptForTts(script)).matchAll(/\d+(?:\.\d+)?/g)) {
    const figure = match[0];
    if (figure.replace(/\D/g, '').length < 3) continue;
    if (!haystack.includes(figure)) missing.add(figure);
  }
  return [...missing];
}

/** A short fingerprint of the spoken words, for the audio key. */
export function contentHash(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 10);
}

// ── planning ────────────────────────────────────────────────────────────────

/**
 * Assigns every page to a topic and puts them in play order.
 *
 * Topic ranges in this codebase are author-declared and occasionally
 * overlap or leave gaps, so this cannot assume a clean partition. Rules,
 * in order: a page inside exactly one range belongs to it; a page inside
 * several belongs to the earliest-starting one, so a chapter and its
 * sub-chapter do not both claim it; a page inside none attaches to the
 * nearest preceding topic, because a lecture that silently skips pages
 * leaves the student's screen stranded. Pages before the first topic
 * begins have no topic to belong to and are dropped.
 */
export function cutPlanIntoJobs(
  topics: LectureTopicInput[],
  pages: LecturePageInput[],
): SegmentJob[] {
  const ordered = [...topics].sort(
    (a, b) => a.startPage - b.startPage || a.endPage - b.endPage,
  );
  if (!ordered.length) return [];

  const byTopic = new Map<string, LecturePageInput[]>();
  for (const topic of ordered) byTopic.set(topic.id, []);

  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const containing = ordered.filter(
      (topic) =>
        page.pageNumber >= topic.startPage && page.pageNumber <= topic.endPage,
    );
    let owner = containing[0];
    if (!owner) {
      // Orphan: the last topic that has already begun keeps talking over it.
      const preceding = ordered.filter(
        (topic) => topic.startPage <= page.pageNumber,
      );
      owner = preceding[preceding.length - 1];
    }
    if (!owner) continue; // Front matter, before any topic starts.
    byTopic.get(owner.id)!.push(page);
  }

  const jobs: SegmentJob[] = [];
  let seq = 0;
  for (const topic of ordered) {
    const topicPages = byTopic.get(topic.id) ?? [];
    topicPages.forEach((page, index) => {
      jobs.push({
        topicId: topic.id,
        pageNumber: page.pageNumber,
        seq: seq++,
        isFirstOfTopic: index === 0,
        isLastOfTopic: index === topicPages.length - 1,
        bridge: isBridgePage(page),
      });
    });
  }
  return jobs;
}

/** A figure, a divider, or a near-empty page: nothing to lecture on. */
export function isBridgePage(page: LecturePageInput): boolean {
  if (page.isEmpty) return true;
  return page.text.replace(/\s+/g, ' ').trim().length < MIN_PAGE_CHARS;
}

export interface OutlineProblem {
  kind:
    | 'no_hook'
    | 'no_arc'
    | 'unknown_page'
    | 'missing_page'
    | 'duplicate_page'
    | 'banned_opener'
    | 'hook_too_long';
  detail: string;
}

/**
 * Checks a model-written plan against the pages it claims to cover, and
 * its hook against the rules the hook will be spoken under.
 *
 * A plan that names a page the topic does not own, or forgets one, would
 * silently produce a lecture with a hole in it. A hook that opens with
 * "Imagine" would be spoken word for word. Caught here, the plan is
 * rewritten once with the reason rather than shipping either.
 */
export function validateOutline(
  plan: LecturePlan,
  pageNumbers: number[],
): OutlineProblem[] {
  const problems: OutlineProblem[] = [];
  if (!plan.hook?.trim()) {
    problems.push({ kind: 'no_hook', detail: 'The plan has no cold open' });
  } else {
    for (const problem of openerProblems(plan.hook, 'hook')) {
      problems.push({
        kind: 'banned_opener',
        detail: `The hook ${problem.detail.charAt(0).toLowerCase()}${problem.detail.slice(1)}`,
      });
    }
    const words = wordCount(plan.hook);
    if (words > MAX_HOOK_WORDS) {
      problems.push({
        kind: 'hook_too_long',
        detail: `The hook is ${words} words; it must be ${MAX_HOOK_WORDS} or fewer`,
      });
    }
  }
  if (!plan.arc?.trim()) {
    problems.push({ kind: 'no_arc', detail: 'The plan has no arc' });
  }

  const expected = new Set(pageNumbers);
  const seen = new Set<number>();
  for (const beat of plan.beats ?? []) {
    if (!expected.has(beat.pageNumber)) {
      problems.push({
        kind: 'unknown_page',
        detail: `Beat names page ${beat.pageNumber}, which this topic does not cover`,
      });
      continue;
    }
    if (seen.has(beat.pageNumber)) {
      problems.push({
        kind: 'duplicate_page',
        detail: `Page ${beat.pageNumber} has more than one beat`,
      });
      continue;
    }
    seen.add(beat.pageNumber);
  }
  for (const pageNumber of pageNumbers) {
    if (!seen.has(pageNumber)) {
      problems.push({
        kind: 'missing_page',
        detail: `No beat for page ${pageNumber}`,
      });
    }
  }
  return problems;
}

/** The problems as one line the planner is handed for its second try. */
export function outlineCorrection(problems: OutlineProblem[]): string {
  return problems.map((problem) => problem.detail).join('; ');
}

/** Whether the plan's hook may be spoken word for word. */
export function hookProblems(problems: OutlineProblem[]): OutlineProblem[] {
  return problems.filter(
    (problem) =>
      problem.kind === 'banned_opener' || problem.kind === 'hook_too_long',
  );
}

/** The beat for a page, or a plain one built from the plan's arc. */
export function beatFor(plan: LecturePlan, pageNumber: number): LectureBeat {
  return (
    plan.beats?.find((beat) => beat.pageNumber === pageNumber) ?? {
      pageNumber,
      goal: plan.arc,
      callback: null,
      foreshadow: null,
    }
  );
}

export interface VerifyResult {
  grounded: boolean;
  problems: string[];
}

export type SegmentDecision =
  | { action: 'accept'; warning?: string }
  | { action: 'retry'; reason: string }
  | { action: 'fail'; reason: string };

/**
 * What to do with a written segment.
 *
 * The verifier's objection sends a page back while attempts remain; that
 * is where it earns its keep, as the reason the next attempt is handed.
 * On the last attempt it no longer drops the page by itself: on a real
 * book it was wrong about wording far more often than right, and every
 * mistake was a hole the student hit. What does drop a page, on any
 * attempt that is the last, is a figure the material does not contain
 * (`figures`), because a number is a fabrication however it is worded.
 *
 * Style is gentler still: a page that reads badly is sent back while
 * there are attempts left, and kept, with a warning, when there are not.
 */
export function acceptSegment(
  script: string,
  verify: VerifyResult,
  attempt: number,
  style: StyleProblem[] = [],
  figures: string[] = [],
): SegmentDecision {
  const last = attempt >= MAX_SEGMENT_ATTEMPTS;
  if (!script?.trim()) {
    const reason = 'The writer returned nothing';
    return last ? { action: 'fail', reason } : { action: 'retry', reason };
  }

  const styleReason = style.map((problem) => problem.detail).join('; ');
  if (verify.grounded && !figures.length) {
    if (!style.length) return { action: 'accept' };
    return last
      ? { action: 'accept', warning: styleReason }
      : { action: 'retry', reason: styleReason };
  }

  const reason = [
    figures.length
      ? `These figures are not in the material: ${figures.join(', ')}`
      : '',
    verify.grounded
      ? ''
      : verify.problems.join('; ') || 'The script is not supported by the page',
  ]
    .filter(Boolean)
    .join('; ');
  if (!last) return { action: 'retry', reason };
  if (figures.length) return { action: 'fail', reason };
  return {
    action: 'accept',
    warning: [`Kept over the verifier's objection: ${reason}`, styleReason]
      .filter(Boolean)
      .join('; '),
  };
}

/**
 * The one stage direction the writer may leave in a script: the silence
 * after a question the listener is asked to answer before they hear the
 * answer. It becomes a paragraph break for the voice, which the voices
 * read as a beat of silence, and the player carries on through it.
 */
export const PAUSE_MARKER = /\s*\[pause\]\s*/gi;

/** Whether a script asks for the listener's prediction before telling. */
export function hasPause(script: string): boolean {
  return /\[pause\]/i.test(script);
}

/**
 * Prepares a script for text to speech.
 *
 * Scripts arrive with the writer's stage directions in brackets and the
 * occasional markdown emphasis. Both are for the writer, not the ear:
 * spoken aloud they become "open paren pause close paren".
 */
export function scriptForTts(script: string): string {
  return script
    .replace(PAUSE_MARKER, '\n\n')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:beat|pause|sic)[^)]*\)/gi, ' ')
    .replace(/[*_`#]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The tail of the previous segment, given to the next one so it can pick
 * up mid-thought instead of re-greeting the student every page.
 */
export function tailOf(script: string, maxChars = 320): string {
  const clean = scriptForTts(script);
  return clean.length <= maxChars ? clean : clean.slice(-maxChars);
}

/**
 * A duration estimate from the script's length.
 *
 * The player needs a number for its progress bar before the file has
 * loaded; the audio element reports the true duration the moment it
 * does. Fifteen characters a second is a measured pace for these voices,
 * and erring slow is the harmless direction.
 */
export function estimateDurationMs(spoken: string): number {
  return Math.max(1_000, Math.round((spoken.length / 15) * 1_000));
}

/** Rows still on their way: seeded, being written, or being voiced. */
export const IN_FLIGHT_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'writing',
  'voicing',
]);

/**
 * How long a row may sit in flight before it is taken as lost. A page is
 * written and voiced in a minute or two; a row untouched for this long
 * belongs to a job that died with its worker, and a lecture must not wait
 * on it forever.
 */
export const LECTURE_STALE_MS = 10 * 60_000;

/**
 * The status a row should be read as: its own, unless it has been in
 * flight too long, in which case it is failed. The row itself is left as
 * it is; asking for the chapter again writes or voices it afresh.
 */
export function effectiveStatus(
  row: { status: LectureSegmentStatus; updatedAt?: Date | null },
  now = Date.now(),
): LectureSegmentStatus {
  if (!IN_FLIGHT_STATUSES.has(row.status) || !row.updatedAt) return row.status;
  return now - row.updatedAt.getTime() > LECTURE_STALE_MS
    ? 'failed'
    : row.status;
}
