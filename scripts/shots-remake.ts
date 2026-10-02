/**
 * An editor's episode made again with the shots engine, beside the one it
 * was (explainer-animation-tech.md §8), so the same story can be watched
 * both ways: copied under its own show as "<title> · shots" (the same
 * outline and editorial, new scene rows), its lesson scenes boarded by the
 * real board with EXPLAINER_SHOTS on, and every scene made in this process,
 * as a worker makes it, with the Kokoro voice unless --voice says another.
 * The original is never touched.
 *
 *   npm run shots:remake -- --episode <id> --user <id> --copy [--scenes 1,2] [--voice kokoro]
 *
 * --user must be the episode's owner: a made film's seconds are counted to
 * them. --scenes boards and makes only those scenes (1-based); the others
 * are left without a sheet. Nothing goes to a queue a worker reads: the
 * makes run here, and the job queue this process holds is pointed at Redis
 * db 6 unless REDIS_URL names another db that is not 0. The files go where
 * STORAGE_ROOT says, as for any make: run it from the API's own tree, or
 * give STORAGE_ROOT, so the API serves what it makes. Afterwards:
 *
 *   npm run frames -- --episode <new id> --user <id>
 */
import 'reflect-metadata';

// Before anything reads them: the board writes shots, the voice is Kokoro
// unless asked otherwise, and no job can reach a worker's queue.
process.env.EXPLAINER_SHOTS = 'on';
const voiceAt = process.argv.indexOf('--voice');
process.env.SCENE_VOICE_FORCE =
  voiceAt >= 0 ? process.argv[voiceAt + 1] : 'kokoro';
const redisDb = /\/(\d+)$/.exec(process.env.REDIS_URL ?? '')?.[1];
if (!redisDb || redisDb === '0')
  process.env.REDIS_URL = 'redis://localhost:6380/6';

import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import { LLM_GATEWAY } from '../src/business/ports/tokens';
import type { AiCallLogRepository } from '../src/business/repositories/ai-call-log.repository';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../src/business/repositories/studio.repository';
import {
  AI_CALL_LOG_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../src/business/repositories/tokens';
import { isIllustrated } from '../src/business/domain/studio/studio';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import { StudioEditorProcessor } from '../src/pipeline/processors/studio-editor.processor';
import { StudioMaterialService } from '../src/pipeline/processors/studio-material';
import { StudioProcessor } from '../src/pipeline/processors/studio.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor, StudioProcessor, StudioMaterialService],
})
class ShotsRemakeModule {}

/** A flag's value: `--episode <id>`. */
function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

/** What the CLI will not do as asked, said as a sentence, not a stack. */
class Refused extends Error {}

/** The scenes asked for, 0-based; all of them when none are named. */
function scenesAsked(count: number): number[] {
  const said = option('--scenes');
  if (!said) return Array.from({ length: count }, (_, k) => k);
  const asked = said
    .split(',')
    .map((n) => Number(n.trim()) - 1)
    .filter((k) => Number.isInteger(k) && k >= 0 && k < count);
  if (!asked.length)
    throw new Refused(`--scenes ${said} names no scene of the ${count}`);
  return [...new Set(asked)].sort((a, b) => a - b);
}

/** The episode copied under its show, titled "<title> · shots", with no scenes yet. */
async function copyOf(
  studio: StudioRepository,
  show: StudioShowRecord,
  episode: StudioEpisodeRecord,
): Promise<StudioEpisodeRecord> {
  const episodes = await studio.listEpisodes(show.id);
  const copy = await studio.createEpisode({
    showId: show.id,
    userId: episode.userId,
    number: Math.max(0, ...episodes.map((e) => e.number)) + 1,
    title: `${episode.title} · shots`,
    phase: 'script',
  });
  await studio.updateEpisode(copy.id, {
    logline: episode.logline,
    outline: episode.outline,
    editorial: episode.editorial,
    phase: 'script',
  });
  return (await studio.findEpisode(copy.id))!;
}

