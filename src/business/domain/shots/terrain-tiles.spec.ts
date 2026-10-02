import {
  BORDERS_CREDIT,
  TERRAIN_ATTRIBUTION,
  isPng,
  mapCredits,
  readTile,
  terrainKey,
  terrainUrl,
  withCredits,
} from './terrain-tiles';

describe('terrain tiles', () => {
  it('reads a tile’s address from a path: whole numbers on its zoom’s grid, no closer than zoom 12', () => {
    expect(readTile('5', '16', '15')).toEqual({ z: 5, x: 16, y: 15 });
    expect(readTile(0, 0, 0)).toEqual({ z: 0, x: 0, y: 0 });
    expect(readTile('12', '4095', '0')).toEqual({ z: 12, x: 4095, y: 0 });
    expect(readTile('13', '0', '0')).toBeNull();
    expect(readTile('5', '32', '0')).toBeNull();
    expect(readTile('5', '-1', '0')).toBeNull();
    expect(readTile('5', '1.5', '0')).toBeNull();
    expect(readTile('5', '../1', '0')).toBeNull();
    expect(readTile(undefined, '1', '1')).toBeNull();
  });

  it('keeps a tile in our storage, and fetches it from Terrain Tiles the first time', () => {
    const tile = { z: 7, x: 66, y: 60 };
    expect(terrainKey(tile)).toBe('tiles/terrarium/7/66/60.png');
    expect(terrainUrl(tile)).toBe(
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/7/66/60.png',
    );
  });

  it('knows a PNG by its signature', () => {
    expect(
      isPng(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe(true);
    expect(isPng(Buffer.from('<Error>NoSuchKey</Error>'))).toBe(false);
    expect(isPng(new Uint8Array())).toBe(false);
  });

  it('credits the borders on any map, and the terrain’s every source when the map is drawn from it', () => {
    expect(mapCredits(false, true)).toEqual([]);
    expect(mapCredits(true, false)).toEqual([BORDERS_CREDIT]);
    const all = mapCredits(true, true);
    expect(all[0]).toBe(BORDERS_CREDIT);
    expect(all).toEqual(expect.arrayContaining([...TERRAIN_ATTRIBUTION]));
    expect(all.some((line) => line.includes('U.S. Geological Survey'))).toBe(
      true,
    );
  });

  it('puts the credits after a description under their own heading, and leaves one with none as it was', () => {
    expect(withCredits('About the film.', [])).toBe('About the film.');
    expect(withCredits('About the film.  ', ['A', 'B'])).toBe(
      'About the film.\n\nCredits\nA\nB',
    );
    expect(withCredits('', ['A'])).toBe('Credits\nA');
  });
});
