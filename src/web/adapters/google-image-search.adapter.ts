import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import type {
  ImageResult,
  ImageSearchPort,
} from '../../business/ports/image-search.port';

interface CseResponse {
  items?: {
    link: string;
    displayLink: string;
    image?: { thumbnailLink?: string };
  }[];
}

/**
 * Google Programmable Search, image mode.
 *
 * The official API only — no scraping — and the URLs are handed to the browser
 * to render rather than fetched here, so a search result can never make the
 * server issue a request to an attacker-chosen address (§10, SSRF).
 */
@Injectable()
export class GoogleImageSearchAdapter implements ImageSearchPort {
  private readonly logger = new Logger(GoogleImageSearchAdapter.name);
  private readonly http: AxiosInstance;
  private readonly key: string;
  private readonly cx: string;

  constructor(config: ConfigService) {
    this.key = config.getOrThrow<string>('GOOGLE_SEARCH_API_KEY');
    this.cx = config.getOrThrow<string>('GOOGLE_SEARCH_ENGINE_ID');
    this.http = axios.create({
      baseURL: 'https://www.googleapis.com/customsearch/v1',
      timeout: 10_000,
    });
  }

  async search(query: string, limit: number): Promise<ImageResult[]> {
    try {
      const response = await this.http.get<CseResponse>('', {
        params: {
          key: this.key,
          cx: this.cx,
          q: query,
          searchType: 'image',
          safe: 'active',
          num: Math.min(Math.max(limit, 1), 10),
        },
      });

      return (response.data.items ?? [])
        .filter((item) => item.link.startsWith('https://'))
        .map((item) => ({
          url: item.link,
          thumbnail: item.image?.thumbnailLink ?? item.link,
          source: item.displayLink,
        }));
    } catch (error) {
      // A failed image search shouldn't surface as an error in the reader —
      // the panel has a no-results state and that's the honest thing to show.
      this.logger.warn(
        `Image search failed for "${query}": ${(error as Error).message}`,
      );
      return [];
    }
  }
}
