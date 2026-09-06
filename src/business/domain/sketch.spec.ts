import type { DiagramPlan } from './diagram';
import {
  comparisonGeometry,
  describeSketch,
  graphPlan,
  grounded,
  layoutSketch,
  repairDraft,
  repairSketch,
  sketchGeometryProblems,
  sketchOrder,
  sketchProblems,
  templateHint,
  type SketchDraft,
} from './sketch';

const MATERIAL =
  '[p.73] Consistent hashing puts servers on a hash ring. Server s0, s1, s2 and s3 sit on the ring. ' +
  'Keys k0, k1 and k2 go clockwise to the next server. By collecting both ends x0 and xn we get a ring. ' +
  '[p.72] The hash space runs from x0 to xn. A client talks to a load balancer, then web servers, then a database.';

const ring: SketchDraft = {
  template: 'ring',
  title: 'The hash ring',
  points: ['s0', 's1', 's2', 's3'].map((label) => ({ label, at: null })),
  markers: ['k0', 'k1', 'k2'].map((label) => ({ label, at: null })),
  arrowsClockwise: true,
  join: { left: 'xn', right: 'x0' },
};

describe('the shape of a sketch', () => {
  it('reads the shape from the words of the ask, as a hint', () => {
    expect(templateHint('the hash ring with four servers')).toBe('ring');
    expect(templateHint('the hash space from x0 to xn')).toBe('line');
    expect(templateHint('the layers from client to database')).toBe('layers');
    expect(templateHint('a table of servers and keys')).toBe('grid');
    expect(templateHint('how a request flows through')).toBe('graph');
    expect(templateHint('relational versus non-relational')).toBe('graph');
    expect(templateHint('the parts of a request')).toBeNull();
  });

  it('accepts a grounded ring and refuses labels the material does not say', () => {
    expect(sketchProblems(ring, MATERIAL)).toEqual([]);
    const foreign = {
      ...ring,
      points: [...ring.points!, { label: 'zebra', at: null }],
    };
    expect(sketchProblems(foreign, MATERIAL).map((p) => p.kind)).toContain(
      'ungrounded',
    );
    const crowded = {
      ...ring,
      points: Array.from({ length: 9 }, (_, i) => ({
        label: `s${i}`,
        at: null,
      })),
    };
    expect(sketchProblems(crowded, MATERIAL).map((p) => p.kind)).toContain(
      'too_many_nodes',
    );
    expect(
      sketchProblems(
        { template: 'ring', title: 'x', points: [] },
        MATERIAL,
      ).map((p) => p.kind),
    ).toContain('too_few_nodes');
  });

  it('mends a graph draft instead of asking again', () => {
    const plan: DiagramPlan = {
      title: 'Request flow',
      nodes: [
        { id: 'a', label: 'client', anchor: '' },
        { id: 'a', label: 'client again', anchor: '' },
        { id: 'b', label: 'load balancer web servers database', anchor: '' },
        { id: 'c', label: 'web servers', anchor: '' },
        { id: 'd', label: 'database', anchor: '' },
        { id: 'e', label: 'nobody', anchor: '' },
      ],
      edges: [
        { from: 'a', to: 'b', anchor: '' },
        { from: 'b', to: 'b', anchor: '' },
        { from: 'b', to: 'c', label: 'then on to the', anchor: '' },
        { from: 'c', to: 'd', anchor: '' },
        { from: 'c', to: 'zzz', anchor: '' },
      ],
      groups: [
        { label: 'front', memberIds: ['a', 'b'] },
        { label: 'back', memberIds: ['b', 'c', 'd', 'e'] },
      ],
    };
    const mended = repairDraft(plan);
    expect(mended.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(mended.nodes[1].label).toBe('load balancer web servers');
    expect(mended.edges).toHaveLength(3);
    expect(mended.edges[1].label).toBe('then on to');
    expect(mended.groups.map((group) => group.memberIds)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const graph: SketchDraft = { template: 'graph', ...mended };
    expect(sketchProblems(graph, MATERIAL)).toEqual([]);
    expect(graphPlan(graph).nodes[0].anchor).toBe('');
  });

  it('lays a ring out as a circle with points, markers and clockwise arrows, inside the region', () => {
    const geometry = layoutSketch(ring, MATERIAL, 'd', { w: 920, h: 620 });
    expect(geometry.space).toEqual({ w: 920, h: 620 });
    const marks = geometry.marks ?? [];
    const kinds = marks.map((mark) => mark.kind);
    expect(kinds.filter((kind) => kind === 'circle')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'dot')).toHaveLength(7);
    expect(kinds.filter((kind) => kind === 'arc')).toHaveLength(3);
    expect(kinds.filter((kind) => kind === 'line')).toHaveLength(1);
    const circle = marks.find((mark) => mark.kind === 'circle')!;
    expect(circle.r).toBeGreaterThan(200);
    for (const mark of marks) {
      if (mark.cx !== undefined) {
        expect(mark.cx).toBeGreaterThanOrEqual(0);
        expect(mark.cx).toBeLessThanOrEqual(920);
        expect(mark.cy!).toBeGreaterThanOrEqual(0);
        expect(mark.cy!).toBeLessThanOrEqual(620);
      }
    }
    // The first point is at the top, the second a quarter of the way round.
    const [p0, p1] = marks.filter((mark) => mark.id.includes('-p'));
    expect(Math.round(p0.cx!)).toBe(460);
    expect(p1.cx!).toBeGreaterThan(p0.cx!);
    expect(Math.round(p1.cy!)).toBe(Math.round(circle.cy!));
    expect(sketchOrder(geometry)[0]).toBe('d-ring');
    expect(geometry.caption).toContain('a circle with 4 points on it');
    expect(geometry.caption).toContain(
      's0, s1, s2 and s3, clockwise from the top',
    );
    expect(geometry.caption).toContain(
      'each with an arrow clockwise to the next point',
    );
  });

  it('lays out a line, layers and a grid, each described in words', () => {
    const line = layoutSketch(
      {
        template: 'line',
        title: 'The hash space',
        cells: 12,
        ends: { left: 'x0', right: 'xn' },
        ticks: [{ label: 'k0', at: 0.3 }],
        brackets: null,
        markers: null,
      },
      MATERIAL,
      'l',
      { w: 920, h: 620 },
    );
    expect(line.marks?.map((mark) => mark.kind)).toEqual([
      'bar',
      'text',
      'text',
      'line',
    ]);
    expect(line.marks?.[0].cells).toBe(12);
    expect(
      describeSketch({
        template: 'line',
        title: '',
        cells: 12,
        ends: { left: 'x0', right: 'xn' },
      }),
    ).toBe('a bar cut into 12 cells, x0 at the left end and xn at the right');

    const layers = layoutSketch(
      {
        template: 'layers',
        title: 'Tiers',
        layers: ['client', 'load balancer', 'web servers', 'database'],
        layerArrows: true,
      },
      MATERIAL,
      'y',
      { w: 440, h: 620 },
    );
    expect(layers.nodes).toHaveLength(4);
    expect(layers.edges).toHaveLength(3);
    expect(layers.nodes[1].y).toBeGreaterThan(
      layers.nodes[0].y + layers.nodes[0].h,
    );
    expect(sketchOrder(layers)).toEqual([
      'y-l0',
      'y-l1',
      'y-l2',
      'y-l3',
      'y-e0',
      'y-e1',
      'y-e2',
    ]);
    expect(layers.caption).toBe(
      '4 layers stacked top to bottom, client, load balancer, web servers and database, with an arrow from each down to the next',
    );

    const grid = layoutSketch(
      {
        template: 'grid',
        title: 'Keys by server',
        rowLabels: ['s0', 's1'],
        colLabels: ['k0', 'k1', 'k2'],
        cellText: [
          ['x', '', ''],
          ['', 'x', ''],
        ],
      },
      MATERIAL,
      'g',
      { w: 920, h: 620 },
    );
    const gridKinds = grid.marks?.map((mark) => mark.kind) ?? [];
    expect(gridKinds.filter((kind) => kind === 'line')).toHaveLength(3 + 4);
    expect(gridKinds.filter((kind) => kind === 'text')).toHaveLength(3 + 2 + 2);
    expect(grid.caption).toBe(
      'a grid of 2 rows, s0 and s1, by 3 columns, k0, k1 and k2',
    );
  });
});

describe('mending a template draft', () => {
  it('turns a ring of markers only into a ring of points, and lets the ask ground a label', () => {
    const mended = repairSketch({
      template: 'ring',
      title: 'Ring',
      points: [],
      markers: [
        { label: 's0', at: null },
        { label: 's1', at: null },
      ],
    });
    expect(mended.points).toHaveLength(2);
    expect(mended.markers).toEqual([]);
    const asked = {
      template: 'layers' as const,
      title: 'Tiers',
      layers: ['web tier', 'data tier'],
    };
    expect(sketchProblems(asked, MATERIAL).map((p) => p.kind)).toContain(
      'ungrounded',
    );
    expect(
      sketchProblems(asked, MATERIAL, 'the web tier and the data tier'),
    ).toEqual([]);
    const between = 'the ring with the keys between the servers';
    expect(sketchProblems(ring, MATERIAL, between)).toEqual([]);
    expect(
      sketchProblems({ ...ring, markers: [] }, MATERIAL, between).map(
        (p) => p.kind,
      ),
    ).toContain('too_few_nodes');
  });

  it('does not reject a graph for a label wider than its box', () => {
    const geometry = layoutSketch(
      {
        template: 'graph',
        title: 'Flow',
        nodes: Array.from({ length: 6 }, (_, i) => ({
          id: `n${i}`,
          label: 'load balancer web servers',
          anchor: null,
        })),
        edges: Array.from({ length: 5 }, (_, i) => ({
          from: `n${i}`,
          to: `n${i + 1}`,
          anchor: null,
        })),
        groups: [],
      },
      MATERIAL,
      'f',
      { w: 920, h: 620 },
    );
    expect(sketchGeometryProblems(geometry).map((p) => p.kind)).not.toContain(
      'label_fit',
    );
  });
});

describe('a comparison and the words that ground a label', () => {
  it('lays two compared groups out side by side, read down each column', () => {
    const draft: SketchDraft = {
      template: 'graph',
      title: 'Two kinds of database',
      nodes: [
        { id: 'r', label: 'relational', anchor: null },
        { id: 'r1', label: 'tables and rows', anchor: null },
        { id: 'n', label: 'non-relational', anchor: null },
        { id: 'n1', label: 'key-value', anchor: null },
        { id: 'n2', label: 'graph', anchor: null },
      ],
      edges: [{ from: 'r', to: 'n', anchor: null }],
      groups: [
        { label: 'relational', memberIds: ['r', 'r1'] },
        { label: 'non-relational', memberIds: ['n', 'n1', 'n2'] },
      ],
    };
    const geometry = layoutSketch(
      draft,
      MATERIAL,
      'c',
      { w: 920, h: 620 },
      60,
      'relational versus non-relational',
    );
    expect(geometry.groups).toHaveLength(2);
    expect(geometry.edges).toEqual([]);
    const [left, right] = geometry.groups;
    expect(left.x + left.w).toBeLessThanOrEqual(right.x);
    expect(left.y).toBe(right.y);
    const rightNodes = geometry.nodes.filter((node) =>
      right.memberIds.includes(node.id),
    );
    expect(rightNodes.map((node) => node.y)).toEqual(
      [...rightNodes.map((node) => node.y)].sort((a, b) => a - b),
    );
    expect(sketchOrder(geometry).slice(0, 2)).toEqual(['c-g0', 'c-g1']);
    expect(
      comparisonGeometry({ ...draft, groups: [] }, { w: 920, h: 620 }, 'c'),
    ).toBeNull();
    // Without a comparing ask, the graph engine lays it out as before.
    expect(
      layoutSketch(draft, MATERIAL, 'c', { w: 920, h: 620 }).edges,
    ).toHaveLength(1);
  });

  it('grounds a label through plain inflections', () => {
    const pool = new Set(['exceed', 'capacity', 'server']);
    expect(grounded('exceeds capacity', pool)).toBe(true);
    expect(grounded('servers', pool)).toBe(true);
    expect(grounded('exceeding', pool)).toBe(true);
    expect(grounded('zebra', pool)).toBe(false);
  });
});
