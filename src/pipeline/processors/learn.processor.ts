import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Block, DocumentBrief, LearnDepth } from '../../contracts';
import { LLM_GATEWAY, STORAGE } from '../../business/ports/tokens';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import { PdfWriter } from '../../web/adapters/pdf-writer';
import { PipelineOrchestrator } from '../orchestrator.service';
import type { LearnJobData } from '../queues';

/** How long a document each depth asks for. */
export const PAGES_FOR_DEPTH: Record<LearnDepth, number> = {
  primer: 6,
  solid: 15,
  deep: 30,
  exhaustive: 60,
};

/** Each depth's successor, for expanding a document that ran out of room. */
export const NEXT_DEPTH: Record<LearnDepth, LearnDepth | null> = {
  primer: 'solid',
  solid: 'deep',
  deep: 'exhaustive',
  // The ceiling is real: past this the writing loses coherence long before
  // the reader runs out of appetite. Expanding again re-covers the same
  // ground rather than pretending there is more.
  exhaustive: null,
};

/** Chapters written at once. Enough to be quick, not enough to be throttled. */
const WRITE_CONCURRENCY = 4;

/**
 * Writes a document about a topic, then hands it to the normal pipeline.
 *
 * The important design decision is what this job produces: not a special kind
 * of content with its own reader, but a **PDF**, stored exactly where an
 * upload would be stored, followed by the same `pipeline.start` an upload
 * triggers. Everything downstream — extraction, summary, topics, embeddings,
 * both simplification levels, the reader, chat, lessons, mastery — then works
 * on it without knowing it was written rather than uploaded.
 *
 * Three model passes: interview answers become a brief, the brief becomes an
 * outline sized to a page budget, and each chapter is written against that
 * outline. Chapters are written in parallel because a 30-page document is 10
 * calls, and serially that is several minutes of the reader watching a
 * spinner.
 */
@Injectable()
export class LearnProcessor {
  private readonly logger = new Logger(LearnProcessor.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documents: DocumentRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly pipeline: PipelineOrchestrator,
  ) {}

  async process(data: LearnJobData): Promise<void> {
    const doc = await this.documents.findById(data.documentId);
    if (!doc) return;
    // A regenerated document would carry a newer version; this job is stale.
    if (doc.contentVersion !== data.contentVersion) return;

    const brief = doc.props.brief;
    if (!brief) {
      this.logger.error(`Document ${doc.id} has no brief to write from`);
      doc.markFailed('We lost track of what you asked for. Try again.');
      await this.documents.save(doc);
      return;
    }

    try {
      const { pdf, title, furtherTopics } = await this.compose(doc.id, brief);
      // Kept on the document so the library can offer them as the expansion.
      doc.noteFurtherTopics(furtherTopics);
      // The row was created before anything was written, titled with the raw
      // topic. The outline knows a better one.
      if (title) doc.rename(title);
      await this.storage.put({
        key: `documents/${doc.id}/original`,
        body: pdf,
        mimeType: 'application/pdf',
      });

      doc.markUploaded(`documents/${doc.id}/original`);
      await this.documents.save(doc);

      // From here it is indistinguishable from an upload.
      await this.pipeline.start(doc.id, doc.contentVersion);
    } catch (error) {
      this.logger.error(
        `Generating "${brief.topic}" failed: ${(error as Error).message}`,
      );
      // Reload: `markUploaded` may have run before the throw.
      const current = await this.documents.findById(doc.id);
      if (current) {
        current.markFailed(
          "We couldn't write that document. Try again, or narrow the topic.",
        );
        await this.documents.save(current);
      }
      throw error;
    }
  }

  /** Outline, then chapters, then a PDF. */
  private async compose(
    documentId: string,
    brief: DocumentBrief,
  ): Promise<{ pdf: Buffer; title: string; furtherTopics: string[] }> {
    const targetPages = PAGES_FOR_DEPTH[brief.depth];
    const readerBrief = describeReader(brief);

    const outline = await this.llm.outlineTopic({
      topic: brief.topic,
      brief: readerBrief,
      targetPages,
      mustCover: brief.mustCover,
    });
    await this.log(documentId, 'learn_outline', outline.usage);

    const titles = outline.value.chapters.map((chapter) => chapter.title);
    const written: Block[][] = new Array<Block[]>(titles.length);

    // A small worker pool rather than one big Promise.all: 10 concurrent
    // chapter calls is a rate limit waiting to happen.
    let next = 0;
    const workers = Array.from(
      { length: Math.min(WRITE_CONCURRENCY, titles.length) },
      async () => {
        for (;;) {
          const index = next++;
          if (index >= titles.length) return;
          const chapter = outline.value.chapters[index];
          const result = await this.llm.writeChapter({
            topic: brief.topic,
            brief: readerBrief,
            documentTitle: outline.value.title,
            chapter,
            outline: titles,
          });
          written[index] = result.value.blocks;
          await this.log(documentId, 'learn_write', result.usage);
        }
      },
    );
    await Promise.all(workers);

    return {
      pdf: this.typeset(
        outline.value.title,
        brief,
        titles,
        written,
        outline.value.furtherTopics ?? [],
      ),
      title: outline.value.title,
      furtherTopics: outline.value.furtherTopics ?? [],
    };
  }

