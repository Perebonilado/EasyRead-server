import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { NotFoundError } from '../../domain/errors/errors';
import { failureKey, type DrawingFailure } from '../../domain/drawing-failures';
import {
  castOf,
  optionsKey,
  setsOf,
  type Cast,
  type CharacterSheet,
  type Sets,
} from '../../domain/scene-sheet';
import { faceShown } from '../../domain/scene-sheet-face';
import type { StudioBible, StudioCharacter } from '../../domain/studio/studio';
import {
  NO_WORK,
  beingDrawn,
  castWorkOf,
  chosen,
  drawnByArtist,
  drawnStamp,
  lookChanged,
  markDrawing,
  toDraw,
  withoutCandidate,
  type CastWork,
  type DrawingOption,
} from '../../domain/studio/studio-drawings';
import {
  animalPreview,
  creaturePreview,
  figurePreview,
} from '../../domain/studio/studio-looks';
import type { StoragePort } from '../../ports/storage.port';
import { STORAGE } from '../../ports/tokens';

/** Where a show's characters and places are kept, each drawn once for every episode. */
export const studioCastKey = (showId: string) => `studio/${showId}/cast.json`;
export const studioSetsKey = (showId: string) => `studio/${showId}/sets.json`;
/** Where a show's own things and features are kept, each drawn once by the artist: a kite, a signpost. */
export const studioOwnKey = (showId: string) => `studio/${showId}/own.json`;
/** What of a show's cast is being drawn now, and new drawings waiting for the maker to choose. */
export const studioWorkKey = (showId: string) =>
  `studio/${showId}/drawing.json`;

/** A character as their card shows them: a face or two, with code's mouth where code draws it. */
const preview = (sheet: CharacterSheet, id: string): string =>
  faceShown(sheet, id, ['happy', 'neutral']);

/** One of the new drawings offered, as its card shows it: the sheet's faces, or a person's figure drawn by the kit. */
export const optionPreview = (option: DrawingOption, id: string): string =>
  option.sheet
    ? preview(option.sheet, id)
    : option.figure
      ? figurePreview(option.figure, id)
      : option.animal
        ? animalPreview(option.animal, id)
        : '';

/** New drawings waiting for a character, as their card shows them. */
export interface WaitingView {
  words: string;
  first?: boolean;
  options: { id: string; drawing: string }[];
}

/**
 * A show's drawings, as the Studio shows them before and after its film
 * is made: each person and each animal the kits draw drawn at once from
 * their look, each other animal, creature and place once the stage has
 * drawn or painted it. And forgotten when the maker changes how one
 * looks, so it is drawn again.
 */
@Injectable()
export class StudioCastService {
  /** People and animals drawn by the kits lately, by their look: the same look is the same drawing. */
  private readonly people = new Map<string, string>();
  /** Work on one file, after whatever work on it is under way here. */
  private readonly writing = new Map<string, Promise<unknown>>();

  constructor(@Inject(STORAGE) private readonly storage: StoragePort) {}