async function main() {
  const episodeId = option('--episode');
  const userId = option('--user');
  if (!episodeId || !userId)
    throw new Refused(
      'Usage: npm run shots:remake -- --episode <id> --user <id> --copy [--scenes 1,2] [--voice kokoro]',
    );
  if (!process.argv.includes('--copy'))
    throw new Refused(
      'The remake is made as a copy beside the episode, never over it: add --copy.',
    );
  const app = await NestFactory.createApplicationContext(ShotsRemakeModule, {
    logger: ['log', 'warn', 'error'],
  });
  const logger = new Logger('ShotsRemake');
  try {
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    const calls = app.get<AiCallLogRepository>(AI_CALL_LOG_REPOSITORY);
    const episode = await studio.findEpisode(episodeId);
    if (!episode) throw new Refused(`No episode ${episodeId}`);
    if (episode.userId !== userId)
      throw new Refused(
        `Episode ${episodeId} is not ${userId}'s: a made film's seconds are counted to its owner.`,
      );
    if (!episode.editorial || !episode.outline?.editor)
      throw new Refused(
        `Episode ${episodeId} was not written by the editor's desk: only its lessons are boarded as shots.`,
      );
    const show = await studio.findShow(episode.showId);
    if (!show?.bible)
      throw new Refused(
        `Episode ${episodeId} has no show cast to make it with`,
      );

    // The copy, under the same show.
    const copy = await copyOf(studio, show, episode);
    logger.log(
      `copied ${episode.id} as ${copy.id} "${copy.title}" (episode ${copy.number})`,
    );
    const asked = scenesAsked(copy.outline!.scenes.length);

    // Boarded with the real board and the switch on: lesson scenes as
    // shots, an illustrated scene as the editor boards it.
    const editor = new StudioEditorProcessor({
      studio,
      llm,
      calls,
      queue: { enqueueStudio: () => Promise.resolve() },
      setting: (name) => process.env[name],
      material: app.get(StudioMaterialService),
      logger: { log: (l) => logger.log(l), warn: (l) => logger.warn(l) },
    });
    const started = Date.now();
    let rows: StudioSceneRecord[];
    if (asked.length === copy.outline!.scenes.length) {
      await editor.boards(show, copy);
      rows = await studio.listScenes(copy.id);
    } else {
      rows = await studio.replaceScenes(copy.id, copy.outline!.scenes.length);
      for (const k of asked)
        if (isIllustrated(copy.outline!.scenes[k]))
          await editor.illustratedBoard(show, copy, show.bible, rows[k], k);
        else await editor.shotsBoard(show, copy, show.bible, rows[k], k);
      rows = await studio.listScenes(copy.id);
    }
    const shots = rows.filter(
      (r) => r.sheet?.kind === 'explainer' && r.sheet.engine === 'shots',
    ).length;
    logger.log(
      `boarded ${asked.length} scenes in ${Math.round((Date.now() - started) / 1000)}s, ${shots} as shots`,
    );

    // Made here, as a worker makes each: voiced, built, timed, stored.
    const studioProcessor = app.get(StudioProcessor);
    const making = asked
      .map((k) => rows.find((r) => r.position === k))
      .filter((r): r is StudioSceneRecord => !!r?.sheet);
    for (const row of making) {
      const job = {
        kind: 'make' as const,
        showId: show.id,
        episodeId: copy.id,
        userId,
        sceneId: row.id,
      };
      for (let attempt = 1; attempt <= 2; attempt += 1)
        try {
          await studioProcessor.process(job, {
            attemptsMade: attempt,
            isFinalAttempt: attempt === 2,
            jobId: `shots-remake:${row.id}:${attempt}`,
          });
          break;
        } catch (error) {
          logger.warn(
            `scene ${row.position + 1}: try ${attempt}: ${(error as Error).message}`,
          );
        }
    }

    const made = await studio.listScenes(copy.id);
    const after = await studio.findEpisode(copy.id);
    console.log(
      `\nepisode ${copy.id} "${copy.title}": ${after?.phase}, ${Math.round((after?.durationMs ?? 0) / 1000)}s of film`,
    );
    for (const row of made)
      console.log(
        `  scene ${row.position + 1}: ${row.status}${row.sheet?.kind === 'explainer' && row.sheet.engine === 'shots' ? ' (shots)' : ''}${row.durationMs ? `, ${Math.round(row.durationMs / 1000)}s` : ''}${row.error ? `: ${row.error}` : ''}${row.sceneKey ? `\n    ${row.sceneKey}` : ''}`,
      );
    console.log(`\nnpm run frames -- --episode ${copy.id} --user ${userId}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Refused ? error.message : (error as Error).stack,
  );
  process.exit(1);
});
