import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto } from '../../../contracts';
import { bibleOf, storySheetOf, type StudioBible } from './studio';
import { mendSheet, repairSheet, withFound } from './studio-check';
import { doorsOnStage, doorsUsed, openCountry } from './studio-doors';
import { stageStory } from './studio-stage';
import { voiced } from './__fixtures__/voiced';
import { doorFaults } from '../scene-door-check';
import { interactionFor } from '../scene-interact';
import { buildSet, layoutOf } from '../scene-set-layout';
import { drawPiece, doorMakeOf, wallMaterialOf } from '../scene-set-pieces';
import { withoutRoomFiller, type SetSheet } from '../scene-sheet';
import type { GatedDrawing } from '../scene-svg';
import type { StoryPlace } from '../scene-story';

/** "The Star and the Manger": its stable and its shepherds' field, as the show has them. */
const nativity = bibleOf({
  characters: [
    {
      name: 'Mary',
      kind: 'person',
      role: 'main',
      voice: 'woman',
      traits: ['gentle'],
      figure: { age: 'adult', hair: 'long', top: 'robe', skin: 4 },
    },
    {
      name: 'Joseph',
      kind: 'person',
      role: 'main',
      voice: 'man',
      traits: ['steady'],
      figure: { age: 'adult', hair: 'short', top: 'robe', skin: 4 },
    },
    {
      name: 'Shepherd',
      kind: 'person',
      role: 'supporting',
      voice: 'old man',
      traits: ['shy'],
      figure: { age: 'older', hair: 'short', top: 'robe', skin: 4 },
    },
  ],
  sets: [
    {
      id: 'stable',
      name: 'Stable',
      look: 'a humble stable in Bethlehem at night: rough stone walls, wooden beams, a wooden manger filled with straw, a small oil lamp, and the bright star shining through the open doorway',
      kind: 'indoor',
      features: [
        {
          id: 'door',
          name: 'stable door',
          kind: 'door',
          spot: 'left',
          opens: true,
        },
        {
          id: 'stool',
          name: 'wooden stool',
          kind: 'chair',
          spot: 'centre-right',
        },
      ],
    },
    {
      id: 'field',
      name: "Shepherds' Field",
      look: 'a grassy hillside outside Bethlehem at night: a warm campfire, sheep resting near a low stone wall, an olive tree, and the great star above the town',
      kind: 'outdoor',
      features: [
        { id: 'tree', name: 'olive tree', kind: 'tree', spot: 'left' },
        { id: 'fence', name: 'low stone wall', kind: 'fence', spot: 'right' },
      ],
    },
  ],
  world: {
    era: 'ancient Judea, under Roman rule',
    region: 'Judea, Bethlehem',
    homes: 'stone houses with flat roofs; a stable cave with a wooden manger',
  },
});

/** "Never Closes Early": a New York bodega and a walk-up apartment. */
const bodega = bibleOf({
  characters: [
    {
      name: 'Dee',
      kind: 'person',
      role: 'main',
      voice: 'woman',
      traits: ['tired'],
      figure: { age: 'adult', hair: 'bun', top: 'hoodie', skin: 3 },
    },
    {
      name: 'Gus',
      kind: 'person',
      role: 'main',
      voice: 'old man',
      traits: ['gruff'],
      figure: { age: 'older', hair: 'short', top: 'shirt', skin: 2 },
    },
  ],
  sets: [
    {
      id: 'bodega',
      name: "Gus's Bodega",
      look: 'the inside of a narrow New York corner bodega: shelves stacked to the ceiling, a humming drink fridge, a lottery sign',
      kind: 'indoor',
      features: [
        {
          id: 'door',
          name: 'the door',
          kind: 'door',
          spot: 'left',
          opens: true,
        },
        {
          id: 'counter',
          name: 'the counter',
          kind: 'counter',
          spot: 'centre-right',
        },
      ],
    },
    {
      id: 'apartment',
      name: 'the walk-up apartment',
      look: 'a cramped railroad apartment in Queens: a radiator under a window facing a brick wall, a sagging sofa',
      kind: 'indoor',
      features: [
        {
          id: 'door',
          name: 'the apartment door',
          kind: 'door',
          spot: 'left',
          opens: true,
        },
        { id: 'sofa', name: 'the sagging sofa', kind: 'sofa', spot: 'centre' },
      ],
    },
  ],
  world: { era: 'today', region: 'New York City, USA' },
});

