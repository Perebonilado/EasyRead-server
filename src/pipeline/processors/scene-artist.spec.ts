import type { DrawingVerdict } from '../../business/domain/drawing-score';
import { styleReport } from '../../business/domain/scene-polish';
import type { LlmGatewayPort, LlmUsage } from '../../business/ports/llm.port';
import type { StoryCharacter } from '../../business/domain/scene-story';
import {
  SceneArtist,
  TAKE_TEMPERATURE,
  asDrawn,
  better,
  ranked,
  type ArtistTask,
  type Judged,
} from './scene-artist';

const usage = (model = 'test:artist'): LlmUsage => ({
  model,
  tokensIn: 100,
  tokensOut: 50,
  latencyMs: 1,
});

const verdict = (score: number, problems: string[] = []): DrawingVerdict => ({
  sees: `a drawing scored ${score}`,
  recognisable: score,
  anatomy: score,
  face: null,
  change: null,
  same: null,
  place: null,
  problems,
});

/** A dog of simple shapes, as an artist would draw it to the brief. */
function dogSvg(colour: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">',
    '<g stroke="#2d2a32" stroke-width="16" stroke-linejoin="round">',
    `<g id="legs"><g id="leg-1"><rect x="220" y="470" width="70" height="250" fill="${colour}"/></g><g id="leg-2"><rect x="330" y="470" width="70" height="250" fill="${colour}"/></g><g id="leg-3"><rect x="470" y="470" width="70" height="250" fill="${colour}"/></g><g id="leg-4"><rect x="580" y="470" width="70" height="250" fill="${colour}"/></g></g>`,
    `<g id="body"><ellipse cx="430" cy="440" rx="260" ry="130" fill="${colour}"/></g>`,
    `<g id="head"><circle cx="640" cy="260" r="130" fill="${colour}"/></g>`,
    '<g id="neutral"><circle cx="595" cy="235" r="40" fill="#ffffff"/><circle cx="690" cy="235" r="40" fill="#ffffff"/><circle cx="595" cy="240" r="12" fill="#2d2a32" stroke="none"/><circle cx="690" cy="240" r="12" fill="#2d2a32" stroke="none"/></g>',
    '<g id="happy"><circle cx="595" cy="235" r="40" fill="#ffffff"/><circle cx="690" cy="235" r="40" fill="#ffffff"/></g>',
    '<g id="sad"><circle cx="595" cy="235" r="40" fill="#ffffff"/><circle cx="690" cy="235" r="40" fill="#ffffff"/></g>',
    '<g id="angry"><circle cx="595" cy="235" r="40" fill="#ffffff"/><circle cx="690" cy="235" r="40" fill="#ffffff"/></g>',
    '<g id="afraid"><circle cx="595" cy="235" r="40" fill="#ffffff"/><circle cx="690" cy="235" r="40" fill="#ffffff"/></g>',
    '<g id="surprised"><circle cx="595" cy="235" r="40" fill="#ffffff"/><circle cx="690" cy="235" r="40" fill="#ffffff"/></g>',
    '<g id="thinking"><circle cx="595" cy="235" r="40" fill="#ffffff"/><circle cx="690" cy="235" r="40" fill="#ffffff"/></g>',
    '<g id="mouth-at"><circle cx="640" cy="320" r="4" fill="none"/></g>',
    '</g></svg>',
  ].join('');
}

