import type { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundError } from '../../business/domain/errors/errors';
import type {
  ByteRange,
  StoragePort,
  StoredFile,
} from '../../business/ports/storage.port';

/**
 * S3-compatible object storage — Railway Buckets, Cloudflare R2, MinIO, S3.
 *
 * This is what makes a two-service deployment possible at all: the API writes
 * an upload and the worker reads it minutes later from another container, so
 * the bytes cannot live on either one's disk (and a Railway volume attaches to
 * a single service).
 *
 * Refs are plain object keys, identical to the local driver's paths, so the
 * two drivers are interchangeable and nothing else in the codebase knows which
 * one is running.
 *
 * `forcePathStyle` by default: everything except AWS itself serves buckets as
 * a path (`host/bucket/key`) rather than a subdomain, and a virtual-host
 * request to those endpoints fails in ways that look like a missing file.
 */
@Injectable()
export class S3StorageAdapter implements StoragePort {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION', 'auto'),
      endpoint: this.config.get<string>('S3_ENDPOINT'),
      forcePathStyle:
        this.config.get<string>('S3_FORCE_PATH_STYLE', 'true') !== 'false',
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
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
    // Buffered rather than streamed: S3 needs a known length up front, and a
    // stream of unknown size forces multipart. Uploads are already capped at
    // MAX_UPLOAD_BYTES, so holding one in memory is bounded and brief.
    const bytes = Buffer.isBuffer(body) ? body : await collect(body);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
        ContentLength: bytes.length,
      }),
    );

    return { ref: key, sizeBytes: bytes.length, mimeType };
  }

  async get(ref: string): Promise<Buffer> {
    const { stream } = await this.stream(ref);
    return collect(stream);
  }

  /**
   * Ranged reads matter here: pdf.js asks for byte ranges and the reader's
   * time-to-first-page depends on them, so the range is passed through to S3
   * rather than fetching the whole object and slicing it.
   */
  async stream(
    ref: string,
    range?: ByteRange,
  ): Promise<{ stream: Readable; size: number }> {
    const result = await this.send(
      () =>
        this.client.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: ref,
            Range: range ? `bytes=${range.start}-${range.end}` : undefined,
          }),
        ),
      ref,
    );

    if (!result.Body) throw new NotFoundError('File');
    // `ContentLength` is the length of *this* response, so a ranged read
    // reports the slice. Callers want the whole object's size, which the
    // Content-Range header carries as the part after the slash.
    const total = range
      ? Number(result.ContentRange?.split('/')[1] ?? result.ContentLength ?? 0)
      : (result.ContentLength ?? 0);

    return { stream: result.Body as Readable, size: total };
  }

  async size(ref: string): Promise<number> {
    const result = await this.send(
      () =>
        this.client.send(
          new HeadObjectCommand({ Bucket: this.bucket, Key: ref }),
        ),
      ref,
    );
    return result.ContentLength ?? 0;
  }

  async delete(ref: string): Promise<void> {
    // A delete that finds nothing is a success: purging is best-effort and
    // must not fail a request because the object was already gone.
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: ref }))
      .catch((error: Error) =>
        this.logger.warn(`Could not delete ${ref}: ${error.message}`),
      );
  }

  /**
   * The browser posts through the API, as it does locally.
   *
   * A presigned PUT would let the bytes skip this server entirely, which is
   * the reason to reach for it later — but the upload endpoint is also where
   * the size cap, the plan check and the pipeline kick-off happen, so moving
   * it is a change of flow, not a change of URL.
   */
  createUploadTarget({ documentId }: { documentId: string }) {
    return Promise.resolve({
      uploadUrl: `/api/v1/documents/${documentId}/content`,
      uploadMode: 'proxy' as const,
    });
  }

  /** S3's "no such key" is a 404 to us, not a 500. */
  private async send<Out>(run: () => Promise<Out>, ref: string): Promise<Out> {
    try {
      return await run();
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      const name = (error as Error).name;
      if (status === 404 || name === 'NoSuchKey' || name === 'NotFound') {
        throw new NotFoundError('File');
      }
      this.logger.error(`S3 ${name} on ${ref}: ${(error as Error).message}`);
      throw error;
    }
  }
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