/** A set painted in a pack, as the stage reads one: indoors or out, its pack marked. */
const painted = (place: 'indoor' | 'outdoor', style: string): GatedDrawing => ({
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" data-place="${place}" data-floor="630" data-style="${style}"><g id="walls"><rect x="0" y="0" width="1600" height="630" fill="#bbbcc0"/></g></svg>`,
  viewBox: [0, 0, 1600, 900],
  aspect: 16 / 9,
  parts: {},
  labels: {},
  states: {},
  moves: false,
  callouts: [],
  field: null,
});

const sheetOf = (
  set: string,
  beats: Record<string, unknown>[],
  onStage: Record<string, unknown>[],
) => storySheetOf({ title: 'Scene', set, onStage, beats });

/** A sheet mended, staged and made as the Studio makes it, on its set painted in its pack. */
function made(
  sheet: ReturnType<typeof sheetOf>,
  show: StudioBible,
  set?: GatedDrawing,
) {
  const mended = mendSheet(repairSheet(sheet, show, null), show, null);
  const grown = withFound(show, mended.sheet.set, mended);
  const script = stageStory(mended.sheet, grown, {});
  const { scene } = voiced(
    script,
    [],
    set ? { [`place-${mended.sheet.set}`]: set } : {},
  );
  return { sheet: mended.sheet, script, scene, bible: grown };
}

const doorOf = (scene: SceneDto) =>
  scene.setting?.features?.find((f) => f.kind === 'door');

