import {
  diagramAnchor,
  diagramProblems,
  elementOrder,
  geometryProblems,
  layoutDiagram,
  type DiagramPlan,
} from './diagram';

const SPOKEN =
  'A request arrives at the gateway. The gateway checks the token bucket. ' +
  'If a token is there, the request goes to the service. If not, it is dropped.';
const PAGE = 'Request, gateway, token bucket, service, dropped.';

const plan: DiagramPlan = {
  title: 'Request through the gateway',
  nodes: [
    { id: 'req', label: 'request', anchor: 'A request arrives' },
    { id: 'gw', label: 'gateway', anchor: 'at the gateway' },
    { id: 'bucket', label: 'token bucket', anchor: 'checks the token bucket' },
    { id: 'svc', label: 'service', anchor: 'goes to the service' },
    { id: 'drop', label: 'dropped', anchor: 'it is dropped' },
  ],
  edges: [
    { from: 'req', to: 'gw', anchor: 'arrives at the gateway' },
    {
      from: 'gw',
      to: 'bucket',
      label: 'checks',
      anchor: 'checks the token bucket',
    },
    {
      from: 'bucket',
      to: 'svc',
      label: 'token',
      anchor: 'goes to the service',
    },
    { from: 'bucket', to: 'drop', label: 'no token', anchor: 'it is dropped' },
  ],
  groups: [],
};

describe('checking a diagram plan', () => {
  it('accepts a grounded, anchored, connected plan', () => {
    expect(diagramProblems(plan, SPOKEN, PAGE)).toEqual([]);
  });

  it('rejects orphans, self loops, unknown nodes, long or foreign labels and missing anchors', () => {
    const bad: DiagramPlan = {
      ...plan,
      nodes: [
        ...plan.nodes,
        {
          id: 'zebra',
          label: 'a zebra with five long words',
          anchor: 'nowhere at all',
        },
      ],
      edges: [
        ...plan.edges,
        { from: 'gw', to: 'gw', anchor: 'the gateway' },
        { from: 'gw', to: 'ghost', anchor: 'the gateway' },
      ],
    };
    const kinds = diagramProblems(bad, SPOKEN, PAGE).map(
      (problem) => problem.kind,
    );
    for (const kind of [
      'orphan',
      'self_loop',
      'unknown_node',
      'label_too_long',
      'ungrounded',
      'anchor_missing',
    ]) {
      expect(kinds).toContain(kind);
    }
  });

  it('rejects too few nodes and overlapping groups', () => {
    const tiny: DiagramPlan = {
      ...plan,
      nodes: plan.nodes.slice(0, 2),
      edges: plan.edges.slice(0, 1),
    };
    expect(diagramProblems(tiny, SPOKEN, PAGE).map((p) => p.kind)).toContain(
      'too_few_nodes',
    );
    const grouped: DiagramPlan = {
      ...plan,
      groups: [
        { label: 'edge', memberIds: ['req', 'gw'] },
        { label: 'core', memberIds: ['gw', 'bucket'] },
      ],
    };
    expect(diagramProblems(grouped, SPOKEN, PAGE).map((p) => p.kind)).toContain(
      'groups_overlap',
    );
  });
});

describe('laying a diagram out', () => {
  it('places every node inside the space with no overlaps, edges routed, anchors found', () => {
    const geometry = layoutDiagram(plan, 'process', SPOKEN, 'd1');
    expect(geometry.nodes).toHaveLength(5);
    for (const node of geometry.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.w).toBeLessThanOrEqual(geometry.space.w);
      expect(node.y + node.h).toBeLessThanOrEqual(geometry.space.h);
      expect(node.anchor.charEnd).toBeGreaterThan(node.anchor.charStart);
    }
    expect(geometryProblems(geometry)).toEqual([]);
    expect(geometry.edges.every((edge) => edge.points.length >= 2)).toBe(true);
    // A process runs left to right: the request is left of the service.
    const x = (id: string) => geometry.nodes.find((node) => node.id === id)!.x;
    expect(x('req')).toBeLessThan(x('svc'));
  });

  it('is deterministic', () => {
    const a = layoutDiagram(plan, 'structure', SPOKEN, 'd1');
    const b = layoutDiagram(plan, 'structure', SPOKEN, 'd1');
    expect(a).toEqual(b);
  });

  it('draws nodes as the voice reaches them and edges once both ends exist', () => {
    const geometry = layoutDiagram(plan, 'process', SPOKEN, 'd1');
    const order = elementOrder(geometry);
    expect(order[0]).toBe('req');
    expect(order.indexOf('d1-e0')).toBeGreaterThan(order.indexOf('gw'));
    expect(order.indexOf('d1-e2')).toBeGreaterThan(order.indexOf('svc'));
    expect(new Set(order).size).toBe(order.length);
    expect(diagramAnchor(geometry).charStart).toBe(SPOKEN.indexOf('A request'));
  });

  it('flags overlapping nodes and labels that cannot fit', () => {
    const geometry = layoutDiagram(plan, 'process', SPOKEN, 'd1');
    const squashed = {
      ...geometry,
      nodes: geometry.nodes.map((node, i) =>
        i === 1
          ? { ...node, x: geometry.nodes[0].x, y: geometry.nodes[0].y, w: 20 }
          : node,
      ),
    };
    const kinds = geometryProblems(squashed).map((p) => p.kind);
    expect(kinds).toContain('overlap');
    expect(kinds).toContain('label_fit');
  });
});
