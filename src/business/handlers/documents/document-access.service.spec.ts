import { Document } from '../../domain/entities/document';
import { NotFoundError, ForbiddenError } from '../../domain/errors/errors';
import { DocumentAccessService } from './document-access.service';

const doc = (institutionId: string | null) =>
  new Document({
    id: 'd1',
    userId: 'admin',
    title: 'Palliative care',
    fileName: 'palliative.pdf',
    status: 'ready',
    pageCount: 27,
    sourceMimeType: 'application/pdf',
    sizeBytes: 1,
    source: 'uploaded',
    brief: null,
    sourceUrl: null,
    importManifest: null,
    originalFileRef: null,
    canonicalPdfRef: 'x',
    thumbnailRef: null,
    contentVersion: 1,
    simplificationUnavailable: false,
    failureReason: null,
    deletedAt: null,
    createdAt: new Date(),
    institutionId,
    departmentId: null,
    levelId: null,
    courseId: null,
    contentHash: null,
    orderIndex: 0,
  });

const service = (shared: Document, members: string[]) =>
  new DocumentAccessService(
    { findById: () => Promise.resolve(shared) } as never,
    { liveSessionDocumentAccess: () => Promise.resolve(false) } as never,
    {
      isMember: (userId: string, institutionId: string) =>
        Promise.resolve(institutionId === 'ur' && members.includes(userId)),
    } as never,
  );

describe('who may touch a document', () => {
  it('lets every member of the school read a shared document, and nobody else', async () => {
    const access = service(doc('ur'), ['student']);
    await expect(access.require('d1', 'admin')).resolves.toBeInstanceOf(
      Document,
    );
    await expect(access.require('d1', 'student')).resolves.toBeInstanceOf(
      Document,
    );
    await expect(access.require('d1', 'stranger')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('keeps a personal document to its owner', async () => {
    const access = service(doc(null), ['student']);
    await expect(access.require('d1', 'admin')).resolves.toBeInstanceOf(
      Document,
    );
    await expect(access.require('d1', 'student')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("refuses to change or remove a school's document for anyone, even the admin who uploaded it", async () => {
    const access = service(doc('ur'), ['student']);
    await expect(access.requireOwned('d1', 'admin')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(access.requireOwned('d1', 'student')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(access.requireOwned('d1', 'stranger')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('lets only the owner change or remove a personal document, not a classmate reading along', async () => {
    const access = new DocumentAccessService(
      { findById: () => Promise.resolve(doc(null)) } as never,
      {
        liveSessionDocumentAccess: (userId: string) =>
          Promise.resolve(userId === 'classmate'),
      } as never,
      { isMember: () => Promise.resolve(false) } as never,
    );
    await expect(access.require('d1', 'classmate')).resolves.toBeInstanceOf(
      Document,
    );
    await expect(access.requireOwned('d1', 'classmate')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(access.requireOwned('d1', 'admin')).resolves.toBeInstanceOf(
      Document,
    );
  });

  it('keeps owner-only actions with the admin who uploaded', () => {
    const access = service(doc('ur'), ['student']);
    expect(() => access.assertOwner(doc('ur'), 'student')).toThrow(
      ForbiddenError,
    );
    expect(() => access.assertOwner(doc('ur'), 'admin')).not.toThrow();
  });
});
