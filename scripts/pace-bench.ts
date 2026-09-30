/**
 * The voice's pace, before and after the pace step (studio-explainer-plan,
 * Ask 1), on six fixture lesson scenes voiced on our own Kokoro, which
 * costs nothing:
 *
 *   ENV_FILE=../easyread-server/.env npm run pace:bench -- [--out <dir>] [--only kids-water-cycle,adult-vaccines] [--voice am_puck] [--rate 226]
 *
 * "Before" is the voice as it was: the delivery table's speeds and summed
 * pauses, the stage's multipliers, and nothing put right after. "After"
 * is the scene pipeline's own voice step as it is now (targets by band,
 * pauses shaped within budget, speed from the voice's measured rate, the
 * stretch and pause step after). Each sentence's words a minute is
 * measured from the voice's own word times, with the silence share and
 * the longest pause, against the pass bar: 90 % of sentences within 8 %
 * of their target, no unmarked silence over 1.6 s, silence within budget.
 * Each scene's audio, before and after, is written to --out as mp3.
 * Gemini is never asked here.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { envConfig, measure, speechFor } from './voice-calibrate';
import {
  CALIBRATION_PASSAGE,
  PACE_FIXTURES,
  type PaceFixture,
} from './pace-fixtures';
import {
  SILENCE_BUDGET,
  paceReport,
  targetWpm,
  voiceRate,
  type AudienceBand,
  type PaceReport,
  type VoiceRates,
} from '../src/business/domain/scene-pace';
import { firstSaid } from '../src/business/domain/lesson-notes';
import { deliveryPieces, voiceStyle } from '../src/business/domain/scene-voice';
import {
  STAGE_RECIPES,
  type LearningStage,
} from '../src/business/domain/scene-stage';
import {
  sceneSpoken,
  spokenWordsFromVoice,
  timeBeats,
  type TimedBeat,
} from '../src/business/domain/scene-timing';
import { spokenForm } from '../src/business/domain/spoken';
import type { SceneScript } from '../src/business/domain/scene-script';
import type { SpeechPort } from '../src/business/ports/voice.port';
import type { StoragePort } from '../src/business/ports/storage.port';
import { EchogardenAudioCodecAdapter } from '../src/web/adapters/audio/audio-codec.adapter';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';

/** The stage a band was taught at before bands: what "before" was voiced for. */
const STAGE_OF: Record<AudienceBand, LearningStage | null> = {
  'early-years': 'early',
  'primary-lower': 'early',
  'primary-upper': 'early',
  'secondary-lower': 'middle',
  'secondary-upper': 'middle',
  university: 'higher',
  professional: 'professional',
  'general-adult': null,
};
/** Seconds of quiet after a sentence that first says a new term, as it was. */
const TERM_LANDS_S = 0.7;
/** The pass bar's: a sentence this near its target is on it. */
const WITHIN = 0.08;
/** A silence longer than this that nothing planned is a hole. */
const HOLE_MS = 1600;

interface Measured {
  report: PaceReport;
  beats: TimedBeat[];
  durationMs: number;
  audio: Buffer;
  /** Each sentence's target, for this band. */
  targets: number[];
  /** The silence planned after each sentence. */
  planned: number[];
}

/** The scene's sentences timed on the voice's own word times. */
function timed(
  fixture: PaceFixture,
  result: Awaited<ReturnType<SpeechPort['synthesize']>>,
): TimedBeat[] {
  const forms = fixture.beats.map((beat) => spokenForm(beat.say, new Map()));
  const spoken = sceneSpoken(forms);
  const words = result.words?.length
    ? spokenWordsFromVoice(result.words, spoken.text)
    : null;
  if (!words) throw new Error('Kokoro gave no word times');
  return timeBeats(fixture.beats, forms, words);
}

/** What each sentence says aloud: its rate is measured on it. */
const saidOf = (fixture: PaceFixture) =>
  fixture.beats.map((beat) => spokenForm(beat.say, new Map()).text);

const targetsOf = (fixture: PaceFixture) => {
  const first = firstSaid(fixture.beats, fixture.terms);
  return fixture.beats.map((beat, k) =>
    targetWpm(beat, { band: fixture.band }, first.get(k) ?? []),
  );
};

