/**
 * A picture's depth, as Depth Anything V2 Small reads it (Apache-2.0; the
 * larger sizes are non-commercial): the maths around the model, pure, so
 * the adapter only decodes, runs and encodes. The stage splits a photo
 * into two or three planes by thresholds of this map and moves them at
 * different speeds with the camera (research §3.4's "one word-led move per
 * still", with depth).
 *
 * The model's own preprocessing (its preprocessor_config.json, a
 * DPTImageProcessor): resized keeping the aspect so the side that needs
 * the least change is 518, each side a multiple of 14, bicubic; scaled to
 * 0–1 and normalised by ImageNet's mean and spread. Its answer is relative
 * inverse depth: larger is nearer, so the map is white near.
 */
import type { PicturePixels } from '../../ports/pictures.port';

/** The model's input side, the multiple each side is held to, and ImageNet's mean and spread. */
export const DEPTH_SIZE = 518;
export const DEPTH_MULTIPLE = 14;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

/** A length held to a multiple, rounded (DPT's constrain_to_multiple_of). */
const toMultiple = (n: number, multiple = DEPTH_MULTIPLE) =>
  Math.max(multiple, Math.round(n / multiple) * multiple);

/**
 * The model's input size for a picture (DPT's keep_aspect_ratio): of the
 * two scales that would make each side 518, the one nearer 1 is used for
 * both, then each side is held to a multiple of 14.
 */
export function depthInputSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const sw = DEPTH_SIZE / Math.max(1, width);
  const sh = DEPTH_SIZE / Math.max(1, height);
  const scale = Math.abs(1 - sw) < Math.abs(1 - sh) ? sw : sh;
  return {
    width: toMultiple(width * scale),
    height: toMultiple(height * scale),
  };
}

/** Pixels (RGBA, at the input size) as the model takes them: three planes, scaled and normalised. */
export function depthTensor(pixels: PicturePixels): Float32Array {
  const { data, width, height } = pixels;
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1)
      out[c * plane + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return out;
}

/**
 * The model's answer as an 8-bit grey map, white near: stretched between
 * its 2nd and 98th percentiles, so one bright speck or one dark corner does
 * not flatten the rest into a single plane.
 */
export function depthGrey(
  predicted: ArrayLike<number>,
  width: number,
  height: number,
): Uint8Array {
  const n = width * height;
  const values = Array.from({ length: n }, (_, i) => Number(predicted[i]) || 0);
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
  const lo = at(0.02);
  const hi = at(0.98);
  const span = hi - lo || 1;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1)
    out[i] = Math.round(
      Math.min(1, Math.max(0, (values[i] - lo) / span)) * 255,
    );
  return out;
}

/**
 * Whether a picture has no colour of its own (a black-and-white or a
 * sepia photograph): hardly any pixel more than a little coloured. Such a
 * print may take the show's ink and paper (a duotone) without a colour it
 * had being lost.
 */
export function isMono(pixels: PicturePixels): boolean {
  const { data, width, height } = pixels;
  const n = width * height;
  if (!n) return false;
  let coloured = 0;
  for (let i = 0; i < n; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) coloured += 1;
  }
  return coloured / n < 0.03;
}

/** The model's file: where it is kept, and its fingerprint (verified before use). */
export const DEPTH_MODEL = {
  url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx',
  bytes: 99_060_839,
  sha256: 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c',
} as const;
