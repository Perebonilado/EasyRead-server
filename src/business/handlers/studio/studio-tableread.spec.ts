/**
 * The table read (story plan S4), with the writer and the critic mocked:
 * by default it only scores (no rewrites, no retelling); with rounds
 * asked for, below the bar only the failing scenes are written again,
 * their notes as the problems; at most two rounds; the best read kept; a
 * rewrite the stage plays worse is not taken.
 */
import {
  bibleOf,
  outlineOf,
  storySheetOf,
  type StorySheet,
} from '../../domain/studio/studio';
import { RUBRIC_KEYS } from '../../domain/studio/studio-script';
import type { LlmGatewayPort } from '../../ports/llm.port';
import { tableRead } from './studio-tableread';

const bible = bibleOf({
  characters: [
    { name: 'Amara', voice: 'girl', role: 'main', figure: { age: 'child' } },
    {
      name: 'Joon',
      voice: 'boy',
      role: 'supporting',
      figure: { age: 'child' },
    },
  ],
  sets: [{ name: 'Garden', id: 'garden' }],
});
const brief = { format: 'story', minutes: 1.5, audience: 'children' } as never;
const outline = outlineOf({
  title: 'The Seed',
  logline: 'Amara must grow a sunflower taller than Joon’s.',
  scenes: ['Planting', 'Drought', 'Bloom'].map((title) => ({
    title,
    summary: `${title}.`,
    set: 'garden',
    cast: ['amara', 'joon'],
    seconds: 7,
  })),
});

/** A scene's sheet as the writer sends it: one line, its words given. */
const raw = (title: string, say: string) => ({
  title,
  set: 'garden',
  time: 'day',
  weather: 'clear',
  crowd: 'none',
  mood: 'calm',
  music: 'calm',
  transition: 'cut',
  onStage: [
    { who: 'amara', spot: 'left', pose: 'standing', face: 'neutral' },
    { who: 'joon', spot: 'right', pose: 'standing', face: 'neutral' },
  ],
  props: [],
  beats: [
    {
      kind: 'line',
      who: 'amara',
      to: 'joon',
      say,
      feeling: 'happy',
      from: 'here',
      aim: 'teases',
    },
    {
      kind: 'line',
      who: 'joon',
      to: 'amara',
      say: 'Mine will be taller by Friday, you watch.',
      feeling: 'happy',
      from: 'here',
      aim: 'teases',
    },
  ],
  camera: [],
});

const usage = {
  model: 'deepseek:deepseek-flash',
  tokensIn: 10,
  tokensOut: 10,
  latencyMs: 1,
};
/** Every item at n; clarity clear unless a test says otherwise. */
const scores = (n: number) => ({
  ...Object.fromEntries(RUBRIC_KEYS.map((k) => [k, n])),
  clarity: 8,
});

/** The critic's reads in turn, and a writer that marks each scene it writes again. */
function llmWith(
  reads: Record<string, unknown>[],
  rewrite?: (scene: string) => unknown,
) {
  const calls = {
    read: 0,
    scenes: [] as { scene: string; problems?: string[] }[],
  };
  const llm = {
    studioTableRead: () => {
      const value = reads[Math.min(calls.read, reads.length - 1)];
      calls.read += 1;
      return Promise.resolve({ value, usage });
    },
    studioScene: (input: { scene: string; problems?: string[] }) => {
      calls.scenes.push({ scene: input.scene, problems: input.problems });
      const title = /"([^"]+)"/.exec(input.scene)?.[1] ?? 'Scene';
      return Promise.resolve({
        value:
          rewrite?.(title) ??
          raw(title, `Rewritten ${title}, for real this time.`),
        usage,
      });
    },
  } as unknown as LlmGatewayPort;
  return { llm, calls };
}

/** The script as first written. */
function written(): Promise<StorySheet[]> {
  return Promise.resolve(
    outline.scenes.map((s) =>
      storySheetOf(raw(s.title, `Plant it deep, ${s.title}.`)),
    ),
  );
}

