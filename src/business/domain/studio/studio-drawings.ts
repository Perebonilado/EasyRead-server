/**
 * A show's characters as the artist draws them, at the cast step: each
 * animal and creature drawn as soon as the cast is written, so the maker
 * meets them before any film is made; and one drawn again as the maker
 * asks, kept beside the drawing they have until they choose. Only the
 * one they choose replaces it, and only the scenes that show that
 * character are then made again.
 *
 * What is being drawn and what waits to be chosen is kept beside the
 * show's cast (castWorkOf); the choice is kept on the character in the
 * bible (`drawn`), which is part of every fingerprint of a scene that
 * shows them.
 */
import { createHash } from 'node:crypto';
import { SPECIES } from '../scene-animal';
import type { Cast, CharacterSheet } from '../scene-sheet';
import {
  namesOf,
  type StudioBible,
  type StudioCharacter,
  type StudioSet,
} from './studio';

/** What is being drawn now, and what waits for the maker to choose, by character. */
export interface CastWork {
  /** Characters being drawn: since when, and for a drawing again, the maker's words. */
  drawing: Record<string, { since: number; words?: string }>;
  /**
   * A new drawing of a character, waiting beside the one they have; for
   * one the animal kit draws, how its look reads in words with it.
   */
  candidates: Record<
    string,
    { sheet: CharacterSheet; words: string; at: number; look?: string }
  >;
}

export const NO_WORK: CastWork = { drawing: {}, candidates: {} };

/** Drawing that has not finished in this long went wrong somewhere: it is drawing no more. */
export const DRAWING_MS = 20 * 60_000;

/** Kept work read back: whatever cannot be read is none. */
export function castWorkOf(raw: unknown): CastWork {
  const said = raw && typeof raw === 'object' ? (raw as Partial<CastWork>) : {};
  const drawing: CastWork['drawing'] = {};
  for (const [id, one] of Object.entries(said.drawing ?? {}))
    if (one && Number.isFinite(one.since))
      drawing[id] = {
        since: one.since,
        ...(typeof one.words === 'string' ? { words: one.words } : {}),
      };
  const candidates: CastWork['candidates'] = {};
  for (const [id, one] of Object.entries(said.candidates ?? {}))
    if (one?.sheet?.drawing?.svg && typeof one.words === 'string')
      candidates[id] = {
        sheet: one.sheet,
        words: one.words,
        at: Number.isFinite(one.at) ? one.at : 0,
        ...(typeof one.look === 'string' ? { look: one.look } : {}),
      };
  return { drawing, candidates };
}

/**
 * Those of a cast the artist drew whose rigs turn their arms and nod:
 * they gesture on the stage as the kit's people do. The worker, and the
 * scripts that make a scene again, stage them the same way.
 */
export function gesturingIn(cast: Cast): Set<string> {
  return new Set(
    Object.entries(cast)
      .filter(
        ([, sheet]) =>
          sheet.rig?.arms ||
          sheet.rig?.nods ||
          // An animal the kit drew with arms (a monkey) points and waves,
          // and so does a creature the kit drew with arms.
          (sheet.animal && SPECIES[sheet.animal.species].plan === 'climber') ||
          (sheet.creature && sheet.creature.arms !== 'none'),
      )
      .map(([id]) => id),
  );
}

/**
 * Whether the artist draws them: an animal the animal kit has no spec
 * for, or a creature the creature kit has none for. A person is the
 * figure kit's, an animal with a spec the animal kit's, and a creature
 * with one the creature kit's.
 */
export const drawnByArtist = (
  c: Pick<StudioCharacter, 'kind' | 'animal' | 'creature'>,
) => c.kind !== 'person' && !c.animal && !c.creature;

/**
 * Whether a change asked of how they look is a new drawing to choose (an
 * animal, a creature: the kit's new spec, or the artist's new drawing)
 * rather than their look changed at once (a person's).
 */
export const redrawnToChoose = (c: Pick<StudioCharacter, 'kind'>) =>
  c.kind !== 'person';

/** Whether a character is being drawn now. */
export const beingDrawn = (work: CastWork, id: string, now: number) =>
  Boolean(work.drawing[id]) && now - work.drawing[id].since < DRAWING_MS;

/** Work with characters marked as being drawn. */
export function markDrawing(
  work: CastWork,
  ids: readonly string[],
  now: number,
  words?: string,
): CastWork {
  const drawing = { ...work.drawing };
  for (const id of ids)
    drawing[id] = { since: now, ...(words ? { words } : {}) };
  return { ...work, drawing };
}

/** Work with characters no longer being drawn. */
export function doneDrawing(work: CastWork, ids: readonly string[]): CastWork {
  const drawing = { ...work.drawing };
  for (const id of ids) delete drawing[id];
  return { ...work, drawing };
}

