/**
 * A scene's target registry (explainer-animation-tech §4.1): everything
 * the board may name in a scene, and what each name resolves to. The
 * board names; code looks up. A name not here is not on screen: no
 * invented place, no stand-in for a person, no number nobody gave.
 *
 *   place:<Name>   a real place the scene's lines name, or the research
 *                  places an event or a moment of theirs, or a world
 *                  place resting on the research's claims; with a point
 *                  on the map when code can find it (then it may be
 *                  pinned), else named in words only.
 *   region:<Name>  a region of the show's one map; seam:<Name> a seam.
 *   person:<Name>  a real person of the research: a verified portrait
 *                  once the picture desk clears one (WP11); until then
 *                  only a trace of them (their own words, their place).
 *   number:<label> a number of the research, with its value and unit.
 *   date:<when>    an event of the research's timeline.
 *   claim:<id>     a claim the scene's lines rest on.
 *   side:<thing>   a colour of the show's visual system.
 *
 * Global, not regional: nothing here defaults to a country. A place
 * comes from the lines, the research or the world, and is looked up in
 * the map's own data (scene-map-places, Natural Earth's admin-1 areas,
 * world-atlas's countries); a region only from the show's map.
 */
import { feature } from 'topojson-client';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import type { GeometryObject } from 'topojson-specification';
import { numbersIn } from '../scene-chart';
import { groupId } from '../scene-ids';
import { atlasOf, readMapBase, type ShowMapBase } from '../scene-map';
import { naturalAreas } from '../scene-map-data';
import {
  areasNamed,
  countriesNamed,
  placeKey,
  placeNamed,
  placesIn,
  readRegion,
  regionNamed,
  type PlaceKind,
} from '../scene-map-places';
import type {
  EditorClaim,
  EditorResearch,
  EditorWorld,
} from '../studio/studio-editor';
import type { EditorialRow } from '../studio/studio-editorial';
import { clip, line } from './shot-parts';
import { keysOf } from './shot-phrases';
import type { RegistryEntry, TargetKind, TargetRegistry } from './types';

/** The id the scene's map asset goes by: a region's or a seam's feature is of it. */
export const MAP_ASSET = 'map';

/** What a scene's registry is built from. */
export interface RegistryInput {
  /** The scene's lines, with the claims each rests on. */
  rows: readonly Pick<EditorialRow, 'say' | 'claims'>[];
  research: EditorResearch | null;
  world: EditorWorld | null;
  /** Pictures the picture desk cleared (WP11), as entries: a person's portrait, a photo, a document. */
  pictures?: readonly RegistryEntry[];
}

/** The name prefixes, by what they name. */
const PREFIX_OF: Record<string, TargetKind> = {
  place: 'place',
  city: 'place',
  town: 'place',
  location: 'place',
  pin: 'place',
  region: 'region',
  area: 'region',
  group: 'region',
  seam: 'seam',
  border: 'seam',
  person: 'person',
  people: 'person',
  who: 'person',
  number: 'number',
  stat: 'number',
  value: 'number',
  date: 'date',
  when: 'date',
  year: 'date',
  event: 'date',
  claim: 'claim',
  fact: 'claim',
  side: 'side',
  colour: 'side',
  color: 'side',
  photo: 'photo',
  document: 'document',
  part: 'part',
  actor: 'actor',
};

/** A target name's prefix and the name after it: "place: Kano" is place and Kano. */
export function splitTarget(name: string): { prefix: string; rest: string } {
  const m = /^\s*([A-Za-z]+)\s*:\s*(.*)$/u.exec(name);
  return m
    ? { prefix: m[1].toLowerCase(), rest: m[2].trim() }
    : { prefix: '', rest: name.trim() };
}

/** The kind of target a name's prefix says, or null for none. */
export const kindOfPrefix = (prefix: string): TargetKind | null =>
  PREFIX_OF[prefix] ?? null;

