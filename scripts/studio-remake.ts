/**
 * Scenes of a Studio episode made again here and now, in this process, the
 * way the worker makes them (the sheet put right and staged, drawn from the
 * show's cast and sets, voiced, composed), for looking at a change to the
 * stage on a real film without touching it:
 *
 *   npm run studio:remake -- <episodeId> --scenes 2,3 --out <dir>
 *   npm run studio:remake -- <episodeId> --scenes 1 --write --out <dir>
 *   npm run studio:remake -- <episodeId> --scenes 1,2,3 --store <before.json> --out <dir>
 *
 * Scenes are counted from 1. Each lands in the out dir (in <dir>/s<n> when
 * there are several): scene.json, audio.mp3, and the parts it was composed
 * from (SCENE_KEEP_PARTS), which scripts/studio-recompose puts together
 * again with no model and no voice. The scene's row, the episode and the
 * stored film are left as they are. The voice is asked, and costs as it
 * does; a set kept before its ground was measured is measured and kept.
 *
 * With --write, each scene is first written again by the scene writer, as
 * the worker writes it (from the outline and how the scene before left the
 * stage), and made from that. What it wrote lands beside the scene, never
 * in the row: sheet.json as it would be stored, written.json the writer's
 * own answers before they were put right.
 *
 * With --store, each scene is made by the worker's own make: new files in
 * storage, the rows and the episode updated as a make updates them, the
 * month's film spent. A feature the words name joins its set first, as the
 * writer would have added it. The rows' files before are listed in the
 * file --store names (kept as it is if it is already there) and stay in
 * storage, so the film before can be put back.
 */
import 'reflect-metadata';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import type {
  StorySheet,
  StudioBible,
} from '../src/business/domain/studio/studio';
import {
  endBefore,
  mendSheet,
  repairSheet,
  withFeatures,
} from '../src/business/domain/studio/studio-check';
import { EntitlementsService } from '../src/business/handlers/documents/entitlements.service';
import { StudioCastService } from '../src/business/handlers/studio/studio-cast.service';
import type { JobQueuePort } from '../src/business/ports/job-queue.port';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import type { StoragePort } from '../src/business/ports/storage.port';
import { JOB_QUEUE, LLM_GATEWAY, STORAGE } from '../src/business/ports/tokens';
import type { AiCallLogRepository } from '../src/business/repositories/ai-call-log.repository';
import type {
  StudioRepository,
  StudioSceneRecord,
} from '../src/business/repositories/studio.repository';
import {
  AI_CALL_LOG_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../src/business/repositories/tokens';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import {
  StudioProcessor,
  studioMakeOf,
} from '../src/pipeline/processors/studio.processor';

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

/** A method called on the thing it came from, however it is reached. */
function ownedBy(
  target: object,
  method: unknown,
): (...args: unknown[]) => unknown {
  const call = method as (...args: unknown[]) => unknown;
  return (...args) => Reflect.apply(call, target, args);
}

/** `real`, with the methods `own` gives in place of its own; the rest are its own, bound to it. */
function withOwn<T extends object>(real: T, own: Partial<T>): T {
  return new Proxy(real, {
    get(target, name) {
      if (name in own) return own[name as keyof T];
      const value: unknown = Reflect.get(target, name);
      return typeof value === 'function' ? ownedBy(target, value) : value;
    },
  });
}

/**
 * The repository as it reads, with every write held back: what would be
 * written (a sheet, a set's features, a line in the thread) is kept in
 * `held`, by method, and stored nowhere.
 */
function heldBack(
  studio: StudioRepository,
  held: [string, unknown[]][],
): StudioRepository {
  return new Proxy(studio, {
    get(target, name) {
      const value: unknown = Reflect.get(target, name);
      if (typeof value !== 'function') return value;
      if (typeof name === 'string' && /^(find|list|count|making)/.test(name))
        return ownedBy(target, value);
      return (...args: unknown[]) => {
        held.push([String(name), args]);
        return Promise.resolve(undefined);
      };
    },
  });
}

