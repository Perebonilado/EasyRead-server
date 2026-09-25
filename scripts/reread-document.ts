/**
 * A document read again from its PDF, as extraction reads it now: its
 * pages, in reading order (two columns down the left and then the right),
 * and its notes written again from them. For a book read before
 * extraction learned two columns, or before notes kept direct speech.
 * A story book's story is read again from the new pages too.
 *
 *   npm run doc:reread -- <documentId>        says what would be done
 *   npm run doc:reread -- <documentId> --go   does it, in this process
 *
 * Then `npm run scene:recast -- <documentId> --here` makes its videos
 * again from the new pages. Notes cost what simplifying a page costs, the
 * story what reading it costs; a page OCR had read is read from its text
 * layer again.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { DocumentPageRepository } from '../src/business/repositories/document-page.repository';
import type { DocumentRepository } from '../src/business/repositories/document.repository';
import type { SimplifiedPageRepository } from '../src/business/repositories/simplified-page.repository';
import {
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
} from '../src/business/repositories/tokens';
import { CoreModule } from '../src/core.module';
import { ExtractProcessor } from '../src/pipeline/processors/extract.processor';
import { LectureFollowService } from '../src/pipeline/processors/lecture-follow.service';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import { SimplifyPageProcessor } from '../src/pipeline/processors/simplify.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [
    ExtractProcessor,
    SimplifyPageProcessor,
    LectureFollowService,
    SceneProcessor,
  ],
})
class RereadModule {}

/** Notes written at once, a few at a time. */
const AT_ONCE = 4;
/** Tries at each note, as the worker's. */
const TRIES = 3;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const documentId = args.find((a) => !a.startsWith('--'));
  const go = args.includes('--go');
  if (!documentId) {
    console.error('npm run doc:reread -- <documentId> [--go]');
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(RereadModule, {
    logger: ['warn', 'error'],
  });
  try {
    const documents = app.get<DocumentRepository>(DOCUMENT_REPOSITORY);
    const doc = await documents.findById(documentId);
    if (!doc) throw new Error(`No document ${documentId}`);
    const pages = app.get<DocumentPageRepository>(DOCUMENT_PAGE_REPOSITORY);
    const kept = await pages.findRange(doc.id, 1, doc.props.pageCount ?? 1);
    console.log(
      `"${doc.props.title}": ${kept.length} pages to read again, and their notes to write again.`,
    );
    if (!go) {
      console.log('Nothing done: --go does it.');
      return;
    }
    const count = await app.get(ExtractProcessor).rereadPages(doc.id);
    console.log(`Read ${count} pages again.`);
    const simplified = app.get<SimplifiedPageRepository>(
      SIMPLIFIED_PAGE_REPOSITORY,
    );
    const simplify = app.get(SimplifyPageProcessor);
    const numbers = Array.from({ length: count }, (_, i) => i + 1);
    // A note already written is never rewritten by the job: set back to be
    // written, it is written again. The old one shows until the new one is
    // done.
    for (const pageNumber of numbers)
      await simplified.reset(doc.id, pageNumber);
    let written = 0;
    for (let i = 0; i < numbers.length; i += AT_ONCE)
      await Promise.all(
        numbers.slice(i, i + AT_ONCE).map(async (pageNumber) => {
          // As the worker does: a try that fails (a deadlock between the
          // notes being written at once, a model's error) is tried again;
          // the last try's failure is kept on the page.
          for (let attempt = 1; attempt <= TRIES; attempt += 1) {
            try {
              await simplify.process(
                {
                  documentId: doc.id,
                  contentVersion: doc.contentVersion,
                  pageNumber,
                },
                { isFinalAttempt: attempt === TRIES, attemptsMade: attempt },
              );
              break;
            } catch (error) {
              if (attempt === TRIES) throw error;
              await new Promise((done) => setTimeout(done, 500 * attempt));
            }
          }
          written += 1;
        }),
      );
    console.log(`Wrote ${written} notes again.`);
    // A story book's story, read again from the new pages: who is who,
    // where each page happens. Its people as drawn, and its places, stay.
    const story = await app.get(SceneProcessor).rereadStory(doc.id);
    if (story)
      console.log(
        `Read its story again: ${story.characters.length} people. Next, its videos: npm run scene:recast -- ${doc.id} --here`,
      );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
