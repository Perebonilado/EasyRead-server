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
import type { SceneBeat, SceneDelivery, SceneMood } from './scene-script';

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
