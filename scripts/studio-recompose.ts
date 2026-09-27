/**
 * A Studio scene put together again from the parts it was made from, with
 * no model and no voice: for working on the stage (the layout, the crowd,
 * the camera) against a real film.
 *
 *   npm run studio:remake -- <episodeId> --scenes 2 --out <dir>
 *   npm run studio:recompose -- <dir>/scene-parts.json [<out dir>]
 *   npm run studio:recompose -- <dir>/scene-parts.json --store <before.json> --scene <sceneId> [--out <dir>]
 *   npm run studio:recompose -- --store <before.json> --scene <sceneId> --out <dir>
 *   npm run studio:recompose -- --scene <sceneId> --out <dir>
 *
 * With no parts file, the scene's own stored film stands for them: its
 * voice's words and times, staged again on it where its words are as
 * voiced (the quiet after each line as long as the voice left it). With
 * no --store either, it is only looked at: scene.json and its audio.mp3
 * are written to the out dir, and the row is left as it is.
 * Writes scene.json to the out dir (the parts' own folder when none is
 * given, beside its audio.mp3) and prints what the frame audit found and
 * what the crowd came to. A set kept before its ground was measured is
 * measured here, once per run, from the parts' own drawing.
 *
 * With --store, the scene is made again for the film, on the voice it was
 * made with: staged from its sheet by the stage as it is now, on the show
 * as its scenes find it (as it was kept, when its words have changed
 * since), drawn from the show's cast,
 * sets and own things as they are now, composed, and stored as a new
 * scene file with its still. The scene's row is pointed at it (made, even
 * one whose make failed after its voice was kept), and the episode's
 * length and state follow. The parts must be the row's own: its voice's
 * length is theirs. Nothing is drawn or voiced, and the month's film is
 * not spent. The rows' files before are listed first in the file --store
 * names (kept as it is if it is already there) and stay in storage, so
 * the film before can be put back.
 */
import 'reflect-metadata';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { SceneDto, SceneTiming } from '../src/contracts';
import { CoreModule } from '../src/core.module';
import { drawByCode } from '../src/business/domain/scene-code';
import { CROWD_ID, composeScene } from '../src/business/domain/scene-compose';
import { measureGround } from '../src/business/domain/scene-ground';
import type { DocumentProfile } from '../src/business/domain/scene-profile';
import {
  SCENE_GENERATOR_VERSION,
  isCodeThing,
  type SceneScript,
} from '../src/business/domain/scene-script';
import type { GatedDrawing } from '../src/business/domain/scene-svg';
import type { TimedBeat } from '../src/business/domain/scene-timing';
import { voicedAlike } from '../src/business/domain/scene-voice';
import { carriedWears } from '../src/business/domain/studio/studio-check';
import { onItsVoice } from '../src/business/domain/studio/studio-stage';
import { sceneFingerprint } from '../src/business/handlers/studio/studio-views';
import type { StudioRepository } from '../src/business/repositories/studio.repository';
import { STUDIO_REPOSITORY } from '../src/business/repositories/tokens';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import {
  settledEpisode,
  studioMakeOf,
} from '../src/pipeline/processors/studio.processor';
import type { StoragePort } from '../src/business/ports/storage.port';
import { STORAGE } from '../src/business/ports/tokens';
import {
  gesturingCast,
  onItsQuiets,
  paintedSets,
  showStory,
} from './studio-show';

/** What the processor keeps when SCENE_KEEP_PARTS is set. */
interface Parts {
  script: SceneScript;
  drawings: [string, GatedDrawing | null][];
  beats: TimedBeat[];
  durationMs: number;
  timing: SceneTiming;
  profile?: (DocumentProfile & { film?: boolean }) | null;
  /** The show's own key, when kept after crowds were seeded by it. */
  key?: string | null;
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor],
})
class StudioRecomposeModule {}

/** A flag's value: `--out <dir>`. */
function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

/** What the frame audit found, and what the crowd came to. */
function report(
  scene: ReturnType<typeof composeScene>['scene'],
  audit: ReturnType<typeof composeScene>['audit'] | null,
): void {
  for (const staging of audit ? (['box', 'wide'] as const) : []) {
    const found = audit![staging].flat();
    console.log(
      `${staging}: ${found.length} found${found.length ? `: ${found.map((c) => `${c.kind} ${c.a} / ${c.b}`).join('; ')}` : ''}`,
    );
  }
  const crowd = scene.things.find((t) => t.id === CROWD_ID);
  if (crowd?.kind === 'drawing')
    console.log(
      `crowd: ${(crowd.svg.match(/<svg x=/g) ?? []).length} people, ${Math.round(crowd.svg.length / 1024)} KB, in ${scene.setting?.crowd?.place ?? 'no place'}`,
    );
}

