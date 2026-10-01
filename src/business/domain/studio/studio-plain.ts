/**
 * An explainer's narration held to its audience by code (studio-explainer
 * plan, Ask 8.4): its sentences' length, its hard words, its reading
 * grade (Flesch–Kincaid, over the scene), and for the youngest the words
 * outside everyday speech. Measured with the lecture writer's own
 * yardsticks (syllablesOf, the everyday words).
 *
 * Put right by code first: a sentence longer than the audience's cap is
 * split where it joins two thoughts ("; ", ", which", ", and then",
 * " because "), and a short list of stiff words is swapped for plain ones
 * ("utilise" is "use"; "due to the fact that" is "because"). Abstract
 * words no code can swap safely ("mechanism", "locomotion") are named
 * with their plain ones. What is still well over the bar is a problem that
 * rides along on the scene's one send-back, if it has one; never a send-
 * back of its own. Otherwise it is accepted, and logged.
 *
 * English only: in another language the formula is skipped and only the
 * sentences' length is held to.
 */
import { EVERYDAY_WORDS } from '../everyday-words';
import { plainStem, syllablesOf } from '../lecture';
import type { SceneScriptDraft } from '../scene-script';
import type { ExplainerSheet } from './studio';
import type { AudienceRecipe } from './studio-audience';
import type { SheetProblem } from './studio-check';

type Beat = SceneScriptDraft['beats'][number];

/** How plain a narration is. */
export interface PlainMeasure {
  words: number;
  sentences: number;
  /** Words a sentence, on average and at most (a lesson's terms count one word). */
  average: number;
  longest: number;
  /** The Flesch–Kincaid grade, over the whole narration. */
  grade: number;
  /** Words neither everyday nor the lesson's, long enough to be a mouthful. */
  hard: string[];
  hardShare: number;
  /** Words outside the everyday 3,000, as a share. */
  rareShare: number;
  /** Whether it reads as English: the formula holds only for English. */
  english: boolean;
}

/** Words nearly every English sentence has: a narration with too few of them is in another language. */
const ENGLISH_GLUE = new Set(
  'the a an and of to in is it that this for on with as are be at from by they we you he she have has not but or what when there their its was were will can so if how why who which these those your our'.split(
    ' ',
  ),
);

/** The most common words, the first 3,000 of the everyday list, for the youngest. */
const TOP_EVERYDAY = 3000;
let top: Set<string> | null = null;
let everydayStems: Set<string> | null = null;
const topWords = () =>
  (top ??= new Set([...EVERYDAY_WORDS].slice(0, TOP_EVERYDAY)));
const stemsOf = () =>
  (everydayStems ??= new Set([...EVERYDAY_WORDS].map(plainStem)));

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The words of a text, lowercased: letters, digits and apostrophes. */
const tokensOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, '').replace(/'s$/, ''))
    .filter(Boolean);

/** A narration's sentences, as a reader meets them. */
export const sentencesIn = (text: string): string[] =>
  text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => tokensOf(s).length > 0);

/**
 * A narration measured: its sentences with the lesson's terms counted as
 * one short word each, its grade, its hard words (neither everyday, nor
 * the lesson's material, nor its terms; three syllables or more, or nine
 * letters), and its words outside the everyday 3,000.
 */
