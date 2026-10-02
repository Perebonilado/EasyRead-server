/**
 * NASA's Image and Video Library (images-api.nasa.gov) for the picture
 * desk: space, flight and the Earth (research §3.4). NASA's own pictures
 * are a US government work; one credited to anyone else (ESA, a
 * university, an agency, "courtesy of") is no longer NASA's to give, and
 * comes back with no licence for the screen to refuse. Each item's size
 * is read from its own metadata. NASA never endorses: the description's
 * credit names NASA as the source, nothing more.
 */
import type { SourceFile } from '../../../business/domain/pictures/types';
import type { PoliteHttp } from './polite-http';

const API = 'https://images-api.nasa.gov';

interface NasaItem {
  href?: string;
  data?: {
    nasa_id?: string;
    title?: string;
    description?: string;
    date_created?: string;
    center?: string;
    photographer?: string;
    secondary_creator?: string;
    media_type?: string;
  }[];
}

/** A credit that is not NASA's own. */
const THIRD_PARTY =
  /\b(?:ESA|JAXA|CSA|Roscosmos|courtesy|©|copyright|getty|reuters|AP Photo|AFP|associated press|university|universit[éa]|institute|observatory|gemini|eso)\b/iu;

export class NasaImagesAdapter {
  constructor(private readonly http: PoliteHttp) {}

  async search(
    words: string,
    opts: { limit: number; yearStart?: number; yearEnd?: number },
  ): Promise<SourceFile[]> {
    const params = new URLSearchParams({
      q: words,
      media_type: 'image',
      page_size: String(Math.min(20, Math.max(1, opts.limit))),
    });
    if (opts.yearStart) params.set('year_start', String(opts.yearStart));
    if (opts.yearEnd) params.set('year_end', String(opts.yearEnd));
    const said = await this.http.json<{ collection?: { items?: NasaItem[] } }>(
      `${API}/search?${params}`,
    );
    const out: SourceFile[] = [];
    for (const item of (said.collection?.items ?? []).slice(0, opts.limit)) {
      const data = item.data?.[0];
      if (!data?.nasa_id || data.media_type !== 'image') continue;
      const file = await this.fileOf(data).catch(() => null);
      if (file) out.push(file);
    }
    return out;
  }

  /** An item's files (its asset list) and its size (its metadata), as the desk's file. */
  private async fileOf(
    data: NonNullable<NasaItem['data']>[number],
  ): Promise<SourceFile | null> {
    const id = data.nasa_id!;
    const assets = await this.http.json<{
      collection?: { items?: { href?: string }[] };
    }>(`${API}/asset/${encodeURIComponent(id)}`);
    const hrefs = (assets.collection?.items ?? [])
      .map((a) => a.href ?? '')
      .filter(Boolean);
    const original = hrefs.find((h) => /~orig\.(?:jpe?g|png)$/iu.test(h));
    const large = hrefs.find((h) => /~large\.(?:jpe?g|png)$/iu.test(h));
    const metadata = hrefs.find((h) => /metadata\.json$/iu.test(h));
    const url = original ?? large;
    if (!url) return null;
    let width = 0;
    let height = 0;
    if (metadata) {
      const said = await this.http.json<Record<string, unknown>>(
        metadata.replace(/^http:/u, 'https:'),
      );
      width = Number(
        said['File:ImageWidth'] ??
          said['EXIF:ImageWidth'] ??
          said['EXIF:ExifImageWidth'] ??
          0,
      );
      height = Number(
        said['File:ImageHeight'] ??
          said['EXIF:ImageHeight'] ??
          said['EXIF:ExifImageHeight'] ??
          0,
      );
    }
    if (!width || !height) return null;
    const creators = [data.photographer, data.secondary_creator]
      .filter(Boolean)
      .join(', ');
    const thirdParty = THIRD_PARTY.test(
      `${creators} ${data.description ?? ''}`,
    );
    return {
      source: 'nasa',
      sourceId: id,
      title: data.title ?? id,
      url: url.replace(/^http:/u, 'https:'),
      ...(large && large !== url
        ? {
            thumb: {
              url: large.replace(/^http:/u, 'https:'),
              width: 0,
              height: 0,
            },
          }
        : {}),
      width,
      height,
      mime: /\.png$/iu.test(url) ? 'image/png' : 'image/jpeg',
      pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(id)}`,
      licenceName: thirdParty ? 'Third-party credit' : 'Public domain',
      licenceCode: thirdParty ? '' : 'pd',
      artist: creators || 'NASA',
      credit: data.center ? `NASA/${data.center}` : 'NASA',
      description: (data.description ?? '').slice(0, 2000),
      date: data.date_created ?? '',
      categories: thirdParty ? [] : ['PD-USGov-NASA'],
      restrictions: [],
      structured: null,
      institutional: true,
    };
  }
}