/** Words a region's or an area's name carries that do not tell it apart. */
const GENERIC = new Set([
  'the',
  'of',
  'region',
  'regions',
  'state',
  'states',
  'province',
  'area',
  'district',
  'county',
  'territory',
  'zone',
  'part',
]);

/** A name as matched loosely: its words, the generic ones out ("the North" and "North Region" are both "north"). */
export function looseKey(name: string): string {
  const keys = keysOf(name);
  const kept = keys.filter((k) => !GENERIC.has(k));
  return (kept.length ? kept : keys).join(' ');
}

/** A map part's id as the map draws it (scene-map's idFor): "group-north-region", "seam-party-rivalry". */
export const mapPartId = (prefix: string, name: string) =>
  `${prefix}-${groupId(name.normalize('NFD').replace(/\p{M}/gu, '')) || 'x'}`;

// ── Points on the map ─────────────────────────────────────────────────────

type Rings = Position[][];

/** A ring's area (signed) and middle, on the plane of its degrees. */
function ringOf(ring: Position[]): { area: number; x: number; y: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a /= 2;
  if (!a) return { area: 0, x: ring[0]?.[0] ?? 0, y: ring[0]?.[1] ?? 0 };
  return { area: a, x: cx / (6 * a), y: cy / (6 * a) };
}

function inside(ring: Position[], [x, y]: [number, number]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
}

/**
 * A point inside a polygon: its middle when that is inside it, else the
 * middle of its widest stretch along that latitude (a crescent's middle
 * is in the sea; a pin must be on the land).
 */
function pointInside(polygon: Rings): [number, number] | null {
  const outer = polygon[0];
  if (!outer?.length) return null;
  const { x, y } = ringOf(outer);
  if (inside(outer, [x, y])) return [x, y];
  const crossings: number[] = [];
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [xi, yi] = outer[i];
    const [xj, yj] = outer[j];
    if (yi > y !== yj > y)
      crossings.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
  }
  crossings.sort((a, b) => a - b);
  let best: [number, number] | null = null;
  let widest = -1;
  for (let k = 0; k + 1 < crossings.length; k += 2)
    if (crossings[k + 1] - crossings[k] > widest) {
      widest = crossings[k + 1] - crossings[k];
      best = [(crossings[k] + crossings[k + 1]) / 2, y];
    }
  return best ?? [outer[0][0], outer[0][1]];
}

const polygonsOf = (g: Polygon | MultiPolygon | null | undefined): Rings[] =>
  !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;

/** An area's polygons (Natural Earth's admin-1), by its key. */
function areaPolygons(key: string): Rings[] {
  const { topology, byKey } = naturalAreas();
  const i = byKey.get(key);
  if (i === undefined) return [];
  const one = feature(
    topology,
    topology.objects.units.geometries[i] as GeometryObject,
  ) as unknown as { geometry: Polygon | MultiPolygon | null };
  return polygonsOf(one.geometry);
}

/** A country's polygons (world-atlas, 1:50m). */
const countryPolygons = (name: string): Rings[] =>
  polygonsOf(atlasOf('50m').byName.get(name)?.geometry);

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * A point for land made of polygons: inside its biggest piece when it
 * is one piece of land with islands; for several areas side by side (a
 * region of states), their middle weighted by size.
 */
function landPoint(pieces: Rings[][]): { lng: number; lat: number } | null {
  const parts = pieces
    .map((polygons) => {
      const biggest = polygons
        .map((p) => ({ p, area: Math.abs(ringOf(p[0] ?? []).area) }))
        .sort((a, b) => b.area - a.area)[0];
      const at = biggest ? pointInside(biggest.p) : null;
      return at && biggest
        ? {
            at,
            area: polygons.reduce(
              (n, p) => n + Math.abs(ringOf(p[0] ?? []).area),
              0,
            ),
          }
        : null;
    })
    .filter((p): p is { at: [number, number]; area: number } => p !== null);
  if (!parts.length) return null;
  if (parts.length === 1)
    return { lng: round(parts[0].at[0]), lat: round(parts[0].at[1]) };
  const total = parts.reduce((n, p) => n + p.area, 0) || 1;
  return {
    lng: round(parts.reduce((n, p) => n + p.at[0] * p.area, 0) / total),
    lat: round(parts.reduce((n, p) => n + p.at[1] * p.area, 0) / total),
  };
}

