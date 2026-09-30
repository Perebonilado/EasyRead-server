/**
 * A document in the Studio's chat, turned into an explainer
 * (studio-explainer-plan, Ask 7). The maker gives a file; its chapters
 * (from its bookmarks, its headings, or a model's reading) are offered as
 * chips; they choose chapters or a range of pages; and the pages chosen
 * become the episode's material: their own text when it is short, their
 * teacher's notes when it is long. A choice too long for one film is
 * offered as a series, one episode a chapter.
 *
 * All of it code: which pages "chapter 4", "pages 40–55" or "the part
 * about osmosis" mean, the ranges kept sound, how long a film the pages
 * make, the series, and the notes held to what the outline can use.
 */
import type { ChapterNotes } from '../lesson-notes';
import { levelIn } from '../scene-stage';
import {
  STAGE_BAND,
  audienceIn,
  type AudienceProfile,
} from './studio-audience';

/** A run of pages, first and last, from 1. */
export type PageRange = [number, number];

/** The pages an episode teaches: the ranges, the chapters they were chosen as (if they were), and in words. */
export interface DocumentPick {
  ranges: PageRange[];
  topicIds: string[];
  /** "Chapter 4 · Cell membranes", "Pages 41–58". */
  label: string;
}

/** The document a show was given, and the pages last chosen of it. */
export interface BriefDocument extends DocumentPick {
  documentId: string;
  /** The document's own title. */
  title: string;
  pageCount: number;
}

/** A chapter as the chips show it. */
export interface Chapter {
  id: string;
  title: string;
  from: number;
  to: number;
  /** What it is about, when the reading said. */
  about?: string | null;
}

/** The most pages one episode teaches. */
export const EPISODE_PAGES = 60;
/** More pages than this, over more than one chapter, and a series is offered. */
export const ONE_FILM_PAGES = 30;
/** The most episodes a series is made of at once. */
export const SERIES_MOST = 12;
/** Pages whose text is no longer than this are the outline's material as they are; longer, their notes. */
export const DIRECT_CHARS = 12_000;
/** Of a page's text, what the scene writer is given. */
export const SCENE_PAGE_CHARS = 3_000;
/** Of a scene's pages, what the scene writer is given in all. */
export const SCENE_MATERIAL_CHARS = 9_000;

// ── Ranges ────────────────────────────────────────────────────────────────

/**
 * Ranges made sound: whole pages within the document, each first before
 * last, sorted, overlapping or touching ranges joined. Anything that is
 * not a range is dropped.
 */
