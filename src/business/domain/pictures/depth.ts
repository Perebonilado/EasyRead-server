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

/**
 * How tightly a picture's colour clusters round one hue, 0 to 1, among
 * its pixels with colour at all (the resultant length of their hues,
 * weighted by how coloured each is): a sepia or a toned print is near 1,
 * a photograph in colour (sky, brick, grass) well under it. 1 when no
 * pixel has colour.
 */
export function hueConcentration(pixels: PicturePixels): number {
  const { data, width, height } = pixels;
  let x = 0;
  let y = 0;
  let weight = 0;
  for (let i = 0; i < width * height; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const max = Math.max(r, g, b);
    const chroma = max - Math.min(r, g, b);
    if (chroma <= 24) continue;
    const h =
      max === r
        ? ((g - b) / chroma + 6) % 6
        : max === g
          ? (b - r) / chroma + 2
          : (r - g) / chroma + 4;
    const angle = (h / 6) * 2 * Math.PI;
    x += chroma * Math.cos(angle);
    y += chroma * Math.sin(angle);
    weight += chroma;
  }
  return weight ? Math.hypot(x, y) / weight : 1;
}

/** How tightly a toned print's hues cluster, at least. */
const TONED = 0.9;

/**
 * Whether a picture is a photograph's monochrome: grey, or toned in one
 * hue (sepia, cyanotype, selenium), as every archive print before colour
 * film was common is. A modern colour photograph of an old place is not.
 */
export function isMonochrome(pixels: PicturePixels): boolean {
  return isMono(pixels) || hueConcentration(pixels) >= TONED;
}

/** The side, in cells, of a picture's print. */
export const PRINT_SIDE = 16;

/**
 * A picture's print, for knowing it again under another file's name: the
 * grey of its content's middle (its scan's border and a fifth of each
 * edge left out, so a crop or a caption strip barely moves it) in a
 * 16 × 16 grid, as hex.
 */
export function printOf(
  pixels: PicturePixels,
  content: [number, number, number, number] = [0, 0, 1, 1],
): string {
  const { data, width, height } = pixels;
  const [cx, cy, cw, ch] = content;
  const x0 = (cx + cw * 0.1) * width;
  const y0 = (cy + ch * 0.1) * height;
  const w = cw * 0.8 * width;
  const h = ch * 0.8 * height;
  const cells: number[] = [];
  for (let j = 0; j < PRINT_SIDE; j += 1)
    for (let i = 0; i < PRINT_SIDE; i += 1) {
      const xa = Math.floor(x0 + (i * w) / PRINT_SIDE);
      const xb = Math.max(xa + 1, Math.floor(x0 + ((i + 1) * w) / PRINT_SIDE));
      const ya = Math.floor(y0 + (j * h) / PRINT_SIDE);
      const yb = Math.max(ya + 1, Math.floor(y0 + ((j + 1) * h) / PRINT_SIDE));
      let sum = 0;
      let n = 0;
      for (let y = ya; y < Math.min(yb, height); y += 1)
        for (let x = xa; x < Math.min(xb, width); x += 1) {
          const k = (y * width + x) * 4;
          sum += 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2];
          n += 1;
        }
      cells.push(n ? Math.round(sum / n) : 0);
    }
  return cells.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * How alike two prints are, -1 to 1: the best correlation of their greys
 * as one is slid up to two cells each way over the other (a crop moves a
 * picture by that much). Two files of one photograph score near 1; two
 * photographs of one man at one desk, well under.
 */
