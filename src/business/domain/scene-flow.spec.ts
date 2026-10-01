import {
  MAX_FLOW_NODES,
  isRing,
  layFlow,
  overlaps,
  readFlow,
  renderFlow,
  type FlowDraft,
} from './scene-flow';

const steps = (...labels: string[]) =>
  labels.map((label) => ({ label, kind: null }));

const FLOWS: Record<string, FlowDraft> = {
  'water cycle': {
    direction: 'cycle',
    nodes: steps('Evaporation', 'Condensation', 'Precipitation', 'Collection'),
    edges: null,
  },
  photosynthesis: {
    direction: 'across',
    nodes: steps(
      'Sunlight',
      'Water',
      'Carbon dioxide',
      'Chloroplast',
      'Glucose',
      'Oxygen',
    ),
    edges: [
      { from: 'Sunlight', to: 'Chloroplast', label: 'energy' },
      { from: 'Water', to: 'Chloroplast', label: null },
      { from: 'Carbon dioxide', to: 'Chloroplast', label: null },
      { from: 'Chloroplast', to: 'Glucose', label: null },
      { from: 'Chloroplast', to: 'Oxygen', label: null },
    ],
  },
  'decision tree': {
    direction: 'down',
    nodes: [
      { label: 'Above 38°C?', kind: 'decision' },
      { label: 'Rest and drink water', kind: 'end' },
      { label: 'Over 3 days?', kind: 'decision' },
      { label: 'See a doctor', kind: 'end' },
      { label: 'Keep checking', kind: 'end' },
    ],
    edges: [
      { from: 'Above 38°C?', to: 'Rest and drink water', label: 'No' },
      { from: 'Above 38°C?', to: 'Over 3 days?', label: 'Yes' },
      { from: 'Over 3 days?', to: 'See a doctor', label: 'Yes' },
      { from: 'Over 3 days?', to: 'Keep checking', label: 'No' },
    ],
  },
  'food web': {
    direction: 'down',
    nodes: steps('Hawk', 'Snake', 'Frog', 'Mouse', 'Grasshopper', 'Grass'),
    edges: [
      { from: 'Grass', to: 'Grasshopper', label: null },
      { from: 'Grass', to: 'Mouse', label: null },
      { from: 'Grasshopper', to: 'Frog', label: null },
      { from: 'Mouse', to: 'Snake', label: null },
      { from: 'Frog', to: 'Snake', label: null },
      { from: 'Snake', to: 'Hawk', label: null },
      { from: 'Mouse', to: 'Hawk', label: null },
    ],
  },
  'family tree': {
    direction: 'down',
    nodes: steps(
      'Grandmother Mei',
      'Uncle Tunde',
      'Mother Sofia',
      'Ada',
      'Ravi',
    ),
    edges: [
      { from: 'Grandmother Mei', to: 'Uncle Tunde', label: null },
      { from: 'Grandmother Mei', to: 'Mother Sofia', label: null },
      { from: 'Mother Sofia', to: 'Ada', label: null },
      { from: 'Mother Sofia', to: 'Ravi', label: null },
    ],
  },
  'long chain': {
    direction: 'across',
    nodes: steps(
      'Seed planted',
      'Roots grow',
      'Shoot appears',
      'Leaves open',
      'Flowers bloom',
      'Pollination',
      'Fruit forms',
      'Seeds form',
      'Seeds spread',
      'New plant',
    ),
    edges: null,
  },
};

