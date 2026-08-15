/** One page of a docs site, as the reader will pick it in the import wizard. */
export interface DiscoveredImportPage {
  url: string;
  title: string;
  /** Nesting depth in the site's own nav; the picker indents by it. */
  depth: number;
}

export interface DiscoveredImport {
  url: string;
  title: string;
  /** The docs framework recognised, for the picker's badge. Null = generic. */
  framework: string | null;
  /** The site's nav in reading order; empty when no nav could be read. */
  pages: DiscoveredImportPage[];
}

/**
 * Reaching out to the web on a reader's behalf.
 *
 * Everything the import feature fetches goes through this port, so the
 * SSRF vetting in the adapter cannot be bypassed by a new call site.
 */
export interface WebImportPort {
  /** Read a docs site's structure from its entry URL. */
  discover(url: string): Promise<DiscoveredImport>;

  /** Fetch one page's HTML, redirects followed, size- and time-capped. */
  fetchPage(url: string): Promise<{ finalUrl: string; html: string }>;

  /** Fetch a figure's bytes through the same SSRF gate. */
  fetchBinary(url: string): Promise<{ bytes: Buffer; contentType: string }>;
}
