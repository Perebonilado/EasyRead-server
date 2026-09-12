import type {
  DocumentBrief,
  DocumentSource,
  ImportManifest,
} from '../../contracts';
import type { Document } from '../domain/entities/document';

export interface CreateDocumentInput {
  userId: string;
  title: string;
  fileName: string;
  sourceMimeType: string;
  sizeBytes: number;
  /** Defaults to `uploaded`; the learn flow creates `generated` ones. */
  source?: DocumentSource;
  brief?: DocumentBrief | null;
  sourceUrl?: string | null;
  importManifest?: ImportManifest | null;
  /** A school's document: shared with its members, placed in a course. */
  institutionId?: string | null;
  departmentId?: string | null;
  levelId?: string | null;
  courseId?: string | null;
  contentHash?: string | null;
  orderIndex?: number;
}

export interface DocumentRepository {
  findById(id: string): Promise<Document | null>;
  listForUser(userId: string): Promise<Document[]>;
  /** A school's document with these bytes, if it already has one: the dedupe on upload. */
  findByHash(
    institutionId: string,
    contentHash: string,
  ): Promise<Document | null>;
  /** A course's documents in their order. */
  listByCourse(courseId: string): Promise<Document[]>;
  /** Every document a school shares, in order. */
  listByInstitution(institutionId: string): Promise<Document[]>;
  /** A school's documents under a department, a level, or both. */
  listByPlacement(input: {
    institutionId: string;
    departmentId?: string | null;
    levelId?: string | null;
  }): Promise<Document[]>;
  create(input: CreateDocumentInput): Promise<Document>;
  save(doc: Document): Promise<void>;
  /** Hard delete, used by the purge job once the recovery window closes. */
  purge(documentId: string): Promise<void>;
}