describe('flows: read from the writer', () => {
  it('joins links by label, each step once, a step by its place too', () => {
    const { spec, dropped } = readFlow({
      direction: 'down',
      nodes: steps('Egg', 'egg', 'Larva', 'Pupa', 'Adult'),
      edges: [
        { from: 'egg', to: 'LARVA', label: null },
        { from: 'step 2', to: 'Pupa', label: null },
        { from: 'Pupa', to: 'Adult', label: null },
        { from: 'Adult', to: 'Butterfly', label: null },
      ],
    });
    expect(spec?.nodes.map((n) => n.label)).toEqual([
      'Egg',
      'Larva',
      'Pupa',
      'Adult',
    ]);
    expect(spec?.edges.map((e) => [e.from, e.to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(dropped).toEqual([
      'the link "Adult" to "Butterfly" joins no two of its steps',
    ]);
  });

  it('with no links, each step leads to the next, and a cycle comes round again', () => {
    expect(readFlow(FLOWS['long chain']).spec?.edges).toHaveLength(9);
    const cycle = readFlow(FLOWS['water cycle']).spec!;
    expect(cycle.direction).toBe('cycle');
    expect(cycle.edges.at(-1)).toEqual({ from: 3, to: 0, label: null });
    expect(isRing(4, cycle.edges)).toBe(true);
  });

  it('reads links that come round as a cycle when no way is given', () => {
    const { spec } = readFlow({
      direction: null,
      nodes: steps('Egg', 'Caterpillar', 'Chrysalis', 'Butterfly'),
      edges: [
        { from: 'Egg', to: 'Caterpillar', label: null },
        { from: 'Caterpillar', to: 'Chrysalis', label: null },
        { from: 'Chrysalis', to: 'Butterfly', label: null },
        { from: 'Butterfly', to: 'Egg', label: null },
      ],
    });
    expect(spec?.direction).toBe('cycle');
  });

  it('has nothing to draw with fewer than two steps, and holds at most ten', () => {
    expect(
      readFlow({ direction: null, nodes: steps('Alone'), edges: null }).spec,
    ).toBeNull();
    expect(readFlow(null).spec).toBeNull();
    const many = readFlow({
      direction: null,
      nodes: steps(...Array.from({ length: 14 }, (_, i) => `Step ${i + 1}`)),
      edges: null,
    });
    expect(many.spec?.nodes).toHaveLength(MAX_FLOW_NODES);
  });
});

describe('flows: laid out by code', () => {
  for (const [name, draft] of Object.entries(FLOWS))
    for (const shape of ['wide', 'tall'] as const)
      it(`${name}, ${shape}: no two steps touch, its words at the audience size or close, small`, () => {
        const spec = readFlow(draft).spec!;
        const laid = layFlow(spec, shape, 32);
        laid.nodes.forEach((a, i) =>
          laid.nodes.forEach((b, j) => {
            if (j > i) expect(overlaps(a, b, 4)).toBe(false);
          }),
        );
        const drawn = renderFlow(spec, shape, 32);
        // As it stands alone on the stage: at the floor, or within a tenth of it.
        expect(drawn.smallest).toBeGreaterThanOrEqual(32 * 0.9);
        expect(drawn.svg.length).toBeLessThan(50 * 1024);
        expect(Object.keys(drawn.parts)).toEqual(
          spec.nodes.map((n) => n.label),
        );
        const ids = Object.values(drawn.parts);
        expect(new Set(ids).size).toBe(ids.length);
      });

  it('draws a tall film taller than a wide one', () => {
    for (const name of ['water cycle', 'long chain', 'food web']) {
      const spec = readFlow(FLOWS[name]).spec!;
      const wide = renderFlow(spec, 'wide').viewBox;
      const tall = renderFlow(spec, 'tall').viewBox;
      expect(tall[2] / tall[3]).toBeLessThan(wide[2] / wide[3]);
    }
  });

  it('draws its words larger for a young audience', () => {
    const spec = readFlow(FLOWS['water cycle']).spec!;
    const size = (svg: string) =>
      Math.min(
        ...[...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1])),
      );
    expect(size(renderFlow(spec, 'wide', 52).svg)).toBeGreaterThan(
      size(renderFlow(spec, 'wide', 32).svg),
    );
  });

  it('draws a question as a diamond and an end as a pill', () => {
    const drawn = renderFlow(readFlow(FLOWS['decision tree']).spec!, 'wide');
    expect(
      drawn.svg.match(/<path d="M[^"]+Z" fill="#FFFFFF" stroke="#E0663A"/g),
    ).toHaveLength(2);
    expect(drawn.svg).toContain('>Yes<');
  });
});
