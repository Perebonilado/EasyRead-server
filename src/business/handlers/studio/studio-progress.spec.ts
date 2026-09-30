import {
  noticeRecovered,
  noticeRetry,
  progressNow,
} from '../../domain/work-progress';
import type {
  StudioActivity,
  StudioSceneRecord,
} from '../../repositories/studio.repository';
import {
  followStudioJob,
  jobSays,
  rewriteSays,
  sendBackSays,
  type StudioJobShape,
} from './studio-progress';
import { activityDto } from './studio-views';

/** The rows a job says things on, and every write made to them, in order. */
function rows(scenes: Partial<StudioSceneRecord>[] = []) {
  const kept = new Map<string, StudioActivity | null>();
  const writes: { of: string; activity: StudioActivity | null }[] = [];
  const list = scenes.map(
    (s, k) =>
      ({
        id: `s${k + 1}`,
        episodeId: 'e1',
        position: k,
        sheetHash: `h${k + 1}`,
        ...s,
      }) as StudioSceneRecord,
  );
  return {
    kept,
    writes,
    now: (of: string) => kept.get(of) ?? null,
    repo: {
      noteActivity: (
        of: { episodeId: string } | { sceneId: string },
        activity: StudioActivity | null,
      ) => {
        const id = 'sceneId' in of ? of.sceneId : of.episodeId;
        kept.set(id, activity);
        writes.push({ of: id, activity });
        return Promise.resolve();
      },
      listScenes: () => Promise.resolve(list),
      findScene: (id: string) =>
        Promise.resolve(list.find((s) => s.id === id) ?? null),
    },
  };
}

const job = (patch: Partial<StudioJobShape> = {}): StudioJobShape => ({
  episodeId: 'e1',
  kind: 'script',
  attempt: 1,
  attempts: 2,
  backoffMs: 20_000,
  ...patch,
});

