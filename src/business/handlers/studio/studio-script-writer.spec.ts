/**
 * A story's script written fast (Richard, 2026-09-30: "Cut the
 * rewrites", "it's taking forever"): each scene goes back to its writer
 * at most once, and only for what the stage cannot play or the plan's
 * cast left out, never for a craft note; the scenes are written a few at
 * once, each from its plan and the plan of the scene before, and then
 * carried on from one to the next by code, in order, ending as the same
 * script written one after another would.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bibleOf,
  briefOf,
  outlineOf,
  storySheetOf,
  type StorySheet,
} from '../../domain/studio/studio';
import {
  endStateOf,
  mendSheet,
  withFound,
  type EndState,
} from '../../domain/studio/studio-check';
import type { LlmGatewayPort } from '../../ports/llm.port';
import { writeStorySheet } from './studio-scenes';
import {
  carryOn,
  scriptSettings,
  writeStoryScript,
} from './studio-script-writer';

const fixture = (dir: string, file: string): unknown =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../domain/studio/__fixtures__', dir, file),
      'utf8',
    ),
  );
const usage = { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 };

type Asked = { scene: string; before: string; problems?: string[] };

/** A writer that answers each scene with `answer(title, asked)`, and counts what it was asked. */
function writer(answer: (title: string, asked: Asked) => unknown) {
  const asked: Asked[] = [];
  const llm = {
    studioScene: (input: Asked) => {
      asked.push(input);
      const title = /"([^"]+)"/.exec(input.scene)?.[1] ?? '';
      return Promise.resolve({ value: answer(title, input), usage });
    },
  } as unknown as LlmGatewayPort;
  return { llm, asked };
}

