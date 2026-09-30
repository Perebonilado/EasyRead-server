import {
  INTERACT_STEPS,
  expandInteraction,
  interactIdealMs,
  interactLeastMs,
  interactionFor,
  withInteractions,
  interactFaults,
  footholds,
  featurePoint,
} from './scene-interact';
import { drawPiece } from './scene-set-pieces';
import { climbsGrounded } from './scene-grounding';
import type { SceneDto } from '../../contracts';
import { doingsIn, type Actor } from './scene-directions';

const actors: Actor[] = [
  { id: 'ada', names: ['Ada'], gender: 'f' },
  { id: 'tobi', names: ['Tobi'], gender: 'm' },
];
const read = (text: string) =>
  doingsIn(text, { actors, who: 'ada' }).map((d) =>
    [d.do, d.via ?? d.target ?? ''].join(' ').trim(),
  );

describe('words for using the set', () => {
  it('maps what the words say is done with a thing of the set to its doing', () => {
    for (const [text, want] of [
      ['Ada walks through the door.', ['go-through door']],
      ['Ada goes out through the front door.', ['go-through door']],
      ['Ada knocks on the door.', ['knock door']],
      ['Ada knocks twice.', ['knock']],
      ['Ada leans on the counter.', ['lean-on counter']],
      ['Ada climbs the stairs.', ['climb-stairs stairs']],
      ['Ada runs up the stairs.', ['climb-stairs stairs']],
      ['Ada climbs up the ladder.', ['climb-stairs ladder']],
      ['Ada switches on the light.', ['switch-on']],
      ['Ada turns the light off.', ['switch-off']],
      ['Ada turns on the tap.', ['turn-on-tap tap']],
      ['Ada washes her hands.', ['turn-on-tap']],
      ['Ada rings the doorbell.', ['ring-bell']],
      ['Ada sits at the table.', ['sit table']],
    ] as [string, string[]][])
      expect([text, read(text)]).toEqual([text, want]);
  });
});

describe('choreography: one doing in its timed steps', () => {
  it('gives every step all it wants, and the rest to its flexible step', () => {
    const steps = expandInteraction('knock', 5000);
    expect(steps.map(([n]) => n)).toEqual(['reach', 'knock', 'back', 'wait']);
    const ideal = new Map(INTERACT_STEPS.knock.map(([n, , hi]) => [n, hi]));
    for (const [name, , ms] of steps.slice(0, 3))
      expect(ms).toBe(ideal.get(name));
    expect(steps[3][2]).toBe(5000 - 400 - 900 - 300);
    // One after another, from the start.
    steps.forEach(([, at, ms], k) => {
      if (k) expect(at).toBe(steps[k - 1][1] + steps[k - 1][2]);
      expect(ms).toBeGreaterThanOrEqual(0);
    });
  });

  it('holds each step to its least when given at least all their least, and squeezes them alike when not', () => {
    for (const does of Object.keys(
      INTERACT_STEPS,
    ) as (keyof typeof INTERACT_STEPS)[]) {
      const count = does.startsWith('climb') ? 4 : 0;
      const least = interactLeastMs(does, count);
      const lo = new Map(
        expandInteraction(does, least, { count }).map(([n, , ms]) => [n, ms]),
      );
      for (const [name, min] of INTERACT_STEPS[does])
        if (name !== 'climb')
          expect(lo.get(name)).toBeGreaterThanOrEqual(min - 1);
      const between = expandInteraction(
        does,
        (least + interactIdealMs(does, count)) / 2,
        { count },
      );
      for (const [name, , ms] of between) {
        const min = INTERACT_STEPS[does].find(([n]) => n === name)?.[1] ?? 0;
        expect(ms).toBeGreaterThanOrEqual(
          name === 'climb' ? count * 260 - 1 : min - 1,
        );
      }
    }
    const squeezed = expandInteraction('go-through', 730);
    expect(squeezed.find(([n]) => n === 'through')![2]).toBeLessThan(650);
  });

  it('keeps a fixed step as it is: a door open already is reached for in no time', () => {
    const steps = expandInteraction('go-through', 2000, {
      fixed: { reach: 0, open: 0 },
    });
    expect(steps.slice(0, 2).map(([, , ms]) => ms)).toEqual([0, 0]);
    expect(steps[2][1]).toBe(0);
  });

  it('knows which interaction a doing plays with which thing', () => {
    const door = drawPiece('door').affordances;
    expect(interactionFor('go-through', 'door', door)).toBe('go-through');
    expect(
      interactionFor('climb-stairs', 'ladder', drawPiece('ladder').affordances),
    ).toBe('climb-ladder');
    expect(
      interactionFor('climb-stairs', 'stairs', drawPiece('stairs').affordances),
    ).toBe('climb-stairs');
    expect(interactionFor('sit', 'table')).toBe('sit-at');
    expect(interactionFor('sit', 'bench')).toBeNull();
    expect(
      interactionFor('open', 'cupboard', drawPiece('cupboard').affordances),
    ).toBe('open');
    expect(
      interactionFor('open', 'window', drawPiece('window').affordances),
    ).toBeNull();
    expect(interactionFor('switch-on', 'switch')).toBe('switch-on');
  });
});

