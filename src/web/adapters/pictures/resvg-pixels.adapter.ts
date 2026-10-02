/**
 * A picture's pixels, small, for the desk's own checks (whether it has
 * colour) and for the depth model's input: decoded and resized by resvg,
 * which the server already runs to measure drawings, so no image library
 * is added. The JPEG or PNG is drawn into an SVG of the size wanted,
 * stretched to it exactly, and resvg hands back RGBA.
 */
import { Resvg } from '@resvg/resvg-js';
import type {
  PicturePixels,
  PicturePixelsPort,
} from '../../../business/ports/pictures.port';
import { measureImage } from './measure';

/** A picture drawn at an exact size (the depth model's), as RGBA. */
export function pixelsAt(
  bytes: Buffer,
  mime: string,
  width: number,
  height: number,
): PicturePixels {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" href="data:${mime};base64,${bytes.toString('base64')}"/></svg>`;
  const image = new Resvg(svg, {
    fitTo: { mode: 'original' },
    imageRendering: 0,
    background: 'rgba(255,255,255,1)',
  }).render();
  return {
    data: new Uint8Array(image.pixels),
    width: image.width,
    height: image.height,
  };
}

export class ResvgPixelsAdapter implements PicturePixelsPort {
  measure(bytes: Buffer) {
    return measureImage(bytes);
  }

  pixels(bytes: Buffer, short: number): Promise<PicturePixels | null> {
    const size = measureImage(bytes);
    if (!size) return Promise.resolve(null);
    const scale = Math.min(1, short / Math.min(size.width, size.height));
    try {
      return Promise.resolve(
        pixelsAt(
          bytes,
          size.mime,
          Math.max(1, Math.round(size.width * scale)),
          Math.max(1, Math.round(size.height * scale)),
        ),
      );
    } catch {
      return Promise.resolve(null);
    }
  }
}
