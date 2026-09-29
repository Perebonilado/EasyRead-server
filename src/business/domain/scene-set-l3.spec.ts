/**
 * Richer scenery, L3 (studio-scenery-plan §5): style packs chosen from
 * the story's world, buildings from parts, clutter kept clear of the
 * action, ground texture, landmarks by parameters, real sizes by depth,
 * and a crowd before the camera; on the twelve places of the set bench.
 */
import { checkSet, type Check, type CodeChecks } from './drawing-checks';
import { measureGround } from './scene-ground';
import {
  FOCAL_HALF,
  ELEMENT_BUDGET,
  SET_H,
  SET_W,
  buildSet,
  layoutBrief,
  layoutOf,
} from './scene-set-layout';
import { SET_VERSION } from './scene-sheet';
import { setThing, type StoryWorld } from './scene-story';
import { gateDrawing } from './scene-svg';
import { SET_BENCH } from './set-bench';
import { drawBuilding } from './scene-set-buildings';
import {
  clampParams,
  drawLandmark,
  landmarkOfName,
} from './scene-set-landmarks';
import { checkSizes } from './scene-set-sizes';
import { audienceAlive } from './scene-set-audience';
import {
  BUILDING_KINDS,
  STYLE_PACKS,
  STYLE_PACK_IDS,
  packOfWorld,
  styleOf,
} from './scene-style-packs';

jest.setTimeout(240_000);

const world = (patch: Partial<StoryWorld>): StoryWorld => ({
  era: '',
  region: '',
  culture: '',
  landscape: '',
  homes: '',
  ...patch,
});

const bench = SET_BENCH.map((one) => {
  const layout = layoutOf(one.layout, one.place, one.world);
  return { ...one, layout, built: buildSet(layout, one.place) };
});

