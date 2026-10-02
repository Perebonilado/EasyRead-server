/**
 * Wikimedia Commons for the picture desk (research §3.4): files by name,
 * by what they say they depict (haswbstatement:P180), by category and by
 * words; each with its imageinfo (the file, a copy at a width, its size,
 * its type, when it went online, and its extmetadata: the licence, the
 * artist, the credit, the description, the date, the categories and the
 * restrictions, all made plain text here) and its structured data (the
 * copyright status P6216, the licences P275, and who it depicts P180 with
 * where in the picture, P2677), fifty files to a request.
 */
import { plainText } from '../../../business/domain/pictures/licence';
import { qualityOf } from '../../../business/domain/pictures/rank';
import type { SourceFile } from '../../../business/domain/pictures/types';
import type { PoliteHttp } from './polite-http';

const API = 'https://commons.wikimedia.org/w/api.php';

/** The extmetadata fields the desk reads. */
const FIELDS = [
  'LicenseShortName',
  'License',
  'LicenseUrl',
  'UsageTerms',
  'Artist',
  'Credit',
  'Attribution',
  'AttributionRequired',
  'ImageDescription',
  'DateTimeOriginal',
  'ObjectName',
  'Restrictions',
  'Categories',
].join('|');

interface ImageInfo {
  url?: string;
  descriptionurl?: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  width?: number;
  height?: number;
  mime?: string;
  timestamp?: string;
  extmetadata?: Record<string, { value?: unknown }>;
}
export interface CommonsPage {
  pageid?: number;
  title: string;
  index?: number;
  missing?: string;
  imageinfo?: ImageInfo[];
}

interface Statement {
  mainsnak?: { datavalue?: { value?: unknown } };
  qualifiers?: Record<string, { datavalue?: { value?: unknown } }[]>;
}
export interface MediaInfo {
  id: string;
  statements?: Record<string, Statement[]> | [];
  missing?: string;
}

const meta = (info: ImageInfo, field: string): string => {
  const value = info.extmetadata?.[field]?.value;
  // AttributionRequired and Copyrighted come as words, the rest as HTML.
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';
};

