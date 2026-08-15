import { ValidationError } from '../errors/errors';
import { MAX_NOTE_QUOTE, noteBody, noteQuote, notePage } from './notes';

/**
 * The whole risk surface of a note is that it is the one thing here the
 * reader wrote themselves: losing it, or silently changing it, is worse than
 * any other bug in the feature. These tests pin down what tidying is allowed.
 */
describe('noteBody', () => {
  it('keeps the writing exactly as written', () => {
    const written = 'ADH opens the tap.\nNo ADH, no water back.';
    expect(noteBody(written)).toBe(written);
  });

  it('keeps deliberate paragraph breaks but collapses runs', () => {
    expect(noteBody('one\n\ntwo')).toBe('one\n\ntwo');
    expect(noteBody('one\n\n\n\ntwo')).toBe('one\n\ntwo');
  });

  it('drops the trailing whitespace a textarea leaves behind', () => {
    expect(noteBody('  a line   \n\n  ')).toBe('a line');
    expect(noteBody('line one   \nline two')).toBe('line one\nline two');
  });

  it('normalises CRLF so a pasted note is not double-spaced', () => {
    expect(noteBody('one\r\ntwo')).toBe('one\ntwo');
  });

  it('refuses a note with nothing in it', () => {
    expect(() => noteBody('   \n  ')).toThrow(ValidationError);
    expect(() => noteBody('')).toThrow(ValidationError);
  });

  it('refuses a note past the cap rather than truncating it', () => {
    expect(() => noteBody('x'.repeat(5001))).toThrow(ValidationError);
    expect(noteBody('x'.repeat(5000))).toHaveLength(5000);
  });
});

describe('noteQuote', () => {
  it('collapses a selection onto one line', () => {
    expect(noteQuote('the  thick\n ascending   limb')).toBe(
      'the thick ascending limb',
    );
  });

  it('trims a long selection instead of failing the save', () => {
    const quote = noteQuote('word '.repeat(400));
    expect(quote).not.toBeNull();
    expect(quote!.length).toBeLessThanOrEqual(MAX_NOTE_QUOTE + 1);
    expect(quote!.endsWith('…')).toBe(true);
  });

  it('treats an empty selection as no selection', () => {
    expect(noteQuote('   ')).toBeNull();
    expect(noteQuote(null)).toBeNull();
    expect(noteQuote(undefined)).toBeNull();
  });
});

describe('notePage', () => {
  it('keeps a real page', () => {
    expect(notePage(12)).toBe(12);
    expect(notePage(12, 40)).toBe(12);
  });

  it('treats no page as a real answer, not an error', () => {
    expect(notePage(null)).toBeNull();
    expect(notePage(undefined)).toBeNull();
  });

  it('drops a page the document does not have', () => {
    expect(notePage(900, 40)).toBeNull();
    expect(notePage(0)).toBeNull();
    expect(notePage(-3)).toBeNull();
    expect(notePage(2.5)).toBeNull();
  });
});
