/**
 * The artist's side of a story: a character, a place, or one of a show's
 * own things, asked of the drawing model, gated, measured, and asked for
 * once more with what fell short; the better kept. Out of the scene
 * processor so the drawing bench (scripts/drawing-bench.ts) draws each
 * one exactly as a book or a show does, with no storage and no database:
 * all it needs is the model, somewhere to record each call's cost, and a
 * log.
 */
import type { LlmGatewayPort, LlmUsage } from '../../business/ports/llm.port';
import { measureGround } from '../../business/domain/scene-ground';
import {
  SET_VERSION,
  drawnAlike,
  measureSheet,
  type CharacterSheet,
  type SetSheet,
} from '../../business/domain/scene-sheet';
import { rigSheet } from '../../business/domain/scene-sheet-rig';
import {
  faceMoved,
  faceNotes,
  measureFace,
  unmarked,
  type SheetFace,
} from '../../business/domain/scene-sheet-face';
import {
  SET_CANVAS,
  setThing,
  sheetThing,
  type StoryCharacter,
  type StoryPlace,
  type StoryWorld,
} from '../../business/domain/scene-story';
import type { DrawingThing } from '../../business/domain/scene-script';
import {
  CANVAS,
  gateDrawing,
  type GateResult,
  type GatedDrawing,
} from '../../business/domain/scene-svg';

/** Tries at one drawing: the first, and one more with the gate's notes. */
export const DRAW_TRIES = 2;
/** A drawing asked to change that is this alike the one before was copied, not changed. */
export const COPIED = 0.8;
/** The most of a drawing the artist is shown to draw from, in characters. */
const REFERENCE_CHARS = 24_000;

/**
 * A drawing as the artist is shown it to draw from: as still as it was
 * drawn, with none of the rig's motion (and no mouth, where code draws
 * it). None when it is too long to show.
 */
export function referenceOf(sheet: CharacterSheet): string | null {
  const svg = sheet.drawing.svg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  return svg.length <= REFERENCE_CHARS ? svg : null;
}

/** What each model call the artist makes is recorded as. */
export type ArtistTask = 'scene_draw';

/** Where each call is recorded: against the document or episode it was for. */
export type ArtistRecord = (
  documentId: string | null,
  task: ArtistTask,
  usage: LlmUsage,
) => Promise<void>;

/** The log the artist writes to: the processor's own. */
export interface ArtistLog {
  log(message: string): void;
  warn(message: string): void;
}

/** A character drawn, rigged, and what the rig could not join. */
export interface DrawnSheet {
  sheet: CharacterSheet;
  /** The parts the rig could not join to the body, in its words: they are kept still. */
  unjoined: string[];
}

/** A character drawn again as the maker asks, from how they are drawn now. */
export interface DrawAgain {
  words: string;
  /** How they are drawn now, as SVG, for the artist to draw from; null when too long to show. */
  reference: string | null;
}

export class SceneArtist {
  constructor(
    private readonly llm: LlmGatewayPort,
    private readonly record: ArtistRecord,
    private readonly logger: ArtistLog,
  ) {}

