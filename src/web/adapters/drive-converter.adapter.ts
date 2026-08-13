import { Readable } from 'stream';
import { Injectable, Logger } from '@nestjs/common';
import {
  DomainError,
  UnsupportedFormatError,
} from '../../business/domain/errors/errors';
import { ErrorCodes } from '../../contracts';
import type { ConverterPort } from '../../business/ports/converter.port';
import { GoogleDriveClient } from './google-drive.client';

/**
 * Free Office → PDF conversion via Google Drive.
 *
 * The trick, lifted from AI Examiner: uploading a DOCX/PPTX while asking Drive
 * to store it as a Google-native type makes Drive convert it on import, and
 * exporting a Google-native file as PDF is also free. So DOCX → Google Docs →
 * PDF and PPTX → Google Slides → PDF cost nothing beyond API calls, replacing
 * Aspose entirely (which is what the technical design §4.2 assumed, and which
 * priced out).
 *
 * The intermediate Google file is deleted afterwards. AI Examiner keeps its
 * copies because it serves them for viewing; here the canonical PDF is stored
 * in our own storage, so leaving them behind would just grow Drive without
 * bound.
 */

/** Which Google-native type each source format converts through. */
const CONVERT_VIA: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'application/vnd.google-apps.document',
  'application/msword': 'application/vnd.google-apps.document',
  'application/vnd.oasis.opendocument.text':
    'application/vnd.google-apps.document',
  'text/plain': 'application/vnd.google-apps.document',
  'text/rtf': 'application/vnd.google-apps.document',
  'application/rtf': 'application/vnd.google-apps.document',

  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'application/vnd.google-apps.presentation',
  'application/vnd.ms-powerpoint': 'application/vnd.google-apps.presentation',
  'application/vnd.oasis.opendocument.presentation':
    'application/vnd.google-apps.presentation',
};

/** Drive refuses to export more than this much content in one call. */
const EXPORT_LIMIT_BYTES = 10 * 1024 * 1024;

@Injectable()
export class DriveConverterAdapter implements ConverterPort {
  private readonly logger = new Logger(DriveConverterAdapter.name);

  constructor(private readonly client: GoogleDriveClient) {}

  supports(mimeType: string): boolean {
    return mimeType === 'application/pdf' || mimeType in CONVERT_VIA;
  }

  async toPdf({
    buffer,
    mimeType,
    filename,
  }: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<Buffer> {
    // PDFs are already canonical — the majority path, and the reason most
    // uploads reach the reader in seconds (§4.2).
    if (mimeType === 'application/pdf') return buffer;

    const target = CONVERT_VIA[mimeType];
    if (!target)
      throw new UnsupportedFormatError(extensionOf(mimeType, filename));

    const drive = this.client.drive();
    const folderId = this.client.folderId();
    let fileId: string | undefined;

    try {
      // Asking Drive to store it as a Google-native type is what triggers the
      // free conversion on import.
      const created = await drive.files.create({
        requestBody: {
          name: filename,
          mimeType: target,
          ...(folderId ? { parents: [folderId] } : {}),
        },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id',
        supportsAllDrives: true,
      });

      fileId = created.data.id ?? undefined;
      if (!fileId)
        throw new Error('Drive returned no file id for the converted upload');

      // Deliberately NOT made public. AI Examiner grants `anyone: reader` here
      // because it serves the Drive link directly; EasyRead streams bytes
      // through its own authenticated endpoint, so a world-readable link would
      // expose every uploaded study document to anyone who guessed the id.
      const exported = await drive.files.export(
        { fileId, mimeType: 'application/pdf' },
        { responseType: 'arraybuffer' },
      );

      const pdf = Buffer.from(exported.data as ArrayBuffer);
      if (!pdf.length) throw new Error('Drive returned an empty PDF export');

      this.logger.log(
        `Converted ${filename} (${mimeType}) via ${target}: ` +
          `${buffer.length} → ${pdf.length} bytes`,
      );
      return pdf;
    } catch (error) {
      throw this.explain(error as Error, filename, buffer.length);
    } finally {
      // Best effort: a leaked intermediate is untidy, not fatal.
      if (fileId) {
        await drive.files
          .delete({ fileId, supportsAllDrives: true })
          .catch((error: Error) =>
            this.logger.warn(
              `Could not delete intermediate ${fileId}: ${error.message}`,
            ),
          );
      }
    }
  }

  /**
   * Drive's failures are opaque by default. Translate the ones we can actually
   * anticipate into something the user or operator can act on.
   */
  private explain(
    error: Error,
    filename: string,
    sizeBytes: number,
  ): DomainError {
    const message = error.message ?? '';

    if (
      /exportSizeLimitExceeded|too large/i.test(message) ||
      sizeBytes > EXPORT_LIMIT_BYTES
    ) {
      return new DomainError(
        ErrorCodes.FILE_TOO_LARGE,
        'That file is too large for us to convert. Exporting it to PDF yourself and ' +
          'uploading that will work.',
        413,
      );
    }

    if (
      /storageQuotaExceeded|service accounts do not have storage/i.test(message)
    ) {
      this.logger.error(
        'Drive upload hit a storage quota error. The service account needs domain-wide ' +
          'delegation and GOOGLE_WORKSPACE_SUBJECT set to a real Workspace user.',
      );
      return new DomainError(
        ErrorCodes.STORAGE_BUSY,
        'We could not convert that file just now. Please try again shortly.',
        503,
      );
    }

    // A 400 means Drive read the bytes and rejected them: the file is corrupt,
    // or its contents don't match the extension. Retrying cannot help, and the
    // queue's three attempts would just take three times as long to say so.
    if (
      /bad request|invalid|cannot be converted|not supported/i.test(message)
    ) {
      this.logger.error(`Drive rejected ${filename}: ${message}`);
      return new DomainError(
        ErrorCodes.UNSUPPORTED_FORMAT,
        `We couldn't read ${filename}. The file may be damaged, or it may not be the ` +
          'format its name suggests. Opening it and re-saving it usually fixes this.',
        415,
      );
    }

    this.logger.error(`Drive conversion failed for ${filename}: ${message}`);
    return new DomainError(
      ErrorCodes.STORAGE_BUSY,
      'We could not convert that file. Please try again.',
      503,
    );
  }
}

function extensionOf(mimeType: string, filename: string): string {
  const fromName = filename.split('.').pop();
  if (fromName && fromName !== filename) return fromName.toLowerCase();
  return mimeType.split('/').pop() ?? 'file';
}
