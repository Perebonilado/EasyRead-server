import { bibleOf, storySheetOf, featuresOf, thingsOf } from './studio';
import {
  checkSheet,
  endStateOf,
  errorsIn,
  keptFeatures,
  mendSheet,
  repairSheet,
  withFound,
} from './studio-check';
import { auditScene } from './studio-audit';
import { stageStory } from './studio-stage';
import { voiced } from './__fixtures__/voiced';
import type { OwnPropDrawing } from '../scene-props';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** "Kofi and the Kite": a boy, his sister, a kite and a mango tree. */
const bible = bibleOf({
  characters: [
    {
      name: 'Kofi',
      kind: 'person',
      role: 'main',
      voice: 'boy',
      traits: ['eager'],
      figure: { age: 'child', hair: 'short', top: 't-shirt', skin: 8 },
    },
    {
      name: 'Ama',
      kind: 'person',
      role: 'main',
      voice: 'girl',
      traits: ['clever'],
      figure: { age: 'child', hair: 'braids', top: 'dress', skin: 8 },
    },
  ],
  sets: [
    {
      name: 'Field',
      look: 'a dusty field at the edge of a village, a mango tree',
      kind: 'outdoor',
    },
  ],
  world: { era: 'today', region: 'a village in Ghana' },
});

const sheetOf = (beats: Record<string, unknown>[], extra = {}) =>
  storySheetOf({
    title: 'The kite',
    set: 'field',
    onStage: [
      { who: 'kofi', spot: 'centre-left' },
      { who: 'ama', spot: 'centre-right' },
    ],
    beats,
    ...extra,
  });

/** A kite as the artist drew it and code measured it. */
const KITE: OwnPropDrawing = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-35 -103 70 106"><path d="M0,-100 L30,-60 L0,-20 L-30,-60 Z" fill="#e0463a"/></svg>',
  viewBox: [-35, -103, 70, 106],
  grip: [1, -6],
  mouth: [0, -90],
  bite: [1, -6],
  size: 'medium',
  loose: { bounce: 0, spins: true },
};

