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
import { calendarAsset } from './shot-chart-calendar';
import { counterAsset } from './shot-chart-counter';
import { documentAsset } from './shot-chart-document';
import { flowAsset } from './shot-chart-flow';
import { iconsAsset } from './shot-chart-icons';
import { plotAsset } from './shot-chart-plot';
import { quoteAsset } from './shot-chart-quote';
import { seatsAsset } from './shot-chart-seats';
import { splitAsset } from './shot-chart-split';
import { strikeAsset } from './shot-chart-strike';
import { timelineAsset } from './shot-chart-timeline';
import { transferAsset } from './shot-chart-transfer';

/** The kinds drawn here, as the board names them. */
export const CHART_KINDS = [
  'counter',
  'chart',
  'timeline',
  'quote',
  'strike',
  'document',
  'icons',
  'seats',
  'calendar',
  'split',
  'transfer',
  'plot',
  'flow',
] as const;
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
  quote: quoteAsset,
  strike: strikeAsset,
  document: documentAsset,
  icons: iconsAsset,
  seats: seatsAsset,
  calendar: calendarAsset,
  split: splitAsset,
  transfer: transferAsset,
  plot: plotAsset,
  flow: flowAsset,
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

/** The look a chart's part ids are worked out in: ids come from names, never from colours. */
const PLAIN_LOOK: ShotLookDto = {
  palette: {
    paper: '#FBF7EF',
    ink: '#1F2A37',
    muted: '#5B6675',
    accent: '#E0663A',
    sides: {},
  },
  fonts: { display: 'sans-serif', text: 'sans-serif' },
  grain: 0,
  motion: 'springy',
};

/**
 * The ids of the parts a chart of this spec has, in a shape: what a plan
 * may point its recipes and its camera at. Empty for one that draws
 * nothing.
 */
export function chartPartIds(
  kind: string,
  spec: Record<string, unknown>,
  shape: FilmShape = 'wide',
): string[] {
  const asset = chartAsset(kind, spec, PLAIN_LOOK, shape);
  return asset ? Object.keys(asset.parts) : [];
}

/**
 * Each kind's parts, for the board's prompt: what a plan may name, and
 * which are of the picture's later state (hidden until a recipe brings
 * them on). A name in a part's id is its words made into an id:
 * "Northern Region" is "northern-region".
 */
export const CHART_PARTS_GUIDE = [
  'counter: number (count it), unit, prefix, label, source.',
  'chart: bar-<name> (grow it from the baseline), value-<name> (count it), label-<name>, bars, axis; a line chart: line (draw it), bar-<name> as its points, value-<name> at its ends; unit, source.',
  'timeline: spine (draw it, travel along it), event-<name> holding dot-<name>, date-<name>, label-<name>; source.',
  'quote: quote-line-<n>, quote, phrase-<name>, mark, speaker.',
  'strike: old (strike it), strike (later: draw it), new (later: enter it), label.',
  'document: page, title, headline, lines, signature (draw it), stamp (later: stamp it).',
  'icons: icon-<n>, icons, highlight (fill it to pick the subset out), label, key, source.',
  'seats: group-<name> (enter it to light its seats), chamber, seat-<n>, total (count it), majority (draw it), key, key-<name>, label, source.',
  'calendar: a month: day-<n>, grid, weekdays, date (mark it), title; dated sheets: date-<n>, label-<name>, merge (later: enter it).',
  'split: side-a, side-b, label-<name>, item-<name>, divider (draw it).',
  'transfer: from, to, arc (transfer along it), token-<n>, tokens, label.',
  'plot: curve (draw it), axis-x, axis-y, grid, point-<name>, label-<name>, x-label, y-label, source.',
  'flow: node-<name>, nodes, path-<from>-<to> (flow along it).',
].join('\n');
