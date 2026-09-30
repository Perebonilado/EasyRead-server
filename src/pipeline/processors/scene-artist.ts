/**
 * The artist's side of a story: a character, a place, or one of a show's
 * own things, drawn by the model in the house style of the people code
 * draws, brought to that style by code (scene-polish), measured, looked
 * at, and fixed (studio-drawings-plan §4).
 *
 * Each drawing is made in takes side by side (a new character three, each
 * framed its own way; a place or a thing two; a drawing asked to change,
 * one), and each take goes round: drawn, gated, polished, measured,
 * rendered with its neutral face, and judged from its picture by a vision
 * model (drawing_judge). A take that falls short goes back to the artist
 * to revise its own drawing, with the judge's instructions and what code
 * found as its notes, at most twice; of every round of every take the
 * best is kept, by the judge's score and then the fewest faults code
 * found. Every call is recorded, so its cost counts.
 *
 * Out of the scene processor so the drawing bench (scripts/drawing-bench.ts)
 * draws each one exactly as a show does, with no storage and no database:
 * all it needs is the model, somewhere to record each call, and a log.
 */
import type { LlmGatewayPort, LlmUsage } from '../../business/ports/llm.port';
import { faceFaults } from '../../business/domain/drawing-checks';
import {
  redrawNotes,
  verdictNotes,
  verdictPasses,
  verdictScore,
  type DrawingKind,
  type DrawingVerdict,
} from '../../business/domain/drawing-score';
import { askedFor, type Asked } from '../../business/domain/scene-house';
import {
  KIT_LINE,
  SIZE_UNITS,
  lineFor,
  setLine,
} from '../../business/domain/scene-ink';
import {
  measureGround,
  type SetGround,
} from '../../business/domain/scene-ground';
import {
  describePolish,
  polishDrawing,
} from '../../business/domain/scene-polish';
import { rasterise, type InkBox } from '../../business/domain/scene-raster';
import {
  SET_VERSION,
  drawnAlike,
  measureOwnFeature,
  measureSheet,
  ownFeatureScale,
  type CharacterSheet,
  type SetSheet,
} from '../../business/domain/scene-sheet';
import {
  buildSet,
  describeLayout,
  layoutBrief,
  layoutOf,
  type SetLayering,
  type SetLayout,
  type SetLook,
} from '../../business/domain/scene-set-layout';
import type { SetPiece } from '../../business/domain/scene-set-pieces';
import { rigSheet } from '../../business/domain/scene-sheet-rig';
import {
  MOUTH_MARK,
  faceMoved,
  faceNotes,
  faceShown,
  measureFace,
  unmarked,
  type SheetFace,
} from '../../business/domain/scene-sheet-face';
import {
  OWN_FEATURE_CANVAS,
  SET_CANVAS,
  ownFeatureBrief,
  setThing,
  sheetThing,
  type PlaceKind,
  type StoryCharacter,
  type StoryPlace,
  type StoryWorld,
} from '../../business/domain/scene-story';
import type { DrawingThing } from '../../business/domain/scene-script';
import {
  CANVAS,
  gateDrawing,
  type GatedDrawing,
} from '../../business/domain/scene-svg';

/** Tries at one explainer drawing: the first, and one more with the gate's notes. */
export const DRAW_TRIES = 2;
/** A drawing asked to change that is this alike the one before was copied, not changed. */
export const COPIED = 0.8;
/** The most of a drawing the artist is shown to draw from, in characters. */
const REFERENCE_CHARS = 24_000;

/** Drawings made side by side, the best kept: a new character, one asked to change, a thing, a place. */
export const TAKES = { character: 3, again: 1, thing: 2, set: 2 } as const;
/** Revisions of a take after its first drawing, at most. */
export const REVISIONS = 2;
/** How freely takes made side by side are drawn, so they differ. */
export const TAKE_TEMPERATURE = 0.8;
/** The judge's picture of a character or a thing, and of a place, in pixels across. */
const JUDGE_PX = 512;
const JUDGE_SET_PX = 768;

/** How each take is framed, by what is drawn: the first way, another, a picture-book illustrator's. */
export const FRAMINGS: Record<
  'animal' | 'creature' | 'thing' | 'place',
  string[]
