/**
 * An explainer scene of shots composed (explainer-animation-tech.md §4.1,
 * §9): the board's plan built (shot-build), put on the voice's words
 * (shot-time), its pace put right (shot-check-timed) and its motion given
 * its sounds (shot-sound), as the SceneDto the player's ShotStage plays.
 *
 * Its voice, beats, ideas, timing and music are a lesson's, exactly as
 * composeScene makes them; its picture is all in `shots`, so its things,
 * steps and effects are empty and its stagings have no places.
 */
import type {
  FilmShape,
  SceneDto,
  SceneTiming,
  ShotDto,
} from '../../../contracts';
import type { DocumentProfile } from '../scene-profile';
import { paletteOf, placeMusic } from '../scene-music';
import type { PaletteEntry, PaletteToken } from '../scene-palette';
import {
  mendScript,
  type SceneFormat,
  type SceneScript,
} from '../scene-script';
import { STAGES } from '../scene-shape';
import type { ThemeId } from '../scene-themes';
import type { TimedBeat } from '../scene-timing';
import type { LearningStage } from '../scene-stage';
import type { ExplainerSheet } from '../studio/studio';
import type { EditorWorld } from '../studio/studio-editor';
import type { KitLook } from '../kit/style';
import { uiTimed } from './shot-ui';
import { buildShots } from './shot-build';
import { checkTimed, mendTimed } from './shot-check-timed';
import type { ShotMapSet } from './shot-map';
import { registryOf } from './shot-registry';
import { soundsOf } from './shot-sound';
import { timeShots } from './shot-time';
import type { RegistryEntry, ShotPlan, ShotProblem } from './types';

/** What the make hands the composer for a scene of shots: the board's plan and what it may name, and the show it is in. */
export interface ShotsInput {
  plan: ShotPlan;
  registry: RegistryEntry[];
  /** Each beat's research claims, by beat: the link from what is said to what is shown. */
  rowClaims: string[][];
  /** The show's world: its sides' colours, the colour it holds back, its one map. Null for a show with none. */
  world: {
    palette: PaletteEntry[];
    held: PaletteToken | null;
    base: unknown;
  } | null;
  /** The scene opens its episode: its first change comes by the rules' first-change time. */
  first: boolean;
  /** The seed of everything seeded in it: the scene's own id. */
  seed: string;
  /** How the show draws its people (tech §11): silhouettes or characters. Editorial when absent. */
  look?: KitLook;
  /** The named characters the episode's scenes before this one showed: each is labelled once an episode. */
  named?: string[];
}

/** The named characters a scene's plan shows (a person of its list, as the board's answer was mended): those its build labels. */
export function namedIn(plan: ShotPlan | null | undefined): string[] {
  const names = (plan?.shots ?? []).flatMap((shot) =>
    (shot.actors ?? []).flatMap((actor) => {
      const name = actor.params?.name;
      return typeof name === 'string' && name ? [name] : [];
    }),
  );
  return [...new Set(names)];
}

/** A shots sheet's make: its plan and the show's world, or null for a sheet of today's storyboard. */
export function shotsInputOf(
  sheet: ExplainerSheet,
  world: Pick<EditorWorld, 'palette' | 'held' | 'base'> | null | undefined,
  first: boolean,
  seed: string,
  look?: KitLook | null,
  /** The named characters the episode's scenes before it showed (namedIn of each). */
  named?: readonly string[],
): ShotsInput | null {
  if (sheet.engine !== 'shots' || !sheet.shots) return null;
  return {
    plan: sheet.shots,
    registry: sheet.registry ?? [],
    rowClaims: sheet.rowClaims ?? [],
    world: world
      ? {
          palette: world.palette.map((p) => ({
            thing: p.thing,
            token: p.token,
          })),
          held: world.held?.token ?? null,
          base: world.base ?? null,
        }
      : null,
    first,
    seed,
    ...(look ? { look } : {}),
    ...(named?.length ? { named: [...new Set(named)] } : {}),
  };
}

/**
 * A shots sheet's script as the voice speaks it: its beats made sound
 * exactly as a lesson's are (their words, pauses, delivery and music),
 * with no cast and no steps. Its picture is its plan.
 */
export function shotsScriptOf(
  sheet: ExplainerSheet,
  options: { stage: LearningStage | null; maths: boolean },
): SceneScript {
  const formats: SceneFormat[] = options.maths
    ? ['explainer', 'maths']
    : ['explainer'];
  const { script } = mendScript(
    { ...sheet.draft, cast: [], steps: [] },
    { formats, stage: options.stage },
  );
  const out: SceneScript = { ...script, cast: [], steps: [] };
  delete out.props;
  return out;
}

