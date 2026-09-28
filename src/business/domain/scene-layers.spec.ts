/**
 * Layered scenery, L1 and L2 (studio-scenery-plan): a set built as layers
 * at their depths beside its one flat picture; a floor with depth, people
 * stood near and far on it and walking diagonals as long as they truly
 * are; and every speaker's face seen as they speak, in every shot.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto } from '../../contracts';
import {
  FOREGROUND_DEPTH,
  LAYER_DEPTH,
  SET_H,
  SET_LAYER_IDS,
  SET_W,
  buildSet,
  floorOf,
  layoutOf,
  plainLayout,
  rowFeet,
  scaleAtFeet,
  type SetLayout,
} from './scene-set-layout';
import {
  DEPTH_BACK,
  DEPTH_FRONT,
  FLOOR_BACK_K,
  FLOOR_FRONT_K,
  depthOfK,
  floorAt,
  layoutStations,
  spreadDepth,
  stationShares,
  type LaidThing,
} from './scene-layout';
import { WALK_DEPTH, settledOf, walkLength, walksOf } from './scene-film';
import {
  FACE_COVERED,
  covered,
  faceOf,
  keepFacesSeen,
  onScreen,
} from './scene-faces-seen';
import { viewOf } from './scene-film';
import type { StoryPlace } from './scene-story';
import { gateDrawing, type GatedDrawing } from './scene-svg';
import { measureGround } from './scene-ground';
import { setThing } from './scene-story';
import { bibleOf, storySheetOf, type StudioBible } from './studio/studio';
import {
  endStateOf,
  mendSheet,
  repairSheet,
  withFeatures,
  type EndState,
} from './studio/studio-check';
import {
  depthSaid,
  placeThingId,
  stageStory,
  storyBibleFor,
} from './studio/studio-stage';
import { voiced } from './studio/__fixtures__/voiced';
import { withMouths } from './studio/studio-audit';

jest.setTimeout(120_000);

const place = (patch: Partial<StoryPlace> = {}): StoryPlace => ({
  id: 'market',
  name: 'The Market Road',
  aliases: [],
  look: 'a busy open-air market beside a Lagos road',
  firstPage: 1,
  sound: null,
  kind: 'outdoor',
  stand: 'on',
  front: null,
  features: [],
  ...patch,
});

/** The market as a painter lays it out now: stalls and baskets, a skyline far off, and a crate and a plant before the camera. */
const MARKET = {
  sky: 'day',
  weather: 'clear',
  ground: 'road',
  backdrop: 'city',
  items: [
    { kind: 'stall', x: 0.2, row: 'middle', scale: 1, colour: 'red' },
    { kind: 'stall', x: 0.82, row: 'back', scale: 1, colour: 'blue' },
    { kind: 'parasol', x: 0.6, row: 'back', scale: 1 },
    { kind: 'basket', x: 0.4, row: 'middle', scale: 1 },
    { kind: 'palm', x: 0.02, row: 'front', scale: 1 },
    { kind: 'house', x: 0.5, row: 'far', scale: 1 },
    { kind: 'crate', x: 0.3, row: 'foreground', scale: 1 },
    { kind: 'plant', x: 0.95, row: 'foreground', scale: 1.2 },
  ],
  own: [],
  focal: { x: 0.5, feature: null, words: 'in front of the tomato stall' },
  clutter: ['chairs', 'baskets', 'carts', 'spaceships'],
};

