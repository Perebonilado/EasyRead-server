/**
 * The critic calibrated (explainer-animation-plan §9.3, decision 6): the
 * critic scores the reference contact sheets (human-made explainers, each
 * `<refs>/<channel>/*-sheet.jpg`) and sheets of our own films, made from a
 * frames run's stills laid out as the references are (ten stills about
 * three seconds apart, five across, from each scene's start), all with the
 * same prompt and on the frames alone. It prints and writes each group's
 * scores by axis, how far ours are from the references, and the chance a
 * reference outscores ours: "beat human-made videos" as a number.
 *
 *   npx ts-node --transpile-only scripts/critic-calibrate.ts --refs <dir>
 *     [--ours <frames run dir>[,<dir>…]] [--after <frames run dir>[,…]]
 *     [--only <channel>,…] [--segments opening,middle,three-quarters]
 *     [--scenes 1,5] (of ours) [--effort low|medium|high]
 *     [--out <dir>] [--again] [--dry]
 *
 * A frames run dir is what `npm run frames` writes for an episode
 * (checks.json and stills/). Scores are kept in <out>/calibration.json by
 * sheet and prompt, so a run again asks only what it has not (--again asks
 * all); --dry makes our sheets and asks nothing. Nothing is written to the
 * database, not even the ledger: the cost is printed.
 */
import 'reflect-metadata';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { costOf } from '../src/business/domain/cost';
import {
  calibrationMarkdown,
  calibrationOf,
  sheetScore,
  type CalibrationSheet,
} from '../src/business/domain/shots/critic-calibrate';
import {
  shrink,
  type CriticTile,
} from '../src/business/domain/shots/frame-sheet';
import {
  critiqueOf,
  framesOnlyParts,
} from '../src/business/domain/shots/shot-critic';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import { LLM_GATEWAY } from '../src/business/ports/tokens';
import {
  criticSheet,
  encodePng,
  readStill,
} from '../src/pipeline/export/frame-images';
import { criticPrompt } from '../src/web/adapters/critic-prompts';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule] })
class CalibrateModule {}

const flag = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
};
const listOf = (raw: string | null) =>
  raw
    ? raw
        .split(',')
        .map((one) => one.trim())
        .filter(Boolean)
    : [];

/** A sheet to score: its group, where it is from, and its picture. */
interface Job {
  group: string;
  source: string;
  sheet: string;
  path: string;
  mediaType: 'image/png' | 'image/jpeg';
  stills: number;
}

