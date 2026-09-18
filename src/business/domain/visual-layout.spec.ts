import {
  layoutProblems,
  repairVisual,
  visualProblems,
  type VisualSegment,
} from './visual';
import { layoutScene, type VisualStructure } from './visual-layout';

const talk: VisualSegment[] = [
  {
    text: 'The first sentence of the scene brings in the centre of the picture, the one thing the whole chapter keeps coming back to.',
    cues: [],
  },
  {
    text: 'The second sentence brings in what feeds the centre, one thing at a time, so the student sees where each part comes from.',
    cues: [],
  },
  {
    text: 'The third sentence brings in what comes out of it all, and leaves the finished picture on the screen for a moment.',
    cues: [],
  },
];

const withCues = (
  structure: Omit<VisualStructure, 'segments'>,
): VisualStructure => {
  // Every item and arrow shown once, in order, so the checks are about placement.
  const ids = [
    ...structure.items.map((i) => i.id),
    ...structure.arrows.map((a) => a.id),
  ];
  const per = Math.ceil(ids.length / 3);
  return {
    ...structure,
    segments: talk.map((segment, i) => ({
      ...segment,
      cues: ids.slice(i * per, (i + 1) * per).map((id, k) => ({
        at: Math.min(k, 6),
        do: 'fade' as const,
        target: id,
      })),
    })),
  };
};

describe('laying out a structure', () => {
  it('places a hub with pictures and chips that overlap nothing and run over no edge', () => {
    const scene = repairVisual(
      layoutScene(
        withCues({
          title: 'A clinic and what reaches it',
          template: 'hub',
          items: [
            { id: 'title', role: 'title', kind: 'label', text: 'Primary care' },
            {
              id: 'clinic',
              role: 'centre',
              kind: 'picture',
              text: 'clinic',
              picture: 'clinic',
            },
            {
              id: 'water',
              role: 'input',
              kind: 'picture',
              text: 'water',
              picture: 'tap',
            },
            { id: 'food', role: 'input', kind: 'chip', text: 'nutrition' },
            {
              id: 'nurse',
              role: 'input',
              kind: 'picture',
              text: 'nurse',
              picture: 'stethoscope',
            },
            {
              id: 'edu',
              role: 'input',
              kind: 'chip',
              text: 'health education',
            },
            {
              id: 'well',
              role: 'output',
              kind: 'picture',
              text: 'healthy family',
              picture: 'family',
            },
            { id: 'referral', role: 'output', kind: 'chip', text: 'referral' },
            {
              id: 'note',
              role: 'note',
              kind: 'label',
              text: 'care for everyone',
            },
          ],
          arrows: [
            { id: 'a1', from: 'water', to: 'clinic' },
            { id: 'a2', from: 'food', to: 'clinic' },
            { id: 'a3', from: 'nurse', to: 'clinic' },
            { id: 'a4', from: 'edu', to: 'clinic' },
            { id: 'a5', from: 'clinic', to: 'well' },
            { id: 'a6', from: 'clinic', to: 'referral' },
          ],
        }),
      ),
    );
    expect(layoutProblems(scene)).toEqual([]);
    expect(visualProblems(scene)).toEqual([]);
    const clinic = scene.elements.find((e) => e.id === 'clinic');
    expect(clinic?.type).toBe('shape');
    expect((clinic as { kind: string }).kind).toBe('clinic');
    expect(scene.elements.some((e) => e.id === 'clinic_name')).toBe(true);
  });

  it('lays six steps out as two rows, a cycle as a ring, two sides as columns, and bands as layers', () => {
    const steps = ['fetch', 'parse', 'filter', 'store', 'index', 'serve'];
    const flow = repairVisual(
      layoutScene(
        withCues({
          title: 'A crawl',
          template: 'flow',
          items: steps.map((s, i) => ({
            id: `s${i}`,
            role: 'step' as const,
            kind: 'chip' as const,
            text: s,
          })),
          arrows: steps
            .slice(1)
            .map((_, i) => ({ id: `f${i}`, from: `s${i}`, to: `s${i + 1}` })),
        }),
      ),
    );
    expect(layoutProblems(flow)).toEqual([]);
    const ys = new Set(
      flow.elements
        .filter((e) => e.type === 'chip')
        .map((e) => (e as { y: number }).y),
    );
    expect(ys.size).toBe(2);

    const cycle = repairVisual(
      layoutScene(
        withCues({
          title: 'A loop',
          template: 'cycle',
          items: ['plan', 'do', 'check', 'act'].map((s, i) => ({
            id: `c${i}`,
            role: 'step' as const,
            kind: 'chip' as const,
            text: s,
          })),
          arrows: [0, 1, 2, 3].map((i) => ({
            id: `r${i}`,
            from: `c${i}`,
            to: `c${(i + 1) % 4}`,
          })),
        }),
      ),
    );
    expect(layoutProblems(cycle)).toEqual([]);

    const compare = repairVisual(
      layoutScene(
        withCues({
          title: 'Two ways',
          template: 'compare',
          items: [
            {
              id: 'l0',
              role: 'left',
              kind: 'picture',
              text: 'clinic',
              picture: 'clinic',
            },
            { id: 'l1', role: 'left', kind: 'chip', text: 'near home' },
            {
              id: 'r0',
              role: 'right',
              kind: 'picture',
              text: 'hospital',
              picture: 'hospital',
            },
            { id: 'r1', role: 'right', kind: 'chip', text: 'specialists' },
          ],
          arrows: [],
        }),
      ),
    );
    expect(layoutProblems(compare)).toEqual([]);

    const layers = repairVisual(
      layoutScene(
        withCues({
          title: 'Tiers',
          template: 'layers',
          items: ['community', 'district', 'regional', 'national'].map(
            (s, i) => ({
              id: `y${i}`,
              role: 'layer' as const,
              kind: 'chip' as const,
              text: s,
            }),
          ),
          arrows: [],
        }),
      ),
    );
    expect(layoutProblems(layers)).toEqual([]);
  });
});