describe('the table read', () => {
  it('by default only scores: below the bar, nothing is written again and the script stands', async () => {
    const { llm, calls } = llmWith([
      { scores: scores(4), overall: 4.2, scenes: [{ scene: 2, score: 2 }] },
    ]);
    const sheets = await written();
    const logged: string[] = [];
    const result = await tableRead(llm, {
      brief,
      bible,
      outline,
      sheets,
      log: (line) => logged.push(line),
    });
    expect(calls.read).toBe(1);
    expect(calls.scenes).toEqual([]);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].rewritten).toEqual([]);
    expect(result.sheets).toBe(sheets);
    expect(result.changed.size).toBe(0);
    // The score is still logged.
    expect(logged.some((line) => /^table read 4\.2/.test(line))).toBe(true);
  });

  it('retells the whole film only when asked: one more call', async () => {
    const retold: string[] = [];
    const withRetell = (llm: LlmGatewayPort) =>
      ({
        ...llm,
        studioRetell: (input: { film: string }) => {
          retold.push(input.film);
          return Promise.resolve({
            value: { scenes: [], finally: '' },
            usage,
          });
        },
      }) as unknown as LlmGatewayPort;
    const reads = [{ scores: scores(8), overall: 7.9, scenes: [] }];
    const sheets = await written();
    await tableRead(withRetell(llmWith(reads).llm), {
      brief,
      bible,
      outline,
      sheets,
    });
    expect(retold).toHaveLength(0);
    await tableRead(withRetell(llmWith(reads).llm), {
      brief,
      bible,
      outline,
      sheets,
      retell: true,
    });
    expect(retold).toHaveLength(1);
  });

  it('reads once, and writes nothing again, when the script clears the bar', async () => {
    const { llm, calls } = llmWith([
      { scores: scores(8), overall: 7.9, scenes: [], verdict: 'Works.' },
    ]);
    const sheets = await written();
    const result = await tableRead(llm, { brief, bible, outline, sheets });
    expect(calls.read).toBe(1);
    expect(calls.scenes).toEqual([]);
    expect(result.rounds.map((r) => r.read.overall)).toEqual([7.9]);
    expect(result.sheets).toBe(sheets);
    expect(result.changed.size).toBe(0);
  });

  it('writes again only the failing scenes, with their notes as the problems, and keeps the better read', async () => {
    const { llm, calls } = llmWith([
      {
        scores: scores(6),
        overall: 5.8,
        scenes: [
          { scene: 1, score: 7, notes: [] },
          {
            scene: 2,
            score: 4,
            notes: ['Beat 2: Joon explains he is jealous; show it instead.'],
          },
          { scene: 3, score: 7, notes: [] },
        ],
      },
      { scores: scores(8), overall: 7.6, scenes: [] },
    ]);
    const sheets = await written();
    const logged: string[] = [];
    const result = await tableRead(llm, {
      brief,
      bible,
      outline,
      sheets,
      rounds: 2,
      log: (line) => logged.push(line),
    });
    expect(calls.read).toBe(2);
    expect(calls.scenes).toHaveLength(1);
    expect(calls.scenes[0].scene).toMatch(/^Scene 2, "Drought"/);
    expect(calls.scenes[0].problems).toEqual([
      'Beat 2: Joon explains he is jealous; show it instead.',
      expect.stringMatching(
        /^Keep the scene in its place, with its cast, and end it as it ends now/,
      ),
    ]);
    expect(result.best).toBe(1);
    expect(result.sheets[0]).toBe(sheets[0]);
    expect(result.sheets[1].beats[0].say).toBe(
      'Rewritten Drought, for real this time.',
    );
    expect([...result.changed.keys()]).toEqual([1]);
    expect(logged[0]).toMatch(
      /^table read 5\.8 \(clarity 8, want 6, .*; below the bar: overall 5\.8/,
    );
  });

  it('stops after two rounds of rewrites, and keeps the best read of the three', async () => {
    const { llm, calls } = llmWith([
      { scores: scores(6), overall: 5.5, scenes: [{ scene: 3, score: 3 }] },
      { scores: scores(6), overall: 6.4, scenes: [{ scene: 3, score: 5 }] },
      { scores: scores(6), overall: 6.1, scenes: [{ scene: 3, score: 5 }] },
    ]);
    const sheets = await written();
    const result = await tableRead(llm, {
      brief,
      bible,
      outline,
      sheets,
      rounds: 2,
    });
    expect(calls.read).toBe(3);
    expect(calls.scenes).toHaveLength(2);
    expect(result.rounds.map((r) => r.rewritten)).toEqual([[2], [2], []]);
    expect(result.best).toBe(1);
    expect(result.sheets).toBe(result.rounds[1].sheets);
  });

  it('keeps the first script when no rewrite reads better', async () => {
    const { llm } = llmWith([
      { scores: scores(6), overall: 6.2, scenes: [{ scene: 1, score: 4 }] },
      { scores: scores(5), overall: 5.9, scenes: [{ scene: 1, score: 4 }] },
    ]);
    const sheets = await written();
    const result = await tableRead(llm, {
      brief,
      bible,
      outline,
      sheets,
      rounds: 1,
    });
    expect(result.best).toBe(0);
    expect(result.sheets).toBe(sheets);
    expect(result.changed.size).toBe(0);
  });

  it('only reads, with rewrite off', async () => {
    const { llm, calls } = llmWith([
      { scores: scores(4), overall: 4, scenes: [{ scene: 1, score: 2 }] },
    ]);
    const result = await tableRead(llm, {
      brief,
      bible,
      outline,
      sheets: await written(),
      rewrite: false,
    });
    expect(calls.read).toBe(1);
    expect(calls.scenes).toEqual([]);
    expect(result.rounds).toHaveLength(1);
  });

  it('keeps a scene whose rewrite the stage would play worse', async () => {
    const { llm, calls } = llmWith(
      [
        { scores: scores(6), overall: 6, scenes: [{ scene: 2, score: 3 }] },
        { scores: scores(8), overall: 7.5, scenes: [] },
      ],
      // Far too long for its seconds, twice: it would play worse.
      (title) => {
        const long = raw(title, 'Wait.');
        return {
          ...long,
          beats: Array.from({ length: 14 }, (_, k) => ({
            ...long.beats[k % 2],
            say: `Line ${k}: the sunflower leans toward the fence and the fence leans back at it.`,
          })),
        };
      },
    );
    const sheets = await written();
    const result = await tableRead(llm, {
      brief,
      bible,
      outline,
      sheets,
      rounds: 1,
    });
    expect(calls.scenes.length).toBeGreaterThan(0);
    expect(result.rounds[1].sheets[1]).toBe(sheets[1]);
  });

  it('writes the next round again from the best script so far, never from one that read worse (Mumbai)', async () => {
    let n = 0;
    const { llm, calls } = llmWith(
      [
        { scores: scores(6), overall: 5.5, scenes: [{ scene: 2, score: 3 }] },
        // The rewrite reads worse, and asks for scene 3 instead.
        { scores: scores(5), overall: 4, scenes: [{ scene: 3, score: 3 }] },
        { scores: scores(6), overall: 5, scenes: [{ scene: 2, score: 4 }] },
      ],
      (title) => raw(title, `Rewrite ${(n += 1)} of ${title}.`),
    );
    const sheets = await written();
    const logged: string[] = [];
    const result = await tableRead(llm, {
      brief,
      bible,
      outline,
      sheets,
      rounds: 2,
      log: (line) => logged.push(line),
    });
    // Both rounds rewrite scene 2 of the first script, as its read asked.
    expect(result.rounds.map((r) => r.rewritten)).toEqual([[1], [1], []]);
    expect(result.rounds.map((r) => r.from)).toEqual([0, 0, undefined]);
    expect(calls.scenes.map((c) => /"([^"]+)"/.exec(c.scene)?.[1])).toEqual([
      'Drought',
      'Drought',
    ]);
    expect(result.rounds[2].sheets[1].beats[0].say).toBe(
      'Rewrite 2 of Drought.',
    );
    expect(result.rounds[2].sheets[2]).toBe(sheets[2]);
    expect(logged.join('\n')).toMatch(/from read 1, the best so far/);
    // Still the best read: the first.
    expect(result.best).toBe(0);
    expect(result.sheets).toBe(sheets);
  });

  it('never passes a film a first-time viewer cannot follow: scene 1 is written again with what they missed', async () => {
    const { llm, calls } = llmWith([
      // A high read that loses the viewer, then one they can follow.
      { scores: { ...scores(8), clarity: 3 }, overall: 8.4, scenes: [] },
      { scores: { ...scores(7.5), clarity: 8 }, overall: 7.6, scenes: [] },
    ]);
    const watched: string[] = [];
    const viewer = {
      ...llm,
      studioColdRead: (input: { film: string }) => {
        watched.push(input.film);
        return Promise.resolve({
          value:
            watched.length === 1
              ? {
                  about: 'two children in a garden',
                  confused: ['what they are racing for'],
                  sure: 3,
                }
              : { about: 'a sunflower race by Friday', sure: 8 },
          usage,
        });
      },
    } as unknown as LlmGatewayPort;
    const sheets = await written();
    const result = await tableRead(viewer, {
      brief,
      bible,
      outline,
      sheets,
      rounds: 2,
    });
    // The viewer saw only scene 1, as the film shows it.
    expect(watched[0]).toContain('SCENE 1.');
    expect(watched[0]).not.toContain('SCENE 2.');
    expect(watched[0]).not.toContain('"Planting"');
    expect(watched[0]).not.toContain('sunflower');
    // Capped at its clarity, the first read is below the bar.
    expect(result.rounds[0].read.overall).toBe(3);
    expect(result.rounds[0].rewritten).toContain(0);
    const first = calls.scenes.find((c) => /Planting/.test(c.scene));
    expect(first?.problems?.join(' ')).toMatch(
      /confused by: what they are racing for/,
    );
    expect(first?.problems?.join(' ')).toMatch(/This is the first scene/);
    // The read the viewer can follow is kept.
    expect(result.best).toBe(1);
    expect(result.rounds[1].read.scores.clarity).toBe(8);
  });
});
