import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core.module';
import { ConvertProcessor } from './pipeline/processors/convert.processor';
import { EmbedProcessor } from './pipeline/processors/embed.processor';
import { ExportProcessor } from './pipeline/processors/export.processor';
import { LearnProcessor } from './pipeline/processors/learn.processor';
import { ImportProcessor } from './pipeline/processors/import.processor';
import { ExtractProcessor } from './pipeline/processors/extract.processor';
import { OcrProcessor } from './pipeline/processors/ocr.processor';
import { LectureChapterProcessor } from './pipeline/processors/lecture-chapter.processor';
import { LectureVoiceProcessor } from './pipeline/processors/lecture-voice.processor';
import { LectureAlignProcessor } from './pipeline/processors/lecture-align.processor';
import { LectureDiagramProcessor } from './pipeline/processors/lecture-diagram.processor';
import { LectureBoardProcessor } from './pipeline/processors/lecture-board.processor';
import { LectureBoardService } from './pipeline/processors/lecture-board.service';
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
    OcrProcessor,
    SummarizeProcessor,
    TopicsProcessor,
    EmbedProcessor,
    SimplifyPageProcessor,
    LectureChapterProcessor,
    LectureVoiceProcessor,
    LectureAlignProcessor,
    LectureDiagramProcessor,
    LectureBoardProcessor,
    LectureBoardService,
    ExportProcessor,
    LearnProcessor,
    ImportProcessor,
    WorkerRunner,
    PurgeService,
  ],
})
export class WorkerModule {}
