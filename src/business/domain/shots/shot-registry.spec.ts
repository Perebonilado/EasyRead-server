import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import type { RegistryEntry } from './types';
import {
  buildRegistry,
  isDateLike,
  looseKey,
  MAP_ASSET,
  mapPartId,
  promptList,
  quantityOf,
  registryOf,
} from './shot-registry';

const registry = () =>
  buildRegistry({
    rows: WALL_ROWS,
    research: WALL_RESEARCH,
    world: WALL_WORLD,
  });

describe("a scene's target registry", () => {
  it("names the show map's regions in their colours, and its seams, as features of the map", () => {
    const r = registry();
    const east = r.resolve('region:East Germany')!;
    expect(east).toMatchObject({
      kind: 'region',
      colour: 'chart0',
      feature: { asset: MAP_ASSET, id: 'group-east-germany' },
    });
    // A point in the middle of its states: east of the Elbe, north of Bavaria.
    expect(east.geo!.lng).toBeGreaterThan(11);
    expect(east.geo!.lng).toBeLessThan(15);
    expect(east.geo!.lat).toBeGreaterThan(50.5);
    expect(east.geo!.lat).toBeLessThan(54);
    expect(r.resolve('seam:inner border')).toMatchObject({
      kind: 'seam',
      feature: { asset: MAP_ASSET, id: 'seam-inner-border' },
    });
  });

  it('puts a place on the map where code finds it, and keeps one it cannot find in words only', () => {
    const r = registry();
    const berlin = r.resolve('place:Berlin')!;
    expect(berlin.geo).toEqual({ lng: 13.3996, lat: 52.5238 });
    expect(berlin.claim).toBe('c1');
    // A research moment's street: in the registry, never pinned.
    const street = r.resolve('place:Bernauer Strasse')!;
    expect(street.kind).toBe('place');
    expect(street.geo).toBeUndefined();
    expect(promptList(r)).toContain('- place:Berlin [pin]');
    expect(promptList(r)).toContain('- place:Bernauer Strasse: not on the map');
  });

  it('never takes a made-up world place, a person for a place, or the map’s own country as a pin', () => {
    const names = registry()
      .entries()
      .map((e) => e.name);
    expect(names).not.toContain('place:A border kiosk at dawn');
    expect(names.filter((n) => n.startsWith('place:'))).toEqual([
      'place:Berlin',
      'place:Bernauer Strasse',
    ]);
  });

  it('gives a person with no picture their trace: their own words, else nothing (never on screen)', () => {
    const r = registry();
    expect(r.resolve('person:Ronald Reagan')).toMatchObject({
      kind: 'person',
      claims: ['c3'],
      trace: { kind: 'quote', ref: 'claim:c3' },
    });
    const honecker = r.resolve('person:Erich Honecker')!;
    expect(honecker.picture).toBeUndefined();
    expect(honecker.trace).toBeUndefined();
    const listed = promptList(r);
    expect(listed).toContain('show their trace: their own words, claim:c3');
    expect(listed).toContain(
      '- person:Erich Honecker: East Germany’s leader · no portrait, no trace: never on screen',
    );
  });

  it("takes a person's portrait from the picture desk when it cleared one", () => {
    const r = buildRegistry({
      rows: WALL_ROWS,
      research: WALL_RESEARCH,
      world: WALL_WORLD,
      pictures: [
        {
          name: 'person:Ronald Reagan',
          kind: 'person',
          about: 'portrait',
          picture: { asset: 'reagan', credit: 'White House Photo Office · PD' },
        },
      ],
    });
    expect(r.resolve('person:Ronald Reagan')!.picture!.asset).toBe('reagan');
    expect(promptList(r)).toContain('- person:Ronald Reagan [portrait]');
  });

  it("holds the research's numbers with their value and unit, and its dates apart", () => {
    const r = registry();
    expect(r.resolve('number:Length of the inner border')).toMatchObject({
      kind: 'number',
      value: 1393,
      unit: 'km',
      claim: 'c2',
      source: 'The Wall, part 2',
    });
    // "9 November 1989" is a date, not a quantity.
    expect(r.resolve('number:The day the Wall opened')).toBeNull();
    expect(r.resolve('date:1989')).toMatchObject({ kind: 'date', value: 1989 });
    expect(
      r
        .entries()
        .filter((e) => e.kind === 'date')
        .map((e) => e.name),
    ).toEqual(['date:1961', 'date:1987', 'date:1989']);
  });

  it('keeps the claims the lines rest on, and the colours of the show', () => {
    const r = registry();
    expect(r.resolve('claim:c3')!.about).toContain('tear down this wall');
    expect(r.resolve('side:West Germany')).toMatchObject({
      kind: 'side',
      colour: 'chart1',
    });
    expect(promptList(r)).toContain('side:East Germany (chart0)');
  });

  it('resolves a name the board writes another way, and nothing it does not know', () => {
    const r = registry();
    expect(r.resolve('the East')!.name).toBe('region:East Germany');
    expect(r.resolve('East Germany')!.name).toBe('region:East Germany');
    expect(r.resolve('berlin')!.name).toBe('place:Berlin');
    expect(r.resolve('place: Berlin')!.name).toBe('place:Berlin');
    expect(r.resolve('Reagan')!.name).toBe('person:Ronald Reagan');
    expect(r.resolve('c2')!.name).toBe('claim:c2');
    expect(r.resolve('claim:2')!.name).toBe('claim:c2');
    expect(r.resolve('1961')!.name).toBe('date:1961');
    expect(r.resolve('place:Atlantis')).toBeNull();
    expect(r.resolve('part:number')).toBeNull();
    expect(r.resolve('')).toBeNull();
  });

  it('reads back the same from its stored entries', () => {
    const stored = JSON.parse(
      JSON.stringify(registry().entries()),
    ) as RegistryEntry[];
    const again = registryOf(stored);
    expect(again.entries()).toEqual(registry().entries());
    expect(again.resolve('the West')!.name).toBe('region:West Germany');
  });

  it('defaults to no country: a scene with no map and no places names none', () => {
    const r = buildRegistry({
      rows: [
        { say: 'Air is packed tight and hot. What lights it?', claims: [] },
      ],
      research: null,
      world: null,
    });
    expect(r.entries()).toEqual([]);
    expect(promptList(r)).toBe(
      'Nothing to name: no map, no people, no numbers.',
    );
  });
});

