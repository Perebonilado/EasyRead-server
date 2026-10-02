/**
 * An editor's episode's lesson scenes boarded as shots with the real
 * model (explainer-animation-tech §4.4, scripts): each scene's registry,
 * the board's plan as checked and mended, what the board got wrong before
 * code mended it, and what it cost. Nothing is written unless asked:
 * with --save, each scene's sheet is the plan, as the worker's board
 * writes it under EXPLAINER_SHOTS (the episode's scenes must have been
 * boarded once, so their rows are there).
 *
 *   npx ts-node --transpile-only scripts/shots-board.ts --episode <id>
 *     [--scene <n>] [--save] [--out <dir>]
 *
 * --scene boards one scene, by its number from 1; --out writes each
 * scene's plan and registry as JSON beside the printout. GPT-5.4 mini, a
 * call or two a scene, about a cent each.
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
import {
  AI_CALL_LOG_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../src/business/repositories/tokens';
import type { StudioRepository } from '../src/business/repositories/studio.repository';
import type { AiCallLogRepository } from '../src/business/repositories/ai-call-log.repository';
import { costOf } from '../src/business/domain/cost';
import {
  isIllustrated,
  type StudioBible,
} from '../src/business/domain/studio/studio';
import { boardShots } from '../src/business/domain/shots/shot-board';
import { checkPlan } from '../src/business/domain/shots/shot-check';
import { sceneNarration } from '../src/business/domain/shots/shot-phrases';
import { promptList } from '../src/business/domain/shots/shot-registry';
import type { PlanSet, PlanShot } from '../src/business/domain/shots/types';
import { StudioEditorProcessor } from '../src/pipeline/processors/studio-editor.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
})
class ShotsBoardModule {}

const option = (name: string): string | undefined => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(name);

/** A set in a few words. */
function setWords(set: PlanSet): string {
  switch (set.kind) {
    case 'map':
      return `map (${set.tilt ?? 'flat'}${set.terrain ? ', terrain' : ''})`;
    case 'chart':
      return `${set.chart.kind} ${JSON.stringify(set.chart.spec)}`;
    case 'portrait':
      return `portrait of ${set.person}`;
    case 'photo':
      return `photo ${set.photo}`;
    case 'document':
      return `document ${set.document}`;
    case 'set':
      return `drawn set ${JSON.stringify(set.set)}`;
    case 'plain':
      return 'paper';
  }
}

