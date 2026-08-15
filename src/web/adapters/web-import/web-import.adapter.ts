import { Injectable, Logger } from '@nestjs/common';
import type {
  DiscoveredImport,
  WebImportPort,
} from '../../../business/ports/web-import.port';
import { discoverNav, pagesFromSitemap } from './nav-discovery';
import { safeFetch, safeFetchBinary } from './safe-fetch';

@Injectable()
export class WebImportAdapter implements WebImportPort {
  private readonly logger = new Logger(WebImportAdapter.name);

  async fetchPage(url: string): Promise<{ finalUrl: string; html: string }> {
    const page = await safeFetch(url);
    return { finalUrl: page.finalUrl, html: page.html };
  }

  async fetchBinary(url: string) {
    const result = await safeFetchBinary(url);
    return { bytes: result.bytes, contentType: result.contentType };
  }

  async discover(url: string): Promise<DiscoveredImport> {
    const page = await safeFetch(url);
    const nav = discoverNav(page.html, page.finalUrl);

    // The sidebar is the structure of record; the sitemap only speaks when
    // the page had no readable nav at all.
    if (nav.pages.length >= 2) {
      return { url: page.finalUrl, ...nav };
    }

    const sitemapPages = await this.sitemap(page.finalUrl);
    if (sitemapPages.length >= 2) {
      this.logger.log(
        `No nav on ${url}; using sitemap (${sitemapPages.length} pages)`,
      );
      return {
        url: page.finalUrl,
        title: nav.title,
        framework: nav.framework,
        pages: sitemapPages,
      };
    }

    // A lone page is still importable — the wizard shows it as exactly that.
    return {
      url: page.finalUrl,
      title: nav.title,
      framework: nav.framework,
      pages: nav.pages,
    };
  }

  private async sitemap(entryUrl: string) {
    try {
      const origin = new URL(entryUrl).origin;
      const sitemap = await safeFetch(`${origin}/sitemap.xml`);
      return pagesFromSitemap(sitemap.html, entryUrl);
    } catch {
      return [];
    }
  }
}
