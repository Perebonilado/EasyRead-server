import { randomFillSync } from 'crypto';

const bytes = Buffer.alloc(16);

/**
 * Time-ordered ids (RFC 9562 UUIDv7).
 *
 * MySQL has no native `uuid7()`, so ids are generated here. The ordering is the
 * point: random v4 keys scatter inserts across the whole B-tree and fragment
 * it, while v7's leading timestamp keeps every insert at the right edge.
 *
 * Written out rather than pulled from the `uuid` package because that package
 * is now ESM-only and this codebase compiles to CommonJS.
 *
 * Layout: 48 bits of unix milliseconds, 4-bit version, 12 bits random,
 * 2-bit variant, 62 bits random.
 */
export const newId = (): string => {
  randomFillSync(bytes);

  const now = Date.now();
  bytes.writeUIntBE(now, 0, 6);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};
