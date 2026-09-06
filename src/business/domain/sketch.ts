/**
 * The tutor's live sketch: a picture with a shape.
 *
 * The lecture's diagram is a graph, boxes joined by arrows, and a graph is
 * the wrong picture for half of what a technical book draws: a ring with
 * things on it, a line cut into cells, layers stacked, a grid. The writer
 * picks one of these templates and fills it in; the layout here is
 * deterministic, into the region the board will draw it in, and each
 * template can say in words what a reader sees, so the tutor knows what
 * is on the board without seeing it.
 */
import {
  BOARD_SPACE,
  contentWords,
  type DiagramGeometry,
  type DiagramNode,
  type DiagramEdge,
} from './board';
import {
  DIAGRAM_LIMITS,
  LIVE_DIAGRAM_LIMITS,
  diagramProblems,
  elementOrder,
  geometryProblems,
  layoutDiagram,
  regionLayout,
  type DiagramPlan,
  type DiagramProblem,
} from './diagram';

export type SketchTemplate = 'graph' | 'ring' | 'line' | 'layers' | 'grid';

/** What the writer returns: one template, and the fields that template reads. */
export interface SketchDraft {
  template: SketchTemplate;
  title: string;
  /** graph; anchors are hints here, not required */
  nodes?:
    | {
        id: string;
        label: string;
        shape?: DiagramPlan['nodes'][number]['shape'];
        anchor?: string | null;
      }[]
    | null;
  edges?:
    | {
        from: string;
        to: string;
        label?: string | null;
        anchor?: string | null;
      }[]
    | null;
  groups?: DiagramPlan['groups'] | null;
  /** ring: the points on it, clockwise from the top, evenly spaced unless `at` (0 to 1 of the way round) is given. */
  points?: { label: string; at?: number | null }[] | null;
  /** ring: things sitting on the ring between points, such as keys; line: things placed along it. */
  markers?: { label: string; at?: number | null }[] | null;
  /** ring: an arrow from each marker clockwise to the next point. */
  arrowsClockwise?: boolean | null;
  /** ring: the tick where the ends meet, labelled on each side. */
  join?: { left: string; right: string } | null;
  /** line: how many cells the bar is cut into; 0 for none. */
  cells?: number | null;
  /** line: the labels at the two ends. */
  ends?: { left: string; right: string } | null;
  /** line: labelled ticks at fractions along it. */
  ticks?: { label: string; at: number }[] | null;
  /** line: a labelled bracket over a range. */
  brackets?: { label: string; from: number; to: number }[] | null;
  /** layers: the bands, top to bottom. */
  layers?: string[] | null;
  layerArrows?: boolean | null;
  /** grid */
  rowLabels?: string[] | null;
  colLabels?: string[] | null;
  cellText?: string[][] | null;
}

export const SKETCH_LIMITS = {
  ring: { minPoints: 2, maxPoints: 8, maxMarkers: 6 },
  line: { maxCells: 40, maxTicks: 6, maxBrackets: 2 },
  layers: { min: 2, max: 6 },
  grid: { maxRows: 6, maxCols: 6 },
  maxLabelWords: 4,
} as const;

const LABEL_SIZE = 16;
const SMALL_SIZE = 13;
/** About eight units per character at sixteen-unit type, as the checks assume. */
const CHAR = 8;

/** The pen's shapes of an ask, as a hint to the writer, from its words. */
export function templateHint(description: string): SketchTemplate | null {
  const text = description.toLowerCase();
  if (/\b(ring|circle|circular|clockwise|wheel)\b/.test(text)) return 'ring';
  if (
    /\b(number line|hash space|range|axis|spectrum|timeline|scale from)\b/.test(
      text,
    )
  )
    return 'line';
  if (/\b(layers?|layered|stack|stacked|tiers?|on top of)\b/.test(text))
    return 'layers';
  if (/\b(grid|table|matrix|rows? and columns?|cells)\b/.test(text))
    return 'grid';
  if (
    /\b(compar|versus|vs\.?|side by side|differ|step|steps|flow|flows|passes|sequence|order|process|pipeline)\b/.test(
      text,
    )
  ) {
    return 'graph';
  }
  return null;
}

