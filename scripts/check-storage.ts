/**
 * Proves the configured storage driver actually works, before a deployment
 * discovers it doesn't.
 *
 * Storage failures are the quietest kind: an upload succeeds, the worker
 * can't read the file back, and the document sits in `processing` with no
 * obvious cause. This exercises the whole port — including the ranged read
 * the PDF reader depends on — against the real bucket, then cleans up.
 *
 *   npm run check:storage
 */
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { Readable } from 'stream';
import { NotFoundError } from '../src/business/domain/errors/errors';
import type { StoragePort } from '../src/business/ports/storage.port';
import { LocalStorageAdapter } from '../src/web/adapters/local-storage.adapter';
import { S3StorageAdapter } from '../src/web/adapters/s3-storage.adapter';

loadEnv();

const config = new ConfigService();
const driver = config.get<string>('STORAGE_DRIVER', 'local');

function adapterFor(name: string): StoragePort {
  if (name === 's3') return new S3StorageAdapter(config);
  if (name === 'local') return new LocalStorageAdapter(config);
  throw new Error(
    `check:storage covers local and s3; STORAGE_DRIVER is "${name}"`,
  );
}

const results: string[] = [];
const pass = (what: string) => results.push(`  ok    ${what}`);
const fail = (what: string, detail: string) => {
  results.push(`  FAIL  ${what} — ${detail}`);
};

async function main(): Promise<void> {
  const storage = adapterFor(driver);
  const key = `healthcheck/${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Big enough that a ranged read is a genuine slice, not the whole object.
  const body = Buffer.concat([
    Buffer.from('%PDF-1.5\n'),
    Buffer.alloc(64 * 1024, 0x41),
    Buffer.from('\n%%EOF'),
  ]);

  console.log(`Checking STORAGE_DRIVER=${driver}`);
  if (driver === 's3') {
    console.log(
      `  bucket ${config.get('S3_BUCKET')} at ${config.get('S3_ENDPOINT') ?? 'aws'}`,
    );
  }

  try {
    const stored = await storage.put({
      key,
      body,
      mimeType: 'application/pdf',
    });
    if (stored.sizeBytes === body.length) pass('put');
    else fail('put', `reported ${stored.sizeBytes} bytes, sent ${body.length}`);

    const round = await storage.get(key);
    if (round.equals(body)) pass('get returns the same bytes');
    else fail('get', 'bytes differ from what was written');

    const size = await storage.size(key);
    if (size === body.length) pass('size');
    else fail('size', `reported ${size}, expected ${body.length}`);

    // What pdf.js issues on every page turn. The slice must be the requested
    // window, while `size` must still describe the whole object.
    const { stream, size: total } = await storage.stream(key, {
      start: 100,
      end: 199,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const slice = Buffer.concat(chunks);
    if (slice.equals(body.subarray(100, 200)))
      pass('ranged read returns the right window');
    else fail('ranged read', `got ${slice.length} bytes, expected 100`);
    if (total === body.length) pass('ranged read reports the full object size');
    else fail('ranged read size', `reported ${total}, expected ${body.length}`);

    const streamKey = `${key}-streamed`;
    const streamed = await storage.put({
      key: streamKey,
      body: Readable.from([Buffer.from('one'), Buffer.from('two')]),
      mimeType: 'application/pdf',
    });
    if (streamed.sizeBytes === 6) pass('put accepts a stream');
    else fail('stream put', `reported ${streamed.sizeBytes} bytes, expected 6`);
    await storage.delete(streamKey);

    try {
      await storage.get(`${key}-does-not-exist`);
      fail('missing object', 'returned data instead of raising');
    } catch (error) {
      if (error instanceof NotFoundError)
        pass('missing object raises NotFoundError');
      else fail('missing object', `raised ${(error as Error).name}`);
    }

    await storage.delete(key);
    try {
      await storage.size(key);
      fail('delete', 'object still readable afterwards');
    } catch {
      pass('delete');
    }

    await storage.delete(key);
    pass('deleting an absent object is a no-op');
  } catch (error) {
    fail('storage', (error as Error).message);
  }

  console.log(results.join('\n'));
  const failed = results.filter((line) => line.includes('FAIL')).length;
  if (failed) {
    console.error(`\n${failed} check(s) failed — do not deploy with this.`);
    process.exit(1);
  }
  console.log('\nStorage is good.');
}

void main();
