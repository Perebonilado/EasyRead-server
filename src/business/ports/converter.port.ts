/**
 * Turns an uploaded file into the canonical PDF every later step reads.
 * PDFs pass through untouched — the majority path, and why most documents
 * reach the reader in seconds (§4.2).
 */
export interface ConverterPort {
  supports(mimeType: string): boolean;
  toPdf(input: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<Buffer>;
}