export function clampRanges(raw: unknown, pageCount: number): PageRange[] {
  if (!Array.isArray(raw) || pageCount < 1) return [];
  const ranges = raw.flatMap((one): PageRange[] => {
    if (!Array.isArray(one) || one.length < 1) return [];
    const a = Math.floor(Number(one[0]));
    const b = Math.floor(Number(one.length > 1 ? one[1] : one[0]));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
    const from = Math.min(pageCount, Math.max(1, Math.min(a, b)));
    const to = Math.min(pageCount, Math.max(1, Math.max(a, b)));
    return [[from, to]];
  });
  ranges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: PageRange[] = [];
  for (const [from, to] of ranges) {
    const last = out[out.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out.slice(0, 40);
}

/** How many pages the ranges hold. */
export const pagesIn = (ranges: readonly PageRange[]): number =>
  ranges.reduce((n, [from, to]) => n + to - from + 1, 0);

/** Every page of the ranges, in order. */
export function pageList(ranges: readonly PageRange[]): number[] {
  const out: number[] = [];
  for (const [from, to] of ranges)
    for (let page = from; page <= to; page += 1) out.push(page);
  return out;
}

/** The ranges cut to their first `most` pages. */
export function firstPages(
  ranges: readonly PageRange[],
  most = EPISODE_PAGES,
): PageRange[] {
  const out: PageRange[] = [];
  let left = most;
  for (const [from, to] of ranges) {
    if (left <= 0) break;
    const end = Math.min(to, from + left - 1);
    out.push([from, end]);
    left -= end - from + 1;
  }
  return out;
}

/** The pages of the chapters named, as ranges. */
export function rangesOfChapters(
  chapters: readonly Chapter[],
  topicIds: readonly string[],
  pageCount: number,
): PageRange[] {
  const wanted = new Set(topicIds);
  return clampRanges(
    chapters.filter((c) => wanted.has(c.id)).map((c) => [c.from, c.to]),
    pageCount,
  );
}

/** "p. 41–58", "p. 12", "p. 3–5, 9–12". */
export const pagesWords = (ranges: readonly PageRange[]): string =>
  ranges.length
    ? `p. ${ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ')}`
    : '';

/** What was chosen, in words: its chapters when chosen as chapters, else its pages. */
export function labelOf(
  ranges: readonly PageRange[],
  topicIds: readonly string[],
  chapters: readonly Chapter[],
): string {
  const named = chapters.filter((c) => topicIds.includes(c.id));
  if (named.length === 1) return named[0].title.slice(0, 120);
  if (named.length > 1)
    return `${named.length} chapters: ${named
      .map((c) => c.title)
      .join(', ')}`.slice(0, 160);
  const pages = pagesIn(ranges);
  return pages === 1
    ? `Page ${ranges[0][0]}`
    : `Pages ${ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ')}`;
}

// ── How long a film ───────────────────────────────────────────────────────

/**
 * About how long a film the pages make, in minutes, to the half: a page
 * is about a minute, more pages add less and less (the film keeps to
 * their main ideas), and five minutes is the most an episode runs.
 */
export function minutesFor(pages: number): number {
  if (pages <= 0) return 1;
  const minutes = 1 + 0.75 * Math.sqrt(pages - 1);
  return Math.min(5, Math.max(1, Math.round(minutes * 2) / 2));
}

// ── A series ──────────────────────────────────────────────────────────────

/**
 * A choice made into a series: one episode a chapter it covers (only the
 * pages chosen of each), a chapter longer than an episode takes in parts,
 * and pages that fall in no chapter in parts of ONE_FILM_PAGES. At most
 * SERIES_MOST episodes, the first first.
 */
export function seriesOf(
  ranges: readonly PageRange[],
  chapters: readonly Chapter[],
  most = SERIES_MOST,
): DocumentPick[] {
  const chosen = new Set(pageList(ranges));
  const out: DocumentPick[] = [];
  const add = (pages: number[], topicIds: string[], title: string | null) => {
    if (!pages.length) return;
    const parts = Math.ceil(pages.length / EPISODE_PAGES);
    const size = Math.ceil(pages.length / parts);
    for (let k = 0; k < parts; k += 1) {
      const some = pages.slice(k * size, (k + 1) * size);
      const partRanges = clampRanges(
        some.map((p) => [p, p]),
        Math.max(...some),
      );
      out.push({
        ranges: partRanges,
        topicIds,
        label: title
          ? parts > 1
            ? `${title} (part ${k + 1})`.slice(0, 120)
            : title.slice(0, 120)
          : labelOf(partRanges, [], []),
      });
    }
  };
  const inChapters = new Set<number>();
  for (const chapter of [...chapters].sort((a, b) => a.from - b.from)) {
    const pages: number[] = [];
    for (let p = chapter.from; p <= chapter.to; p += 1)
      if (chosen.has(p)) {
        pages.push(p);
        inChapters.add(p);
      }
    add(pages, [chapter.id], chapter.title);
  }
  // Pages in no chapter: a run at a time, in films of ONE_FILM_PAGES.
  const loose = pageList(ranges).filter((p) => !inChapters.has(p));
  for (let k = 0; k < loose.length; k += ONE_FILM_PAGES)
    add(loose.slice(k, k + ONE_FILM_PAGES), [], null);
  return out.sort((a, b) => a.ranges[0][0] - b.ranges[0][0]).slice(0, most);
}

/** Whether a choice is offered as a series: more than one film's pages, over more than one chapter. */
export function offersSeries(
  ranges: readonly PageRange[],
  chapters: readonly Chapter[],
): boolean {
  return (
    pagesIn(ranges) > ONE_FILM_PAGES && seriesOf(ranges, chapters).length > 1
  );
}

// ── Heard in the maker's words ────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  last: -1,
};
const ROMAN: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};
const numberOf = (word: string): number | null => {
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBER_WORDS[w] ?? ROMAN[w] ?? null;
};
const NUM =
  '(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)';

