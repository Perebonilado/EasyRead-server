/**
 * The reverse side (studio-views-plan V3): every place has its other side
 * built by code from its layout, the same every time; a shot from there
 * reflects the stage and turns the camera round (views at yaw 180); shot
 * and reverse shot keep the 180° line; the clear-view rule judges a
 * reverse shot against the other side's own things; stills show it; and
 * a set with no other side never gets a reverse shot.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto, SceneEffectDto, SceneThingDto } from '../../contracts';
import {
  buildSet,
  layoutOf,
  reverseSet,
  type SetLayout,
} from './scene-set-layout';
import { mirroredSpot, reverseLayoutOf } from './scene-set-reverse';
import { backOf } from './scene-set-backs';
import {
  grammarCamera,
  keepTheLine,
  lineCrossings,
  type GrammarLine,
} from './scene-shots';
import {
  isReverse,
  nearOf,
  reflectPlace,
  shotsApart,
  viewOf,
  walksOf,
} from './scene-film';
import {
  OTS_YAW,
  TURNED_ROUND,
  shotFacing,
  viewAt,
  viewsOf,
} from './scene-views';
import { keepInClearView } from './scene-faces-seen';
import { stillPlan } from './scene-still';
import { pictureMoments } from './scene-picture-check';
import { gateDrawing, type GatedDrawing } from './scene-svg';
import { measureGround } from './scene-ground';
import { setThing, type StoryPlace } from './scene-story';
import { bibleOf, storySheetOf } from './studio/studio';
import { mendSheet, repairSheet, withFeatures } from './studio/studio-check';
import { placeThingId, stageStory, storyBibleFor } from './studio/studio-stage';
import { voiced } from './studio/__fixtures__/voiced';

const W = 1600;
const H = 900;

const place = (
  id: string,
  kind: 'indoor' | 'outdoor' | 'vessel',
  look = '',
  features: StoryPlace['features'] = [],
): StoryPlace => ({
  id,
  name: id,
  aliases: [],
  look,
  firstPage: 1,
  sound: null,
  kind,
  features,
});

const KITCHEN = place('kitchen', 'indoor', 'a family kitchen', [
  { id: 'table', name: 'table', kind: 'table', spot: 'centre-left' },
]);
const KITCHEN_LAYOUT = {
  ground: 'tiles',
  style: 'modern-town',
  items: [
    { kind: 'cupboard', x: 0.12, row: 'back', scale: 1, colour: null },
    { kind: 'clock', x: 0.7, row: 'back', scale: 1, colour: null },
    { kind: 'counter', x: 0.86, row: 'middle', scale: 1, colour: null },
    { kind: 'plant', x: 0.05, row: 'front', scale: 1.2, colour: null },
    { kind: 'door', x: 0.25, row: 'reverse', scale: 1, colour: null },
    { kind: 'bookshelf', x: 0.55, row: 'fourth wall', scale: 1, colour: null },
  ],
};
const STREET = place('street', 'outdoor', 'a quiet town street');
const STREET_LAYOUT = {
  ground: 'paving',
  backdrop: 'city',
  style: 'modern-town',
  items: [
    { kind: 'shop', x: 0.15, row: 'back', scale: 1, colour: null },
    { kind: 'house', x: 0.5, row: 'back', scale: 1, colour: null },
    { kind: 'bench', x: 0.8, row: 'middle', scale: 1, colour: null },
    { kind: 'streetlamp', x: 0.06, row: 'front', scale: 1, colour: null },
  ],
};
const BUS = place('bus', 'vessel', 'inside a bus');

// ── The other side of every kind of place (§4.2) ────────────────────────────

describe("a place's other side", () => {
  it('is built from its layout alone, the same every time, for a room, a street and a vessel', () => {
    for (const [raw, where] of [
      [KITCHEN_LAYOUT, KITCHEN],
      [STREET_LAYOUT, STREET],
      [{ vessel: 'bus', items: [] }, BUS],
    ] as const) {
      const layout = layoutOf(raw, where, null);
      const one = buildSet(layout, where).layered.reverse;
      const two = buildSet(layout, where).layered.reverse;
      expect(one?.layers.length).toBeGreaterThan(1);
      expect(JSON.stringify(one)).toBe(JSON.stringify(two));
      // On the same floor as its front: everyone stands on it either way.
      expect(one?.floor).toEqual(buildSet(layout, where).layered.floor);
      // And not its front again.
      expect(JSON.stringify(one?.layers)).not.toBe(
        JSON.stringify(buildSet(layout, where).layered.layers),
      );
    }
  });

  it("puts the painter's reverse row on a room's fourth wall, and its floor's things across the other way, from behind", () => {
    const layout = layoutOf(KITCHEN_LAYOUT, KITCHEN, null);
    expect(layout.reverse?.map((one) => [one.kind, one.x])).toEqual([
      ['door', 0.25],
      ['bookshelf', 0.55],
    ]);
    // Only the front's things are placed on the front.
    expect(layout.items.map((one) => one.kind)).toEqual([
      'cupboard',
      'clock',
      'counter',
      'plant',
    ]);
    const turned = reverseLayoutOf(layout, KITCHEN);
    const kinds = turned.layout.items.map((one) => [
      one.kind,
      one.x,
      one.back ?? false,
    ]);
    // The fourth wall; what stood against the back wall is behind the camera.
    expect(kinds).toEqual([
      ['door', 0.25, false],
      ['bookshelf', 0.55, false],
      ['counter', 0.14, true],
      ['plant', 0.95, true],
    ]);
    // Seen from behind, each the other way round.
    expect(turned.layout.items.slice(2).every((one) => one.flip)).toBe(true);
    // The stage's own table stands across the other way too.
    expect(turned.place.features?.[0].spot).toBe('centre-right');
    expect(mirroredSpot('left')).toBe('right');
    expect(mirroredSpot('back')).toBe('back');
    // A counter seen from behind is its own drawing, the front's size.
    expect(backOf('counter')?.viewBox).toEqual([-108, -122, 216, 126]);
    expect(backOf('table')).toBeNull();
  });

  it('fills the other side from the place when the painter said nothing: a room a door and a window, a street its buildings, a wood its trees', () => {
    const room = reverseLayoutOf(
      layoutOf({ ...KITCHEN_LAYOUT, items: [] }, KITCHEN, null),
      KITCHEN,
    ).layout.items.map((one) => one.kind);
    expect(room).toContain('door');
    expect(room).toContain('curtains');
    const street = reverseLayoutOf(
      layoutOf(
        {
          ...STREET_LAYOUT,
          items: STREET_LAYOUT.items.filter((one) => one.row === 'back'),
        },
        STREET,
        null,
      ),
      STREET,
    ).layout.items.map((one) => one.kind as string);
    expect(
      street.some((kind) =>
        ['house', 'shop', 'kiosk', 'classroom', 'tenement'].includes(kind),
      ),
    ).toBe(true);
    const wood = place('wood', 'outdoor', 'a wood');
    const trees = reverseLayoutOf(
      layoutOf(
        {
          style: 'nature',
          items: [{ kind: 'pine', x: 0.2, row: 'back' }],
        },
        wood,
        null,
      ),
      wood,
    ).layout.items.map((one) => one.kind);
    expect(trees.length).toBeGreaterThan(0);
    expect(trees.every((kind) => kind === 'pine')).toBe(true);
  });

  it('names what stands before the camera and on the floor on the other side apart, and its vessel has no door', () => {
    const where = place('park', 'outdoor', 'a park');
    const layout = layoutOf(
      {
        style: 'modern-town',
        items: [
          { kind: 'tree', x: 0.05, row: 'front' },
          { kind: 'bush', x: 0.1, row: 'foreground' },
        ],
      },
      where,
      null,
    );
    const built = buildSet(layout, where);
    for (const one of [
      ...(built.layered.reverse?.fore ?? []),
      ...(built.layered.reverse?.floorThings ?? []),
    ])
      expect(one.id.startsWith('rv-')).toBe(true);
    expect(built.layered.reverse?.floorThings?.length).toBeGreaterThan(0);
    const bus = buildSet(
      layoutOf({ vessel: 'bus', items: [] }, BUS, null),
      BUS,
    );
    const front = bus.layered.layers.find((l) => l.id === 'back')!.svg;
    const back = bus.layered.reverse!.layers.find((l) => l.id === 'back')!.svg;
    // The front's door has two panes of glass: its other side none.
    expect(front).toContain('fill-rule="evenodd" fill="#');
    expect(back.length).toBeLessThan(front.length);
  });

  it('is given to a set kept before it had one, from its layout; one painted whole has none', () => {
    const layout: SetLayout = layoutOf(STREET_LAYOUT, STREET, null);
    const given = reverseSet(layout, STREET);
    expect(given?.layered.layers.length).toBeGreaterThan(1);
    expect(JSON.stringify(given?.layered)).toBe(
      JSON.stringify(buildSet(layout, STREET).layered.reverse),
    );
  });
});

// ── A shot from the other side ─────────────────────────────────────────────

const A = { x: 500, y: 320, w: 190, h: 400, d: 0.5 };
const B = { x: 900, y: 300, w: 200, h: 420, d: 0.45 };
const C = { x: 1250, y: 330, w: 180, h: 390, d: 0.55 };

const ots = (on: string, near: string, reverse = false): SceneEffectDto => ({
  atMs: 1000,
  target: on,
  part: near,
  do: 'zoom',
  untilMs: 3500,
  shot: { enter: 'cut', kind: 'ots', ...(reverse ? { reverse: true } : {}) },
});

describe('a shot from the other side', () => {
  it('reflects everyone across the stage, at their depth', () => {
    expect(reflectPlace(A, W)).toEqual({ ...A, x: W - A.x - A.w });
    expect(isReverse(ots('a', 'b', true))).toBe(true);
    expect(isReverse(ots('a', 'b'))).toBe(false);
    // A close from the other side looks where a is, reflected.
    const close: SceneEffectDto = {
      ...ots('a', 'b', true),
      part: null,
      shot: { enter: 'cut', reverse: true },
    };
    const turned = viewOf(close, ['a', 'b'], { a: A, b: B }, W, H);
    const front = viewOf(
      { ...close, shot: { enter: 'cut' } },
      ['a', 'b'],
      { a: A, b: B },
      W,
      H,
    );
    expect(turned.x).toBeCloseTo(W - front.x, 0);
  });

  it('over the other shoulder keeps the two on the sides of the frame they have from the front', () => {
    const places = { a: A, b: B };
    // From the front, over a's shoulder onto b: a at the left edge.
    const frontNear = nearOf(ots('b', 'a'), ['a', 'b'], places, W, H)!;
    // From the other side, over b's shoulder onto a: b near at the right edge, a left of it.
    const view = viewOf(ots('a', 'b', true), ['a', 'b'], places, W, H);
    const near = nearOf(ots('a', 'b', true), ['a', 'b'], places, W, H)!;
    const onScreenX = (x: number) => W / 2 + view.s * (x - view.x);
    const a = reflectPlace(A, W);
    expect(near.id).toBe('b');
    expect(onScreenX(near.place.x + near.place.w / 2)).toBeGreaterThan(W / 2);
    expect(onScreenX(a.x + a.w / 2)).toBeLessThan(W / 2);
    expect(frontNear.place.x + frontNear.place.w / 2).toBeLessThan(
      viewOf(ots('b', 'a'), ['a', 'b'], places, W, H).x,
    );
    // Turning round is always a cut, never a move.
    expect(
      shotsApart(ots('a', 'b'), ots('a', 'b', true), view, view, W, H),
    ).toBe(true);
  });

  it('sees everyone as a camera turned round does: whoever faces the front shows their back, the two over a shoulder each to their side', () => {
    expect(viewAt(0, TURNED_ROUND)).toEqual({ view: 'back', mirror: -1 });
    expect(viewAt(90, TURNED_ROUND).view).toBe('profile');
    // Over b's shoulder onto a, a on the left: a three-quarter to us looking
    // right, b from behind looking left.
    const turned = shotFacing(ots('a', 'b', true), { a: A, b: B })!;
    expect(turned.yaw).toBe(TURNED_ROUND + OTS_YAW);
    const a = viewAt(turned.facing.a, turned.yaw);
    const b = viewAt(turned.facing.b, turned.yaw);
    expect(a).toEqual({ view: '3q', mirror: 1 });
    expect(b).toEqual({ view: 'back3q', mirror: -1 });
    // As the front has them over a's shoulder onto b: a looking right, b left.
    const front = shotFacing(ots('b', 'a'), { a: A, b: B })!;
    expect(viewAt(front.facing.a, front.yaw).mirror).toBe(1);
    expect(viewAt(front.facing.b, front.yaw).mirror).toBe(-1);
  });

  it('turns a third who faces the front camera round to their back, in the views made', () => {
    const scene = talk([
      ots('b', 'a'),
      { ...ots('a', 'b', true), atMs: 4000, untilMs: 7000 },
    ]);
    const views = viewsOf(scene);
    const now = (id: string, t: number) =>
      (views[id] ?? [])
        .filter((k) => k[0] <= t)
        .pop()
        ?.slice(1);
    expect(now('c', 2000)).toEqual(['front', 1]);
    expect(now('c', 5000)).toEqual(['back', -1]);
    expect(now('a', 5000)).toEqual(['3q', 1]);
    expect(now('b', 5000)).toEqual(['back3q', -1]);
    expect(now('a', 2000)).toEqual(['back3q', 1]);
    expect(now('b', 2000)).toEqual(['3q', -1]);
  });
});

// ── The 180° line with the reverse (§3.3) ─────────────────────────────────

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

/** a on the left and b on the right talk; c stands by, facing the front. */
function talk(shots: SceneEffectDto[]): SceneDto {
  return {
    version: 4,
    generator: 'test',
    title: 'talk',
    durationMs: 12000,
    timing: 'voice',
    beats: [],
    things: [person('a'), person('b'), person('c')],
    steps: [
      {
        atMs: 0,
        layout: 'one',
        show: ['a', 'b', 'c'],
        arrows: [],
        enter: {},
        focus: null,
      },
    ],
    effects: shots,
    acting: {
      a: { look: [[0, 'b', 0.6]] },
      b: { look: [[0, 'a', 0.6]] },
    },
    stagings: {
      wide: { w: W, h: H, places: [{ a: A, b: B, c: C }] },
      box: { w: W, h: H, places: [{ a: A, b: B, c: C }] },
    },
  } as unknown as SceneDto;
}

