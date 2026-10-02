/**
 * Pictures for the Wall's scene (shot-subjects', shot-check's and
 * shot-board's specs): a portrait of Reagan and another photo of him, a
 * photo of Berlin, and a photo of the night the Wall opened, as the
 * picture desk would offer them (`shows` on each photo), with one photo
 * that says nothing of what it shows, read by its own words.
 */
import type { RegistryEntry } from '../types';

const picture = (
  asset: string,
  kind: 'photo' | 'portrait' = 'photo',
): NonNullable<RegistryEntry['picture']> => ({
  asset,
  credit: 'Archive · Wikimedia Commons',
  url: `api/v1/studio/pictures/${asset}`,
  width: 1600,
  height: 1200,
  kind,
});

export const REAGAN_PORTRAIT: RegistryEntry = {
  name: 'person:Ronald Reagan',
  kind: 'person',
  about: 'President of the United States',
  picture: picture('reagan', 'portrait'),
};

export const REAGAN_AT_THE_GATE: RegistryEntry = {
  name: 'photo:Reagan at the Brandenburg Gate 1987',
  kind: 'photo',
  about: 'Reagan speaking at the Brandenburg Gate, 1987 (Wikimedia Commons)',
  picture: picture('reagan-gate'),
  shows: { kind: 'person', name: 'person:Ronald Reagan' },
};

export const BERLIN_1961: RegistryEntry = {
  name: 'photo:Berlin 1961',
  kind: 'photo',
  about: 'Berlin in 1961 (Wikimedia Commons)',
  picture: picture('berlin'),
  shows: { kind: 'place', name: 'place:Berlin' },
};

export const WALL_OPENS: RegistryEntry = {
  name: 'photo:Crowds on the Wall 1989',
  kind: 'photo',
  about: 'people on the Wall the night it opened, 1989 (Wikimedia Commons)',
  picture: picture('wall-opens'),
  shows: { kind: 'event', name: 'the Wall opened' },
};

/** A photo with no `shows`: read by its words, Berlin's. */
export const BERLIN_UNSAID: RegistryEntry = {
  name: 'photo:Street in Berlin 1963',
  kind: 'photo',
  about: 'an archive photo of Berlin, 1963 (Wikimedia Commons)',
  picture: picture('berlin-street'),
};

export const WALL_PICTURES: RegistryEntry[] = [
  REAGAN_PORTRAIT,
  REAGAN_AT_THE_GATE,
  BERLIN_1961,
  WALL_OPENS,
];
