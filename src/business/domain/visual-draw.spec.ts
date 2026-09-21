import {
  DRAW_GATE,
  drawingProblems,
  presetOf,
  type ThingDrawing,
} from './visual-draw';
import {
  SVG_GATE,
  boxOf,
  framed,
  groupsOf,
  partsOf,
  renderable,
  svgProblems,
} from './visual-svg';

/** A drawing that should be looked at: line, parts in groups. */
const sound: ThingDrawing = {
  svg: [
    '<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">',
    '<path d="M40 60 L760 60 L760 540 L40 540 Z" fill="#eef" stroke="#334"/>',
    '<line x1="40" y1="470" x2="760" y2="470" stroke="#334"/>',
    '<g id="lid"><line x1="40" y1="150" x2="760" y2="150" stroke="#334"/></g>',
    '<g id="band"><rect x="40" y="300" width="700" height="60" fill="#fc8"/></g>',
    '</svg>',
  ].join(''),
  aspect: 1.2,
  parts: [
    { name: 'lid', at: [50, 24] },
    { name: 'band', at: [50, 55] },
  ],
};

const swap = (svg: string, from: string, to: string) => svg.replace(from, to);

describe('the gate before a person looks', () => {
  it('passes a drawing worth judging', () => {
    expect(drawingProblems(sound)).toEqual([]);
  });

  it('turns back markup that is not an svg at all', () => {
    expect(
      svgProblems('M0.5 0.1 C0.2 0.3 0.4 0.5 0.5 0.9 Z').join(' '),
    ).toContain('does not start with an <svg>');
  });

  it('turns back an element the contract does not allow', () => {
    expect(
      svgProblems(swap(sound.svg, '<path', '<image href="x.png"/><path')).join(
        ' ',
      ),
    ).toContain('<image> is not allowed');
  });

  it('turns back a word drawn inside the picture', () => {
    // The labels go on at lesson time in the page's own words.
    expect(
      svgProblems(
        swap(sound.svg, '<path', '<text x="10" y="10">kidney</text><path'),
      ).join(' '),
    ).toContain('<text> is not allowed');
  });

  it('lets a drawing bring its own colour', () => {
    // How it is drawn is the drawing's business. Forcing every element
    // to fill="none" on a 100-unit square is what turned these into
    // doodles; it gets room and a palette now.
    expect(drawingProblems(sound)).toEqual([]);
    expect(SVG_GATE.maxElements).toBeGreaterThan(100);
  });

  it('lets it use a gradient', () => {
    expect(
      svgProblems(
        swap(
          sound.svg,
          '<path',
          '<defs><linearGradient id="sky"><stop offset="0%"/></linearGradient></defs><path',
        ),
      ),
    ).toEqual([]);
  });

  it('turns back a handler or a link', () => {
    for (const bad of [
      '<path onload="x()" d="M6 10 L94 90"/>',
      '<path href="http://x" d="M6 10 L94 90"/>',
    ])
      expect(
        svgProblems(swap(sound.svg, '<path', bad + '<path')).join(' '),
      ).toContain('is not allowed in a drawing');
  });

  it('turns back a drawing with nothing on it to name', () => {
    expect(
      svgProblems(
        '<svg viewBox="0 0 800 600"><path d="M6 10 L94 10 L94 90 Z"/></svg>',
      ).join(' '),
    ).toContain('nothing on it to name');
  });
});

describe('the parts a lesson has to be able to reach', () => {
  it('matches a two-word part to the id the drawer wrote for it', () => {
    // "renal pelvis" and <g id="renal-pelvis"> are the same part, and so
    // is renalPelvis.
    expect(
      svgProblems(swap(sound.svg, 'id="band"', 'id="the-Band"'), ['the band']),
    ).toEqual([]);
  });

  it('turns back a part with no group of its own', () => {
    expect(
      drawingProblems({
        ...sound,
        svg: swap(sound.svg, 'id="band"', 'id="rim"'),
      }).join(' '),
    ).toContain('the part "band" has no group of its own');
  });

  it('turns back a group with nothing drawn in it', () => {
    expect(
      svgProblems(
        swap(
          sound.svg,
          '<g id="band"><rect x="40" y="300" width="700" height="60" fill="#fc8"/></g>',
          '<g id="band"></g>',
        ),
        ['band'],
      ).join(' '),
    ).toContain('the group for "band" is empty');
  });

  it('turns back a part named twice', () => {
    expect(
      drawingProblems({
        ...sound,
        parts: [sound.parts[0], { ...sound.parts[0], name: 'Lid' }],
      }).join(' '),
    ).toContain('named twice');
  });

  it('reads the groups out of the markup', () => {
    expect(groupsOf(sound.svg)).toEqual(['lid', 'band']);
  });

  it('turns back a proportion no box can hold', () => {
    expect(drawingProblems({ ...sound, aspect: 6 }).join(' ')).toContain(
      'outside what a box can hold',
    );
    expect(DRAW_GATE.maxAspect).toBe(3);
    expect(SVG_GATE.minElements).toBe(4);
  });
});

