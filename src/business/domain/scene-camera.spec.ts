/**
 * The camera and the picture check (studio-scenery-plan L4): sets wider
 * than the frame, the wide shot on where the action is, stills built
 * from the layers with the people at their depths, and the picture check
 * catching an ark drawn as a bus.
 */
import type { SceneDto, SceneEffectDto } from '../../contracts';
import { pushedOnFeeling } from './scene-compose';
import { NO_ROOM, roomOf, viewOf, wideView, withoutJumps } from './scene-film';
import { onScreen as facesOnScreen } from './scene-faces-seen';
import { measureGround } from './scene-ground';
import {
  askedMoments,
  claimsText,
  namedAsDrawn,
  pictureClaims,
  pictureMoments,
  pictureProblems,
} from './scene-picture-check';
import { SET_H, SET_W, buildSet, layoutOf, widthFor } from './scene-set-layout';
import {
  FLOOR_BACK_F,
  FLOOR_FRONT_F,
  floorFactor,
  layerWindow,
  onScreen,
  posedRig,
  stillCamera,
  stillPlan,
  stillPose,
  stillSvg,
} from './scene-still';
import { setThing, type StoryPlace } from './scene-story';
import { gateDrawing } from './scene-svg';
import { NOAH_CAST, NOAH_YARD, noahScene } from './studio/__fixtures__/noah';

jest.setTimeout(120_000);

const place = (patch: Partial<StoryPlace> = {}): StoryPlace => ({
  id: 'yard',
  name: 'The school yard',
  aliases: [],
  look: 'a sunny school yard',
  firstPage: 1,
  sound: null,
  kind: 'outdoor',
  stand: 'on',
  front: null,
  features: [],
  ...patch,
});

const YARD = {
  sky: 'day',
  ground: 'grass',
  backdrop: 'trees',
  items: [
    { kind: 'house', x: 0.2, row: 'back', scale: 1 },
    { kind: 'bush', x: 0.7, row: 'back', scale: 1 },
    { kind: 'bench', x: 0.85, row: 'middle', scale: 1 },
  ],
  own: [],
  focal: { x: 0.3, words: 'by the house' },
};

describe('a set wider than the frame', () => {
  it('is as wide as its camera needs: a small room one frame, out of doors one and a half, a long way across two', () => {
    expect(widthFor(place({ kind: 'indoor', name: 'The bedroom' }))).toBe(1);
    expect(widthFor(place({ kind: 'indoor', name: 'The church hall' }))).toBe(
      1.5,
    );
    expect(widthFor(place())).toBe(1.5);
    expect(widthFor(place({ name: 'The road to town' }))).toBe(2);
    expect(widthFor(place({ kind: 'vessel', name: 'The bus' }))).toBe(1);
    // The painter's own word wins; a book's page is never wider.
    expect(layoutOf({ ...YARD, width: 2 }, place()).width).toBe(2);
    expect(layoutOf(YARD, place()).width).toBe(1.5);
    expect(layoutOf(YARD, place({ features: undefined })).width).toBe(
      undefined,
    );
  });

  it('draws past the frame either side, its layers and flat picture still framed on its middle, and its ground still read', async () => {
    const where = place();
    const layout = layoutOf(YARD, where);
    const built = buildSet(layout, where);
    expect(built.layered.width).toBe(SET_W * 1.5);
    expect(built.layered.focal).toBe(0.3);
    // The frame the stagings are laid out in is its middle: every layer's
    // viewBox is the frame, what runs past it drawn outside it.
    for (const layer of built.layered.layers)
      expect(layer.svg).toMatch(
        new RegExp(`^<svg[^>]*viewBox="0 0 ${SET_W} ${SET_H}"`),
      );
    expect(built.svg).toMatch(
      new RegExp(`^<svg[^>]*viewBox="0 0 ${SET_W} ${SET_H}"`),
    );
    // The sky and the ground run the whole width, moved back by the margin.
    expect(built.svg).toContain('<g transform="translate(-400 0)">');
    // More of the place stands past each edge, along the back.
    expect(built.placed.some((p) => p.x < 0)).toBe(true);
    expect(built.placed.some((p) => p.x > SET_W)).toBe(true);
    // The flat picture's ground is read as before.
    const gated = await gateDrawing(built.svg, setThing(where, 'Book'), {
      backdrop: true,
    });
    const ground = await measureGround(gated.drawing!);
    expect(ground?.source).not.toBe('convention');
    expect(ground!.horizon).toBeGreaterThan(0.5);
    expect(ground!.horizon).toBeLessThan(0.75);
  });

  it('leaves a set one frame wide byte for byte as it was', () => {
    const where = place();
    const layout = { ...layoutOf(YARD, where) };
    delete layout.width;
    const plain = buildSet(layout, where);
    const one = buildSet({ ...layout, width: 1 }, where);
    expect(one.svg).toBe(plain.svg);
    expect(JSON.stringify(one.layered)).toBe(JSON.stringify(plain.layered));
    expect(plain.layered.width).toBe(SET_W);
    expect(plain.layered.focal).toBeUndefined();
    expect(plain.svg).not.toContain('translate(-');
  });
});