/** The voice as it was: the delivery table, summed pauses, nothing put right. */
async function before(
  fixture: PaceFixture,
  speech: SpeechPort,
  voice: string,
): Promise<Measured> {
  const stage = STAGE_OF[fixture.band];
  const first = firstSaid(fixture.beats, fixture.terms);
  const delivered = deliveryPieces(
    fixture.beats,
    stage ? STAGE_RECIPES[stage] : undefined,
  ).map((piece, k) =>
    first.has(k)
      ? { ...piece, pauseAfter: Math.max(piece.pauseAfter, TERM_LANDS_S) }
      : piece,
  );
  const forms = fixture.beats.map((beat) => spokenForm(beat.say, new Map()));
  const result = await speech.synthesize({
    text: sceneSpoken(forms).text,
    voice,
    speed: 1,
    timestamps: true,
    pieces: forms.map((form, k) => ({
      text: form.text,
      speed: delivered[k].speed,
      pauseAfter: delivered[k].pauseAfter,
      style: voiceStyle(
        'curious',
        fixture.beats[k].delivery,
        first.get(k) ?? [],
      ),
    })),
  });
  const beats = timed(fixture, result);
  return {
    report: paceReport(beats, saidOf(fixture)),
    beats,
    durationMs: result.durationMs ?? 0,
    audio: result.audio,
    targets: targetsOf(fixture),
    planned: delivered.map((d) => d.pauseAfter),
  };
}

/** The voice as the scene pipeline makes it now, through its own voice step. */
async function after(
  fixture: PaceFixture,
  speech: SpeechPort,
  voice: string,
  rates: VoiceRates,
): Promise<Measured> {
  const kept = new Map<string, Buffer>();
  const storage = {
    put: ({ key, body }: { key: string; body: Buffer }) => {
      kept.set(key, body);
      return Promise.resolve({ key });
    },
  } as unknown as StoragePort;
  const voices = {
    current: () =>
      Promise.resolve({ engine: 'kokoro', speech, voice, cast: {}, rates }),
  };
  const processor = new SceneProcessor(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { record: () => Promise.resolve() },
    {} as never,
    voices as never,
    envConfig,
    storage,
    { enabled: () => false } as never,
    new EchogardenAudioCodecAdapter(envConfig),
  );
  const script = {
    title: fixture.title,
    mood: 'curious',
    beats: fixture.beats,
    cast: [],
    steps: [],
  } as unknown as SceneScript;
  // The pipeline's own voice step, as a scene is voiced.
  const step = processor as unknown as {
    voice: (
      ...args: unknown[]
    ) => Promise<{ beats: TimedBeat[]; durationMs: number; audioKey: string }>;
  };
  const made = await step.voice(
    script,
    new Map(),
    `bench/${fixture.id}`,
    null,
    `bench ${fixture.id}`,
    null,
    0,
    STAGE_OF[fixture.band],
    fixture.terms,
    { band: fixture.band },
  );
  return {
    report: paceReport(made.beats, saidOf(fixture)),
    beats: made.beats,
    durationMs: made.durationMs,
    audio: kept.get(made.audioKey) ?? Buffer.alloc(0),
    targets: targetsOf(fixture),
    planned: [],
  };
}

