/**
 * A story clip inside an explainer, made end to end in this process for
 * looking at (studio-explainer-plan, Ask 5): lesson → clip → lesson.
 *
 *   ts-node --transpile-only -r tsconfig-paths/register scripts/clip-proof.ts \
 *     --out <dir> --scenes <client public/dev-scenes> [--live]
 *
 * With --live, two calls and no more: the outline of a short children's
 * "fever" explainer with a nurse and a child patient (the cast and the
 * clinic written here, as the cast writer would), and the sheet of its
 * first clip, written as the worker writes one (writeClipSheet, no
 * thinking). A send-back is answered with the first answer, never a third
 * call. Both answers are kept in <out>/live.json, and a run without
 * --live makes the film again from them, spending nothing.
 *
 * The two lessons either side are written here from the outline's own
 * teaching, a sentence a beat, with only what code draws (keyword cards
 * and a number), so no drawing is paid for. Then each scene is made by
 * the worker's own processor (studioMakeOf, SceneProcessor.make): the
 * clip's people by the kit, the clinic from code's layout, the voice on
 * Kokoro, the lesson after the clip opening on its card; the clip's still
 * its last frame. Each lands in <scenes>/fever-e8-s<n>: scene.json,
 * audio.mp3, thumb.png, for /dev/strip. Storage is <out>/storage, calls
 * are logged here, never in the database, and what they cost is said.
 */
import 'reflect-metadata';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import { studioMakeOf } from '../src/pipeline/processors/studio.processor';
import * as studio from '../src/business/domain/studio/studio';
import { mendOutline } from '../src/business/domain/studio/studio-check';
import * as clips from '../src/business/domain/studio/studio-clip';
import {
  describeBible,
  describeBrief,
} from '../src/business/domain/studio/studio-words';
import { writeClipSheet } from '../src/business/handlers/studio/studio-clip-writer';
import { showTheme } from '../src/business/domain/studio/studio-look';
import { studioReading } from '../src/business/domain/studio/studio-motion';
import { storyBibleFor } from '../src/business/domain/studio/studio-stage';
import * as cast from '../src/business/handlers/studio/studio-cast.service';
import { costOf } from '../src/business/domain/cost';
import { renderStill } from '../src/business/domain/scene-still';
import { rasterise } from '../src/business/domain/scene-raster';
import * as tokens from '../src/business/ports/tokens';
import * as repos from '../src/business/repositories/tokens';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import type { StoragePort } from '../src/business/ports/storage.port';
import { paintedSets, gesturingCast } from './studio-show';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const OUT = resolve(flag('--out') ?? 'scene-out/clip-proof');
const SCENES = resolve(flag('--scenes') ?? '../easyread-e8/public/dev-scenes');
const LIVE = args.includes('--live');
mkdirSync(OUT, { recursive: true });
// This process's own storage, and no Gemini: the voice is Kokoro's.
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_ROOT = join(OUT, 'storage');
process.env.GEMINI_API_KEY = '';
process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';