describe('a door only where the story needs one (studio-door-plan)', () => {
  it('The Closed Doors: Joseph knocks and the door shuts, so the stable door is on the stage, a stable’s', () => {
    const { script, scene } = made(
      sheetOf(
        'stable',
        [
          {
            kind: 'line',
            who: 'joseph',
            to: 'mary',
            say: 'Mary, my dear, keep close. One of these doors will open.',
          },
          {
            kind: 'business',
            who: 'joseph',
            do: 'knock',
            target: 'door',
            say: 'Joseph knocks softly at the door.',
          },
          {
            kind: 'business',
            who: 'joseph',
            do: 'close',
            target: 'door',
            say: 'The door shuts in their faces.',
          },
          { kind: 'reaction', who: 'mary', feeling: 'sad', say: '' },
        ],
        [
          { who: 'joseph', spot: 'left' },
          { who: 'mary', spot: 'centre-left' },
        ],
      ),
      nativity,
      painted('indoor', 'biblical-village'),
    );
    expect(script.features?.map((f) => f.id)).toContain('door');
    const door = doorOf(scene)!;
    // Boards between stone jambs, as a Bethlehem stable's: never the grey
    // concrete doorway with a doorbell.
    expect(door.svg).toMatch(
      /^<svg data-make="plank" data-pack="biblical-village"/u,
    );
    expect(door.svg).not.toContain('#d8cbb3');
    expect(door.affordances?.operates?.map((o) => o.does)).toEqual(['knock']);
    expect(
      doorFaults(scene, { name: 'Stable', look: nativity.sets[0].look }),
    ).toEqual([]);
  });

  it('a stable scene no one in which uses the door has none: "one more door" is a door in general', () => {
    const { script, scene } = made(
      sheetOf(
        'stable',
        [
          {
            kind: 'line',
            who: 'joseph',
            to: 'mary',
            say: 'One more door, my dear. There is always one more.',
          },
          {
            kind: 'line',
            who: 'mary',
            to: 'joseph',
            say: 'We will find a place.',
          },
        ],
        [
          { who: 'joseph', spot: 'left' },
          { who: 'mary', spot: 'centre-left' },
        ],
      ),
      nativity,
      painted('indoor', 'biblical-village'),
    );
    expect(script.features?.map((f) => f.id)).toEqual(['stool']);
    expect(doorOf(scene)).toBeUndefined();
    expect(doorFaults(scene)).toEqual([]);
  });

  it('a line naming the door puts it on the stage: "Door’s locked."', () => {
    const sheet = sheetOf(
      'bodega',
      [
        {
          kind: 'line',
          who: 'dee',
          to: 'gus',
          say: "It's 11:52. Door's locked.",
        },
      ],
      [
        { who: 'dee', spot: 'left' },
        { who: 'gus', spot: 'right' },
      ],
    );
    expect([...doorsUsed(sheet, bodega.sets[0].features!, bodega)]).toEqual([
      'door',
    ]);
  });

  it('out in open country a door the story uses is a gate; the low stone wall is a stone wall', () => {
    const field = {
      ...nativity,
      sets: nativity.sets.map((s) =>
        s.id === 'field'
          ? {
              ...s,
              features: [
                ...s.features!,
                {
                  id: 'door',
                  name: 'door',
                  kind: 'door' as const,
                  spot: 'centre-right' as const,
                  opens: true,
                },
              ],
            }
          : s,
      ),
    };
    expect(openCountry(field.sets[1])).toBe(true);
    const sheet = sheetOf(
      'field',
      [
        {
          kind: 'action',
          who: 'shepherd',
          do: 'go-through',
          via: 'door',
          say: 'The shepherd walks through the door.',
        },
      ],
      [{ who: 'shepherd', spot: 'centre' }],
    );
    const shown = doorsOnStage(sheet, field.sets[1], field);
    expect(shown.features.find((f) => f.id === 'door')?.kind).toBe('gate');
    expect(shown.notes.join(' ')).toMatch(/open country/u);
    const { scene } = made(
      sheet,
      field,
      painted('outdoor', 'biblical-village'),
    );
    expect(doorOf(scene)).toBeUndefined();
    const wall = scene.setting!.features!.find((f) => f.id === 'fence')!;
    expect(wall.svg).toMatch(
      /^<svg data-make="stone" data-pack="biblical-village"/u,
    );
    expect(
      doorFaults(scene, { name: "Shepherds' Field", look: field.sets[1].look }),
    ).toEqual([]);
  });

  it('Never Closes Early: the bodega’s door no one uses is off the stage; the apartment door Dee unlocks is a painted door with its bell', () => {
    const shop = made(
      sheetOf(
        'bodega',
        [
          {
            kind: 'line',
            who: 'gus',
            to: 'dee',
            say: 'Per the lease, I close at midnight.',
          },
          {
            kind: 'line',
            who: 'dee',
            to: 'gus',
            say: 'Then I have eight minutes.',
          },
        ],
        [
          { who: 'dee', spot: 'left' },
          { who: 'gus', spot: 'right' },
        ],
      ),
      bodega,
      painted('indoor', 'western-city'),
    );
    expect(doorOf(shop.scene)).toBeUndefined();
    const home = made(
      sheetOf(
        'apartment',
        [
          {
            kind: 'business',
            who: 'dee',
            do: 'open',
            target: 'door',
            say: 'Dee unlocks the apartment door with the key.',
          },
          { kind: 'line', who: 'dee', to: 'gus', say: 'We saved her.' },
        ],
        [
          { who: 'dee', spot: 'centre-left' },
          { who: 'gus', spot: 'right' },
        ],
      ),
      bodega,
      painted('indoor', 'western-city'),
    );
    const door = doorOf(home.scene)!;
    expect(door.svg).toMatch(
      /^<svg data-make="panel" data-pack="western-city"/u,
    );
    expect(door.affordances?.operates?.map((o) => o.does)).toEqual([
      'knock',
      'bell',
    ]);
    expect(doorFaults(home.scene)).toEqual([]);
  });
});

