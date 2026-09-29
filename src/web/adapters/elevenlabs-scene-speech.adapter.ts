import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SpeechPort, VoiceOption } from '../../business/ports/voice.port';
import { pcmMs, readPcm16 } from '../../business/domain/wav';
import { ELEVENLABS_NARRATOR } from '../../business/domain/scene-voice';
import { encodeMp3 } from './audio/mp3';

const API = 'https://api.elevenlabs.io';
/**
 * Eleven v3: the only model ElevenLabs' Text to Dialogue speaks with, the
 * one it recommends for characters talking to each other, and the one
 * that takes direction as audio tags ("[whispers]") inside the words.
 */
export const ELEVENLABS_SCENE_MODEL = 'eleven_v3';
/** The audio asked for: raw 16-bit samples, so the silences are made here. */
const RATE = 24000;
/** ElevenLabs asks for at most 2,000 characters a dialogue request: kept under. */
const DIALOGUE_CHARS = 1800;
/** A busy account or a 5xx is worth trying again; a refusal is not. */
const ATTEMPTS = 6;
/** A request is seconds of work for the voice. */
const REQUEST_MS = 3 * 60_000;
/** How long the account's list of voices is trusted, for the admin page. */
const CATALOGUE_MS = 10 * 60_000;

/**
 * ElevenLabs limits requests in flight, not requests a minute (three at
 * once on pay as you go, more on a plan). Every adapter in the process
 * shares one gate, so scenes made side by side wait their turn rather
 * than being turned away; the limit is what ElevenLabs says it is
 * (`maximum-concurrent-requests`), or ELEVENLABS_CONCURRENCY.
 */
const gate = { running: 0, learned: 0, waiting: [] as (() => void)[] };

async function enter(limit: number): Promise<void> {
  while (gate.running >= Math.max(1, limit))
    await new Promise<void>((resolve) => gate.waiting.push(resolve));
  gate.running += 1;
}

function leave(): void {
  gate.running = Math.max(0, gate.running - 1);
  gate.waiting.shift()?.();
}

/** For tests: the gate as it is, and back to nothing learned. */
export const elevenLabsGate = {
  running: () => gate.running,
  reset: () => {
    gate.running = 0;
    gate.learned = 0;
    gate.waiting.splice(0).forEach((resolve) => resolve());
  },
};

/**
 * The tags Eleven v3 is known to act on and never say, in the order they
 * are looked for in a direction: the first that fits wins. A direction is
 * never sent in words (the voice would read it); only one of these is.
 */
const TAGS: [RegExp, string][] = [
  [/\b(?:whisper|hushed|quietly|not aloud)/, 'whispers'],
  [/\b(?:shout|yell|roar|bellow|scream)/, 'shouting'],
  [/\b(?:angry|anger|furious|cross|enraged|rage|fierce)/, 'angry'],
  [/\b(?:sad|grie|sorrow|mourn|tearful|lonely|heartbroken)/, 'sad'],
  [
    /\b(?:afraid|scared|frighten|fear|nervous|timid|shy|worried|anxious)/,
    'nervous',
  ],
  [/\b(?:surpris|astonish|amaz|shock)/, 'surprised'],
  [/\b(?:mischiev|cheeky|sly|trick)/, 'mischievously'],
  [/\b(?:sarcas|mock|scorn|sneer)/, 'sarcastic'],
  [/\b(?:excit|eager|energetic|enthusias|thrill)/, 'excited'],
  [/\b(?:cheerful|bright|upbeat|playful|happy|joy|smil|jolly|glad)/, 'happy'],
  [/\b(?:curious|wonder|inquisitive)/, 'curious'],
  [/\b(?:serious|sober|stern|solemn|grave)/, 'serious'],
  [/\b(?:thought|wise|far away|dream|remember)/, 'thoughtful'],
  [/\b(?:calm|unhurried|gentle|patient|steady|deep)/, 'calm'],
];
const TONE_TAG = { whisper: 'whispers', shout: 'shouting' } as const;

/**
 * A piece's direction as Eleven v3's audio tags: its tone (a whisper, a
 * shout) and the one feeling its direction names first. The direction's
 * own words are never sent: not the character's name ("as Joy, …" is not
 * a feeling), not a term it stresses ("stressing "sad""), only a tag from
 * the list above, which v3 acts on and does not say.
 */
