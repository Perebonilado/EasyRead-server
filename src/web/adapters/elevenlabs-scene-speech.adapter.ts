import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LibraryVoice,
  SpeechPort,
  VoiceOption,
} from '../../business/ports/voice.port';
import { pcmMs, readPcm16 } from '../../business/domain/wav';
import {
  ELEVENLABS_DEFAULT_MODEL,
  ELEVENLABS_NARRATOR,
  elevenLabsStandIn,
  isElevenLabsPremade,
  isV4Model,
} from '../../business/domain/scene-voice';
import { TEMPO_RANGE } from '../../business/domain/scene-pace';
import { encodeMp3 } from './audio/mp3';
import {
  noticeRecovered,
  noticeRetry,
} from '../../business/domain/work-progress';

const API = 'https://api.elevenlabs.io';
/**
 * The model a page is voiced with when neither the admin nor
 * ELEVENLABS_SCENE_MODEL names one: Eleven v4, ElevenLabs' most emotive,
 * on the same Text to Dialogue endpoint as v3. A request with timestamps
 * on v4 was checked on 2026-09-30 and came back timed, line by line and
 * character by character, its tags among the characters as on v3.
 */
export const ELEVENLABS_SCENE_MODEL = ELEVENLABS_DEFAULT_MODEL;
/** The audio asked for: raw 16-bit samples, so the silences are made here. */
const RATE = 24000;
/** ElevenLabs asks for at most 2,000 characters a dialogue request: kept under. */
const DIALOGUE_CHARS = 1800;
/** v4's continuity: the words either side of a request, at most this many characters. */
const CONTEXT_CHARS = 100;
/** v4's continuity: the requests before a request, at most this many. */
const CONTEXT_REQUESTS = 3;
/** A busy account or a 5xx is worth trying again; a refusal is not. */
const ATTEMPTS = 6;
/** A request is seconds of work for the voice. */
const REQUEST_MS = 3 * 60_000;
/** How long the account's list of voices is trusted, for the admin page and the cast check. */
const CATALOGUE_MS = 10 * 60_000;

/**
 * Requests in flight each plan allows on v2, v3 and v4 (ElevenLabs'
 * models page, 2026-09-30); Flash and Turbo allow twice as many.
 * ELEVENLABS_PLAN names the account's, for the limit before ElevenLabs
 * has said it and for the words when it is reached.
 */
export const PLAN_CONCURRENCY: Record<string, number> = {
  free: 2,
  starter: 3,
  creator: 5,
  pro: 10,
  scale: 15,
  business: 15,
};

/**
 * ElevenLabs limits requests in flight, not requests a minute (three at
 * once on pay as you go, more on a plan). Every adapter in the process
 * shares one gate, so scenes made side by side wait their turn rather
 * than being turned away; the limit is ELEVENLABS_CONCURRENCY, else what
 * ElevenLabs says it is (`maximum-concurrent-requests`), else the plan's.
 */
const gate = { running: 0, learned: 0, waiting: [] as (() => void)[] };

/**
 * What this process has learned of ElevenLabs: the account's voices (a
 * free list, trusted for minutes), a model it will not time (its audio is
 * then timed by our aligner), and whether it refused v4's continuity.
 */
const known = {
  voices: null as { at: number; voices: CatalogueVoice[] } | null,
  untimed: new Set<string>(),
  noContinuity: false,
  standIns: new Set<string>(),
};

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
    known.voices = null;
    known.untimed.clear();
    known.noContinuity = false;
    known.standIns.clear();
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

/** A direction's words with what is not a feeling taken out: the character's name, a term it stresses. */
const feelingWords = (style?: string) =>
  (style ?? '')
    .toLowerCase()
    .replace(/^as [^,]*,/, '')
    .replace(/"[^"]*"|“[^”]*”/g, '');

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
  const said = feelingWords(style);
  const tags: string[] = tone ? [TONE_TAG[tone]] : [];
  const feeling = TAGS.find(([words]) => words.test(said))?.[1];
  if (feeling && !tags.includes(feeling)) tags.push(feeling);
  return tags.slice(0, 2);
}

// ── Eleven v4's tags ────────────────────────────────────────────────────

