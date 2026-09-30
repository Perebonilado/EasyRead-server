/**
 * "Now you explain it" checked once, live (studio-explainer-plan, Ask 9,
 * idea 3): one studio_teach_back call on the configured model (DeepSeek
 * flash, thinking off; stopped if it is anything else), against the
 * day-and-night explainer's points, with what it cost said.
 *
 *   ts-node --transpile-only -r tsconfig-paths/register scripts/teach-back-check.ts \
 *     "The Earth spins round once a day, so the side facing the Sun has day."
 */
import 'reflect-metadata';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { costOf } from '../src/business/domain/cost';
import * as studio from '../src/business/domain/studio/studio';
import { teachBack } from '../src/business/handlers/studio/studio-engage';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import * as tokens from '../src/business/ports/tokens';

const ANSWER =
  process.argv[2] ??
  'The Earth spins round once a day, so the side facing the Sun has day.';

async function main(): Promise<void> {
  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: resolve(__dirname, '../../easyread-server/.env'),
      }),
      CoreModule,
    ],
  })
  class TeachBackModule {}
  const app = await NestFactory.createApplicationContext(TeachBackModule, {
    logger: ['warn', 'error'],
  });
  try {
    const llm = app.get<LlmGatewayPort>(tokens.LLM_GATEWAY);
    const registry = (
      llm as unknown as {
        registry: {
          languageModel: (
            t: string,
          ) => Promise<{ ref: { provider: string; modelId: string } }>;
        };
      }
    ).registry;
    const { ref } = await registry.languageModel('studio_teach_back');
    console.log(`the checker: ${ref.provider}:${ref.modelId}`);
    if (ref.provider !== 'deepseek')
      throw new Error('The checker is not DeepSeek: stopped');
    const outline = studio.outlineOf({
      title: 'Why do we have day and night?',
      scenes: [
        {
          title: 'One',
          summary: 'a',
          teach: 't',
          points: [
            'The Sun stays put: the Sun as a big warm light',
            'The Earth spins: one whole turn every day',
          ],
        },
        {
          title: 'Two',
          summary: 'b',
          teach: 't',
          points: [
            'The day side faces the Sun',
            'The night side faces away',
            'Morning: our side turns into the light',
          ],
        },
        {
          title: 'Three',
          summary: 'c',
          teach: 't',
          points: [
            'Somewhere children are waking up',
            'Half day, half night: the Earth spinning',
          ],
        },
      ],
    });
    const brief = studio.briefOf({
      format: 'explainer',
      idea: 'Day and night',
      who: { band: 'primary-upper' },
    });
    let usd = 0;
    const checked = await teachBack(
      llm,
      (usage) => {
        usd =
          costOf({
            task: 'studio_teach_back',
            model: usage.model,
            tokensIn: usage.tokensIn,
            tokensOut: usage.tokensOut,
            tokensCached: usage.tokensCached ?? null,
          }) ?? 0;
        console.log(
          `call studio_teach_back on ${usage.model}: ${usage.tokensIn} in, ${usage.tokensOut} out, ${usage.latencyMs} ms, $${usd.toFixed(5)}`,
        );
        return Promise.resolve();
      },
      { brief },
      outline,
      ANSWER,
    );
    console.log(JSON.stringify(checked, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
