/**
 * "Adolescent Health Medicine: Five Foundations" (studio-glitch-plan), as
 * the Studio made it on 2026-09-30 and as it composes now: its six
 * sheets, its outline and show, each scene's voice as it was timed and
 * the drawings the artist made for it (adolescent-health/film.json). Its
 * people and whatever code draws are drawn again by code; no model is
 * asked, nothing is voiced. For the tests and scripts/studio-film-check.
 *
 * Each scene is made as SceneProcessor.make makes a Studio explainer's:
 * studioMakeOf's script, its cards cut for its audience, composed on its
 * drawings and voice, and its text paced (with the flicker fix).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import type { Element } from 'domhandler';
import type { SceneDto, SceneTiming } from '../../../../contracts';
import type {
  StudioEpisodeRecord,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../../repositories/studio.repository';
import { studioMakeOf } from '../../../../pipeline/processors/studio.processor';
import type { Callout } from '../../scene-callouts';
import { drawByCode } from '../../scene-code';
import { composeScene } from '../../scene-compose';
import { clearDrawnWords, type WordsCleared } from '../../scene-drawn-words';
import { VIEW_RIG } from '../../scene-figure-views';
import { renderSvg } from '../../scene-raster';
import { textPacing, trimCards } from '../../scene-reading';
import {
  SCENE_GENERATOR_VERSION,
  facesShown,
  isCodeThing,
  signsShown,
  type SceneScript,
} from '../../scene-script';
import { figureDrawing } from '../../scene-sheet';
import type { GatedDrawing } from '../../scene-svg';
import type { TimedBeat } from '../../scene-timing';
import type {
  ExplainerSheet,
  StudioBible,
  StudioBrief,
  StudioOutline,
} from '../studio';
import { showTheme } from '../studio-look';
import { studioReading } from '../studio-motion';
import type { FilmShape } from '../../scene-shape';

/** A drawing the artist made, as the film kept it. */
interface KeptDrawing {
  svg: string;
  viewBox: [number, number, number, number];
  aspect: number;
  parts: Record<string, string>;
  labels: Record<string, string>;
  states: Record<string, string>;
  moves: boolean;
  callouts: Callout[];
}

/** One scene as the film kept it. */
export interface FilmScene {
  sheet: ExplainerSheet;
  beats: TimedBeat[];
  durationMs: number;
  timing: SceneTiming;
  voicePace?: number;
  drawings: Record<string, KeptDrawing>;
  /** Its stage changes and zooms as it was made, before these fixes. */
  made: {
    steps: { atMs: number; show: string[]; cut?: true }[];
    effects: { atMs: number; target: string; do: 'zoom' }[];
  };
}

export interface Film {
  source: string;
  brief: StudioBrief;
  bible: StudioBible;
  outline: StudioOutline;
  scenes: FilmScene[];
}

/** The film as kept. */
export const ADOLESCENT_FILM: Film = JSON.parse(
  readFileSync(join(__dirname, 'adolescent-health', 'film.json'), 'utf8'),
) as Film;

/** A kept drawing as the gate hands it on, its drawn words set clear as the gate now does. */
async function gatedOf(kept: KeptDrawing): Promise<{
  drawing: GatedDrawing;
  cleared: WordsCleared[];
}> {
  const doc = parseDocument(kept.svg, { xmlMode: true, recognizeCDATA: true });
  const root = doc.children.find(
    (node) => 'name' in node && (node as Element).name === 'svg',
  ) as Element;
  const cleared = await clearDrawnWords(root, kept.viewBox);
  const svg = render(root, { xmlMode: true, selfClosingTags: true });
  // Where it has ink, for words the stage sets over it (as liftCallouts measures it).
  const field = kept.callouts.length
    ? await renderSvg(svg, undefined, { grid: { svg, cols: 48 } }).then(
        ({ grid }) => (grid ? { viewBox: kept.viewBox, map: grid } : null),
      )
    : null;
  return {
    drawing: {
      svg,
      viewBox: kept.viewBox,
      aspect: kept.aspect,
      parts: kept.parts,
      labels: kept.labels,
      states: kept.states,
      moves: kept.moves,
      callouts: kept.callouts,
      field,
    },
    cleared,
  };
}

