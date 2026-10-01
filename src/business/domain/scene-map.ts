/**
 * A map on the stage, drawn by code from real geographic data, as a chart
 * is drawn from the page's own numbers. The writer names the region, the
 * countries to colour, the places to mark and the journeys between them;
 * code looks every one up (scene-map-places) and draws them from Natural
 * Earth's coastlines and borders (world-atlas) with d3-geo, projected to
 * suit the region and fitted to the frame of the film. A model asked to
 * draw a map draws the idea of one, with coastlines and borders where it
 * remembers them; this is the map.
 *
 * Countries are drawn flat in the house tokens (scene-themes): the sea a
 * tint of the second accent, the land shown in the region white, its
 * neighbours muted, borders thin; the highlighted countries in the
 * accent colours, a colour for each group. Each highlight, place and
 * route is a part the voice can point at, and the names are labels the
 * stage sets, placed by the same code as a drawing's (scene-labels).
 *
 * Inside a country it colours areas too (Natural Earth's states and
 * provinces), and merges areas and countries into named regions drawn as
 * one shape each ("the Northern Region" is these states), with the
 * border two regions share drawn as a line of its own (a seam) and pins
 * with a number on a card: each a part. A show's maps are drawn into one
 * frame (the show's base map, frameFor), so a map in one scene lines up
 * exactly with the map in the next and the film carries it across; and a
 * map of the past says, in its corner, that its borders are today's.
 */
import { readFileSync } from 'node:fs';
import { feature, merge, mesh } from 'topojson-client';
import type {
  GeometryCollection,
  GeometryObject,
  Topology,
} from 'topojson-specification';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson';
import type { GeoProjection, GeoStream } from 'd3-geo';
import type { Callout } from './scene-callouts';
import { EXACT_ROOM } from './scene-exact-style';
import { measureText } from './scene-font';
import { groupId } from './scene-ids';
import {
  CONTINENT_OF,
  areasNamed,
  areasOf,
  countriesNamed,
  countriesOfAreas,
  highlightCountries,
  placeKey,
  placeNamed,
  readRegion,
  type GeoBox,
  type PlaceKind,
  type ReadRegion,
} from './scene-map-places';
import {
  naturalAreas,
  naturalLakes,
  naturalRivers,
  type NaturalLake,
} from './scene-map-data';
import { PAPER } from './scene-themes';

// ── The map as the writer gives it, read ──────────────────────────────────

/**
 * The theme tokens a map colours a named thing with (scene-themes): a
 * region, a side or a party keeps one in every scene and every theme. A
 * token, never a colour: the map is drawn in the paper theme's, and the
 * stage recolours them for the theme it plays in.
 */
export const MAP_COLOURS = [
  'accent',
  'accent2',
  'chart0',
  'chart1',
  'chart2',
  'chart3',
  'chart4',
  'chart5',
  'good',
  'bad',
  'muted',
] as const;
export type MapColour = (typeof MAP_COLOURS)[number];

/** A colour token in the writer's or the show's words ("chart1", "Chart 1", "accent 2"); null for anything else, a colour itself included. */
export function mapColourOf(raw: unknown): MapColour | null {
  if (typeof raw !== 'string') return null;
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (MAP_COLOURS as readonly string[]).includes(key)
    ? (key as MapColour)
    : null;
}

const COLOUR_HEX: Record<MapColour, string> = {
  accent: PAPER.accent,
  accent2: PAPER.accent2,
  chart0: PAPER.chart[0],
  chart1: PAPER.chart[1],
  chart2: PAPER.chart[2],
  chart3: PAPER.chart[3],
  chart4: PAPER.chart[4],
  chart5: PAPER.chart[5],
  good: PAPER.good,
  bad: PAPER.bad,
  muted: PAPER.muted,
};

/** A colour token as the paper theme has it: what the map is drawn in. */
export const mapColourHex = (token: MapColour): string => COLOUR_HEX[token];

/**
 * The named regions' colours in turn, where neither the writer nor the
 * show gives one: the chart's, told apart by colour-blind viewers and in
 * every theme, never the sea's sky blue.
 */
const MERGED_COLOURS: readonly MapColour[] = [
  'chart1',
  'chart0',
  'chart2',
  'chart5',
  'chart3',
  'accent2',
];

/** One of a map's named regions, as the writer or the show gives it. */
export interface MapGroupDraft {
  /** "the Northern Region", "East Germany", "the Midwest". */
  name: string;
  /** Its areas (states, provinces, "Scotland") and countries, by name; none for one of the show's own groups, named. */
  members?: readonly string[] | null;
  /** Its colour, a theme token (MAP_COLOURS); absent, the map's next. */
  colour?: string | null;
  /** Its name written in it; absent, it is. */
  label?: boolean | null;
}

/** The border two of a map's groups share, drawn as a line of its own: the playbook's seam. */
export interface MapSeamDraft {
  /** The two groups (or coloured countries or areas), by name. */
  between: readonly string[];
  /** A dashed line (a border drawn on paper, a line agreed), or a glowing one (a fault line); absent, dashed. */
  style?: 'dashed' | 'glow' | null;
  /** What the voice calls it; absent, "A and B". */
  name?: string | null;
}

/** A pin on a place, with a short label, or a number on a card beside it. */
export interface MapPinDraft {
  /** A city, a landmark, an area or a country, by name. */
  place: string;
  label?: string | null;
  /** A number as the script shows it: "174", "45 million". */
  number?: string | null;
}

/**
 * The show's one map (infographic-editor-plan §3, stage 6a): the region
 * every map in the show is drawn in, at one projection and in one frame,
 * so maps in scenes one after another line up exactly; the named regions
 * its story is told in, each with its colour; the seams that stay on it
 * whatever a scene colours; and the year it is about. Names only, as the
 * writer gives them. The editor's world keeps it as `world.base`, made
 * sound by readMapBase; withShowMap gives it to every map of a scene's
 * storyboard, and mapFrameOf turns it into the frame.
 */
export interface ShowMapBase {
  kind: 'map';
  /** What the show's map shows: a country, a region, a continent, the world. */
  region: string;
  groups?: readonly MapGroupDraft[] | null;
  seams?: readonly MapSeamDraft[] | null;
  year?: number | null;
  /** Research's word on the year's borders, as MapDraft's. */
  bordersDiffer?: boolean | null;
}

/** A map as the writer asks for it: names only, never a coordinate. */
export interface MapDraft {
  /** "world", a continent, a region, a country, or a list of them. */
  region: string;
  highlight:
    { name: string; label?: boolean | null; group?: string | null }[] | null;
  places: string[] | null;
  routes: { from: string; to: string; name?: string | null }[] | null;
  /** Areas inside countries to colour as highlights are: states, provinces, a part of a country ("Kano", "Bavaria", "Scotland"). */
  areas?:
    | (
        string | { name: string; label?: boolean | null; group?: string | null }
      )[]
    | null;
  /** Named regions, each made of areas and countries and drawn as one shape: "the Northern Region" is these states. */
  groups?: MapGroupDraft[] | null;
  seams?: MapSeamDraft[] | null;
  pins?: MapPinDraft[] | null;
  /** The year the map shows, for a map of the past. */
  year?: number | null;
  /**
   * Research's word on that year's borders: true, they were not today's;
   * false, they were; absent, a map of a year before today's borders says
   * it is drawn with today's.
   */
  bordersDiffer?: boolean | null;
  /** The show's colours for its recurring things, by name (its palette): a group, a country or an area named keeps its token. */
  palette?: readonly { thing: string; colour: string }[] | null;
  /** The show's one map, given by code (withShowMap), never by the writer. */
  base?: ShowMapBase | null;
}

/** One end of a route: a place's point, or a country (its middle, found when drawn). */
export interface RouteEnd {
  name: string;
  at: [number, number] | null;
  countries: string[];
}

/** The part of the world a map shows, as code reads it. */
export interface MapRegion {
  name: string;
  kind: 'world' | 'continent' | 'region' | 'countries';
  /** The countries it is of (none for the world). */
  countries: string[];
  /** A continent's frame, in degrees (west, south, east, north). */
  box: GeoBox | null;
}

/** Land to colour or to draw a line along: countries, and areas inside countries by their keys (scene-map-data). */
export interface MapLand {
  countries: string[];
  keys: string[];
}

/** A map as code reads it: every name looked up. */
export interface MapSpec {
  region: MapRegion;
  highlights: {
    name: string;
    countries: string[];
    label: boolean;
    /** Its group's place in `groups`. */
    group: number;
    /** Its own colour, from the show's palette; absent, its group's. */
    colour?: MapColour | null;
  }[];
  /** The groups' names, in order; "" for one the writer did not name. */
  groups: string[];
  /** Each group's colour where the show gives it one, or a named region of its name has one; null, the map's own. */
  groupColours?: (MapColour | null)[];
  places: {
    name: string;
    /** Where its mark or its name goes. */
    lon: number;
    lat: number;
    kind: PlaceKind;
    /** A river: Natural Earth's names for its stretches, drawn as lines. */
    river?: string[];
    /** A lake: Natural Earth's name for it, drawn as itself. */
    lake?: string;
    /** A sea: other points in it (longitude, latitude), to name it at when the first is out of view. */
    alts?: [number, number][];
  }[];
  routes: { name: string; from: RouteEnd; to: RouteEnd }[];
  /** Areas inside countries it colours, each as a highlight is. */
  areas?: {
    name: string;
    keys: string[];
    countries: string[];
    label: boolean;
    group: number;
    colour?: MapColour | null;
  }[];
  /** Its named regions, each drawn as one shape of its countries' and areas' land. */
  merged?: (MapLand & { name: string; colour: MapColour; label: boolean })[];
  /** Lines along the border two lands share. */
  seams?: {
    name: string;
    a: MapLand;
    b: MapLand;
    style: 'dashed' | 'glow';
  }[];
  /** Pins: at a place's point, or in the middle of an area or a country. */
  pins?: (MapLand & {
    name: string;
    at: [number, number] | null;
    label: string | null;
    number: string | null;
  })[];
  year?: number | null;
  /** Drawn with a small "Today's borders" note: a past year whose borders may not have been today's. */
  period?: boolean;
  /** The show's one map: what it is drawn in, at its frame (frameFor), in every shape of film. */
  base?: MapRegion | null;
}

/** The most a map holds: what a learner can follow on one picture. */
export const MAP_LIMITS = {
  highlights: 60,
  groups: 4,
  places: 10,
  routes: 4,
  areas: 60,
  merged: 8,
  seams: 4,
  pins: 8,
} as const;

/** How many named regions a show's map keeps, and how many members each. */
const BASE_GROUPS = 12;
const MOST_MEMBERS = 80;

/**
 * Today's borders, as Natural Earth draws them, have stood since this
 * year (South Sudan's, 2011): a map of a year before it is drawn with
 * borders that may not be that year's, and says so, unless research says
 * they were the same.
 */
export const TODAYS_BORDERS_FROM = 2011;
/** What a map of the past says in its corner. */
export const PERIOD_NOTE = "Today's borders";

const tidy = (text: unknown, most = 120) =>
  (typeof text === 'string' || typeof text === 'number' ? String(text) : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, most)
    .trim();

/** A list the writer gave, or none: never a crash on a stray value. */
const listOf = <T>(value: readonly T[] | null | undefined): T[] =>
  Array.isArray(value) ? [...(value as T[])] : [];

/** A year, as a whole number no later than this one; null for anything else. */
function yearOf(raw: unknown): number | null {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw.trim())
        : NaN;
  if (!Number.isFinite(n)) return null;
  const year = Math.round(n);
  return year >= -5000 && year <= new Date().getUTCFullYear() ? year : null;
}