  /**
   * One of the show's own, drawn: asked for, gated, measured, and asked
   * for once more with what fell short; the better kept. Its cost is the
   * scene's, as every drawing's is.
   */
  async drawOwn<T>(
    thing: DrawingThing,
    canvas: { w: number; h: number },
    measure: (drawing: GatedDrawing) => Promise<T>,
    topic: string,
    documentId: string | null,
    who: string,
    stop?: AbortSignal,
  ): Promise<T | null> {
    let best: { value: T; faults: number } | null = null;
    let notes: string[] | undefined;
    for (let attempt = 1; attempt <= DRAW_TRIES; attempt += 1) {
      if (stop?.aborted) break;
      let reply: string;
      try {
        const made = await this.llm.sceneDrawing({
          thing,
          viewBox: canvas,
          topic,
          neighbours: [],
          notes,
        });
        await this.record(documentId, 'scene_draw', made.usage);
        reply = made.value;
      } catch (error) {
        this.logger.warn(
          `${who}: the ${thing.name} could not be asked for: ${(error as Error).message}`,
        );
        continue;
      }
      // Drawn still, as asked: code moves it, so stillness is no fault.
      const gated = await gateDrawing(reply, { ...thing, motion: '' });
      if (!gated.drawing) {
        notes = gated.notes;
        continue;
      }
      let value: T;
      try {
        value = await measure(gated.drawing);
      } catch (error) {
        notes = [
          ...gated.notes,
          `It could not be measured: ${(error as Error).message}.`,
        ];
        continue;
      }
      const faults = gated.retry ? 1 : 0;
      if (!best || faults < best.faults) best = { value, faults };
      if (!faults) break;
      notes = gated.notes;
      this.logger.log(
        `${who}: the ${thing.name} try ${attempt} fell short: ${notes.join(' ')}`,
      );
    }
    if (!best) this.logger.warn(`${who}: the ${thing.name} could not be drawn`);
    return best?.value ?? null;
  }

  /** A place painted for the book: asked for as a set, gated as one, and asked for once more when it falls short. */
  async paintSet(
    place: StoryPlace,
    bookTitle: string,
    documentId: string | null,
    who: string,
    world: StoryWorld | null = null,
  ): Promise<SetSheet | null> {
    const thing = setThing(place, bookTitle, world);
    let best: GateResult | null = null;
    let notes: string[] | undefined;
    for (let attempt = 1; attempt <= DRAW_TRIES; attempt += 1) {
      let reply: string;
      try {
        const made = await this.llm.sceneDrawing({
          thing,
          viewBox: SET_CANVAS,
          topic: bookTitle,
          neighbours: [],
          notes,
          backdrop: true,
        });
        await this.record(documentId, 'scene_draw', made.usage);
        reply = made.value;
      } catch (error) {
        this.logger.warn(
          `${who}: ${place.name} could not be asked for: ${(error as Error).message}`,
        );
        continue;
      }
      const gated = await gateDrawing(reply, thing, { backdrop: true });
      if (gated.drawing && (!best?.drawing || gated.score > best.score))
        best = gated;
      if (gated.drawing && !gated.retry) break;
      notes = gated.notes;
    }
    if (!best?.drawing) {
      this.logger.warn(`${who}: ${place.name} could not be painted`);
      return null;
    }
    this.logger.log(`${who}: ${place.name} painted for the whole book`);
    // Where its ground is, read once, for the crowds that will stand on it;
    // kept without it when the render failed, to be measured next time.
    const ground = await measureGround(best.drawing);
    if (!ground)
      this.logger.warn(
        `${who}: ${place.name}'s ground could not be measured; measured again next time`,
      );
    return {
      version: SET_VERSION,
      drawing: best.drawing,
      ...(ground ? { ground } : {}),
    };
  }

