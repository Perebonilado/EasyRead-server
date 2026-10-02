import type {
  SourceFile,
  WikiItem,
  WikiPerson,
} from '../domain/pictures/types';

/**
 * The picture desk's sources (research §3.4's whitelist): Wikidata for who
 * and where, Wikimedia Commons, NASA's library and the Met for the files.
 * Keyless, and polite: one request at a time, under five a second, with a
 * User-Agent that names the app and how to reach us (Wikimedia's robot
 * policy). Every field comes back as plain text, ready for the screen.
 */
export interface PictureSourcesPort {
  /** Wikidata items by name: ids first, then people() or items() for their facts. */
  searchEntities(
    name: string,
    limit?: number,
  ): Promise<{ qid: string; label: string; description: string }[]>;
  /** People by id, with their occupations, positions and places as labels. */
  people(qids: readonly string[]): Promise<WikiPerson[]>;
  /** Places and things by id. */
  items(qids: readonly string[]): Promise<WikiItem[]>;
  /** Commons files by name ("File:…"), each with a copy at `width` where it is wider. */
  commonsFiles(titles: readonly string[], width: number): Promise<SourceFile[]>;
  /** Commons files that say they depict an item (haswbstatement:P180). */
  commonsDepicting(
    qid: string,
    limit: number,
    width: number,
  ): Promise<SourceFile[]>;
  /** The files of a Commons category (not its subcategories). */
  commonsCategory(
    category: string,
    limit: number,
    width: number,
  ): Promise<SourceFile[]>;
  /** Commons files found by words (bitmaps only). */
  commonsSearch(
    words: string,
    limit: number,
    width: number,
  ): Promise<SourceFile[]>;
  /** NASA's images found by words, in years when given. */
  nasaSearch(
    words: string,
    opts: { limit: number; yearStart?: number; yearEnd?: number },
  ): Promise<SourceFile[]>;
  /** The Met's open-access objects found by words. */
  metSearch(words: string, limit: number): Promise<SourceFile[]>;
  /** A file's bytes, from a source the desk found it at. */
  fetch(url: string): Promise<{ bytes: Buffer; mime: string }>;
}

/** A picture's pixels, small: what the depth model and the colour check read. */
export interface PicturePixels {
  /** RGBA, 8 bits a channel, row by row. */
  data: Uint8Array;
  width: number;
  height: number;
}

/** Pictures decoded and sized (JPEG and PNG), for the desk's own checks. */
export interface PicturePixelsPort {
  /** Its size in pixels and its kind, from its header; null for anything but a JPEG or a PNG. */
  measure(
    bytes: Buffer,
  ): { width: number; height: number; mime: string } | null;
  /** Its pixels with the shorter side at `short` (never larger than it is), or null when it cannot be read. */
  pixels(bytes: Buffer, short: number): Promise<PicturePixels | null>;
  /** The same as a PNG, for a model that sees; absent where it cannot be made. */
  png?(bytes: Buffer, short: number): Promise<Buffer | null>;
}

/** A picture's depth (Depth Anything V2 Small): an 8-bit grey PNG, white near, at the model's own size. */
export interface DepthPort {
  depthOf(
    bytes: Buffer,
  ): Promise<{ png: Buffer; width: number; height: number } | null>;
}
