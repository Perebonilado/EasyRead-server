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
import { renderMath } from './scene-math';
import { renderPlot } from './scene-plot';
import { renderQuote } from './scene-quote';
import { renderTimeline } from './scene-timeline';
import { renderSvg } from './scene-raster';
import type { CodeThing } from './scene-script';
import { framedBox, type GatedDrawing } from './scene-svg';

/** A thing drawn by code: rendered, measured, and framed to its ink. */
export async function drawByCode(thing: CodeThing): Promise<GatedDrawing> {
  let svg: string;
  let viewBox: [number, number, number, number];
  let parts: Record<string, string> = {};
  let states: Record<string, string> = {};
  let callouts: Callout[] = [];
  let moves = false;
  let words: { size: number } | undefined;
  if (thing.kind === 'math') {
    const set = renderMath(thing.lines);
    ({ svg, viewBox, parts, states } = set);
  } else if (thing.kind === 'plot') {
    const plot = renderPlot(thing.plot);
    ({ svg, viewBox, parts, callouts } = plot);
    // Its curve draws itself as it arrives.
    moves = true;
  } else if (thing.kind === 'timeline') {
    // Its axis draws itself, and its events come in along it.
    ({ svg, viewBox, parts } = renderTimeline(thing.timeline));
    moves = true;
  } else if (thing.kind === 'chart') {
    // Its bars grow, or its line draws itself.
    ({ svg, viewBox, parts } = renderChart(thing.chart));
    moves = true;
  } else {
    const quote = renderQuote({ text: thing.text, phrases: thing.phrases });
    ({ svg, viewBox, parts, callouts } = quote);
    words = { size: quote.size };
  }
  const measured = await renderSvg(svg, undefined, {
    grid: { svg, cols: 48 },
  });
  const framed = measured.ink ? framedBox(viewBox, measured.ink) : viewBox;
  const framedSvg = svg.replace(
    /viewBox="[^"]*"/,
    `viewBox="${framed.join(' ')}"`,
  );
  return {
    svg: framedSvg,
    viewBox: framed,
    aspect: Math.min(4, Math.max(0.4, framed[2] / framed[3])),
    parts,
    labels: {},
    states,
    moves,
    callouts,
    field: measured.grid ? { viewBox, map: measured.grid } : null,
    ...(words ? { words } : {}),
  };
}