export function measurePlain(
  text: string,
  options: { terms?: readonly string[]; material?: string } = {},
): PlainMeasure {
  const terms = (options.terms ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
    .sort((a, b) => b.length - a.length);
  const bare = (sentence: string) =>
    terms.reduce(
      (s, term) =>
        s.replace(new RegExp(`\\b${escapeRe(term)}\\b`, 'gi'), 'term'),
      sentence,
    );
  const sentences = sentencesIn(text).map(bare);
  const tokens = sentences.map(tokensOf);
  const words = tokens.flat();
  const lengths = tokens.map((t) => t.length);
  const n = Math.max(1, words.length);
  const syllables = words.reduce(
    (sum, w) => sum + (/[a-z]/.test(w) ? syllablesOf(w) : 1),
    0,
  );
  const grade =
    words.length && sentences.length
      ? Math.max(
          0,
          0.39 * (words.length / sentences.length) +
            11.8 * (syllables / n) -
            15.59,
        )
      : 0;
  const known = new Set(tokensOf(options.material ?? ''));
  const knownStems = new Set([...known].map(plainStem));
  const termWords = new Set(terms.flatMap(tokensOf));
  const isKnown = (w: string) =>
    w === 'term' ||
    known.has(w) ||
    termWords.has(w) ||
    knownStems.has(plainStem(w)) ||
    /\d/.test(w);
  const everyday = (w: string) =>
    EVERYDAY_WORDS.has(w) || stemsOf().has(plainStem(w));
  const hard = new Set<string>();
  let hardCount = 0;
  let rare = 0;
  let english = 0;
  for (const w of words) {
    if (ENGLISH_GLUE.has(w)) english += 1;
    if (isKnown(w)) continue;
    if (!everyday(w) && (syllablesOf(w) >= 3 || w.length >= 9)) {
      hard.add(w);
      hardCount += 1;
    }
    if (w.length >= 4 && !topWords().has(w) && !topWords().has(plainStem(w)))
      rare += 1;
  }
  const round = (x: number) => Math.round(x * 10) / 10;
  return {
    words: words.length,
    sentences: sentences.length,
    average: round(words.length / Math.max(1, sentences.length)),
    longest: Math.max(0, ...lengths),
    grade: round(grade),
    hard: [...hard],
    hardShare: round((hardCount / n) * 1000) / 1000,
    rareShare: round((rare / n) * 1000) / 1000,
    english: words.length < 8 || english / n >= 0.12,
  };
}

// ── Put right by code ─────────────────────────────────────────────────────

/**
 * Stiff words and the plain ones said in their place: only swaps that
 * keep the sentence's grammar whatever surrounds them (a phrase before
 * the word it holds, a verb only where its form is sure). Richard,
 * 2026-10-01: the words a friend would use, short and concrete ("it
 * moves", "they fit"), never the academic ones.
 */
const STIFF: [RegExp, string][] = [
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bowing to the fact that\b/gi, 'because'],
  [/\bin the event that\b/gi, 'if'],
  [/\bwith (?:regard|respect) to\b/gi, 'about'],
  [/\bat (?:this point in time|the present time)\b/gi, 'now'],
  [/\bin close proximity to\b/gi, 'close to'],
  [/\bin the vicinity of\b/gi, 'near'],
  // "Most of the cells", but "most cells": "of" kept before a word that needs it.
  [
    /\ba sufficient (?:amount|number) of(?=\s+(?:the|them|us|these|those|this|that|its|their|our|your|his|her|my)\b)/gi,
    'enough of',
  ],
  [/\ba sufficient (?:amount|number) of\b/gi, 'enough'],
  [
    /\ba (?:large|great) number of(?=\s+(?:the|them|us|these|those|its|their|our|your|his|her|my)\b)/gi,
    'many of',
  ],
  [/\ba (?:large|great) number of\b/gi, 'many'],
  [
    /\b(?:the|a) majority of(?=\s+(?:the|them|us|these|those|this|that|its|their|our|your|his|her|my)\b)/gi,
    'most of',
  ],
  [/\b(?:the|a) majority of\b/gi, 'most'],
  [/\bin addition to\b/gi, 'as well as'],
  [/\bin addition\b/gi, 'also'],
  [/\bin order for\b/gi, 'for'],
  [/\b(?:is|are) able to\b/gi, 'can'],
  [/\b(?:was|were) able to\b/gi, 'could'],
  [/(?<=^|[.!?]\s+)however,\s*/gi, 'but '],
  [/\bconverts\b(?=(?:\s+[\w'-]+){0,4}\s+into\b)/gi, 'turns'],
  [/\bconverted\b(?=(?:\s+[\w'-]+){0,4}\s+into\b)/gi, 'turned'],
  [/\bconverting\b(?=(?:\s+[\w'-]+){0,4}\s+into\b)/gi, 'turning'],
  [/\bconvert\b(?=(?:\s+[\w'-]+){0,4}\s+into\b)/gi, 'turn'],
  [/\btransforms\b(?=(?:\s+[\w'-]+){0,4}\s+into\b)/gi, 'turns'],
  [/\btransformed\b(?=(?:\s+[\w'-]+){0,4}\s+into\b)/gi, 'turned'],
  [/\btransforming\b(?=(?:\s+[\w'-]+){0,4}\s+into\b)/gi, 'turning'],
  [/\btransform\b(?=(?:\s+[\w'-]+){0,4}\s+into\b)/gi, 'turn'],
  [/\bgenerates\b/gi, 'makes'],
  [/\bgenerated\b/gi, 'made'],
  [/\bgenerating\b/gi, 'making'],
  [/\bgenerate\b/gi, 'make'],
  [/\brequires\b/gi, 'needs'],
  [/\brequired\b/gi, 'needed'],
  [/\brequiring\b/gi, 'needing'],
  [/\brequire\b/gi, 'need'],
  [/\bmodifies\b/gi, 'changes'],
  [/\bmodified\b/gi, 'changed'],
  [/\bmodifying\b/gi, 'changing'],
  [/\bmodify\b/gi, 'change'],
  [/\beliminates\b/gi, 'removes'],
  [/\beliminated\b/gi, 'removed'],
  [/\beliminating\b/gi, 'removing'],
  [/\beliminate\b/gi, 'remove'],
  [/\bindicates\b/gi, 'shows'],
  [/\bindicating\b/gi, 'showing'],
  [/\bindicate\b/gi, 'show'],
  [/\binitiates\b/gi, 'starts'],
  [/\binitiated\b/gi, 'started'],
  [/\binitiating\b/gi, 'starting'],
  [/\binitiate\b/gi, 'start'],
  // "Cease to work" is not "stop to work": only before anything but "to".
  [/\bceases\b(?!\s+to\b)/gi, 'stops'],
  [/\bceased\b(?!\s+to\b)/gi, 'stopped'],
  [/\bceasing\b(?!\s+to\b)/gi, 'stopping'],
  [/\bcease\b(?!\s+to\b)/gi, 'stop'],
  [/\bassists\b/gi, 'helps'],
  [/\bassisted\b/gi, 'helped'],
  [/\bassisting\b/gi, 'helping'],
  [/\battempted to\b/gi, 'tried to'],
  [/\battempting to\b/gi, 'trying to'],
  [/\bresides\b/gi, 'lives'],
  [/\bresiding\b/gi, 'living'],
  [/\breside\b/gi, 'live'],
  [/\bpossess\b/gi, 'have'],
  [/\bfacilitated\b/gi, 'helped'],
  [/\bfacilitating\b/gi, 'helping'],
  [/\bfrequently\b/gi, 'often'],
  [/\brapidly\b/gi, 'quickly'],
  [/\binitially\b/gi, 'at first'],
  [/\bultimately\b/gi, 'in the end'],
  [/\bprimarily\b/gi, 'mainly'],
  [/\bpredominantly\b/gi, 'mostly'],
  [/\badditionally\b/gi, 'also'],
  [/\bnevertheless\b/gi, 'still'],
  [/\bnonetheless\b/gi, 'still'],
  // "Thus protecting you" is not "so protecting you".
  [/\bthus\b(?!\s+\w+ing\b)/gi, 'so'],
  [/\bhence\b(?!\s+\w+ing\b)/gi, 'so'],
  [/\bwhereas\b/gi, 'while'],
  [/\bwhilst\b/gi, 'while'],
  [/\bamongst\b/gi, 'among'],
  [/(?<!\bonce )\bupon\b/gi, 'on'],
  [/\bbeneficial\b/gi, 'helpful'],
  [/\bdetrimental\b/gi, 'harmful'],
  [/\butili[sz]es\b/gi, 'uses'],
  [/\butili[sz]ed\b/gi, 'used'],
  [/\butili[sz]ing\b/gi, 'using'],
  [/\butili[sz]e\b/gi, 'use'],
  [/\bcommences\b/gi, 'starts'],
  [/\bcommenced\b/gi, 'started'],
  [/\bcommencing\b/gi, 'starting'],
  [/\bcommence\b/gi, 'start'],
  [/\bapproximately\b/gi, 'about'],
  [/\bassistance\b/gi, 'help'],
  [/\bsufficient\b/gi, 'enough'],
  [/\bdemonstrates\b/gi, 'shows'],
  [/\bdemonstrated\b/gi, 'showed'],
  [/\bdemonstrating\b/gi, 'showing'],
  [/\bdemonstrate\b/gi, 'show'],
  [/\bobtains\b/gi, 'gets'],
  [/\bobtained\b/gi, 'got'],
  [/\bobtaining\b/gi, 'getting'],
  [/\bobtain\b/gi, 'get'],
  [/\bfacilitates\b/gi, 'helps'],
  [/\bfacilitate\b/gi, 'help'],
  [/\bsubsequently\b/gi, 'later'],
  [/\bprior to\b/gi, 'before'],
  [/\bin order to\b/gi, 'to'],
  [/\bnumerous\b/gi, 'many'],
  [/\bterminates\b/gi, 'ends'],
  [/\bterminated\b/gi, 'ended'],
  [/\bterminate\b/gi, 'end'],
  [/\bendeavou?r to\b/gi, 'try to'],
  [/\bascertain\b/gi, 'find out'],
  [/\bindividuals\b/gi, 'people'],
  [/\bpossesses\b/gi, 'has'],
  [/\bfurthermore\b/gi, 'also'],
  [/\bmoreover\b/gi, 'also'],
  [/\bconsequently\b/gi, 'so'],
  [/\btherefore\b/gi, 'so'],
  [/\bregarding\b/gi, 'about'],
];

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A text with its stiff words swapped, but never a word the lesson's own material uses. */
export function plainWords(
  text: string,
  material = '',
): { text: string; swapped: string[] } {
  const lesson = material.toLowerCase();
  const swapped: string[] = [];
  let out = text;
  for (const [pattern, plain] of STIFF)
    out = out.replace(pattern, (word: string) => {
      if (lesson.includes(word.toLowerCase())) return word;
      swapped.push(`"${word}" is "${plain}"`);
      return /^[A-Z]/.test(word) ? capital(plain) : plain;
    });
  return { text: out, swapped };
}

/**
 * Abstract and academic words no code can swap safely ("the mechanism
 * is..." has no one-word plain form), each with what a friend would say
 * instead. What is left of them after the swaps rides along on the one
 * send-back as plain words, unless the lesson's own material or terms
 * use them (a course on reaction mechanisms keeps "mechanism").
 */
const ABSTRACT: [RegExp, string][] = [
  [/\bmechanisms?\b/i, 'how it works'],
  [/\blocomotion\b/i, 'moving'],
  [/\bphenomen(?:on|a)\b/i, 'what happens'],
  [/\bmethodolog(?:y|ies)\b/i, 'the way it is done'],
  [/\bparadigms?\b/i, 'way of thinking'],
  [/\boptim(?:al|um)\b/i, 'best'],
  [/\boptimi[sz](?:e|es|ed|ing)\b/i, 'make better'],
  [/\bsubsequent(?:ly)?\b/i, 'next, or later'],
  [/\bsignificant(?:ly)?\b/i, 'big, or a lot'],
  [/\bsubstantial(?:ly)?\b/i, 'big, or a lot'],
  [/\bimplement(?:s|ed|ing|ation)?\b/i, 'put to use'],
  [/\bconstitut(?:e|es|ed|ing)\b/i, 'make up'],
  [/\bcompris(?:e|es|ed|ing)\b/i, 'is made of'],
  [/\bcomponents?\b/i, 'part'],
  [/\bentit(?:y|ies)\b/i, 'thing'],
  [/\bwhereby\b/i, 'so that'],
  [/\bthereby\b/i, 'and so'],
  [/\binherent(?:ly)?\b/i, 'built in'],
  [/\butili[sz]ation\b/i, 'use'],
  [/\bfacilitation\b/i, 'help'],
  [/\bfunctionality\b/i, 'what it does'],
  [/\bcapabilit(?:y|ies)\b/i, 'what it can do'],
  [/\bmagnitude\b/i, 'size'],
  [/\bproximity\b/i, 'how close'],
  [/\bacquisition\b/i, 'getting'],
  [/\bexhibits\b/i, 'shows'],
];

/**
 * The abstract words a narration still says, in the order it says them,
 * each with its plain word, leaving out any the lesson's own material or
 * terms use.
 */
export function abstractWords(
  text: string,
  material = '',
  terms: readonly string[] = [],
): { word: string; plain: string }[] {
  const lesson = `${material} ${terms.join(' ')}`.toLowerCase();
  const out: { word: string; plain: string; at: number }[] = [];
  for (const [pattern, plain] of ABSTRACT) {
    const found = pattern.exec(text);
    if (!found) continue;
    const word = found[0].toLowerCase();
    if (lesson.includes(word)) continue;
    out.push({ word, plain, at: found.index });
  }
  // In the order they are said.
  return out
    .sort((a, b) => a.at - b.at)
    .map(({ word, plain }) => ({ word, plain }));
}

const wordCount = (s: string) => tokensOf(s).length;

/** Where a long sentence may be split: each gives the two sentences it makes. */
const SPLITS: {
  name: string;
  pattern: RegExp;
  make: (m: RegExpExecArray, before: string, after: string) => [string, string];
}[] = [
  {
    name: '"; "',
    pattern: /;\s+/,
    make: (_m, before, after) => [before, capital(after)],
  },
  {
    name: '", which"',
    pattern: /,\s+which\s+(?=(?:is|was|has|means|\w+s)\b)/i,
    make: (_m, before, after) => [before, `This ${after}`],
  },
  {
    name: '", which"',
    pattern: /,\s+which\s+(?=(?:are|were|have)\b)/i,
    make: (_m, before, after) => [before, `These ${after}`],
  },
  {
    name: '", and then"',
    pattern: /,\s+and then\s+/i,
    make: (_m, before, after) => [before, `Then ${after}`],
  },
  {
    name: '" because "',
    pattern: /\s+because\s+/i,
    make: (_m, before, after) => [before, `That is because ${after}`],
  },
];

/** A sentence's end mark, and the sentence without it. */
const endOf = (s: string): [string, string] => {
  const m = /[.!?…]+["'”’)]*$/.exec(s);
  return m ? [s.slice(0, m.index), m[0]] : [s, '.'];
};

/**
 * A sentence longer than `cap` split where it joins two thoughts, each
 * part at least four words; again while a part is still too long. The
 * reasons it was split, for the log.
 */
export function splitLong(
  sentence: string,
  cap: number,
): { sentences: string[]; splits: string[] } {
  const splits: string[] = [];
  const out: string[] = [];
  const queue = [sentence];
  let rounds = 0;
  while (queue.length) {
    const s = queue.shift()!;
    if (wordCount(s) <= cap || rounds >= 6) {
      out.push(s);
      continue;
    }
    const [body, end] = endOf(s);
    let done = false;
    for (const split of SPLITS) {
      const m = split.pattern.exec(body);
      if (!m) continue;
      const before = body.slice(0, m.index).replace(/[,;:\s]+$/, '');
      const after = body.slice(m.index + m[0].length);
      if (wordCount(before) < 4 || wordCount(after) < 4) continue;
      const [a, b] = split.make(m, before, after);
      rounds += 1;
      splits.push(split.name);
      queue.unshift(`${a}.`, `${b}${end}`);
      done = true;
      break;
    }
    if (!done) out.push(s);
  }
  return { sentences: out, splits };
}

/** A phrase's words, for finding which part of a split sentence holds it. */
const norm = (s: string) => tokensOf(s).join(' ');

/**
 * A draft's narration put right by code: stiff words swapped (in the
 * anchors of its steps too, so they still find their words), and every
 * sentence longer than the cap split, a beat a sentence. Steps keep their
 * words: each moves to the part of its sentence that holds its phrase,
 * and those after move along.
 */
export function plainDraft(
  draft: SceneScriptDraft,
  cap: number,
  material = '',
): { draft: SceneScriptDraft; fixes: string[] } {
  const fixes: string[] = [];
  const beats: Beat[] = [];
  /** Old beat → the new beats it became. */
  const became: number[][] = [];
  draft.beats.forEach((beat, k) => {
    const words = plainWords(beat.say ?? '', material);
    fixes.push(...words.swapped.map((s) => `sentence ${k + 1}: ${s}`));
    const parts: string[] = [];
    let split = false;
    for (const sentence of sentencesIn(words.text)) {
      const one = splitLong(sentence, cap);
      if (one.splits.length) {
        split = true;
        fixes.push(`sentence ${k + 1}: split at ${one.splits.join(', ')}`);
      }
      parts.push(...one.sentences);
    }
    if (!split || parts.length < 2) {
      became.push([beats.length]);
      beats.push({ ...beat, say: words.text });
      return;
    }
    const at = beats.length;
    parts.forEach((say, i) => {
      const first = i === 0;
      const last = i === parts.length - 1;
      const delivery =
        beat.delivery === 'hook'
          ? first
            ? 'hook'
            : 'explain'
          : beat.delivery === 'question'
            ? last
              ? 'question'
              : 'explain'
            : beat.delivery;
      beats.push({
        ...beat,
        say,
        delivery,
        pause: last ? beat.pause : 'short',
        ...(first ? {} : { music: null }),
      });
    });
    became.push(parts.map((_, i) => at + i));
  });
  if (!fixes.length) return { draft, fixes };
  const steps = draft.steps.map((step) => {
    const phrase = plainWords(step.phrase ?? '', material).text;
    const b = Math.min(Math.max(0, Math.round(step.beat)), became.length - 1);
    const into = became[b] ?? [b];
    const wanted = norm(phrase);
    const holds = into.find(
      (i) => wanted && norm(beats[i].say).includes(wanted),
    );
    return { ...step, phrase, beat: holds ?? into[0] };
  });
  return { draft: { ...draft, beats, steps }, fixes };
}

// ── The check ─────────────────────────────────────────────────────────────

/** How far over its bar a narration's grade may go before it is sent back with the rest. */
export const GRADE_SLACK = 2;
/** How far over the cap a sentence may run before it is. */
export const LONG_SLACK = 3;

/**
 * An explainer's scene held to its audience: its narration put right by
 * code, then measured; what is still well over the bar (the reading grade
 * two or more over, a sentence well past the cap), and a check for
 * understanding the recipe wanted and the scene did not ask, are
 * problems to ride along on its one send-back. Never errors, never shown.
 */
export function plainExplainer(
  sheet: ExplainerSheet,
  input: {
    recipe: Pick<AudienceRecipe, 'sentence' | 'grade' | 'hardShare'>;
    /** What the scene teaches: its words are the lesson's, never hard. */
    material?: string;
    /** The lesson's terms: each counts as one word. */
    terms?: readonly string[];
    /** Whether this scene asks the viewer a question (checksAt). */
    check?: boolean;
  },
): {
  sheet: ExplainerSheet;
  fixes: string[];
  measure: PlainMeasure;
  problems: SheetProblem[];
} {
  const cap = input.recipe.sentence[1];
  const material = input.material ?? '';
  const fixed = plainDraft(sheet.draft, cap, material);
  const out = fixed.fixes.length ? { ...sheet, draft: fixed.draft } : sheet;
  const cards = out.draft.cast
    .filter((thing) => thing.kind === 'words' && thing.style === 'keyword')
    .map((thing) => thing.name);
  const narration = out.draft.beats.map((b) => b.say).join(' ');
  const measure = measurePlain(narration, {
    terms: [...(input.terms ?? []), ...cards],
    material,
  });
  const problems: SheetProblem[] = [];
  const say = (message: string) =>
    problems.push({ rule: 'plain', message, beat: null, level: 'warning' });
  const longest = sentencesIn(narration).sort(
    (a, b) => wordCount(b) - wordCount(a),
  )[0];
  const abstract = measure.english
    ? abstractWords(narration, material, [
        ...(input.terms ?? []),
        ...cards,
      ]).slice(0, 5)
    : [];
  const plainFor = abstract.map((a) => `"${a.word}" (${a.plain})`).join(', ');
  if (
    measure.english &&
    measure.words >= 20 &&
    measure.grade >= input.recipe.grade + GRADE_SLACK
  ) {
    const hard = measure.hard
      .filter((w) => !abstract.some((a) => a.word === w))
      .slice(0, 5 - abstract.length)
      .map((w) => `"${w}"`);
    const instead = [plainFor, ...hard].filter(Boolean).join(', ');
    say(
      `The narration reads at about grade ${Math.round(measure.grade)}; for these learners keep it near grade ${input.recipe.grade} or easier: sentences of at most ${cap} words, one idea each, and everyday words${instead ? ` in place of ${instead}` : ''}.`,
    );
  } else {
    if (longest && measure.longest > cap + LONG_SLACK)
      say(
        `A sentence runs ${measure.longest} words ("${longest.split(/\s+/).slice(0, 8).join(' ')}…"); keep each to at most ${cap} words, one idea each.`,
      );
    if (abstract.length)
      say(
        `Say it in the words a friend would use, short and concrete, not abstract or academic ones: ${plainFor}. Name what things do with action words ("moves", "pushes", "fits", "sticks to").`,
      );
  }
  if (input.check && !out.draft.beats.some((b) => b.delivery === 'question'))
    say(
      'Ask the viewer one question in this scene to check they follow (a sentence with delivery "question"), then leave a pause for them to think before the answer.',
    );
  return { sheet: out, fixes: fixed.fixes, measure, problems };
}

/**
 * What goes back to the writer: the scene's own reasons, and with them,
 * only when there are some, what its words still get wrong for its
 * audience. Plain words never send a scene back alone.
 */
export const rideAlong = (
  reasons: readonly SheetProblem[],
  plain: readonly SheetProblem[],
): SheetProblem[] => (reasons.length ? [...reasons, ...plain] : []);
