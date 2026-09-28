import { checkSet, type Check, type CodeChecks } from './drawing-checks';
import { measureGround } from './scene-ground';
import {
  FLOOR_LINE,
  SET_BACKDROPS,
  SET_GROUNDS,
  SET_H,
  SET_VESSELS,
  SET_W,
  buildSet,
  describeLayout,
  itemKindOf,
  layoutBrief,
  layoutOf,
  plainLayout,
  setColourOf,
  vesselOf,
  type SetLayout,
} from './scene-set-layout';
import { FLAT, HANGING, SCENERY_KINDS, drawScenery } from './scene-set-scenery';
import { CLOTH, FIGURE_INK, SET_COLOURS } from './scene-ink';
import { SET_VERSION } from './scene-sheet';
import { setThing, type StoryPlace } from './scene-story';
import { gateDrawing } from './scene-svg';
import { styleReport } from './scene-polish';

jest.setTimeout(120_000);

const place = (patch: Partial<StoryPlace> = {}): StoryPlace => ({
  id: 'here',
  name: 'the park',
  aliases: [],
  look: 'a green park',
  firstPage: 1,
  sound: null,
  kind: 'outdoor',
  stand: 'on',
  front: null,
  features: [],
  ...patch,
});

/** A layout's set built, gated as a painted set is, its ground read and every code check run. */
async function built(layout: SetLayout, where: StoryPlace) {
  const set = buildSet(layout, where);
  const gated = await gateDrawing(set.svg, setThing(where, 'Book'), {
    backdrop: true,
  });
  expect(gated.notes.filter(() => gated.retry)).toEqual([]);
  const drawing = gated.drawing!;
  const ground = await measureGround(drawing);
  const checks = await checkSet(
    { version: SET_VERSION, drawing, ...(ground ? { ground } : {}) },
    where.kind ?? 'outdoor',
  );
  return { set, drawing, ground, checks };
}

const failing = (checks: CodeChecks): string[] =>
  Object.entries(checks as unknown as Record<string, Check | undefined>)
    .filter(([, one]) => one && !one.ok)
    .map(([name, one]) => `${name}: ${one!.notes.join(' ')}`);