function tooLong(label: string): boolean {
  return label.trim().split(/\s+/).length > SKETCH_LIMITS.maxLabelWords;
}

/** Whether every content word of a label is in the material; numbers and short tokens always pass. */
export function grounded(label: string, pool: Set<string>): boolean {
  return contentWords(label).every(
    (word) =>
      word.length <= 2 ||
      /^\d/.test(word) ||
      inflections(word).some((form) => pool.has(form)),
  );
}

/** A word and its plain inflections, so "exceeds" is grounded by "exceed" and "servers" by "server". */
function inflections(word: string): string[] {
  const forms = new Set([word]);
  for (const suffix of ['s', 'es', 'ed', 'ing', 'd']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      forms.add(word.slice(0, -suffix.length));
      if (suffix === 'ing' || suffix === 'ed') {
        forms.add(`${word.slice(0, -suffix.length)}e`);
      }
    }
    forms.add(`${word}${suffix}`);
  }
  if (word.endsWith('ies')) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('y')) forms.add(`${word.slice(0, -1)}ies`);
  return [...forms];
}

function pool(material: string): Set<string> {
  return new Set(contentWords(material));
}

/**
 * Everything wrong with a sketch before it is laid out. A graph is checked
 * by the lecture's rules in live mode after repair; the templates are
 * checked for their own limits and for labels the material does not say.
 */
export function sketchProblems(
  draft: SketchDraft,
  material: string,
  /** The tutor's ask, whose words count as said. */
  ask = '',
): DiagramProblem[] {
  const words = pool(`${material}\n${ask}`);
  const problems: DiagramProblem[] = [];
  const checkLabels = (labels: string[]) => {
    for (const label of labels) {
      if (!label.trim()) continue;
      if (tooLong(label))
        problems.push({ kind: 'label_too_long', detail: label });
      if (!grounded(label, words))
        problems.push({ kind: 'ungrounded', detail: label });
    }
  };
  switch (draft.template) {
    case 'graph':
      return diagramProblems(
        graphPlan(draft),
        `${material}\n${ask}`,
        `${material}\n${ask}`,
        {
          live: true,
          maxNodes: LIVE_DIAGRAM_LIMITS.maxNodes,
          maxEdges: LIVE_DIAGRAM_LIMITS.maxEdges,
        },
      );
    case 'ring': {
      const points = draft.points ?? [];
      if (points.length < SKETCH_LIMITS.ring.minPoints) {
        problems.push({
          kind: 'too_few_nodes',
          detail: `${points.length} points on the ring; at least ${SKETCH_LIMITS.ring.minPoints}`,
        });
      }
      if (points.length > SKETCH_LIMITS.ring.maxPoints) {
        problems.push({
          kind: 'too_many_nodes',
          detail: `${points.length} points; at most ${SKETCH_LIMITS.ring.maxPoints}`,
        });
      }
      if ((draft.markers ?? []).length > SKETCH_LIMITS.ring.maxMarkers) {
        problems.push({
          kind: 'too_many_nodes',
          detail: `${draft.markers?.length} markers; at most ${SKETCH_LIMITS.ring.maxMarkers}`,
        });
      }
      if (/\bbetween\b/i.test(ask) && !(draft.markers ?? []).length) {
        problems.push({
          kind: 'too_few_nodes',
          detail:
            'the ask names things between the points, and markers is empty: the points are the fixed things on the ring, the markers the things between them',
        });
      }
      checkLabels([
        ...points.map((point) => point.label),
        ...(draft.markers ?? []).map((marker) => marker.label),
        ...(draft.join ? [draft.join.left, draft.join.right] : []),
      ]);
      return problems;
    }
    case 'line': {
      if ((draft.ticks ?? []).length > SKETCH_LIMITS.line.maxTicks) {
        problems.push({
          kind: 'too_many_nodes',
          detail: `${draft.ticks?.length} ticks; at most ${SKETCH_LIMITS.line.maxTicks}`,
        });
      }
      checkLabels([
        ...(draft.ends ? [draft.ends.left, draft.ends.right] : []),
        ...(draft.ticks ?? []).map((tick) => tick.label),
        ...(draft.markers ?? []).map((marker) => marker.label),
        ...(draft.brackets ?? []).map((bracket) => bracket.label),
      ]);
      return problems;
    }
    case 'layers': {
      const layers = draft.layers ?? [];
      if (layers.length < SKETCH_LIMITS.layers.min) {
        problems.push({
          kind: 'too_few_nodes',
          detail: `${layers.length} layers; at least ${SKETCH_LIMITS.layers.min}`,
        });
      }
      if (layers.length > SKETCH_LIMITS.layers.max) {
        problems.push({
          kind: 'too_many_nodes',
          detail: `${layers.length} layers; at most ${SKETCH_LIMITS.layers.max}`,
        });
      }
      checkLabels(layers);
      return problems;
    }
    case 'grid': {
      const rows = draft.rowLabels ?? [];
      const cols = draft.colLabels ?? [];
      if (!rows.length || !cols.length) {
        problems.push({
          kind: 'too_few_nodes',
          detail: 'a grid needs row and column labels',
        });
      }
      if (
        rows.length > SKETCH_LIMITS.grid.maxRows ||
        cols.length > SKETCH_LIMITS.grid.maxCols
      ) {
        problems.push({
          kind: 'too_many_nodes',
          detail: `${rows.length} by ${cols.length}; at most ${SKETCH_LIMITS.grid.maxRows} by ${SKETCH_LIMITS.grid.maxCols}`,
        });
      }
      checkLabels([...rows, ...cols, ...(draft.cellText ?? []).flat()]);
      return problems;
    }
    default:
      return [
        {
          kind: 'unknown_node',
          detail: `unknown template ${String(draft.template)}`,
        },
      ];
  }
}