/** A shot as an editor reads it. */
function shotWords(shot: PlanShot, k: number): string {
  return [
    `  ${k + 1}. on "${shot.on}" · ${setWords(shot.set)} · subject ${shot.focal ?? '-'} · ${shot.join}`,
    ...shot.info.map(
      (i) =>
        `     ${i.recipe}${i.target ? ` ${i.target}` : ''}${i.to ? ` → ${i.to}` : ''}${i.text ? ` "${i.text}"` : ''}${i.value !== undefined ? ` = ${i.value}${i.unit ? ` ${i.unit}` : ''}` : ''} on "${i.on}"${i.until ? ` until "${i.until}"` : ''}`,
    ),
    ...shot.camera.map(
      (c) =>
        `     camera ${c.move}${c.target ? ` ${c.target}` : ''}${c.amount ? ` (${c.amount})` : ''} on "${c.on}"`,
    ),
    shot.life.length ? `     life: ${shot.life.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function main() {
  const episodeId = option('--episode');
  if (!episodeId)
    throw new Error(
      'Say which episode: --episode <id> [--scene <n>] [--save] [--out <dir>]',
    );
  const only = option('--scene') ? Number(option('--scene')) - 1 : null;
  const save = flag('--save');
  const out = option('--out') ? resolve(option('--out')!) : null;
  const app = await NestFactory.createApplicationContext(ShotsBoardModule, {
    logger: ['warn', 'error'],
  });
  try {
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    const episode = await studio.findEpisode(episodeId);
    const show = episode ? await studio.findShow(episode.showId) : null;
    const outline = episode?.outline;
    if (!episode || !show || !outline?.editor || !episode.editorial)
      throw new Error(`No editor's episode ${episodeId} with a script`);
    const research = show.editor?.research ?? null;
    const world = show.editor?.world ?? null;
    console.log(
      `"${outline.title}" (${show.title}): ${outline.scenes.length} scenes${save ? ', saved' : ', printed only'}\n`,
    );
    let dollars = 0;
    for (const [k, scene] of outline.scenes.entries()) {
      if (only !== null && k !== only) continue;
      if (isIllustrated(scene)) {
        console.log(`Scene ${k + 1}: illustrated, not boarded as shots\n`);
        continue;
      }
      const rows = scene.rows
        ? episode.editorial.rows.slice(scene.rows[0], scene.rows[1] + 1)
        : [];
      const started = Date.now();
      const board = await boardShots(
        {
          rows,
          research,
          world,
          scene: {
            index: k,
            of: outline.scenes.length,
            title: scene.title,
            seconds: scene.seconds,
            episode: outline.title,
          },
          audience: show.brief.audience,
        },
        llm,
      );
      const cost = board.usage.reduce(
        (n, u) =>
          n +
          (costOf({
            task: 'explainer_shots',
            model: u.model,
            tokensIn: u.tokensIn,
            tokensOut: u.tokensOut,
            tokensCached: u.tokensCached ?? null,
          }) ?? 0),
        0,
      );
      dollars += cost;
      const left = checkPlan(board.plan, sceneNarration(rows), board.registry, {
        map: Boolean(world?.base),
      });
      console.log(
        [
          `Scene ${k + 1}: ${scene.title} (${scene.seconds} s, ${rows.length} lines)`,
          ...rows.map((r, i) => `  line ${i + 1} [${r.visual}] ${r.say}`),
          '',
          'Registry:',
          promptList(board.registry)
            .split('\n')
            .map((l) => `  ${l}`)
            .join('\n'),
          '',
          `Plan (${board.plan.shots.length} shots${board.sentBack ? ', sent back once' : ''}):`,
          ...board.plan.shots.map(shotWords),
          '',
          board.sentBack
            ? `Its first answer was sent back for:\n${board.firstProblems.map((p) => `  - ${p.message}`).join('\n')}`
            : '',
          board.problems.length
            ? `The board's answer had, before code mended it:\n${board.problems.map((p) => `  - ${p.message}`).join('\n')}`
            : "The board's answer had nothing to mend.",
          left.length
            ? `Still wrong after mending: ${left.map((p) => p.message).join(' | ')}`
            : 'After mending: every check passes.',
          `${board.usage.length} call${board.usage.length === 1 ? '' : 's'}, $${cost.toFixed(4)}, ${Math.round((Date.now() - started) / 1000)} s`,
          '',
        ].join('\n'),
      );
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(
          join(out, `scene-${k + 1}.json`),
          `${JSON.stringify(
            {
              scene: scene.title,
              lines: rows.map((r) => r.say),
              plan: board.plan,
              problems: board.problems,
              registry: board.registry.entries(),
            },
            null,
            2,
          )}\n`,
        );
      }
      if (save) {
        const row = (await studio.listScenes(episode.id)).find(
          (r) => r.position === k,
        );
        if (!row) {
          console.log(
            `  (not saved: scene ${k + 1} has no row; board the episode once first)`,
          );
          continue;
        }
        // Saved as the worker's board saves it, the plan just made given
        // back as the board's answer: the same sheet, its calls in the ledger.
        const ledger = app.get<AiCallLogRepository>(AI_CALL_LOG_REPOSITORY);
        const editor = new StudioEditorProcessor({
          studio,
          llm: {
            shotsBoard: () =>
              Promise.resolve({
                value: { shots: board.plan.shots },
                usage: board.usage[0],
              }),
          } as unknown as LlmGatewayPort,
          calls: ledger,
          queue: { enqueueStudio: () => Promise.resolve() },
          setting: (name) => process.env[name],
          material: null,
          logger: {
            log: (l) => console.log(`  · ${l}`),
            warn: (l) => console.log(`  ! ${l}`),
          },
        });
        const bible: StudioBible = show.bible ?? {
          characters: [],
          sets: [],
          world: null,
          subject: show.editor?.question ?? show.brief.idea,
          maths: false,
          pictures: [],
        };
        await editor.shotsBoard(show, episode, bible, row, k);
        for (const usage of board.usage.slice(1))
          await editor.record(episode.id, usage, 'explainer_shots');
        console.log(`  saved onto scene row ${row.id}\n`);
      }
    }
    console.log(`Total: $${dollars.toFixed(4)}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
