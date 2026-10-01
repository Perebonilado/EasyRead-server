/**
 * A flow drawn by code: a process, a cycle, a life cycle, a food chain or
 * web, a family tree, a decision tree. The writer names the steps and
 * what leads to what; code lays it out (dagre for anything that branches,
 * a ring for a cycle, rows for a long chain) and draws it in the house
 * style: rounded boxes in the theme's tokens, a question as a diamond,
 * arrows that draw themselves from one step to the next, the words at
 * the audience's own size. Each step is a part the voice can point at by
 * its label. Nothing about where things go is the writer's, or a model's.
 */
import * as dagreModule from '@dagrejs/dagre';
import {
  EXACT_ROOM,
  TEXT_FLOOR,
  escapeXml,
  r1,
  widest,
  wrapWords,
} from './scene-exact-style';
import { groupId, idKey } from './scene-ids';
import type { FilmShape } from './scene-shape';
import { PAPER } from './scene-themes';

/** The little of dagre used here (as diagram.ts types it). */
interface LayoutGraph {
  setGraph(options: Record<string, unknown>): void;
  setDefaultEdgeLabel(fn: () => Record<string, unknown>): void;
  setNode(id: string, value: Record<string, unknown>): void;
  setEdge(from: string, to: string, value: Record<string, unknown>): void;
  node(id: string): { x: number; y: number; width: number; height: number };
  edge(
    from: string,
    to: string,
  ): { points?: { x: number; y: number }[]; x?: number; y?: number };
  graph(): { width?: number; height?: number };
}
const dagre = dagreModule as unknown as {
  graphlib: { Graph: new (options?: Record<string, unknown>) => LayoutGraph };
  layout: (graph: LayoutGraph) => void;
};

export const FLOW_KINDS = ['step', 'decision', 'start', 'end'] as const;
export type FlowNodeKind = (typeof FLOW_KINDS)[number];
export const FLOW_DIRECTIONS = ['down', 'across', 'cycle'] as const;
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number];

/** A flow as code keeps it: its steps, and what leads to what by their places in the list. */
export interface FlowSpec {
  direction: FlowDirection;
  nodes: { label: string; kind: FlowNodeKind }[];
  edges: { from: number; to: number; label: string | null }[];
}

/** A flow as the writer gives it: steps by label, links by the labels they join. */
export interface FlowDraft {
  direction: string | null;
  nodes: { label: string; kind: string | null }[] | null;
  edges: { from: string; to: string; label: string | null }[] | null;
}

/** The most steps one flow holds, and links. */
export const MAX_FLOW_NODES = 10;
export const MAX_FLOW_EDGES = 16;

const clean = (text: string | null | undefined) =>
  (text ?? '').replace(/\s+/g, ' ').trim();

/** A direction as the writer may say it. */
function directionOf(said: string | null): FlowDirection | null {
  const key = idKey(said ?? '');
  if (/^(down|vertical|topdown|tb|td|topbottom|column)$/.test(key))
    return 'down';
  if (/^(across|horizontal|lr|leftright|right|row|sideways)$/.test(key))
    return 'across';
  if (/^(cycle|circle|loop|ring|round|cyclic)$/.test(key)) return 'cycle';
  return null;
}

/** Whether links make one ring through every step: each leads to the next, the last back to the first. */
export function isRing(
  n: number,
  edges: readonly { from: number; to: number }[],
): boolean {
  if (n < 3 || edges.length !== n) return false;
  const next = new Map<number, number>();
  for (const e of edges) {
    if (next.has(e.from)) return false;
    next.set(e.from, e.to);
  }
  let at = 0;
  for (let i = 0; i < n; i += 1) {
    const to = next.get(at);
    if (to === undefined) return false;
    at = to;
    if (at === 0 && i < n - 1) return false;
  }
  return at === 0;
}

/**
 * A flow as the writer gives it, read: its steps cleaned and each once,
 * its links joined by label (a link to a step it does not have is left
 * off, and said), and no links read as one step leading to the next (and
 * round again, in a cycle). Null when it has fewer than two steps.
 */
