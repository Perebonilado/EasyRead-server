/**
 * The code kinds drawn full frame with named parts, for the shots engine
 * (explainer-animation-tech.md §4.1, work package 6): a counter, an icon
 * grid, a calendar, a chamber's seats, a strike, a transfer, a document, a
 * split, a chart, a plot, a timeline, a flow and a quote, each an SVG whose
 * every addressable part carries data-part="<id>" with its box (and its
 * path or value where a recipe needs one), sized to fill the frame of the
 * scene's shape.
 *
 * Until work package 6 lands this knows no kind and says so with null; the
 * builder then falls back to a safe shot.
 */
import type { FilmShape, ShotLookDto, ShotSvgAssetDto } from '../../../contracts';

export function chartAsset(
  kind: string,
  spec: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  void kind;
  void spec;
  void look;
  void shape;
  return null;
}
