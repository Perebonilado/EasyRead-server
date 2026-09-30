/**
 * "The Star and the Manger" (studio-space-plan), a Nativity for young
 * children, as the Studio made it on 2026-09-30 and as it composes now:
 * its five sheets, its show and outline, the cast's figures, the sets as
 * painted and the show's own things (nativity/film.json), and each
 * scene's voice as it was timed. Its people are drawn again by the kit;
 * no model is asked, nothing is voiced, nothing is stored. The film as
 * made is nativity/made-s*.json, its pictures left out.
 *
 * Each scene is made as SceneProcessor.recompose makes a Studio story's:
 * studioMakeOf's script staged on its voice, drawn from the show's cast,
 * sets and own things, composed, and every line's mouth moved.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto, SceneTiming } from '../../../../contracts';
import type {
  StudioEpisodeRecord,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../../repositories/studio.repository';
import { studioMakeOf } from '../../../../pipeline/processors/studio.processor';
import { composeScene } from '../../scene-compose';
import { agedFor, oldWorld, type FigureSpec } from '../../scene-figure';
import { VIEW_RIG } from '../../scene-figure-views';
import {
  SCENE_GENERATOR_VERSION,
  facesShown,
  signsShown,
  type SceneScript,
} from '../../scene-script';
import { figureDrawing, setsOf, type Sets } from '../../scene-sheet';
import type { SetPiece } from '../../scene-set-pieces';
import type { GatedDrawing } from '../../scene-svg';
import type { TimedBeat } from '../../scene-timing';
import { withMouths } from '../studio-audit';
import { onItsVoice } from '../studio-stage';
import type { StudioBible } from '../studio';

/** One scene's voice as it was timed. */
interface VoicedScene {
  beats: TimedBeat[];
  durationMs: number;
  timing: SceneTiming;
}

export interface NativityFilm {
  source: string;
  show: Pick<StudioShowRecord, 'id' | 'title' | 'format' | 'brief'> & {
    bible: StudioBible;
  };
  episode: Pick<
    StudioEpisodeRecord,
    'id' | 'showId' | 'number' | 'title' | 'outline'
  >;
  rows: Pick<
    StudioSceneRecord,
    'id' | 'position' | 'sheet' | 'status' | 'durationMs'
  >[];
  /** The cast as kept: each one's figure, their drawings left out (the kit draws them again). */
  cast: Record<string, { figure?: FigureSpec }>;
  sets: unknown;
  own: {
    things?: NonNullable<SceneScript['drawn']>['things'];
    features?: Record<string, { piece: SetPiece }>;
  };
  scenes: VoicedScene[];
}

const HERE = join(__dirname, 'nativity');

/** The film as kept. */
export const NATIVITY_FILM: NativityFilm = JSON.parse(
  readFileSync(join(HERE, 'film.json'), 'utf8'),
) as NativityFilm;

/** Scene `n` (from 0) as it was made and watched: its pictures left out. */
export const nativityMade = (n: number): SceneDto =>
  JSON.parse(readFileSync(join(HERE, `made-s${n}.json`), 'utf8')) as SceneDto;

/** One scene composed now, and its script. */
export interface ComposedNativity {
  scene: SceneDto;
  script: SceneScript;
  staging: string[];
}

/** The film's scenes composed as the Studio composes them now, in order (only those asked, from 0). */
export async function composeNativity(
  only?: readonly number[],
  film: NativityFilm = NATIVITY_FILM,
): Promise<ComposedNativity[]> {
  const show = { ...film.show, userId: 'film' } as unknown as StudioShowRecord;
  const episode = {
    ...film.episode,
    userId: 'film',
  } as unknown as StudioEpisodeRecord;
  const rows = film.rows as StudioSceneRecord[];
  const bible = film.show.bible;
  const sets: Sets = setsOf(film.sets);
  const old = oldWorld(bible.world?.era);
  const out: ComposedNativity[] = [];
  for (const [position, voiced] of film.scenes.entries()) {
    if (only && !only.includes(position)) continue;
    const of = studioMakeOf(show, episode, rows[position], rows, bible, sets);
    const staged = onItsVoice(of.script!, voiced) ?? of.script!;
    const script: SceneScript = {
      ...staged,
      drawn: {
        things: Object.fromEntries(
          (staged.ownThings ?? []).flatMap((t) =>
            film.own.things?.[t.id] ? [[t.id, film.own.things[t.id]]] : [],
          ),
        ),
        features: Object.fromEntries(
          (staged.features ?? []).flatMap((f) =>
            film.own.features?.[f.id]
              ? [[f.id, film.own.features[f.id].piece]]
              : [],
          ),
        ),
      },
    };
    const drawings = new Map<string, GatedDrawing | null>();
    for (const thing of script.cast) {
      if (thing.kind === 'character') {
        const worn = thing.wears ?? film.cast[thing.ref]?.figure;
        const character = bible.characters.find((c) => c.id === thing.ref);
        const figure = worn
          ? agedFor(worn, [character?.name, character?.look])
          : null;
        if (!figure) {
          drawings.set(thing.id, null);
          continue;
        }
        const { anchors: _anchors, ...drawn } = await figureDrawing(
          figure,
          thing.ref,
          {
            pose: thing.pose,
            holding: thing.holding,
            signs: signsShown(script, thing.id),
            faces: facesShown(script, thing.id),
            old,
            ...(thing.dress?.length ? { dress: thing.dress } : {}),
            rig: VIEW_RIG,
            faceRig: true,
          },
        );
        void _anchors;
        drawings.set(thing.id, { ...drawn, callouts: [] });
      } else if (thing.kind === 'place') {
        const set = sets[thing.ref];
        drawings.set(
          thing.id,
          set
            ? {
                ...set.drawing,
                ...(set.ground ? { ground: set.ground } : {}),
                ...(set.layered ? { layered: set.layered } : {}),
              }
            : null,
        );
      }
    }
    const made = composeScene({
      script,
      drawings,
      beats: voiced.beats,
      durationMs: voiced.durationMs,
      timing: voiced.timing,
      generator: SCENE_GENERATOR_VERSION,
      profile: of.profile,
    });
    let scene = made.scene;
    let used = script;
    const again = of.recheck?.(scene);
    if (again?.script) {
      used = { ...again.script, drawn: script.drawn };
      scene = composeScene({
        script: used,
        drawings,
        beats: voiced.beats,
        durationMs: voiced.durationMs,
        timing: voiced.timing,
        generator: SCENE_GENERATOR_VERSION,
        profile: of.profile,
      }).scene;
    }
    out.push({
      scene: withMouths(scene).scene,
      script: used,
      staging: made.staging,
    });
  }
  return out;
}
