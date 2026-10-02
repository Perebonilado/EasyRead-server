/**
 * The frame checks' pictures as files (explainer-animation-plan §9.1): a
 * still read from its PNG into the pixels the checks read, a picture
 * written back as a PNG, and a scene's contact sheet rendered from its
 * tiles. PNGs are read and written with pngjs (pure JS); the sheet's words
 * are drawn by resvg, in a child, in Liberation Sans (scene-raster).
 */
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import type { StillImage } from '../../business/domain/shots/frame-checks';
import {
  criticSheetSvg,
  sheetSvg,
  type SheetInput,
} from '../../business/domain/shots/frame-sheet';
import { rasterise } from '../../business/domain/scene-raster';

/** A PNG's pixels, RGBA. */
export function decodePng(bytes: Buffer): StillImage {
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height, data: png.data };
}

/** Pixels as a PNG. */
export function encodePng(image: StillImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(
    image.data.buffer,
    image.data.byteOffset,
    image.data.byteLength,
  );
  return PNG.sync.write(png);
}

/** A still from its file. */
export async function readStill(file: string): Promise<StillImage> {
  return decodePng(await readFile(file));
}

/** A scene's contact sheet as a PNG. */
export async function contactSheet(input: SheetInput): Promise<Buffer> {
  const { svg, width } = sheetSvg(input);
  return rasterise(svg, width);
}

/** The critic's contact sheet as a PNG (frame-sheet's criticSheetSvg). */
export async function criticSheet(
  input: Parameters<typeof criticSheetSvg>[0],
): Promise<Buffer> {
  const { svg, width } = criticSheetSvg(input);
  return rasterise(svg, width);
}
