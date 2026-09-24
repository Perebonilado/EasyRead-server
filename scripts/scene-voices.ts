/**
 * One page's narration in a line-up of voices, for choosing Visualize's
 * voice by ear, blind:
 *
 *   npm run scene:voices -- <documentId> <page> [--voices "a;b;c"] [--out <dir>]
 *
 * The page is scripted once by the real writer, then said by each voice
 * with the same delivery (each sentence's pace and silence, and for a
 * voice that takes direction, its few words of it). `kokoro-flat:` is
 * the voice as it was, one pace and two pauses, to hear what the
 * delivery adds. Gemini voices need GEMINI_API_KEY and are skipped
 * without it.
 *
 * Writes an mp3 a voice and an index.html that plays them as A, B, C in
 * a shuffled order, with the names revealed on a click (scene-out/voices
 * by default). Nothing here touches a page's row.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { sceneSpoken } from '../src/business/domain/scene-timing';
import {
  deliveryPieces,
  voiceSlug,
  voiceStyle,
} from '../src/business/domain/scene-voice';
import { spokenForm } from '../src/business/domain/spoken';
import type { SpeechPort } from '../src/business/ports/voice.port';
import {
  GEMINI_TTS_DEFAULT_MODEL,
  GeminiSpeechAdapter,
} from '../src/web/adapters/gemini-speech.adapter';
import {
  KOKORO_HOME,
  ModalSpeechAdapter,
} from '../src/web/adapters/modal-speech.adapter';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor],
})
class SceneVoicesModule {}

/** Today's voice first (as it was, then with delivery), then Kokoro's best, then Gemini's narrators. */
const LINE_UP = [
  'kokoro-flat:am_puck',
  'kokoro:am_puck',
  'kokoro:af_heart',
  'kokoro:af_bella',
  'kokoro:af_heart,af_bella',
  'kokoro:am_michael',
  'kokoro:am_fenrir',
  'kokoro:bf_emma',
  'gemini:Sulafat',
  'gemini:Sadachbia',
  'gemini:Achird',
  'gemini:Puck',
];

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** How a voice is named to a listener once revealed. */
function named(entry: string): string {
  const [engine, voice] = entry.split(/:(.*)/s);
  if (engine === 'kokoro-flat') return `Kokoro ${voice}, as it was (one pace)`;
  if (engine === 'gemini') return `Gemini ${voice}`;
  return `Kokoro ${voice.replace(',', ' + ')}`;
}

