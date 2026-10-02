/**
 * Eras read from words as a time, never as a place (ported with
 * ig-illustrated's scene-eras.ts, whose cases these are).
 */
import { ERA_IDS, eraOf, eraOfYear, isPast, yearsIn } from './eras';

describe('an era read from words', () => {
  it.each([
    ['the 1950s', '1945-1975'],
    ['1960', '1945-1975'],
    ["the '60s", '1945-1975'],
    ['the fifties', '1945-1975'],
    ['1945–1975', '1945-1975'],
    ['today', 'today'],
    ['Victorian', '1800-1900'],
    ['the late 19th century', '1800-1900'],
    ['the 1800s', '1800-1900'],
    ['colonial', '1900-1945'],
    ['the First World War', '1900-1945'],
    ['1914–1918', '1900-1945'],
    ['the 1980s', '1975-2000'],
    ['the 2010s', 'today'],
    ['AD 1200', 'medieval'],
    ['the Mali Empire', 'medieval'],
    ['300 BC', 'ancient'],
    ['the Edo period', '1500-1800'],
    ['1880 to 1960', '1900-1945'],
  ])('reads "%s" as %s', (said, era) => {
    expect(eraOf(said)).toBe(era);
  });

  it('reads nothing from words that say no time, and never a place', () => {
    expect(eraOf('')).toBeNull();
    expect(eraOf('once upon a time')).toBeNull();
    expect(eraOf('Lagos, Nigeria')).toBeNull();
    expect(eraOf(42)).toBeNull();
  });

  it('reads years, decades and centuries as years', () => {
    expect(yearsIn('in 1953')).toEqual([1953]);
    expect(yearsIn('the 1950s')).toEqual([1955]);
    expect(yearsIn('300 BC')).toEqual([-300]);
  });

  it('puts every year in one era', () => {
    expect(eraOfYear(-3000)).toBe('ancient');
    expect(eraOfYear(1066)).toBe('medieval');
    expect(eraOfYear(1946)).toBe('1945-1975');
    expect(eraOfYear(2026)).toBe('today');
    expect(ERA_IDS).toHaveLength(8);
    expect(isPast('today')).toBe(false);
    expect(isPast('1800-1900')).toBe(true);
  });
});