describe('a layout as the painter writes it, read', () => {
  it('takes the words people use for things, colours, rows and shares', () => {
    expect(itemKindOf('bookcase')).toBe('bookshelf');
    expect(itemKindOf('a big red bookshelf')).toBe('bookshelf');
    expect(itemKindOf('Palm Tree')).toBe('palm');
    expect(itemKindOf('market stall')).toBe('stall');
    expect(itemKindOf('spaceship')).toBeNull();
    expect(setColourOf('gray')).toBe(CLOTH.grey);
    expect(setColourOf('a pale yellow')).toBe(CLOTH.yellow);
    expect(setColourOf('#123456')).toBeNull();
    expect(vesselOf('the danfo')).toBe('bus');
    expect(vesselOf('a fishing boat')).toBe('boat');

    const layout = layoutOf(
      {
        sky: 'Dusk',
        weather: 'overcast',
        ground: 'sandy',
        backdrop: 'ocean',
        items: [
          {
            kind: 'palm tree',
            x: 12,
            row: 'foreground',
            scale: 4,
            colour: null,
          },
          { kind: 'bookcase', x: 0.5, row: 'middle', scale: 1, colour: 'gray' },
          { kind: 'spaceship', x: 0.5, row: 'back', scale: 1, colour: null },
        ],
        own: [
          { name: 'a totem pole', x: 0.3, row: 'back' },
          { name: 'own', x: 0.3, row: 'back' },
          { name: 'the sky', x: 0.3, row: 'back' },
          { name: 'a bench', x: 0.3, row: 'back' },
          { name: 'a fountain', x: 0.3, row: 'back' },
          { name: 'a statue', x: 0.3, row: 'back' },
        ],
      },
      place(),
    );
    expect(layout).toMatchObject({
      sky: 'dusk',
      weather: 'cloudy',
      ground: 'sand',
      backdrop: 'sea',
      walls: null,
      vessel: null,
    });
    expect(layout.items).toEqual([
      { kind: 'palm', x: 0.12, row: 'front', scale: 1.5, colour: null },
      {
        kind: 'bookshelf',
        x: 0.5,
        row: 'middle',
        scale: 1,
        colour: CLOTH.grey,
      },
    ]);
    // Only what the kit cannot draw, never the place itself, at most two.
    expect(layout.own.map((one) => one.name)).toEqual([
      'a totem pole',
      'a fountain',
    ]);
    expect(describeLayout(layout)).toContain('palm (front, 12%)');
  });

  it('falls back to the place’s plain one for what it cannot read', () => {
    expect(layoutOf('nonsense', place({ kind: 'indoor' }))).toEqual(
      plainLayout(place({ kind: 'indoor' })),
    );
    const bus = layoutOf(
      { vessel: 'spaceship', items: [] },
      place({ kind: 'vessel', name: 'the yellow bus', look: '' }),
    );
    expect(bus.vessel).toBe('bus');
    expect(bus.vesselColour).toBe(CLOTH.yellow);
    // Out of doors there are no walls; in a room no backdrop.
    const room = layoutOf(
      { walls: 'blue', backdrop: 'hills' },
      place({ kind: 'indoor' }),
    );
    expect(room.walls).toBe(CLOTH.blue);
    expect(room.backdrop).toBe('none');
  });

  it('leaves out of the painter’s brief what the stage draws, and says where it stands', () => {
    const brief = layoutBrief(
      place({
        look: 'a park with an old well',
        features: [
          { id: 'gate', name: 'gate', kind: 'gate', spot: 'left' },
          { id: 'well', name: 'well', kind: 'well', spot: 'right' },
        ],
      }),
      'Tobi',
    );
    expect(brief).toContain(
      'leave them out, and keep the ground clear there: the gate (12% across)',
    );
    expect(brief).toContain('do not place them again: the well (88% across)');
  });
});

describe('the scenery code draws', () => {
  it('draws every piece in the kit’s ink, standing on its ground', () => {
    for (const kind of SCENERY_KINDS) {
      const piece = drawScenery(kind);
      const [, y, , h] = piece.viewBox;
      // Its foot at y = 0, with room for its outline (a shelf's brackets hang below it).
      expect(y + h).toBeGreaterThanOrEqual(0);
      if (!(HANGING as readonly string[]).includes(kind))
        expect([kind, y + h]).toEqual([kind, 4]);
      expect(piece.svg).toContain(`stroke="${FIGURE_INK}"`);
      const report = styleReport(piece.svg, 1);
      expect(report.gradients + report.patterns + report.filters).toBe(0);
      expect(report.inked).toBe(report.outlines);
      if ((HANGING as readonly string[]).includes(kind))
        expect(piece.hangs).toBeGreaterThan(0);
      if ((FLAT as readonly string[]).includes(kind))
        expect(piece.flat).toBe(true);
    }
  });

  it('draws a piece in its own colour when it has one', () => {
    expect(drawScenery('wardrobe', '#123456').svg).toContain('#123456');
    expect(drawScenery('wardrobe').svg).not.toContain('#123456');
  });
});

