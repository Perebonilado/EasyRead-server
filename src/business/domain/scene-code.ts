/**
 * The things code draws itself, made ready for the stage the way the
 * artist's drawings are: working set by MathJax, a graph from its
 * function, the text's own words. Each is measured in the same child the
 * gate renders in, for its ink and its ink map, so its labels and the
 * arrows round it are placed by the same rules as a drawing's, and the
 * audit sees it the same way.
 */
import type { Callout } from './scene-callouts';
import { renderChart } from './scene-chart';
import { renderFlags } from './scene-flag';
import { renderFlow } from './scene-flow';
import { renderMolecule } from './scene-molecule';
import { renderMap } from './scene-map';
import { renderMath } from './scene-math';
import { renderPlot } from './scene-plot';
import { renderQuote } from './scene-quote';
import { renderTimeline } from './scene-timeline';
import { renderSvg } from './scene-raster';
import type { CodeThing, InfographicThing } from './scene-script';
import { framedBox, type GatedDrawing } from './scene-svg';
import { renderCounter } from './scene-counter';
import { renderIcons } from './scene-icons';
import { renderNamecard } from './scene-namecard';
import { renderCalendar } from './scene-calendar';
import { renderSeats } from './scene-seats';
import { renderStrike } from './scene-strike';
import { renderTransfer } from './scene-transfer';
import { renderDocument } from './scene-document';
import { renderSplit } from './scene-split';
import {
  TEXT_FLOOR,
  sourceText,
  withSourceLine,
  type InfographicDrawing,
} from './scene-infographic-style';

/** The kinds the infographic modules draw (scene-counter … scene-split). */
const INFOGRAPHIC: ReadonlySet<string> = new Set([
  'counter',
  'icons',
  'namecard',
  'calendar',
  'seats',
  'strike',
  'transfer',
  'document',
  'split',
]);
const isInfographic = (thing: CodeThing): thing is InfographicThing =>
  INFOGRAPHIC.has(thing.kind);

/**
 * One of the infographic kinds drawn for the film's shape at its
 * audience's text size: each module's own renderX(spec, shape, text).
 */
export function drawInfographic(
  thing: InfographicThing,
  shape: 'wide' | 'tall' = 'wide',
): InfographicDrawing {
  const text = thing.text ?? TEXT_FLOOR;
  switch (thing.kind) {
    case 'counter':
      return renderCounter(thing.counter, shape, text);
    case 'icons':
      return renderIcons(thing.icons, shape, text);
    case 'namecard':
      return renderNamecard(thing.namecard, shape, text);
    case 'calendar':
      return renderCalendar(thing.calendar, shape, text);
    case 'seats':
      return renderSeats(thing.seats, shape, text);
    case 'strike':
      return renderStrike(thing.strike, shape, text);
    case 'transfer':
      return renderTransfer(thing.transfer, shape, text);
    case 'document':
      return renderDocument(thing.document, shape, text);
    case 'split':
      return renderSplit(thing.split, shape, text);
  }
}

/** A chart's, a graph's or a timeline's source, written small under it. */
function sourceOf(thing: CodeThing): string | null {
  const said =
    thing.kind === 'chart'
      ? thing.chart.source
      : thing.kind === 'plot'
        ? thing.plot.source
        : thing.kind === 'timeline'
          ? thing.timeline.source
          : null;
  return sourceText(said);
}

/**
 * A thing drawn by code: rendered, measured, and framed to its ink. In a
 * tall film a chart is taller than wide with fewer bars, a graph square,
 * and a map square or portrait (studio-vertical-plan §4.2); flags, a
 * flow and a molecule are drawn for the frame's room, at their
 * audience's text size.
 */
export async function drawByCode(
  thing: CodeThing,
  shape: 'wide' | 'tall' = 'wide',
): Promise<GatedDrawing> {
  let svg: string;
  let viewBox: [number, number, number, number];
  let parts: Record<string, string> = {};
  let labels: Record<string, string> = {};
  let states: Record<string, string> = {};
  let callouts: Callout[] = [];
  let moves = false;
  let words: { size: number } | undefined;
  /** Drawn exactly into the show's map's frame: kept so, for the next scene's map to line up with it. */
  let framed = false;
  /** What the ink is measured by, when not the drawing itself. */
  let ink: string | undefined;
  if (thing.kind === 'math') {
    const set = renderMath(thing.lines, thing.picture ?? null);
    ({ svg, viewBox, parts, states } = set);
  } else if (thing.kind === 'plot') {
    const plot = renderPlot(thing.plot, shape);
    ({ svg, viewBox, parts, callouts } = plot);
    // Its curve draws itself as it arrives.
    moves = true;
  } else if (thing.kind === 'timeline') {
    // Its axis draws itself, and its events come in along it.
    ({ svg, viewBox, parts } = renderTimeline(thing.timeline));
    moves = true;
  } else if (thing.kind === 'chart') {
    // Its bars grow, or its line draws itself.
    ({ svg, viewBox, parts } = renderChart(thing.chart, shape));
    moves = true;
  } else if (thing.kind === 'flag') {
    // Each country's true flag; several come in one after another.
    ({ svg, viewBox, parts, moves } = renderFlags(
      { flags: thing.flags },
      shape,
      thing.text,
    ));
  } else if (thing.kind === 'flow') {
    // Its steps come in along the flow, and its arrows draw themselves.
    ({ svg, viewBox, parts } = renderFlow(thing.flow, shape, thing.text));
    moves = true;
  } else if (thing.kind === 'molecule') {
    // Its bonds, then its atoms.
    ({ svg, viewBox, parts } = await renderMolecule(
      thing.molecule,
      shape,
      thing.text,
    ));
    moves = true;
  } else if (isInfographic(thing)) {
    // A counter, a unit chart, a name card, a calendar, a chamber's seats,
    // words struck out, things moving, a document, a split screen: each
    // comes in by its own motion, and its later looks are states.
    ({ svg, viewBox, parts, states, ink } = drawInfographic(thing, shape));
    moves = true;
  } else if (thing.kind === 'map') {
    // Drawn from real data and fitted to the film's frame (a show's maps
    // to the show's one frame); its countries come in one after another
    // and its routes draw themselves.
    const map = await renderMap(thing.map, shape, thing.text);
    ({ svg, viewBox, parts, labels, callouts } = map);
    framed = map.framed;
    moves = true;
  } else {
    const quote = renderQuote({ text: thing.text, phrases: thing.phrases });
    ({ svg, viewBox, parts, callouts } = quote);
    words = { size: quote.size };
  }
  // A data picture's source, small and muted under it.
  const source = sourceOf(thing);
  if (source) {
    ({ svg, viewBox } = withSourceLine(svg, viewBox, source));
    parts = { ...parts, source: 'source' };
  }
  const measuredSvg = ink ?? svg;
  const measured = await renderSvg(measuredSvg, undefined, {
    grid: { svg: measuredSvg, cols: 48 },
  });
  const box =
    measured.ink && !framed ? framedBox(viewBox, measured.ink) : viewBox;
  const framedSvg = svg.replace(
    /viewBox="[^"]*"/,
    `viewBox="${box.join(' ')}"`,
  );
  return {
    svg: framedSvg,
    viewBox: box,
    aspect: Math.min(4, Math.max(0.4, box[2] / box[3])),
    parts,
    labels,
    states,
    moves,
    callouts,
    field: measured.grid ? { viewBox, map: measured.grid } : null,
    ...(words ? { words } : {}),
  };
}