/** The region a reading of the writer's words gives, as a map's. */
function regionOf(read: ReadRegion | null): MapRegion | null {
  if (!read) return null;
  if (read.kind === 'world')
    return { name: 'World', kind: 'world', countries: [], box: null };
  if (read.kind === 'countries')
    return {
      name: read.name,
      kind: 'countries',
      countries: read.countries,
      box: null,
    };
  return {
    name: read.name,
    kind: read.kind,
    countries: [...read.entry.members],
    box: read.entry.box,
  };
}

/** Whether one region is all inside another: a country of a continent, a list of a region's countries, anything of the world. */
function regionInside(inner: MapRegion, outer: MapRegion): boolean {
  if (outer.kind === 'world') return true;
  if (inner.kind === 'world') return false;
  if (placeKey(inner.name) === placeKey(outer.name)) return true;
  return (
    inner.countries.length > 0 &&
    inner.countries.every((c) => outer.countries.includes(c))
  );
}

/**
 * The show's one map made sound (the editor's world.base): its region,
 * which code must know, its named regions (each a name and its members,
 * a colour token or none), the seams that stay on it, its year and
 * research's word on its borders. Null when it names no region code
 * knows; a stray value is left off, never a lost show.
 */
export function readMapBase(raw: unknown): ShowMapBase | null {
  if (!raw || typeof raw !== 'object') return null;
  const said = raw as Record<string, unknown>;
  const region = tidy(said.region, 80);
  if (!region || !readRegion(region).region) return null;
  const groups = listOf(said.groups as MapGroupDraft[])
    .flatMap((one): MapGroupDraft[] => {
      if (!one || typeof one !== 'object') return [];
      const name = tidy(one.name, 60);
      if (!name) return [];
      return [
        {
          name,
          members: listOf(one.members)
            .map((m) => tidy(m, 60))
            .filter(Boolean)
            .slice(0, MOST_MEMBERS),
          colour: mapColourOf(one.colour),
          label: typeof one.label === 'boolean' ? one.label : null,
        },
      ];
    })
    .filter(
      (one, i, all) =>
        all.findIndex(
          (other) => placeKey(other.name) === placeKey(one.name),
        ) === i,
    )
    .slice(0, BASE_GROUPS);
  const seams = listOf(said.seams as MapSeamDraft[])
    .flatMap((one): MapSeamDraft[] => {
      if (!one || typeof one !== 'object') return [];
      const between = listOf(one.between)
        .map((side) => tidy(side, 60))
        .filter(Boolean);
      if (between.length !== 2) return [];
      return [
        {
          between,
          style: one.style === 'glow' ? 'glow' : 'dashed',
          name: tidy(one.name, 60) || null,
        },
      ];
    })
    .slice(0, MAP_LIMITS.seams);
  return {
    kind: 'map',
    region,
    groups,
    seams,
    year: yearOf(said.year),
    bordersDiffer:
      typeof said.bordersDiffer === 'boolean' ? said.bordersDiffer : null,
  };
}

/**
 * A scene's storyboard with the show's one map given to every map in it
 * (and the show's palette, so a group, a country or an area named in it
 * keeps its colour), for the stage to draw each into the show's frame:
 * maps in scenes one after another line up exactly, and the film carries
 * one into the next. A map whose region is bigger than the show's, or
 * elsewhere, keeps its own frame (readMap). Done again, the same: the
 * board can give it as it writes, and the make before it draws.
 */
export function withShowMap<
  T extends { cast: readonly { kind: string; map?: MapDraft | null }[] },
>(
  draft: T,
  base: unknown,
  palette?: readonly {
    thing: string;
    colour?: string | null;
    token?: string | null;
  }[],
): T {
  const sound = readMapBase(base);
  const colours = listOf(palette).flatMap((one) => {
    const colour = mapColourOf(one?.colour ?? one?.token);
    const thing = tidy(one?.thing, 60);
    return colour && thing ? [{ thing, colour }] : [];
  });
  if (!sound && !colours.length) return draft;
  return {
    ...draft,
    cast: draft.cast.map((thing) =>
      thing.kind === 'map' && thing.map
        ? {
            ...thing,
            map: {
              ...thing.map,
              ...(sound ? { base: sound } : {}),
              ...(colours.length ? { palette: colours } : {}),
            },
          }
        : thing,
    ),
  };
}

/**
 * A map's countries and areas, from names: a country, a name for several
 * or a region of countries ("West Africa"); else an area inside the
 * countries in view ("Kano", "Scotland"). A country outside them that an
 * area in view is named for is that area: Niger on a map of Nigeria is
 * Niger State.
 */
function landOf(
  names: readonly string[],
  within: readonly string[],
): MapLand & { unknown: string[] } {
  const countries: string[] = [];
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const asCountries = highlightCountries(name);
    const asAreas = areasNamed(name, within);
    const inView =
      !within.length || asCountries.some((c) => within.includes(c));
    if (asCountries.length && (inView || !asAreas)) {
      for (const c of asCountries)
        if (!countries.includes(c)) countries.push(c);
    } else if (asAreas) {
      for (const k of asAreas.keys) if (!keys.includes(k)) keys.push(k);
    } else unknown.push(name);
  }
  return { countries, keys, unknown };
}

/**
 * The writer's map looked up by code: its region, the countries each
 * highlight colours, the areas inside countries, the named regions each
 * drawn as one shape, the seams between them, the pins, each place's
 * coordinates and each route's ends; and, given the show's one map, the
 * frame it is drawn in. A name code does not know is left off and said
 * in `dropped`; a map with nothing it knows to show is null.
 */