/** A stub of the model: each drawing asked for, and each judgement given, by the scores it is told to give. */
function stub(scores: number[]) {
  const asked: Parameters<LlmGatewayPort['sceneDrawing']>[0][] = [];
  const looked: Parameters<LlmGatewayPort['drawingJudge']>[0][] = [];
  let judged = 0;
  const llm = {
    sceneDrawing: (input: Parameters<LlmGatewayPort['sceneDrawing']>[0]) => {
      asked.push(input);
      return Promise.resolve({ value: dogSvg('#8b5e3c'), usage: usage() });
    },
    drawingJudge: (input: Parameters<LlmGatewayPort['drawingJudge']>[0]) => {
      looked.push(input);
      const score = scores[Math.min(judged, scores.length - 1)];
      judged += 1;
      return Promise.resolve({
        value: verdict(
          score,
          score >= 8 ? [] : [`Draw it better (it was ${score})`],
        ),
        usage: usage('test:judge'),
      });
    },
  } as unknown as LlmGatewayPort;
  const recorded: ArtistTask[] = [];
  const log: string[] = [];
  const artist = new SceneArtist(
    llm,
    (_id, task) => {
      recorded.push(task);
      return Promise.resolve();
    },
    { log: (line) => log.push(line), warn: (line) => log.push(`! ${line}`) },
  );
  return { artist, asked, looked, recorded, log };
}

const pip: StoryCharacter = {
  id: 'pip',
  name: 'Pip',
  aliases: [],
  role: 'main',
  look: 'a small brown dog',
  traits: [],
  firstPage: 1,
  met: 0,
  voice: null,
  kind: 'animal',
  size: 'medium',
};

const round = (score: number | null, faults = 0): Judged<number> => ({
  value: score ?? -1,
  svg: '',
  faults: Array.from({ length: faults }, (_, k) => `fault ${k}`),
  png: null,
  verdict: score === null ? null : verdict(score),
  score: score ?? 0,
});

describe('which drawing is better', () => {
  it('ranks by the judge, then by the fewest faults, a judged one above one no judge saw', () => {
    expect(better(round(8), round(6))).toBe(true);
    expect(better(round(6, 0), round(6, 2))).toBe(true);
    expect(better(round(1), round(null))).toBe(true);
    expect(
      ranked([round(5), null, round(9), round(5, 1)]).map((one) => one.value),
    ).toEqual([9, 5, 5]);
  });

  it('gives a drawing back its canvas to revise, and no styles', () => {
    expect(
      asDrawn(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 30 400 500"><style>.a{fill:red}</style><rect/></svg>',
        { w: 800, h: 800 },
      ),
    ).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect/></svg>',
    );
  });
});

describe('see and fix', () => {
  const make = (reply: string) =>
    Promise.resolve({
      value: Number(reply),
      svg: `<svg>${reply}</svg>`,
      faults: [],
      png: Buffer.from('png'),
    });

  it('sends its own drawing back with the judge’s notes until it passes, and keeps the best', async () => {
    const { artist } = stub([]);
    const asks: { notes?: string[]; previous?: string }[] = [];
    let n = 0;
    const scores = [5, 7, 9];
    const best = await artist.take(
      'Pip',
      (ask) => {
        asks.push(ask);
        return Promise.resolve(String(n++));
      },
      make,
      (png) => {
        expect(png.toString()).toBe('png');
        const score = scores[asks.length - 1];
        return Promise.resolve(verdict(score, [`fix ${score}`]));
      },
      2,
    );
    expect(best?.value).toBe(2);
    expect(best?.score).toBe(9);
    expect(asks).toEqual([
      { notes: undefined, previous: undefined },
      { notes: ['fix 5'], previous: '<svg>0</svg>' },
      { notes: ['fix 7'], previous: '<svg>1</svg>' },
    ]);
  });

  it('revises at most twice, keeping the best round', async () => {
    const { artist } = stub([]);
    let n = 0;
    const scores = [6, 4, 5, 9];
    const best = await artist.take(
      'Pip',
      () => Promise.resolve(String(n++)),
      make,
      () => Promise.resolve(verdict(scores[n - 1])),
      2,
    );
    expect(n).toBe(3);
    expect(best?.score).toBe(6);
    expect(best?.value).toBe(0);
  });

  it('draws nothing again for want of a judge that could not say', async () => {
    const { artist } = stub([]);
    let n = 0;
    await artist.take(
      'Pip',
      () => Promise.resolve(String(n++)),
      make,
      () => Promise.resolve(null),
      2,
    );
    expect(n).toBe(1);
  });

  it('blind, draws afresh with what code found, as it always did', async () => {
    const { artist } = stub([]);
    const asks: { notes?: string[]; previous?: string }[] = [];
    await artist.take(
      'Pip',
      (ask) => {
        asks.push(ask);
        return Promise.resolve('1');
      },
      (reply) =>
        Promise.resolve({
          value: Number(reply),
          svg: '<svg/>',
          faults: asks.length === 1 ? ['The tail floats.'] : [],
          png: null,
        }),
      null,
      2,
    );
    expect(asks).toEqual([
      { notes: undefined, previous: undefined },
      { notes: ['The tail floats.'], previous: undefined },
    ]);
  });
});