describe('a place built from its layout', () => {
  it('builds every backdrop and every ground out of doors, clean and in the house style, its ground read from its own group', async () => {
    for (const [k, backdrop] of SET_BACKDROPS.entries()) {
      const layout: SetLayout = {
        ...plainLayout(place()),
        backdrop,
        ground: SET_GROUNDS[k % SET_GROUNDS.length],
        sky: (['day', 'dusk', 'night', 'dawn'] as const)[k % 4],
      };
      const { checks, ground } = await built(layout, place());
      expect(failing(checks)).toEqual([]);
      expect(ground?.source).toBe('group');
      expect(checks.style.report.line).toBe(2.6);
    }
  });

  it('builds a room: walls, a floor of its own, what hangs on the wall and what lies on the floor', async () => {
    for (const ground of ['wood', 'tiles', 'carpet'] as const) {
      const room = place({ kind: 'indoor', name: 'the bedroom' });
      const layout = layoutOf(
        {
          ground,
          walls: 'cream',
          items: [
            { kind: 'bed', x: 0.2, row: 'back', scale: 1, colour: null },
            { kind: 'curtains', x: 0.5, row: 'back', scale: 1, colour: 'red' },
            { kind: 'clock', x: 0.5, row: 'back', scale: 1, colour: null },
            { kind: 'rug', x: 0.5, row: 'front', scale: 1, colour: 'pink' },
            { kind: 'wardrobe', x: 0.85, row: 'back', scale: 1, colour: null },
          ],
        },
        room,
      );
      const { checks, ground: read, set } = await built(layout, room);
      expect(failing(checks)).toEqual([]);
      expect(read?.source).toBe('group');
      // The floor meets the back wall where a room's brief says.
      expect(read!.horizon).toBeGreaterThanOrEqual(0.55);
      expect(read!.horizon).toBeLessThanOrEqual(0.82);
      // The rug is floor: inside the ground group.
      const groundGroup =
        /<g id="ground">([\s\S]*?)<\/g><g/.exec(set.svg)?.[1] ?? '';
      expect(groundGroup).toContain(CLOTH.pink);
    }
  });

  it('builds a vessel from inside from its template: what goes by outside as its own group, its seats, and never the street', async () => {
    for (const vessel of SET_VESSELS) {
      const inside = place({ kind: 'vessel', name: `the ${vessel}`, look: '' });
      const layout = layoutOf({ vessel, items: [] }, inside);
      const { checks, set, drawing } = await built(layout, inside);
      expect(failing(checks)).toEqual([]);
      expect(set.parts.outside).toBe('outside');
      expect(drawing.parts.outside).toBeTruthy();
      // What goes by is first, behind the rest, across the whole width.
      expect(set.svg.indexOf('<g id="outside">')).toBeLessThan(
        set.svg.indexOf('<g id="ground">'),
      );
    }
  });

  it('keeps the middle of the ground open and frames it only at the sides', async () => {
    const layout = layoutOf(
      {
        items: [
          { kind: 'tree', x: 0.5, row: 'front', scale: 1, colour: null },
          { kind: 'tree', x: 0.45, row: 'front', scale: 1, colour: null },
          { kind: 'tree', x: 0.55, row: 'front', scale: 1, colour: null },
          { kind: 'tree', x: 0.5, row: 'middle', scale: 1, colour: null },
        ],
      },
      place(),
    );
    const { set, checks } = await built(layout, place());
    expect(failing(checks)).toEqual([]);
    const at = [
      ...set.svg.matchAll(
        /transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)/g,
      ),
    ].map((m) => ({ x: Number(m[1]) / SET_W, y: Number(m[2]) / SET_H }));
    // A tree frames each side at its very edge; a third in front goes back.
    const front = at.filter((one) => one.y > 0.88);
    expect(front.map((one) => one.x).sort()).toEqual([0.06, 0.94]);
    // No tree stands in the middle of the open ground.
    for (const one of at.filter((p) => p.y > FLOOR_LINE.outdoor / SET_H + 0.1))
      expect(one.x < 0.3 || one.x > 0.7).toBe(true);
  });

  it('draws the features it paints as their own groups, where they stand, and keeps clear of those the stage draws', async () => {
    const market = place({
      look: 'a market with an old well',
      features: [
        { id: 'well', name: 'well', kind: 'well', spot: 'right' },
        { id: 'gate', name: 'gate', kind: 'gate', spot: 'left' },
      ],
    });
    const layout = layoutOf(
      {
        items: [
          { kind: 'stall', x: 0.12, row: 'middle', scale: 1, colour: 'blue' },
          { kind: 'basket', x: 0.4, row: 'middle', scale: 1, colour: null },
        ],
      },
      market,
    );
    const { set, ground, checks } = await built(layout, market);
    expect(failing(checks)).toEqual([]);
    expect(set.parts['f-well']).toBe('f-well');
    expect(set.parts['f-gate']).toBeUndefined();
    // Measured where it stands: at the right.
    const box = ground?.boxes?.['f-well'];
    expect(box).toBeDefined();
    expect((box![0] + box![2]) / 2).toBeGreaterThan(0.75);
    // What someone could stand behind, together.
    expect(set.parts.props).toBe('props');
    expect(ground?.behind).toBeDefined();
    // The stall asked for by the gate stands back, out of its way.
    expect(set.svg).toContain(CLOTH.blue);
  });

  it('stands a boat’s side before the people’s legs where they are in it', async () => {
    const canoe = place({
      kind: 'vessel',
      name: 'the canoe',
      look: 'a canoe on the river',
      stand: 'in',
      front: "the canoe's side",
    });
    const { set, drawing, checks } = await built(
      layoutOf({ vessel: 'boat' }, canoe),
      canoe,
    );
    expect(failing(checks)).toEqual([]);
    expect(set.parts.front).toBe('front');
    expect(drawing.parts.front).toBeTruthy();
  });

  it('tags what answers the world for the stage: plants, things that hang, curtains, flags, places birds sit, and the ground', () => {
    const park = buildSet(
      layoutOf(
        {
          ground: 'grass',
          items: [
            { kind: 'bush', x: 0.2, row: 'middle', scale: 1, colour: null },
            { kind: 'house', x: 0.8, row: 'back', scale: 1, colour: null },
            { kind: 'lamp', x: 0.7, row: 'middle', scale: 1, colour: null },
            { kind: 'palm', x: 0.06, row: 'front', scale: 1, colour: null },
          ],
        },
        place(),
      ),
      place(),
    ).svg;
    expect(park).toMatch(
      /^<svg [^>]*data-place="outdoor" data-ground="grass" data-floor="576"/,
    );
    expect(park).toMatch(
      /data-react="sway" data-kind="bush" data-x="0\.2" data-row="(?:middle|back)" data-len="92" data-roost="0 -92"/,
    );
    expect(park).toMatch(
      /data-kind="house" data-x="[\d.]+" data-row="back" data-roost="/,
    );
    expect(park).toMatch(/data-react="hang" data-kind="lamp"/);
    // A palm's fronds turn at the top of its trunk; grass tufts at their roots.
    expect(park).toMatch(
      /data-kind="palm"[^>]*>[\s\S]*?<g data-seg="0" data-pivot="28 -420">/,
    );
    expect(park).toMatch(
      /<g data-react="sway" data-kind="grass" data-x="[\d.]+" data-row="\w+" data-len="[\d.]+" data-pivot="[\d.]+ [\d.]+">/,
    );
    const room = place({ kind: 'indoor', name: 'the room' });
    const indoors = buildSet(
      layoutOf(
        {
          ground: 'wood',
          items: [
            { kind: 'curtains', x: 0.5, row: 'back', scale: 1, colour: null },
            { kind: 'bunting', x: 0.3, row: 'back', scale: 1, colour: null },
            { kind: 'bookshelf', x: 0.9, row: 'back', scale: 1, colour: null },
          ],
        },
        room,
      ),
      room,
    ).svg;
    expect(indoors).toMatch(
      /data-react="curtain" data-kind="curtains" data-x="0\.5\d*" data-row="wall"/,
    );
    expect((indoors.match(/data-seg="\d+"/g) ?? []).length).toBe(2 + 9);
    // What neither moves nor is sat on is as it was.
    expect(indoors).not.toMatch(/data-kind="bookshelf"/);
  });

  it('builds the same place the same way every time', () => {
    const layout = plainLayout(place());
    expect(buildSet(layout, place()).svg).toBe(buildSet(layout, place()).svg);
    expect(buildSet(layout, place()).svg).toContain(SET_COLOURS.grass);
  });
});
