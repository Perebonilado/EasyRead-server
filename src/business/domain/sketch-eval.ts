/**
 * Measuring whether a sketch shows what was asked.
 *
 * A fixture is an ask from a real page with the material the live board
 * would have had and a sentence saying what a reader should see. The eval
 * runs the writer and the layout, renders the geometry to a picture, and
 * asks a vision model whether it shows the ask. The number per template
 * is how the templates and the writer prompt are tuned; nothing here runs
 * in the live path.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DiagramGeometry, DiagramMark, DiagramNode } from './board';
import type { SketchTemplate } from './sketch';

export interface SketchFixture {
  name: string;
  pageNumber: number;
  /** What the tutor asked to draw. */
  description: string;
  /** What a reader should see, for the judge. */
  see: string;
  /** The template a good writer picks. */
  expect: SketchTemplate;
  material: string;
}

export interface SketchVerdict {
  name: string;
  template: SketchTemplate | 'none';
  expected: SketchTemplate;
  shows: boolean;
  wrong: string | null;
  caption: string | null;
  writerMs: number;
}

export interface SketchScore {
  /** Share of fixtures the judge said show the ask. */
  shows: number;
  /** Share of fixtures whose template matched the expectation. */
  template: number;
  count: number;
}

export const SKETCH_FIXTURES_DIR = join(__dirname, 'sketch-fixtures');
export const SKETCH_BASELINE_FILE = join(SKETCH_FIXTURES_DIR, 'baseline.json');

export function loadSketchFixtures(
  dir: string = SKETCH_FIXTURES_DIR,
): SketchFixture[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== 'baseline.json')
    .sort()
    .map(
      (file) =>
        JSON.parse(readFileSync(join(dir, file), 'utf8')) as SketchFixture,
    );
}

export function scoreVerdicts(verdicts: SketchVerdict[]): SketchScore {
  const count = verdicts.length || 1;
  return {
    shows: verdicts.filter((verdict) => verdict.shows).length / count,
    template:
      verdicts.filter((verdict) => verdict.template === verdict.expected)
        .length / count,
    count: verdicts.length,
  };
}

/** Scores by mode: the graph-only writer the board had before templates, and the sketch writer. */
export type SketchBaseline = Partial<
  Record<'graph-only' | 'sketch', SketchScore>
>;

export function readBaseline(file = SKETCH_BASELINE_FILE): SketchBaseline {
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as SketchBaseline)
    : {};
}

export function writeBaseline(
  baseline: SketchBaseline,
  file = SKETCH_BASELINE_FILE,
): void {
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
}

const esc = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function onCircle(
  cx: number,
  cy: number,
  r: number,
  deg: number,
): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function nodeSvg(node: DiagramNode): string {
  const { x, y, w, h } = node;
  const label = `<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle">${esc(node.label)}</text>`;
  switch (node.shape) {
    case 'ellipse':
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>${label}`;
    case 'diamond':
      return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}"/>${label}`;
    case 'cylinder': {
      const cap = Math.min(10, h / 4);
      return `<rect x="${x}" y="${y + cap}" width="${w}" height="${h - 2 * cap}"/><ellipse cx="${x + w / 2}" cy="${y + cap}" rx="${w / 2}" ry="${cap}"/>${label}`;
    }
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>${label}`;
  }
}

function markSvg(mark: DiagramMark): string {
  const label =
    mark.label && mark.lx !== undefined && mark.ly !== undefined
      ? `<text x="${mark.lx}" y="${mark.ly + (mark.size ?? 16)}" font-size="${mark.size ?? 16}">${esc(mark.label)}</text>`
      : '';
  switch (mark.kind) {
    case 'circle':
      return `<circle cx="${mark.cx}" cy="${mark.cy}" r="${mark.r}"/>${label}`;
    case 'dot':
      return `<circle cx="${mark.cx}" cy="${mark.cy}" r="${mark.r}" fill="#000"/>${label}`;
    case 'arc': {
      const cx = mark.cx ?? 0;
      const cy = mark.cy ?? 0;
      const r = mark.r ?? 0;
      const [x1, y1] = onCircle(cx, cy, r, mark.from ?? 0);
      const [x2, y2] = onCircle(cx, cy, r, mark.to ?? 0);
      const sweep = ((((mark.to ?? 0) - (mark.from ?? 0)) % 360) + 360) % 360;
      return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}"${mark.arrow ? ' marker-end="url(#head)"' : ''}/>${label}`;
    }
    case 'line':
      return `<line x1="${mark.x1}" y1="${mark.y1}" x2="${mark.x2}" y2="${mark.y2}"${mark.arrow ? ' marker-end="url(#head)"' : ''}/>${label}`;
    case 'bar': {
      const cells = Math.max(0, mark.cells ?? 0);
      const x = mark.x ?? 0;
      const y = mark.y ?? 0;
      const w = mark.w ?? 0;
      const h = mark.h ?? 0;
      const lines = Array.from({ length: Math.max(0, cells - 1) }, (_, i) => {
        const cx = x + (w * (i + 1)) / cells;
        return `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + h}"/>`;
      }).join('');
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>${lines}${label}`;
    }
    case 'text':
    default:
      return label;
  }
}

/** The geometry as a plain picture, the shapes the pen would draw without the wobble. */
export function sketchSvg(geometry: DiagramGeometry): string {
  const { w, h } = geometry.space;
  const body = [
    ...geometry.groups.map(
      (group) =>
        `<rect x="${group.x}" y="${group.y}" width="${group.w}" height="${group.h}" stroke-dasharray="6 4"/><text x="${group.x + 8}" y="${group.y + 18}" font-size="13">${esc(group.label)}</text>`,
    ),
    ...geometry.nodes.map(nodeSvg),
    ...geometry.edges.map((edge) => {
      const points = edge.points.map((point) => point.join(',')).join(' ');
      const mid = edge.points[Math.floor(edge.points.length / 2)] ?? [0, 0];
      return `<polyline points="${points}" marker-end="url(#head)"/>${
        edge.label
          ? `<text x="${mid[0] + 6}" y="${mid[1] - 6}" font-size="13">${esc(edge.label)}</text>`
          : ''
      }`;
    }),
    ...(geometry.marks ?? []).map(markSvg),
  ].join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="sans-serif" font-size="16">`,
    '<defs><marker id="head" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#000"/></marker></defs>',
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#fff" stroke="none"/>`,
    `<text x="${w / 2}" y="30" text-anchor="middle" font-size="22">${esc(geometry.title)}</text>`,
    `<g fill="none" stroke="#000" stroke-width="2">${body}</g>`,
    '</svg>',
  ]
    .join('\n')
    .replace(/<text /g, '<text fill="#000" stroke="none" ');
}
