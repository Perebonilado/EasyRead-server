/**
 * The editor's world as the stage draws it (infographic-editor-plan §6c,
 * the world bible): its recurring people as the figure kit's people,
 * dressed as the look notes say, and its recurring places as the show's
 * sets, each built by code from a layout of the kit's own pieces, so no
 * model paints them and every episode shows them the same.
 *
 * One mapping, kept here so the illustrated scenes' builders can grow it
 * (eras, public interiors, plan views): worldSetLayout says what a kind
 * of place is made of today.
 */
import {
  MAX_PICTURES,
  type ExplainerSheet,
  type StudioBible,
  type StudioCharacter,
  type StudioSet,
} from './studio';
import type { StoryBible, StoryPlace, StoryWorld } from '../scene-story';
import { withShowMap, type MapDraft } from '../scene-map';
import {
  countryOfPart,
  placeKey,
  placeNamed,
  placesIn,
  readRegion,
} from '../scene-map-places';
import type { PaletteEntry, PaletteToken } from '../scene-palette';
import { packOfWorld, plainPack } from '../scene-style-packs';
import { withPresets } from './studio-clip';
import {
  ERA_WORDS,
  type EditorPerson,
  type EditorPlace,
  type EditorWorld,
  type WorldPlaceKind,
} from './studio-editor';

/** The kinds of place that are rooms, not out of doors. */
const INDOOR: ReadonlySet<WorldPlaceKind> = new Set([
  'hall',
  'office',
  'classroom',
  'lab',
  'home',
  'clinic',
  'workshop',
  'kitchen',
]);

/** Things along the back of a set, spaced evenly. */
const along = (
  ...kinds: (string | [string, number])[]
): { kind: string; x: number; row: string; scale: number; colour: null }[] =>
  kinds.map((one, k) => {
    const [kind, scale] = typeof one === 'string' ? [one, 1] : one;
    return {
      kind,
      x: Math.round(((k + 0.5) / kinds.length) * 100) / 100,
      row: 'back',
      scale,
      colour: null,
    };
  });

/** Before whiteboards: the eras a classroom has a blackboard in. */
const CHALK_ERAS = new Set([
  'ancient',
  'medieval',
  '1500-1800',
  '1800-1900',
  '1900-1945',
  '1945-1975',
]);

/** The story world a show's sets are drawn for: its era, and its region only where the research says one. */
export function storyWorldOf(
  world: Pick<EditorWorld, 'era' | 'region'>,
): StoryWorld {
  return {
    era: ERA_WORDS[world.era],
    region: world.region ?? '',
    culture: '',
    landscape: '',
    homes: '',
  };
}

/**
 * What a kind of place is made of, as a layout the set builder reads
 * (scene-set-layout layoutOf): its ground, what stands behind it, the
 * pieces along its back, its light, and the style pack its world says.
 */
