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

/** A scanned page's dominant image, ready for a vision model. */
export interface PageImage {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
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
  /**
   * The dominant image of each requested page, for OCR. A scanned page *is*
   * one big image XObject, so lifting it out yields the page's pixels without
   * any rasterisation. Pages with no usable image are simply absent from the
   * result — vector-only pages have nothing a vision model could read anyway.
   */
  pageImages(pdf: Buffer, pageNumbers: number[]): Promise<PageImage[]>;
}
