import {
  DRAW_GATE,
  drawingProblems,
  presetOf,
  spreadOf,
  type ThingDrawing,
} from './visual-draw';

const sound: ThingDrawing = {
  body: 'M0.08 0.2 L0.92 0.2 L0.92 0.9 C0.6 0.98 0.3 0.98 0.08 0.9 Z',
  detail: 'M0.08 0.34 L0.92 0.34',
  aspect: 1.2,
  parts: [
    { name: 'lid', at: [0.5, 0.27] },
    { name: 'band', at: [0.5, 0.6] },
  ],
};

describe('the gate before a person looks', () => {
  it('passes a drawing worth judging', () => {
    expect(drawingProblems(sound)).toEqual([]);
  });

  it('turns back a box pretending to be a drawing', () => {
    expect(
      drawingProblems({ ...sound, body: 'M0.1 0.1 L0.9 0.1 Z' }).join(' '),
    ).toContain('is a box, not a drawing');
  });

  it('turns back an outline left open', () => {
    expect(
      drawingProblems({
        ...sound,
        body: 'M0.08 0.2 L0.92 0.2 L0.92 0.9 C0.6 0.98 0.3 0.98 0.08 0.9',
      }).join(' '),
    ).toContain('not closed');
  });

  it('turns back a drawing huddled in a corner', () => {
    expect(
      drawingProblems({
        ...sound,
        body: 'M0.1 0.1 L0.3 0.1 L0.3 0.3 C0.25 0.32 0.15 0.32 0.1 0.3 Z',
      }).join(' '),
    ).toContain('percent of its square');
  });

  it('turns back a path off the square, and one written in shorthand', () => {
    expect(
      drawingProblems({
        ...sound,
        body: sound.body.replace('0.92', '1.9'),
      }).join(' '),
    ).toContain('the outline is not sound');
    expect(
      drawingProblems({
        ...sound,
        body: sound.body.replace('L0.92', 'l0.92'),
      }).join(' '),
    ).toContain('relative');
  });

  it('turns back a part that points at nothing, or is named twice', () => {
    expect(
      drawingProblems({
        ...sound,
        parts: [{ name: 'lid', at: [1.4, 0.2] }],
      }).join(' '),
    ).toContain('points off the square');
    expect(
      drawingProblems({
        ...sound,
        parts: [
          { name: 'lid', at: [0.5, 0.2] },
          { name: 'Lid', at: [0.5, 0.6] },
        ],
      }).join(' '),
    ).toContain('named twice');
  });

  it('turns back a proportion no box can hold', () => {
    expect(drawingProblems({ ...sound, aspect: 6 }).join(' ')).toContain(
      'outside what a box can hold',
    );
    expect(DRAW_GATE.maxAspect).toBe(3);
  });
});

describe('what a passed drawing becomes', () => {
  it('is a preset the library can take, with its parts and its words', () => {
    const preset = presetOf('heat exchanger', sound, 'a wide box with a lid');
    expect(preset.name).toBe('heat-exchanger');
    expect(preset.aspect).toBe(1.2);
    expect(preset.body).toBe(sound.body);
    expect(preset.detail).toBe(sound.detail);
    expect(preset.parts?.map((p) => p.name)).toEqual(['lid', 'band']);
    expect(preset.tags).toContain('heat exchanger');
    expect(preset.tags).toContain('wide');
  });

  it('leaves out a detail and parts it has none of', () => {
    const bare = presetOf(
      'slab',
      { ...sound, detail: null, parts: [] },
      'a slab',
    );
    expect(bare.detail).toBeUndefined();
    expect(bare.parts).toBeUndefined();
  });
});

describe('measuring a path', () => {
  it('reads how much of the square it covers', () => {
    expect(spreadOf('M0 0 L1 0 L1 1 Z')).toEqual({ w: 1, h: 1 });
    const small = spreadOf('M0.4 0.4 L0.6 0.4 L0.6 0.6 Z');
    expect(small.w).toBeCloseTo(0.2, 6);
    expect(small.h).toBeCloseTo(0.2, 6);
    expect(spreadOf('')).toEqual({ w: 0, h: 0 });
  });
});