describe('what the pieces of the stage offer (studio-interactions-plan §1.1)', () => {
  it('a door: its knob where it is drawn, its near frame and its dark inside as groups of its drawing', () => {
    const door = drawPiece('door');
    expect(door.svg).toContain('<circle cx="32" cy="-100"');
    expect(door.affordances?.handles?.[0].at).toEqual([32, -100]);
    for (const group of ['frame', 'dark', 'leaf'])
      expect(door.svg).toContain(`<g id="${group}">`);
    expect(door.affordances?.masks).toEqual([
      { id: 'frame-near', group: 'frame' },
    ]);
    expect(door.affordances?.threshold?.line).toEqual([
      [-48, 0],
      [48, 0],
    ]);
    // The frame leaves the doorway open: whoever is in it is seen through it.
    const frame = /<g id="frame">([\s\S]*?)<\/g>/u.exec(door.svg)![1];
    for (const m of frame.matchAll(
      /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu,
    )) {
      const [x, y, w, h] = m.slice(1).map(Number);
      expect(x < 48 && x + w > -48 && y + h > -204).toBe(false);
    }
  });

  it('a table: its chair behind it that slides out, and its front over the legs of one sat at it', () => {
    const table = drawPiece('table');
    expect(table.svg).toContain('<g id="chair">');
    expect(table.svg).toContain('<g id="front">');
    expect(table.affordances?.seats?.[0].pose).toBe('table');
    expect(table.seat).toBe(52);
  });

  it('stairs and a ladder: treads and rungs rising in turn to where one stands up them', () => {
    const stairs = drawPiece('stairs');
    const ys = stairs.affordances!.steps!.map(([, y]) => y);
    expect(ys.slice(0, 5)).toEqual([-22, -44, -66, -88, -110]);
    expect(-ys[4]).toBe(stairs.perch);
    const ladder = drawPiece('ladder');
    expect(ladder.affordances!.rungs!.map(([, y]) => -y)).toContain(
      ladder.perch,
    );
    for (const kind of ['counter', 'cupboard', 'switch', 'sink'] as const)
      expect(drawPiece(kind).affordances).toBeDefined();
  });
});

