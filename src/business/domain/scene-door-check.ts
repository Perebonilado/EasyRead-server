/**
 * The door check (studio-door-plan), run as a scene is composed and on a
 * made film: every door, gate, wall and fence the stage draws is its
 * place's, and a door is there because the story uses it.
 *
 * - **Style.** A piece drawn for another place's pack, or for none in a
 *   place that has one (the one grey concrete doorway with its doorbell
 *   that every set once had); a door made otherwise than its place and its
 *   name make one (panels in a stable, a doorbell in an ancient town); a
 *   wall of another stuff than its place builds or its name says.
 * - **Unused.** A door no one goes through, knocks at, opens, shuts,
 *   looks at or stands by.
 * - **Open country.** A door out in a field, on a hillside, a desert or a
 *   beach, with no building it is the way into.
 */
import type { SceneDto, SceneFeatureDto } from '../../contracts';
import {
  doorMakeOf,
  wallMaterialOf,
  type DoorMake,
} from './scene-set-pieces';
import { STYLE_PACKS, type StylePackId } from './scene-style-packs';

/** A place out in open country, by its name and look. */
export const OPEN_COUNTRY =
  /\b(?:fields?|meadows?|pastures?|hills?|hillsides?|hilltops?|mountains?|mountainsides?|deserts?|dunes?|beach(?:es)?|shores?|seashores?|coasts?|riverbanks?|rivers?|lakes?|lakesides?|forests?|woods?|woodlands?|jungles?|valleys?|plains?|savann?ahs?|prairies?|wilderness|countryside|grasslands?|cliffs?|islands?|moors?|heaths?|orchards?|groves?|vineyards?|oasis|oases|clearings?)\b/iu;

/** A building a door may be the way into: named by the door, or standing in the place's look. */
export const A_BUILDING =
  /\b(?:houses?|huts?|cottages?|cabins?|sheds?|barns?|stables?|farmhouses?|inns?|shops?|stores?|church(?:es)?|temples?|mosques?|synagogues?|schools?|buildings?|homes?|kiosks?|towers?|castles?|palaces?|halls?|sheepfolds?|lighthouses?|mills?|tents?|yurts?|shacks?|cafés?|cafes?|bars?|restaurants?|garages?|stations?)\b/iu;

export interface DoorFault {
  feature: string;
  kind: 'style' | 'unused' | 'open-country';
  why: string;
}

/** A feature as the words call it: "the stable door", never "the the door". */
export const theName = (name: string) =>
  /^(?:the|a|an)\s/iu.test(name) ? name : `the ${name}`;

/** The place a scene is set in, as its backdrop's drawing is marked: its pack, and whether out of doors or in a vessel. */
function placeOf(scene: SceneDto): {
  pack: StylePackId | null;
  place: 'outdoor' | 'indoor' | 'vessel' | null;
} {
  const backdrop =
    scene.steps.find((step) => step.backdrop)?.backdrop ?? undefined;
  const thing = scene.things.find(
    (t) => t.kind === 'drawing' && (t.id === backdrop || t.id.startsWith('place-')),
  );
  const svg =
    thing?.kind === 'drawing'
      ? `${thing.svg} ${thing.layers?.[0]?.svg ?? ''}`
      : '';
  const style = /data-style="([a-z-]+)"/u.exec(svg)?.[1];
  const place = /data-place="(outdoor|indoor|vessel)"/u.exec(svg)?.[1] as
    | 'outdoor'
    | 'indoor'
    | 'vessel'
    | undefined;
  return {
    pack: style && style in STYLE_PACKS ? (style as StylePackId) : null,
    place: place ?? null,
  };
}

/** How a piece says it was made, and for which pack; null for one drawn before pieces said so. */
const madeOf = (
  feature: SceneFeatureDto,
): { make: string; pack: string } | null => {
  const svg = feature.svg ?? '';
  const make = /^<svg[^>]*\bdata-make="([a-z-]+)"/u.exec(svg)?.[1];
  const pack = /^<svg[^>]*\bdata-pack="([a-z-]+)"/u.exec(svg)?.[1];
  return make && pack ? { make, pack } : null;
};

