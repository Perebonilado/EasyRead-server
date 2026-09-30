import {
  BOARD_MOST,
  FRAME_MOST,
  boardArea,
  boardOf,
  freeCellNear,
  keepIds,
  type BoardCarry,
} from './scene-board';
import { composeScene } from './scene-compose';
import { STAGINGS } from './scene-layout';
import type { SceneScript, SceneThing } from './scene-script';
import type { TimedBeat } from './scene-timing';

const drawing = (id: string, name = id): SceneThing => ({
  id,
  kind: 'drawing',
  name,
  brief: name,
  motion: '',
  parts: [],
  states: [],
  shape: 'square',
  sound: null,
});

/** A lesson whose every sentence names one thing and puts it on the stage, each linked to the one before. */
function chain(
  ids: string[],
  extra: { say?: string[]; delivery?: 'recap' }[] = [],
): SceneScript {
  const says = ids.map((id) => `Here is the ${id} now.`);
  for (const one of extra) says.push(...(one.say ?? []));
  return {
    fit: 'good',
    fitReason: null,
    title: 'Chain',
    mood: 'calm',
    beats: says.map((say, i) => ({
      say,
      pause: 'short',
      delivery:
        i >= ids.length && extra.some((e) => e.delivery === 'recap')
          ? 'recap'
          : 'explain',
    })),
    cast: ids.map((id) => drawing(id)),
    steps: ids.map((id, i) => ({
      at: { beat: i, phrase: `the ${id}` },
      word: 2,
      stage: {
        layout: 'row',
        show: [id],
        arrows: i
          ? [{ from: ids[i - 1], to: id, label: null, flow: false }]
          : [],
      },
      effects: [],
    })),
  };
}

const stagesOf = (script: SceneScript) =>
  script.steps.flatMap((s) => (s.stage?.board ? [s.stage] : []));

