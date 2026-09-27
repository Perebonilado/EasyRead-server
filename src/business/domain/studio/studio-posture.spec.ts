import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bibleOf, storySheetOf, type StorySheet } from './studio';
import {
  describeEnd,
  endBefore,
  endStateOf,
  mendSheet,
  repairSheet,
  withFound,
} from './studio-check';
import { outfitsOf, posturesOf, stationOf } from './studio-posture';
import { stageStory } from './studio-stage';
import { voiced } from './__fixtures__/voiced';
import { doingsIn } from '../scene-directions';
import type { SceneScript } from '../scene-script';

/**
 * Someone in bed, sitting or lying down, and what they wear: the kit's
 * one standing figure, rigged, held down at the set's own bed or seat and
 * getting up out of it, the bed staying where it is; and dressed as the
 * words say, never carrying their clothes about.
 */

const tobi = (file: string): unknown =>
  JSON.parse(
    readFileSync(join(__dirname, '__fixtures__', 'tobi', file), 'utf8'),
  );
/** "Tobi's First Day of Stories", as the maker made it. */
const bible = bibleOf(tobi('bible.json'));
/** Its first scene: Tobi in bed at dawn, up, dressed, and off to breakfast. */
const scene1 = storySheetOf(tobi('s1-sheet.json'));

const features = bible.sets.find((s) => s.id === 'bedroom')!.features!;

/** A sheet in Tobi's bedroom. */
const sheetOf = (
  onStage: Record<string, unknown>[],
  beats: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): StorySheet =>
  storySheetOf({ title: 'Morning', set: 'bedroom', onStage, beats, ...extra });

/** A sheet mended and staged as the worker does. */
function staged(sheet: StorySheet, before = null) {
  const mended = mendSheet(repairSheet(sheet, bible, before), bible, before);
  const show = withFound(bible, mended.sheet.set, mended);
  return {
    sheet: mended.sheet,
    mended: mended.mended,
    show,
    script: stageStory(mended.sheet, show, { before }),
  };
}

/** Each step's station for someone, with the moment it comes after, in order. */
const stationsOf = (script: SceneScript, who: string) =>
  script.steps.flatMap((step) =>
    step.stage?.at?.[who] ? [step.stage.at[who]] : [],
  );

describe('the words for getting into bed, out of it, and dressing', () => {
  const actors = [
    { id: 'tobi', names: ['Tobi'], gender: 'm' as const },
    { id: 'mama', names: ['Mama'], gender: 'f' as const },
  ];
  const read = (words: string) =>
    doingsIn(words, {
      actors,
      who: 'tobi',
      things: [{ id: 'uniform', name: 'uniform' }],
    }).map(
      (d) =>
        `${d.do}${d.target ? ` @${d.target}` : ''}${d.thing ? ` #${d.thing}` : ''}`,
    );

  it('reads out of bed as getting up, never as leaving', () => {
    expect(read('Tobi jumps out of bed.')).toEqual(['stand-up @bed']);
    expect(read('Tobi climbs out of bed.')).toEqual(['stand-up @bed']);
    expect(read('Tobi gets out of bed himself.')).toEqual(['stand-up @bed']);
    expect(read('Tobi rolls out of bed.')).toEqual(['stand-up @bed']);
    // Out of a car is still going.
    expect(read('Tobi jumps out of the car.')).toEqual(['leave']);
  });

  it('reads into bed as lying down in it, never as coming on', () => {
    expect(read('Tobi climbs into bed.')).toEqual(['lie-down @bed']);
    expect(read('Tobi hops into bed.')).toEqual(['lie-down @bed']);
    expect(read('Tobi hops back into bed.')).toEqual(['lie-down @bed']);
    expect(read('Tobi goes to bed.')).toEqual(['lie-down @bed']);
    // Going over to it is going over to it.
    expect(read('Tobi goes to the bed.')).toEqual(['walk @bed']);
  });

  it('reads sitting up in bed as sitting, in it; and sitting or lying on a seat', () => {
    expect(read('Tobi sits up in bed.')).toEqual(['sit @bed']);
    expect(read('Mama sits on the bench.')).toEqual(['sit @bench']);
    expect(read('Tobi lies down on the sofa.')).toEqual(['lie-down @sofa']);
  });

  it('reads putting on and taking off only a thing worn', () => {
    expect(read('Tobi puts on his uniform.')).toEqual(['dress #uniform']);
    expect(read('Tobi puts his uniform on.')).toEqual(['dress #uniform']);
    expect(read('Tobi pulls on his red coat.')).toEqual(['dress #coat']);
    expect(read('Tobi gets dressed.')).toEqual(['dress']);
    expect(read('Mama takes off her hat.')).toEqual(['undress #hat']);
    expect(read('Tobi puts the cup on the table.')).toEqual(['put #cup']);
    expect(read('Tobi puts on a show.')).toEqual([]);
  });
});

