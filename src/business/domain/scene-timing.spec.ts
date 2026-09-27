import { spokenForm } from './spoken';
import {
  anchorMs,
  estimateSpokenWords,
  outOfSilence,
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

describe('words the voice never said in a silence', () => {
  it('moves a word measured in a silence the voice made to where it speaks again', () => {
    // "Go, Pip, go!": the aligner left "Go," at no length in the quiet
    // after the line before; the voice speaks again at 8.91 s.
    const words = [
      [0, 3, 7920, 7920],
      [4, 8, 8908, 9230],
      [9, 12, 9445, 9810],
    ];
    expect(outOfSilence(words, [[7350, 8910]])).toEqual([
      [0, 3, 8910, 8910],
      [4, 8, 8910, 9230],
      [9, 12, 9445, 9810],
    ]);
    // A word at a silence's very edge stays where it was.
    expect(outOfSilence([[0, 3, 7360, 7600]], [[7350, 8910]])).toEqual([
      [0, 3, 7360, 7600],
    ]);
  });

  it("says a line's last words before the quiet after it, never on into it", () => {
    // "He led us all over town!" then "Pip!": an estimate spread "over
    // town!" over the 6 s quiet after it; "Pip!" was put in it too.
    const words = [
      [0, 2, 1000, 1200],
      [3, 6, 1250, 1500],
      [7, 9, 1550, 1800],
      [10, 13, 1850, 2100],
      [14, 18, 4000, 5500],
      [19, 24, 6000, 7400],
      [25, 29, 7500, 7700],
    ];
    const out = outOfSilence(words, [[2150, 8200]], [0, 25]);
    // The line ends as its voice does, before the quiet, in order.
    expect(out[4][2]).toBeGreaterThanOrEqual(out[3][2]);
    expect(out[5][3]).toBeLessThanOrEqual(2150);
    expect(out[4][2]).toBeLessThan(out[5][2]);
    // The next line's first word, where the voice speaks again.
    expect(out[6][2]).toBe(8200);
  });
});