/** Whether anyone in the scene uses a feature: goes through it, works it, looks at it, or it opens or shuts. */
function usedIn(scene: SceneDto, id: string): boolean {
  if (scene.setting?.featureStates?.some(([, f]) => f === id)) return true;
  for (const acting of Object.values(scene.acting ?? {})) {
    if (acting.interact?.some((one) => one.feature === id)) return true;
    if (acting.look?.some(([, at]) => at === `f:${id}`)) return true;
  }
  return scene.steps.some(
    (step) =>
      Object.values(step.enter ?? {}).some((one) => one.via === id) ||
      Object.values(step.exit ?? {}).some((one) => one.via === id),
  );
}

/**
 * What is wrong with a scene's doors, gates, walls and fences. `place` is
 * the set's name and look where known: without them, a door in open
 * country is not looked for.
 */
export function doorFaults(
  scene: SceneDto,
  place: { name: string; look?: string } | null = null,
): DoorFault[] {
  const out: DoorFault[] = [];
  const { pack, place: where } = placeOf(scene);
  const packName = pack ?? 'no pack';
  for (const feature of scene.setting?.features ?? []) {
    const kind = feature.kind;
    if (!['door', 'gate', 'wall', 'fence'].includes(kind) || !feature.svg)
      continue;
    const made = madeOf(feature);
    const fault = (why: string, as: DoorFault['kind'] = 'style') =>
      out.push({ feature: feature.id, kind: as, why });
    if (!made) {
      fault(
        `${theName(feature.name)} is drawn as no place's ${kind}${kind === 'door' && /#d8cbb3/u.test(feature.svg) ? ' (a grey concrete stretch of wall and a doorbell)' : ''}, in a ${packName} place`,
      );
    } else if (made.pack !== (pack ?? 'none')) {
      fault(
        `${theName(feature.name)} is drawn for ${made.pack === 'none' ? 'no pack' : made.pack}, in a ${packName} place`,
      );
    } else if (kind === 'door') {
      const wanted: DoorMake | 'front' =
        where === 'outdoor' &&
        doorMakeOf(feature.name, { pack }) !== 'flap'
          ? 'front'
          : doorMakeOf(feature.name, { pack, vessel: where === 'vessel' });
      if (made.make !== wanted)
        fault(
          `${theName(feature.name)} is made ${made.make}, where a ${packName} place makes it ${wanted}`,
        );
    } else if (kind === 'wall') {
      const wanted = wallMaterialOf(pack, feature.name);
      if (made.make !== wanted)
        fault(
          `${theName(feature.name)} is ${made.make}, where a ${packName} place builds it of ${wanted}`,
        );
    }
    // A doorbell only by a present-day door.
    if (
      kind === 'door' &&
      feature.affordances?.operates?.some((o) => o.does === 'bell') &&
      pack &&
      ['ancient-near-east', 'biblical-village', 'village-farm', 'nature'].includes(
        pack,
      )
    )
      fault(`${theName(feature.name)} has a doorbell, in a ${packName} place`);
    if (kind !== 'door') continue;
    if (!usedIn(scene, feature.id))
      fault(`no one in the scene uses ${theName(feature.name)}`, 'unused');
    if (
      place &&
      where === 'outdoor' &&
      made?.make !== 'flap' &&
      OPEN_COUNTRY.test(`${place.name} ${place.look ?? ''}`) &&
      !A_BUILDING.test(`${place.name} ${place.look ?? ''} ${feature.name}`)
    )
      fault(
        `${theName(feature.name)} stands in open country (${place.name}) with no building`,
        'open-country',
      );
  }
  return out;
}

/** The door check's faults, said as the compose log says things. */
export const describeDoorFaults = (faults: readonly DoorFault[]): string[] =>
  faults.map((f) => `door check: ${f.kind}: ${f.why}`);
