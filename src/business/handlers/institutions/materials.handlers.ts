import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AdminUploadIntentRequest,
  AdminUploadIntentResponse,
  LectureStyle,
  MoveMaterialRequest,
  PrepareEstimateDto,
  PrepareRequest,
  PrepareResponse,
  PublishRequest,
  VoiceRequest,
  VoiceResponse,
  VisualsRequest,
  VisualsResponse,
} from '../../../contracts';
import { PipelineOrchestrator } from '../../../pipeline/orchestrator.service';
import { estimatePrepare } from '../../domain/cost';
import type { Document } from '../../domain/entities/document';
import {
  AlreadyInProgressError,
  NotFoundError,
  UnsupportedFormatError,
  ValidationError,
  VoiceUnavailableError,
} from '../../domain/errors/errors';
import { LECTURE_STYLE_KEYS } from '../../../contracts';
import { effectiveStatus } from '../../domain/lecture';
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../../domain/values';
import { CLOCK, JOB_QUEUE, LECTURE_SPEECH, STORAGE } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { JobQueuePort } from '../../ports/job-queue.port';
import type { SpeechPort } from '../../ports/voice.port';
import type { StoragePort } from '../../ports/storage.port';
import {
  DOCUMENT_REPOSITORY,
  INSTITUTION_REPOSITORY,
  LECTURE_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  TOPIC_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  VISUAL_SCENE_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentRepository } from '../../repositories/document.repository';
import type { InstitutionRepository } from '../../repositories/institution.repository';
import type {
  LectureRepository,
  SegmentKey,
} from '../../repositories/lecture.repository';
import type { PipelineRunRepository } from '../../repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { GenerateLectureHandler } from '../documents/lecture.handlers';
import { queueVisuals } from '../documents/visual.handlers';
import type { TopicRepository } from '../../repositories/misc.repository';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type { VisualSceneRepository } from '../../repositories/visual.repository';

const HASH = /^[a-f0-9]{64}$/;

/**
 * The admin's upload into a course. The hash comes first: a file the
 * school already has is reported as a duplicate and never sends its bytes.
 * No plan limit applies; the admin is the platform. The bytes then take the
 * same path a personal upload does, and the pipeline starts the same way.
 */
@Injectable()
export class AdminUploadIntentHandler extends AbstractRequestHandlerTemplate<
  AdminUploadIntentRequest & { userId: string; institutionId: string },
  AdminUploadIntentResponse
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: AdminUploadIntentRequest & { userId: string; institutionId: string },
  ) {
    const department = await this.institutions.findDepartment(cmd.departmentId);
    if (!department || department.institutionId !== cmd.institutionId) {
      throw new NotFoundError('Department');
    }
    if (cmd.levelId) {
      const level = await this.institutions.findLevel(cmd.levelId);
      if (!level || level.institutionId !== cmd.institutionId) {
        throw new NotFoundError('Level');
      }
    }
    // A course belongs to its department and, when it has one, its year: a
    // file dropped into a course lands where the course is.
    let levelId = cmd.levelId ?? null;
    if (cmd.courseId) {
      const course = await this.institutions.findCourse(cmd.courseId);
      if (!course || course.institutionId !== cmd.institutionId) {
        throw new NotFoundError('Course');
      }
      if (course.departmentId !== department.id) {
        throw new ValidationError('That course is in another department');
      }
      if (course.levelId) levelId = course.levelId;
    }
    const extension = ACCEPTED_MIME_TYPES[cmd.mimeType];
    if (!extension) {
      throw new UnsupportedFormatError(
        cmd.filename.split('.').pop() ??
          cmd.mimeType.split('/').pop() ??
          'file',
      );
    }
    if (cmd.sizeBytes <= 0 || cmd.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new ValidationError('That file size is not accepted', {
        maxBytes: MAX_UPLOAD_BYTES,
      });
    }
    const contentHash = cmd.contentHash.trim().toLowerCase();
    if (!HASH.test(contentHash)) {
      throw new ValidationError('The file hash must be a SHA-256 in hex');
    }
    const existing = await this.documents.findByHash(
      cmd.institutionId,
      contentHash,
    );
    if (existing) {
      return CommandResponse.of({
        duplicateOf: existing.id,
        title: existing.props.title,
      });
    }
    const siblings = await this.documents.listByPlacement({
      institutionId: cmd.institutionId,
      departmentId: department.id,
      levelId,
    });
    const document = await this.documents.create({
      userId: cmd.userId,
      title: stripExtension(cmd.filename),
      fileName: cmd.filename,
      sourceMimeType: cmd.mimeType,
      sizeBytes: cmd.sizeBytes,
      institutionId: cmd.institutionId,
      departmentId: department.id,
      levelId,
      courseId: cmd.courseId ?? null,
      contentHash,
      orderIndex: cmd.orderIndex ?? siblings.length,
      uploadBatchId: cmd.batchId ?? null,
    });
    const target = await this.storage.createUploadTarget({
      documentId: document.id,
      filename: cmd.filename,
      mimeType: cmd.mimeType,
      sizeBytes: cmd.sizeBytes,
    });
    return CommandResponse.of({
      documentId: document.id,
      uploadUrl: target.uploadUrl,
      uploadMode: target.uploadMode,
    });
  }
}

