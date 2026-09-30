import type { SceneDto, ScenePlaceDto, SceneThingDto } from '../../contracts';
import {
  VIEW_HOLD_MS,
  facingToward,
  holdViews,
  viewAt,
  viewsOf,
  walkFacing,
  withViews,
} from './scene-views';

const person = (id: string): SceneThingDto => ({
  id,
  kind: 'drawing',
  svg: '<svg/>',
  aspect: 0.5,
  caption: null,
  parts: {},
  labels: {},
  states: {},
  hidden: [],
  moves: true,
  rig: true,
  rigVersion: 3,
  views: ['view-front', 'view-3q', 'view-profile', 'view-back3q', 'view-back'],
});

const at = (x: number, h = 400, d?: number): ScenePlaceDto => ({
  x,
  y: 800 - h,
  w: h / 2,
  h,
  ...(d === undefined ? {} : { d }),
});

type Scene = Parameters<typeof viewsOf>[0];

/** A scene of steps, each its places, with who acts how. */
function sceneOf(
  steps: { atMs: number; places: Record<string, ScenePlaceDto> }[],
  acting: NonNullable<SceneDto['acting']>,
  durationMs = 12000,
): Scene {
  const ids = [...new Set(steps.flatMap((s) => Object.keys(s.places)))];
  return {
    things: ids.map(person),
    steps: steps.map((s) => ({
      atMs: s.atMs,
      layout: 'one',
      show: Object.keys(s.places),
      arrows: [],
      enter: Object.fromEntries(
        Object.keys(s.places).map((id) => [id, { how: 'fade' as const }]),
      ),
      focus: null,
    })),
    stagings: {
      wide: { w: 1600, h: 900, places: steps.map((s) => s.places) },
      box: { w: 1600, h: 900, places: steps.map((s) => s.places) },
    },
    acting,
    durationMs,
  };
}

describe('the view the camera sees', () => {
  it('picks the view from the facing, against a front-on camera', () => {
    expect(viewAt(0)).toEqual({ view: 'front', mirror: 1 });
    expect(viewAt(20).view).toBe('front');
    expect(viewAt(45)).toEqual({ view: '3q', mirror: 1 });
    expect(viewAt(-45)).toEqual({ view: '3q', mirror: -1 });
    expect(viewAt(90)).toEqual({ view: 'profile', mirror: 1 });
    expect(viewAt(-100)).toEqual({ view: 'profile', mirror: -1 });
    expect(viewAt(135)).toEqual({ view: 'back3q', mirror: 1 });
    expect(viewAt(-140)).toEqual({ view: 'back3q', mirror: -1 });
    expect(viewAt(180).view).toBe('back');
    expect(viewAt(-170).view).toBe('back');
    // A camera turned round sees the other side of them.
    expect(viewAt(0, 180).view).toBe('back');
    expect(viewAt(90, 45)).toEqual({ view: '3q', mirror: 1 });
  });

  it('faces along a walk: across in profile, away into the floor from behind, toward the camera from the front', () => {
    expect(viewAt(walkFacing(at(100), at(900), 1600))).toEqual({
      view: 'profile',
      mirror: 1,
    });
    expect(viewAt(walkFacing(at(900), at(100), 1600))).toEqual({
      view: 'profile',
      mirror: -1,
    });
    expect(viewAt(walkFacing(at(700, 400), at(720, 280), 1600)).view).toBe(
      'back',
    );
    expect(viewAt(walkFacing(at(700, 280), at(720, 400), 1600)).view).toBe(
      'front',
    );
    expect(viewAt(walkFacing(at(400, 400), at(900, 300), 1600)).view).toBe(
      'back3q',
    );
  });

  it('turns to whom they talk to as a cartoon cheats it', () => {
    // A glance hardly turns them; talk, three-quarter; face to face close up, profile.
    expect(viewAt(facingToward(400, 0, 0.2, false)).view).toBe('front');
    expect(viewAt(facingToward(400, 0, 0.5, false))).toEqual({
      view: '3q',
      mirror: 1,
    });
    expect(viewAt(facingToward(-400, 0, 0.35, false))).toEqual({
      view: '3q',
      mirror: -1,
    });
    expect(viewAt(facingToward(150, 0, 0.6, true))).toEqual({
      view: 'profile',
      mirror: 1,
    });
    // Someone well behind is looked back at over the shoulder.
    expect(viewAt(facingToward(80, -500, 0.5, false)).view).toBe('back');
  });
});

