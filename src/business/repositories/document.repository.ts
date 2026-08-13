import type { Document } from '../domain/entities/document';

export interface CreateDocumentInput {
  userId: string;
  title: string;
  fileName: string;
  sourceMimeType: string;
  sizeBytes: number;
}

export interface DocumentRepository {
  findById(id: string): Promise<Document | null>;
  listForUser(userId: string): Promise<Document[]>;
  create(input: CreateDocumentInput): Promise<Document>;
  save(doc: Document): Promise<void>;
  /** Hard delete, used by the purge job once the recovery window closes. */
  purge(documentId: string): Promise<void>;
}