/** A material moved to another course, reordered, or retitled. */
@Injectable()
export class MoveMaterialHandler extends AbstractRequestHandlerTemplate<
  MoveMaterialRequest & {
    userId: string;
    institutionId: string;
    documentId: string;
  },
  { ok: true }
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: MoveMaterialRequest & { institutionId: string; documentId: string },
  ) {
    const doc = await this.documents.findById(cmd.documentId);
    if (!doc || doc.props.institutionId !== cmd.institutionId) {
      throw new NotFoundError('Document');
    }
    if (cmd.departmentId !== undefined) {
      const department = await this.institutions.findDepartment(
        cmd.departmentId,
      );
      if (!department || department.institutionId !== cmd.institutionId) {
        throw new NotFoundError('Department');
      }
      doc.props.departmentId = department.id;
    }
    if (cmd.levelId !== undefined) {
      if (cmd.levelId) {
        const level = await this.institutions.findLevel(cmd.levelId);
        if (!level || level.institutionId !== cmd.institutionId) {
          throw new NotFoundError('Level');
        }
      }
      doc.props.levelId = cmd.levelId;
    }
    // A course belongs to its department and, when it has one, its year. A
    // file put in a course goes where the course is; a file moved to another
    // place leaves a course that is not there.
    if (cmd.courseId) {
      const course = await this.institutions.findCourse(cmd.courseId);
      if (!course || course.institutionId !== cmd.institutionId) {
        throw new NotFoundError('Course');
      }
      if (course.departmentId !== doc.props.departmentId) {
        throw new ValidationError('That course is in another department');
      }
      if (course.levelId) doc.props.levelId = course.levelId;
      doc.props.courseId = course.id;
    } else if (cmd.courseId === null) {
      doc.props.courseId = null;
    } else if (
      doc.props.courseId &&
      (cmd.departmentId !== undefined || cmd.levelId !== undefined)
    ) {
      const course = await this.institutions.findCourse(doc.props.courseId);
      const stays =
        course &&
        course.departmentId === doc.props.departmentId &&
        (!course.levelId || course.levelId === doc.props.levelId);
      if (!stays) doc.props.courseId = null;
    }
    if (cmd.orderIndex !== undefined) doc.props.orderIndex = cmd.orderIndex;
    if (cmd.title !== undefined) {
      const title = cmd.title.trim();
      if (!title) throw new ValidationError('A title is needed');
      doc.props.title = title;
    }
    if (cmd.published === true) doc.publish(this.clock.now());
    if (cmd.published === false) doc.hide();
    await this.documents.save(doc);
    return CommandResponse.of({ ok: true as const });
  }
}

export interface RemoveMaterialRequest {
  institutionId: string;
  documentId: string;
}

/**
 * A file removed from the school: the one door to deleting a school's
 * document. The same soft delete as a personal document, so the purge
 * job's recovery window applies.
 */
@Injectable()
export class RemoveMaterialHandler extends AbstractRequestHandlerTemplate<
  RemoveMaterialRequest,
  { ok: true }
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: RemoveMaterialRequest) {
    const doc = await this.documents.findById(cmd.documentId);
    if (
      !doc ||
      doc.props.deletedAt ||
      doc.props.institutionId !== cmd.institutionId
    ) {
      throw new NotFoundError('Document');
    }
    doc.softDelete(this.clock.now());
    await this.documents.save(doc);
    return CommandResponse.of({ ok: true as const });
  }
}

interface PrepareCommand extends PrepareRequest {
  userId: string;
  institutionId: string;
}

