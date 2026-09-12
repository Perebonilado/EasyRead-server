/**
 * What extraction hands the rest of the pipeline. A PDF made from a slide
 * deck carries bullets and dashes in symbol fonts with no character behind
 * them, and they arrive as the replacement character. The writer then
 * reads "1998?99" and guesses a year. This is the one place that mess is
 * tidied, so every reader of page text sees characters, not question marks.
 */

/** Private-use glyphs the common symbol fonts put where a bullet or a dash belongs. */
const SYMBOL_GLYPHS: Record<string, string> = {
  '': '•',
  '': '•',
  '': '•',
  '': '•',
  '': '•',
  '': '→',
  '': '→',
  '': '-',
  '': '.',
  '': '×',
  '': '±',
  '': '≤',
  '': '≥',
  '': '°',
  '': "'",
  '': '"',
};

const REPLACEMENT = '�';

/**
 * Bullets and dashes lost to a symbol font become the characters they were;
 * a replacement character between two digits or words was a dash, at the
 * start of a line a bullet, and anywhere else is dropped.
 */
export function cleanExtractedText(text: string): string {
  let out = text;
  for (const [glyph, plain] of Object.entries(SYMBOL_GLYPHS)) {
    out = out.split(glyph).join(plain);
  }
  // Anything else from the private-use area has no reading; drop it.
  out = out.replace(/[-]/g, '');
  return (
    out
      // "1998?99", "pre?operative": a dash, as the author wrote it.
      .replace(/(?<=[\p{L}\p{N}])�(?=[\p{L}\p{N}])/gu, '-')
      // "? The incidence": the bullet that began the line.
      .replace(/(^|\n)[ \t]*�[ \t]*/g, '$1• ')
      .split(REPLACEMENT)
      .join('')
      .replace(/[ \t]{2,}/g, ' ')
  );
}
