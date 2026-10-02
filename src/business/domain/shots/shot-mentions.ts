/**
 * Where a scene's narration names what its registry holds (research §3.2:
 * each change on the words that name it). The board's pace, its fills and
 * its counts are held to these:
 *
 *  - a place, a seam or a date by its name;
 *  - a person by their name, or their last name;
 *  - a region by its name, its adjective ("northern" for the North), or
 *    the side of the show's map it lies on when no region is named for
 *    that side ("southern" leaders are the regions south of the map's
 *    middle: in a Nigeria of North, West and East, the West's and the
 *    East's), from the regions' own points, never a default;
 *  - a number said in figures ("1,393") or in words ("three").
 */
import { numbersIn } from '../scene-chart';
import { keysOf, type Narration } from './shot-phrases';
import { looseKey, splitTarget } from './shot-registry';
import type { RegistryEntry, TargetRegistry } from './types';

/** Words of the narration that name a registry entry: from key `at`, `length` keys. */
export interface Mention {
  at: number;
  length: number;
  entry: RegistryEntry;
}

const SMALL: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALE: Readonly<Record<string, number>> = {
  hundred: 100,
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
};

/**
 * The numbers a narration says, each at its words: in figures ("1,393"
 * is 1393, at its one word) or in words ("three", "twenty one", and with
 * a scale after it, "three million" is 3 and 3,000,000).
 */
export function numbersSaid(
  n: Narration,
): { at: number; length: number; value: number }[] {
  const out: { at: number; length: number; value: number }[] = [];
  n.words.forEach((word, w) => {
    const values = numbersIn(word);
    if (!values.length) return;
    const at = n.of.indexOf(w);
    if (at < 0) return;
    const length = n.of.filter((x) => x === w).length;
    for (const value of values) out.push({ at, length, value });
  });
  for (let k = 0; k < n.keys.length; k += 1) {
    const key = n.keys[k];
    let value: number | null = null;
    let length = 1;
    if (TENS[key] !== undefined) {
      value = TENS[key];
      const units = SMALL[n.keys[k + 1] ?? ''];
      if (units !== undefined && units > 0 && units < 10) {
        value += units;
        length = 2;
      }
    } else if (SMALL[key] !== undefined) value = SMALL[key];
    if (value === null) continue;
    out.push({ at: k, length, value });
    const scale = SCALE[n.keys[k + length] ?? ''];
    if (scale) out.push({ at: k, length: length + 1, value: value * scale });
  }
  return out.sort((a, b) => a.at - b.at || a.length - b.length);
}

type Side = 'north' | 'south' | 'east' | 'west';
const COMPASS: Readonly<Record<string, Side>> = {
  north: 'north',
  northern: 'north',
  northerners: 'north',
  south: 'south',
  southern: 'south',
  southerners: 'south',
  east: 'east',
  eastern: 'east',
  easterners: 'east',
  west: 'west',
  western: 'west',
  westerners: 'west',
};

/** The regions on a side of the show's map, from their own points: north of their middle, south, east or west. */
function regionsToward(
  side: Side,
  regions: readonly RegistryEntry[],
): RegistryEntry[] {
  const placed = regions.filter((r) => r.geo);
  if (placed.length < 2) return [];
  const lat = placed.reduce((s, r) => s + r.geo!.lat, 0) / placed.length;
  const lng = placed.reduce((s, r) => s + r.geo!.lng, 0) / placed.length;
  return placed.filter((r) =>
    side === 'north'
      ? r.geo!.lat > lat
      : side === 'south'
        ? r.geo!.lat < lat
        : side === 'east'
          ? r.geo!.lng > lng
          : r.geo!.lng < lng,
  );
}

/** Every place in a narration where a registry entry is named, in order of the words. */
export function mentionsOf(n: Narration, registry: TargetRegistry): Mention[] {
  const entries = registry.entries();
  const regions = entries.filter((e) => e.kind === 'region');
  const out: Mention[] = [];
  const find = (keys: readonly string[], entry: RegistryEntry) => {
    if (!keys.length) return;
    for (let at = 0; at + keys.length <= n.keys.length; at += 1)
      if (keys.every((k, i) => n.keys[at + i] === k))
        out.push({ at, length: keys.length, entry });
  };
  const said = numbersSaid(n);
  for (const entry of entries) {
    const { rest } = splitTarget(entry.name);
    switch (entry.kind) {
      case 'place':
      case 'seam':
      case 'date':
        find(keysOf(rest), entry);
        break;
      case 'person': {
        const keys = keysOf(rest);
        find(keys, entry);
        const last = keys[keys.length - 1];
        if (keys.length > 1 && last && last.length >= 4) find([last], entry);
        break;
      }
      case 'region': {
        const names = new Set(
          [
            keysOf(rest).join(' '),
            looseKey(rest),
            ...(entry.aliases ?? []),
          ].filter(Boolean),
        );
        for (const name of names) {
          const keys = name.split(' ');
          find(keys, entry);
          // Its adjective ("northern" for the North), and a compass word
          // its name begins with, when no other region's does ("the East"
          // for East Germany).
          if (keys.length === 1) find([`${keys[0]}ern`], entry);
          else if (
            COMPASS[keys[0]] &&
            regions.filter(
              (r) =>
                looseKey(splitTarget(r.name).rest).split(' ')[0] === keys[0],
            ).length === 1
          ) {
            find([keys[0]], entry);
            find([`${keys[0]}ern`], entry);
          }
        }
        break;
      }
      case 'number':
        for (const one of said)
          if (entry.value !== undefined && one.value === entry.value)
            out.push({ at: one.at, length: one.length, entry });
        break;
    }
  }
  // A side of the map no region is named for: the regions on that side.
  const named = new Set(
    regions.flatMap((r) =>
      [looseKey(splitTarget(r.name).rest), ...(r.aliases ?? [])].flatMap((a) =>
        a.split(' '),
      ),
    ),
  );
  n.keys.forEach((key, at) => {
    const side = COMPASS[key];
    if (!side || named.has(side)) return;
    for (const entry of regionsToward(side, regions))
      out.push({ at, length: 1, entry });
  });
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.at - b.at || b.length - a.length)
    .filter((m) => {
      const key = `${m.at}:${m.entry.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