export function readMap(draft: MapDraft | null | undefined): {
  spec: MapSpec | null;
  dropped: string[];
} {
  const dropped: string[] = [];
  if (!draft) return { spec: null, dropped };
  const base = draft.base ? readMapBase(draft.base) : null;
  const baseRegion = base ? regionOf(readRegion(base.region).region) : null;
  // The show's colours, by the names of what they colour.
  const palette = new Map<string, MapColour>();
  for (const one of listOf(draft.palette)) {
    const colour = mapColourOf(one?.colour);
    const key = placeKey(tidy(one?.thing));
    if (colour && key && !palette.has(key)) palette.set(key, colour);
  }
  const tint = (name: string) => palette.get(placeKey(name)) ?? null;
  // The region, first: areas are found in its countries.
  const said = readRegion(tidy(draft.region));
  for (const one of said.unknown)
    dropped.push(`"${one}" is no part of the world the map knows`);
  const asked = regionOf(said.region);

  // The groups a colour is for, a key's rows: in the order first named.
  const groups: string[] = [];
  const groupFor = (group: string, name: string): number => {
    let index = groups.indexOf(group);
    if (index >= 0) return index;
    if (groups.length < MAP_LIMITS.groups) {
      groups.push(group);
      return groups.length - 1;
    }
    dropped.push(
      `"${name}": a map has ${MAP_LIMITS.groups} colours at most; in the last`,
    );
    return groups.length - 1;
  };

  // Highlights: each its countries, a country coloured once. A name that
  // is no country is read again below, as a named region or an area.
  const coloured = new Set<string>();
  const highlights: MapSpec['highlights'] = [];
  const later: { name: string; label: boolean; group: string }[] = [];
  for (const raw of listOf(draft.highlight).slice(
    0,
    MAP_LIMITS.highlights * 2,
  )) {
    const name = tidy(raw?.name);
    if (!name) continue;
    const all = highlightCountries(name);
    if (!all.length) {
      later.push({ name, label: raw.label === true, group: tidy(raw.group) });
      continue;
    }
    const countries = all.filter((c) => !coloured.has(c));
    if (!countries.length) continue;
    if (highlights.length >= MAP_LIMITS.highlights) {
      dropped.push(`"${name}": a map colours ${MAP_LIMITS.highlights} at most`);
      continue;
    }
    const group = groupFor(tidy(raw.group), name);
    for (const c of countries) coloured.add(c);
    highlights.push({
      name,
      countries,
      label: raw.label === true,
      group,
      ...(tint(name) ? { colour: tint(name) } : {}),
    });
  }

  // The countries in view, where areas are looked for: the region's, the
  // coloured ones, the show's map's.
  const within = [
    ...new Set([
      ...(asked?.countries ?? []),
      ...coloured,
      ...(asked?.kind === 'world' ? [] : (baseRegion?.countries ?? [])),
    ]),
  ];
  const groupAsks: MapGroupDraft[] = listOf(draft.groups).filter(
    (one) => one && typeof one === 'object',
  );
  const baseGroup = (name: string) =>
    base?.groups?.find((g) => placeKey(g.name) === placeKey(name)) ?? null;
  const askedGroup = (name: string) =>
    groupAsks.find((g) => placeKey(tidy(g.name)) === placeKey(name)) ?? null;

  // Areas inside countries: each its areas, an area coloured once. A
  // group's name, said as a highlight or an area, is that group.
  const areas: NonNullable<MapSpec['areas']> = [];
  const colouredAreas = new Set<string>();
  const areaAsks = [
    ...listOf(draft.areas).map((raw) =>
      typeof raw === 'string'
        ? { name: tidy(raw), label: false, group: '', highlight: false }
        : {
            name: tidy(raw?.name),
            label: raw?.label === true,
            group: tidy(raw?.group),
            highlight: false,
          },
    ),
    ...later.map((one) => ({ ...one, highlight: true })),
  ];
  for (const ask of areaAsks.slice(0, MAP_LIMITS.areas * 2)) {
    if (!ask.name) continue;
    if (baseGroup(ask.name) || askedGroup(ask.name)) {
      if (!askedGroup(ask.name))
        groupAsks.push({ name: ask.name, label: ask.label || null });
      continue;
    }
    const found = areasNamed(ask.name, within);
    if (!found) {
      dropped.push(
        ask.highlight
          ? `"${ask.name}" is no country or region the map knows`
          : `"${ask.name}" is no area the map knows`,
      );
      continue;
    }
    const keys = found.keys.filter((k) => !colouredAreas.has(k));
    if (!keys.length) continue;
    if (areas.length >= MAP_LIMITS.areas) {
      dropped.push(
        `"${ask.name}": a map colours ${MAP_LIMITS.areas} areas at most`,
      );
      continue;
    }
    for (const k of keys) colouredAreas.add(k);
    areas.push({
      name: ask.name,
      keys,
      countries: found.countries,
      label: ask.label,
      group: groupFor(ask.group, ask.name),
      ...(tint(ask.name) ? { colour: tint(ask.name) } : {}),
    });
  }

  // Named regions, each one shape: its own members, or the show's group's
  // of its name; its colour the writer's, the show's, or the next in turn,
  // counted from the show's groups so each keeps its colour in every scene.
  const merged: NonNullable<MapSpec['merged']> = [];
  let own = 0;
  for (const ask of groupAsks) {
    const name = tidy(ask.name, 60);
    if (!name || merged.some((m) => placeKey(m.name) === placeKey(name)))
      continue;
    const shows = baseGroup(name);
    const members = listOf(ask.members)
      .map((m) => tidy(m, 60))
      .filter(Boolean);
    const land = landOf(
      (members.length ? members : listOf(shows?.members)).slice(
        0,
        MOST_MEMBERS,
      ),
      within,
    );
    for (const one of land.unknown)
      dropped.push(`"${one}" in "${name}" is no country or area the map knows`);
    if (!land.countries.length && !land.keys.length) {
      dropped.push(`the group "${name}" has nothing the map knows in it`);
      continue;
    }
    if (merged.length >= MAP_LIMITS.merged) {
      dropped.push(
        `"${name}": a map draws ${MAP_LIMITS.merged} named regions at most`,
      );
      continue;
    }
    const turn = shows
      ? (base?.groups ?? []).indexOf(shows)
      : (base?.groups?.length ?? 0) + own++;
    merged.push({
      name,
      countries: land.countries,
      keys: land.keys,
      colour:
        mapColourOf(ask.colour) ??
        mapColourOf(shows?.colour) ??
        tint(name) ??
        MERGED_COLOURS[turn % MERGED_COLOURS.length],
      label: (ask.label ?? shows?.label) !== false,
    });
  }

  // Seams: the border two lands share, the writer's and the show's own,
  // each side a named region (drawn or the show's), a coloured country or
  // area, or a country or an area by its name.
  const sideOf = (name: string): MapLand | null => {
    const key = placeKey(name);
    const group = merged.find((m) => placeKey(m.name) === key);
    if (group) return { countries: group.countries, keys: group.keys };
    const shows = baseGroup(name);
    if (shows) {
      const land = landOf(listOf(shows.members), within);
      return land.countries.length || land.keys.length
        ? { countries: land.countries, keys: land.keys }
        : null;
    }
    const highlight = highlights.find((h) => placeKey(h.name) === key);
    if (highlight) return { countries: highlight.countries, keys: [] };
    const area = areas.find((a) => placeKey(a.name) === key);
    if (area) return { countries: [], keys: area.keys };
    const land = landOf([name], within);
    return land.countries.length || land.keys.length
      ? { countries: land.countries, keys: land.keys }
      : null;
  };
  const seams: NonNullable<MapSpec['seams']> = [];
  for (const raw of [...listOf(draft.seams), ...listOf(base?.seams)]) {
    const between = listOf(raw?.between)
      .map((side) => tidy(side, 60))
      .filter(Boolean);
    if (between.length !== 2) continue;
    const name = tidy(raw.name, 60) || `${between[0]} and ${between[1]}`;
    if (seams.some((s) => placeKey(s.name) === placeKey(name))) continue;
    const [a, b] = between.map(sideOf);
    if (!a || !b) {
      dropped.push(
        `the seam "${name}": ${!a ? between[0] : between[1]} is nothing the map knows`,
      );
      continue;
    }
    if (seams.length >= MAP_LIMITS.seams) continue;
    seams.push({ name, a, b, style: raw.style === 'glow' ? 'glow' : 'dashed' });
  }

  // Places, by name only.
  const places: MapSpec['places'] = [];
  const addPlace = (said: string): MapSpec['places'][number] | null => {
    const found = placeNamed(said);
    if (!found) return null;
    const kept = places.find((p) => p.name === found.name);
    if (kept) return kept;
    if (places.length >= MAP_LIMITS.places) return null;
    const place: MapSpec['places'][number] = {
      name: found.name,
      lon: found.lon,
      lat: found.lat,
      kind: found.kind,
      ...(found.river ? { river: [...found.river] } : {}),
      ...(found.lake ? { lake: found.lake } : {}),
      ...(found.alts
        ? { alts: found.alts.map(([lat, lon]): [number, number] => [lon, lat]) }
        : {}),
    };
    places.push(place);
    return place;
  };
  for (const raw of listOf(draft.places)) {
    const said = tidy(
      typeof raw === 'string' ? raw : (raw as { name?: string })?.name,
    );
    if (!said) continue;
    if (addPlace(said)) continue;
    dropped.push(
      countriesNamed(said).length
        ? `"${said}" is a country, not a place: colour it as a highlight`
        : placeNamed(said) && places.length >= MAP_LIMITS.places
          ? `"${said}": a map marks ${MAP_LIMITS.places} places at most`
          : `"${said}" is no place the map knows`,
    );
  }

  // Pins: on a place's point, else in the middle of an area or a country.
  const pins: NonNullable<MapSpec['pins']> = [];
  for (const raw of listOf(draft.pins).slice(0, MAP_LIMITS.pins * 2)) {
    const place = tidy(raw?.place, 80);
    if (!place) continue;
    const point = placeNamed(place);
    const land = point ? null : landOf([place], within);
    if (!point && !land?.countries.length && !land?.keys.length) {
      dropped.push(`the pin on "${place}": no place the map knows`);
      continue;
    }
    if (pins.length >= MAP_LIMITS.pins) continue;
    const label = tidy(raw.label, 40) || null;
    let name = label ?? point?.name ?? place;
    for (let k = 2; pins.some((p) => p.name === name); k++)
      name = `${label ?? point?.name ?? place} ${k}`;
    pins.push({
      name,
      at: point ? [point.lon, point.lat] : null,
      countries: land?.countries ?? [],
      keys: land?.keys ?? [],
      label,
      number: tidy(raw.number, 16) || null,
    });
  }

  // Routes: from a place or a country to another.
  const endOf = (said: string): RouteEnd | null => {
    const place = addPlace(said);
    if (place)
      return { name: place.name, at: [place.lon, place.lat], countries: [] };
    const countries = countriesNamed(said);
    return countries.length
      ? { name: said, at: null, countries: [...countries] }
      : null;
  };
  const routes: MapSpec['routes'] = [];
  for (const raw of listOf(draft.routes).slice(0, MAP_LIMITS.routes)) {
    const [fromSaid, toSaid] = [tidy(raw?.from), tidy(raw?.to)];
    if (!fromSaid || !toSaid) continue;
    const [from, to] = [endOf(fromSaid), endOf(toSaid)];
    if (!from || !to) {
      dropped.push(
        `the route from "${fromSaid}" to "${toSaid}": ${!from ? fromSaid : toSaid} is no place the map knows`,
      );
      continue;
    }
    routes.push({
      name: tidy(raw.name) || `${from.name} to ${to.name}`,
      from,
      to,
    });
  }

  // The region; failing that, what it colours and marks; failing that, the show's.
  let region: MapRegion | null = asked;
  if (!region) {
    const countries = [
      ...new Set([
        ...coloured,
        ...areas.flatMap((a) => a.countries),
        ...merged.flatMap((m) => [...m.countries, ...countriesOfAreas(m.keys)]),
      ]),
    ];
    if (countries.length)
      region = {
        name: [...highlights, ...areas, ...merged]
          .map((h) => h.name)
          .join(', '),
        kind: 'countries',
        countries,
        box: null,
      };
    else if (baseRegion) region = baseRegion;
    else if (places.length || routes.length || pins.length)
      region = { name: '', kind: 'countries', countries: [], box: null };
  }
  if (!region) return { spec: null, dropped };

  // The year it shows, and whether its borders may not have been today's.
  const year = yearOf(draft.year) ?? base?.year ?? null;
  const differ =
    typeof draft.bordersDiffer === 'boolean'
      ? draft.bordersDiffer
      : (base?.bordersDiffer ?? null);
  const period =
    year !== null &&
    (differ === true || (differ !== false && year < TODAYS_BORDERS_FROM));
  // A group's colour from the show, or a named region of its name.
  const groupColours = groups.map(
    (name) =>
      (name ? tint(name) : null) ??
      merged.find((m) => name && placeKey(m.name) === placeKey(name))?.colour ??
      null,
  );
  // Drawn in the show's one map, unless it asks for more than it, or for elsewhere.
  const framed =
    baseRegion !== null && (!asked || regionInside(asked, baseRegion));
  return {
    spec: {
      region,
      highlights,
      groups,
      ...(groupColours.some(Boolean) ? { groupColours } : {}),
      places,
      routes,
      ...(areas.length ? { areas } : {}),
      ...(merged.length ? { merged } : {}),
      ...(seams.length ? { seams } : {}),
      ...(pins.length ? { pins } : {}),
      ...(year !== null ? { year } : {}),
      ...(period ? { period } : {}),
      ...(framed ? { base: baseRegion } : {}),
    },
    dropped,
  };
}

/** The names of a map's parts, as the voice points at them: each highlight, area, named region, pin, seam, place and route. */
export const mapPartNames = (spec: MapSpec): string[] => [
  ...spec.highlights.map((h) => h.name),
  ...(spec.areas ?? []).map((a) => a.name),
  ...(spec.merged ?? []).map((m) => m.name),
  ...(spec.pins ?? []).map((p) => p.name),
  ...(spec.seams ?? []).map((s) => s.name),
  ...spec.places.map((p) => p.name),
  ...spec.routes.map((r) => r.name),
];

// ── The data ──────────────────────────────────────────────────────────────

type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }>;

interface Atlas {
  topology: Topology;
  countries: CountryFeature[];
  byName: Map<string, CountryFeature>;
}

const atlases = new Map<'50m' | '110m', Atlas>();

/** world-atlas's countries at a resolution, read once while the process runs. */
export function atlasOf(resolution: '50m' | '110m'): Atlas {
  const kept = atlases.get(resolution);
  if (kept) return kept;
  const topology = JSON.parse(
    readFileSync(
      require.resolve(`world-atlas/countries-${resolution}.json`),
      'utf8',
    ),
  ) as Topology;
  const collection = feature(
    topology,
    topology.objects.countries,
  ) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
  const countries = collection.features.filter((f) => f.geometry);
  const atlas: Atlas = {
    topology,
    countries,
    byName: new Map(countries.map((f) => [f.properties.name, f])),
  };
  atlases.set(resolution, atlas);
  return atlas;
}

type D3Geo = typeof import('d3-geo');
let d3: Promise<D3Geo> | null = null;
/** d3-geo, an ES module, loaded once as one. */
export const d3Geo = (): Promise<D3Geo> => (d3 ??= import('d3-geo'));

// ── Drawing ───────────────────────────────────────────────────────────────

/**
 * The drawing's area by the film's shape: a wide film's map wide or tall
 * as its region is, between these; a tall film's square or portrait
 * (studio-vertical-plan §4.2, as drawingShapeFor asks of a drawing).
 */
const FRAME = {
  wide: { area: 1000 * 640, aspect: [0.8, 1.9] as const, text: 40 },
  tall: { area: 820 * 820, aspect: [0.75, 1.15] as const, text: 46 },
} as const;

/** How far apart two points of an outline are kept, in the drawing's units: closer, one is dropped. */
const THIN = 1.3;
/** The most a map's drawing may weigh; past it, drawn again with its outlines thinned further. */
export const MAP_MOST_BYTES = 72_000;
/** An island smaller than this, in square units, is not drawn: a speck. */
const SPECK = 5;
/** A country of more areas than this has none of their borders drawn: a web of lines, not a map. */
const AREA_LINES_MOST = 80;

const INK = PAPER.ink;
const MUTED = PAPER.muted;
/** The sea: the chart's sky blue, which is blue in every theme, as a tint. */
const SEA = PAPER.chart[4];
const LAND = PAPER.card;
const NEIGHBOUR = PAPER.grid;
const HALO = PAPER.card;
/**
 * Each group's colour: one group in the accent; two or more in the
 * chart's orange, blue, green and purple, told apart in every theme and
 * by colour-blind viewers too (an accent and a chart colour can meet:
 * Clean Lab's accent is blue).
 */
const GROUP_COLOURS = [
  PAPER.chart[1],
  PAPER.chart[0],
  PAPER.chart[2],
  PAPER.chart[5],
] as const;
export const groupColour = (i: number, groups: number) =>
  groups <= 1 ? PAPER.accent : GROUP_COLOURS[i % GROUP_COLOURS.length];

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const r = (n: number) => Math.round(n * 10) / 10;

type Point = [number, number];