/** The worker's own Studio processor, on this process's parts, with `studio`, `llm` and `storage` as given. */
function workerOf(
  app: INestApplicationContext,
  studio: StudioRepository,
  llm: LlmGatewayPort,
  storage: StoragePort,
): StudioProcessor {
  return new StudioProcessor(
    studio,
    llm,
    app.get<AiCallLogRepository>(AI_CALL_LOG_REPOSITORY),
    storage,
    app.get(SceneProcessor),
    app.get(EntitlementsService),
    app.get(StudioCastService),
    app.get<JobQueuePort>(JOB_QUEUE),
  );
}

/** The row at scene `n`, from 1. */
function rowAt(
  rows: StudioSceneRecord[],
  n: number,
): StudioSceneRecord | undefined {
  return rows.find((r) => r.position === n - 1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [episodeId] = args;
  const positions = (flag(args, '--scenes') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const out = flag(args, '--out');
  const write = args.includes('--write');
  const store = flag(args, '--store');
  if (
    !episodeId ||
    episodeId.startsWith('--') ||
    !positions.length ||
    !out ||
    (store !== undefined && (store.startsWith('--') || write))
  ) {
    console.error(
      'npm run studio:remake -- <episodeId> --scenes 2,3 [--write | --store <before.json>] --out <dir>',
    );
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(StudioRemakeModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const storage = app.get<StoragePort>(STORAGE);
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    const scenes = app.get(SceneProcessor);
    const episode = await studio.findEpisode(episodeId);
    if (!episode) throw new Error(`No episode ${episodeId}`);
    const show = await studio.findShow(episode.showId);
    if (!show?.bible) throw new Error('The show has no cast yet');
    let bible: StudioBible = show.bible;
    let rows = await studio.listScenes(episode.id);
    const dirOf = (n: number) =>
      resolve(positions.length > 1 ? join(out, `s${n}`) : out);

    if (store) {
      // The film before, first: its files stay in storage, listed here.
      if (existsSync(store)) {
        const kept = JSON.parse(readFileSync(store, 'utf8')) as {
          episodeId?: string;
        };
        if (kept.episodeId !== episode.id)
          throw new Error(`${store} is another episode's`);
        console.log(`the film before: kept as it was in ${store}`);
      } else {
        writeFileSync(
          store,
          JSON.stringify(
            {
              episodeId: episode.id,
              showId: show.id,
              at: new Date().toISOString(),
              episode: {
                phase: episode.phase,
                durationMs: episode.durationMs,
                thumbKey: episode.thumbKey,
              },
              bible,
              rows: rows.map((r) => ({
                id: r.id,
                position: r.position,
                status: r.status,
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
        console.log(`the film before: listed in ${store}`);
      }
      // A feature the words name joins its set, as a writer's would: the
      // scenes in order, each carrying on from how the one before left it.
      for (const row of [...rows].sort((a, b) => a.position - b.position)) {
        if (row.sheet?.kind !== 'story') continue;
        const before = endBefore(rows, row.position, bible);
        const sheet = repairSheet(row.sheet, bible, before);
        const grown = withFeatures(
          bible,
          sheet.set,
          mendSheet(sheet, bible, before).features,
        );
        const had = new Set(
          bible.sets
            .find((s) => s.id === sheet.set)
            ?.features?.map((f) => f.id),
        );
        const added = (
          grown.sets.find((s) => s.id === sheet.set)?.features ?? []
        ).filter((f) => !had.has(f.id));
        if (!added.length) continue;
        console.log(
          `scene ${row.position + 1}: ${sheet.set} gains ${added.map((f) => f.id).join(', ')}`,
        );
        bible = grown;
      }
      if (bible !== show.bible) await studio.updateShow(show.id, { bible });

      // Made as the maker's Make makes them: the episode claimed, the
      // scenes marked, then each made by the worker's own make, which
      // settles the episode once none is left making.
      const wanted = positions
        .map((n) => rowAt(rows, n))
        .filter((r): r is StudioSceneRecord => Boolean(r?.sheet));
      if (!(await studio.claimEpisode(episode.id, 'make')))
        throw new Error('It is already being made.');
      for (const row of wanted)
        await studio.updateScene(row.id, {
          status: 'making',
          step: null,
          error: null,
        });
      const worker = workerOf(
        app,
        studio,
        llm,
        withOwn(storage, { delete: () => Promise.resolve() }),
      );
      try {
        for (const row of wanted) {
          const n = row.position + 1;
          const dir = dirOf(n);
          mkdirSync(dir, { recursive: true });
          process.env.SCENE_KEEP_PARTS = dir;
          const started = Date.now();
          await worker.process(
            {
              kind: 'make',
              showId: show.id,
              episodeId: episode.id,
              userId: episode.userId,
              sceneId: row.id,
            },
            { isFinalAttempt: true, attemptsMade: 1 },
          );
          const made = await studio.findScene(row.id);
          if (made?.status !== 'made' || !made.sceneKey || !made.audioKey) {
            console.warn(`scene ${n}: not made (${made?.status})`);
            continue;
          }
          writeFileSync(
            join(dir, 'scene.json'),
            await storage.get(made.sceneKey),
          );
          writeFileSync(
            join(dir, 'audio.mp3'),
            await storage.get(made.audioKey),
          );
          // Named as the other ways name them, for scripts/studio-recompose.
          if (existsSync(join(dir, `studio-${row.id}-parts.json`)))
            renameSync(
              join(dir, `studio-${row.id}-parts.json`),
              join(dir, 'scene-parts.json'),
            );
          console.log(
            `scene ${n}: made and stored in ${Math.round((Date.now() - started) / 1000)}s → ${made.sceneKey}`,
          );
        }
      } finally {
        // Whatever this run did not finish is not left making for ever.
        const left = (await studio.listScenes(episode.id)).filter(
          (r) => r.status === 'making',
        );
        for (const row of left)
          await studio.updateScene(row.id, {
            status: 'failed',
            step: null,
            error: 'This scene could not be made. Try making it again.',
          });
        if (left.length) await studio.updateEpisode(episode.id, { busy: null });
      }
      return;
    }

    for (const n of positions) {
      let row = rowAt(rows, n);
      if (!row?.sheet) {
        console.warn(`scene ${n}: none, or no sheet`);
        continue;
      }
      const dir = dirOf(n);
      mkdirSync(dir, { recursive: true });
      if (write) {
        // Written by the worker's own writer, its writes held back here.
        const held: [string, unknown[]][] = [];
        const written: unknown[] = [];
        const writer = workerOf(
          app,
          heldBack(studio, held),
          withOwn(llm, {
            studioScene: async (input) => {
              const answer = await llm.studioScene(input);
              written.push(answer.value);
              return answer;
            },
          }),
          storage,
        );
        await writer.process(
          {
            kind: 'scene',
            showId: show.id,
            episodeId: episode.id,
            userId: episode.userId,
            sceneId: row.id,
            request: '',
          },
          { isFinalAttempt: false, attemptsMade: 1 },
        );
        const patchOf = (method: string) =>
          held
            .filter(([name]) => name === method)
            .map(([, [, patch]]) => patch as Record<string, unknown>);
        const stored = patchOf('updateScene').find((p) => p.sheet);
        if (!stored) throw new Error(`scene ${n}: nothing was written`);
        const sheet = stored.sheet as StorySheet;
        bible =
          (patchOf('updateShow').find((p) => p.bible)?.bible as
            StudioBible | undefined) ?? bible;
        writeFileSync(
          join(dir, 'sheet.json'),
          JSON.stringify(
            { sheet, problems: stored.problems, bible: bible.sets },
            null,
            2,
          ),
        );
        writeFileSync(
          join(dir, 'written.json'),
          JSON.stringify(written, null, 2),
        );
        row = { ...row, sheet };
        const ownRow = row;
        rows = rows.map((r) => (r.id === ownRow.id ? ownRow : r));
      }
      // The parts kept where the processor keeps them: beside the scene.
      process.env.SCENE_KEEP_PARTS = dir;
      const started = Date.now();
      const made = await scenes.make({
        ...studioMakeOf(show, episode, row, rows, bible),
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
