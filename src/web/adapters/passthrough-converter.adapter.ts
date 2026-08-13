import { Injectable } from '@nestjs/common';
import { UnsupportedFormatError } from '../../business/domain/errors/errors';
import type { ConverterPort } from '../../business/ports/converter.port';

/**
 * PDF-only conversion, for local development with no Google credentials.
 *
 * PDFs pass straight through — the majority path, and the reason most uploads
 * reach the reader in seconds (§4.2). Office formats are rejected up front,
 * with a clear message, rather than failing deep in the pipeline where the user
 * would just watch "processing" forever.
 *
 * Set CONVERTER_DRIVER=drive to handle DOCX/PPTX; Drive converts them for free.
 */
@Injectable()
export class PassthroughConverterAdapter implements ConverterPort {
  supports(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }

  async toPdf({
    buffer,
    mimeType,
  }: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }) {
    if (this.supports(mimeType)) return buffer;
    throw new UnsupportedFormatError(mimeType.split('/').pop() ?? 'file');
  }
}
