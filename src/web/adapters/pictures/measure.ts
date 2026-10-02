/**
 * A picture's size and kind from its first bytes, without decoding it: a
 * PNG's IHDR, a JPEG's frame header (walked marker by marker). Anything
 * else is no picture the stage is handed.
 */
export function measureImage(
  bytes: Buffer,
): { width: number; height: number; mime: 'image/jpeg' | 'image/png' } | null {
  if (
    bytes.length > 24 &&
    bytes.readUInt32BE(0) === 0x89504e47 &&
    bytes.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    return width && height ? { width, height, mime: 'image/png' } : null;
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = bytes[at + 1];
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      at += 2;
      continue;
    }
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const length = bytes.readUInt16BE(at + 2);
    // Start of frame: any SOFn but DHT (C4), JPG (C8) and DAC (CC).
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = bytes.readUInt16BE(at + 5);
      const width = bytes.readUInt16BE(at + 7);
      return width && height ? { width, height, mime: 'image/jpeg' } : null;
    }
    if (marker === 0xda || marker === 0xd9) return null;
    at += 2 + length;
  }
  return null;
}
