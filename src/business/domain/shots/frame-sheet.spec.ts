import type { FrameProblem, FrameScores, StillImage } from './frame-checks';
import {
  codesLine,
  cut,
  escapeXml,
  scoresLine,
  sheetSvg,
  shrink,
  summaryMarkdown,
} from './frame-sheet';

const SCORES: FrameScores = {
  readability: 5,
  composition: 6.7,
  pace: 8.2,
  truth: 0,
  overall: 5,
  pass: false,
  cardShare: 0.342,
  personShare: 0.5,
  focalShare: 0.007,
  focalHeight: 0.06,
  stills: 3,
};

describe('a still made smaller', () => {
  it('averages each block of pixels into one', () => {
    const image: StillImage = {
      width: 4,
      height: 2,
      data: new Uint8Array(4 * 2 * 4),
    };
    // The left half white, the right black: two pixels a side at a factor of 2.
    for (let y = 0; y < 2; y += 1)
      for (let x = 0; x < 2; x += 1)
        image.data.set([255, 255, 255, 255], (y * 4 + x) * 4);
    const small = shrink(image, 2);
    expect([small.width, small.height]).toEqual([2, 1]);
    expect([...small.data]).toEqual([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(shrink(image, 1)).toBe(image);
  });
});

describe('a contact sheet', () => {
  const tiles = Array.from({ length: 6 }, (_, k) => ({
    png: 'AAAA',
    ms: 1500 * k,
    codes:
      k === 1
        ? (['text-small', 'text-small', 'focal-small'] as const).slice()
        : [],
  }));

  it('tiles the stills four across, a strip under each, sized by the film’s shape', () => {
    const wide = sheetSvg({
      title: 'Cold Open: The Intake',
      subtitle: 'scores',
      tiles,
      shape: 'wide',
    });
    expect(wide.width).toBe(18 * 2 + 4 * 480 + 3 * 14);
    expect(wide.height).toBe(74 + 2 * (270 + 48 + 14) - 14 + 18);
    expect(wide.svg.match(/<image /g)).toHaveLength(6);
    const tall = sheetSvg({ title: 'x', subtitle: '', tiles, shape: 'tall' });
    expect(tall.width).toBe(18 * 2 + 4 * 270 + 3 * 14);
    expect(tall.svg).toContain('width="270" height="480"');
  });

  it('labels each still with its moment and the title, and names what failed under it', () => {
    const { svg } = sheetSvg({
      title: 'Fans & <cores>',
      subtitle: 'ok',
      tiles,
      shape: 'wide',
    });
    expect(svg).toContain('1.5s</tspan> · Fans &amp; &lt;cores&gt;');
    expect(svg).toContain('text-small ×2 · focal-small');
    expect(svg).toContain('nothing failed');
    expect(svg).not.toContain('<cores>');
  });

  it('reads well in small words', () => {
    expect(codesLine(['blank', 'text-small', 'text-small'])).toBe(
      'text-small ×2 · blank',
    );
    expect(cut('a long title indeed', 8)).toBe('a long…');
    expect(cut('short', 8)).toBe('short');
    expect(escapeXml(`"it's" <b>`)).toBe('&quot;it&apos;s&quot; &lt;b&gt;');
    expect(scoresLine(SCORES)).toContain('word cards 34.2%');
    expect(scoresLine(SCORES)).toContain(
      'subject 0.7% of the frame, 6.0% of its height',
    );
  });
});

describe('the written summary', () => {
  it('has a row a scene and one for the episode, what fails most, and each scene’s worst once each', () => {
    const problems: FrameProblem[] = [
      {
        code: 'focal-small',
        axis: 'composition',
        ms: 2500,
        ids: ['engine'],
        message: '"engine" fills 0.7% of the frame',
      },
      {
        code: 'focal-small',
        axis: 'composition',
        ms: 4500,
        ids: ['engine'],
        message: 'again',
      },
      {
        code: 'person',
        axis: 'truth',
        ms: 0,
        ids: ['student'],
        banned: 'audience-on-screen',
        message: '"Student" is on screen',
      },
    ];
    const text = summaryMarkdown({
      title: 'Front Door',
      episodeId: 'e1',
      shape: 'wide',
      per: 'all',
      at: '2026-10-02',
      ms: 61_000,
      scenes: [
        {
          n: 1,
          title: 'Cold Open | The Intake',
          durationMs: 36_000,
          scores: SCORES,
          problems,
          sheet: '01-sheet.png',
        },
      ],
      episode: SCORES,
    });
    expect(text).toContain('# Frames: Front Door');
    expect(text).toContain(
      '| 1. Cold Open \\| The Intake | 3 | 5 | 6.7 | 8.2 | 0 | **5** | 34.2% | 50.0% | 0.7% / 6.0% | [sheet](01-sheet.png) |',
    );
    expect(text).toContain('| **Episode** | 3 |');
    expect(text).toContain('- `focal-small` (composition): 2');
    expect(text.match(/`focal-small`: /g)).toHaveLength(1);
    expect(text).toContain('- 0.0s `person`: "Student" is on screen');
  });
});
