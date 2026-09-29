/**
 * The story bench (studio-story-plan §5, S2): ten fixed briefs, across
 * genres, lengths, audiences and places around the world (and one with no
 * setting at all, to show no region is anyone's default), each run
 * through story development against the real writer (DeepSeek, thinking
 * on, studio_write): the cast, then the premise, the characters, the beat
 * sheet and the scene plan, each checked by code and sent back once. It
 * prints what each check found, first and after going back, the tension
 * curve against its template, and the outline built from the plan.
 *
 *   npm run story:bench -- [--only <id>] [--out <dir>]
 *
 * A few cents a run. With --out, each brief's story is kept as
 * <dir>/<id>.json and the whole report as <dir>/report.txt.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import type { LlmGatewayPort, LlmUsage } from '../src/business/ports/llm.port';
import { LLM_GATEWAY } from '../src/business/ports/tokens';
import { bibleOf, briefOf } from '../src/business/domain/studio/studio';
import {
  checkBeats,
  isGenericTrait,
  peakOf,
} from '../src/business/domain/studio/studio-story';
import {
  describeBrief,
  describeOutline,
} from '../src/business/domain/studio/studio-words';
import { distinctVoices } from '../src/business/domain/studio/studio-check';
import { developStory } from '../src/business/handlers/studio/studio-develop';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
})
class StoryBenchModule {}

/** The ten briefs: genres, lengths, audiences and places from around the world, and one with no setting. */
const BRIEFS: { id: string; brief: Record<string, unknown> }[] = [
  {
    id: 'no-setting-lost-toy',
    brief: {
      format: 'story',
      idea: 'a little robot who loses its favourite toy and has to ask for help',
      audience: 'young children',
      minutes: 1,
      tone: 'gentle',
    },
  },
  {
    id: 'seoul-mystery',
    brief: {
      format: 'story',
      idea: "two cousins solve the mystery of who keeps moving the lucky cat in their grandmother's shop",
      audience: 'children',
      minutes: 2,
      tone: 'funny',
      setting: 'a small shop on a busy street in Seoul, today',
      genre: 'mystery',
    },
  },
  {
    id: 'andes-adventure',
    brief: {
      format: 'story',
      idea: 'a girl and her llama must cross the mountain pass to bring medicine before the snow',
      audience: 'children',
      minutes: 3,
      tone: 'exciting',
      setting: 'a village high in the Andes of Peru',
      genre: 'adventure',
      ending: 'happy',
    },
  },
  {
    id: 'lagos-comedy',
    brief: {
      format: 'story',
      idea: 'a boy tries to win the neighbourhood football match with a ball that will not stop bouncing the wrong way',
      audience: 'children',
      minutes: 1.5,
      tone: 'funny',
      setting: 'a street in Lagos, today',
      genre: 'comedy',
    },
  },
  {
    id: 'norway-drama',
    brief: {
      format: 'story',
      idea: 'an old fisherman teaches his granddaughter to mend nets the winter his eyesight fails',
      audience: 'adults',
      minutes: 2,
      tone: 'serious',
      setting: 'a fishing village in northern Norway',
      genre: 'drama',
      ending: 'bittersweet',
      narrator: 'light',
    },
  },
  {
    id: 'mumbai-romance',
    brief: {
      format: 'story',
      idea: 'two teenagers who argue on the same train every morning realise they are both writing the same school play',
      audience: 'teens',
      minutes: 2,
      tone: 'funny',
      setting: 'a commuter train in Mumbai',
      genre: 'romance',
    },
  },
  {
    id: 'fable-desert',
    brief: {
      format: 'story',
      idea: 'a proud fox and a patient tortoise share the last water in the desert',
      audience: 'young children',
      minutes: 0.5,
      tone: 'gentle',
      genre: 'fable',
      ending: 'moral',
      narrator: 'storyteller',
    },
  },
  {
    id: 'office-dark-comedy',
    brief: {
      format: 'story',
      idea: 'an office holds a funeral for the broken printer, and the eulogies get out of hand',
      audience: 'adults',
      minutes: 2,
      tone: 'funny',
      genre: 'dark-comedy',
      narrator: 'none',
    },
  },
  {
    id: 'mexico-spooky',
    brief: {
      format: 'story',
      idea: 'on the Day of the Dead, a boy is sure the skeleton decorations are moving when no one is looking',
      audience: 'children',
      minutes: 1,
      tone: 'funny',
      setting: 'a town in Oaxaca, Mexico, during the Day of the Dead',
      genre: 'spooky',
    },
  },
  {
    id: 'canada-slice-of-life',
    brief: {
      format: 'story',
      idea: 'a new girl at school learns to skate so she can join the others on the frozen pond',
      audience: 'children',
      minutes: 5,
      tone: 'gentle',
      setting: 'a small town in Manitoba, Canada, in winter',
      genre: 'slice-of-life',
      narrator: 'character',
    },
  },
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const only = option('--only');
  const out = option('--out') ? resolve(option('--out')!) : null;
  if (out) mkdirSync(out, { recursive: true });
  const app = await NestFactory.createApplicationContext(StoryBenchModule, {
    logger: ['warn', 'error'],
  });
  const lines: string[] = [];
  const say = (line = '') => {
    lines.push(line);
    console.log(line);
  };
  const totals = { briefs: 0, clean: 0, calls: 0, tokensIn: 0, tokensOut: 0 };
  try {
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    for (const { id, brief: raw } of BRIEFS) {
      if (only && only !== id) continue;
      totals.briefs += 1;
      const started = Date.now();
      const brief = briefOf(raw);
      const record = (usage: LlmUsage) => {
        totals.calls += 1;
        totals.tokensIn += usage.tokensIn;
        totals.tokensOut += usage.tokensOut;
      };
      say(
        `━━ ${id} ━━ ${brief.genre ?? 'genre left to us'}, ${brief.minutes} min, for ${brief.audience}${brief.setting ? `, ${brief.setting}` : ', no setting given'}`,
      );
      try {
        // The cast and places first, as the Studio makes them.
        const cast = await llm.studioBible({ brief: describeBrief(brief) });
        record(cast.usage);
        const bible = distinctVoices(bibleOf(cast.value));
        say(
          `world: ${bible.world ? [bible.world.era, bible.world.region, bible.world.culture].filter(Boolean).join('; ') : 'none'}`,
        );
        const developed = await developStory(llm, {
          brief,
          briefWords: describeBrief(brief),
          bible,
          record,
        });
        const { story } = developed;
        say(`premise: "${story.premise.title}" — ${story.premise.logline}`);
        say(`theme: ${story.premise.theme} · hook: ${story.premise.hook}`);
        for (const c of developed.bible.characters) {
          const p = c.persona;
          if (!p) continue;
          const stock = p.personality.filter(isGenericTrait);
          say(
            `  ${c.name}: wants ${p.want}; flaw ${p.flaw}; is ${p.personality.join(', ')}${stock.length ? ` [stock: ${stock.join(', ')}]` : ''}`,
          );
        }
        const curve = story.beats.beats.map((b) => b.intensity);
        say(
          `beats (${story.beats.template}): ${story.beats.beats.map((b) => b.role).join(' → ')}`,
        );
        say(
          `tension: ${curve.join(' ')}  (${peakOf(story.beats) >= 0 ? `peak at beat ${peakOf(story.beats) + 1}` : 'no climax beat'})`,
        );
        say(
          `scenes: ${story.plan.scenes.map((s) => `${s.title} [turn: ${s.turn}]`).join(' | ')}`,
        );
        for (const report of developed.steps)
          say(
            `  check ${report.step}: ${report.first.length ? `went back (${report.first.length}): ${report.first.join(' ')}` : 'passed first time'}${report.left ? ` → after: ${report.left.length ? report.left.join(' ') : 'passed'}` : ''}`,
          );
        const beatsLeft = checkBeats(story.beats);
        say(
          `final: ${developed.problems.length ? `${developed.problems.length} left: ${developed.problems.join(' ')}` : 'every check passes'}${beatsLeft.length ? '' : ' (structure, curve, setups ok)'}`,
        );
        say(`outline:\n${describeOutline(developed.outline, true)}`);
        say(`(${Math.round((Date.now() - started) / 1000)}s)`);
        say();
        if (!developed.problems.length) totals.clean += 1;
        if (out)
          writeFileSync(
            join(out, `${id}.json`),
            JSON.stringify(
              {
                brief,
                world: bible.world,
                story,
                characters: developed.bible.characters,
              },
              null,
              2,
            ),
          );
      } catch (error) {
        // One brief that cannot be run is said, and the rest run.
        const body = (error as { responseBody?: string }).responseBody;
        say(
          `could not run: ${(error as Error).message.split('\n')[0]}${body ? ` ${body.slice(0, 200)}` : ''}`,
        );
        say();
      }
    }
    say(
      `${totals.clean} of ${totals.briefs} briefs pass every check; ${totals.calls} calls, ${totals.tokensIn} tokens in, ${totals.tokensOut} out.`,
    );
    if (out) writeFileSync(join(out, 'report.txt'), `${lines.join('\n')}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
