import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminUploadIntentRequest,
  AdminUploadIntentResponse,
  MoveMaterialRequest,
  PrepareEstimateDto,
  PrepareRequest,
  PrepareResponse,
} from '../../../contracts';
import { PipelineOrchestrator } from '../../../pipeline/orchestrator.service';
import { estimatePrepare } from '../../domain/cost';
import type { Document } from '../../domain/entities/document';
import {
  NotFoundError,
  UnsupportedFormatError,
  ValidationError,
} from '../../domain/errors/errors';
import { LECTURE_STYLE_KEYS } from '../../../contracts';
import { effectiveStatus } from '../../domain/lecture';
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../../domain/values';
import { STORAGE } from '../../ports/tokens';
import type { StoragePort } from '../../ports/storage.port';
import {
  DOCUMENT_REPOSITORY,
  INSTITUTION_REPOSITORY,
  LECTURE_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentRepository } from '../../repositories/document.repository';
import type { InstitutionRepository } from '../../repositories/institution.repository';
import type { LectureRepository } from '../../repositories/lecture.repository';
import type { PipelineRunRepository } from '../../repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { GenerateLectureHandler } from '../documents/lecture.handlers';

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
  hasEasiest: boolean;
  /** Styles whose every page has its words, voiced or not. */
  scripted: string[];
  /** Styles with lecture rows already, written or on their way. */
  styles: string[];
}

/**
 * Preparing a school's documents ahead of any student: the easiest notes
 * and the lecture in the styles asked for, on top of the pipeline every
 * upload runs. The estimate is the same arithmetic as the run, so the
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
        hasEasiest: todo.hasEasiest,
        styles: todo.styles as never,
        scripted: todo.scripted as never,
      })),
      easiest: cmd.easiest,
      styles,
    });
    if (cmd.dryRun) {
      return CommandResponse.of({ ...estimate, queued: 0, skipped: 0 });
    }

    let queued = 0;
    let skipped = 0;
    for (const todo of todos) {
      if (todo.needsPipeline) {
        skipped += 1;
        continue;
      }
      let did = false;
      // Voice again: every done row back to scripted, words kept. A page
      // whose spoken form is unchanged is found in storage and marked done
      // at once; only pages whose words the voice now says differently
      // are made anew. The style guard below is passed, since nothing is
      // fully voiced after the reset.
      const revoiced = cmd.revoice
        ? await this.lectures.resetAudio(todo.doc.id, todo.doc.contentVersion)
        : 0;
      if (cmd.easiest && !todo.hasEasiest) {
        await this.pipeline.fanOutSimplify(
          todo.doc.id,
          todo.doc.contentVersion,
          'easiest',
        );
        did = true;
      }
      for (const style of styles) {
        if (todo.styles.includes(style) && !revoiced) continue;
        try {
          await this.generate.handle({
            userId: cmd.userId,
            documentId: todo.doc.id,
            style,
            asAdmin: true,
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
    return CommandResponse.of({ ...estimate, queued, skipped });
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
      const easiest = through
        ? await this.simplified.progress(doc.id, 'easiest')
        : { total: 0, done: 0, failed: 0 };
      const rows = through
        ? await this.lectures.listSegments(doc.id, doc.contentVersion)
        : [];
      // A style is there only when every one of its pages is voiced. One
      // failed or unvoiced page means Prepare asks for it again, and the
      // lecture handler retries just what is missing.
      const byStyle = new Map<string, boolean>();
      const wordsByStyle = new Map<string, boolean>();
      for (const row of rows) {
        if (row.kind !== 'page') continue;
        const done = effectiveStatus(row) === 'done';
        byStyle.set(row.style, (byStyle.get(row.style) ?? true) && done);
        wordsByStyle.set(
          row.style,
          (wordsByStyle.get(row.style) ?? true) && Boolean(row.scriptText),
        );
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
        hasEasiest: easiest.total > 0,
        styles,
        scripted,
      });
    }
    return out;
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
