/**
 * The tutor's "work it through" tool, tried on problems of every stage,
 * against the real model: each problem set out, checked by code, sent
 * back once if wrong, and cut where code cannot stand behind it; then
 * the lines as the board writes them and the voice says them.
 *
 *   npm run work:try -- ["problem" ...] [--summary "who it is for"] [--out <dir>]
 *
 * With --out, the workings are kept as <dir>/work.json, for the client's
 * board lab (/dev/board?work=<folder> reads public/dev-notes/<folder>).
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { workLines } from '../src/business/domain/maths-board';
import { startMathsSpeech } from '../src/business/domain/maths-speech';
import {
  checkSolution,
  settleWorking,
} from '../src/business/domain/maths-work';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import { LLM_GATEWAY } from '../src/business/ports/tokens';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
})
class WorkTryModule {}

const PROBLEMS: [string, string][] = [
  ['A primary school maths book, for children of 8.', 'What is 47 + 28?'],
  [
    'A primary school maths book, for children of 8.',
    'Share 12 sweets equally among 3 friends. How many does each get?',
  ],
  ['A secondary school algebra book.', 'Solve 2x + 3 = 11'],
  ['A secondary school algebra book.', 'Solve x^2 + 3x - 10 = 0'],
  [
    'A secondary school physics book.',
    'A car starts at 5 m/s and speeds up at 2 m/s² for 3 s. What is its final speed?',
  ],
  ['A university calculus course.', 'Integrate 3x^2 + 2x from 0 to 2'],
  [
    'A law textbook for students in Nigeria.',
    'What is the simple interest on ₦200,000 at 5% a year for 3 years?',
  ],
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const summary = option('--summary') ?? null;
  const out = option('--out');
  const asked = args.filter(
    (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'),
  );
  const kept: { problem: string; working: unknown; lines: unknown }[] = [];
  const problems: [string, string][] = asked.length
    ? asked.map((problem) => [summary ?? '', problem])
    : PROBLEMS;
  const app = await NestFactory.createApplicationContext(WorkTryModule, {
    logger: ['warn', 'error'],
  });
  try {
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    await startMathsSpeech();
    for (const [who, problem] of problems) {
      const started = Date.now();
      let tries = 0;
      const working = await settleWorking(async (again) => {
        tries += 1;
        const result = await llm.workThrough({
          problem,
          summary: who || null,
          context: null,
          ...again,
        });
        if (again) console.log(`  sent back: ${again.problems.join(' | ')}`);
        return result.value;
      });
      const found = checkSolution(working);
      console.log(`\n${problem}  (${who || 'no summary'})`);
      console.log(
        `  ${((Date.now() - started) / 1000).toFixed(1)} s, ${tries} ${tries === 1 ? 'try' : 'tries'}${working.cut ? ', cut short' : ''}; steps ${found.steps.join(' ')}, answer ${found.answer}, check ${found.check}`,
      );
      const lines = workLines(working);
      kept.push({ problem, working, lines });
      for (const line of lines)
        console.log(
          `  ${line.role.padEnd(7)} ${line.plain.padEnd(34)} | ${line.said}${line.does ? `  <- ${line.does}` : ''}`,
        );
    }
    if (out) {
      const dir = resolve(out);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'work.json'), JSON.stringify(kept, null, 2));
      console.log(`\nKept in ${join(dir, 'work.json')}`);
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