const lines = (who: string[]): GrammarLine[] =>
  who.map((speaker, i) => ({
    beat: i,
    speaker,
    to: null,
    startMs: 500 + i * 3000,
    endMs: 3000 + i * 3000,
    strong: false,
    sad: false,
    toCrowd: false,
  }));

describe('the line, with the reverse', () => {
  const grammar = (reverse: boolean, who = ['a', 'b', 'a', 'b', 'a']) =>
    grammarCamera({
      lines: lines(who),
      onAt: () => ['a', 'b'],
      placeAt: (id) => ({ a: A, b: B })[id as 'a' | 'b'] ?? null,
      standing: () => false,
      small: () => false,
      addressed: false,
      heroes: [],
      W,
      asked: [],
      reverse,
    });

  it('alternates over the shoulder from the front and from the other side, whoever spoke first seen from the front', () => {
    const camera = grammar(true).filter((one) => one.shot === 'ots');
    expect(camera.map((one) => [one.on, one.reverse ?? false])).toEqual([
      ['b', false],
      ['a', true],
      ['b', false],
      ['a', true],
    ]);
  });

  it('never cuts to the other side of a set that has none', () => {
    expect(grammar(false).some((one) => one.reverse)).toBe(false);
  });

  it('keeps shot and reverse shot, each keeping the two on their sides; a two-shot turned round crosses it', () => {
    const steps = [{ atMs: 0, show: ['a', 'b'] }];
    const places = [{ a: A, b: B }];
    const both = [
      ots('b', 'a'),
      { ...ots('a', 'b', true), atMs: 3500, untilMs: 6000 },
    ];
    expect(keepTheLine(both, steps, places).map((s) => s.atMs)).toEqual([
      1000, 3500,
    ]);
    const two: SceneEffectDto = {
      ...ots('b', 'a'),
      atMs: 3500,
      untilMs: 6000,
      shot: { enter: 'cut', reverse: true },
    };
    expect(
      keepTheLine([ots('b', 'a'), two], steps, places).map((s) => s.atMs),
    ).toEqual([1000]);
    // As made: the views have no one looking the other way across a cut.
    const scene = talk(both);
    scene.acting = {
      ...scene.acting,
      ...Object.fromEntries(
        Object.entries(viewsOf(scene)).map(([id, view]) => [
          id,
          { ...(scene.acting?.[id] ?? {}), view },
        ]),
      ),
    };
    expect(lineCrossings(scene, walksOf(scene))).toEqual([]);
  });
});