  private async read<T>(
    key: string,
    parse: (raw: unknown) => T,
    empty: T,
  ): Promise<T> {
    try {
      return parse(JSON.parse((await this.storage.get(key)).toString('utf8')));
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof SyntaxError)
        return empty;
      throw error;
    }
  }

  /** How each character and place is drawn now, by id: none for one not drawn yet. */
  async drawings(
    showId: string,
    bible: StudioBible,
    now = Date.now(),
  ): Promise<{
    characters: Map<string, string>;
    sets: Map<string, string>;
    /** New drawings waiting to be chosen, up to three: each as its card shows it, and what the maker asked. */
    candidates: Map<string, WaitingView>;
    /** Those being drawn now. */
    drawing: Set<string>;
  }> {
    const characters = new Map<string, string>();
    // The artist's drawings are in the cast; the kits' are drawn here. New
    // drawings to choose from may wait for anyone.
    const needsCast = bible.characters.some(drawnByArtist);
    const cast: Cast = needsCast
      ? await this.read(studioCastKey(showId), castOf, {}).catch(() => ({}))
      : {};
    const work: CastWork = bible.characters.length
      ? await this.work(showId).catch(() => NO_WORK)
      : NO_WORK;
    const candidates = new Map<string, WaitingView>();
    const drawing = new Set<string>();
    for (const c of bible.characters) {
      const waiting = work.candidates[c.id];
      if (waiting)
        candidates.set(c.id, {
          words: waiting.words,
          ...(waiting.first ? { first: true } : {}),
          options: waiting.options
            .map((one) => ({ id: one.id, drawing: optionPreview(one, c.id) }))
            .filter((one) => one.drawing),
        });
      if (beingDrawn(work, c.id, now)) drawing.add(c.id);
    }
    for (const c of bible.characters) {
      const kit =
        c.kind === 'person' && c.figure
          ? {
              key: `${c.id}:${JSON.stringify(c.figure)}`,
              draw: () => figurePreview(c.figure!, c.id),
            }
          : c.kind === 'animal' && c.animal
            ? {
                key: `${c.id}:animal:${JSON.stringify(c.animal)}`,
                draw: () => animalPreview(c.animal!, c.id),
              }
            : c.kind === 'creature' && c.creature
              ? {
                  key: `${c.id}:creature:${JSON.stringify(c.creature)}`,
                  draw: () => creaturePreview(c.creature!, c.id),
                }
              : null;
      if (kit) {
        let svg = this.people.get(kit.key);
        if (!svg) {
          svg = kit.draw();
          this.people.set(kit.key, svg);
          if (this.people.size > 400) {
            const oldest = this.people.keys().next();
            if (!oldest.done) this.people.delete(oldest.value);
          }
        }
        characters.set(c.id, svg);
        continue;
      }
      const sheet = cast[c.id];
      if (sheet?.drawing?.svg) characters.set(c.id, preview(sheet, c.id));
    }
    const sets = new Map<string, string>();
    if (bible.sets.length) {
      const painted: Sets = await this.read(
        studioSetsKey(showId),
        setsOf,
        {},
      ).catch(() => ({}));
      for (const s of bible.sets) {
        const sheet = painted[s.id];
        if (sheet?.drawing?.svg) sets.set(s.id, sheet.drawing.svg);
      }
    }
    return { characters, sets, candidates, drawing };
  }

  /** The show's cast as drawn: none yet is an empty one. */
  cast(showId: string): Promise<Cast> {
    return this.read(studioCastKey(showId), castOf, {});
  }

  /** What is being drawn now, and what waits to be chosen. */
  work(showId: string): Promise<CastWork> {
    return this.read(studioWorkKey(showId), castWorkOf, NO_WORK);
  }

  /** The work changed as `change` says, after any other change to it here; what it came to. */
  changeWork(
    showId: string,
    change: (work: CastWork) => CastWork,
  ): Promise<CastWork> {
    const key = studioWorkKey(showId);
    return this.inTurn(key, async () => {
      const was = await this.work(showId);
      const next = change(was);
      if (next !== was) await this.write(key, next);
      return next;
    });
  }

  /**
   * The animals and creatures of a cast with no drawing yet and not being
   * drawn, marked as being drawn now: those the caller has drawn.
   */
  async markToDraw(
    showId: string,
    bible: StudioBible,
    now: number,
  ): Promise<string[]> {
    if (!bible.characters.some(drawnByArtist)) return [];
    const cast = await this.cast(showId).catch(() => ({}));
    let ids: string[] = [];
    await this.changeWork(showId, (work) => {
      ids = toDraw(bible, cast, work, now);
      return ids.length ? markDrawing(work, ids, now) : work;
    });
    return ids;
  }

  /**
   * One of a character's new drawings chosen (the first unless another is
   * said, by its id or its number): kept in the cast in place of the one
   * before, and the bible marking them with it. Null when there is none
   * such waiting.
   */
  async choose(
    showId: string,
    bible: StudioBible,
    characterId: string,
    option?: string | number | null,
  ): Promise<StudioBible | null> {
    return this.inTurn(studioCastKey(showId), async () => {
      const work = await this.work(showId);
      const cast = await this.cast(showId).catch(() => ({}));
      const picked = chosen(bible, cast, work, characterId, option);
      if (!picked) return null;
      if (picked.cast !== cast)
        await this.write(studioCastKey(showId), picked.cast);
      await this.changeWork(showId, (now) =>
        withoutCandidate(now, characterId),
      );
      return picked.bible;
    });
  }

  /** A character's new drawing let go: the one they have stays. Whether there was one. */
  async discard(showId: string, characterId: string): Promise<boolean> {
    let had = false;
    await this.changeWork(showId, (work) => {
      had = Boolean(work.candidates[characterId]);
      return withoutCandidate(work, characterId);
    });
    return had;
  }

  /**
   * A character's other takes when the artist first drew them, the ones
   * not chosen (cast-options.json beside the cast): none for one it did
   * not draw that way.
   */
  async otherTakes(
    showId: string,
    characterId: string,
  ): Promise<CharacterSheet[]> {
    const none: Record<string, unknown> = {};
    const kept = await this.read(
      optionsKey(studioCastKey(showId)),
      (raw) =>
        raw && typeof raw === 'object'
          ? (raw as Record<string, unknown>)
          : none,
      none,
    ).catch(() => none);
    const takes = kept[characterId];
    return Array.isArray(takes)
      ? (takes as CharacterSheet[]).filter((one) => one?.drawing?.svg)
      : [];
  }

  /**
   * The drawing a character has now, as their card shows it: the kit's of
   * their spec, or the artist's sheet; its own mark. Null when they have
   * none yet.
   */
  async theirs(
    showId: string,
    who: StudioCharacter,
  ): Promise<{
    drawer: 'artist' | 'kit';
    svg: string;
    sheet?: CharacterSheet;
    stamp: string;
  } | null> {
    const kit =
      who.kind === 'person' && who.figure
        ? { svg: figurePreview(who.figure, who.id), spec: who.figure }
        : who.kind === 'animal' && who.animal
          ? { svg: animalPreview(who.animal, who.id), spec: who.animal }
          : who.kind === 'creature' && who.creature
            ? { svg: creaturePreview(who.creature, who.id), spec: who.creature }
            : null;
    if (kit)
      return {
        drawer: 'kit',
        svg: kit.svg,
        stamp: createHash('sha256')
          .update(JSON.stringify(kit.spec))
          .digest('hex')
          .slice(0, 12),
      };
    const sheet = (await this.cast(showId).catch((): Cast => ({})))[who.id];
    return sheet?.drawing?.svg
      ? {
          drawer: 'artist',
          svg: preview(sheet, who.id),
          sheet,
          stamp: drawnStamp(sheet),
        }
      : null;
  }

  /** A drawing the maker said was not right, kept in the failures folder for the bench: where. */
  async keepFailure(failure: DrawingFailure): Promise<string> {
    const key = failureKey(failure);
    await this.write(key, failure);
    return key;
  }

  private async write(key: string, value: unknown): Promise<void> {
    await this.storage.put({
      key,
      body: Buffer.from(JSON.stringify(value)),
      mimeType: 'application/json',
    });
  }

  private inTurn<T>(key: string, work: () => Promise<T>): Promise<T> {
    const before = this.writing.get(key) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(work);
    this.writing.set(key, mine);
    const done = () => {
      if (this.writing.get(key) === mine) this.writing.delete(key);
    };
    mine.then(done, done);
    return mine;
  }

  /** A drawn animal or creature, or a painted place, whose look changed: forgotten, so it is drawn again. */
  async forgetChanged(
    showId: string,
    before: StudioBible,
    after: StudioBible,
  ): Promise<void> {
    const changed = after.characters
      .filter((c) => {
        const was = before.characters.find((b) => b.id === c.id);
        return was && lookChanged(was, c);
      })
      .map((c) => c.id);
    const repainted = after.sets
      .filter((s) => {
        const was = before.sets.find((b) => b.id === s.id);
        return was && (was.look !== s.look || was.kind !== s.kind);
      })
      .map((s) => s.id);
    await this.forget(studioCastKey(showId), changed, castOf);
    await this.forget(studioSetsKey(showId), repainted, setsOf);
    // A new drawing waiting for a look that has changed since is let go.
    if (changed.length)
      await this.changeWork(showId, (work) =>
        changed.reduce(withoutCandidate, work),
      );
  }

  private async forget(
    key: string,
    ids: string[],
    parse: (raw: unknown) => Record<string, unknown>,
  ): Promise<void> {
    if (!ids.length) return;
    const kept = await this.read<Record<string, unknown>>(key, parse, {});
    let dropped = false;
    for (const id of ids)
      if (id in kept) {
        delete kept[id];
        dropped = true;
      }
    if (!dropped) return;
    await this.storage.put({
      key,
      body: Buffer.from(JSON.stringify(kept)),
      mimeType: 'application/json',
    });
  }
}
