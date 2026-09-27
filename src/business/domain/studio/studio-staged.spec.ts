import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto } from '../../../contracts';
import { bibleOf, storySheetOf } from './studio';
import { mendSheet, repairSheet, withFound } from './studio-check';
import { stageStory } from './studio-stage';
import {
  askedGone,
  concerns,
  describeStaged,
  stagedFaults,
  stillThere,
} from './studio-staged';
import { voiced } from './__fixtures__/voiced';

/**
 * A made scene in words, from what its film plays, and the faults code
 * sees in it: Tobi's first scene as it was made before (Tobi drawn in a
 * bed of his own, which went with him), and as it is staged now.
 */

const tobi = (file: string): unknown =>
  JSON.parse(
    readFileSync(join(__dirname, '__fixtures__', 'tobi', file), 'utf8'),
  );
const bible = bibleOf(tobi('bible.json'));
const written = storySheetOf(tobi('s1-sheet.json'));
/** The film as made before: its drawings left out, all else as it was. */
const made = tobi('s1-made.json') as SceneDto;

/** The sheet as the film was staged from it before: the words as written, put right as they were then. */
const before = written;

describe("Tobi's first scene as it was made before", () => {
  const said = describeStaged(before, made, bible);

  it('says he is drawn in a bed of his own that goes wherever he goes', () => {
    expect(said.lines).toContain(
      'Tobi: drawn in bed: the bed is part of the drawing and goes wherever they go.',
    );
    const up = said.lines.find((line) =>
      line.includes('gets out of bed himself'),
    );
    expect(up).toMatch(/0:04\.2: Tobi gets up; the bed moves with them\./);
    const off = said.lines.find((line) =>
      line.includes('runs out of the door'),
    );
    expect(off).toMatch(
      /Tobi goes off through the door at a run; the bed moves with them/,
    );
    expect(said.lines).toContain('The uniform: drawn taller than Mama.');
  });

  it('keeps the same key for the same film, whatever its times', () => {
    // The same film, every moment of it a little later.
    const later: SceneDto = JSON.parse(JSON.stringify(made)) as SceneDto;
    const by = 370;
    later.durationMs += by;
    if (later.settledMs) later.settledMs += by;
    for (const beat of later.beats) {
      beat.startMs += by;
      beat.endMs += by;
    }
    for (const step of later.steps) if (step.atMs) step.atMs += by;
    for (const effect of later.effects) effect.atMs += by;
    for (const moves of Object.values(later.acting ?? {}))
      for (const move of moves.moves ?? []) move[0] += by;
    for (const prop of later.props ?? [])
      for (const one of prop.does) one[0] += by;
    const again = describeStaged(before, later, bible);
    expect(again.key).toBe(said.key);
    expect(again.lines).not.toEqual(said.lines);
  });

  it('sees the bed that moves with him, the uniform carried and not worn, and too big', () => {
    const faults = stagedFaults(before, made, bible);
    expect(faults.map((f) => [f.id, f.who])).toEqual(
      expect.arrayContaining([
        ['baked-pose', 'tobi'],
        ['double-feature', 'tobi'],
        ['furniture-moves', 'tobi'],
        ['not-worn', 'tobi'],
        ['held-too-big', 'mama'],
      ]),
    );
    expect(faults.find((f) => f.id === 'furniture-moves')?.beat).toBe(1);
  });

  it("knows which faults the maker's words are about", () => {
    const [bed] = stagedFaults(before, made, bible).filter(
      (f) => f.id === 'furniture-moves',
    );
    const words = 'make Tobi get out of bed himself instead of the bed moving';
    expect(concerns(bed, words)).toBe(true);
    expect(concerns(bed, 'make Mama laugh louder')).toBe(false);
    const worn = stagedFaults(before, made, bible).find(
      (f) => f.id === 'not-worn',
    )!;
    expect(
      concerns(worn, 'fix the uniform so it does not follow him around'),
    ).toBe(true);
  });
});

