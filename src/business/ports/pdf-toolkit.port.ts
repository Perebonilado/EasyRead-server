export interface ExtractedPage {
  pageNumber: number;
  text: string;
  charCount: number;
  isEmpty: boolean;
}

/** Reading a PDF: page count, per-page text, and a first-page thumbnail. */
export interface PdfToolkitPort {
  pageCount(pdf: Buffer): Promise<number>;
  extractPages(pdf: Buffer): Promise<ExtractedPage[]>;
  renderThumbnail(pdf: Buffer): Promise<Buffer | null>;
}
