/**
 * Scenes of a Studio episode made again here and now, in this process, the
 * way the worker makes them (the sheet put right and staged, drawn from the
 * show's cast and sets, voiced, composed), for looking at a change to the
 * stage on a real film without touching it:
 *
 *   npm run studio:remake -- <episodeId> --scenes 2,3 --out <dir>
 *
 * Scenes are counted from 1. Each lands in the out dir (in <dir>/s<n> when
 * there are several): scene.json, audio.mp3, and the parts it was composed
 * from (SCENE_KEEP_PARTS), which scripts/studio-recompose puts together
 * again with no model and no voice. The scene's row, the episode and the
 * stored film are left as they are. The voice is asked, and costs as it
 * does; a set kept before its ground was measured is measured and kept.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import type { StoragePort } from '../src/business/ports/storage.port';
import { STORAGE } from '../src/business/ports/tokens';
import type { StudioRepository } from '../src/business/repositories/studio.repository';
import { STUDIO_REPOSITORY } from '../src/business/repositories/tokens';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import { studioMakeOf } from '../src/pipeline/processors/studio.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor],
})
class StudioRemakeModule {}

/** A flag's value: `--out <dir>`. */
function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [episodeId] = args;
  const positions = (flag(args, '--scenes') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const out = flag(args, '--out');
  if (!episodeId || episodeId.startsWith('--') || !positions.length || !out) {
    console.error(
      'npm run studio:remake -- <episodeId> --scenes 2,3 --out <dir>',
    );
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(StudioRemakeModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const storage = app.get<StoragePort>(STORAGE);
    const scenes = app.get(SceneProcessor);
    const episode = await studio.findEpisode(episodeId);
    if (!episode) throw new Error(`No episode ${episodeId}`);
    const show = await studio.findShow(episode.showId);
    if (!show?.bible) throw new Error('The show has no cast yet');
    const rows = await studio.listScenes(episode.id);
    for (const n of positions) {
      const row = rows.find((r) => r.position === n - 1);
      if (!row?.sheet) {
        console.warn(`scene ${n}: none, or no sheet`);
        continue;
      }
      const dir = resolve(positions.length > 1 ? join(out, `s${n}`) : out);
      mkdirSync(dir, { recursive: true });
      // The parts kept where the processor keeps them: beside the scene.
      process.env.SCENE_KEEP_PARTS = dir;
      const started = Date.now();
      const made = await scenes.make({
        ...studioMakeOf(show, episode, row, rows, show.bible),
        base: `studio-remake/${episode.id}/${row.id}-${Date.now().toString(36)}`,
        who: `studio ${episode.id} s${n} (remake)`,
        keepAs: 'scene',
      });
      if (made.fit === 'poor') {
        console.warn(`scene ${n}: ${made.reason}`);
        continue;
      }
      writeFileSync(
        join(dir, 'scene.json'),
        JSON.stringify(made.scene, null, 2),
      );
      writeFileSync(
        join(dir, 'audio.mp3'),
        await storage.get(made.voice.audioKey),
      );
      // What was stored on the way is no one's: the row keeps its own.
      for (const key of [made.sceneKey, made.thumbKey, made.voice.audioKey])
        await storage.delete(key).catch(() => undefined);
      console.log(
        `scene ${n}: made in ${Math.round((Date.now() - started) / 1000)}s → ${dir}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