/** What each document still needs, for both the estimate and the run. */
interface PrepareTodo {
  doc: Document;
  pages: number;
  /** Not through its own upload pipeline yet: nothing can be added on top. */
  needsPipeline: boolean;
  /** Styles whose every page has its words, voiced or not. */
  scripted: string[];
  /** Styles with lecture rows already, written or on their way. */
  styles: string[];
  /** Styles with a page that failed before it had words: the chapter's retry rewrites it. */
  failed: string[];
}

/**
 * Preparing a school's documents ahead of any student: the lecture in
 * the styles asked for, its words only, on top of the pipeline every
 * upload runs. The audio is asked for separately, by the batch, through
 * VoiceMaterialsHandler. The estimate is the same arithmetic as the run, so the
 * number shown before the button is the number the ledger will confirm.
 */
@Injectable()
export class PrepareMaterialsHandler extends AbstractRequestHandlerTemplate<
  PrepareCommand & { dryRun?: boolean },
  PrepareResponse
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
    @Inject(PIPELINE_RUN_REPOSITORY)
    private readonly runs: PipelineRunRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    private readonly pipeline: PipelineOrchestrator,
    private readonly generate: GenerateLectureHandler,
    private readonly config: ConfigService,
  ) {
    super();
  }

  protected async handleRequest(cmd: PrepareCommand & { dryRun?: boolean }) {
    const styles = cmd.styles.filter((style) =>
      (LECTURE_STYLE_KEYS as readonly string[]).includes(style),
    );
    const todos = await this.todos(cmd);
    const estimate: PrepareEstimateDto = estimatePrepare({
      documents: todos.map((todo) => ({
        pages: todo.pages,
        needsPipeline: todo.needsPipeline,
        styles: todo.styles as never,
        scripted: todo.scripted as never,
      })),
      styles,
      usdPerAudioHour: Number(
        this.config.get<string>('MODAL_USD_PER_AUDIO_HOUR', '0'),
      ),
    });
    // Words only: no audio is made here, so none is priced here.
    const written: PrepareEstimateDto = {
      ...estimate,
      audioUsd: 0,
      totalUsd: estimate.textUsd,
    };
    if (cmd.dryRun) {
      return CommandResponse.of({ ...written, queued: 0, skipped: 0 });
    }

    const { queued, skipped } = await this.queueAll(cmd, todos, styles);
    return CommandResponse.of({ ...written, queued, skipped });
  }

  private async queueAll(
    cmd: PrepareCommand,
    todos: PrepareTodo[],
    styles: LectureStyle[],
  ): Promise<{ queued: number; skipped: number }> {
    let queued = 0;
    let skipped = 0;
    for (const todo of todos) {
      if (todo.needsPipeline) {
        skipped += 1;
        continue;
      }
      let did = false;
      for (const style of styles) {
        // A style with every page written, voiced or waiting to be, needs
        // no words; a failed page is rewritten by the chapter's retry.
        if (todo.scripted.includes(style) && !todo.failed.includes(style)) {
          continue;
        }
        try {
          await this.generate.handle({
            userId: cmd.userId,
            documentId: todo.doc.id,
            style,
            asAdmin: true,
            voice: false,
          });
          did = true;
        } catch (error) {
          // A document with no chapters yet, or a lecture mid-write: left
          // for the next run rather than failing the batch.
          this.logger.warn(
            `${todo.doc.id} ${style}: not queued: ${(error as Error).message}`,
          );
        }
      }
      if (did) queued += 1;
      else skipped += 1;
    }
    return { queued, skipped };
  }

  private async todos(cmd: PrepareCommand): Promise<PrepareTodo[]> {
    let docs: Document[];
    if (cmd.documentIds?.length) {
      const found = await Promise.all(
        cmd.documentIds.map((id) => this.documents.findById(id)),
      );
      docs = found.filter(
        (doc): doc is Document =>
          doc !== null && doc.props.institutionId === cmd.institutionId,
      );
    } else if (cmd.courseId) {
      const course = await this.institutions.findCourse(cmd.courseId);
      if (!course || course.institutionId !== cmd.institutionId) {
        throw new NotFoundError('Course');
      }
      docs = await this.documents.listByCourse(course.id);
    } else if (cmd.departmentId || cmd.levelId) {
      docs = await this.documents.listByPlacement({
        institutionId: cmd.institutionId,
        departmentId: cmd.departmentId ?? null,
        levelId: cmd.levelId ?? null,
      });
    } else {
      docs = await this.documents.listByInstitution(cmd.institutionId);
    }
    const out: PrepareTodo[] = [];
    for (const doc of docs) {
      const pages = doc.props.pageCount ?? 0;
      const through =
        pages > 0 &&
        (await this.runs.allDone(doc.id, [
          'convert',
          'extract',
          'summarize',
          'topics',
          'simplify_standard',
        ]));
      const rows = through
        ? await this.lectures.listSegments(doc.id, doc.contentVersion)
        : [];
      // A style is there only when every one of its pages is voiced. One
      // failed or unvoiced page means Prepare asks for it again, and the
      // lecture handler retries just what is missing.
      const byStyle = new Map<string, boolean>();
      const wordsByStyle = new Map<string, boolean>();
      const failedByStyle = new Set<string>();
      for (const row of rows) {
        // Pages and their second pieces: a part without words holds the
        // style as surely as a page without them.
        if (row.kind !== 'page' && row.kind !== 'part') continue;
        const status = effectiveStatus(row);
        const done = status === 'done';
        byStyle.set(row.style, (byStyle.get(row.style) ?? true) && done);
        wordsByStyle.set(
          row.style,
          (wordsByStyle.get(row.style) ?? true) && Boolean(row.scriptText),
        );
        if (status === 'failed' && !row.scriptText) {
          failedByStyle.add(row.style);
        }
      }
      const styles = Array.from(byStyle.entries())
        .filter(([, whole]) => whole)
        .map(([style]) => style);
      const scripted = Array.from(wordsByStyle.entries())
        .filter(([, whole]) => whole)
        .map(([style]) => style);
      out.push({
        doc,
        pages,
        needsPipeline: !through,
        styles,
        scripted,
        failed: Array.from(failedByStyle),
      });
    }
    return out;
  }
}