describe('the frame is fixed, not failed', () => {
  // Every volcano in a run of eighteen was a recognisable cone, and
  // every one was thrown out for covering 60 by 70 of the box. The spec
  // says to normalise the viewBox on accept; drawing it again six times
  // over to move it two percent is not a use of anybody's money.
  const cornered = {
    svg: '<svg viewBox="0 0 800 600"><path d="M20 10 L80 10 L80 70 L20 70 Z"/></svg>',
    aspect: 1,
  };

  it('pulls the viewBox in around what was drawn', () => {
    const out = framed(cornered);
    expect(out.svg).toContain('viewBox="16.00 6.00 68.00 68.00"');
  });

  it("gives the true proportion rather than the model's guess", () => {
    expect(framed({ ...cornered, aspect: 2.5 }).aspect).toBeCloseTo(1, 2);
  });

  it('measures the box per axis, from each kind of element', () => {
    const box = boxOf(
      '<svg viewBox="0 0 800 600"><circle cx="50" cy="40" r="10"/><rect x="20" y="60" width="30" height="5"/></svg>',
    );
    expect(box).toEqual({ minX: 20, minY: 30, maxX: 60, maxY: 65 });
  });

  it('leaves a drawing with no geometry alone', () => {
    expect(
      framed({ svg: '<svg viewBox="0 0 100 100"></svg>', aspect: 1 }).svg,
    ).toContain('viewBox="0 0 100 100"');
  });
});

describe('what a passed drawing becomes', () => {
  it('is a preset the library can take, with its parts and its words', () => {
    const preset = presetOf('heat exchanger', sound, 'heat exchanger');
    expect(preset.name).toBe('heat-exchanger');
    expect(preset.svg).toBe(sound.svg);
    expect(Object.keys(preset.parts ?? {})).toEqual(['lid', 'band']);
    expect(preset.parts?.lid.at).toEqual([50, 24]);
    expect(preset.tags).toContain('heat exchanger');
  });

  it('is line, because a diagram cannot be a silhouette', () => {
    expect(presetOf('volcano', sound, 'volcano').outline).toBe(true);
  });
});

describe('markup the rasteriser would die on', () => {
  // resvg panics rather than throws, and a panic in a native module
  // aborts the process — so a try/catch is no use and these have to be
  // caught before it ever sees them. One of them ended a run mid-way.
  it('refuses a viewBox with no size', () => {
    expect(renderable('<svg viewBox="0 0 0 0"><path d="M1 1"/></svg>')).toBe(
      false,
    );
  });

  it('refuses a number that is not a number', () => {
    expect(
      renderable('<svg viewBox="0 0 NaN 600"><path d="M1 1"/></svg>'),
    ).toBe(false);
  });

  it('refuses coordinates big enough to overflow the geometry', () => {
    expect(
      renderable('<svg viewBox="0 0 800 600"><rect x="1e12" y="0"/></svg>'),
    ).toBe(false);
  });

  it('says so in the gate rather than letting it reach the sheet', () => {
    expect(
      svgProblems('<svg viewBox="0 0 0 0"><path d="M1 1"/></svg>').join(' '),
    ).toContain('nothing can draw');
  });

  it('lets a sound drawing through', () => {
    expect(renderable(sound.svg)).toBe(true);
  });

  it('never writes a viewBox of NaNs when the geometry is degenerate', () => {
    const out = framed({
      svg: '<svg viewBox="0 0 800 600"><g/></svg>',
      aspect: 1,
    });
    expect(out.svg).not.toContain('NaN');
  });
});

describe('the parts are read off the drawing', () => {
  it('finds every group and puts its anchor in the middle of its own ink', () => {
    // The model is busy drawing. Asking it for a parts list beside the
    // markup made it invent a taxonomy and keep it in step with what it
    // drew; the groups are already there and the anchor is arithmetic.
    expect(partsOf(sound.svg)).toEqual([
      { name: 'lid', at: [400, 150] },
      { name: 'band', at: [390, 330] },
    ]);
  });

  it('is empty for a drawing with no groups at all', () => {
    expect(
      partsOf('<svg viewBox="0 0 800 600"><rect x="1" y="1"/></svg>'),
    ).toEqual([]);
  });
});