export function audioTags(
  style?: string,
  tone?: 'whisper' | 'shout',
): string[] {
  const said = (style ?? '')
    .toLowerCase()
    .replace(/^as [^,]*,/, '')
    .replace(/"[^"]*"|“[^”]*”/g, '');
  const tags: string[] = tone ? [TONE_TAG[tone]] : [];
  const feeling = TAGS.find(([words]) => words.test(said))?.[1];
  if (feeling && !tags.includes(feeling)) tags.push(feeling);
  return tags.slice(0, 2);
}

/** A sentence as the port hands it over; v3 takes no speed, so `speed` goes unsaid. */
type Piece = {
  text: string;
  pauseAfter: number;
  speed?: number;
  style?: string;
  voice?: string;
  tone?: 'whisper' | 'shout';
};

/** One line of a dialogue request, and how much of its text is tags. */
export interface DialogueLine {
  text: string;
  voice_id: string;
  /** Characters of tags before the words. */
  tagged: number;
  piece: Piece;
}

/**
 * The pieces as dialogue requests: a line each, in its speaker's voice,
 * its tags before its words; a new request where the next line would
 * pass ElevenLabs' size. A square bracket in the words would be taken for
 * a tag and not said: it is sent as a round one.
 */
export function dialogueRequests(
  pieces: Piece[],
  narrator: string,
): DialogueLine[][] {
  const requests: DialogueLine[][] = [];
  let size = 0;
  for (const piece of pieces) {
    const words = piece.text.trim().replace(/\[/g, '(').replace(/\]/g, ')');
    if (!words) continue;
    const tags = audioTags(piece.style, piece.tone)
      .map((tag) => `[${tag}]`)
      .join(' ');
    const text = tags ? `${tags} ${words}` : words;
    const line: DialogueLine = {
      text,
      voice_id: piece.voice?.trim() || narrator,
      tagged: text.length - words.length,
      piece,
    };
    const last = requests[requests.length - 1];
    if (last && size + text.length <= DIALOGUE_CHARS) {
      last.push(line);
      size += text.length;
    } else {
      requests.push([line]);
      size = text.length;
    }
  }
  return requests;
}

/**
 * The same seed for the same lines in the same voices, so a scene made
 * again sounds as it did.
 */
export function seedOf(lines: { text: string; voice_id: string }[]): number {
  let hash = 5381;
  for (const char of JSON.stringify(lines.map((l) => [l.text, l.voice_id])))
    hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash;
}

/** A dialogue request's answer, as `with-timestamps` gives it. */
export interface DialogueAnswer {
  audio_base64?: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  } | null;
  voice_segments?: {
    start_time_seconds: number;
    end_time_seconds: number;
    character_start_index: number;
    character_end_index: number;
    dialogue_input_index: number;
  }[];
}

/** Where a line's words are said, in samples, and each word's. */
export interface SpokenLine {
  start: number;
  end: number;
  words: { text: string; start: number; end: number }[];
}

const SAID = /[\p{L}\p{N}]/u;

/**
 * Where each line of a request is said, from ElevenLabs' own times: its
 * first word to its last (never its tags, which take time and are silent),
 * and each word. Null where a line has no segment: then the request's
 * audio is taken as one.
 */
export function spokenLines(
  answer: DialogueAnswer,
  lines: DialogueLine[],
  rate: number,
): SpokenLine[] | null {
  const at = (seconds: number) => Math.round(seconds * rate);
  const align = answer.alignment;
  const out: SpokenLine[] = [];
  for (const [i, line] of lines.entries()) {
    const segments = (answer.voice_segments ?? []).filter(
      (segment) => segment.dialogue_input_index === i,
    );
    if (!segments.length) return null;
    const from = Math.min(...segments.map((s) => s.character_start_index));
    const start = Math.min(...segments.map((s) => s.start_time_seconds));
    const end = Math.max(...segments.map((s) => s.end_time_seconds));
    // Its words' times, when ElevenLabs timed the very characters sent.
    const timed =
      align &&
      align.characters.slice(from, from + line.text.length).join('') ===
        line.text &&
      align.character_start_times_seconds.length === align.characters.length;
    if (!timed) {
      out.push({ start: at(start), end: at(end), words: [] });
      continue;
    }
    const startOf = (k: number) =>
      at(align.character_start_times_seconds[from + k]);
    const endOf = (k: number) =>
      at(align.character_end_times_seconds[from + k]);
    const words: SpokenLine['words'] = [];
    for (const match of line.text.slice(line.tagged).matchAll(/\S+/g)) {
      const a = line.tagged + match.index;
      const letters = [...match[0]]
        .map((char, k) => (SAID.test(char) ? a + k : -1))
        .filter((k) => k >= 0);
      if (!letters.length) continue;
      words.push({
        text: match[0],
        start: startOf(letters[0]),
        end: endOf(letters[letters.length - 1]),
      });
    }
    out.push(
      words.length
        ? { start: words[0].start, end: words[words.length - 1].end, words }
        : { start: at(start), end: at(end), words },
    );
  }
  return out;
}

