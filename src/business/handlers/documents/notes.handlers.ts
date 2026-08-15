import { Inject, Injectable } from '@nestjs/common';
import type {
  AllNotesResponse,
  NoteDto,
  NoteSource,
  NotesResponse,
} from '../../../contracts';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { noteBody, notePage, noteQuote } from '../../domain/values/notes';
import { NOTE_REPOSITORY } from '../../repositories/tokens';
import type {
  NoteRecord,
  NoteRepository,
} from '../../repositories/note.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';

const MAX_PAGE_SIZE = 100;

export const toNoteDto = (note: NoteRecord): NoteDto => ({
  id: note.id,
  body: note.body,
  pageNumber: note.pageNumber,
  topicId: note.topicId,
  quotedText: note.quotedText,
  source: note.source,
  createdAt: note.createdAt.toISOString(),
  updatedAt: note.updatedAt.toISOString(),
});

export interface CreateNoteRequest {
  userId: string;
  documentId: string;
  body: string;
  pageNumber?: number | null;
  topicId?: string | null;
  quotedText?: string | null;
  source?: NoteSource;
}

/**
 * Writing a note down.
 *
 * Deliberately the dullest handler in the codebase: no model call, no queue,
 * no entitlement. A note is the reader's own words, so the only thing between
 * the composer and the row is validation — which is what lets the panel treat
 * a save as instant and never explain itself.
 *
 * The page is attached rather than required. A note taken while reading knows
 * its page and can jump back to it later; a note taken in a lesson, or about
 * the document as a whole, has none, and inventing one would make the jump a
 * lie.
 */
@Injectable()
export class CreateNoteHandler extends AbstractRequestHandlerTemplate<
  CreateNoteRequest,
  NoteDto
> {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: CreateNoteRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    const note = await this.notes.create({
      documentId: cmd.documentId,
      userId: cmd.userId,
      body: noteBody(cmd.body),
      // Page numbers are checked against the document the note is on, so a
      // stale client can't file a note on page 900 of a 40-page document.
      pageNumber: notePage(cmd.pageNumber, doc.props.pageCount ?? undefined),
      topicId: cmd.topicId ?? null,
      quotedText: noteQuote(cmd.quotedText),
      source: cmd.source ?? 'typed',
    });

    return CommandResponse.of(toNoteDto(note));
  }
}

export interface ListNotesRequest {
  userId: string;
  documentId: string;
  limit?: number;
  /** Keyset cursor: the createdAt of the oldest note already on screen. */
  before?: string;
}

@Injectable()
export class ListNotesHandler extends AbstractRequestHandlerTemplate<
  ListNotesRequest,
  NotesResponse
> {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: ListNotesRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const limit = Math.min(Math.max(cmd.limit ?? 50, 1), MAX_PAGE_SIZE);
    const before = cmd.before ? new Date(cmd.before) : undefined;
    if (before && Number.isNaN(before.getTime())) {
      throw new ValidationError('That cursor is not a valid timestamp');
    }

    const { notes, hasMore } = await this.notes.page(
      cmd.documentId,
      cmd.userId,
      limit,
      before,
    );

    return CommandResponse.of({ notes: notes.map(toNoteDto), hasMore });
  }
}

export interface ListAllNotesRequest {
  userId: string;
  limit?: number;
  before?: string;
}

/**
 * Every note this reader has written, across their documents.
 *
 * No document id and so no access check on one: the scope *is* the user, and
 * the query is keyed by their id. Each note names the document it came from,
 * because read here it has lost the context that made it make sense.
 */
@Injectable()
export class ListAllNotesHandler extends AbstractRequestHandlerTemplate<
  ListAllNotesRequest,
  AllNotesResponse
> {
  constructor(@Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository) {
    super();
  }

  protected async handleRequest(cmd: ListAllNotesRequest) {
    const limit = Math.min(Math.max(cmd.limit ?? 50, 1), MAX_PAGE_SIZE);
    const before = cmd.before ? new Date(cmd.before) : undefined;
    if (before && Number.isNaN(before.getTime())) {
      throw new ValidationError('That cursor is not a valid timestamp');
    }

    const { notes, hasMore } = await this.notes.pageForUser(
      cmd.userId,
      limit,
      before,
    );

    return CommandResponse.of({
      notes: notes.map((note) => ({
        ...toNoteDto(note),
        documentId: note.documentId,
        documentTitle: note.documentTitle,
      })),
      hasMore,
    });
  }
}

export interface UpdateNoteRequest {
  userId: string;
  documentId: string;
  noteId: string;
  body: string;
}

/**
 * Editing a note.
 *
 * Only the body can change. The page, the quoted passage and the source are
 * the record of where the note came from — rewriting those would turn a note
 * taken on page 12 into one that claims to be from somewhere else.
 */
@Injectable()
export class UpdateNoteHandler extends AbstractRequestHandlerTemplate<
  UpdateNoteRequest,
  NoteDto
> {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: UpdateNoteRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const note = await this.notes.updateBody(
      cmd.noteId,
      cmd.userId,
      noteBody(cmd.body),
    );
    if (!note) throw new NotFoundError('Note');

    return CommandResponse.of(toNoteDto(note));
  }
}

export interface DeleteNoteRequest {
  userId: string;
  documentId: string;
  noteId: string;
}

@Injectable()
export class DeleteNoteHandler extends AbstractRequestHandlerTemplate<
  DeleteNoteRequest,
  void
> {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: DeleteNoteRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const removed = await this.notes.remove(cmd.noteId, cmd.userId);
    if (!removed) throw new NotFoundError('Note');

    return CommandResponse.empty();
  }
}
