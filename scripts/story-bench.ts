/**
 * The story bench (studio-story-plan §5, S2): eleven fixed briefs, across
 * genres, lengths, audiences and places around the world (and one with no
 * setting at all, to show no region is anyone's default), each run
 * through story development against the real writer (DeepSeek, thinking
 * on, studio_write): the cast, then the premise, the characters, the beat
 * sheet and the scene plan, each checked by code and sent back once. It
 * prints what each check found, first and after going back, the tension
 * curve against its template, and the outline built from the plan.
 *
 *   npm run story:bench -- [--only <id>] [--out <dir>] [--scenes [--rounds <n>] [--retell] [--writers <n>]] [--lanes <n>]
 *
 * With --scenes (S3, S4), every scene is then written as the worker
 * writes it (a few at once, each from its plan, then carried on from one
 * to the next by code), and the table read scores the whole script
 * against the rubric, as the worker does: once, with no rewrites. With
 * --rounds n, below the bar it writes the failing scenes again (at most
 * n rounds, the best read kept); --retell adds the viewer's retelling;
 * --writers sets how many scenes are written at once (the worker's
 * STUDIO_SCENE_WRITERS, 3). The report gives each read's scores, the
 * rewrites, and code's notes, and each brief's calls and time.
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
  RUBRIC_KEYS,
  belowBar,
  describeRead,
  scriptInWords,
  type Retell,
  type TableRead,
} from '../src/business/domain/studio/studio-script';
import { costOf } from '../src/business/domain/cost';
import {
  scriptSettings,
  writeStoryScript,
} from '../src/business/handlers/studio/studio-script-writer';
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
    // A brief a maker gave, as they gave it: a city and a genre, no
    // narrator chosen, and no more; the film it made could not be followed.
    id: 'new-york-dark-comedy',
    brief: {
      format: 'story',
      idea: 'a comedy based in New York',
      audience: 'adults',
      minutes: 2,
      tone: 'funny',
      setting: 'New York',
      genre: 'dark-comedy',
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
  // As the worker is set, unless the bench says otherwise.
  const settings = scriptSettings((name) => process.env[name]);
  const rounds = Number(option('--rounds') ?? settings.rounds);
  const retell = args.includes('--retell') || settings.retell;
  const writers = Number(option('--writers') ?? settings.writers);
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
    /** Clarity at the first read and as kept. */
    clarityFirst: [] as number[],
    clarityKept: [] as number[],
    /** Films whose clarity sentence matches the premise (T1), as kept. */
    sentence: 0,
    /** Report and aim flags on the first script (W2–W4), and "and then" joins. */
    flags: [] as number[],
    andThen: [] as number[],
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
      let spent = 0;
      let calls = 0;
      const record = (usage: LlmUsage, task = 'studio_write') => {
        calls += 1;
        const dollars =
          costOf({
            task,
            model: usage.model,
            tokensIn: usage.tokensIn,
            tokensOut: usage.tokensOut,
            tokensCached: usage.tokensCached ?? null,
          }) ?? 0;
        totals.calls += 1;
        totals.tokensIn += usage.tokensIn;
        totals.tokensOut += usage.tokensOut;
        totals.dollars += dollars;
        spent += dollars;
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
          sendBacks: settings.storySendBacks,
        });
        const developedIn = Math.round((Date.now() - started) / 1000);
        const developedCalls = calls;
        const { story } = developed;
        say(`premise: "${story.premise.title}" — ${story.premise.logline}`);
        say(`theme: ${story.premise.theme} · hook: ${story.premise.hook}`);
        say(
          `hero ${story.premise.hero}; wants ${story.premise.want}; in the way: ${story.premise.obstacle}; clock: ${story.premise.clock || 'none'}${story.premise.oddity ? `; oddity: ${story.premise.oddity.what} (${story.premise.oddity.rule})` : ''}`,
        );
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
            `  check ${report.step}: ${report.fixed?.length ? `code put right: ${report.fixed.join('; ')}; ` : ''}${report.left ? `went back (${report.hard?.length ?? 0}): ${(report.hard ?? []).join(' ')} → after: ${report.left.length ? report.left.join(' ') : 'passed'}` : report.first.length ? `noted (${report.first.length}): ${report.first.join(' ')}` : 'passed first time'}`,
          );
        say(`developed in ${developedIn}s, ${developedCalls} calls`);
        const beatsLeft = checkBeats(
          story.beats,
          contextOf(developed.bible, story.premise),
          story.premise,
        );
        say(
          `final: ${developed.problems.length ? `${developed.problems.length} left: ${developed.problems.join(' ')}` : 'every check passes'}${beatsLeft.length ? '' : ' (structure, curve, setups ok)'}`,
        );
        say(`outline:\n${describeOutline(developed.outline, true)}`);
        let script: Record<string, unknown> = {};
        if (scenes) {
          // Every scene, a few at once, as the worker writes them.
          const writing = Date.now();
          const callsBefore = calls;
          const written = await writeStoryScript(llm, {
            brief,
            bible: developed.bible,
            outline: developed.outline,
            writers,
            record,
            log: (k, line) => say(`  s${k + 1}: ${line}`),
          });
          const grown: StudioBible = written.bible;
          const sheets: StorySheet[] = written.scenes.map((s) => s.sheet);
          written.scenes.forEach((scene, k) => {
            const left = scene.problems.filter((p) => p.level === 'error');
            if (left.length)
              say(`  s${k + 1} still: ${left.map((p) => p.message).join(' ')}`);
          });
          say(
            `scenes written in ${Math.round((Date.now() - writing) / 1000)}s, ${calls - callsBefore} calls, ${writers} at once`,
          );
          const reading = Date.now();
          const callsRead = calls;
          const result = await tableRead(llm, {
            brief,
            bible: grown,
            outline: developed.outline,
            sheets,
            rounds,
            retell,
            record: (usage, task) => record(usage, task),
            log: (line) => say(`  ${line}`),
          });
          say(
            `read in ${Math.round((Date.now() - reading) / 1000)}s, ${calls - callsRead} calls`,
          );
          const first = result.rounds[0].read;
          const kept = result.rounds[result.best].read;
          totals.read += 1;
          if (first.scores.clarity !== undefined)
            totals.clarityFirst.push(first.scores.clarity);
          if (kept.scores.clarity !== undefined)
            totals.clarityKept.push(kept.scores.clarity);
          if (kept.viewer && !kept.misses.length) totals.sentence += 1;
          totals.flags.push(
            result.rounds[0].code.filter(
              (n) => n.kind === 'telling' || n.kind === 'aim',
            ).length,
          );
          totals.andThen.push(
            result.rounds[result.best].retell?.scenes.filter(
              (x) => x.link === 'and then',
            ).length ?? 0,
          );
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
          if (kept.viewer)
            say(
              `cold read as kept: ${kept.viewer.sentence || kept.viewer.about}${kept.misses.length ? ` [misses: ${kept.misses.join('; ')}]` : ''}`,
            );
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
              scriptText(
                id,
                brief,
                developed,
                result.sheets,
                grown,
                kept,
                result.rounds[result.best].retell ?? null,
                spent,
              ),
            );
        }
        say(
          `(${Math.round((Date.now() - started) / 1000)}s, ${calls} calls, about $${spent.toFixed(3)})`,
        );
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
        `clarity: mean ${mean(totals.clarityFirst)} first, ${mean(totals.clarityKept)} kept (kept ${totals.clarityKept.join(' ')}); the viewer's sentence matches the premise in ${totals.sentence} of ${totals.read}; report and aim flags on the first script ${totals.flags.join(' ')}; "and then" joins as kept ${totals.andThen.join(' ')}.`,
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
  retell: Retell | null,
  spent: number,
): string {
  const { story } = developed;
  const p = story.premise;
  const first = story.plan.scenes[0];
  return [
    `${p.title}  (${id})`,
    `${brief.genre ?? 'genre left to us'}, ${brief.minutes} min, for ${brief.audience}${brief.setting ? `, ${brief.setting}` : ''}${brief.narrator ? `; narrator ${brief.narrator}` : '; narrator left to us'}`,
    '',
    `Logline: ${p.logline}`,
    `Theme: ${p.theme}`,
    `Hook: ${p.hook}`,
    `Hero: ${p.hero}. Wants: ${p.want}. In the way: ${p.obstacle}. Stakes: ${p.stakes}. Clock: ${p.clock || 'none'}.`,
    `An ordinary day: ${p.normalDay}. Why today: ${p.whyToday}. Why we care: ${p.whyCare}.`,
    p.oddity
      ? `The one impossible thing: ${p.oddity.what}. Its rule: ${p.oddity.rule}.`
      : 'Nothing impossible.',
    'Spine:',
    ...p.spine.map((line) => `  ${line}`),
    '',
    ...(first?.setup.length
      ? [
          'Scene 1 sets up:',
          ...first.setup.map(
            (x) =>
              `  ${x.part}: ${x.how}${x.how === 'line' ? ` (${x.by} to ${x.to})` : ''}: ${x.what}`,
          ),
          '',
        ]
      : []),
    `Scenes: ${story.plan.scenes.map((x, k) => `${k ? `${x.link ?? 'and then'} ` : ''}${x.title}${x.value ? ` [${x.value.name} ${x.value.from}→${x.value.to}]` : ''}`).join(' / ')}`,
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
    ...(read.viewer
      ? [
          '',
          'A first-time viewer, after scene 1:',
          `  ${read.viewer.sentence || read.viewer.about}`,
          ...(read.viewer.people.length
            ? [
                `  Who is who: ${read.viewer.people.map((x) => `${x.who}: ${x.is}`).join('; ')}`,
              ]
            : []),
          ...(read.viewer.impossible
            ? [`  Impossible: ${read.viewer.impossible}`]
            : []),
          ...(read.viewer.confused.length
            ? [`  Confused by: ${read.viewer.confused.join('; ')}`]
            : []),
          ...(read.misses.length || read.unsure.length
            ? [
                `  Against the premise: ${[...read.misses, ...read.unsure].join('; ')}`,
              ]
            : ['  Matches the premise.']),
        ]
      : []),
    ...(retell
      ? [
          '',
          'The whole film, retold by a first-time viewer:',
          ...retell.scenes.map(
            (x) =>
              `  ${x.scene + 1}. ${x.link ? `${x.link.toUpperCase()}: ` : ''}${x.what}`,
          ),
          `  Until finally: ${retell.finally}`,
        ]
      : []),
    '',
    `Cost: about $${spent.toFixed(3)}`,
    '',
  ].join('\n');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