/** Frames the quiet is looked for in, in ms. */
const FRAME_MS = 10;

/** The quietest point between two, in samples: where a silence is let in. */
function quietest(samples: Int16Array, a: number, b: number, rate: number) {
  const frame = Math.max(1, Math.round((rate * FRAME_MS) / 1000));
  if (b - a < frame) return Math.round((a + b) / 2);
  let best = a;
  let least = Infinity;
  for (let f = a; f + frame <= b; f += frame) {
    let sum = 0;
    for (let i = f; i < f + frame; i += 1) sum += samples[i] * samples[i];
    if (sum < least) {
      least = sum;
      best = f + Math.round(frame / 2);
    }
  }
  return best;
}

/** Each 10 ms frame's loudness, and the level under which a frame is silent. */
function frames(samples: Int16Array, rate: number) {
  const frame = Math.max(1, Math.round((rate * FRAME_MS) / 1000));
  const level: number[] = [];
  for (let f = 0; f + frame <= samples.length; f += frame) {
    let sum = 0;
    for (let i = f; i < f + frame; i += 1) sum += samples[i] * samples[i];
    level.push(Math.sqrt(sum / frame));
  }
  return { frame, level, floor: Math.max(0, ...level) * SILENT_SHARE };
}

/** The longest stretch of true silence between two points, in samples. */
function silentRun(
  heard: ReturnType<typeof frames>,
  a: number,
  b: number,
): [number, number] | null {
  const { frame, level, floor } = heard;
  let best: [number, number] | null = null;
  let run = -1;
  for (let f = Math.ceil(a / frame); f <= Math.floor(b / frame); f += 1) {
    const silent =
      f < level.length && (f + 1) * frame <= b && level[f] <= floor;
    if (silent && run < 0) run = f;
    if ((!silent || f === Math.floor(b / frame)) && run >= 0) {
      const end = silent ? f + 1 : f;
      if (!best || end * frame - run * frame > best[1] - best[0])
        best = [run * frame, end * frame];
      run = -1;
    }
  }
  return best;
}

/** Quieter than this share of the loudest frame is silence: what v3 leaves while it reads its tags. */
const SILENT_SHARE = 0.01;
/** Silence kept either side of where some is taken out, in seconds. */
const KEEP_S = 0.04;

/**
 * The audio with each line's silence as the page asked for it. The quiet
 * the voice left between two lines is made up to the first's pause, let in
 * at its quietest; where it left more (v3 is silent while it reads a tag,
 * and between speakers it takes its time), the true silence in it is
 * shortened to the pause, never into a breath or a word. After the last
 * line, the quiet it ends on is made up to its pause, where the scene's
 * last moments play. Also where each quiet now lies, and how far each line
 * moved.
 */
export function withSilences(
  samples: Int16Array,
  rate: number,
  lines: { start: number; end: number }[],
  pauses: number[],
): { samples: Int16Array; quiet: [number, number][]; moved: number[] } {
  const parts: Int16Array[] = [];
  const quiet: [number, number][] = [];
  const moved: number[] = [];
  const heard = frames(samples, rate);
  const keep = Math.round(KEEP_S * rate);
  let from = 0;
  let added = 0;
  lines.forEach((line, i) => {
    moved.push(added);
    const wanted = Math.round(Math.max(0, pauses[i] ?? 0) * rate);
    const next = lines[i + 1];
    if (next) {
      const a = Math.min(line.end, samples.length);
      const b = Math.max(a, Math.min(next.start, samples.length));
      const more = wanted - (b - a);
      if (more > 0) {
        quiet.push([a + added, b + added + more]);
        const cut = quietest(samples, a, b, rate);
        parts.push(samples.subarray(from, cut), new Int16Array(more));
        from = cut;
        added += more;
        return;
      }
      // Too much quiet: some of its silence taken out, from the middle.
      const run = silentRun(heard, a, b);
      const less = run
        ? Math.min(-more, Math.max(0, run[1] - run[0] - 2 * keep))
        : 0;
      quiet.push([a + added, b + added - less]);
      if (!less || !run) return;
      const middle = Math.round((run[0] + run[1]) / 2);
      const cutFrom = middle - Math.floor(less / 2);
      parts.push(samples.subarray(from, cutFrom));
      from = cutFrom + less;
      added -= less;
      return;
    }
    const a = Math.min(line.end, samples.length);
    const more = Math.max(0, wanted - (samples.length - a));
    quiet.push([a + added, samples.length + added + more]);
    parts.push(samples.subarray(from), new Int16Array(more));
    from = samples.length;
    added += more;
  });
  if (from < samples.length) parts.push(samples.subarray(from));
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return { samples: out, quiet, moved };
}