> = {
  animal: [
    'side view, facing right, all four legs showing: the front pair apart from the back pair',
    'three-quarter view, facing right, its head turned a little toward the viewer',
    'as a picture-book illustrator would draw it: side-on, full of character, in a simple natural pose',
  ],
  creature: [
    'facing the viewer, standing',
    'three-quarter view, standing',
    'as a picture-book illustrator would draw it, standing, full of character',
  ],
  thing: [
    'seen from the side, whole',
    'as a picture-book illustrator would draw it, whole and simple',
  ],
  place: [
    'at eye level, plainly',
    'as a picture-book illustrator would paint it, at eye level',
  ],
};

/** How each take of a place's layout is asked for: plainly, and full of what makes it that place. */
export const LAYOUT_HINTS = [
  'plainly, with the things it must have',
  'as a picture-book illustrator would, full of the things that make it that place',
];

/**
 * A drawing as the artist is shown it to draw from: as still as it was
 * drawn, with none of the rig's motion (and no mouth, where code draws
 * it). None when it is too long to show.
 */
export function referenceOf(sheet: CharacterSheet): string | null {
  const svg = sheet.drawing.svg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  return svg.length <= REFERENCE_CHARS ? svg : null;
}

/**
 * A drawing as its artist drew it, to revise: its canvas's frame again
 * (the gate framed it to its ink; nothing in it moved) and no styles.
 */
export function asDrawn(svg: string, canvas: { w: number; h: number }): string {
  return svg
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(
      /(<svg\b[^>]*?\bviewBox=")[^"]*(")/i,
      `$1${`0 0 ${canvas.w} ${canvas.h}`}$2`,
    );
}

/** What each model call the artist makes is recorded as. */
export type ArtistTask =
  'scene_draw' | 'cast_draw' | 'set_paint' | 'drawing_judge';

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

/** How hard the artist works at a drawing: the defaults are a show's. */
export interface ArtistOptions {
  /** Drawings made side by side, the best kept. */
  takes?: number;
  /** Whether each is judged from its picture and revised: without, only what code finds sends it back. */
  see?: boolean;
  /** Revisions after a take's first drawing, at most. */
  revisions?: number;
  /**
   * How a place is made: built by code from a layout the painter writes
   * (studio-drawings-plan §7, D1), or painted whole by the artist. A
   * Studio set is built, a book's page painted, unless this says.
   */
  painter?: 'layout' | 'artist';
  /** A Studio show's animation style on a set it builds: a tint over its palette, and its ink. */
  look?: SetLook;
}

/** A character drawn, rigged, what the rig could not join, and the other takes' best. */
export interface DrawnSheet {
  sheet: CharacterSheet;
  /** The parts the rig could not join to the body, in its words: they are kept still. */
  unjoined: string[];
  /** The judge's last word on it; null when it was not asked. */
  verdict: DrawingVerdict | null;
  /** The other takes' best, better first, drawn and rigged the same: offered to choose from. */
  others: CharacterSheet[];
}

/** A character drawn again as the maker asks, from how they are drawn now. */
export interface DrawAgain {
  words: string;
  /** How they are drawn now, as SVG, for the artist to draw from; null when too long to show. */
  reference: string | null;
  /** The sheet they have now: the judge sees it beside the new one. */
  before?: CharacterSheet | null;
}

/** One round of a take, made: what it came to, its drawing to revise, what code found, and its picture. */
export interface Round<T> {
  value: T;
  /** Its drawing as polished, in its canvas's frame: what is sent back to revise. */
  svg: string;
  /** What code found short, in words for the artist. */
  faults: string[];
  /** The picture the judge looks at; null when it could not be made. */
  png: Buffer | null;
}

/** A round as judged: kept when it is the best so far. */
export interface Judged<T> extends Round<T> {
  verdict: DrawingVerdict | null;
  score: number;
}

/** How a round ranks: judged above unjudged, the higher score, then the fewer faults. */
const rankOf = (one: Judged<unknown>) => (one.verdict ? one.score : -1);

/** Whether a round is better than another. */
export function better(a: Judged<unknown>, b: Judged<unknown>): boolean {
  const ra = rankOf(a);
  const rb = rankOf(b);
  return ra > rb || (ra === rb && a.faults.length < b.faults.length);
}

/** Rounds best first. */
export const ranked = <T>(rounds: (Judged<T> | null)[]): Judged<T>[] =>
  rounds
    .filter((one): one is Judged<T> => Boolean(one))
    .sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));

