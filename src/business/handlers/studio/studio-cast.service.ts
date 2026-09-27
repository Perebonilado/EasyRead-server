import { Inject, Injectable } from '@nestjs/common';
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import { NotFoundError } from '../../domain/errors/errors';
import { byId, elements, removeNode } from '../../domain/scene-dom';
import {
  castOf,
  setsOf,
  type Cast,
  type CharacterSheet,
  type Sets,
} from '../../domain/scene-sheet';
import { withFace } from '../../domain/scene-sheet-face';
import type { StudioBible } from '../../domain/studio/studio';
import {
  NO_WORK,
  beingDrawn,
  castWorkOf,
  chosen,
  lookChanged,
  markDrawing,
  toDraw,
  withoutCandidate,
  type CastWork,
} from '../../domain/studio/studio-drawings';
import { figurePreview } from '../../domain/studio/studio-looks';
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

/** A drawing with only the states named kept: a face, no others over it. */
function withOnly(
  svg: string,
  states: Record<string, string>,
  keep: readonly string[],
): string {
  try {
    const doc = parseDocument(svg, { xmlMode: true });
    const root = elements(doc.children)[0];
    for (const [name, id] of Object.entries(states))
      if (!keep.includes(name)) {
        const group = byId(root, id);
        if (group) removeNode(group);
      }
    return render(doc, { xmlMode: true });
  } catch {
    return svg;
  }
}

/** A character as their card shows them: a face or two, with code's mouth where code draws it. */
function preview(sheet: CharacterSheet, id: string): string {
  const svg = withOnly(sheet.drawing.svg, sheet.drawing.states, [
    'happy',
    'neutral',
  ]);
  return sheet.face
    ? withFace({ ...sheet.drawing, svg }, sheet.face, id).svg
    : svg;
}

/**
 * A show's drawings, as the Studio shows them before and after its film
 * is made: each person drawn by the kit at once from their look, each
 * animal, creature and place once the stage has drawn or painted it. And
 * forgotten when the maker changes how one looks, so it is drawn again.
 */
@Injectable()
export class StudioCastService {
  /** People drawn lately, by their look: the same look is the same drawing. */
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
    /** New drawings waiting to be chosen: each as its card shows it, and what the maker asked. */
    candidates: Map<string, { drawing: string; words: string }>;
    /** Those being drawn now. */
    drawing: Set<string>;
  }> {
    const characters = new Map<string, string>();
    const needsCast = bible.characters.some((c) => c.kind !== 'person');
    const cast: Cast = needsCast
      ? await this.read(studioCastKey(showId), castOf, {}).catch(() => ({}))
      : {};
    const work: CastWork = needsCast
      ? await this.work(showId).catch(() => NO_WORK)
      : NO_WORK;
    const candidates = new Map<string, { drawing: string; words: string }>();
    const drawing = new Set<string>();
    for (const c of bible.characters) {
      const waiting = work.candidates[c.id];
      if (waiting)
        candidates.set(c.id, {
          drawing: preview(waiting.sheet, c.id),
          words: waiting.words,
        });
      if (beingDrawn(work, c.id, now)) drawing.add(c.id);
    }
    for (const c of bible.characters) {
      if (c.kind === 'person' && c.figure) {
        const key = `${c.id}:${JSON.stringify(c.figure)}`;
        let svg = this.people.get(key);
        if (!svg) {
          svg = figurePreview(c.figure, c.id);
          this.people.set(key, svg);
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
    if (!bible.characters.some((c) => c.kind !== 'person')) return [];
    const cast = await this.cast(showId).catch(() => ({}));
    let ids: string[] = [];
    await this.changeWork(showId, (work) => {
      ids = toDraw(bible, cast, work, now);
      return ids.length ? markDrawing(work, ids, now) : work;
    });
    return ids;
  }

  /**
   * A character's new drawing chosen: kept in the cast in place of the one
   * before, and the bible marking them with it. Null when there is none
   * waiting.
   */
  async choose(
    showId: string,
    bible: StudioBible,
    characterId: string,
  ): Promise<StudioBible | null> {
    return this.inTurn(studioCastKey(showId), async () => {
      const work = await this.work(showId);
      const cast = await this.cast(showId).catch(() => ({}));
      const picked = chosen(bible, cast, work, characterId);
      if (!picked) return null;
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
