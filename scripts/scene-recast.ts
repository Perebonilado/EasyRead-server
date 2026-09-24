/**
 * A story book's pages made again, so every page shows its people as the
 * figure kit draws them now, and its places as they are painted now: a
 * book half made before a change to how people are drawn and half after
 * would show two casts.
 *
 *   npm run scene:recast -- <documentId>          says what would be made again
 *   npm run scene:recast -- <documentId> --go     queues it: the worker makes each page again
 *   npm run scene:recast -- <documentId> --here   makes each page again now, in this process
 *
 * Each page stays as it was, playable, until its new one is ready; a page
 * that cannot be made again stays as it was. A page costs what making it
 * costs, the writer and the voice once more; its people cost nothing to
 * draw, and each animal and place is drawn once for the book.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NotFoundError } from '../src/business/domain/errors/errors';
import { SCENE_GENERATOR_VERSION } from '../src/business/domain/scene-script';
import { SHEET_VERSION } from '../src/business/domain/scene-sheet';
import { castKey, storyKey } from '../src/business/domain/scene-story';
import type { JobQueuePort } from '../src/business/ports/job-queue.port';
import type { StoragePort } from '../src/business/ports/storage.port';
import { JOB_QUEUE, STORAGE } from '../src/business/ports/tokens';
import type { DocumentRepository } from '../src/business/repositories/document.repository';
import {
  DOCUMENT_REPOSITORY,
  VISUAL_SCENE_REPOSITORY,
} from '../src/business/repositories/tokens';
import type { VisualSceneRepository } from '../src/business/repositories/visual.repository';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import { CoreModule } from '../src/core.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor],
})
class SceneRecastModule {}

/** Remade pages wait behind every page a learner asked for. */
const REMAKE_PRIORITY = 50;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const documentId = args.find((a) => !a.startsWith('--'));
  const go = args.includes('--go');
  const here = args.includes('--here');
  if (!documentId) {
    console.error('npm run scene:recast -- <documentId> [--go | --here]');
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(SceneRecastModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const documents = app.get<DocumentRepository>(DOCUMENT_REPOSITORY);
    const visuals = app.get<VisualSceneRepository>(VISUAL_SCENE_REPOSITORY);
    const storage = app.get<StoragePort>(STORAGE);
    const doc = await documents.findById(documentId);
    if (!doc) throw new Error(`No document ${documentId}`);
    const version = doc.contentVersion;
    try {
      await storage.get(storyKey(doc.id, version));
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      console.log(
        `"${doc.props.title}" has no story: its people are drawn page by page, nothing to make again.`,
      );
      return;
    }
    let older = 0;
    let drawn = 0;
    try {
      const cast = JSON.parse(
        (await storage.get(castKey(doc.id, version))).toString('utf8'),
      ) as Record<string, { version?: number }>;
      drawn = Object.keys(cast).length;
      older = Object.values(cast).filter(
        (sheet) => sheet?.version !== SHEET_VERSION,
      ).length;
    } catch {
      // No cast kept yet.
    }
    const made = (
      await visuals.listByDocument(doc.id, version, SCENE_GENERATOR_VERSION)
    )
      .filter((row) => row.status === 'done')
      .sort((a, b) => a.pageNumber - b.pageNumber);
    console.log(
      `"${doc.props.title}": ${made.length} page${made.length === 1 ? '' : 's'} made (${made.map((r) => r.pageNumber).join(', ') || 'none'}); ${drawn} character${drawn === 1 ? '' : 's'} kept, ${older} drawn the older way.`,
    );
    if (!made.length) return;
    const jobs = made.map((row) => ({
      documentId: doc.id,
      contentVersion: version,
      pageNumber: row.pageNumber,
      topicId: row.topicId,
      requestedBy: row.requestedBy ?? doc.userId,
      priority: REMAKE_PRIORITY,
      remake: true,
    }));
    if (go) {
      await app.get<JobQueuePort>(JOB_QUEUE).enqueueVisualScenes(jobs);
      console.log(
        `Queued ${jobs.length} to be made again; each stays as it was until its new one is ready.`,
      );
    } else if (here) {
      const processor = app.get(SceneProcessor);
      for (const job of jobs) {
        const started = Date.now();
        await processor.process(job, { isFinalAttempt: true, attemptsMade: 1 });
        console.log(
          `page ${job.pageNumber}: ${Math.round((Date.now() - started) / 1000)}s`,
        );
      }
    } else {
      console.log(
        'Nothing made: --go queues them for the worker, --here makes them now.',
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