/**
 * A projection's stream thinned for the screen: points nearer than THIN to
 * the last kept are dropped, and a ring that is a speck, or a line of one
 * point, is not drawn. What keeps a map small enough to play smoothly on
 * a phone.
 */
function thinned(out: GeoStream, speck: number, thin: number): GeoStream {
  let inPolygon = false;
  let line: Point[] = [];
  /** The latest point dropped: a line still ends where it ends. */
  let pending: Point | null = null;
  const flush = () => {
    const least = inPolygon ? 3 : 2;
    if (line.length >= least) {
      if (inPolygon && speck > 0) {
        let area = 0;
        for (let i = 0, j = line.length - 1; i < line.length; j = i++)
          area += (line[j][0] + line[i][0]) * (line[j][1] - line[i][1]);
        if (Math.abs(area / 2) < speck) {
          line = [];
          return;
        }
      }
      out.lineStart();
      for (const [x, y] of line) out.point(x, y);
      out.lineEnd();
    }
    line = [];
  };
  return {
    // Measured from the last point kept, so a run of close points is
    // thinned to one every THIN along it, never pulled into one straight
    // line from where it began to where it ends.
    point(x, y) {
      const last = line[line.length - 1];
      if (!last || Math.hypot(x - last[0], y - last[1]) >= thin) {
        line.push([x, y]);
        pending = null;
      } else pending = [x, y];
    },
    lineStart() {
      line = [];
      pending = null;
    },
    lineEnd() {
      if (pending) line.push(pending);
      pending = null;
      flush();
    },
    polygonStart() {
      inPolygon = true;
      out.polygonStart();
    },
    polygonEnd() {
      inPolygon = false;
      out.polygonEnd();
    },
    sphere() {
      out.sphere?.();
    },
  };
}

/** A country's polygons, each as one feature, so the near ones can be told from the far (an empire's islands). */
const polygonsOf = (f: { geometry: Polygon | MultiPolygon }): Position[][][] =>
  f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates]
    : f.geometry.coordinates;

/**
 * A country's mainland, for framing it: its largest piece and the pieces
 * near it, not its far islands and territories (France's Guiana, the
 * United States' Hawaii, Norway's Svalbard). An area's or a named
 * region's the same way: the West of the United States is framed by its
 * states on the continent, not by Alaska and Hawaii.
 */
function mainlandOf(
  g: D3Geo,
  f: { geometry: Polygon | MultiPolygon },
): Feature<MultiPolygon> {
  const pieces = polygonsOf(f).map((coordinates) => {
    const polygon: Polygon = { type: 'Polygon', coordinates };
    return {
      coordinates,
      area: g.geoArea(polygon),
      at: g.geoCentroid(polygon),
    };
  });
  const largest = pieces.reduce((a, b) => (b.area > a.area ? b : a));
  // Near: within twice the largest piece's own size, and at least 12°.
  const reach = Math.max(
    (12 * Math.PI) / 180,
    2 * Math.sqrt(largest.area / Math.PI),
  );
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: pieces
        .filter(
          (p) => p === largest || g.geoDistance(p.at, largest.at) <= reach,
        )
        .map((p) => p.coordinates),
    },
  };
}

/** Whether a point is inside a set of rings (even-odd, holes out). */
function pointIn(rings: Point[][], [x, y]: Point): boolean {
  let odd = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        odd = !odd;
    }
  return odd;
}

/** The point inside a set of rings farthest from their edges: where a name or a route's end sits. */
function insidePoint(rings: Point[][]): Point | null {
  return insidePoints(rings)[0] ?? null;
}

/** Points inside a set of rings, the farthest from their edges first: where a name may sit. */
function insidePoints(rings: Point[][]): Point[] {
  if (!rings.length) return [];
  // The largest ring, and the rings inside it (holes, lakes) counted against it.
  const area = (ring: Point[]) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    return Math.abs(a / 2);
  };
  const outer = rings.reduce((a, b) => (area(b) > area(a) ? b : a));
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  const [x0, x1, y0, y1] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const inside = (x: number, y: number) => {
    let odd = false;
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
          odd = !odd;
      }
    return odd;
  };
  const edgeDistance = (x: number, y: number) => {
    let least = Infinity;
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j];
        const [bx, by] = ring[i];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1),
          ),
        );
        least = Math.min(
          least,
          Math.hypot(x - (ax + t * dx), y - (ay + t * dy)),
        );
      }
    return least;
  };
  const found: { at: Point; d: number }[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const y = y0 + ((y1 - y0) * j) / N;
      if (inside(x, y)) found.push({ at: [x, y], d: edgeDistance(x, y) });
    }
  if (!found.length) return [[(x0 + x1) / 2, (y0 + y1) / 2]];
  return found.sort((a, b) => b.d - a.d).map((one) => one.at);
}

/** The rings a geometry makes on the drawing, after the projection's clip. */
function ringsOf(
  g: D3Geo,
  projection: GeoProjection,
  geometry: Geometry,
): Point[][] {
  const rings: Point[][] = [];
  let ring: Point[] = [];
  const sink: GeoStream = {
    point: (x, y) => void ring.push([x, y]),
    lineStart: () => void (ring = []),
    lineEnd: () => {
      if (ring.length >= 3) rings.push(ring);
    },
    polygonStart: () => {},
    polygonEnd: () => {},
  };
  // d3's own stream for any GeoJSON object, through the projection.
  g.geoStream(geometry, projection.stream(sink));
  return rings;
}

const boxOf = (rings: Point[][]): [number, number, number, number] | null => {
  const all = rings.flat();
  if (!all.length) return null;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return [r(x0), r(y0), r(Math.max(...xs) - x0), r(Math.max(...ys) - y0)];
};

type ProjectionName = 'naturalEarth1' | 'conicEqualArea' | 'azimuthalEqualArea';

/** The projection that suits a region: the world's, a wide one's away from the equator, or one centred on it. */
function projectionFor(
  g: D3Geo,
  target: Parameters<D3Geo['geoBounds']>[0],
  world: boolean,
): { projection: GeoProjection; name: ProjectionName } {
  const [[x0, y0], [x1, y1]] = g.geoBounds(target);
  const lonSpan = x1 >= x0 ? x1 - x0 : x1 + 360 - x0;
  const latSpan = y1 - y0;
  let lon = x0 + lonSpan / 2;
  if (lon > 180) lon -= 360;
  const lat = (y0 + y1) / 2;
  // A pole's land (Antarctica, the Arctic) seen from above it.
  if (!world && (y0 <= -80 || y1 >= 84))
    return {
      projection: g.geoAzimuthalEqualArea().rotate([0, y0 <= -80 ? 90 : -90]),
      name: 'azimuthalEqualArea',
    };
  if (world || lonSpan > 200)
    return {
      projection: g.geoNaturalEarth1().rotate([world ? 0 : -lon, 0]),
      name: 'naturalEarth1',
    };
  if (lonSpan > 45 && Math.abs(lat) > 20 && latSpan < 80)
    return {
      projection: g
        .geoConicEqualArea()
        .parallels([y0 + latSpan / 6, y1 - latSpan / 6])
        .rotate([-lon, 0]),
      name: 'conicEqualArea',
    };
  return {
    projection: g.geoAzimuthalEqualArea().rotate([-lon, -lat]),
    name: 'azimuthalEqualArea',
  };
}

/** A box's edges as points, for fitting a projection to it. */
function boxPoints([w, s, e, n]: GeoBox): Position[] {
  const out: Position[] = [];
  for (let i = 0; i <= 20; i++) {
    const lon = w + ((e - w) * i) / 20;
    const lat = s + ((n - s) * i) / 20;
    out.push([lon, s], [lon, n], [w, lat], [e, lat]);
  }
  return out;
}

/** How a map is projected onto its drawing, and the drawing's size. */
interface Fit {
  projection: GeoProjection;
  name: ProjectionName;
  W: number;
  H: number;
  world: boolean;
  resolution: '50m' | '110m';
}

/**
 * A map fitted to what it shows: its region, and whatever it colours and
 * marks beyond it; projected to suit, as wide or tall as the region is
 * within the film's shape, and its coastlines from the lighter data for
 * a continent or the world, the finer for a country.
 */
function fitOf(g: D3Geo, spec: MapSpec, shape: 'wide' | 'tall'): Fit {
  const world = spec.region.kind === 'world';
  const large =
    world ||
    spec.region.kind === 'continent' ||
    (spec.region.box !== null && spec.region.box[2] - spec.region.box[0] > 40);
  // A continent's coastlines from the lighter data, unless a country it
  // colours is too small to be in it; a country's from the finer.
  const coarse = atlasOf('110m');
  const resolution: '50m' | '110m' =
    large &&
    spec.highlights.every((h) => h.countries.every((c) => coarse.byName.has(c)))
      ? '110m'
      : '50m';
  const atlas = atlasOf(resolution);
  const known = (name: string) =>
    atlas.byName.get(name) ?? atlasOf('50m').byName.get(name);
  // What the map is fitted to: the region, and whatever it colours and marks beyond it.
  const fitFeatures: Feature[] = [];
  const mainlands = (names: readonly string[], dropSmall: boolean) => {
    const found = names.flatMap((n) => {
      const f = known(n);
      return f ? [mainlandOf(g, f)] : [];
    });
    if (!dropSmall || found.length < 2) return found;
    const areas = found.map((f) => g.geoArea(f));
    const most = Math.max(...areas);
    // A region is framed by its land, not by its smallest islands.
    return found.filter((_, i) => areas[i] >= most * 0.005);
  };
  if (spec.region.box)
    fitFeatures.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPoint', coordinates: boxPoints(spec.region.box) },
    });
  else if (!world) fitFeatures.push(...mainlands(spec.region.countries, true));
  if (!world) {
    fitFeatures.push(
      ...mainlands(
        [
          ...spec.highlights.flatMap((h) => h.countries),
          ...(spec.merged ?? []).flatMap((m) => m.countries),
        ],
        false,
      ),
    );
    // An area, a named region of areas, a pin in an area: each by its own
    // land's mainland.
    for (const keys of [
      ...(spec.areas ?? []).map((a) => a.keys),
      ...(spec.merged ?? []).map((m) => m.keys),
      ...(spec.pins ?? []).map((p) => p.keys),
    ]) {
      const land = keys.length ? areaLand(keys) : null;
      if (land?.coordinates.length)
        fitFeatures.push(mainlandOf(g, { geometry: land }));
    }
    // Where a mark goes is in view; a river, a lake, a sea or a desert is
    // named where it is in view, and never widens the map.
    const points = [
      ...spec.places
        .filter((p) => !['river', 'lake', 'sea', 'area'].includes(p.kind))
        .map((p) => [p.lon, p.lat] as Position),
      ...spec.routes.flatMap((route) =>
        [route.from, route.to].flatMap((end) =>
          end.at ? [end.at as Position] : [],
        ),
      ),
      ...(spec.pins ?? []).flatMap((pin) =>
        pin.at ? [pin.at as Position] : [],
      ),
    ];
    if (points.length)
      fitFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiPoint', coordinates: points },
      });
    fitFeatures.push(
      ...mainlands(
        [
          ...spec.routes.flatMap((route) => [
            ...route.from.countries,
            ...route.to.countries,
          ]),
          ...(spec.pins ?? []).flatMap((pin) => pin.countries),
        ],
        false,
      ),
    );
  }
  const target: Parameters<D3Geo['geoBounds']>[0] = world
    ? { type: 'Sphere' }
    : { type: 'FeatureCollection', features: fitFeatures };
  if (!world && !fitFeatures.length)
    throw new Error('the map has nothing to show');
  const { projection, name } = projectionFor(g, target, world);
  // The frame: as wide as the region is, within the shape's limits.
  const frame = FRAME[shape];
  projection.fitSize([1000, 1000], target);
  const [[bx0, by0], [bx1, by1]] = g.geoPath(projection).bounds(target);
  const natural = (bx1 - bx0) / Math.max(1e-6, by1 - by0);
  const aspect = Math.min(frame.aspect[1], Math.max(frame.aspect[0], natural));
  const W = Math.round(Math.sqrt(frame.area * aspect));
  const H = Math.round(Math.sqrt(frame.area / aspect));
  const pad = world ? 4 : Math.round(Math.min(W, H) * 0.06);
  projection.fitExtent(
    [
      [pad, pad],
      [W - pad, H - pad],
    ],
    target,
  );
  if (!world)
    projection.clipExtent([
      [-4, -4],
      [W + 4, H + 4],
    ]);
  return { projection, name, W, H, world, resolution };
}