/** A graph draft as the lecture's plan, anchors optional. */
export function graphPlan(draft: SketchDraft): DiagramPlan {
  return {
    title: draft.title,
    nodes: (draft.nodes ?? []).map((node) => ({
      ...node,
      anchor: node.anchor ?? '',
    })),
    edges: (draft.edges ?? []).map((edge) => ({
      ...edge,
      anchor: edge.anchor ?? '',
    })),
    groups: draft.groups ?? [],
  };
}

/**
 * What can be mended in a graph draft without asking again: a label over
 * the limit is cut at it, a self loop or an edge to a node that is not
 * there is dropped, a duplicate node is dropped, a node nothing touches
 * is dropped when there are more than four, and a node in two groups is
 * left in the first. Only an ungrounded label, or too few parts after
 * this, is worth a second call.
 */
export function repairDraft(plan: DiagramPlan): DiagramPlan {
  const seen = new Set<string>();
  const nodes = plan.nodes
    .filter((node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    })
    .map((node) => ({
      ...node,
      label: node.label
        .trim()
        .split(/\s+/)
        .slice(0, DIAGRAM_LIMITS.maxLabelWords)
        .join(' '),
    }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = plan.edges
    .filter(
      (edge) => edge.from !== edge.to && ids.has(edge.from) && ids.has(edge.to),
    )
    .map((edge) => ({
      ...edge,
      label: edge.label
        ? edge.label.trim().split(/\s+/).slice(0, 3).join(' ')
        : edge.label,
    }));
  const touched = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const kept =
    nodes.length > 4 ? nodes.filter((node) => touched.has(node.id)) : nodes;
  const keptIds = new Set(kept.map((node) => node.id));
  const placed = new Set<string>();
  const groups = plan.groups
    .map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((member) => {
        if (!keptIds.has(member) || placed.has(member)) return false;
        placed.add(member);
        return true;
      }),
    }))
    .filter((group) => group.memberIds.length > 0);
  return { title: plan.title, nodes: kept, edges, groups };
}

