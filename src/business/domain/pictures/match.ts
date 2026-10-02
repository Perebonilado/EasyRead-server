/**
 * Who and where a picture is of (research §3.5: "people are resolved only
 * by QID"). A person is taken as Wikidata's only when the name matches
 * and at least one of the research's facts does too: a year in their
 * life, who they were, or where. A namesake whose life the research's
 * years fall outside is never them. Two people of one name are told apart
 * by the facts (Richard, 2026-10-02): the one alive in the research's
 * years before one whose dates nobody knows, and either before one who
 * had died by then (Princess Alexandra of Kent at Nigeria's independence
 * in 1960, not her great-aunt the Duchess of Fife, who died in 1959;
 * RCA's David Sarnoff, not a coach of that name with no dates); then the
 * one whose description holds more of the research's words for them. Two
 * people the facts still cannot tell apart are no one: a wrong face is
 * worse than no face, and the board then shows the person's trace. A
 * place is taken only by its name and, where the show's map knows it,
 * its point. Pure.
 */
import type { PictureQuery, WikiItem, WikiPerson } from './types';

/** Titles a name may carry that are not the name. */
const HONORIFICS = new Set([
  'sir',
  'dame',
  'dr',
  'doctor',
  'chief',
  'alhaji',
  'alhaja',
  'lord',
  'lady',
  'mr',
  'mrs',
  'ms',
  'miss',
  'prof',
  'professor',
  'rev',
  'reverend',
  'saint',
  'st',
  'sheikh',
  'hon',
  'honourable',
  'honorable',
  'general',
  'gen',
  'colonel',
  'col',
  'captain',
  'capt',
  'major',
  'president',
  'premier',
  'king',
  'queen',
  'prince',
  'princess',
  'emir',
  'mallam',
  'malam',
]);

/** Words of a role or a description that tell nobody apart. */
const COMMON = new Set([
  'the',
  'and',
  'with',
  'from',
  'into',
  'for',
  'who',
  'their',
  'his',
  'her',
  'its',
  'that',
  'this',
  'leader',
  'leaders',
  'figure',
  'person',
  'people',
  'member',
  'members',
  'bridge',
  'pressing',
  'earlier',
  'faster',
  'managing',
  'advocate',
  'strategist',
  'settlement',
  'timetable',
  'unity',
  'self',
  'government',
]);

/** A name's words, accents and punctuation gone, its titles and ordinals off. */
export function nameWords(name: string): string[] {
  return name
    .split(',')[0]
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/u)
    .filter(
      (w) => w && !HONORIFICS.has(w) && !/^\d+(?:st|nd|rd|th)?$/u.test(w),
    );
}

/** Any words as the matches read them: accents and punctuation gone, lower case (a description, a title, a claim). */
export function textWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Whether two names are one person's: the same words; or the shorter's
 * first and last words in the longer, in order (a middle name left out, a
 * title added). A single word is a name only when it is the whole name.
 */
export function sameName(a: string, b: string): boolean {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return false;
  if (x.join(' ') === y.join(' ')) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 2) return false;
  if (short[short.length - 1] !== long[long.length - 1]) return false;
  // Every word of the shorter, in order, in the longer.
  let at = 0;
  for (const word of short) {
    at = long.indexOf(word, at);
    if (at < 0) return false;
    at += 1;
  }
  return true;
}

/** The words that say something, each cut to its stem's first six letters ("Nigerian" and "Nigeria" are one). */
export function stems(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 4 && !COMMON.has(w))
      .map((w) => w.slice(0, 6)),
  );
}

const overlaps = (a: Set<string>, b: Set<string>) =>
  [...a].some((w) => b.has(w));

/** How a person's life stands to the research's years: in it, unknown (no dates, or no years asked), or only just after it. */
export type LifeFit = 'alive' | 'unknown' | 'after';

/** How many years after a death the research's years may still be of that life (a funeral, a legacy). */
const AFTER_DEATH = 2;

/**
 * The facts a candidate shares with the research, and whether any rules
 * them out. Their years agree when one of the research's years falls in
 * their grown life; a year in the two after their death rules nobody out
 * (a claim may tell of a legacy) but is no fact for them either.
 */
export function factsOf(
  query: Pick<PictureQuery, 'years' | 'role' | 'place'>,
  person: WikiPerson,
): {
  matched: ('years' | 'role' | 'place')[];
  ruledOut?: string;
  life: LifeFit;
} {
  const matched: ('years' | 'role' | 'place')[] = [];
  const years = [...(query.years ?? [])].filter(Number.isFinite);
  let life: LifeFit = 'unknown';
  if (years.length && person.born) {
    // Grown up by then, and not long dead: the research's years are of their life.
    const from = person.born + 12;
    const died = person.died ?? Infinity;
    const outside = years.filter((y) => y < from || y > died + AFTER_DEATH);
    if (outside.length)
      return {
        matched,
        ruledOut: `${outside.join(', ')} is outside ${person.label}'s life (${person.born}–${person.died ?? ''})`,
        life: 'after',
      };
    life = years.some((y) => y >= from && y <= died) ? 'alive' : 'after';
    if (life === 'alive') matched.push('years');
  }
  const role = stems(query.role ?? '');
  if (
    role.size &&
    overlaps(role, stems([person.description, ...person.roles].join(' ')))
  )
    matched.push('role');
  const places = [query.place ?? []].flat().filter(Boolean);
  if (
    places.length &&
    overlaps(
      stems(places.join(' ')),
      stems([person.description, ...person.places].join(' ')),
    )
  )
    matched.push('place');
  return { matched, life };
}