// ── The show's one map ────────────────────────────────────────────────────

/**
 * The frame a show's maps are drawn in (the base map of stage 6a): the
 * region it was fitted to, its projection as the numbers that make it
 * again exactly, the drawing's size and its coastlines' detail. Every map
 * of the show is drawn into it, so a country is at the same point of the
 * drawing in every scene and the film goes from one to the next without
 * a jump. Plain data: kept, compared and sent as it is.
 */
export interface MapFrame {
  region: MapRegion;
  shape: 'wide' | 'tall';
  width: number;
  height: number;
  world: boolean;
  resolution: '50m' | '110m';
  projection: {
    name: ProjectionName;
    rotate: [number, number, number];
    /** A conic projection's two standard parallels; null for the others. */
    parallels: [number, number] | null;
    scale: number;
    translate: [number, number];
  };
}

const frames = new Map<string, MapFrame>();
const FRAMES_KEPT = 64;

/**
 * The frame a region's maps are drawn in, for a film's shape: fitted to
 * the region alone, as a map of it with nothing coloured is. The same
 * region and shape give the same frame, worked out once while the
 * process runs.
 */
export async function frameFor(
  region: MapRegion,
  shape: 'wide' | 'tall',
): Promise<MapFrame> {
  const key = `${shape}|${JSON.stringify(region)}`;
  const kept = frames.get(key);
  if (kept) return kept;
  const g = await d3Geo();
  const fit = fitOf(
    g,
    { region, highlights: [], groups: [], places: [], routes: [] },
    shape,
  );
  const p = fit.projection as GeoProjection & {
    parallels?: () => [number, number];
  };
  const [l, f, y] = p.rotate();
  const [tx, ty] = p.translate();
  const frame: MapFrame = {
    region,
    shape,
    width: fit.W,
    height: fit.H,
    world: fit.world,
    resolution: fit.resolution,
    projection: {
      name: fit.name,
      rotate: [l, f, y],
      parallels:
        fit.name === 'conicEqualArea' && p.parallels ? p.parallels() : null,
      scale: p.scale(),
      translate: [tx, ty],
    },
  };
  if (frames.size >= FRAMES_KEPT) frames.delete(frames.keys().next().value!);
  frames.set(key, frame);
  return frame;
}

/** The frame of a show's one map (the editor's world.base), for a film's shape; null when it names no region code knows. */
export async function mapFrameOf(
  base: unknown,
  shape: 'wide' | 'tall',
): Promise<MapFrame | null> {
  const sound = readMapBase(base);
  const region = sound ? regionOf(readRegion(sound.region).region) : null;
  return region ? frameFor(region, shape) : null;
}

/** A frame's projection, made again from its numbers. */
function projectionOf(g: D3Geo, frame: MapFrame): GeoProjection {
  const { name, rotate, parallels, scale, translate } = frame.projection;
  const projection =
    name === 'naturalEarth1'
      ? g.geoNaturalEarth1()
      : name === 'conicEqualArea'
        ? g.geoConicEqualArea().parallels(parallels ?? [0, 0])
        : g.geoAzimuthalEqualArea();
  projection.rotate(rotate).scale(scale).translate(translate);
  if (!frame.world)
    projection.clipExtent([
      [-4, -4],
      [frame.width + 4, frame.height + 4],
    ]);
  return projection;
}

// ── Areas inside countries, drawn ─────────────────────────────────────────

/** Areas' geometries in Natural Earth's admin-1 topology, by their keys. */
function areaGeometries(keys: readonly string[]): GeometryObject[] {
  const { topology, byKey } = naturalAreas();
  const units = topology.objects.units.geometries;
  return [...new Set(keys)].flatMap((key) => {
    const i = byKey.get(key);
    return i === undefined ? [] : [units[i] as GeometryObject];
  });
}

/** Areas' land as one shape: their shared borders gone. */
function areaLand(keys: readonly string[]): MultiPolygon | null {
  const geometries = areaGeometries(keys);
  if (!geometries.length) return null;
  return merge(
    naturalAreas().topology as unknown as Topology,
    geometries as never,
  );
}

/** A country's areas, by their keys: the country as admin-1 draws it. */
const keysOfCountries = (countries: readonly string[]) =>
  countries.flatMap((c) => areasOf(c));

/**
 * Land as one shape: countries alone from world-atlas, as the map's own
 * borders are; with areas, all of it from admin-1, a country as its areas.
 */
function landShape(land: MapLand, atlas: Atlas): MultiPolygon | null {
  if (!land.keys.length) {
    const fine = atlasOf('50m');
    const from = land.countries.every((c) => atlas.byName.has(c))
      ? atlas
      : fine;
    const wanted = new Set(land.countries);
    const geometries = (
      from.topology.objects.countries as GeometryCollection<{ name: string }>
    ).geometries.filter((one) =>
      wanted.has(
        (one as unknown as { properties?: { name?: string } }).properties
          ?.name ?? '',
      ),
    );
    return geometries.length ? merge(from.topology, geometries as never) : null;
  }
  return areaLand([...land.keys, ...keysOfCountries(land.countries)]);
}

/**
 * The border two lands share, as lines: from world-atlas where both are
 * countries, from admin-1 where either has areas; none where they do not
 * meet.
 */
function sharedBorder(
  a: MapLand,
  b: MapLand,
  atlas: Atlas,
): ReturnType<typeof mesh> | null {
  if (!a.keys.length && !b.keys.length) {
    const fine = atlasOf('50m');
    const all = [...a.countries, ...b.countries];
    const from = all.every((c) => atlas.byName.has(c)) ? atlas : fine;
    const nameOf = (one: GeometryObject) =>
      (one as unknown as { properties?: { name?: string } }).properties?.name ??
      '';
    const [inA, inB] = [new Set(a.countries), new Set(b.countries)];
    const line = mesh(
      from.topology,
      from.topology.objects.countries as GeometryObject,
      (x, y) =>
        x !== y &&
        ((inA.has(nameOf(x)) && inB.has(nameOf(y))) ||
          (inA.has(nameOf(y)) && inB.has(nameOf(x)))),
    );
    return line.coordinates.length ? line : null;
  }
  const { topology } = naturalAreas();
  const [inA, inB] = [
    new Set(areaGeometries([...a.keys, ...keysOfCountries(a.countries)])),
    new Set(areaGeometries([...b.keys, ...keysOfCountries(b.countries)])),
  ];
  const line = mesh(
    topology as unknown as Topology,
    topology.objects.units as unknown as GeometryObject,
    (x, y) =>
      x !== y && ((inA.has(x) && inB.has(y)) || (inA.has(y) && inB.has(x))),
  );
  return line.coordinates.length ? line : null;
}

// ── The map, drawn ────────────────────────────────────────────────────────

export interface DrawnMap {
  svg: string;
  viewBox: [number, number, number, number];
  parts: Record<string, string>;
  /** In a tall film, the names the map writes itself: part name to its label's group. */
  labels: Record<string, string>;
  /** In a wide one, the names as labels the stage sets beside the map. */
  callouts: Callout[];
  /** For the specs and the logs: what was drawn, and what could not be. */
  projection: string;
  resolution: '50m' | '110m';
  /** Places and routes that fell outside the map, left off. */
  outside: string[];
  /** Drawn in the show's one map's frame: its drawing is exactly the frame, kept as it is. */
  framed: boolean;
  /** Whether it says it is drawn with today's borders. */
  period: boolean;
}

/** The size the map writes its names at: its own, or its audience's smallest text where that is larger. */
function labelSize(
  shape: 'wide' | 'tall',
  W: number,
  H: number,
  text?: number,
): number {
  const own = FRAME[shape].text;
  if (!text) return own;
  // The drawing's units to one of the stage's, the map alone on the stage.
  const room = EXACT_ROOM[shape];
  const k = 1 / Math.min(room.w / W, room.h / H);
  return Math.max(own, Math.round(text * k));
}

/** A name of two words or more on two lines, broken where the longer is shortest; null for one word. */
function twoLines(text: string, size: number): [string, string] | null {
  const words = text.split(' ').filter(Boolean);
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let widest = Infinity;
  for (let i = 1; i < words.length; i++) {
    const one: [string, string] = [
      words.slice(0, i).join(' '),
      words.slice(i).join(' '),
    ];
    const w = Math.max(...one.map((line) => measureText(line, size, 700)));
    if (w < widest) [best, widest] = [one, w];
  }
  return best;
}

/**
 * A map, drawn: its SVG, each highlight, area, named region, seam, pin,
 * place and route a part, and the names as labels for the stage. Given a
 * frame (the show's one map), or a spec drawn in the show's (spec.base),
 * it is drawn exactly into it. One that would weigh too much to play
 * smoothly on a phone (a coast of a thousand islands) is drawn again with
 * its outlines thinned further, as many as three times; a framed map
 * keeps its coastlines as they are, so the show's map is the same in
 * every scene, and thins only what it colours.
 */
export async function renderMap(
  spec: MapSpec,
  shape: 'wide' | 'tall' = 'wide',
  text?: number,
  frame?: MapFrame | null,
): Promise<DrawnMap> {
  const g = await d3Geo();
  const into = frame ?? (spec.base ? await frameFor(spec.base, shape) : null);
  let drawn = drawMap(g, spec, shape, THIN, into, text);
  for (let k = 1; k <= 3 && drawn.svg.length > MAP_MOST_BYTES; k++)
    drawn = drawMap(g, spec, shape, THIN * 1.7 ** k, into, text);
  return drawn;
}

/** A pin's mark: a drop on its point, a dot in its head, as maps draw them. */
function pinMark(x: number, y: number, size: number, fill: string): string {
  const R = size * 0.34;
  const h = R * 2.2;
  // The drop's sides touch its head where a line from its point would.
  const across = R * Math.sqrt(1 - (R / h) ** 2);
  const up = h - (R * R) / h;
  return (
    `<path d="M${r(x)} ${r(y)}L${r(x - across)} ${r(y - up)}A${r(R)} ${r(R)} 0 1 1 ${r(x + across)} ${r(y - up)}Z" fill="${fill}" stroke="${HALO}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<circle cx="${r(x)}" cy="${r(y - h)}" r="${r(R * 0.4)}" fill="${HALO}"/>`
  );
}

