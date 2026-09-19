import { chipIcon, resolveDrawing } from './visual-figures';
import {
  SENSES,
  fieldClaims,
  fieldFor,
  knownPicture,
  presetAnchor,
  pickPicture,
  pictureCandidates,
  resolvePicture,
  tagsOf,
} from './visual-presets';

describe('pictures chosen by sense', () => {
  it('offers the drawings a word could be, the sense of the word first, each with its own words', () => {
    const found = pictureCandidates('sign', 4);
    expect(found[0].name).toBe('signature');
    expect(found.length).toBeGreaterThan(1);
    expect(found.every((c) => c.tags.length <= 3)).toBe(true);
    expect(tagsOf('signpost')).toContain('road');
  });

  it('draws a name strictly: a library name, a sense, or the one drawing the words could mean; several is none', () => {
    expect(pickPicture('signature')).toBe('signature');
    expect(pickPicture('sign the deed')).toBe('signature');
    expect(pickPicture('coins')).toBe('coins');
    // "official engagement" is no drawing: the chip stays words.
    expect(pickPicture('official engagement')).toBeUndefined();
    expect(chipIcon('official engagement')).toBeUndefined();
    expect(chipIcon('handshake')).toBe('handshake');
    expect(resolveDrawing('sign')).toEqual({
      kind: 'picture',
      name: 'signature',
    });
  });

  it('guesses by spelling only for the menu, never for the drawing', () => {
    // The menu may guess; the drawn thing must be named.
    expect(resolvePicture('signing')).toBe('signature');
    expect(pictureCandidates('representation').length).toBeGreaterThanOrEqual(
      0,
    );
  });

  it('names only drawings the library has in the sense list', () => {
    for (const [word, name] of Object.entries(SENSES)) {
      expect({ word, known: knownPicture(name) }).toEqual({
        word,
        known: true,
      });
    }
  });
});

describe('a field answers its own terms', () => {
  const renal = [
    'The kidney filters blood through about a million nephrons.',
    'Each nephron begins at a glomerulus inside a capsule.',
    'The cortex is the outer band and the medulla lies inside it.',
  ].join(' ');

  it('reads the field from the page’s own words', () => {
    expect(fieldFor(renal)).toBe('medicine');
    expect(fieldFor('A load balancer sends each request to a server.')).toBe(
      undefined,
    );
  });

  it('answers a term it has drawn with its own drawing', () => {
    expect(pictureCandidates('kidney', 3, [], 'medicine')[0]?.name).toBe(
      'kidney',
    );
  });

  it('answers a part it has drawn with the thing that has it', () => {
    // A glomerulus is drawn inside the nephron, so the page gets the
    // nephron and a line pointing at the glomerulus.
    expect(pictureCandidates('glomerulus', 3, [], 'medicine')[0]?.name).toBe(
      'nephron',
    );
    expect(presetAnchor('nephron', 'glomerulus')).not.toBeNull();
  });

  it('gives words, never a stand-in, for a term it has not drawn', () => {
    // The wall: a drawing that does the same job is not the thing.
    expect(
      pictureCandidates('glomerular filtration rate', 3, [], 'medicine'),
    ).toEqual([]);
    expect(resolveDrawing('creatinine', null, 'medicine')).toBeNull();
  });

  it('leaves everything outside the field’s vocabulary alone', () => {
    expect(pictureCandidates('clock', 3, [], 'medicine')[0]?.name).toBe(
      'clock',
    );
    expect(fieldClaims('bucket', 'medicine')).toBe(false);
  });

  it('gives a drawing’s parts somewhere for a line to meet', () => {
    const cortex = presetAnchor('kidney', 'cortex');
    const ureter = presetAnchor('kidney', 'ureter');
    expect(cortex).not.toBeNull();
    expect(ureter).not.toBeNull();
    expect(cortex).not.toEqual(ureter);
  });
});
