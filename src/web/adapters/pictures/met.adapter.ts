/**
 * The Metropolitan Museum of Art's collection API for the picture desk
 * (research §3.4: museum CC0, tier A): objects found by words, open access
 * only (isPublicDomain), which the Met releases as CC0. The API gives no
 * size, so each object's small image is fetched and measured, and the
 * desk judges it by that (its original, which the desk takes, is larger);
 * objects are few, so this is few requests.
 */
import type { SourceFile } from '../../../business/domain/pictures/types';
import { measureImage } from './measure';
import type { PoliteHttp } from './polite-http';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';

interface MetObject {
  objectID?: number;
  isPublicDomain?: boolean;
  primaryImage?: string;
  primaryImageSmall?: string;
  title?: string;
  artistDisplayName?: string;
  objectDate?: string;
  objectBeginDate?: number;
  creditLine?: string;
  objectURL?: string;
  culture?: string;
  department?: string;
}

export class MetAdapter {
  constructor(private readonly http: PoliteHttp) {}

  async search(words: string, limit: number): Promise<SourceFile[]> {
    const said = await this.http.json<{ objectIDs?: number[] | null }>(
      `${API}/search?${new URLSearchParams({ hasImages: 'true', q: words })}`,
    );
    const out: SourceFile[] = [];
    for (const id of (said.objectIDs ?? []).slice(0, Math.max(1, limit) * 2)) {
      if (out.length >= limit) break;
      const object = await this.http
        .json<MetObject>(`${API}/objects/${id}`)
        .catch(() => null);
      if (!object?.isPublicDomain || !object.primaryImage) continue;
      const small = object.primaryImageSmall
        ? await this.http.bytes(object.primaryImageSmall).catch(() => null)
        : null;
      const size = small ? measureImage(small.bytes) : null;
      if (!size) continue;
      out.push({
        source: 'met',
        sourceId: String(object.objectID ?? id),
        title: object.title || `Object ${id}`,
        url: object.primaryImage,
        // Its small copy's size: the original is larger, and is measured when it is taken.
        width: size.width,
        height: size.height,
        mime: 'image/jpeg',
        pageUrl:
          object.objectURL ||
          `https://www.metmuseum.org/art/collection/search/${id}`,
        licenceName: 'CC0',
        licenceCode: 'cc0',
        licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        artist: object.artistDisplayName || '',
        credit: `The Metropolitan Museum of Art${object.creditLine ? `, ${object.creditLine}` : ''}`,
        description: [object.culture, object.department]
          .filter(Boolean)
          .join(', '),
        date:
          object.objectDate ||
          (object.objectBeginDate ? String(object.objectBeginDate) : ''),
        categories: [],
        restrictions: [],
        structured: null,
        institutional: true,
      });
    }
    return out;
  }
}
