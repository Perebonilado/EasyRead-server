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
 *   npm run story:bench -- [--only <id>] [--out <dir>] [--scenes [--read-only]] [--lanes <n>]
 *
 * With --scenes (S3, S4), every scene is then written as the worker
 * writes it (in order, each carrying on from the one before), and the
 * table read reads the whole script, scores it against the rubric and,
 * below the bar, writes the failing scenes again (at most two rounds, the
 * best read kept); --read-only reads it and writes nothing again. The
 * report gives each read's scores, the rewrites, and code's notes.
 *
 * A few cents a run. With --out, each brief's story is kept as
 * <dir>/<id>.json, its script as <dir>/<id>.script.txt, and the whole
 * report as <dir>/report.txt.
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
  contextOf,
  isGenericTrait,
  peakOf,
} from '../src/business/domain/studio/studio-story';
import type {
  StorySheet,
  StudioBible,
} from '../src/business/domain/studio/studio';
import {
  endStateOf,
  mendSheet,
  withFound,
  type EndState,
} from '../src/business/domain/studio/studio-check';
import {
  RUBRIC_KEYS,
  belowBar,
  describeRead,
  scriptInWords,
  type TableRead,
} from '../src/business/domain/studio/studio-script';
import { costOf } from '../src/business/domain/cost';
import { writeStorySheet } from '../src/business/handlers/studio/studio-scenes';
import { tableRead } from '../src/business/handlers/studio/studio-tableread';
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
  const scenes = args.includes('--scenes');
  const readOnly = args.includes('--read-only');
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
  const totals = {
    briefs: 0,
    clean: 0,
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    dollars: 0,
    read: 0,
    passFirst: 0,
    passKept: 0,
    first: [] as number[],
    kept: [] as number[],
    items: {} as Record<string, number[]>,
  };
  /** The best script of the run, for reading. */
  let bestScript: { id: string; overall: number } | null = null;
  try {
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    const chosen = BRIEFS.filter(({ id }) => !only || only === id);
    /** Each brief's report, kept whole while briefs run side by side. */
    const reports = new Map<string, string[]>();
    const runBrief = async ({ id, brief: raw }: (typeof BRIEFS)[number]) => {
      const mine: string[] = [];
      reports.set(id, mine);
      const say = (line = '') => {
        mine.push(line);
      };
      totals.briefs += 1;
      const started = Date.now();
      const brief = briefOf(raw);
      const record = (usage: LlmUsage, task = 'studio_write') => {
        totals.calls += 1;
        totals.tokensIn += usage.tokensIn;
        totals.tokensOut += usage.tokensOut;
        totals.dollars +=
          costOf({
            task,
            model: usage.model,
            tokensIn: usage.tokensIn,
            tokensOut: usage.tokensOut,
            tokensCached: usage.tokensCached ?? null,
          }) ?? 0;
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
        const beatsLeft = checkBeats(
          story.beats,
          contextOf(developed.bible, story.premise),
        );
        say(
          `final: ${developed.problems.length ? `${developed.problems.length} left: ${developed.problems.join(' ')}` : 'every check passes'}${beatsLeft.length ? '' : ' (structure, curve, setups ok)'}`,
        );
        say(`outline:\n${describeOutline(developed.outline, true)}`);
        let script: Record<string, unknown> = {};
        if (scenes) {
          // Every scene, in order, as the worker writes them.
          let grown: StudioBible = developed.bible;
          let before: EndState | null = null;
          const sheets: StorySheet[] = [];
          for (let k = 0; k < developed.outline.scenes.length; k += 1) {
            const written = await writeStorySheet(llm, {
              brief,
              bible: grown,
              outline: developed.outline,
              k,
              before,
              planned: developed.outline.scenes[k].seconds,
              record,
            });
            const left = written.problems.filter((p) => p.level === 'error');
            if (left.length)
              say(`  s${k + 1} still: ${left.map((p) => p.message).join(' ')}`);
            sheets.push(written.sheet);
            grown = withFound(
              grown,
              written.sheet.set,
              mendSheet(written.sheet, grown, before),
            );
            before = endStateOf(written.sheet, grown, before);
          }
          const result = await tableRead(llm, {
            brief,
            bible: grown,
            outline: developed.outline,
            sheets,
            rewrite: !readOnly,
            record: (usage, task) => record(usage, task),
            log: (line) => say(`  ${line}`),
          });
          const first = result.rounds[0].read;
          const kept = result.rounds[result.best].read;
          totals.read += 1;
          totals.first.push(first.overall);
          totals.kept.push(kept.overall);
          if (!belowBar(first).length) totals.passFirst += 1;
          if (!belowBar(kept).length) totals.passKept += 1;
          for (const key of RUBRIC_KEYS)
            if (kept.scores[key] !== undefined)
              (totals.items[key] ??= []).push(kept.scores[key]);
          const code = result.rounds[0].code;
          say(
            `code notes on the first script (${code.length}): ${code.map((n) => `s${n.scene + 1} ${n.kind}: ${n.message}`).join(' | ') || 'none'}`,
          );
          say(
            `table read: first ${first.overall}${result.rounds.length > 1 ? `, kept ${kept.overall} (read ${result.best + 1} of ${result.rounds.length})` : ''}; ${belowBar(kept).length ? `below the bar: ${belowBar(kept).join(', ')}` : 'clears the bar'}`,
          );
          say(`verdict: ${kept.verdict}`);
          if (!bestScript || kept.overall > bestScript.overall)
            bestScript = { id, overall: kept.overall };
          script = {
            reads: result.rounds.map((r) => ({
              read: r.read,
              code: r.code,
              rewritten: r.rewritten,
            })),
            best: result.best,
            sheets: result.sheets,
            first: result.rounds[0].sheets,
          };
          if (out)
            writeFileSync(
              join(out, `${id}.script.txt`),
              scriptText(id, brief, developed, result.sheets, grown, kept),
            );
        }
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
                ...script,
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
    };
    // A few at once (--lanes, 5 by default), each said whole and in order.
    const lanes = Math.max(1, Number(option('--lanes') ?? 5));
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(lanes, chosen.length) }, async () => {
        while (next < chosen.length) {
          const one = chosen[next];
          next += 1;
          await runBrief(one);
          console.log(`… ${one.id} done`);
        }
      }),
    );
    for (const { id } of chosen)
      for (const line of reports.get(id) ?? []) say(line);
    say(
      `${totals.clean} of ${totals.briefs} briefs pass every check; ${totals.calls} calls, ${totals.tokensIn} tokens in, ${totals.tokensOut} out; about $${totals.dollars.toFixed(3)}.`,
    );
    if (totals.read) {
      const mean = (xs: number[]) =>
        xs.length
          ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)
          : '-';
      say(
        `table read: ${totals.passFirst} of ${totals.read} clear the bar at the first read, ${totals.passKept} as kept; overall mean ${mean(totals.first)} first, ${mean(totals.kept)} kept (first ${totals.first.join(' ')}; kept ${totals.kept.join(' ')}).`,
      );
      say(
        `items as kept (mean): ${Object.entries(totals.items)
          .map(([key, xs]) => `${key} ${mean(xs)}`)
          .join(', ')}`,
      );
      const best = bestScript as { id: string; overall: number } | null;
      if (best) say(`best script: ${best.id} (${best.overall})`);
    }
    if (out) writeFileSync(join(out, 'report.txt'), `${lines.join('\n')}\n`);
  } finally {
    await app.close();
  }
}

