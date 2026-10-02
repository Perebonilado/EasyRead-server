/**
 * The frame checks over a made episode (explainer-animation-plan §9): its
 * stills at every beat's middle, every shot's start, middle and end, and
 * every 2 s; what was on the frame at each; the code checks and their
 * scores; a contact sheet a scene. It reads the episode and writes files:
 * nothing in the database or in storage changes.
 *
 *   npm run frames -- --episode <id> --user <id> [--shape wide|tall] [--per beat|shot|2s]
 *                     [--out <dir>] [--web <url>] [--api <url>] [--pages 2] [--no-captions] [--full]
 *
 * Writes, under <out>/<episode> (<episode>-tall for the tall film):
 *  - <nn>-sheet.png, each scene's contact sheet;
 *  - checks.json, every still's report, facts and problems, and the scores;
 *  - summary.md, the scores by scene and for the episode, and the worst;
 *  - stills/, the stills themselves: at half the frame's size, what the
 *    checks read (--full for whole frames, five times slower to take).
 *
 * The render page is opened as the export opens it: a render key for the
 * episode, signed with STUDIO_EXPORT_SECRET (or one made from
 * JWT_ACCESS_SECRET), on the web at --web (RENDER_WEB_URL, else the dev
 * web on :3001), which must be one with lib/scene/inspect.ts. The film is
 * read through the API at --api, as the page reads it (RENDER_API_URL,
 * else :PORT/api/v1). Chrome is CHROME_PATH's, or the usual one.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { SceneDto, StudioPlayDto } from '../src/contracts';
import { CoreModule } from '../src/core.module';
import type { FilmShape } from '../src/business/domain/scene-shape';
import {
  holdMsOf,
  isLesson,
  readingOf,
  steadyStages,
} from '../src/business/domain/scene-reading';
import {
  checkFrames,
  episodeScores,
  type FrameReport,
  type FrameScores,
  type StillFacts,
  type StillImage,
  type FrameProblem,
} from '../src/business/domain/shots/frame-checks';
import {
  momentsOf,
  type FilmTimeline,
  type Moment,
  type MomentsPer,
} from '../src/business/domain/shots/frame-moments';
import {
  scoresLine,
  shrink,
  summaryMarkdown,
  type SheetTile,
} from '../src/business/domain/shots/frame-sheet';
import { RULES_VERSION } from '../src/business/domain/studio/explainer-rules';
import {
  EXPORT_SIZE,
  RENDER_KEY_MS,
  keySecret,
  signKey,
} from '../src/business/domain/studio/studio-export';
import { episodeShape } from '../src/business/handlers/studio/studio-twins';
import type {
  StudioEpisodeRecord,
  StudioRepository,
} from '../src/business/repositories/studio.repository';
import { STUDIO_REPOSITORY } from '../src/business/repositories/tokens';
import { Ffmpeg } from '../src/pipeline/export/ffmpeg';
import {
  PuppeteerFilmCapture,
  chromePath,
} from '../src/pipeline/export/film-capture';
import {
  contactSheet,
  encodePng,
  readStill,
} from '../src/pipeline/export/frame-images';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule] })
class FramesModule {}

const PERS: readonly MomentsPer[] = ['beat', 'shot', '2s', 'all'];

/** The settings the run needs, read once. */
interface Settings {
  secret: string;
  chrome: string;
  web: string;
  api: string;
}

/**
 * The episode's film in the shape asked for: the maker's own episode, or
 * its twin in the other shape. Read, never written; the database is let go
 * before the long part.
 */
async function filmOf(
  episodeId: string,
  userId: string,
  shape: FilmShape | null,
  flags: { web: string | null; api: string | null },
): Promise<{
  lead: StudioEpisodeRecord;
  film: StudioEpisodeRecord;
  shape: FilmShape;
  settings: Settings;
}> {
  const app = await NestFactory.createApplicationContext(FramesModule, {
    logger: ['warn', 'error'],
  });
  try {
    const config = app.get(ConfigService);
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const lead = await studio.findEpisode(episodeId);
    if (!lead || lead.userId !== userId)
      throw new Error(`No episode ${episodeId} of the maker ${userId}`);
    const want = shape ?? episodeShape(lead);
    let film = lead;
    if (episodeShape(lead) !== want) {
      const episodes = await studio.listEpisodes(lead.showId);
      const twin = episodes.find(
        (one) =>
          episodeShape(one) === want &&
          (one.twinOf === lead.id ||
            (lead.twinOf ? one.id === lead.twinOf : false)),
      );
      if (!twin)
        throw new Error(
          `"${lead.title}" has no ${want} film: make its ${want} twin first`,
        );
      film = twin;
    }
    const port = config.get<string>('PORT') ?? '4000';
    return {
      lead,
      film,
      shape: want,
      settings: {
        secret: keySecret({
          own: config.get<string>('STUDIO_EXPORT_SECRET'),
          access: config.get<string>('JWT_ACCESS_SECRET'),
        }),
        chrome: chromePath(config.get<string>('CHROME_PATH')),
        web: (
          flags.web ??
          config.get<string>('RENDER_WEB_URL') ??
          'http://localhost:3001'
        ).replace(/\/+$/, ''),
        api: (
          flags.api ??
          config.get<string>('RENDER_API_URL') ??
          `http://localhost:${port}/api/v1`
        ).replace(/\/+$/, ''),
      },
    };
  } finally {
    await app.close();
  }
}