export function readFlow(draft: FlowDraft | null | undefined): {
  spec: FlowSpec | null;
  dropped: string[];
} {
  const dropped: string[] = [];
  const nodes: FlowSpec['nodes'] = [];
  const at = new Map<string, number>();
  for (const node of draft?.nodes ?? []) {
    const label = clean(node?.label);
    const key = idKey(label);
    if (!key || at.has(key)) continue;
    if (nodes.length >= MAX_FLOW_NODES) {
      dropped.push(`the step "${label}" is past ${MAX_FLOW_NODES}`);
      continue;
    }
    const kind = (FLOW_KINDS as readonly string[]).includes(node.kind ?? '')
      ? (node.kind as FlowNodeKind)
      : 'step';
    at.set(key, nodes.length);
    nodes.push({ label, kind });
  }
  if (nodes.length < 2) return { spec: null, dropped };
  const find = (said: string): number | undefined => {
    const key = idKey(said);
    if (at.has(key)) return at.get(key);
    // "2" or "step 2": a step by its place.
    const n = /^(?:step)?(\d+)$/.exec(key);
    if (n && Number(n[1]) >= 1 && Number(n[1]) <= nodes.length)
      return Number(n[1]) - 1;
    // A label said a little differently: one that holds the other.
    const near = [...at.entries()].filter(
      ([k]) => key.length >= 3 && (k.includes(key) || key.includes(k)),
    );
    return near.length === 1 ? near[0][1] : undefined;
  };
  const edges: FlowSpec['edges'] = [];
  for (const edge of draft?.edges ?? []) {
    const from = find(clean(edge?.from));
    const to = find(clean(edge?.to));
    if (from === undefined || to === undefined || from === to) {
      dropped.push(
        `the link "${clean(edge?.from)}" to "${clean(edge?.to)}" joins no two of its steps`,
      );
      continue;
    }
    if (edges.some((e) => e.from === from && e.to === to)) continue;
    if (edges.length >= MAX_FLOW_EDGES) continue;
    edges.push({ from, to, label: clean(edge.label) || null });
  }
  const said = directionOf(draft?.direction ?? null);
  if (!edges.length) {
    // No links: each step leads to the next, and a cycle comes round again.
    for (let i = 0; i + 1 < nodes.length; i += 1)
      edges.push({ from: i, to: i + 1, label: null });
    if (said === 'cycle' && nodes.length >= 3)
      edges.push({ from: nodes.length - 1, to: 0, label: null });
  }
  const direction: FlowDirection =
    said === 'cycle' || (said === null && isRing(nodes.length, edges))
      ? nodes.length >= 3
        ? 'cycle'
        : 'across'
      : (said ?? 'across');
  return { spec: { direction, nodes, edges }, dropped };
}

// ── Laying it out ──────────────────────────────────────────────────────────

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A step as laid out: its box (its centre and size), and its words. */
export interface LaidNode extends Box {
  lines: string[];
  kind: FlowNodeKind;
}

/** A link as laid out: a path, where its arrow points, and where its words go. */
interface LaidEdge {
  d: string;
  /** The tip and the way it points (a unit vector). */
  tip: [number, number];
  dir: [number, number];
  length: number;
  label: string | null;
  at: [number, number] | null;
}

interface Laid {
  nodes: LaidNode[];
  edges: LaidEdge[];
  width: number;
  height: number;
}

/** The sizes of the words in a flow, from the smallest text its audience reads. */
const sizesFor = (text: number) => ({
  node: Math.round(text * 1.15),
  edge: Math.round(text),
});

/** Each step's box, sized to its words: wrapped to at most three lines. */
function sized(spec: FlowSpec, text: number, across: number): LaidNode[] {
  const { node: size } = sizesFor(text);
  return spec.nodes.map((node) => {
    const lines = wrapWords(node.label, across, size, 3, 700);
    const w0 = widest(lines, size, 700);
    const h0 = lines.length * size * 1.2;
    const padX = size * 0.75;
    const padY = size * 0.55;
    let w = Math.max(w0 + padX * 2, size * 4.2);
    let h = h0 + padY * 2;
    if (node.kind === 'decision') {
      // A diamond holds its words in its middle half.
      w = Math.max(w0 * 1.55 + padX, size * 5);
      h = Math.max(h0 * 1.9 + padY, size * 3.2);
    }
    return { x: 0, y: 0, w, h, lines, kind: node.kind };
  });
}

