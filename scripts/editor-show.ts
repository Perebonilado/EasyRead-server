/**
 * The editor's desk, run end to end in-process (infographic-editor-plan
 * §3, §5 phase 0): a show made for a user, its angles found and the best
 * taken, researched with the web, planned, its world drawn up, and its
 * first episode written as a two-column script, cut into scenes and
 * packaged. No queue: each job the desk sets going is run here, in turn.
 * Every artifact is written to the folder named: the show's editor and the
 * episode's editorial as JSON, and the plan, the research and the script
 * as Markdown to read.
 *
 *   npm run editor:show -- --topic "Why do we have leap years" --audience adults --out <dir>
 *     [--tone calm] [--user <uuid>] [--searches <n>] [--boards]
 *   npm run editor:show -- --bench --out <dir> [--only <id>] [--searches <n>] [--lanes <n>]
 *   npm run editor:show -- --board <episodeId> --out <dir>
 *
 * With --boards, the episode's scenes are boarded too (no film is made);
 * --board boards an episode written before, and writes what each scene's
 * board came to (boards.md, boards.json).
 * With --bench, the editorial chain runs over eight topics of every kind
 * (a history story, how something works, numbers, geography, a science
 * process, a news explainer, a biography, a myth against the facts), and
 * a rubric from code's own checks is written beside them: the hook's
 * rules, but/therefore, factual rows resting on sourced claims, seconds
 * between pictures, words on screen, each episode's minutes, how many.
 *
 * Real models (GPT-5.4 mini, OpenAI's web search): about a dollar or two
 * a show. --searches caps the research's and the fact check's searches.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import { LLM_GATEWAY } from '../src/business/ports/tokens';
import type { StudioJobData } from '../src/pipeline/queues';
import {
  AI_CALL_LOG_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../src/business/repositories/tokens';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioShowRecord,
} from '../src/business/repositories/studio.repository';
import type {
  AiCallLogInput,
  AiCallLogRepository,
} from '../src/business/repositories/ai-call-log.repository';
import { costOf } from '../src/business/domain/cost';
import {
  briefOf,
  type StudioAudience,
  type StudioTone,
} from '../src/business/domain/studio/studio';
import {
  EMPTY_EDITOR,
  ERA_WORDS,
  type StudioEditor,
} from '../src/business/domain/studio/studio-editor';
import type { StudioEditorial } from '../src/business/domain/studio/studio-editorial';
import {
  hookProblems,
  isFactual,
  promiseReturns,
  rowSeconds,
  screenWords,
  withAngle,
} from '../src/business/domain/studio/studio-editor-checks';
import { describeClaim } from '../src/business/domain/studio/studio-editor-words';
import {
  StudioEditorProcessor,
  editorPace,
} from '../src/pipeline/processors/studio-editor.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
})
class EditorShowModule {}

/** The bench's topics: every kind of explainer, from around the world, no one region the default. */
const BENCH: {
  id: string;
  kind: string;
  topic: string;
  audience: StudioAudience;
  tone: StudioTone;
}[] = [
  {
    id: 'silk-road',
    kind: 'a history story',
    topic:
      'How the Silk Road carried ideas, not just silk, between Asia, Africa and Europe',
    audience: 'adults',
    tone: 'exciting',
  },
  {
    id: 'vaccines',
    kind: 'how it works',
    topic: 'How a vaccine teaches the body to fight a virus it has never met',
    audience: 'teens',
    tone: 'calm',
  },
  {
    id: 'inflation',
    kind: 'numbers and economics',
    topic: 'Why prices rise: what inflation is and who it hurts most',
    audience: 'adults',
    tone: 'serious',
  },
  {
    id: 'rivers',
    kind: 'geography',
    topic: 'Why most of the world’s great cities grew up on rivers',
    audience: 'adults',
    tone: 'calm',
  },
  {
    id: 'volcano-land',
    kind: 'a science process',
    topic: 'How volcanoes build new land, from Iceland to Hawaii',
    audience: 'children',
    tone: 'exciting',
  },
  {
    id: 'coral-bleaching',
    kind: 'a news explainer',
    topic: 'Why the world’s coral reefs are bleaching, and what is being done',
    audience: 'adults',
    tone: 'serious',
  },
  {
    id: 'ibn-battuta',
    kind: 'a biography',
    topic:
      'Ibn Battuta, the traveller who crossed three continents in the 1300s',
    audience: 'teens',
    tone: 'exciting',
  },
  {
    id: 'brain-ten-percent',
    kind: 'a myth against the facts',
    topic: 'Do we really use only ten percent of our brains?',
    audience: 'adults',
    tone: 'funny',
  },
];