describe('a new character, drawn three ways at once', () => {
  it('asks three takes side by side, each framed its own way, polishes, judges and revises them, and keeps the others beside the best', async () => {
    const { artist, asked, looked, recorded } = stub([6, 9, 9, 9, 9, 9]);
    const drawn = await artist.drawSheet(pip, 'Farm Friends', null, 'test');
    expect(drawn).not.toBeNull();
    const firsts = asked.filter((one) => !one.previous);
    expect(firsts).toHaveLength(3);
    expect(new Set(firsts.map((one) => one.hint)).size).toBe(3);
    for (const one of asked) {
      expect(one.purpose).toBe('cast');
      expect(one.temperature).toBe(TAKE_TEMPERATURE);
      expect(one.asked?.line).toBe(16);
    }
    // The take the judge marked 6 went back once, its own drawing with it.
    const revised = asked.filter((one) => one.previous);
    expect(revised).toHaveLength(1);
    expect(revised[0].notes).toEqual(['Draw it better (it was 6)']);
    expect(revised[0].previous).toContain('viewBox="0 0 800 800"');
    expect(looked.every((one) => one.kind === 'animal')).toBe(true);
    // Every call recorded: four drawings and four looks.
    expect(recorded.filter((task) => task === 'cast_draw')).toHaveLength(4);
    expect(recorded.filter((task) => task === 'drawing_judge')).toHaveLength(4);
    expect(drawn!.others).toHaveLength(2);
    expect(drawn!.verdict?.recognisable).toBe(9);
    // Polished to the kit's line on the stage, whatever its frame.
    const { drawing } = drawn!.sheet;
    expect(styleReport(drawing.svg, 130 / drawing.viewBox[3]).line).toBe(2.6);
    expect(drawn!.sheet.face).toBeDefined();
  }, 120_000);

  it('draws a change the maker asks for once, the judge seeing the one before, and sends it back when the change does not show', async () => {
    const { artist, asked, looked } = stub([9]);
    const first = await artist.drawSheet(pip, 'Farm Friends', null, 'test');
    asked.length = 0;
    looked.length = 0;
    const judgeScores = [
      { ...verdict(9), change: 3, same: 9 },
      { ...verdict(9), change: 9, same: 9 },
    ];
    let k = 0;
    (artist as unknown as { llm: { drawingJudge: unknown } }).llm.drawingJudge =
      (input: Parameters<LlmGatewayPort['drawingJudge']>[0]) => {
        looked.push(input);
        return Promise.resolve({ value: judgeScores[k++], usage: usage() });
      };
    const again = await artist.drawSheet(pip, 'Farm Friends', null, 'test', {
      words: 'a red collar',
      reference: 'reference svg',
      before: first!.sheet,
    });
    expect(again).not.toBeNull();
    expect(asked[0].hint).toBeUndefined();
    expect(asked[0].temperature).toBeUndefined();
    expect(asked[0].reference).toBe('reference svg');
    expect(looked[0].old?.words).toBe('a red collar');
    expect(asked).toHaveLength(2);
    expect(asked[1].notes?.join(' ')).toMatch(
      /The change the maker asked for does not show yet: "a red collar"/,
    );
    expect(again!.others).toEqual([]);
  }, 120_000);
});