/** The reference sheets: every channel's segments, in order. */
function refJobs(dir: string, only: string[], segments: string[]): Job[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (!only.length || only.includes(d.name)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((d) =>
      readdirSync(join(dir, d.name))
        .filter(
          (f) =>
            f.endsWith('-sheet.jpg') &&
            (!segments.length || segments.some((s) => f.startsWith(`${s}-`))),
        )
        .sort()
        .map((f) => ({
          group: 'refs',
          source: d.name,
          sheet: f,
          path: join(dir, d.name, f),
          mediaType: 'image/jpeg' as const,
          stills: 10,
        })),
    );
}

/** A moment as the references label theirs: "09:45". */
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Our sheets from a frames run, laid out as the references are: for each
 * scene, ten stills about three seconds apart from its start (the stills
 * nearest each mark, never one in a join), five across at 480 × 270.
 */
async function ourJobs(
  dir: string,
  group: string,
  out: string,
): Promise<Job[]> {
  const checks = JSON.parse(readFileSync(join(dir, 'checks.json'), 'utf8')) as {
    title: string;
    scenes: {
      n: number;
      title: string;
      stills: {
        videoMs: number;
        sceneMs: number;
        join: boolean;
        file: string;
      }[];
    }[];
  };
  const episode = basename(dir);
  const jobs: Job[] = [];
  mkdirSync(join(out, 'sheets'), { recursive: true });
  const only = listOf(flag('--scenes')).map(Number);
  for (const scene of checks.scenes) {
    if (only.length && !only.includes(scene.n)) continue;
    const stills = scene.stills
      .filter((s) => !s.join && existsSync(join(dir, s.file)))
      .sort((a, b) => a.sceneMs - b.sceneMs);
    if (stills.length < 4) continue;
    const start = stills.find((s) => s.sceneMs >= 500) ?? stills[0];
    const picked: typeof stills = [];
    for (let k = 0; k < 10; k += 1) {
      const mark = start.sceneMs + k * 3000;
      const near = stills
        .filter(
          (s) => !picked.includes(s) && Math.abs(s.sceneMs - mark) <= 1500,
        )
        .sort(
          (a, b) => Math.abs(a.sceneMs - mark) - Math.abs(b.sceneMs - mark),
        )[0];
      if (near) picked.push(near);
    }
    if (picked.length < 4) continue;
    const tiles: CriticTile[] = [];
    for (const still of picked) {
      const image = await readStill(join(dir, still.file));
      // The frames run's stills are half the frame: 960 × 540, made 480 × 270.
      const factor = Math.max(1, Math.round(image.width / 480));
      tiles.push({
        png: encodePng(shrink(image, factor)).toString('base64'),
        label: clock(still.videoMs),
      });
    }
    const png = await criticSheet({
      title: '',
      subtitle: '',
      tiles,
      shape: 'wide',
      tile: { w: 480, h: 270, columns: 5 },
    });
    const name = `${group}-${episode.slice(0, 13)}-${String(scene.n).padStart(2, '0')}.png`;
    writeFileSync(join(out, 'sheets', name), png);
    jobs.push({
      group,
      source: `${checks.title} · ${scene.n}`,
      sheet: name,
      path: join(out, 'sheets', name),
      mediaType: 'image/png',
      stills: picked.length,
    });
  }
  return jobs;
}

async function main(): Promise<void> {
  // The critic's reasoning effort, for comparing its answers (the setting's otherwise).
  const effort = flag('--effort');
  if (effort) process.env.EXPLAINER_CRITIC_EFFORT = effort;
  const refs = flag('--refs');
  if (!refs) throw new Error('Name the reference sheets: --refs <dir>');
  const out = resolve(flag('--out') ?? 'critic-calibration');
  mkdirSync(out, { recursive: true });
  const jobs: Job[] = [
    ...refJobs(
      resolve(refs),
      listOf(flag('--only')),
      listOf(flag('--segments')),
    ),
  ];
  for (const dir of listOf(flag('--ours')))
    jobs.push(...(await ourJobs(resolve(dir), 'before', out)));
  for (const dir of listOf(flag('--after')))
    jobs.push(...(await ourJobs(resolve(dir), 'after', out)));
  const prompt = createHash('sha1')
    .update(`${criticPrompt()}${effort ? ` effort ${effort}` : ''}`)
    .digest('hex')
    .slice(0, 10);
  console.log(`${jobs.length} sheets; the prompt ${prompt}`);
  // What was scored before with this prompt is kept.
  const keptFile = join(out, 'calibration.json');
  const kept = existsSync(keptFile)
    ? (
        JSON.parse(readFileSync(keptFile, 'utf8')) as {
          sheets: (CalibrationSheet & { prompt: string; path: string })[];
        }
      ).sheets
    : [];
  const again = process.argv.includes('--again');
  const results: (CalibrationSheet & { prompt: string; path: string })[] = [];
  if (process.argv.includes('--dry')) {
    for (const job of jobs)
      console.log(`${job.group} · ${job.source} · ${job.sheet}`);
    return;
  }
  const app = await NestFactory.createApplicationContext(CalibrateModule, {
    logger: ['warn', 'error'],
  });
  let spent = 0;
  try {
    const llm = app.get<LlmGatewayPort>(LLM_GATEWAY);
    for (const job of jobs) {
      const before = kept.find(
        (k) => k.path === job.path && k.prompt === prompt,
      );
      if (before && !again) {
        results.push(before);
        continue;
      }
      const answer = await llm.shotsCritic({
        image: readFileSync(job.path),
        mediaType: job.mediaType,
        parts: framesOnlyParts({ stills: job.stills }),
      });
      const critique = critiqueOf(answer.value, { shots: [], opening: false });
      const cost =
        costOf({
          task: 'explainer_critic',
          model: answer.usage.model,
          tokensIn: answer.usage.tokensIn,
          tokensOut: answer.usage.tokensOut,
          tokensCached: answer.usage.tokensCached ?? null,
        }) ?? 0;
      spent += cost;
      const scored = {
        group: job.group,
        source: job.source,
        sheet: job.sheet,
        path: job.path,
        prompt,
        scores: Object.fromEntries(
          Object.entries(critique.scores).map(([axis, s]) => [axis, s.score]),
        ),
        why: Object.fromEntries(
          Object.entries(critique.scores).map(([axis, s]) => [axis, s.why]),
        ),
        verdict: critique.verdict,
        costUsd: cost,
      };
      results.push(scored);
      console.log(
        `${job.group.padEnd(7)} ${String(sheetScore(scored) ?? '–').padStart(5)}  ${job.source} · ${job.sheet}  (${answer.usage.tokensIn} in, ${answer.usage.tokensOut} out, $${cost.toFixed(4)})`,
      );
      // Kept as it goes: a run cut short asks only the rest next time.
      writeFileSync(
        keptFile,
        JSON.stringify(
          {
            sheets: [
              ...kept.filter(
                (k) =>
                  !results.some(
                    (r) => r.path === k.path && r.prompt === k.prompt,
                  ),
              ),
              ...results,
            ],
          },
          null,
          1,
        ),
      );
    }
  } finally {
    await app.close();
  }
  const calibration = calibrationOf(results, ['refs', 'before', 'after']);
  const table = calibrationMarkdown(calibration);
  const detail = results.map(
    (r) =>
      `- ${r.group} · ${r.source} · ${r.sheet}: **${sheetScore(r)}** (${Object.entries(
        r.scores,
      )
        .map(([a, v]) => `${a} ${v}`)
        .join(', ')}). ${r.verdict}`,
  );
  writeFileSync(
    join(out, 'calibration.md'),
    `# The critic calibrated (prompt ${prompt})\n\n${table}\n\n## Each sheet\n\n${detail.join('\n')}\n`,
  );
  console.log(
    `\n${table}\n\nspent $${spent.toFixed(3)} on ${results.length} sheets → ${out}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