/**
 * Whether a round is right: nothing code found, and a judge who passes
 * it (or none asked, or none who could say, so nothing is drawn again for
 * want of a judge).
 */
export const roundPasses = (one: Judged<unknown>, judged: boolean): boolean =>
  !one.faults.length &&
  (!judged || one.verdict === null || verdictPasses(one.verdict));

/** Where a place's open ground should meet what stands behind it, a share of the height down. */
const HORIZON: Record<PlaceKind, [number, number]> = {
  outdoor: [0.5, 0.76],
  indoor: [0.55, 0.82],
  vessel: [0.5, 0.82],
};

export class SceneArtist {
  constructor(
    private readonly llm: LlmGatewayPort,
    private readonly record: ArtistRecord,
    private readonly logger: ArtistLog,
  ) {}

  /**
   * One take: drawn, made (gated, polished, measured), judged, and sent
   * back to revise its own drawing with the notes while it falls short,
   * at most `revisions` times. The best round, or null when none came
   * through.
   */
  async take<T>(
    what: string,
    ask: (round: { notes?: string[]; previous?: string }) => Promise<string>,
    make: (reply: string) => Promise<Round<T> | { notes: string[] }>,
    look: ((png: Buffer) => Promise<DrawingVerdict | null>) | null,
    revisions: number,
    notesOf: (verdict: DrawingVerdict | null) => string[] = verdictNotes,
    stop?: AbortSignal,
  ): Promise<Judged<T> | null> {
    let best: Judged<T> | null = null;
    let notes: string[] | undefined;
    let previous: string | undefined;
    for (let round = 0; round <= revisions; round += 1) {
      if (stop?.aborted) break;
      let reply: string;
      try {
        reply = await ask({ notes, previous });
      } catch (error) {
        this.logger.warn(
          `${what} could not be asked for: ${(error as Error).message}`,
        );
        continue;
      }
      const made = await make(reply);
      if (!('value' in made)) {
        notes = made.notes;
        this.logger.log(
          `${what} round ${round + 1} came to nothing: ${notes.join(' ')}`,
        );
        continue;
      }
      const verdict = look && made.png ? await look(made.png) : null;
      const judged: Judged<T> = {
        ...made,
        verdict,
        score: verdictScore(verdict),
      };
      if (!best || better(judged, best)) best = judged;
      if (roundPasses(judged, Boolean(look))) break;
      notes = [...notesOf(verdict), ...made.faults];
      // Seeing it, the artist revises its own drawing; blind, it draws
      // afresh with the notes, as it always did.
      previous = look ? made.svg : undefined;
      if (round < revisions)
        this.logger.log(
          `${what} round ${round + 1} fell short${verdict ? ` (${verdictScore(verdict)}: ${verdict.sees})` : ''}: ${notes.join(' ')}`,
        );
    }
    return best;
  }