/**
 * Every tag v4 may be sent: feelings and manners from ElevenLabs' own
 * guide to v4 ("Directing AI voices with Eleven v4") and v3's list, the
 * sounds a person makes (a sigh, a laugh, a gasp) and a pace. Never a
 * sound effect ("[door creaks]", "[applause]"): the score and the
 * effects are ours, and v4 can take a tag for one. Nothing outside this
 * list is ever sent, so a direction's own words never are.
 */
export const V4_TAGS = [
  'whispers',
  'shouting',
  'happy',
  'excited',
  'sad',
  'crying',
  'angry',
  'furious',
  'annoyed',
  'nervous',
  'terrified',
  'tense',
  'hesitant',
  'cautious',
  'surprised',
  'curious',
  'mischievously',
  'sarcastic',
  'serious',
  'thoughtful',
  'calm',
  'softly',
  'slowly',
  'sighs',
  'laughs',
  'gasps',
] as const;
export type V4Tag = (typeof V4_TAGS)[number];

/** A direction's words to v4's feelings, the first that fits: v3's list with v4's finer ones before their broader kin. */
const V4_WORDS: [RegExp, V4Tag][] = [
  [/\b(?:whisper|hushed|quietly|not aloud)/, 'whispers'],
  [/\b(?:shout|yell|roar|bellow|scream)/, 'shouting'],
  [/\b(?:furious|enraged|rage|livid)/, 'furious'],
  [/\b(?:angry|anger|cross|fierce)/, 'angry'],
  [/\b(?:annoy|irritat|exasperat)/, 'annoyed'],
  [/\b(?:crying|sobbing|in tears|tearful|heartbroken)/, 'crying'],
  [/\b(?:sad|grie|sorrow|mourn|lonely)/, 'sad'],
  [/\b(?:terrified|terror|petrified|panic)/, 'terrified'],
  [/\b(?:afraid|scared|frighten|fear|nervous|worried|anxious)/, 'nervous'],
  [/\b(?:hesitant|hesitat|unsure|uncertain|timid|shy)/, 'hesitant'],
  [/\b(?:tense|urgent|on edge)/, 'tense'],
  [/\b(?:cautious|wary|careful)/, 'cautious'],
  [/\b(?:surpris|astonish|amaz|shock)/, 'surprised'],
  [/\b(?:mischiev|cheeky|sly|trick)/, 'mischievously'],
  [/\b(?:sarcas|mock|scorn|sneer)/, 'sarcastic'],
  [/\b(?:excit|eager|energetic|enthusias|thrill)/, 'excited'],
  [/\b(?:cheerful|bright|upbeat|playful|happy|joy|smil|jolly|glad)/, 'happy'],
  [/\b(?:curious|wonder|inquisitive)/, 'curious'],
  [/\b(?:tender|loving|soft)/, 'softly'],
  [/\b(?:serious|sober|stern|solemn|grave)/, 'serious'],
  [/\b(?:thought|wise|far away|dream|remember)/, 'thoughtful'],
  [/\b(?:calm|unhurried|gentle|patient|steady|deep)/, 'calm'],
];

/**
 * The face a line is said with, or felt beneath it (the rigged face's
 * recipes, E7/S7), as v4's feeling: none for a face with no voice of its
 * own (neutral), or one that is a sound instead (FACE_SOUND).
 */
export const FACE_TAG: Record<string, V4Tag | null> = {
  neutral: null,
  joy: 'happy',
  sad: 'sad',
  angry: 'angry',
  fear: 'nervous',
  surprise: 'surprised',
  thinking: 'thoughtful',
  pain: 'tense',
  'eyes closed': 'calm',
  delight: 'excited',
  amused: 'happy',
  smug: 'mischievously',
  embarrassed: 'hesitant',
  shy: 'hesitant',
  guilty: 'hesitant',
  suspicious: 'cautious',
  sceptical: 'cautious',
  annoyed: 'annoyed',
  furious: 'furious',
  disgust: 'annoyed',
  terror: 'terrified',
  shock: 'surprised',
  heartbroken: 'crying',
  tender: 'softly',
  love: 'softly',
  determined: 'serious',
  bored: null,
  confused: 'hesitant',
  curious: 'curious',
  relieved: 'calm',
  sarcastic: 'sarcastic',
  worried: 'nervous',
  proud: 'happy',
  pleading: 'tense',
  exasperated: 'annoyed',
};