/** The files a batch, a selection, or one document names, all of this school. */
async function namedDocuments(
  documents: DocumentRepository,
  institutionId: string,
  input: { batchId?: string; documentIds?: string[] },
): Promise<Document[]> {
  if (input.documentIds?.length) {
    const found = await Promise.all(
      input.documentIds.map((id) => documents.findById(id)),
    );
    return found.filter(
      (doc): doc is Document =>
        doc !== null &&
        doc.props.institutionId === institutionId &&
        doc.props.deletedAt === null,
    );
  }
  if (input.batchId) {
    const all = await documents.listByInstitution(institutionId);
    return all.filter((doc) => doc.props.uploadBatchId === input.batchId);
  }
  throw new ValidationError('Name a batch or the files');
}

export interface VoiceCommand extends VoiceRequest {
  userId: string;
  institutionId: string;
}

/**
 * The admin sending a batch to the voice: every row with its words and no
 * audio, in the styles asked, queued in one go. Refused while any file
 * named is still being written, so a batch is voiced whole; refused when
 * the rented voice does not answer, so a sleeping or disabled service
 * never turns a batch into failed pages. Asking wakes a sleeping one.
 */
@Injectable()
export class VoiceMaterialsHandler extends AbstractRequestHandlerTemplate<
  VoiceCommand,
  VoiceResponse
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    @Inject(LECTURE_SPEECH) private readonly speech: SpeechPort,
    private readonly config: ConfigService,
  ) {
    super();
  }

  protected async handleRequest(cmd: VoiceCommand) {
    const asked: readonly LectureStyle[] = cmd.styles?.length
      ? cmd.styles
      : LECTURE_STYLE_KEYS;
    const styles = asked.filter((style) =>
      (LECTURE_STYLE_KEYS as readonly string[]).includes(style),
    );
    const docs = await namedDocuments(this.documents, cmd.institutionId, cmd);
    if (!docs.length) throw new NotFoundError('Document');

    // Whole or not at all: a file still in its text pipeline or still
    // writing holds the batch, and the answer names it.
    const keysByDoc = new Map<string, SegmentKey[]>();
    const waiting: string[] = [];
    for (const doc of docs) {
      if (doc.props.status !== 'ready') {
        waiting.push(doc.props.title);
        continue;
      }
      const rows = await this.lectures.listSegments(doc.id, doc.contentVersion);
      const mine = rows.filter((row) => styles.includes(row.style));
      const stillWriting = mine.some((row) => {
        const status = effectiveStatus(row);
        return status === 'pending' || status === 'writing';
      });
      if (!mine.length || stillWriting) {
        waiting.push(doc.props.title);
        continue;
      }
      if (cmd.revoice) {
        await this.lectures.resetAudio(doc.id, doc.contentVersion);
      }
      keysByDoc.set(
        doc.id,
        mine
          .filter((row) => {
            const status = effectiveStatus(row);
            return (
              Boolean(row.scriptText) &&
              status !== 'voicing' &&
              (cmd.revoice || status !== 'done')
            );
          })
          .map((row) => ({
            documentId: doc.id,
            contentVersion: doc.contentVersion,
            pageNumber: row.pageNumber,
            style: row.style,
            kind: row.kind,
          })),
      );
    }
    if (waiting.length) {
      const named = waiting.slice(0, 3).join(', ');
      throw new AlreadyInProgressError(
        `${waiting.length === 1 ? 'One file is' : `${waiting.length} files are`} still being written: ${named}${waiting.length > 3 ? '…' : ''}. Nothing was queued.`,
      );
    }
    const keys = Array.from(keysByDoc.values()).flat();
    if (keys.length && this.speech.ready && !(await this.speech.ready())) {
      throw new VoiceUnavailableError();
    }
    if (keys.length) {
      await this.lectures.markSegmentsVoicing(keys);
      await this.queue.enqueueLectureVoices(keys);
    }
    // Priced as the rows queued, each a page of audio at the measured rate.
    const audioUsd = estimatePrepare({
      documents: [
        {
          pages: keys.length,
          needsPipeline: false,
          styles: [],
          scripted: ['gentle'],
        },
      ],
      styles: ['gentle'],
      usdPerAudioHour: Number(
        this.config.get<string>('MODAL_USD_PER_AUDIO_HOUR', '0'),
      ),
    }).audioUsd;
    return CommandResponse.of({
      documents: docs.length,
      queued: keys.length,
      audioUsd,
    });
  }
}