describe('style packs', () => {
  it('are chosen from the story’s world by its words', () => {
    expect(
      packOfWorld(
        world({
          era: 'about 1400 BC',
          region: 'Egypt',
          culture: 'Hebrew slaves under Pharaoh',
        }),
      ),
    ).toBe('ancient-near-east');
    expect(packOfWorld(world({ region: 'the time of Moses' }))).toBe(
      'ancient-near-east',
    );
    expect(
      packOfWorld(world({ era: 'first century AD', region: 'Galilee' })),
    ).toBe('biblical-village');
    // A biblical story in Bethlehem is a village's, not ancient Egypt's.
    expect(
      packOfWorld(
        world({
          era: 'biblical times',
          region: 'Bethlehem',
          culture: 'shepherds',
        }),
      ),
    ).toBe('biblical-village');
    expect(
      packOfWorld(
        world({
          era: 'today',
          region: 'Lagos, Nigeria',
          landscape: 'danfos and markets',
        }),
      ),
    ).toBe('west-african-town');
    expect(
      packOfWorld(world({ region: 'West Africa', culture: 'Yoruba' })),
    ).toBe('west-african-town');
    expect(
      packOfWorld(
        world({ era: 'today', region: 'New York', homes: 'apartments' }),
      ),
    ).toBe('western-city');
    expect(packOfWorld(world({ region: 'London' }))).toBe('western-city');
    expect(
      packOfWorld(
        world({ region: 'a small village', landscape: 'farms and fields' }),
      ),
    ).toBe('village-farm');
    // Nothing that says: code does not guess.
    expect(packOfWorld(world({ era: 'today', region: 'a town' }))).toBeNull();
    expect(packOfWorld(null)).toBeNull();
    expect(styleOf('west-african-town')).toBe('west-african-town');
    expect(styleOf('western city')).toBe('western-city');
    expect(styleOf('Lagos')).toBe('west-african-town');
    expect(styleOf('spaceship')).toBeNull();
  });

  it('are kept on the layout: the world’s first, then the painter’s, then the place’s own words', () => {
    const place = SET_BENCH[0].place;
    const lagos = world({ region: 'Lagos' });
    expect(layoutOf({ style: 'western-city' }, place, lagos).style).toBe(
      'west-african-town',
    );
    expect(
      layoutOf({ style: 'western-city' }, place, world({ region: 'a town' }))
        .style,
    ).toBe('western-city');
    // The market's own words say Lagos.
    expect(layoutOf({}, place, null).style).toBe('west-african-town');
    expect(
      layoutOf({}, { ...place, name: 'the clearing', look: 'a clearing' }, null)
        .style,
    ).toBe('nature');
    // A layout from before the packs has none.
    expect(layoutOf({}, place).style).toBeUndefined();
    expect(layoutOf({ style: 'nature' }, place).style).toBe('nature');
  });

  it('tells the painter the pack code chose, or every pack to choose from, and the culture', () => {
    const one = SET_BENCH.find((b) => b.id === 'lagos-market')!;
    const brief = layoutBrief(one.place, 'Book', one.world);
    expect(brief).toContain('among Yoruba families');
    expect(brief).toContain('"style": "west-african-town"');
    expect(brief).toContain('okada');
    const open = layoutBrief(one.place, 'Book', world({ region: 'a town' }));
    for (const id of STYLE_PACK_IDS) expect(open).toContain(`"${id}"`);
  });

  it('keep every colour of theirs one of the house’s', () => {
    for (const pack of Object.values(STYLE_PACKS)) {
      for (const list of [
        pack.palette.walls,
        pack.palette.roofs,
        pack.palette.doors,
        pack.palette.awnings,
      ])
        for (const hex of list) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(pack.palette.tintK).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('buildings from parts', () => {
  it('are the same for the same seed, and differ from seed to seed', () => {
    for (const kind of BUILDING_KINDS)
      for (const pack of Object.values(STYLE_PACKS)) {
        const a = drawBuilding(kind, pack, 'street:1');
        expect(drawBuilding(kind, pack, 'street:1').svg).toBe(a.svg);
        expect(a.svg).toContain('stroke="#2d2a32"');
        expect(a.viewBox[1]).toBeLessThan(0);
      }
    const pack = STYLE_PACKS['west-african-town'];
    const houses = Array.from(
      { length: 8 },
      (_, k) => drawBuilding('house', pack, `street:${k}`).svg,
    );
    expect(new Set(houses).size).toBeGreaterThanOrEqual(7);
  });

  it('take their parts from their pack, narrowed by their kind', () => {
    const lagos = STYLE_PACKS['west-african-town'];
    for (let k = 0; k < 20; k += 1) {
      const { parts } = drawBuilding('zinc roof house', lagos, `z${k}`);
      expect(parts.roof).toBe('zinc');
      expect(['louvred', 'barred']).toContain(parts.window);
      const house = drawBuilding('house', lagos, `h${k}`).parts;
      expect(lagos.walls.map(([w]) => w)).toContain(house.wall);
      expect(lagos.roofs.map(([r]) => r)).toContain(house.roof);
    }
    const city = STYLE_PACKS['western-city'];
    const brownstone = drawBuilding('brownstone', city, 'b1').parts;
    expect(brownstone.wall).toBe('brick');
    expect(brownstone.extras).toContain('stoop');
    expect(drawBuilding('mosque', lagos, 'm').parts.roof).toBe('dome');
    // No words on a signboard, ever: shapes only.
    expect(drawBuilding('shop', lagos, 's').svg).not.toMatch(/<text/);
  });
});

describe('landmarks by parameters', () => {
  it('clamp what the painter says to what they draw', () => {
    expect(
      clampParams('ark', {
        size: 3,
        decks: 7.4,
        ramp: 'yes',
        unfinished: 1,
        colour: 'red',
      }),
    ).toEqual({
      size: 0.9,
      decks: 3,
      ramp: true,
      unfinished: true,
    });
    expect(clampParams('ark', {})).toEqual({
      size: 0.6,
      decks: 3,
      ramp: true,
      unfinished: false,
    });
    expect(clampParams('tower', { levels: -2, size: 'big' })).toMatchObject({
      levels: 2,
      size: 0.65,
    });
    expect(clampParams('statue', { pose: 'Seated' }).pose).toBe('seated');
    expect(clampParams('statue', { pose: 'flying' }).pose).toBe('standing');
    const ark = landmarkOfName("Noah's ark, half built");
    expect(ark?.kind).toBe('ark');
    expect(ark?.params.unfinished).toBe(true);
    expect(landmarkOfName('a golden statue')?.params.gold).toBe(true);
    expect(landmarkOfName('a fountain')).toBeNull();
  });

  it('are built by code, not the artist, where the layout names them, and sized to the frame', () => {
    const one = bench.find((b) => b.id === 'moses-riverside')!;
    expect(one.layout.own[0].build?.kind).toBe('ark');
    const ark = one.built.placed.find((p) => p.kind === 'ark')!;
    expect(ark.box[2]).toBeCloseTo(SET_W * 0.55, -1);
    expect(ark.box[1]).toBeGreaterThanOrEqual(SET_H * 0.04 - 1);
    // A painter's own named thing a builder draws needs no artist.
    const layout = layoutOf(
      {
        own: [
          {
            name: 'the Tower of Babel',
            x: 0.5,
            row: 'back',
            build: { kind: 'tower', params: { levels: 12 } },
          },
        ],
      },
      one.place,
      null,
    );
    expect(layout.own[0].build?.kind).toBe('tower');
    expect(layout.own[0].build?.params).toMatchObject({
      levels: 8,
      stepped: true,
    });
    for (const kind of [
      'ark',
      'pyramid',
      'tower',
      'bridge',
      'temple',
      'statue',
      'ship',
      'tent',
      'throne',
    ] as const)
      expect(
        drawLandmark(kind, {
          unfinished: true,
          ruined: true,
          pylon: kind === 'temple',
        }).svg,
      ).toMatch(/<(?:path|rect)\b/);
  });
});

describe('a set in a style pack', () => {
  it('keeps its clutter out of where the action is', () => {
    for (const one of bench) {
      const focal = one.layout.focal?.x ?? 0.5;
      for (const p of one.built.placed.filter((q) => q.clutter)) {
        const [a, , w] = p.box;
        const clearOf =
          a + w <= (focal - FOCAL_HALF) * SET_W + 0.5 ||
          a >= (focal + FOCAL_HALF) * SET_W - 0.5;
        expect({ place: one.id, kind: p.kind, clearOf }).toEqual({
          place: one.id,
          kind: p.kind,
          clearOf: true,
        });
      }
    }
    // And it has some: a Lagos street is busy.
    expect(
      bench
        .find((b) => b.id === 'lagos-market')!
        .built.placed.filter((p) => p.clutter).length,
    ).toBeGreaterThanOrEqual(10);
  });

  it('sizes everything by its depth: nothing larger, metre for metre, than what stands before it', () => {
    for (const one of bench) {
      const sized = one.built.placed.filter(
        (p) =>
          !p.free && p.band !== 'far' && p.band !== 'wall' && p.band !== 'flat',
      );
      for (const back of sized)
        for (const front of sized)
          if (front.y > back.y + 2)
            expect(back.s / back.real).toBeLessThanOrEqual(
              (front.s / front.real) * 1.005,
            );
    }
    // A house at the back is never bigger than a table in front, even asked to be.
    const place = SET_BENCH[0].place;
    const layout = layoutOf(
      {
        items: [
          { kind: 'house', x: 0.2, row: 'back', scale: 1.5 },
          { kind: 'bush', x: 0.5, row: 'back', scale: 1.5 },
          { kind: 'table', x: 0.8, row: 'middle', scale: 0.6 },
        ],
      },
      place,
      world({ region: 'Lagos' }),
    );
    const built = buildSet(layout, place);
    const at = (kind: string) => built.placed.find((p) => p.kind === kind)!;
    for (const kind of ['house', 'bush'])
      expect(at(kind).s / at(kind).real).toBeLessThanOrEqual(
        (at('table').s / at('table').real) * 1.005,
      );
    expect(built.notes.some((n) => n.startsWith('size: the bush'))).toBe(true);
    expect(
      checkSizes([
        { y: 100, perMetre: 2 },
        { y: 300, perMetre: 1 },
      ]),
    ).toEqual([{ index: 0, perMetre: 1 }]);
  });

  it('stands its buildings on the far edge of the ground, on the back layer, and draws its ground whole', () => {
    const one = bench.find((b) => b.id === 'new-york-street')!;
    const layers = Object.fromEntries(
      one.built.layered.layers.map((l) => [l.id, l.svg]),
    );
    // In the frame, the two the painter placed; past its edges, more of
    // the street for the camera to pan across (L4).
    const brownstones = one.built.placed.filter(
      (p) => p.kind === 'brownstone' && p.x >= 0 && p.x <= SET_W,
    );
    expect(brownstones).toHaveLength(2);
    for (const b of brownstones) expect(b.band).toBe('horizon');
    expect(layers.back).toContain('data-kind="brownstone"');
    expect(layers.ground).not.toContain('clip-path');
    expect(one.built.svg).toContain('data-style="western-city"');
    // Its pack's own backdrop for a plain one: a skyline for "city".
    expect(one.built.svg.indexOf('<g id="backdrop">')).toBeGreaterThan(0);
  });

  it('keeps what answers the world tagged the same on its layers as in its picture', () => {
    const tags = (text: string) =>
      [
        ...text.matchAll(
          / data-react="[^"]+" data-kind="[^"]+"[^>]*| data-roost="[^"]+"/g,
        ),
      ]
        .map((m) => m[0])
        .sort();
    for (const one of bench) {
      const all = one.built.layered.layers.map((l) => l.svg).join('');
      expect({ place: one.id, tags: tags(all) }).toEqual({
        place: one.id,
        tags: tags(one.built.svg),
      });
    }
    // Awnings flap, lamps hang, roofs are sat on.
    const market = bench.find((b) => b.id === 'lagos-market')!.built.svg;
    expect(market).toMatch(
      /data-react="flag" data-kind="(?:shop|kiosk|umbrella stall)"/,
    );
    expect(market).toMatch(
      /data-kind="(?:tenement|zinc roof house)"[^>]*data-roost="/,
    );
    expect(market).toMatch(/data-kind="grass"|data-kind="poles"/);
  });

  it('keeps within the budget, and every set passes the house checks', async () => {
    const failing = (checks: CodeChecks): string[] =>
      Object.entries(checks as unknown as Record<string, Check | undefined>)
        .filter(([, one]) => one && !one.ok)
        .map(([name, one]) => `${name}: ${one!.notes.join(' ')}`);
    for (const one of bench) {
      expect(one.built.notes.filter((n) => n.startsWith('budget'))).toEqual([]);
      const shapes = one.built.layered.layers
        .filter((l) => l.id !== 'floor')
        .reduce((sum, l) => sum + (l.svg.match(/<[a-zA-Z]/g) ?? []).length, 0);
      expect(shapes).toBeLessThanOrEqual(ELEMENT_BUDGET);
      const gated = await gateDrawing(
        one.built.svg,
        setThing(one.place, 'Book'),
        { backdrop: true },
      );
      const drawing = gated.drawing!;
      const ground = await measureGround(drawing);
      const checks = await checkSet(
        { version: SET_VERSION, drawing, ...(ground ? { ground } : {}) },
        one.place.kind ?? 'outdoor',
      );
      expect({ place: one.id, failing: failing(checks) }).toEqual({
        place: one.id,
        failing: [],
      });
    }
  });
});

describe('a crowd before the camera', () => {
  it('watches where people watch: rows of backs, low, each its own group, none over where the action is', () => {
    const classroom = bench.find((b) => b.id === 'classroom')!;
    expect(classroom.layout.audience).toBe(2);
    const fore = classroom.built.layered.fore.filter((f) =>
      f.id.startsWith('fg-au-'),
    );
    expect(fore.length).toBeGreaterThan(8);
    expect(fore.length).toBeLessThanOrEqual(40);
    for (const { box } of fore)
      expect(box[1]).toBeGreaterThanOrEqual(SET_H * 0.7);
    const foreground = classroom.built.layered.layers.find(
      (l) => l.id === 'foreground',
    )!;
    expect(foreground.svg).toContain('data-audience="rows"');
    expect(foreground.svg).toContain('id="fg-au-1"');
    // On its layer only: the flat picture's ground is read without it.
    expect(classroom.built.svg).not.toContain('data-audience');
    // A market's shoppers stand at its sides only; a farm has none.
    const market = bench.find((b) => b.id === 'lagos-market')!;
    for (const { box } of market.built.layered.fore.filter((f) =>
      f.id.startsWith('fg-au-'),
    )) {
      const middle = (box[0] + box[2] / 2) / SET_W;
      expect(middle < 0.35 || middle > 0.65).toBe(true);
    }
    expect(bench.find((b) => b.id === 'farm')!.layout.audience).toBeUndefined();
  });

  it('comes alive for a scene: cheering with the crowd and turning to whoever speaks', () => {
    const classroom = bench.find((b) => b.id === 'classroom')!;
    const svg = classroom.built.layered.layers.find(
      (l) => l.id === 'foreground',
    )!.svg;
    const alive = audienceAlive(svg, {
      moves: [[1000, 'cheer', 1400]],
      turns: [[2000, 5000, 1300]],
      durationMs: 8000,
      W: SET_W,
    });
    expect(alive).toMatch(/^<svg[^>]* style="--d:8000ms"/);
    expect(alive).toContain('@keyframes cr-x');
    expect(alive).toMatch(/@keyframes au-q0\{[^@]*translateX\(7px\)/);
    // Nothing to do, and a layer with no crowd, stay as they were.
    expect(
      audienceAlive(svg, { moves: [], turns: [], durationMs: 8000, W: SET_W }),
    ).toBe(svg);
    const farm = bench
      .find((b) => b.id === 'farm')!
      .built.layered.layers.at(-1)!.svg;
    expect(
      audienceAlive(farm, {
        moves: [[0, 'cheer', 1400]],
        turns: [],
        durationMs: 8000,
        W: SET_W,
      }),
    ).toBe(farm);
  });
});