/** The chapter numbered `n`: the one whose title says so, else the nth in order (an "Opening pages" not counted). */
export function chapterNumbered(
  chapters: readonly Chapter[],
  n: number,
): Chapter | null {
  const counted = chapters.filter((c) => c.title !== 'Opening pages');
  if (n === -1) return counted[counted.length - 1] ?? null;
  const roman = Object.entries(ROMAN).find(([, v]) => v === n)?.[0];
  const titled = counted.find((c) => {
    const t = c.title.toLowerCase().trim();
    return (
      new RegExp(
        `^(?:chapter|unit|part|module|lesson|topic|section|week|lecture)\\s+(?:${n}|${roman ?? '_'})\\b`,
      ).test(t) || new RegExp(`^${n}(?:[.:)]|\\s)\\s*\\S`).test(t)
    );
  });
  return titled ?? counted[n - 1] ?? null;
}

const STOP = new Set([
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'to',
  'and',
  'or',
  'for',
  'about',
  'part',
  'bit',
  'section',
  'chapter',
  'page',
  'pages',
  'with',
  'how',
  'what',
  'why',
  'its',
  'their',
  'this',
  'that',
  'one',
  'do',
  'use',
  'make',
  'explain',
  'teach',
  'video',
  'please',
  'just',
  'only',
  'where',
  'talks',
  'covers',
  'is',
  'are',
  'can',
  'you',
  'could',
  'would',
  'let',
  'show',
  'tell',
  'want',
  'like',
  'now',
  'yes',
]);
const stem = (word: string) =>
  word
    .toLowerCase()
    .replace(/(?:ies)$/, 'y')
    .replace(/(?:es|s)$/, '');
const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);

/** The chapter a subject names, by the words of its title and what it is about: the best, when it is clearly best. */
export function chapterAbout(
  phrase: string,
  chapters: readonly Chapter[],
): Chapter | null {
  const asked = [...new Set(wordsOf(phrase))];
  if (!asked.length) return null;
  const scored = chapters
    .map((chapter) => {
      const title = new Set(wordsOf(chapter.title));
      const about = new Set(wordsOf(chapter.about ?? ''));
      const score = asked.reduce(
        (n, word) =>
          n +
          ([...title].some(
            (t) => t === word || (word.length > 4 && t.startsWith(word)),
          )
            ? 2
            : [...about].some((t) => t === word)
              ? 1
              : 0),
        0,
      );
      return { chapter, score };
    })
    .filter((one) => one.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < Math.max(1, asked.length)) return null;
  if (scored[1] && scored[1].score === best.score) return null;
  return best.chapter;
}

/** What the maker's words chose: the pages, the chapters they were chosen as, and how it was heard. */
export interface PagesHeard {
  ranges: PageRange[];
  topicIds: string[];
  how: 'chapters' | 'pages' | 'subject';
}

/**
 * Which pages the maker's words choose, by code: "chapter 4", "ch. 4",
 * "chapters 2 and 3", "chapters 2 to 4", "the last chapter"; "pages
 * 40–55", "p. 40 to 55", "pp 40-55", "page 12"; "the part about
 * osmosis", "the osmosis part", "the bit on trade". Null when they choose
 * none, or none this document has.
 */
