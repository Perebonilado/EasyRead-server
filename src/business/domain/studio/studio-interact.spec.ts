import { bibleOf, storySheetOf, type StudioBible } from './studio';
import { endStateOf, mendSheet, repairSheet, withFound } from './studio-check';
import { auditMoves, auditScene } from './studio-audit';
import { stageStory } from './studio-stage';
import { voiced } from './__fixtures__/voiced';
import {
  INTERACT_STEPS,
  climbCount,
  featurePoint,
  footholds,
  interactClaims,
  interactFaults,
  stepSpan,
} from '../scene-interact';
import { pictureClaims } from '../scene-picture-check';
import { drawPiece } from '../scene-set-pieces';
import type { SceneDto, SceneInteractDto } from '../../../contracts';

/** "Ada's first day": a girl and her grandfather, a hall and the street outside it. */
const bible = bibleOf({
  characters: [
    {
      name: 'Ada',
      kind: 'person',
      role: 'main',
      voice: 'girl',
      traits: ['curious'],
      figure: { age: 'child', hair: 'short', top: 't-shirt', skin: 5 },
    },
    {
      name: 'Grandpa',
      kind: 'person',
      role: 'main',
      voice: 'old man',
      traits: ['kind'],
      figure: { age: 'adult', hair: 'short', top: 'shirt', skin: 3 },
    },
  ],
  sets: [
    {
      name: 'Hall',
      look: 'the hall of a house: a staircase, a table, a counter by the wall',
      kind: 'indoor',
      features: [
        { id: 'door', name: 'door', kind: 'door', spot: 'right' },
        { id: 'table', name: 'table', kind: 'table', spot: 'centre' },
        { id: 'stairs', name: 'stairs', kind: 'stairs', spot: 'left' },
        {
          id: 'switch',
          name: 'light switch',
          kind: 'switch',
          spot: 'centre-right',
        },
      ],
    },
    {
      name: 'Street',
      look: 'a quiet street outside a row of houses',
      kind: 'outdoor',
      features: [
        { id: 'door', name: 'front door', kind: 'door', spot: 'centre-right' },
      ],
    },
  ],
  world: { era: 'today', region: 'a town' },
});

const sheetOf = (
  set: string,
  beats: Record<string, unknown>[],
  onStage: Record<string, unknown>[] = [{ who: 'ada', spot: 'centre-left' }],
) =>
  storySheetOf({
    title: 'Ada',
    set,
    onStage,
    beats,
  });

/** A sheet mended, staged and made as the Studio makes it (a voice made up for it). */
function made(
  sheet: ReturnType<typeof sheetOf>,
  show: StudioBible = bible,
  before: Parameters<typeof mendSheet>[2] = null,
) {
  const mended = mendSheet(repairSheet(sheet, show, before), show, before);
  const grown = withFound(show, mended.sheet.set, mended);
  const script = stageStory(mended.sheet, grown, { before });
  const { scene } = voiced(script);
  return {
    sheet: mended.sheet,
    mended: mended.mended,
    script,
    scene,
    bible: grown,
  };
}

const interactsOf = (scene: SceneDto, who: string): SceneInteractDto[] =>
  scene.acting?.[who]?.interact ?? [];

/** Each step's length against its least. */
const heldToLeast = (one: SceneInteractDto) => {
  const least = new Map(INTERACT_STEPS[one.does].map(([n, lo]) => [n, lo]));
  return one.steps.every(
    ([name, , ms]) => ms === 0 || ms >= (least.get(name) ?? 0) - 1,
  );
};

