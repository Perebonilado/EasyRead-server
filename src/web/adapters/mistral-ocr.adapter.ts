import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OcrEnginePort, OcrPageText } from '../../business/ports/ocr.port';

/**
 * Mistral's hosted OCR, spoken to directly over REST.
 *
 * The flow mirrors AI Examiner's proven recipe — upload the PDF with
 * `purpose: ocr`, fetch a signed URL, run `mistral-ocr-latest` against it —
 * with the sharp edges filed off: only the pages that need reading are
 * requested, the uploaded file is deleted afterwards instead of accumulating
 * on Mistral's storage forever, every call has a timeout, and errors surface
 * as clean messages rather than serialised HTTP internals.
 *
 * No SDK: the surface is four small endpoints, and owning the requests means
 * owning the failure modes.
 */

const BASE_URL = 'https://api.mistral.ai/v1';
const UPLOAD_TIMEOUT_MS = 60_000;
/** Reading a large scanned document takes a while; be patient once. */
const OCR_TIMEOUT_MS = 180_000;

interface OcrResponsePage {
  index: number;
  markdown?: string;
}

@Injectable()
export class MistralOcrAdapter implements OcrEnginePort {
  private readonly logger = new Logger(MistralOcrAdapter.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('MISTRAL_API_KEY'));
  }

  async readPages(pdf: Buffer, pageNumbers: number[]): Promise<OcrPageText[]> {
    if (!pageNumbers.length) return [];

    const fileId = await this.upload(pdf);
    try {
      const signedUrl = await this.signedUrl(fileId);
      const pages = await this.process(signedUrl, pageNumbers);

      const wanted = new Set(pageNumbers);
      return pages
        .map((page) => ({
          pageNumber: page.index + 1,
          markdown: cleanMarkdown(page.markdown ?? ''),
        }))
        .filter((page) => wanted.has(page.pageNumber) && page.markdown);
    } finally {
      // Best-effort: an orphaned file costs privacy, not correctness.
      await this.delete(fileId).catch((error: Error) =>
        this.logger.warn(`Could not delete Mistral file: ${error.message}`),
      );
    }
  }

  private headers(): Record<string, string> {
    const key = this.config.get<string>('MISTRAL_API_KEY');
    if (!key) throw new Error('MISTRAL_API_KEY is not set');
    return { Authorization: `Bearer ${key}` };
  }

  private model(): string {
    return this.config.get<string>('MISTRAL_OCR_MODEL') || 'mistral-ocr-latest';
  }

  private async upload(pdf: Buffer): Promise<string> {
    const form = new FormData();
    form.append('purpose', 'ocr');
    form.append(
      'file',
      new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
      'document.pdf',
    );

    const response = await fetch(`${BASE_URL}/files`, {
      method: 'POST',
      headers: this.headers(),
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Mistral file upload answered ${response.status}`);
    }
    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error('Mistral file upload returned no id');
    return body.id;
  }

  private async signedUrl(fileId: string): Promise<string> {
    const response = await fetch(`${BASE_URL}/files/${fileId}/url?expiry=1`, {
      headers: { ...this.headers(), Accept: 'application/json' },
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Mistral signed URL answered ${response.status}`);
    }
    const body = (await response.json()) as { url?: string };
    if (!body.url) throw new Error('Mistral returned no signed URL');
    return body.url;
  }

  private async process(
    documentUrl: string,
    pageNumbers: number[],
  ): Promise<OcrResponsePage[]> {
    // Only the pages that need reading — a mixed document doesn't pay to
    // re-OCR its digital half. The API takes 0-based indices.
    const request = (withPages: boolean) =>
      fetch(`${BASE_URL}/ocr`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model(),
          document: { type: 'document_url', document_url: documentUrl },
          ...(withPages ? { pages: pageNumbers.map((page) => page - 1) } : {}),
        }),
        signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
      });

    let response = await request(true);
    if (response.status === 400 || response.status === 422) {
      // An API revision that dislikes page selection still OCRs the whole
      // document; the caller filters to what it asked for.
      this.logger.warn(
        `Mistral rejected page selection (${response.status}); retrying whole document`,
      );
      response = await request(false);
    }
    if (!response.ok) {
      throw new Error(`Mistral OCR answered ${response.status}`);
    }

    const body = (await response.json()) as { pages?: OcrResponsePage[] };
    return body.pages ?? [];
  }

  private async delete(fileId: string): Promise<void> {
    await fetch(`${BASE_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: this.headers(),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  }
}

/**
 * Mistral's markdown, tidied for the pipeline: image placeholders point at
 * files we never fetched, and scanner watermarks are furniture here just as
 * they are in extraction.
 */
export function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .split('\n')
    .filter(
      (line) => !/^\s*.{0,10}(scanned with|camscanner).{0,20}$/i.test(line),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
