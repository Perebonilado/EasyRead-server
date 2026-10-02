/**
 * Placement: a piece stands on what it names, at its word, or apart from
 * the shot's subject and what its labels sit on; on a map as a marker,
 * elsewhere at one scale a shot, its feet on the ground, inside its set.
 */
import type { ShotBox } from '../../../contracts';
import { GROUND, placeActor, type PlaceInput } from './place';

const SET: ShotBox = [0, 0, 1600, 900];
const PERSON: PlaceInput['piece'] = {
  box: [-40, -180, 80, 180],
  family: 'people',
  id: 'people.person',
};
const BUS: PlaceInput['piece'] = {
  box: [0, -330, 1150, 330],
  family: 'vehicles',
  id: 'vehicle.bus',
};
const CROWD: PlaceInput['piece'] = {
  box: [-1400, -400, 2800, 400],
  family: 'people',
  id: 'people.crowd',
};

const base = (extra: Partial<PlaceInput>): PlaceInput => ({
  set: SET,
  map: false,
  piece: PERSON,
  isSubject: true,
  index: 0,
  count: 1,
  ...extra,
});

const boxOf = (
  p: ReturnType<typeof placeActor>,
  piece: PlaceInput['piece'],
): ShotBox => {
  const w = (p.size * piece.box[2]) / piece.box[3];
  return [p.at.x - w / 2, p.at.y - p.size, w, p.size];
};
const overlap = (a: ShotBox, b: ShotBox) => {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? (w * h) / (a[2] * a[3]) : 0;
};

describe('placing a piece', () => {
  it('stands the subject big, its feet on the ground line', () => {
    const p = placeActor(base({}));
    expect(p.at.y).toBeCloseTo(900 * GROUND, 0);
    expect(p.size / 900).toBeGreaterThan(0.45);
    expect(p.size).toBeLessThanOrEqual(900 * GROUND);
  });

  it('never stands a piece that is not the subject over the subject or what a label sits on', () => {
    const subject: ShotBox = [600, 300, 400, 450];
    const label: ShotBox = [1150, 600, 120, 120];
    for (let index = 0; index < 3; index += 1) {
      const p = placeActor(
        base({ isSubject: false, subject, avoid: [label], index, count: 3 }),
      );
      const box = boxOf(p, PERSON);
      expect(overlap(box, subject)).toBeLessThanOrEqual(0.1);
      expect(overlap(box, label)).toBeLessThanOrEqual(0.1);
    }
  });

  it('keeps one scale for a whole shot: a bus beside a person is a bus', () => {
    const person = placeActor(base({ index: 0, count: 2 }));
    const bus = placeActor(
      base({
        piece: BUS,
        isSubject: false,
        index: 1,
        count: 2,
        scale: person.scale,
      }),
    );
    // A 3.3 m bus beside a 1.8 m person.
    expect(bus.size / person.size).toBeCloseTo(330 / 180, 2);
  });

  it('takes the set’s own scale and ground when it has them', () => {
    const p = placeActor(base({ ground: 700, unitsPerMetre: 120 }));
    expect(p.at.y).toBe(700);
    expect(p.size).toBeCloseTo(1.8 * 120, 1);
  });

  it('stands at its word: left, right, centre, nearer, further', () => {
    expect(placeActor(base({ word: 'left' })).at.x).toBeCloseTo(1600 / 3, 0);
    expect(placeActor(base({ word: 'right' })).at.x).toBeCloseTo(3200 / 3, 0);
    const near = placeActor(base({ word: 'foreground' }));
    const far = placeActor(base({ word: 'background' }));
    expect(near.size).toBeGreaterThan(far.size);
    expect(near.z).toBeGreaterThan(far.z);
  });

  it('on a map, stands on its place as a marker of it', () => {
    const map: ShotBox = [0, 0, 900, 700];
    const kano: ShotBox = [500, 150, 20, 20];
    const p = placeActor(base({ set: map, map: true, on: kano }));
    expect(p.at).toEqual({ x: 510, y: 160 });
    expect(p.size / 700).toBeCloseTo(0.075, 3);
    const ship = placeActor(
      base({ set: map, map: true, on: kano, piece: BUS }),
    );
    expect((ship.size * 1150) / 330 / 700).toBeCloseTo(0.11, 2);
  });

  it('keeps a piece inside its set, a crowd filling the ground', () => {
    const crowd = placeActor(base({ piece: CROWD }));
    const box = boxOf(crowd, CROWD);
    expect(box[0]).toBeGreaterThanOrEqual(-0.5);
    expect(box[0] + box[2]).toBeLessThanOrEqual(1600.5);
    expect(box[2] / 1600).toBeGreaterThan(0.8);
  });

  it('is the same for the same input', () => {
    const input = base({
      isSubject: false,
      subject: [600, 300, 400, 450],
      index: 1,
      count: 2,
    });
    expect(placeActor(input)).toEqual(placeActor(input));
  });
});
