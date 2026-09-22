import { spokenForm } from './spoken';
import {
  anchorMs,
  estimateSpokenWords,
  pinSpokenWords,
  quietGaps,
  sceneSpoken,
  spaced,
  spokenWordsFromVoice,
  timeBeats,
} from './scene-timing';

const beats = [
  { say: 'The war began in 1914.' },
  { say: "It didn't end until 1918, four years later." },
];
const forms = beats.map((b) => spokenForm(b.say, new Map()));

describe('the scene on the audio', () => {
  it('reads the voice’s own tokens onto the spoken words, split words and punctuation too', () => {
    const { text } = sceneSpoken(forms);
    let t = 0;
    const tokens = text
      .split(/\s+/)
      .flatMap((word) => {
        // The voice splits contractions and says punctuation as tokens of its own.
        const pieces = word
          .replace(/n't/, " n't")
          .replace(/([.,])$/, ' $1')
          .split(' ');
        return pieces;
      })
      .map((piece) => {
        const token = { text: piece, startMs: t, endMs: t + 200 };
        t += 250;
        return token;
      });
    const words = spokenWordsFromVoice(tokens, text);
    expect(words).not.toBeNull();
    const spokenCount = text.split(/\s+/).length;
    expect(words).toHaveLength(spokenCount);
    // "didn't" came as two tokens and is one word from the first's start to the second's end.
    const didnt = words!.find((w) => text.slice(w[0], w[1]) === "didn't")!;
    expect(didnt[3] - didnt[2]).toBeGreaterThan(200);
    for (let i = 1; i < words!.length; i += 1)
      expect(words![i][2]).toBeGreaterThanOrEqual(words![i - 1][2]);
  });

  it('gives up on a voice that said something else, so the aligner is used instead', () => {
    const { text } = sceneSpoken(forms);
    const wrong = [
      'completely',
      'different',
      'words',
      'here',
      'now',
      'again',
      'more',
      'and',
      'more',
    ].map((w, i) => ({
      text: w,
      startMs: i * 100,
      endMs: i * 100 + 80,
    }));
    expect(spokenWordsFromVoice(wrong, text)).toBeNull();
  });

  it('times each written word by the spoken words it became', () => {
    const spoken = estimateSpokenWords({
      forms,
      pausesS: [0.35, 0.8],
      durationMs: 6000,
      pieceStartsMs: [0, 2500],
    });
    const timed = timeBeats(beats, forms, spoken);
    expect(timed).toHaveLength(2);
    // One entry per written word, however many words it is said in.
    expect(timed[1].words).toHaveLength(beats[1].say.split(/\s+/).length);
    expect(timed[1].startMs).toBe(2500);
    const year = timed[1].words[4];
    expect(beats[1].say.slice(year[0], year[1])).toBe('1918,');
    expect(year[3]).toBeGreaterThan(year[2]);
  });

  it('pins measured words that wandered outside their sentence back into it', () => {
    const spoken = estimateSpokenWords({
      forms,
      pausesS: [0.35, 0.8],
      durationMs: 6000,
    });
    const shifted = spoken.map((w) => [w[0], w[1], w[2] + 3000, w[3] + 3000]);
    const pinned = pinSpokenWords(shifted, forms, [0.35, 0.8], 6000, [0, 2500]);
    expect(pinned[0][2]).toBe(0);
  });

  it('lands a step a breath before its words, and the first word of a sentence in the pause before it', () => {
    const spoken = estimateSpokenWords({
      forms,
      pausesS: [0.35, 0.8],
      durationMs: 6000,
      pieceStartsMs: [0, 2500],
    });
    const timed = timeBeats(beats, forms, spoken);
    expect(anchorMs(timed, 1, 0)).toBeLessThan(timed[1].startMs);
    expect(anchorMs(timed, 1, 0)).toBeGreaterThan(timed[0].endMs);
    expect(anchorMs(timed, 1, 3)).toBe(timed[1].words[3][2] - 200);
  });

  it('keeps changes apart and finds the long quiet stretches', () => {
    expect(spaced([0, 100, 200, 2000], 10_000)).toEqual([0, 450, 900, 2000]);
    expect(quietGaps([0, 1000, 9000], 10_000)).toEqual([[1000, 9000]]);
  });
});
