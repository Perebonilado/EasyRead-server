export interface PageText {
  pageNumber: number;
  text: string;
  charCount: number;
  isEmpty: boolean;
}

export interface DocumentPageRepository {
  replaceAll(documentId: string, pages: PageText[]): Promise<void>;
  findRange(documentId: string, from: number, to: number): Promise<PageText[]>;
  findOne(documentId: string, pageNumber: number): Promise<PageText | null>;
  countEmpty(documentId: string): Promise<number>;
}
