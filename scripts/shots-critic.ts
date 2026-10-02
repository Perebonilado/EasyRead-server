/**
 * The critic's loop (WP13; explainer-animation-plan §9.3) on scenes of
 * shots already made, as the make runs it once a scene is composed: each
 * scene's stills taken on the render page, checked by code, scored by the
 * critic beside its lines and shots, its worst problems fixed in its plan
 * and the scene built again on the voice it was made with, until every
 * score passes or the rounds run out. Nothing is voiced again. Each round's
 * scores, fixes and contact sheet are printed, kept on the scene's row
 * (`frames`) and, with --out, written beside each other.
 *
 *   npm run shots:critic -- --episode <id> --user <id> [--scenes 1,5] [--rounds 3] [--out <dir>]
 *
 * The render page is RENDER_WEB_URL's (the dev web on :3001 when unset);
 * the scenes are read through the API that serves it, so run it from the
 * API's own tree or give STORAGE_ROOT, as for a make. The budget is
 * EXPLAINER_CRITIC_BUDGET's for the episode, less what the critic already
 * spent on its other scenes.
 */
import 'reflect-metadata';

process.env.RENDER_WEB_URL ??= 'http://localhost:3001';
const redisDb = /\/(\d+)$/.exec(process.env.REDIS_URL ?? '')?.[1];
if (!redisDb || redisDb === '0')
  process.env.REDIS_URL = 'redis://localhost:6380/8';

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { SceneDto } from '../src/contracts';
import { CoreModule } from '../src/core.module';
import { carriedWears } from '../src/business/domain/studio/studio-check';
import { showTheme } from '../src/business/domain/studio/studio-look';
import { studioReading } from '../src/business/domain/studio/studio-motion';
import { episodeShape } from '../src/business/handlers/studio/studio-twins';
import { sceneFingerprint } from '../src/business/handlers/studio/studio-views';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import type { StoragePort } from '../src/business/ports/storage.port';
import { LLM_GATEWAY, STORAGE } from '../src/business/ports/tokens';
import type { AiCallLogRepository } from '../src/business/repositories/ai-call-log.repository';
import type { StudioRepository } from '../src/business/repositories/studio.repository';
import {
  AI_CALL_LOG_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../src/business/repositories/tokens';
import { SceneCritic } from '../src/pipeline/processors/scene-critic';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import {
  criticEyes,
  studioMakeOf,
} from '../src/pipeline/processors/studio.processor';
import { StudioMaterialService } from '../src/pipeline/processors/studio-material';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor, StudioMaterialService],
})
class ShotsCriticModule {}

const option = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

async function main(): Promise<void> {
  const episodeId = option('--episode');
  const userId = option('--user');
  if (!episodeId || !userId)
    throw new Error(
      'Usage: npm run shots:critic -- --episode <id> --user <id> [--scenes 1,5] [--rounds 3] [--out <dir>]',
    );
  const app = await NestFactory.createApplicationContext(ShotsCriticModule, {
    logger: ['log', 'warn', 'error'],
  });
  const logger = new Logger('ShotsCritic');
  try {
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const storage = app.get<StoragePort>(STORAGE);
    const episode = await studio.findEpisode(episodeId);
    if (!episode || episode.userId !== userId)
      throw new Error(`No episode ${episodeId} of the maker ${userId}`);
    const show = await studio.findShow(episode.showId);
    if (!show?.bible) throw new Error('The episode’s show has no cast');
    const bible = show.bible;
    const setting = (name: string) => process.env[name];
    const eyes = criticEyes(setting);
    if (!eyes) throw new Error('The critic is off, or no render page is named');
    const critic = new SceneCritic({
      studio,
      llm: app.get<LlmGatewayPort>(LLM_GATEWAY),
      calls: app.get<AiCallLogRepository>(AI_CALL_LOG_REPOSITORY),
      storage,
      scenes: app.get(SceneProcessor),
      eyes,
      setting,
      logger: { log: (l) => logger.log(l), warn: (l) => logger.warn(l) },
    });
    const rows = await studio.listScenes(episode.id);
    const asked = (option('--scenes') ?? '')
      .split(',')
      .map((n) => Number(n.trim()) - 1)
      .filter((k) => Number.isInteger(k) && k >= 0);
    const out = option('--out') ? resolve(option('--out')!) : null;
    const rounds = Number(option('--rounds')) || undefined;
    for (const row of rows) {
      if (asked.length && !asked.includes(row.position)) continue;
      const who = `studio ${episode.id} s${row.position + 1}`;
      if (
        row.sheet?.kind !== 'explainer' ||
        row.sheet.engine !== 'shots' ||
        !row.sceneKey ||
        !row.audioKey ||
        !row.durationMs
      ) {
        logger.warn(`${who}: not a made scene of shots: skipped`);
        continue;
      }
      const of = studioMakeOf(show, episode, row, rows, bible);
      if (!of.shots) continue;
      const scene = JSON.parse(
        (await storage.get(row.sceneKey)).toString('utf8'),
      ) as SceneDto;
      const looked = await critic.loop({
        show,
        episode,
        row,
        make: {
          script: of.script!,
          profile: of.profile,
          shots: of.shots,
          ...(of.finish ? { finish: of.finish } : {}),
          theme: showTheme(show.brief, bible) ?? undefined,
          reading: studioReading(show.brief),
        },
        made: {
          scene,
          sceneKey: row.sceneKey,
          thumbKey: row.thumbKey ?? '',
          audioKey: row.audioKey,
          durationMs: row.durationMs,
        },
        shape: episodeShape(episode),
        who,
        ...(rounds ? { rounds } : {}),
      });
      // As the make leaves a scene: its film, its still, and the
      // fingerprint of the sheet it ends on.
      const sheet = looked.sheet ?? row.sheet;
      await studio.updateScene(row.id, {
        status: 'made',
        sceneKey: looked.sceneKey,
        thumbKey: looked.thumbKey,
        madeHash: sceneFingerprint(
          sheet,
          bible,
          show.brief,
          carriedWears(rows, bible).get(row.position) ?? [],
        ),
      });
      const frames = looked.frames;
      console.log(
        `\nscene ${row.position + 1} "${row.sheet.title}": ${frames?.ended ?? 'not looked at'}, $${(frames?.costUsd ?? 0).toFixed(3)}`,
      );
      for (const round of frames?.rounds ?? []) {
        console.log(
          `  round ${round.round}: ${
            round.critic
              ? Object.entries(round.critic.scores)
                  .map(([axis, s]) => `${axis} ${s.score}`)
                  .join(', ')
              : 'looked at by code alone'
          }${round.checks ? ` · code ${round.checks.overall}` : ''}`,
        );
        if (round.critic?.verdict) console.log(`    ${round.critic.verdict}`);
        for (const fix of round.applied)
          console.log(
            `    s${fix.shot} ${fix.kind}: ${fix.outcome}${fix.what ? `, ${fix.what}` : ''}`,
          );
        if (out && round.sheetKey) {
          mkdirSync(out, { recursive: true });
          writeFileSync(
            join(
              out,
              `s${String(row.position + 1).padStart(2, '0')}-round${round.round}.png`,
            ),
            await storage.get(round.sheetKey),
          );
        }
      }
      if (out && frames) {
        mkdirSync(out, { recursive: true });
        writeFileSync(
          join(
            out,
            `s${String(row.position + 1).padStart(2, '0')}-frames.json`,
          ),
          JSON.stringify(frames, null, 1),
        );
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