/** Lets the writes queued so far land. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the Studio says what it is doing', () => {
  it('says a step on the episode, and clears it when the job ends', async () => {
    const r = rows();
    let during: StudioActivity | null = null;
    await followStudioJob(r.repo, job(), async () => {
      progressNow({ says: 'Reading the whole script' });
      await flush();
      during = r.now('e1');
    });
    expect(during).toMatchObject({ says: 'Reading the whole script' });
    expect(r.now('e1')).toBeNull();
  });

  it('says a scene being fixed on its row, until that scene is done', async () => {
    const r = rows([{}, {}, {}]);
    const seen: (StudioActivity | null)[] = [];
    await followStudioJob(r.repo, job(), async () => {
      progressNow(
        sendBackSays(0, ['Mia holds the cup in beat 2 but never took it.']),
      );
      await flush();
      await flush();
      seen.push(r.now('s1'));
      progressNow({ scene: 0, done: true });
      await flush();
      await flush();
      seen.push(r.now('s1'));
    });
    expect(seen[0]).toMatchObject({
      says: "Scene 1: fixing who's holding what",
      short: 'Fixing',
      sheetHash: 'h1',
    });
    expect(seen[1]).toBeNull();
  });

  it('says a retry of the writer, counted by call, and clears it when the call answers', async () => {
    const r = rows();
    const seen: (StudioActivity | null)[] = [];
    await followStudioJob(r.repo, job(), async () => {
      noticeRetry({ service: 'writer', call: 'a', of: 3, status: 429 });
      await flush();
      seen.push(r.now('e1'));
      noticeRetry({ service: 'writer', call: 'a', of: 3, status: 429 });
      await flush();
      seen.push(r.now('e1'));
      // Another call answering does not end this one's trouble.
      noticeRecovered('writer', 'b');
      await flush();
      seen.push(r.now('e1'));
      noticeRecovered('writer', 'a');
      await flush();
      seen.push(r.now('e1'));
    });
    expect(seen[0]?.retry).toMatchObject({
      says: 'The writer is busy, trying again (2 of 3)',
      reason: 'The writer is busy',
      attempt: 2,
      of: 3,
    });
    expect(seen[1]?.retry?.says).toBe(
      'The writer is busy, trying again (3 of 3)',
    );
    expect(seen[2]?.retry).toBeDefined();
    // The error cleared on success.
    expect(seen[3]).toBeNull();
  });

  it('says a voice’s trouble in its own words when it knows them', async () => {
    const r = rows();
    const seen: (StudioActivity | null)[] = [];
    await followStudioJob(r.repo, job(), async () => {
      noticeRetry({
        service: 'voice',
        attempt: 2,
        of: 6,
        status: 429,
        reason: 'ElevenLabs is at its limit of 5 at once on the Creator plan',
      });
      await flush();
      seen.push(r.now('e1'));
    });
    expect(seen[0]?.retry).toMatchObject({
      reason: 'ElevenLabs is at its limit of 5 at once on the Creator plan',
      says: 'ElevenLabs is at its limit of 5 at once on the Creator plan, trying again (2 of 6)',
    });
  });

  it('says a call given up on for want of credit, until another answers', async () => {
    const r = rows();
    const seen: (StudioActivity | null)[] = [];
    await followStudioJob(r.repo, job(), async () => {
      noticeRetry({
        service: 'writer',
        call: 'a',
        of: 3,
        status: 402,
        body: '{"error":{"message":"Insufficient Balance"}}',
        final: true,
      });
      await flush();
      seen.push(r.now('e1'));
      noticeRecovered('writer', 'fallback');
      await flush();
      seen.push(r.now('e1'));
    });
    expect(seen[0]?.retry).toMatchObject({
      says: 'The writing service is out of credit',
      final: true,
    });
    expect(seen[1]).toBeNull();
  });

  it('says the voice waiting its turn', async () => {
    const r = rows([{}, {}]);
    let during: StudioActivity | null = null;
    await followStudioJob(
      r.repo,
      job({ kind: 'make', sceneId: 's2' }),
      async () => {
        noticeRetry({
          service: 'voice',
          status: 429,
          waiting: true,
          waitMs: 40_000,
        });
        await flush();
        during = r.now('s2');
      },
    );
    expect(during).toMatchObject({
      retry: {
        says: 'The voice service is at its limit, waiting 40 s',
        waitSeconds: 40,
      },
    });
    expect(r.now('s2')).toBeNull();
  });

  it('a job that throws says it will be tried again, and why; the next try clears it', async () => {
    const r = rows([{}, {}]);
    await expect(
      followStudioJob(r.repo, job(), async () => {
        progressNow(sendBackSays(1, ['too long for its seconds']));
        await flush();
        throw Object.assign(new Error('Insufficient Balance'), {
          statusCode: 402,
        });
      }),
    ).rejects.toThrow('Insufficient Balance');
    expect(r.now('e1')?.retry).toMatchObject({
      says: 'The writing service is out of credit, trying again in 20 s (2 of 2)',
      attempt: 2,
      of: 2,
    });
    // The scene it spoke of is not left saying it.
    expect(r.now('s2')).toBeNull();
    await followStudioJob(r.repo, job({ attempt: 2 }), () => Promise.resolve());
    expect(r.now('e1')).toBeNull();
  });

  it('a scene written again says so on its row from the start', async () => {
    const r = rows([{}, {}, {}]);
    let during: StudioActivity | null = null;
    await followStudioJob(r.repo, job({ kind: 'scene', sceneId: 's3' }), () => {
      during = r.now('s3');
      return Promise.resolve();
    });
    expect(during).toMatchObject({
      says: 'Writing scene 3 again',
      short: 'Rewriting',
    });
    expect(r.now('s3')).toBeNull();
  });

  it('writes a row only when what it says changes', async () => {
    const r = rows();
    await followStudioJob(r.repo, job(), async () => {
      progressNow({ says: 'Reading the whole script' });
      progressNow({ says: 'Reading the whole script' });
      progressNow({ says: 'Reading the whole script' });
      await flush();
    });
    const said = r.writes.filter(
      (w) => w.activity?.says === 'Reading the whole script',
    );
    expect(said).toHaveLength(1);
  });

  it('never breaks the job when the rows cannot be written', async () => {
    const r = rows();
    const repo = {
      ...r.repo,
      noteActivity: () => Promise.reject(new Error('db down')),
    };
    await expect(
      followStudioJob(repo, job(), () => {
        progressNow({ says: 'x' });
        return Promise.resolve('done');
      }),
    ).resolves.toBe('done');
  });
});

describe('the words for steps', () => {
  it('a scene sent back for its length is made shorter', () => {
    expect(sendBackSays(2, ['The scene runs too long: 48s for 30s'])).toEqual({
      scene: 2,
      says: 'Making scene 3 shorter',
      short: 'Shortening',
    });
  });

  it('a rewrite says why, from its first note', () => {
    expect(
      rewriteSays(4, [
        'The viewer missed the stakes: say what Ada loses if the shop closes.',
        'Keep how it ends.',
      ]),
    ).toEqual({
      scene: 4,
      says: 'Rewriting scene 5 (the viewer missed the stakes)',
      short: 'Rewriting',
    });
  });

  it('a job whose card says it already says nothing more as it starts', () => {
    expect(jobSays({ kind: 'script' }, null)).toBeNull();
    expect(jobSays({ kind: 'prepare' }, null)).toEqual({
      says: 'Drawing the cast for the film',
    });
    expect(jobSays({ kind: 'scene', picture: true }, 1)).toEqual({
      says: 'Scene 2: fixing what its pictures show wrong',
      short: 'Fixing',
    });
  });
});

describe('what the page is shown', () => {
  const at = new Date('2026-09-30T12:00:00Z');
  const said = (patch: Partial<StudioActivity> = {}): StudioActivity => ({
    says: 'Reading the whole script',
    at: at.toISOString(),
    ...patch,
  });

  it('only while there is work in hand', () => {
    expect(activityDto(said(), true, at)).toMatchObject({
      says: 'Reading the whole script',
      short: null,
      retry: null,
    });
    expect(activityDto(said(), false, at)).toBeNull();
  });

  it('never left over from a job that died long ago', () => {
    const later = new Date(at.getTime() + 31 * 60_000);
    expect(activityDto(said(), true, later)).toBeNull();
  });

  it('about a scene, only while its sheet is the one it was said of', () => {
    const fixing = said({ says: 'Scene 1: fixing', sheetHash: 'h1' });
    expect(activityDto(fixing, true, at, 'h1')).not.toBeNull();
    expect(activityDto(fixing, true, at, 'h2')).toBeNull();
  });

  it('a retry with its tries', () => {
    expect(
      activityDto(
        said({
          retry: {
            says: 'The writer is busy, trying again (2 of 3)',
            reason: 'The writer is busy',
            attempt: 2,
            of: 3,
          },
        }),
        true,
        at,
      )?.retry,
    ).toEqual({
      says: 'The writer is busy, trying again (2 of 3)',
      reason: 'The writer is busy',
      attempt: 2,
      of: 3,
      waitSeconds: null,
      final: false,
    });
  });
});
