/**
 * Just enough image codec to move figures between the web, storage and PDFs
 * — pure JS on node's built-in zlib, because this deployment has no native
 * image libraries and the registry is not guaranteed reachable at build time.
 *
 * Three jobs:
 *  - sniff + measure JPEG and PNG buffers
 *  - decode PNGs far enough to embed them in a PDF (PDF has no RGBA, so
 *    alpha must be split into an SMask; palettes must be expanded)
 *  - encode raw RGBA pixels as a PNG (for figures lifted out of PDFs)
 *
 * JPEG needs no decoding at all: PDF's DCTDecode filter *is* JPEG, so the
 * bytes embed as-is once the header has told us the dimensions.
 */
import { deflateSync, inflateSync } from 'node:zlib';

export type DecodedImage =
  | {
      kind: 'jpeg';
      data: Buffer;
      width: number;
      height: number;
      /** 1 = greyscale, 3 = RGB. CMYK JPEGs are rejected upstream. */
      components: 1 | 3;
    }
  | {
      kind: 'raw';
      /** Deflated interleaved samples, no predictor. */
      data: Buffer;
      width: number;
      height: number;
      components: 1 | 3;
      /** Deflated 8-bit alpha channel, when the source had one. */
      smask: Buffer | null;
    };

export class UnsupportedImageError extends Error {}

export function sniffImage(buffer: Buffer): 'jpeg' | 'png' | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8)
    return 'jpeg';
  if (
    buffer.length > 8 &&
    buffer.readUInt32BE(0) === 0x89504e47 &&
    buffer.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return 'png';
  }
  return null;
}

/** Walk JPEG markers to the frame header for dimensions and components. */
function decodeJpeg(buffer: Buffer): DecodedImage {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    // SOF0..SOF15 minus DHT/JPG/DAC hold the frame dimensions.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      const components = buffer[offset + 9];
      if (components !== 1 && components !== 3) {
        throw new UnsupportedImageError(`JPEG with ${components} components`);
      }
      if (!width || !height)
        throw new UnsupportedImageError('Empty JPEG frame');
      return { kind: 'jpeg', data: buffer, width, height, components };
    }
    offset += 2 + length;
  }
  throw new UnsupportedImageError('No JPEG frame header found');
}

/** Un-apply PNG scanline filters in place, returning raw samples. */
function unfilter(
  data: Buffer,
  width: number,
  height: number,
  bytesPerPixel: number,
): Buffer {
  const stride = width * bytesPerPixel;
  const out = Buffer.alloc(stride * height);

  for (let row = 0; row < height; row++) {
    const filter = data[row * (stride + 1)];
    const lineIn = data.subarray(
      row * (stride + 1) + 1,
      (row + 1) * (stride + 1),
    );
    const lineOut = out.subarray(row * stride, (row + 1) * stride);
    const prior =
      row > 0 ? out.subarray((row - 1) * stride, row * stride) : null;

    for (let i = 0; i < stride; i++) {
      const raw = lineIn[i];
      const left = i >= bytesPerPixel ? lineOut[i - bytesPerPixel] : 0;
      const up = prior ? prior[i] : 0;
      const upLeft = prior && i >= bytesPerPixel ? prior[i - bytesPerPixel] : 0;

      let value: number;
      switch (filter) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + up;
          break;
        case 3:
          value = raw + Math.floor((left + up) / 2);
          break;
        case 4: {
          // Paeth predictor.
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new UnsupportedImageError(`PNG filter ${filter}`);
      }
      lineOut[i] = value & 0xff;
    }
  }
  return out;
}

/** Expand bit-packed palette indices (depth 1/2/4/8) to one byte each. */
function unpackIndices(
  data: Buffer,
  width: number,
  height: number,
  depth: number,
): Buffer {
  if (depth === 8) return unfilter(data, width, height, 1);

  // Sub-byte depths: unfilter operates on the packed stride first.
  const packedStride = Math.ceil((width * depth) / 8);
  const out = Buffer.alloc(width * height);
  const raw = Buffer.alloc(packedStride * height);

  // Unfilter with bytesPerPixel=1 over the packed bytes (per the PNG spec,
  // filters at sub-byte depths treat the byte as the unit).
  const stride = packedStride;
  for (let row = 0; row < height; row++) {
    const filter = data[row * (stride + 1)];
    const lineIn = data.subarray(
      row * (stride + 1) + 1,
      (row + 1) * (stride + 1),
    );
    const lineOut = raw.subarray(row * stride, (row + 1) * stride);
    const prior =
      row > 0 ? raw.subarray((row - 1) * stride, row * stride) : null;
    for (let i = 0; i < stride; i++) {
      const left = i >= 1 ? lineOut[i - 1] : 0;
      const up = prior ? prior[i] : 0;
      const upLeft = prior && i >= 1 ? prior[i - 1] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = lineIn[i];
          break;
        case 1:
          value = lineIn[i] + left;
          break;
        case 2:
          value = lineIn[i] + up;
          break;
        case 3:
          value = lineIn[i] + Math.floor((left + up) / 2);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value =
            lineIn[i] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new UnsupportedImageError(`PNG filter ${filter}`);
      }
      lineOut[i] = value & 0xff;
    }

    // Then unpack this row's indices.
    const mask = (1 << depth) - 1;
    for (let x = 0; x < width; x++) {
      const bit = x * depth;
      const byte = lineOut[bit >> 3];
      const shift = 8 - depth - (bit & 7);
      out[row * width + x] = (byte >> shift) & mask;
    }
  }
  return out;
}