describe('through a door (studio-interactions-plan I1)', () => {
  const walksOut = made(
    sheetOf('hall', [
      { kind: 'line', who: 'ada', say: 'Time for school!' },
      {
        kind: 'action',
        who: 'ada',
        do: 'go-through',
        say: 'Ada walks through the door.',
      },
      { kind: 'narration', say: 'The hall is quiet.' },
    ]),
  );

  it('goes to the handle side, reaches the handle as the door swings open, steps through and is gone', () => {
    const { script, scene } = walksOut;
    // Over to the door's handle side first, then gone through it.
    const stations = script.steps.flatMap((s) =>
      s.stage?.at?.ada ? [s.stage.at.ada] : [],
    );
    expect(stations).toContain('by:door:1');
    const [through] = interactsOf(scene, 'ada');
    expect(through.does).toBe('go-through');
    expect(through.steps.map(([n]) => n)).toEqual([
      'reach',
      'open',
      'through',
      'gone',
      'close',
    ]);
    expect(heldToLeast(through)).toBe(true);
    // The door swings open as the hand holds its handle, and shut behind her.
    const open = stepSpan(through, 'open')!;
    const states = scene.setting?.featureStates ?? [];
    expect(states).toContainEqual([open[0], 'door', 'open']);
    expect(
      states.some(([t, id, s]) => id === 'door' && s === 'shut' && t > open[1]),
    ).toBe(true);
    // Gone through, not walked to the door's way.
    const off = scene.steps.find((s) => s.exit?.ada);
    expect(off?.exit?.ada).toMatchObject({ via: 'door', how: 'through' });
    expect(Math.abs(off!.atMs - through.at)).toBeLessThanOrEqual(60);
  });

  it('keeps every step at its least, the hand on the handle as it opens, and no one through it shut', () => {
    expect(interactFaults(walksOut.scene)).toEqual([]);
    expect(
      auditMoves(walksOut.scene).filter((f) => /handle|shut|steps/.test(f.id)),
    ).toEqual([]);
    // Seen as the words say.
    const seen = auditScene(walksOut.sheet, walksOut.scene, walksOut.bible);
    expect(
      seen.find((one) => one.expects.includes('go-through'))?.verdict,
    ).toBe('seen');
  });

  it('says what the picture shows: her hand on the handle, then the door open', () => {
    const [through] = interactsOf(walksOut.scene, 'ada');
    const cast = [{ id: 'ada', name: 'Ada', look: '' }];
    const reach = stepSpan(through, 'open')!;
    expect(pictureClaims(walksOut.scene, reach[0] + 10, cast).doing).toContain(
      "Ada has a hand on the door's handle",
    );
    const passing = stepSpan(through, 'through')!;
    expect(
      interactClaims(walksOut.scene, passing[0] + 10, () => 'Ada'),
    ).toContain('the door is open');
  });

  it('opens the next scene, on the street, with her coming in through the same door from its other side', () => {
    const end = endStateOf(walksOut.sheet, walksOut.bible);
    expect(end.wentThrough).toEqual([{ who: 'ada', feature: 'door' }]);
    const outside = made(
      sheetOf(
        'street',
        [{ kind: 'line', who: 'ada', say: 'Bye, Grandpa!' }],
        [{ who: 'ada', spot: 'centre' }],
      ),
      walksOut.bible,
      end,
    );
    // The street's door is the hall's, seen from outside: linked for good.
    const door = outside.bible.sets
      .find((s) => s.id === 'street')
      ?.features?.find((f) => f.id === 'door');
    expect(door?.link).toEqual({ set: 'hall', feature: 'door' });
    // She is not there as it opens: she comes in through it.
    expect(outside.scene.steps[0].show).not.toContain('ada');
    const [comes] = interactsOf(outside.scene, 'ada');
    expect(comes.does).toBe('come-through');
    expect(comes.steps.map(([n]) => n)).toEqual([
      'open',
      'out',
      'walk',
      'close',
    ]);
    const entered = outside.scene.steps.find((s) => s.enter.ada);
    expect(entered?.enter.ada.via).toBe('door');
    expect(outside.scene.setting?.featureStates).toContainEqual([
      stepSpan(comes, 'open')![0],
      'door',
      'open',
    ]);
    expect(interactFaults(outside.scene)).toEqual([]);
    // In before her first word.
    expect(stepSpan(comes, 'out')![1]).toBeLessThanOrEqual(
      outside.scene.beats[0].startMs + 400,
    );
  });

  it("out of doors, the door is a building's: its front drawn round it at the back of the street, never a door on its own", () => {
    const end = endStateOf(walksOut.sheet, walksOut.bible);
    const outside = made(
      sheetOf(
        'street',
        [{ kind: 'line', who: 'ada', say: 'Bye, Grandpa!' }],
        [{ who: 'ada', spot: 'centre' }],
      ),
      walksOut.bible,
      end,
    );
    const street = outside.scene.setting!.features!.find(
      (f) => f.id === 'door',
    )!;
    const hall = walksOut.scene.setting!.features!.find(
      (f) => f.id === 'door',
    )!;
    const ada = outside.scene.stagings.wide.places.flatMap((p) =>
      p.ada ? [p.ada] : [],
    )[0];
    // A building's front: though farther off, far wider and taller than
    // the hall's door, which is only a doorway in its wall.
    expect(street.at.wide.w).toBeGreaterThan(hall.at.wide.w * 1.4);
    expect(street.at.wide.h).toBeGreaterThan(hall.at.wide.h * 1.1);
    expect(street.at.wide.w).toBeGreaterThan(ada.w);
    // At the back of the street, farther off than the people.
    expect(street.feet!.wide).toBeLessThan(ada.y + ada.h - 20);
    // She comes out of it at its doorway, the building round her.
    const [comes] = interactsOf(outside.scene, 'ada');
    expect(comes.does).toBe('come-through');
    expect(interactFaults(outside.scene)).toEqual([]);
    expect(street.way.wide.x).toBeGreaterThan(
      street.at.wide.x + street.at.wide.w * 0.3,
    );
    expect(street.way.wide.x).toBeLessThan(
      street.at.wide.x + street.at.wide.w * 0.7,
    );
  });

  it('a gate stands in its wall, never alone', () => {
    const gate = drawPiece('gate', 'gate', { pack: 'western-city' });
    const [, , vw] = gate.viewBox;
    // Wall runs off both sides of its posts.
    const runs = [...gate.svg.matchAll(/<rect x="(-?[\d.]+)"/gu)].map((m) =>
      Number(m[1]),
    );
    expect(Math.min(...runs)).toBeLessThan(-vw / 2 - 100);
    expect(Math.max(...runs)).toBeGreaterThan(vw / 2 - 20);
    // And a door out of doors is a building's, its doorway where people stand.
    const front = drawPiece('door', 'front door', {
      pack: 'western-city',
      outdoor: true,
    });
    expect(front.stand).toEqual([-86, 86]);
    expect(front.viewBox[2]).toBeGreaterThan(400);
    expect(front.affordances).toEqual(
      drawPiece('door', 'front door').affordances,
    );
    expect(drawPiece('door', 'door').stand).toBeUndefined();
  });

  it('knocks: the hand to the door, knocks, and a wait', () => {
    const { scene, script } = made(
      sheetOf('hall', [
        { kind: 'line', who: 'ada', say: 'Is anyone in?' },
        {
          kind: 'business',
          who: 'ada',
          do: 'knock',
          target: 'door',
          say: 'Ada knocks on the door.',
        },
        { kind: 'line', who: 'ada', say: 'Hello?' },
      ]),
    );
    expect(
      script.steps.some((s) => s.stage?.at?.ada?.startsWith('by:door:')),
    ).toBe(true);
    const [knock] = interactsOf(scene, 'ada');
    expect(knock.does).toBe('knock');
    expect(knock.steps.map(([n]) => n)).toEqual([
      'reach',
      'knock',
      'back',
      'wait',
    ]);
    expect(heldToLeast(knock)).toBe(true);
  });
});