describe('how everyone is as a scene goes on', () => {
  it("opens in bed in the set's bed, gets up at the words, and stands after", () => {
    const changes = posturesOf(scene1, features);
    expect(changes.opening.get('tobi')).toEqual({
      how: 'sit',
      on: 'bed',
      in: true,
    });
    expect(stationOf(changes.opening.get('tobi')!)).toBe('in:bed');
    // "Tobi gets out of bed himself": up, from the bed.
    expect(changes.standsFrom.get(1)).toEqual(changes.opening.get('tobi'));
    // Up already: running out of the door needs nothing first.
    expect([...changes.rises.keys()]).toEqual([]);
  });

  it('has someone down get up first to go anywhere, or to jump', () => {
    const sheet = sheetOf(
      [
        { who: 'tobi', spot: 'centre', pose: 'in bed' },
        { who: 'mama', spot: 'left', pose: 'sitting', on: 'chair' },
      ],
      [
        { kind: 'line', who: 'mama', say: 'Wake up!' },
        {
          kind: 'action',
          who: 'tobi',
          do: 'leave',
          via: 'door',
          say: 'Tobi runs out of the door.',
        },
        { kind: 'action', who: 'mama', do: 'jump', say: 'Mama jumps.' },
      ],
    );
    const changes = posturesOf(sheet, features);
    expect(changes.opening.get('mama')).toEqual({
      how: 'sit',
      on: 'chair',
      in: false,
    });
    expect([...changes.rises.keys()]).toEqual([1, 2]);
  });

  it('sits someone on a seat, and lays them down in a bed, where the words say', () => {
    const sheet = sheetOf(
      [{ who: 'tobi', spot: 'centre' }],
      [
        {
          kind: 'action',
          who: 'tobi',
          do: 'sit',
          target: 'chair',
          say: 'Tobi sits on the chair.',
        },
        {
          kind: 'action',
          who: 'tobi',
          do: 'lie-down',
          target: 'bed',
          say: 'Tobi climbs into bed.',
        },
        {
          kind: 'action',
          who: 'tobi',
          do: 'sit',
          target: 'bed',
          say: 'Tobi sits up in bed.',
        },
      ],
    );
    const changes = posturesOf(sheet, features);
    expect(changes.downTo.get(0)).toEqual({
      how: 'sit',
      on: 'chair',
      in: false,
    });
    expect(changes.downTo.get(1)).toEqual({ how: 'lie', on: 'bed', in: true });
    // Sitting up where they lay: still in it.
    expect(changes.downTo.get(2)).toEqual({ how: 'sit', on: 'bed', in: true });
  });
});

describe('what someone going through something shows, and for how long', () => {
  it('has someone asleep until they wake, and a bulb for an idea only a moment', () => {
    const { script } = staged(
      sheetOf(
        [
          { who: 'tobi', spot: 'centre', pose: 'in bed' },
          { who: 'mama', spot: 'left' },
        ],
        [
          { kind: 'reaction', who: 'tobi', sign: 'sleeping' },
          { kind: 'line', who: 'mama', say: 'Wake up, Tobi!' },
          { kind: 'reaction', who: 'tobi', sign: 'idea', feeling: 'happy' },
          { kind: 'line', who: 'tobi', say: 'It is my first day of school!' },
          { kind: 'line', who: 'mama', say: 'It is, my love. Up you get.' },
          {
            kind: 'action',
            who: 'tobi',
            do: 'stand-up',
            target: 'bed',
            say: 'Tobi gets out of bed.',
          },
        ],
      ),
    );
    const changes = script.steps.flatMap((step) =>
      step.effects
        .filter(
          (e) =>
            e.target === 'tobi' && (e.part === 'sleeping' || e.part === 'idea'),
        )
        .map((e) => `${e.do} ${e.part}`),
    );
    // Asleep, then an idea in its place, seen a moment and gone: never
    // asleep again, nor the bulb for the rest of the scene.
    expect(changes).toEqual([
      'show sleeping',
      'hide sleeping',
      'show idea',
      'hide idea',
    ]);
  });

  it('wakes someone asleep who speaks or gets up, with no sign given', () => {
    const { script } = staged(
      sheetOf(
        [{ who: 'tobi', spot: 'centre', pose: 'in bed' }],
        [
          { kind: 'reaction', who: 'tobi', sign: 'sleeping' },
          { kind: 'narration', say: 'The sun comes up.' },
          { kind: 'line', who: 'tobi', say: 'Morning already?' },
        ],
      ),
    );
    const said = script.steps.findIndex((step) =>
      step.effects.some(
        (e) => e.target === 'tobi' && e.part === 'sleeping' && e.do === 'hide',
      ),
    );
    expect(said).toBeGreaterThan(0);
  });
});