/**
 * What can be mended in a template draft: a ring that came back with its
 * things all as markers and no points has its markers as points.
 */
export function repairSketch(draft: SketchDraft): SketchDraft {
  if (draft.template === 'ring') {
    const points = draft.points ?? [];
    const markers = draft.markers ?? [];
    if (points.length < SKETCH_LIMITS.ring.minPoints && markers.length >= 2) {
      return { ...draft, points: [...points, ...markers], markers: [] };
    }
  }
  return draft;
}

/**
 * The geometry checks that matter for a live sketch: overlap and ink. A
 * label wider than its box is not one of them, since the board grows a
 * box to hold its label.
 */
export function sketchGeometryProblems(
  geometry: DiagramGeometry,
): ReturnType<typeof geometryProblems> {
  return geometryProblems(geometry).filter(
    (problem) => problem.kind !== 'label_fit',
  );
}

/** The material's sketch in the space given: marks for the templates, a graph for the graph. */
export function layoutSketch(
  draft: SketchDraft,
  material: string,
  id: string,
  region: { w: number; h: number } | null | undefined,
  rankSeparation = 60,
  /** The tutor's ask: a comparison lays a graph out as two columns. */
  ask = '',
): DiagramGeometry {
  const space =
    region && region.w > 0 && region.h > 0
      ? { w: Math.round(region.w), h: Math.round(region.h) }
      : { ...BOARD_SPACE };
  const caption = describeSketch(draft);
  switch (draft.template) {
    case 'graph': {
      if (isComparison(ask)) {
        const compared = comparisonGeometry(draft, space, id);
        if (compared) return { ...compared, caption };
      }
      const geometry = layoutDiagram(
        graphPlan(draft),
        'structure',
        material,
        id,
        rankSeparation,
        regionLayout(region, 'structure'),
      );
      return { ...geometry, caption };
    }
    case 'ring':
      return { ...ringGeometry(draft, space, id), caption };
    case 'line':
      return { ...lineGeometry(draft, space, id), caption };
    case 'layers':
      return { ...layersGeometry(draft, space, id), caption };
    case 'grid':
      return { ...gridGeometry(draft, space, id), caption };
    default:
      return {
        ...layoutDiagram(graphPlan(draft), 'structure', material, id),
        caption,
      };
  }
}

function base(
  id: string,
  title: string,
  space: { w: number; h: number },
): DiagramGeometry {
  return {
    id,
    title,
    kind: 'structure',
    space: { ...space },
    nodes: [],
    edges: [],
    groups: [],
    marks: [],
  };
}

const textWidth = (text: string, size = LABEL_SIZE) =>
  text.length * CHAR * (size / LABEL_SIZE);

/** Whether an ask compares two things, which a graph shows as two groups side by side. */
export function isComparison(ask: string): boolean {
  return /\b(compar|versus|vs\.?|side by side|differ|contrast|against)\b/i.test(
    ask,
  );
}

/**
 * Two things compared: each group's members in a column, the groups side
 * by side, the group's label above its column. Edges between the columns
 * are dropped; a comparison is read down each side, not across.
 */