/** The countries a show's map is of, where areas are looked for. */
function countriesOf(base: ShowMapBase | null): string[] {
  if (!base) return [];
  const region = readRegion(base.region).region;
  if (!region || region.kind === 'world') return [];
  return region.kind === 'countries'
    ? region.countries
    : [...region.entry.members];
}

const KIND_WORDS: Record<PlaceKind, string> = {
  city: 'a city',
  capital: 'a capital',
  mountain: 'a mountain',
  landmark: 'a landmark',
  river: 'a river',
  lake: 'a lake',
  sea: 'a sea',
  area: 'an area',
};

/** Where a place is, as code finds it: a point, and a few words of what it is. */
function locate(
  name: string,
  within: readonly string[],
): { geo: { lng: number; lat: number } | null; about: string } {
  const place = placeNamed(name);
  if (place)
    return {
      geo: { lng: round(place.lon), lat: round(place.lat) },
      about: `${KIND_WORDS[place.kind]}${place.country ? ` in ${place.country}` : ''}`,
    };
  const areas = areasNamed(name, within);
  if (areas) {
    const geo = landPoint(areas.keys.map(areaPolygons));
    if (geo)
      return { geo, about: `an area of ${areas.countries.join(' and ')}` };
  }
  const countries = countriesNamed(name);
  if (countries.length) {
    const geo = landPoint(countries.map(countryPolygons));
    if (geo)
      return { geo, about: countries.length > 1 ? 'countries' : 'a country' };
  }
  // "Federal House, Lagos": a place in a place the map knows is pinned there.
  const comma = name.lastIndexOf(',');
  if (comma > 0) {
    const tail = name.slice(comma + 1).trim();
    const there = locate(tail, within);
    if (there.geo) return { geo: there.geo, about: `in ${tail}` };
  }
  return { geo: null, about: 'not on the map: name it in words, never pin it' };
}

/** A region of the show's map: a point in the middle of its areas and countries. */
function regionPoint(
  members: readonly string[],
  within: readonly string[],
): { lng: number; lat: number } | null {
  const pieces: Rings[][] = [];
  for (const member of members) {
    const areas = areasNamed(member, within);
    if (areas) for (const key of areas.keys) pieces.push(areaPolygons(key));
    else
      for (const country of countriesNamed(member))
        pieces.push(countryPolygons(country));
  }
  return landPoint(pieces.filter((p) => p.length));
}

// ── The places a scene's lines name ───────────────────────────────────────

/** A run of capitalised words, joined by the small words of a name: "Addis Ababa", "Gulf of Guinea". */
const RUN =
  /\p{Lu}[\p{L}\p{M}’'.-]*(?:\s+(?:of\s+|de\s+|da\s+|the\s+)?\p{Lu}[\p{L}\p{M}’'.-]*){0,3}/gu;

/**
 * The real places a line names, by the map's own names: the places,
 * countries and parts of countries it knows by heart (placesIn), and any
 * capitalised name its data holds (Natural Earth's cities). A word that
 * starts a sentence is a place only when the show already knows it ("May
 * this…" is not the month's city); a person's name is never a place.
 */
