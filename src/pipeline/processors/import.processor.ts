import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Block } from '../../contracts';
import { EVENT_BUS, STORAGE, WEB_IMPORT } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { StoragePort } from '../../business/ports/storage.port';
import type { WebImportPort } from '../../business/ports/web-import.port';
import { DOCUMENT_REPOSITORY } from '../../business/repositories/tokens';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import { EntitlementsService } from '../../business/handlers/documents/entitlements.service';
import {
  extractBlocks,
  type ExtractedFigure,
} from '../../web/adapters/web-import/content-extract';
import {
  decodeImage,
  sniffImage,
  type DecodedImage,
} from '../../web/adapters/images/image-codec';
import { PAGE_ASSET_REPOSITORY } from '../../business/repositories/tokens';
import type { PageAssetRepository } from '../../business/repositories/page-asset.repository';
import { newId } from '../../web/database/uuid';
import { PdfWriter, tableRowsOf } from '../../web/adapters/pdf-writer';
import { PipelineOrchestrator } from '../orchestrator.service';
import type { ImportJobData } from '../queues';

/** Pages fetched at once; the pause between batches is per-site politeness. */
const FETCH_CONCURRENCY = 4;
const BATCH_PAUSE_MS = 400;

/** A figure fetched and decoded, ready to place and to keep. */
interface FetchedFigure {
  figure: ExtractedFigure;
  decoded: DecodedImage;
  bytes: Buffer;
  mimeType: string;
}

interface FetchedChapter {
  title: string;
  blocks: Block[];
  figures: FetchedFigure[];
  /** Set when the page could not be fetched or read. */
  failed: string | null;
  url: string;
}

/** Figures across a whole import — a cap on cost, not on fidelity. */
const MAX_FIGURES_PER_DOCUMENT = 40;

/**
 * Turns a chosen slice of a docs site into a document (the import flow).
 *
 * Same shape as the Learn processor on purpose: produce a PDF where an upload
 * would have put one, mark it uploaded, start the pipeline. One page of the
 * site becomes one chapter, in the site's own nav order, and the chapter page
 * ranges are recorded on the manifest so the topics step can use the docs'
 * real structure instead of inferring one.
 *
 * A page that fails to fetch becomes a visible gap chapter rather than a
 * failed import — nine good chapters and an honest hole beats nothing.
 */
