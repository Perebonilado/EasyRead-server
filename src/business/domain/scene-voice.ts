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
  type SceneBeat,
  type SceneDelivery,
  type LineFrom,
  type LinePace,
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
/** The slowest a sentence is said, for the youngest learners. */
export const SLOWEST = 0.82;

const clamp = (n: number, [low, high]: readonly [number, number]) =>
  Math.min(high, Math.max(low, n));

/**
 * A screenplay's timing: a line at the speaker's own pace, the next line
 * close behind it as a conversation goes; the narrator a touch slower,
 * with a breath after.
 */
export const LINE_DELIVERY = { speed: 1, pause: 0.3 };
export const NARRATION_DELIVERY = { speed: 0.95, pause: 0.55 };
/** How a line's pace changes its speed. */
export const LINE_PACE_SPEED: Record<LinePace, number> = {
  calm: 1,
  quick: 1.07,
  slow: 0.9,
  whisper: 0.9,
  shout: 1.04,
};
/** The longest silence a sentence may keep after it, for what happens in it: as long as the voice holds. */
export const HOLD_LIMIT_S = 3;

/** Each sentence's pace and the silence after it, in seconds. */
/**
 * A line's pace by where it comes from: a thought is quieter and slower
 * than speech, and a voice from above is unhurried.
 */
const FROM_SPEED: Partial<Record<LineFrom, number>> = {
  thought: 0.92,
  above: 0.94,
  dream: 0.95,
};

export function deliveryPieces(
  beats: Pick<
    SceneBeat,
    'delivery' | 'pause' | 'kind' | 'pace' | 'holdS' | 'from'
  >[],
  /** Whom it is for: a child is spoken to more slowly, with longer pauses. */
  learners: { pace: number; pause: number } = { pace: 1, pause: 1 },
): { speed: number; pauseAfter: number }[] {
  return beats.map((beat, i) => {
    const how = beat.kind
      ? beat.kind === 'line'
        ? {
            speed:
              LINE_DELIVERY.speed *
              LINE_PACE_SPEED[beat.pace ?? 'calm'] *
              (FROM_SPEED[beat.from ?? 'here'] ?? 1),
            // Before the narrator comes in, a breath more.
            pause:
              beats[i + 1]?.kind === 'narration'
                ? NARRATION_DELIVERY.pause
                : LINE_DELIVERY.pause,
          }
        : NARRATION_DELIVERY
      : (DELIVERY[beat.delivery] ?? DELIVERY.explain);
    let pause = how.pause + (beat.pause === 'long' ? IDEA_CHANGE_S : 0);
    if (beats[i + 1]?.delivery === 'key' && !beat.kind)
      pause = Math.max(pause, BEFORE_KEY_S);
    const paused =
      Math.round(clamp(pause * learners.pause, PAUSE_RANGE) * 100) / 100;
    return {
      speed:
        Math.round(
          clamp(how.speed * learners.pace, [
            Math.min(SPEED_RANGE[0], SLOWEST),
            SPEED_RANGE[1],
          ]) * 100,
        ) / 100,
      // What happens after it without words takes its own time.
      pauseAfter: Math.min(HOLD_LIMIT_S, Math.max(paused, beat.holdS ?? 0)),
    };
  });
}

/**
 * The same tags as words, for a voice that takes direction (Gemini): how
 * the page feels and how this sentence goes, in a few words. Google's
 * guide (2026-09): the text is read as a verbatim transcript, so nothing
 * but the words goes in it; style is for emotion, pace and tone, kept
 * short, since more prompt text makes the voice drift; who the voice is
 * belongs to the voice itself, not to every sentence.
 */
export const MOOD_STYLE: Record<SceneMood, string> = {
  calm: 'calm and unhurried',
  bright: 'bright and upbeat',
  curious: 'curious, with a sense of wonder',
  serious: 'gentle and sober',
  playful: 'playful, with a smile in the voice',
};

/**
 * How each sentence goes, pace included: the voice takes no speed, so
 * the pace is said in words. About 140 to 160 words a minute is the pace
 * a listener understands best: slower for what is new or matters most, a
 * little quicker for what is known.
 */
export const DELIVERY_STYLE: Record<SceneDelivery, string> = {
  hook: 'inviting',
  explain: 'clear, unhurried',
  key: 'speaking slowly, landing it',
  aside: 'light, a little quicker',
  question: 'asking, then leaving room',
  recap: 'warm, steady',
};

/**
 * One sentence's direction: the page's mood, the sentence's delivery,
 * and the new term it says first, stressed.
 */
