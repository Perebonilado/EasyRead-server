/**
 * A flow at full frame: a process, a cycle, a chain of causes, a decision
 * tree. The writer names the steps and what leads to what; code lays it
 * out (a row or two for a chain, a ring for a cycle, dagre for anything
 * that branches; in a tall frame one step under another, running on down
 * past the frame's foot when it must) and draws each step as a sheet with
 * its words at the reading floor, a question as a diamond, and an arrow
 * from each step to the next whose path the flow recipe can travel.
 *
 * Parts: each step `node-<name>`; each link `path-<from>-<to>` (its path,
 * from the first step's edge to the second's); all the steps `nodes`.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import {
  layFlow,
  readFlow,
  type FlowDraft,
  type FlowNodeKind,
  type FlowSpec,
} from '../scene-flow';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  esc,
  extraOf,
  fit,
  frameOf,
  mainColour,
  mix,
  paintOf,
  partSvg,
  r1,
  slugOf,
  textSvg,
  union,
  wordsWidth,
  wrap,
  type Frame,
} from './shot-chart-kit';

/** A flow as the writer gives it; a step may be its words alone. */
function draftOf(raw: Record<string, unknown>): FlowDraft {
  const body = bodyOf('flow', raw);
  const nodes = (Array.isArray(body.nodes) ? body.nodes : []).map(
    (n: unknown) =>
      typeof n === 'string'
        ? { label: n, kind: null }
        : ((n ?? {}) as { label: string; kind: string | null }),
  );
  return {
    direction: (body.direction as string | null) ?? null,
    nodes,
    edges: Array.isArray(body.edges)
      ? (body.edges as FlowDraft['edges'])
      : null,
  };
}

interface Node {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  kind: FlowNodeKind;
}

interface Edge {
  from: number;
  to: number;
  d: string;
  tip: [number, number];
  dir: [number, number];
  label: string | null;
  at: [number, number] | null;
}

/** Each step's words wrapped to a width, and the box that holds them. */
function sized(
  frame: Frame,
  spec: FlowSpec,
  given: number,
  most = given,
): { lines: string[]; w: number; h: number; kind: FlowNodeKind }[] {
  const floor = frame.size.label;
  const padX = floor * 0.6;
  const padY = floor * 0.45;
  return spec.nodes.map((node) => {
    // A box widens (as far as `most`) to hold its longest word whole.
    const longest = Math.max(
      ...node.label.split(/\s+/).map((w) => wordsWidth(w, floor, 700)),
    );
    const width = Math.min(
      most,
      Math.max(
        given,
        node.kind === 'decision' ? longest / 0.62 : longest + padX * 2,
      ),
    );
    const inner = node.kind === 'decision' ? width * 0.62 : width - padX * 2;
    const { lines } = fit(node.label, inner, floor, floor, 3, 700);
    const textW = Math.max(...lines.map((l) => wordsWidth(l, floor, 700)));
    const textH = lines.length * floor * 1.15;
    if (node.kind === 'decision')
      return {
        lines,
        kind: node.kind,
        w: Math.min(width, Math.max(textW / 0.62, floor * 4)),
        h: Math.max(textH * 2, floor * 2.6),
      };
    return {
      lines,
      kind: node.kind,
      w: Math.min(width, Math.max(textW + padX * 2, floor * 3.5)),
      h: textH + padY * 2,
    };
  });
}

/** A straight link from one box's edge to another's. */
function straight(
  a: Node,
  b: Node,
  gap: number,
  label: string | null,
  from: number,
  to: number,
): Edge {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const across = Math.abs(dx) * a.h >= Math.abs(dy) * a.w;
  const start: [number, number] = across
    ? [a.x + (Math.sign(dx) * a.w) / 2 + Math.sign(dx) * gap, a.y]
    : [a.x, a.y + (Math.sign(dy) * a.h) / 2 + Math.sign(dy) * gap];
  const end: [number, number] = across
    ? [b.x - (Math.sign(dx) * b.w) / 2 - Math.sign(dx) * gap, b.y]
    : [b.x, b.y - (Math.sign(dy) * b.h) / 2 - Math.sign(dy) * gap];
  const n = Math.hypot(end[0] - start[0], end[1] - start[1]) || 1;
  return {
    from,
    to,
    d: `M${r1(start[0])} ${r1(start[1])}L${r1(end[0])} ${r1(end[1])}`,
    tip: end,
    dir: [(end[0] - start[0]) / n, (end[1] - start[1]) / n],
    label,
    at: label ? [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2] : null,
  };
}

