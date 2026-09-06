/**
 * Does the tutor help a learner who reaches ahead?
 *
 * A fixture is a question asked on a page whose answer the book gives a
 * few pages on, with the context the tutor would have had. The eval
 * builds the tutor's instructions as the session does, asks a text model
 * to answer as the tutor, and asks a judge whether the answer confirms
 * the problem, names the book's answer, and names the page. Never in the
 * live path; it is how the instructions are tuned.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AskFixture {
  name: string;
  pageNumber: number;
  pageCount: number;
  question: string;
  answerPages: number[];
  /** What a good answer does, for the judge. */
  expect: string;
  chapter: {
    title: string;
    startPage: number;
    endPage: number;
    arc: string | null;
    beats: { pageNumber: number; goal: string }[];
  };
  pageText: string;
  heard: string;
  passages: { pageNumber: number; text: string }[];
}

export interface AskVerdict {
  name: string;
  confirms: boolean;
  namesAnswer: boolean;
  namesPage: boolean;
  wrong: string | null;
  answer: string;
}

export interface AskScore {
  /** Share of fixtures where the answer confirms, names the answer and names the page. */
  helped: number;
  confirms: number;
  namesAnswer: number;
  namesPage: number;
  count: number;
}

export const ASK_FIXTURES_DIR = join(__dirname, 'ask-fixtures');
export const ASK_BASELINE_FILE = join(ASK_FIXTURES_DIR, 'baseline.json');

export function loadAskFixtures(dir: string = ASK_FIXTURES_DIR): AskFixture[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== 'baseline.json')
    .sort()
    .map(
      (file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as AskFixture,
    );
}

export function scoreAskVerdicts(verdicts: AskVerdict[]): AskScore {
  const count = verdicts.length || 1;
  const share = (pick: (verdict: AskVerdict) => boolean) =>
    verdicts.filter(pick).length / count;
  return {
    helped: share((v) => v.confirms && v.namesAnswer && v.namesPage),
    confirms: share((v) => v.confirms),
    namesAnswer: share((v) => v.namesAnswer),
    namesPage: share((v) => v.namesPage),
    count: verdicts.length,
  };
}

export type AskBaseline = Partial<Record<string, AskScore>>;

export function readAskBaseline(file = ASK_BASELINE_FILE): AskBaseline {
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as AskBaseline)
    : {};
}

export function writeAskBaseline(
  baseline: AskBaseline,
  file = ASK_BASELINE_FILE,
): void {
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
}
