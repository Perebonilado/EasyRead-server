import {
  DRAW_GATE,
  drawingProblems,
  formProblems,
  presetOf,
  spreadOf,
  type ThingDrawing,
  type ThingForm,
} from './visual-draw';

const sound: ThingDrawing = {
  body: 'M0.08 0.2 L0.92 0.2 L0.92 0.9 C0.6 0.98 0.3 0.98 0.08 0.9 Z',
  detail: 'M0.08 0.34 L0.92 0.34',
  aspect: 1.2,
  parts: [
    {
      name: 'lid',
      at: [0.5, 0.27],
      shape: 'M0.08 0.2 L0.92 0.2 L0.92 0.32 L0.08 0.32 Z',
      line: null,
    },
    {
      name: 'band',
      at: [0.5, 0.6],
      shape: null,
      line: 'M0.08 0.6 L0.92 0.6',
    },
  ],
};

/** The description `sound` was drawn from. */
const form: ThingForm = {
  looksLike: 'a wide box with a lid across the top and a band around it',
  parts: [
    { id: 'lid', shape: 'a flat band across the top edge' },
    { id: 'band', shape: 'a narrow band around the middle' },
  ],
  aspect: 1.2,
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
        parts: [{ ...sound.parts[0], at: [1.4, 0.2] }],
      }).join(' '),
    ).toContain('points off the square');
    expect(
      drawingProblems({
        ...sound,
        parts: [{ ...sound.parts[0] }, { ...sound.parts[0], name: 'Lid' }],
      }).join(' '),
    ).toContain('named twice');
  });

  it('turns back a part with no ink of its own', () => {
    expect(
      drawingProblems({
        ...sound,
        parts: [{ name: 'lid', at: [0.5, 0.27], shape: null, line: null }],
      }).join(' '),
    ).toContain('no ink of its own');
  });

  it('turns back a part whose own ink is unsound', () => {
    expect(
      drawingProblems({
        ...sound,
        parts: [{ ...sound.parts[0], shape: 'M0.1 0.1 l0.4 0.4 Z' }],
      }).join(' '),
    ).toContain('the part "lid" shape is not sound');
  });

  it('turns back a drawing that dropped a part the description named', () => {
    expect(
      drawingProblems({ ...sound, parts: [sound.parts[0]] }, form).join(' '),
    ).toContain('"band" missing');
  });

  it('turns back a drawing that invented a part nobody asked for', () => {
    expect(
      drawingProblems(
        {
          ...sound,
          parts: [...sound.parts, { ...sound.parts[0], name: 'spout' }],
        },
        form,
      ).join(' '),
    ).toContain('"spout" was not in the description');
  });

  it('counts a bend by where the pen lands, not by where its handles reach', () => {
    // One short stroke whose control handles swing wide. Reading every
    // number as a coordinate calls this a full-width drawing; it is not.
    const handles = 'M0.40 0.45 C0.02 0.02 0.98 0.98 0.60 0.55 Z';
    // Reading every number as a coordinate calls this 0.96 wide.
    expect(spreadOf(handles).w).toBeLessThan(0.5);
    expect(spreadOf(handles).w).toBeGreaterThan(0.2);
  });

  it('turns back a proportion no box can hold', () => {
    expect(drawingProblems({ ...sound, aspect: 6 }).join(' ')).toContain(
      'outside what a box can hold',
    );
    expect(DRAW_GATE.maxAspect).toBe(3);
  });
});

describe('the description, before anything is drawn from it', () => {
  it('lets through a description that is all shape', () => {
    expect(formProblems(form)).toEqual([]);
  });

  it('turns back a description that says what the thing is for', () => {
    expect(
      formProblems({
        ...form,
        looksLike: 'a bean-shaped organ that filters blood',
      }).join(' '),
    ).toContain('says what it is for');
  });

  it('turns back a part named for its job', () => {
    expect(
      formProblems({
        ...form,
        parts: [{ id: 'stores', shape: 'a band across the top' }],
      }).join(' '),
    ).toContain('named for what it does');
  });
});

describe('what a passed drawing becomes', () => {
  it('is a preset the library can take, with its parts and its words', () => {
    const preset = presetOf('heat exchanger', sound, 'a wide box with a lid');
    expect(preset.name).toBe('heat-exchanger');
    expect(preset.aspect).toBe(1.2);
    expect(preset.body).toBe(sound.body);
    expect(preset.detail).toBe(sound.detail);
    expect(Object.keys(preset.parts ?? {})).toEqual(['lid', 'band']);
    // Keyed by name and carrying its own ink: the shape every pack keeps,
    // so an accepted drawing drops in without being transposed by hand.
    expect(preset.parts?.lid.at).toEqual([0.5, 0.27]);
    expect(preset.parts?.lid.fill).toBe(sound.parts[0].shape);
    expect(preset.parts?.lid.stroke).toBeUndefined();
    expect(preset.parts?.band.stroke).toBe(sound.parts[1].line);
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

describe('the bean that used to measure zero', () => {
  it('measures a curve by the curve, not by its endpoints', () => {
    // A kidney is two symmetric cubics. Every endpoint shares one x, so
    // reading endpoints alone called it zero wide and the gate threw out
    // the exact shape the library most needed.
    const bean = 'M0.5 0.1 C0.1 0.3 0.1 0.7 0.5 0.9 C0.9 0.7 0.9 0.3 0.5 0.1 Z';
    expect(spreadOf(bean).w).toBeGreaterThan(DRAW_GATE.minSpread);
    expect(spreadOf(bean).h).toBeGreaterThan(DRAW_GATE.minSpread);
  });
});
