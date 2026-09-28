/**
 * One of a Studio show's characters the artist draws (an animal, a
 * creature) drawn again with the brief as it is now (an animal on all
 * fours in three-quarter view, its tail at the hip), rigged by code, and
 * kept in place of the drawing before:
 *
 *   npm run studio:redraw -- <showId> <characterId> [--out <dir>]
 *
 * The show's cast is copied beside itself first (cast.json.<when>.bak), so
 * the drawing before can be put back. A person is drawn by the kit and is
 * never redrawn here. The artist is asked, and costs as it does, recorded
 * against the show's first episode. Scenes made before keep the drawing
 * they were made with until they are composed again
 * (scripts/studio-recompose --store). With --out, the drawing is written
 * there too, as character.svg and character.png (its neutral face alone,
 * with code's mouth), for looking at.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { rasterise } from '../src/business/domain/scene-raster';
import { faceShown } from '../src/business/domain/scene-sheet-face';
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
class StudioRedrawModule {}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [showId, characterId] = args.filter(
    (a, i) => !a.startsWith('--') && args[i - 1] !== '--out',
  );
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args[outAt + 1] : undefined;
  if (!showId || !characterId) {
    console.error(
      'npm run studio:redraw -- <showId> <characterId> [--out <dir>]',
    );
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(StudioRedrawModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const storage = app.get<StoragePort>(STORAGE);
    const { show, episodes, story } = await showStory(studio, showId);
    const character = story.bible.characters.find((c) => c.id === characterId);
    if (!character) throw new Error(`${show.title} has no ${characterId}`);
    console.log(
      `${character.name} (${character.kind ?? '?'}, ${character.size ?? 'medium'}): ${character.look}`,
    );
    const copy = await keepCopy(storage, story.castKey);
    console.log(`the cast before: kept as ${copy}`);
    const sheet = await app
      .get(SceneProcessor)
      .redrawCharacter(
        story,
        characterId,
        episodes[0]?.id ?? null,
        `studio ${show.id} ${characterId} (redraw)`,
      );
    if (!sheet) {
      console.warn(
        `${character.name}: nothing came through; the drawing before is kept`,
      );
      process.exitCode = 1;
      return;
    }
    const { rig, drawing } = sheet;
    console.log(`parts: ${Object.keys(drawing.parts).join(', ')}`);
    console.log(
      `rig ${rig?.version ?? 'none'}: joints ${Object.entries(rig?.joints ?? {})
        .map(([part, [x, y]]) => `${part} (${x}, ${y})`)
        .join(
          ', ',
        )}${rig?.mended.length ? `; moved in: ${rig.mended.map((m) => `${m.part} by (${m.dx}, ${m.dy})`).join(', ')}` : ''}${rig?.faces ? `; faces ${rig.faces < 0 ? 'left' : 'right'}` : ''}${rig?.dip ? `; head dips ${rig.dip}°` : ''}${rig?.sinks ? `; sinks ${rig.sinks}` : ''}`,
    );
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'character.svg'), drawing.svg);
      // As a still shows them: the neutral face alone, with code's mouth.
      writeFileSync(
        join(out, 'character.png'),
        await rasterise(faceShown(sheet, characterId), 600),
      );
      console.log(`→ ${join(out, 'character.png')}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
