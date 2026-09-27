import { outlineOf } from '../../domain/studio/studio';
import type {
  StudioMessageRecord,
  StudioRepository,
} from '../../repositories/studio.repository';
import {
  EVENT_LINES,
  historyOf,
  keyedId,
  logEvent,
  outlineVersion,
} from './studio-log';

const said = (
  patch: Partial<StudioMessageRecord> = {},
): StudioMessageRecord => ({
  id: `m${Math.random()}`,
  showId: 's1',
  episodeId: 'e1',
  role: 'user',
  content: 'Hello',
  meta: null,
  createdAt: new Date(),
  ...patch,
});

const happened = (
  what: 'outline' | 'made',
  episodeId = 'e1',
): StudioMessageRecord =>
  said({
    role: 'assistant',
    episodeId,
    content: `The ${what}`,
    meta: { kind: 'event', event: { what, step: 'outline', line: 'x' } },
  });

/** A thread in memory: what `logEvent` asks of the repository. */
function thread() {
  const kept: StudioMessageRecord[] = [];
  const repo = {
    addMessage: (input: Parameters<StudioRepository['addMessage']>[0]) => {
      const there = input.id && kept.find((m) => m.id === input.id);
      if (there) return Promise.resolve(there);
      const row = said({
        ...input,
        id: input.id ?? `m${kept.length}`,
        meta: input.meta ?? null,
      });
      kept.push(row);
      return Promise.resolve(row);
    },
    listMessages: () => Promise.resolve([...kept]),
  } as unknown as StudioRepository;
  return { kept, repo };
}

describe('the thread as the record', () => {
  it('makes the same id from the same work, shaped as a uuid', () => {
    const id = keyedId('s1', 'job:studio-outline-e1-abc-0');
    expect(id).toBe(keyedId('s1', 'job:studio-outline-e1-abc-0'));
    expect(id).not.toBe(keyedId('s1', 'job:studio-outline-e1-abd-0'));
    expect(id).not.toBe(keyedId('s2', 'job:studio-outline-e1-abc-0'));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('gives the producer what happened as lines from the Studio', () => {
    const history = historyOf([
      said({ content: 'A dog story' }),
      said({ role: 'assistant', content: 'Lovely. Who is it for?' }),
      happened('outline'),
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'A dog story' },
      { role: 'assistant', content: 'Lovely. Who is it for?' },
      { role: 'studio', content: 'The outline' },
    ]);
  });

  it("counts an outline's writings within its own episode", () => {
    const earlier = [
      happened('outline'),
      happened('made'),
      happened('outline', 'e2'),
      said(),
    ];
    expect(outlineVersion(earlier, 'e1')).toBe(2);
    expect(outlineVersion(earlier, 'e2')).toBe(2);
    expect(outlineVersion(earlier, 'e3')).toBe(1);
  });

  it('records an event once for its key, however often it is asked to', async () => {
    const { kept, repo } = thread();
    const at = { showId: 's1', episodeId: 'e1' };
    const event = {
      what: 'scenes' as const,
      step: 'script' as const,
      line: EVENT_LINES.scenes(4),
    };
    await logEvent(repo, at, event, 'job:7');
    await logEvent(repo, at, event, 'job:7');
    await logEvent(repo, at, event, 'job:8');
    await logEvent(repo, at, event);
    expect(kept).toHaveLength(3);
    expect(kept[0]).toMatchObject({
      role: 'assistant',
      episodeId: 'e1',
      content: 'All 4 scenes written',
      meta: { kind: 'event', event },
    });
  });

  it("numbers an outline's writings as they are recorded", async () => {
    const { kept, repo } = thread();
    const outline = outlineOf({
      title: 'Lost',
      scenes: [
        { title: 'Market', summary: 'Bingo runs off.', seconds: 40 },
        { title: 'Home', summary: 'Bingo is found.', seconds: 35 },
      ],
    });
    const at = { showId: 's1', episodeId: 'e1' };
    for (const again of [false, true])
      await logEvent(repo, at, {
        what: 'outline',
        step: 'outline',
        line: EVENT_LINES.outline(outline, again),
      });
    expect(kept.map((m) => m.meta?.event?.version)).toEqual([1, 2]);
    expect(kept.map((m) => m.content)).toEqual([
      'Outline written: “Lost”, 2 scenes, about 1:15',
      'Outline written again: “Lost”, 2 scenes, about 1:15',
    ]);
  });
});

describe('what a check of a scene made as asked says', () => {
  it('says it shows, that it does not yet and never as done, or that it could not look', () => {
    expect(EVENT_LINES.checked(0, 'shown', 'Tobi now climbs out of bed.')).toBe(
      'Scene 1 made again and checked: Tobi now climbs out of bed.',
    );
    expect(EVENT_LINES.checked(2, 'not yet', 'the bed still moves')).toBe(
      "Scene 3 made again, but I couldn't change this yet: the bed still moves. I've passed it on to be fixed.",
    );
    expect(EVENT_LINES.checked(0, 'unchecked')).toBe(
      "Scene 1 made again. I couldn't check it this time: have a look.",
    );
    expect(EVENT_LINES.remake(0)).toBe('Making scene 1 again to check it');
  });
});
