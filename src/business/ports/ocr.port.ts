/** One page as read by the OCR engine. */
export interface OcrPageText {
  /** 1-based, matching document_pages. */
  pageNumber: number;
  /** Markdown — headings, pipes and lists survive into simplification. */
  markdown: string;
}

/**
 * A document-level OCR engine: the whole PDF goes out once and every wanted
 * page comes back read. This is what makes scanned uploads fast — one hosted
 * call instead of a vision request per page.
 */
export interface OcrEnginePort {
  /** False when the engine has no credentials; callers pick a fallback. */
  isConfigured(): boolean;
  /**
   * Reads the given pages (1-based) of the PDF. Pages the engine could not
   * read are simply absent from the result.
   */
  readPages(pdf: Buffer, pageNumbers: number[]): Promise<OcrPageText[]>;
}