export function printsAlike(a: string, b: string): number {
  const read = (hex: string) =>
    Array.from({ length: PRINT_SIDE * PRINT_SIDE }, (_, i) =>
      parseInt(hex.slice(i * 2, i * 2 + 2), 16),
    );
  if (a.length !== b.length || a.length !== PRINT_SIDE * PRINT_SIDE * 2)
    return 0;
  const p = read(a);
  const q = read(b);
  let best = -1;
  for (let dy = -2; dy <= 2; dy += 1)
    for (let dx = -2; dx <= 2; dx += 1) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let j = 0; j < PRINT_SIDE; j += 1)
        for (let i = 0; i < PRINT_SIDE; i += 1) {
          const u = i + dx;
          const v = j + dy;
          if (u < 0 || v < 0 || u >= PRINT_SIDE || v >= PRINT_SIDE) continue;
          xs.push(p[j * PRINT_SIDE + i]);
          ys.push(q[v * PRINT_SIDE + u]);
        }
      const n = xs.length;
      const mx = xs.reduce((s, v) => s + v, 0) / n;
      const my = ys.reduce((s, v) => s + v, 0) / n;
      let sxy = 0;
      let sxx = 0;
      let syy = 0;
      for (let k = 0; k < n; k += 1) {
        sxy += (xs[k] - mx) * (ys[k] - my);
        sxx += (xs[k] - mx) ** 2;
        syy += (ys[k] - my) ** 2;
      }
      const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
      if (r > best) best = r;
    }
  return Math.round(best * 1000) / 1000;
}

/** The most of each edge a scan's border is taken to be, and how far past it its soft inner edge runs. */
const BORDER_MOST = 0.15;
const BORDER_SOFT = 0.02;

/**
 * Where a picture's own content is, inside the border its scan may have
 * (a negative holder's black edge, a mount's white card): each edge
 * stepped in while its line is even and near black or near white. As
 * shares of the picture: x, y, w, h. A crop is evidence's own treatment
 * (research §3.4: crop, levels, grey), and a black edge across a
 * full-bleed frame reads as a mistake.
 */
export function contentBox(
  pixels: PicturePixels,
): [number, number, number, number] {
  const { data, width, height } = pixels;
  const luma = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    );
  };
  /** Whether a line of pixels is border: even, and near black or near white. */
  const border = (values: number[]) => {
    const mean = values.reduce((n, v) => n + v, 0) / Math.max(1, values.length);
    const spread = Math.sqrt(
      values.reduce((n, v) => n + (v - mean) ** 2, 0) /
        Math.max(1, values.length),
    );
    return spread < 0.09 && (mean < 0.18 || mean > 0.93);
  };
  const row = (y: number) =>
    Array.from({ length: width }, (_, x) => luma(x, y));
  /**
   * How deep a border runs in from one edge: line by line while the lines
   * are border, stepping over a thin lighter line between two runs of it
   * (a film's rebate between a holder's black and the frame's own edge).
   */
  const depth = (line: (k: number) => number[], side: number) => {
    const most = Math.floor(side * BORDER_MOST);
    let found = 0;
    let k = 0;
    while (k < most) {
      if (border(line(k))) {
        k += 1;
        found = k;
        continue;
      }
      // A line or two that is not border, with border again past it, is part of it.
      const ahead = [1, 2, 3].find((d) => k + d < most && border(line(k + d)));
      if (!found || ahead === undefined) break;
      k += ahead;
    }
    return found;
  };
  const top = depth((k) => row(k), height);
  const bottom = depth((k) => row(height - 1 - k), height);
  // A column is read between the top and bottom borders already found: a
  // black edge at the side and a white mount below are each even alone.
  const column = (x: number) =>
    Array.from({ length: Math.max(1, height - top - bottom) }, (_, k) =>
      luma(x, top + k),
    );
  const left = depth((k) => column(k), width);
  const right = depth((k) => column(width - 1 - k), width);
  // Past the border's soft inner edge (a scan's black fades into the
  // print over a few per cent): a border found is taken a little further.
  const soft = (n: number, side: number) =>
    n ? n + Math.max(1, Math.round(side * BORDER_SOFT)) : 0;
  const [x0, y0] = [soft(left, width), soft(top, height)];
  const [x1, y1] = [width - soft(right, width), height - soft(bottom, height)];
  return [
    x0 / width,
    y0 / height,
    Math.max(1, x1 - x0) / width,
    Math.max(1, y1 - y0) / height,
  ];
}

/** The model's file: where it is kept, and its fingerprint (verified before use). */
export const DEPTH_MODEL = {
  url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx',
  bytes: 99_060_839,
  sha256: 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c',
} as const;
