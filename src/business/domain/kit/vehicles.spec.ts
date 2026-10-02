/**
 * Vehicles: each is sound in both shapes and both ways round; every wheel
 * turns about its hub with its radius as its value; each says how it goes;
 * a ship trails its wake and a rocket its flame; an era draws its own
 * car, bus, lorry and engine; sizes are real, so a bus is a bus beside a
 * person.
 */
import type { ShotLookDto } from '../../../contracts';
import { KIT, makeKit, paramsOf } from './registry';
import { UNITS_PER_METRE, validateRig } from './rig';
import { kitStyle } from './style';

const LOOK: ShotLookDto = {
  palette: {
    paper: '#F4EFE6',
    ink: '#1D232B',
    muted: '#646B76',
    accent: '#D9480F',
    sides: { North: '#0050BE' },
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};
const style = kitStyle(LOOK);
const make = (id: string, params: Record<string, unknown> = {}, seed = 1) => {
  const made = makeKit(id, params, style, seed, 'North');
  if (!made)
    throw new Error(
      `${id}: ${validateRig(KIT[id].make({ ...paramsOf(id, params), colour: 'North' }, style, seed)).join('; ')}`,
    );
  return made.piece;
};

const VEHICLES = Object.keys(KIT).filter((id) => id.startsWith('vehicle.'));

describe('vehicles', () => {
  it('has the brief’s kinds', () => {
    expect(VEHICLES.sort()).toEqual(
      [
        'vehicle.bus',
        'vehicle.car',
        'vehicle.cart',
        'vehicle.lorry',
        'vehicle.plane',
        'vehicle.rocket',
        'vehicle.ship',
        'vehicle.train',
      ].sort(),
    );
  });

  it.each(VEHICLES)(
    '%s is sound facing either way, and says how it goes',
    (id) => {
      for (const facing of ['right', 'left'])
        for (const seed of [1, 2]) {
          const piece = make(id, { facing }, seed);
          expect(validateRig(piece)).toEqual([]);
          expect(piece.rig.vehicle?.facing).toBe(facing === 'left' ? -1 : 1);
          expect(piece.rig.moves).toEqual(
            expect.arrayContaining(['enter', 'travel-to', 'stop', 'leave']),
          );
          expect(piece.parts.body).toBeDefined();
        }
    },
  );

  it('turns each wheel about its hub, its radius its value', () => {
    for (const id of [
      'vehicle.car',
      'vehicle.bus',
      'vehicle.lorry',
      'vehicle.train',
      'vehicle.cart',
    ]) {
      const piece = make(id);
      const wheels = Object.entries(piece.parts).filter(([k]) =>
        /^wheel-\d+$/.test(k),
      );
      expect(wheels.length).toBeGreaterThan(0);
      for (const [, wheel] of wheels) {
        expect(wheel.value).toBeGreaterThan(0);
        expect(wheel.pivot).toEqual([0.5, 0.5]);
        // Round: as wide as it is tall, twice its radius.
        expect(wheel.box[2]).toBeCloseTo(2 * wheel.value!, 0);
        // On the ground: its bottom on the piece's.
        expect(Math.abs(wheel.box[1] + wheel.box[3])).toBeLessThan(2);
      }
    }
  });

  it('marks where smoke rises, a ship’s wake and a rocket’s flame', () => {
    expect(make('vehicle.train', { kind: 'steam' }).parts.smoke).toBeDefined();
    expect(make('vehicle.ship', { kind: 'steam' }).parts.smoke).toBeDefined();
    expect(make('vehicle.ship').parts.wake).toBeDefined();
    expect(make('vehicle.rocket').parts.flame).toBeDefined();
    expect(make('vehicle.rocket').rig.vehicle?.goes).toBe('up');
    expect(make('vehicle.ship').rig.vehicle?.goes).toBe('water');
    expect(make('vehicle.plane').rig.vehicle?.goes).toBe('air');
    expect(make('vehicle.train').rig.vehicle?.goes).toBe('rail');
  });

  it('draws each era its own', () => {
    for (const id of [
      'vehicle.car',
      'vehicle.bus',
      'vehicle.lorry',
      'vehicle.train',
      'vehicle.ship',
      'vehicle.plane',
    ]) {
      const old = make(id, { era: '1900-1945' }).svg;
      expect(make(id, { era: 'today' }).svg).not.toBe(old);
    }
    // A steam engine has spoked driving wheels a metre and more across.
    const steam = make('vehicle.train', { kind: 'steam' });
    const biggest = Math.max(
      ...Object.entries(steam.parts)
        .filter(([k]) => k.startsWith('wheel-'))
        .map(([, w]) => w.value ?? 0),
    );
    expect(biggest * 2).toBeGreaterThan(1.5 * UNITS_PER_METRE);
  });

  it('is its real size, in the kit’s units', () => {
    const height = (id: string, params = {}) =>
      make(id, params).box[3] / UNITS_PER_METRE;
    const length = (id: string, params = {}) =>
      make(id, params).box[2] / UNITS_PER_METRE;
    expect(length('vehicle.car')).toBeGreaterThan(3.5);
    expect(length('vehicle.car')).toBeLessThan(5.5);
    expect(height('vehicle.bus')).toBeGreaterThan(2.8);
    expect(length('vehicle.ship', { kind: 'container' })).toBeGreaterThan(150);
    expect(height('vehicle.rocket')).toBeGreaterThan(50);
  });

  it('carries as many coaches as asked', () => {
    const coaches = (n: number) =>
      Object.keys(make('vehicle.train', { wagons: n }).parts).filter((k) =>
        /^wagon-\d+$/.test(k),
      ).length;
    expect(coaches(1)).toBe(1);
    expect(coaches(4)).toBe(4);
  });
});
