/**
 * The follow-along matcher, measured.
 *
 * A fixture is one real page: the note it was taught from, the script the
 * tutor spoke, the word times the aligner measured, and for every spoken
 * sentence the note sentence a person says it belongs to. The matcher is
 * run over each and scored three ways, so a change to it is accepted or
 * refused on a number rather than on watching a lecture.
 *
 * Labels name a note sentence by the block it sits in and the first words
 * of its text, not by its number, so a change to how sentences are split
 * does not move them: "2:Rehashing is a technique". A label of just the
 * block number ("5") says the tutor is on the block as a whole, a table or
 * a paragraph being summarised. "-" says no note sentence is right: the
 * tutor's own example or aside, which the score leaves out.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Block, LectureStyle, Level } from '../../contracts';
import { normalise } from './board';
import {
  alignSentences,
  meaningScores,
  meaningTexts,
  noteUnits,
  type NoteUnit,
  type SpokenSentence,
} from './follow';
import { contentWords, numbersAsWords } from './board';
import { scriptForTts } from './lecture';

export interface FollowScore {
  /** Of the spoken sentences labelled with a note sentence, the share put on exactly that sentence. */
  sentence: number;
  /** Of every labelled spoken sentence, the share put in the right block. */
  block: number;
  /** Of the spoken sentences labelled with a note sentence, the share left on an earlier one: the highlight behind the voice. */
  stuck: number;
  /** Of the same, the share put on a later one: the highlight ahead of the voice, gliding over the page. */
  ahead: number;
}

export interface FollowFixture {
  name: string;
  title: string;
  page: number;
  style: LectureStyle;
  level: Level;
  labels: string[];
  baseline: FollowScore | null;
  blocks: Block[];
  script: string;
  durationMs: number | null;
  wordTimes: { source: string; words: number[][]; sentences: number[][] };
  /** Vectors by text, for every spoken sentence and note unit, written by `npm run follow:embed`. */
  meaning?: Record<string, number[]>;
}

/** What a label asks for: a block, and a sentence within it when it names one. */
export interface Want {
  block: number;
  sentence: number | null;
}

/** A matcher under test: the note unit for each spoken sentence, in order. */
export type Matcher = (
  spoken: SpokenSentence[],
  units: NoteUnit[],
  meaning: number[][] | null,
) => number[];

/** The meaning scores for a fixture from its stored vectors, or null when it has none. */
export function fixtureMeaning(
  fixture: FollowFixture,
  units: NoteUnit[],
): number[][] | null {
  if (!fixture.meaning) return null;
  const { spoken } = fixtureSpoken(fixture);
  const texts = meaningTexts(spoken, fixture.wordTimes.sentences, units);
  const vectors = (list: string[]) =>
    list.map((text) => fixture.meaning?.[text] ?? []);
  const said = vectors(texts.spoken);
  const note = vectors(texts.units);
  if (said.some((v) => !v.length) || note.some((v) => !v.length)) return null;
  return meaningScores(said, note);
}

export const FIXTURES_DIR = join(__dirname, 'follow-fixtures');

export function loadFixtures(dir: string = FIXTURES_DIR): FollowFixture[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map(
      (file) =>
        JSON.parse(readFileSync(join(dir, file), 'utf8')) as FollowFixture,
    );
}

/** A label, resolved against the note's units as they are split today. Throws when its words are not in the block. */
export function resolveLabel(label: string, units: NoteUnit[]): Want | null {
  const text = label.trim();
  if (text === '-' || text === '') return null;
  const colon = text.indexOf(':');
  if (colon < 0) return { block: Number(text), sentence: null };
  const block = Number(text.slice(0, colon));
  const wanted = normalise(text.slice(colon + 1));
  const unit = units.find(
    (candidate) =>
      candidate.block === block && normalise(candidate.text).includes(wanted),
  );
  if (!unit) {
    throw new Error(`label "${label}" names no sentence of block ${block}`);
  }
  return { block, sentence: unit.sentence };
}

/** The spoken sentences of a fixture, one per stored sentence, none dropped, so indices line up with the labels. */
export function fixtureSpoken(fixture: FollowFixture): {
  spoken: string;
  said: SpokenSentence[];
} {
  const spoken = scriptForTts(fixture.script);
  const said = fixture.wordTimes.sentences.map(
    ([charStart, charEnd, startMs, endMs]) => ({
      words: contentWords(numbersAsWords(spoken.slice(charStart, charEnd))),
      startMs,
      endMs,
    }),
  );
  return { spoken, said };
}

export function scoreAssignments(
  wants: (Want | null)[],
  assigned: number[],
  units: NoteUnit[],
): FollowScore {
  let labelled = 0;
  let blockRight = 0;
  let withSentence = 0;
  let sentenceRight = 0;
  let stuck = 0;
  let ahead = 0;
  wants.forEach((want, i) => {
    if (!want) return;
    const got = units[assigned[i]];
    labelled += 1;
    if (got && got.block === want.block) blockRight += 1;
    if (want.sentence === null) return;
    withSentence += 1;
    if (got && got.block === want.block && got.sentence === want.sentence) {
      sentenceRight += 1;
      return;
    }
    const wantedIndex = units.findIndex(
      (unit) => unit.block === want.block && unit.sentence === want.sentence,
    );
    if (assigned[i] < wantedIndex) stuck += 1;
    else ahead += 1;
  });
  const share = (part: number, whole: number) => (whole ? part / whole : 1);
  return {
    sentence: share(sentenceRight, withSentence),
    block: share(blockRight, labelled),
    stuck: share(stuck, withSentence),
    ahead: share(ahead, withSentence),
  };
}

export interface EvaluatedRow {
  index: number;
  startMs: number;
  text: string;
  want: Want | null;
  got: NoteUnit | null;
}

export interface Evaluation {
  fixture: FollowFixture;
  score: FollowScore;
  rows: EvaluatedRow[];
}

/** The matcher as it runs in the pipeline today. */
export const currentMatcher: Matcher = (spoken, units, meaning) =>
  alignSentences(spoken, units, { meaning });

export function evaluate(
  fixture: FollowFixture,
  matcher: Matcher = currentMatcher,
): Evaluation {
  const units = noteUnits(fixture.blocks);
  const wants = fixture.labels.map((label) => resolveLabel(label, units));
  const { spoken, said } = fixtureSpoken(fixture);
  const assigned = matcher(said, units, fixtureMeaning(fixture, units));
  const rows = fixture.wordTimes.sentences.map(
    ([charStart, charEnd, startMs], i) => ({
      index: i,
      startMs,
      text: spoken.slice(charStart, charEnd),
      want: wants[i],
      got: units[assigned[i]] ?? null,
    }),
  );
  return { fixture, score: scoreAssignments(wants, assigned, units), rows };
}

export function meanScore(scores: FollowScore[]): FollowScore {
  const mean = (pick: (score: FollowScore) => number) =>
    scores.length
      ? scores.reduce((sum, score) => sum + pick(score), 0) / scores.length
      : 1;
  return {
    sentence: mean((score) => score.sentence),
    block: mean((score) => score.block),
    stuck: mean((score) => score.stuck),
    ahead: mean((score) => score.ahead),
  };
}

/** Whether a score is at least as good as a recorded one, on every count. */
export function noWorseThan(
  score: FollowScore,
  baseline: FollowScore,
): boolean {
  const slack = 1e-9;
  return (
    score.sentence >= baseline.sentence - slack &&
    score.block >= baseline.block - slack &&
    score.stuck <= baseline.stuck + slack &&
    score.ahead <= (baseline.ahead ?? 1) + slack
  );
}
