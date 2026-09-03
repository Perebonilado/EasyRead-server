/**
 * Laying out a diagram offline.
 *
 * The model says what the drawing contains: nodes, edges, groups, each
 * citing the phrase of the script it belongs to. Where things go is not a
 * model's job; dagre places them, deterministically, and the result is
 * normalised into the board's fixed space so the client only ever draws
 * shapes at known coordinates. Everything here is pure apart from dagre.
 */
import * as dagreModule from '@dagrejs/dagre';

/**
 * The little of dagre this module uses, typed here so the layout reads
 * the same whether or not the package's own types resolve in a given
 * toolchain (the linter's program does not always see them).
 */
interface LayoutGraph {
  setGraph(options: Record<string, unknown>): void;
  setDefaultEdgeLabel(fn: () => Record<string, unknown>): void;
  setNode(id: string, value: Record<string, unknown>): void;
  hasNode(id: string): boolean;
  setParent(id: string, parent: string): void;
  setEdge(
    from: string,
    to: string,
    value: Record<string, unknown>,
    name?: string,
  ): void;
  node(id: string): { x: number; y: number; width: number; height: number };
  edge(
    from: string,
    to: string,
    name?: string,
  ): { points?: { x: number; y: number }[] } | undefined;
}
const dagre = dagreModule as unknown as {
  graphlib: { Graph: new (options?: Record<string, unknown>) => LayoutGraph };
  layout: (graph: LayoutGraph) => void;
};
import {
  BOARD_SPACE,
  contentWords,
  findAnchor,
  normalise,
  wordsOf,
  type BoardAnchor,
  type DiagramEdge,
  type DiagramGeometry,
  type DiagramGroup,
  type DiagramNode,
  type DiagramShape,
  type FigureKind,
} from './board';

/** What the model returns for a figure, before layout. */
export interface DiagramPlan {
  title: string;
  nodes: {
    id: string;
    label: string;
    shape?: DiagramShape | null;
    anchor: string;
  }[];
  edges: { from: string; to: string; label?: string | null; anchor: string }[];
  groups: { label: string; memberIds: string[] }[];
}

export const DIAGRAM_LIMITS = {
  minNodes: 3,
  maxNodes: 12,
  maxEdges: 16,
  maxLabelWords: 4,
  /** Node areas may cover at most this share of the space. */
  maxInk: 0.55,
} as const;

export interface DiagramProblem {
  kind:
    | 'too_few_nodes'
    | 'too_many_nodes'
    | 'too_many_edges'
    | 'orphan'
    | 'self_loop'
    | 'unknown_node'
    | 'label_too_long'
    | 'ungrounded'
    | 'anchor_missing'
    | 'duplicate_node'
    | 'groups_overlap';
  detail: string;
}

/**
 * Everything wrong with a plan before it is worth laying out. The
 * processor sends the reasons back once with fewer nodes asked for.
 */
export function diagramProblems(
  plan: DiagramPlan,
  spoken: string,
  pageText: string,
): DiagramProblem[] {
  const problems: DiagramProblem[] = [];
  const ids = new Set<string>();
  for (const node of plan.nodes) {
    if (ids.has(node.id)) {
      problems.push({ kind: 'duplicate_node', detail: node.id });
    }
    ids.add(node.id);
  }
  if (plan.nodes.length < DIAGRAM_LIMITS.minNodes) {
    problems.push({
      kind: 'too_few_nodes',
      detail: `${plan.nodes.length} nodes; at least ${DIAGRAM_LIMITS.minNodes}`,
    });
  }
  if (plan.nodes.length > DIAGRAM_LIMITS.maxNodes) {
    problems.push({
      kind: 'too_many_nodes',
      detail: `${plan.nodes.length} nodes; at most ${DIAGRAM_LIMITS.maxNodes}`,
    });
  }
  if (plan.edges.length > DIAGRAM_LIMITS.maxEdges) {
    problems.push({
      kind: 'too_many_edges',
      detail: `${plan.edges.length} edges; at most ${DIAGRAM_LIMITS.maxEdges}`,
    });
  }
  const pool = new Set(contentWords(`${pageText} ${spoken}`));
  const touched = new Set<string>();
  for (const edge of plan.edges) {
    if (edge.from === edge.to) {
      problems.push({ kind: 'self_loop', detail: edge.from });
    }
    for (const end of [edge.from, edge.to]) {
      if (!ids.has(end)) {
        problems.push({ kind: 'unknown_node', detail: end });
      }
      touched.add(end);
    }
    if (!findAnchor(spoken, edge.anchor)) {
      problems.push({
        kind: 'anchor_missing',
        detail: `edge ${edge.from} to ${edge.to}: "${edge.anchor}"`,
      });
    }
  }
  for (const node of plan.nodes) {
    if (wordsOf(node.label).length > DIAGRAM_LIMITS.maxLabelWords) {
      problems.push({ kind: 'label_too_long', detail: node.label });
    }
    if (!contentWords(node.label).every((word) => pool.has(word))) {
      problems.push({ kind: 'ungrounded', detail: node.label });
    }
    if (!findAnchor(spoken, node.anchor)) {
      problems.push({
        kind: 'anchor_missing',
        detail: `node ${node.label}: "${node.anchor}"`,
      });
    }
    if (plan.nodes.length > 4 && !touched.has(node.id)) {
      problems.push({ kind: 'orphan', detail: node.label });
    }
  }
  const seen = new Set<string>();
  for (const group of plan.groups) {
    for (const member of group.memberIds) {
      if (seen.has(member)) {
        problems.push({ kind: 'groups_overlap', detail: member });
      }
      seen.add(member);
    }
  }
  return problems;
}