/** How a take measures against the pass bar. */
function scored(fixture: PaceFixture, take: Measured) {
  const judged = take.report.sentences
    .map((wpm, k) => ({ wpm, target: take.targets[k] }))
    .filter((s): s is { wpm: number; target: number } => s.wpm !== null);
  const within = judged.filter(
    (s) => Math.abs(s.wpm / s.target - 1) <= WITHIN,
  ).length;
  // Holes: a silence between sentences over 1.6 s after anything but a question.
  let holes = 0;
  take.beats.forEach((beat, k) => {
    const next = take.beats[k + 1];
    if (!next) return;
    if (fixture.beats[k].delivery === 'question') return;
    if (next.startMs - beat.endMs > HOLE_MS) holes += 1;
  });
  const budget = SILENCE_BUDGET[fixture.band];
  return {
    within: judged.length ? within / judged.length : 1,
    holes,
    budget,
    inBudget: take.report.silenceShare <= budget + 0.01,
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

async function main(): Promise<void> {
  Logger.overrideLogger(['log', 'warn', 'error']);
  const args = process.argv.slice(2);
  const option = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const speech = speechFor('kokoro');
  if (!speech) {
    console.error('No KOKORO_TTS_URL: the bench voices on our own Kokoro only');
    process.exit(2);
  }
  const voice = option('--voice') ?? speech.label().voice;
  const only = option('--only')?.split(',');
  const out = resolve(option('--out') ?? join('scene-out', 'pace-bench'));
  mkdirSync(out, { recursive: true });
  // The voice's own rate, measured as voice:calibrate measures it (free
  // on Kokoro), or as given; --rate 0 takes the engine's guess.
  const given = option('--rate');
  const rates: VoiceRates =
    given === '0'
      ? {}
      : {
          kokoro: {
            [voice]: {
              wpm: given
                ? Number(given)
                : (await measure(speech, voice, CALIBRATION_PASSAGE, null)).wpm,
            },
          },
        };
  console.log(
    `Kokoro ${voice}: ${voiceRate(rates, 'kokoro', voice).wpm} wpm at speed 1${given === '0' ? " (the engine's guess)" : ''}\n`,
  );
  const rows: string[] = [];
  const all: {
    before: ReturnType<typeof scored>;
    after: ReturnType<typeof scored>;
  }[] = [];
  for (const fixture of PACE_FIXTURES) {
    if (only && !only.includes(fixture.id)) continue;
    const was = await before(fixture, speech, voice);
    const now = await after(fixture, speech, voice, rates);
    writeFileSync(join(out, `${fixture.id}-before.mp3`), was.audio);
    writeFileSync(join(out, `${fixture.id}-after.mp3`), now.audio);
    const a = scored(fixture, was);
    const b = scored(fixture, now);
    all.push({ before: a, after: b });
    const target = Math.round(
      was.targets.reduce((n, t) => n + t, 0) / was.targets.length,
    );
    console.log(`${fixture.id} (${fixture.band}), target about ${target} wpm`);
    console.log(
      `  sentences before: ${was.report.sentences.map((w, k) => `${w ?? '–'}/${was.targets[k]}`).join(' ')}`,
    );
    console.log(
      `  sentences after:  ${now.report.sentences.map((w, k) => `${w ?? '–'}/${now.targets[k]}`).join(' ')}`,
    );
    const line = (
      name: string,
      take: Measured,
      score: ReturnType<typeof scored>,
    ) =>
      `  ${name}: ${take.report.wpm} wpm (${take.report.plainWpm} in plain words), ${pct(score.within)} of sentences within 8% of target, silence ${pct(take.report.silenceShare)} (budget ${pct(score.budget)}${score.inBudget ? '' : ', over'}), longest pause ${(take.report.longestPauseMs / 1000).toFixed(2)} s, ${score.holes} unmarked silences over 1.6 s, ${(take.durationMs / 1000).toFixed(1)} s long`;
    console.log(line('before', was, a));
    console.log(line('after ', now, b));
    rows.push(
      `| ${fixture.id} | ${fixture.band} | ${target} | ${was.report.wpm} → ${now.report.wpm} (${was.report.plainWpm} → ${now.report.plainWpm}) | ${pct(a.within)} → ${pct(b.within)} | ${pct(was.report.silenceShare)} → ${pct(now.report.silenceShare)} (≤ ${pct(a.budget)}) | ${(was.report.longestPauseMs / 1000).toFixed(2)} → ${(now.report.longestPauseMs / 1000).toFixed(2)} s | ${a.holes} → ${b.holes} |`,
    );
  }
  const passed = all.filter(
    (one) => one.after.within >= 0.9 && !one.after.holes && one.after.inBudget,
  ).length;
  const table = [
    '| scene | band | target wpm | wpm (plain words) | within ±8 % | silence | longest pause | holes > 1.6 s |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
  console.log(
    `\n${table}\n\n${passed} of ${all.length} scenes pass the bar after.`,
  );
  writeFileSync(
    join(out, 'pace-bench.md'),
    `${table}\n\n${passed} of ${all.length} scenes pass the bar after.\n`,
  );
  console.log(`Audio and the table: ${out}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
