import {
  diagramAnchor,
  diagramProblems,
  elementOrder,
  geometryProblems,
  layoutDiagram,
  liveMaterial,
  regionLayout,
  LIVE_DIAGRAM_LIMITS,
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

describe("the tutor's live sketch", () => {
  const unanchored: DiagramPlan = {
    ...plan,
    nodes: plan.nodes.map((node) => ({ ...node, anchor: 'not said anywhere' })),
    edges: plan.edges.map((edge) => ({ ...edge, anchor: 'nor this' })),
  };

  it('does not need anchors, but still needs grounded labels and fewer parts', () => {
    expect(
      diagramProblems(unanchored, SPOKEN, PAGE).map((p) => p.kind),
    ).toContain('anchor_missing');
    expect(diagramProblems(unanchored, SPOKEN, PAGE, { live: true })).toEqual(
      [],
    );
    const foreign: DiagramPlan = {
      ...unanchored,
      nodes: [...unanchored.nodes, { id: 'z', label: 'zebra', anchor: 'x' }],
      edges: [...unanchored.edges, { from: 'svc', to: 'z', anchor: 'x' }],
    };
    expect(
      diagramProblems(foreign, SPOKEN, PAGE, { live: true }).map((p) => p.kind),
    ).toContain('ungrounded');
    const many: DiagramPlan = {
      ...unanchored,
      nodes: Array.from({ length: 9 }, (_, i) => ({
        id: `n${i}`,
        label: 'request',
        anchor: 'x',
      })),
      edges: Array.from({ length: 8 }, (_, i) => ({
        from: `n${i}`,
        to: `n${i + 1}`,
        anchor: 'x',
      })),
    };
    expect(
      diagramProblems(many, SPOKEN, PAGE, {
        live: true,
        maxNodes: LIVE_DIAGRAM_LIMITS.maxNodes,
      }).map((p) => p.kind),
    ).toContain('too_many_nodes');
  });

  it('is laid out for the region it will be drawn in, and grows to fill it', () => {
    const wide = regionLayout({ w: 920, h: 620 }, 'process');
    expect(wide).toEqual({
      space: { w: 920, h: 620 },
      rankdir: 'LR',
      grow: LIVE_DIAGRAM_LIMITS.grow,
    });
    expect(regionLayout({ w: 460, h: 620 }, 'structure').rankdir).toBe('TB');
    expect(regionLayout({ w: 460, h: 620 }, 'comparison').rankdir).toBe('LR');
    expect(regionLayout(null, 'process')).toEqual({
      space: undefined,
      rankdir: undefined,
      grow: LIVE_DIAGRAM_LIMITS.grow,
    });

    const small = layoutDiagram(plan, 'process', SPOKEN, 'd');
    const grown = layoutDiagram(plan, 'process', SPOKEN, 'd', 60, wide);
    expect(grown.space).toEqual({ w: 920, h: 620 });
    const width = (g: typeof grown) =>
      Math.max(...g.nodes.map((n) => n.x + n.w)) -
      Math.min(...g.nodes.map((n) => n.x));
    expect(width(grown)).toBeGreaterThan(width(small));
    // Fills the width: within the margins, most of the region is used.
    expect(width(grown)).toBeGreaterThan(920 * 0.6);
    for (const node of grown.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x + node.w).toBeLessThanOrEqual(920);
      expect(node.y + node.h).toBeLessThanOrEqual(620);
    }
    expect(geometryProblems(grown)).toEqual([]);
  });

  it('draws from the book, not the page: neighbours, passages and what the tutor said', () => {
    const material = liveMaterial({
      pageNumber: 73,
      pageText: 'Servers sit on a ring.',
      neighbours: [
        { pageNumber: 73, text: 'Servers sit on a ring.' },
        { pageNumber: 74, text: 'Keys go clockwise to the next server.' },
      ],
      passages: [
        { pageNumber: 81, text: 'Virtual nodes split a server into pieces.' },
        { pageNumber: 74, text: 'Keys go clockwise   to the next server.' },
      ],
      recent: [
        { role: 'learner', text: 'What is a virtual node?' },
        { role: 'tutor', text: 'A server split into pieces on the ring.' },
      ],
    });
    expect(material).toContain(
      '[p.73, the page they are on] Servers sit on a ring.',
    );
    expect(material).toContain('[p.74] Keys go clockwise to the next server.');
    expect(material).toContain('[p.81] Virtual nodes split a server');
    expect(material).toContain(
      '[what you just said] A server split into pieces',
    );
    expect(material).not.toContain('What is a virtual node?');
    // The page and a duplicate passage appear once each.
    expect(material.match(/Keys go clockwise/g)).toHaveLength(1);
    expect(material.match(/Servers sit on a ring/g)).toHaveLength(1);
  });
});