describe("a show's own things: named by the words, drawn once, handled like any", () => {
  const flies = sheetOf([
    { kind: 'line', who: 'kofi', say: 'Look how high it goes!' },
    {
      kind: 'business',
      who: 'kofi',
      do: 'raise',
      thing: 'kite',
      say: 'Kofi flies his kite.',
    },
    { kind: 'narration', say: 'The kite gets stuck in the mango tree.' },
    { kind: 'line', who: 'ama', say: 'Oh no, Kofi!' },
  ]);

  it("sets out a kite of the show's own and the mango tree the words name", () => {
    const { sheet, things, features } = mendSheet(flies, bible);
    expect(things).toEqual([{ id: 'kite', name: 'kite', kind: 'thing' }]);
    expect(features.map((f) => [f.id, f.kind, f.spot])).toEqual([
      ['tree', 'tree', 'back'],
    ]);
    // Flown from the first: in Kofi's hand as the scene opens.
    expect(sheet.onStage.find((p) => p.who === 'kofi')?.holding).toBe('kite');
    expect(sheet.beats[1]).toMatchObject({
      kind: 'business',
      do: 'raise',
      prop: 'kite',
      thing: 'kite',
    });
    // Once the show's, what the scene says of it is sound.
    const grown = withFound(bible, sheet.set, { things, features });
    expect(grown.things).toEqual(things);
    expect(errorsIn(checkSheet(sheet, grown))).toEqual([]);
    const script = stageStory(sheet, grown);
    expect(script.props).toEqual(['kite']);
    expect(script.ownThings).toEqual([{ id: 'kite', name: 'kite' }]);
    expect(script.propsHeld).toEqual({ kite: { by: 'kofi', in: 'hand' } });
    expect(script.features?.map((f) => f.id)).toEqual(['tree']);
  });

  it('holds, throws and catches it as a ball is, from one scene to the next', () => {
    const grown = withFound(bible, 'field', mendSheet(flies, bible));
    const sheet = sheetOf(
      [
        { kind: 'line', who: 'kofi', say: 'Catch, Ama!' },
        {
          kind: 'business',
          who: 'kofi',
          do: 'throw',
          say: 'Kofi throws the kite to Ama.',
        },
        { kind: 'business', who: 'ama', do: 'catch', say: 'Ama catches it.' },
        { kind: 'line', who: 'ama', say: 'Got it!' },
      ],
      {
        onStage: [
          { who: 'kofi', spot: 'centre-left', holding: 'kite' },
          { who: 'ama', spot: 'centre-right' },
        ],
      },
    );
    const mended = mendSheet(sheet, grown);
    expect(mended.things).toEqual([]);
    expect(
      mended.sheet.beats
        .filter((b) => b.kind === 'business')
        .map((b) => [b.who, b.do, b.prop, b.to]),
    ).toEqual([
      ['kofi', 'throw', 'kite', 'ama'],
      ['ama', 'catch', 'kite', null],
    ]);
    const script = stageStory(mended.sheet, grown);
    const handled = script.beats.flatMap((b) =>
      (b.business ?? []).map((one) => `${one.who} ${one.does} ${one.prop}`),
    );
    expect(handled).toEqual(['kofi throw kite', 'ama catch kite']);
    // The film: the kite as the artist drew it, flying from hand to hand.
    const { scene } = voiced({ ...script, drawn: { things: { kite: KITE } } });
    const prop = scene.props?.find((p) => p.id === 'kite');
    expect(prop?.svg).toBe(KITE.svg);
    expect(prop?.grip).toEqual(KITE.grip);
    expect(prop?.held).toEqual({ by: 'kofi', in: 'r' });
    expect(prop?.spins).toBe(true);
    expect(prop?.does.map((d) => `${d[1]} ${d[2]}`)).toEqual([
      'kofi throw',
      'ama catch',
    ]);
    // Seen as its words say.
    expect(
      auditScene(mended.sheet, scene, grown).map((one) => one.verdict),
    ).toEqual(['seen', 'seen']);
    // And carried on: Ama has it as the next scene opens.
    expect(endStateOf(mended.sheet, grown).held).toEqual([
      { who: 'ama', thing: 'kite' },
    ]);
    // One the artist could not draw is never missing: a parcel stands in.
    const standIn = voiced(script).scene.props?.find((p) => p.id === 'kite');
    expect(standIn?.svg).toContain('<svg');
  });

  it('sets clothes down folded, or on a hanger in a room, and anything else as it is drawn', () => {
    const script = stageStory(
      mendSheet(flies, bible).sheet,
      withFound(bible, 'field', mendSheet(flies, bible)),
    );
    const kite = voiced({
      ...script,
      drawn: { things: { kite: KITE } },
    }).scene.props?.find((p) => p.id === 'kite');
    expect(kite?.rest).toBeUndefined();
    // The same thing were it a uniform: folded out of doors, hung in a room.
    const asUniform = (place: 'outdoor' | 'indoor') =>
      voiced({
        ...script,
        ownThings: [
          {
            id: 'kite',
            name: 'school uniform',
            look: 'white shirt and navy jumper',
          },
        ],
        setting: { ...script.setting!, place },
        drawn: { things: { kite: KITE } },
      }).scene.props?.find((p) => p.id === 'kite');
    const outside = asUniform('outdoor');
    expect(outside?.rest?.folded.svg).toContain('#34518f');
    expect(outside?.rest?.hung).toBeUndefined();
    const inside = asUniform('indoor');
    expect(inside?.rest?.hung?.anchor).toEqual([0, 0]);
    // Held or thrown, it is drawn as the artist drew it.
    expect(inside?.svg).toBe(KITE.svg);
  });

  it('adds a bicycle leant against a wall to the set, for good, for the artist to draw', () => {
    const sheet = sheetOf([
      { kind: 'line', who: 'ama', say: 'I will leave it here.' },
      {
        kind: 'action',
        who: 'ama',
        do: 'put',
        say: 'Ama leans her bicycle against the wall.',
      },
      { kind: 'line', who: 'kofi', say: 'Come on, then!' },
    ]);
    const { features, things } = mendSheet(sheet, bible);
    expect(things).toEqual([]);
    expect(features.map((f) => [f.id, f.kind])).toEqual([
      ['bicycle', 'drawn'],
      ['wall', 'wall'],
    ]);
    // Beside Ama, who set it there.
    expect(features[0].spot).toBe('right');
    const grown = withFound(bible, 'field', { features, things });
    // Kept when the writer writes the cast again without it.
    expect(
      keptFeatures(
        bibleOf(JSON.parse(JSON.stringify(bible))),
        grown,
      ).sets[0].features?.map((f) => f.id),
    ).toEqual(['bicycle', 'wall']);
    const script = stageStory(repairSheet(sheet, grown), grown);
    expect(script.features?.map((f) => [f.id, f.kind])).toEqual([
      ['bicycle', 'drawn'],
      ['wall', 'wall'],
    ]);
    // Stood among the people, drawn as the artist drew it; one not drawn
    // yet stands under a cloth.
    const piece = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-94 -114 188 118"><rect x="-90" y="-110" width="180" height="110"/></svg>',
      viewBox: [-94, -114, 188, 118] as [number, number, number, number],
      front: true as const,
    };
    const { scene } = voiced({
      ...script,
      drawn: { features: { bicycle: piece } },
    });
    const bicycle = scene.setting?.features?.find((f) => f.id === 'bicycle');
    expect(bicycle?.svg).toBe(piece.svg);
    expect(bicycle?.front).toBe(true);
    expect(bicycle?.at.wide.w).toBeGreaterThan(0);
    const covered = voiced(script).scene.setting?.features?.find(
      (f) => f.id === 'bicycle',
    );
    expect(covered?.svg).toMatch(/#9aa68a/);
  });

  it('goes to one, sits on it, and opens it, as the words say', () => {
    const sheet = sheetOf([
      { kind: 'line', who: 'kofi', say: 'Race you!' },
      {
        kind: 'action',
        who: 'kofi',
        do: 'run',
        say: 'Kofi runs to the signpost.',
      },
      { kind: 'action', who: 'ama', do: 'sit', say: 'Ama sits on the log.' },
      {
        kind: 'business',
        who: 'ama',
        do: 'open',
        say: 'Ama opens the wardrobe.',
      },
      { kind: 'line', who: 'ama', say: 'I win!' },
    ]);
    const { sheet: mended, features } = mendSheet(sheet, bible);
    expect(features.map((f) => [f.id, f.kind, f.opens])).toEqual([
      ['signpost', 'drawn', false],
      ['log', 'drawn', false],
      ['wardrobe', 'drawn', true],
    ]);
    // Far enough from Kofi that his run to it is seen, where no one stands.
    expect(features[0].spot).toBe('right');
    // On the stage: he goes to it, she sits by the log, and the wardrobe
    // swings open at her hand, as a gate does.
    const grown = withFound(bible, 'field', { features, things: [] });
    const script = stageStory(mended, grown);
    const where = (who: string) =>
      script.steps.flatMap((step) =>
        step.stage?.at?.[who] ? [step.stage.at[who]] : [],
      );
    expect(where('kofi')).toContain('by:signpost:-1');
    expect(
      script.steps.flatMap((step) =>
        step.effects.flatMap((e) =>
          e.target === 'ama' ? [`${e.do} ${e.part}`] : [],
        ),
      ),
    ).toEqual(['sit f:log', 'point f:wardrobe']);
    // Each stands clear of the others, not one on another.
    expect(new Set(features.map((f) => f.spot)).size).toBe(3);
    expect(script.featureStates?.map((f) => [f.feature, f.state])).toEqual([
      ['wardrobe', 'open'],
    ]);
    // And hidden behind one, drawn over them while they are.
    const hides = stageStory(
      mendSheet(
        sheetOf([
          { kind: 'line', who: 'ama', say: 'Count to ten!' },
          {
            kind: 'action',
            who: 'kofi',
            do: 'hide',
            say: 'Kofi hides behind the signpost.',
          },
          { kind: 'line', who: 'ama', say: 'Coming!' },
        ]),
        grown,
      ).sheet,
      grown,
    );
    expect(
      hides.steps.some((step) => step.stage?.at?.kofi === 'behind:signpost'),
    ).toBe(true);
    expect(
      mended.beats
        .filter((b) => b.kind !== 'line')
        .map((b) => [b.who, b.do, b.target]),
    ).toEqual([
      ['kofi', 'run', 'signpost'],
      ['ama', 'sit', 'log'],
      ['ama', 'open', 'wardrobe'],
    ]);
  });

  it('makes nothing of words that name no thing or feature', () => {
    const sheet = sheetOf(
      [
        { kind: 'line', who: 'kofi', say: 'Look at the sky!' },
        { kind: 'narration', say: 'The sun shines on the market.' },
        {
          kind: 'action',
          who: 'kofi',
          do: 'run',
          say: 'Kofi runs to the market.',
        },
        {
          kind: 'business',
          who: 'ama',
          do: 'take',
          thing: 'breath',
          say: 'Ama takes a deep breath.',
        },
        {
          kind: 'action',
          who: 'ama',
          do: 'hide',
          say: 'Ama hides behind her hands.',
        },
        {
          kind: 'line',
          who: 'ama',
          say: 'By the time we get there, it will be dark.',
        },
      ],
      {
        props: [{ prop: 'rainbow', near: 'kofi' }],
        onStage: [
          { who: 'kofi', spot: 'centre-left', holding: 'feelings' },
          { who: 'ama', spot: 'centre-right' },
        ],
      },
    );
    const { sheet: mended, things, features } = mendSheet(sheet, bible);
    expect(things).toEqual([]);
    expect(features).toEqual([]);
    expect(mended.props).toEqual([]);
    expect(mended.onStage.map((p) => p.holding)).toEqual([null, null]);
  });
});