/** One scene composed now, with what was done to it on the way. */
export interface ComposedScene extends ReturnType<typeof composeScene> {
  script: SceneScript;
  pacing: string[];
  /** Words set clear in its drawings, by drawing. */
  words: Record<string, WordsCleared[]>;
}

/** The film's scenes composed as the Studio composes them now, in order. */
export async function composeAdolescentFilm(
  film: Film = ADOLESCENT_FILM,
  /** The film's shape (studio-vertical-plan): tall, placed on its 900 × 1600 stage. */
  shape: FilmShape = 'wide',
): Promise<ComposedScene[]> {
  const show = {
    id: 'film',
    userId: 'film',
    title: film.outline.title,
    format: 'explainer',
    brief: film.brief,
    bible: film.bible,
  } as unknown as StudioShowRecord;
  const episode = {
    id: 'film-e1',
    showId: 'film',
    number: 1,
    title: film.outline.title,
    outline: film.outline,
  } as unknown as StudioEpisodeRecord;
  const rows = film.scenes.map(
    (one, position) =>
      ({
        id: `s${position}`,
        episodeId: 'film-e1',
        position,
        sheet: one.sheet,
        status: 'made',
      }) as StudioSceneRecord,
  );
  const reading = studioReading(film.brief);
  const theme = showTheme(film.brief, film.bible);
  const out: ComposedScene[] = [];
  for (const [position, kept] of film.scenes.entries()) {
    const of = studioMakeOf(show, episode, rows[position], rows, film.bible);
    const script = of.script!;
    const drawings = new Map<string, GatedDrawing | null>();
    const words: Record<string, WordsCleared[]> = {};
    for (const thing of script.cast) {
      if (isCodeThing(thing))
        drawings.set(thing.id, await drawByCode(thing).catch(() => null));
      else if (thing.kind === 'person')
        drawings.set(
          thing.id,
          await figureDrawing(thing.figure, thing.id, {
            count: thing.count,
            pose: thing.pose,
            holding: thing.holding,
            signs: signsShown(script, thing.id),
            faces: facesShown(script, thing.id),
            rig: VIEW_RIG,
            faceRig: true,
          }).catch(() => null),
        );
      else if (thing.kind === 'drawing' && kept.drawings[thing.id]) {
        const gated = await gatedOf(kept.drawings[thing.id]);
        drawings.set(thing.id, gated.drawing);
        if (gated.cleared.length) words[thing.id] = gated.cleared;
      }
    }
    const made = composeScene({
      script: trimCards(script, reading.cardWords),
      drawings,
      beats: kept.beats,
      durationMs: kept.durationMs,
      timing: kept.timing,
      generator: SCENE_GENERATOR_VERSION,
      profile: of.profile,
      ...(shape !== 'wide' ? { shape } : {}),
    });
    made.scene.reading = { wpm: reading.wpm, motion: reading.motion };
    const pacing = textPacing(made.scene, reading);
    if (kept.voicePace !== undefined) made.scene.voicePace = kept.voicePace;
    if (theme && theme !== 'paper') made.scene.theme = theme;
    out.push({ ...made, script, pacing, words });
  }
  return out;
}

/** A scene as it was made, for the flicker check: its stage changes and zooms. */
export const madeScene = (
  one: FilmScene,
): Pick<SceneDto, 'steps' | 'effects' | 'durationMs'> =>
  ({
    durationMs: one.durationMs,
    steps: one.made.steps,
    effects: one.made.effects,
  }) as unknown as Pick<SceneDto, 'steps' | 'effects' | 'durationMs'>;