/** Where the voice is heard at all in a stretch of audio: its first and last loud sample. */
function heard(samples: Int16Array): { start: number; end: number } {
  let loudest = 0;
  for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));
  const floor = loudest * 0.04;
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) <= floor)
    start += 1;
  let end = samples.length;
  while (end > start && Math.abs(samples[end - 1]) <= floor) end -= 1;
  return { start, end };
}

/** ElevenLabs' own words for what was wrong, and its code for it. */
export function detailIn(body: string): { code: string; message: string } {
  try {
    const parsed = JSON.parse(body) as {
      detail?: string | { status?: string; message?: string } | unknown[];
    };
    const detail = parsed?.detail;
    if (typeof detail === 'string') return { code: '', message: detail };
    if (detail && !Array.isArray(detail) && typeof detail === 'object')
      return {
        code: detail.status ?? '',
        message: (detail.message ?? detail.status ?? '').slice(0, 240),
      };
    if (Array.isArray(detail))
      return { code: 'invalid', message: JSON.stringify(detail).slice(0, 240) };
  } catch {
    // not JSON: the body is the reason
  }
  return { code: '', message: body.slice(0, 240) };
}

/**
 * Visualize's voice on ElevenLabs: chosen on the admin page (or with
 * SCENE_VOICE_ENGINE=elevenlabs) once ELEVENLABS_API_KEY is set.
 *
 * A page is one Text to Dialogue request on Eleven v3 (more, a page past
 * 1,800 characters): each sentence a line in its speaker's voice, the
 * narrator's or a character's, its direction as audio tags, never words.
 * It is asked `with-timestamps`, so ElevenLabs says where each line and
 * each word is, and the page needs no aligner. The silences are made here,
 * at the quiet between two lines, as the page asks: v3 takes no pause
 * marks. The answer is raw audio, encoded to mp3 here like Gemini's.
 */
@Injectable()
export class ElevenLabsSceneSpeechAdapter implements SpeechPort {
  private readonly logger = new Logger(ElevenLabsSceneSpeechAdapter.name);
  private listed: { at: number; voices: VoiceOption[] } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly encode: (
      samples: Int16Array,
      sampleRate: number,
    ) => Promise<Buffer> = encodeMp3,
    private readonly send: typeof fetch = (...args: Parameters<typeof fetch>) =>
      fetch(...args),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  label(): { model: string; voice: string } {
    return {
      model:
        this.config.get<string>('ELEVENLABS_SCENE_MODEL')?.trim() ||
        ELEVENLABS_SCENE_MODEL,
      voice:
        this.config.get<string>('ELEVENLABS_NARRATOR_VOICE')?.trim() ||
        ELEVENLABS_NARRATOR,
    };
  }

  private key(): string {
    const key = this.config.get<string>('ELEVENLABS_API_KEY')?.trim();
    if (!key)
      throw refused(
        401,
        'No ElevenLabs key is set (ELEVENLABS_API_KEY): Visualize cannot use the ElevenLabs voice',
      );
    return key;
  }

  /** How many requests at once: the setting, else what ElevenLabs said, else two. */
  private limit(): number {
    const set = Number(this.config.get<string>('ELEVENLABS_CONCURRENCY'));
    if (Number.isFinite(set) && set > 0) return Math.floor(set);
    return gate.learned || 2;
  }