  /**
   * Lays the chapters out as a PDF.
   *
   * Each chapter starts its own page so the extracted page boundaries line up
   * with the chapter boundaries — which is what makes the topics pass produce
   * a sensible syllabus later instead of chapters that straddle pages.
   */
  private typeset(
    title: string,
    brief: DocumentBrief,
    titles: string[],
    chapters: Block[][],
    furtherTopics: string[],
  ): Buffer {
    const pdf = new PdfWriter(null);

    pdf.text(title, { font: 'bold', size: 26, leading: 32 });
    pdf.space(10);
    pdf.text(`A study document on ${brief.topic}`, {
      font: 'italic',
      size: 12,
      grey: 0.4,
    });
    pdf.space(20);

    // Said plainly, on the first page, because a study document that reads as
    // authoritative while being model-written is the one genuinely harmful
    // thing this feature could ship.
    pdf.text(
      'Written by EasiRead using an AI model, from the model’s own ' +
        'knowledge rather than cited sources. It is a study aid, not a ' +
        'reference: check anything that matters against your course material.',
      { font: 'regular', size: 10.5, leading: 15, grey: 0.45 },
    );
    pdf.space(18);

    pdf.text('Contents', { font: 'bold', size: 13, leading: 18 });
    pdf.space(4);
    for (const [index, chapterTitle] of titles.entries()) {
      pdf.text(`${index + 1}.  ${chapterTitle}`, {
        font: 'regular',
        size: 11,
        leading: 16,
        grey: 0.25,
      });
    }

    for (const [index, blocks] of chapters.entries()) {
      pdf.pageBreak();
      // A chapter whose model call failed is skipped rather than left as a
      // blank page pretending to be content.
      if (!blocks?.length) continue;

      pdf.text(titles[index], { font: 'bold', size: 19, leading: 25 });
      pdf.space(10);

      // Models tend to open a chapter by restating its title, which would
      // print it twice under the heading we just wrote.
      const body =
        blocks[0]?.type.startsWith('heading') &&
        sameHeading(blocks[0].text, titles[index])
          ? blocks.slice(1)
          : blocks;

      for (const block of body) {
        switch (block.type) {
          case 'headingOne':
            pdf.space(12);
            pdf.text(block.text, { font: 'bold', size: 15, leading: 20 });
            pdf.space(4);
            break;
          case 'headingTwo':
            pdf.space(8);
            pdf.text(block.text, { font: 'bold', size: 12.5, leading: 17 });
            pdf.space(3);
            break;
          case 'bullet':
            pdf.text(`• ${block.text}`, {
              size: 11,
              leading: 17,
              indent: 14,
            });
            break;
          default:
            pdf.text(block.text, { size: 11, leading: 17 });
            pdf.space(6);
        }
      }
    }

    // What this length could not fit, named honestly, so the reader knows
    // the document has edges and can ask for them to be pushed out.
    if (furtherTopics.length) {
      pdf.pageBreak();
      pdf.text('Where to go next', { font: 'bold', size: 19, leading: 25 });
      pdf.space(8);
      pdf.text(
        'This document covers the ground above. These are the next things ' +
          'worth understanding, which it does not cover at this length:',
        { size: 11, leading: 17 },
      );
      pdf.space(8);
      for (const topic of furtherTopics) {
        pdf.text(`• ${topic}`, { size: 11, leading: 17, indent: 14 });
      }
      pdf.space(10);
      pdf.text(
        'You can have this document rewritten at greater length to cover ' +
          'them, from its page in your library.',
        { size: 11, leading: 17, grey: 0.4 },
      );
    }

    return pdf.build();
  }

  private async log(
    documentId: string,
    task: string,
    usage: {
      model: string;
      tokensIn: number;
      tokensOut: number;
      latencyMs: number;
    },
  ): Promise<void> {
    await this.calls
      .record({
        documentId,
        task,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        latencyMs: usage.latencyMs,
        outcome: 'ok',
      })
      .catch(() => undefined);
  }
}

/**
 * Two headings that mean the same thing.
 *
 * Case, punctuation and spacing are ignored, and so is a leading chapter
 * number — models like to number their own headings ("2. Key Players"), which
 * would otherwise slip past this check and print the title twice.
 */
export function sameHeading(a: string, b: string): boolean {
  const normalise = (text: string) =>
    text
      .toLowerCase()
      .replace(/^\s*(?:chapter|part|section)?\s*\d+\s*[.):-]*\s*/i, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return normalise(a) === normalise(b);
}

/** The interview answers, written for the model rather than for a form. */
function describeReader(brief: DocumentBrief): string {
  const lines = Object.values(brief.answers).filter(Boolean);
  return [
    lines.length
      ? `They told us: ${lines.join('; ')}.`
      : 'They told us nothing about their level, so assume a capable beginner.',
    brief.goal ? `They are learning it for: ${brief.goal}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
}