/** What the voice made and the stage it is composed for. */
export interface ShotsMade {
  /** The script as voiced: its title, mood and each beat's music, delivery and hold. */
  script: SceneScript;
  beats: TimedBeat[];
  durationMs: number;
  timing: SceneTiming;
  shape: FilmShape;
  theme: ThemeId;
  generator: string;
  profile?:
    | (Pick<DocumentProfile, 'kind' | 'tone' | 'story' | 'stage'> & {
        film?: boolean;
      })
    | null;
  /** The show's map as drawn for this shape and look (shot-map), or null. */
  map: ShotMapSet | null;
}

/** When everything a scene of shots plans has finished: its last word, its last change, its last move. */
export function shotsSettledMs(
  beats: readonly { endMs: number }[],
  shots: readonly ShotDto[],
  durationMs: number,
): number {
  let at = beats.length ? beats[beats.length - 1].endMs : durationMs;
  for (const shot of shots) {
    for (const item of shot.info) at = Math.max(at, item.atMs + item.durMs);
    for (const move of shot.camera) at = Math.max(at, move.atMs + move.durMs);
    for (const actor of shot.actors)
      for (const move of actor.moves) at = Math.max(at, move.atMs + move.durMs);
  }
  return Math.round(at);
}

/**
 * A scene of shots composed: its plan built in the show's look for its
 * shape, timed on its voice, mended to the rules' pace, given its sounds,
 * and set beside its beats and music as a lesson's are. What fell back,
 * moved or could not be put right is in `notes` and `problems`, for the
 * log; nothing here ever stops the scene.
 */
export function composeShotScene(
  input: ShotsInput,
  made: ShotsMade,
): { scene: SceneDto; notes: string[]; problems: ShotProblem[] } {
  const { script, beats, durationMs, shape } = made;
  const built = buildShots(input.plan, registryOf(input.registry), {
    shape,
    palette: input.world?.palette ?? [],
    held: input.world?.held ?? null,
    theme: made.theme,
    map: made.map,
    seed: input.seed,
    ...(input.look ? { look: input.look } : {}),
    ...(input.named?.length ? { named: input.named } : {}),
  });
  const notes = [...built.notes];
  const timed = timeShots(built.shots, beats, durationMs, { notes });
  // A row the editor holds is still on purpose.
  const holds = beats.flatMap((beat, k): [number, number][] =>
    script.beats[k]?.hold
      ? [[beat.startMs, beats[k + 1]?.startMs ?? durationMs]]
      : [],
  );
  // The pace is held over the voice, its first word to its last.
  const voice: [number, number] = beats.length
    ? [beats[0].startMs, beats[beats.length - 1].endMs]
    : [0, durationMs];
  const options = { first: input.first, holds, voice };
  const mended = mendTimed(timed, durationMs, options);
  notes.push(...mended.mended);
  // The UI kit's cursors: each click's change at its press, each run's callouts numbered (shot-ui).
  const shots = uiTimed(mended.shots, built.assets);
  const problems = checkTimed(shots, durationMs, options);
  const stage = STAGES[shape];
  const scene: SceneDto = {
    version: 4,
    generator: made.generator,
    title: script.title,
    // A wide scene says nothing of its shape, as before shapes.
    ...(shape === 'tall' ? { shape } : {}),
    durationMs,
    settledMs: shotsSettledMs(beats, shots, durationMs),
    timing: made.timing,
    ...(made.profile?.stage ? { stage: made.profile.stage } : {}),
    ...(made.profile?.film ? { setting: { film: true as const } } : {}),
    sound: {
      mood: script.mood,
      music: placeMusic({
        beats: beats.map((b, i) => ({
          startMs: b.startMs,
          endMs: b.endMs,
          music: script.beats[i]?.music,
          energy: script.beats[i]?.energy,
        })),
        mood: script.mood,
        steps: [],
        things: [],
        durationMs,
        tone: made.profile?.tone,
      }),
      palette: paletteOf(made.profile),
    },
    beats: beats.map((b, i) => {
      const delivery = script.beats[i]?.delivery;
      return {
        text: b.text,
        startMs: b.startMs,
        endMs: b.endMs,
        words: b.words,
        ...(delivery && delivery !== 'explain' ? { delivery } : {}),
      };
    }),
    things: [],
    steps: [],
    effects: [],
    // The player plays the full stage only; a shots scene has no places.
    stagings: {
      box: { w: stage.w, h: stage.h, places: [] },
      wide: { w: stage.w, h: stage.h, places: [] },
    },
    engine: 'shots',
    shots: {
      version: 1,
      look: built.look,
      assets: built.assets,
      shots,
      sounds: soundsOf(shots),
    },
  };
  return { scene, notes, problems };
}