export function comparisonGeometry(
  draft: SketchDraft,
  space: { w: number; h: number },
  id: string,
): DiagramGeometry | null {
  const groups = draft.groups ?? [];
  const nodes = draft.nodes ?? [];
  if (groups.length !== 2 || !nodes.length) return null;
  const geometry = base(id, draft.title, space);
  const gutter = 40;
  const colW = (space.w - 120 - gutter) / 2;
  const pad = 14;
  const rows = Math.max(...groups.map((group) => group.memberIds.length), 1);
  const rowH = Math.max(40, Math.min(64, (space.h - 140) / rows));
  const top = 80;
  const placed: DiagramNode[] = [];
  const laidGroups = groups.map((group, column) => {
    const x = 60 + column * (colW + gutter);
    const members = group.memberIds
      .map((memberId) => nodes.find((node) => node.id === memberId))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    members.forEach((node, row) => {
      placed.push({
        id: node.id,
        label: node.label,
        shape: 'box',
        x: Math.round(x + pad),
        y: Math.round(top + pad + row * (rowH + 10)),
        w: Math.round(colW - 2 * pad),
        h: Math.round(rowH),
        anchor: { charStart: 0, charEnd: 0 },
      });
    });
    return {
      id: `${id}-g${column}`,
      label: group.label,
      memberIds: members.map((node) => node.id),
      x: Math.round(x),
      y: top - 24,
      w: Math.round(colW),
      h: Math.round(2 * pad + rows * (rowH + 10) + 14),
    };
  });
  if (!placed.length) return null;
  return { ...geometry, nodes: placed, groups: laidGroups };
}

/** A ring: the circle, the points clockwise, the join, the markers, the arrows. */
function ringGeometry(
  draft: SketchDraft,
  space: { w: number; h: number },
  id: string,
): DiagramGeometry {
  const geometry = base(id, draft.title, space);
  const marks = geometry.marks!;
  const cx = space.w / 2;
  const cy = space.h / 2 + 10;
  const r = Math.max(60, Math.min(space.w, space.h) / 2 - 80);
  const points = draft.points ?? [];
  const at = (index: number, given: number | null | undefined) =>
    given === null || given === undefined
      ? index / Math.max(points.length, 1)
      : given;
  const angleOf = (fraction: number) => fraction * 360;
  const onRing = (deg: number, radius: number): [number, number] => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };
  const labelAt = (
    deg: number,
    radius: number,
    text: string,
    size: number,
  ): { lx: number; ly: number } => {
    const [x, y] = onRing(deg, radius);
    const w = textWidth(text, size);
    // The label leans away from the circle: left of centre it hangs left, right of centre right.
    const lean = Math.sin((deg * Math.PI) / 180);
    return {
      lx: x - w / 2 + lean * (w / 2),
      ly: y - size / 2 - Math.cos((deg * Math.PI) / 180) * (size * 0.7),
    };
  };
  marks.push({ id: `${id}-ring`, kind: 'circle', cx, cy, r, label: null });
  let pointAngles = points.map((point, index) =>
    angleOf(((at(index, point.at) % 1) + 1) % 1),
  );
  // Fractions that land on top of each other (or 1 given for the top, which is 0) fall back to even spacing.
  const collide = pointAngles.some((angle, i) =>
    pointAngles.some(
      (other, j) =>
        j !== i && Math.abs(((angle - other + 540) % 360) - 180) < 8,
    ),
  );
  if (collide) {
    pointAngles = points.map((_, index) => angleOf(index / points.length));
  }
  points.forEach((point, index) => {
    const deg = pointAngles[index];
    const [x, y] = onRing(deg, r);
    marks.push({
      id: `${id}-p${index}`,
      kind: 'dot',
      cx: x,
      cy: y,
      r: 7,
      label: point.label,
      ...labelAt(deg, r + 26, point.label, LABEL_SIZE),
      size: LABEL_SIZE,
    });
  });
  if (draft.join) {
    const [x, y] = onRing(0, r);
    marks.push({
      id: `${id}-join`,
      kind: 'line',
      x1: x,
      y1: y - 16,
      x2: x,
      y2: y + 16,
      arrow: false,
      label: `${draft.join.left}  ${draft.join.right}`,
      lx:
        x -
        textWidth(`${draft.join.left}  ${draft.join.right}`, SMALL_SIZE) / 2,
      ly: y - 16 - SMALL_SIZE - 6,
      size: SMALL_SIZE,
    });
  }
  const markers = draft.markers ?? [];
  markers.forEach((marker, index) => {
    // Between points by default: the marker sits a third of the way from one point to the next.
    const fallback = points.length
      ? ((index % points.length) + 0.4) / points.length
      : (index + 0.5) / Math.max(markers.length, 1);
    const deg = angleOf(
      marker.at === null || marker.at === undefined ? fallback : marker.at,
    );
    const [x, y] = onRing(deg, r);
    marks.push({
      id: `${id}-k${index}`,
      kind: 'dot',
      cx: x,
      cy: y,
      r: 5,
      label: marker.label,
      ...labelAt(deg, r - 30, marker.label, SMALL_SIZE),
      size: SMALL_SIZE,
    });
    if (draft.arrowsClockwise && points.length) {
      const next = pointAngles
        .map((angle) => (((angle - deg) % 360) + 360) % 360)
        .reduce(
          (best, gap, i, gaps) => (gap > 0.5 && gap < gaps[best] ? i : best),
          0,
        );
      const to = pointAngles[next];
      const sweep = (((to - deg) % 360) + 360) % 360;
      marks.push({
        id: `${id}-a${index}`,
        kind: 'arc',
        cx,
        cy,
        r: r - 14,
        from: deg + 4,
        to: deg + Math.max(sweep - 4, 6),
        arrow: true,
        label: null,
      });
    }
  });
  return geometry;
}

