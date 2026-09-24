/**
 * What extraction hands the rest of the pipeline. A PDF made from a slide
 * deck or a Word file carries bullets, dashes and maths in symbol fonts
 * with no character behind them: they arrive as private-use glyphs, or
 * as the replacement character. The writer then reads "1998?99" and
 * guesses a year, and "3?4 = 12" loses its times sign. This is the one
 * place that mess is tidied, so every reader of page text sees
 * characters, not question marks.
 */

/**
 * Glyphs the common symbol fonts put where a bullet, a dash or an arrow
 * belongs, anywhere on a line (Wingdings' and Symbol's alike).
 */
const SYMBOL_GLYPHS: Record<string, string> = {
  '\uF0B7': '•',
  '\uF0A7': '•',
  '\uF0FC': '•',
  '\uF0D8': '•',
  '\uF076': '•',
  '\uF09F': '•',
  '\uF0E0': '→',
  '\uF0E8': '→',
  '\uF02E': '.',
};

/**
 * Glyphs that are a bullet at the start of a line (Wingdings' squares,
 * dots and diamonds) and a Greek letter anywhere else (Symbol's λ, ν, θ,
 * υ, ω, ♦).
 */
const BULLET_OR_LETTER: Record<string, string> = {
  '\uF06C': 'λ',
  '\uF06E': 'ν',
  '\uF071': 'θ',
  '\uF075': 'υ',
  '\uF077': 'ω',
  '\uF0A8': '♦',
};

/**
 * The Symbol font, as Word and PowerPoint store it (its codes moved into
 * the private-use area, U+F020 on): maths operators, relations, Greek
 * letters, arrows and the pieces of tall brackets, as the characters they
 * draw.
 */
const SYMBOL_FONT: Record<number, string> = {
  0x20: ' ',
  0x21: '!',
  0x22: '∀',
  0x23: '#',
  0x24: '∃',
  0x25: '%',
  0x26: '&',
  0x27: '∋',
  0x28: '(',
  0x29: ')',
  0x2a: '∗',
  0x2b: '+',
  0x2c: ',',
  0x2d: '−',
  0x2f: '/',
  0x3a: ':',
  0x3b: ';',
  0x3c: '<',
  0x3d: '=',
  0x3e: '>',
  0x3f: '?',
  0x40: '≅',
  0x41: 'Α',
  0x42: 'Β',
  0x43: 'Χ',
  0x44: 'Δ',
  0x45: 'Ε',
  0x46: 'Φ',
  0x47: 'Γ',
  0x48: 'Η',
  0x49: 'Ι',
  0x4a: 'ϑ',
  0x4b: 'Κ',
  0x4c: 'Λ',
  0x4d: 'Μ',
  0x4e: 'Ν',
  0x4f: 'Ο',
  0x50: 'Π',
  0x51: 'Θ',
  0x52: 'Ρ',
  0x53: 'Σ',
  0x54: 'Τ',
  0x55: 'Υ',
  0x56: 'ς',
  0x57: 'Ω',
  0x58: 'Ξ',
  0x59: 'Ψ',
  0x5a: 'Ζ',
  0x5b: '[',
  0x5c: '∴',
  0x5d: ']',
  0x5e: '⊥',
  0x5f: '_',
  0x61: 'α',
  0x62: 'β',
  0x63: 'χ',
  0x64: 'δ',
  0x65: 'ε',
  0x66: 'φ',
  0x67: 'γ',
  0x68: 'η',
  0x69: 'ι',
  0x6a: 'ϕ',
  0x6b: 'κ',
  0x6d: 'μ',
  0x6f: 'ο',
  0x70: 'π',
  0x72: 'ρ',
  0x73: 'σ',
  0x74: 'τ',
  0x78: 'ξ',
  0x79: 'ψ',
  0x7a: 'ζ',
  0x7b: '{',
  0x7c: '|',
  0x7d: '}',
  0x7e: '∼',
  0xa2: '′',
  0xa3: '≤',
  0xa4: '⁄',
  0xa5: '∞',
  0xa6: 'ƒ',
  0xab: '↔',
  0xac: '←',
  0xad: '↑',
  0xae: '→',
  0xaf: '↓',
  0xb0: '°',
  0xb1: '±',
  0xb2: '″',
  0xb3: '≥',
  0xb4: '×',
  0xb5: '∝',
  0xb6: '∂',
  0xb8: '÷',
  0xb9: '≠',
  0xba: '≡',
  0xbb: '≈',
  0xbc: '…',
  0xc0: 'ℵ',
  0xc4: '⊗',
  0xc5: '⊕',
  0xc6: '∅',
  0xc7: '∩',
  0xc8: '∪',
  0xc9: '⊃',
  0xca: '⊇',
  0xcb: '⊄',
  0xcc: '⊂',
  0xcd: '⊆',
  0xce: '∈',
  0xcf: '∉',
  0xd0: '∠',
  0xd1: '∇',
  0xd5: '∏',
  0xd6: '√',
  0xd7: '⋅',
  0xd9: '∧',
  0xda: '∨',
  0xdb: '⇔',
  0xdc: '⇐',
  0xdd: '⇑',
  0xde: '⇒',
  0xdf: '⇓',
  0xe1: '〈',
  0xe5: '∑',
  // Tall brackets come in pieces: the top piece stands for the bracket,
  // the rest for nothing.
  0xe6: '(',
  0xe9: '[',
  0xec: '{',
  0xf1: '〉',
  0xf2: '∫',
  0xf6: ')',
  0xf9: ']',
};