describe('furniture (studio-interactions-plan I2)', () => {
  it('sits at the table: the chair pulled out, sat on, tucked in; up again, pushed back', () => {
    const { scene, script } = made(
      sheetOf('hall', [
        { kind: 'line', who: 'ada', say: 'Breakfast!' },
        {
          kind: 'action',
          who: 'ada',
          do: 'sit',
          target: 'table',
          say: 'Ada sits at the table.',
        },
        { kind: 'line', who: 'ada', say: 'Yum.' },
        { kind: 'action', who: 'ada', do: 'stand-up', say: 'Ada gets up.' },
      ]),
    );
    expect(script.steps.some((s) => s.stage?.at?.ada === 'on:table')).toBe(
      true,
    );
    const [sit, stand] = interactsOf(scene, 'ada');
    expect(sit.does).toBe('sit-at');
    expect(sit.steps.map(([n]) => n)).toEqual(['pull', 'sit', 'tuck']);
    expect(heldToLeast(sit)).toBe(true);
    // Sat down as the chair is out: the sit move begins as the pull ends.
    const sat = (scene.acting?.ada?.moves ?? []).find(([, m]) => m === 'sit');
    const pull = stepSpan(sit, 'pull')!;
    expect(sat).toBeDefined();
    expect(Math.abs(sat![0] - pull[1])).toBeLessThanOrEqual(400);
    expect(stand?.does).toBe('stand-from');
    const table = scene.setting?.features?.find((f) => f.id === 'table');
    // The table's front is laid over whoever sits at it.
    expect(table?.affordances?.masks).toContainEqual({
      id: 'body-front',
      group: 'front',
    });
    expect(table?.affordances?.slides).toContainEqual({
      group: 'chair',
      by: [44, -6],
    });
    const cast = [{ id: 'ada', name: 'Ada', look: '' }];
    expect(pictureClaims(scene, sit.steps[2][1] + 10, cast).doing).toContain(
      'Ada is sitting at the table',
    );
    expect(interactFaults(scene)).toEqual([]);
  });

  it('climbs the stairs: to their foot, then up them a tread at a time, standing on the landing', () => {
    const { scene, script } = made(
      sheetOf('hall', [
        { kind: 'line', who: 'ada', say: 'My bag is upstairs.' },
        {
          kind: 'action',
          who: 'ada',
          do: 'climb-stairs',
          target: 'stairs',
          say: 'Ada climbs the stairs.',
        },
        { kind: 'narration', say: 'She is quick.' },
      ]),
    );
    const at = script.steps.flatMap((s) =>
      s.stage?.at?.ada ? [s.stage.at.ada] : [],
    );
    expect(at).toContain('by:stairs:-1');
    expect(at[at.length - 1]).toBe('up:stairs');
    const [climb] = interactsOf(scene, 'ada');
    expect(climb.does).toBe('climb-stairs');
    const stairs = scene.setting!.features!.find((f) => f.id === 'stairs')!;
    const count = climbCount('climb-stairs', stairs);
    expect(count).toBe(5);
    // Each foot on a tread, the last as high as one up the stairs stands.
    const holds = footholds('climb-stairs', stairs.affordances, count).map(
      (p) => featurePoint(stairs, 'wide', p)!,
    );
    expect(holds.map(([, y]) => Math.round(y))).toEqual(
      [...holds.map(([, y]) => Math.round(y))].sort((a, b) => b - a),
    );
    expect(
      Math.abs(holds[holds.length - 1][1] - stairs.perch!.wide.y),
    ).toBeLessThanOrEqual(2);
    // Stood on the landing, the middle of it, not beside it.
    const k = scene.steps.findIndex((s) => Math.abs(s.atMs - climb.at) <= 60);
    const place = scene.stagings.wide.places[k].ada;
    expect(
      Math.abs(place.y + place.h - stairs.perch!.wide.y),
    ).toBeLessThanOrEqual(2);
    expect(climb.steps[0][2]).toBeGreaterThanOrEqual(count * 260 - 1);
    expect(interactFaults(scene)).toEqual([]);
  });

  it('switches on the light: the room brightens as it is flicked', () => {
    const { scene } = made(
      sheetOf('hall', [
        { kind: 'narration', say: 'It is dark.' },
        {
          kind: 'business',
          who: 'ada',
          do: 'switch-on',
          say: 'Ada switches on the light.',
        },
        { kind: 'line', who: 'ada', say: 'That is better.' },
      ]),
    );
    const [flick] = interactsOf(scene, 'ada');
    expect(flick.does).toBe('switch-on');
    expect(scene.setting?.lights).toEqual([
      [stepSpan(flick, 'flick')![0], 'on'],
    ]);
    expect(
      interactClaims(scene, stepSpan(flick, 'back')![1] + 10, () => 'Ada'),
    ).toContain('the light is on');
  });
});