/** How many of the research's words for a person (their role, their places) what Wikidata says of them holds. */
export function fitOf(
  query: Pick<PictureQuery, 'role' | 'place'>,
  person: WikiPerson,
): number {
  const asked = stems(
    [query.role ?? '', ...[query.place ?? []].flat()].join(' '),
  );
  const said = stems(
    [person.description, ...person.roles, ...person.places].join(' '),
  );
  return [...asked].filter((w) => said.has(w)).length;
}

/**
 * The weight of a candidate's facts: a year in their life counts double
 * (dates are the surest of them), who they were and where once each, and
 * a death before every one of the research's years against them.
 */
function weightOf(one: {
  matched: readonly ('years' | 'role' | 'place')[];
  life: LifeFit;
}): number {
  return (
    one.matched.reduce((n, fact) => n + (fact === 'years' ? 2 : 1), 0) +
    (one.life === 'after' ? -2 : 0)
  );
}

export type PersonMatch =
  | {
      qid: string;
      person: WikiPerson;
      facts: ('years' | 'role' | 'place')[];
    }
  | { qid: null; reason: string };

/**
 * The one person Wikidata has who is the research's: a human of that
 * name sharing a fact with the research, and no other whose facts weigh
 * as much and whose description fits as well.
 */
export function matchPerson(
  query: Pick<PictureQuery, 'name' | 'qid' | 'years' | 'role' | 'place'>,
  found: readonly WikiPerson[],
): PersonMatch {
  const named = found.filter(
    (p) =>
      p.human &&
      (sameName(query.name, p.label) ||
        p.aliases.some((a) => sameName(query.name, a))),
  );
  if (query.qid) {
    const given = named.find((p) => p.qid === query.qid);
    if (!given)
      return {
        qid: null,
        reason: `${query.qid} is not a person called ${query.name}`,
      };
    const { matched, ruledOut } = factsOf(query, given);
    if (ruledOut) return { qid: null, reason: ruledOut };
    return { qid: given.qid, person: given, facts: matched };
  }
  if (!named.length)
    return { qid: null, reason: `no person called ${query.name} on Wikidata` };
  const judged = named
    .map((person) => ({ person, ...factsOf(query, person) }))
    .filter((one) => !one.ruledOut);
  if (!judged.length)
    return {
      qid: null,
      reason: `everyone called ${query.name} lived at another time`,
    };
  // The best by its facts (a year in their life the surest), then by how
  // much of the research's words for them Wikidata's description holds.
  const withFacts = judged
    .filter((one) => one.matched.length > 0)
    .map((one) => ({
      ...one,
      weight: weightOf(one),
      fit: fitOf(query, one.person),
    }))
    .sort((a, b) => b.weight - a.weight || b.fit - a.fit);
  if (!withFacts.length)
    return {
      qid: null,
      reason: `${query.name} matched by name only: no year, role or place agrees`,
    };
  if (
    withFacts.length > 1 &&
    withFacts[1].weight === withFacts[0].weight &&
    withFacts[1].fit === withFacts[0].fit
  )
    return {
      qid: null,
      reason: `${withFacts.length} people called ${query.name} fit the research equally (${withFacts
        .slice(0, 3)
        .map((w) => w.person.qid)
        .join(', ')})`,
    };
  const best = withFacts[0];
  return { qid: best.person.qid, person: best.person, facts: best.matched };
}

/** Kilometres between two points on the earth. */
export function kmBetween(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How near a place on the map must be to Wikidata's to be the same place. */
const SAME_PLACE_KM = 120;

export type ItemMatch =
  { qid: string; item: WikiItem } | { qid: null; reason: string };

/**
 * The one place Wikidata has that is the research's: of that name, at the
 * map's point when the map knows it (Lagos in Nigeria, not Lagos in
 * Portugal); else the only one of that name whose description names one of
 * the research's places.
 */
export function matchPlace(
  query: Pick<PictureQuery, 'name' | 'qid' | 'geo' | 'place'>,
  found: readonly WikiItem[],
): ItemMatch {
  const named = found.filter(
    (i) =>
      i.qid === query.qid ||
      sameName(query.name, i.label) ||
      nameWords(query.name).join(' ') === nameWords(i.label).join(' ') ||
      i.aliases.some(
        (a) => nameWords(a).join(' ') === nameWords(query.name).join(' '),
      ),
  );
  if (!named.length)
    return { qid: null, reason: `no place called ${query.name} on Wikidata` };
  if (query.geo) {
    const near = named
      .filter((i) => i.geo)
      .map((i) => ({ i, km: kmBetween(query.geo!, i.geo!) }))
      .filter((n) => n.km <= SAME_PLACE_KM)
      .sort((a, b) => a.km - b.km);
    if (!near.length)
      return { qid: null, reason: `no ${query.name} near the map's point` };
    return { qid: near[0].i.qid, item: near[0].i };
  }
  const places = stems([query.place ?? []].flat().join(' '));
  const placed = places.size
    ? named.filter((i) => overlaps(places, stems(i.description)))
    : named;
  if (placed.length === 1) return { qid: placed[0].qid, item: placed[0] };
  return {
    qid: null,
    reason: placed.length
      ? `${placed.length} places called ${query.name}`
      : `no ${query.name} in ${[query.place ?? []].flat().join(', ') || 'the research'}`,
  };
}
