import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  NOTES_PAGE_CHARS,
  NOTES_VERSION,
  joinDrafts,
  mendNotes,
  notesParts,
  pageSign,
  type ChapterNotes,
  type NotesDraft,
  type PageSign,
} from '../../business/domain/lesson-notes';
import {
  DIRECT_CHARS,
  SCENE_MATERIAL_CHARS,
  SCENE_PAGE_CHARS,
  markedPages,
  notesBudget,
  notesForOutline,
  pageList,
  type DocumentPick,
  type PageRange,
} from '../../business/domain/studio/studio-document';
import type { LlmGatewayPort, LlmUsage } from '../../business/ports/llm.port';
import type { StoragePort } from '../../business/ports/storage.port';
import { LLM_GATEWAY, STORAGE } from '../../business/ports/tokens';
import type {
  DocumentPageRepository,
  PageText,
} from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import {
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
} from '../../business/repositories/tokens';
import { OcrProcessor } from './ocr.processor';

/** Parts of the pages read for notes at once. */
const NOTES_READERS = 3;

/** What an episode's outline is written from: the pages chosen, as their own text or as their notes. */
export interface OutlineMaterial {
  /** Marked "[page N]", ready for the brief. */
  text: string;
  /** Whether it is the pages' teacher's notes rather than their own text. */
  condensed: boolean;
  ranges: PageRange[];
  notes: ChapterNotes | null;
}

/** Where the notes on a Studio episode's pages are kept: made once for those pages. */
export const studioNotesKey = (
  documentId: string,
  contentVersion: number,
  ranges: readonly PageRange[],
) =>
  `studio/documents/${documentId}/v${contentVersion}/notes-${createHash('sha1')
    .update(JSON.stringify(ranges))
    .digest('hex')
    .slice(0, 16)}.json`;

/** Each item through `work`, at most `limit` at a time, the answers in order. */
async function inBatches<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const at = next++;
      out[at] = await work(items[at]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
  return out;
}

/**
 * The material an explainer made from a document is written from
 * (studio-explainer-plan, Ask 7 §5), on the worker: the pages chosen,
 * read by OCR first where they have no text (only those pages: a Studio
 * document is never read whole); their own text for the outline when it
 * is short (DIRECT_CHARS), else their teacher's notes, read in parts of
 * twenty pages and kept, held to what the outline can use; and each
 * scene's own pages for its writer.
 */
@Injectable()
export class StudioMaterialService {
  private readonly logger = new Logger(StudioMaterialService.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Optional() private readonly ocr?: OcrProcessor,
  ) {}

  /** The pages chosen, in order, their text as it now is. */
  private async pagesOf(
    documentId: string,
    ranges: readonly PageRange[],
  ): Promise<PageText[]> {
    const wanted = pageList(ranges);
    if (!wanted.length) return [];
    const set = new Set(wanted);
    return (
      await this.pages.findRange(
        documentId,
        wanted[0],
        wanted[wanted.length - 1],
      )
    )
      .filter((page) => set.has(page.pageNumber))
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }

  /**
   * What an episode's outline is written from. Null when the document is
   * gone. `record` keeps the notes' calls in the ledger.
   */
  async forOutline(input: {
    documentId: string;
    pick: DocumentPick;
    /** How long the episode runs: the notes are held to what it can use. */
    minutes: number;
    /** Whom it is for, and what the document is, for the notes' reader. */
    about: string;
    record: (usage: LlmUsage) => Promise<void>;
  }): Promise<OutlineMaterial | null> {
    const doc = await this.documents.findById(input.documentId);
    if (!doc || doc.props.deletedAt) return null;
    const ranges = input.pick.ranges;
    // Scanned pages, and maths read from a text layer, read now: only these.
    if (this.ocr) await this.ocr.readSome(doc.id, pageList(ranges));
    const rows = await this.pagesOf(doc.id, ranges);
    const chars = rows.reduce((n, page) => n + page.text.trim().length, 0);
    if (chars <= DIRECT_CHARS)
      return {
        text: markedPages(rows, DIRECT_CHARS),
        condensed: false,
        ranges,
        notes: null,
      };
    const notes = await this.notesOf(
      doc.id,
      doc.contentVersion,
      doc.props.title,
      input.pick,
      rows,
      input.about,
      input.record,
    );
    const budget = notesBudget(input.minutes);
    if (!notes)
      // No notes: the start of each page, as much as the outline can read.
      return {
        text: markedPages(
          rows,
          Math.max(200, Math.floor(DIRECT_CHARS / Math.max(1, rows.length))),
        ),
        condensed: false,
        ranges,
        notes: null,
      };
    return {
      text: notesForOutline(notes, budget),
      condensed: true,
      ranges,
      notes,
    };
  }