/** A face that is heard as a sound a person makes before the words: a sigh of relief, a laugh, a gasp. */
export const FACE_SOUND: Record<string, V4Tag> = {
  relieved: 'sighs',
  exasperated: 'sighs',
  bored: 'sighs',
  amused: 'laughs',
  shock: 'gasps',
};

/** What a line does to the one it is said to (scene-performance's aims), as the feeling it is said with. */
export const AIM_TAG: Record<string, V4Tag> = {
  threatens: 'serious',
  warns: 'serious',
  accuses: 'angry',
  begs: 'tense',
  confesses: 'hesitant',
  comforts: 'softly',
  praises: 'happy',
  teases: 'mischievously',
  jokes: 'mischievously',
  bargains: 'cautious',
  dodges: 'hesitant',
  greets: 'happy',
  orders: 'serious',
  refuses: 'serious',
  asks: 'curious',
};
const AIM_SOUND: Record<string, V4Tag> = { jokes: 'laughs' };

/** A lesson sentence's delivery, where it asks a feeling of its own over the page's mood. */
export const DELIVERY_TAG: Record<string, V4Tag> = {
  question: 'curious',
  recap: 'calm',
};

/** The most tags a line takes on v4: ElevenLabs' advice is one feeling a phrase, and a tag or two of manner. */
export const V4_MOST_TAGS = 3;

const lower = (word?: string) => (word ?? '').trim().toLowerCase();

/**
 * A piece's direction as v4's audio tags, stacked, at most three, in
 * the order they matter to a clear film: how loud (a whisper, a shout);
 * the one feeling it is said with (the face it is said with, else the
 * one felt beneath, else what the line does, else the lesson sentence's
 * delivery, else its direction's words); slowly, for a sentence the pace
 * asks slower than the time-stretch can take it (v4 has no speed); a
 * sound the face makes (a sigh, a laugh, a gasp); and the feeling beneath
 * when it is not the one shown. Only tags from V4_TAGS, so nothing of a
 * direction's own words, and never a sound effect.
 */
export function v4Tags(piece: {
  style?: string;
  tone?: 'whisper' | 'shout';
  speed?: number;
  direction?: { delivery?: string; aim?: string; said?: string; felt?: string };
}): V4Tag[] {
  const direction = piece.direction ?? {};
  const said = lower(direction.said);
  const felt = lower(direction.felt);
  const aim = lower(direction.aim);
  const words = feelingWords(piece.style);
  const tags: V4Tag[] = [];
  const add = (tag: V4Tag | null | undefined) => {
    if (tag && !tags.includes(tag)) tags.push(tag);
  };
  if (piece.tone) add(TONE_TAG[piece.tone]);
  else if (/\b(?:whisper|hushed|not aloud)/.test(words)) add('whispers');
  const feeling =
    FACE_TAG[said] ??
    FACE_TAG[felt] ??
    AIM_TAG[aim] ??
    DELIVERY_TAG[lower(direction.delivery)] ??
    V4_WORDS.find(
      ([pattern, tag]) =>
        tag !== 'whispers' && tag !== 'shouting' && pattern.test(words),
    )?.[1];
  add(feeling);
  if (piece.speed !== undefined && piece.speed < TEMPO_RANGE[0]) add('slowly');
  add(FACE_SOUND[said] ?? FACE_SOUND[felt] ?? AIM_SOUND[aim]);
  if (felt && felt !== said) add(FACE_TAG[felt]);
  return tags.slice(0, V4_MOST_TAGS);
}

