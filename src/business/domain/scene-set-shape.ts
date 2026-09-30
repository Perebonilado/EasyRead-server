/**
 * A kept set as a film of a shape sees it (studio-vertical-plan §3.1). A
 * wide film's is the set as kept. A tall film's is the same place, built
 * again by code from its own layout for the tall frame (900 × 1600, the
 * same world at the same scale per metre), gated and its ground measured
 * as the artist's build of it was: no model is asked.
 *
 * A set painted whole, or with pieces the artist drew for it (not kept
 * with it), cannot be built again: its picture is laid on the tall frame
 * at the world's own scale instead (a metre as many units as in a wide
 * film, never magnified as a crop would), its people's ground where a
 * tall frame's people stand, and extended by code above and below from
 * its own edge colours (sky, or a room's upper wall; and its floor). No
 * repaint and no model; its layers are left out (it is a picture, flat).
 * Null only where even that cannot be done.
 */
import type { FilmShape } from './scene-shape';
import { SET_FRAMES, worldHeightOf } from './scene-shape';
import { renderSvg, type Pixels } from './scene-raster';
import type { GatedDrawing } from './scene-svg';
import { buildSet, type SetLook } from './scene-set-layout';
import type { SetSheet } from './scene-sheet';
import { setThing, type StoryPlace, type StoryWorld } from './scene-story';
import { gateDrawing } from './scene-svg';
import { measureGround } from './scene-ground';

export async function setInShape(
  set: SetSheet,
  place: StoryPlace,
  shape: FilmShape,
  bookTitle: string,
  world: StoryWorld | null = null,
  look: SetLook | null = null,
): Promise<SetSheet | null> {
  if (shape === 'wide') return set;
  if (!set.layout || set.layout.own.length) {
    const drawing = await extendedTall(set.drawing);
    if (!drawing) return null;
    const ground = await measureGround(drawing);
    const { layered, ...flat } = set;
    void layered;
    return { ...flat, drawing, ground: ground ?? undefined };
  }
  const built = buildSet(set.layout, place, {}, world, look, SET_FRAMES[shape]);
  const gated = await gateDrawing(
    built.svg,
    setThing(place, bookTitle, world),
    {
      backdrop: true,
    },
  );
  if (!gated.drawing) return null;
  const ground = await measureGround(gated.drawing);
  return {
    ...set,
    drawing: gated.drawing,
    // Its own ground, measured on its own frame: never the wide set's.
    ground: ground ?? undefined,
    layered: built.layered,
  };
}

/** The mean colour of a band of rows of a picture's pixels, as #rrggbb; null where it has no ink there. */
export function bandColour(
  px: Pixels,
  from: number,
  to: number,
): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.max(0, from); y < Math.min(px.rows, to); y += 1)
    for (let x = 0; x < px.cols; x += 1) {
      const i = (y * px.cols + x) * 4;
      if (px.rgba[i + 3] < 128) continue;
      r += px.rgba[i];
      g += px.rgba[i + 1];
      b += px.rgba[i + 2];
      n += 1;
    }
  if (!n) return null;
  const hex = (v: number) =>
    Math.round(v / n)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * A wide set's picture laid on a tall frame (studio-vertical-plan §3.1):
 * at the world's scale, its middle across in the frame's middle, its
 * people's ground (the wide frame's feet) where the tall frame stands its
 * people, the band above it filled with its top edge's colour and the one
 * below with its bottom edge's. Null where it will not render.
 */
export async function extendedTall(
  drawing: GatedDrawing,
  render: typeof renderSvg = renderSvg,
): Promise<GatedDrawing | null> {
  const [vx, vy, vw, vh] = drawing.viewBox;
  if (!(vw > 0 && vh > 0) || vh > vw) return null;
  const wide = SET_FRAMES.wide;
  const tall = SET_FRAMES.tall;
  let px: Pixels | undefined;
  try {
    const read = await render(drawing.svg, undefined, {
      ground: { svgs: [drawing.svg], cols: 64 },
    });
    px = read.ground?.[0];
  } catch {
    return null;
  }
  if (!px) return null;
  const top = bandColour(px, 0, 2) ?? '#cfe6f2';
  const bottom = bandColour(px, px.rows - 2, px.rows) ?? '#d8c7a4';
  // The world's scale: the wide frame's height is the world's in both.
  const k = worldHeightOf(tall.w, tall.h) / vh;
  const w = vw * k;
  const h = vh * k;
  const x = (tall.w - w) / 2;
  const y = tall.feet - (wide.feet / wide.h) * h;
  const r = (n: number) => Math.round(n * 10) / 10;
  const inner = drawing.svg
    .replace(/^[\s\S]*?<svg\b[^>]*>/u, '')
    .replace(/<\/svg>\s*$/u, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tall.w} ${tall.h}">` +
    `<rect x="-10" y="-10" width="${tall.w + 20}" height="${r(y + 12)}" fill="${top}"/>` +
    `<rect x="-10" y="${r(y + h - 2)}" width="${tall.w + 20}" height="${r(tall.h - y - h + 12)}" fill="${bottom}"/>` +
    `<svg x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="hidden">${inner}</svg>` +
    `</svg>`;
  return {
    ...drawing,
    svg,
    viewBox: [0, 0, tall.w, tall.h],
    aspect: tall.w / tall.h,
    callouts: [],
    field: null,
  };
}