describe('a continuous build on its board (part C)', () => {
  it('never moves a thing once placed when a newcomer arrives', () => {
    const { script } = boardOf(
      chain(['sun', 'sea', 'vapour', 'cloud', 'rain']),
      null,
    );
    const stages = stagesOf(script);
    expect(stages).toHaveLength(5);
    for (let k = 1; k < stages.length; k += 1)
      for (const [id, cell] of Object.entries(stages[k - 1].board!.cells))
        expect(stages[k].board!.cells[id]).toEqual(cell);
    // Everything stays on: the diagram grows.
    expect(stages[4].show).toEqual(['sun', 'sea', 'vapour', 'cloud', 'rain']);
    // And its arrows stay drawn.
    expect(stages[4].arrows).toHaveLength(4);
  });

  it('places a newcomer beside what it connects to', () => {
    expect(freeCellNear([[1, 1]], [[1, 1]], [1, 1])).toEqual([2, 1]);
    expect(freeCellNear([], [], null)).toEqual([0, 1]);
  });

  it('keeps every place as composed the same while the board grows', () => {
    const script = boardOf(chain(['sun', 'sea', 'vapour']), null).script;
    const beats: TimedBeat[] = script.beats.map((b, i) => ({
      text: b.say,
      startMs: 1000 + i * 3000,
      endMs: 3500 + i * 3000,
      words: b.say
        .split(' ')
        .map((w, k) => [
          0,
          0,
          1000 + i * 3000 + k * 400,
          1300 + i * 3000 + k * 400,
        ]),
    }));
    const { scene } = composeScene({
      script,
      drawings: new Map(),
      beats,
      durationMs: 11_000,
      timing: 'estimated',
      generator: 'test',
      profile: { kind: 'textbook', tone: 'neutral', story: false, film: true },
    });
    expect(scene.steps.map((s) => s.layout)).toEqual([
      'board',
      'board',
      'board',
    ]);
    const places = scene.stagings.wide.places;
    for (let k = 1; k < places.length; k += 1)
      for (const [id, at] of Object.entries(places[k - 1])) {
        expect(places[k][id].x).toBe(at.x);
        expect(places[k][id].y).toBe(at.y);
      }
    // A build's drawings are drawn on.
    expect(scene.steps[1].enter.sea).toEqual({ how: 'draw' });
    // The camera frames the newest and its neighbour, never more than FRAME_MOST of the board.
    const views = scene.stagings.wide.views!;
    const { w } = boardArea(
      STAGINGS.wide.w,
      STAGINGS.wide.h,
      STAGINGS.wide.margin,
    );
    expect(views).toHaveLength(3);
    for (const view of views)
      expect(view[2]).toBeLessThanOrEqual(w * FRAME_MOST + 0.1);
  });

  it('sets back what has not been named for two stage changes, and brings it back when it is named', () => {
    const script = chain(
      ['sun', 'sea', 'vapour', 'cloud'],
      [{ say: ['Then the sun shines again.'] }],
    );
    const stages = stagesOf(boardOf(script, null).script);
    // The sun, unnamed since it came, is set back two stage changes on.
    expect(stages[1].board!.faded).toEqual([]);
    expect(stages[3].board!.faded).toContain('sun');
    // Named again ("Then the sun"), it comes back: a stage of its own at that word.
    const back = stages[stages.length - 1];
    expect(back.board!.faded).not.toContain('sun');
    expect(back.board!.frame).toContain('sun');
  });

  it('pulls out to the whole board at a recap and as the section ends', () => {
    const script = chain(
      ['sun', 'sea', 'vapour'],
      [{ say: ['Sun, sea and vapour, round and round.'], delivery: 'recap' }],
    );
    const mid = stagesOf(boardOf(script, null).script);
    expect(mid[mid.length - 1].board!.frame).toBe('whole');
    // Nothing is set back on the whole board.
    expect(mid[mid.length - 1].board!.faded).toEqual([]);
    const end = stagesOf(
      boardOf(chain(['sun', 'sea']), null, { end: true }).script,
    );
    expect(end[end.length - 1].board!.frame).toBe('whole');
  });

  it('carries the board on to the next scene, its things under the ids they had', () => {
    const first = boardOf(chain(['sun', 'sea', 'vapour']), null);
    // The next scene's writer called the vapour "wisps", and has a "sun" of its own that is something else.
    const next: SceneScript = {
      ...chain(['wisps', 'cloud']),
      cast: [drawing('wisps', 'vapour'), drawing('cloud')],
    };
    const clash: SceneScript = {
      ...next,
      cast: [...next.cast, drawing('sun', 'sunflower')],
    };
    const kept = keepIds(clash, first.carry);
    expect(kept.kept).toEqual(['vapour']);
    expect(kept.script.cast.map((t) => t.id)).toEqual([
      'vapour',
      'cloud',
      'sun-2',
    ]);
    const second = boardOf(next, first.carry);
    // On the stage from its first moment, where they were.
    expect(second.script.board?.carried).toEqual(['sun', 'sea', 'vapour']);
    const stages = stagesOf(second.script);
    expect(stages[0].show).toEqual(['sun', 'sea', 'vapour']);
    for (const [id, cell] of Object.entries(first.carry.cells))
      expect(stages[0].board!.cells[id]).toEqual(cell);
    // The camera carries on from where it was.
    expect(stages[0].board!.frame).toEqual(first.carry.frame);
    // The vapour carried is the one drawn before, not drawn again.
    expect(second.script.cast.filter((t) => t.id === 'vapour')).toHaveLength(1);
    expect(stages[stages.length - 1].show).toEqual([
      'sun',
      'sea',
      'vapour',
      'cloud',
    ]);
  });

  it('pages past twelve things: the oldest columns slide out, the rest keep their places to one another', () => {
    const ids = Array.from({ length: BOARD_MOST + 1 }, (_, i) => `t${i + 1}`);
    const { script, notes } = boardOf(chain(ids), null);
    const stages = stagesOf(script);
    for (const stage of stages)
      expect(stage.show.length).toBeLessThanOrEqual(BOARD_MOST);
    const paged = stages.findIndex((s) => s.board!.page);
    expect(paged).toBe(BOARD_MOST);
    expect(notes.some((n) => n.includes('paged'))).toBe(true);
    const before = stages[paged - 1].board!.cells;
    const after = stages[paged].board!.cells;
    expect(after.t1).toBeUndefined();
    expect(after[`t${BOARD_MOST + 1}`]).toBeDefined();
    const kept = Object.keys(after).filter((id) => before[id]);
    const shift = after[kept[0]][0] - before[kept[0]][0];
    expect(shift).toBeLessThan(0);
    for (const id of kept) {
      expect(after[id][0] - before[id][0]).toBe(shift);
      expect(after[id][1]).toBe(before[id][1]);
    }
  });

  it('carries how long each has been quiet, so what was set back stays so', () => {
    const carry: BoardCarry = {
      things: [drawing('sun'), drawing('sea')],
      order: ['sun', 'sea'],
      cells: { sun: [0, 1], sea: [1, 1] },
      arrows: [],
      quiet: { sun: 3, sea: 0 },
      frame: ['sea'],
    };
    const stages = stagesOf(boardOf(chain(['cloud']), carry).script);
    expect(stages[0].board!.faded).toEqual(['sun']);
  });
});