/** A lesson made before its stages were held long enough is held as the render page holds it (the client's steadied). */
function asPlayed(scene: SceneDto): SceneDto {
  if (!isLesson(scene)) return scene;
  const copy = structuredClone(scene);
  steadyStages(copy, holdMsOf(readingOf(copy)));
  return copy;
}

/** One still as checks.json keeps it. */
interface StillRecord {
  videoMs: number;
  sceneMs: number;
  why: Moment['why'];
  join: boolean;
  file: string;
  facts: StillFacts | null;
  report: FrameReport | null;
}

async function main(): Promise<void> {
  const started = Date.now();
  const flag = (name: string) => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? (process.argv[at + 1] ?? null) : null;
  };
  const episodeId = flag('--episode');
  const userId = flag('--user');
  if (!episodeId || !userId)
    throw new Error(
      'Name the episode and its maker: --episode <id> --user <id>',
    );
  const shapeAsked = flag('--shape');
  if (shapeAsked && shapeAsked !== 'wide' && shapeAsked !== 'tall')
    throw new Error('--shape is wide or tall');
  const per = (flag('--per') ?? 'all') as MomentsPer;
  if (!PERS.includes(per)) throw new Error('--per is beat, shot or 2s');
  const pages = Math.min(
    4,
    Math.max(1, Math.round(Number(flag('--pages') ?? 2)) || 2),
  );
  const captions = !process.argv.includes('--no-captions');
  // Half the frame's size: what the checks read, and quick to take.
  const full = process.argv.includes('--full');

  const { lead, film, shape, settings } = await filmOf(
    episodeId,
    userId,
    (shapeAsked as FilmShape | null) ?? null,
    { web: flag('--web'), api: flag('--api') },
  );
  const dir = resolve(
    flag('--out') ?? 'frames-out',
    shape === 'tall' ? `${lead.id}-tall` : lead.id,
  );
  mkdirSync(dir, { recursive: true });
  const key = signKey(
    { scope: 'episode', id: film.id, expiresAt: Date.now() + RENDER_KEY_MS },
    settings.secret,
  );

  // The film as the page reads it: its play, and each scene, held as the page holds it.
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${settings.api}${path}`);
    if (!response.ok)
      throw new Error(
        `${settings.api}${path.replace(key, '<key>')}: ${response.status}`,
      );
    return (await response.json()) as T;
  };
  const play = await get<StudioPlayDto>(
    `/studio/render/${key}/play/${film.id}`,
  );
  const scenes = new Map<string, SceneDto>();
  for (const one of play.scenes)
    scenes.set(
      one.id,
      asPlayed(
        await get<SceneDto>(`/studio/render/${key}/scenes/${one.id}/scene`),
      ),
    );
  console.log(
    `"${lead.title}" (${shape}): ${play.scenes.length} scenes, through ${settings.web}`,
  );

  // The stills: moments chosen once the page says where each scene plays.
  let timeline: FilmTimeline | null = null;
  let moments: Moment[] = [];
  const query = new URLSearchParams({
    key,
    captions: captions ? '1' : '0',
    title: '1',
    end: '1',
    fps: '30',
  });
  const capture = new PuppeteerFilmCapture(new Ffmpeg(), {
    chrome: settings.chrome,
    pages,
  });
  const size = EXPORT_SIZE[shape];
  const shot = Date.now();
  const stills = await capture.stills({
    url: `${settings.web}/render/${film.id}?${query.toString()}`,
    width: size.width,
    height: size.height,
    times: (told) => {
      timeline = told;
      moments = momentsOf(
        told,
        told.clips.map((clip) => scenes.get(clip.sceneId) ?? null),
        per,
      );
      return moments.map((moment) => moment.videoMs);
    },
    outDir: join(dir, 'stills'),
    inspect: true,
    scale: full ? 1 : 0.5,
    pages,
    onStill: (done, total) => {
      if (done % 10 === 0 || done === total)
        process.stdout.write(`\r${done} of ${total} stills`);
    },
  });
  process.stdout.write('\n');
  const shotMs = Date.now() - shot;
  const told = timeline as FilmTimeline | null;
  if (!told?.clips.length)
    throw new Error(
      'The render page said nothing of where its scenes play: its web needs __render.timeline',
    );
  const byMs = new Map(stills.map((one) => [one.ms, one]));

  // Each scene: its stills checked, its sheet drawn.
  const results: {
    n: number;
    sceneId: string;
    title: string;
    durationMs: number;
    scores: FrameScores;
    problems: FrameProblem[];
    stills: StillRecord[];
    facts: StillFacts[];
    sheet: string;
  }[] = [];
  for (const [index, clip] of told.clips.entries()) {
    const scene = scenes.get(clip.sceneId);
    if (!scene) continue;
    const n = index + 1;
    const title = clip.title.trim() || scene.title;
    const mine = moments.filter((moment) => moment.clip === index);
    const reports: (FrameReport | null)[] = [];
    const pixels: (StillImage | null)[] = [];
    const joins: boolean[] = [];
    const tiles: SheetTile[] = [];
    const records: StillRecord[] = [];
    for (const moment of mine) {
      const still = byMs.get(moment.videoMs);
      if (!still) continue;
      // Half size for the checks (a 2 to 8 px band is 1 to 4 here), a quarter for the sheet.
      const taken = await readStill(still.file);
      const half = full ? shrink(taken, 2) : taken;
      reports.push(
        still.inspect ? { ...still.inspect, ms: moment.sceneMs } : null,
      );
      pixels.push(half);
      joins.push(moment.join);
      tiles.push({
        png: encodePng(shrink(half, 2)).toString('base64'),
        ms: moment.sceneMs,
        codes: [],
      });
      records.push({
        videoMs: moment.videoMs,
        sceneMs: moment.sceneMs,
        why: moment.why,
        join: moment.join,
        file: relative(dir, still.file),
        facts: null,
        report: still.inspect,
      });
    }
    const result = checkFrames({
      scene,
      reports,
      pixels,
      shape,
      sceneId: clip.sceneId,
      joins,
      first: index === 0,
    });
    // Each still's failures, as many times as they failed there, under its tile.
    result.problems.forEach((problem) => {
      if (problem.still !== undefined)
        tiles[problem.still]?.codes.push(problem.code);
    });
    const factsByMs = new Map(result.stills.map((fact) => [fact.ms, fact]));
    for (const record of records)
      record.facts = factsByMs.get(record.sceneMs) ?? null;
    const sheet = `${String(n).padStart(2, '0')}-sheet.png`;
    writeFileSync(
      join(dir, sheet),
      await contactSheet({
        title: `${n}. ${title}`,
        subtitle: scoresLine(result.scores),
        tiles,
        shape,
      }),
    );
    results.push({
      n,
      sceneId: clip.sceneId,
      title,
      durationMs: scene.durationMs,
      scores: result.scores,
      problems: result.problems,
      stills: records,
      facts: result.stills,
      sheet,
    });
    console.log(`${n}. ${title}: ${scoresLine(result.scores)}`);
  }

  const episode = episodeScores(
    results.map((one) => ({
      scores: one.scores,
      durationMs: one.durationMs,
      stills: one.facts,
    })),
  );
  const ms = Date.now() - started;
  const at = new Date().toISOString();
  writeFileSync(
    join(dir, 'checks.json'),
    JSON.stringify(
      {
        episodeId: lead.id,
        filmId: film.id,
        title: lead.title,
        shape,
        per,
        rules: RULES_VERSION,
        at,
        ms,
        stillsMs: shotMs,
        web: settings.web,
        timeline: told,
        episode,
        // Each scene's facts are in its stills.
        scenes: results.map(
          ({
            n,
            sceneId,
            title,
            durationMs,
            scores,
            problems,
            stills,
            sheet,
          }) => ({
            n,
            sceneId,
            title,
            durationMs,
            scores,
            problems,
            stills,
            sheet,
          }),
        ),
      },
      null,
      1,
    ),
  );
  writeFileSync(
    join(dir, 'summary.md'),
    summaryMarkdown({
      title: lead.title,
      episodeId: lead.id,
      shape,
      per,
      at,
      ms,
      scenes: results.map((one) => ({
        n: one.n,
        title: one.title,
        durationMs: one.durationMs,
        scores: one.scores,
        problems: one.problems,
        sheet: one.sheet,
      })),
      episode,
    }),
  );
  console.log(`episode: ${scoresLine(episode)}`);
  console.log(
    `${stills.length} stills in ${Math.round(shotMs / 1000)} s, all in ${Math.round(ms / 1000)} s → ${dir}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