describe('a set built as layers', () => {
  it('builds its layers back to front, each at its depth, beside the one picture', () => {
    const where = place();
    const layout = layoutOf(MARKET, where);
    const { svg, layered } = buildSet(layout, where);
    const ids = layered.layers.map((layer) => layer.id);
    expect(ids).toEqual([
      'sky',
      'far',
      'back',
      'ground',
      'stage',
      'floor',
      'foreground',
    ]);
    // In the stack's own order, and each farther off moving less.
    expect(ids).toEqual(SET_LAYER_IDS.filter((id) => ids.includes(id)));
    const depths = layered.layers.map((layer) => layer.depth);
    expect(depths.slice(0, 6)).toEqual([
      LAYER_DEPTH.sky,
      LAYER_DEPTH.far,
      LAYER_DEPTH.back,
      LAYER_DEPTH.ground,
      LAYER_DEPTH.stage,
      LAYER_DEPTH.floor,
    ]);
    for (let k = 1; k < depths.length; k += 1)
      expect(depths[k]).toBeGreaterThan(depths[k - 1]);
    const fore = layered.layers[6].depth;
    expect(fore).toBeGreaterThanOrEqual(FOREGROUND_DEPTH[0]);
    expect(fore).toBeLessThanOrEqual(FOREGROUND_DEPTH[1]);
    // Each drawn at the set's width × 900, in the kit's line.
    for (const layer of layered.layers)
      expect(layer.svg).toMatch(
        new RegExp(`^<svg[^>]*viewBox="0 0 ${SET_W} ${SET_H}"><g stroke=`),
      );
    expect(layered.width).toBe(SET_W);
    // The floor's things stand where the front row does, among the people.
    expect(layered.layers[5].feet).toBe(rowFeet('outdoor', 'front'));
    // Every piece placed is in the flat picture too.
    for (const layer of layered.layers)
      for (const m of layer.svg.matchAll(/<g transform="translate\([^"]+"/g))
        expect(svg).toContain(m[0]);
  });

  it('reads the new rows, where the action is, and what is scattered, leniently', () => {
    const layout = layoutOf(MARKET, place());
    expect(layout.items.map((one) => one.row)).toEqual([
      'middle',
      'back',
      'back',
      'middle',
      'front',
      'far',
      'foreground',
      'foreground',
    ]);
    expect(layout.focal).toEqual({
      x: 0.5,
      words: 'in front of the tomato stall',
    });
    // Only those of the list the kit draws.
    expect(layout.clutter).toEqual(['chair', 'basket', 'cart']);
    expect(layout.width).toBeUndefined();
    expect(layoutOf({ ...MARKET, width: 2 }, place()).width).toBe(2);
    // Four things before the camera at most.
    const many = layoutOf(
      {
        ...MARKET,
        items: Array.from({ length: 7 }, (_, k) => ({
          kind: 'plant',
          x: k / 7,
          row: 'foreground',
        })),
      },
      place(),
    );
    expect(many.items).toHaveLength(4);
  });

  it('keeps what stands before the camera low, or at the sides, and says where each is', () => {
    const { layered } = buildSet(layoutOf(MARKET, place()), place());
    expect(layered.fore.map((one) => one.id)).toEqual(['fg-1', 'fg-2']);
    for (const { box } of layered.fore) {
      const [x, y, w] = box;
      const aside = x + w / 2 < SET_W * 0.12 || x + w / 2 > SET_W * 0.88;
      expect(aside || y >= SET_H * 0.7 - 1).toBe(true);
    }
    expect(layered.layers.at(-1)!.svg).toContain('id="fg-1"');
  });

  it('draws a layout written before the layers flat as it always was, its rows on their layers', () => {
    const where = place({
      kind: 'indoor',
      name: 'a bedroom',
      look: 'a bedroom',
    });
    const layout: SetLayout = plainLayout(where);
    const { svg, layered } = buildSet(layout, where);
    expect(svg).toBe(buildSet(layout, where).svg);
    expect(layered.layers.map((one) => one.id)).toEqual(['back', 'ground']);
    expect(layered.fore).toEqual([]);
    expect(layered.layers[0].svg).toContain('id="walls"');
    // The ground is cut where the back row stands, and runs on under it.
    expect(layered.layers[1].svg).toContain('clip-path="url(#near-ground)"');
  });

  it("gives the floor's back and front by the set's own pinhole", () => {
    for (const kind of ['outdoor', 'indoor', 'vessel'] as const) {
      const floor = floorOf(kind);
      const feet = (820 / 900) * SET_H;
      const size = (y: number) =>
        scaleAtFeet(kind, y) / scaleAtFeet(kind, feet);
      expect(size(floor.back)).toBeCloseTo(FLOOR_BACK_K, 2);
      expect(floor.front).toBeGreaterThan(feet);
      expect(floor.front).toBeLessThanOrEqual(SET_H - 8);
      expect(size(floor.front)).toBeLessThanOrEqual(FLOOR_FRONT_K + 1e-6);
    }
  });
});

describe('a floor with depth', () => {
  it('stands d 0.5 where people have always stood, nearer lower and larger', () => {
    const at = (d: number) => floorAt(d, 844, 496, 888);
    expect(at(0.5)).toEqual({ feet: 844, k: 1 });
    expect(at(0).k).toBeCloseTo(FLOOR_BACK_K, 3);
    expect(at(1).feet).toBeLessThanOrEqual(888);
    for (const d of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1])
      expect(at(d + 0.01).feet).toBeGreaterThan(at(d).feet - 1e-9);
    // Farther off than where people have always stood, a size says its depth.
    for (const d of [0, 0.15, 0.3, 0.5])
      expect(depthOfK(at(d).k)).toBeCloseTo(d, 2);
  });

  it('spreads a group of four across the depth, and keeps a conversation side by side', () => {
    expect(spreadDepth(0, 2)).toBe(spreadDepth(1, 2));
    const four = [0, 1, 2, 3].map((i) => spreadDepth(i, 4));
    expect(Math.max(...four) - Math.min(...four)).toBeGreaterThan(0.25);
    expect(new Set(four).size).toBe(4);
  });

  const person: LaidThing = {
    kind: 'drawing',
    aspect: 0.5,
    caption: null,
    stands: { units: 224 },
  };
  const things = new Map<string, LaidThing>(
    ['a', 'b', 'c', 'd'].map((id) => [id, person]),
  );
  const scale = { unit: 2, floor: 844, slot: { x: 0, y: 0, w: 300, h: 600 } };
  const floor = { eye: 496, bottom: 888 };

  it('stands people at the depth the words say, a feature’s own beside it, or as the stager spreads them', () => {
    const [step] = layoutStations({
      steps: [
        {
          show: ['a', 'b', 'c', 'd'],
          at: { a: 'left', b: 'centre-left', c: 'centre-right', d: 'right' },
          depth: { a: DEPTH_FRONT },
        },
      ],
      things,
      staging: 'wide',
      scale,
      features: new Map(),
      shares: stationShares(4),
      floor,
    });
    const feet = (id: string) => step[id].y + step[id].h;
    expect(step.a.d).toBe(DEPTH_FRONT);
    expect(feet('a')).toBeCloseTo(floorAt(DEPTH_FRONT, 844, 496, 888).feet, 0);
    // Nearer is larger.
    expect(step.a.h).toBeGreaterThan(step.b.h);
    expect(new Set(['b', 'c', 'd'].map(feet)).size).toBeGreaterThan(1);
    const [byStall] = layoutStations({
      steps: [{ show: ['a'], at: { a: 'by:stall:1' } }],
      things,
      staging: 'wide',
      scale,
      features: new Map([
        ['stall', { x: 800, w: 200, way: { y: 740, k: 0.7 } }],
      ]),
      floor,
    });
    // At the stall: at its depth, as big as someone there.
    expect(byStall.a.y + byStall.a.h).toBe(740);
    expect(byStall.a.d).toBe(depthOfK(0.7));
    // With no floor given, everyone on one line, as before.
    const [flat] = layoutStations({
      steps: [{ show: ['a', 'b', 'c'] }],
      things,
      staging: 'wide',
      scale,
      features: new Map(),
    });
    expect(new Set(Object.values(flat).map((p) => p.y + p.h))).toEqual(
      new Set([844]),
    );
    expect(flat.a.d).toBeUndefined();
  });

  it('reads the depth words, and nothing else, as depth', () => {
    expect(depthSaid('Tobi steps in front')).toBe(DEPTH_FRONT);
    expect(depthSaid('Maya walks near the camera')).toBe(DEPTH_FRONT);
    expect(depthSaid('Pip wanders to the back')).toBe(DEPTH_BACK);
    expect(depthSaid('Mama waits far off')).toBe(DEPTH_BACK);
    expect(depthSaid('Tobi runs across the yard')).toBe(DEPTH_BACK);
    expect(depthSaid('Maya walks to the stall')).toBeNull();
    expect(depthSaid('Tobi goes back home')).toBeNull();
    expect(
      storySheetOf({ onStage: [{ who: 'maya', spot: 'left', depth: 'front' }] })
        .onStage[0].depth,
    ).toBe('front');
    expect(
      storySheetOf({ onStage: [{ who: 'maya', spot: 'left', depth: 'high' }] })
        .onStage[0].depth,
    ).toBeUndefined();
  });
});