/** A script as Richard reads it: the story, who everyone is, every scene as a screenplay, and the read. */
function scriptText(
  id: string,
  brief: ReturnType<typeof briefOf>,
  developed: Awaited<ReturnType<typeof developStory>>,
  sheets: StorySheet[],
  bible: StudioBible,
  read: TableRead,
): string {
  const { story } = developed;
  return [
    `${story.premise.title}  (${id})`,
    `${brief.genre ?? 'genre left to us'}, ${brief.minutes} min, for ${brief.audience}${brief.setting ? `, ${brief.setting}` : ''}${brief.narrator ? `; narrator ${brief.narrator}` : ''}`,
    '',
    `Logline: ${story.premise.logline}`,
    `Theme: ${story.premise.theme}`,
    `Hook: ${story.premise.hook}`,
    '',
    'Who they are:',
    ...bible.characters.map(
      (c) =>
        `- ${c.name}: ${c.persona ? `wants ${c.persona.want}; flaw: ${c.persona.flaw}; talks: ${c.persona.voice}` : c.traits.join(', ')}`,
    ),
    '',
    `Tension: ${story.beats.beats.map((b) => `${b.role} ${b.intensity}`).join(' → ')}`,
    '',
    scriptInWords(sheets, bible, developed.outline),
    '',
    `Table read: ${describeRead(read)}`,
    `Verdict: ${read.verdict}`,
    '',
  ].join('\n');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
