/**
 * A global product (the regional audit, 2026-09-29): nothing of one region
 * is anyone's by default. A story that says nowhere is drawn nowhere in
 * particular; a region's own look (a West African town's danfos, okadas,
 * zinc roofs and compound gates) comes only from the story's own words.
 */
import { buildSet, layoutOf, layoutBrief } from './scene-set-layout';
import {
  VEHICLE_KINDS,
  drawPiece,
  setPackOf,
  vehicleKindOf,
} from './scene-set-pieces';
import { packOfWorld, packScores, plainPack } from './scene-style-packs';
import type { StoryPlace, StoryWorld } from './scene-story';
import { SET_BENCH } from './set-bench';
import { bibleOf } from './studio/studio';

const place = (name: string, look: string): StoryPlace => ({
  id: name.replace(/\W+/g, '-'),
  name,
  aliases: [],
  look,
  firstPage: 1,
  sound: null,
  kind: 'outdoor',
  stand: 'on',
  front: null,
  features: [],
});

const world = (patch: Partial<StoryWorld>): StoryWorld => ({
  era: '',
  region: '',
  culture: '',
  landscape: '',
  homes: '',
  ...patch,
});

/** The danfo's own body, as the stage has always drawn it. */
const DANFO_BODY = 'M-236,-34 L-236,-168';

describe('a story with no setting', () => {
  const street = place('the street', 'a street with a few shops');
  // A painter that reaches for one region's look regardless.
  const asked = {
    style: 'west-african-town',
    ground: 'road',
    backdrop: 'rooftops',
    items: [
      { kind: 'house', x: 0.3, row: 'back', scale: 1, colour: null },
      { kind: 'danfo', x: 0.7, row: 'back', scale: 1, colour: null },
    ],
    own: [],
    clutter: ['poles', 'okada', 'generator', 'water drum', 'bin', 'bicycle'],
  };

  it('is drawn in a plain modern town, never West African by default', () => {
    const layout = layoutOf(asked, street, null);
    expect(layout.style).toBe('modern-town');
    expect(layout.backdrop).not.toBe('rooftops');
    expect(layout.items.map((one) => one.kind)).toEqual(['house', 'bus']);
    // Its clutter only what a town anywhere has.
    expect(layout.clutter).toEqual(['bin', 'bicycle']);
    for (const one of ['motorbike', 'okada', 'generator', 'water drum'])
      expect(layout.clutter).not.toContain(one);
  });

  it('is offered only the packs of no one region to choose from', () => {
    const brief = layoutBrief(street, 'Book', null);
    expect(brief).toContain('"modern-town"');
    expect(brief).not.toMatch(/west-african|Lagos|danfo|okada/iu);
  });

  it('gets no danfo, as a road vehicle or a bus, and no compound gate', () => {
    const built = buildSet(layoutOf(asked, street, null), {
      ...street,
      features: [
        { id: 'bus', name: 'the bus', kind: 'vehicle', spot: 'right' },
        { id: 'gate', name: 'the gate', kind: 'gate', spot: 'left' },
      ],
    });
    expect(built.svg).not.toContain(DANFO_BODY);
    expect(setPackOf(built)).toBe('modern-town');
    expect(drawPiece('vehicle', 'the bus').svg).not.toContain(DANFO_BODY);
    expect(vehicleKindOf('the bus')).toBe('bus');
    expect(vehicleKindOf('the minibus', 'modern-town')).toBe('bus');
    // The compound's metal gate is a West African town's alone.
    const compound = drawPiece('gate', '', { pack: 'west-african-town' });
    expect(drawPiece('gate').svg).not.toBe(compound.svg);
    expect(drawPiece('gate', '', { pack: 'modern-town' }).svg).not.toBe(
      compound.svg,
    );
  });

  it('draws the town park of the set bench as a town anywhere', () => {
    const park = SET_BENCH.find((one) => one.id === 'town-park')!;
    const layout = layoutOf(park.layout, park.place, park.world);
    expect(layout.style).toBe('modern-town');
    expect(layout.clutter).toEqual(['bin', 'bicycle']);
  });

  it('chooses the plainest pack that fits the place’s own words', () => {
    expect(plainPack(null, 'the kitchen')).toBe('modern-town');
    expect(plainPack(null, 'a forest clearing')).toBe('nature');
    expect(plainPack(null, 'the village square')).toBe('village-farm');
    expect(plainPack(world({ era: 'ancient Rome' }), 'the square')).toBe(
      'nature',
    );
  });
});

