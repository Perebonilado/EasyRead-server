import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core.module';
import { ConvertProcessor } from './pipeline/processors/convert.processor';
import { EmbedProcessor } from './pipeline/processors/embed.processor';
import { ExportProcessor } from './pipeline/processors/export.processor';
import { LearnProcessor } from './pipeline/processors/learn.processor';
import { ExtractProcessor } from './pipeline/processors/extract.processor';
import { SimplifyPageProcessor } from './pipeline/processors/simplify.processor';
import { SummarizeProcessor } from './pipeline/processors/summarize.processor';
import { TopicsProcessor } from './pipeline/processors/topics.processor';
import { PurgeService } from './pipeline/purge.service';
import { WorkerRunner } from './pipeline/worker-runner.service';

/**
 * The worker process: queue consumers and scheduled maintenance, no HTTP
 * surface. Scaled independently of the API, which is the point of splitting
 * them (§4.1).
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [
    ConvertProcessor,
    ExtractProcessor,
    SummarizeProcessor,
    TopicsProcessor,
    EmbedProcessor,
    SimplifyPageProcessor,
    ExportProcessor,
    LearnProcessor,
    WorkerRunner,
    PurgeService,
  ],
})
export class WorkerModule {}