export function pickPages(
  words: string,
  chapters: readonly Chapter[],
  pageCount: number,
): PagesHeard | null {
  const said = (words ?? '').replace(/\s+/g, ' ').trim();
  if (!said || pageCount < 1) return null;

  // Pages, said as pages.
  const span =
    /\b(?:pages?|pp?\.?)\s*(\d{1,4})\s*(?:-|–|—|to|through|thru|until|till)\s*(?:page\s*|p\.?\s*)?(\d{1,4})\b/i.exec(
      said,
    );
  if (span) {
    const ranges = clampRanges([[Number(span[1]), Number(span[2])]], pageCount);
    if (ranges.length) return { ranges, topicIds: [], how: 'pages' };
  }
  const one = /\b(?:page|p\.)\s*(\d{1,4})\b/i.exec(said);
  if (one) {
    const n = Number(one[1]);
    if (n >= 1 && n <= pageCount)
      return { ranges: [[n, n]], topicIds: [], how: 'pages' };
  }

  // Chapters, by number: one, a pair, or a run.
  const numbered = new RegExp(
    `\\b(?:chapters?|chaps?\\.?|ch\\.?|units?|parts?|modules?|lessons?)\\s*${NUM}(?:\\s*(-|–|—|to|through|and|&|,)\\s*${NUM})?\\b`,
    'i',
  ).exec(said);
  const ordinal = new RegExp(
    `\\bthe\\s+${NUM}\\s+(?:chapter|unit|part)\\b`,
    'i',
  ).exec(said);
  const a = numbered?.[1] ?? ordinal?.[1];
  if (a) {
    const first = numberOf(a);
    const second = numbered?.[3] ? numberOf(numbered[3]) : null;
    const run = /^(?:-|–|—|to|through)$/i.test(numbered?.[2] ?? '');
    const numbers =
      first === null
        ? []
        : second === null
          ? [first]
          : run && second > first
            ? Array.from(
                { length: Math.min(SERIES_MOST, second - first + 1) },
                (_, k) => first + k,
              )
            : [first, second];
    const found = numbers
      .map((n) => chapterNumbered(chapters, n))
      .filter((c): c is Chapter => c !== null);
    if (found.length) {
      const topicIds = [...new Set(found.map((c) => c.id))];
      return {
        ranges: rangesOfChapters(chapters, topicIds, pageCount),
        topicIds,
        how: 'chapters',
      };
    }
  }

  // A subject: "the part about osmosis", "the osmosis bit", or the words alone.
  const about =
    /\b(?:about|on|covering|explaining|explain|that explains)\s+(.{3,80}?)(?:[.?!]|$)/i.exec(
      said,
    )?.[1] ??
    /\bthe\s+(.{3,60}?)\s+(?:part|bit|section|chapter)\b/i.exec(said)?.[1] ??
    (said.length <= 60 ? said : null);
  const chapter = about ? chapterAbout(about, chapters) : null;
  if (chapter)
    return {
      ranges: rangesOfChapters(chapters, [chapter.id], pageCount),
      topicIds: [chapter.id],
      how: 'subject',
    };
  return null;
}

// ── Whom the document is for ──────────────────────────────────────────────

/**
 * Whom a document is written for, by code, from its own words: a level
 * its title names as a maker would ("Biology for Grade 5"), else one its
 * pages name clearly (a class, a year, a course, an exam and the kind of
 * school), else one its opening lines name ("a study guide for Year 9").
 * Never from a name or a place. Undefined when it names none.
 */
export function audienceOfDocument(
  title: string,
  text: string,
): AudienceProfile | undefined {
  const titled = audienceIn(title);
  if (titled?.band)
    return { band: titled.band, ...(titled.said ? { said: titled.said } : {}) };
  const level = levelIn(`${title}\n${text.slice(0, 20_000)}`);
  if (!level) {
    // What its opening says of whom it is for, as a maker would: "a study
    // guide for Year 9 science". Only its first lines, never the whole.
    const opening = audienceIn(text.trim().slice(0, 300));
    return opening?.band
      ? { band: opening.band, ...(opening.said ? { said: opening.said } : {}) }
      : undefined;
  }
  const words = level.words[0]?.replace(/\s+/g, ' ').trim() ?? '';
  const said = words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
  return {
    band: STAGE_BAND[level.stage],
    ...(said && said.length <= 40 ? { said } : {}),
  };
}

// ── Kept sound ────────────────────────────────────────────────────────────

const textOf = (value: unknown, most: number): string =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

/** An episode's pages made sound; null for none. */
export function pickOf(raw: unknown, pageCount = 100_000): DocumentPick | null {
  if (!raw || typeof raw !== 'object') return null;
  const said = raw as Record<string, unknown>;
  const ranges = clampRanges(said.ranges, pageCount);
  if (!ranges.length) return null;
  return {
    ranges: firstPages(ranges),
    topicIds: (Array.isArray(said.topicIds) ? said.topicIds : [])
      .map((id) => textOf(id, 64))
      .filter(Boolean)
      .slice(0, SERIES_MOST * 4),
    label: textOf(said.label, 160) || labelOf(ranges, [], []),
  };
}

/** A brief's document made sound; undefined for none. */
export function briefDocumentOf(raw: unknown): BriefDocument | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const said = raw as Record<string, unknown>;
  const documentId = textOf(said.documentId, 64);
  const pageCount = Math.floor(Number(said.pageCount));
  if (!documentId || !Number.isFinite(pageCount) || pageCount < 1)
    return undefined;
  const pick = pickOf(said, pageCount);
  return {
    documentId,
    title: textOf(said.title, 200) || 'Your document',
    pageCount,
    ranges: pick?.ranges ?? [],
    topicIds: pick?.topicIds ?? [],
    label: pick?.label ?? '',
  };
}