function page(input: {
  title: string;
  narration: string[];
  takes: { letter: string; file: string; name: string; seconds: number }[];
}): string {
  const cards = input.takes
    .map(
      (take) => `<article class="take">
  <div class="letter">${take.letter}</div>
  <audio controls preload="none" src="${escape(take.file)}"></audio>
  <label>Liveliness <select><option></option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join('')}</select></label>
  <p class="name" hidden>${escape(take.name)} · ${take.seconds.toFixed(0)} s</p>
</article>`,
    )
    .join('\n');
  return `<meta charset="utf-8">
<title>Which voice?</title>
<style>
:root{--ground:#FBF7EF;--ink:#1F2A37;--muted:#5B6675;--accent:#E0663A;--card:#fff;--edge:#E4DCCB;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#141922;--ink:#EEF1F5;--muted:#9AA5B4;--card:#1C2330;--edge:#2C3545;color-scheme:dark}}
:root[data-theme="dark"]{--ground:#141922;--ink:#EEF1F5;--muted:#9AA5B4;--card:#1C2330;--edge:#2C3545;color-scheme:dark}
body{background:var(--ground);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:24px 16px}
main{max-width:880px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}
p.lede{color:var(--muted);margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.take{background:var(--card);border:1px solid var(--edge);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px}
.letter{font-size:28px;font-weight:700;color:var(--accent)}
audio{width:100%}
label{font-size:13px;color:var(--muted);display:flex;gap:8px;align-items:center}
.name{margin:0;font-weight:600}
button{font:inherit;font-weight:600;background:var(--accent);color:#fff;border:0;border-radius:999px;padding:10px 18px;cursor:pointer;margin:20px 0}
details{margin-top:8px;color:var(--muted)}
</style>
<main>
<h1>Which voice sounds most alive?</h1>
<p class="lede">The same page, "${escape(input.title)}", said by ${input.takes.length} voices in a shuffled order. Listen, rate each, then reveal.</p>
<div class="grid">${cards}</div>
<button id="reveal" type="button">Reveal the voices</button>
<details><summary>What they are saying</summary><ol>${input.narration.map((s) => `<li>${escape(s)}</li>`).join('')}</ol></details>
</main>
<script>
document.getElementById('reveal').addEventListener('click', () => {
  for (const name of document.querySelectorAll('.name')) name.hidden = false;
});
</script>`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const positional = args.filter(
    (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'),
  );
  const [documentId, pageText] = positional;
  const pageNumber = Number(pageText);
  if (!documentId || !Number.isInteger(pageNumber) || pageNumber < 1) {
    console.error(
      'npm run scene:voices -- <documentId> <page> [--voices "kokoro:af_heart;gemini:Sulafat"] [--out <dir>]',
    );
    process.exit(2);
  }
  const lineUp = (option('--voices') ?? LINE_UP.join(';'))
    .split(';')
    .flatMap((entry) => (entry.includes(':') ? [entry.trim()] : []));
  const out = resolve(
    option('--out') ??
      join('scene-out', 'voices', `${documentId}-p${pageNumber}`),
  );
  mkdirSync(out, { recursive: true });

  const app = await NestFactory.createApplicationContext(SceneVoicesModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const config = app.get(ConfigService);
    const script = await app
      .get(SceneProcessor)
      .scriptFor(documentId, pageNumber);
    const forms = script.beats.map((beat) => spokenForm(beat.say, new Map()));
    const spoken = sceneSpoken(forms);
    const delivered = deliveryPieces(script.beats);
    const kokoro = new ModalSpeechAdapter(config, KOKORO_HOME);
    const gemini = config.get<string>('GEMINI_API_KEY')
      ? new GeminiSpeechAdapter(config)
      : null;
    console.log(
      `"${script.title}" (${script.mood}): ${script.beats.map((b) => b.delivery).join(', ')}`,
    );

    const takes: { file: string; name: string; seconds: number }[] = [];
    for (const entry of lineUp) {
      const [engine, voice] = entry.split(/:(.*)/s);
      const flat = engine === 'kokoro-flat';
      const speaker: SpeechPort | null =
        engine === 'gemini'
          ? gemini
          : engine.startsWith('kokoro')
            ? kokoro
            : null;
      if (!speaker) {
        console.warn(
          `${entry}: skipped (${engine === 'gemini' ? 'no GEMINI_API_KEY' : 'unknown engine'})`,
        );
        continue;
      }
      const started = Date.now();
      try {
        const said = await speaker.synthesize({
          text: spoken.text,
          voice,
          speed: 1,
          pieces: forms.map((form, i) => ({
            text: form.text,
            // As it was: one pace, and 0.35 s or 0.8 s after every sentence.
            speed: flat ? 1 : delivered[i].speed,
            pauseAfter: flat
              ? script.beats[i].pause === 'long'
                ? 0.8
                : 0.35
              : delivered[i].pauseAfter,
            style: voiceStyle(script.mood, script.beats[i].delivery),
          })),
        });
        const file = `${engine}-${voiceSlug(voice)}.mp3`;
        writeFileSync(join(out, file), said.audio);
        const seconds = (said.durationMs ?? 0) / 1000;
        takes.push({ file, name: named(entry), seconds });
        console.log(
          `${entry}: ${seconds.toFixed(1)} s of audio in ${((Date.now() - started) / 1000).toFixed(1)} s${engine === 'gemini' ? ` (${config.get<string>('GEMINI_TTS_MODEL') || GEMINI_TTS_DEFAULT_MODEL})` : ''}`,
        );
      } catch (error) {
        console.warn(`${entry}: failed: ${(error as Error).message}`);
      }
    }

    // Shuffled, so the letters say nothing of which is which.
    const shuffled = takes
      .map((take) => ({ take, key: Math.random() }))
      .sort((a, b) => a.key - b.key)
      .map(({ take }, i) => ({ ...take, letter: String.fromCharCode(65 + i) }));
    writeFileSync(
      join(out, 'index.html'),
      page({
        title: script.title,
        narration: script.beats.map((b) => b.say),
        takes: shuffled,
      }),
    );
    console.log(`${takes.length} voices → ${join(out, 'index.html')}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