/** A path of points, its corners rounded. */
function elbow(
  points: [number, number][],
  from: number,
  to: number,
  label: string | null,
): Edge {
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 1; i < points.length; i += 1)
    d += `L${r1(points[i][0])} ${r1(points[i][1])}`;
  const end = points[points.length - 1];
  const before = points[points.length - 2];
  const n = Math.hypot(end[0] - before[0], end[1] - before[1]) || 1;
  return {
    from,
    to,
    d,
    tip: end,
    dir: [(end[0] - before[0]) / n, (end[1] - before[1]) / n],
    label,
    at: label ? points[Math.floor(points.length / 2)] : null,
  };
}

/** A curve from one box toward another through a control point, cut at both boxes. */
function curved(
  a: Node,
  b: Node,
  c: [number, number],
  gap: number,
  from: number,
  to: number,
  label: string | null,
): Edge {
  const at = (t: number): [number, number] => [
    (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c[0] + t ** 2 * b.x,
    (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c[1] + t ** 2 * b.y,
  ];
  const inside = (p: [number, number], n: Node) =>
    Math.abs(p[0] - n.x) <= n.w / 2 + gap &&
    Math.abs(p[1] - n.y) <= n.h / 2 + gap;
  let t0 = 0;
  let t1 = 1;
  for (let t = 0; t <= 1; t += 0.01) if (inside(at(t), a)) t0 = t;
  for (let t = 1; t >= 0; t -= 0.01) if (inside(at(t), b)) t1 = t;
  if (t1 <= t0) [t0, t1] = [0.3, 0.7];
  const points = Array.from({ length: 13 }, (_, i) =>
    at(t0 + ((t1 - t0) * i) / 12),
  );
  return elbow(points, from, to, label);
}

/** The steps and links laid out in the frame's units, and how far down they reach. */
function layOut(
  frame: Frame,
  spec: FlowSpec,
): { nodes: Node[]; edges: Edge[]; bottom: number } {
  const { text } = frame;
  const tall = frame.shape === 'tall';
  const floor = frame.size.label;
  const n = spec.nodes.length;
  const gap = floor * 0.25;
  const width = text.x1 - text.x0;
  const chain =
    spec.edges.length === n - 1 &&
    spec.edges.every((e, i) => e.from === i && e.to === i + 1);
  const cycle = spec.direction === 'cycle';
  if (cycle) {
    // Round a ring as wide and tall as the words' area.
    // Each step's box as wide as a ring of so many leaves room for.
    const boxes = sized(
      frame,
      spec,
      Math.min(frame.W * (tall ? 0.42 : 0.24), width / (n <= 4 ? 2.1 : 3)),
      width / 2,
    );
    const maxW = Math.max(...boxes.map((b) => b.w));
    const maxH = Math.max(...boxes.map((b) => b.h));
    const cx = (text.x0 + text.x1) / 2;
    const cy = (text.y0 + text.y1) / 2;
    const rx = width / 2 - maxW / 2;
    const ry = (text.y1 - text.y0) / 2 - maxH / 2;
    const nodes = boxes.map((b, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return {
        ...b,
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      };
    });
    const edges = spec.edges.map((e) => {
      const a = nodes[e.from];
      const b = nodes[e.to];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const ox = mx - cx;
      const oy = my - cy;
      const on = Math.hypot(ox, oy) || 1;
      const bow = Math.min(rx, ry) * 0.25;
      return curved(
        a,
        b,
        [mx + (ox / on) * bow, my + (oy / on) * bow],
        gap * 2,
        e.from,
        e.to,
        e.label,
      );
    });
    return { nodes, edges, bottom: text.y1 };
  }
  if (chain) {
    // One row, or two read as lines of text are, the second under the
    // first; a tall frame's a step or two (or three) a row, inside the band.
    const tries = tall
      ? [1, 2, 3].map((per) => ({ rows: Math.ceil(n / per), per }))
      : [1, 2, 3].map((rows) => ({ rows, per: Math.ceil(n / rows) }));
    // Each way measured: whether every word stands whole in its box, and
    // how tall it stands. The first that is whole and inside the words'
    // area; failing that, the shortest whole one; a broken word only when
    // no way keeps them whole.
    const arrow = floor * 1.4;
    const between = floor * (tall ? 1.1 : 1.6);
    const measured = tries.map(({ rows, per }) => {
      const slot = (width - arrow * (per - 1)) / per;
      const whole = spec.nodes.every(
        (node) => wrap(node.label, slot - floor * 1.2, floor, 3, 700) !== null,
      );
      const boxes = sized(frame, spec, slot);
      const rowH = Math.max(...boxes.map((b) => b.h));
      return {
        rows,
        per,
        slot,
        whole,
        boxes,
        rowH,
        total: rows * rowH + (rows - 1) * between,
      };
    });
    const chosen =
      measured.find((m) => m.whole && m.total <= text.y1 - text.y0) ??
      [...measured]
        .filter((m) => m.whole)
        .sort((a, b) => a.total - b.total)[0] ??
      measured[measured.length - 1];
    {
      const { per, slot, boxes, rowH, total } = chosen;
      const top = text.y0 + Math.max(0, text.y1 - text.y0 - total) / 2;
      const nodes = boxes.map((b, i) => {
        const row = Math.floor(i / per);
        const k = i % per;
        return {
          ...b,
          x: text.x0 + slot / 2 + k * (slot + arrow),
          y: top + row * (rowH + between) + rowH / 2,
        };
      });
      const edges = spec.edges.map((e) => {
        const a = nodes[e.from];
        const b = nodes[e.to];
        if (Math.floor(e.from / per) === Math.floor(e.to / per))
          return straight(a, b, gap, e.label, e.from, e.to);
        // Down from the end of a row and back to the start of the next.
        const mid = a.y + a.h / 2 + between / 2;
        return elbow(
          [
            [a.x, a.y + a.h / 2 + gap],
            [a.x, mid],
            [b.x, mid],
            [b.x, b.y - b.h / 2 - gap],
          ],
          e.from,
          e.to,
          e.label,
        );
      });
      return { nodes, edges, bottom: top + total };
    }
  }
  // Anything that branches: dagre's layout, fitted to the words' area.
  const laid = layFlow(spec, frame.shape, floor / 1.15);
  const k = Math.min(1, width / laid.width, (text.y1 - text.y0) / laid.height);
  const ox = text.x0 + (width - laid.width * k) / 2;
  const oy = text.y0 + (text.y1 - text.y0 - laid.height * k) / 2;
  const place = (x: number, y: number): [number, number] => [
    ox + x * k,
    oy + y * k,
  ];
  const nodes = laid.nodes.map((b) => {
    const [x, y] = place(b.x, b.y);
    return { x, y, w: b.w * k, h: b.h * k, lines: b.lines, kind: b.kind };
  });
  const edges = spec.edges.map((e, i) => {
    const one = laid.edges[i];
    const numbers = one.d.match(/-?[\d.]+/g)?.map(Number) ?? [];
    let j = 0;
    const d = one.d.replace(/-?[\d.]+/g, () => {
      const v = numbers[j];
      const out = j % 2 === 0 ? ox + v * k : oy + v * k;
      j += 1;
      return String(r1(out));
    });
    return {
      from: e.from,
      to: e.to,
      d,
      tip: place(one.tip[0], one.tip[1]),
      dir: one.dir,
      label: e.label,
      at: one.at ? place(one.at[0], one.at[1]) : null,
    };
  });
  return { nodes, edges, bottom: oy + laid.height * k };
}

export function flowAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const { spec } = readFlow(draftOf(raw));
  if (!spec) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const floor = frame.size.label;
  const colour = mainColour(paint, extraOf('flow', raw).colour);
  const { nodes, edges, bottom } = layOut(frame, spec);
  const ids = spec.nodes.map((node, i) =>
    book.id(`node-${slugOf(node.label) || String(i + 1)}`),
  );
  const stroke = Math.max(3, floor * 0.08);
  const head = floor * 0.42;
  const out: string[] = [];
  // The links under the steps, each its line and its head.
  spec.edges.forEach((e, i) => {
    const edge = edges[i];
    const id = book.id(`path-${ids[e.from].slice(5)}-${ids[e.to].slice(5)}`);
    const [tx, ty] = edge.tip;
    const [dx, dy] = edge.dir;
    // The line stops where its head starts.
    const back: [number, number] = [
      tx - dx * head * 0.85,
      ty - dy * head * 0.85,
    ];
    const d = edge.d.replace(
      /(-?[\d.]+) (-?[\d.]+)$/,
      `${r1(back[0])} ${r1(back[1])}`,
    );
    const left = [
      tx - dx * head - dy * head * 0.55,
      ty - dy * head + dx * head * 0.55,
    ];
    const right = [
      tx - dx * head + dy * head * 0.55,
      ty - dy * head - dx * head * 0.55,
    ];
    const numbers = (edge.d.match(/-?[\d.]+/g) ?? []).map(Number);
    const xs = numbers.filter((_, k) => k % 2 === 0);
    const ys = numbers.filter((_, k) => k % 2 === 1);
    const box: ShotBox = [
      Math.min(...xs) - head,
      Math.min(...ys) - head,
      Math.max(...xs) - Math.min(...xs) + head * 2,
      Math.max(...ys) - Math.min(...ys) + head * 2,
    ];
    let labelSvg = '';
    if (edge.label && edge.at) {
      const w = wordsWidth(edge.label, floor, 600) + floor * 0.6;
      const h = floor * 1.35;
      const [x, y] = edge.at;
      labelSvg =
        `<rect x="${r1(x - w / 2)}" y="${r1(y - h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h / 2)}" fill="${esc(paint.paper)}"/>` +
        textSvg([edge.label], x, y + floor * 0.34, {
          size: floor,
          fill: paint.muted,
          family: paint.text,
          weight: 600,
          anchor: 'middle',
        });
    }
    book.add(id, { box, path: d, role: 'muted' });
    out.push(
      partSvg(
        id,
        `<path d="${d}" fill="none" stroke="${esc(paint.muted)}" stroke-width="${r1(stroke)}" stroke-linecap="round" stroke-linejoin="round"/>` +
          `<path d="M${r1(tx)} ${r1(ty)}L${r1(left[0])} ${r1(left[1])}L${r1(right[0])} ${r1(right[1])}Z" fill="${esc(paint.muted)}"/>` +
          labelSvg,
      ),
    );
  });
  // The steps over them.
  const fill = mix(paint.paper, colour.colour, paint.dark ? 0.16 : 0.1);
  const steps: string[] = [];
  const boxes: ShotBox[] = [];
  nodes.forEach((node, i) => {
    const { x, y, w, h, lines, kind } = node;
    const box: ShotBox = [x - w / 2, y - h / 2, w, h];
    boxes.push(box);
    const shapeSvg =
      kind === 'decision'
        ? `<path d="M${r1(x)} ${r1(y - h / 2)}L${r1(x + w / 2)} ${r1(y)}L${r1(x)} ${r1(y + h / 2)}L${r1(x - w / 2)} ${r1(y)}Z" fill="${esc(paint.sheet)}" stroke="${esc(colour.colour)}" stroke-width="${r1(stroke * 1.2)}" stroke-linejoin="round"/>`
        : `<rect x="${r1(box[0])}" y="${r1(box[1])}" width="${r1(w)}" height="${r1(h)}" rx="${r1(kind === 'step' ? floor * 0.3 : h / 2)}" fill="${esc(kind === 'step' ? fill : paint.sheet)}" stroke="${esc(kind === 'step' ? mix(paint.paper, colour.colour, 0.55) : paint.ink)}" stroke-width="${r1(stroke)}"/>`;
    const size = floor * Math.min(1, w / Math.max(1, node.w));
    const top = y - (lines.length * size * 1.15) / 2 + size * ASCENT * 0.98;
    book.add(ids[i], { box, role: colour.role, pivot: [0.5, 0.5] });
    steps.push(
      partSvg(
        ids[i],
        shapeSvg +
          textSvg(lines, x, top, {
            size,
            fill: paint.ink,
            family: paint.text,
            anchor: 'middle',
          }),
      ),
    );
  });
  book.add('nodes', { box: union(...boxes), role: colour.role });
  out.push(partSvg('nodes', steps.join('')));
  const { text } = frame;
  const long = shape === 'tall' && bottom > text.y1;
  const box: ShotBox = long
    ? [0, 0, frame.W, Math.ceil(bottom + (frame.H - text.y1))]
    : [0, 0, frame.W, frame.H];
  return assetOf(
    frame,
    paint,
    out.join(''),
    book,
    long ? [0, 0, frame.W, frame.H] : union(...boxes),
    box,
  );
}