export interface VisualsCommand extends VisualsRequest {
  userId: string;
  institutionId: string;
}

/**
 * The admin sending a batch, a selection, or one file to be drawn whole:
 * every page of every file named gets its tutorial, so a published
 * document has them before a student opens it. A file still in its
 * text pipeline is skipped and counted in the answer.
 */
@Injectable()
export class VisualsMaterialsHandler extends AbstractRequestHandlerTemplate<
  VisualsCommand,
  VisualsResponse
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(VISUAL_SCENE_REPOSITORY)
    private readonly visuals: VisualSceneRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
  ) {
    super();
  }

  protected async handleRequest(cmd: VisualsCommand) {
    const docs = await namedDocuments(this.documents, cmd.institutionId, cmd);
    if (!docs.length) throw new NotFoundError('Document');
    let queued = 0;
    let existing = 0;
    let documents = 0;
    for (const doc of docs) {
      if (doc.props.status !== 'ready') continue;
      documents += 1;
      const result = await queueVisuals(
        {
          topics: this.topics,
          pages: this.pages,
          visuals: this.visuals,
          queue: this.queue,
        },
        { doc, userId: cmd.userId, mode: 'whole', fromPage: 1 },
      );
      queued += result.queued;
      existing += result.existing;
    }
    return CommandResponse.of({ documents, queued, existing });
  }
}

export interface PublishCommand extends PublishRequest {
  institutionId: string;
}

/** Publish a batch, a selection, or one file to the school's students, or hide it again. Nothing is processed or deleted. */
@Injectable()
export class PublishMaterialsHandler extends AbstractRequestHandlerTemplate<
  PublishCommand,
  { ok: true; changed: number }
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: PublishCommand) {
    const docs = await namedDocuments(this.documents, cmd.institutionId, cmd);
    let changed = 0;
    const now = this.clock.now();
    for (const doc of docs) {
      const was = doc.isPublished();
      if (cmd.published) doc.publish(now);
      else doc.hide();
      if (doc.isPublished() !== was) {
        await this.documents.save(doc);
        changed += 1;
      }
    }
    return CommandResponse.of({ ok: true as const, changed });
  }
}

/** "deck.pptx.pdf" is "deck": every trailing extension we accept comes off, not only the last. */
function stripExtension(filename: string): string {
  let name = filename;
  for (;;) {
    const trimmed = name.replace(/\.(pdf|pptx|docx|ppt|doc)$/i, '');
    if (trimmed === name || !trimmed) return name;
    name = trimmed;
  }
}
