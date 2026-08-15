export interface ExtractedPage {
  pageNumber: number;
  text: string;
  charCount: number;
  isEmpty: boolean;
}

/** An embedded image lifted out of a page, re-encoded as a PNG. */
export interface ExtractedFigure {
  pageNumber: number;
  width: number;
  height: number;
  png: Buffer;
}

/** Reading a PDF: page count, per-page text, and a first-page thumbnail. */
export interface PdfToolkitPort {
  pageCount(pdf: Buffer): Promise<number>;
  extractPages(pdf: Buffer): Promise<ExtractedPage[]>;
  renderThumbnail(pdf: Buffer): Promise<Buffer | null>;
  /**
   * The figures embedded in each page — image XObjects, decoded without
   * rasterising the page (no canvas involved). Best-effort: a page whose
   * images defeat pdf.js contributes none rather than failing extraction.
   */
  extractFigures(pdf: Buffer): Promise<ExtractedFigure[]>;
}
