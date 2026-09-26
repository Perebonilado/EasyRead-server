import { Inject, Injectable } from '@nestjs/common';
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import { NotFoundError } from '../../domain/errors/errors';
import { byId, elements, removeNode } from '../../domain/scene-dom';
import { castOf, setsOf, type Cast, type Sets } from '../../domain/scene-sheet';
import type { StudioBible } from '../../domain/studio/studio';
import { figurePreview } from '../../domain/studio/studio-looks';
import type { StoragePort } from '../../ports/storage.port';
import { STORAGE } from '../../ports/tokens';

/** Where a show's characters and places are kept, each drawn once for every episode. */
export const studioCastKey = (showId: string) => `studio/${showId}/cast.json`;
export const studioSetsKey = (showId: string) => `studio/${showId}/sets.json`;

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
  ): Promise<{ characters: Map<string, string>; sets: Map<string, string> }> {
    const characters = new Map<string, string>();
    const needsCast = bible.characters.some((c) => c.kind !== 'person');
    const cast: Cast = needsCast
      ? await this.read(studioCastKey(showId), castOf, {}).catch(() => ({}))
      : {};
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
      if (sheet?.drawing?.svg)
        characters.set(
          c.id,
          withOnly(sheet.drawing.svg, sheet.drawing.states, [
            'happy',
            'neutral',
          ]),
        );
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
    return { characters, sets };
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
        return (
          was &&
          (was.look !== c.look || was.kind !== c.kind || was.size !== c.size)
        );
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