describe('a walk into the floor', () => {
  const W = 1600;
  const at = (x: number, h: number) => ({
    x: x - h * 0.3,
    y: 844 - h,
    w: h * 0.6,
    h,
  });
  it('is as long as its diagonal truly is, the same on the server as the player', () => {
    expect(walkLength(at(400, 500), at(1000, 500), W)).toBe(600);
    expect(walkLength(at(400, 380), at(1000, 560), W)).toBeCloseTo(
      Math.hypot(600, (W * WALK_DEPTH * 180) / 470),
      6,
    );
    // Straight toward the camera is a walk too.
    expect(walkLength(at(800, 380), at(800, 560), W)).toBeGreaterThan(W * 0.02);
  });

  it('times a walk nearer by its length, and waits for it to end', () => {
    const scene = {
      beats: [],
      durationMs: 1000,
      steps: [
        {
          atMs: 0,
          layout: 'one',
          show: ['maya'],
          arrows: [],
          enter: { maya: { how: 'fade' } },
          focus: null,
        },
        {
          atMs: 500,
          layout: 'one',
          show: ['maya'],
          arrows: [],
          enter: {},
          focus: null,
        },
      ],
      effects: [],
      acting: { maya: { walks: true } },
      stagings: {
        wide: {
          w: W,
          h: 900,
          places: [{ maya: at(800, 380) }, { maya: at(820, 560) }],
        },
        box: { w: 1200, h: 900, places: [{}, {}] },
      },
    } as unknown as SceneDto;
    const [walk] = walksOf(scene);
    expect(walk.to - walk.from).toBeGreaterThan(1100);
    expect(settledOf(scene)).toBe(Math.round(walk.to));
  });
});