/** A user the bench's shows belong to when none is given: no one's. */
const BENCH_USER = '00000000-0000-4000-8000-0000000ed170';

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(name);

/** One show made, start to finish, in-process: what it came to. */
interface Made {
  show: StudioShowRecord;
  episode: StudioEpisodeRecord;
  editor: StudioEditor;
  editorial: StudioEditorial;
  dollars: number;
  calls: number;
  seconds: number;
}

async function makeShow(
  deps: {
    studio: StudioRepository;
    llm: LlmGatewayPort;
    ledger: AiCallLogRepository;
  },
  input: {
    topic: string;
    audience: StudioAudience;
    tone: StudioTone;
    userId: string;
    out: string;
    boards: boolean;
    say: (line: string) => void;
  },
): Promise<Made> {
  const started = Date.now();
  const spent: AiCallLogInput[] = [];
  const queued: StudioJobData[] = [];
  const editor = new StudioEditorProcessor({
    studio: deps.studio,
    llm: deps.llm,
    calls: {
      record: async (call) => {
        spent.push(call);
        await deps.ledger.record(call);
      },
    },
    queue: {
      enqueueStudio: (jobs) => {
        queued.push(...(jobs as StudioJobData[]));
        return Promise.resolve();
      },
    },
    setting: (name) => process.env[name],
    material: null,
    logger: {
      log: (line) => input.say(`  · ${line}`),
      warn: (line) => input.say(`  ! ${line}`),
    },
  });
  const brief = briefOf({
    format: 'explainer',
    idea: input.topic,
    audience: input.audience,
    tone: input.tone,
  });
  const created = await deps.studio.createShow({
    userId: input.userId,
    title: 'New show',
    brief,
    editor: EMPTY_EDITOR,
  });
  const first = await deps.studio.createEpisode({
    showId: created.id,
    userId: input.userId,
    number: 1,
    title: 'Episode 1',
    phase: 'brief',
  });
  const fresh = async () => ({
    show: (await deps.studio.findShow(created.id))!,
    episode: async (id: string) => (await deps.studio.findEpisode(id))!,
  });
  input.say(`show ${created.id}, episode ${first.id}: "${input.topic}"`);
  // The angles, the best taken, as the maker leaving it to the Studio would.
  await editor.run(
    { kind: 'angles' },
    (await fresh()).show,
    first,
    'cli:angles',
  );
  const offered = (await fresh()).show.editor!;
  const picked = withAngle(offered, null)!;
  await deps.studio.updateShow(created.id, { editor: picked });
  input.say(`  question: ${picked.question}`);
  queued.push({
    kind: 'research',
    showId: created.id,
    episodeId: first.id,
    userId: input.userId,
  });
  // Each job the desk sets going, in turn: research, plan, world, edit.
  while (queued.length) {
    const job = queued.shift()!;
    const now = await fresh();
    const t = Date.now();
    await editor.run(
      job,
      now.show,
      await now.episode(job.episodeId),
      `cli:${job.kind}`,
    );
    input.say(`  ${job.kind} done in ${Math.round((Date.now() - t) / 1000)}s`);
  }
  if (input.boards) {
    const now = await fresh();
    const count = await editor.boards(now.show, await now.episode(first.id));
    input.say(`  ${count} scenes boarded`);
  }
  const show = (await deps.studio.findShow(created.id))!;
  const episode = (await deps.studio.findEpisode(first.id))!;
  const dollars = spent.reduce(
    (n, call) =>
      n +
      (call.costUsd ??
        costOf({
          task: call.task,
          model: call.model,
          tokensIn: call.tokensIn,
          tokensOut: call.tokensOut,
          tokensCached: call.tokensCached ?? null,
        }) ??
        0),
    0,
  );
  const made: Made = {
    show,
    episode,
    editor: show.editor!,
    editorial: episode.editorial!,
    dollars,
    calls: spent.filter((c) => c.tokensIn !== null).length,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  writeArtifacts(input.out, made, spent);
  return made;
}

/** The show's and the episode's working files, as JSON and as Markdown to read. */
function writeArtifacts(out: string, made: Made, spent: AiCallLogInput[]) {
  mkdirSync(out, { recursive: true });
  const json = (name: string, value: unknown) =>
    writeFileSync(join(out, name), `${JSON.stringify(value, null, 2)}\n`);
  json('editor.json', made.editor);
  json('editorial.json', made.editorial);
  json('outline.json', made.episode.outline);
  json('bible.json', made.show.bible);
  json('ledger.json', spent);
  writeFileSync(join(out, 'plan.md'), planWords(made));
  writeFileSync(join(out, 'research.md'), researchWords(made.editor));
  writeFileSync(join(out, 'script.md'), scriptWords(made));
  writeFileSync(join(out, 'rubric.md'), rubricWords([rubricOf(made)]));
}

const cell = (said: string) => said.replace(/\|/gu, '\\|').replace(/\n/gu, ' ');

function planWords({ editor }: Made): string {
  const plan = editor.plan;
  const world = editor.world;
  return [
    `# ${editor.question ?? 'The show'}`,
    editor.pitch ? `> ${editor.pitch}` : '',
    editor.takeaway ? `**Takeaway:** ${editor.takeaway}` : '',
    editor.notThis.length ? `**Not about:** ${editor.notThis.join('; ')}` : '',
    '## The angles offered',
    ...editor.angles.map(
      (a, k) =>
        `${k + 1}. **${a.question}** (${a.total}/20: gap ${a.scores.gap}, tension ${a.scores.tension}, visual ${a.scores.visual}, payoff ${a.scores.payoff}) ${a.pitch} _${a.verdict}_`,
    ),
    plan ? '## The story in six sentences' : '',
    ...(plan?.spine.map((s, k) => `${k + 1}. ${s}`) ?? []),
    plan?.chain.length ? '## The chain' : '',
    ...(plan?.chain.map(
      (c) => `- ${c.link ? `**${c.link}** ` : ''}${c.beat}`,
    ) ?? []),
    plan ? '## The episodes' : '',
    ...(plan?.episodes.map(
      (e) =>
        `${e.number}. **${e.title}**: ${e.question} (${e.minutes} min)${e.endsOn ? ` Ends on: ${e.endsOn}` : ''}${e.plants.length ? ` Plants: ${e.plants.map((p) => `${p.id} "${p.text}" → ep ${p.paidIn}`).join('; ')}` : ''}`,
    ) ?? []),
    plan?.cast.length ? '## The cast' : '',
    ...(plan?.cast.map(
      (c) =>
        `- ${c.name}${c.force ? `: ${c.force}` : ''}${c.recurring ? '' : ' (once)'}`,
    ) ?? []),
    plan?.fairness.length ? '## Fairness' : '',
    ...(plan?.fairness.map((f) => `- ${f}`) ?? []),
    plan ? '## What was kept, compressed and cut' : '',
    ...(plan?.items.map(
      (i) =>
        `- [${i.decision}${i.episode ? `, ep ${i.episode}` : ''}, ${[i.moves && 'moves', i.setsUp && 'sets up', i.visual && 'visual', i.surprise && 'surprise'].filter(Boolean).join('/') || 'no yeses'}] ${i.item}${i.reason ? ` — ${i.reason}` : ''}`,
    ) ?? []),
    plan?.leftOut.length ? '## Left out' : '',
    ...(plan?.leftOut.map((l) => `- ${l}`) ?? []),
    world ? '## The world' : '',
    world
      ? [
          `Era: ${ERA_WORDS[world.era]}${world.region ? `; ${world.region}` : ''}`,
          `Palette: ${world.palette.map((p) => `${p.thing} = ${p.token}`).join('; ')}${world.held ? `; held: ${world.held.token} (${world.held.for})` : ''}`,
          `Base: ${world.base}`,
          `Places: ${world.places.map((p) => `${p.name} (${p.kind}, ${p.time}): ${p.look}`).join(' | ')}`,
          `People: ${world.people.map((p) => `${p.name}, ${p.role}: ${p.likeness}`).join(' | ')}`,
        ].join('\n\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function researchWords(editor: StudioEditor): string {
  const research = editor.research;
  if (!research) return '# No research\n';
  return [
    `# Research: ${research.claims.length} claims, ${research.searched} searches`,
    '## Claims',
    ...research.claims.map(
      (c) =>
        `- ${describeClaim(c)}\n${c.sources.map((s) => `  - [${cell(s.title || s.url)}](${s.url})`).join('\n')}`,
    ),
    research.timeline.length ? '## Timeline' : '',
    ...research.timeline.map((e) => `- ${e.date}: ${e.event}`),
    research.numbers.length ? '## Numbers' : '',
    ...research.numbers.map(
      (n) =>
        `- ${n.label}: ${n.value} (${n.checked ? 'two sources' : 'one source'})`,
    ),
    research.myths.length ? '## Myths' : '',
    ...research.myths.map((m) => `- **${m.belief}** → ${m.truth}`),
    research.perspectives.length ? '## Perspectives' : '',
    ...research.perspectives.map((p) => `- ${p.side}: ${p.view}`),
    research.looks.length ? '## Look notes' : '',
    ...research.looks.map(
      (l) => `- ${l.subject} (${l.kind}): ${l.description}`,
    ),
    research.pronunciations.length ? '## Say' : '',
    ...research.pronunciations.map((p) => `- ${p.word}: ${p.say}`),
  ]
    .filter(Boolean)
    .join('\n');
}

function scriptWords({ editorial, episode, editor, show }: Made): string {
  const wpm = editorPace(show.brief).wpm;
  const seconds = editorial.rows.reduce((n, r) => n + rowSeconds(r, wpm), 0);
  const outline = episode.outline;
  return [
    `# Episode ${editorial.number}: ${outline?.title ?? episode.title}`,
    `**Question:** ${editorial.question}`,
    `**About ${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}**, ${editorial.rows.length} lines, ${outline?.scenes.length ?? 0} scenes (${outline?.scenes.filter((s) => s.kind === 'illustrated').length ?? 0} illustrated)`,
    editorial.hook ? `**Hook:** ${editorial.hook}` : '',
    '## Acts',
    ...(editorial.beats?.acts.map(
      (a, k) =>
        `${k + 1}. **${a.title}** (${a.seconds}s, ${a.words} words${a.grave ? ', grave' : ''}): ${a.job}${a.rehook ? ` _Re-hook: ${a.rehook}_` : ''}`,
    ) ?? []),
    '## The script',
    '| # | Act | Say | Show | Visual | Claims |',
    '|---|---|---|---|---|---|',
    ...editorial.rows.map(
      (r, k) =>
        `| ${k + 1} | ${r.act} | ${cell(r.say)} | ${cell(r.show)} | ${r.visual} | ${r.claims.join(' ')} |`,
    ),
    editorial.notes.length ? '## The editor’s read' : '',
    ...editorial.notes.map((n) => `- ${n}`),
    editorial.facts ? '## The fact check' : '',
    ...(editorial.facts?.map(
      (f) =>
        `- ${f.claim}: **${f.verdict}** ${f.note}${f.rewrites.length ? ` (${f.rewrites.length} row${f.rewrites.length === 1 ? '' : 's'} said again)` : ''}`,
    ) ?? []),
    editorial.package ? '## The package' : '',
    editorial.package
      ? [
          `**Title:** ${editorial.package.title}`,
          `Titles: ${editorial.package.titles.map((t) => `${t.text} (${t.verdict})`).join(' | ')}`,
          `**Thumbnail:** ${editorial.package.thumbnail.words} (row ${(editorial.package.thumbnail.row ?? -1) + 1})`,
          `**Description:**\n\n${editorial.package.description}`,
          `**Pinned:** ${editorial.package.pinned}`,
          `**Hashtags:** ${editorial.package.hashtags.join(' ')}`,
        ].join('\n\n')
      : '',
    outline ? '## The scenes' : '',
    ...(outline?.scenes.map(
      (s, k) =>
        `${k + 1}. ${s.kind === 'illustrated' ? '🎬 ' : ''}**${s.title}** (${s.seconds}s, rows ${(s.rows?.[0] ?? 0) + 1}–${(s.rows?.[1] ?? 0) + 1})${s.set ? ` in ${s.set}` : ''}${s.cast.length ? ` with ${s.cast.join(', ')}` : ''}`,
    ) ?? []),
    `\n_Planned by the editor: ${editor.plan?.episodes.length ?? 0} episodes._`,
  ]
    .filter(Boolean)
    .join('\n\n')
    .replace(/🎬 /gu, '[scene] ');
}

/** Code's own measures of one show's first episode, for the bench. */
interface Rubric {
  id: string;
  question: string;
  hookRules: boolean;
  promiseKept: boolean;
  chain: { but: number; therefore: number; andThen: number };
  andThenRows: number;
  factual: number;
  sourced: number;
  secondsPerPicture: { mean: number; most: number };
  stillRows: number;
  screenWords: { most: number; over: number };
  episodeMinutes: number;
  planMinutes: number[];
  episodes: number;
  rows: number;
  scenes: number;
  illustrated: number;
  claims: number;
  searched: number;
  dollars: number;
  seconds: number;
}

function rubricOf(made: Made, id = 'show'): Rubric {
  const { editor, editorial, episode } = made;
  const wpm = editorPace(made.show.brief).wpm;
  const rows = editorial.rows;
  const research = editor.research;
  const factual = rows.filter((r) => isFactual(r.say));
  const sourced = factual.filter((r) =>
    r.claims.some((id) =>
      research?.claims.some((c) => c.id === id && c.sources.length),
    ),
  );
  const seconds = rows.map((r) => rowSeconds(r, wpm));
  const words = rows.map((r) => screenWords(r.show));
  const chain = editor.plan?.chain ?? [];
  return {
    id,
    question: editorial.question,
    hookRules:
      hookProblems(editorial.hook ?? '', editorial.hookClaims ?? [], research)
        .length === 0,
    promiseKept: promiseReturns(editorial.question, rows),
    chain: {
      but: chain.filter((c) => c.link === 'but').length,
      therefore: chain.filter((c) => c.link === 'therefore').length,
      andThen: chain.filter((c) => c.link === 'and then').length,
    },
    andThenRows: rows.filter((r) => /^and then\b/iu.test(r.say)).length,
    factual: factual.length,
    sourced: sourced.length,
    secondsPerPicture: {
      mean:
        Math.round(
          (seconds.reduce((n, s) => n + s, 0) / Math.max(1, rows.length)) * 10,
        ) / 10,
      most: Math.round(Math.max(0, ...seconds) * 10) / 10,
    },
    stillRows: rows.filter((r, k) => !r.hold && seconds[k] > 6).length,
    screenWords: {
      most: Math.max(0, ...words),
      over: words.filter((w) => w > 8).length,
    },
    episodeMinutes:
      Math.round((seconds.reduce((n, s) => n + s, 0) / 60) * 10) / 10,
    planMinutes: editor.plan?.episodes.map((e) => e.minutes) ?? [],
    episodes: editor.plan?.episodes.length ?? 0,
    rows: rows.length,
    scenes: episode.outline?.scenes.length ?? 0,
    illustrated:
      episode.outline?.scenes.filter((s) => s.kind === 'illustrated').length ??
      0,
    claims: research?.claims.length ?? 0,
    searched: research?.searched ?? 0,
    dollars: Math.round(made.dollars * 100) / 100,
    seconds: made.seconds,
  };
}

function rubricWords(rubrics: Rubric[]): string {
  const pct = (a: number, b: number) =>
    b ? `${Math.round((a / b) * 100)}%` : '–';
  return [
    '# The editor’s bench: code’s rubric',
    'Each row is a show’s first episode, written by the editor’s desk and checked by code (no film made). Seconds a picture: each row is one sentence, one new thing seen; the playbook asks for three to five. Still rows: past six seconds without a hold.',
    '| Show | Hook rules | Promise kept | Chain but/therefore/and then | "And then" rows | Factual rows sourced | Seconds a picture (mean, most) | Still rows | Words on screen (most, rows over 8) | Episode min | Plan min | Episodes | Rows | Scenes (illustrated) | Claims | Searches | $ | Time |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rubrics.map(
      (r) =>
        `| ${r.id} | ${r.hookRules ? 'pass' : 'FAIL'} | ${r.promiseKept ? 'yes' : 'no'} | ${r.chain.but}/${r.chain.therefore}/${r.chain.andThen} | ${r.andThenRows} | ${r.sourced}/${r.factual} (${pct(r.sourced, r.factual)}) | ${r.secondsPerPicture.mean}, ${r.secondsPerPicture.most} | ${r.stillRows} | ${r.screenWords.most}, ${r.screenWords.over} | ${r.episodeMinutes} | ${r.planMinutes.join(', ')} | ${r.episodes} | ${r.rows} | ${r.scenes} (${r.illustrated}) | ${r.claims} | ${r.searched} | ${r.dollars.toFixed(2)} | ${Math.round(r.seconds / 60)}m |`,
    ),
    '',
    rubrics.length > 1
      ? `Totals: ${rubrics.length} shows, $${rubrics.reduce((n, r) => n + r.dollars, 0).toFixed(2)}, hook rules ${rubrics.filter((r) => r.hookRules).length}/${rubrics.length}, factual rows sourced ${pct(
          rubrics.reduce((n, r) => n + r.sourced, 0),
          rubrics.reduce((n, r) => n + r.factual, 0),
        )}, mean seconds a picture ${(rubrics.reduce((n, r) => n + r.secondsPerPicture.mean, 0) / rubrics.length).toFixed(1)}.`
      : '',
  ].join('\n');
}

/** An episode written before, its scenes boarded with the real model, and what each came to written down. */
async function boardEpisode(
  deps: {
    studio: StudioRepository;
    llm: LlmGatewayPort;
    ledger: AiCallLogRepository;
  },
  episodeId: string,
  out: string,
): Promise<void> {
  const episode = await deps.studio.findEpisode(episodeId);
  const show = episode ? await deps.studio.findShow(episode.showId) : null;
  if (!episode || !show) throw new Error(`No episode ${episodeId}`);
  const spent: AiCallLogInput[] = [];
  const editor = new StudioEditorProcessor({
    studio: deps.studio,
    llm: deps.llm,
    calls: {
      record: async (call) => {
        spent.push(call);
        await deps.ledger.record(call);
      },
    },
    queue: { enqueueStudio: () => Promise.resolve() },
    setting: (name) => process.env[name],
    material: null,
    logger: {
      log: (l) => console.log(`  · ${l}`),
      warn: (l) => console.log(`  ! ${l}`),
    },
  });
  const started = Date.now();
  const count = await editor.boards(show, episode);
  const rows = await deps.studio.listScenes(episode.id);
  const outline = episode.outline;
  const lines: string[] = [
    `# Boards of "${outline?.title ?? episode.title}": ${count} scenes`,
  ];
  for (const row of rows) {
    const scene = outline?.scenes[row.position];
    const sheet = row.sheet;
    lines.push(
      `## ${row.position + 1}. ${scene?.kind === 'illustrated' ? '[scene] ' : ''}${scene?.title ?? ''}`,
    );
    if (sheet?.kind === 'story')
      lines.push(
        `Set ${sheet.set}, ${sheet.time}, crowd ${sheet.crowd}; on stage: ${sheet.onStage.map((p) => `${p.who} (${p.spot})`).join(', ') || 'no one'}`,
        ...sheet.beats.map(
          (b) =>
            `- ${b.kind}${b.who ? ` ${b.who}` : ''}${b.do ? ` ${b.do}` : ''}: ${b.say}`,
        ),
        sheet.camera.length
          ? `Camera: ${sheet.camera.map((c) => `${c.shot}@${c.beat}${c.on ? ` on ${c.on}` : ''}`).join(', ')}`
          : '',
      );
    else if (sheet?.kind === 'explainer')
      lines.push(
        `Cast: ${sheet.draft.cast.map((t) => `${t.id} (${t.kind}${(t as { colour?: string }).colour ? `, ${(t as { colour?: string }).colour}` : ''})`).join(', ')}`,
        ...sheet.draft.beats.map(
          (b, k) =>
            `${k + 1}. ${b.say}  →  ${sheet.draft.steps
              .filter((st) => st.beat === k)
              .map(
                (st) =>
                  `[${[...(st.show ?? [])].join(' ')}${st.effects?.length ? ` ${st.effects.map((e) => `${e.do}:${e.target}`).join(' ')}` : ''}]`,
              )
              .join(' ')}`,
        ),
      );
    if (row.problems.length)
      lines.push(
        `Problems left: ${row.problems.map((p) => `${p.level} ${p.rule}: ${p.message}`).join(' | ')}`,
      );
  }
  const dollars = spent.reduce(
    (n, call) =>
      n +
      (call.costUsd ??
        costOf({
          task: call.task,
          model: call.model,
          tokensIn: call.tokensIn,
          tokensOut: call.tokensOut,
          tokensCached: call.tokensCached ?? null,
        }) ??
        0),
    0,
  );
  lines.push(
    `\n_${spent.length} calls, $${dollars.toFixed(2)}, ${Math.round((Date.now() - started) / 1000)}s._`,
  );
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'boards.md'),
    `${lines.filter(Boolean).join('\n\n')}\n`,
  );
  writeFileSync(
    join(out, 'boards.json'),
    `${JSON.stringify(
      rows.map((r) => ({
        position: r.position,
        sheet: r.sheet,
        problems: r.problems,
      })),
      null,
      2,
    )}\n`,
  );
  console.log(
    `${count} scenes boarded, $${dollars.toFixed(2)}: ${join(out, 'boards.md')}`,
  );
}