// ── Clear view from the other side ─────────────────────────────────────────

describe('clear view in a reverse shot', () => {
  it("fades the other side's own thing that stands before someone there, and judges the front's out of it", () => {
    // b speaks from the other side, over a's shoulder; reflected, b stands
    // at W − 900 − 200 = 500..700. A thing of the other side's floor stands
    // before b there; the front's thing where b stands from the front hides no one in it.
    const places = [{ a: { ...A }, b: { ...B } }];
    const shot: SceneEffectDto = {
      ...ots('b', 'a', true),
      atMs: 1000,
      untilMs: 4000,
    };
    const mended = keepInClearView({
      W,
      H,
      steps: [{ atMs: 0, show: ['a', 'b'] }],
      places,
      lines: [{ who: 'b', startMs: 1500, endMs: 3500 }],
      shots: [shot],
      features: [],
      fore: [],
      foreDepth: 1.2,
      floorThings: [
        { id: 'fl-1', box: { x: 900, y: 260, w: 220, h: 480 }, feet: 860 },
      ],
      reverse: {
        fore: [],
        foreDepth: 1.2,
        floorThings: [
          { id: 'rv-fl-1', box: { x: 480, y: 260, w: 240, h: 480 }, feet: 860 },
        ],
      },
      floor: [600, 880],
      open: () => false,
      hiding: () => false,
      atDepth: () => null,
      name: (id) => id,
      durationMs: 6000,
      animal: () => false,
      small: () => false,
      face: () => true,
    });
    const faded = mended.fades.map((f) => f[2]);
    expect(faded).toContain('rv-fl-1');
    // The front's own thing stands where b does from the front: it hides
    // her in the wide shot only, never in the shot from the other side.
    expect(
      mended.fades.filter(
        ([from, to, id, level]) =>
          id === 'fl-1' && level === 0 && from >= 1000 && to <= 4000,
      ),
    ).toEqual([]);
  });
});

