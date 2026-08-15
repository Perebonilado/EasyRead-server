export interface PageText {
  pageNumber: number;
  text: string;
  charCount: number;
  isEmpty: boolean;
  /** Where the text came from: the PDF's own text layer, or a vision model. */
  textSource: 'extracted' | 'ocr';
}

export interface DocumentPageRepository {
  replaceAll(
    documentId: string,
    pages: Omit<PageText, 'textSource'>[],
  ): Promise<void>;
  findRange(documentId: string, from: number, to: number): Promise<PageText[]>;
  findOne(documentId: string, pageNumber: number): Promise<PageText | null>;
  countEmpty(documentId: string): Promise<number>;
  /** OCR writing what extraction couldn't: replaces one page's text in place. */
  writeOcrText(
    documentId: string,
    pageNumber: number,
    text: string,
    charCount: number,
    isEmpty: boolean,
  ): Promise<void>;
}
