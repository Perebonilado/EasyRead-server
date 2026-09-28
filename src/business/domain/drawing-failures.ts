/**
 * Learning from mistakes (studio-drawings-plan §8, Phase E). A drawing
 * the maker marks "Not right" is kept, with its brief and their note, in
 * a failures folder (drawing-bench/failures/ in storage: storage/ on a
 * laptop) and logged; `npm run drawing:bench -- --from-failures` turns
 * each into a brief of the drawing bench, so that what went wrong once is
 * measured on every run after, until it is fixed for good.
 */
import type { AnimalSpec } from './scene-animal';
import type { CreatureSpec } from './scene-creature';
import type { FigureSpec } from './scene-figure';
import type { CharacterSheet } from './scene-sheet';
import type { StorySize } from './scene-story';
import type { CharacterFixture, RedrawFixture } from './drawing-bench';

/** Where failures are kept in storage. */
export const FAILURES_PREFIX = 'drawing-bench/failures/';

/** The most of a maker's note kept. */
export const NOTE_CHARS = 500;

/** A drawing the maker said was not right: what it was, what it was drawn for, and why. */
export interface DrawingFailure {
  id: string;
  /** When, as an ISO date. */
  at: string;
  showId: string;
  /** The show's title: the bench's brief is drawn for it. */
  book: string;
  characterId: string;
  name: string;
  kind: 'person' | 'animal' | 'creature';
  size: StorySize | null;
  /** Their look, in the cast's words. */
  look: string;
  /** What the maker said was wrong; null when they said nothing. */
  note: string | null;
  /** What the drawing was drawn for, when it was drawn again as asked. */
  asked: string | null;
  /** The drawing they have, or one of the new ones offered. */
  which: 'theirs' | 'offered';
  /** Who drew it: the artist, or a kit from its spec. */
  drawer: 'artist' | 'kit';
  /** The drawing as the maker saw it on their card. */
  svg: string;
  /** The artist's sheet: the bench draws again from it. */
  sheet?: CharacterSheet;
  animal?: AnimalSpec;
  creature?: CreatureSpec;
  figure?: FigureSpec;
}

/** Where a failure is kept: by day, show and character, and the drawing's own mark. */
export const failureKey = (failure: Pick<DrawingFailure, 'id'>) =>
  `${FAILURES_PREFIX}${failure.id}.json`;

/** A failure's id: when, whose, and which drawing. */
export function failureId(input: {
  at: Date;
  showId: string;
  characterId: string;
  stamp: string;
}): string {
  const day = input.at.toISOString().slice(0, 10);
  const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return `${day}-${safe(input.showId).slice(0, 8)}-${safe(input.characterId).slice(0, 24)}-${safe(input.stamp).slice(0, 12)}`;
}

/** A maker's note as kept: trimmed, cut short, none when empty. */
export const noteOf = (said: string | null | undefined): string | null => {
  const clean = (said ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_CHARS);
  return clean || null;
};

/** What a failure becomes on the bench: a brief (and the drawing it starts from), or why it cannot be one. */
export type FromFailure =
  | {
      fixture: CharacterFixture | RedrawFixture;
      /** For a redraw, the sheet it starts from: kept in the bench's `old` folder under `fixture.from`. */
      old?: CharacterSheet;
    }
  | { skipped: string };

/**
 * A failure as a brief of the drawing bench:
 *
 * - the artist's drawing with a note is drawn again from that drawing,
 *   as the maker's note asks (a redraw brief), so the judge sees whether
 *   what they said is now right;
 * - the artist's drawing with no note is drawn afresh from its look;
 * - a kit's (an animal's, a creature's) is drawn by the kit from its
 *   spec, the note added to its look, so the judge holds it to what the
 *   maker said.
 *
 * People are the figure kit's, which the bench does not draw; they are
 * kept, and said to be skipped.
 */
export function fixtureOfFailure(failure: DrawingFailure): FromFailure {
  if (failure.kind === 'person')
    return {
      skipped: `${failure.name} is a person: the bench draws no people`,
    };
  const id = `failure-${failure.id}`;
  const base = {
    id,
    name: failure.name,
    book: failure.book,
    is: failure.kind,
    size: failure.size ?? 'medium',
    legs: null,
  } as const;
  // What the maker said goes with its look, for the judge to hold it to.
  const look = failure.note
    ? `${failure.look.replace(/[.\s]*$/, '')}. The maker said it was not right: ${failure.note}`
    : failure.look;
  if (failure.drawer === 'kit') {
    const spec = failure.animal
      ? { animal: failure.animal as unknown as Record<string, unknown> }
      : failure.creature
        ? { creature: failure.creature as unknown as Record<string, unknown> }
        : null;
    if (!spec) return { skipped: `${failure.name} has no spec to draw` };
    return {
      fixture: {
        ...base,
        kind: 'character',
        look,
        drawer: 'kit',
        ...spec,
      },
    };
  }
  if (failure.note && failure.sheet)
    return {
      fixture: {
        ...base,
        kind: 'redraw',
        look: failure.look,
        words: failure.note,
        from: `${id}.json`,
      },
      old: failure.sheet,
    };
  return {
    fixture: { ...base, kind: 'character', look },
  };
}
