import { briefOf } from '../../business/domain/studio/studio';
import { HOST_ID } from '../../business/domain/studio/studio-host';
import { coldOpen } from '../../business/domain/studio/studio-checkpoint';
import {
  explainerPlay,
  teachBack,
} from '../../business/handlers/studio/studio-engage';
import {
  NO_WORK,
  type CastWork,
} from '../../business/domain/studio/studio-drawings';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import { FakeLlmAdapter } from '../../web/adapters/fake-llm.adapter';
import type { StudioJobData } from '../queues';
import type { SceneProcessor } from './scene.processor';
import { StudioProcessor, studioMakeOf } from './studio.processor';

/**
 * The E9 set on the worker with the fake writer (studio-explainer-plan,
 * Ask 9): a young children's explainer gets its host (three looks offered
 * on the choosing card), its outline's "What next?", a question with
 * answers in the one scene its audience's checks ask it in and in no
 * other, its ideas marked when made, and a player given its checkpoints'
 * default, host, recap and teach-back. A grown-up's gets none of the host
 * or the pauses. Nothing is called but the fake writer.
 */
const at = new Date('2026-09-30T10:00:00Z');

function worker(audience: 'young children' | 'adults') {
  const show: StudioShowRecord = {
    id: 's1',
    userId: 'u1',
    title: 'Plants',
    format: 'explainer',
    brief: briefOf({
      format: 'explainer',
      idea: 'How plants make food',
      audience,
      minutes: 1,
      tone: 'calm',
    }),
    bible: null,
    createdAt: at,
    updatedAt: at,
  };
  const episodes = new Map<string, StudioEpisodeRecord>([
    [
      'e1',
      {
        id: 'e1',
        showId: 's1',
        userId: 'u1',
        number: 1,
        title: 'Episode 1',
        logline: null,
        phase: 'brief',
        busy: 'outline',
        error: null,
        outline: null,
        shareToken: null,
        durationMs: null,
        thumbKey: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
  ]);
  const scenes = new Map<string, StudioSceneRecord>();
  const messages: StudioMessageRecord[] = [];
  const repo: Partial<StudioRepository> = {
    findShow: () => Promise.resolve({ ...show }),
    findEpisode: (id) => Promise.resolve(episodes.get(id) ?? null),
    listEpisodes: () => Promise.resolve([...episodes.values()]),
    updateShow: (_id, patch) => {
      Object.assign(show, patch);
      return Promise.resolve();
    },
    updateEpisode: (id, patch) => {
      episodes.set(id, { ...episodes.get(id)!, ...patch });
      return Promise.resolve();
    },
    replaceScenes: (episodeId, count) => {
      scenes.clear();
      for (let k = 0; k < count; k += 1)
        scenes.set(`c${k + 1}`, {
          id: `c${k + 1}`,
          episodeId,
          position: k,
          sheet: null,
          sheetHash: null,
          problems: [],
          previousSheet: null,
          status: 'writing',
          step: null,
          error: null,
          sceneKey: null,
          audioKey: null,
          thumbKey: null,
          madeHash: null,
          durationMs: null,
          updatedAt: at,
        });
      return Promise.resolve([...scenes.values()]);
    },
    listScenes: () =>
      Promise.resolve(
        [...scenes.values()].sort((a, b) => a.position - b.position),
      ),
    findScene: (id) => Promise.resolve(scenes.get(id) ?? null),
    updateScene: (id, patch) => {
      scenes.set(id, { ...scenes.get(id)!, ...patch });
      return Promise.resolve();
    },
    addMessage: (input) => {
      const message: StudioMessageRecord = {
        id: input.id ?? `m${messages.length}`,
        showId: input.showId,
        episodeId: input.episodeId,
        role: input.role,
        content: input.content,
        meta: input.meta ?? null,
        createdAt: at,
      };
      messages.push(message);
      return Promise.resolve(message);
    },
    listMessages: () => Promise.resolve([...messages]),
  };
  const fake = new FakeLlmAdapter();
  // What each lesson's writer was asked: whether its scene asks a question.
  const profiles: string[] = [];
  const llm = new Proxy(fake, {
    get(target, name: string) {
      if (name === 'sceneScript')
        return (input: Parameters<FakeLlmAdapter['sceneScript']>[0]) => {
          profiles.push(input.profile ?? '');
          return target.sceneScript(input);
        };
      return (target as unknown as Record<string, unknown>)[name];
    },
  }) as unknown as LlmGatewayPort;
  const recorded: string[] = [];
  let work: CastWork = NO_WORK;
  const cast = {
    changeWork: (_id: string, change: (was: CastWork) => CastWork) => {
      work = change(work);
      return Promise.resolve(work);
    },
    forgetChanged: () => Promise.resolve(),
  };
  const processor = new StudioProcessor(
    repo as StudioRepository,
    llm,
    {
      record: (row: { task: string }) => {
        recorded.push(row.task);
        return Promise.resolve();
      },
    },
    { delete: () => Promise.resolve() } as never,
    { prepareStory: () => Promise.resolve() } as unknown as SceneProcessor,
    {} as never,
    cast as never,
    { enqueueStudio: () => Promise.resolve() } as never,
  );
  const run = (patch: Partial<StudioJobData>) =>
    processor.process(
      {
        kind: 'outline',
        showId: 's1',
        episodeId: 'e1',
        userId: 'u1',
        ...patch,
      },
      { attemptsMade: 1, isFinalAttempt: true, jobId: patch.kind ?? 'j' },
    );
  return {
    show,
    episodes,
    scenes,
    messages,
    run,
    recorded,
    profiles,
    work: () => work,
    llm,
  };
}

describe("a children's explainer's checkpoints, host, ideas and end, made on the worker with the fake writer", () => {
  it('gives the show a host and offers their three looks on the choosing card', async () => {
    const w = worker('young children');
    await w.run({ kind: 'outline' });
    const host = w.show.bible?.characters.find((c) => c.host);
    expect(host).toMatchObject({ id: HOST_ID, kind: 'person' });
    expect(w.work().candidates[HOST_ID]).toMatchObject({ first: true });
    expect(w.work().candidates[HOST_ID].options).toHaveLength(3);
    const offered = w.messages.find(
      (m) =>
        (m.meta as { event?: { characterId?: string } } | null)?.event
          ?.characterId === HOST_ID,
    );
    expect(offered?.content).toMatch(/will host the show/);
    // Its "What next?" comes with the outline: no call of its own.
    expect(w.episodes.get('e1')!.outline!.next).toHaveLength(3);
    expect(w.recorded.filter((t) => t === 'studio_write')).toHaveLength(2);
  });

  it('asks a question with answers only in the scene its checks space, and marks each scene’s ideas as it is made', async () => {
    const w = worker('young children');
    await w.run({ kind: 'outline' });
    await w.run({ kind: 'script' });
    expect(
      w.profiles.map((p) => /asks the viewer one question/.test(p)),
    ).toEqual([false, true]);
    const rows = [...w.scenes.values()];
    const asked = rows.map((r) =>
      r.sheet?.kind === 'explainer'
        ? r.sheet.draft.beats.filter((b) => b.choices?.length).length
        : -1,
    );
    expect(asked).toEqual([0, 1]);
    // The first scene opens on a definition, not a hook: its cold open only
    // rides along on a send-back, never one alone, so each scene is written once.
    expect(
      coldOpen(
        (
          rows[0].sheet as Extract<
            StudioSceneRecord['sheet'],
            { kind: 'explainer' }
          >
        ).draft.beats,
        110,
      ),
    ).not.toBeNull();
    expect(w.recorded.filter((t) => t === 'scene_write')).toHaveLength(2);

    const episode = w.episodes.get('e1')!;
    const made = studioMakeOf(w.show, episode, rows[1], rows, w.show.bible!);
    const question = made.script!.beats.findIndex((b) => b.choices);
    expect(question).toBeGreaterThan(0);
    const scene = made.finish!({
      beats: made.script!.beats.map((b, k) => ({
        text: b.say,
        startMs: k * 2000,
        endMs: k * 2000 + 1500,
        words: [],
      })),
      things: [],
    } as never);
    expect(scene.ideas?.[0]).toMatchObject({ beat: 0 });

    // The player's extras: pauses on for children, the host's faces, the recap, "What next?", teach-back.
    const extras = explainerPlay(
      w.show,
      episode.outline,
      rows.map((r) => r.sheet),
    );
    expect(extras.pauses).toBe(true);
    expect(extras.host?.faces.neutral).toMatch(/^<svg/);
    expect(extras.recap?.length).toBeGreaterThan(0);
    expect(extras.next).toHaveLength(3);
    expect(extras.teachBack).toBe(true);
  });

  it('checks a viewer’s explanation in one call, recorded under its own task, and refuses a word or two without a call', async () => {
    const w = worker('young children');
    await w.run({ kind: 'outline' });
    const tasks: string[] = [];
    const record = () => {
      tasks.push('studio_teach_back');
      return Promise.resolve();
    };
    const outline = w.episodes.get('e1')!.outline!;
    expect(await teachBack(w.llm, record, w.show, outline, 'leaf')).toBeNull();
    expect(tasks).toHaveLength(0);
    const checked = await teachBack(
      w.llm,
      record,
      w.show,
      outline,
      'A leaf in the sun makes sugar for the plant.',
    );
    expect(checked?.got).toEqual(['a leaf in the sun']);
    expect(checked?.reply).toBeTruthy();
    expect(tasks).toEqual(['studio_teach_back']);
  });

  it("gives a grown-up's explainer no host and no pauses by default, but its recap and teach-back still", async () => {
    const w = worker('adults');
    await w.run({ kind: 'outline' });
    await w.run({ kind: 'script' });
    expect(w.show.bible?.characters.some((c) => c.host)).toBe(false);
    expect(w.work().candidates[HOST_ID]).toBeUndefined();
    const rows = [...w.scenes.values()];
    const extras = explainerPlay(
      w.show,
      w.episodes.get('e1')!.outline,
      rows.map((r) => r.sheet),
    );
    expect(extras.pauses).toBe(false);
    expect(extras.host).toBeUndefined();
    expect(extras.teachBack).toBe(true);
  });
});