function linePlaces(
  text: string,
  known: ReadonlySet<string>,
  people: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const keep = (name: string) => {
    const key = placeKey(name);
    if (!key || people.has(key)) return;
    if (!out.some((o) => placeKey(o) === key)) out.push(name);
  };
  for (const found of placesIn(text)) {
    // A continent or a part of the world frames a map; it is no pin.
    if (found.kind === 'region') continue;
    const name =
      found.kind === 'country'
        ? (countriesNamed(found.name)[0] ?? found.name)
        : (placeNamed(found.name)?.name ?? titled(found.name));
    keep(name);
  }
  for (const m of text.matchAll(RUN)) {
    const words = m[0]
      .split(/\s+/u)
      .map((w) => w.replace(/[’'`]s$/u, '').replace(/[.,;:]+$/u, ''));
    const starts =
      (m.index ?? 0) === 0 ||
      /[.!?:;"“]\s*$/u.test(text.slice(0, m.index ?? 0));
    let found = false;
    for (let n = words.length; n >= 1 && !found; n -= 1)
      for (let s = 0; s + n <= words.length && !found; s += 1) {
        const said = words.slice(s, s + n).join(' ');
        const key = placeKey(said);
        if (!key || people.has(key)) continue;
        if (starts && s === 0 && !known.has(key)) continue;
        // A country's name is the country (placesIn's), never a city or a
        // station listed under it ("Germany" is not Neumayer Station III).
        if (countriesNamed(said).length || regionNamed(said)) continue;
        const place = placeNamed(said);
        if (!place) continue;
        keep(place.name);
        found = true;
      }
  }
  return out;
}

const titled = (key: string) =>
  key.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

// ── Numbers and dates ─────────────────────────────────────────────────────

const MONTHS =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/iu;

/** Whether a value is a date, not a quantity: "1 October 1960", "March 1959", "1960". */
export function isDateLike(value: string): boolean {
  const said = value.trim();
  if (MONTHS.test(said) && numbersIn(said).length) return true;
  return /^(?:c\.\s*|circa\s+|in\s+)?\d{3,4}(?:s|\s*(?:bc|bce|ad|ce))?$/iu.test(
    said,
  );
}

/** A year-like number: what a quantity's first number should not be when another is there. */
const yearLike = (n: number) => Number.isInteger(n) && n >= 1000 && n <= 2100;

/**
 * A quantity's value and unit, as written: "134 of 312" is 134 "of 312",
 * "45 million" 45 "million", "70%" 70 "%". The first number that is no
 * year, when there is one.
 */
export function quantityOf(
  said: string,
): { value: number; unit: string } | null {
  const matches = [
    ...said.matchAll(/-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/gu),
  ].map((m) => ({
    value: Number(m[0].replace(/,/gu, '')),
    end: (m.index ?? 0) + m[0].length,
  }));
  const chosen = matches.find((m) => !yearLike(m.value)) ?? matches[0] ?? null;
  if (!chosen || !Number.isFinite(chosen.value)) return null;
  const after = said.slice(chosen.end).trim();
  const unit = after.startsWith('%')
    ? '%'
    : after
        .split(/\s+/u)
        .slice(0, 2)
        .join(' ')
        .replace(/[.,;:]+$/u, '');
  return { value: chosen.value, unit };
}

/** The year a date says, when it says one. */
const yearOf = (said: string): number | undefined =>
  numbersIn(said).find(yearLike);

// ── The registry ──────────────────────────────────────────────────────────

/** A registry of what a scene may name, from its stored entries. */
export function registryOf(entries: readonly RegistryEntry[]): TargetRegistry {
  const all = entries.map((e) => ({ ...e }));
  const byName = new Map(all.map((e) => [e.name, e]));
  const keyed = all.map((entry) => {
    const { rest } = splitTarget(entry.name);
    return {
      entry,
      key: keysOf(rest).join(' '),
      loose: new Set([looseKey(rest), ...(entry.aliases ?? [])]),
      last: keysOf(rest).at(-1) ?? '',
    };
  });
  const only = (hits: RegistryEntry[]) =>
    hits.length === 1 ? hits[0] : hits.length ? null : undefined;
  return {
    entries: () => all.map((e) => ({ ...e })),
    resolve(name: string): RegistryEntry | null {
      if (typeof name !== 'string' || !name.trim()) return null;
      const exact = byName.get(name.trim());
      if (exact) return exact;
      const { prefix, rest } = splitTarget(name);
      const kind = kindOfPrefix(prefix);
      // A shot's own parts and actors are the shot's, not the scene's.
      if (kind === 'part' || kind === 'actor') return null;
      // "c16", "claim:16": the claim it is.
      const claimId = /^c?(\d{1,4})$/iu.exec(rest);
      if (claimId && (kind === 'claim' || !kind)) {
        const claim = byName.get(`claim:c${claimId[1]}`);
        if (claim) return claim;
      }
      const key = keysOf(rest).join(' ');
      const loose = looseKey(rest);
      if (!key) return null;
      // A colour is named as a side, never found by a target's name; a
      // claim by its id alone.
      const anyKind = (k: (typeof keyed)[number]) =>
        k.entry.kind !== 'side' && k.entry.kind !== 'claim';
      const ofKind = (k: (typeof keyed)[number]) =>
        kind ? k.entry.kind === kind : anyKind(k);
      // The same name, of its kind; then loosely; then of any kind, once.
      const tries: ((k: (typeof keyed)[number]) => boolean)[] = [
        (k) => ofKind(k) && k.key === key,
        (k) => ofKind(k) && k.loose.has(loose),
        (k) => anyKind(k) && k.key === key,
        (k) => anyKind(k) && k.loose.has(loose),
        // A person by their last name alone, when only one has it.
        (k) =>
          k.entry.kind === 'person' &&
          (!kind || kind === 'person') &&
          key.split(' ').length === 1 &&
          k.last === key &&
          key.length >= 4,
        // A region by its first word, when only one has it: "the East" is East Germany.
        (k) =>
          k.entry.kind === 'region' &&
          (!kind || kind === 'region' || kind === 'place') &&
          loose.split(' ').length === 1 &&
          looseKey(splitTarget(k.entry.name).rest).split(' ')[0] === loose,
      ];
      for (const test of tries) {
        const hit = only(keyed.filter(test).map((k) => k.entry));
        if (hit) return hit;
        if (hit === null) return null;
      }
      return null;
    },
  };
}

/** A scene's registry, built from its lines, the research and the world. */
export function buildRegistry(input: RegistryInput): TargetRegistry {
  const { rows, research, world } = input;
  const entries: RegistryEntry[] = [];
  const add = (entry: RegistryEntry) => {
    const had = entries.find((e) => e.name === entry.name);
    if (!had) entries.push(entry);
    return had ?? entry;
  };
  const claims = new Map<string, EditorClaim>(
    (research?.claims ?? [])
      .filter((c) => c.status !== 'cut')
      .map((c) => [c.id, c]),
  );
  const real = (ids: readonly string[]) => ids.filter((id) => claims.has(id));
  const sceneClaims = new Set(real(rows.flatMap((r) => r.claims)));
  const here = (ids: readonly string[]) =>
    ids.some((id) => sceneClaims.has(id));
  const said = rows.map((r) => r.say).join(' ');
  const saidKeys = ` ${keysOf(said).join(' ')} `;
  const named = (name: string) => {
    const key = keysOf(name).join(' ');
    return Boolean(key) && saidKeys.includes(` ${key} `);
  };
  const sourceOf = (ids: readonly string[]) =>
    ids.map((id) => claims.get(id)?.sources[0]?.title).find(Boolean) ??
    undefined;
  const base = readMapBase(world?.base);
  const within = countriesOf(base);
  const palette = world?.palette ?? [];
  const tokenOf = (name: string) =>
    palette.find((p) => looseKey(p.thing) === looseKey(name))?.token;

  // The show's map: its regions, each in its colour, and its seams.
  for (const group of base?.groups ?? []) {
    const geo = regionPoint(group.members ?? [], within);
    const colour = group.colour ?? tokenOf(group.name);
    add({
      name: `region:${group.name}`,
      kind: 'region',
      about: 'a region of the show’s map',
      feature: { asset: MAP_ASSET, id: mapPartId('group', group.name) },
      ...(geo ? { geo } : {}),
      ...(colour ? { colour } : {}),
      aliases: [looseKey(group.name)],
    });
  }
  for (const seam of base?.seams ?? []) {
    const name = seam.name || `${seam.between[0]} and ${seam.between[1]}`;
    add({
      name: `seam:${name}`,
      kind: 'seam',
      about: `the border between ${seam.between[0]} and ${seam.between[1]}`,
      feature: { asset: MAP_ASSET, id: mapPartId('seam', name) },
    });
  }
  const regionFor = (name: string) =>
    entries.find(
      (e) => e.kind === 'region' && (e.aliases ?? []).includes(looseKey(name)),
    );

  // People first, so a person's name is never read as a place.
  const people = new Set<string>();
  const personNames = [
    ...(research?.people ?? []).map((p) => p.name),
    ...(world?.people ?? []).map((p) => p.name),
  ];
  for (const name of personNames) {
    people.add(placeKey(name));
    for (const word of name.split(/\s+/u))
      if (word.length >= 3) people.add(placeKey(word));
  }

  // Places: what the research places at an event or a moment of these
  // lines, a world place resting on their claims, and what the lines
  // name. A region of the show's map is the region, not a place.
  const addPlace = (name: string, ids: readonly string[], note = '') => {
    const clean = line(name, 80);
    if (!clean) return null;
    const region = regionFor(clean);
    if (region) {
      region.aliases = [
        ...new Set([...(region.aliases ?? []), looseKey(clean)]),
      ];
      return region;
    }
    const found = locate(clean, within);
    const kept = real(ids);
    return add({
      name: `place:${clean}`,
      kind: 'place',
      about: note ? `${found.about}; ${note}` : found.about,
      ...(kept.length ? { claim: kept[0], claims: kept } : {}),
      ...(found.geo ? { geo: found.geo } : {}),
    });
  };
  const known = new Set<string>();
  const knowAll = (text: string) => {
    for (const m of text.matchAll(RUN)) known.add(placeKey(m[0]));
    for (const word of text.split(/[\s,;]+/u)) known.add(placeKey(word));
  };
  for (const group of base?.groups ?? [])
    for (const member of group.members ?? []) knowAll(member);
  for (const place of world?.places ?? [])
    if (real(place.claims).length) knowAll(place.name);
  for (const event of research?.timeline ?? [])
    if (event.place) knowAll(event.place);
  for (const moment of research?.moments ?? []) knowAll(moment.where);
  for (const claim of claims.values())
    for (const found of placesIn(claim.text)) known.add(found.name);

  for (const event of research?.timeline ?? [])
    if (event.place && (here(event.claims) || named(event.place)))
      addPlace(
        event.place,
        event.claims,
        `${event.date}: ${clip(event.event, 8)}`,
      );
  for (const moment of research?.moments ?? [])
    if (moment.where && (here(moment.claims) || named(moment.where)))
      addPlace(
        moment.where,
        moment.claims,
        `${moment.when}: ${clip(moment.what, 8)}`,
      );
  for (const place of world?.places ?? [])
    if (here(real(place.claims))) addPlace(place.name, place.claims);
  // The country the show's whole map is of is the map itself, not a pin.
  const whole = (name: string) => {
    const countries = countriesNamed(name);
    return (
      countries.length > 0 &&
      countries.length === within.length &&
      countries.every((c) => within.includes(c))
    );
  };
  rows.forEach((row) => {
    for (const name of linePlaces(row.say, known, people))
      if (!whole(name)) addPlace(name, row.claims, 'named in these lines');
  });

  // People: those of the research and the world these lines are about.
  const quotes = [...claims.values()].filter((c) => c.kind === 'quote');
  const addPerson = (
    name: string,
    role: string,
    ids: readonly string[],
    likeness?: string,
  ) => {
    const clean = line(name, 80);
    if (!clean) return;
    // Known already (the research's people come first): the world's likeness added to them.
    const known = entries.find((e) => e.name === `person:${clean}`);
    if (known) {
      if (likeness && !known.likeness) known.likeness = likeness.slice(0, 240);
      return;
    }
    const surname = keysOf(clean).at(-1) ?? '';
    const kept = real(ids);
    const said = named(clean) || (surname.length >= 4 && named(surname));
    if (!said && !here(kept)) return;
    // Their own words, the quote these lines rest on first; else their place.
    const theirs = quotes
      .filter(
        (c) =>
          (c.who && keysOf(c.who).includes(surname)) ||
          keysOf(c.text).join(' ').includes(keysOf(clean).join(' ')),
      )
      .sort(
        (a, b) => Number(sceneClaims.has(b.id)) - Number(sceneClaims.has(a.id)),
      )[0];
    const moment = (research?.moments ?? []).find(
      (m) => m.where && keysOf(m.who).includes(surname),
    );
    let trace: RegistryEntry['trace'];
    if (theirs) {
      add(claimEntry(theirs));
      trace = { kind: 'quote', ref: `claim:${theirs.id}` };
    } else if (moment) {
      const place = addPlace(
        moment.where,
        moment.claims,
        `${moment.when}: ${clip(moment.what, 8)}`,
      );
      if (place?.geo || place?.kind === 'region')
        trace = { kind: 'place', ref: place.name };
    }
    add({
      name: `person:${clean}`,
      kind: 'person',
      about: clip(role, 10) || 'a person of the story',
      ...(kept.length ? { claim: kept[0], claims: kept } : {}),
      ...(trace ? { trace } : {}),
      ...(likeness ? { likeness: likeness.slice(0, 240) } : {}),
    });
  };
  for (const person of research?.people ?? [])
    addPerson(person.name, person.role, person.claims);
  for (const person of world?.people ?? [])
    addPerson(person.name, person.role, person.claims, person.likeness);

  // Numbers: the research's, where these lines rest on them or say them;
  // a number claim of these lines, where it gives one.
  const saidNumbers = new Set(numbersIn(said));
  const values = new Set<number>();
  for (const number of research?.numbers ?? []) {
    const value = line(number.value, 60);
    if (!value || isDateLike(value)) continue;
    const q = quantityOf(value);
    if (!q) continue;
    if (
      !here(number.claims) &&
      !numbersIn(value).some((n) => saidNumbers.has(n))
    )
      continue;
    const kept = real(number.claims);
    values.add(q.value);
    add({
      name: `number:${line(number.label, 60)}`,
      kind: 'number',
      about: `${value}${number.checked ? '' : ' (one source)'}`,
      value: q.value,
      ...(q.unit ? { unit: q.unit } : {}),
      ...(kept.length ? { claim: kept[0], claims: kept } : {}),
      ...(sourceOf(kept) ? { source: sourceOf(kept) } : {}),
    });
  }
  for (const id of sceneClaims) {
    const claim = claims.get(id)!;
    if (claim.kind !== 'number') continue;
    const q = quantityOf(claim.text);
    if (!q || yearLike(q.value) || values.has(q.value)) continue;
    values.add(q.value);
    add({
      name: `number:${claim.id}`,
      kind: 'number',
      about: clip(claim.text, 14),
      value: q.value,
      ...(q.unit ? { unit: q.unit } : {}),
      claim: claim.id,
      claims: [claim.id],
      ...(sourceOf([claim.id]) ? { source: sourceOf([claim.id]) } : {}),
    });
  }

  // Dates: the research's timeline, for a timeline or a calendar.
  for (const event of (research?.timeline ?? []).slice(0, 16)) {
    const when = line(event.date, 40);
    if (!when) continue;
    const kept = real(event.claims);
    const year = yearOf(when);
    const had = entries.find((e) => e.name === `date:${when}`);
    if (had) {
      had.about = clip(`${had.about}; ${event.event}`, 16);
      continue;
    }
    add({
      name: `date:${when}`,
      kind: 'date',
      about: clip(event.event, 10),
      ...(year !== undefined ? { value: year } : {}),
      ...(kept.length ? { claim: kept[0], claims: kept } : {}),
      ...(sourceOf(kept) ? { source: sourceOf(kept) } : {}),
    });
  }

  // Claims: what these lines rest on, in their words.
  for (const id of sceneClaims) add(claimEntry(claims.get(id)!));

  // Sides: the show's colours, by what they colour.
  for (const side of palette) {
    const thing = line(side.thing, 60);
    if (thing)
      add({
        name: `side:${thing}`,
        kind: 'side',
        about: `colour ${side.token}`,
        colour: side.token,
      });
  }

  // Pictures the desk cleared: a portrait on its person, a photo or a document as its own.
  for (const picture of input.pictures ?? []) {
    const had = entries.find((e) => e.name === picture.name);
    if (had && picture.picture) had.picture = picture.picture;
    else if (!had) add({ ...picture });
  }
  return registryOf(entries);

  function claimEntry(claim: EditorClaim): RegistryEntry {
    const source = sourceOf([claim.id]);
    return {
      name: `claim:${claim.id}`,
      kind: 'claim',
      // Its words as the research has them, quotation marks and all.
      about: `${claim.kind}: ${claim.text.replace(/\s+/gu, ' ').trim().slice(0, 320)}`,
      claim: claim.id,
      claims: [claim.id],
      ...(source ? { source } : {}),
    };
  }
}

// ── The registry in the board's prompt ────────────────────────────────────

/** What a scene may name, as the board's prompt lists it: by kind, a line each. */
export function promptList(registry: TargetRegistry): string {
  const all = registry.entries();
  const of = (kind: TargetKind) => all.filter((e) => e.kind === kind);
  const claimsOf = (e: RegistryEntry) =>
    e.claims?.length ? ` · ${e.claims.join(', ')}` : '';
  const sections: string[] = [];
  const section = (title: string, lines: string[]) => {
    if (lines.length) sections.push([title, ...lines].join('\n'));
  };
  section(
    'Places (pin only one marked [pin]; the others are named in words, never pinned):',
    of('place').map(
      (e) => `- ${e.name}${e.geo ? ' [pin]' : ''}: ${e.about}${claimsOf(e)}`,
    ),
  );
  section(
    'Regions of the show’s map (fill, label or push in on them):',
    of('region').map(
      (e) => `- ${e.name}${e.colour ? ` (colour ${e.colour})` : ''}`,
    ),
  );
  section(
    'Seams of the show’s map (draw one with "seam"):',
    of('seam').map((e) => `- ${e.name}: ${e.about}`),
  );
  section(
    'People (a portrait only for one marked [portrait]; a person with neither a portrait nor a trace is never on screen):',
    of('person').map(
      (e) =>
        `- ${e.name}${e.picture ? ' [portrait]' : ''}: ${e.about}${
          e.picture
            ? ''
            : e.trace
              ? ` · no portrait; show their trace: ${e.trace.kind === 'quote' ? `their own words, ${e.trace.ref}` : `their place, ${e.trace.ref}`}`
              : ' · no portrait, no trace: never on screen'
        }`,
    ),
  );
  section(
    'Pictures (archive photos and documents the picture desk cleared):',
    [...of('photo'), ...of('document')].map((e) => `- ${e.name}: ${e.about}`),
  );
  section(
    'Numbers (count or grow them; code writes the value):',
    of('number').map((e) => `- ${e.name}: ${e.about}${claimsOf(e)}`),
  );
  section(
    'Dates (for a timeline or a calendar: these dates and words only):',
    of('date').map((e) => `- ${e.name}: ${e.about}${claimsOf(e)}`),
  );
  section(
    'Claims these lines rest on (every word, number and date on screen comes from them):',
    of('claim').map(
      (e) =>
        `- ${e.name} (${e.about.split(':')[0]}): ${clip(e.about.slice(e.about.indexOf(':') + 1), 40)}`,
    ),
  );
  const sides = of('side');
  if (sides.length)
    sections.push(
      `Colours, for "colour": ${sides.map((e) => `${e.name} (${e.colour})`).join(', ')}; and ink, muted, accent, held.`,
    );
  return (
    sections.join('\n\n') || 'Nothing to name: no map, no people, no numbers.'
  );
}
