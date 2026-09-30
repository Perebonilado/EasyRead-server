/**
 * A made episode's film in the other shape, made here as the worker makes
 * it (studio-vertical-plan §1.4): "Make a vertical version" (or a wide
 * one), its twin episode begun and each of its scenes composed again for
 * the twin's frame from the film as made. Nothing is written, drawn or
 * voiced, and no minutes are spent; the queue is not used, so no other
 * worker picks the jobs up.
 *
 *   npm run studio:other-shape -- <episodeId> [--dev <dir>]
 *
 * With --dev, each twin scene's scene.json and its voice are written to
 * <dir>/<n>/ as well (for /dev/player and /dev/stage).
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import type { StudioJob } from '../src/business/ports/job-queue.port';
import type { JobQueuePort } from '../src/business/ports/job-queue.port';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import type { StoragePort } from '../src/business/ports/storage.port';
import type { ClockPort } from '../src/business/ports/clock.port';
import { CLOCK, LLM_GATEWAY, STORAGE } from '../src/business/ports/tokens';
import type { AiCallLogRepository } from '../src/business/repositories/ai-call-log.repository';
import type { StudioRepository } from '../src/business/repositories/studio.repository';
import {
  AI_CALL_LOG_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../src/business/repositories/tokens';
import { EntitlementsService } from '../src/business/handlers/documents/entitlements.service';
import { SceneVoiceService } from '../src/business/handlers/admin/scene-voice.service';
import { StudioCastService } from '../src/business/handlers/studio/studio-cast.service';
import { StudioService } from '../src/business/handlers/studio/studio.service';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import { StudioProcessor } from '../src/pipeline/processors/studio.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor],
})
class StudioOtherShapeModule {}

/** A flag's value: `--dev <dir>`. */
function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [episodeId] = args;
  if (!episodeId || episodeId.startsWith('--')) {
    console.error('npm run studio:other-shape -- <episodeId> [--dev <dir>]');
    process.exit(2);
  }
  const dev = flag(args, '--dev');
  const app = await NestFactory.createApplicationContext(
    StudioOtherShapeModule,
    { logger: ['log', 'warn', 'error'] },
  );
  try {
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const storage = app.get<StoragePort>(STORAGE);
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    // The jobs the Studio would queue, kept here and run in this process.
    const jobs: StudioJob[] = [];
    const queue = {
      enqueueStudio: (more: StudioJob[]) => {
        jobs.push(...more);
        return Promise.resolve();
      },
    } as unknown as JobQueuePort;
    const episode = await studio.findEpisode(episodeId);
    if (!episode) throw new Error(`No episode ${episodeId}`);
    const service = new StudioService(
      studio,
      llm,
      queue,
      storage,
      app.get<ClockPort>(CLOCK),
      app.get<AiCallLogRepository>(AI_CALL_LOG_REPOSITORY),
      app.get(EntitlementsService),
      app.get(StudioCastService),
      app.get(SceneVoiceService),
    );
    const worker = new StudioProcessor(
      studio,
      llm,
      app.get<AiCallLogRepository>(AI_CALL_LOG_REPOSITORY),
      storage,
      app.get(SceneProcessor),
      app.get(EntitlementsService),
      app.get(StudioCastService),
      queue,
    );
    const asked = await service.otherShape(episode.userId, episode.id);
    const twinId = asked.twin?.id;
    console.log(
      `the ${asked.twin?.shape ?? '?'} version: episode ${twinId ?? 'none'}, ${jobs.length} scene(s) to compose`,
    );
    for (const job of jobs.splice(0))
      await worker.process(job, {
        attemptsMade: 1,
        isFinalAttempt: true,
        jobId: `local-${job.sceneId}`,
      });
    if (!twinId) return;
    const rows = await studio.listScenes(twinId);
    for (const row of rows)
      console.log(
        `scene ${row.position + 1}: ${row.status}${row.error ? ` (${row.error})` : ''} → ${row.sceneKey ?? '-'}`,
      );
    if (dev)
      for (const row of rows) {
        if (!row.sceneKey || !row.audioKey) continue;
        const dir = join(resolve(dev), String(row.position + 1));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'scene.json'), await storage.get(row.sceneKey));
        writeFileSync(join(dir, 'audio.mp3'), await storage.get(row.audioKey));
        console.log(`→ ${dir}`);
      }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
