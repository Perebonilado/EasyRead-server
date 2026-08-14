/* One-off: forget the topics step for a document and enqueue it again. */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PIPELINE_RUN_REPOSITORY } from './src/business/repositories/tokens';
import { JOB_QUEUE } from './src/business/ports/tokens';
import type { PipelineRunRepository } from './src/business/repositories/misc.repository';
import type { JobQueuePort } from './src/business/ports/job-queue.port';
import { DocumentModel } from './src/web/database/models';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const id = process.argv[2];
  const doc = await DocumentModel.findByPk(id);
  if (!doc) throw new Error('no such document');
  const runs = app.get<PipelineRunRepository>(PIPELINE_RUN_REPOSITORY);
  const queue = app.get<JobQueuePort>(JOB_QUEUE);
  // Only the topics ledger row goes; everything else stays done.
  await (runs as any).model.destroy({ where: { documentId: id, step: 'topics' } });
  await queue.enqueueStep('topics', { documentId: id, contentVersion: doc.contentVersion });
  console.log('topics re-enqueued for', doc.title, 'v' + doc.contentVersion);
  await app.close();
}
void main();
