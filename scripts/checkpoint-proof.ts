/**
 * A children's explainer made end to end in this process for looking at
 * the E9 set (studio-explainer-plan, Ask 9): a pause-and-think checkpoint,
 * idea marks, the recap and teach-back end card, "What next?" and the
 * show's host.
 *
 *   ts-node --transpile-only -r tsconfig-paths/register scripts/checkpoint-proof.ts \
 *     --out <dir> --scenes <client public/dev-scenes>
 *
 * No model is called. The outline ("Why do we have day and night?", for
 * kids of 8 to 11 new to it) and its three lessons are written here, as
 * the fake writer would, with only what code draws (keyword cards, a
 * number, two children the kit draws), so no drawing is paid for. Then the
 * worker's own code holds them: the audience's checks (checksAt) say which
 * scene asks a question, keepCheckpoint keeps its answers there only, the
 * cold open is checked, and each scene is made by the worker's processor
 * (studioMakeOf, SceneProcessor.make): its ideas marked, its question's
 * answers on its beats, the voice on Kokoro. The film's extras (whether it
 * pauses, the host's faces, the recap, "What next?") are what the player
 * is given (explainerPlay), kept in <scenes>/daynight-e9-play.json, and
 * the host's three looks in <scenes>/daynight-e9-host.json, for /dev/player.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';
import { studioMakeOf } from '../src/pipeline/processors/studio.processor';
import * as studio from '../src/business/domain/studio/studio';
import {
  checksAt,
  profileOf,
  recipeFor,
} from '../src/business/domain/studio/studio-audience';
import {
  coldOpen,
  keepCheckpoint,
} from '../src/business/domain/studio/studio-checkpoint';
import { hostLooks, withHost } from '../src/business/domain/studio/studio-host';
import { showTheme } from '../src/business/domain/studio/studio-look';
import { studioReading } from '../src/business/domain/studio/studio-motion';
import { explainerPlay } from '../src/business/handlers/studio/studio-engage';
import { teachBackPoints } from '../src/business/domain/studio/studio-end';
import { optionPreview } from '../src/business/handlers/studio/studio-cast.service';
import * as repos from '../src/business/repositories/tokens';
import * as tokens from '../src/business/ports/tokens';
import type { StoragePort } from '../src/business/ports/storage.port';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const OUT = resolve(flag('--out') ?? 'scene-out/checkpoint-proof');
const SCENES = resolve(flag('--scenes') ?? '../easyread-e9/public/dev-scenes');
const NAME = 'daynight-e9';
mkdirSync(OUT, { recursive: true });
// This process's own storage, and no Gemini: the voice is Kokoro's.
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_ROOT = join(OUT, 'storage');
process.env.GEMINI_API_KEY = '';
process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';

type Draft = ReturnType<typeof studio.explainerSheetOf>['draft'];
type Cast = Draft['cast'][number];
const NONE = {
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
};
const card = (id: string, name: string): Cast => ({
  ...NONE,
  id,
  kind: 'words',
  name,
  style: 'keyword',
});
const stat = (id: string, name: string, value: string): Cast => ({
  ...NONE,
  id,
  kind: 'stat',
  name,
  value,
});
const child = (
  id: string,
  name: string,
  figure: Record<string, unknown>,
  pose: string,
  signs: string[] = [],
): Cast => ({
  ...NONE,
  id,
  kind: 'person',
  name,
  figure,
  pose: pose as Cast['pose'],
  signs: signs as Cast['signs'],
});

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
  class CheckpointProofModule {}

  const app = await NestFactory.createApplicationContext(
    CheckpointProofModule,
    { logger: ['log', 'warn', 'error'] },
  );
  try {
    // Nothing written to the database; any call would be said here (none is made).
    const calls = app.get<{ record: (row: never) => Promise<void> }>(
      repos.AI_CALL_LOG_REPOSITORY,
    );
    calls.record = (row: { task: string; model: string }) => {
      console.log(`call ${row.task} on ${row.model}`);
      return Promise.resolve();
    };
    const settings = app.get<{ get: () => Promise<Record<string, unknown>> }>(
      repos.APP_SETTINGS_REPOSITORY,
    );
    const prior = await settings.get();
    settings.get = () => Promise.resolve({ ...prior, sceneVoice: 'kokoro' });
    const storage = app.get<StoragePort>(tokens.STORAGE);
    const scenes = app.get(SceneProcessor);

    const brief = studio.briefOf({
      format: 'explainer',
      idea: 'Why we have day and night, for kids of 8 to 11 who are new to it',
      who: { band: 'primary-upper', said: 'Kids (8–11)', prior: 'new' },
      minutes: 1.5,
      tone: 'calm',
    });
    const at = new Date();
    const showId = NAME;
    // The host: on for children, a new one (their first look, a person), as the worker adds them.
    const bible = withHost(
      studio.bibleOf({
        subject: 'science: day and night',
        pictures: [
          { name: 'Earth', is: 'the planet we live on', draw: 'a globe' },
          { name: 'Sun', is: 'our star', draw: 'a warm circle' },
        ],
      }),
      null,
      true,
      showId,
    ).bible;

    const outline = studio.outlineOf({
      title: 'Why do we have day and night?',
      logline: 'The Sun stays put; the Earth spins.',
      next: [
        'Why is it hot in summer and cold in winter?',
        'Why does the Moon change shape?',
        'What would happen if the Earth stopped spinning?',
      ],
      scenes: [
        {
          title: 'Where does the Sun go?',
          summary: 'The Sun stays put and the Earth spins.',
          seconds: 30,
          teach: 'The Sun does not move away at night. The Earth spins.',
          points: [
            'The Sun stays put: the Sun as a big warm light',
            'The Earth spins: one whole turn every day',
          ],
        },
        {
          title: 'The other side of the Earth',
          summary: 'One side has day while the other has night.',
          seconds: 30,
          teach: 'The side facing the Sun has day; the other side has night.',
          points: [
            'The day side faces the Sun',
            'The night side faces away',
            'Morning: our side turns into the light',
          ],
        },
        {
          title: 'Day and night around the world',
          summary: 'Somewhere it is always morning.',
          seconds: 30,
          teach: 'Half of the Earth always has day and half has night.',
          points: [
            'Somewhere children are waking up',
            'Half day, half night: the Earth spinning',
          ],
        },
      ],
    });

    const drafts: Draft[] = [
      {
        fit: 'good',
        fitReason: null,
        title: 'Where does the Sun go?',
        mood: 'curious',
        beats: [
          {
            say: 'Have you ever wondered where the Sun goes at night?',
            pause: 'long',
            delivery: 'hook',
          },
          {
            say: 'The Sun does not go anywhere.',
            pause: 'short',
            delivery: 'explain',
          },
          {
            say: 'It stays in the same place, like a big warm lamp.',
            pause: 'long',
            delivery: 'explain',
          },
          {
            say: 'It is our Earth that spins.',
            pause: 'short',
            delivery: 'key',
          },
          {
            say: 'It makes one whole turn every day.',
            pause: 'long',
            delivery: 'explain',
          },
        ],
        cast: [
          card('sun', 'The Sun stays put'),
          card('spin', 'The Earth spins'),
          stat('turn', 'one whole turn', '24 hours'),
        ],
        steps: [
          {
            beat: 0,
            phrase: 'where the Sun goes',
            layout: 'one',
            show: ['sun'],
            arrows: null,
            effects: null,
          },
          {
            beat: 3,
            phrase: 'Earth that spins',
            layout: 'row',
            show: ['sun', 'spin'],
            arrows: null,
            effects: null,
          },
          {
            beat: 4,
            phrase: 'one whole turn',
            layout: 'row',
            show: ['spin', 'turn'],
            arrows: null,
            effects: null,
          },
        ],
      },
      {
        fit: 'good',
        fitReason: null,
        title: 'The other side of the Earth',
        mood: 'curious',
        beats: [
          {
            say: 'The side of the Earth facing the Sun has day.',
            pause: 'short',
            delivery: 'key',
          },
          {
            say: 'The side facing away from the Sun has night.',
            pause: 'long',
            delivery: 'key',
          },
          {
            say: 'So when it is day where you live, what is it on the other side of the Earth?',
            pause: 'long',
            delivery: 'question',
            choices: [
              { text: 'Night', right: true },
              { text: 'Day as well', right: false },
              { text: 'Always dark', right: false },
            ],
          },
          {
            say: 'It is night there, because that side faces away from the Sun.',
            pause: 'long',
            delivery: 'explain',
          },
          {
            say: 'As the Earth turns, your side moves into the light, and that is morning.',
            pause: 'long',
            delivery: 'explain',
          },
        ],
        cast: [
          card('day', 'Day side'),
          card('night', 'Night side'),
          card('morning', 'Morning'),
        ],
        steps: [
          {
            beat: 0,
            phrase: 'facing the Sun has day',
            layout: 'one',
            show: ['day'],
            arrows: null,
            effects: null,
          },
          {
            beat: 1,
            phrase: 'has night',
            layout: 'compare',
            show: ['day', 'night'],
            arrows: null,
            effects: null,
          },
          {
            beat: 4,
            phrase: 'that is morning',
            layout: 'one',
            show: ['morning'],
            arrows: null,
            effects: null,
          },
        ],
      },
      {
        fit: 'good',
        fitReason: null,
        title: 'Day and night around the world',
        mood: 'bright',
        beats: [
          {
            say: 'Right now, somewhere in the world, children are waking up.',
            pause: 'short',
            delivery: 'hook',
          },
          {
            say: 'And somewhere else, children are going to bed.',
            pause: 'long',
            delivery: 'explain',
          },
          {
            say: 'Half of the Earth always has day, and half has night.',
            pause: 'long',
            delivery: 'key',
          },
          {
            say: 'So remember: the Earth spins, and that gives us day and night.',
            pause: 'long',
            delivery: 'recap',
          },
        ],
        cast: [
          child(
            'waker',
            'waking up',
            {
              age: 'child',
              hair: 'afro',
              top: 'pyjamas',
              topColour: 'yellow',
              skin: 7,
            },
            'arms up',
          ),
          child(
            'sleeper',
            'going to bed',
            {
              age: 'child',
              hair: 'pigtails',
              top: 'pyjamas',
              topColour: 'blue',
              skin: 3,
            },
            'in bed',
            ['sleeping'],
          ),
          card('half', 'Half day, half night'),
        ],
        steps: [
          {
            beat: 0,
            phrase: 'children are waking up',
            layout: 'one',
            show: ['waker'],
            arrows: null,
            effects: null,
          },
          {
            beat: 1,
            phrase: 'going to bed',
            layout: 'compare',
            show: ['waker', 'sleeper'],
            arrows: null,
            effects: null,
          },
          {
            beat: 2,
            phrase: 'Half of the Earth',
            layout: 'one',
            show: ['half'],
            arrows: null,
            effects: null,
          },
        ],
      },
    ];

    // Held as the worker holds them: the checks its audience spaces, the answers kept only there, the cold open.
    const who = profileOf(brief)!;
    const recipe = recipeFor(who);
    const checks = checksAt(outline.scenes, recipe, who);
    console.log(
      `checks every ${recipe.checkEvery}s: ${checks.map((c, k) => `s${k + 1} ${c ? 'asks' : '-'}`).join(', ')}`,
    );
    const sheets = drafts.map((draft, k) => {
      const kept = keepCheckpoint(
        studio.explainerSheetOf({
          kind: 'explainer',
          title: draft.title,
          draft,
        }),
        checks[k],
      );
      if (kept.problem)
        console.log(`s${k + 1}: would ride along: ${kept.problem.message}`);
      return kept.sheet;
    });
    const cold = coldOpen(sheets[0].draft.beats, recipe.wpm);
    console.log(`cold open: ${cold ? cold.message : 'opens on a question'}`);

    const show = {
      id: showId,
      userId: 'proof',
      title: 'Big Questions',
      format: 'explainer' as const,
      brief,
      bible,
      createdAt: at,
      updatedAt: at,
    };
    const episode = {
      id: NAME,
      showId,
      userId: 'proof',
      number: 1,
      title: outline.title,
      logline: outline.logline,
      phase: 'script' as const,
      busy: null,
      error: null,
      outline,
      shareToken: null,
      durationMs: null,
      thumbKey: null,
      createdAt: at,
      updatedAt: at,
    };
    const rows = sheets.map((sheet, position) => ({
      id: `${NAME}-s${position + 1}`,
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
    const theme = showTheme(brief, bible);
    for (const row of rows) {
      const of = studioMakeOf(show, episode, row, rows, bible);
      const made = await scenes.make({
        ...of,
        documentId: null,
        base: `proof/${row.id}`,
        who: `proof ${row.id}`,
        keepAs: row.id,
        theme: theme ?? undefined,
        reading: studioReading(brief),
      });
      if (made.fit === 'poor') throw new Error(made.reason);
      const dir = join(SCENES, row.id);
      mkdirSync(dir, { recursive: true });
      const scene =
        theme && theme !== 'paper' ? { ...made.scene, theme } : made.scene;
      writeFileSync(join(dir, 'scene.json'), JSON.stringify(scene));
      writeFileSync(
        join(dir, 'audio.mp3'),
        await storage.get(made.voice.audioKey),
      );
      writeFileSync(join(dir, 'thumb.png'), await storage.get(made.thumbKey));
      const asks = scene.beats.filter((b) => b.choices?.length).length;
      console.log(
        `${row.id}: "${scene.title}", ${Math.round(made.voice.durationMs / 100) / 10}s; ideas ${(scene.ideas ?? []).map((i) => `b${i.beat} "${i.label}"`).join(', ') || 'none'}; ${asks} question${asks === 1 ? '' : 's'} with answers → ${dir}`,
      );
    }
    // What the player is given beyond its scenes.
    const extras = explainerPlay(show, outline, sheets);
    writeFileSync(
      join(SCENES, `${NAME}-play.json`),
      JSON.stringify(
        {
          title: outline.title,
          showTitle: show.title,
          theme,
          ...extras,
          points: teachBackPoints(outline.scenes),
        },
        null,
        2,
      ),
    );
    console.log(
      `play: pauses ${extras.pauses}; host ${extras.host?.name} (${extras.host?.kind}); recap ${extras.recap?.map((c) => c.title).join(' | ')}; next ${extras.next?.length}; teach-back ${extras.teachBack}`,
    );
    // The host's three looks, as the choosing card shows them.
    const options = hostLooks(showId).map((one, k) => ({
      id: `look-${k + 1}`,
      look: one.look,
      drawing: optionPreview(
        {
          id: `look-${k + 1}`,
          ...(one.figure ? { figure: one.figure } : {}),
          ...(one.animal ? { animal: one.animal } : {}),
        },
        'host',
      ),
    }));
    writeFileSync(
      join(SCENES, `${NAME}-host.json`),
      JSON.stringify({ name: bible.characters[0].name, options }, null, 2),
    );
    console.log(`host looks: ${options.map((o) => o.look).join(' | ')}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
