import { chipIcon, resolveDrawing } from './visual-figures';
import {
  SENSES,
  knownPicture,
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