describe('what everyone wears as a scene goes on', () => {
  it('has Tobi, getting dressed out of bed at dawn, in pyjamas until he puts his uniform on', () => {
    const { sheet } = staged(scene1);
    const worn = outfitsOf(sheet, bible).get('tobi')!;
    expect(worn.opening).toMatchObject({
      top: 'pyjamas',
      extras: ['bare feet'],
    });
    const at = sheet.beats.findIndex((b) => b.do === 'dress');
    expect(worn.changes).toEqual([
      { beat: at, spec: bible.characters[0].figure },
    ]);
  });

  it('has someone in bed who gets dressed into anything in their pyjamas until they do, never twice', () => {
    // "Tobi is snuggled up in bed in his pyjamas": in them already.
    const sheet = sheetOf(
      [{ who: 'tobi', spot: 'centre', pose: 'in bed' }],
      [
        {
          kind: 'narration',
          say: 'Tobi is snuggled up in bed in his pyjamas.',
        },
        {
          kind: 'action',
          who: 'tobi',
          do: 'stand-up',
          target: 'bed',
          say: 'Tobi gets out of bed.',
        },
        {
          kind: 'business',
          who: 'tobi',
          do: 'dress',
          thing: 'jumper',
          say: 'Tobi puts on his red jumper.',
        },
      ],
    );
    const { sheet: mended } = staged(sheet);
    expect(mended.beats.filter((b) => b.do === 'dress')).toHaveLength(1);
    const worn = outfitsOf(mended, bible).get('tobi')!;
    expect(worn.opening).toMatchObject({ top: 'pyjamas' });
    expect(worn.changes.map((c) => [c.spec.top, c.spec.topColour])).toEqual([
      ['jumper', 'red'],
    ]);
  });

  it('keeps bare feet until shoes are put on, whatever is put on before them', () => {
    const sheet = sheetOf(
      [{ who: 'tobi', spot: 'centre', pose: 'in bed' }],
      [
        {
          kind: 'action',
          who: 'tobi',
          do: 'stand-up',
          target: 'bed',
          say: 'Tobi gets out of bed.',
        },
        {
          kind: 'business',
          who: 'tobi',
          do: 'dress',
          thing: 'uniform',
          say: 'Tobi puts on his uniform.',
        },
        {
          kind: 'business',
          who: 'tobi',
          do: 'dress',
          thing: 'shoes',
          say: 'Tobi puts on his shoes.',
        },
      ],
    );
    const { sheet: mended } = staged(sheet);
    const worn = outfitsOf(mended, bible).get('tobi')!;
    expect(worn.opening.extras).toContain('bare feet');
    expect(
      worn.changes.map((c) => c.spec.extras.includes('bare feet')),
    ).toEqual([true, false]);
    expect(worn.changes[0].spec.top).toBe('uniform');
  });

  it('puts shoes on someone dressed already, never pyjamas', () => {
    const sheet = sheetOf(
      [{ who: 'tobi', spot: 'centre', pose: 'sitting', on: 'chair' }],
      [
        {
          kind: 'business',
          who: 'tobi',
          do: 'dress',
          thing: 'shoes',
          say: 'Tobi puts his shoes on.',
        },
      ],
      { time: 'dawn' },
    );
    const { sheet: mended } = staged(sheet);
    const worn = outfitsOf(mended, bible).get('tobi')!;
    expect(worn.opening).toEqual({
      ...bible.characters[0].figure,
      extras: [...bible.characters[0].figure!.extras, 'bare feet'],
    });
    expect(worn.changes.map((c) => c.spec)).toEqual([
      bible.characters[0].figure,
    ]);
  });

  it('keeps the colour the words give clothes someone has on, put on for them', () => {
    const sheet = sheetOf(
      [
        { who: 'tobi', spot: 'left' },
        { who: 'mama', spot: 'right' },
      ],
      [
        { kind: 'narration', say: 'Mama is wearing her pink coat.' },
        { kind: 'line', who: 'mama', say: 'Off we go!' },
      ],
    );
    const { sheet: mended } = staged(sheet);
    expect(mended.beats.find((b) => b.do === 'dress')).toMatchObject({
      who: 'mama',
      say: 'Mama puts on her pink coat.',
    });
    const worn = outfitsOf(mended, bible).get('mama')!;
    expect(worn.changes.at(-1)!.spec).toMatchObject({
      top: 'coat',
      topColour: 'pink',
    });
  });

  it("draws a thing of the show's own that is put on in the colour it is worn in", () => {
    const jumper = {
      ...bible,
      things: [{ id: 'jumper', name: 'jumper', kind: 'thing' as const }],
    };
    const sheet = sheetOf(
      [{ who: 'tobi', spot: 'centre' }],
      [
        {
          kind: 'business',
          who: 'tobi',
          do: 'take',
          thing: 'jumper',
          prop: 'jumper',
          say: 'Tobi picks up his jumper.',
        },
        {
          kind: 'business',
          who: 'tobi',
          do: 'dress',
          thing: 'jumper',
          prop: 'jumper',
          say: 'Tobi puts on his jumper.',
        },
      ],
      { props: [{ prop: 'jumper', near: 'tobi' }] },
    );
    const mended = mendSheet(sheet, jumper);
    const look = mended.things.find((t) => t.id === 'jumper')?.look;
    const grown = withFound(jumper, 'bedroom', mended);
    const worn = outfitsOf(mended.sheet, grown).get('tobi')!;
    // The colour it is drawn in is the colour it is worn in.
    expect(look).toBe(`${worn.changes.at(-1)!.spec.topColour} jumper`);
  });

  it('draws pyjamas taken off in the colour they were worn', () => {
    const night = {
      ...bible,
      things: [{ id: 'pyjamas', name: 'pyjamas', kind: 'thing' as const }],
    };
    const sheet = sheetOf(
      [{ who: 'tobi', spot: 'centre', pose: 'in bed' }],
      [
        {
          kind: 'action',
          who: 'tobi',
          do: 'stand-up',
          target: 'bed',
          say: 'Tobi gets out of bed.',
        },
        {
          kind: 'business',
          who: 'tobi',
          do: 'undress',
          thing: 'pyjamas',
          prop: 'pyjamas',
          say: 'Tobi takes off his pyjamas.',
        },
        {
          kind: 'business',
          who: 'tobi',
          do: 'dress',
          thing: 'uniform',
          say: 'Tobi puts on his uniform.',
        },
      ],
    );
    const mended = mendSheet(sheet, night);
    const worn = outfitsOf(mended.sheet, night).get('tobi')!;
    expect(mended.things.find((t) => t.id === 'pyjamas')?.look).toBe(
      `${worn.opening.topColour} pyjamas`,
    );
  });

  it('puts a coat on over what someone usually wears, in its own colour', () => {
    const coat = {
      ...bible,
      things: [
        ...(bible.things ?? []),
        { id: 'coat', name: 'coat', kind: 'thing' as const, look: 'red' },
      ],
    };
    const sheet = sheetOf(
      [{ who: 'mama', spot: 'left', holding: 'coat' }],
      [
        {
          kind: 'business',
          who: 'mama',
          do: 'dress',
          thing: 'coat',
          prop: 'coat',
          say: 'Mama puts on her red coat.',
        },
      ],
    );
    const worn = outfitsOf(sheet, coat).get('mama')!;
    expect(worn.opening).toEqual(bible.characters[1].figure);
    expect(worn.changes[0].spec).toMatchObject({
      top: 'coat',
      topColour: 'red',
    });
  });
});

