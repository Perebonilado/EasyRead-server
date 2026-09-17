import { Document } from '../../business/domain/entities/document';
import { User } from '../../business/domain/entities/user';
import type { DocumentModel, UserModel } from '../database/models';

/**
 * Model → entity. Keeping this in one place stops Sequelize types leaking into
 * the business layer, which is the whole point of the boundary.
 */
export function toUser(row: UserModel): User {
  return new User({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    googleId: row.googleId,
    name: row.name,
    emailVerifiedAt: row.emailVerifiedAt,
    verificationTokenHash: row.verificationTokenHash,
    verificationTokenExpires: row.verificationTokenExpires,
    resetTokenHash: row.resetTokenHash,
    resetTokenExpires: row.resetTokenExpires,
    tokenVersion: row.tokenVersion,
    // A row just created never had this set, and comes back undefined; the
    // entity's deleted check is a strict null test, so normalise it here.
    deletedAt: row.deletedAt ?? null,
    createdAt: row.get('createdAt') as Date,
    role: row.role ?? 'learner',
  });
}

export function toDocument(row: DocumentModel): Document {
  return new Document({
    id: row.id,
    userId: row.userId,
    title: row.title,
    fileName: row.fileName,
    status: row.status,
    pageCount: row.pageCount,
    sourceMimeType: row.sourceMimeType,
    source: row.source ?? 'uploaded',
    brief: row.brief ?? null,
    sourceUrl: row.sourceUrl ?? null,
    importManifest: row.importManifest ?? null,
    sizeBytes: Number(row.sizeBytes),
    originalFileRef: row.originalFileRef,
    canonicalPdfRef: row.canonicalPdfRef,
    thumbnailRef: row.thumbnailRef,
    contentVersion: row.contentVersion,
    simplificationUnavailable: row.simplificationUnavailable,
    failureReason: row.failureReason,
    // A row just created never had this set, and comes back undefined; the
    // entity's deleted check is a strict null test, so normalise it here.
    deletedAt: row.deletedAt ?? null,
    createdAt: row.get('createdAt') as Date,
    institutionId: row.institutionId ?? null,
    departmentId: row.departmentId ?? null,
    levelId: row.levelId ?? null,
    courseId: row.courseId ?? null,
    contentHash: row.contentHash ?? null,
    orderIndex: row.orderIndex ?? 0,
    uploadBatchId: row.uploadBatchId ?? null,
    publishedAt: row.publishedAt ?? null,
  });
}