const NODE_HEIGHT = 44;
const NODE_PADDING = 28;
const CHAR_WIDTH = 9;
const MAX_NODE_WIDTH = 260;
const MARGIN = 24;
const GROUP_PADDING = 16;

function nodeSize(label: string): { w: number; h: number } {
  const longest = Math.max(...label.split('\n').map((line) => line.length), 1);
  return {
    w: Math.min(MAX_NODE_WIDTH, longest * CHAR_WIDTH + NODE_PADDING),
    h: NODE_HEIGHT,
  };
}

function shapeFor(
  kind: FigureKind,
  given: DiagramShape | null | undefined,
): DiagramShape {
  if (given) return given;
  return kind === 'comparison' ? 'box' : 'box';
}

/**
 * Places the plan's nodes and routes its edges, then fits everything into
 * the board's diagram space. A process runs left to right, a structure
 * top down, and a comparison sits its two groups side by side with the
 * edges between them.
 */
export function layoutDiagram(
  plan: DiagramPlan,
  kind: Exclude<FigureKind, 'none'>,
  spoken: string,
  id: string,
  rankSeparation = 60,
): DiagramGeometry {
  const graph = new dagre.graphlib.Graph({
    compound: plan.groups.length > 0,
    multigraph: true,
  });
  graph.setGraph({
    rankdir: kind === 'process' ? 'LR' : kind === 'structure' ? 'TB' : 'LR',
    nodesep: 32,
    ranksep: rankSeparation,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of plan.nodes) {
    const size = nodeSize(node.label);
    graph.setNode(node.id, {
      width: size.w,
      height: size.h,
      label: node.label,
    });
  }
  plan.groups.forEach((group, index) => {
    const groupId = `group-${index}`;
    graph.setNode(groupId, { label: group.label, clusterLabelPos: 'top' });
    for (const member of group.memberIds) {
      if (graph.hasNode(member)) graph.setParent(member, groupId);
    }
  });
  plan.edges.forEach((edge, index) => {
    graph.setEdge(
      edge.from,
      edge.to,
      {
        label: edge.label ?? undefined,
        width: edge.label ? edge.label.length * CHAR_WIDTH : 0,
        height: edge.label ? 20 : 0,
        name: `e${index}`,
      },
      `e${index}`,
    );
  });
  dagre.layout(graph);

  const rawNodes = plan.nodes.map((node) => {
    const placed = graph.node(node.id);
    return {
      id: node.id,
      label: node.label,
      shape: shapeFor(kind, node.shape),
      x: placed.x - placed.width / 2,
      y: placed.y - placed.height / 2,
      w: placed.width,
      h: placed.height,
      anchor: findAnchor(spoken, node.anchor) ?? { charStart: 0, charEnd: 0 },
    };
  });
  const rawEdges = plan.edges.map((edge, index) => {
    const placed = graph.edge(edge.from, edge.to, `e${index}`);
    const points = (placed?.points ?? []).map(
      (point) => [point.x, point.y] as [number, number],
    );
    return {
      id: `${id}-e${index}`,
      from: edge.from,
      to: edge.to,
      label: edge.label ?? null,
      points,
      arrow: 'end' as const,
      anchor: findAnchor(spoken, edge.anchor) ?? { charStart: 0, charEnd: 0 },
    };
  });

  // Fit into the space, keeping the aspect ratio.
  const xs = [
    ...rawNodes.flatMap((node) => [node.x, node.x + node.w]),
    ...rawEdges.flatMap((edge) => edge.points.map((point) => point[0])),
  ];
  const ys = [
    ...rawNodes.flatMap((node) => [node.y, node.y + node.h]),
    ...rawEdges.flatMap((edge) => edge.points.map((point) => point[1])),
  ];
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const width = Math.max(...xs, 1) - minX;
  const height = Math.max(...ys, 1) - minY;
  const inner = {
    w: BOARD_SPACE.w - 2 * MARGIN,
    h: BOARD_SPACE.h - 2 * MARGIN,
  };
  const scale = Math.min(1, inner.w / width, inner.h / height);
  const offsetX = MARGIN + (inner.w - width * scale) / 2;
  const offsetY = MARGIN + (inner.h - height * scale) / 2;
  const fx = (x: number) => Math.round((x - minX) * scale + offsetX);
  const fy = (y: number) => Math.round((y - minY) * scale + offsetY);

  const nodes: DiagramNode[] = rawNodes.map((node) => ({
    ...node,
    x: fx(node.x),
    y: fy(node.y),
    w: Math.round(node.w * scale),
    h: Math.round(node.h * scale),
  }));
  const edges: DiagramEdge[] = rawEdges.map((edge) => ({
    ...edge,
    points: edge.points.map((point) => [fx(point[0]), fy(point[1])]),
  }));
  const groups: DiagramGroup[] = plan.groups.map((group, index) => {
    const members = nodes.filter((node) => group.memberIds.includes(node.id));
    const x = Math.min(...members.map((node) => node.x)) - GROUP_PADDING;
    const y = Math.min(...members.map((node) => node.y)) - GROUP_PADDING - 18;
    const right =
      Math.max(...members.map((node) => node.x + node.w)) + GROUP_PADDING;
    const bottom =
      Math.max(...members.map((node) => node.y + node.h)) + GROUP_PADDING;
    return {
      id: `${id}-g${index}`,
      label: group.label,
      memberIds: group.memberIds,
      x: members.length ? x : 0,
      y: members.length ? y : 0,
      w: members.length ? right - x : 0,
      h: members.length ? bottom - y : 0,
    };
  });

  return {
    id,
    title: plan.title,
    kind,
    space: { ...BOARD_SPACE },
    nodes,
    edges,
    groups,
  };
}

export interface GeometryProblem {
  kind: 'overlap' | 'label_fit' | 'too_much_ink';
  detail: string;
}

/** Whether a laid-out diagram can be drawn legibly. */
export function geometryProblems(geometry: DiagramGeometry): GeometryProblem[] {
  const problems: GeometryProblem[] = [];
  for (let i = 0; i < geometry.nodes.length; i += 1) {
    for (let j = i + 1; j < geometry.nodes.length; j += 1) {
      const a = geometry.nodes[i];
      const b = geometry.nodes[j];
      const overlap =
        a.x < b.x + b.w &&
        b.x < a.x + a.w &&
        a.y < b.y + b.h &&
        b.y < a.y + a.h;
      if (overlap) {
        problems.push({ kind: 'overlap', detail: `${a.label} and ${b.label}` });
      }
    }
  }
  for (const node of geometry.nodes) {
    // Sixteen pixel type is about eight units per character in the space.
    if (node.label.length * 8 > node.w - 8) {
      problems.push({ kind: 'label_fit', detail: node.label });
    }
  }
  const ink = geometry.nodes.reduce((sum, node) => sum + node.w * node.h, 0);
  if (ink > geometry.space.w * geometry.space.h * DIAGRAM_LIMITS.maxInk) {
    problems.push({ kind: 'too_much_ink', detail: `${Math.round(ink)} units` });
  }
  return problems;
}

/** The order the pen draws a diagram: nodes as the voice reaches them, edges once both ends exist, groups last. */
export function elementOrder(geometry: DiagramGeometry): string[] {
  const nodes = [...geometry.nodes].sort(
    (a, b) => a.anchor.charStart - b.anchor.charStart,
  );
  const order: string[] = [];
  const drawn = new Set<string>();
  const pendingEdges = [...geometry.edges].sort(
    (a, b) => a.anchor.charStart - b.anchor.charStart,
  );
  for (const node of nodes) {
    order.push(node.id);
    drawn.add(node.id);
    for (const edge of pendingEdges) {
      if (order.includes(edge.id)) continue;
      if (drawn.has(edge.from) && drawn.has(edge.to)) order.push(edge.id);
    }
  }
  for (const edge of pendingEdges) {
    if (!order.includes(edge.id)) order.push(edge.id);
  }
  for (const group of geometry.groups) order.push(group.id);
  return order;
}

/** The first phrase a diagram element belongs to, for the op's own anchor. */
export function diagramAnchor(geometry: DiagramGeometry): BoardAnchor {
  const first = [...geometry.nodes].sort(
    (a, b) => a.anchor.charStart - b.anchor.charStart,
  )[0];
  return first?.anchor ?? { charStart: 0, charEnd: 0 };
}

/** Whether two labels name the same thing, for the tutor's references. */
export function sameLabel(a: string, b: string): boolean {
  return normalise(a) === normalise(b);
}