describe('Tobi in bed, as the stage plays it', () => {
  const { sheet, script, mended } = staged(scene1);

  it("draws Tobi as the kit's standing figure, never with a bed of his own", () => {
    const cast = script.cast.find((t) => t.id === 'tobi');
    expect(cast).not.toHaveProperty('pose');
    // In pyjamas, and his uniform as the clothes he changes into.
    expect(cast).toMatchObject({
      wears: { top: 'pyjamas' },
      dress: [
        { state: 'dress-1', spec: { top: 'uniform', topColour: 'blue' } },
      ],
    });
  });

  it("has him in the set's bed, held sitting up, and steps him down beside it as he gets up", () => {
    expect(script.steps[0].stage?.at?.tobi).toBe('in:bed');
    expect(script.steps[0].effects).toContainEqual({
      target: 'tobi',
      part: null,
      do: 'sit',
    });
    const stand = script.steps.findIndex((step) =>
      step.effects.some((e) => e.target === 'tobi' && e.do === 'stand'),
    );
    const out = script.steps.findIndex(
      (step, k) => k > stand && step.stage?.at?.tobi?.startsWith('by:bed:'),
    );
    expect(stand).toBeGreaterThan(0);
    expect(out).toBeGreaterThan(stand);
    // Down beside it just as he starts to rise, in the same quiet: never
    // stood up on the bed first.
    const rise = script.steps[stand].effects.find((e) => e.do === 'stand')!;
    const lead = script.steps[out].after! - script.steps[stand].after!;
    expect(lead).toBeGreaterThan(0);
    expect(lead).toBeLessThanOrEqual(0.3);
    expect(lead * 1000).toBeLessThan((rise.ms ?? 0) * 0.5);
    expect(stationsOf(script, 'tobi').slice(0, 2)).toEqual([
      'in:bed',
      'by:bed:1',
    ]);
  });

  it('puts his uniform on before the words have him spin round in it, quietly', () => {
    const at = sheet.beats.findIndex((b) => b.say.includes('spins round'));
    expect(sheet.beats[at - 1]).toMatchObject({
      do: 'dress',
      thing: 'uniform',
    });
    expect(sheet.beats[at - 2]).toMatchObject({ do: 'take', thing: 'uniform' });
    expect(mendSheet(scene1, bible).mended.join(' ')).toMatch(
      /Tobi puts on the new uniform first/,
    );
    void mended;
    // The uniform goes into his clothes as he puts it on: shown at its moment.
    expect(
      script.steps.some((step) =>
        step.effects.some(
          (e) => e.target === 'tobi' && e.part === 'dress-1' && e.do === 'show',
        ),
      ),
    ).toBe(true);
    expect(
      script.beats
        .flatMap((b) => b.business ?? [])
        .find((b) => b.does === 'wear'),
    ).toMatchObject({ who: 'tobi', prop: 'uniform' });
  });

  it('changes his clothes in the film just as the uniform goes on, whatever he handled before', () => {
    const { scene } = voiced(script);
    const [on] = scene
      .props!.flatMap((p) => p.does)
      .filter(([, who, does]) => who === 'tobi' && does === 'wear');
    const shown = scene.effects.find(
      (e) => e.target === 'tobi' && e.part === 'dress-1' && e.do === 'show',
    )!;
    expect(shown.atMs).toBe(on[0]);
  });

  it('never moves the bed, nor anyone still in it, sampled through the film', () => {
    const { scene } = voiced(script);
    const bed = scene.setting!.features!.find((f) => f.id === 'bed')!;
    expect(bed.cover).toBe('cover');
    expect(scene.things.every((t) => t.kind !== 'drawing' || !t.drawnAs)).toBe(
      true,
    );
    const places = scene.stagings.wide.places;
    const moves = scene.acting?.tobi?.moves ?? [];
    for (let t = 0; t < scene.durationMs; t += 250) {
      const k = scene.steps.findLastIndex((step) => step.atMs <= t);
      if (k <= 0) continue;
      for (const who of scene.steps[k].show) {
        const was = places[k - 1][who];
        const now = places[k][who];
        if (!was || !now || Math.abs(was.x - now.x) < 1) continue;
        // Whoever was in a bed or on a seat moved only as they got up.
        const from =
          script.steps.filter((step) => step.stage)[k - 1]?.stage?.at?.[who] ??
          '';
        if (!/^(?:in|on):/.test(from)) continue;
        expect(
          moves.some(
            ([at, move]) => move === 'stand' && at <= scene.steps[k].atMs,
          ),
        ).toBe(true);
      }
    }
  });
});

