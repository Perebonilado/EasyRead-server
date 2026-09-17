import type { WordTimes } from './board';
import { spokenForm } from './spoken';
import {
  layoutProblems,
  materialPool,
  repairVisual,
  sceneSpoken,
  timeVisual,
  visibleAfterEach,
  visualProblems,
  type VisualScript,
} from './visual';

const MATERIAL =
  'A token bucket holds tokens. Each request takes one token. The bucket refills at a fixed rate. When the bucket is empty, requests wait or are dropped. This limits the rate of requests.';

const sound: VisualScript = {
  title: 'The token bucket',
  elements: [
    {
      id: 'bucket',
      type: 'shape',
      x: 180,
      y: 150,
      w: 90,
      h: 70,
      kind: 'roundRect',
      text: 'Bucket',
      color: 'blue',
    },
    {
      id: 'tokens',
      type: 'dots',
      points: [
        [165, 145],
        [180, 145],
        [195, 145],
      ],
      color: 'amber',
    },
    {
      id: 'refill',
      type: 'arrow',
      from: [180, 40],
      to: 'bucket',
      color: 'green',
    },
    {
      id: 'rate',
      type: 'chip',
      x: 250,
      y: 60,
      text: 'Fixed rate',
      color: 'green',
    },
    {
      id: 'request',
      type: 'icon',
      name: 'arrows',
      x: 60,
      y: 150,
      size: 32,
      color: 'violet',
    },
    {
      id: 'take',
      type: 'arrow',
      from: 'request',
      to: 'bucket',
      color: 'violet',
    },
    {
      id: 'empty',
      type: 'label',
      x: 180,
      y: 230,
      text: 'Empty: requests wait',
      size: 'md',
      color: 'red',
    },
  ],
  segments: [
    {
      text: 'A token bucket holds a number of tokens.',
      cues: [
        { at: 2, do: 'draw', target: 'bucket' },
        { at: 6, do: 'fade', target: 'tokens' },
      ],
    },
    {
      text: 'The bucket refills at a fixed rate, one token at a time.',
      cues: [
        { at: 2, do: 'draw', target: 'refill' },
        { at: 4, do: 'flow', target: 'refill' },
        { at: 6, do: 'fade', target: 'rate' },
      ],
    },
    {
      text: 'Each request takes one token out of the bucket.',
      cues: [
        { at: 1, do: 'fade', target: 'request' },
        { at: 3, do: 'draw', target: 'take' },
        { at: 7, do: 'pulse', target: 'bucket' },
      ],
    },
    {
      text: 'When the bucket is empty, requests wait or are dropped, and that limits the rate.',
      cues: [
        { at: 4, do: 'fade', target: 'empty' },
        { at: 6, do: 'dim', target: 'tokens' },
      ],
    },
    {
      text: 'So the bucket sets how many requests may pass in a given time.',
      cues: [{ at: 2, do: 'pulse', target: 'bucket' }],
    },
    {
      text: 'That is the whole idea of a token bucket as a rate limit.',
      cues: [{ at: 8, do: 'highlight', target: 'rate' }],
    },
    {
      text: 'Requests that arrive while tokens remain pass at once with no waiting.',
      cues: [{ at: 0, do: 'undim', target: 'tokens' }],
    },
    {
      text: 'Requests that arrive to an empty bucket wait for the next token or are dropped.',
      cues: [{ at: 5, do: 'pulse', target: 'empty' }],
    },
  ],
};