describe('the door check (scene-door-check)', () => {
  /** "The Star and the Manger" as it was made, drawings left out. */
  const film = [0, 1, 2, 3, 4].map(
    (n) =>
      JSON.parse(
        readFileSync(
          join(__dirname, '__fixtures__/nativity', `made-s${n}.json`),
          'utf8',
        ),
      ) as SceneDto,
  );

  it('finds the Nativity’s doors drawn as no place’s, with a doorbell, though every one of them is used', () => {
    const faults = film.flatMap((scene) => doorFaults(scene));
    expect(faults.filter((f) => f.kind === 'unused')).toEqual([]);
    const doors = faults.filter((f) => f.feature === 'door');
    expect(doors.length).toBeGreaterThanOrEqual(4);
    expect(doors.every((f) => f.kind === 'style')).toBe(true);
  });

  it('finds a door drawn for another place, one no one uses, one with a bell in an old town, and one in open country', () => {
    const { scene } = made(
      sheetOf(
        'stable',
        [
          {
            kind: 'business',
            who: 'joseph',
            do: 'knock',
            target: 'door',
            say: 'Joseph knocks at the door.',
          },
        ],
        [{ who: 'joseph', spot: 'left' }],
      ),
      nativity,
      painted('indoor', 'biblical-village'),
    );
    const door = doorOf(scene)!;
    const town = drawPiece('door', 'the front door', { pack: 'western-city' });
    const as = (patch: Partial<typeof door>): SceneDto => ({
      ...scene,
      acting: {},
      setting: { ...scene.setting!, features: [{ ...door, ...patch }] },
    });
    const kinds = (one: SceneDto, place: { name: string } | null = null) =>
      doorFaults(one, place).map((f) => f.kind);
    // Drawn for a town, with its bell, in a stable no one knocks at.
    expect(kinds(as({ svg: town.svg, affordances: town.affordances }))).toEqual(
      ['style', 'style', 'unused'],
    );
    // Out on a hillside with no building ("the stable door" would be a stable's).
    const hill = as({ name: 'door' });
    hill.things = hill.things.map((t) =>
      t.kind === 'drawing' && t.id === 'place-stable'
        ? {
            ...t,
            svg: t.svg.replace('data-place="indoor"', 'data-place="outdoor"'),
          }
        : t,
    );
    expect(kinds(hill, { name: 'the hillside' })).toContain('open-country');
  });
});

describe('doors and walls as their place makes them', () => {
  it('a door by its place and its name', () => {
    expect(doorMakeOf('stable door', { pack: 'western-city' })).toBe('plank');
    expect(doorMakeOf('wooden door', { pack: 'biblical-village' })).toBe(
      'plank',
    );
    expect(doorMakeOf('the bedroom door', { pack: 'modern-town' })).toBe(
      'panel',
    );
    expect(doorMakeOf('the sliding doors', { pack: 'western-city' })).toBe(
      'sliding',
    );
    expect(doorMakeOf('door', { pack: 'modern-town', vessel: true })).toBe(
      'sliding',
    );
    expect(doorMakeOf('tent flap', { pack: 'ancient-near-east' })).toBe('flap');
    // A room's inside door has no bell; a home's way in has.
    const ops = (name: string) =>
      drawPiece('door', name, {
        pack: 'modern-town',
      }).affordances?.operates?.map((o) => o.does);
    expect(ops('the bedroom door')).toEqual(['knock']);
    expect(ops('the front door')).toEqual(['knock', 'bell']);
    // Out of doors in an old town, a front of stone with no glass and no bell.
    const house = drawPiece('door', 'house door', {
      pack: 'biblical-village',
      outdoor: true,
    });
    expect(house.svg).toMatch(/data-make="front"/u);
    expect(house.affordances?.operates?.map((o) => o.does)).toEqual(['knock']);
    expect(house.svg).not.toContain('#cfe3ee');
    // A beach hut is one storey.
    const hut = drawPiece('door', 'the beach hut', {
      pack: 'modern-town',
      outdoor: true,
    });
    expect(hut.viewBox[3]).toBeLessThan(house.viewBox[3] * 0.7);
  });

  it('a wall of what its name says, else what its place builds', () => {
    expect(wallMaterialOf('ancient-near-east')).toBe('mud');
    expect(wallMaterialOf('biblical-village')).toBe('stone');
    expect(wallMaterialOf('west-african-town')).toBe('concrete');
    expect(wallMaterialOf('western-city')).toBe('brick');
    expect(wallMaterialOf('modern-town', 'the garden hedge')).toBe('hedge');
    expect(wallMaterialOf('west-african-town', 'Corrugated wall')).toBe('zinc');
    expect(
      drawPiece('fence', 'low stone wall', { pack: 'biblical-village' }).svg,
    ).toMatch(/data-make="stone"/u);
    expect(drawPiece('fence', 'fence', { pack: 'village-farm' }).svg).toMatch(
      /data-make="timber"/u,
    );
  });

  it('a ring at a door with no bell is a knock', () => {
    const stable = drawPiece('door', 'stable door').affordances;
    expect(interactionFor('ring-bell', 'door', stable)).toBe('knock');
    const front = drawPiece('door', 'the front door').affordances;
    expect(interactionFor('ring-bell', 'door', front)).toBe('ring-bell');
  });
});

