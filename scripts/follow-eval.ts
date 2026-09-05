/**
 * The follow-along matcher over the labelled pages, as a table, with
 * every miss spelled out so it can be read rather than only counted.
 *
 *   npm run follow:eval                    every page, scores only
 *   npm run follow:eval -- gentle-72       one page, with its misses
 *   npm run follow:eval -- --misses        every page, with misses
 *   npm run follow:eval -- --write-baseline   record today's scores as the bar
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FIXTURES_DIR,
  evaluate,
  loadFixtures,
  meanScore,
  type Evaluation,
  type FollowScore,
} from '../src/business/domain/follow-eval';

const args = process.argv.slice(2);
const writeBaseline = args.includes('--write-baseline');
const showMisses = args.includes('--misses');
const only = args.filter((arg) => !arg.startsWith('--'));

const pct = (value: number) => `${Math.round(value * 100)}%`.padStart(4);
const delta = (
  now: number,
  then: number | undefined,
  lowerIsBetter = false,
) => {
  if (then === undefined) return '     ';
  const diff = Math.round((now - then) * 100);
  if (diff === 0) return '  =  ';
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return `${better ? '+' : '-'}${String(Math.abs(diff)).padStart(2)}pp`;
};

const where = (want: { block: number; sentence: number | null } | null) =>
  want ? `${want.block}.${want.sentence === null ? '*' : want.sentence}` : '-';

function printMisses(evaluation: Evaluation): void {
  for (const row of evaluation.rows) {
    const got = row.got ? `${row.got.block}.${row.got.sentence}` : '-';
    const wanted = where(row.want);
    const miss =
      row.want &&
      (!row.got ||
        row.got.block !== row.want.block ||
        (row.want.sentence !== null && row.got.sentence !== row.want.sentence));
    const mark = !row.want ? '  ' : miss ? 'XX' : 'ok';
    console.log(
      `   ${mark} ${(row.startMs / 1000).toFixed(1).padStart(5)}s got ${got.padEnd(5)} want ${wanted.padEnd(5)} "${row.text.slice(0, 96)}"`,
    );
  }
}

const fixtures = loadFixtures().filter(
  (fixture) => !only.length || only.includes(fixture.name),
);
if (!fixtures.length) {
  console.error(`no fixture named ${only.join(', ')}`);
  process.exit(1);
}

console.log(
  `${'page'.padEnd(12)} ${'style'.padEnd(7)} said  sentence      block        stuck        ahead`,
);
const scores: FollowScore[] = [];
const baselines: FollowScore[] = [];
for (const fixture of fixtures) {
  const evaluation = evaluate(fixture);
  const { score } = evaluation;
  scores.push(score);
  if (fixture.baseline) baselines.push(fixture.baseline);
  const then = fixture.baseline ?? undefined;
  console.log(
    `${fixture.name.padEnd(12)} ${fixture.style.padEnd(7)} ${String(fixture.labels.length).padStart(3)}   ${pct(score.sentence)} ${delta(score.sentence, then?.sentence)}   ${pct(score.block)} ${delta(score.block, then?.block)}   ${pct(score.stuck)} ${delta(score.stuck, then?.stuck, true)}   ${pct(score.ahead)} ${delta(score.ahead, then?.ahead, true)}`,
  );
  if (showMisses || only.length) printMisses(evaluation);
  if (writeBaseline) {
    const file = join(FIXTURES_DIR, `${fixture.name}.json`);
    writeFileSync(
      file,
      `${JSON.stringify({ ...fixture, baseline: score }, null, 1)}\n`,
    );
  }
}
const mean = meanScore(scores);
const meanThen =
  baselines.length === scores.length ? meanScore(baselines) : undefined;
console.log(
  `${'mean'.padEnd(12)} ${''.padEnd(7)} ${''.padStart(3)}   ${pct(mean.sentence)} ${delta(mean.sentence, meanThen?.sentence)}   ${pct(mean.block)} ${delta(mean.block, meanThen?.block)}   ${pct(mean.stuck)} ${delta(mean.stuck, meanThen?.stuck, true)}   ${pct(mean.ahead)} ${delta(mean.ahead, meanThen?.ahead, true)}`,
);
if (writeBaseline) console.log('baselines written');
