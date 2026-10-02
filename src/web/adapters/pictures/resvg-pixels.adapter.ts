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

/**
 * The grid a model that sees names cells of, drawn over the picture: thin
 * lines in white over black, and each cell's name in its corner, so the
 * model reads where a thing is rather than guessing its row (marks on the
 * picture are read far better than a grid described in words).
 */
function gridOf(width: number, height: number, grid: number): string {
  const lines: string[] = [];
  for (let k = 1; k < grid; k += 1) {
    const x = Math.round((k * width) / grid);
    const y = Math.round((k * height) / grid);
    for (const [colour, w] of [
      ['#000', 3],
      ['#fff', 1],
    ] as const) {
      lines.push(
        `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${colour}" stroke-opacity="0.55" stroke-width="${w}"/>`,
        `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${colour}" stroke-opacity="0.55" stroke-width="${w}"/>`,
      );
    }
  }
  const size = Math.max(11, Math.round(Math.min(width, height) / grid / 5));
  for (let row = 0; row < grid; row += 1)
    for (let column = 0; column < grid; column += 1) {
      const name = `${'ABCDEFGHIJ'[column]}${row + 1}`;
      const x = Math.round((column * width) / grid) + 3;
      const y = Math.round((row * height) / grid) + size + 1;
      lines.push(
        `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" font-weight="700" fill="#fff" stroke="#000" stroke-width="${Math.max(2, size / 5)}" paint-order="stroke">${name}</text>`,
      );
    }
  return lines.join('');
}

/** A picture drawn at an exact size as a PNG, with the cells of a grid drawn over it when asked. */
export function pngAt(
  bytes: Buffer,
  mime: string,
  width: number,
  height: number,
  grid = 0,
): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" href="data:${mime};base64,${bytes.toString('base64')}"/>${grid > 1 ? gridOf(width, height, grid) : ''}</svg>`;
  return new Resvg(svg, {
    fitTo: { mode: 'original' },
    background: 'rgba(255,255,255,1)',
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng();
}

export class ResvgPixelsAdapter implements PicturePixelsPort {
  measure(bytes: Buffer) {
    return measureImage(bytes);
  }

  png(bytes: Buffer, short: number, grid = 0): Promise<Buffer | null> {
    const size = measureImage(bytes);
    if (!size) return Promise.resolve(null);
    const scale = Math.min(1, short / Math.min(size.width, size.height));
    try {
      return Promise.resolve(
        pngAt(
          bytes,
          size.mime,
          Math.max(1, Math.round(size.width * scale)),
          Math.max(1, Math.round(size.height * scale)),
          grid,
        ),
      );
    } catch {
      return Promise.resolve(null);
    }
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