describe('no wall or door as a room’s filler', () => {
  /** The stable as its painter laid it out: a door and four stretches of wall along the back. */
  const stable: StoryPlace = {
    id: 'stable',
    name: 'Stable',
    aliases: [],
    look: nativity.sets[0].look,
    firstPage: 1,
    sound: null,
    kind: 'indoor',
    stand: 'on',
    front: 'manger',
    features: [],
  };
  const layout = layoutOf(
    {
      sky: 'night',
      ground: 'dirt',
      walls: '#8d8f96',
      items: [
        { kind: 'door', x: 0.12, row: 'back' },
        { kind: 'wall', x: 0.3, row: 'back' },
        { kind: 'wall', x: 0.5, row: 'back' },
        { kind: 'wall', x: 0.7, row: 'back' },
        { kind: 'wall', x: 0.9, row: 'back' },
        { kind: 'woodpile', x: 0.8, row: 'middle' },
      ],
      style: 'biblical-village',
    },
    stable,
  );

  it('builds a room with neither', () => {
    const built = buildSet(layout, stable);
    expect(built.svg).not.toMatch(/data-kind="wall"/u);
    expect(
      built.placed.some((p) => p.kind === 'wall' || p.kind === 'door'),
    ).toBe(false);
  });

  it('takes the stretches of wall out of a room kept with them, and leaves a street’s', () => {
    const wall = drawPiece('wall', '', { pack: 'biblical-village' });
    const piece = `<g transform="translate(261 633) scale(1.5 1.5)" data-kind="wall" data-x="0.163" data-row="back" data-roost="-80 -106">${wall.svg.replace(/^<svg[^>]*><g[^>]*>/u, '').replace(/<\/g><\/svg>$/u, '')}</g>`;
    const kept = (place: string): SetSheet => ({
      version: 3,
      drawing: {
        ...painted(place as 'indoor', 'biblical-village'),
        svg: `<svg viewBox="0 0 1600 900" data-place="${place}"><g id="walls"/>${piece}</svg>`,
      },
      layout,
      layered: {
        layers: [
          {
            id: 'back',
            depth: 0.45,
            svg: `<svg data-place="${place}">${piece}</svg>`,
          },
        ],
        width: 1600,
        floor: { back: 665, front: 892, eye: 303 },
        fore: [],
      },
    });
    const room = withoutRoomFiller(kept('indoor'));
    expect(room.drawing.svg).not.toContain('data-kind="wall"');
    expect(room.layered!.layers[0].svg).not.toContain('data-kind="wall"');
    expect(room.drawing.svg).toContain('<g id="walls"/>');
    const street = kept('outdoor');
    expect(withoutRoomFiller(street)).toBe(street);
  });
});