/** A line: the bar with its cells, the ends, the ticks, the markers, the brackets. */
function lineGeometry(
  draft: SketchDraft,
  space: { w: number; h: number },
  id: string,
): DiagramGeometry {
  const geometry = base(id, draft.title, space);
  const marks = geometry.marks!;
  const x = 60;
  const w = space.w - 120;
  const cells = Math.max(
    0,
    Math.min(SKETCH_LIMITS.line.maxCells, draft.cells ?? 0),
  );
  // Cut into cells it is a bar; otherwise a line, drawn as a thin band.
  const h = cells ? 44 : 8;
  const y = space.h / 2 - h / 2;
  marks.push({ id: `${id}-bar`, kind: 'bar', x, y, w, h, cells, label: null });
  if (draft.ends) {
    marks.push({
      id: `${id}-left`,
      kind: 'text',
      label: draft.ends.left,
      lx: x,
      ly: y + h + 10,
      size: LABEL_SIZE,
    });
    marks.push({
      id: `${id}-right`,
      kind: 'text',
      label: draft.ends.right,
      lx: x + w - textWidth(draft.ends.right),
      ly: y + h + 10,
      size: LABEL_SIZE,
    });
  }
  (draft.ticks ?? []).forEach((tick, index) => {
    const tx = x + Math.max(0, Math.min(1, tick.at)) * w;
    marks.push({
      id: `${id}-t${index}`,
      kind: 'line',
      x1: tx,
      y1: y - 26,
      x2: tx,
      y2: y - 2,
      arrow: true,
      label: tick.label,
      lx: tx - textWidth(tick.label, SMALL_SIZE) / 2,
      ly: y - 26 - SMALL_SIZE - 6,
      size: SMALL_SIZE,
    });
  });
  (draft.markers ?? []).forEach((marker, index) => {
    const mx =
      x +
      Math.max(
        0,
        Math.min(
          1,
          marker.at ?? (index + 1) / ((draft.markers?.length ?? 1) + 1),
        ),
      ) *
        w;
    marks.push({
      id: `${id}-k${index}`,
      kind: 'dot',
      cx: mx,
      cy: y + h / 2,
      r: 5,
      label: marker.label,
      lx: mx - textWidth(marker.label, SMALL_SIZE) / 2,
      ly: y + h + 34,
      size: SMALL_SIZE,
    });
  });
  (draft.brackets ?? []).forEach((bracket, index) => {
    const from = x + Math.max(0, Math.min(1, bracket.from)) * w;
    const to = x + Math.max(0, Math.min(1, bracket.to)) * w;
    const by = y - 60 - index * 40;
    marks.push({
      id: `${id}-b${index}`,
      kind: 'line',
      x1: from,
      y1: by,
      x2: to,
      y2: by,
      arrow: false,
      label: bracket.label,
      lx: (from + to) / 2 - textWidth(bracket.label, SMALL_SIZE) / 2,
      ly: by - SMALL_SIZE - 6,
      size: SMALL_SIZE,
    });
  });
  return geometry;
}

