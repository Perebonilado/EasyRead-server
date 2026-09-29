import {
  PACK_VEHICLES,
  VEHICLE_KIT,
  VEHICLE_VIEWS,
  drawVehicleKit,
  packVehicles,
  vehicleColour,
  vehicleKitKindOf,
  vehicleLiveryOf,
  wheelFeet,
  type VehicleKitKind,
} from './scene-vehicles';
import { drawPiece, setLiveryOf, vehicleKindOf } from './scene-set-pieces';
import { drawScenery } from './scene-set-scenery';
import { KIT_M } from './scene-set-draw';
import { STYLE_PACK_IDS } from './scene-style-packs';
import { buildSet, layoutOf } from './scene-set-layout';

const WHEELED: VehicleKitKind[] = VEHICLE_KIT.filter(
  (kind) => kind !== 'rowing-boat' && kind !== 'canoe',
);
const DOORS: Record<string, 'hinge' | 'slide'> = {
  car: 'hinge',
  taxi: 'hinge',
  truck: 'hinge',
  van: 'slide',
  danfo: 'slide',
  bus: 'slide',
};

describe('the vehicle kit', () => {
  it('draws every kind from every side, the same each time', () => {
    for (const kind of VEHICLE_KIT)
      for (const view of VEHICLE_VIEWS)
        for (const facing of [1, -1] as const) {
          const a = drawVehicleKit(kind, { view, facing, pack: 'modern-town' });
          const b = drawVehicleKit(kind, { view, facing, pack: 'modern-town' });
          expect(a).toEqual(b);
          expect(a.svg).toContain(`data-vehicle="${kind}"`);
          expect(a.svg).toContain(`data-view="${view}"`);
          expect(a.svg).not.toMatch(/NaN|Infinity|undefined/u);
          const [, , w, h] = a.viewBox;
          expect(w).toBeGreaterThan(20);
          expect(h).toBeGreaterThan(20);
        }
  });

  it('is rigged: its body on its springs, what is seen through the glass, what is laid over a rider, its lights for night', () => {
    for (const kind of VEHICLE_KIT) {
      const { svg, affordances, vehicle } = drawVehicleKit(kind);
      expect(svg).toContain('<g id="bob">');
      expect(svg).toContain('<g id="cabin">');
      expect(svg).toContain('<g id="body-front">');
      for (const mask of affordances.masks ?? [])
        expect(svg).toContain(`<g id="${mask.group}">`);
      expect(affordances.masks?.[0]).toEqual({
        id: 'body-front',
        group: 'body-front',
      });
      expect(vehicle.kind).toBe(kind);
      expect(vehicle.view).toBe('side');
      expect(vehicle.facing).toBe(1);
      expect(vehicle.bobEvery).toBeGreaterThan(0);
    }
    // Glass where there are windows, one inside seen through it.
    for (const kind of [
      'car',
      'taxi',
      'van',
      'truck',
      'bus',
      'danfo',
    ] as const) {
      const drawn = drawVehicleKit(kind);
      expect(drawn.svg).toContain('<g id="window">');
      expect(drawn.affordances.masks).toContainEqual({
        id: 'window',
        group: 'window',
      });
      // Its headlights hidden until night.
      expect(drawn.svg).toContain('<g id="lights" opacity="0">');
    }
    expect(drawVehicleKit('canoe').vehicle.water).toBe(true);
    expect(drawVehicleKit('car').vehicle.water).toBeUndefined();
  });

  it('offers seats, grips and a way on, for every kind', () => {
    for (const kind of VEHICLE_KIT) {
      const { affordances } = drawVehicleKit(kind);
      expect(affordances.mount).toBeDefined();
      const pushed = kind === 'handcart' || kind === 'wheelbarrow';
      if (pushed) {
        // Pushed by its two handles, from behind.
        expect(affordances.grips?.map((g) => g.id)).toEqual([
          'handle-near',
          'handle-far',
        ]);
        expect(affordances.mount!.side).toBe(-1);
        continue;
      }
      const seats = affordances.seats ?? [];
      expect(seats.length).toBeGreaterThan(0);
      for (const seat of seats) {
        expect(seat.feet.length).toBeGreaterThan(0);
        // Hips above the feet.
        expect(seat.hip[1]).toBeLessThan(
          Math.min(...seat.feet.map((f) => f[1])),
        );
      }
      // The one who steers has their hands on what steers it.
      const steers = seats[0];
      expect(steers.hands?.length ?? 0).toBeGreaterThan(0);
      expect(affordances.grips?.length ?? 0).toBeGreaterThan(0);
    }
    const seatIds = (kind: VehicleKitKind) =>
      (drawVehicleKit(kind).affordances.seats ?? []).map((s) => s.id);
    expect(seatIds('car')).toEqual(['driver', 'passenger', 'back']);
    expect(seatIds('motorbike')).toEqual(['rider', 'pillion']);
    expect(seatIds('bicycle')).toEqual(['rider']);
    expect(seatIds('rowing-boat')).toEqual(['rower', 'passenger']);
    expect(drawVehicleKit('car').affordances.seats![0].pose).toBe('drive');
    expect(drawVehicleKit('bicycle').affordances.seats![0].pose).toBe('ride');
    expect(drawVehicleKit('chariot').affordances.seats![0].pose).toBe('stand');
    expect(drawVehicleKit('canoe').affordances.seats![0].pose).toBe('row');
    // A bicycle's pedals, turning once for its gear's turns of the wheels.
    const pedals = drawVehicleKit('bicycle').affordances.pedals!;
    expect(pedals.radius).toBeCloseTo(0.17 * KIT_M, 0);
    expect(pedals.gear).toBeGreaterThan(2);
    // And the carts and the chariot say what draws them.
    expect(
      drawVehicleKit('animal-cart', { name: 'the donkey cart' }).draws,
    ).toBe('donkey');
    expect(
      drawVehicleKit('animal-cart', { name: 'the horse cart' }).draws,
    ).toBe('horse');
    expect(drawVehicleKit('chariot').draws).toBe('horse');
  });

  it('turns its wheels where they show: each a rigged group, its middle and radius as offered', () => {
    for (const kind of WHEELED) {
      const { svg, affordances } = drawVehicleKit(kind);
      const rigged = [
        ...svg.matchAll(
          /data-wheel="([-\d.]+) ([-\d.]+) ([-\d.]+)" data-spin="([-\d.]+)" id="wheel-\d+"/gu,
        ),
      ];
      expect(rigged.length).toBe(affordances.wheels?.length);
      expect(rigged.length).toBeGreaterThan(0);
      // Seen from the side, they turn one way; mirrored, the other.
      for (const one of rigged) expect(Number(one[4])).toBe(1);
      const mirrored = drawVehicleKit(kind, { facing: -1 }).svg;
      expect(mirrored).toMatch(/data-spin="-1"/u);
      // Seen end on, nothing turns.
      expect(drawVehicleKit(kind, { view: 'front' }).svg).not.toContain(
        'data-wheel',
      );
    }
    // A bicycle's crank turns with its wheels, slower by its gear.
    const bike = drawVehicleKit('bicycle');
    const crank =
      /data-wheel="[-\d.]+ [-\d.]+ ([-\d.]+)"[^>]*id="crank-near"/u.exec(
        bike.svg,
      );
    expect(Number(crank?.[1])).toBeCloseTo(0.34 * KIT_M * 2.6, 0);
  });

  it('stands its wheels on the ground: from the side on y = 0, from any side the nearest on it', () => {
    for (const kind of WHEELED) {
      const side = drawVehicleKit(kind);
      for (const foot of wheelFeet(side))
        expect(Math.abs(foot)).toBeLessThanOrEqual(1);
      const q = drawVehicleKit(kind, { view: '3q' });
      const feet = wheelFeet(q);
      expect(Math.max(...feet)).toBeGreaterThan(-8);
      expect(Math.max(...feet)).toBeLessThanOrEqual(1.5);
      // The frame's foot is the ground's, with room for the outline.
      const [, vy, , vh] = side.viewBox;
      expect(vy + vh).toBeCloseTo(4, 0);
    }
    // A boat sits in the water: its keel below the line.
    const [, vy, , vh] = drawVehicleKit('rowing-boat').viewBox;
    expect(vy + vh).toBeGreaterThan(20);
  });

  it('is drawn at its real size, beside a grown-up 224 tall (1.7 m)', () => {
    const real: Record<VehicleKitKind, [number, number]> = {
      bicycle: [1.6, 1.9],
      motorbike: [1.8, 2.2],
      car: [3.8, 4.8],
      taxi: [3.8, 4.8],
      van: [4.6, 5.6],
      truck: [6.5, 9],
      bus: [9.5, 12.5],
      danfo: [4.2, 5],
      handcart: [1.5, 2.2],
      'animal-cart': [2.8, 4],
      wheelbarrow: [1.3, 1.7],
      'rowing-boat': [3, 4.2],
      canoe: [4.5, 6],
      chariot: [2.4, 3.2],
    };
    for (const kind of VEHICLE_KIT) {
      const drawn = drawVehicleKit(kind);
      const [lo, hi] = real[kind];
      expect(drawn.size.long).toBeGreaterThanOrEqual(lo);
      expect(drawn.size.long).toBeLessThanOrEqual(hi);
      // Its drawing as long as it is, with its lights' and its shafts' reach.
      const drawnLong = drawn.viewBox[2] / KIT_M;
      expect(drawnLong).toBeGreaterThan(drawn.size.long * 0.9);
      expect(drawnLong).toBeLessThan(drawn.size.long * 1.35);
    }
    // A car's roof about a grown-up's shoulder; a bus's over their head.
    expect(drawVehicleKit('car').viewBox[3]).toBeLessThan(224);
    expect(drawVehicleKit('bus').viewBox[3]).toBeGreaterThan(224 * 1.6);
    // A London bus has two decks.
    expect(
      drawVehicleKit('bus', { livery: 'london' }).size.high,
    ).toBeGreaterThan(4);
  });

  it('opens its door by its leaf: hinged at its front edge, or sliding back along its side', () => {
    for (const [kind, how] of Object.entries(DOORS)) {
      const drawn = drawVehicleKit(kind as VehicleKitKind);
      expect(drawn.svg).toContain('<g id="leaf">');
      const [x0, y0, x1, y1] = drawn.opening!;
      expect(y1 - y0).toBeGreaterThan(100);
      const { hinge, slide } = drawn.leaf!;
      if (how === 'hinge') {
        expect(slide).toBeUndefined();
        expect(hinge[0]).toBeCloseTo(x1, -1);
      } else {
        expect(slide).toBeLessThan(-100);
        expect(hinge[0]).toBeCloseTo(x0, -1);
      }
      // Its handle on the door, one stands by it to open it.
      const handle = drawn.affordances.handles?.find((h) => h.side === 'out');
      expect(handle!.at[0]).toBeGreaterThanOrEqual(x0);
      expect(handle!.at[0]).toBeLessThanOrEqual(x1);
      // Mirrored, the door is on the other side and slides the other way.
      const back = drawVehicleKit(kind as VehicleKitKind, { facing: -1 });
      expect(back.leaf!.hinge[0]).toBeCloseTo(-hinge[0], 0);
      if (slide !== undefined) expect(back.leaf!.slide).toBeCloseTo(-slide, 0);
      // The leaf is drawn over what is laid over a rider: the door hides their legs.
      const front = drawn.svg.indexOf('<g id="body-front">');
      expect(drawn.svg.indexOf('<g id="leaf">')).toBeGreaterThan(front);
      // Seen from the front, there is no door.
      expect(
        drawVehicleKit(kind as VehicleKitKind, { view: 'front' }).leaf,
      ).toBeUndefined();
    }
    for (const kind of ['bicycle', 'motorbike', 'canoe', 'handcart'] as const)
      expect(drawVehicleKit(kind).leaf).toBeUndefined();
  });

  it('draws a scenery vehicle plain: no ids to clash in a set, no rig, still marked for what it is', () => {
    const plain = drawVehicleKit('danfo', { plain: true });
    expect(plain.svg).not.toMatch(/ id="/u);
    expect(plain.svg).not.toContain('data-wheel');
    expect(plain.svg).not.toContain('lights');
    expect(plain.svg).toContain('<g data-vehicle="danfo">');
    for (const kind of [
      'parked car',
      'taxi',
      'bus',
      'danfo',
      'motorbike',
      'bicycle',
    ] as const) {
      const piece = drawScenery(kind);
      expect(piece.svg).toMatch(/data-vehicle="[a-z-]+"/u);
      expect(piece.svg).not.toMatch(/ id="/u);
    }
  });
});

describe('a vehicle’s kind and colours', () => {
  it('is what its name says', () => {
    const names: [string, VehicleKitKind][] = [
      ['the bicycle', 'bicycle'],
      ['his bike', 'bicycle'],
      ['an okada', 'motorbike'],
      ['the motorcycle', 'motorbike'],
      ['the donkey cart', 'animal-cart'],
      ['a wagon', 'animal-cart'],
      ['the handcart', 'handcart'],
      ['the cart', 'handcart'],
      ['a wheelbarrow', 'wheelbarrow'],
      ['the rowing boat', 'rowing-boat'],
      ['the fishing boat', 'rowing-boat'],
      ['a canoe', 'canoe'],
      ['Pharaoh’s chariot', 'chariot'],
      ['the black cab', 'taxi'],
      ['the lorry', 'truck'],
      ['the van', 'van'],
      ['the red bus', 'bus'],
      ['the car', 'car'],
    ];
    for (const [name, kind] of names) {
      expect(vehicleKitKindOf(name)).toBe(kind);
      expect(vehicleKindOf(name)).toBe(kind);
    }
  });

  it('with no name, is its place’s own: a car in a town, a cart in an ancient place', () => {
    expect(vehicleKitKindOf('the vehicle', 'modern-town')).toBe('car');
    expect(vehicleKitKindOf('the vehicle', 'ancient-near-east')).toBe(
      'animal-cart',
    );
    expect(vehicleKitKindOf('the vehicle', 'biblical-village')).toBe(
      'animal-cart',
    );
    expect(vehicleKitKindOf('the vehicle')).toBe('car');
    // Ancient places have no engines; a present-day town no chariots.
    for (const pack of ['ancient-near-east', 'biblical-village'] as const)
      for (const kind of [
        'car',
        'taxi',
        'van',
        'truck',
        'bus',
        'danfo',
        'motorbike',
        'bicycle',
      ] as const)
        expect(packVehicles(pack)).not.toContain(kind);
    expect(packVehicles('modern-town')).not.toContain('chariot');
    // The stage's vehicle feature is drawn as its place has it.
    expect(
      drawPiece('vehicle', 'the cart', { pack: 'biblical-village' }).svg,
    ).toContain('data-vehicle="handcart"');
    expect(
      drawPiece('vehicle', 'the wagon', { pack: 'biblical-village' }).vehicle
        ?.kind,
    ).toBe('animal-cart');
  });

  it('is a danfo only in a West African town, or where the story names one', () => {
    for (const pack of STYLE_PACK_IDS) {
      const west = pack === 'west-african-town';
      expect(vehicleKitKindOf('the bus', pack)).toBe(west ? 'danfo' : 'bus');
      expect(packVehicles(pack).includes('danfo')).toBe(west);
      expect(vehicleKitKindOf('the danfo', pack)).toBe('danfo');
      expect(vehicleKitKindOf('the vehicle', pack)).not.toBe('danfo');
    }
    expect(vehicleKitKindOf('the bus')).toBe('bus');
  });

  it('takes its colour from its name, else its place: a town’s plain cars, a danfo’s yellow, London’s red bus and black cab', () => {
    expect(vehicleColour('bus', { name: 'the green bus' })).toBe('#6dbf73');
    expect(vehicleColour('car', { colour: '#123456' })).toBe('#123456');
    expect(vehicleColour('danfo', { pack: 'modern-town' })).toBe('#f2c14e');
    for (const name of ['the car', 'Mum’s car', 'a car'])
      expect(PACK_VEHICLES['modern-town'].bodies).toContain(
        vehicleColour('car', { pack: 'modern-town', name }),
      );
    expect(vehicleColour('bus', { livery: 'london' })).toBe('#d9534f');
    expect(vehicleColour('taxi', { livery: 'london' })).toBe('#3a3740');
    expect(vehicleColour('taxi', { livery: 'new-york' })).toBe('#f4c95d');
    expect(vehicleColour('taxi', { pack: 'modern-town' })).toBe('#f5f5f2');
    // Carts, boats and chariots in their place's wood.
    expect(vehicleColour('chariot', { pack: 'ancient-near-east' })).toBe(
      PACK_VEHICLES['ancient-near-east'].wood,
    );
  });

  it('knows a named city only from the story’s words, and keeps it on the set', () => {
    expect(vehicleLiveryOf('a rainy day in London')).toBe('london');
    expect(vehicleLiveryOf('Manhattan, 1990')).toBe('new-york');
    expect(vehicleLiveryOf('a big city')).toBeNull();
    const place = {
      name: 'the high street',
      look: 'shops and a bus stop',
      kind: 'outdoor' as const,
    };
    const london = layoutOf({ style: 'western-city' }, place, {
      era: 'today',
      region: 'London',
    } as never);
    expect(london.livery).toBe('london');
    const built = buildSet(london, { ...place, features: [] } as never);
    expect(setLiveryOf(built)).toBe('london');
    const anywhere = layoutOf({ style: 'modern-town' }, place, {
      era: 'today',
      region: 'a town',
    } as never);
    expect(anywhere.livery).toBeUndefined();
  });
});

describe('a thing moving through the set', () => {
  it('keeps a vehicle on the ground as it goes, and leaves what flies', () => {
    const { groundMoves } =
      jest.requireActual<typeof import('./scene-grounding')>(
        './scene-grounding',
      );
    const { moves, notes } = groundMoves(
      [
        [0, 'car', [-900, 0], [0, -30], 2000, 'out'],
        [500, 'kite', [0, 0], [200, -300], 1500, 'linear'],
      ],
      (id) => id !== 'kite',
    );
    expect(moves[0]).toEqual([0, 'car', [-900, 0], [0, 0], 2000, 'out']);
    expect(moves[1][3]).toEqual([200, -300]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^staging: floating car/u);
  });
});