@Injectable()
export class ImportProcessor {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documents: DocumentRepository,
    @Inject(WEB_IMPORT) private readonly web: WebImportPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    @Inject(PAGE_ASSET_REPOSITORY)
    private readonly assets: PageAssetRepository,
    private readonly entitlements: EntitlementsService,
    private readonly pipeline: PipelineOrchestrator,
  ) {}

  async process(data: ImportJobData): Promise<void> {
    const doc = await this.documents.findById(data.documentId);
    if (!doc) return;
    if (doc.contentVersion !== data.contentVersion) return;

    const manifest = doc.props.importManifest;
    if (!manifest?.pages.length) {
      doc.markFailed('We lost track of which pages you picked. Try again.');
      await this.documents.save(doc);
      return;
    }

    try {
      const chapters = await this.fetchAll(doc.id, manifest.pages);

      const good = chapters.filter((chapter) => !chapter.failed);
      if (!good.length) {
        doc.markFailed(
          'None of those pages could be read. The site may be blocking ' +
            'imports, or the pages may need a login.',
        );
        await this.documents.save(doc);
        return;
      }

      const { pdf, ranges, placedFigures } = this.typeset(
        doc.props.title,
        manifest.url,
        chapters,
      );

      // Page caps are gone on every plan; the study clock is the meter now.
      doc.noteImportChapters(ranges);
      await this.storage.put({
        key: `documents/${doc.id}/original`,
        body: pdf,
        mimeType: 'application/pdf',
      });

      // The same figures, kept beside the text for the simplified pane.
      // Best-effort per figure: the document stands without any of them.
      for (const placed of placedFigures) {
        try {
          const ref = `documents/${doc.id}/assets/${newId()}`;
          await this.storage.put({
            key: ref,
            body: placed.figure.bytes,
            mimeType: placed.figure.mimeType,
          });
          await this.assets.create({
            documentId: doc.id,
            contentVersion: doc.contentVersion,
            pageNumber: placed.pageNumber,
            fileRef: ref,
            mimeType: placed.figure.mimeType,
            width: placed.figure.decoded.width,
            height: placed.figure.decoded.height,
            caption: placed.figure.figure.alt,
            orderIndex: placed.orderIndex,
          });
        } catch {
          // A lost side-copy is invisible; the figure is still in the PDF.
        }
      }

      doc.markUploaded(`documents/${doc.id}/original`);
      await this.documents.save(doc);

      // From here it is indistinguishable from an upload.
      await this.pipeline.start(doc.id, doc.contentVersion);
    } catch (error) {
      this.logger.error(
        `Import of ${manifest.url} failed: ${(error as Error).message}`,
      );
      const current = await this.documents.findById(doc.id);
      if (current) {
        current.markFailed(
          "We couldn't import that site. Try again, or pick fewer pages.",
        );
        await this.documents.save(current);
      }
      throw error;
    }
  }

  /** Fetch + extract every chosen page, a few at a time, in nav order. */
  private async fetchAll(
    documentId: string,
    pages: { url: string; title: string }[],
  ): Promise<FetchedChapter[]> {
    const chapters: FetchedChapter[] = new Array<FetchedChapter>(pages.length);
    let fetched = 0;

    for (let start = 0; start < pages.length; start += FETCH_CONCURRENCY) {
      const batch = pages.slice(start, start + FETCH_CONCURRENCY);
      await Promise.all(
        batch.map(async (page, offset) => {
          const index = start + offset;
          try {
            const { html, finalUrl } = await this.web.fetchPage(page.url);
            const { title, blocks, figures } = extractBlocks(html, finalUrl);
            chapters[index] = {
              url: page.url,
              title: page.title || title || page.url,
              blocks,
              figures: await this.fetchFigures(figures),
              failed: blocks.length ? null : 'The page had no readable content',
            };
          } catch (error) {
            chapters[index] = {
              url: page.url,
              title: page.title,
              blocks: [],
              figures: [],
              failed: (error as Error).message,
            };
          }
          fetched += 1;
        }),
      );

      await this.events.publish(documentId, {
        type: 'import.progress',
        fetched,
        total: pages.length,
      });

      if (start + FETCH_CONCURRENCY < pages.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
      }
    }

    return chapters;
  }

  /**
   * A chapter's figures, fetched and decoded. Every failure is a silent
   * skip: a diagram that won't decode must never cost the reader the page
   * it sat on, and a placeholder box would be noise.
   */
  private async fetchFigures(
    figures: ExtractedFigure[],
  ): Promise<FetchedFigure[]> {
    const fetched: FetchedFigure[] = [];
    for (const figure of figures) {
      try {
        const { bytes } = await this.web.fetchBinary(figure.src);
        const kind = sniffImage(bytes);
        if (!kind) continue; // gif/webp/svg — not embeddable yet
        const decoded = decodeImage(bytes);
        if (decoded.width < 64 || decoded.height < 64) continue; // icons
        fetched.push({
          figure,
          decoded,
          bytes,
          mimeType: kind === 'jpeg' ? 'image/jpeg' : 'image/png',
        });
      } catch {
        // Skipped, deliberately without a trace in the document.
      }
    }
    return fetched;
  }

  /** One nav page = one chapter, page break between, ranges recorded. */
  private typeset(
    title: string,
    sourceUrl: string,
    chapters: FetchedChapter[],
  ): {
    pdf: Buffer;
    ranges: { title: string; startPage: number; endPage: number }[];
    placedFigures: {
      figure: FetchedFigure;
      pageNumber: number;
      orderIndex: number;
    }[];
  } {
    const pdf = new PdfWriter();
    const host = new URL(sourceUrl).hostname;
    const date = new Date().toISOString().slice(0, 10);

    pdf.text(title, { font: 'bold', size: 24, leading: 30 });
    pdf.space(6);
    pdf.text(`Imported from ${host} on ${date} with EasiRead`, {
      font: 'italic',
      size: 11,
      grey: 0.45,
    });
    pdf.space(20);

    const ranges: { title: string; startPage: number; endPage: number }[] = [];
    const placedFigures: {
      figure: FetchedFigure;
      pageNumber: number;
      orderIndex: number;
    }[] = [];
    let figureCount = 0;

    for (const chapter of chapters) {
      pdf.pageBreak();
      const startPage = pdf.currentPage;

      // The chapter always opens with its nav title, unless the page's own
      // first heading already says the same thing.
      const first = chapter.blocks[0];
      const opensWithOwnTitle =
        first?.type === 'headingOne' &&
        first.text.trim().toLowerCase() === chapter.title.trim().toLowerCase();
      if (!opensWithOwnTitle) {
        pdf.text(chapter.title, { font: 'bold', size: 18, leading: 24 });
        pdf.space(8);
      }

      if (chapter.failed) {
        pdf.text(`This page didn't come through: ${chapter.failed}`, {
          font: 'italic',
          size: 11,
          grey: 0.4,
        });
        pdf.space(4);
        pdf.text(`Read it at ${chapter.url}`, { size: 10, grey: 0.45 });
      }

      const placeFiguresAfter = (blockIndex: number) => {
        for (const entry of chapter.figures) {
          if (entry.figure.afterBlock !== blockIndex) continue;
          if (figureCount >= MAX_FIGURES_PER_DOCUMENT) return;
          figureCount += 1;
          pdf.space(6);
          pdf.image(entry.decoded, entry.figure.alt);
          placedFigures.push({
            figure: entry,
            pageNumber: pdf.currentPage,
            orderIndex: placedFigures.length,
          });
        }
      };
      placeFiguresAfter(0);

      chapter.blocks.forEach((block, blockIndex) => {
        switch (block.type) {
          case 'headingOne':
            pdf.space(10);
            pdf.text(block.text, { font: 'bold', size: 16, leading: 21 });
            pdf.space(4);
            break;
          case 'headingTwo':
            pdf.space(8);
            pdf.text(block.text, { font: 'bold', size: 13, leading: 18 });
            pdf.space(3);
            break;
          case 'bullet':
            pdf.text(`•  ${block.text}`, { size: 11, leading: 17, indent: 14 });
            pdf.space(2);
            break;
          case 'code':
            pdf.space(4);
            pdf.code(block.text);
            pdf.space(6);
            break;
          case 'table':
            pdf.space(6);
            pdf.table(tableRowsOf(block.text));
            pdf.space(6);
            break;
          default:
            pdf.text(block.text, { size: 11, leading: 17 });
            pdf.space(6);
        }
        placeFiguresAfter(blockIndex + 1);
      });

      ranges.push({
        title: chapter.title,
        startPage,
        endPage: pdf.currentPage,
      });
    }

    return { pdf: pdf.build(), ranges, placedFigures };
  }
}