describe('the words a registry is read with', () => {
  it("names a map's parts as the map draws them", () => {
    expect(mapPartId('group', 'North Region')).toBe('group-north-region');
    expect(mapPartId('seam', 'Côte d’Ivoire and Ghana')).toBe(
      'seam-cote-d-ivoire-and-ghana',
    );
  });

  it('reads a quantity and its unit, the first number that is no year', () => {
    expect(quantityOf('134 of 312')).toEqual({ value: 134, unit: 'of 312' });
    expect(quantityOf('45 million people')).toEqual({
      value: 45,
      unit: 'million people',
    });
    expect(quantityOf('70%')).toEqual({ value: 70, unit: '%' });
    expect(quantityOf('In 1959, 134 seats')).toEqual({
      value: 134,
      unit: 'seats',
    });
    expect(quantityOf('no number')).toBeNull();
  });

  it('tells a date from a quantity', () => {
    expect(isDateLike('1 October 1960')).toBe(true);
    expect(isDateLike('March 1959')).toBe(true);
    expect(isDateLike('1960')).toBe(true);
    expect(isDateLike('1960s')).toBe(true);
    expect(isDateLike('3 regions')).toBe(false);
    expect(isDateLike('1,393 km')).toBe(false);
  });

  it('matches names loosely, the generic words out', () => {
    expect(looseKey('the North')).toBe(looseKey('North Region'));
    expect(looseKey('Kano State')).toBe('kano');
    expect(looseKey('the Region')).toBe('the region');
  });
});