// ── Faces seen ─────────────────────────────────────────────────────────────

describe('faces kept in view', () => {
  const W = 1600;
  const H = 900;
  const base = {
    W,
    H,
    steps: [{ atMs: 0, show: ['maya', 'tobi'] }],
    lines: [{ who: 'maya', startMs: 500, endMs: 2500 }],
    shots: [],
    features: [],
    fore: [],
    foreDepth: 1.3,
    open: () => true,
    hiding: () => false,
    atDepth: (
      p: { x: number; y: number; w: number; h: number; d?: number },
      d: number,
    ) => {
      const was = floorAt(p.d ?? 0.5, 844, 496, 888);
      const now = floorAt(d, 844, 496, 888);
      const k = now.k / was.k;
      return {
        x: p.x + (p.w - p.w * k) / 2,
        y: now.feet - p.h * k,
        w: p.w * k,
        h: p.h * k,
        d,
      };
    },
    name: (id: string) => id,
    durationMs: 3000,
  };

  it('moves a speaker hidden behind someone nearer, and says so', () => {
    const places = [
      {
        maya: { x: 700, y: 764 - 420, w: 210, h: 420, d: 0.2 },
        tobi: { x: 560, y: 884 - 640, w: 320, h: 640, d: 0.9 },
      },
    ];
    const face = () => faceOf(places[0].maya);
    const body = () => {
      const t = places[0].tobi;
      return { x: t.x + t.w * 0.15, y: t.y, w: t.w * 0.7, h: t.h };
    };
    expect(covered(face(), [body()])).toBeGreaterThan(FACE_COVERED);
    const { notes } = keepFacesSeen({ ...base, places });
    expect(covered(face(), [body()])).toBeLessThanOrEqual(FACE_COVERED);
    expect(notes.join(' ')).toMatch(/^staging: maya's face was hidden by tobi/);
  });

  it('fades a thing before the camera for the line when nothing else will do', () => {
    const places = [{ maya: { x: 700, y: 300, w: 200, h: 500 } }];
    const { fades, notes } = keepFacesSeen({
      ...base,
      steps: [{ atMs: 0, show: ['maya'] }],
      places,
      open: () => false,
      // A tall post right before her, the whole frame high.
      fore: [{ id: 'fg-1', box: { x: 0, y: 0, w: W, h: H } }],
    });
    expect(fades).toEqual([[500, 2500, 'fg-1']]);
    expect(notes.join(' ')).toMatch(/fg-1 faded/);
  });

  it('sees a face in a close shot as the camera frames it, before the camera moving more than the people', () => {
    const view = viewOf(
      { target: 'maya', part: null },
      ['maya'],
      { maya: { x: 700, y: 300, w: 200, h: 500 } },
      W,
      H,
    );
    expect(view.s).toBeGreaterThan(1);
    const near = onScreen({ x: 700, y: 700, w: 100, h: 100 }, view, 1.3, W, H);
    const same = onScreen({ x: 700, y: 700, w: 100, h: 100 }, view, 1, W, H);
    expect(near.w).toBeGreaterThan(same.w);
  });
});

/** The Maya show, and Tobi's, as written: staged and composed as the Studio makes them. */
const fixture = (show: string, file: string): unknown =>
  JSON.parse(
    readFileSync(join(__dirname, 'studio', '__fixtures__', show, file), 'utf8'),
  );

/** A set built as layers from a layout, gated and measured as a painted set is: the drawing the stage is given. */
async function layeredSet(
  layout: unknown,
  where: StoryPlace,
): Promise<GatedDrawing> {
  const built = buildSet(layoutOf(layout, where), where);
  const gated = await gateDrawing(built.svg, setThing(where, 'Book'), {
    backdrop: true,
  });
  const drawing = gated.drawing!;
  const ground = await measureGround(drawing);
  return { ...drawing, ...(ground ? { ground } : {}), layered: built.layered };
}

/** Every line's speaker's face, in every shot then, as the film has them: how much is hidden at worst, and where. */
function hiddenFaces(scene: SceneDto, set: GatedDrawing | null): string[] {
  const { w: W, h: H, places } = scene.stagings.wide;
  const shots = scene.effects.filter((e) => e.do === 'zoom');
  const fore = set?.layered?.fore ?? [];
  const depth =
    set?.layered?.layers.find((one) => one.id === 'foreground')?.depth ?? 1.2;
  const features = scene.setting?.features ?? [];
  const out: string[] = [];
  for (const [id, acting] of Object.entries(scene.acting ?? {}))
    for (const [start, shapes] of acting.mouth ?? []) {
      const end = start + (shapes.length * 1000) / 30;
      scene.steps.forEach((step, k) => {
        const next = scene.steps[k + 1]?.atMs ?? scene.durationMs;
        const from = Math.max(start, step.atMs);
        const to = Math.min(end, next);
        const me = places[k]?.[id];
        if (to <= from || !me || !step.show.includes(id)) return;
        if (step.behind?.[id] || step.abed?.[id]) return;
        const views = [
          { s: 1, x: W / 2, y: H / 2 },
          ...shots
            .filter(
              (s) => s.atMs < to && (s.untilMs ?? scene.durationMs) > from,
            )
            .map((s) => viewOf(s, step.show, places[k], W, H)),
        ];
        const faded = new Set(
          (scene.setting?.fades ?? [])
            .filter(([a, b]) => a <= from && b >= to)
            .map(([, , g]) => g),
        );
        for (const view of views) {
          const face = onScreen(faceOf(me), view, 1, W, H);
          const feet = me.y + me.h;
          const boxes = [
            ...step.show
              .filter(
                (o) =>
                  o !== id &&
                  places[k][o] &&
                  places[k][o].y + places[k][o].h > feet + H * 0.015,
              )
              .map((o) => {
                const p = places[k][o];
                return onScreen(
                  { x: p.x + p.w * 0.15, y: p.y, w: p.w * 0.7, h: p.h },
                  view,
                  1,
                  W,
                  H,
                );
              }),
            ...features
              .filter((f) => f.svg && (f.feet?.wide ?? 0) > feet + H * 0.015)
              .map((f) => onScreen(f.at.wide, view, 1, W, H)),
            ...fore
              .filter((f) => !faded.has(f.id))
              .map((f) =>
                onScreen(
                  { x: f.box[0], y: f.box[1], w: f.box[2], h: f.box[3] },
                  view,
                  depth,
                  W,
                  H,
                ),
              ),
          ];
          const hidden = covered(face, boxes);
          if (hidden > FACE_COVERED)
            out.push(
              `${id} at ${Math.round(from)}: ${Math.round(hidden * 100)}%`,
            );
        }
      });
    }
  return out;
}

describe('no face hidden on the fixtures', () => {
  it("keeps every speaker's face seen in the Maya film, its market built as layers with things before the camera", async () => {
    const bible = bibleOf(fixture('maya', 'bible.json'));
    const sheet = (n: number) =>
      storySheetOf(fixture('maya', `s${n}-sheet.json`));
    let show: StudioBible = bible;
    let before: EndState | null = null;
    const places = storyBibleFor(
      bible,
      [1, 2, 3, 4, 5].map(sheet),
      'Maya',
    ).places;
    for (let n = 1; n <= 5; n += 1) {
      show = withFeatures(
        show,
        sheet(n).set,
        mendSheet(sheet(n), show, before).features,
      );
      const fixed = repairSheet(sheet(n), show, before);
      const where =
        storyBibleFor(show, [fixed], 'Maya').places.find(
          (p) => p.id === fixed.set,
        ) ?? places.find((p) => p.id === fixed.set)!;
      // The market with a crate and a plant before the camera; the rest plain.
      const set = await layeredSet(
        where.id === 'market' ? MARKET : null,
        where,
      );
      const script = stageStory(fixed, show, { before });
      const { scene } = withMouths(
        voiced(script, ['pip'], { [placeThingId(where.id)]: set }).scene,
      );
      const people = Object.values(scene.stagings.wide.places).flatMap((step) =>
        Object.values(step),
      );
      // A floor with depth: everyone has one.
      expect(people.every((p) => p.d !== undefined)).toBe(true);
      expect({ scene: n, hidden: hiddenFaces(scene, set) }).toEqual({
        scene: n,
        hidden: [],
      });
      if (where.id === 'market') {
        const thing = scene.things.find((t) => t.id === placeThingId('market'));
        expect(thing?.kind === 'drawing' && thing.layers?.length).toBe(7);
        expect(thing?.kind === 'drawing' && thing.setWidth).toBe(SET_W);
      }
      before = endStateOf(fixed, show, before);
    }
  });

  it("keeps Tobi's face seen in his bedroom", async () => {
    const bible = bibleOf(fixture('tobi', 'bible.json'));
    const sheet = storySheetOf(fixture('tobi', 's1-sheet.json'));
    const fixed = repairSheet(sheet, bible);
    const where = storyBibleFor(bible, [fixed], 'Tobi').places.find(
      (p) => p.id === fixed.set,
    )!;
    const set = await layeredSet(null, where);
    const { scene } = withMouths(
      voiced(stageStory(fixed, bible), [], { [placeThingId(where.id)]: set })
        .scene,
    );
    expect(Object.values(scene.acting ?? {}).some((a) => a.mouth?.length)).toBe(
      true,
    );
    expect(hiddenFaces(scene, set)).toEqual([]);
  });
});