  /** A drawing judged from its picture, recorded; null when the judge could not say. */
  private async judge(
    png: Buffer,
    about: { kind: DrawingKind; brief: string },
    documentId: string | null,
    who: string,
    old?: { png: Buffer; words: string },
  ): Promise<DrawingVerdict | null> {
    try {
      const judged = await this.llm.drawingJudge({
        png,
        kind: about.kind,
        brief: about.brief,
        ...(old ? { old } : {}),
      });
      await this.record(documentId, 'drawing_judge', judged.usage);
      return judged.value;
    } catch (error) {
      this.logger.warn(
        `${who}: the drawing could not be judged: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** A drawing brought to the house style; as it was when that fails. */
  private async polish(
    drawing: GatedDrawing,
    options: Parameters<typeof polishDrawing>[1],
    what: string,
  ): Promise<GatedDrawing> {
    try {
      const polished = await polishDrawing(drawing, options);
      const said = describePolish(polished.changes);
      if (said) this.logger.log(`${what}: ${said}`);
      return polished.drawing;
    } catch (error) {
      this.logger.warn(
        `${what} could not be polished: ${(error as Error).message}`,
      );
      return drawing;
    }
  }

  /** A picture for the judge; null when it cannot be rendered, and then nothing is judged. */
  private async picture(svg: string, width: number): Promise<Buffer | null> {
    try {
      return await rasterise(svg, width);
    } catch {
      return null;
    }
  }

  /**
   * One of the show's own, drawn in the house style (a thing someone
   * carries, a feature someone stands by): in takes side by side, each
   * gated, polished (its outline the kit's line at the size it stands
   * at, worked out from its ink by `line`), measured, judged and revised;
   * the best kept. Its cost is the scene's, as every drawing's is.
   */
  async drawOwn<T extends { svg: string }>(
    thing: DrawingThing,
    canvas: { w: number; h: number },
    measure: (drawing: GatedDrawing) => Promise<T>,
    topic: string,
    documentId: string | null,
    who: string,
    stop?: AbortSignal,
    options: ArtistOptions & {
      /** Its outline in its own units, from where its ink is: the kit's line at the size it stands. */
      line?: (ink: InkBox) => number;
      /** What the judge is told it is. */
      about?: { kind: 'thing' | 'feature'; brief: string };
    } = {},
  ): Promise<T | null> {
    const takes = Math.max(1, options.takes ?? TAKES.thing);
    const see = options.see ?? true;
    const revisions = Math.max(0, options.revisions ?? REVISIONS);
    const about = options.about ?? {
      kind: 'thing' as const,
      brief: `a ${thing.name}`,
    };
    const grips = thing.parts.map((part) => part.name);
    const make = async (
      reply: string,
    ): Promise<Round<T> | { notes: string[] }> => {
      // Drawn still, as asked: code moves it, so stillness is no fault.
      const gated = await gateDrawing(reply, { ...thing, motion: '' });
      if (!gated.drawing) return { notes: gated.notes };
      const drawing = await this.polish(
        gated.drawing,
        {
          line: options.line ?? KIT_LINE,
          protect: grips
            .map((name) => gated.drawing!.parts[name])
            .filter(Boolean),
        },
        `${who}: the ${thing.name}`,
      );
      let value: T;
      try {
        value = await measure(drawing);
      } catch (error) {
        return {
          notes: [
            ...gated.notes,
            `It could not be measured: ${(error as Error).message}.`,
          ],
        };
      }
      return {
        value,
        svg: asDrawn(drawing.svg, canvas),
        faults: gated.retry ? gated.notes : [],
        png: see ? await this.picture(value.svg, JUDGE_PX) : null,
      };
    };
    const hints = takes > 1 ? FRAMINGS.thing : [];
    const results = await Promise.all(
      Array.from({ length: takes }, (_, k) =>
        this.take<T>(
          `${who}: the ${thing.name}${takes > 1 ? ` (take ${k + 1})` : ''}`,
          async ({ notes, previous }) => {
            const made = await this.llm.sceneDrawing({
              thing,
              viewBox: canvas,
              topic,
              neighbours: [],
              notes,
              purpose: 'cast',
              // Its canvas is in the kit's own units: the kit's line.
              asked: { line: KIT_LINE },
              ...(hints[k] ? { hint: hints[k] } : {}),
              ...(takes > 1 ? { temperature: TAKE_TEMPERATURE } : {}),
              ...(previous ? { previous } : {}),
            });
            await this.record(documentId, 'cast_draw', made.usage);
            return made.value;
          },
          make,
          see
            ? (png) =>
                this.judge(png, about, documentId, `${who}: the ${thing.name}`)
            : null,
          revisions,
          verdictNotes,
          stop,
        ),
      ),
    );
    const best = ranked(results)[0];
    if (!best) {
      this.logger.warn(`${who}: the ${thing.name} could not be drawn`);
      return null;
    }
    if (best.verdict)
      this.logger.log(
        `${who}: the ${thing.name} judged ${best.score}: ${best.verdict.sees}`,
      );
    return best.value;
  }

  /**
   * A place painted for the book or show, in takes side by side: each
   * gated as a set, polished, its ground read, judged and revised; the
   * best kept, with its ground measured for the crowds that stand on it.
   */
  async paintSet(
    place: StoryPlace,
    bookTitle: string,
    documentId: string | null,
    who: string,
    world: StoryWorld | null = null,
    options: ArtistOptions = {},
  ): Promise<SetSheet | null> {
    const painter =
      options.painter ?? (place.features !== undefined ? 'layout' : 'artist');
    if (painter === 'layout')
      return this.buildSet(place, bookTitle, documentId, who, world, options);
    const thing = setThing(place, bookTitle, world);
    const takes = Math.max(1, options.takes ?? TAKES.set);
    const see = options.see ?? true;
    const revisions = Math.max(0, options.revisions ?? REVISIONS);
    const line = setLine(SET_CANVAS.h);
    const [low, high] = HORIZON[place.kind ?? 'outdoor'];
    const make = async (
      reply: string,
    ): Promise<
      | Round<{ drawing: GatedDrawing; ground: SetGround | null }>
      | { notes: string[] }
    > => {
      const gated = await gateDrawing(reply, thing, { backdrop: true });
      if (!gated.drawing) return { notes: gated.notes };
      const drawing = await this.polish(
        gated.drawing,
        { line, backdrop: true },
        `${who}: ${place.name}`,
      );
      // Where its ground is, read now: a ground that cannot be read, or
      // that meets what stands behind it too high or too low, is drawn
      // again.
      const ground = await measureGround(drawing);
      const faults = gated.retry ? [...gated.notes] : [];
      if (ground && ground.source === 'convention')
        faults.push(
          'Paint the open ground or floor people stand on as its own group with id "ground", across the lower part of the picture, in a colour of its own.',
        );
      else if (ground && (ground.horizon < low || ground.horizon > high))
        faults.push(
          `Let the open ground or floor meet what stands behind it about ${Math.round(((low + high) / 2) * 100)}% of the way down the picture, not ${Math.round(ground.horizon * 100)}%.`,
        );
      return {
        value: { drawing, ground },
        svg: asDrawn(drawing.svg, SET_CANVAS),
        faults,
        png: see ? await this.picture(drawing.svg, JUDGE_SET_PX) : null,
      };
    };
    const hints = takes > 1 ? FRAMINGS.place : [];
    const about = {
      kind: 'place' as const,
      brief: `${place.name}${place.look ? `: ${place.look}` : ''}`,
    };
    const results = await Promise.all(
      Array.from({ length: takes }, (_, k) =>
        this.take(
          `${who}: ${place.name}${takes > 1 ? ` (take ${k + 1})` : ''}`,
          async ({ notes, previous }) => {
            const made = await this.llm.sceneDrawing({
              thing,
              viewBox: SET_CANVAS,
              topic: bookTitle,
              neighbours: [],
              notes,
              backdrop: true,
              asked: { line },
              ...(hints[k] ? { hint: hints[k] } : {}),
              ...(takes > 1 ? { temperature: TAKE_TEMPERATURE } : {}),
              ...(previous ? { previous } : {}),
            });
            await this.record(documentId, 'set_paint', made.usage);
            return made.value;
          },
          make,
          see ? (png) => this.judge(png, about, documentId, who) : null,
          revisions,
        ),
      ),
    );
    const best = ranked(results)[0];
    if (!best) {
      this.logger.warn(`${who}: ${place.name} could not be painted`);
      return null;
    }
    this.logger.log(
      `${who}: ${place.name} painted for the whole book${best.verdict ? `, judged ${best.score}: ${best.verdict.sees}` : ''}`,
    );
    // Kept without its ground when the render failed, to be measured next time.
    const { drawing, ground } = best.value;
    if (!ground)
      this.logger.warn(
        `${who}: ${place.name}'s ground could not be measured; measured again next time`,
      );
    return {
      version: SET_VERSION,
      drawing,
      ...(ground ? { ground } : {}),
    };
  }

  /**
   * A place built by code from its layout (studio-drawings-plan §7, D1):
   * the painter writes what it has and where (scene-set-layout), code
   * draws it in the kit's hand, gated as a set, its ground read exactly
   * from its own group, and judged from its picture; a take that falls
   * short goes back to the painter with its own layout and the notes.
   * What the kit has no piece for is drawn once by the artist, as one of
   * the show's own features, and placed like a piece. The best is kept,
   * with its layout, so it can be built again.
   */
  private async buildSet(
    place: StoryPlace,
    bookTitle: string,
    documentId: string | null,
    who: string,
    world: StoryWorld | null,
    options: ArtistOptions,
  ): Promise<SetSheet | null> {
    const thing = setThing(place, bookTitle, world);
    const brief = layoutBrief(place, bookTitle, world);
    // A layout code has for it (a Studio clip's common place) is built
    // from, no model asked; one to paint once is one take, unjudged.
    const preset = place.layout ?? null;
    const quick = Boolean(preset || place.once);
    const takes = quick ? 1 : Math.max(1, options.takes ?? TAKES.set);
    const see = quick ? false : (options.see ?? true);
    const revisions = quick
      ? 0
      : Math.max(0, options.revisions ?? REVISIONS);
    const [low, high] = HORIZON[place.kind ?? 'outdoor'];
    // Each thing the kit has no piece for, drawn once however many takes
    // and rounds ask for it.
    const drawnOwn = new Map<string, Promise<SetPiece | null>>();
    const ownPiece = (name: string): Promise<SetPiece | null> => {
      const key = name.toLowerCase();
      let got = drawnOwn.get(key);
      if (!got) {
        const id = `set-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'thing'}`;
        got = this.drawOwn(
          ownFeatureBrief({ id, name, opens: false }, bookTitle, world),
          OWN_FEATURE_CANVAS,
          (drawing) => measureOwnFeature(drawing, id, null),
          bookTitle,
          documentId,
          `${who}: ${place.name}`,
          undefined,
          {
            takes: 1,
            see,
            revisions: Math.min(1, revisions),
            line: (ink) => KIT_LINE / ownFeatureScale(ink, null),
            about: { kind: 'feature', brief: `a ${name}` },
          },
        ).catch(() => null);
        drawnOwn.set(key, got);
      }
      return got;
    };
    type Built = {
      drawing: GatedDrawing;
      ground: SetGround | null;
      layout: SetLayout;
      layered: SetLayering;
    };
    const make = async (
      reply: string,
    ): Promise<Round<Built> | { notes: string[] }> => {
      let raw: unknown;
      try {
        raw = JSON.parse(reply);
      } catch {
        return {
          notes: ['Answer with the layout in the JSON shape asked for.'],
        };
      }
      // In the style pack the story's world says, where it says one.
      const layout = layoutOf(raw, place, world);
      const own: Record<string, SetPiece> = {};
      for (const item of layout.own) {
        // A landmark code builds from its parameters needs no artist.
        if (item.build) continue;
        const piece = await ownPiece(item.name);
        if (piece) own[item.name] = piece;
      }
      const built = buildSet(layout, place, own, world, options.look ?? null);
      for (const note of built.notes)
        this.logger.log(`${who}: ${place.name}: ${note}`);
      const gated = await gateDrawing(built.svg, thing, { backdrop: true });
      if (!gated.drawing)
        return { notes: [`It could not be built: ${gated.notes.join(' ')}`] };
      const drawing = gated.drawing;
      const ground = await measureGround(drawing);
      const faults: string[] = [];
      if (!layout.items.length && !layout.own.length)
        faults.push(
          `Place the things that make it ${place.name}: nothing was placed.`,
        );
      if (ground && ground.source === 'convention')
        faults.push('Its ground could not be read: give it a ground.');
      else if (ground && (ground.horizon < low || ground.horizon > high))
        faults.push(
          `Its open ground reaches ${Math.round(ground.horizon * 100)}% of the way down before something stands on it: move the things at the back of it farther back or to the sides.`,
        );
      return {
        value: { drawing, ground, layout, layered: built.layered },
        // What goes back to be revised is the layout itself.
        svg: JSON.stringify(raw),
        faults,
        png: see ? await this.picture(drawing.svg, JUDGE_SET_PX) : null,
      };
    };
    const about = {
      kind: 'place' as const,
      brief: `${place.name}${place.look ? `: ${place.look}` : ''}`,
    };
    const results = await Promise.all(
      Array.from({ length: takes }, (_, k) =>
        this.take<Built>(
          `${who}: ${place.name}${takes > 1 ? ` (take ${k + 1})` : ''}`,
          async ({ notes, previous }) => {
            if (preset) return JSON.stringify(preset);
            const made = await this.llm.setLayout({
              brief,
              notes,
              ...(takes > 1 && LAYOUT_HINTS[k]
                ? { hint: LAYOUT_HINTS[k] }
                : {}),
              ...(takes > 1 ? { temperature: TAKE_TEMPERATURE } : {}),
              ...(previous ? { previous } : {}),
            });
            await this.record(documentId, 'set_paint', made.usage);
            return JSON.stringify(made.value);
          },
          make,
          see ? (png) => this.judge(png, about, documentId, who) : null,
          revisions,
        ),
      ),
    );
    const best = ranked(results)[0];
    if (!best) {
      this.logger.warn(`${who}: ${place.name} could not be built`);
      return null;
    }
    const { drawing, ground, layout, layered } = best.value;
    this.logger.log(
      `${who}: ${place.name} built from its layout (${describeLayout(layout)})${best.verdict ? `, judged ${best.score}: ${best.verdict.sees}` : ''}`,
    );
    if (!ground)
      this.logger.warn(
        `${who}: ${place.name}'s ground could not be measured; measured again next time`,
      );
    return {
      version: SET_VERSION,
      drawing,
      ...(ground ? { ground } : {}),
      layout,
      layered,
    };
  }

  /**
   * A character drawn for the book or show, in the house style: in takes
   * side by side (three for a new character, each framed its own way; one
   * when the maker asks for a change), each gated, polished, measured as
   * a sheet (every face on the head, every part joined, the mouth's place
   * marked), judged from its picture with its neutral face and revised;
   * the best kept and rigged by code, and the other takes' best beside it.
   */
  async drawSheet(
    character: StoryCharacter,
    bookTitle: string,
    documentId: string | null,
    who: string,
    /** Drawn again as the maker asks, from how they are drawn now. */
    again?: DrawAgain,
    options: ArtistOptions = {},
  ): Promise<DrawnSheet | null> {
    const asked = sheetThing(character, bookTitle);
    const thing = again
      ? {
          ...asked,
          brief: `The maker asks for a change to how ${character.name} looks: "${again.words.replace(/"/g, "'")}". Draw them changed so, plainly: the change must show at a glance (asked to be rounder, they are clearly rounder). Keep everything the maker does not ask to change as it is in the drawing they have now. ${asked.brief}`,
        }
      : asked;
    const viewBox = CANVAS[thing.shape];
    const units = SIZE_UNITS[character.size ?? 'medium'];
    const want: Asked = askedFor(viewBox.h, units);
    const kind: 'animal' | 'creature' =
      character.kind === 'animal' ? 'animal' : 'creature';
    const takes = Math.max(
      1,
      options.takes ?? (again ? TAKES.again : TAKES.character),
    );
    const see = options.see ?? true;
    const revisions = Math.max(0, options.revisions ?? REVISIONS);
    const about = {
      kind,
      brief: `${character.name}${character.look ? `: ${character.look}` : ''}`,
    };
    // The drawing they have now, for the judge to see beside the new one.
    const old =
      see && again?.before
        ? await this.picture(faceShown(again.before, character.id), JUDGE_PX)
        : null;
    type Made = { sheet: CharacterSheet; face: SheetFace | null };
    const make = async (
      reply: string,
    ): Promise<Round<Made> | { notes: string[] }> => {
      // Drawn still, as asked: code moves it, so stillness is no fault.
      const gated = await gateDrawing(reply, { ...thing, motion: '' });
      if (!gated.drawing) return { notes: gated.notes };
      const drawing = await this.polish(
        gated.drawing,
        {
          line: lineFor(gated.drawing.viewBox[3], units),
          protect: [
            ...Object.values(gated.drawing.states),
            ...(gated.drawing.parts[MOUTH_MARK]
              ? [gated.drawing.parts[MOUTH_MARK]]
              : []),
          ],
        },
        `${who}: ${character.name}`,
      );
      const measured = await measureSheet(drawing).catch((error: unknown) => ({
        sheet: null,
        notes: [`It could not be measured: ${(error as Error).message}`],
      }));
      if (!measured.sheet)
        return { notes: [...gated.notes, ...measured.notes] };
      // Its face as asked: the mouth's place marked, and no mouth drawn;
      // eyes that read beside the people.
      const faced = await measureFace(drawing).catch((error: unknown) => {
        this.logger.warn(
          `${who}: ${character.name}'s face could not be measured: ${(error as Error).message}`,
        );
        return null;
      });
      const face = faced?.face ?? null;
      const short = [
        ...(faced ? faceNotes(faced) : []),
        ...(face ? faceFaults(face, units / drawing.viewBox[3]) : []),
      ];
      // Asked to change, and come back as it was: told so.
      if (
        again?.reference &&
        drawnAlike(drawing.svg, again.reference) >= COPIED
      )
        short.push(
          `It came back as it was drawn before: change it as the maker asks ("${again.words.replace(/"/g, "'")}"), moving and reshaping its parts so the change shows at a glance.`,
        );
      const shown = face
        ? { drawing: unmarked(measured.sheet.drawing), face }
        : { drawing: measured.sheet.drawing };
      return {
        value: { sheet: measured.sheet, face },
        svg: asDrawn(drawing.svg, viewBox),
        faults: [
          ...(gated.retry ? gated.notes : []),
          ...measured.notes,
          ...[...new Set(short)],
        ],
        png: see
          ? await this.picture(faceShown(shown, character.id), JUDGE_PX)
          : null,
      };
    };
    const hints = takes > 1 ? FRAMINGS[kind] : [];
    const notesOf = (verdict: DrawingVerdict | null) => [
      ...verdictNotes(verdict),
      ...(again ? redrawNotes(verdict, again.words, character.name) : []),
    ];
    const results = await Promise.all(
      Array.from({ length: takes }, (_, k) =>
        this.take<Made>(
          `${who}: ${character.name}${takes > 1 ? ` (take ${k + 1})` : ''}`,
          async ({ notes, previous }) => {
            const made = await this.llm.sceneDrawing({
              thing,
              viewBox,
              topic: bookTitle,
              neighbours: [],
              notes,
              purpose: 'cast',
              asked: want,
              ...(hints[k] ? { hint: hints[k] } : {}),
              ...(takes > 1 ? { temperature: TAKE_TEMPERATURE } : {}),
              ...(previous ? { previous } : {}),
              ...(again?.reference ? { reference: again.reference } : {}),
            });
            await this.record(documentId, 'cast_draw', made.usage);
            return made.value;
          },
          make,
          see
            ? (png) =>
                this.judge(
                  png,
                  about,
                  documentId,
                  `${who}: ${character.name}`,
                  old && again ? { png: old, words: again.words } : undefined,
                )
            : null,
          revisions,
          notesOf,
        ),
      ),
    );
    const order = ranked(results);
    if (!order.length) {
      this.logger.warn(`${who}: ${character.name} could not be drawn`);
      return null;
    }
    const best = order[0];
    this.logger.log(
      `${who}: ${character.name} ${again ? 'drawn again as asked' : 'drawn for the whole book'}${best.verdict ? `, judged ${best.score}: ${best.verdict.sees}` : ''}`,
    );
    const [first, ...rest] = await Promise.all(
      order
        .slice(0, 3)
        .map((one, k) => this.finish(one.value, character, who, k === 0)),
    );
    return {
      sheet: first.sheet,
      unjoined: first.unjoined,
      verdict: best.verdict,
      others: rest.map((one) => one.sheet),
    };
  }

  /**
   * A drawn character made ready for the stage: code's mouth where the
   * artist marked it, the mark gone, and its parts joined and moved by
   * code; unrigged, it is rigged when next read from the cast.
   */
  private async finish(
    made: { sheet: CharacterSheet; face: SheetFace | null },
    character: StoryCharacter,
    who: string,
    loud: boolean,
  ): Promise<{ sheet: CharacterSheet; unjoined: string[] }> {
    // A mouth drawn after all is covered where code draws its own.
    const face = made.face;
    if (loud && face && Object.keys(face.covered).length)
      this.logger.log(
        `${who}: ${character.name}'s drawn mouth covered on ${Object.keys(face.covered).join(', ')}`,
      );
    const faced: CharacterSheet = face
      ? {
          ...made.sheet,
          drawing: unmarked(made.sheet.drawing),
          anchors: { ...made.sheet.anchors, mouth: face.mouth },
          face,
        }
      : made.sheet;
    try {
      const rigged = await rigSheet(faced);
      if (loud && rigged.notes.length)
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
      if (loud)
        this.logger.warn(
          `${who}: ${character.name} could not be rigged: ${(error as Error).message}`,
        );
      return { sheet: faced, unjoined: [] };
    }
  }
}
