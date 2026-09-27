/**
 * One set of a Studio show painted again with the painter's brief as it
 * is now (a room or a vessel from inside, what a crowd stands behind and
 * the features the look names each a group of its own), its ground and
 * groups measured, and kept in place of the painting before:
 *
 *   npm run studio:repaint -- <showId> <setId> [--out <dir>]
 *
 * The show's sets are copied beside themselves first (sets.json.<when>.bak),
 * so the painting before can be put back. The set's features are as the
 * show's scenes find them. The painter is asked, and costs as it does,
 * recorded against the show's first episode. Scenes made before keep the
 * painting they were made with until they are composed again
 * (scripts/studio-recompose --store). With --out, the painting is written
 * there too, as set.svg and set.png, for looking at.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { rasterise } from '../src/business/domain/scene-raster';
import type { StoragePort } from '../src/business/ports/storage.port';
import { STORAGE } from '../src/business/ports/tokens';
import type { StudioRepository } from '../src/business/repositories/studio.repository';
import { STUDIO_REPOSITORY } from '../src/business/repositories/tokens';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import { keepCopy, showStory } from './studio-show';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor],
})
class StudioRepaintModule {}

/** A share of the frame, as a percentage. */
const pc = (n: number) => `${Math.round(n * 100)}%`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [showId, setId] = args.filter(
    (a, i) => !a.startsWith('--') && args[i - 1] !== '--out',
  );
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args[outAt + 1] : undefined;
  if (!showId || !setId) {
    console.error('npm run studio:repaint -- <showId> <setId> [--out <dir>]');
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(StudioRepaintModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const storage = app.get<StoragePort>(STORAGE);
    const { show, episodes, story } = await showStory(studio, showId);
    const place = story.bible.places.find((p) => p.id === setId);
    if (!place) throw new Error(`${show.title} has no set ${setId}`);
    console.log(
      `${place.name} (${place.kind ?? 'outdoor'}): ${place.features?.map((f) => `${f.name} (${f.kind}, ${f.spot})`).join(', ') || 'no features'}`,
    );
    const copy = await keepCopy(storage, story.setsKey);
    console.log(`the sets before: kept as ${copy}`);
    const set = await app
      .get(SceneProcessor)
      .repaintSet(
        story,
        setId,
        episodes[0]?.id ?? null,
        `studio ${show.id} ${setId} (repaint)`,
      );
    if (!set) {
      console.warn(
        `${place.name}: nothing came through; the set before is kept`,
      );
      process.exitCode = 1;
      return;
    }
    const { drawing, ground } = set;
    console.log(`groups: ${Object.keys(drawing.parts).join(', ') || 'none'}`);
    if (ground) {
      console.log(
        `ground: from its ${ground.source}, the horizon ${pc(ground.horizon)} down, the distance ${ground.haze}`,
      );
      console.log(
        ground.behind
          ? `props: stood behind in ${ground.cover?.filter(Boolean).length ?? 0} of ${ground.cover?.length ?? 0} columns`
          : 'props: none drawn apart',
      );
      for (const [group, [x0, y0, x1, y1]] of Object.entries(
        ground.boxes ?? {},
      ))
        console.log(
          `${group}: ${pc(x0)}–${pc(x1)} across, ${pc(y0)}–${pc(y1)} down`,
        );
    } else console.warn('ground: not measured; measured when next used');
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'set.svg'), drawing.svg);
      writeFileSync(join(out, 'set.png'), await rasterise(drawing.svg, 1600));
      console.log(`→ ${join(out, 'set.png')}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
