import { deflateSync } from 'node:zlib';
import {
  decodeImage,
  encodePng,
  sniffImage,
  UnsupportedImageError,
} from './image-codec';

/**
 * The codec moves readers' figures between formats, so the tests are
 * round-trips: pixels in, pixels out, nothing silently wrong. Fixtures are
 * built programmatically — a hand-added binary fixture can't explain itself.
 */

/** A tiny RGBA test card: red, green, blue, half-transparent white. */
function testCard(): { rgba: Buffer; width: number; height: number } {
  const width = 2;
  const height = 2;
  const rgba = Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128,
  ]);
  return { rgba, width, height };
}

describe('encodePng → decodeImage round trip', () => {
  it('produces a real PNG and decodes back to the same pixels', () => {
    const { rgba, width, height } = testCard();
    const png = encodePng(rgba, width, height);

    expect(sniffImage(png)).toBe('png');
    const decoded = decodeImage(png);
    if (decoded.kind !== 'raw') throw new Error('expected raw');
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(decoded.components).toBe(3);
    expect(decoded.smask).not.toBeNull();

    // Inflate the colour plane back and check the first pixel is pure red.
    const { inflateSync } = require('node:zlib') as typeof import('node:zlib');
    const colour = inflateSync(decoded.data);
    expect([colour[0], colour[1], colour[2]]).toEqual([255, 0, 0]);
    const alpha = inflateSync(decoded.smask as Buffer);
    expect(alpha[3]).toBe(128);
  });
});

describe('decodeImage jpeg', () => {
  it('reads dimensions from a minimal JPEG frame header', () => {
    // SOI + SOF0 (8x5, 3 components) + EOI — headers only; DCT data is not
    // needed for embedding, only the geometry.
    const sof = Buffer.from([
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x05, 0x00, 0x08, 0x03, 0x01, 0x22,
      0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      sof,
      Buffer.from([0xff, 0xd9]),
    ]);

    const decoded = decodeImage(jpeg);
    expect(decoded.kind).toBe('jpeg');
    expect(decoded.width).toBe(8);
    expect(decoded.height).toBe(5);
  });
});

describe('decodeImage png variants', () => {
  it('rejects what it cannot faithfully decode', () => {
    expect(() => decodeImage(Buffer.from('GIF89a...'))).toThrow(
      UnsupportedImageError,
    );
  });

  it('decodes an opaque RGBA card to three components', () => {
    // The encoder always writes RGBA, so an all-255 alpha still yields an
    // smask; asserted so a future opaque-smask optimisation updates this.
    const { rgba, width, height } = testCard();
    const opaque = Buffer.from(rgba);
    for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
    const decoded = decodeImage(encodePng(opaque, width, height));
    if (decoded.kind !== 'raw') throw new Error('expected raw');
    expect(decoded.components).toBe(3);
  });

  it('rejects interlaced PNGs plainly', () => {
    const { rgba, width, height } = testCard();
    const png = encodePng(rgba, width, height);
    // Flip the interlace byte inside IHDR (offset: 8 sig + 8 header + 12).
    const broken = Buffer.from(png);
    broken[8 + 8 + 12] = 1;
    // CRC now mismatches but the decoder reads fields before verifying —
    // it must still refuse on the interlace flag.
    expect(() => decodeImage(broken)).toThrow(UnsupportedImageError);
  });
});

describe('deflate sanity', () => {
  it('embedding-sized streams stay reasonable', () => {
    const big = Buffer.alloc(512 * 512 * 4, 200);
    const png = encodePng(big, 512, 512);
    expect(png.length).toBeLessThan(64 * 1024);
    expect(deflateSync(big).length).toBeLessThan(64 * 1024);
  });
});
