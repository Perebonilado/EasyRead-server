/**
 * Pages made into videos here and now, by the same processor the worker
 * runs, against the local stack:
 *
 *   npm run scene:page -- <documentId> <page> [<page> ...] [--out <dir>]
 *
 * Each page's row is made (or made again), the processor runs it start to
 * finish with real models and the configured voice, and the result lands
 * where the app reads it, so the reader's Visualize pane plays it. It also
 * writes, for looking at: the scene, the audio, and a gallery of the
 * drawings with their own animation running (scene-out/ by default).
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { SceneDto } from '../src/contracts';
import { CoreModule } from '../src/core.module';
import { SCENE_GENERATOR_VERSION } from '../src/business/domain/scene-script';
import type { StoragePort } from '../src/business/ports/storage.port';
import { STORAGE } from '../src/business/ports/tokens';
import type { DocumentRepository } from '../src/business/repositories/document.repository';
import type { TopicRepository } from '../src/business/repositories/misc.repository';
import {
  DOCUMENT_REPOSITORY,
  TOPIC_REPOSITORY,
  VISUAL_SCENE_REPOSITORY,
} from '../src/business/repositories/tokens';
import type { VisualSceneRepository } from '../src/business/repositories/visual.repository';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor],
})
class ScenePageModule {}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Every drawing of a scene on one page, each in a shadow root so none can touch another. */
function gallery(scene: SceneDto, page: number): string {
  const cards = scene.things
    .map((thing) => {
      if (thing.kind !== 'drawing')
        return `<figure class="card"><div class="text">${escape(thing.kind === 'stat' ? `${thing.value} — ${thing.caption}` : `${thing.text} (${thing.style})`)}</div><figcaption>${thing.id} · ${thing.kind}</figcaption></figure>`;
      const facts = [
        `parts: ${Object.keys(thing.parts).join(', ') || 'none'}`,
        `labels: ${Object.keys(thing.labels).join(', ') || 'none'}`,
        `states: ${Object.keys(thing.states).join(', ') || 'none'}`,
        `hidden until pointed at: ${thing.hidden.join(', ') || 'none'}`,
        thing.moves ? 'moves by itself' : 'still',
        `${Math.round(thing.svg.length / 1024)} KB`,
      ];
      return `<figure class="card"><div class="art" data-svg="${escape(JSON.stringify(thing.svg))}"></div><figcaption><b>${escape(thing.caption ?? thing.id)}</b><br>${facts.map(escape).join('<br>')}</figcaption></figure>`;
    })
    .join('\n');
  const script = scene.beats.map((b) => `<li>${escape(b.text)}</li>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Page ${page}: ${escape(scene.title)}</title>
<style>body{font:15px/1.5 system-ui;background:#f4efe6;margin:24px;color:#1f2a37}h1{font-size:20px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}.card{background:#fbf7ef;border:1px solid #e4dccb;border-radius:12px;margin:0;padding:12px}.art{height:280px;display:flex;align-items:center;justify-content:center}.text{height:280px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600}figcaption{font-size:12px;color:#5b6675}</style>
<h1>Page ${page}: ${escape(scene.title)} · ${Math.round(scene.durationMs / 1000)}s · timed by ${scene.timing}</h1>
<audio controls src="audio.mp3"></audio>
<div class="grid">${cards}</div>
<h2>Narration</h2><ol>${script}</ol>
<script>for (const el of document.querySelectorAll('.art')) { const root = el.attachShadow({ mode: 'open' }); root.innerHTML = '<style>svg{width:100%;height:100%;overflow:visible}</style>' + JSON.parse(el.dataset.svg); }</script>`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const out = resolve(outAt >= 0 ? args[outAt + 1] : 'scene-out');
  const [documentId, ...rest] = args.filter(
    (_, i) => outAt < 0 || (i !== outAt && i !== outAt + 1),
  );
  const pages = rest.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!documentId || !pages.length) {
    console.error(
      'npm run scene:page -- <documentId> <page> [<page> ...] [--out <dir>]',
    );
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(ScenePageModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const documents = app.get<DocumentRepository>(DOCUMENT_REPOSITORY);
    const topics = app.get<TopicRepository>(TOPIC_REPOSITORY);
    const visuals = app.get<VisualSceneRepository>(VISUAL_SCENE_REPOSITORY);
    const storage = app.get<StoragePort>(STORAGE);
    const processor = app.get(SceneProcessor);
    const doc = await documents.findById(documentId);
    if (!doc) throw new Error(`No document ${documentId}`);
    const chapters = await topics.listByDocument(doc.id);
    for (const page of pages) {
      const chapter = chapters.find(
        (t) => page >= t.startPage && page <= t.endPage,
      );
      if (!chapter) {
        console.warn(`page ${page}: outside every chapter`);
        continue;
      }
      const { record, created } = await visuals.ensure({
        documentId: doc.id,
        contentVersion: doc.contentVersion,
        pageNumber: page,
        topicId: chapter.id,
        generatorVersion: SCENE_GENERATOR_VERSION,
        requestedBy: doc.userId,
      });
      if (!created) await visuals.resetForRetry(record.id);
      const started = Date.now();
      await processor.process(
        {
          documentId: doc.id,
          contentVersion: doc.contentVersion,
          pageNumber: page,
          topicId: chapter.id,
          requestedBy: doc.userId,
        },
        { isFinalAttempt: true, attemptsMade: 1 },
      );
      const row = await visuals.find(
        doc.id,
        doc.contentVersion,
        page,
        SCENE_GENERATOR_VERSION,
      );
      const seconds = Math.round((Date.now() - started) / 1000);
      if (row?.status !== 'done' || !row.sceneKey || !row.audioKey) {
        console.warn(
          `page ${page}: ${row?.status ?? 'no row'} after ${seconds}s: ${row?.error ?? row?.fitReason ?? ''}`,
        );
        continue;
      }
      const scene = JSON.parse(
        (await storage.get(row.sceneKey)).toString('utf8'),
      ) as SceneDto;
      const dir = join(out, `${doc.id}-p${page}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'scene.json'), JSON.stringify(scene, null, 2));
      writeFileSync(join(dir, 'audio.mp3'), await storage.get(row.audioKey));
      if (row.thumbKey)
        writeFileSync(
          join(dir, 'thumb.png'),
          await storage.get(row.thumbKey).catch(() => Buffer.alloc(0)),
        );
      writeFileSync(join(dir, 'gallery.html'), gallery(scene, page));
      console.log(`page ${page}: done in ${seconds}s → ${dir}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