function drawMap(
  g: D3Geo,
  spec: MapSpec,
  shape: 'wide' | 'tall',
  thin: number,
  frame: MapFrame | null,
  text?: number,
): DrawnMap {
  const fit: Fit = frame
    ? {
        projection: projectionOf(g, frame),
        name: frame.projection.name,
        W: frame.width,
        H: frame.height,
        world: frame.world,
        resolution: frame.resolution,
      }
    : fitOf(g, spec, shape);
  const { projection, W, H, world, resolution } = fit;
  // In a frame, the show's region is the map's own: the same land in white in every scene.
  const shownRegion = frame ? frame.region : spec.region;
  const wanted = [
    ...shownRegion.countries,
    ...spec.highlights.flatMap((h) => h.countries),
  ];
  const atlas = atlasOf(resolution);
  const known = (name: string) =>
    atlas.byName.get(name) ?? atlasOf('50m').byName.get(name);
  const showsAntarctica = wanted.includes('Antarctica');
  const countries = atlas.countries.filter(
    (f) => showsAntarctica || f.properties.name !== 'Antarctica',
  );
  const drawer = (speck: number, by: number) =>
    g
      .geoPath({
        stream: (s: GeoStream) => projection.stream(thinned(s, speck, by)),
      })
      .digits(1);
  // The show's land is drawn the same in every scene: only what a map
  // colours is thinned further to keep it light.
  const baseThin = frame ? THIN : thin;
  const path = drawer(SPECK * (baseThin / THIN) ** 2, baseThin);
  const finePath = drawer(0, thin);
  const size = labelSize(shape, W, H, text);

  // Who is in the region, who colours, who is a neighbour.
  const region = new Set(
    world ? countries.map((f) => f.properties.name) : shownRegion.countries,
  );
  const collection = (list: CountryFeature[]): FeatureCollection => ({
    type: 'FeatureCollection',
    features: list,
  });
  const out: string[] = [];
  const parts: Record<string, string> = {};
  const callouts: Callout[] = [];
  const outside: string[] = [];
  const ids = new Set<string>();
  const idFor = (prefix: string, name: string) => {
    const slug = groupId(name.normalize('NFD').replace(/\p{M}/gu, '')) || 'x';
    let id = `${prefix}-${slug}`;
    for (let k = 2; ids.has(id); k++) id = `${prefix}-${slug}-${k}`;
    ids.add(id);
    return id;
  };

  out.push(
    `<style>@keyframes show{from{opacity:0}to{opacity:1}}` +
      `@keyframes pop{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:none}}` +
      `@keyframes draw{from{stroke-dashoffset:var(--l)}to{stroke-dashoffset:0}}` +
      `.show{animation:show .6s ease-out both}` +
      `.pop{transform-box:fill-box;transform-origin:center;animation:pop .45s ease-out both}` +
      `.route{stroke-dasharray:var(--l);animation:draw 1.4s ease-in-out both}</style>`,
  );
  // The sea, and the world's own edge on a map of all of it.
  if (world)
    out.push(
      `<path d="${g.geoPath(projection).digits(1)({ type: 'Sphere' })}" fill="${SEA}" fill-opacity="0.14" stroke="${MUTED}" stroke-opacity="0.5" stroke-width="1.5"/>`,
    );
  else
    out.push(
      `<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="${SEA}" fill-opacity="0.14"/>`,
      // The land cut at the frame, never stroked along it.
      `<defs><clipPath id="map-frame"><rect x="0" y="0" width="${W}" height="${H}" rx="14"/></clipPath></defs>`,
      `<g clip-path="url(#map-frame)">`,
    );
  // The land: all of it once, muted, its outline the coast; the region
  // white over it; each merged, so no border is drawn twice.
  const geometries = (
    atlas.topology.objects.countries as GeometryCollection<{ name: string }>
  ).geometries;
  const nameOf = (a: GeometryObject): string => {
    const properties = (a as unknown as { properties?: { name?: string } })
      .properties;
    return properties?.name ?? '';
  };
  const kept = (a: GeometryObject) =>
    showsAntarctica || nameOf(a) !== 'Antarctica';
  const land = path(merge(atlas.topology, geometries.filter(kept) as never));
  if (land)
    out.push(
      `<defs><path id="map-land" d="${land}"/></defs>`,
      `<use href="#map-land" fill="${world ? LAND : NEIGHBOUR}"/>`,
    );
  /** The region's land on the drawing: where a key or a note would hide it. */
  let regionRings: Point[][] = [];
  if (!world) {
    const shownLand = merge(
      atlas.topology,
      geometries.filter((a) => region.has(nameOf(a))) as never,
    );
    const shown = path(shownLand);
    if (shown) out.push(`<path d="${shown}" fill="${LAND}"/>`);
    regionRings = ringsOf(g, projection, shownLand);
  }
  /** Where in each coloured land its name may sit, the roomiest first. */
  const spotsOf = new Map<string, Point[]>();
  const ringsOf_ = new Map<string, Point[][]>();
  /** What is coloured on the drawing, for a key or a note to keep off. */
  const colouredRings: Point[][] = [];
  /** A colour group's colour: the show's, a named region's of its name, else the map's own. */
  const colourOfGroup = (group: number) => {
    const token = spec.groupColours?.[group];
    return token ? mapColourHex(token) : groupColour(group, spec.groups.length);
  };
  let shownSoFar = 0;
  const later = () => (0.3 + Math.min(1.6, shownSoFar++ * 0.12)).toFixed(2);
  /**
   * A coloured land, one part: its fill in its colour, ringed when too
   * small to see, its name a label where it asks for one.
   */
  const colourLand = (
    prefix: string,
    name: string,
    geometry: Geometry | FeatureCollection | null,
    fill: string,
    label: boolean,
    also: readonly string[] = [],
  ) => {
    if (!geometry) {
      outside.push(name);
      return;
    }
    // A small one is drawn whole, however small: it is what the map is about.
    const d = finePath(geometry as never);
    const rings =
      geometry.type === 'FeatureCollection'
        ? geometry.features.flatMap((f) =>
            f.geometry ? ringsOf(g, projection, f.geometry) : [],
          )
        : ringsOf(g, projection, geometry);
    const box = boxOf(rings);
    if (!d || !box) {
      outside.push(name);
      return;
    }
    const id = idFor(prefix, name);
    parts[name] = id;
    for (const one of also) if (!parts[one]) parts[one] = id;
    // One too small to see is ringed in its colour.
    const small = box[2] * box[3] < 140;
    const spots = insidePoints(rings);
    const at = spots[0] ?? [box[0] + box[2] / 2, box[1] + box[3] / 2];
    spotsOf.set(name, spots.slice(0, 16));
    ringsOf_.set(name, rings);
    colouredRings.push(...rings);
    out.push(
      `<g id="${id}"><g class="show" style="animation-delay:${later()}s">` +
        `<path d="${d}" fill="${fill}" stroke="${HALO}" stroke-width="0.8" stroke-linejoin="round"/>` +
        (small
          ? `<circle cx="${r(at[0])}" cy="${r(at[1])}" r="11" fill="none" stroke="${fill}" stroke-width="3"/>`
          : '') +
        `</g></g>`,
    );
    if (label)
      callouts.push({
        part: name,
        text: name,
        anchor: [r(at[0]), r(at[1])],
        box,
      });
  };
  // The areas' own borders, faint, in the countries whose areas the map
  // colours: what an area is cut from, where nothing covers it.
  const areaCountries = new Set(
    [
      ...(spec.areas ?? []).flatMap((a) => a.countries),
      ...(spec.merged ?? []).flatMap((m) => countriesOfAreas(m.keys)),
    ].filter((c) => areasOf(c).length <= AREA_LINES_MOST),
  );
  if (areaCountries.size) {
    const { topology } = naturalAreas();
    const countryOf = (one: GeometryObject) =>
      (one as unknown as { properties?: { c?: string } }).properties?.c ?? '';
    const lines = path(
      mesh(
        topology as unknown as Topology,
        topology.objects.units as unknown as GeometryObject,
        (a, b) =>
          a !== b &&
          countryOf(a) === countryOf(b) &&
          areaCountries.has(countryOf(a)),
      ),
    );
    if (lines)
      out.push(
        `<path d="${lines}" fill="none" stroke="${MUTED}" stroke-opacity="0.3" stroke-width="0.9" stroke-linejoin="round"/>`,
      );
  }
  // The named regions, each one shape in its colour; then the countries
  // and the areas coloured, over them, one part each, coming in one after
  // another.
  for (const group of spec.merged ?? [])
    colourLand(
      'group',
      group.name,
      landShape(group, atlas),
      mapColourHex(group.colour),
      group.label,
    );
  spec.highlights.forEach((h) => {
    const features = h.countries.flatMap((c) => {
      const f = known(c);
      return f ? [f] : [];
    });
    colourLand(
      'country',
      h.name,
      features.length ? collection(features) : null,
      h.colour ? mapColourHex(h.colour) : colourOfGroup(h.group),
      h.label,
      h.countries,
    );
  });
  for (const area of spec.areas ?? [])
    colourLand(
      'area',
      area.name,
      areaLand(area.keys),
      area.colour ? mapColourHex(area.colour) : colourOfGroup(area.group),
      area.label,
    );
  // Lakes, as the sea is, over the land and its colours: a lake is not a
  // country's. A river or a lake the voice names is a part of its own.
  const lakeFeatures = (lakes: NaturalLake[]): FeatureCollection => ({
    type: 'FeatureCollection',
    features: lakes.flatMap((lake) =>
      lake.polygons.map((coordinates): Feature => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates },
      })),
    ),
  });
  const ownLakes = new Set(
    spec.places.flatMap((p) => (p.lake ? [p.lake] : [])),
  );
  const waters = new Map<string, string>();
  const water = (
    place: MapSpec['places'][number],
    i: number,
    d: string | null | undefined,
    look: string,
  ) => {
    if (!d) return;
    const id = idFor('place', place.name);
    waters.set(place.name, id);
    const delay = (0.5 + i * 0.15).toFixed(2);
    out.push(
      `<g id="${id}"><g class="show" style="animation-delay:${delay}s">${look.replace(/\{d\}/g, d)}</g></g>`,
    );
  };
  // A river first, so where it runs through a lake the lake covers it.
  const rivers = naturalRivers();
  spec.places.forEach((place, i) => {
    if (place.river)
      water(
        place,
        i,
        path({
          type: 'MultiLineString',
          coordinates: place.river.flatMap((one) => rivers[one] ?? []),
        }),
        `<path d="{d}" fill="none" stroke="${SEA}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
  });
  const lakes = path(
    lakeFeatures(naturalLakes().filter((lake) => !ownLakes.has(lake.name))),
  );
  if (lakes)
    out.push(
      `<path d="${lakes}" fill="${PAPER.paper}"/><path d="${lakes}" fill="${SEA}" fill-opacity="0.14" stroke="${MUTED}" stroke-width="1" stroke-opacity="0.8"/>`,
    );
  spec.places.forEach((place, i) => {
    if (place.lake)
      water(
        place,
        i,
        finePath(
          lakeFeatures(
            naturalLakes().filter((lake) => lake.name === place.lake),
          ),
        ),
        `<path d="{d}" fill="${PAPER.paper}"/><path d="{d}" fill="${SEA}" fill-opacity="0.5" stroke="${SEA}" stroke-width="1.5"/>`,
      );
  });
  // Borders thin and the coast clean, over the land and its colours.
  const borders = path(
    mesh(
      atlas.topology,
      atlas.topology.objects.countries as GeometryObject,
      (a, b) => a !== b && kept(a) && kept(b),
    ),
  );
  if (borders)
    out.push(
      `<path d="${borders}" fill="none" stroke="${MUTED}" stroke-opacity="0.55" stroke-width="1.1" stroke-linejoin="round"/>`,
    );
  if (land)
    out.push(
      `<use href="#map-land" fill="none" stroke="${MUTED}" stroke-width="1.5" stroke-linejoin="round"/>`,
    );
  // Seams: the border two lands share, over everything the land has, a
  // line of its own the voice can point at: dashed as a line drawn on a
  // map, or glowing.
  (spec.seams ?? []).forEach((seam, i) => {
    const line = sharedBorder(seam.a, seam.b, atlas);
    const d = line ? finePath(line) : null;
    if (!d) {
      outside.push(seam.name);
      return;
    }
    const id = idFor('seam', seam.name);
    parts[seam.name] = id;
    const delay = (0.8 + i * 0.3).toFixed(2);
    const look =
      seam.style === 'glow'
        ? `<path d="${d}" fill="none" stroke="${PAPER.accent}" stroke-opacity="0.35" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>` +
          `<path d="${d}" fill="none" stroke="${PAPER.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${d}" fill="none" stroke="${HALO}" stroke-opacity="0.85" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` +
          `<path d="${d}" fill="none" stroke="${INK}" stroke-width="4" stroke-dasharray="12 9" stroke-linecap="round" stroke-linejoin="round"/>`;
    out.push(
      `<g id="${id}"><g class="show" style="animation-delay:${delay}s">${look}</g></g>`,
    );
  });
  if (!world) out.push('</g>');

  // Routes: from one end to the other, a curve that draws itself, its arrow at the end.
  const pointOf = (end: RouteEnd): Point | null => {
    if (end.at) {
      const p = projection(end.at);
      return p ? [p[0], p[1]] : null;
    }
    const rings = end.countries.flatMap((c) => {
      const f = known(c);
      return f ? ringsOf(g, projection, mainlandOf(g, f).geometry) : [];
    });
    return insidePoint(rings);
  };
  const within = ([x, y]: Point) => x >= 0 && x <= W && y >= 0 && y <= H;
  spec.routes.forEach((route, i) => {
    const a = pointOf(route.from);
    const b = pointOf(route.to);
    if (!a || !b || !within(a) || !within(b)) {
      outside.push(route.name);
      return;
    }
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const length = Math.hypot(dx, dy);
    if (length < 4) return;
    // Bowed to one side, a fifth of its length: a journey, not a border.
    const c: Point = [
      (a[0] + b[0]) / 2 - dy * 0.2,
      (a[1] + b[1]) / 2 + dx * 0.2,
    ];
    // Stops short of the end for its arrowhead.
    const tx = b[0] - c[0];
    const ty = b[1] - c[1];
    const tl = Math.hypot(tx, ty) || 1;
    const head = 18;
    const end: Point = [
      b[0] - (tx / tl) * head * 0.6,
      b[1] - (ty / tl) * head * 0.6,
    ];
    const curve = Math.ceil(length * 1.08) + 4;
    const id = idFor('route', route.name);
    parts[route.name] = id;
    const nx = -ty / tl;
    const ny = tx / tl;
    const tip: Point = b;
    const back: Point = [b[0] - (tx / tl) * head, b[1] - (ty / tl) * head];
    const delay = (0.6 + i * 0.5).toFixed(2);
    out.push(
      `<g id="${id}">` +
        `<path class="route" style="--l:${curve};animation-delay:${delay}s" d="M${r(a[0])} ${r(a[1])}Q${r(c[0])} ${r(c[1])} ${r(end[0])} ${r(end[1])}" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>` +
        `<path class="show" style="animation-delay:${(Number(delay) + 1.2).toFixed(2)}s" d="M${r(tip[0])} ${r(tip[1])}L${r(back[0] + nx * head * 0.5)} ${r(back[1] + ny * head * 0.5)}L${r(back[0] - nx * head * 0.5)} ${r(back[1] - ny * head * 0.5)}Z" fill="${INK}"/>` +
        `</g>`,
    );
  });

  // Places: a mark each, and its name a label the stage sets; a sea's or a
  // desert's name written across it.
  const written: [number, number, number, number][] = [];
  /** Where a river is named: the middle of its longest run in the middle of the map. */
  const riverPoint = (stretches: string[]): Point | null => {
    const all = naturalRivers();
    const inner = (q: Point) =>
      q[0] > W * 0.12 && q[0] < W * 0.88 && q[1] > H * 0.12 && q[1] < H * 0.88;
    let best: Point[] = [];
    for (const line of stretches.flatMap((one) => all[one] ?? [])) {
      let run: Point[] = [];
      for (const v of line) {
        const q = projection(v);
        if (q && inner([q[0], q[1]])) run.push([q[0], q[1]]);
        else run = [];
        if (run.length > best.length) best = [...run];
      }
    }
    return best.length ? best[Math.floor(best.length / 2)] : null;
  };
  spec.places.forEach((place, i) => {
    // A sea is named at the first of its points well in view.
    const inView = (q: Point | null) =>
      q && q[0] > W * 0.1 && q[0] < W * 0.9 && q[1] > H * 0.1 && q[1] < H * 0.9;
    const seaPoint = () =>
      [[place.lon, place.lat] as [number, number], ...(place.alts ?? [])]
        .map((at) => projection(at))
        .find(inView) ?? null;
    const p: Point | null = place.river
      ? riverPoint(place.river)
      : place.alts
        ? seaPoint()
        : projection([place.lon, place.lat]);
    if (!p || !within([p[0], p[1]])) {
      outside.push(place.name);
      return;
    }
    const [x, y] = [r(p[0]), r(p[1])];
    const water = waters.get(place.name);
    if (water) {
      // Drawn as itself: named along it, or in it.
      parts[place.name] = water;
      callouts.push({
        part: place.name,
        text: place.name,
        anchor: [x, y],
        box: [r(x - 10), r(y - 10), 20, 20],
      });
      return;
    }
    const id = idFor('place', place.name);
    parts[place.name] = id;
    const delay = (0.5 + i * 0.15).toFixed(2);
    if (place.kind === 'sea' || place.kind === 'area') {
      const s = place.kind === 'sea' ? size * 0.85 : size * 0.8;
      const w = measureText(place.name, s, 600) * 1.05;
      // Moved down out of the way of a name already written there.
      let ty = y + s * 0.35;
      for (const [ox, oy, ow, oh] of written)
        if (
          x - w / 2 < ox + ow &&
          x + w / 2 > ox &&
          ty - s < oy + oh &&
          ty > oy
        )
          ty = oy + oh + s;
      // Inside the frame, whole.
      const tx = Math.min(Math.max(x, w / 2 + 8), W - w / 2 - 8);
      ty = Math.min(Math.max(ty, s + 8), H - 10);
      written.push([tx - w / 2, ty - s, w, s * 1.2]);
      out.push(
        `<g id="${id}"><text class="show" style="animation-delay:${delay}s" x="${r(tx)}" y="${r(ty)}" font-size="${r(s)}" font-style="italic" font-weight="600" letter-spacing="1" fill="${place.kind === 'sea' ? SEA : MUTED}" text-anchor="middle" paint-order="stroke" stroke="${HALO}" stroke-width="4" stroke-opacity="0.7">${escape(place.name)}</text></g>`,
      );
      return;
    }
    const mark =
      place.kind === 'mountain'
        ? `<path d="M${x} ${r(y - 13)}L${r(x + 12)} ${r(y + 8)}L${r(x - 12)} ${r(y + 8)}Z" fill="${INK}" stroke="${HALO}" stroke-width="3" stroke-linejoin="round"/>`
        : place.kind === 'capital'
          ? `<circle cx="${x}" cy="${y}" r="9" fill="${HALO}" stroke="${INK}" stroke-width="3.5"/><circle cx="${x}" cy="${y}" r="3.6" fill="${INK}"/>`
          : place.kind === 'river' || place.kind === 'lake'
            ? `<circle cx="${x}" cy="${y}" r="8" fill="${SEA}" stroke="${HALO}" stroke-width="3"/>`
            : place.kind === 'landmark'
              ? `<path d="M${x} ${r(y - 11)}L${r(x + 11)} ${y}L${x} ${r(y + 11)}L${r(x - 11)} ${y}Z" fill="${INK}" stroke="${HALO}" stroke-width="3" stroke-linejoin="round"/>`
              : `<circle cx="${x}" cy="${y}" r="7.5" fill="${INK}" stroke="${HALO}" stroke-width="3"/>`;
    written.push([x - 12, y - 12, 24, 24]);
    out.push(
      `<g id="${id}"><g class="pop" style="animation-delay:${delay}s">${mark}</g></g>`,
    );
    callouts.push({
      part: place.name,
      text: place.name,
      anchor: [x, y],
      box: [r(x - 10), r(y - 10), 20, 20],
    });
  });

  // Pins: a drop on the place's point (an area's or a country's middle),
  // a number on a card beside its head, and its name a label.
  (spec.pins ?? []).forEach((pin, i) => {
    let p: Point | null = null;
    if (pin.at) {
      const q = projection(pin.at);
      p = q ? [q[0], q[1]] : null;
    } else {
      const shape = landShape(pin, atlas);
      p = shape ? insidePoint(ringsOf(g, projection, shape)) : null;
    }
    if (!p || !within(p)) {
      outside.push(pin.name);
      return;
    }
    const [x, y] = [r(p[0]), r(p[1])];
    const id = idFor('pin', pin.name);
    parts[pin.name] = id;
    const R = size * 0.34;
    const head: Point = [x, y - R * 2.2];
    let card = '';
    if (pin.number) {
      const s = Math.round(size * 0.85);
      const w = measureText(pin.number, s, 700) * 1.08 + s * 0.8;
      const h = s * 1.35;
      // Beside its head, on the side with room.
      const right = head[0] + R + 8 + w <= W - 6;
      const cx = right ? head[0] + R + 8 : head[0] - R - 8 - w;
      const cy = Math.min(Math.max(head[1] - h / 2, 6), H - 6 - h);
      written.push([cx, cy, w, h]);
      card =
        `<rect x="${r(cx)}" y="${r(cy)}" width="${r(w)}" height="${r(h)}" rx="${r(h * 0.3)}" fill="${HALO}" stroke="${INK}" stroke-width="2.5"/>` +
        `<text x="${r(cx + w / 2)}" y="${r(cy + h * 0.72)}" font-size="${s}" font-weight="800" fill="${INK}" text-anchor="middle">${escape(pin.number)}</text>`;
    }
    written.push([head[0] - R, head[1] - R, R * 2, R * 2.2 + R]);
    out.push(
      `<g id="${id}"><g class="pop" style="animation-delay:${(0.7 + i * 0.2).toFixed(2)}s">${pinMark(x, y, size, PAPER.accent)}${card}</g></g>`,
    );
    callouts.push({
      part: pin.name,
      text: pin.label ?? pin.name,
      anchor: [r(head[0]), r(head[1])],
      box: [r(head[0] - 10), r(head[1] - 10), 20, 20],
    });
  });

  // The key (each named group's colour and name) and the note of a map of
  // the past: in a frame, each in the corner where it hides least of the
  // land and what is coloured, so the drawing stays the frame; otherwise
  // the key under the map, as before, and the note in its corner.
  const keyRows = [
    ...spec.groups
      .map((name, i) => ({ name, colour: colourOfGroup(i), i }))
      .filter(
        (one) =>
          one.name &&
          !(spec.merged ?? []).some(
            (m) => m.label && placeKey(m.name) === placeKey(one.name),
          ) &&
          [...spec.highlights, ...(spec.areas ?? [])].some(
            (h) => h.group === one.i && parts[h.name],
          ),
      ),
    ...(spec.merged ?? [])
      .filter((m) => !m.label && parts[m.name])
      .map((m) => ({ name: m.name, colour: mapColourHex(m.colour), i: -1 })),
  ];
  const corners = (w: number, h: number) => {
    const m = 10;
    return [
      [m, H - m - h],
      [W - m - w, H - m - h],
      [m, m],
      [W - m - w, m],
    ].map(([x, y]): [number, number, number, number] => [x, y, w, h]);
  };
  /** How much of what matters a box would hide: the region's land, what is coloured, the marks and names written. */
  const hides = ([x, y, w, h]: [number, number, number, number]) => {
    let n = 0;
    for (let i = 0; i <= 6; i++)
      for (let j = 0; j <= 4; j++) {
        const q: Point = [x + (w * i) / 6, y + (h * j) / 4];
        if (colouredRings.length && pointIn(colouredRings, q)) n += 3;
        else if (regionRings.length && pointIn(regionRings, q)) n += 1;
      }
    for (const [ox, oy, ow, oh] of written)
      if (x < ox + ow && x + w > ox && y < oy + oh && y + h > oy) n += 10;
    return n;
  };
  const taken: [number, number, number, number][] = [];
  const cornerFor = (w: number, h: number) => {
    const free = corners(w, h).filter(
      (b) =>
        !taken.some(
          (t) =>
            b[0] < t[0] + t[2] &&
            b[0] + b[2] > t[0] &&
            b[1] < t[1] + t[3] &&
            b[1] + b[3] > t[1],
        ),
    );
    const best = free.reduce<{
      box: [number, number, number, number];
      n: number;
    } | null>((most, box) => {
      const n = hides(box);
      return !most || n < most.n ? { box, n } : most;
    }, null);
    return best?.box ?? null;
  };
  const framed = frame !== null;
  if (framed && keyRows.length) {
    const s = Math.round(size * 0.8);
    const swatch = Math.round(s * 1.05);
    const rowH = Math.round(s * 1.5);
    const pad = Math.round(s * 0.6);
    const w =
      pad * 2 +
      swatch +
      10 +
      Math.max(...keyRows.map((one) => measureText(one.name, s, 600)));
    const h = pad * 2 + rowH * keyRows.length - (rowH - swatch);
    const box = cornerFor(w, h);
    if (box) {
      taken.push(box);
      written.push(box);
      out.push(
        `<g id="key"><rect x="${r(box[0])}" y="${r(box[1])}" width="${r(w)}" height="${r(h)}" rx="10" fill="${HALO}" fill-opacity="0.88" stroke="${MUTED}" stroke-opacity="0.35" stroke-width="1.5"/>` +
          keyRows
            .map((one, k) => {
              const y = box[1] + pad + k * rowH;
              return (
                `<rect x="${r(box[0] + pad)}" y="${r(y)}" width="${swatch}" height="${swatch}" rx="5" fill="${one.colour}"/>` +
                `<text x="${r(box[0] + pad + swatch + 10)}" y="${r(y + swatch * 0.82)}" font-size="${s}" font-weight="600" fill="${INK}">${escape(one.name)}</text>`
              );
            })
            .join('') +
          `</g>`,
      );
    }
  }
  if (spec.period) {
    const s = Math.round(size * 0.55);
    const w = measureText(PERIOD_NOTE, s, 600) + s;
    const h = s * 1.6;
    // Its own corner: the bottom right's, unless the key is there.
    const box = cornerFor(w, h);
    if (box) {
      taken.push(box);
      written.push(box);
      out.push(
        `<g id="period"><text x="${r(box[0] + w / 2)}" y="${r(box[1] + h * 0.7)}" font-size="${s}" font-style="italic" font-weight="600" fill="${MUTED}" text-anchor="middle" paint-order="stroke" stroke="${HALO}" stroke-width="${r(s * 0.25)}" stroke-linejoin="round">${escape(PERIOD_NOTE)}</text></g>`,
      );
    }
  }

  // The map writes its names itself, as a map does: each beside its mark
  // (a country's in it), clear of the others, the marks and the frame's
  // edge, as a label the stage shows from the start, or when the voice
  // first points at it (a drawing's labels).
  const labels: Record<string, string> = {};
  if (callouts.length) {
    const ls = Math.round(size * 0.9);
    const taken: [number, number, number, number][] = [...written];
    const overlaps = (a: [number, number, number, number]) =>
      taken.some(
        (b) =>
          a[0] < b[0] + b[2] &&
          a[0] + a[2] > b[0] &&
          a[1] < b[1] + b[3] &&
          a[1] + a[3] > b[1],
      );
    const inside = ([x, y, w, h]: [number, number, number, number]) =>
      x >= 6 && y >= 6 && x + w <= W - 6 && y + h <= H - 6;
    /** Where a name goes at a size: the first place clear of the rest, and whether it is beside what it names. */
    const spotFor = (
      callout: Callout,
      size: number,
      lines: readonly string[] = [callout.text],
    ) => {
      const w =
        Math.max(...lines.map((line) => measureText(line, size, 700))) + 4;
      const lineH = size * 1.15;
      const h = lineH * lines.length;
      const [ax, ay] = callout.anchor;
      const mark = (callout.box?.[2] ?? 0) <= 24;
      const gap = 16;
      const spots = spotsOf.get(callout.part) ?? [];
      const tries: [number, number][] = mark
        ? [
            [ax + gap, ay - h / 2],
            [ax - gap - w, ay - h / 2],
            [ax - w / 2, ay - gap - h],
            [ax - w / 2, ay + gap],
            [ax + gap, ay - h - 2],
            [ax + gap, ay + 2],
            [ax - gap - w, ay - h - 2],
            [ax - gap - w, ay + 2],
          ]
        : // In the country: where it has most room, clear of the rest.
          spots.map(([x, y]): [number, number] => [x - w / 2, y - h / 2]);
      const near = tries.length;
      // Failing those, farther out, ring by ring, with a line to what it names.
      for (let k = mark ? 1 : 0; k <= 4; k++) {
        const d = gap + k * h * 0.9;
        const e = d * 0.7;
        tries.push(
          [ax + d, ay - h / 2],
          [ax - d - w, ay - h / 2],
          [ax - w / 2, ay - d - h],
          [ax - w / 2, ay + d],
          [ax + e, ay - e - h],
          [ax + e, ay + e],
          [ax - e - w, ay - e - h],
          [ax - e - w, ay + e],
        );
      }
      const boxes = tries.map(([x, y]): [number, number, number, number] => [
        x,
        y,
        w,
        h,
      ]);
      const clamp = ([x, y]: [number, number, number, number]): [
        number,
        number,
        number,
        number,
      ] => [
        Math.min(Math.max(6, x), W - 6 - w),
        Math.min(Math.max(6, y), H - 6 - h),
        w,
        h,
      ];
      // A country's name inside it reads as its own only if it is mostly in it.
      const rings = ringsOf_.get(callout.part);
      const within = (b: [number, number, number, number], i: number) => {
        if (mark || i >= near || !rings) return true;
        const [x, y, bw] = b;
        // Along the middle of each of its lines.
        const probes: Point[] = lines.flatMap((_, k) =>
          [0.5, 0.1, 0.9, 0.3, 0.7].map((f): Point => [
            x + bw * f,
            y + lineH * (k + 0.5),
          ]),
        );
        return (
          probes.filter((q) => pointIn(rings, q)).length >= probes.length * 0.8
        );
      };
      const at = boxes.findIndex(
        (b, i) => inside(b) && !overlaps(b) && within(b, i),
      );
      const box =
        at >= 0
          ? boxes[at]
          : (boxes.map(clamp).find((b) => !overlaps(b)) ?? clamp(boxes[0]));
      return { box, h, size, lines, near: at >= 0 && at < near };
    };
    // Marks first, where they must be; then the countries, which have room.
    const order = [...callouts].sort(
      (a, b) =>
        Number((b.box?.[2] ?? 0) <= 24) - Number((a.box?.[2] ?? 0) <= 24),
    );
    for (const callout of order) {
      // On two lines, or smaller, if that puts it beside what it names: a
      // long name in a narrow land ("Western Region") inside it, not out
      // past its edge.
      const mark = (callout.box?.[2] ?? 0) <= 24;
      const two = mark ? null : twoLines(callout.text, ls);
      let spot = spotFor(callout, ls);
      for (const [at, lines] of [
        ...(two ? [[ls, two] as const] : []),
        [Math.round(ls * 0.8), [callout.text]] as const,
        ...(two ? [[Math.round(ls * 0.8), two] as const] : []),
      ]) {
        if (spot.near) break;
        const other = spotFor(callout, at, lines);
        if (other.near) spot = other;
      }
      const { box, h } = spot;
      const [ax, ay] = callout.anchor;
      taken.push(box);
      const id = idFor('label', callout.part);
      labels[callout.part] = id;
      // Set away from what it names: a line from it to the name.
      const end: Point = [
        Math.min(Math.max(ax, box[0]), box[0] + box[2]),
        Math.min(Math.max(ay, box[1]), box[1] + box[3]),
      ];
      const reach = Math.hypot(end[0] - ax, end[1] - ay);
      const leader =
        !spot.near && reach > 6
          ? `<path d="M${r(ax + ((end[0] - ax) * Math.min(10, reach / 2)) / reach)} ${r(ay + ((end[1] - ay) * Math.min(10, reach / 2)) / reach)}L${r(end[0])} ${r(end[1])}" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`
          : '';
      const look = `font-size="${spot.size}" font-weight="700" fill="${INK}" paint-order="stroke" stroke="${HALO}" stroke-width="${r(spot.size * 0.2)}" stroke-linejoin="round"`;
      const lineH = h / spot.lines.length;
      out.push(
        `<g id="${id}">${leader}` +
          (spot.lines.length === 1
            ? `<text x="${r(box[0] + 2)}" y="${r(box[1] + h * 0.8)}" ${look}>${escape(callout.text)}</text>`
            : // Its lines centred on each other, as a region's name is set.
              `<text text-anchor="middle" ${look}>${spot.lines
                .map(
                  (line, k) =>
                    `<tspan x="${r(box[0] + box[2] / 2)}" y="${r(box[1] + lineH * (k + 0.8))}">${escape(line)}</tspan>`,
                )
                .join('')}</text>`) +
          `</g>`,
      );
    }
    callouts.length = 0;
  }

  // The key under the map, as it has always been, on a map with no frame.
  let height = H;
  if (!framed && keyRows.length) {
    const swatch = Math.round(size * 1.05);
    const gap = Math.round(size * 1.2);
    let x = 8;
    let y = H + Math.round(size * 0.8);
    const rows: string[] = [];
    for (const one of keyRows) {
      const w = swatch + 12 + measureText(one.name, size, 600);
      if (x > 8 && x + w > W) {
        x = 8;
        y += Math.round(size * 1.6);
      }
      rows.push(
        `<rect x="${x}" y="${y}" width="${swatch}" height="${swatch}" rx="6" fill="${one.colour}"/>` +
          `<text x="${x + swatch + 12}" y="${r(y + swatch * 0.8)}" font-size="${size}" font-weight="600" fill="${INK}">${escape(one.name)}</text>`,
      );
      x += w + gap;
    }
    out.push(`<g id="key">${rows.join('')}</g>`);
    height = y + swatch + 8;
  }
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}">${out.join('')}</svg>`,
    viewBox: [0, 0, W, height],
    parts,
    labels,
    callouts,
    projection: fit.name,
    resolution,
    outside,
    framed,
    period: Boolean(spec.period),
  };
}

/** Which continent a country is in, for the specs and the logs. */
export const continentOf = (country: string) =>
  CONTINENT_OF.get(country) ?? null;