describe('getting up first, sitting down where the words say', () => {
  it('has someone in bed get up before they run out, the quiet long enough for both', () => {
    const { script } = staged(
      sheetOf(
        [{ who: 'tobi', spot: 'centre', pose: 'in bed' }],
        [
          { kind: 'narration', say: 'It is morning.' },
          {
            kind: 'action',
            who: 'tobi',
            do: 'leave',
            via: 'door',
            say: 'Tobi runs out of the door.',
          },
          { kind: 'narration', say: 'Off he goes.' },
        ],
      ),
    );
    const stand = script.steps.find((s) =>
      s.effects.some((e) => e.target === 'tobi' && e.do === 'stand'),
    )!;
    const leave = script.steps.find((s) => s.stage?.leave?.includes('tobi'))!;
    expect(stand.after).toBe(0);
    expect(leave.after!).toBeGreaterThanOrEqual(1.1);
    expect(script.beats[0].holdS!).toBeGreaterThan(leave.after!);
    // Down beside the bed as he rises, and off from there: never along
    // the top of it from where he sat.
    const down = script.steps.find(
      (s) => s.stage?.at?.tobi?.startsWith('by:bed:') && !s.stage.leave,
    )!;
    expect(down.after!).toBeGreaterThan(0);
    expect(down.after!).toBeLessThanOrEqual(0.3);
    expect(leave.after!).toBeCloseTo(down.after! + 1.1, 5);
  });

  it('walks someone to a seat to sit on it, and to a sofa to lie along it', () => {
    const lounge = bibleOf({
      characters: [{ name: 'Maya', voice: 'girl', figure: { age: 'child' } }],
      sets: [
        {
          id: 'park',
          name: 'Park',
          features: [
            { id: 'bench', name: 'bench', kind: 'bench', spot: 'left' },
            { id: 'sofa', name: 'sofa', kind: 'sofa', spot: 'right' },
          ],
        },
      ],
    });
    const sheet = storySheetOf({
      title: 'Rest',
      set: 'park',
      onStage: [{ who: 'maya', spot: 'centre' }],
      beats: [
        { kind: 'line', who: 'maya', say: 'I am tired.' },
        {
          kind: 'action',
          who: 'maya',
          do: 'sit',
          target: 'bench',
          say: 'Maya sits on the bench.',
        },
        { kind: 'line', who: 'maya', say: 'No, the sofa.' },
        {
          kind: 'action',
          who: 'maya',
          do: 'lie-down',
          target: 'sofa',
          say: 'Maya lies down on the sofa.',
        },
      ],
    });
    const mended = mendSheet(sheet, lounge);
    const script = stageStory(mended.sheet, withFound(lounge, 'park', mended));
    expect(stationsOf(script, 'maya')).toEqual([
      'centre',
      'on:bench',
      'on:sofa:lie',
    ]);
    const held = script.steps.flatMap((s) =>
      s.effects.filter(
        (e) => e.target === 'maya' && (e.do === 'sit' || e.do === 'lie'),
      ),
    );
    expect(held.map((e) => [e.do, e.part])).toEqual([
      ['sit', 'f:bench'],
      // Lying along it, head to its head end, on the left.
      ['lie', '@right'],
    ]);
  });

  it("plays an arm's pose from a sheet written before as a move, the arm then free", () => {
    const { script } = staged(
      sheetOf(
        [{ who: 'mama', spot: 'left', pose: 'waving' }],
        [
          { kind: 'line', who: 'mama', say: 'Good morning!' },
          { kind: 'line', who: 'mama', say: 'Up you get.' },
        ],
      ),
    );
    expect(script.cast.find((t) => t.id === 'mama')).not.toHaveProperty('pose');
    expect(
      script.steps
        .flatMap((s) => s.effects)
        .find((e) => e.target === 'mama' && e.do === 'wave'),
    ).toBeDefined();
  });

  it('keeps an animal in bed lying there, in the bed', () => {
    const pets = bibleOf({
      characters: [
        { name: 'Tobi', voice: 'boy', figure: { age: 'child' } },
        { name: 'Bingo', kind: 'animal', look: 'a small dog', size: 'small' },
      ],
      sets: [{ id: 'bedroom', name: 'Bedroom', features }],
    });
    const sheet = storySheetOf({
      title: 'Sleepy',
      set: 'bedroom',
      onStage: [{ who: 'bingo', spot: 'centre', pose: 'in bed' }],
      beats: [
        { kind: 'narration', say: 'Bingo sleeps.' },
        { kind: 'narration', say: 'The sun comes up.' },
      ],
    });
    const mended = mendSheet(sheet, pets);
    const script = stageStory(mended.sheet, withFound(pets, 'bedroom', mended));
    expect(script.steps[0].stage?.at?.bingo).toBe('in:bed');
    // Lying along it, its head at the bed's head end.
    expect(script.steps[0].effects).toContainEqual({
      target: 'bingo',
      part: '@right',
      do: 'lie',
    });
  });

  it('keeps gear in the hand of whoever never puts it down', () => {
    const rain = bibleOf({
      characters: [{ name: 'Mama', voice: 'woman', figure: { age: 'adult' } }],
      sets: [{ id: 'street', name: 'Street' }],
    });
    const sheet = storySheetOf({
      title: 'Rain',
      set: 'street',
      onStage: [{ who: 'mama', spot: 'centre', holding: 'umbrella' }],
      beats: [
        { kind: 'line', who: 'mama', say: 'What rain!' },
        { kind: 'line', who: 'mama', say: 'Home we go.' },
      ],
    });
    const script = stageStory(mendSheet(sheet, rain).sheet, rain);
    expect(script.cast.find((t) => t.id === 'mama')).toMatchObject({
      holding: 'umbrella',
    });
  });
});