  /**
   * The teacher's notes on the pages chosen: kept, made once, the pages
   * read in parts of twenty (lesson-notes), a part told how the page
   * before it ends. Null when they cannot be made.
   */
  private async notesOf(
    documentId: string,
    contentVersion: number,
    title: string,
    pick: DocumentPick,
    rows: PageText[],
    about: string,
    record: (usage: LlmUsage) => Promise<void>,
  ): Promise<ChapterNotes | null> {
    const key = studioNotesKey(documentId, contentVersion, pick.ranges);
    try {
      const kept = JSON.parse(
        (await this.storage.get(key)).toString('utf8'),
      ) as ChapterNotes;
      if (kept.version === NOTES_VERSION) return kept;
    } catch {
      // Not made yet.
    }
    const text = new Map(rows.map((page) => [page.pageNumber, page.text]));
    const noteOf = (page: number) =>
      (text.get(page) ?? '').slice(0, NOTES_PAGE_CHARS);
    const parts = pick.ranges.flatMap(([from, to]) => notesParts(from, to));
    const signs = new Map<number, PageSign>();
    for (const [from, to] of pick.ranges)
      for (let page = from + 1; page <= to; page += 1)
        signs.set(
          page,
          pageSign(text.get(page - 1) ?? null, text.get(page) ?? ''),
        );
    try {
      const drafts = await inBatches(
        parts,
        NOTES_READERS,
        async (part): Promise<NotesDraft> => {
          const pages: string[] = [];
          for (let page = part.from; page <= part.to; page += 1)
            pages.push(`[page ${page}]\n${noteOf(page) || '(nothing on it)'}`);
          const made = await this.llm.sceneNotes({
            documentTitle: title,
            topicTitle: pick.label,
            about,
            from: part.from,
            to: part.to,
            text: pages.join('\n\n'),
            ...(text.has(part.from - 1)
              ? { before: noteOf(part.from - 1).slice(-800) }
              : {}),
          });
          await record(made.usage);
          return made.value;
        },
      );
      const first = pick.ranges[0][0];
      const last = pick.ranges[pick.ranges.length - 1][1];
      const { notes } = mendNotes(
        joinDrafts(drafts),
        { topicId: 'studio', from: first, to: last },
        signs,
      );
      // Only the pages chosen: a gap between two ranges is not taught.
      const chosen = new Set(pageList(pick.ranges));
      const kept: ChapterNotes = {
        ...notes,
        pages: notes.pages.filter((page) => chosen.has(page.page)),
      };
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(kept)),
        mimeType: 'application/json',
      });
      this.logger.log(
        `${documentId}: teacher's notes on ${pick.label} (${chosen.size} pages, ${parts.length} parts)`,
      );
      return kept;
    } catch (error) {
      this.logger.warn(
        `${documentId}: no notes on ${pick.label}, its pages read as they are: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * A scene's own pages, as its writer is given them: each page's text
   * (at most SCENE_PAGE_CHARS of it), SCENE_MATERIAL_CHARS in all. Empty
   * when there are none.
   */
  async forScene(documentId: string, pages: PageRange): Promise<string> {
    try {
      const rows = await this.pagesOf(documentId, [pages]);
      const each = Math.max(
        400,
        Math.min(
          SCENE_PAGE_CHARS,
          Math.floor(SCENE_MATERIAL_CHARS / Math.max(1, rows.length)),
        ),
      );
      return markedPages(rows, each).slice(0, SCENE_MATERIAL_CHARS + 200);
    } catch (error) {
      this.logger.warn(
        `${documentId}: pages ${pages[0]}-${pages[1]} unread for the scene: ${(error as Error).message}`,
      );
      return '';
    }
  }
}
