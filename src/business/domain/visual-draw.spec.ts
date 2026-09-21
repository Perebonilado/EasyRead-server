import {
  DRAW_GATE,
  drawingProblems,
  formProblems,
  presetOf,
  type ThingDrawing,
  type ThingForm,
} from './visual-draw';
import { SVG_GATE, groupsOf, svgProblems } from './visual-svg';

/** A drawing that should be looked at: line, framed, parts in groups. */
const sound: ThingDrawing = {
  svg: [
    '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2">',
    '<path d="M6 10 L94 10 L94 90 L6 90 Z"/>',
    '<line x1="6" y1="78" x2="94" y2="78"/>',
    '<g id="lid"><line x1="6" y1="24" x2="94" y2="24"/></g>',
    '<g id="band"><rect x="6" y="50" width="88" height="10"/></g>',
    '</svg>',
  ].join(''),
  aspect: 1.2,
  parts: [
    { name: 'lid', at: [50, 24] },
    { name: 'band', at: [50, 55] },
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

const swap = (svg: string, from: string, to: string) => svg.replace(from, to);

describe('the gate before a person looks', () => {
  it('passes a drawing worth judging', () => {
    expect(drawingProblems(sound, form)).toEqual([]);
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
    // The labels go on at lesson time in the page's own words. A word
    // baked into the drawing is a word the page never said.
    expect(
      svgProblems(
        swap(sound.svg, '<path', '<text x="10" y="10">kidney</text><path'),
      ).join(' '),
    ).toContain('<text> is not allowed');
  });

  it('turns back a drawing that is filled in', () => {
    // A filled loop of wire is a disc, a filled section has no inside,
    // and a filled bean has no notch.
    expect(
      svgProblems(swap(sound.svg, '<path d', '<path fill="#fff" d')).join(' '),
    ).toContain('fills the drawing in');
  });

  it('turns back a drawing with nothing on it to name', () => {
    expect(
      svgProblems(
        '<svg viewBox="0 0 100 100"><path d="M6 10 L94 10 L94 90 Z"/></svg>',
      ).join(' '),
    ).toContain('nothing on it to name');
  });

  it('turns back a drawing huddled in a corner', () => {
    expect(
      svgProblems(
        '<svg viewBox="0 0 100 100"><path d="M2 2 L20 2 L20 20 Z"/><line x1="2" y1="2" x2="20" y2="20"/><circle cx="10" cy="10" r="5"/><rect x="2" y="2" width="8" height="8"/></svg>',
      ).join(' '),
    ).toContain('should fill the viewBox');
  });

  it('turns back ink the frame would cut off', () => {
    expect(
      svgProblems(swap(sound.svg, 'height="10"', 'height="140"')).join(' '),
    ).toContain('would be cut off');
  });
});

describe('the parts a lesson has to be able to reach', () => {
  it('matches a two-word part to the id the drawer wrote for it', () => {
    // "renal pelvis" and <g id="renal-pelvis"> are the same part; so is
    // renalPelvis. Comparing them as written failed on every part whose
    // name had a space in it.
    expect(
      svgProblems(swap(sound.svg, 'id="band"', 'id="the-Band"'), ['the band']),
    ).toEqual([]);
  });

  it('turns back a part with no group of its own', () => {
    expect(
      drawingProblems(
        { ...sound, svg: swap(sound.svg, 'id="band"', 'id="rim"') },
        form,
      ).join(' '),
    ).toContain('the part "band" has no group of its own');
  });

  it('turns back a group with nothing drawn in it', () => {
    expect(
      svgProblems(
        swap(
          sound.svg,
          '<g id="band"><rect x="6" y="50" width="88" height="10"/></g>',
          '<g id="band"></g>',
        ),
        ['band'],
      ).join(' '),
    ).toContain('the group for "band" is empty');
  });

  it('turns back a part with no point for a line to meet it', () => {
    expect(
      drawingProblems({ ...sound, parts: [sound.parts[0]] }, form).join(' '),
    ).toContain('no point for a line to meet it');
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

  it('turns back a part whose shape states a job', () => {
    expect(
      formProblems({
        ...form,
        parts: [{ id: 'mesh', shape: 'the layer that filters the water' }],
      }).join(' '),
    ).toContain('says what it does');
  });
});

describe('what a passed drawing becomes', () => {
  it('is a preset the library can take, with its parts and its words', () => {
    const preset = presetOf('heat exchanger', sound, 'a wide box with a lid');
    expect(preset.name).toBe('heat-exchanger');
    expect(preset.aspect).toBe(1.2);
    expect(preset.svg).toBe(sound.svg);
    expect(Object.keys(preset.parts ?? {})).toEqual(['lid', 'band']);
    expect(preset.parts?.lid.at).toEqual([50, 24]);
    expect(preset.tags).toContain('heat exchanger');
    expect(preset.tags).toContain('wide');
  });

  it('is line, because a diagram cannot be a silhouette', () => {
    expect(presetOf('volcano', sound, 'a cone on a line').outline).toBe(true);
  });

  it('leaves out parts it has none of', () => {
    expect(
      presetOf('slab', { ...sound, parts: [] }, 'a slab').parts,
    ).toBeUndefined();
  });
});

describe('the markup is model-authored, so it is refused at the door', () => {
  it('turns back a handler or a link', () => {
    for (const bad of [
      '<path onload="x()" d="M6 10 L94 90"/>',
      '<path href="http://x" d="M6 10 L94 90"/>',
    ])
      expect(
        svgProblems(swap(sound.svg, '<path', bad + '<path')).join(' '),
      ).toContain('is not allowed in a drawing');
  });
});

describe('a part has to be a part', () => {
  it('turns back a description that names the whole thing as one', () => {
    // It came back with a part called "shape", and then the drawer had
    // nothing to put in a group that was not the drawing itself.
    for (const id of ['shape', 'outline', 'the body'])
      expect(
        formProblems({ ...form, parts: [{ id, shape: 'a curve' }] }).join(' '),
      ).toContain('is the whole thing, not a part of it');
  });
});