/** Work with a new drawing of a character waiting to be chosen (in place of any before it). */
export function withCandidate(
  work: CastWork,
  id: string,
  sheet: CharacterSheet,
  words: string,
  now: number,
  /** How one the animal kit draws reads in words with it: kept on them when chosen. */
  look?: string,
): CastWork {
  return {
    ...work,
    candidates: {
      ...work.candidates,
      [id]: { sheet, words, at: now, ...(look ? { look } : {}) },
    },
  };
}

/** Work with a character's waiting drawing gone. */
export function withoutCandidate(work: CastWork, id: string): CastWork {
  if (!work.candidates[id]) return work;
  const candidates = { ...work.candidates };
  delete candidates[id];
  return { ...work, candidates };
}

/** The animals and creatures of a cast with no drawing kept, and not being drawn now: those to draw. */
export function toDraw(
  bible: StudioBible,
  cast: Cast,
  work: CastWork,
  now: number,
): string[] {
  return bible.characters
    .filter(
      (c) => drawnByArtist(c) && !cast[c.id] && !beingDrawn(work, c.id, now),
    )
    .map((c) => c.id);
}

/** A drawing's own mark: the same drawing, the same mark. */
export const drawnStamp = (sheet: CharacterSheet) =>
  createHash('sha256').update(sheet.drawing.svg).digest('hex').slice(0, 12);

/**
 * A new drawing chosen: the cast with it in place of the one before, and
 * the bible marking the character with it, so every scene that shows them
 * (and none other) is made again.
 */
export function chosen(
  bible: StudioBible,
  cast: Cast,
  work: CastWork,
  id: string,
): { bible: StudioBible; cast: Cast; work: CastWork } | null {
  const candidate = work.candidates[id];
  if (!candidate || !bible.characters.some((c) => c.id === id)) return null;
  const drawn = drawnStamp(candidate.sheet);
  // One a kit drew (an animal, a creature) is its spec from now on, and
  // its look's words go with it.
  const animal = candidate.sheet.animal;
  const creature = candidate.sheet.creature;
  return {
    bible: {
      ...bible,
      characters: bible.characters.map((c) =>
        c.id === id
          ? {
              ...c,
              drawn,
              ...(animal ? { animal } : {}),
              ...(creature ? { creature, size: creature.size } : {}),
              ...((animal || creature) && candidate.look
                ? { look: candidate.look }
                : {}),
            }
          : c,
      ),
    },
    cast: { ...cast, [id]: candidate.sheet },
    work: withoutCandidate(work, id),
  };
}

/** Whether a character's look changed, so their drawing is forgotten and drawn again. */
export const lookChanged = (
  was: Pick<StudioCharacter, 'look' | 'kind' | 'size' | 'animal' | 'creature'>,
  now: Pick<StudioCharacter, 'look' | 'kind' | 'size' | 'animal' | 'creature'>,
) =>
  was.look !== now.look ||
  was.kind !== now.kind ||
  was.size !== now.size ||
  JSON.stringify(was.animal ?? null) !== JSON.stringify(now.animal ?? null) ||
  JSON.stringify(was.creature ?? null) !== JSON.stringify(now.creature ?? null);

/**
 * A bible written or changed again, each character drawn as they were:
 * one the artist drew gains no animal or creature spec (only a kit
 * drawing the maker chooses gives them one, so nothing switches on its
 * own), and one a kit draws keeps its spec when the writer leaves it out.
 * A new character is as written.
 */
export function keptKits(
  after: StudioBible,
  before: StudioBible | null,
): StudioBible {
  if (!before) return after;
  return {
    ...after,
    characters: after.characters.map((c) => {
      const was = before.characters.find((b) => b.id === c.id);
      if (!was) return c;
      let out: StudioCharacter = c;
      if (c.kind !== 'animal' || !was.animal) {
        const { animal: _gone, ...rest } = out;
        void _gone;
        out = rest;
      } else if (!c.animal) out = { ...out, animal: was.animal };
      if (c.kind !== 'creature' || !was.creature) {
        const { creature: _gone, ...rest } = out;
        void _gone;
        out = rest;
      } else if (!c.creature)
        out = { ...out, creature: was.creature, size: was.creature.size };
      return out;
    }),
  };
}

/**
 * A bible written or changed again, keeping which drawing the maker chose
 * of each character still there as they were: one whose look changed is
 * drawn again, and has no choice yet.
 */
export function keptDrawn(
  after: StudioBible,
  before: StudioBible | null,
): StudioBible {
  return {
    ...after,
    characters: after.characters.map((c) => {
      const was = before?.characters.find((b) => b.id === c.id);
      const { drawn: _said, ...rest } = c;
      void _said;
      return was?.drawn && !lookChanged(was, c)
        ? { ...rest, drawn: was.drawn }
        : rest;
    }),
  };
}

/** Words that name no one by themselves: a name's "the", a title. */
const NOT_NAMES = /^(?:the|a|an|mr|mrs|ms|dr|old|little|big|young)$/i;

