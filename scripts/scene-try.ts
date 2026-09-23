/**
 * A page made from any text, with no document behind it: for trying the
 * ways a page can be taught (maths, close reading) on sample pages without
 * uploading a book.
 *
 *   npm run scene:try -- <page.md> [--title "..."] [--formats maths,reading] [--out <dir>]
 *
 * The page is written, drawn, voiced and put together exactly as a
 * document's page is, by the worker's own processor, and its scene.json,
 * audio.mp3 and thumb.png are written to the out dir (scene-out/try/<name>
 * by default), where the stage harness plays them. Without --formats the
 * book's profile is made from the page, as a document's is. Its costs are
 * logged against no document.
 */
import 'reflect-metadata';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import {
  describeProfile,
  profileOf,
} from '../src/business/domain/scene-profile';
import { SCENE_GENERATOR_VERSION } from '../src/business/domain/scene-script';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import type { StoragePort } from '../src/business/ports/storage.port';
import { LLM_GATEWAY, STORAGE } from '../src/business/ports/tokens';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor],
})
class SceneTryModule {}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const file = args.find(
    (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'),
  );
  if (!file) {
    console.error(
      'npm run scene:try -- <page.md> [--title "..."] [--formats maths,reading] [--out <dir>]',
    );
    process.exit(2);
  }
  const material = readFileSync(file, 'utf8');
  const name = basename(file).replace(/\.[^.]+$/, '');
  const title = option('--title') ?? name.replace(/[-_]+/g, ' ');
  const out = resolve(option('--out') ?? join('scene-out', 'try', name));
  mkdirSync(out, { recursive: true });

  const app = await NestFactory.createApplicationContext(SceneTryModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const processor = app.get(SceneProcessor);
    const storage = app.get<StoragePort>(STORAGE);
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    const given = option('--formats');
    const profile = given
      ? profileOf({
          subject: title,
          kind: 'other',
          tone: 'neutral',
          formats: given.split(',').map((f) => f.trim()) as (
            'maths' | 'reading'
          )[],
        })
      : profileOf(
          (
            await llm.sceneProfile({
              documentTitle: title,
              chapters: [],
              sample: material.slice(0, 6000),
            })
          ).value,
        );
    console.log(describeProfile(profile));
    const made = await processor.make({
      documentId: null,
      documentTitle: title,
      topic: {
        id: 'try',
        title,
        shortDescription: null,
        startPage: 1,
        endPage: 1,
        orderIndex: 0,
      },
      material,
      context: 'It is the first video of the chapter.',
      profile,
      kept: new Map(),
      base: `try/${name}-${SCENE_GENERATOR_VERSION}`,
      who: `try ${name}`,
      keepAs: `try-${name}`,
    });
    if (made.fit === 'poor') {
      console.log(`not fit to teach: ${made.reason}`);
      return;
    }
    writeFileSync(join(out, 'scene.json'), JSON.stringify(made.scene, null, 2));
    writeFileSync(
      join(out, 'audio.mp3'),
      await storage.get(made.voice.audioKey),
    );
    writeFileSync(
      join(out, 'thumb.png'),
      await storage.get(made.thumbKey).catch(() => Buffer.alloc(0)),
    );
    const kinds = made.script.cast.map((t) => `${t.id}:${t.kind}`).join(', ');
    console.log(`"${made.scene.title}": ${kinds} → ${out}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
