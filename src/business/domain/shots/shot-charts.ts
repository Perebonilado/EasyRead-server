/**
 * The code kinds drawn full frame with named parts, for the shots engine
 * (explainer-animation-tech.md §4.1, work package 6): a counter, an icon
 * grid, a calendar, a chamber's seats, a strike, a transfer, a document, a
 * split, a chart, a plot, a timeline, a flow and a quote, each an SVG whose
 * every addressable part carries data-part="<id>" with its box (and its
 * path or value where a recipe needs one), sized to fill the frame of the
 * scene's shape. Each kind is drawn by its own module (shot-chart-<kind>),
 * reading the same fields the scene writer gives that kind today.
 *
 * A name card is never drawn: a person is shown by a verified portrait
 * (the picture desk), never by a card of type standing in for a face. A
 * kind code does not know, or a spec it cannot read, is null, and the
 * builder falls back to a safe shot.
 */
import type {
  FilmShape,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { barsAsset } from './shot-chart-bars';
import { counterAsset } from './shot-chart-counter';
import { timelineAsset } from './shot-chart-timeline';

/** The kinds drawn here, as the board names them. */
export const CHART_KINDS = ['counter', 'chart', 'timeline'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

type Draw = (
  spec: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
) => ShotSvgAssetDto | null;

const DRAW: Record<ChartKind, Draw> = {
  counter: counterAsset,
  chart: barsAsset,
  timeline: timelineAsset,
};

/** Whether a kind is one drawn here. */
export const isChartKind = (kind: unknown): kind is ChartKind =>
  typeof kind === 'string' && (CHART_KINDS as readonly string[]).includes(kind);

export function chartAsset(
  kind: string,
  spec: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const key = String(kind ?? '')
    .toLowerCase()
    .trim();
  if (!isChartKind(key)) return null;
  const given =
    spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : {};
  try {
    return DRAW[key](given, look, shape === 'tall' ? 'tall' : 'wide');
  } catch {
    // A spec no layout can be made of is no picture: the builder's safe shot.
    return null;
  }
}