describe('a road vehicle', () => {
  it('is drawn as its name says: a car in a western city is a car', () => {
    expect(vehicleKindOf('the car', 'western-city')).toBe('car');
    const car = drawPiece('vehicle', 'the car', { pack: 'western-city' });
    expect(car.svg).not.toContain(DANFO_BODY);
    // Its door swings about its front edge.
    expect(car.leaf?.slide).toBeUndefined();
    expect(car.opening).toBeDefined();
  });

  it('is still a danfo when its name says so, or as a West African town’s bus', () => {
    const danfo = drawPiece('vehicle', 'the danfo');
    expect(danfo.svg).toContain(DANFO_BODY);
    expect(danfo.svg).toContain('#f2c14e');
    expect(danfo.leaf).toEqual({ id: 'leaf', hinge: [4, -112], slide: -100 });
    expect(danfo.opening).toEqual([4, -190, 112, -34]);
    expect(vehicleKindOf('the bus', 'west-african-town')).toBe('danfo');
    expect(vehicleKindOf('the car', 'west-african-town')).toBe('car');
  });

  it('opens and is gone through, whatever it is', () => {
    const names: Record<(typeof VEHICLE_KINDS)[number], string> = {
      car: 'the car',
      taxi: 'the taxi',
      van: 'the van',
      truck: 'the lorry',
      bus: 'the bus',
      danfo: 'the danfo',
    };
    for (const kind of VEHICLE_KINDS) {
      expect(vehicleKindOf(names[kind])).toBe(kind);
      const piece = drawPiece('vehicle', names[kind]);
      expect(piece.leaf?.id).toBe('leaf');
      expect(piece.svg).toContain('<g id="leaf">');
      const [x0, y0, x1, y1] = piece.opening!;
      expect(x1).toBeGreaterThan(x0);
      expect(y1).toBeGreaterThan(y0);
      // The way in is a grown-up's height, at least most of it.
      expect(y1 - y0).toBeGreaterThan(100);
    }
  });

  it('takes its colour from its name, else its place’s', () => {
    expect(drawPiece('vehicle', 'the red bus').svg).toContain('#d9534f');
    const green = drawPiece('vehicle', 'the bus', { colour: '#6dbf73' });
    expect(green.svg).toContain('#6dbf73');
  });
});

describe('the style pack classifier', () => {
  it('ignores “compound” and “Africa”: only named West African places say it', () => {
    expect(packScores('a family compound in Africa')['west-african-town']).toBe(
      0,
    );
    expect(
      packOfWorld(world({ region: 'Africa', homes: 'a compound' })),
    ).not.toBe('west-african-town');
    expect(packOfWorld(world({ region: 'Accra, Ghana' }))).toBe(
      'west-african-town',
    );
  });
});

describe('someone no one described', () => {
  it('is drawn in skins, hair and tops that vary by who they are', () => {
    const names = [
      'Ana',
      'Ben',
      'Chen',
      'Dayo',
      'Elif',
      'Farah',
      'Gus',
      'Hana',
    ];
    const bible = bibleOf({
      characters: names.map((name) => ({ name, voice: 'man' })),
      sets: [{ name: 'Home' }],
    });
    const figures = bible.characters.map((c) => c.figure!);
    expect(new Set(figures.map((f) => f.skin)).size).toBeGreaterThan(2);
    expect(new Set(figures.map((f) => f.topColour)).size).toBeGreaterThan(2);
    expect(new Set(figures.map((f) => f.hair)).size).toBeGreaterThan(1);
    // The same person is the same every time.
    const again = bibleOf({
      characters: names.map((name) => ({ name, voice: 'man' })),
      sets: [{ name: 'Home' }],
    });
    expect(again.characters.map((c) => c.figure)).toEqual(figures);
    // A skin the writer did say is kept.
    const said = bibleOf({
      characters: [{ name: 'Ana', voice: 'woman', figure: { skin: 7 } }],
      sets: [{ name: 'Home' }],
    });
    expect(said.characters[0].figure?.skin).toBe(7);
  });
});
