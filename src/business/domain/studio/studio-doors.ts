/**
 * Which of a set's doors a scene shows (studio-door-plan): a door is on
 * the stage only where the story needs one, and it belongs to its place.
 *
 * A set keeps every door its scenes' words ever named, for good, so that
 * a scene where someone walks out through the stable door and the next
 * where they come back in agree. But a scene no one in which goes through
 * a door, knocks at it, opens or shuts it, looks at it or is found by it,
 * and whose lines never point at it ("Someone's at the door!"), has no
 * door on its stage: a door named only in passing, or one the narration
 * slams with no one at it, is heard, not seen.
 *
 * Out in open country (a field, a hillside, a desert, a beach) with no
 * building in it, a door the story does use is the nearest thing the
 * place has to one: a gate in its fence or wall. A tent's door is its flap
 * (drawn as one wherever it is, scene-set-pieces).
 */
import { featureIdOf, featureKindOf } from '../scene-doings';
import { A_BUILDING, OPEN_COUNTRY, theName } from '../scene-door-check';
import { placementsOf, featureStatesOf } from './studio-stage';
import type {
  StorySheet,
  StudioBible,
  StudioFeature,
  StudioSet,
} from './studio';

/** How the scene before ended, as far as its doors go: its set, and who went through which door. */
export interface DoorsBefore {
  set?: string;
  wentThrough?: { who: string; feature: string }[];
}

/** Whether a place is out in open country with no building in it. */
export function openCountry(
  place: Pick<StudioSet, 'kind' | 'name' | 'look'>,
): boolean {
  if (place.kind !== 'outdoor') return false;
  const words = `${place.name} ${place.look}`;
  return OPEN_COUNTRY.test(words) && !A_BUILDING.test(words);
}

/** A line pointing at one door: "Someone's at the door!", "Open that door." */
const POINTED_AT =
  /\b(?:the|this|that)\s+(?:[\p{L}'’-]+\s+)?(?:door|doorway)\b(?!s)/iu;

/**
 * The doors a scene uses, by id: gone through, knocked at, opened or
 * shut, looked at or pointed at, gone to, leant on, by someone on the
 * stage; someone found by it ("waiting by the door"); someone coming in
 * through it from the scene before; its state as the scene opens told
 * ("light through the open door"); or a line pointing at it.
 */
export function doorsUsed(
  sheet: StorySheet,
  features: readonly StudioFeature[],
  bible: StudioBible,
  before: DoorsBefore | null = null,
): Set<string> {
  const doors = features.filter((f) => f.kind === 'door');
  const used = new Set<string>();
  if (!doors.length) return used;
  /** The door a word names: by its id, or the set's one door by the word for a door. */
  const doorOf = (word: string | null | undefined) => {
    if (!word || word.startsWith('@')) return undefined;
    const id = word.startsWith('f:') ? word.slice(2) : word;
    return (
      doors.find((d) => d.id === id || d.id === featureIdOf(id)) ??
      (featureKindOf(id) === 'door' && doors.length === 1
        ? doors[0]
        : undefined)
    );
  };
  const use = (word: string | null | undefined) => {
    const door = doorOf(word);
    if (door) used.add(door.id);
  };
  for (const beat of sheet.beats) {
    use(beat.target);
    use(beat.via);
    use(beat.thing);
    use(beat.prop);
    if (beat.kind === 'line' && POINTED_AT.test(beat.say)) {
      const named = doors.find((d) =>
        new RegExp(`\\b${d.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'iu').test(
          beat.say,
        ),
      );
      used.add((named ?? doors[0]).id);
    }
  }
  for (const place of sheet.onStage) use(place.on);
  for (const prop of sheet.props) use(prop.near);
  // Someone found by it, under or behind it.
  for (const one of placementsOf(sheet, bible, doors)) used.add(one.feature);
  // How it stands as the scene opens, told: seen so.
  const states = featureStatesOf(sheet, doors);
  for (const id of [...states.open, ...states.ajar]) used.add(id);
  // Someone who went through a door on the set before comes in through
  // this one: its own linked door, else the set's only door.
  if (before?.wentThrough?.length && before.set && before.set !== sheet.set)
    for (const went of before.wentThrough) {
      if (!sheet.onStage.some((p) => p.who === went.who)) continue;
      const door =
        doors.find(
          (d) =>
            d.link?.set === before.set && d.link?.feature === went.feature,
        ) ??
        (features.filter((f) => f.kind === 'door' || f.kind === 'gate')
          .length === 1
          ? doors[0]
          : undefined);
      if (door) used.add(door.id);
    }
  return used;
}

/** The set's features as a scene shows them, and what was left off or changed, said. */
export interface DoorsOnStage {
  features: StudioFeature[];
  /** Doors off the stage in this scene: heard where the words shut or knock at them, never seen. */
  offstage: string[];
  notes: string[];
}

/**
 * A set's features as one scene's stage has them: each door only where
 * the story needs it (doorsUsed), and a door out in open country with no
 * building the nearest thing the place has, a gate in its fence or wall,
 * unless it is a tent's (its flap).
 */
export function doorsOnStage(
  sheet: StorySheet,
  place: StudioSet | null,
  bible: StudioBible,
  before: DoorsBefore | null = null,
): DoorsOnStage {
  const all = place?.features ?? [];
  if (!place || !all.some((f) => f.kind === 'door'))
    return { features: [...all], offstage: [], notes: [] };
  const used = doorsUsed(sheet, all, bible, before);
  const open = openCountry(place);
  const notes: string[] = [];
  const offstage: string[] = [];
  const features = all.flatMap((f): StudioFeature[] => {
    if (f.kind !== 'door') return [f];
    if (!used.has(f.id)) {
      offstage.push(f.id);
      notes.push(
        `${theName(f.name)} is off the stage: no one in the scene uses it`,
      );
      return [];
    }
    if (open && !A_BUILDING.test(f.name)) {
      notes.push(
        `${theName(f.name)} is a gate: the ${place.name} is open country, with no building`,
      );
      return [{ ...f, kind: 'gate' }];
    }
    return [f];
  });
  return { features, offstage, notes };
}