/** A sentence as the port hands it over; neither v3 nor v4 takes a speed, so `speed` goes unsaid but for v4's "slowly". */
type Piece = {
  text: string;
  pauseAfter: number;
  speed?: number;
  style?: string;
  voice?: string;
  tone?: 'whisper' | 'shout';
  direction?: { delivery?: string; aim?: string; said?: string; felt?: string };
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
 * its tags before its words (v3's two, v4's stacked three); a new request
 * where the next line would pass ElevenLabs' size. A square bracket in
 * the words would be taken for a tag and not said: it is sent as a round
 * one.
 */
export function dialogueRequests(
  pieces: Piece[],
  narrator: string,
  model: string = 'eleven_v3',
): DialogueLine[][] {
  const requests: DialogueLine[][] = [];
  let size = 0;
  for (const piece of pieces) {
    const words = piece.text.trim().replace(/\[/g, '(').replace(/\]/g, ')');
    if (!words) continue;
    const tags = (
      isV4Model(model) ? v4Tags(piece) : audioTags(piece.style, piece.tone)
    )
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

/** At most `most` characters of words, cut at a word: from the end (`tail`) or the start. */
function clipWords(text: string, most: number, tail: boolean): string {
  const said = text.replace(/\s+/g, ' ').trim();
  if (said.length <= most) return said;
  if (tail) {
    const cut = said.slice(said.length - most);
    const space = cut.indexOf(' ');
    return (space >= 0 ? cut.slice(space + 1) : cut).trim();
  }
  const cut = said.slice(0, most);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).trim();
}

/** A request's words alone, its tags left out: what v4's continuity is given of it. */
const wordsOf = (lines: DialogueLine[]) =>
  lines.map((line) => line.text.slice(line.tagged)).join(' ');

/**
 * v4's continuity for the k-th of a page's requests, so a voice keeps its
 * tone from one request to the next: the requests before it by their ids
 * (the last three), and the words either side (a hundred characters
 * each). Nothing for a page in one request.
 */
export function continuityOf(
  requests: DialogueLine[][],
  k: number,
  before: string[],
): Record<string, unknown> {
  if (requests.length < 2) return {};
  return {
    ...(before.length
      ? { previous_request_ids: before.slice(-CONTEXT_REQUESTS) }
      : {}),
    ...(k > 0
      ? {
          previous_text: clipWords(
            wordsOf(requests[k - 1]),
            CONTEXT_CHARS,
            true,
          ),
        }
      : {}),
    ...(k < requests.length - 1
      ? {
          future_text: clipWords(
            wordsOf(requests[k + 1]),
            CONTEXT_CHARS,
            false,
          ),
        }
      : {}),
  };
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
      detail?:
        | string
        | { status?: string; code?: string; message?: string }
        | unknown[];
    };
    const detail = parsed?.detail;
    if (typeof detail === 'string') return { code: '', message: detail };
    if (detail && !Array.isArray(detail) && typeof detail === 'object')
      return {
        code: detail.status ?? detail.code ?? '',
        message: (detail.message ?? detail.status ?? '').slice(0, 240),
      };
    if (Array.isArray(detail))
      return { code: 'invalid', message: JSON.stringify(detail).slice(0, 240) };
  } catch {
    // not JSON: the body is the reason
  }
  return { code: '', message: body.slice(0, 240) };
}

/** A voice as the account lists it: the admin page's, with how it was made. */
type CatalogueVoice = VoiceOption & { category?: string };

/** The plan named in ELEVENLABS_PLAN, as ElevenLabs names it; null when none is. */
function planOf(named: string | undefined): string | null {
  const plan = named?.trim().toLowerCase();
  return plan && PLAN_CONCURRENCY[plan] ? plan : null;
}

/**
 * A refusal in plain words, ElevenLabs' own after them: out of credit, a
 * voice not in the account, a model the plan cannot use, the key refused.
 * `plain` is what the Studio's row says; `message` what the job fails with.
 */
export function plainRefusal(
  status: number,
  code: string,
  said: string,
  model: string,
): { plain: string; message: string } {
  const reason = `${code ? `${code}: ` : ''}${said}`;
  const all = `${code} ${said}`;
  let plain: string;
  if (
    status === 402 ||
    /quota_exceeded|insufficient_credits|payment_required|credits?\b|quota/i.test(
      all,
    )
  )
    plain = 'ElevenLabs is out of credit';
  else if (/voice_not_found|voice.*not (?:be )?found/i.test(all)) {
    const id = /'([A-Za-z0-9]{12,40})'/.exec(said)?.[1];
    plain = `A voice in the cast is not in the ElevenLabs account${id ? ` (${id})` : ''}`;
  } else if (
    /model/i.test(all) &&
    /not (?:allowed|available|supported)|access|plan/i.test(all)
  )
    plain = `This ElevenLabs account cannot use ${model}`;
  else if (status === 401 || status === 403)
    plain = 'ElevenLabs refused our key';
  else plain = `ElevenLabs turned the page down (${status})`;
  return { plain, message: `${plain}: ${reason}` };
}