describe('what the next scene finds them wearing', () => {
  const coatBible = bibleOf({
    characters: [
      {
        name: 'Mama',
        voice: 'woman',
        figure: { age: 'adult', top: 'dress', topColour: 'green' },
      },
    ],
    things: [{ id: 'coat', name: 'coat', kind: 'thing', look: 'red' }],
    sets: [
      { id: 'hall', name: 'Hall' },
      { id: 'street', name: 'Street' },
    ],
  });
  const first = storySheetOf({
    title: 'Coat on',
    set: 'hall',
    onStage: [{ who: 'mama', spot: 'centre', holding: 'coat' }],
    beats: [
      { kind: 'line', who: 'mama', say: 'It is cold out.' },
      {
        kind: 'business',
        who: 'mama',
        do: 'dress',
        thing: 'coat',
        say: 'Mama puts on her red coat.',
      },
      { kind: 'line', who: 'mama', say: 'Off we go.' },
    ],
  });

  it('leaves what is put on worn, never held, and says so for the next writer', () => {
    const mended = mendSheet(first, coatBible).sheet;
    const end = endStateOf(mended, coatBible);
    expect(end.held ?? []).toEqual([]);
    expect(end.props.find((p) => p.prop === 'coat')).toBeUndefined();
    expect(end.wears).toMatchObject([
      { who: 'mama', figure: { top: 'coat', topColour: 'red' } },
    ]);
    expect(end.wears).toHaveLength(1);
    expect(describeEnd(end, coatBible)).toMatch(/Mama is wearing a red coat/);
  });

  it('opens the next scene in it, and a new episode from the cast', () => {
    const second = storySheetOf({
      title: 'Out',
      set: 'street',
      onStage: [{ who: 'mama', spot: 'centre' }],
      beats: [
        { kind: 'line', who: 'mama', say: 'Brr.' },
        { kind: 'line', who: 'mama', say: 'So cold.' },
      ],
    });
    const rows = [
      { position: 0, sheet: first },
      { position: 1, sheet: second },
    ];
    const before = endBefore(rows, 1, coatBible);
    const script = stageStory(second, coatBible, { before });
    expect(script.cast.find((t) => t.id === 'mama')).toMatchObject({
      wears: { top: 'coat', topColour: 'red' },
    });
    // A new episode starts from how the cast usually looks.
    expect(
      stageStory(second, coatBible).cast.find((t) => t.id === 'mama'),
    ).not.toHaveProperty('wears');
  });
});