describe('a view timeline', () => {
  it('drops a view held less than 400 ms, keeping the one before it', () => {
    expect(
      holdViews([
        [0, 'front', 1],
        [1000, '3q', 1],
        [1000 + VIEW_HOLD_MS - 1, 'front', 1],
        [3000, 'profile', -1],
      ]),
    ).toEqual([
      [0, 'front', 1],
      [3000, 'profile', -1],
    ]);
    expect(
      holdViews([
        [0, 'front', 1],
        [1000, '3q', 1],
        [1000 + VIEW_HOLD_MS, 'front', 1],
      ]),
    ).toHaveLength(3);
    // The last view holds to the end of the scene.
    expect(
      holdViews(
        [
          [0, 'front', 1],
          [900, '3q', 1],
        ],
        1100,
      ),
    ).toEqual([[0, 'front', 1]]);
  });

  it('turns two who talk toward each other, each from their side', () => {
    const scene = sceneOf(
      [{ atMs: 0, places: { ada: at(300), kofi: at(1000) } }],
      {
        ada: {
          look: [[1000, 'kofi', 0.5]],
          mouth: [[1100, '1230123012301230']],
        },
        kofi: { look: [[1150, 'ada', 0.5]] },
      },
    );
    const views = viewsOf(scene);
    expect(views.ada).toEqual([
      [0, 'front', 1],
      [1000, '3q', 1],
    ]);
    expect(views.kofi).toEqual([
      [0, 'front', 1],
      [1150, '3q', -1],
    ]);
  });

  it('walks across in profile, the way they go, and stands front on again', () => {
    const scene = sceneOf(
      [
        { atMs: 0, places: { tobi: at(1200) } },
        { atMs: 2000, places: { tobi: at(200) } },
      ],
      { tobi: { walks: true } },
    );
    const views = viewsOf(scene).tobi;
    expect(views[0]).toEqual([0, 'front', 1]);
    expect(views[1]).toEqual([2000, 'profile', -1]);
    expect(views[2][1]).toBe('front');
    expect(views[2][0]).toBeGreaterThan(3000);
  });

  it('never shows the back of someone speaking: walking away, they turn three-quarter as they talk', () => {
    const scene = sceneOf(
      [
        { atMs: 0, places: { ada: at(700, 420, 0.9) } },
        { atMs: 1000, places: { ada: at(720, 250, 0.1) } },
      ],
      { ada: { walks: true, mouth: [[1800, '1'.repeat(30)]] } },
    );
    const views = viewsOf(scene).ada;
    const at1 = (t: number) => [...views].reverse().find(([k]) => k <= t)!;
    expect(at1(1200)[1]).toBe('back');
    for (let t = 1600; t < 2800; t += 50)
      expect(['front', '3q', 'profile']).toContain(at1(t)[1]);
  });

  it('is the same every time, and leaves a scene with no one drawn from every side as it was', () => {
    const scene = sceneOf(
      [{ atMs: 0, places: { ada: at(300), kofi: at(1000) } }],
      {
        ada: { look: [[1000, 'kofi', 0.5]] },
      },
    );
    expect(viewsOf(scene)).toEqual(viewsOf(scene));
    expect(withViews(scene).acting?.ada.view).toBeDefined();
    const flat = {
      ...scene,
      things: scene.things.map((t) => ({
        ...t,
        rigVersion: 2 as const,
        views: undefined,
      })),
    };
    expect(withViews(flat)).toBe(flat);
  });
});