/** Whether ElevenLabs refused a request for asking timestamps of a model it will not time. */
const untimedRefusal = (status: number, all: string) =>
  (status === 400 || status === 422) &&
  /model/i.test(all) &&
  /timestamp|not supported|unsupported|not available/i.test(all) &&
  !/voice/i.test(all);

/** Whether ElevenLabs refused v4's continuity (a new parameter it may not take everywhere). */
const continuityRefusal = (status: number, all: string) =>
  (status === 400 || status === 422) &&
  /previous_request_ids|next_request_ids|previous_text|future_text/.test(all);

/**
 * Visualize's voice on ElevenLabs: chosen on the admin page (or with
 * SCENE_VOICE_ENGINE=elevenlabs) once ELEVENLABS_API_KEY is set; its
 * model (v4 by default, or v3) chosen there too.
 *
 * A page is one Text to Dialogue request (more, a page past 1,800
 * characters, asked one after another on v4 so each carries on from the
 * last: its ids and the words either side): each sentence a line in its
 * speaker's voice, the narrator's or a character's, its direction as
 * audio tags, never words. It is asked `with-timestamps`, so ElevenLabs
 * says where each line and each word is, and the page needs no aligner;
 * a model ElevenLabs will not time is asked without, and the page is
 * timed by our aligner. The silences are made here, at the quiet between
 * two lines, as the page asks: neither model takes pause marks. The
 * answer is raw audio, encoded to mp3 here like Gemini's.
 */