/** The characters a request names, each once, by any name the words may call them. */
export function named(words: string, bible: StudioBible): StudioCharacter[] {
  const said = ` ${words.toLowerCase().replace(/[’']/g, "'")} `;
  return bible.characters.filter((c) =>
    namesOf(c).some((name) => {
      const clean = name.trim().toLowerCase().replace(/[’']/g, "'");
      if (clean.length < 3 || NOT_NAMES.test(clean)) return false;
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`[^a-z]${escaped}(?:'s)?[^a-z]`).test(said);
    }),
  );
}

/** A request to draw someone again, in so many words. */
const REDRAW =
  /\b(?:re-?draw|draw\b.{0,40}\bagain|draw\s+(?:him|her|them|it)\b)/i;

/**
 * The one character a request to change the cast asks to be drawn
 * again ("redraw Humpty", "draw the horse again, browner"): null when it
 * asks for anything else, or names more than one.
 */
export function oneRedrawn(
  words: string,
  bible: StudioBible,
): StudioCharacter | null {
  if (!REDRAW.test(words)) return null;
  const who = named(words, bible);
  return who.length === 1 ? who[0] : null;
}

/** The character the producer meant, by id or by any name of theirs; null for none. */
export function characterMeant(
  said: string | null | undefined,
  bible: StudioBible | null,
): StudioCharacter | null {
  const clean = said?.trim().toLowerCase();
  if (!clean || !bible) return null;
  return (
    bible.characters.find((c) => c.id === clean) ??
    bible.characters.find((c) => c.name.toLowerCase() === clean) ??
    (named(clean, bible).length === 1 ? named(clean, bible)[0] : null)
  );
}

/** What a request to change one person's look asks of the whole cast's writer: them, and no one else. */
export const oneLookRequest = (who: StudioCharacter, words: string) =>
  `Change only ${who.name}'s look, as the maker asks: ${words.trim()}. Keep everyone else and every place exactly as they are.`;

const listed = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** What changed of one character, in the maker's words: nothing, when nothing did. */
function characterChanges(
  was: StudioCharacter,
  now: StudioCharacter,
): string[] {
  const out: string[] = [];
  if (was.name !== now.name) out.push(`${was.name} now called ${now.name}`);
  const who = now.name;
  if (
    lookChanged(was, now) ||
    JSON.stringify(was.figure) !== JSON.stringify(now.figure)
  )
    out.push(`${who}'s look`);
  if (was.voice !== now.voice || was.voicePick !== now.voicePick)
    out.push(`${who}'s voice`);
  if (was.role !== now.role) out.push(`${who} now ${now.role}`);
  if (JSON.stringify(was.traits) !== JSON.stringify(now.traits))
    out.push(`what ${who} is like`);
  if (was.carries !== now.carries) out.push(`what ${who} carries`);
  return out;
}

function setChanges(was: StudioSet, now: StudioSet): string[] {
  const out: string[] = [];
  if (was.name !== now.name) out.push(`${was.name} now called ${now.name}`);
  if (was.look !== now.look || was.kind !== now.kind)
    out.push(`how ${now.name} looks`);
  const had = new Set((was.features ?? []).map((f) => f.id));
  const has = new Set((now.features ?? []).map((f) => f.id));
  const gone = [...had].filter((id) => !has.has(id));
  if (gone.length)
    out.push(
      `${listed(gone.map((id) => `the ${id}`))} taken out of ${now.name}`,
    );
  return out;
}

/**
 * What a change to the whole cast did, said: who and where is new, gone
 * or changed, and how. Never a count of what is there.
 */
export function castLine(
  before: StudioBible | null,
  after: StudioBible,
): string {
  if (!before)
    return `Cast written: ${listed(after.characters.map((c) => c.name))}`;
  const changes: string[] = [];
  const added = after.characters.filter(
    (c) => !before.characters.some((b) => b.id === c.id),
  );
  if (added.length)
    changes.push(
      `${added.length === 1 ? 'a new character' : 'new characters'}, ${listed(added.map((c) => c.name))}`,
    );
  for (const b of before.characters) {
    const now = after.characters.find((c) => c.id === b.id);
    if (!now) changes.push(`${b.name} left out`);
    else changes.push(...characterChanges(b, now));
  }
  const places = after.sets.filter(
    (s) => !before.sets.some((b) => b.id === s.id),
  );
  if (places.length)
    changes.push(
      `${places.length === 1 ? 'a new place' : 'new places'}, ${listed(places.map((s) => s.name))}`,
    );
  for (const b of before.sets) {
    const now = after.sets.find((s) => s.id === b.id);
    if (!now) changes.push(`${b.name} taken out`);
    else changes.push(...setChanges(b, now));
  }
  if (!changes.length) return 'Cast looked at again: nothing needed changing';
  const shown = changes.slice(0, 5);
  const more = changes.length - shown.length;
  return `Cast changed: ${shown.join('; ')}${more ? `; and ${more} more` : ''}`;
}
