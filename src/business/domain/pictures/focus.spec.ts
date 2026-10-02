import {
  agreeDoubt,
  boxOfCells,
  CELLS,
  focalFromFocus,
  focusOf,
  personPhotoDoubt,
  photoDoubt,
  portraitDoubt,
} from './focus';

describe("where a picture's subject is, as a model that sees names it", () => {
  it('names thirty-six cells, A1 to F6', () => {
    expect(CELLS).toHaveLength(36);
    expect(CELLS[0]).toBe('A1');
    expect(CELLS[35]).toBe('F6');
  });

  it('makes the box round the cells it named, as shares of the picture', () => {
    expect(boxOfCells(['C2', 'D2'])).toEqual([2 / 6, 1 / 6, 2 / 6, 1 / 6]);
    expect(boxOfCells(['A1', 'F6'])).toEqual([0, 0, 1, 1]);
    expect(boxOfCells([])).toBeNull();
  });

  it('reads only cells of its list, a count held to 0–30 and a kind of its list', () => {
    expect(
      focusOf({
        faces: ['c2', ' D2', 'Z9', 7],
        subject: 'B2, C3',
        people: 99,
        kind: 'photograph',
      }),
    ).toEqual({
      faces: [2 / 6, 1 / 6, 2 / 6, 1 / 6],
      subject: [1 / 6, 1 / 6, 2 / 6, 2 / 6],
      people: 30,
      kind: 'photograph',
      shows: 'unsure',
    });
    expect(focusOf({ kind: 'a hologram', people: -3, shows: 'maybe' })).toEqual(
      {
        faces: null,
        subject: null,
        people: 0,
        kind: 'other',
        shows: 'unsure',
      },
    );
    expect(focusOf({ shows: 'yes' }).shows).toBe('yes');
    expect(focusOf(null).kind).toBe('other');
  });

  it('frames the faces with room for heads and shoulders, else the subject', () => {
    const faces = focalFromFocus(
      focusOf({
        faces: ['E2'],
        subject: ['D2', 'F5'],
        people: 1,
        kind: 'photograph',
      }),
    )!;
    // A face's cell grown half a cell each side and a cell below, inside the picture.
    expect(faces[0]).toBeCloseTo(4 / 6 - 1 / 12, 5);
    expect(faces[1]).toBeCloseTo(1 / 6 - 1 / 12, 5);
    expect(faces[0] + faces[2]).toBeCloseTo(5 / 6 + 1 / 12, 5);
    expect(faces[1] + faces[3]).toBeCloseTo(2 / 6 + 1 / 6, 5);
    expect(
      focalFromFocus(focusOf({ subject: ['B4'], kind: 'photograph' })),
    ).toEqual([1 / 6, 3 / 6, 1 / 6, 1 / 6]);
    expect(focalFromFocus(focusOf({}))).toBeNull();
  });

  it('doubts a portrait that shows several people or is a print, a screen or a statue; a photo only a print or a screen', () => {
    const seen = (over: object) =>
      focusOf({
        faces: ['C2'],
        subject: ['C2'],
        people: 1,
        kind: 'photograph',
        ...over,
      });
    expect(portraitDoubt(seen({}))).toBeNull();
    expect(portraitDoubt(seen({ kind: 'painting' }))).toBeNull();
    expect(portraitDoubt(seen({ people: 6 }))).toBe('6 people show in it');
    expect(portraitDoubt(seen({ kind: 'photograph-of-a-print' }))).toMatch(
      /print/u,
    );
    expect(portraitDoubt(seen({ kind: 'statue' }))).toMatch(/statue/u);
    expect(photoDoubt(seen({ people: 6 }))).toBeNull();
    expect(photoDoubt(seen({ kind: 'screen' }))).toMatch(/screen/u);
  });

  it('takes a photo of an event or a thing only when the look agrees it shows it', () => {
    const seen = (over: object) =>
      focusOf({ subject: ['C2'], people: 3, kind: 'photograph', ...over });
    const asked = 'an event: Nigeria becomes independent (1 October 1960)';
    expect(agreeDoubt(seen({ shows: 'yes' }), asked)).toBeNull();
    expect(agreeDoubt(seen({ shows: 'no' }), asked)).toBe(
      `the look does not see ${asked} in it (no)`,
    );
    expect(agreeDoubt(seen({ shows: 'unsure' }), asked)).toMatch(/unsure/u);
    // A print of it on a museum wall is no photo of it, whatever it shows.
    expect(
      agreeDoubt(seen({ shows: 'yes', kind: 'photograph-of-a-print' }), asked),
    ).toMatch(/print/u);
  });

  it('takes a photo of a person among others, never one with nobody in it or a statue', () => {
    const seen = (over: object) =>
      focusOf({ faces: ['C2'], people: 6, kind: 'photograph', ...over });
    expect(personPhotoDoubt(seen({}))).toBeNull();
    expect(personPhotoDoubt(seen({ people: 0, faces: [] }))).toBe(
      'no one shows in it',
    );
    // Faces seen, the count lost: someone shows.
    expect(personPhotoDoubt(seen({ people: 0 }))).toBeNull();
    expect(personPhotoDoubt(seen({ kind: 'statue' }))).toMatch(/statue/u);
  });

  it('takes no map, page or drawing for a place or an event; a thing may be drawn', () => {
    const map = focusOf({
      subject: ['A1', 'F6'],
      people: 0,
      kind: 'document',
      shows: 'yes',
    });
    expect(agreeDoubt(map, 'a place: London', { photograph: true })).toBe(
      'it is no photograph (document)',
    );
    const drawing = focusOf({ subject: ['B2'], kind: 'drawing', shows: 'yes' });
    expect(agreeDoubt(drawing, 'a thing: iconoscope')).toBeNull();
    expect(
      personPhotoDoubt(focusOf({ people: 4, kind: 'document', faces: ['B2'] })),
    ).toMatch(/no photograph of them/u);
  });
});