/** The document in the brief, as the writers and the producer read it. */
export function describeDocument(doc: BriefDocument): string {
  if (!doc.ranges.length)
    return `Made from their document "${doc.title}" (${doc.pageCount} pages); which pages is not chosen yet.`;
  return `Made from their document "${doc.title}": ${doc.label} (${pagesWords(doc.ranges)}, ${pagesIn(doc.ranges)} of its ${doc.pageCount} pages).`;
}

// ── The material ──────────────────────────────────────────────────────────

/** Pages' own text, each marked "[page N]", as the outline and the scene writer read it. */
export function markedPages(
  pages: readonly { pageNumber: number; text: string }[],
  eachMost = SCENE_PAGE_CHARS,
): string {
  return pages
    .map(
      (page) =>
        `[page ${page.pageNumber}]\n${page.text.trim().slice(0, eachMost) || '(nothing on it)'}`,
    )
    .join('\n\n');
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * The teacher's notes on the pages chosen, as the outline writer reads
 * them, within `budget` words: each page's goal, what is new on it and its
 * small ideas with what to show; pages with nothing to teach left out.
 * Over the budget, each page keeps fewer small ideas, then its goal
 * alone, then the pages are cut short: never more than the budget.
 */
export function notesForOutline(notes: ChapterNotes, budget: number): string {
  const head = [
    notes.thread ? `The question these pages answer: ${notes.thread}` : '',
    notes.example
      ? `The example they keep coming back to: ${notes.example}`
      : '',
    notes.diagram ? `The picture they build up: ${notes.diagram}` : '',
  ].filter(Boolean);
  const taught = notes.pages.filter((page) => page.relation !== 'skip');
  const render = (ideas: number, withGoal: boolean) =>
    [
      ...head,
      ...taught.map((page) =>
        [
          `[page ${page.page}]${withGoal && page.goal ? ` ${page.goal}` : ''}`,
          page.newHere.length && ideas > 0
            ? `New: ${page.newHere.join(', ')}.`
            : '',
          ...page.points
            .slice(0, ideas)
            .map(
              (point) =>
                `- ${point.say}${point.show ? ` (show: ${point.show})` : ''}`,
            ),
          ideas > 1 && page.pitfall ? `Pitfall: ${page.pitfall}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    ].join('\n\n');
  for (let ideas = 10; ideas >= 0; ideas -= 1) {
    const text = render(ideas, true);
    if (wordCount(text) <= budget) return text;
  }
  const bare = render(0, false);
  if (wordCount(bare) <= budget) return bare;
  return bare.split(/\s+/).slice(0, Math.max(0, budget)).join(' ');
}

/** The words the outline writer is given of the notes: about twice what the film can say, and never under 400. */
export const notesBudget = (minutes: number): number =>
  Math.max(400, Math.round(minutes * 60 * 3 * 2));

/**
 * Each outline scene's pages: as the writer gave them, kept within the
 * pages chosen; else the pages chosen shared out in order, by each
 * scene's length. Every scene gets at least one page.
 */
export function scenePages(
  scenes: readonly { seconds: number; pages?: PageRange | null }[],
  ranges: readonly PageRange[],
): PageRange[] {
  const pages = pageList(ranges);
  if (!pages.length) return scenes.map(() => [1, 1]);
  const first = pages[0];
  const last = pages[pages.length - 1];
  const given = scenes.map((scene) => {
    const p = scene.pages;
    if (!p) return null;
    const from = Math.max(first, Math.min(last, Math.min(p[0], p[1])));
    const to = Math.max(from, Math.min(last, Math.max(p[0], p[1])));
    return [from, to] as PageRange;
  });
  if (given.every(Boolean)) return given as PageRange[];
  const total = scenes.reduce((n, s) => n + Math.max(1, s.seconds), 0);
  const out: PageRange[] = [];
  let at = 0;
  let spent = 0;
  for (const [k, scene] of scenes.entries()) {
    spent += Math.max(1, scene.seconds);
    const end =
      k === scenes.length - 1
        ? pages.length - 1
        : Math.max(at, Math.round((spent / total) * pages.length) - 1);
    const from = pages[Math.min(at, pages.length - 1)];
    const to = pages[Math.min(Math.max(end, at), pages.length - 1)];
    out.push(given[k] ?? [from, to]);
    at = Math.min(end + 1, pages.length - 1);
  }
  return out;
}
