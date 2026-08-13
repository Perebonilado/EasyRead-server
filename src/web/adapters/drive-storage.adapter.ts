import { Readable } from 'stream';
import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '../../business/domain/errors/errors';
import type {
  ByteRange,
  StoragePort,
  StoredFile,
} from '../../business/ports/storage.port';
import { GoogleDriveClient } from './google-drive.client';

/**
 * Google Drive as the object store.
 *
 * Refs are Drive file ids, not paths — the logical key is kept in `appProperties`
 * so a document's files can still be found by name, and so re-uploading the same
 * key replaces the file instead of accumulating duplicates.
 *
 * Files are never given public permissions. Everything is served through the
 * API, which is what keeps ownership checks in front of the bytes (§10).
 */
@Injectable()
export class DriveStorageAdapter implements StoragePort {
  private readonly logger = new Logger(DriveStorageAdapter.name);

  constructor(private readonly client: GoogleDriveClient) {}

  async put({
    key,
    body,
    mimeType,
  }: {
    key: string;
    body: Buffer | Readable;
    mimeType: string;
  }): Promise<StoredFile> {
    const drive = this.client.drive();
    const stream = Buffer.isBuffer(body) ? Readable.from(body) : body;
    const existing = await this.findByKey(key);

    if (existing) {
      const updated = await drive.files.update({
        fileId: existing,
        media: { mimeType, body: stream },
        fields: 'id,size',
      });
      return {
        ref: updated.data.id!,
        sizeBytes: Number(updated.data.size ?? 0),
        mimeType,
      };
    }

    const folderId = this.client.folderId();
    const created = await drive.files.create({
      requestBody: {
        name: key.split('/').pop() ?? key,
        appProperties: { easyreadKey: key },
        ...(folderId ? { parents: [folderId] } : {}),
      },
      media: { mimeType, body: stream },
      fields: 'id,size',
    });

    return {
      ref: created.data.id!,
      sizeBytes: Number(created.data.size ?? 0),
      mimeType,
    };
  }

  async get(ref: string): Promise<Buffer> {
    const { stream } = await this.stream(ref);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async stream(
    ref: string,
    range?: ByteRange,
  ): Promise<{ stream: Readable; size: number }> {
    const drive = this.client.drive();
    const size = await this.size(ref);

    // Drive honours Range on alt=media, which is what lets pdf.js fetch only
    // the pages it needs instead of the whole file.
    const response = await drive.files.get(
      { fileId: ref, alt: 'media' },
      {
        responseType: 'stream',
        headers: range
          ? { Range: `bytes=${range.start}-${range.end}` }
          : undefined,
      },
    );

    return {
      stream: response.data,
      size: range ? range.end - range.start + 1 : size,
    };
  }

  async size(ref: string): Promise<number> {
    try {
      const response = await this.client
        .drive()
        .files.get({ fileId: ref, fields: 'size' });
      return Number(response.data.size ?? 0);
    } catch {
      throw new NotFoundError('File');
    }
  }

  async delete(ref: string): Promise<void> {
    try {
      await this.client.drive().files.delete({ fileId: ref });
    } catch (error) {
      // Already gone is the desired end state.
      this.logger.warn(`Delete of ${ref} failed: ${(error as Error).message}`);
    }
  }

  /**
   * Drive resumable sessions are per-file and short-lived, and handing one to
   * the browser would let the client name and size the file however it liked.
   * Bytes come through the API instead, where the intent is already recorded.
   */
  async createUploadTarget({ documentId }: { documentId: string }) {
    return {
      uploadUrl: `/api/v1/documents/${documentId}/content`,
      uploadMode: 'proxy' as const,
    };
  }

  private async findByKey(key: string): Promise<string | null> {
    const escaped = key.replace(/'/g, "\\'");
    const response = await this.client.drive().files.list({
      q: `appProperties has { key='easyreadKey' and value='${escaped}' } and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    });
    return response.data.files?.[0]?.id ?? null;
  }
}