/** Layers: bands stacked top to bottom, arrows between neighbours when asked. */
function layersGeometry(
  draft: SketchDraft,
  space: { w: number; h: number },
  id: string,
): DiagramGeometry {
  const geometry = base(id, draft.title, space);
  const layers = draft.layers ?? [];
  const gap = 6;
  const bandH = Math.max(
    40,
    Math.min(
      84,
      (space.h - 60 - gap * (layers.length - 1)) / Math.max(layers.length, 1),
    ),
  );
  const bandW = Math.min(space.w - 80, 680);
  const x = (space.w - bandW) / 2;
  const total = layers.length * bandH + (layers.length - 1) * gap;
  const top = (space.h - total) / 2;
  const nodes: DiagramNode[] = layers.map((label, index) => ({
    id: `${id}-l${index}`,
    label,
    shape: 'box',
    x: Math.round(x),
    y: Math.round(top + index * (bandH + gap)),
    w: Math.round(bandW),
    h: Math.round(bandH),
    anchor: { charStart: 0, charEnd: 0 },
  }));
  const edges: DiagramEdge[] = draft.layerArrows
    ? nodes.slice(1).map((node, index) => ({
        id: `${id}-e${index}`,
        from: nodes[index].id,
        to: node.id,
        label: null,
        points: [
          [space.w / 2, nodes[index].y + nodes[index].h],
          [space.w / 2, node.y],
        ],
        arrow: 'end' as const,
        anchor: { charStart: 0, charEnd: 0 },
      }))
    : [];
  return { ...geometry, nodes, edges };
}

/** A grid: its lines, the column and row labels, the cell text. */
function gridGeometry(
  draft: SketchDraft,
  space: { w: number; h: number },
  id: string,
): DiagramGeometry {
  const geometry = base(id, draft.title, space);
  const marks = geometry.marks!;
  const rows = draft.rowLabels ?? [];
  const cols = draft.colLabels ?? [];
  const rowLabelW =
    Math.max(60, ...rows.map((label) => textWidth(label, SMALL_SIZE))) + 16;
  const cellW = Math.max(
    60,
    Math.min(150, (space.w - rowLabelW - 80) / Math.max(cols.length, 1)),
  );
  const cellH = Math.max(
    40,
    Math.min(72, (space.h - 100) / Math.max(rows.length, 1)),
  );
  const x0 = (space.w - (rowLabelW + cellW * cols.length)) / 2 + rowLabelW;
  const y0 = (space.h - cellH * rows.length) / 2 + 20;
  for (let r = 0; r <= rows.length; r += 1) {
    const y = y0 + r * cellH;
    marks.push({
      id: `${id}-h${r}`,
      kind: 'line',
      x1: x0,
      y1: y,
      x2: x0 + cellW * cols.length,
      y2: y,
      arrow: false,
      label: null,
    });
  }
  for (let c = 0; c <= cols.length; c += 1) {
    const x = x0 + c * cellW;
    marks.push({
      id: `${id}-v${c}`,
      kind: 'line',
      x1: x,
      y1: y0,
      x2: x,
      y2: y0 + cellH * rows.length,
      arrow: false,
      label: null,
    });
  }
  cols.forEach((label, c) => {
    marks.push({
      id: `${id}-c${c}`,
      kind: 'text',
      label,
      lx: x0 + c * cellW + (cellW - textWidth(label, SMALL_SIZE)) / 2,
      ly: y0 - SMALL_SIZE - 10,
      size: SMALL_SIZE,
    });
  });
  rows.forEach((label, r) => {
    marks.push({
      id: `${id}-r${r}`,
      kind: 'text',
      label,
      lx: x0 - textWidth(label, SMALL_SIZE) - 12,
      ly: y0 + r * cellH + (cellH - SMALL_SIZE) / 2,
      size: SMALL_SIZE,
    });
  });
  (draft.cellText ?? []).forEach((row, r) => {
    if (r >= rows.length) return;
    row.forEach((text, c) => {
      if (c >= cols.length || !text.trim()) return;
      marks.push({
        id: `${id}-x${r}-${c}`,
        kind: 'text',
        label: text,
        lx: x0 + c * cellW + (cellW - textWidth(text, SMALL_SIZE)) / 2,
        ly: y0 + r * cellH + (cellH - SMALL_SIZE) / 2,
        size: SMALL_SIZE,
      });
    });
  });
  return geometry;
}