describe('the wide shot on a wide set', () => {
  const W = 1600;
  const H = 900;
  const room = roomOf({ setWidth: 2400, focal: 0.25 }, W, H);
  const people = {
    a: { x: 500, y: 400, w: 150, h: 400 },
    b: { x: 700, y: 400, w: 150, h: 400 },
  };

  it('gives the camera the set past the frame to pan in', () => {
    expect(room.span).toEqual([400, 400]);
    expect(room.focal).toBe(400);
    expect(roomOf({ setWidth: 1600, focal: 0.25 }, W, H).span).toEqual([0, 0]);
    expect(roomOf(null, W, H)).toEqual({ span: [0, 0], focal: null });
  });

  it('centres on where the action is, as far as everyone on the stage stays in it', () => {
    // All near the focal area: centred on it.
    expect(wideView(['a', 'b'], people, W, H, room).x).toBe(400 + 400 * 0);
    const near = wideView(
      ['a'],
      { a: { x: 300, y: 400, w: 150, h: 400 } },
      W,
      H,
      room,
    );
    expect(near.x).toBe(400);
    // Someone at the right of the frame keeps it from panning all the way.
    const wide = wideView(
      ['a', 'b'],
      { ...people, b: { x: 1300, y: 400, w: 150, h: 400 } },
      W,
      H,
      room,
    );
    expect(wide.x).toBeCloseTo(1300 + 150 + 0.04 * W - W / 2, 5);
    // Never past the set's edge; on a set one frame wide, the middle.
    expect(
      wideView([], {}, W, H, roomOf({ setWidth: 2400, focal: -1 }, W, H)).x,
    ).toBe(400);
    expect(wideView(['a'], people, W, H, NO_ROOM)).toEqual({
      s: 1,
      x: 800,
      y: 450,
    });
    expect(viewOf(null, ['a'], people, W, H, room).x).toBe(400);
  });

  it('judges a jump from the wide shot as the camera stands on the wide set', () => {
    const steps = [
      { atMs: 0, show: ['a', 'b'], layout: 'free', arrows: [], enter: {} },
    ];
    const shot: SceneEffectDto = {
      atMs: 2000,
      untilMs: 5000,
      target: 'a',
      part: null,
      do: 'zoom',
    };
    const kept = withoutJumps(
      [shot],
      steps as never,
      { w: W, h: H, places: [people], room },
      8000,
    );
    expect(kept).toHaveLength(1);
  });

  it('shows a box where the pan puts it, each layer moved its depth’s share, never past the set', () => {
    const view = { s: 1, x: 500, y: 450 };
    const box = { x: 700, y: 400, w: 100, h: 300 };
    // Panned 300 to the left of the frame's middle: the people move right 300.
    expect(facesOnScreen(box, view, 1, W, H, [400, 400]).x).toBeCloseTo(1000);
    expect(facesOnScreen(box, view, 0.5, W, H, [400, 400]).x).toBeCloseTo(850);
    // With no room, as it always was.
    expect(facesOnScreen(box, { s: 1, x: 800, y: 450 }, 1, W, H)).toEqual(box);
  });
});

