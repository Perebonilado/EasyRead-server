/**
 * How the voice says each sentence: the writer's delivery tag turned into
 * a pace and the silence after it.
 *
 * Every sentence at one pace with one of two pauses was a metronome, and
 * the people the videos were shown to heard it as flat. A person teaching
 * speeds up a little into a hook, slows on the point and leaves room after
 * it, and waits after a question long enough to think. The writer says
 * which sentence is which; the numbers are here, where they can be tuned
 * and tested, and a voice that takes a pace per sentence (Kokoro) says them.
 */
import {
  quotedSpans,
  type SceneBeat,
  type SceneDelivery,
  type SceneMood,
} from './scene-script';
import type { StoryBible, StoryCharacter, StoryVoice } from './scene-story';

/** The pace and the silence after a sentence, by how it is said. */
export const DELIVERY: Record<SceneDelivery, { speed: number; pause: number }> =
  {
    hook: { speed: 1.03, pause: 0.45 },
    explain: { speed: 1, pause: 0.35 },
    key: { speed: 0.93, pause: 0.7 },
    aside: { speed: 1.07, pause: 0.3 },
    question: { speed: 1, pause: 0.75 },
    recap: { speed: 0.96, pause: 0.5 },
  };

/** Where the idea changes, this much more silence. */
export const IDEA_CHANGE_S = 0.4;
/** The least silence before a key point: a beat before the reveal. */
export const BEFORE_KEY_S = 0.55;
/** No sentence faster or slower than this, whatever the tags add up to. */
export const SPEED_RANGE = [0.88, 1.1] as const;
/** No silence shorter or longer than this, in seconds. */
export const PAUSE_RANGE = [0.2, 1.4] as const;

const clamp = (n: number, [low, high]: readonly [number, number]) =>
  Math.min(high, Math.max(low, n));

/** Each sentence's pace and the silence after it, in seconds. */
export function deliveryPieces(
  beats: Pick<SceneBeat, 'delivery' | 'pause'>[],
): { speed: number; pauseAfter: number }[] {
  return beats.map((beat, i) => {
    const how = DELIVERY[beat.delivery] ?? DELIVERY.explain;
    let pause = how.pause + (beat.pause === 'long' ? IDEA_CHANGE_S : 0);
    if (beats[i + 1]?.delivery === 'key') pause = Math.max(pause, BEFORE_KEY_S);
    return {
      speed: clamp(how.speed, SPEED_RANGE),
      pauseAfter: Math.round(clamp(pause, PAUSE_RANGE) * 100) / 100,
    };
  });
}

/**
 * The same tags as words, for a voice that takes direction (Gemini): who
 * is speaking, how the page feels, and how this sentence goes. Short, as
 * Google advises; the voice reads the text itself word for word, so the
 * direction never goes in the text.
 */
export const PERSONA = 'a warm, lively teacher talking to one learner';

export const MOOD_STYLE: Record<SceneMood, string> = {
  calm: 'calm and unhurried',
  bright: 'bright and upbeat',
  curious: 'curious, with a sense of wonder',
  serious: 'gentle and sober',
  playful: 'playful, with a smile in the voice',
};

export const DELIVERY_STYLE: Record<SceneDelivery, string> = {
  hook: 'drawing the listener in',
  explain: 'clear and friendly',
  key: 'slower, landing the point',
  aside: 'light and quick, an aside',
  question: 'genuinely asking, leaving room to think',
  recap: 'warm, summing up',
};

/** One sentence's direction: the persona, the page's mood, the sentence's delivery. */
export function voiceStyle(mood: SceneMood, delivery: SceneDelivery): string {
  return `${PERSONA}; ${MOOD_STYLE[mood] ?? MOOD_STYLE.curious}; ${DELIVERY_STYLE[delivery] ?? DELIVERY_STYLE.explain}`;
}

/**
 * A voice name as it goes into a file's name: a blend is joined with
 * commas ("af_heart,af_bella"), which a storage key should not carry.
 */
export const voiceSlug = (voice: string) =>
  voice.toLowerCase().replace(/[^a-z0-9_]+/g, '+');

/** The voices a story's characters speak in, by engine and by kind: never the narrator's own. */
export const CHARACTER_VOICES: Record<
  'kokoro' | 'gemini',
  Record<StoryVoice, string[]>
> = {
  kokoro: {
    girl: ['af_sky', 'af_nova', 'bf_lily'],
    boy: ['am_puck', 'am_echo', 'am_liam'],
    woman: ['af_bella', 'bf_emma', 'af_sarah', 'af_jessica'],
    man: ['am_michael', 'am_eric', 'bm_lewis', 'am_adam'],
    'old woman': ['bf_alice', 'bf_isabella', 'af_aoede'],
    'old man': ['bm_george', 'am_santa', 'bm_daniel'],
    creature: ['bm_fable', 'am_fenrir', 'am_onyx'],
  },
  gemini: {
    girl: ['Leda', 'Aoede', 'Laomedeia'],
    boy: ['Puck', 'Zubenelgenubi', 'Sadachbia'],
    woman: ['Kore', 'Despina', 'Callirrhoe', 'Erinome'],
    man: ['Charon', 'Iapetus', 'Orus', 'Alnilam'],
    'old woman': ['Gacrux', 'Vindemiatrix', 'Achernar'],
    'old man': ['Algenib', 'Schedar', 'Rasalgethi'],
    creature: ['Fenrir', 'Enceladus', 'Umbriel'],
  },
};