  async synthesize({
    text,
    voice,
    pieces,
    lead,
    timestamps,
  }: {
    text: string;
    voice?: string;
    pieces?: Piece[];
    lead?: number;
    timestamps?: boolean;
  }): Promise<{
    audio: Buffer;
    mimeType: string;
    model: string;
    durationMs: number;
    silencesMs: [number, number][];
    pieceStartsMs?: number[];
    words?: { text: string; startMs: number; endMs: number }[];
    characters: number;
  }> {
    const key = this.key();
    const { model } = this.label();
    const narrator = voice?.trim() || this.label().voice;
    const given: Piece[] = pieces?.length ? pieces : [{ text, pauseAfter: 0 }];
    const requests = dialogueRequests(given, narrator);
    if (!requests.length) throw refused(400, 'There is nothing to say');
    const stability = Number(
      this.config.get<string>('ELEVENLABS_STABILITY') ?? '0.5',
    );
    const answers = await Promise.all(
      requests.map((lines) =>
        this.ask(key, {
          inputs: lines.map(({ text: said, voice_id }) => ({
            text: said,
            voice_id,
          })),
          model_id: model,
          // Natural: steady in the voice, and still acting on the tags.
          settings: { stability: Number.isFinite(stability) ? stability : 0.5 },
          seed: seedOf(lines),
        }),
      ),
    );
    // The requests' audio end to end, and where each line is said in it.
    const raws: Int16Array[] = [];
    const spans: SpokenLine[] = [];
    const lines: DialogueLine[] = [];
    let offset = 0;
    let exact = true;
    let characters = 0;
    for (const [k, { answer, characters: cost }] of answers.entries()) {
      if (!answer.audio_base64)
        throw new Error('The ElevenLabs voice sent no audio');
      const pcm = readPcm16(Buffer.from(answer.audio_base64, 'base64'), RATE);
      if (!pcm.samples.length)
        throw new Error('The ElevenLabs voice sent silence');
      characters +=
        cost ?? requests[k].reduce((n, line) => n + line.text.length, 0);
      const found = spokenLines(answer, requests[k], RATE);
      if (found)
        found.forEach((one, i) => {
          spans.push({
            start: one.start + offset,
            end: one.end + offset,
            words: one.words.map((word) => ({
              ...word,
              start: word.start + offset,
              end: word.end + offset,
            })),
          });
          lines.push(requests[k][i]);
          if (!one.words.length) exact = false;
        });
      else {
        // No times for its lines: the request is one line, its last pause after it.
        const whole = heard(pcm.samples);
        spans.push({
          start: whole.start + offset,
          end: whole.end + offset,
          words: [],
        });
        lines.push(requests[k][requests[k].length - 1]);
        exact = false;
        this.logger.warn(
          'ElevenLabs gave no times for its lines: the page is timed by the aligner',
        );
      }
      raws.push(pcm.samples);
      offset += pcm.samples.length;
    }
    const raw = new Int16Array(offset);
    let at = 0;
    for (const part of raws) {
      raw.set(part, at);
      at += part.length;
    }
    const paused = withSilences(
      raw,
      RATE,
      spans,
      lines.map((line) => line.piece.pauseAfter),
    );
    // Quiet before the first word, when the page opens on the stage alone.
    const before = lead && lead > 0 ? Math.round(lead * RATE) : 0;
    const samples = new Int16Array(before + paused.samples.length);
    samples.set(paused.samples, before);
    const ms = (sample: number) => Math.round((sample / RATE) * 1000);
    const silencesMs = [
      ...(before ? [[0, before] as [number, number]] : []),
      ...paused.quiet.map(([a, b]): [number, number] => [
        a + before,
        b + before,
      ]),
    ].map(([a, b]): [number, number] => [ms(a), ms(b)]);
    const moved = (i: number, sample: number) =>
      ms(sample + paused.moved[i] + before);
    return {
      audio: await this.encode(samples, RATE),
      mimeType: 'audio/mpeg',
      model: `elevenlabs:${model}`,
      durationMs: pcmMs({ samples, sampleRate: RATE }),
      silencesMs,
      ...(exact
        ? {
            pieceStartsMs: spans.map((span, i) => moved(i, span.start)),
            ...(timestamps
              ? {
                  words: spans.flatMap((span, i) =>
                    span.words.map((word) => ({
                      text: word.text,
                      startMs: moved(i, word.start),
                      endMs: moved(i, word.end),
                    })),
                  ),
                }
              : {}),
          }
        : {}),
      characters,
    };
  }