async function main(): Promise<void> {
  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: resolve(__dirname, '../../easyread-server/.env'),
      }),
      CoreModule,
    ],
    providers: [SceneProcessor],
  })
  class ClipProofModule {}

  const app = await NestFactory.createApplicationContext(ClipProofModule, {
    logger: ['log', 'warn', 'error'],
  });
  const spent: { task: string; model: string; usd: number }[] = [];
  const price = (
    task: string,
    usage: {
      model: string;
      tokensIn: number;
      tokensOut: number;
      tokensCached?: number;
    },
  ) => {
    const usd =
      costOf({
        task,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        tokensCached: usage.tokensCached ?? null,
      }) ?? 0;
    spent.push({ task, model: usage.model, usd });
    console.log(
      `call ${task} on ${usage.model}: ${usage.tokensIn} in, ${usage.tokensOut} out, $${usd.toFixed(4)}`,
    );
  };
  try {
    // Nothing written to the database: calls are logged here, and the
    // voice is Kokoro's for this process alone.
    const calls = app.get<{ record: (row: never) => Promise<void> }>(
      repos.AI_CALL_LOG_REPOSITORY,
    );
    calls.record = (row: {
      task: string;
      model: string;
      tokensIn: number;
      tokensOut: number;
    }) => {
      price(row.task, row);
      return Promise.resolve();
    };
    const settings = app.get<{ get: () => Promise<Record<string, unknown>> }>(
      repos.APP_SETTINGS_REPOSITORY,
    );
    const prior = await settings.get();
    settings.get = () => Promise.resolve({ ...prior, sceneVoice: 'kokoro' });
    const llm = app.get<LlmGatewayPort>(tokens.LLM_GATEWAY);
    const storage = app.get<StoragePort>(tokens.STORAGE);
    const scenes = app.get(SceneProcessor);

    const brief = studio.briefOf({
      format: 'explainer',
      idea: 'What a fever is, for young children: a nurse takes a child patient’s temperature',
      audience: 'young children',
      minutes: 1.5,
      tone: 'calm',
    });
    // The cast and the clinic, as the cast writer would write them for clips.
    const bible = clips.clipBible(
      studio.bibleOf({
        subject: 'health: fever',
        characters: [
          {
            id: 'amara',
            name: 'Nurse Amara',
            role: 'main',
            voice: 'woman',
            look: 'a nurse in a blue uniform with short curly hair',
            figure: {
              age: 'adult',
              hair: 'curly',
              top: 'uniform',
              topColour: 'blue',
              skin: 6,
            },
            traits: ['calm', 'kind'],
          },
          {
            id: 'leo',
            name: 'Leo',
            role: 'supporting',
            voice: 'boy',
            look: 'a small boy in green pyjamas',
            figure: {
              age: 'child',
              hair: 'short',
              hairColour: 'blonde',
              top: 't-shirt',
              topColour: 'green',
              skin: 2,
            },
            traits: ['sleepy'],
          },
        ],
        sets: [
          {
            id: 'clinic',
            name: 'The clinic room',
            look: 'a bright children’s clinic room',
            kind: 'indoor',
            stand: 'on',
            sound: null,
          },
        ],
      }),
    ).bible;

    // The two calls, or their answers as kept.
    const kept = join(OUT, 'live.json');
    let live: { outline: unknown; clip: unknown } | null = existsSync(kept)
      ? (JSON.parse(readFileSync(kept, 'utf8')) as {
          outline: unknown;
          clip: unknown;
        })
      : null;
    if (!live?.clip) {
      if (!LIVE) throw new Error(`No clip in ${kept}: run with --live`);
      const registry = (
        llm as unknown as {
          registry?: {
            languageModel: (
              t: string,
            ) => Promise<{ ref: { provider: string; modelId: string } }>;
          };
        }
      ).registry;
      if (registry) {
        const { ref } = await registry.languageModel('studio_write');
        console.log(`the writer: ${ref.provider}:${ref.modelId}`);
        if (ref.provider !== 'deepseek')
          throw new Error('The writer is not DeepSeek: stopped');
      } else console.log('the writer: the fake one');
      // The outline: asked once, ever; kept.
      let outline = live?.outline as
        ReturnType<typeof studio.outlineOf> | undefined;
      if (!outline) {
        const outlined = await llm.studioOutline({
          brief: describeBrief(brief),
          bible: describeBible(bible, false),
        });
        price('studio_write', outlined.usage);
        const gated = clips.gateClips(
          mendOutline(studio.outlineOf(outlined.value), bible),
          bible,
        );
        console.log(
          `outline: ${gated.outline.scenes.map((s) => `${s.kind ?? 'lesson'} ${s.seconds}s "${s.title}"`).join(' | ')}; gate: ${gated.fixed.join('; ') || 'nothing'}`,
        );
        outline = gated.outline;
        writeFileSync(kept, JSON.stringify({ outline, clip: null }, null, 2));
      }
      let k = outline.scenes.findIndex((s) => clips.isClip(s));
      if (k < 0) {
        // The writer told the clinic moment inside a lesson instead: for
        // this look, the clip is put in by hand after the first lesson,
        // where its outline tells it ("Nurse Amara takes Leo's
        // temperature"), and the gate holds it as it holds any.
        console.log(
          'the outline has no clip: one put in by hand after the first lesson',
        );
        const scenes = [...outline.scenes];
        scenes.splice(1, 0, {
          title: 'At the clinic',
          summary:
            'Nurse Amara takes Leo’s temperature and reads the thermometer.',
          set: 'clinic',
          cast: ['amara', 'leo'],
          seconds: 12,
          teach: 'Nurse Amara reads Leo’s thermometer: 39 degrees is a fever.',
          points: [],
          kind: 'clip',
          hook: 'Did you see the number on the thermometer?',
        });
        outline = clips.gateClips({ ...outline, scenes }, bible).outline;
        k = outline.scenes.findIndex((s) => clips.isClip(s));
      }
      // One clip sheet: a send-back is answered with the first answer.
      let first: unknown = null;
      const once = {
        studioScene: async (input: Parameters<typeof llm.studioScene>[0]) => {
          if (first)
            return first as Awaited<ReturnType<typeof llm.studioScene>>;
          const answer = await llm.studioScene(input);
          price('studio_write', answer.usage);
          first = answer;
          return answer;
        },
      };
      const written = await writeClipSheet(once, {
        brief,
        bible,
        outline,
        k,
        log: (line) => console.log(`clip: ${line}`),
      });
      live = { outline, clip: { k, sheet: written.sheet } };
      writeFileSync(kept, JSON.stringify(live, null, 2));
    }
    const outline = live.outline as InstanceType<never> as ReturnType<
      typeof studio.outlineOf
    >;
    const { k, sheet: written0 } = live.clip as {
      k: number;
      sheet: ReturnType<typeof studio.storySheetOf>;
    };
    const clipScene = outline.scenes[k];
    // Held to the clip profile as the worker holds it now (its label from its idea).
    const clipSheet = clips.mendClip(written0, clipScene.teach ?? '').sheet;
    const before = outline.scenes[k - 1] ?? outline.scenes[k + 2];
    const after = outline.scenes[k + 1];

    // A lesson page from what the outline says it teaches: a sentence a
    // beat, its title and its numbers on cards (code draws them).
    const lessonOf = (scene: typeof after, title: string) => {
      const sentences = (scene.teach ?? scene.summary)
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean)
        .slice(0, 4);
      const numbers = [
        ...(scene.teach ?? '').matchAll(
          /\b(3\d)(?:\.\d)?\b|\b(thirty-(?:seven|eight|nine))\b/giu,
        ),
      ]
        .map((m) => m[0].toLowerCase())
        .map(
          (n) =>
            ({
              'thirty-seven': '37',
              'thirty-eight': '38',
              'thirty-nine': '39',
            })[n] ?? n,
        )
        .filter((n, i, all) => all.indexOf(n) === i)
        .slice(0, 2);
      const cards = [
        { id: 'title', kind: 'words', name: title, style: 'keyword' },
        ...numbers.map((n) => ({
          id: `n${n}`,
          kind: 'stat',
          name: 'degrees',
          value: `${n} °C`,
        })),
      ];
      return studio.explainerSheetOf({
        kind: 'explainer',
        title,
        draft: {
          fit: 'good',
          fitReason: null,
          title,
          mood: 'curious',
          beats: sentences.map((say, i) => ({
            say,
            pause: 'short',
            delivery:
              i === 0 ? 'hook' : i === sentences.length - 1 ? 'key' : 'explain',
          })),
          cast: cards.map((c) => ({
            brief: null,
            motion: null,
            parts: null,
            states: null,
            shape: null,
            value: null,
            style: null,
            sound: null,
            lines: null,
            plot: null,
            quote: null,
            phrases: null,
            ref: null,
            state: null,
            timeline: null,
            chart: null,
            ...c,
          })),
          steps: cards.map((c, i) => ({
            beat: Math.min(i, sentences.length - 1),
            phrase: '',
            layout: i === 0 ? 'one' : 'row',
            show: cards.slice(0, i + 1).map((one) => one.id),
            arrows: null,
            effects: null,
          })),
        },
      });
    };
    const first = lessonOf(before, before.title);
    const hooked = clips.hookFirst(
      lessonOf(after, after.title),
      clips.hookOf(clipScene),
    );
    const sheets = [first, clipSheet, hooked.sheet];
    const at = new Date();
    const show = {
      id: 'fever-e8',
      userId: 'proof',
      title: outline.title,
      format: 'explainer' as const,
      brief,
      bible,
      createdAt: at,
      updatedAt: at,
    };
    const episode = {
      id: 'fever-e8',
      showId: show.id,
      userId: 'proof',
      number: 1,
      title: outline.title,
      logline: outline.logline,
      phase: 'script' as const,
      busy: null,
      error: null,
      outline: { ...outline, scenes: [before, clipScene, after] },
      shareToken: null,
      durationMs: null,
      thumbKey: null,
      createdAt: at,
      updatedAt: at,
    };
    const rows = sheets.map((sheet, position) => ({
      id: `fever-e8-s${position + 1}`,
      episodeId: episode.id,
      position,
      sheet,
      sheetHash: null,
      problems: [],
      previousSheet: null,
      status: 'ready' as const,
      step: null,
      error: null,
      sceneKey: null,
      audioKey: null,
      thumbKey: null,
      madeHash: null,
      durationMs: null,
      updatedAt: at,
    }));
    // The clip's people and its clinic, once, as the worker's prepare does.
    const theme = showTheme(brief, bible);
    const look = clips.clipLook(theme);
    await scenes.prepareStory(
      {
        bible: clips.withPresets(storyBibleFor(bible, [clipSheet], show.title)),
        page: 1,
        castKey: cast.studioCastKey(show.id),
        setsKey: cast.studioSetsKey(show.id),
        ownKey: cast.studioOwnKey(show.id),
        bookTitle: show.title,
        ...(look ? { look } : {}),
      },
      null,
      'proof (cast)',
    );
    const sets = await paintedSets(storage, show.id);
    const gestures = await gesturingCast(storage, show.id);
    for (const row of rows) {
      const of = studioMakeOf(show, episode, row, rows, bible, sets, gestures);
      const made = await scenes.make({
        ...of,
        documentId: null,
        base: `proof/${row.id}`,
        who: `proof ${row.id}`,
        keepAs: row.id,
        ...(row.sheet.kind === 'explainer'
          ? { theme: theme ?? undefined, reading: studioReading(brief) }
          : {}),
      });
      if (made.fit === 'poor') throw new Error(made.reason);
      const dir = join(SCENES, row.id);
      mkdirSync(dir, { recursive: true });
      // In the look the player shows it in: a clip's too.
      const scene =
        theme && theme !== 'paper' ? { ...made.scene, theme } : made.scene;
      writeFileSync(join(dir, 'scene.json'), JSON.stringify(scene));
      writeFileSync(
        join(dir, 'audio.mp3'),
        await storage.get(made.voice.audioKey),
      );
      // A clip's still is its last frame, as the worker keeps it.
      const png =
        row.sheet.kind === 'story'
          ? (
              await renderStill(
                made.scene,
                Math.max(
                  0,
                  (made.scene.settledMs ?? made.scene.durationMs) - 40,
                ),
                rasterise,
                960,
              )
            ).png
          : await storage.get(made.thumbKey);
      writeFileSync(join(dir, 'thumb.png'), png);
      console.log(
        `${row.id}: "${made.scene.title}", ${Math.round(made.voice.durationMs / 100) / 10}s${made.scene.freeze ? `, frozen at ${made.scene.freeze.atMs}ms on "${made.scene.freeze.label}"` : ''} → ${dir}`,
      );
    }
    writeFileSync(
      join(OUT, 'sheets.json'),
      JSON.stringify({ outline: episode.outline, sheets }, null, 2),
    );
    const total = spent.reduce((n, one) => n + one.usd, 0);
    console.log(
      `spent: $${total.toFixed(4)} in ${spent.length} priced calls (${spent.map((s) => `${s.task} $${s.usd.toFixed(4)}`).join(', ') || 'none this run'})`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