/** How quickly each kind speaks, against the sentence's own pace. */
export const CHARACTER_PACE: Record<StoryVoice, number> = {
  girl: 1.06,
  boy: 1.06,
  woman: 1,
  man: 0.98,
  'old woman': 0.93,
  'old man': 0.92,
  creature: 1,
};

/** Who says a sentence's quoted words, and how. */
export interface Speaker {
  voice: string;
  /** Against the sentence's pace. */
  pace: number;
  /** Direction, for a voice that takes it. */
  style: string;
}

/**
 * The voice a character speaks in, the same every page: the next of their
 * kind's voices in the order the book met them, never the narrator's.
 * Null for a character with no voice of their own, or an engine with no
 * palette: the narrator says their lines.
 */
export function characterVoice(
  bible: StoryBible,
  character: StoryCharacter,
  engine: 'kokoro' | 'gemini' | null,
  narrator: string,
): Speaker | null {
  if (!engine || !character.voice) return null;
  const own = new Set(narrator.toLowerCase().split(','));
  const palette = CHARACTER_VOICES[engine][character.voice].filter(
    (voice) => !own.has(voice.toLowerCase()),
  );
  if (!palette.length) return null;
  const before = bible.characters.filter(
    (c) => c.voice === character.voice && c.met < character.met,
  ).length;
  return {
    voice: palette[before % palette.length],
    pace: CHARACTER_PACE[character.voice],
    style: `as ${character.name}, ${character.voice === 'creature' ? 'a creature' : `${/^[aeiou]/.test(character.voice) ? 'an' : 'a'} ${character.voice}`}${character.traits.length ? `, ${character.traits.join(', ')}` : ''}, saying their own line`,
  };
}

/** A breath between the narrator and a character within one sentence. */
export const TURN_S = 0.12;

/** One piece of narration as the voice is sent it, and the sentence it is part of. */
export interface VoicedPiece {
  text: string;
  speed: number;
  pauseAfter: number;
  style?: string;
  /** Another voice than the narrator's: a character's. */
  voice?: string;
  beat: number;
}

/**
 * The narration as the voice is sent it: a piece a sentence, at its pace
 * with its silence after; and a sentence that quotes one of the story's
 * characters parted at its quotation, their words in their own voice at
 * their own pace, the narrator saying the rest. Every piece says words:
 * a mark with none of its own goes with the words after it.
 */
export function voicedPieces(input: {
  texts: string[];
  delivered: { speed: number; pauseAfter: number }[];
  styles: string[];
  speakers: (Speaker | null)[];
}): VoicedPiece[] {
  const out: VoicedPiece[] = [];
  input.texts.forEach((text, beat) => {
    const { speed, pauseAfter } = input.delivered[beat];
    const style = input.styles[beat];
    const speaker = input.speakers[beat];
    const spans = speaker ? quotedSpans(text) : [];
    if (!speaker || !spans.length) {
      out.push({ text, speed, pauseAfter, style, beat });
      return;
    }
    // The sentence cut at each quotation's edges.
    const cuts = [0, ...spans.flat(), text.length];
    const parts: { text: string; quoted: boolean }[] = [];
    let carried = '';
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const piece = `${carried}${text.slice(cuts[i], cuts[i + 1])}`;
      if (!/\p{L}|\p{N}/u.test(piece)) {
        carried = piece;
        continue;
      }
      carried = '';
      parts.push({ text: piece.trim(), quoted: i % 2 === 1 });
    }
    if (carried && parts.length)
      parts[parts.length - 1].text =
        `${parts[parts.length - 1].text}${carried}`.trim();
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      out.push({
        text: part.text,
        speed: part.quoted
          ? Math.round(speed * speaker.pace * 100) / 100
          : speed,
        pauseAfter: last ? pauseAfter : TURN_S,
        style: part.quoted ? speaker.style : style,
        ...(part.quoted ? { voice: speaker.voice } : {}),
        beat,
      });
    });
  });
  return out;
}

/** Where each sentence starts on the audio: where its first piece does. */
export function sentenceStarts(
  pieces: { beat: number }[],
  pieceStartsMs: number[] | undefined,
  count: number,
): number[] | undefined {
  if (!pieceStartsMs || pieceStartsMs.length !== pieces.length)
    return undefined;
  const starts: number[] = [];
  for (let beat = 0; beat < count; beat += 1) {
    const first = pieces.findIndex((piece) => piece.beat === beat);
    if (first < 0) return undefined;
    starts.push(pieceStartsMs[first]);
  }
  return starts;
}