  /**
   * One dialogue request, tried again while the account is busy (a 429:
   * too many at once, or ElevenLabs' own load), on a 5xx or a dropped
   * connection, waiting longer each time, or as long as ElevenLabs says.
   * A refusal (any other 4xx: no credit, a voice not found) is thrown at
   * once with its status, which the worker reads as permanent.
   */
  private async ask(
    key: string,
    body: Record<string, unknown>,
  ): Promise<{ answer: DialogueAnswer; characters: number | null }> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      let wait = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
      await enter(this.limit());
      try {
        const response = await this.send(
          `${API}/v1/text-to-dialogue/with-timestamps?output_format=pcm_${RATE}`,
          {
            method: 'POST',
            headers: { 'xi-api-key': key, 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_MS),
          },
        );
        const most = Number(
          response.headers.get('maximum-concurrent-requests'),
        );
        if (Number.isFinite(most) && most > 0) gate.learned = Math.floor(most);
        if (response.ok) {
          const cost = Number(response.headers.get('character-cost'));
          return {
            answer: (await response.json()) as DialogueAnswer,
            characters: Number.isFinite(cost) && cost > 0 ? cost : null,
          };
        }
        const { code, message } = detailIn(await response.text());
        const reason = `${code ? `${code}: ` : ''}${message}`;
        if (response.status === 429) {
          const after = Number(response.headers.get('retry-after'));
          if (Number.isFinite(after) && after > 0)
            wait = Math.min(60_000, after * 1000);
          throw new Error(`The ElevenLabs voice is busy: ${reason}`);
        }
        if (response.status >= 400 && response.status < 500)
          throw refused(
            response.status,
            response.status === 401 || response.status === 403
              ? `The ElevenLabs voice refused our key: ${reason}`
              : `The ElevenLabs voice refused the page (${response.status}): ${reason}`,
          );
        throw new Error(
          `The ElevenLabs voice answered ${response.status}: ${reason}`,
        );
      } catch (error) {
        lastError = named(error);
        if (isRefusal(lastError)) throw lastError;
        this.logger.warn(
          `attempt ${attempt} of ${ATTEMPTS} failed: ${lastError.message}`,
        );
      } finally {
        leave();
      }
      if (attempt < ATTEMPTS)
        await this.sleep(wait + Math.round(Math.random() * 250));
    }
    throw lastError ?? new Error('The ElevenLabs voice did not answer');
  }

  /**
   * The account's voices, ElevenLabs' premade ones and any added to it
   * from the Voice Library: for the admin page to choose from.
   */
  async catalogue(): Promise<VoiceOption[]> {
    if (this.listed && Date.now() - this.listed.at < CATALOGUE_MS)
      return this.listed.voices;
    const key = this.key();
    const voices: VoiceOption[] = [];
    let token: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const response = await this.send(
        `${API}/v2/voices?page_size=100${token ? `&next_page_token=${encodeURIComponent(token)}` : ''}`,
        {
          headers: { 'xi-api-key': key },
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok) {
        const { message } = detailIn(await response.text());
        throw new Error(
          `ElevenLabs would not list its voices (${response.status}): ${message}`,
        );
      }
      const body = (await response.json()) as {
        voices?: {
          voice_id: string;
          name?: string;
          description?: string | null;
          preview_url?: string | null;
          labels?: Record<string, string>;
        }[];
        has_more?: boolean;
        next_page_token?: string | null;
      };
      for (const one of body.voices ?? []) {
        const [name, ...about] = (one.name ?? one.voice_id).split(' - ');
        const labels = one.labels ?? {};
        voices.push({
          id: one.voice_id,
          name: name.trim(),
          description: [
            about.join(' - ').trim(),
            ...[labels.gender, labels.age, labels.accent]
              .filter(Boolean)
              .map((label) => label.replace(/_/g, ' ')),
          ]
            .filter(Boolean)
            .join(', '),
          previewUrl: one.preview_url ?? null,
        });
      }
      token = body.has_more ? (body.next_page_token ?? null) : null;
      if (!token) break;
    }
    voices.sort((a, b) => a.name.localeCompare(b.name));
    this.listed = { at: Date.now(), voices };
    return voices;
  }
}

/** An error the worker will not retry: it carries the 4xx status ElevenLabs answered with. */
function refused(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

const isRefusal = (error: Error): boolean => {
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500;
};

/** A timeout or a dropped connection, said plainly. */
function named(error: unknown): Error {
  const raised = error as Error & { cause?: { code?: string } };
  if (raised?.name === 'TimeoutError' || raised?.name === 'AbortError')
    return new Error('The ElevenLabs voice did not answer in time');
  if (raised?.message === 'fetch failed' && raised.cause)
    return new Error(
      `Could not reach the ElevenLabs voice: ${raised.cause.code ?? 'unknown cause'}`,
    );
  return raised instanceof Error ? raised : new Error(String(error));
}