export function worldSetLayout(
  place: Pick<EditorPlace, 'kind' | 'name' | 'look' | 'time'>,
  world: Pick<EditorWorld, 'era' | 'region'>,
): Record<string, unknown> {
  const sky = place.time;
  const by: Record<WorldPlaceKind, Record<string, unknown>> = {
    street: {
      ground: 'paving',
      backdrop: 'city',
      items: along('lamppost', 'house', 'bin', 'house', 'lamppost'),
    },
    square: {
      ground: 'paving',
      backdrop: 'city',
      items: along('house', 'lamppost', 'bench', 'lamppost', 'house'),
    },
    market: {
      ground: 'paving',
      backdrop: 'city',
      items: along('stall', 'basket', 'cart', 'parasol'),
    },
    field: {
      ground: 'grass',
      backdrop: 'fields',
      items: along('tree', 'fence', 'bush', ['tree', 0.9]),
    },
    countryside: {
      ground: 'grass',
      backdrop: 'hills',
      items: along('tree', 'bush', 'rock', ['tree', 0.9]),
    },
    coast: {
      ground: 'sand',
      backdrop: 'sea',
      items: along('rock', 'boat', 'rock'),
    },
    harbour: {
      ground: 'paving',
      backdrop: 'sea',
      items: along('boat', 'crate', 'lamppost', 'crate'),
    },
    hall: {
      ground: 'wood',
      items: along('picture', 'clock', 'bench', 'bench', 'picture'),
    },
    office: {
      ground: 'carpet',
      items: along('bookshelf', 'desk', 'picture', 'plant'),
    },
    classroom: {
      ground: 'wood',
      items: along(
        'noticeboard',
        CHALK_ERAS.has(world.era) ? 'blackboard' : 'whiteboard',
        'clock',
        'bookshelf',
      ),
    },
    lab: {
      ground: 'tiles',
      items: along('shelf', 'whiteboard', 'cupboard', 'clock'),
    },
    home: {
      ground: 'carpet',
      items: along('picture', 'curtains', 'lamp', 'plant'),
    },
    clinic: {
      ground: 'tiles',
      items: along('cupboard', 'noticeboard', 'clock', 'shelf'),
    },
    workshop: {
      ground: 'stone',
      items: along('shelf', 'table', 'crate', 'lamp'),
    },
    kitchen: {
      ground: 'tiles',
      items: along('cupboard', 'shelf', 'clock', 'plant'),
    },
    park: {
      ground: 'grass',
      backdrop: 'hills',
      items: along('tree', 'bush', 'bench', ['tree', 0.9]),
    },
  };
  const story = storyWorldOf(world);
  const words = `${place.name} ${place.look}`;
  return {
    sky,
    weather: 'clear',
    ...by[place.kind],
    // Its era and region's pack where its world says one; else a plain
    // one of no region (never one region's by default).
    style: packOfWorld(story, words) ?? plainPack(story, words),
  };
}

/** A world place as one of the show's sets: indoors or out by its kind. */
export function worldSet(place: EditorPlace): StudioSet {
  return {
    id: place.id,
    name: place.name,
    look: place.look || place.name,
    kind: INDOOR.has(place.kind) ? 'indoor' : 'outdoor',
    stand: 'on',
    front: null,
    sound: null,
  };
}

/** A world person as one of the show's cast: a person the kit draws, as their likeness says. */
export function worldCharacter(
  person: EditorPerson,
  k: number,
): StudioCharacter {
  return {
    id: person.id,
    name: person.name,
    kind: 'person',
    role: person.recurring ? 'main' : 'minor',
    look: person.likeness,
    figure: person.figure,
    size: null,
    voice: person.voice,
    voicePick: k % 3,
    traits: [],
    carries: null,
  };
}

/**
 * The show's bible for the editor's world: its people and places for the
 * illustrated scenes, its world for the sets' style, its recurring things
 * as pictures drawn the same every time; the host kept as it was (the
 * show's own, drawn by the kit), and the subject and maths as given.
 */
export function worldBible(
  world: EditorWorld,
  before: StudioBible | null,
  about: { subject: string; maths: boolean },
): StudioBible {
  const host = before?.characters.filter((c) => c.host) ?? [];
  const taken = new Set(host.map((c) => c.id));
  const people = world.people
    .filter((p) => !taken.has(p.id))
    .map(worldCharacter);
  return {
    ...(before ?? {}),
    characters: [...host, ...people],
    sets: world.places.map(worldSet),
    world: storyWorldOf(world),
    subject: about.subject,
    maths: about.maths,
    pictures: world.things.slice(0, MAX_PICTURES).map((t) => ({
      name: t.name,
      is: t.name,
      draw: t.look || t.name,
    })),
    ...(before?.things?.length ? { things: before.things } : {}),
  };
}

/**
 * An illustrated scene's places as the stage builds them: each of the
 * world's from its layout (no model asked, one take, unjudged), any other
 * as a clip's would be (a preset where code has one, else painted once).
 */