describe('interactions on a made scene', () => {
  /** A scene with a door at the right, as compose stands it, and Ada by it. */
  const door = drawPiece('door');
  const at = { x: 1100, y: 400, w: 172 * 2, h: 244 * 2 };
  const scene = (steps: SceneDto['steps']): SceneDto =>
    ({
      version: 4,
      generator: 'test',
      title: 't',
      durationMs: 9000,
      timing: 'voice',
      beats: [],
      things: [],
      steps,
      effects: [],
      acting: {},
      setting: {
        film: true,
        features: [
          {
            id: 'door',
            name: 'door',
            kind: 'door',
            svg: door.svg,
            leaf: door.leaf,
            affordances: door.affordances,
            at: { box: at, wide: at },
            way: {
              box: { x: 1272, y: 888, k: 1 },
              wide: { x: 1272, y: 888, k: 1 },
            },
          },
        ],
      },
      stagings: {
        box: {
          w: 1600,
          h: 900,
          places: steps.map(() => ({
            ada: { x: 1400, y: 450, w: 300, h: 440 },
          })),
        },
        wide: {
          w: 1600,
          h: 900,
          places: steps.map(() => ({
            ada: { x: 1400, y: 450, w: 300, h: 440 },
          })),
        },
      },
    }) as unknown as SceneDto;
  const base = (): SceneDto['steps'] => [
    {
      atMs: 0,
      layout: 'one',
      show: ['ada'],
      arrows: [],
      enter: {},
      focus: null,
    },
    {
      atMs: 2000,
      layout: 'one',
      show: [],
      arrows: [],
      enter: {},
      focus: null,
      exit: { ada: { side: 'right', via: 'door' } },
    },
  ];

  it('opens the door with the hand on its handle, shuts it behind, and marks the going off as through it', () => {
    const made = withInteractions(scene(base()), [
      { who: 'ada', does: 'go-through', feature: 'door', atMs: 2000, ms: 2800 },
    ]);
    const one = made.acting!.ada.interact![0];
    expect(one.steps[0]).toEqual(['reach', 2000, 420]);
    expect(made.setting!.featureStates).toEqual([
      [2420, 'door', 'open'],
      [one.steps[4][1], 'door', 'shut'],
    ]);
    expect(made.steps[1].exit!.ada.how).toBe('through');
    expect(interactFaults(made)).toEqual([]);
  });

  it('finds a door swung with no hand on it, and a going through a door that stays shut', () => {
    const made = withInteractions(scene(base()), [
      { who: 'ada', does: 'go-through', feature: 'door', atMs: 2000, ms: 2800 },
    ]);
    const moved = {
      ...made,
      setting: {
        ...made.setting,
        featureStates: [[3600, 'door', 'open']] as [number, string, 'open'][],
      },
    };
    expect(
      interactFaults(moved)
        .map((f) => f.id)
        .sort(),
    ).toEqual(['off-handle', 'through-shut']);
    const walked = scene(base());
    expect(interactFaults(walked).map((f) => f.id)).toEqual(['through-shut']);
  });

  it('puts each foot of a climb on a tread, higher each time', () => {
    const stairs = drawPiece('stairs');
    const feature = { svg: stairs.svg, at: { box: at, wide: at } };
    const holds = footholds('climb-stairs', stairs.affordances, 5).map((p) =>
      featurePoint(feature, 'wide', p)!,
    );
    for (let k = 1; k < holds.length; k += 1) {
      expect(holds[k][1]).toBeLessThan(holds[k - 1][1]);
      expect(holds[k][0]).toBeGreaterThan(holds[k - 1][0]);
    }
  });
});

describe('grounding on the stairs', () => {
  it('notes a climb whose top tread is not where one up the stairs stands', () => {
    const stairs = drawPiece('stairs');
    const at = { x: 400, y: 300, w: 204 * 2, h: 184 * 2 };
    const scene = {
      steps: [],
      stagings: {
        box: { w: 1600, h: 900, places: [] },
        wide: { w: 1600, h: 900, places: [] },
      },
      acting: {
        ada: {
          interact: [
            {
              at: 0,
              does: 'climb-stairs' as const,
              feature: 'stairs',
              steps: [['climb', 0, 2100]] as ['climb', number, number][],
            },
          ],
        },
      },
      setting: {
        features: [
          {
            id: 'stairs',
            name: 'stairs',
            kind: 'stairs',
            svg: stairs.svg,
            affordances: stairs.affordances,
            at: { box: at, wide: at },
            way: { box: { x: 0, y: 0, k: 1 }, wide: { x: 0, y: 0, k: 1 } },
            perch: { box: { x: 0, y: 460 }, wide: { x: 0, y: 460 } },
          },
        ],
      },
    } as unknown as SceneDto;
    const perchY = featurePoint(
      scene.setting!.features![0],
      'wide',
      [42, -110],
    )![1];
    expect(climbsGrounded(scene)).toEqual([
      expect.stringMatching(/^floating: ada/),
    ]);
    scene.setting!.features![0].perch = {
      box: { x: 0, y: perchY },
      wide: { x: 0, y: perchY },
    };
    expect(climbsGrounded(scene)).toEqual([]);
  });
});
