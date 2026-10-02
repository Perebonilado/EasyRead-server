import { outlineOf } from './studio';
import { worldOf } from './studio-editor';
import { beatsOf, rowsOf } from './studio-editorial';
import {
  cutScenes,
  editorOutline,
  sceneOfRow,
  shotsSwitchOn,
} from './studio-editor-cut';

// Its places and people the research's, each with a claim (worldOf).
const world = worldOf({
  era: '1582',
  places: [
    {
      name: 'Saint Peter’s Square',
      kind: 'square',
      time: 'day',
      claims: ['c1'],
    },
    { name: 'The Vatican library', kind: 'hall', claims: ['c2'] },
  ],
  people: [
    {
      name: 'Pope Gregory XIII',
      role: 'the pope who signed it',
      claims: ['c1'],
    },
    { name: 'Christopher Clavius', role: 'the astronomer', claims: ['c2'] },
  ],
});
const beats = beatsOf({
  acts: [
    { title: 'The drift', seconds: 90 },
    { title: 'The fix', seconds: 90 },
  ],
});
/** A sentence of about `words` words. */
const say = (words: number, start = 'Word') =>
  `${start} ${Array.from({ length: words - 1 }, () => 'more').join(' ')}.`;
const all = new Set<string>();

describe("an editor's script cut into scenes", () => {
  it('makes rows of people and places one illustrated scene, in a world place, with its people', () => {
    const rows = rowsOf(
      [
        { say: say(14), visual: 'when', show: 'A timeline', act: 1 },
        { say: say(14), visual: 'when', show: 'A calendar', act: 1 },
        {
          say: 'Pope Gregory signs the bull in the library.',
          visual: 'scene',
          show: 'The Vatican library at night, Gregory at a desk',
          act: 1,
        },
        {
          say: 'Clavius watches him sign.',
          visual: 'scene',
          show: 'Clavius beside the desk',
          act: 1,
        },
        { say: say(14), visual: 'why', show: 'A flow', act: 2 },
        { say: say(14), visual: 'why', show: 'A flow grows', act: 2 },
      ],
      all,
    );
    const scenes = cutScenes(rows, beats, world, 150);
    expect(scenes.map((s) => [s.kind ?? 'lesson', s.rows])).toEqual([
      ['lesson', [0, 1]],
      ['illustrated', [2, 3]],
      ['lesson', [4, 5]],
    ]);
    expect(scenes[1].set).toBe('the-vatican-library');
    expect(scenes[1].cast).toEqual([
      'pope-gregory-xiii',
      'christopher-clavius',
    ]);
    // A lesson's teaching is its rows' words; its points their pictures.
    expect(scenes[0].teach).toBe(`${rows[0].say} ${rows[1].say}`);
    expect(scenes[0].points).toEqual(['A timeline', 'A calendar']);
    // The first scene of an act is named for it.
    expect(scenes[0].title).toBe('The drift');
    expect(scenes[2].title).toBe('The fix');
  });

  it('splits a long run of shots at thirty seconds, and a lesson at sixty', () => {
    const shots = Array.from({ length: 8 }, () => ({
      say: say(20),
      visual: 'scene',
      show: 'A crowd',
      act: 1,
    }));
    const lesson = Array.from({ length: 10 }, () => ({
      say: say(20),
      visual: 'why',
      show: 'A diagram',
      act: 2,
    }));
    const scenes = cutScenes(
      rowsOf([...shots, ...lesson], all),
      beats,
      world,
      150,
    );
    for (const scene of scenes) {
      const limit = scene.kind === 'illustrated' ? 30 : 60;
      expect(scene.seconds).toBeLessThanOrEqual(limit);
    }
    expect(
      scenes.filter((s) => s.kind === 'illustrated').length,
    ).toBeGreaterThan(1);
    // Every row is in one scene, in order.
    const covered = scenes.flatMap((s) =>
      Array.from(
        { length: s.rows![1] - s.rows![0] + 1 },
        (_, k) => s.rows![0] + k,
      ),
    );
    expect(covered).toEqual(Array.from({ length: 18 }, (_, k) => k));
  });

  it('joins a scrap of a map to the lesson beside it, and keeps a run of places one map scene', () => {
    const rows = rowsOf(
      [
        { say: say(16), visual: 'why', show: 'A flow', act: 1 },
        { say: say(16), visual: 'why', show: 'A flow', act: 1 },
        { say: 'Rome.', visual: 'place', show: 'Rome on the map', act: 1 },
        { say: say(16), visual: 'place', show: 'Spain lights up', act: 2 },
        { say: say(16), visual: 'place', show: 'France lights up', act: 2 },
      ],
      all,
    );
    const scenes = cutScenes(rows, beats, world, 150);
    expect(scenes.map((s) => s.rows)).toEqual([
      [0, 2],
      [3, 4],
    ]);
  });

  it('is an outline the Studio keeps: more than twelve scenes, each its rows', () => {
    const rows = rowsOf(
      Array.from({ length: 30 }, (_, k) => ({
        say: say(12),
        visual: k % 2 ? 'scene' : 'why',
        show: 'Something',
        act: k < 15 ? 1 : 2,
      })),
      all,
    );
    const outline = editorOutline({
      title: 'Leap years',
      question: 'Where did ten days go?',
      rows,
      beats,
      world,
      wpm: 150,
    });
    expect(outline.scenes.length).toBeGreaterThan(12);
    const kept = outlineOf(JSON.parse(JSON.stringify(outline)));
    expect(kept.editor).toBe(true);
    expect(kept.scenes).toHaveLength(outline.scenes.length);
    expect(kept.scenes[1]).toMatchObject({ kind: 'illustrated', rows: [1, 1] });
    expect(sceneOfRow(kept.scenes, 1)).toBe(1);
    expect(sceneOfRow(kept.scenes, 99)).toBeNull();
    // Any other outline reads as it did: twelve scenes, no illustrated kind.
    const old = outlineOf({
      ...JSON.parse(JSON.stringify(outline)),
      editor: undefined,
    });
    expect(old.scenes).toHaveLength(12);
    expect(old.scenes.some((s) => s.kind === 'illustrated')).toBe(false);
  });
});

describe('the shots switch (EXPLAINER_SHOTS)', () => {
  it('is off unless set on', () => {
    for (const on of ['on', 'ON', 'true', '1', 'yes', ' on '])
      expect(shotsSwitchOn(on)).toBe(true);
    for (const off of [undefined, null, '', 'off', 'false', '0', 'no', 'shots'])
      expect(shotsSwitchOn(off)).toBe(false);
  });
});