// ── Made: a conversation on a set with and without its other side ──────────

describe('a conversation at the market, made on a set with its other side', () => {
  const fixture = (file: string): unknown =>
    JSON.parse(
      readFileSync(
        join(__dirname, 'studio', '__fixtures__', 'maya', file),
        'utf8',
      ),
    );
  const line = (who: string, to: string, say: string) => ({
    kind: 'line',
    who,
    to,
    say,
    feeling: 'happy',
    sign: null,
    do: null,
    prop: null,
    spot: null,
    from: 'here',
    pace: null,
    seconds: null,
  });
  const made = async (reverse: 'built' | 'none' | 'painted') => {
    const bible = bibleOf(fixture('bible.json'));
    const sheet = storySheetOf({
      kind: 'story',
      title: 'Where did Pip go?',
      set: 'market',
      time: 'day',
      weather: 'clear',
      crowd: 'none',
      mood: 'playful',
      music: 'calm',
      transition: 'cut',
      onStage: [
        {
          who: 'maya',
          spot: 'centre-left',
          pose: 'standing',
          face: 'happy',
          holding: null,
        },
        {
          who: 'mama',
          spot: 'centre-right',
          pose: 'standing',
          face: 'happy',
          holding: null,
        },
      ],
      props: [],
      beats: [
        line('maya', 'mama', 'Mama Nkechi, have you seen Pip anywhere today?'),
        line(
          'mama',
          'maya',
          'Pip? That little pup ran past my stall this morning.',
        ),
        line('maya', 'mama', 'Which way did he go? We have looked all day.'),
        line('mama', 'maya', 'Towards the bus park, with a yam in his mouth.'),
        line('maya', 'mama', 'A yam? Then he will not run very far.'),
        line('mama', 'maya', 'Take this bread for him. He will come to it.'),
      ],
      camera: [],
    });
    const show = withFeatures(
      bible,
      sheet.set,
      mendSheet(sheet, bible, null).features,
    );
    const fixed = repairSheet(sheet, show, null);
    const where = storyBibleFor(show, [fixed], 'Maya').places.find(
      (p) => p.id === fixed.set,
    )!;
    const built = buildSet(
      layoutOf(
        {
          style: 'modern-town',
          items: [
            { kind: 'shop', x: 0.15, row: 'back' },
            { kind: 'house', x: 0.85, row: 'back' },
          ],
        },
        where,
        null,
      ),
      where,
    );
    const gated = (
      await gateDrawing(built.svg, setThing(where, 'Maya'), { backdrop: true })
    ).drawing!;
    const ground = await measureGround(gated);
    const { reverse: other, ...front } = built.layered;
    void other;
    const set: GatedDrawing = {
      ...gated,
      ...(ground ? { ground } : {}),
      ...(reverse === 'built'
        ? { layered: built.layered }
        : reverse === 'none'
          ? { layered: front }
          : {}),
    };
    return voiced(stageStory(fixed, show, {}), [], {
      [placeThingId(where.id)]: set,
    }).scene;
  };

  it('cuts shot and reverse shot, keeps the line, carries the other side, and a still of it shows the other side', async () => {
    const scene = await made('built');
    const shots = scene.effects.filter((e) => e.do === 'zoom');
    const turned = shots.filter((s) => s.shot?.reverse);
    expect(turned.length).toBeGreaterThan(0);
    expect(shots.some((s) => s.shot?.kind === 'ots' && !s.shot.reverse)).toBe(
      true,
    );
    expect(lineCrossings(scene, walksOf(scene))).toEqual([]);
    const set = scene.things.find((t) => t.kind === 'drawing' && t.backdrop);
    expect(set?.kind === 'drawing' && set.reverse?.layers.length).toBeTruthy();
    // A still in it: the other side's layers, the stage reflected.
    const shot = turned[0];
    const t = (shot.atMs + (shot.untilMs ?? shot.atMs)) / 2;
    const plan = stillPlan(scene, t, 480);
    const layers = plan.parts.filter((p) => p.kind === 'layer');
    const reverseSvgs =
      set?.kind === 'drawing'
        ? (set.reverse?.layers ?? []).map((l) => l.id)
        : [];
    expect(layers.map((p) => p.key.replace('layer:', ''))).toEqual(
      expect.arrayContaining(reverseSvgs.filter((id) => id !== 'floor')),
    );
    // The picture check looks at a shot from the other side.
    expect(
      pictureMoments(scene).some((m) => m.why.includes('other side')),
    ).toBe(true);
  });

  it('never cuts to the other side of a set kept without one, or painted whole', async () => {
    for (const kind of ['none', 'painted'] as const) {
      const scene = await made(kind);
      expect(scene.effects.some((e) => e.shot?.reverse)).toBe(false);
    }
  });
});