export function voiceStyle(
  mood: SceneMood,
  delivery: SceneDelivery,
  terms: readonly string[] = [],
): string {
  const stress = terms.length
    ? `; stressing ${terms
        .slice(0, 2)
        .map((term) => `"${term}"`)
        .join(' and ')}`
    : '';
  return `${MOOD_STYLE[mood] ?? MOOD_STYLE.curious}; ${DELIVERY_STYLE[delivery] ?? DELIVERY_STYLE.explain}${stress}`;
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
    // Blends, evenly: voices no one character has. God's is deep and calm;
    // a crowd's is a man and a woman as one.
    divine: ['am_onyx,bm_george', 'am_onyx,bm_daniel', 'am_fenrir,bm_george'],
    crowd: ['am_michael,af_bella', 'am_eric,af_sarah', 'bm_lewis,bf_emma'],
  },
  gemini: {
    girl: ['Leda', 'Aoede', 'Laomedeia'],
    boy: ['Puck', 'Zubenelgenubi', 'Sadachbia'],
    woman: ['Kore', 'Despina', 'Callirrhoe', 'Erinome'],
    man: ['Charon', 'Iapetus', 'Orus', 'Alnilam'],
    'old woman': ['Gacrux', 'Vindemiatrix', 'Achernar'],
    'old man': ['Algenib', 'Schedar', 'Rasalgethi'],
    creature: ['Fenrir', 'Enceladus', 'Umbriel'],
    divine: ['Algieba', 'Sadaltager', 'Achird'],
    crowd: ['Zephyr', 'Autonoe', 'Pulcherrima'],
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
  divine: 0.88,
  crowd: 1,
};

/** How each kind is asked to sound, for a voice that takes direction. */
const CHARACTER_MANNER: Partial<Record<StoryVoice, string>> = {
  divine: 'deep, calm and unhurried, a voice from above',
  crowd: 'many voices speaking as one, a crowd',
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
  // Someone the text's tradition never draws is never voiced either: the
  // narrator says their words.
  if (!engine || !character.voice || character.presence === 'light')
    return null;
  const own = new Set(narrator.toLowerCase().split(','));
  const palette = CHARACTER_VOICES[engine][character.voice].filter(
    (voice) => !own.has(voice.toLowerCase()),
  );
  if (!palette.length) return null;
  const before = bible.characters.filter(
    (c) => c.voice === character.voice && c.met < character.met,
  ).length;
  const kind = character.voice;
  return {
    voice: palette[before % palette.length],
    pace: CHARACTER_PACE[kind],
    style: `as ${character.name}, ${CHARACTER_MANNER[kind] ?? (kind === 'creature' ? 'a creature' : `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}`)}${character.traits.length ? `, ${character.traits.join(', ')}` : ''}, saying their own line`,
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
 * with its silence after; and a sentence that quotes the story's
 * characters parted at each quotation, each line in its own speaker's
 * voice at their own pace, the narrator saying the rest. Two characters
 * in one sentence each say their own. Every piece says words: a mark with
 * none of its own goes with the words after it.
 */
export function voicedPieces(input: {
  texts: string[];
  delivered: { speed: number; pauseAfter: number }[];
  styles: string[];
  /** Each sentence's lines said by a character: where in its text, and by whom. */
  lines: { span: [number, number]; speaker: Speaker }[][];
}): VoicedPiece[] {
  const out: VoicedPiece[] = [];
  input.texts.forEach((text, beat) => {
    const { speed, pauseAfter } = input.delivered[beat];
    const style = input.styles[beat];
    const lines = [...(input.lines[beat] ?? [])].sort(
      (a, b) => a.span[0] - b.span[0],
    );
    if (!lines.length) {
      out.push({ text, speed, pauseAfter, style, beat });
      return;
    }
    // The sentence cut at each line's edges, the narrator's words between.
    const parts: { text: string; speaker: Speaker | null }[] = [];
    let carried = '';
    const part = (piece: string, speaker: Speaker | null) => {
      const joined = `${carried}${piece}`;
      if (!/\p{L}|\p{N}/u.test(joined)) {
        carried = joined;
        return;
      }
      carried = '';
      parts.push({ text: joined.trim(), speaker });
    };
    let at = 0;
    for (const { span, speaker } of lines) {
      if (span[0] < at) continue;
      if (span[0] > at) part(text.slice(at, span[0]), null);
      part(text.slice(span[0], span[1]), speaker);
      at = span[1];
    }
    if (at < text.length) part(text.slice(at), null);
    if (carried && parts.length)
      parts[parts.length - 1].text =
        `${parts[parts.length - 1].text}${carried}`.trim();
    parts.forEach(({ text: said, speaker }, i) => {
      const last = i === parts.length - 1;
      out.push({
        text: said,
        speed: speaker ? Math.round(speed * speaker.pace * 100) / 100 : speed,
        pauseAfter: last ? pauseAfter : TURN_S,
        style: speaker ? speaker.style : style,
        ...(speaker ? { voice: speaker.voice } : {}),
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