describe('a still of the film, from its layers', () => {
  const scene = noahScene();

  it('lays the set’s layers where the camera has each, and the people and the stage’s things on the floor at their depths', () => {
    const plan = stillPlan(scene, 2000, 960);
    const keys = plan.parts.map((p) => p.key);
    // The set's layers behind, back to front, then the floor by its feet.
    expect(keys.slice(0, 3)).toEqual(['layer:sky', 'layer:far', 'layer:back']);
    expect(keys).toContain('layer:ground');
    expect(keys.indexOf('thing:shem')).toBeLessThan(keys.indexOf('thing:noah'));
    expect(keys).toContain('feature:ark');
    expect(plan.shows).toEqual(['noah', 'shem']);
    // The wide shot on where the action is (the ark, at 62% across): panned
    // right, Shem at the back left still in the frame.
    expect(plan.view.x).toBeCloseTo(0.62 * 1600, 5);
    expect(plan.camera.px).toBeCloseTo(0.62 * 1600 - 800, 5);
    expect(330 - plan.camera.px).toBeGreaterThan(0.04 * 1600 - 1e-6);
    // Each layer's window moved by its depth's share of the pan.
    const sky = layerWindow(plan.camera, 0.03, 1600, 900);
    const ground = layerWindow(plan.camera, 0.72, 1600, 900);
    expect(sky.x).toBeCloseTo(plan.camera.px * 0.03, 5);
    expect(ground.x).toBeCloseTo(plan.camera.px * 0.72, 5);
    const skySvg = plan.parts.find((p) => p.key === 'layer:sky')!.svg;
    expect(skySvg).toContain(
      `viewBox="${Math.round(sky.x * 100) / 100} 0 1600 900"`,
    );
    // Shem, at the back of the floor, follows the pan less than Noah before him.
    const shem = plan.parts.find((p) => p.key === 'thing:shem')!;
    const noah = plan.parts.find((p) => p.key === 'thing:noah')!;
    expect(shem.depth).toBeLessThan(noah.depth);
    expect(shem.depth).toBeGreaterThanOrEqual(FLOOR_BACK_F);
    expect(noah.depth).toBeLessThanOrEqual(FLOOR_FRONT_F);
    expect(shem.box.x).toBeCloseTo(330 - plan.camera.px * shem.depth, 5);
    expect(noah.box.x).toBeCloseTo(820 - plan.camera.px * noah.depth, 5);
    // Noah points as he does then: his arm turned in the drawing itself.
    expect(noah.svg).toMatch(/data-rig="arm ar" transform="rotate\(-84 /);
    // Laid out as one picture, each part its own image.
    const pngs = new Map(plan.parts.map((p) => [p.key, Buffer.from('x')]));
    const svg = stillSvg(plan, pngs);
    expect(svg.match(/<image /g)).toHaveLength(plan.parts.length);
  });

  it('keeps the camera’s maths: its pan by depth, and a floor from 0.8 at the back to 1.05 at the front', () => {
    const cam = stillCamera({ s: 1, x: 1000, y: 450 }, 1600, 900, [400, 400]);
    expect(cam.px).toBe(200);
    expect(onScreen(cam, 0.5, { x: 100, y: 0, w: 10, h: 10 }).x).toBe(0);
    // Close in and panned: never past the set's edge.
    const close = stillCamera({ s: 2, x: 1500, y: 450 }, 1600, 900, [400, 400]);
    const win = layerWindow(close, 1.4, 1600, 900);
    expect(win.x + win.w).toBeLessThanOrEqual(1600 + 400 + 1e-6);
    expect(floorFactor(500, [500, 800])).toBe(FLOOR_BACK_F);
    expect(floorFactor(800, [500, 800])).toBe(FLOOR_FRONT_F);
    expect(floorFactor(650, null)).toBe(1);
  });

  it('poses the kit’s arms as a move holds them, and leaves one at rest as drawn', () => {
    const svg =
      '<svg><g class="arm al" style="transform-origin:-28px -104px"><g class="fore" style="transform-origin:-38.5px -77px"></g></g>' +
      '<g class="arm ar" style="transform-origin:28px -104px"><g class="fore" style="transform-origin:38.5px -77px"></g></g></svg>';
    expect(posedRig(svg, { ar: 0, arf: 0, al: 0, alf: 0 })).toBe(svg);
    const waved = posedRig(
      svg,
      stillPose(
        {
          acting: { a: { moves: [[0, 'wave', 1000]] } },
        } as unknown as SceneDto,
        'a',
        500,
      ),
    );
    expect(waved).toContain(
      '<g data-rig="arm ar" transform="rotate(-85 28 -104)">',
    );
    expect(waved).toContain(
      '<g data-rig="fore" transform="rotate(-50 38.5 -77)">',
    );
    expect(waved).toContain(
      '<g class="arm al" style="transform-origin:-28px -104px">',
    );
  });
});

describe('the picture check', () => {
  const scene = noahScene();

  it('looks at the fullest moment, each asked change and the last frame, two to four stills', () => {
    const moments = pictureMoments(scene);
    expect(moments.map((m) => m.why)).toEqual([
      'the fullest moment',
      'the last frame',
    ]);
    const asked = askedMoments(scene, 'Make Shem watch from across the yard');
    expect(asked).toEqual([6200]);
    const withAsked = pictureMoments(scene, [1000, 2600, 5000]);
    expect(withAsked).toHaveLength(4);
    expect(withAsked.map((m) => m.why)).toContain('the asked change (1)');
  });

  it('says what the sheet claims: who is there, and what each thing of the place is called', () => {
    const claims = pictureClaims(
      scene,
      2000,
      NOAH_CAST,
      'Noah points at the ark',
    );
    expect(claims.onStage).toEqual([
      'Noah (an old man with a white beard)',
      "Shem (Noah's young son)",
    ]);
    expect(claims.things).toEqual(['the half-built ark']);
    const text = claimsText(claims, 'the asked change');
    expect(text).toContain('"the half-built ark"');
    expect(text).toContain('The maker asked for this change');
  });

  it('flags the ark drawn as a bus: code sees it, and the judge’s notes (mocked) go back to the writer', () => {
    expect(NOAH_YARD.features![0].kind).toBe('vehicle');
    const code = namedAsDrawn(scene);
    expect(code).toHaveLength(1);
    expect(code[0]).toMatch(/"the half-built ark" is drawn as a road vehicle/);
    // A gate named as a gate is drawn as what it is.
    const gate = {
      ...scene,
      setting: {
        ...scene.setting,
        features: [
          {
            ...scene.setting!.features![0],
            name: 'the garden gate',
            kind: 'gate',
          },
        ],
      },
    } as SceneDto;
    expect(namedAsDrawn(gate)).toEqual([]);
    // The judge, mocked: what it says is wrong, said once each.
    const judge = (wrong: string[]) => ({ matches: !wrong.length, wrong });
    const problems = pictureProblems(code, [
      {
        why: 'the fullest moment',
        verdict: judge([
          'The half-built ark is drawn as a bus.',
          'Shem is too small to see.',
        ]),
      },
      { why: 'the last frame', verdict: judge(['Shem is too small to see.']) },
    ]);
    expect(problems).toEqual([
      code[0],
      'In the fullest moment: The half-built ark is drawn as a bus.',
      'In the fullest moment: Shem is too small to see.',
    ]);
    // All as the sheet says: nothing to write again.
    expect(
      pictureProblems([], [{ why: 'the last frame', verdict: judge([]) }]),
    ).toEqual([]);
  });
});

describe('a push on a feeling', () => {
  it('marks a close shot on someone who sobs or hugs while it is on', () => {
    const shot = (target: string): SceneEffectDto => ({
      atMs: 1000,
      untilMs: 4000,
      target,
      part: null,
      do: 'zoom',
    });
    const acting = {
      maya: { moves: [[2000, 'sob', 1500]] as [number, string, number][] },
      tobi: { moves: [[2000, 'wave', 800]] as [number, string, number][] },
    };
    const [sob, wave] = pushedOnFeeling([shot('maya'), shot('tobi')], acting);
    expect(sob.pan).toBe('push');
    expect(wave.pan).toBeUndefined();
  });
});