async function main() {
  const out = resolve(option('--out') ?? 'editor-show');
  const bench = flag('--bench');
  const searches = option('--searches');
  if (searches) {
    process.env.EXPLAINER_RESEARCH_SEARCHES = searches;
    process.env.EXPLAINER_FACTS_SEARCHES = searches;
  }
  const userId = option('--user') ?? process.env.EDITOR_USER_ID ?? BENCH_USER;
  const app = await NestFactory.createApplicationContext(EditorShowModule, {
    logger: ['warn', 'error'],
  });
  try {
    const deps = {
      studio: app.get<StudioRepository>(STUDIO_REPOSITORY),
      llm: app.get<LlmGatewayPort>(LLM_GATEWAY),
      ledger: app.get<AiCallLogRepository>(AI_CALL_LOG_REPOSITORY),
    };
    const boardOnly = option('--board');
    if (boardOnly) {
      await boardEpisode(deps, boardOnly, out);
      return;
    }
    if (!bench) {
      const topic = option('--topic');
      if (!topic) throw new Error('Say what the show is about: --topic "…"');
      const made = await makeShow(deps, {
        topic,
        audience: (option('--audience') as StudioAudience) ?? 'adults',
        tone: (option('--tone') as StudioTone) ?? 'calm',
        userId,
        out,
        boards: flag('--boards'),
        say: (line) => console.log(line),
      });
      console.log(rubricWords([rubricOf(made, 'show')]));
      console.log(`\nWritten to ${out}`);
      return;
    }
    const only = option('--only');
    const lanes = Math.max(1, Number(option('--lanes') ?? 2));
    const chosen = BENCH.filter((b) => !only || b.id === only);
    const rubrics: Rubric[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(lanes, chosen.length) }, async () => {
        while (next < chosen.length) {
          const one = chosen[next++];
          const log: string[] = [];
          try {
            const made = await makeShow(deps, {
              topic: one.topic,
              audience: one.audience,
              tone: one.tone,
              userId,
              out: join(out, one.id),
              boards: false,
              say: (line) => log.push(line),
            });
            rubrics.push(rubricOf(made, `${one.id} (${one.kind})`));
            console.log(
              `${one.id}: done, $${made.dollars.toFixed(2)}, ${made.seconds}s`,
            );
          } catch (error) {
            console.log(`${one.id}: failed: ${(error as Error).message}`);
          } finally {
            mkdirSync(join(out, one.id), { recursive: true });
            writeFileSync(join(out, one.id, 'log.txt'), `${log.join('\n')}\n`);
          }
        }
      }),
    );
    rubrics.sort(
      (a, b) =>
        chosen.findIndex((c) => a.id.startsWith(c.id)) -
        chosen.findIndex((c) => b.id.startsWith(c.id)),
    );
    const report = rubricWords(rubrics);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'report.md'), `${report}\n`);
    writeFileSync(
      join(out, 'report.json'),
      `${JSON.stringify(rubrics, null, 2)}\n`,
    );
    console.log(report);
    console.log(`\nWritten to ${join(out, 'report.md')}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
