import { createReadStream, promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import type { Readable } from 'stream';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundError } from '../../business/domain/errors/errors';
import type {
  ByteRange,
  StoragePort,
  StoredFile,
} from '../../business/ports/storage.port';

/**
 * Filesystem storage for local development, standing in for Google Drive.
 *
 * Refs are relative paths. Every ref is resolved and checked to be inside the
 * storage root before use, so a crafted ref can't escape the directory.
 */
@Injectable()
export class LocalStorageAdapter implements StoragePort {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(this.config.get<string>('STORAGE_ROOT', './storage'));
  }

  private absolute(ref: string): string {
    const path = resolve(this.root, ref);
    if (path !== this.root && !path.startsWith(this.root + '/')) {
      throw new NotFoundError('File');
    }
    return path;
  }

  async put({
    key,
    body,
    mimeType,
  }: {
    key: string;
    body: Buffer | Readable;
    mimeType: string;
  }): Promise<StoredFile> {
    const path = this.absolute(key);
    await fs.mkdir(dirname(path), { recursive: true });

    if (Buffer.isBuffer(body)) {
      await fs.writeFile(path, body);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of body) chunks.push(chunk as Buffer);
      await fs.writeFile(path, Buffer.concat(chunks));
    }

    const { size } = await fs.stat(path);
    return { ref: key, sizeBytes: size, mimeType };
  }

  async get(ref: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.absolute(ref));
    } catch {
      throw new NotFoundError('File');
    }
  }

  async stream(
    ref: string,
    range?: ByteRange,
  ): Promise<{ stream: Readable; size: number }> {
    const path = this.absolute(ref);
    const size = await this.size(ref);
    const stream = range
      ? createReadStream(path, { start: range.start, end: range.end })
      : createReadStream(path);
    return { stream, size };
  }

  async size(ref: string): Promise<number> {
    try {
      return (await fs.stat(this.absolute(ref))).size;
    } catch {
      throw new NotFoundError('File');
    }
  }

  async delete(ref: string): Promise<void> {
    await fs.rm(this.absolute(ref), { force: true });
  }

  /**
   * No signed-URL equivalent on a local disk, so the browser posts through the
   * API. Drive returns a resumable session URL here instead and the mode
   * becomes 'direct' — the client already handles both (§3.2).
   */
  async createUploadTarget({ documentId }: { documentId: string }) {
    return {
      uploadUrl: `/api/v1/documents/${documentId}/content`,
      uploadMode: 'proxy' as const,
    };
  }

  /** Convention for where a document's files live. */
  static keyFor(documentId: string, name: string): string {
    return join('documents', documentId, name);
  }
}
