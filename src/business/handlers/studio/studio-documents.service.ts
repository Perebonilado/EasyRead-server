import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  StudioChapterDto,
  StudioDocumentCardDto,
  StudioDocumentDto,
  StudioPagesRequest,
  UploadIntentResponse,
} from '../../../contracts';
import {
  LimitReachedError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors/errors';
import {
  briefMissing,
  briefOf,
  type StudioBrief,
} from '../../domain/studio/studio';
import {
  AUDIENCE_CHIPS,
  BAND_WORDS,
  PRIOR_CHIPS,
  whoLine,
} from '../../domain/studio/studio-audience';
import {
  EPISODE_PAGES,
  audienceOfDocument,
  clampRanges,
  labelOf,
  minutesFor,
  pagesIn,
  pagesWords,
  pickPages,
  rangesOfChapters,
  seriesOf,
  type BriefDocument,
  type Chapter,
  type DocumentPick,
  type PagesHeard,
} from '../../domain/studio/studio-document';
import type { ClockPort } from '../../ports/clock.port';
import type { JobQueuePort } from '../../ports/job-queue.port';
import { CLOCK, JOB_QUEUE } from '../../ports/tokens';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type { DocumentRepository } from '../../repositories/document.repository';
import type { TopicRepository } from '../../repositories/misc.repository';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioShowRecord,
} from '../../repositories/studio.repository';
import {
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  STUDIO_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import { StudioDocumentsQuery } from '../../../query/studio-documents.query';
import { UploadIntentHandler } from '../documents/upload.handlers';
import { logEvent } from './studio-log';

/** How many documents a maker may give the Studio in a month: its own count, apart from the library's. */
export const STUDIO_DOCUMENTS_A_MONTH = 30;

/** The tones an explainer's feel is asked with, as chips. */
const TONE_CHIPS = ['Calm', 'Gentle', 'Exciting', 'Funny', 'Serious'];

/** What choosing pages came to: the episode that teaches them, and what the producer asks next (null: the outline is being written). */
export interface PagesChosen {
  episode: StudioEpisodeRecord;
  /** Episodes made for a series besides it. */
  more: number;
  ask: { content: string; choices: string[]; also?: string[] } | null;
  /** The line the thread keeps for it. */
  line: string;
}

/**
 * The Studio's documents (studio-explainer-plan, Ask 7): a file given in
 * the chat is uploaded through the library's own pipeline, but as the
 * Studio's own (never listed in the library), read lightly (its chapters
 * in seconds from its bookmarks), shown in the thread as a card, and its
 * pages chosen for an episode, or a series of them.
 *
 * Reuses the upload, extraction and chapters through their services and
 * repositories; nothing of the reader's screens.
 */
@Injectable()
export class StudioDocumentsService {
  private readonly logger = new Logger(StudioDocumentsService.name);

  constructor(
    @Inject(STUDIO_REPOSITORY) private readonly studio: StudioRepository,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly query: StudioDocumentsQuery,
    private readonly uploadIntent: UploadIntentHandler,
  ) {}

  // ── Whose it is ─────────────────────────────────────────────────────────

  private async requireShow(
    userId: string,
    id: string,
  ): Promise<StudioShowRecord> {
    const show = await this.studio.findShow(id);
    if (!show || show.userId !== userId) throw new NotFoundError('Show');
    return show;
  }

  /** One of the maker's own Studio documents; anyone else's is not found. */
  private async requireDocument(userId: string, id: string) {
    const doc = await this.documents.findById(id);
    if (!doc || !doc.isOwnedBy(userId) || doc.props.origin !== 'studio')
      throw new NotFoundError('Document');
    return doc;
  }

  private async chaptersOf(documentId: string): Promise<Chapter[]> {
    return (await this.topics.listByDocument(documentId)).map((t) => ({
      id: t.id,
      title: t.title,
      from: t.startPage,
      to: t.endPage,
      about: t.shortDescription,
    }));
  }

  // ── Giving one ──────────────────────────────────────────────────────────

  /**
   * A file about to be given: a document row reserved as the Studio's own,
   * and where to send its bytes (the library's own upload path). Accepted
   * types and size as the library has them; at most
   * STUDIO_DOCUMENTS_A_MONTH a month.
   */
  async intent(
    userId: string,
    file: { filename: string; mimeType: string; sizeBytes: number },
  ): Promise<UploadIntentResponse> {
    const now = this.clock.now();
    const month = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    if (
      (await this.query.countSince(userId, month)) >= STUDIO_DOCUMENTS_A_MONTH
    )
      throw new LimitReachedError(
        `That's ${STUDIO_DOCUMENTS_A_MONTH} documents given to the Studio this month`,
        { limit: 'studio-documents', allowed: STUDIO_DOCUMENTS_A_MONTH },
      );
    const result = await this.uploadIntent.handle({
      userId,
      ...file,
      origin: 'studio',
    });
    return result.data;
  }

  /** The maker's Studio documents, the newest first, to give a show again. */
  async list(userId: string): Promise<StudioDocumentCardDto[]> {
    return (await this.query.list(userId)).map((row) => ({
      id: row.id,
      title: row.title,
      pageCount: row.pageCount,
      status: statusOf(row.status),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** A document as its cards show it: how far it is read, its chapters, and which of them the show has used. */
  async view(
    userId: string,
    documentId: string,
    showId?: string | null,
  ): Promise<StudioDocumentDto> {
    const doc = await this.requireDocument(userId, documentId);
    const chapters = await this.topics.listByDocument(doc.id);
    const used = new Set<string>();
    if (showId) {
      const show = await this.studio.findShow(showId);
      if (show && show.userId === userId)
        for (const episode of await this.studio.listEpisodes(show.id))
          if (episode.outline)
            for (const id of episode.pages?.topicIds ?? []) used.add(id);
    }
    const source = chapters[0]?.source;
    const from: StudioDocumentDto['chaptersFrom'] = !chapters.length
      ? null
      : source === 'bookmarks' || source === 'headings'
        ? source
        : 'reading';
    return {
      id: doc.id,
      title: doc.props.title,
      fileName: doc.props.fileName,
      pageCount: doc.props.pageCount,
      status: statusOf(doc.props.status),
      failure: doc.props.status === 'failed' ? doc.props.failureReason : null,
      chapters: chapters.map((t): StudioChapterDto => ({
        id: t.id,
        title: t.title,
        from: t.startPage,
        to: t.endPage,
      })),
      chaptersFrom: from,
      used: [...used],
      createdAt: doc.props.createdAt.toISOString(),
    };
  }

  /**
   * A document given to a show, in the thread: the show keeps it, the
   * brief says it is an explainer made from it, and its card comes (then
   * the card to choose its pages, once its chapters are read).
   */
  async attach(
    userId: string,
    showId: string,
    input: { documentId: string; episodeId?: string | null },
  ): Promise<{ episodeId: string }> {
    const show = await this.requireShow(userId, showId);
    const doc = await this.requireDocument(userId, input.documentId);
    const episodes = await this.studio.listEpisodes(show.id);
    const episode =
      episodes.find((e) => e.id === input.episodeId) ?? episodes.at(-1);
    if (!episode) throw new NotFoundError('Episode');
    const document: BriefDocument = {
      documentId: doc.id,
      title: doc.props.title,
      pageCount: doc.props.pageCount ?? 1,
      ranges: [],
      topicIds: [],
      label: '',
    };
    const brief = briefOf(
      {
        // A document is taught: an explainer, unless the maker said a story.
        format: show.brief.format ?? 'explainer',
        document,
      },
      show.brief,
    );
    // Its own text replaces any pasted text as what it is made from.
    brief.source = null;
    await this.studio.updateShow(show.id, {
      brief,
      format: brief.format,
      documentId: doc.id,
    });
    await logEvent(
      this.studio,
      { showId: show.id, episodeId: episode.id },
      {
        what: 'document',
        step: 'brief',
        documentId: doc.id,
        line: `Document: “${doc.props.title}”`,
      },
    );
    // The producer takes it up at once, so a file given first (the Studio's
    // front page) leads straight into the conversation: which part to explain.
    await this.studio.addMessage({
      showId: show.id,
      episodeId: episode.id,
      role: 'assistant',
      content: `Got “${doc.props.title}”. Which part should the video explain? Pick chapters or pages on the card, or tell me, like “chapter 3” or “pages 40–55”.`,
      meta: {},
    });
    return { episodeId: episode.id };
  }

  // ── Choosing its pages ──────────────────────────────────────────────────

  /** Pages chosen on the card: kept for the episode (or a series), and what is asked next said in the thread. */
  async usePages(
    userId: string,
    showId: string,
    request: StudioPagesRequest,
  ): Promise<{ episodeId: string }> {
    const show = await this.requireShow(userId, showId);
    const doc = await this.requireDocument(userId, request.documentId);
    const episodes = await this.studio.listEpisodes(show.id);
    const episode =
      episodes.find((e) => e.id === request.episodeId) ?? episodes.at(-1);
    if (!episode) throw new NotFoundError('Episode');
    const chosen = await this.choose(show, episode, doc, {
      ranges: request.ranges,
      topicIds: request.topicIds,
      series: Boolean(request.series),
    });
    await logEvent(
      this.studio,
      { showId: show.id, episodeId: chosen.episode.id },
      {
        what: 'pages',
        step: 'brief',
        documentId: doc.id,
        line: chosen.line,
      },
    );
    if (chosen.ask)
      await this.studio.addMessage({
        showId: show.id,
        episodeId: chosen.episode.id,
        role: 'assistant',
        content: chosen.ask.content,
        meta: {
          choices: chosen.ask.choices,
          ...(chosen.ask.also ? { also: chosen.ask.also } : {}),
        },
      });
    return { episodeId: chosen.episode.id };
  }

  /**
   * The pages the maker's words choose of the show's document, by code
   * ("chapter 4", "pages 40–55", "the part about osmosis"); null with no
   * document, or when the words choose none of it.
   */
  async heard(
    show: StudioShowRecord,
    words: string,
  ): Promise<PagesHeard | null> {
    const document = show.brief.document;
    if (!document) return null;
    return pickPages(
      words,
      await this.chaptersOf(document.documentId),
      document.pageCount,
    );
  }

  /**
   * Pages the maker chose in words, for the producer's turn: kept as the
   * card's would be. The thread's line for it is recorded here; what the
   * producer says next is returned.
   */
  async chooseHeard(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    heard: PagesHeard,
  ): Promise<PagesChosen> {
    const document = show.brief.document;
    if (!document) throw new ValidationError('Give me a document first.');
    const doc = await this.requireDocument(show.userId, document.documentId);
    const chosen = await this.choose(show, episode, doc, {
      ranges: heard.ranges,
      topicIds: heard.topicIds,
      series: false,
    });
    await logEvent(
      this.studio,
      { showId: show.id, episodeId: chosen.episode.id },
      {
        what: 'pages',
        step: 'brief',
        documentId: doc.id,
        line: chosen.line,
      },
    );
    return chosen;
  }

  /**
   * The heart of it: pages chosen (as chapters, or a range) kept on the
   * episode that teaches them, or on a series of episodes, one a chapter;
   * the brief made an explainer of the document, its length reckoned from
   * the pages and whom it is for read from the document where the maker
   * has not said; then the outline written when nothing is missing, or the
   * one thing still missing asked, with chips.
   */
  private async choose(
    show: StudioShowRecord,
    current: StudioEpisodeRecord,
    doc: NonNullable<Awaited<ReturnType<DocumentRepository['findById']>>>,
    asked: { ranges: unknown; topicIds: string[]; series: boolean },
  ): Promise<PagesChosen> {
    const pageCount = doc.props.pageCount ?? 0;
    if (pageCount < 1)
      throw new ValidationError(
        'That document is still being read. Choose its pages in a moment.',
      );
    const chapters = await this.chaptersOf(doc.id);
    const known = new Set(chapters.map((c) => c.id));
    const topicIds = asked.topicIds.filter((id) => known.has(id));
    const ranges = clampRanges(
      [
        ...(Array.isArray(asked.ranges) ? (asked.ranges as unknown[]) : []),
        ...rangesOfChapters(chapters, topicIds, pageCount),
      ],
      pageCount,
    );
    if (!ranges.length)
      throw new ValidationError('Choose a chapter or some pages first.');
    const picks: DocumentPick[] = asked.series
      ? seriesOf(ranges, chapters)
      : [{ ranges, topicIds, label: labelOf(ranges, topicIds, chapters) }];
    if (!picks.length)
      throw new ValidationError('Choose a chapter or some pages first.');
    if (!asked.series && pagesIn(ranges) > EPISODE_PAGES)
      throw new ValidationError(
        `An episode covers up to ${EPISODE_PAGES} pages. Choose fewer, or make it a series.`,
      );

    // The episode to teach the first: this one, unless it is written
    // already (then a new one), or busy.
    if (current.busy)
      throw new ValidationError(
        'I am still working on the last change; choose the pages again once it is done.',
      );
    const episodes = await this.studio.listEpisodes(show.id);
    let number = Math.max(0, ...episodes.map((e) => e.number));
    const fresh = current.phase === 'script' || current.phase === 'made';
    let episode: StudioEpisodeRecord;
    if (fresh) {
      number += 1;
      episode = await this.studio.createEpisode({
        showId: show.id,
        userId: show.userId,
        number,
        title: picks[0].label || `Episode ${number}`,
        phase: 'brief',
        pages: picks[0],
      });
    } else {
      await this.studio.updateEpisode(current.id, { pages: picks[0] });
      episode = { ...current, pages: picks[0] };
    }
    for (const pick of picks.slice(1)) {
      number += 1;
      await this.studio.createEpisode({
        showId: show.id,
        userId: show.userId,
        number,
        title: pick.label || `Episode ${number}`,
        phase: 'brief',
        pages: pick,
      });
    }

    // The brief: an explainer of this document, as long as its pages make.
    const each = Math.round(
      picks.reduce((n, p) => n + pagesIn(p.ranges), 0) / picks.length,
    );
    const document: BriefDocument = {
      documentId: doc.id,
      title: doc.props.title,
      pageCount,
      ...picks[0],
    };
    const before = show.brief;
    let brief: StudioBrief = briefOf(
      {
        format: before.format ?? 'explainer',
        idea:
          before.idea ||
          (picks.length > 1
            ? `Teach “${doc.props.title}”, one chapter an episode`
            : `${picks[0].label}, from “${doc.props.title}”`),
        ...(before.minutes ? {} : { minutes: minutesFor(each) }),
        document,
      },
      before,
    );
    brief.source = null;
    // Whom it is for, read from the document where the maker said nothing:
    // one chip to say yes to.
    let guessed = false;
    if (!brief.who && !brief.audience) {
      const text = (await this.pages.findRange(doc.id, 1, 4))
        .map((page) => page.text)
        .join('\n');
      const who = audienceOfDocument(doc.props.title, text);
      if (who) {
        brief = briefOf({ who }, brief);
        guessed = true;
      }
    }
    await this.studio.updateShow(show.id, {
      brief,
      format: brief.format,
      documentId: doc.id,
    });

    const line =
      picks.length > 1
        ? `A series of ${picks.length} episodes from “${doc.props.title}”, one a chapter`
        : `Using ${picks[0].label} (${pagesWords(picks[0].ranges)}) of “${doc.props.title}”`;

    // What comes next: the outline, or the one thing it still needs.
    const missing = briefMissing(brief);
    let ask: PagesChosen['ask'] = null;
    if (guessed && brief.who) {
      const chip =
        AUDIENCE_CHIPS.find((c) => c.band === brief.who!.band)?.label ??
        BAND_WORDS[brief.who.band];
      ask = {
        content: `It reads like it's for ${whoLine(brief.who)}. Is that who it's for?`,
        choices: [`Yes, ${chip}`],
      };
    } else if (missing.includes('audience'))
      ask = {
        content: 'Who is it for?',
        choices: AUDIENCE_CHIPS.map((c) => c.label),
        also: PRIOR_CHIPS.map((c) => c.label),
      };
    else if (missing.length)
      ask = {
        content: missing.includes('tone')
          ? 'How should it feel?'
          : 'What else should I know before I plan it?',
        choices: missing.includes('tone') ? TONE_CHIPS : [],
      };
    else if (await this.studio.claimEpisode(episode.id, 'outline')) {
      await this.queue.enqueueStudio([
        {
          kind: 'outline',
          showId: show.id,
          episodeId: episode.id,
          userId: show.userId,
        },
      ]);
    }
    this.logger.log(
      `studio ${show.id}: pages of ${doc.id} chosen: ${picks
        .map((p) => pagesWords(p.ranges))
        .join(
          ' | ',
        )}${guessed ? `; for ${brief.who?.band}, read from it` : ''}`,
    );
    return { episode, more: picks.length - 1, ask, line };
  }
}

/** A document's status as the Studio's cards say it. */
function statusOf(status: string): StudioDocumentDto['status'] {
  return status === 'ready'
    ? 'ready'
    : status === 'failed'
      ? 'failed'
      : 'reading';
}
