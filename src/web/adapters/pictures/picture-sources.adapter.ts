/**
 * The picture desk's sources as one port: Wikidata, Commons, NASA and the
 * Met behind one polite client (one request at a time across all of them,
 * Wikimedia's robot policy). A file is fetched only from the hosts the
 * desk found it at, never from an address a page or a model suggested.
 */
import type { PictureSourcesPort } from '../../../business/ports/pictures.port';
import type { SourceFile } from '../../../business/domain/pictures/types';
import { CommonsAdapter } from './commons.adapter';
import { MetAdapter } from './met.adapter';
import { NasaImagesAdapter } from './nasa-images.adapter';
import { PoliteHttp, userAgentOf } from './polite-http';
import { WikidataAdapter } from './wikidata.adapter';

/** The hosts a picture's bytes may come from. */
const FILE_HOSTS =
  /^(?:upload\.wikimedia\.org|thumb\.wikimedia\.org|images-assets\.nasa\.gov|images\.metmuseum\.org|collectionapi\.metmuseum\.org)$/u;

export class PictureSourcesAdapter implements PictureSourcesPort {
  readonly http: PoliteHttp;
  private readonly wikidata: WikidataAdapter;
  private readonly commons: CommonsAdapter;
  private readonly nasa: NasaImagesAdapter;
  private readonly met: MetAdapter;

  constructor(opts: { contact?: string | null; http?: PoliteHttp } = {}) {
    this.http =
      opts.http ?? new PoliteHttp({ userAgent: userAgentOf(opts.contact) });
    this.wikidata = new WikidataAdapter(this.http);
    this.commons = new CommonsAdapter(this.http);
    this.nasa = new NasaImagesAdapter(this.http);
    this.met = new MetAdapter(this.http);
  }

  searchEntities(name: string, limit?: number) {
    return this.wikidata.searchEntities(name, limit);
  }
  people(qids: readonly string[]) {
    return this.wikidata.people(qids);
  }
  items(qids: readonly string[]) {
    return this.wikidata.items(qids);
  }
  commonsFiles(
    titles: readonly string[],
    width: number,
  ): Promise<SourceFile[]> {
    return this.commons.files(titles, width);
  }
  commonsDepicting(qid: string, limit: number, width: number) {
    return this.commons.depicting(qid, limit, width);
  }
  commonsCategory(category: string, limit: number, width: number) {
    return this.commons.category(category, limit, width);
  }
  commonsSearch(words: string, limit: number, width: number) {
    return this.commons.search(words, limit, width);
  }
  nasaSearch(
    words: string,
    opts: { limit: number; yearStart?: number; yearEnd?: number },
  ) {
    return this.nasa.search(words, opts);
  }
  metSearch(words: string, limit: number) {
    return this.met.search(words, limit);
  }

  async fetch(url: string): Promise<{ bytes: Buffer; mime: string }> {
    const host = new URL(url).host;
    if (new URL(url).protocol !== 'https:' || !FILE_HOSTS.test(host))
      throw new Error(
        `pictures are fetched only from their sources, not ${host}`,
      );
    return this.http.bytes(url);
  }
}