/** IIIF's "pct:x,y,w,h" (P2677's region) as shares of the picture. */
export function regionOf(
  said: unknown,
): [number, number, number, number] | undefined {
  const m = /^pct:([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/u.exec(
    typeof said === 'string' ? said.trim() : '',
  );
  if (!m) return undefined;
  const [x, y, w, h] = m.slice(1).map((n) => Number(n) / 100);
  return [x, y, w, h].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) &&
    w > 0 &&
    h > 0
    ? [x, y, w, h]
    : undefined;
}

/** A file's structured data, as the licence screen and the focal box read it. */
export function structuredOf(
  media: MediaInfo | undefined,
): Pick<SourceFile, 'structured' | 'depicts'> {
  const statements =
    media && !Array.isArray(media.statements) ? (media.statements ?? {}) : {};
  const ids = (property: string) =>
    (statements[property] ?? [])
      .map(
        (s) =>
          (s.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id,
      )
      .filter((id): id is string => typeof id === 'string');
  const depicts = (statements.P180 ?? [])
    .map((s) => {
      const qid = (s.mainsnak?.datavalue?.value as { id?: string } | undefined)
        ?.id;
      if (!qid) return null;
      const box = regionOf(s.qualifiers?.P2677?.[0]?.datavalue?.value);
      return box ? { qid, box } : { qid };
    })
    .filter(
      (d): d is { qid: string; box?: [number, number, number, number] } =>
        d !== null,
    );
  const status = ids('P6216');
  const licences = ids('P275');
  return {
    structured: status.length || licences.length ? { status, licences } : null,
    ...(depicts.length ? { depicts } : {}),
  };
}

/** A Commons page as the desk's file, every field plain text. */
export function fileOf(
  page: CommonsPage,
  media?: MediaInfo,
): SourceFile | null {
  const info = page.imageinfo?.[0];
  if (!info?.url || !info.width || !info.height) return null;
  const categories = meta(info, 'Categories')
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
  const title = page.title
    .replace(/^File:/u, '')
    .replace(/\.[A-Za-z0-9]{2,5}$/u, '')
    .replace(/_/gu, ' ');
  return {
    source: 'commons',
    sourceId: page.title,
    title,
    url: info.url,
    ...(info.thumburl &&
    info.thumbwidth &&
    info.thumbheight &&
    info.thumbwidth < info.width
      ? {
          thumb: {
            url: info.thumburl,
            width: info.thumbwidth,
            height: info.thumbheight,
          },
        }
      : {}),
    width: info.width,
    height: info.height,
    mime: info.mime ?? '',
    pageUrl:
      info.descriptionurl ??
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /gu, '_'))}`,
    ...(page.pageid ? { pageId: page.pageid } : {}),
    licenceName: plainText(meta(info, 'LicenseShortName')),
    licenceCode: plainText(meta(info, 'License')),
    ...(meta(info, 'LicenseUrl')
      ? { licenceUrl: plainText(meta(info, 'LicenseUrl')) }
      : {}),
    artist: plainText(meta(info, 'Artist')),
    credit: plainText(meta(info, 'Credit')),
    ...(meta(info, 'Attribution') &&
    /^true$/iu.test(meta(info, 'AttributionRequired'))
      ? { attribution: plainText(meta(info, 'Attribution')) }
      : {}),
    description: plainText(meta(info, 'ImageDescription')).slice(0, 2000),
    date: plainText(meta(info, 'DateTimeOriginal')),
    ...(info.timestamp ? { uploaded: info.timestamp.slice(0, 10) } : {}),
    categories,
    restrictions: meta(info, 'Restrictions')
      .split('|')
      .map((r) => r.trim())
      .filter(Boolean),
    ...structuredOf(media),
    quality: qualityOf(categories),
  };
}

export class CommonsAdapter {
  constructor(private readonly http: PoliteHttp) {}

  /** The query's shared part: imageinfo with its extmetadata and a copy at a width. */
  private infoParams(width: number): Record<string, string> {
    return {
      action: 'query',
      format: 'json',
      prop: 'imageinfo',
      iiprop: 'url|size|mime|timestamp|extmetadata',
      iiurlwidth: String(Math.round(width)),
      iiextmetadatafilter: FIELDS,
      iiextmetadatalanguage: 'en',
    };
  }

  /** Pages to files, with their structured data in one more request. */
  private async filesOf(pages: CommonsPage[]): Promise<SourceFile[]> {
    const listed = pages
      .filter((p) => !p.missing && p.pageid)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const media = new Map<string, MediaInfo>();
    for (let i = 0; i < listed.length; i += 50) {
      const ids = listed.slice(i, i + 50).map((p) => `M${p.pageid}`);
      const url = `${API}?${new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: ids.join('|') })}`;
      try {
        const said = await this.http.json<{
          entities?: Record<string, MediaInfo>;
        }>(url);
        for (const [id, entity] of Object.entries(said.entities ?? {}))
          media.set(id, entity);
      } catch {
        // No structured data is read as none said (the screen notes it), never as a licence.
      }
    }
    return listed
      .map((page) => fileOf(page, media.get(`M${page.pageid}`)))
      .filter((f): f is SourceFile => f !== null);
  }

  private async query(params: Record<string, string>): Promise<SourceFile[]> {
    const said = await this.http.json<{
      query?: { pages?: Record<string, CommonsPage> | CommonsPage[] };
    }>(`${API}?${new URLSearchParams(params)}`);
    const pages = said.query?.pages ?? {};
    return this.filesOf(Array.isArray(pages) ? pages : Object.values(pages));
  }

  async files(titles: readonly string[], width: number): Promise<SourceFile[]> {
    const out: SourceFile[] = [];
    for (let i = 0; i < titles.length; i += 50)
      out.push(
        ...(await this.query({
          ...this.infoParams(width),
          titles: titles.slice(i, i + 50).join('|'),
        })),
      );
    return out;
  }

  depicting(qid: string, limit: number, width: number): Promise<SourceFile[]> {
    return this.query({
      ...this.infoParams(width),
      generator: 'search',
      gsrsearch: `haswbstatement:P180=${qid} filetype:bitmap`,
      gsrnamespace: '6',
      gsrlimit: String(limit),
    });
  }

  category(
    category: string,
    limit: number,
    width: number,
  ): Promise<SourceFile[]> {
    return this.query({
      ...this.infoParams(width),
      generator: 'categorymembers',
      gcmtitle: `Category:${category.replace(/^Category:/u, '')}`,
      gcmtype: 'file',
      gcmlimit: String(limit),
    });
  }

  search(words: string, limit: number, width: number): Promise<SourceFile[]> {
    return this.query({
      ...this.infoParams(width),
      generator: 'search',
      gsrsearch: `${words} filetype:bitmap`,
      gsrnamespace: '6',
      gsrlimit: String(limit),
    });
  }
}