@Injectable()
export class ElevenLabsSceneSpeechAdapter implements SpeechPort {
  private readonly logger = new Logger(ElevenLabsSceneSpeechAdapter.name);

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
    /** The admin's model, over ELEVENLABS_SCENE_MODEL. */
    private readonly chosen: string | null = null,
  ) {}

  label(): { model: string; voice: string } {
    return {
      model:
        this.chosen?.trim() ||
        this.config.get<string>('ELEVENLABS_SCENE_MODEL')?.trim() ||
        ELEVENLABS_SCENE_MODEL,
      voice:
        this.config.get<string>('ELEVENLABS_NARRATOR_VOICE')?.trim() ||
        ELEVENLABS_NARRATOR,
    };
  }

  /** The same voice on another model: v4 or v3, as the admin chose. */
  withModel(model: string): ElevenLabsSceneSpeechAdapter {
    return new ElevenLabsSceneSpeechAdapter(
      this.config,
      this.encode,
      this.send,
      this.sleep,
      model,
    );
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

  /** The account's plan, as ELEVENLABS_PLAN names it. */
  private plan(): string | null {
    return planOf(this.config.get<string>('ELEVENLABS_PLAN'));
  }

  /**
   * How many requests at once: ELEVENLABS_CONCURRENCY, else what
   * ElevenLabs said, else the plan's (Creator 5, Pro 10, Scale 15), else two.
   */
  private limit(): number {
    const set = Number(this.config.get<string>('ELEVENLABS_CONCURRENCY'));
    if (Number.isFinite(set) && set > 0) return Math.floor(set);
    const plan = this.plan();
    return gate.learned || (plan ? PLAN_CONCURRENCY[plan] : 2);
  }

  /**
   * Each voice the page speaks in, as the account has it: a library voice
   * not yet added stood in for by its premade voice (logged once), any
   * other voice not in the account refused in plain words before a
   * character is paid for. Premade voices are in every account and never
   * checked; when the account's list cannot be read, the voices go as
   * they are.
   */
  private async cast(
    pieces: Piece[],
    narrator: string,
  ): Promise<{
    pieces: Piece[];
    narrator: string;
  }> {
    const ids = new Set(
      [narrator, ...pieces.map((piece) => piece.voice?.trim() ?? '')].filter(
        (id) => id && !isElevenLabsPremade(id),
      ),
    );
    if (!ids.size) return { pieces, narrator };
    let have: Set<string>;
    try {
      have = new Set((await this.voices()).map((voice) => voice.id));
    } catch (error) {
      this.logger.warn(
        `could not check the cast's voices, sending them as they are: ${(error as Error).message}`,
      );
      return { pieces, narrator };
    }
    const put = (id: string): string => {
      if (!ids.has(id) || have.has(id)) return id;
      const standIn = elevenLabsStandIn(id);
      if (!standIn) {
        const plain = `A voice in the cast is not in the ElevenLabs account (${id})`;
        noticeRetry({ service: 'voice', final: true, reason: plain });
        throw refused(
          400,
          `${plain}: choose another on the admin page, or add it to the account`,
        );
      }
      if (!known.standIns.has(id)) {
        known.standIns.add(id);
        this.logger.warn(
          `library voice ${id} is not in the ElevenLabs account: ${standIn} stands in until it is added`,
        );
      }
      return standIn;
    };
    return {
      narrator: put(narrator),
      pieces: pieces.map((piece) =>
        piece.voice?.trim()
          ? { ...piece, voice: put(piece.voice.trim()) }
          : piece,
      ),
    };
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
    pcm: { samples: Int16Array; sampleRate: number };
    pieceStartsMs?: number[];
    words?: { text: string; startMs: number; endMs: number }[];
    characters: number;
  }> {
    const key = this.key();
    const { model } = this.label();
    const v4 = isV4Model(model);
    const cast = await this.cast(
      pieces?.length ? pieces : [{ text, pauseAfter: 0 }],
      voice?.trim() || this.label().voice,
    );
    const requests = dialogueRequests(cast.pieces, cast.narrator, model);
    if (!requests.length) throw refused(400, 'There is nothing to say');
    const stability = Number(
      this.config.get<string>('ELEVENLABS_STABILITY') ?? '0.5',
    );
    const similarity = Number(
      this.config.get<string>('ELEVENLABS_SIMILARITY') ?? '',
    );
    const bodyOf = (lines: DialogueLine[]) => ({
      inputs: lines.map(({ text: said, voice_id }) => ({
        text: said,
        voice_id,
      })),
      model_id: model,
      // Natural: steady in the voice, and still acting on the tags.
      settings: {
        stability: Number.isFinite(stability) ? stability : 0.5,
        // v4's likeness to the voice, only where a deployment sets it.
        ...(v4 &&
        this.config.get<string>('ELEVENLABS_SIMILARITY')?.trim() &&
        Number.isFinite(similarity)
          ? { similarity_boost: similarity }
          : {}),
      },
      seed: seedOf(lines),
    });
    // v3's requests side by side; v4's one after another, each carrying
    // on from the ones before it.
    const answers: Awaited<ReturnType<typeof this.ask>>[] = [];
    if (v4 && requests.length > 1) {
      const ids: string[] = [];
      for (const [k, lines] of requests.entries()) {
        const answer = await this.ask(key, model, {
          ...bodyOf(lines),
          ...(known.noContinuity ? {} : continuityOf(requests, k, ids)),
        });
        if (answer.requestId) ids.push(answer.requestId);
        answers.push(answer);
      }
    } else
      answers.push(
        ...(await Promise.all(
          requests.map((lines) => this.ask(key, model, bodyOf(lines))),
        )),
      );
    // The requests' audio end to end, and where each line is said in it.
    const raws: Int16Array[] = [];
    const spans: SpokenLine[] = [];
    const lines: DialogueLine[] = [];
    let offset = 0;
    let exact = true;
    let characters = 0;
    let billed = 0;
    for (const [k, { answer, characters: cost }] of answers.entries()) {
      if (!answer.audio_base64)
        throw new Error('The ElevenLabs voice sent no audio');
      const pcm = readPcm16(Buffer.from(answer.audio_base64, 'base64'), RATE);
      if (!pcm.samples.length)
        throw new Error('The ElevenLabs voice sent silence');
      // Priced by the characters sent, tags and all: what the list price
      // is for. ElevenLabs' own count (`character-cost`) is credits, less
      // while a launch offer lasts; it is logged, not priced.
      const sent = requests[k].reduce((n, line) => n + line.text.length, 0);
      characters += sent;
      billed += cost ?? sent;
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
          `ElevenLabs gave no times for its lines on ${model}: the page is timed by the aligner`,
        );
      }
      raws.push(pcm.samples);
      offset += pcm.samples.length;
    }
    if (billed !== characters)
      this.logger.log(
        `ElevenLabs counted ${billed} credits for ${characters} characters on ${model}`,
      );
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
      // The samples too: the pace step puts them right without decoding.
      pcm: { samples, sampleRate: RATE },
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
   * once with its status and plain words, which the worker reads as
   * permanent and the Studio's row says. Two refusals are put right
   * instead, once for the process: a model ElevenLabs will not time is
   * asked again without timestamps (timed by our aligner), and v4's
   * continuity, if refused, is left off.
   */
  private async ask(
    key: string,
    model: string,
    body: Record<string, unknown>,
  ): Promise<{
    answer: DialogueAnswer;
    characters: number | null;
    requestId: string | null;
  }> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      let wait = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
      let reason: string | undefined;
      const timed = !known.untimed.has(model);
      await enter(this.limit());
      try {
        const response = await this.send(
          `${API}/v1/text-to-dialogue${timed ? '/with-timestamps' : ''}?output_format=pcm_${RATE}`,
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
          noticeRecovered('voice');
          const cost = Number(response.headers.get('character-cost'));
          const answer: DialogueAnswer = timed
            ? ((await response.json()) as DialogueAnswer)
            : {
                audio_base64: Buffer.from(
                  await response.arrayBuffer(),
                ).toString('base64'),
              };
          return {
            answer,
            characters: Number.isFinite(cost) && cost > 0 ? cost : null,
            requestId: response.headers.get('request-id'),
          };
        }
        const { code, message } = detailIn(await response.text());
        const all = `${code} ${message}`;
        if (timed && untimedRefusal(response.status, all)) {
          known.untimed.add(model);
          this.logger.warn(
            `ElevenLabs will not time ${model} (${code || response.status}: ${message}): its pages are voiced without timestamps and timed by our aligner`,
          );
          attempt -= 1;
          continue;
        }
        if (
          continuityRefusal(response.status, all) &&
          ['previous_request_ids', 'previous_text', 'future_text'].some(
            (field) => field in body,
          )
        ) {
          known.noContinuity = true;
          delete body.previous_request_ids;
          delete body.previous_text;
          delete body.future_text;
          this.logger.warn(
            `ElevenLabs would not take v4's continuity (${message}): requests go without it`,
          );
          attempt -= 1;
          continue;
        }
        if (response.status === 429) {
          const after = Number(response.headers.get('retry-after'));
          if (Number.isFinite(after) && after > 0)
            wait = Math.min(60_000, after * 1000);
          const plan = this.plan();
          reason = /concurren/i.test(all)
            ? `ElevenLabs is at its limit of ${this.limit()} at once${plan ? ` on the ${plan[0].toUpperCase()}${plan.slice(1)} plan` : ''}`
            : 'ElevenLabs is busy';
          throw new Error(`${reason}: ${code ? `${code}: ` : ''}${message}`);
        }
        if (response.status >= 400 && response.status < 500) {
          const words = plainRefusal(response.status, code, message, model);
          noticeRetry({
            service: 'voice',
            final: true,
            reason: words.plain,
            status: response.status,
          });
          throw refused(response.status, words.message);
        }
        throw new Error(
          `The ElevenLabs voice answered ${response.status}: ${code ? `${code}: ` : ''}${message}`,
        );
      } catch (error) {
        lastError = named(error);
        if (isRefusal(lastError)) throw lastError;
        this.logger.warn(
          `attempt ${attempt} of ${ATTEMPTS} failed: ${lastError.message}`,
        );
        if (attempt < ATTEMPTS)
          noticeRetry({
            service: 'voice',
            attempt: attempt + 1,
            of: ATTEMPTS,
            waitMs: wait,
            error: lastError,
            ...(reason ? { reason } : {}),
          });
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
   * from the Voice Library, as it lists them (a free request, trusted for
   * minutes, shared by the process).
   */
  private async voices(): Promise<CatalogueVoice[]> {
    if (known.voices && Date.now() - known.voices.at < CATALOGUE_MS)
      return known.voices.voices;
    const key = this.key();
    const voices: CatalogueVoice[] = [];
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
          category?: string | null;
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
          ...(one.category ? { category: one.category } : {}),
        });
      }
      token = body.has_more ? (body.next_page_token ?? null) : null;
      if (!token) break;
    }
    voices.sort((a, b) => a.name.localeCompare(b.name));
    known.voices = { at: Date.now(), voices };
    return voices;
  }

  /**
   * The account's voices for the admin page to choose from, a voice made
   * for an earlier model flagged while v4 speaks: ElevenLabs says cloned
   * and designed voices may sound different on v4, designed ones act less.
   */
  async catalogue(): Promise<VoiceOption[]> {
    const v4 = isV4Model(this.label().model);
    return (await this.voices()).map(({ category, ...voice }) => {
      const note = !v4
        ? null
        : category === 'generated'
          ? 'A designed voice: on v4 it may sound different and act less. Listen again'
          : category === 'cloned' || category === 'professional'
            ? 'A cloned voice: it may sound different on v4. Listen again'
            : null;
      return {
        ...voice,
        ...(category ? { category } : {}),
        ...(note ? { note } : {}),
      };
    });
  }

  /**
   * ElevenLabs' Voice Library searched (a free request), for the admin to
   * find a voice the account does not have: a child, an elder, a creature.
   * Only voices every plan may use are offered.
   */
  async library(search: string): Promise<LibraryVoice[]> {
    const key = this.key();
    const words = search.trim().slice(0, 80);
    const response = await this.send(
      `${API}/v1/shared-voices?page_size=24&sort=cloned_by_count${words ? `&search=${encodeURIComponent(words)}` : ''}`,
      {
        headers: { 'xi-api-key': key },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      const { message } = detailIn(await response.text());
      throw new Error(
        `ElevenLabs would not search its library (${response.status}): ${message}`,
      );
    }
    const body = (await response.json()) as {
      voices?: {
        voice_id: string;
        public_owner_id: string;
        name?: string;
        description?: string | null;
        preview_url?: string | null;
        gender?: string;
        age?: string;
        accent?: string;
        free_users_allowed?: boolean;
      }[];
    };
    const have = new Set(
      await this.voices().then(
        (voices) => voices.map((voice) => voice.id),
        () => [] as string[],
      ),
    );
    return (body.voices ?? [])
      .filter((one) => one.free_users_allowed !== false)
      .map((one) => {
        const [name, ...about] = (one.name ?? one.voice_id).split(' - ');
        return {
          id: one.voice_id,
          ownerId: one.public_owner_id,
          name: name.trim(),
          description: [
            about.join(' - ').trim(),
            ...[one.gender, one.age, one.accent]
              .filter(Boolean)
              .map((label) => (label as string).replace(/_/g, ' ')),
          ]
            .filter(Boolean)
            .join(', '),
          previewUrl: one.preview_url ?? null,
          added: have.has(one.voice_id),
        };
      });
  }

  /** A library voice added to the account, as the admin asked on the admin page: it takes a voice slot. */
  async addVoice(
    ownerId: string,
    voiceId: string,
    name: string,
  ): Promise<void> {
    const key = this.key();
    const response = await this.send(
      `${API}/v1/voices/add/${encodeURIComponent(ownerId)}/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ new_name: name.slice(0, 100) }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      const { code, message } = detailIn(await response.text());
      throw refused(
        response.status >= 400 && response.status < 500 ? response.status : 502,
        /voice_limit|slots?/i.test(`${code} ${message}`)
          ? `The ElevenLabs account has no voice slot free: ${message}`
          : `ElevenLabs would not add the voice (${response.status}): ${message}`,
      );
    }
    known.voices = null;
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