/** The order the pen draws a sketch: a graph's own order, else its marks and nodes as laid down. */
export function sketchOrder(geometry: DiagramGeometry): string[] {
  if (geometry.marks?.length) return geometry.marks.map((mark) => mark.id);
  if (
    geometry.nodes.length &&
    geometry.nodes.every((node) => node.anchor.charStart === 0)
  ) {
    return [
      ...geometry.groups.map((group) => group.id),
      ...geometry.nodes.map((node) => node.id),
      ...geometry.edges.map((edge) => edge.id),
    ];
  }
  return elementOrder(geometry);
}

const list = (items: string[]) =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** What a reader sees, in one sentence. */
export function describeSketch(draft: SketchDraft): string {
  switch (draft.template) {
    case 'ring': {
      const points = (draft.points ?? []).map((point) => point.label);
      const markers = (draft.markers ?? []).map((marker) => marker.label);
      return [
        `a circle with ${points.length} point${points.length === 1 ? '' : 's'} on it, ${list(points)}, clockwise from the top`,
        markers.length
          ? `, and ${markers.length} marker${markers.length === 1 ? '' : 's'} between them, ${list(markers)}`
          : '',
        draft.arrowsClockwise && markers.length
          ? ', each with an arrow clockwise to the next point'
          : '',
        draft.join
          ? `; the ends meet at the top, ${draft.join.left} on the left and ${draft.join.right} on the right`
          : '',
      ].join('');
    }
    case 'line': {
      const ticks = (draft.ticks ?? []).map((tick) => tick.label);
      const markers = (draft.markers ?? []).map((marker) => marker.label);
      return [
        draft.cells ? `a bar cut into ${draft.cells} cells` : 'a line',
        draft.ends
          ? `, ${draft.ends.left} at the left end and ${draft.ends.right} at the right`
          : '',
        ticks.length ? `, with ${list(ticks)} marked above it` : '',
        markers.length ? `, and ${list(markers)} placed along it` : '',
        (draft.brackets ?? []).length
          ? `; ${list((draft.brackets ?? []).map((bracket) => bracket.label))} bracketed over it`
          : '',
      ].join('');
    }
    case 'layers': {
      const layers = draft.layers ?? [];
      return `${layers.length} layers stacked top to bottom, ${list(layers)}${draft.layerArrows ? ', with an arrow from each down to the next' : ''}`;
    }
    case 'grid': {
      const rows = draft.rowLabels ?? [];
      const cols = draft.colLabels ?? [];
      return `a grid of ${rows.length} rows, ${list(rows)}, by ${cols.length} columns, ${list(cols)}`;
    }
    case 'graph':
    default: {
      const labels = (draft.nodes ?? []).map((node) => node.label);
      return `${labels.length} boxes, ${list(labels)}, joined by ${(draft.edges ?? []).length} arrows`;
    }
  }
}
