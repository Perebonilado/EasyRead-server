/**
 * The tall story test piece, made end to end in this process for looking
 * at (studio-vertical-plan §9.2): two friends at a market stall, one
 * bringing the other news: a conversation, a walk toward the camera and a
 * close on the reveal. Its sheet is written by hand
 * (domain/studio/__fixtures__/market-news), its people drawn by the kit
 * and its market built by code from a layout written here, so no model is
 * asked for anything: no writer, no painter, no voice. The voice is made
 * up (each word 0.4 s, as the specs' voiced fixture has it) and its audio
 * is silence, so the stage plays it on time.
 *
 *   ts-node --transpile-only -r tsconfig-paths/register scripts/tall-proof.ts \
 *     --out <dir> --scenes <client public/dev-scenes>
 *
 * Makes the scene in both shapes, to <scenes>/market-news-wide and
 * <scenes>/market-news-tall: scene.json, audio.mp3 (silent) and
 * thumb.png. Storage is <out>/storage; the database is not written.
 * Play them on /dev/stage?scene=market-news-wide&tall=market-news-tall.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import * as tokens from '../src/business/ports/tokens';
import type { StoragePort } from '../src/business/ports/storage.port';
import { marketNewsStaged } from '../src/business/domain/studio/__fixtures__/market-news';
import { storyBibleFor } from '../src/business/domain/studio/studio-stage';
import { MARKET_NEWS_SHEET } from '../src/business/domain/studio/__fixtures__/market-news';
import { buildSet, layoutOf } from '../src/business/domain/scene-set-layout';
import { setThing } from '../src/business/domain/scene-story';
import { gateDrawing } from '../src/business/domain/scene-svg';
import { measureGround } from '../src/business/domain/scene-ground';
import { SET_VERSION } from '../src/business/domain/scene-sheet';
import { renderStill } from '../src/business/domain/scene-still';
import { rasterise } from '../src/business/domain/scene-raster';
import type { TimedBeat } from '../src/business/domain/scene-timing';
import type { FilmShape } from '../src/business/domain/scene-shape';
import type { DocumentProfile } from '../src/business/domain/scene-profile';
import {
  describeTallShots,
  tallShotFaults,
} from '../src/business/domain/scene-safe';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const OUT = resolve(flag('--out') ?? 'scene-out/tall-proof');
const SCENES = resolve(flag('--scenes') ?? '../easyread/public/dev-scenes');
mkdirSync(OUT, { recursive: true });
// This process's own storage, and no model: nothing here asks one.
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_ROOT = join(OUT, 'storage');

/** Each word 0.4 s, and each beat's quiet after it, as the specs' voiced fixture times a voice. */
const WORD_MS = 400;

/** A WAV of silence, `ms` long: the stage plays the scene on its clock. */
function silence(ms: number): Buffer {
  const rate = 8000;
  const n = Math.ceil((ms / 1000) * rate);
  const out = Buffer.alloc(44 + n);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate, 28);
  out.writeUInt16LE(1, 32);
  out.writeUInt16LE(8, 34);
  out.write('data', 36);
  out.writeUInt32LE(n, 40);
  out.fill(128, 44);
  return out;
}

/** The market, laid out by hand as the set painter lays one out: a fruit and jam stall where the action is. */
const MARKET_LAYOUT = {
  sky: 'day',
  weather: 'clear',
  ground: 'paving',
  backdrop: 'city',
  style: 'modern-town',
  items: [
    { kind: 'stall', x: 0.5, row: 'middle', scale: 1 },
    { kind: 'stall', x: 0.12, row: 'back', scale: 1 },
    { kind: 'crate', x: 0.3, row: 'middle', scale: 1 },
    { kind: 'basket', x: 0.72, row: 'front', scale: 1 },
    { kind: 'tree', x: 0.9, row: 'back', scale: 1 },
    { kind: 'bench', x: 0.82, row: 'back', scale: 1 },
  ],
  own: [],
  width: 1.5,
  focal: {
    x: 0.5,
    feature: null,
    words: 'in front of the fruit and jam stall',
  },
  clutter: ['crates', 'baskets'],
};

async function main(): Promise<void> {
  @Module({
    imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
    providers: [SceneProcessor],
  })
  class TallProofModule {}
  const app = await NestFactory.createApplicationContext(TallProofModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const storage = app.get<StoragePort>(tokens.STORAGE);
    const scenes = app.get(SceneProcessor);
    const { script, bible } = marketNewsStaged();
    const title = 'The Stall';
    const story = {
      bible: storyBibleFor(bible, [MARKET_NEWS_SHEET], title),
      page: 1,
      castKey: 'proof/market/cast.json',
      setsKey: 'proof/market/sets.json',
      bookTitle: title,
    };
    // The market, built by code from its layout (the painter's own step).
    const place = story.bible.places.find((p) => p.id === 'market')!;
    const layout = layoutOf(MARKET_LAYOUT, place, story.bible.world ?? null);
    const built = buildSet(layout, place, {}, story.bible.world ?? null);
    const gated = await gateDrawing(
      built.svg,
      setThing(place, title, story.bible.world ?? null),
      { backdrop: true },
    );
    if (!gated.drawing) throw new Error('the market would not gate');
    const ground = await measureGround(gated.drawing);
    await storage.put({
      key: story.setsKey,
      mimeType: 'application/json',
      body: Buffer.from(
        JSON.stringify({
          market: {
            version: SET_VERSION,
            drawing: gated.drawing,
            ...(ground ? { ground } : {}),
            layout,
            layered: built.layered,
          },
        }),
      ),
    });
    // A made-up voice: each word 0.4 s, each beat 0.3 s apart at least.
    let t = (script.lead ?? 0) * 1000 + 300;
    const beats: TimedBeat[] = script.beats.map((beat) => {
      const words = [...beat.say.matchAll(/\S+/g)];
      const start = t;
      const end = start + words.length * WORD_MS;
      t = end + Math.max(300, (beat.holdS ?? 0) * 1000);
      return {
        text: beat.say,
        startMs: start,
        endMs: end,
        words: words.map((m, i) => [
          m.index,
          m.index + m[0].length,
          start + i * WORD_MS,
          start + i * WORD_MS + WORD_MS - 80,
        ]),
      };
    });
    for (const shape of ['wide', 'tall'] as FilmShape[]) {
      const made = await scenes.recompose({
        script,
        kept: new Map(),
        beats,
        durationMs: t,
        timing: 'voice',
        profile: {
          film: true,
          subject: 'a story',
          kind: 'fiction',
          tone: 'light',
          formats: ['explainer'],
          story: true,
          stage: null,
        } as DocumentProfile & { film: true },
        story,
        base: `proof/market/${shape}`,
        who: `market news (${shape})`,
        keepAs: `market-news-${shape}`,
        shape,
      });
      const dir = join(SCENES, `market-news-${shape}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'scene.json'), JSON.stringify(made.scene));
      writeFileSync(join(dir, 'audio.mp3'), silence(made.scene.durationMs));
      const still = await renderStill(made.scene, 2400, rasterise, 960);
      writeFileSync(join(dir, 'thumb.png'), still.png);
      const faults = describeTallShots(tallShotFaults(made.scene), (id) => id);
      console.log(
        `${shape}: ${Math.round(made.scene.durationMs / 100) / 10}s → ${dir}${faults.length ? `\n  ${faults.join('\n  ')}` : ' (tall shot check: nothing wrong)'}`,
      );
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
