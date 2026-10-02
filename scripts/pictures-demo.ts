/**
 * The picture desk's demo for the shots stage's lab (WP11): a history
 * scene of three shots made from what the desk clears for "The Regional
 * Turn"'s research (its claims name Ahmadu Bello and Nnamdi Azikiwe):
 *
 *   1. Ahmadu Bello's portrait card (his own Wikidata picture: Oak Ridge,
 *      1960, a US Department of Energy photograph, public domain);
 *   2. an archive photograph of an event, depth off: Nnamdi Azikiwe in his
 *      office, 1937 (public domain in the US);
 *   3. an archive photograph of Bello's 1960 visit to Oak Ridge, with its
 *      depth map, so the camera moves through its planes.
 *
 * Each set is made by the same code the build uses (shot-pictures), timed
 * by hand, in both shapes; our copies are copied beside the scenes so the
 * lab serves them itself.
 *
 *   STORAGE_ROOT=<a tree's storage> npx ts-node --transpile-only scripts/pictures-demo.ts <client dir>
 *
 * Writes <client>/public/dev-scenes/shots/pictures[-tall].json, the files
 * in <client>/public/dev-scenes/shots/pictures/, and the scenes into
 * <client>/src/lib/shots/__fixtures__/ (their pictures are not committed).
 */
import 'reflect-metadata';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type {
  FilmShape,
  SceneDto,
  ShotDto,
  ShotImageAssetDto,
} from '../src/contracts';
import { CoreModule } from '../src/core.module';
import {
  entryOf,
  type PassQuestion,
} from '../src/business/domain/pictures/episode';
import { STAGES } from '../src/business/domain/scene-shape';
import { shotLook } from '../src/business/domain/shots/shot-build';
import {
  pictureAssetOf,
  pictureSetOf,
} from '../src/business/domain/shots/shot-pictures';
import { LLM_GATEWAY, STORAGE } from '../src/business/ports/tokens';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import type { StoragePort } from '../src/business/ports/storage.port';
import { PICTURE_CACHE_REPOSITORY } from '../src/business/repositories/tokens';
import type { PictureCacheRepository } from '../src/business/repositories/picture-cache.repository';
import { pictureDeskOf } from '../src/web/adapters/pictures/picture-desk.factory';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule] })
class PicturesDemoModule {}

const QUESTIONS: (PassQuestion & { depth: boolean })[] = [
  {
    for: 'portrait',
    depth: false,
    query: {
      name: 'Ahmadu Bello',
      kind: 'person',
      years: [1957],
      place: ['Nigeria'],
      role: 'Northern Region leader and strategist',
    },
  },
  {
    for: 'photo',
    depth: false,
    query: {
      name: 'Nnamdi Azikiwe',
      kind: 'event',
      years: [1937],
      place: ['Nigeria'],
    },
  },
  {
    for: 'photo',
    depth: true,
    query: {
      name: 'Ahmadu Bello',
      kind: 'event',
      years: [1960],
      place: ['Tennessee'],
    },
  },
];

async function main(): Promise<void> {
  const clients = process.argv.slice(2);
  if (!clients.length)
    throw new Error('Give the client folder(s) to write into');
  const app = await NestFactory.createApplicationContext(PicturesDemoModule, {
    logger: ['warn', 'error'],
  });
  try {
    const storageRoot = resolve(process.env.STORAGE_ROOT ?? './storage');
    const desk = pictureDeskOf({
      setting: (name) => process.env[name],
      cache: app.get<PictureCacheRepository>(PICTURE_CACHE_REPOSITORY),
      storage: app.get<StoragePort>(STORAGE),
      llm: app.get<LlmGatewayPort>(LLM_GATEWAY),
      log: (message) => console.log(`  ${message}`),
    });
    const made: {
      entry: ReturnType<typeof entryOf>;
      file: string;
      depthFile: string | null;
    }[] = [];
    for (const question of QUESTIONS) {
      const record = await desk.lookup(question.query, {
        depth: question.depth,
      });
      if (!record)
        throw new Error(`Nothing clears for ${JSON.stringify(question.query)}`);
      console.log(`${question.for}: ${record.chip}\n  ${record.credit}`);
      made.push({
        entry: entryOf(question, record),
        file: join(storageRoot, record.storageKey),
        depthFile:
          question.depth && record.depthKey
            ? join(storageRoot, record.depthKey)
            : null,
      });
    }
    const look = shotLook({ palette: [], held: null, theme: 'paper' });
    for (const shape of ['wide', 'tall'] as FilmShape[]) {
      const assets: Record<string, ShotImageAssetDto> = {};
      const shots: ShotDto[] = made.map(({ entry, file, depthFile }, i) => {
        const picture = pictureAssetOf(entry)!;
        const id = `picture-${i + 1}`;
        const name = file.split('/').pop()!;
        assets[id] = {
          ...picture.asset,
          // The lab serves the copies itself, beside the scene.
          url: `/dev-scenes/shots/pictures/${name}`,
          ...(depthFile
            ? {
                depthUrl: `/dev-scenes/shots/pictures/${depthFile.split('/').pop()!}`,
              }
            : {}),
        };
        if (!depthFile) delete assets[id].depthUrl;
        const startMs = i * 5500;
        const kind = entry.kind === 'person' ? 'portrait' : 'photo';
        return {
          id: `s${i + 1}`,
          startMs,
          endMs: startMs + 5500,
          set: pictureSetOf({
            kind,
            asset: id,
            name: entry.name,
            picture: picture.picture,
            shape,
          }),
          actors: [],
          info: [],
          life: [],
          camera: [
            { move: 'establish', atMs: startMs, durMs: 400 },
            // A photo window: one slow word-led move, 3–12% over 2.5–6 s (research §3.4).
            {
              move: 'push',
              atMs: startMs + 400,
              durMs: 4800,
              amount: i === 2 ? 0.1 : 0.06,
            },
          ],
          join: i === made.length - 1 ? 'cut' : 'dissolve',
          joinMs: i === made.length - 1 ? 0 : 600,
          chip: picture.credit,
        };
      });
      const { w, h } = STAGES[shape];
      const scene = {
        version: 4,
        generator: 'pictures-demo',
        title: 'Pictures: the Regional Turn',
        shape,
        durationMs: made.length * 5500,
        timing: { beats: [] },
        beats: [],
        things: [],
        steps: [],
        effects: [],
        stagings: { box: { w, h, places: [] }, wide: { w, h, places: [] } },
        engine: 'shots',
        shots: { version: 1, look, assets, shots, sounds: [] },
      } as unknown as SceneDto;
      const named = `pictures${shape === 'tall' ? '-tall' : ''}.json`;
      for (const client of clients) {
        const folder = join(resolve(client), 'public/dev-scenes/shots');
        mkdirSync(join(folder, 'pictures'), { recursive: true });
        for (const { file, depthFile } of made) {
          copyFileSync(file, join(folder, 'pictures', file.split('/').pop()!));
          if (depthFile)
            copyFileSync(
              depthFile,
              join(folder, 'pictures', depthFile.split('/').pop()!),
            );
        }
        writeFileSync(join(folder, named), JSON.stringify(scene));
        const fixtures = join(resolve(client), 'src/lib/shots/__fixtures__');
        mkdirSync(fixtures, { recursive: true });
        writeFileSync(
          join(fixtures, named),
          `${JSON.stringify(scene, null, 1)}\n`,
        );
      }
      console.log(`wrote ${named}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