describe("Tobi's first scene as it is staged now", () => {
  const mended = mendSheet(repairSheet(written, bible), bible);
  const show = withFound(bible, mended.sheet.set, mended);
  const { scene } = voiced(stageStory(mended.sheet, show));
  // The kit's figures are rigged, with arms and legs to bend.
  for (const thing of scene.things)
    if (thing.kind === 'drawing' && thing.rig) {
      thing.joints = {
        r: [
          [0.6, 0.4],
          [0.7, 0.5],
          [0.7, 0.6],
        ],
        l: [
          [0.4, 0.4],
          [0.3, 0.5],
          [0.3, 0.6],
        ],
      };
      thing.legs = {
        r: [
          [0.55, 0.8],
          [0.55, 0.85],
          [0.55, 0.9],
        ],
        l: [
          [0.45, 0.8],
          [0.45, 0.85],
          [0.45, 0.9],
        ],
      };
    }

  it("says he opens in the set's bed under its cover, in his pyjamas, gets up and down beside it", () => {
    const said = describeStaged(mended.sheet, scene, show).lines;
    expect(said).toContainEqual(
      expect.stringMatching(
        /^Tobi: drawn standing, rigged; as it opens, wears red pyjamas, with bare feet; changes clothes at /,
      ),
    );
    const up = said.find((line) => line.includes('gets out of bed himself'))!;
    expect(up).toMatch(
      /: Tobi opens in the bed, sitting up under its cover, in red pyjamas, with bare feet; Tobi gets up; Tobi is out of the bed, down beside it\.$/,
    );
    // What he is dressed in, as the film draws it.
    const dressed = said.find((line) => line.includes('spins round'))!;
    expect(dressed).toMatch(
      /Tobi takes the uniform; Tobi is now dressed in a blue uniform and grey trousers, with a backpack; Tobi puts on the uniform/,
    );
    expect(said.at(-1)).toMatch(/Tobi wears the uniform/);
  });

  it('says so when he stands up on the bed before he gets down, by where his feet are', () => {
    // As a film made before was: his feet up on the mattress as he stands,
    // and down beside it only once he is up.
    const high: SceneDto = JSON.parse(JSON.stringify(scene)) as SceneDto;
    const [at, , ms] = high.acting!.tobi.moves!.find(
      ([, move]) => move === 'stand',
    )!;
    high.steps[1].atMs = at + ms + 400;
    high.stagings.wide.places[0].tobi.y -= high.stagings.wide.h * 0.2;
    const said = describeStaged(mended.sheet, high, show).lines;
    const line = said.find((one) => one.includes('gets out of bed himself'))!;
    expect(line).toMatch(/Tobi gets up and stands up on the bed/);
  });

  it('says when he shows he is asleep, and when he no longer does', () => {
    const asleep = mendSheet(
      repairSheet(
        storySheetOf({
          title: 'Morning',
          set: 'bedroom',
          onStage: [{ who: 'tobi', spot: 'centre', pose: 'in bed' }],
          beats: [
            { kind: 'reaction', who: 'tobi', sign: 'sleeping' },
            { kind: 'narration', say: 'The sun comes up over the town.' },
            { kind: 'line', who: 'tobi', say: 'Is it morning already?' },
          ],
        }),
        bible,
      ),
      bible,
    );
    const shown = withFound(bible, asleep.sheet.set, asleep);
    const film = voiced(stageStory(asleep.sheet, shown)).scene;
    const said = describeStaged(asleep.sheet, film, shown).lines.join('\n');
    expect(said).toMatch(/Tobi shows asleep: eyes shut, with Zs over the head/);
    expect(said).toMatch(/Tobi no longer shows asleep/);
  });

  it("sees what the maker asked to be rid of still in the film, and how big the set's things stand", () => {
    const words = 'Please get rid of the chair, it is in the way.';
    expect(stillThere(words, scene).map((f) => [f.id, f.why])).toEqual([
      [
        'still-there',
        'the chair the maker asked to be rid of is still in the film',
      ],
    ]);
    expect(stillThere('Make the chair red.', scene)).toEqual([]);
    expect(askedGone(words, [{ id: 'teapot', name: 'teapot' }])).toEqual([]);
    const said = describeStaged(mended.sheet, scene, show).lines[0];
    expect(said).toMatch(
      /the bed \(drawn by the stage, (?:on the left|in the middle|on the right)/,
    );
  });

  it('says what the words have done with a thing that the film does not show', () => {
    const bare: SceneDto = JSON.parse(JSON.stringify(scene)) as SceneDto;
    for (const prop of bare.props ?? [])
      prop.does = prop.does.filter(([, , does]) => does !== 'give');
    const said = describeStaged(mended.sheet, bare, show).lines;
    const line = said.find((one) => one.includes('Mama gives Tobi'))!;
    expect(line).toMatch(/Mama is not seen to give anything, as the words say/);
  });

  it('sees nothing wrong with the bed or the uniform', () => {
    const faults = stagedFaults(mended.sheet, scene, show);
    expect(faults.filter((f) => f.id !== 'held-too-big')).toEqual([]);
  });
});