function decodePng(buffer: Buffer): DecodedImage {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const idat: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') palette = Buffer.from(body);
    else if (type === 'tRNS') transparency = Buffer.from(body);
    else if (type === 'IDAT') idat.push(Buffer.from(body));
    else if (type === 'IEND') break;
  }

  if (!width || !height) throw new UnsupportedImageError('Bad PNG header');
  if (interlace) throw new UnsupportedImageError('Interlaced PNG');
  if (width * height > 25_000_000)
    throw new UnsupportedImageError('PNG too large');

  const inflated = inflateSync(Buffer.concat(idat));

  // Palette: expand to RGB (+ alpha from tRNS when present).
  if (colorType === 3) {
    if (!palette) throw new UnsupportedImageError('Palette PNG without PLTE');
    const indices = unpackIndices(inflated, width, height, bitDepth);
    const rgb = Buffer.alloc(width * height * 3);
    let alpha: Buffer | null = transparency
      ? Buffer.alloc(width * height)
      : null;
    let sawTransparent = false;
    for (let i = 0; i < width * height; i++) {
      const index = indices[i];
      rgb[i * 3] = palette[index * 3];
      rgb[i * 3 + 1] = palette[index * 3 + 1];
      rgb[i * 3 + 2] = palette[index * 3 + 2];
      if (alpha) {
        const a =
          index < (transparency as Buffer).length
            ? (transparency as Buffer)[index]
            : 255;
        alpha[i] = a;
        if (a !== 255) sawTransparent = true;
      }
    }
    if (!sawTransparent) alpha = null;
    return {
      kind: 'raw',
      data: deflateSync(rgb),
      width,
      height,
      components: 3,
      smask: alpha ? deflateSync(alpha) : null,
    };
  }

  if (bitDepth !== 8) {
    throw new UnsupportedImageError(`PNG bit depth ${bitDepth}`);
  }

  const channelsFor: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsFor[colorType];
  if (!channels)
    throw new UnsupportedImageError(`PNG colour type ${colorType}`);

  const raw = unfilter(inflated, width, height, channels);

  if (colorType === 0 || colorType === 2) {
    return {
      kind: 'raw',
      data: deflateSync(raw),
      width,
      height,
      components: colorType === 0 ? 1 : 3,
      smask: null,
    };
  }

  // Alpha variants: split colour from alpha, SMask carries the alpha.
  const colourChannels = channels - 1;
  const colour = Buffer.alloc(width * height * colourChannels);
  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < colourChannels; c++) {
      colour[i * colourChannels + c] = raw[i * channels + c];
    }
    alpha[i] = raw[i * channels + colourChannels];
  }
  return {
    kind: 'raw',
    data: deflateSync(colour),
    width,
    height,
    components: colourChannels === 1 ? 1 : 3,
    smask: deflateSync(alpha),
  };
}

/** Decode a buffer the reader gave us into something a PDF can hold. */
export function decodeImage(buffer: Buffer): DecodedImage {
  const kind = sniffImage(buffer);
  if (kind === 'jpeg') return decodeJpeg(buffer);
  if (kind === 'png') return decodePng(buffer);
  throw new UnsupportedImageError('Not a JPEG or PNG');
}

// ── PNG encoding (figures lifted out of PDFs) ────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(...buffers: Buffer[]): number {
  let crc = -1;
  for (const buffer of buffers) {
    for (const byte of buffer)
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  const typeBuffer = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeBuffer, body));
  return Buffer.concat([header, typeBuffer, body, crc]);
}

/** RGBA pixels → a PNG file. Filter 0 throughout — deflate does the work. */
export function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // compression 0, filter 0, interlace 0 already zeroed.

  const stride = width * 4;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row++) {
    filtered[row * (stride + 1)] = 0;
    rgba.copy(
      filtered,
      row * (stride + 1) + 1,
      row * stride,
      (row + 1) * stride,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filtered)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Box-filter downsample of RGBA pixels to a target width, aspect preserved.
 *
 * Averaging every source pixel in each destination cell is the right filter
 * for scans going to a vision model: it keeps thin strokes readable where
 * nearest-neighbour would drop them. Returns the input untouched when it is
 * already narrow enough.
 */
export function downsampleRgba(
  rgba: Buffer,
  width: number,
  height: number,
  maxWidth: number,
): { rgba: Buffer; width: number; height: number } {
  if (width <= maxWidth) return { rgba, width, height };

  const scale = maxWidth / width;
  const outWidth = maxWidth;
  const outHeight = Math.max(1, Math.round(height * scale));
  const out = Buffer.alloc(outWidth * outHeight * 4);

  for (let oy = 0; oy < outHeight; oy++) {
    const y0 = Math.floor(oy / scale);
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((oy + 1) / scale)));
    for (let ox = 0; ox < outWidth; ox++) {
      const x0 = Math.floor(ox / scale);
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((ox + 1) / scale)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const count = (y1 - y0) * (x1 - x0);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = (y * width + x) * 4;
          r += rgba[at];
          g += rgba[at + 1];
          b += rgba[at + 2];
          a += rgba[at + 3];
        }
      }
      const to = (oy * outWidth + ox) * 4;
      out[to] = Math.round(r / count);
      out[to + 1] = Math.round(g / count);
      out[to + 2] = Math.round(b / count);
      out[to + 3] = Math.round(a / count);
    }
  }

  return { rgba: out, width: outWidth, height: outHeight };
}