describe('a scene goes back to its writer at most once, and only for what the stage cannot play', () => {
  const bible = bibleOf(fixture('tobi', 'bible.json'));
  const sheet = fixture('tobi', 's1-sheet.json') as Record<string, unknown>;
  const outline = outlineOf({
    title: 'The First Day',
    logline: 'Tobi gets ready for school.',
    scenes: [
      {
        title: 'Up Before the Alarm',
        summary: 'Tobi gets up and dressed.',
        set: 'bedroom',
        cast: ['tobi', 'mama'],
        seconds: 45,
      },
    ],
  });
  const storyteller = briefOf({
    format: 'story',
    idea: 'A first day at school',
    audience: 'young children',
    minutes: 1,
    narrator: 'storyteller',
  });

  it('a sheet whose lines have no aims is put right by code, not written again', async () => {
    const { llm, asked } = writer(() => sheet);
    const logged: string[] = [];
    const written = await writeStorySheet(llm, {
      brief: storyteller,
      bible,
      outline,
      k: 0,
      before: null,
      planned: 45,
      log: (line) => logged.push(line),
    });
    expect(asked).toHaveLength(1);
    expect(logged.some((line) => /^goes back/.test(line))).toBe(false);
    // Every line has an aim now, from its words or its own.
    expect(
      written.sheet.beats
        .filter((b) => b.kind === 'line' && b.aim)
        .map((b) => b.aim).length,
    ).toBeGreaterThan(0);
    // The first ask carried the checklist of what code holds it to.
    expect(asked[0].scene).toMatch(/Before you answer, check each of these/);
  });

  it('narration in a film with no narrator goes back once, and is repaired by code if it comes back so', async () => {
    const none = briefOf({
      format: 'story',
      idea: 'A first day at school',
      audience: 'young children',
      minutes: 1,
      narrator: 'none',
    });
    const { llm, asked } = writer(() => sheet);
    const logged: string[] = [];
    const written = await writeStorySheet(llm, {
      brief: none,
      bible,
      outline,
      k: 0,
      before: null,
      planned: 45,
      log: (line) => logged.push(line),
    });
    expect(asked).toHaveLength(2);
    expect(asked[1].problems?.join(' ')).toMatch(/narrat/i);
    expect(logged.some((line) => /^repaired/.test(line))).toBe(true);
    expect(written.sheet.beats.some((b) => b.kind === 'narration')).toBe(false);
    expect(written.problems.filter((p) => p.level === 'error')).toEqual([]);
  });

  it('someone the plan puts in the scene who never comes in sends it back once', async () => {
    const withMaya = outlineOf({
      ...outline,
      scenes: [{ ...outline.scenes[0], cast: ['tobi', 'mama', 'maya'] }],
    });
    const { llm, asked } = writer(() => sheet);
    await writeStorySheet(llm, {
      brief: storyteller,
      bible,
      outline: withMaya,
      k: 0,
      before: null,
      planned: 45,
    });
    expect(asked).toHaveLength(2);
    expect(asked[1].problems?.[0]).toMatch(/^Maya is in this scene's plan/);
  });
});

describe('the scenes written a few at once, then carried on in order', () => {
  const bible = bibleOf(fixture('maya', 'bible.json'));
  const raws = [1, 2, 3, 4, 5].map(
    (k) => fixture('maya', `s${k}-sheet.json`) as Record<string, unknown>,
  );
  const outline = outlineOf({
    title: 'Pip Runs Away',
    logline: 'Maya must find Pip before dark.',
    scenes: raws.map((r) => ({
      title: r.title,
      summary: `${String(r.title)}.`,
      set: r.set,
      cast: (r.onStage as { who: string }[]).map((p) => p.who),
      seconds: 30,
    })),
  });
  const brief = briefOf({
    format: 'story',
    idea: 'a dog runs off',
    audience: 'children',
    minutes: 2.5,
  });
  const fresh = () => JSON.parse(JSON.stringify(bible)) as typeof bible;

  it('never has more than `writers` scenes in hand, and keeps the scene order whatever order they come back in', async () => {
    let inHand = 0;
    let most = 0;
    const order: number[] = [];
    const llm = {
      studioScene: async (input: Asked) => {
        inHand += 1;
        most = Math.max(most, inHand);
        const title = /"([^"]+)"/.exec(input.scene)?.[1] ?? '';
        const k = raws.findIndex((r) => r.title === title);
        // The later scenes come back first.
        await new Promise((done) => setTimeout(done, (5 - k) * 5));
        inHand -= 1;
        order.push(k);
        return { value: raws[k], usage };
      },
    } as unknown as LlmGatewayPort;
    const told: number[] = [];
    const script = await writeStoryScript(llm, {
      brief,
      bible: fresh(),
      outline,
      writers: 3,
      onWritten: (k) => {
        told.push(k);
      },
    });
    expect(most).toBe(3);
    expect(order).not.toEqual([0, 1, 2, 3, 4]);
    expect(told.sort()).toEqual([0, 1, 2, 3, 4]);
    expect(script.scenes.map((s) => s.sheet.title)).toEqual(
      raws.map((r) => r.title),
    );
  });

  it('tells each scene after the first how the one before is planned to end, not how it was written', async () => {
    const { llm, asked } = writer((title) =>
      raws.find((r) => r.title === title),
    );
    await writeStoryScript(llm, { brief, bible: fresh(), outline, writers: 3 });
    const byTitle = (t: unknown) =>
      asked.find((a) => a.scene.includes(`"${String(t)}"`))!;
    expect(byTitle(raws[0].title).before).toMatch(/^This is the first scene/);
    expect(byTitle(raws[1].title).before).toMatch(
      /^The scene before \(scene 1, "The Great Escape"\) is being written at the same time/,
    );
  });

  it('ends as the same script written one after another would, the show grown the same', async () => {
    const answer = (title: string) => raws.find((r) => r.title === title);
    // One after another, each from how the one before really ended.
    let grown = fresh();
    let before: EndState | null = null;
    const inTurn: StorySheet[] = [];
    for (let k = 0; k < raws.length; k += 1) {
      const written = await writeStorySheet(writer(answer).llm, {
        brief,
        bible: grown,
        outline,
        k,
        before,
        planned: 30,
      });
      inTurn.push(written.sheet);
      grown = withFound(
        grown,
        written.sheet.set,
        mendSheet(written.sheet, grown, before),
      );
      before = endStateOf(written.sheet, grown, before);
    }
    const script = await writeStoryScript(writer(answer).llm, {
      brief,
      bible: fresh(),
      outline,
      writers: 3,
    });
    expect(script.scenes.map((s) => s.sheet)).toEqual(inTurn);
    expect(script.bible.sets).toEqual(grown.sets);
    expect(script.bible.things).toEqual(grown.things);
  });

  it('carries a thing on in the hand the scene before left it in', () => {
    const one = storySheetOf(raws[0]);
    // Scene 2 on the same yard, written beside scene 1: it has Maya with
    // the ball, though scene 1 leaves it in Pip's mouth.
    const two = storySheetOf({
      ...raws[0],
      title: 'Back Again',
      onStage: [
        { who: 'maya', spot: 'left', pose: 'standing', holding: 'ball' },
        { who: 'pip', spot: 'right', pose: 'standing', holding: null },
      ],
      beats: [
        {
          kind: 'line',
          who: 'maya',
          to: 'pip',
          say: 'Give me the ball, Pip.',
          aim: 'orders',
          from: 'here',
        },
        {
          kind: 'line',
          who: 'maya',
          to: 'pip',
          say: 'Good dog. Now sit.',
          aim: 'praises',
          from: 'here',
        },
      ],
      camera: [],
    });
    const { scenes } = carryOn([one, two], fresh(), outline, null);
    // Scene 1 as carried (mended from its words) ends with the ball in Pip's mouth.
    expect(scenes[1].before?.held).toContainEqual({
      who: 'pip',
      thing: 'ball',
    });
    expect(scenes[1].before).toEqual(
      endStateOf(scenes[0].sheet, fresh(), null),
    );
    const opening = scenes[1].sheet.onStage;
    expect(opening.find((p) => p.who === 'pip')?.holding).toBe('ball');
    expect(opening.find((p) => p.who === 'maya')?.holding ?? null).toBeNull();
  });

  it('stops asking once a scene cannot be written, and says why', async () => {
    let calls = 0;
    const llm = {
      studioScene: () => {
        calls += 1;
        return Promise.reject(new Error('Insufficient Balance'));
      },
    } as unknown as LlmGatewayPort;
    await expect(
      writeStoryScript(llm, { brief, bible: fresh(), outline, writers: 2 }),
    ).rejects.toThrow('Insufficient Balance');
    expect(calls).toBe(2);
  });
});

describe('the settings', () => {
  it('write three at once, read once with no rewrites and no retelling, and send one story answer back, by default', () => {
    expect(scriptSettings(() => undefined)).toEqual({
      writers: 3,
      tableRead: true,
      rounds: 0,
      retell: false,
      storySendBacks: 1,
    });
    const set: Record<string, string> = {
      STUDIO_SCENE_WRITERS: '1',
      STUDIO_TABLEREAD: 'off',
      STUDIO_TABLEREAD_ROUNDS: '2',
      STUDIO_RETELL: 'on',
      STUDIO_STORY_SENDBACKS: '0',
    };
    expect(scriptSettings((name) => set[name])).toEqual({
      writers: 1,
      tableRead: false,
      rounds: 2,
      retell: true,
      storySendBacks: 0,
    });
  });
});