  /**
   * A character drawn for the book: asked for, gated, measured as a sheet
   * (every face on the head, every part joined), and asked for once more
   * with what fell short; the better kept, and rigged by code.
   */
  async drawSheet(
    character: StoryCharacter,
    bookTitle: string,
    documentId: string | null,
    who: string,
    /** Drawn again as the maker asks, from how they are drawn now. */
    again?: DrawAgain,
  ): Promise<DrawnSheet | null> {
    const asked = sheetThing(character, bookTitle);
    const thing = again
      ? {
          ...asked,
          brief: `The maker asks for a change to how ${character.name} looks: "${again.words.replace(/"/g, "'")}". Draw them changed so, plainly: the change must show at a glance (asked to be rounder, they are clearly rounder). Keep everything the maker does not ask to change as it is in the drawing they have now. ${asked.brief}`,
        }
      : asked;
    const viewBox = CANVAS[thing.shape];
    let best: {
      sheet: CharacterSheet;
      faults: number;
      face: SheetFace | null;
    } | null = null;
    let notes: string[] | undefined;
    for (let attempt = 1; attempt <= DRAW_TRIES; attempt += 1) {
      let reply: string;
      try {
        const made = await this.llm.sceneDrawing({
          thing,
          viewBox,
          topic: bookTitle,
          neighbours: [],
          notes,
          ...(again?.reference ? { reference: again.reference } : {}),
        });
        await this.record(documentId, 'scene_draw', made.usage);
        reply = made.value;
      } catch (error) {
        this.logger.warn(
          `${who}: ${character.name} could not be asked for: ${(error as Error).message}`,
        );
        continue;
      }
      // Drawn still, as asked: code moves it, so stillness is no fault.
      const gated = await gateDrawing(reply, { ...thing, motion: '' });
      if (!gated.drawing) {
        notes = gated.notes;
        continue;
      }
      const measured = await measureSheet(gated.drawing).catch(
        (error: unknown) => ({
          sheet: null,
          notes: [`It could not be measured: ${(error as Error).message}`],
        }),
      );
      // Its face as asked: the mouth's place marked, and no mouth drawn.
      const faced = measured.sheet
        ? await measureFace(gated.drawing).catch((error: unknown) => {
            this.logger.warn(
              `${who}: ${character.name}'s face could not be measured: ${(error as Error).message}`,
            );
            return null;
          })
        : null;
      const short = faced ? faceNotes(faced) : [];
      // Asked to change, and come back as it was: told so, once.
      if (
        again?.reference &&
        drawnAlike(gated.drawing.svg, again.reference) >= COPIED
      )
        short.push(
          `It came back as it was drawn before: change it as the maker asks ("${again.words.replace(/"/g, "'")}"), moving and reshaping its parts so the change shows at a glance.`,
        );
      const faults =
        (gated.retry ? 1 : 0) + measured.notes.length + short.length;
      if (measured.sheet && (!best || faults < best.faults))
        best = { sheet: measured.sheet, faults, face: faced?.face ?? null };
      if (measured.sheet && !faults) break;
      notes = [...gated.notes, ...measured.notes, ...short];
      this.logger.log(
        `${who}: ${character.name} try ${attempt} fell short: ${notes.join(' ')}`,
      );
    }
    if (!best) {
      this.logger.warn(`${who}: ${character.name} could not be drawn`);
      return null;
    }
    this.logger.log(`${who}: ${character.name} drawn for the whole book`);
    // Code draws the mouth where the artist marked it, and the mark goes;
    // a mouth drawn after all is covered where code draws its own.
    const face = best.face;
    if (face && Object.keys(face.covered).length)
      this.logger.log(
        `${who}: ${character.name}'s drawn mouth covered on ${Object.keys(face.covered).join(', ')}`,
      );
    const faced: CharacterSheet = face
      ? {
          ...best.sheet,
          drawing: unmarked(best.sheet.drawing),
          anchors: { ...best.sheet.anchors, mouth: face.mouth },
          face,
        }
      : best.sheet;
    // Its parts joined and moved by code; unrigged, it is rigged when
    // next read from the cast.
    try {
      const rigged = await rigSheet(faced);
      if (rigged.notes.length)
        this.logger.log(`${who}: ${character.name}: ${rigged.notes.join(' ')}`);
      // The face goes where its head was moved in to meet the body.
      const head = rigged.sheet.rig?.mended.find((m) => m.part === 'head');
      return {
        sheet:
          rigged.sheet.face && head
            ? {
                ...rigged.sheet,
                face: faceMoved(rigged.sheet.face, [head.dx, head.dy]),
              }
            : rigged.sheet,
        unjoined: rigged.notes,
      };
    } catch (error) {
      this.logger.warn(
        `${who}: ${character.name} could not be rigged: ${(error as Error).message}`,
      );
      return { sheet: faced, unjoined: [] };
    }
  }
}