/** Composed here, from the parts alone, and written beside them. */
async function local(parts: Parts, out: string): Promise<void> {
  const drawings = new Map(parts.drawings);
  for (const thing of parts.script.cast) {
    if (isCodeThing(thing))
      drawings.set(thing.id, await drawByCode(thing).catch(() => null));
    // A place's ground, where the parts were kept without it.
    const drawing = drawings.get(thing.id);
    if (thing.kind === 'place' && drawing && !drawing.ground) {
      const ground = await measureGround(drawing);
      if (ground) drawings.set(thing.id, { ...drawing, ground });
      else console.warn(`${thing.id}: its ground could not be measured`);
    }
  }
  const { scene, audit } = composeScene({
    script: parts.script,
    drawings,
    beats: parts.beats,
    durationMs: parts.durationMs,
    timing: parts.timing,
    generator: SCENE_GENERATOR_VERSION,
    profile: parts.profile ?? null,
    key: parts.key ?? null,
  });
  writeFileSync(join(out, 'scene.json'), JSON.stringify(scene, null, 2));
  report(scene, audit);
  console.log(`→ ${join(out, 'scene.json')}`);
}

/** Made again for the film on its own voice, stored, and the row and the episode pointed at it. */
async function stored(
  given: Parts | null,
  sceneId: string,
  /** Where the film before is listed; null to look only, the row left as it is. */
  before: string | null,
  out: string,
): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    StudioRecomposeModule,
    { logger: ['log', 'warn', 'error'] },
  );
  try {
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const scenes = app.get(SceneProcessor);
    const row = await studio.findScene(sceneId);
    if (row?.sheet?.kind !== 'story')
      throw new Error(`No story scene ${sceneId}`);
    const episode = await studio.findEpisode(row.episodeId);
    if (!episode) throw new Error(`No episode ${row.episodeId}`);
    const show = await studio.findShow(episode.showId);
    if (!show?.bible) throw new Error('The show has no cast yet');
    // No parts kept: the scene's own film, its voice's words and times.
    const film =
      !given && row.sceneKey
        ? (JSON.parse(
            (await app.get<StoragePort>(STORAGE).get(row.sceneKey)).toString(
              'utf8',
            ),
          ) as SceneDto)
        : null;
    const parts: Parts | null =
      given ??
      (film
        ? {
            script: {
              beats: [],
              cast: [],
              steps: [],
            } as unknown as SceneScript,
            drawings: [],
            beats: film.beats,
            durationMs: film.durationMs,
            timing: film.timing,
          }
        : null);
    if (!parts) throw new Error('No parts and no film kept for this scene');
    if (!row.audioKey || row.durationMs !== parts.durationMs)
      throw new Error(
        `The parts' voice runs ${parts.durationMs} ms and the scene's ${row.durationMs ?? 'none'}: they are not this scene's.`,
      );
    const rows = await studio.listScenes(episode.id);

    // The film before, first: its files stay in storage, listed here.
    if (!before) console.log('looked at only: the row is left as it is');
    else if (existsSync(before)) {
      const kept = JSON.parse(readFileSync(before, 'utf8')) as {
        episodeId?: string;
      };
      if (kept.episodeId !== episode.id)
        throw new Error(`${before} is another episode's`);
      console.log(`the film before: kept as it was in ${before}`);
    } else {
      writeFileSync(
        before,
        JSON.stringify(
          {
            episodeId: episode.id,
            showId: show.id,
            at: new Date().toISOString(),
            episode: {
              phase: episode.phase,
              durationMs: episode.durationMs,
              thumbKey: episode.thumbKey,
              error: episode.error,
            },
            bible: show.bible,
            rows: rows.map((r) => ({
              id: r.id,
              position: r.position,
              status: r.status,
              error: r.error,
              sceneKey: r.sceneKey,
              audioKey: r.audioKey,
              thumbKey: r.thumbKey,
              madeHash: r.madeHash,
              sheetHash: r.sheetHash,
              durationMs: r.durationMs,
            })),
          },
          null,
          2,
        ),
      );
      console.log(`the film before: listed in ${before}`);
    }

    // Staged by the stage as it is now, where its words are as voiced, on
    // the show as its scenes find it: every feature their words name.
    const { bible } = await showStory(studio, show.id);
    const made = studioMakeOf(
      { ...show, bible },
      episode,
      row,
      rows,
      bible,
      await paintedSets(app.get<StoragePort>(STORAGE), show.id),
      // Those the artist drew gesture as the worker stages them.
      await gesturingCast(app.get<StoragePort>(STORAGE), show.id),
    );
    // Its words as voiced: staged as the stage is now, on the voice's own
    // quiets, however long the stage would ask for them now.
    const onVoice = made.script
      ? film
        ? onItsVoice(made.script, film)
        : onItsQuiets(made.script, parts.script)
      : null;
    const alike = onVoice
      ? film
        ? true
        : voicedAlike(parts.script, onVoice)
      : false;
    if (film && !alike)
      throw new Error(
        `scene ${row.position + 1}: its words are not as voiced now, and no parts were kept to stage it as it was`,
      );
    if (!alike)
      console.warn(
        `scene ${row.position + 1}: its words are not as voiced now; staged as it was kept`,
      );
    const carried = carriedWears(rows, show.bible).get(row.position) ?? [];
    const fingerprint = alike
      ? sceneFingerprint(row.sheet, show.bible, show.brief, carried)
      : (row.madeHash ??
        sceneFingerprint(row.sheet, show.bible, show.brief, carried));
    mkdirSync(out, { recursive: true });
    process.env.SCENE_KEEP_PARTS = out;
    const who = `studio ${episode.id} s${row.position + 1} (recompose)`;
    const again = await scenes.recompose({
      script: alike ? onVoice! : parts.script,
      kept: new Map(parts.drawings),
      beats: parts.beats,
      durationMs: parts.durationMs,
      timing: parts.timing,
      profile: made.profile,
      story: made.story!,
      // Looked at only: kept apart from the film's own files.
      base: before
        ? `studio/${show.id}/${episode.id}/${row.id}-${fingerprint.slice(0, 8)}-${Date.now().toString(36)}`
        : `studio-remake/look/${row.id}-${Date.now().toString(36)}`,
      who,
      keepAs: 'scene',
      ...(alike && made.recheck ? { recheck: made.recheck } : {}),
    });
    writeFileSync(
      join(out, 'scene.json'),
      JSON.stringify(again.scene, null, 2),
    );
    report(again.scene, null);
    if (!before) {
      // Looked at only: with its voice beside it, for the stage lab.
      writeFileSync(
        join(out, 'audio.mp3'),
        await app.get<StoragePort>(STORAGE).get(row.audioKey),
      );
      console.log(`→ ${join(out, 'scene.json')}`);
      return;
    }
    await studio.updateScene(row.id, {
      status: 'made',
      step: null,
      error: null,
      sceneKey: again.sceneKey,
      thumbKey: again.thumbKey,
      madeHash: fingerprint,
      durationMs: parts.durationMs,
    });
    const now = await studio.listScenes(episode.id);
    if (!now.some((r) => r.status === 'making'))
      await studio.updateEpisode(episode.id, settledEpisode(now));
    console.log(
      `scene ${row.position + 1}: stored → ${again.sceneKey}; the episode runs ${Math.round((settledEpisode(now).durationMs ?? 0) / 100) / 10}s`,
    );
    console.log(`→ ${join(out, 'scene.json')}`);
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [partsFile] = args;
  const before = flag(args, '--store');
  const sceneId = flag(args, '--scene');
  if (
    !partsFile ||
    (partsFile.startsWith('--') && !sceneId) ||
    (before !== undefined && (!sceneId || before.startsWith('--')))
  ) {
    console.error(
      'npm run studio:recompose -- <parts.json> [<out dir>]\n' +
        'npm run studio:recompose -- <parts.json> --store <before.json> --scene <sceneId> [--out <dir>]',
    );
    process.exit(2);
  }
  // No parts file: the scene's own film stands for them.
  if (partsFile.startsWith('--') && sceneId) {
    await stored(
      null,
      sceneId,
      before === undefined ? null : resolve(before),
      resolve(flag(args, '--out') ?? '.'),
    );
    return;
  }
  const parts = JSON.parse(readFileSync(partsFile, 'utf8')) as Parts;
  if (before === undefined) {
    const outArg = args[1];
    await local(parts, outArg ?? dirname(partsFile));
    return;
  }
  await stored(
    parts,
    sceneId!,
    resolve(before),
    resolve(flag(args, '--out') ?? dirname(partsFile)),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