export function withWorldPlaces(
  story: StoryBible,
  world: EditorWorld | null | undefined,
): StoryBible {
  const preset = withPresets(story);
  if (!world) return preset;
  return {
    ...preset,
    places: preset.places.map((place): StoryPlace => {
      const own = world.places.find((p) => p.id === place.id);
      if (!own) return place;
      const out: StoryPlace = {
        ...place,
        layout: worldSetLayout(own, world),
      };
      delete out.once;
      return out;
    }),
  };
}

/**
 * What an editor's show holds a lesson's storyboard to as it is mended
 * (checkExplainer, mendScript): its world's colours, each thing it names
 * in its token in every scene, and the colour it holds back for the
 * payoff. Nothing for a show with no world.
 */
export function worldColours(
  world: Pick<EditorWorld, 'palette' | 'held'> | null | undefined,
): { palette?: PaletteEntry[]; held?: PaletteToken } {
  if (!world?.palette.length) return {};
  return {
    palette: world.palette.map((p) => ({ thing: p.thing, token: p.token })),
    ...(world.held ? { held: world.held.token } : {}),
  };
}

/**
 * A lesson's storyboard drawn on the show's one map, in its colours: every
 * map in it given the world's map (withShowMap), so maps in scenes one
 * after another line up and keep their regions' colours. As the board
 * writes it and again as the make draws it: done twice, the same.
 */
export function onShowMap(
  sheet: ExplainerSheet,
  world: Pick<EditorWorld, 'base' | 'palette'> | null | undefined,
): ExplainerSheet {
  if (!world) return sheet;
  const draft = withShowMap(sheet.draft, world.base ?? null, world.palette);
  return draft === sheet.draft ? sheet : { ...sheet, draft };
}

/** A name found as a key, as the words wrote it ("kano" in "In Kano, he fell ill": "Kano"); else in title case. */
function asWritten(words: string, key: string): string {
  const pattern = key
    .split(' ')
    .map((word) => word.replace(/[^a-z0-9]/gu, ''))
    .filter(Boolean)
    .join('[^\\p{L}\\p{N}]+');
  const found = pattern
    ? new RegExp(`\\b${pattern}\\b`, 'iu').exec(words)?.[0]
    : undefined;
  return (
    found ??
    key.replace(/\b(\p{L})(\p{L}*)/gu, (_, first: string, rest: string) =>
      ['of', 'and', 'the'].includes(first + rest)
        ? first + rest
        : first.toUpperCase() + rest,
    )
  );
}

/**
 * The show's map with one real place pinned on it: how a lesson shows a
 * moment that happens somewhere (explainer-animation-plan §4: a named real
 * place appears only as the map or a verified photo of it), never a
 * drawing of the place and never a card of its name. The place is the
 * first the words name that code knows (a city, a landmark, an area of a
 * country) and that is on the show's map; null when the show has no map,
 * or the words name no place on it.
 */
export function pinOnShowMap(
  words: string,
  world: Pick<EditorWorld, 'base'> | null | undefined,
): { place: string; map: MapDraft } | null {
  const base = world?.base;
  if (!base) return null;
  const region = readRegion(base.region).region;
  if (!region) return null;
  const inView = (country: string | null) =>
    region.kind === 'world' ||
    (country !== null &&
      (region.kind === 'countries'
        ? region.countries
        : region.entry.members
      ).includes(country));
  for (const found of placesIn(words)) {
    const place =
      found.kind === 'place'
        ? placeNamed(found.name)
        : found.kind === 'part'
          ? {
              name: asWritten(words, found.name),
              country: countryOfPart(found.name),
            }
          : null;
    if (!place || !inView(place.country)) continue;
    // Never the show's whole region pinned on itself.
    if (placeKey(place.name) === placeKey(base.region)) continue;
    return {
      place: place.name,
      map: {
        region: base.region,
        highlight: null,
        places: null,
        routes: null,
        pins: [{ place: place.name, label: null }],
      },
    };
  }
  return null;
}
