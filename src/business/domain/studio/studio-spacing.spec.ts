/**
 * People on a Studio stage stand as people do (scene-spacing), end to
 * end, from the sheet to the made scene: two talking from the far ends of
 * the stage at a social distance; one who goes over to another stops
 * beside them, not on them; a thing handed over within reach; no one in
 * anyone's body; and the staging check finds nothing.
 */
import type { SceneDto } from '../../../contracts';
import { bibleOf, storySheetOf } from './studio';
import { mendSheet, repairSheet, withFound } from './studio-check';
import { stageStory } from './studio-stage';
import { voiced } from './__fixtures__/voiced';
import {
  ADULT_FRAME_UNITS,
  BODY_SHARE,
  KIT_PER_METRE,
  NEAR_M,
  spacingFaults,
} from '../scene-spacing';

const bible = bibleOf({
  characters: ['Dee', 'Tessa', 'Gus'].map((name, k) => ({
    name,
    kind: 'person',
    role: k ? 'supporting' : 'main',
    voice: 'woman',
    traits: ['dry'],
    figure: { age: 'adult', hair: 'short', top: 'jumper', skin: 3 + k },
  })),
  sets: [
    {
      name: 'Shop',
      look: 'a small corner shop: shelves, a counter, a fridge',
      kind: 'indoor',
    },
  ],
  world: { era: 'today', region: 'a city' },
});

const line = (who: string, to: string, say: string) => ({
  kind: 'line',
  who,
  to,
  say,
  feeling: 'neutral',
  from: 'here',
});

function made(
  onStage: Record<string, unknown>[],
  beats: Record<string, unknown>[],
  props: Record<string, unknown>[] = [],
): SceneDto {
  const sheet = storySheetOf({
    title: 'At the shop',
    set: 'shop',
    onStage,
    props,
    beats,
  });
  const fixed = repairSheet(sheet, bible, null);
  const mended = mendSheet(fixed, bible, null);
  const grown = withFound(bible, mended.sheet.set, mended);
  return voiced(
    stageStory(mended.sheet, grown, {}),
    [],
    {},
    {},
    { stands: true },
  ).scene;
}

/** Metres between two at a step, middle to middle, across. */
const metresAt = (scene: SceneDto, k: number, a: string, b: string) => {
  const p = scene.stagings.wide.places[k];
  const perM = (p[a].h / ADULT_FRAME_UNITS) * KIT_PER_METRE;
  return Math.abs(p[a].x + p[a].w / 2 - (p[b].x + p[b].w / 2)) / perM;
};

describe('people on the stage, spaced as people stand', () => {
  it('two talking from the far ends of the stage stand at a social distance', () => {
    const scene = made(
      [
        { who: 'dee', spot: 'left' },
        { who: 'tessa', spot: 'right' },
      ],
      [
        line('dee', 'tessa', 'You have my key. I can see it on your ring.'),
        line('tessa', 'dee', 'Say please, and mean it this time.'),
        line('dee', 'tessa', 'Please. Before the shop shuts on us.'),
      ],
    );
    const apart = metresAt(scene, 0, 'dee', 'tessa');
    expect(apart).toBeGreaterThanOrEqual(NEAR_M.talk.least - 0.02);
    expect(apart).toBeLessThanOrEqual(NEAR_M.talk.most + 0.02);
    expect(spacingFaults(scene)).toEqual([]);
  });

  it('one who goes over to another stops beside them, never on them', () => {
    const scene = made(
      [
        { who: 'dee', spot: 'centre-right' },
        { who: 'tessa', spot: 'left' },
      ],
      [
        line('dee', 'tessa', 'Come here and look at this receipt.'),
        {
          kind: 'action',
          who: 'tessa',
          do: 'walk',
          target: 'dee',
          say: 'Tessa goes over to Dee.',
        },
        line('tessa', 'dee', 'That is not a receipt. That is a ransom note.'),
      ],
    );
    const last = scene.stagings.wide.places.length - 1;
    const apart = metresAt(scene, last, 'dee', 'tessa');
    const p = scene.stagings.wide.places[last];
    expect(apart).toBeLessThanOrEqual(NEAR_M.talk.most + 0.02);
    // Their bodies clear of each other.
    expect(
      Math.abs(p.dee.x + p.dee.w / 2 - (p.tessa.x + p.tessa.w / 2)),
    ).toBeGreaterThan((p.dee.w + p.tessa.w) * BODY_SHARE);
    expect(spacingFaults(scene).filter((f) => f.kind === 'overlap')).toEqual(
      [],
    );
  });

  it('a thing is handed over within reach, and three in a small shop never stand in one another', () => {
    const scene = made(
      [
        { who: 'gus', spot: 'right', holding: 'cup' },
        { who: 'dee', spot: 'left' },
        { who: 'tessa', spot: 'centre' },
      ],
      [
        line('dee', 'gus', 'One coffee. On credit.'),
        line('gus', 'dee', 'No credit. Coffee, yes.'),
        {
          kind: 'business',
          who: 'gus',
          to: 'dee',
          do: 'give',
          thing: 'cup',
          target: 'dee',
          say: 'Gus gives Dee the cup.',
        },
        line('tessa', 'dee', 'He likes you. He never gives anyone a cup.'),
      ],
    );
    const places = scene.stagings.wide.places;
    // At the step of the handing over, within reach.
    const giving = places.findIndex(
      (p) =>
        p.gus &&
        p.dee &&
        metresAt(scene, places.indexOf(p), 'gus', 'dee') <=
          NEAR_M.reach.most + 0.05,
    );
    expect(giving).toBeGreaterThanOrEqual(0);
    expect(spacingFaults(scene).filter((f) => f.kind === 'overlap')).toEqual(
      [],
    );
  });
});
