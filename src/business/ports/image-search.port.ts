export interface ImageResult {
  url: string;
  thumbnail: string;
  source: string;
}

/**
 * Official search API only — never scraping, and result URLs are rendered by
 * the browser rather than fetched server-side (§10, SSRF).
 */
export interface ImageSearchPort {
  search(query: string, limit: number): Promise<ImageResult[]>;
}