describe("what is never a show's own, and one thing named two ways", () => {
  it("keeps a thing, gear or one of the cast off a set's features, and a listed kind the list's", () => {
    const raw = bibleOf({
      characters: [
        { name: 'Kofi', kind: 'person', voice: 'boy' },
        { name: 'Zuri', kind: 'animal', look: 'a small brown dog' },
      ],
      things: [{ name: 'kite' }],
      sets: [
        {
          name: 'Beach',
          kind: 'outdoor',
          features: [
            { id: 'stick', name: 'a long stick', kind: 'prop', spot: 'left' },
            { id: 'pole', name: 'a long stick', kind: 'prop', spot: 'left' },
            { id: 'umbrella', name: 'umbrella', kind: 'thing' },
            { id: 'zuri', name: 'Zuri', kind: 'dog' },
            { id: 'kofi', name: 'Kofi', kind: 'person' },
            { id: 'kite', name: 'a big red kite', kind: 'thing' },
            {
              id: 'gate',
              name: 'gate',
              kind: 'entrance',
              spot: 'left',
              opens: false,
            },
            { name: 'wooden bench', kind: 'seat', spot: 'right' },
            { id: 'sign', name: 'the old signpost', kind: 'sign' },
            { name: 'bus stop', kind: 'stop' },
          ],
        },
      ],
    });
    expect(
      raw.sets[0].features?.map((f) => [f.id, f.name, f.kind, f.opens]),
    ).toEqual([
      ['gate', 'gate', 'gate', true],
      ['wooden-bench', 'wooden bench', 'bench', false],
      ['sign', 'signpost', 'drawn', false],
      ['bus-stop', 'bus stop', 'drawn', false],
    ]);
  });

  it('never takes an idiom, a person by their work, an animal or "the others" for a thing or a feature', () => {
    const sheet = sheetOf([
      { kind: 'line', who: 'ama', say: 'We are late for the doctor!' },
      {
        kind: 'action',
        who: 'kofi',
        do: 'take',
        say: 'Kofi picks up the pace.',
      },
      {
        kind: 'action',
        who: 'ama',
        do: 'walk',
        say: 'Ama runs to the driver.',
      },
      {
        kind: 'action',
        who: 'kofi',
        do: 'drop',
        say: 'Kofi drops the subject.',
      },
      {
        kind: 'action',
        who: 'kofi',
        do: 'walk',
        say: 'Kofi walks to the donkey.',
      },
      {
        kind: 'action',
        who: 'ama',
        do: 'lean',
        say: 'Ama leans back against the others.',
      },
      { kind: 'line', who: 'kofi', say: 'Fine.' },
    ]);
    const { things, features } = mendSheet(sheet, bible);
    expect(things).toEqual([]);
    expect(features).toEqual([]);
  });

  it('knows a described thing by its noun, as one thing, and keeps how the words say it looks', () => {
    const sheet = sheetOf(
      [
        { kind: 'narration', say: 'Kofi has a red kite.' },
        {
          kind: 'business',
          who: 'kofi',
          do: 'raise',
          say: 'Kofi flies his kite.',
        },
        {
          kind: 'business',
          who: 'kofi',
          do: 'throw',
          say: 'Kofi throws the kite to Ama.',
        },
        { kind: 'line', who: 'ama', say: 'Got it!' },
      ],
      {
        onStage: [
          { who: 'kofi', spot: 'centre-left', holding: 'red kite' },
          { who: 'ama', spot: 'centre-right' },
        ],
      },
    );
    const mended = mendSheet(sheet, bible);
    expect(mended.things).toEqual([
      { id: 'kite', name: 'kite', kind: 'thing', look: 'red' },
    ]);
    expect(mended.sheet.onStage[0].holding).toBe('kite');
    const grown = withFound(bible, mended.sheet.set, mended);
    const script = stageStory(mended.sheet, grown);
    expect(script.props).toEqual(['kite']);
    expect(script.ownThings).toEqual([
      { id: 'kite', name: 'kite', look: 'red' },
    ]);
    // A kite the show has, with no look yet, takes the look a later scene says.
    const plain = withFound(bible, 'field', {
      features: [],
      things: [{ id: 'kite', name: 'kite', kind: 'thing' }],
    });
    const later = mendSheet(sheet, plain);
    expect(withFound(plain, 'field', later).things).toEqual([
      { id: 'kite', name: 'kite', kind: 'thing', look: 'red' },
    ]);
  });

  it('goes after a thing where it is, not to a feature that shares its word', () => {
    const grandma = bibleOf({
      characters: [
        { name: 'Grandma', kind: 'person', voice: 'old woman' },
        { name: 'Zuri', kind: 'animal', look: 'a small brown dog' },
      ],
      sets: [{ name: 'Beach', kind: 'outdoor' }],
    });
    // A feature kept before features were checked, known by a thing's word.
    const stored = {
      ...grandma,
      sets: [
        {
          ...grandma.sets[0],
          features: [
            {
              id: 'stick',
              name: 'stick',
              kind: 'drawn' as const,
              spot: 'left' as const,
              opens: false,
            },
          ],
        },
      ],
    };
    const sheet = storySheetOf({
      title: 'Fetch',
      set: 'beach',
      onStage: [
        { who: 'grandma', spot: 'centre-right' },
        { who: 'zuri', spot: 'centre' },
      ],
      props: [{ prop: 'stick', near: 'grandma' }],
      beats: [
        {
          kind: 'business',
          who: 'grandma',
          do: 'take',
          say: 'Grandma takes the stick.',
        },
        {
          kind: 'business',
          who: 'grandma',
          do: 'throw',
          target: '@right',
          say: 'Grandma throws the stick down the beach.',
        },
        {
          kind: 'action',
          who: 'zuri',
          do: 'chase',
          target: 'stick',
          say: 'Zuri races after the stick.',
        },
        { kind: 'line', who: 'grandma', say: 'Good girl!' },
      ],
    });
    const mended = mendSheet(sheet, stored);
    const script = stageStory(mended.sheet, withFound(stored, 'beach', mended));
    const chase = script.steps.find((s) => s.at.phrase.startsWith('Zuri'));
    expect(chase?.stage?.at?.zuri).not.toMatch(/stick/);
  });
});

describe('old shows, written before a show had things of its own', () => {
  const maya = (file: string): unknown =>
    JSON.parse(
      readFileSync(join(__dirname, '__fixtures__', 'maya', file), 'utf8'),
    );

  it('load as they were: no things, the same features, the same sheets', () => {
    const raw = maya('bible.json') as { sets: { features?: unknown }[] };
    const old = bibleOf(raw);
    expect(old.things).toBeUndefined();
    expect(thingsOf(undefined)).toEqual([]);
    for (const [k, set] of raw.sets.entries())
      expect(featuresOf(set.features)).toEqual(old.sets[k].features ?? []);
    for (const n of [1, 2, 3, 4, 5]) {
      const sheet = storySheetOf(maya(`s${n}-sheet.json`));
      // Every thing a Maya scene handles is one of the lists'.
      expect(mendSheet(sheet, old).things).toEqual([]);
    }
  });
});
