import { Inject, Injectable } from '@nestjs/common';
import { Document } from '../../domain/entities/document';
import { ForbiddenError, NotFoundError } from '../../domain/errors/errors';
import {
  DOCUMENT_REPOSITORY,
  GROUP_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentRepository } from '../../repositories/document.repository';
import type { GroupRepository } from '../../repositories/group.repository';

/**
 * One place that answers "may this user touch this document?".
 *
 * The technical design flags §10 that AI Examiner shipped endpoints which never
 * checked ownership at all. Every document-scoped handler goes through here, so
 * the check can't be forgotten on a new endpoint.
 */
@Injectable()
export class DocumentAccessService {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(GROUP_REPOSITORY) private readonly groups: GroupRepository,
  ) {}

  async require(documentId: string, userId: string): Promise<Document> {
    const doc = await this.documents.findById(documentId);
    // A document that exists but belongs to someone else reports as missing,
    // so ids can't be probed for existence.
    if (!doc || doc.props.deletedAt) throw new NotFoundError('Document');
    if (!doc.isOwnedBy(userId)) {
      // Classroom (classroom plan §4): a member of a LIVE group session on
      // this document reads it for the session's duration. Read-only in
      // effect: everything the reader writes is keyed to their own user, and
      // access evaporates when the session ends.
      const inSession = await this.groups.liveSessionDocumentAccess(
        userId,
        documentId,
      );
      if (!inSession) throw new NotFoundError('Document');
    }
    return doc;
  }

  async requireReadable(documentId: string, userId: string): Promise<Document> {
    const doc = await this.require(documentId, userId);
    doc.requireReadable();
    return doc;
  }

  /** Used by the file endpoints, where a missing owner is a hard 403. */
  assertOwner(doc: Document, userId: string): void {
    if (!doc.isOwnedBy(userId)) throw new ForbiddenError();
  }
}