const REPLACEMENT = '\uFFFD';

/** A sign, a digit or a lost glyph: what maths is written with. */
const MATHS_MARK =
  /[\p{N}=+\-\u2212\u00D7\u00F7<>\u2264\u2265/^()[\]{}|\uE000-\uF8FF]/u;

/**
 * Whether a glyph sits in maths: the nearest character on either side,
 * past any space, is a digit or a sign, or a letter standing alone.
 */
function mathsAround(text: string, at: number): boolean {
  const near = (from: number, step: -1 | 1): boolean => {
    let i = from;
    while (i >= 0 && i < text.length && /[ \t]/.test(text[i])) i += step;
    const c = text[i];
    if (!c) return false;
    if (MATHS_MARK.test(c)) return true;
    // A letter alone, as a variable is: "x", not "gambiense".
    return /\p{L}/u.test(c) && !/\p{L}/u.test(text[i + step] ?? '');
  };
  return near(at - 1, -1) || near(at + 1, 1);
}

/**
 * Bullets, dashes and maths lost to a symbol font become the characters
 * they were. A replacement character between two words is a hyphen, and
 * between two numbers a range's dash ("1998–99"), never a minus: what it
 * stood for is not known, and a lost times sign read as a minus is wrong
 * maths (a maths page is read again from its image). At the start of a
 * line it is a bullet, and anywhere else it is dropped.
 */
export function cleanExtractedText(text: string): string {
  let out = text;
  for (const [glyph, plain] of Object.entries(SYMBOL_GLYPHS)) {
    out = out.split(glyph).join(plain);
  }
  // Symbol's minus starting a line is a dash before a point, not maths.
  out = out.replace(/(^|\n)([ \t]*)\uF02D[ \t]*/gu, '$1$2- ');
  for (const [glyph, letter] of Object.entries(BULLET_OR_LETTER)) {
    out = out
      .replace(new RegExp(`(^|\\n)([ \\t]*)${glyph}[ \\t]*`, 'gu'), '$1$2• ')
      .split(glyph)
      .join(letter);
  }
  // The Symbol font's own characters: a Greek letter anywhere, and its
  // operators, relations and arrows where maths is written, beside a
  // number, a sign or a letter standing alone ("x \uF0B9 y"). Anything
  // else from the private-use area has no reading, and is dropped.
  out = out.replace(/[\uE000-\uF8FF]/gu, (glyph, at: number, all: string) => {
    const code = glyph.codePointAt(0)! - 0xf000;
    if (code >= 0x30 && code <= 0x39) return String(code - 0x30);
    const drawn = SYMBOL_FONT[code];
    if (!drawn) return '';
    if (/\p{L}/u.test(drawn)) return drawn;
    return mathsAround(all, at) ? drawn : '';
  });
  return (
    out
      // "1998?99": a range, as the author wrote it; never a minus.
      .replace(/(?<=\p{N})\uFFFD(?=\p{N})/gu, '–')
      // "pre?operative": a hyphen.
      .replace(/(?<=\p{L})\uFFFD(?=\p{L})/gu, '-')
      // "? The incidence": the bullet that began the line.
      .replace(/(^|\n)[ \t]*\uFFFD[ \t]*/g, '$1• ')
      .split(REPLACEMENT)
      .join('')
      .replace(/[ \t]{2,}/g, ' ')
  );
}
