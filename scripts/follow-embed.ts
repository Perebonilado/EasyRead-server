/**
 * Vectors for the labelled pages, so the matcher's meaning can be tuned
 * and tested offline: every spoken sentence and every note unit of every
 * fixture, embedded once with the same small vectors the matcher asks for,
 * and written back into the fixture by text.
 *
 *   npm run follow:embed              every fixture missing a vector
 *   npm run follow:embed -- --all     every fixture, afresh
 *
 * Needs the provider key in .env; costs a fraction of a cent.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiSdkLlmAdapter } from '../src/web/adapters/ai-sdk/ai-sdk-llm.adapter';
import {
  FIXTURES_DIR,
  fixtureSpoken,
  loadFixtures,
} from '../src/business/domain/follow-eval';
import {
  MEANING_DIMENSIONS,
  meaningTexts,
  noteUnits,
} from '../src/business/domain/follow';

async function main(): Promise<void> {
  const afresh = process.argv.includes('--all');
  const adapter = new AiSdkLlmAdapter(new ConfigService(process.env));
  for (const fixture of loadFixtures()) {
    const units = noteUnits(fixture.blocks);
    const { spoken } = fixtureSpoken(fixture);
    const texts = meaningTexts(spoken, fixture.wordTimes.sentences, units);
    const have = afresh ? {} : (fixture.meaning ?? {});
    const wanted = [...new Set([...texts.spoken, ...texts.units])].filter(
      (text) => text && !have[text],
    );
    if (!wanted.length) {
      console.log(`${fixture.name}: vectors present`);
      continue;
    }
    const result = await adapter.embed({
      texts: wanted,
      dimensions: MEANING_DIMENSIONS,
    });
    const meaning: Record<string, number[]> = { ...have };
    wanted.forEach((text, i) => {
      meaning[text] = result.value[i].map((v) => Math.round(v * 1e5) / 1e5);
    });
    writeFileSync(
      join(FIXTURES_DIR, `${fixture.name}.json`),
      `${JSON.stringify({ ...fixture, meaning }, null, 1)}\n`,
    );
    console.log(
      `${fixture.name}: ${wanted.length} texts embedded with ${result.usage.model} (${result.usage.tokensIn} tokens)`,
    );
  }
}

void main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