const mid = (a: [number, number], b: [number, number]): [number, number] => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];
const dist = (a: [number, number], b: [number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Whether a point is inside a step's box (its centre and size), with room round it. */
const inside = (p: [number, number], b: Box, pad: number) =>
  Math.abs(p[0] - b.x) <= b.w / 2 + pad &&
  Math.abs(p[1] - b.y) <= b.h / 2 + pad;

/** A quadratic curve's point at t, and its blossom (de Casteljau). */
const blossom = (
  p0: [number, number],
  c: [number, number],
  p2: [number, number],
  u: number,
  v: number,
): [number, number] => [
  (1 - u) * (1 - v) * p0[0] +
    ((1 - u) * v + u * (1 - v)) * c[0] +
    u * v * p2[0],
  (1 - u) * (1 - v) * p0[1] +
    ((1 - u) * v + u * (1 - v)) * c[1] +
    u * v * p2[1],
];

/**
 * A link from one box to another along a quadratic curve through `c`,
 * cut where it leaves the first box and where it meets the second.
 */
function curved(
  a: Box,
  b: Box,
  c: [number, number],
  label: string | null,
  gap: number,
): LaidEdge {
  const p0: [number, number] = [a.x, a.y];
  const p2: [number, number] = [b.x, b.y];
  let t0 = 0;
  let t1 = 1;
  for (let t = 0; t <= 1; t += 0.005)
    if (inside(blossom(p0, c, p2, t, t), a, gap)) t0 = t;
  for (let t = 1; t >= 0; t -= 0.005)
    if (inside(blossom(p0, c, p2, t, t), b, gap)) t1 = t;
  if (t1 <= t0) [t0, t1] = [0.3, 0.7];
  const start = blossom(p0, c, p2, t0, t0);
  const control = blossom(p0, c, p2, t0, t1);
  const end = blossom(p0, c, p2, t1, t1);
  const dx = end[0] - control[0];
  const dy = end[1] - control[1];
  const n = Math.hypot(dx, dy) || 1;
  return {
    d: `M${r1(start[0])} ${r1(start[1])}Q${r1(control[0])} ${r1(control[1])} ${r1(end[0])} ${r1(end[1])}`,
    tip: end,
    dir: [dx / n, dy / n],
    length: dist(start, control) + dist(control, end),
    label,
    at: label ? blossom(p0, c, p2, (t0 + t1) / 2, (t0 + t1) / 2) : null,
  };
}

/** Where the line from a diamond's centre toward a point leaves the diamond. */
function onDiamond(box: Box, toward: [number, number]): [number, number] {
  const dx = toward[0] - box.x;
  const dy = toward[1] - box.y;
  const k = 1 / (Math.abs(dx) / (box.w / 2) + Math.abs(dy) / (box.h / 2) || 1);
  return [box.x + dx * k, box.y + dy * k];
}

/** A link along points (dagre's), smoothed through their midpoints. */
function along(
  points: [number, number][],
  label: string | null,
  at: [number, number] | null,
): LaidEdge {
  const [first] = points;
  const last = points[points.length - 1];
  const before = points[points.length - 2];
  let d = `M${r1(first[0])} ${r1(first[1])}`;
  if (points.length === 2) d += `L${r1(last[0])} ${r1(last[1])}`;
  else {
    for (let i = 1; i < points.length - 1; i += 1) {
      const m = i === points.length - 2 ? last : mid(points[i], points[i + 1]);
      d += `Q${r1(points[i][0])} ${r1(points[i][1])} ${r1(m[0])} ${r1(m[1])}`;
    }
  }
  const dx = last[0] - before[0];
  const dy = last[1] - before[1];
  const n = Math.hypot(dx, dy) || 1;
  let length = 0;
  for (let i = 1; i < points.length; i += 1)
    length += dist(points[i - 1], points[i]);
  return { d, tip: last, dir: [dx / n, dy / n], length, label, at };
}

/** A cycle: its steps round a ring, each link an arc to the next. */
function ringLayout(spec: FlowSpec, text: number, shape: FilmShape): Laid {
  const room = EXACT_ROOM[shape];
  const nodes = sized(spec, text, text * 7.5);
  const n = nodes.length;
  const maxW = Math.max(...nodes.map((b) => b.w));
  const maxH = Math.max(...nodes.map((b) => b.h));
  // The ring as wide (or, in a tall frame, as tall) as the room, and in
  // the other way only as far as keeps every step clear of the rest, with
  // room for the arrow between neighbours.
  const step = (2 * Math.PI) / n;
  const place = (rx: number, ry: number) =>
    nodes.map((box, i) => {
      const angle = -Math.PI / 2 + i * step;
      return { ...box, x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
    });
  const clear = (rx: number, ry: number) => {
    const at = place(rx, ry);
    return at.every((a, i) =>
      at.every((b, j) => {
        if (j <= i) return true;
        const sx = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
        const sy = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
        const neighbours = (i + 1) % n === j || (j + 1) % n === i;
        return Math.max(sx, sy) >= text * (neighbours ? 1.9 : 1.6);
      }),
    );
  };
  const tall = shape === 'tall';
  const fixed = Math.max(
    text * 2,
    tall ? (room.h - maxH) / 2 : (room.w - maxW) / 2,
  );
  let free = text * 2;
  const grow = (k: number) => (tall ? clear(k, fixed) : clear(fixed, k));
  while (!grow(free) && free < fixed * 4) free += text * 0.25;
  // Not squashed flatter than a third of its length.
  free = Math.max(free, fixed * (tall ? 0.55 : 0.4));
  const rx = tall ? free : fixed;
  const ry = tall ? fixed : free;
  const cx = rx + maxW / 2;
  const cy = ry + maxH / 2;
  nodes.forEach((box, i) => {
    // The first at the top, then round clockwise.
    const angle = -Math.PI / 2 + i * step;
    box.x = cx + rx * Math.cos(angle);
    box.y = cy + ry * Math.sin(angle);
  });
  const gap = text * 0.35;
  const edges = spec.edges.map((e) => {
    const a = nodes[e.from];
    const b = nodes[e.to];
    const m = mid([a.x, a.y], [b.x, b.y]);
    // Round the ring: the curve pushed out from the middle.
    const ox = m[0] - cx;
    const oy = m[1] - cy;
    const on = Math.hypot(ox, oy) || 1;
    const next = (e.from + 1) % n === e.to;
    const bow = next ? Math.min(rx, ry) * 0.28 : 0;
    return curved(
      a,
      b,
      [m[0] + (ox / on) * bow, m[1] + (oy / on) * bow],
      e.label,
      gap,
    );
  });
  return { nodes, edges, width: cx * 2, height: cy * 2 };
}

/** Whether the links are one chain: each step to the next, in order. */
const isChain = (spec: FlowSpec) =>
  spec.edges.length === spec.nodes.length - 1 &&
  spec.edges.every((e, i) => e.from === i && e.to === i + 1);

/**
 * A long chain in rows (or columns), read as lines of text are: along
 * each, then back to the start of the next. Dagre's single line would be
 * too long for the frame.
 */
function wrappedChain(
  spec: FlowSpec,
  text: number,
  down: boolean,
  lines: number,
): Laid {
  const nodes = sized(spec, text, text * 7);
  const n = nodes.length;
  const per = Math.ceil(n / lines);
  const cellW = Math.max(...nodes.map((b) => b.w));
  const cellH = Math.max(...nodes.map((b) => b.h));
  const stepGap = text * 2.2;
  const across = text * 2.4;
  nodes.forEach((box, i) => {
    const line = Math.floor(i / per);
    const k = i % per;
    if (down) {
      box.x = cellW / 2 + line * (cellW + across);
      box.y = cellH / 2 + k * (cellH + stepGap);
    } else {
      box.x = cellW / 2 + k * (cellW + stepGap);
      box.y = cellH / 2 + line * (cellH + across);
    }
  });
  const gap = text * 0.3;
  const edges = spec.edges.map((e) => {
    const a = nodes[e.from];
    const b = nodes[e.to];
    const sameLine = Math.floor(e.from / per) === Math.floor(e.to / per);
    if (sameLine) {
      const from: [number, number] = down
        ? [a.x, a.y + a.h / 2 + gap]
        : [a.x + a.w / 2 + gap, a.y];
      const to: [number, number] = down
        ? [b.x, b.y - b.h / 2 - gap]
        : [b.x - b.w / 2 - gap, b.y];
      return along2(from, to, e.label);
    }
    // To the next line: out of the last, across the gap between lines, into the first.
    const half = across / 2;
    const pts: [number, number][] = down
      ? [
          [a.x, a.y + a.h / 2 + gap],
          [a.x, a.y + a.h / 2 + gap + text * 0.6],
          [a.x + cellW / 2 + half, a.y + a.h / 2 + gap + text * 0.6],
          [a.x + cellW / 2 + half, b.y - b.h / 2 - gap - text * 0.6],
          [b.x, b.y - b.h / 2 - gap - text * 0.6],
          [b.x, b.y - b.h / 2 - gap],
        ]
      : [
          [a.x, a.y + a.h / 2 + gap],
          [a.x, a.y + cellH / 2 + half],
          [b.x, a.y + cellH / 2 + half],
          [b.x, b.y - b.h / 2 - gap],
        ];
    return along(pts, e.label, null);
  });
  const width = down
    ? lines * cellW + (lines - 1) * across
    : Math.min(per, n) * cellW + (Math.min(per, n) - 1) * stepGap;
  const height = down
    ? Math.min(per, n) * cellH + (Math.min(per, n) - 1) * stepGap
    : lines * cellH + (lines - 1) * across;
  return { nodes, edges, width, height };

  function along2(
    from: [number, number],
    to: [number, number],
    label: string | null,
  ): LaidEdge {
    return {
      d: `M${r1(from[0])} ${r1(from[1])}L${r1(to[0])} ${r1(to[1])}`,
      tip: to,
      dir: (() => {
        const n2 = dist(from, to) || 1;
        return [(to[0] - from[0]) / n2, (to[1] - from[1]) / n2] as [
          number,
          number,
        ];
      })(),
      length: dist(from, to),
      label,
      at: label ? mid(from, to) : null,
    };
  }
}

/** Anything that branches, laid out by dagre in ranks, down or across. */
function dagreLayout(
  spec: FlowSpec,
  text: number,
  down: boolean,
  narrow = false,
): Laid {
  const { edge: edgeSize } = sizesFor(text);
  const nodes = sized(spec, text, text * (narrow ? 5.5 : down ? 8 : 6.5));
  const g = new dagre.graphlib.Graph({ multigraph: false });
  const labelled = spec.edges.some((e) => e.label);
  g.setGraph({
    rankdir: down ? 'TB' : 'LR',
    nodesep: text * (narrow ? 0.9 : 1.3),
    ranksep: text * (labelled ? 2.6 : 1.9),
    edgesep: text * 0.6,
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((box, i) =>
    g.setNode(`n${i}`, { width: box.w, height: box.h }),
  );
  for (const e of spec.edges) {
    const w = e.label ? widest([e.label], edgeSize) + edgeSize * 0.8 : 0;
    g.setEdge(`n${e.from}`, `n${e.to}`, {
      ...(e.label ? { width: w, height: edgeSize * 1.5, labelpos: 'c' } : {}),
    });
  }
  dagre.layout(g);
  nodes.forEach((box, i) => {
    const at = g.node(`n${i}`);
    box.x = at.x;
    box.y = at.y;
  });
  const gap = text * 0.3;
  const edges = spec.edges.map((e) => {
    const laid = g.edge(`n${e.from}`, `n${e.to}`);
    const points = (laid.points ?? []).map(
      (p) => [p.x, p.y] as [number, number],
    );
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (points.length < 2)
      points.splice(0, points.length, [a.x, a.y], [b.x, b.y]);
    // Pulled back off the boxes a little, so an arrow never touches its step.
    const pull = (p: [number, number], q: [number, number], by: number) => {
      const d = dist(p, q) || 1;
      return [
        p[0] + ((q[0] - p[0]) / d) * by,
        p[1] + ((q[1] - p[1]) / d) * by,
      ] as [number, number];
    };
    // A question's diamond is met at its edge, not at the box round it.
    if (a.kind === 'decision') points[0] = onDiamond(a, points[1]);
    if (b.kind === 'decision')
      points[points.length - 1] = onDiamond(b, points[points.length - 2]);
    points[0] = pull(points[0], points[1], gap);
    const k = points.length - 1;
    points[k] = pull(points[k], points[k - 1], gap);
    const at =
      e.label && laid.x !== undefined && laid.y !== undefined
        ? ([laid.x, laid.y] as [number, number])
        : null;
    return along(points, e.label, at);
  });
  const graph = g.graph();
  const width = graph.width ?? Math.max(...nodes.map((b) => b.x + b.w / 2));
  const height = graph.height ?? Math.max(...nodes.map((b) => b.y + b.h / 2));
  return { nodes, edges, width, height };
}

/** How large a layout's words are when it is fitted to its room: its scale, at most 1. */
const fitOf = (laid: Laid, room: { w: number; h: number }) =>
  Math.min(1, room.w / laid.width, room.h / laid.height);

/**
 * The flow laid out for its film's shape: a cycle round a ring; a chain
 * along a line, or in lines when one is too long for the frame; anything
 * else by dagre, the way the writer asked unless the other way shows its
 * words much larger (a tall frame reads down).
 */
export function layFlow(
  spec: FlowSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): Laid & { scale: number } {
  const room = EXACT_ROOM[shape];
  if (spec.direction === 'cycle') {
    const laid = ringLayout(spec, text, shape);
    return { ...laid, scale: fitOf(laid, room) };
  }
  const asked = spec.direction === 'down';
  const tries: Laid[] = [];
  if (isChain(spec)) {
    const n = spec.nodes.length;
    for (const down of [asked, !asked])
      for (let lines = 1; lines <= Math.min(3, Math.ceil(n / 2)); lines += 1)
        tries.push(wrappedChain(spec, text, down, lines));
  } else {
    for (const down of [asked, !asked])
      for (const narrow of [false, true])
        tries.push(dagreLayout(spec, text, down, narrow));
  }
  // The first, in the writer's way, that shows its words at full size;
  // else whichever shows them largest.
  const fits = tries.find((laid) => fitOf(laid, room) >= 0.98);
  let best = fits ?? tries[0];
  if (!fits)
    for (const laid of tries.slice(1))
      if (fitOf(laid, room) > fitOf(best, room) * 1.04) best = laid;
  return { ...best, scale: fitOf(best, room) };
}

// ── Drawing it ─────────────────────────────────────────────────────────────

/** A flow, drawn: one SVG, each step a part by its label, in stage units for the film's shape. */
export function renderFlow(
  spec: FlowSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): {
  svg: string;
  viewBox: [number, number, number, number];
  parts: Record<string, string>;
  /** The size of its smallest words when it stands alone on the stage, in stage units. */
  smallest: number;
  laid: Laid;
} {
  if (spec.nodes.length < 2) throw new Error('a flow needs two steps');
  const laid = layFlow(spec, shape, text);
  const { node: size, edge: edgeSize } = sizesFor(text);
  const parts: Record<string, string> = {};
  const used = new Set<string>();
  const stroke = Math.max(3, text * 0.11);
  const head = text * 0.55;
  // The order each step comes in: along the flow from its first.
  const order = arrivalOrder(spec);
  const delay = (i: number) => 0.2 + order.indexOf(i) * 0.35;
  const out: string[] = [
    `<style>@keyframes pop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}` +
      `@keyframes draw{from{stroke-dashoffset:var(--l)}to{stroke-dashoffset:0}}` +
      `@keyframes show{from{opacity:0}to{opacity:1}}` +
      `.pop{transform-box:fill-box;transform-origin:center;animation:pop .4s cubic-bezier(.2,.8,.3,1.2) both}` +
      `.draw{animation:draw .45s ease-out both}.show{animation:show .25s ease-out both}</style>`,
  ];
  // Links under the steps.
  spec.edges.forEach((e, k) => {
    const edge = laid.edges[k];
    const t = (Math.max(delay(e.from), 0) + 0.3).toFixed(2);
    const [tx, ty] = edge.tip;
    const [dx, dy] = edge.dir;
    // The line stops where the arrowhead starts.
    const back = `${r1(tx - dx * head * 0.9)} ${r1(ty - dy * head * 0.9)}`;
    const d = edge.d.replace(/(-?[\d.]+) (-?[\d.]+)$/, back);
    const left = [
      tx - dx * head - dy * head * 0.55,
      ty - dy * head + dx * head * 0.55,
    ];
    const right = [
      tx - dx * head + dy * head * 0.55,
      ty - dy * head - dx * head * 0.55,
    ];
    const length = Math.ceil(edge.length) + 2;
    out.push(
      `<path class="draw" style="--l:${length};stroke-dasharray:${length} ${length};animation-delay:${t}s" d="${d}" fill="none" stroke="${PAPER.line}" stroke-width="${r1(stroke)}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path class="show" style="animation-delay:${(Number(t) + 0.35).toFixed(2)}s" d="M${r1(tx)} ${r1(ty)}L${r1(left[0])} ${r1(left[1])}L${r1(right[0])} ${r1(right[1])}Z" fill="${PAPER.line}"/>`,
    );
  });
  // Their words over them, on a patch of paper.
  spec.edges.forEach((e, k) => {
    const edge = laid.edges[k];
    if (!edge.label || !edge.at) return;
    const w = widest([edge.label], edgeSize) + edgeSize * 0.7;
    const h = edgeSize * 1.4;
    const [x, y] = edge.at;
    out.push(
      `<g class="show" style="animation-delay:${(delay(e.from) + 0.6).toFixed(2)}s">` +
        `<rect x="${r1(x - w / 2)}" y="${r1(y - h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h / 2)}" fill="${PAPER.paper}"/>` +
        `<text x="${r1(x)}" y="${r1(y + edgeSize * 0.35)}" font-size="${edgeSize}" font-weight="600" fill="${PAPER.muted}" text-anchor="middle">${escapeXml(edge.label)}</text></g>`,
    );
  });
  laid.nodes.forEach((box, i) => {
    const label = spec.nodes[i].label;
    let id = `node-${groupId(label) || String(i + 1)}`;
    while (used.has(id)) id = `${id}-${i + 1}`;
    used.add(id);
    parts[label] = id;
    const colour = PAPER.chart[i % PAPER.chart.length];
    const { x, y, w, h } = box;
    const shapeOf = (() => {
      if (box.kind === 'decision')
        return `<path d="M${r1(x)} ${r1(y - h / 2)}L${r1(x + w / 2)} ${r1(y)}L${r1(x)} ${r1(y + h / 2)}L${r1(x - w / 2)} ${r1(y)}Z" fill="${PAPER.card}" stroke="${PAPER.accent}" stroke-width="${r1(stroke * 1.4)}" stroke-linejoin="round"/>`;
      const rx =
        box.kind === 'start' || box.kind === 'end'
          ? h / 2
          : Math.min(h * 0.28, text * 0.6);
      const edgeColour = box.kind === 'step' ? colour : PAPER.ink;
      return `<rect x="${r1(x - w / 2)}" y="${r1(y - h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(rx)}" fill="${PAPER.card}" stroke="${edgeColour}" stroke-width="${r1(stroke * (box.kind === 'step' ? 1.15 : 1.4))}"/>`;
    })();
    const top = y - (box.lines.length * size * 1.2) / 2 + size * 0.88;
    const words = box.lines
      .map(
        (line, j) =>
          `<text x="${r1(x)}" y="${r1(top + j * size * 1.2)}" font-size="${size}" font-weight="700" fill="${PAPER.ink}" text-anchor="middle">${escapeXml(line)}</text>`,
      )
      .join('');
    out.push(
      `<g id="${id}"><g class="pop" style="animation-delay:${delay(i).toFixed(2)}s">${shapeOf}${words}</g></g>`,
    );
  });
  const pad = text * 0.5;
  const viewBox: [number, number, number, number] = [
    r1(-pad),
    r1(-pad),
    Math.ceil(laid.width + pad * 2),
    Math.ceil(laid.height + pad * 2),
  ];
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">${out.join('')}</svg>`,
    viewBox,
    parts,
    smallest: r1(
      Math.min(size, spec.edges.some((e) => e.label) ? edgeSize : size) *
        laid.scale,
    ),
    laid,
  };
}

/** The steps in the order they come on: along the links from the first step, then any left. */
function arrivalOrder(spec: FlowSpec): number[] {
  const seen: number[] = [];
  const into = new Set(spec.edges.map((e) => e.to));
  const starts = spec.nodes
    .map((_, i) => i)
    .filter((i) => !into.has(i) || spec.direction === 'cycle');
  const queue = starts.length ? [starts[0], ...starts.slice(1)] : [0];
  while (queue.length) {
    const i = queue.shift()!;
    if (seen.includes(i)) continue;
    seen.push(i);
    for (const e of spec.edges) if (e.from === i) queue.push(e.to);
  }
  for (let i = 0; i < spec.nodes.length; i += 1)
    if (!seen.includes(i)) seen.push(i);
  return seen;
}

/** The step labels of a flow: what the voice points at. */
export const flowPartNames = (spec: FlowSpec) => spec.nodes.map((n) => n.label);

/** Whether two laid-out steps overlap: for the tests. */
export const overlaps = (a: Box, b: Box, room = 0) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + room * 2 &&
  Math.abs(a.y - b.y) * 2 < a.h + b.h + room * 2;