describe('a visual script', () => {
  it('passes the checks when it is sound and grounded', () => {
    expect(visualProblems(sound, materialPool(MATERIAL))).toEqual([]);
    expect(layoutProblems(sound)).toEqual([]);
  });

  it('names what is wrong, with the ids and numbers a repair needs', () => {
    const broken: VisualScript = {
      ...sound,
      elements: [
        ...sound.elements,
        { id: 'ghost', type: 'label', x: 300, y: 100, text: 'Never shown' },
        { id: 'arc', type: 'arrow', from: 'nowhere', to: 'bucket', bend: 90 },
      ],
      segments: [
        {
          text: 'Too short.',
          cues: [
            { at: 5, do: 'pulse', target: 'refill' },
            { at: 1, do: 'flow', target: 'bucket' },
          ],
        },
        ...sound.segments.slice(1),
      ],
    };
    const problems = visualProblems(broken, materialPool(MATERIAL));
    // The mendings that need no model: the cue past the end lands on the
    // last word, and the cues come back in order.
    const mended = repairVisual(broken).segments[0].cues;
    expect(mended.map((c) => c.at)).toEqual([1, 1]);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"ghost" is never drawn'),
        expect.stringContaining('"arc" points at "nowhere"'),
        expect.stringContaining('bends 90'),
        expect.stringContaining('Sentence 1 has 2 words'),
        expect.stringContaining('cue at word 5'),
        expect.stringContaining('not in word order'),
        expect.stringContaining('flow only runs along'),
        expect.stringContaining('before it is drawn'),
        expect.stringContaining(
          '"ghost" says "Never shown", which is not built from the chapter',
        ),
      ]),
    );
  });

  it('reports a box over the margin and two boxes over each other, then mends both', () => {
    const crowded: VisualScript = {
      ...sound,
      elements: sound.elements.map((e) =>
        e.id === 'rate'
          ? { ...e, x: 215, y: 150 }
          : e.id === 'empty'
            ? { ...e, y: 268 }
            : e,
      ),
    };
    const problems = layoutProblems(crowded);
    expect(problems.some((p) => p.startsWith('"empty" runs outside'))).toBe(
      true,
    );
    expect(
      problems.some(
        (p) =>
          p.includes('"bucket"') &&
          p.includes('"rate"') &&
          p.includes('overlap'),
      ),
    ).toBe(true);
    const mended = repairVisual(crowded);
    expect(layoutProblems(mended)).toEqual([]);
    expect(visualProblems(mended, materialPool(MATERIAL))).toEqual([]);
  });

  it('refuses a shape too narrow for its text and an arrow through a chip, and widens the shape itself', () => {
    const tight: VisualScript = {
      ...sound,
      elements: sound.elements.map((e) =>
        e.id === 'bucket'
          ? { ...e, w: 40, text: 'Token bucket' }
          : e.id === 'rate'
            ? { ...e, x: 150, y: 70 }
            : e,
      ),
    };
    const problems = layoutProblems(tight);
    expect(problems.some((p) => p.includes('"bucket" is 40 wide'))).toBe(true);
    expect(
      problems.some((p) => p.includes('"refill" runs through "rate"')),
    ).toBe(true);
    const mended = repairVisual(tight);
    const bucket = mended.elements.find((e) => e.id === 'bucket') as {
      w: number;
    };
    expect(bucket.w).toBeGreaterThan(40);
    expect(layoutProblems(mended).some((p) => p.includes('wide'))).toBe(false);
    // The arrow through the chip is bent until it clears it.
    const refill = mended.elements.find((e) => e.id === 'refill') as {
      bend?: number;
    };
    expect(refill.bend).not.toBeUndefined();
    expect(layoutProblems(mended).some((p) => p.includes('runs through'))).toBe(
      false,
    );
  });

  it('tidies text the model broke across lines and dims the oldest chips when the canvas is crowded', () => {
    const chips = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      type: 'chip' as const,
      x: 40 + i * 30,
      y: 40 + (i % 2) * 60,
      text: i === 0 ? 'one\n  ' : `c${i}`,
      color: 'blue' as const,
    }));
    const crowded: VisualScript = {
      title: 'Crowded',
      elements: [
        {
          id: 'hub',
          type: 'shape',
          x: 180,
          y: 180,
          w: 120,
          h: 60,
          kind: 'roundRect',
          text: 'Hub',
          color: 'blue',
        },
        ...chips,
      ],
      segments: [
        {
          text: 'The hub sits at the centre of everything here.',
          cues: [{ at: 1, do: 'draw', target: 'hub' }],
        },
        {
          text: 'Now the first five chips come in one by one.',
          cues: chips
            .slice(0, 5)
            .map((c, i) => ({ at: i, do: 'fade' as const, target: c.id })),
        },
        {
          text: 'And then the last five chips come in as well.',
          cues: chips
            .slice(5)
            .map((c, i) => ({ at: i, do: 'fade' as const, target: c.id })),
        },
        {
          text: 'That is everything on the board at once now.',
          cues: [{ at: 1, do: 'pulse', target: 'hub' }],
        },
      ],
    };
    const mended = repairVisual(crowded);
    expect((mended.elements[1] as { text: string }).text).toBe('one');
    const third = mended.segments[2].cues;
    const dims = third.filter((c) => c.do === 'dim').map((c) => c.target);
    // Eleven lit after sentence three: the three oldest chips are dimmed, the hub never.
    expect(dims).toEqual(['c0', 'c1', 'c2']);
    expect(dims).not.toContain('hub');
    expect(mended.segments[3].cues.some((c) => c.do === 'dim')).toBe(false);
  });

  it('moves a chip up or down when a row is too wide to nudge sideways', () => {
    const row: VisualScript = {
      title: 'A row',
      elements: [
        {
          id: 'left',
          type: 'chip',
          x: 90,
          y: 240,
          text: 'participation',
          color: 'blue',
        },
        {
          id: 'mid',
          type: 'chip',
          x: 180,
          y: 240,
          text: 'health actions',
          color: 'blue',
        },
        {
          id: 'right',
          type: 'chip',
          x: 280,
          y: 240,
          text: 'universal access',
          color: 'blue',
        },
      ],
      segments: [
        {
          text: 'Three wide chips come in along the bottom edge.',
          cues: [
            { at: 0, do: 'fade', target: 'left' },
            { at: 2, do: 'fade', target: 'mid' },
            { at: 4, do: 'fade', target: 'right' },
          ],
        },
        { text: 'And they stay there for the rest of the scene.', cues: [] },
        { text: 'Nothing else moves on the canvas at all now.', cues: [] },
        { text: 'That is the whole of this little scene, then.', cues: [] },
      ],
    };
    expect(layoutProblems(row).some((p) => p.includes('overlap'))).toBe(true);
    const mended = repairVisual(row);
    expect(layoutProblems(mended)).toEqual([]);
  });

  it('knows what is on screen after each sentence, clear included', () => {
    const script: VisualScript = {
      ...sound,
      segments: [
        ...sound.segments.slice(0, 3),
        {
          text: 'Now clear the board and start again with the bucket alone.',
          cues: [
            { at: 1, do: 'clear', target: '*' },
            { at: 9, do: 'draw', target: 'bucket' },
          ],
        },
        ...sound.segments.slice(4),
      ],
    };
    const visible = visibleAfterEach(script);
    expect([...visible[2]].sort()).toEqual([
      'bucket',
      'rate',
      'refill',
      'request',
      'take',
      'tokens',
    ]);
    expect([...visible[3]]).toEqual(['bucket']);
  });

  it('puts every cue on the audio: a breath before its word for a draw, staggered when crowded', () => {
    const forms = sound.segments.map((s) => spokenForm(s.text));
    const { text } = sceneSpoken(forms);
    // Every word 300 ms long, one after another, from the scene's text.
    const words: number[][] = [];
    let ms = 0;
    for (const m of text.matchAll(/\S+/g)) {
      words.push([m.index, m.index + m[0].length, ms, ms + 280]);
      ms += 300;
    }
    const times: WordTimes = {
      version: 1,
      source: 'echogarden-dtw',
      audioKey: 'k',
      words,
      sentences: [],
    };
    const timeline = timeVisual({
      script: sound,
      forms,
      times,
      durationMs: ms,
      timing: 'aligned',
    });
    expect(timeline.segments).toHaveLength(8);
    const first = timeline.segments[0];
    expect(first.startMs).toBe(0);
    // "bucket" is word 2: 600 ms, drawn 120 ms early.
    expect(first.cues[0]).toEqual({ atMs: 480, do: 'draw', target: 'bucket' });
    // A cue on the first word cannot land before the sentence starts.
    const seventh = timeline.segments[6];
    expect(seventh.cues[0].atMs).toBe(seventh.startMs);
    // Two draws in sentence two at words 2 and 4 are 600 ms apart: not crowded, so untouched.
    const second = timeline.segments[1];
    expect(second.cues.map((c) => c.do)).toEqual(['draw', 'flow', 'fade']);
    expect(timeline.durationMs).toBe(ms);
  });
});
