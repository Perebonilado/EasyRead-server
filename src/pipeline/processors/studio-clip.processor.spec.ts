import { briefOf } from '../../business/domain/studio/studio';
import { CLIP_CARD } from '../../business/domain/studio/studio-clip';
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
 * An explainer with a story clip (studio-explainer-plan, Ask 5), on the
 * worker with the fake writer: its cast is the clips' (a nurse and a
 * child, in a clinic), its outline is lesson → clip → lesson, the clip is
 * written as a story's scene without thinking and recorded as the
 * Studio writer's call, the lessons as the lesson writer's; the cast and
 * the clinic are drawn once before the film's three scenes are made; the
 * clip is staged with a light narrator and its freeze, and the lesson
 * after it opens on its card.
 */

const at = new Date('2026-09-30T10:00:00Z');

function worker() {
  const show: StudioShowRecord = {
    id: 's1',
    userId: 'u1',
    title: 'Fever',
    format: 'explainer',
    brief: briefOf({
      format: 'explainer',
      idea: 'What a fever is, for young children',
      audience: 'children',
      minutes: 1.2,
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
  // The fake writer, watched: what the scene writer was asked, and how.
  const fake = new FakeLlmAdapter();
  const asked: { quick?: boolean; scene: string }[] = [];
  const llm = new Proxy(fake, {
    get(target, name: string) {
      if (name === 'studioScene')
        return (input: { quick?: boolean; scene: string }) => {
          asked.push(input);
          return target.studioScene(input);
        };
      return (target as unknown as Record<string, unknown>)[name];
    },
  }) as unknown as LlmGatewayPort;
  const recorded: string[] = [];
  const queued: StudioJobData[] = [];
  const prepared: { places: string[]; characters: string[] }[] = [];
  const stage = {
    prepareStory: (
      story: { bible: { places: { id: string; layout?: unknown }[] } },
      _id: string,
      _who: string,
      only: { characters: Set<string>; places: Set<string> },
    ) => {
      prepared.push({
        places: story.bible.places
          .filter((p) => only.places.has(p.id) && p.layout)
          .map((p) => p.id),
        characters: [...only.characters].sort(),
      });
      return Promise.resolve();
    },
  } as unknown as SceneProcessor;
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
    stage,
    {} as never,
    {} as never,
    {
      enqueueStudio: (jobs: StudioJobData[]) => {
        queued.push(...jobs);
        return Promise.resolve();
      },
    } as never,
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
  return { show, episodes, scenes, run, asked, recorded, queued, prepared };
}

describe('an explainer with a story clip, made on the worker with the fake writer', () => {
  it('outlines lesson → clip → lesson with a cast the kits draw, writes each as what it is, and draws the clinic once', async () => {
    const w = worker();
    await w.run({ kind: 'outline' });
    // The clips' people, and no host: the audience is never on screen
    // (studio-host, explainer-animation-plan §10).
    expect(w.show.bible?.characters.map((c) => c.id)).toEqual(['amara', 'sam']);
    const outline = w.episodes.get('e1')!.outline!;
    expect(outline.scenes.map((s) => s.kind ?? 'lesson')).toEqual([
      'lesson',
      'clip',
      'lesson',
    ]);
    expect(outline.scenes[1]).toMatchObject({
      set: 'clinic',
      cast: ['amara', 'sam'],
      hook: 'Did you see the number on the thermometer?',
    });

    w.recorded.length = 0;
    await w.run({ kind: 'script' });
    const rows = [...w.scenes.values()];
    expect(rows.map((r) => r.sheet?.kind)).toEqual([
      'explainer',
      'story',
      'explainer',
    ]);
    // The clip: written once, as a story's scene, without thinking.
    expect(w.asked).toHaveLength(1);
    expect(w.asked[0].quick).toBe(true);
    expect(w.asked[0].scene).toMatch(/story clip inside an animated lesson/);
    const clip = rows[1].sheet as Extract<
      StudioSceneRecord['sheet'],
      { kind: 'story' }
    >;
    expect(clip.title).toBe('Thirty-nine degrees is a fever');
    expect(clip.inserts).toEqual([{ beat: 1, thing: 'thermometer' }]);
    expect(clip.beats[2]).toMatchObject({ kind: 'pause', seconds: 0.6 });
    // The lesson after it opens on the clip's hook.
    const after = rows[2].sheet as Extract<
      StudioSceneRecord['sheet'],
      { kind: 'explainer' }
    >;
    expect(after.draft.beats[0].say).toMatch(/thermometer/i);
    // Each call under its own task: the clip the Studio writer's, the lessons the lesson writer's.
    expect(w.recorded.filter((t) => t === 'studio_write')).toHaveLength(1);
    expect(
      w.recorded.filter((t) => t === 'scene_write').length,
    ).toBeGreaterThanOrEqual(2);

    // The cast and the clinic drawn once, from code's layout; then all three made.
    await w.run({ kind: 'prepare', sceneIds: rows.map((r) => r.id) });
    expect(w.prepared).toEqual([
      { places: ['clinic'], characters: ['amara', 'sam'] },
    ]);
    expect(w.queued.filter((j) => j.kind === 'make')).toHaveLength(3);
  });

  it('stages the clip with a light narrator and its freeze, and opens the lesson after it on its card', async () => {
    const w = worker();
    await w.run({ kind: 'outline' });
    await w.run({ kind: 'script' });
    const rows = [...w.scenes.values()];
    const episode = w.episodes.get('e1')!;
    const clip = studioMakeOf(w.show, episode, rows[1], rows, w.show.bible!);
    expect(clip.story?.bible.places[0].id).toBe('clinic');
    expect(clip.story?.bible.places[0].layout).toBeDefined();
    const frozen = clip.finish!({
      durationMs: 9000,
      beats: [{ text: 'a', startMs: 0, endMs: 2000, words: [] }],
      effects: [{ atMs: 2500, untilMs: 4500, shot: { kind: 'insert' } }],
    } as never);
    expect(frozen.freeze).toEqual({
      atMs: 3400,
      ms: 600,
      label: 'Thirty-nine degrees is a fever',
    });

    const lesson = studioMakeOf(w.show, episode, rows[2], rows, w.show.bible!);
    expect(lesson.script?.cast.some((c) => c.id === CLIP_CARD)).toBe(true);
    expect(lesson.script?.steps[0].stage?.show[0]).toBe(CLIP_CARD);
    expect(lesson.drawn?.has(CLIP_CARD)).toBe(true);
    const made = lesson.finish!({
      things: [{ id: CLIP_CARD, kind: 'drawing' }],
    } as never);
    expect(made.things[0]).toMatchObject({ still: { sceneId: rows[1].id } });
    // The lesson before the clip has no card.
    expect(
      studioMakeOf(w.show, episode, rows[0], rows, w.show.bible!).drawn,
    ).toBeUndefined();
  });
});
