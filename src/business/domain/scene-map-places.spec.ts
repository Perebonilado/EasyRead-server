import { atlasOf, d3Geo } from './scene-map';
import { naturalAreas } from './scene-map-data';
import {
  ATLAS_COUNTRIES,
  PLACES,
  areasNamed,
  areasOf,
  countriesNamed,
  countriesOfAreas,
  highlightCountries,
  mapFromWords,
  placeNamed,
  readRegion,
  realMapIn,
  regionNamed,
} from './scene-map-places';

describe('where things are, for a map', () => {
  it("names every one of world-atlas's countries, and only those", () => {
    for (const resolution of ['50m', '110m'] as const) {
      const atlas = atlasOf(resolution);
      for (const name of atlas.byName.keys())
        expect(ATLAS_COUNTRIES).toContain(name);
    }
    const fine = atlasOf('50m');
    for (const name of ATLAS_COUNTRIES)
      expect(fine.byName.has(name)).toBe(true);
  });

  it('reads the names writers use for countries', () => {
    expect(countriesNamed('UK')).toEqual(['United Kingdom']);
    expect(countriesNamed('Britain')).toEqual(['United Kingdom']);
    expect(countriesNamed('USA')).toEqual(['United States of America']);
    expect(countriesNamed('the United States')).toEqual([
      'United States of America',
    ]);
    expect(countriesNamed('Ivory Coast')).toEqual(["Côte d'Ivoire"]);
    expect(countriesNamed("Cote d'Ivoire")).toEqual(["Côte d'Ivoire"]);
    expect(countriesNamed('Côte d’Ivoire')).toEqual(["Côte d'Ivoire"]);
    expect(countriesNamed('DRC')).toEqual(['Dem. Rep. Congo']);
    expect(countriesNamed('Democratic Republic of the Congo')).toEqual([
      'Dem. Rep. Congo',
    ]);
    // Congo alone is the larger Congo; the other by its own name.
    expect(countriesNamed('Congo')).toEqual(['Dem. Rep. Congo']);
    expect(countriesNamed('Republic of the Congo')).toEqual(['Congo']);
    expect(countriesNamed('Czech Republic')).toEqual(['Czechia']);
    expect(countriesNamed('Burma')).toEqual(['Myanmar']);
    expect(countriesNamed('Korea')).toEqual(['South Korea', 'North Korea']);
    expect(countriesNamed('Atlantis')).toEqual([]);
  });

  it('reads a region: the world, a continent, a part of one, a list', () => {
    expect(readRegion('the world').region?.kind).toBe('world');
    const africa = readRegion('Africa').region;
    expect(africa?.kind).toBe('continent');
    expect(africa && 'entry' in africa && africa.entry.members).toContain(
      'Nigeria',
    );
    const west = readRegion('West Africa').region;
    expect(west && 'entry' in west && west.entry.members).toEqual(
      expect.arrayContaining(['Ghana', 'Senegal', 'Nigeria']),
    );
    expect(readRegion('Kenya, Uganda and Tanzania').region).toEqual({
      kind: 'countries',
      name: 'Kenya, Uganda and Tanzania',
      countries: ['Kenya', 'Uganda', 'Tanzania'],
    });
    // One name that has "and" in it is one country.
    expect(readRegion('Trinidad and Tobago').region).toMatchObject({
      countries: ['Trinidad and Tobago'],
    });
    expect(readRegion('Bosnia and Herzegovina').region).toMatchObject({
      countries: ['Bosnia and Herz.'],
    });
    // A part of a country shows its country.
    expect(readRegion('Scotland').region).toMatchObject({
      countries: ['United Kingdom'],
    });
    const mixed = readRegion('Peru, Narnia');
    expect(mixed.region).toMatchObject({ countries: ['Peru'] });
    expect(mixed.unknown).toEqual(['Narnia']);
    expect(readRegion('Narnia').region).toBeNull();
  });

  it('colours a country or a region, never a part of a country', () => {
    expect(highlightCountries('Sub-Saharan Africa')).toContain('Nigeria');
    expect(highlightCountries('Sub-Saharan Africa')).not.toContain('Egypt');
    expect(highlightCountries('Scotland')).toEqual([]);
    expect(highlightCountries('world')).toEqual([]);
    expect(regionNamed('South-East Asia')?.name).toBe('Southeast Asia');
  });

  it("finds places by their names, at Natural Earth's coordinates", () => {
    const kinshasa = placeNamed('Kinshasa');
    expect(kinshasa).toMatchObject({
      kind: 'capital',
      country: 'Dem. Rep. Congo',
    });
    expect(kinshasa!.lat).toBeCloseTo(-4.33, 1);
    expect(kinshasa!.lon).toBeCloseTo(15.31, 1);
    // Cities the table does not list, from Natural Earth's places.
    expect(placeNamed('Port Harcourt')).toMatchObject({ country: 'Nigeria' });
    expect(placeNamed('Vancouver')).toMatchObject({ country: 'Canada' });
    // Other names, and a country to tell two of a name apart.
    expect(placeNamed('Bombay')?.name).toBe('Mumbai');
    expect(placeNamed('Kiev')?.name).toBe('Kyiv');
    expect(placeNamed('Lagos, Nigeria')?.name).toBe('Lagos');
    expect(placeNamed('Hyderabad')?.country).toBe('India');
    expect(placeNamed('Hyderabad, Pakistan')?.country).toBe('Pakistan');
    // A capital Natural Earth's data is older than: the table's.
    expect(placeNamed('Gitega')).toMatchObject({
      kind: 'capital',
      country: 'Burundi',
    });
    expect(placeNamed('mount everest')?.kind).toBe('mountain');
    expect(placeNamed('Gotham City')).toBeNull();
  });

  it('finds rivers and lakes as Natural Earth draws them', () => {
    expect(placeNamed('Nile')).toMatchObject({ kind: 'river' });
    expect(placeNamed('the Nile')?.river).toContain('El Bahr el Abyad');
    expect(placeNamed('Rhine')?.river).toEqual(['Rhine', 'Rhein', 'Rhin']);
    expect(placeNamed('Zambezi')?.kind).toBe('river');
    expect(placeNamed('Lake Victoria')).toMatchObject({
      kind: 'lake',
      lake: 'Lake Victoria',
    });
    expect(placeNamed('Lake Titicaca')?.lake).toBe('Lago Titicaca');
    // A river is named as one where its name is a country's.
    expect(placeNamed('Niger')).toBeNull();
    expect(placeNamed('River Niger')?.kind).toBe('river');
    expect(placeNamed('Congo River')?.river).toContain('Lualaba');
    // And a lake by its whole name: Victoria alone is a city.
    expect(placeNamed('Victoria')?.kind).not.toBe('lake');
  });

  it('puts every place in the country it is listed under', async () => {
    const g = await d3Geo();
    const atlas = atlasOf('50m');
    const far: string[] = [];
    // As the table lists them, and as they are found (a city at Natural
    // Earth's coordinates, never at another of its name's).
    const found = PLACES.flatMap((place) => {
      const one = placeNamed(place.name);
      return one ? [{ ...one, country: place.country }] : [];
    });
    expect(found.length).toBe(PLACES.length);
    for (const place of [...PLACES, ...found]) {
      if (!place.country) continue;
      const country = atlas.byName.get(place.country);
      expect(country).toBeDefined();
      if (g.geoContains(country!, [place.lon, place.lat])) continue;
      // On its coast or its border: within a tenth of a degree, as the
      // atlas draws the coast (Lisbon, Copenhagen, Mont Blanc).
      const polygons =
        country!.geometry.type === 'Polygon'
          ? [country!.geometry.coordinates]
          : country!.geometry.coordinates;
      let least = Infinity;
      for (const polygon of polygons)
        for (const ring of polygon)
          for (const point of ring)
            least = Math.min(
              least,
              (g.geoDistance(point as [number, number], [
                place.lon,
                place.lat,
              ]) *
                180) /
                Math.PI,
            );
      if (least > 0.1) far.push(`${place.name}: ${least.toFixed(2)}°`);
    }
    expect(far).toEqual([]);
  });

  it("knows a real place's map asked of the artist, and a made-up one", () => {
    expect(realMapIn('Map of Africa', 'The continent of Africa')).toBe(true);
    expect(
      realMapIn(
        'Where malaria is found',
        'Africa with the affected countries shaded red',
      ),
    ).toBe(true);
    expect(realMapIn('World map', 'Continents in outline')).toBe(true);
    expect(realMapIn('Japan', 'A map of Japan with Tokyo marked')).toBe(true);
    expect(realMapIn('Lagos', 'A street map of Lagos')).toBe(true);
    // Not a map, or not of a real place.
    expect(
      realMapIn(
        'Mosquito',
        'An Anopheles mosquito, common where malaria is found in Africa',
      ),
    ).toBe(false);
    expect(realMapIn('Treasure map', 'An old treasure map of Jamaica')).toBe(
      false,
    );
    expect(realMapIn('Mind map', 'A mind map of causes')).toBe(false);
    expect(realMapIn('Heart', 'A map of the heart: four chambers')).toBe(false);
    expect(realMapIn('Kingdom map', 'The map of the kingdom of Ember')).toBe(
      false,
    );
  });

  it("reads a real place's map from its caption and brief", () => {
    expect(
      mapFromWords(
        'Map of West Africa',
        'West Africa with Nigeria and Ghana shaded, Lagos marked',
      ),
    ).toEqual({
      region: 'West Africa',
      highlight: ['Nigeria', 'Ghana'],
      places: ['Lagos'],
    });
    expect(mapFromWords('Map of Peru', 'Peru, Lima marked')).toEqual({
      region: 'Peru',
      highlight: [],
      places: ['Lima'],
    });
    expect(mapFromWords('A map', 'A map of nowhere at all')).toBeNull();
  });

  it("keeps Natural Earth's areas inside world-atlas's countries, each once", () => {
    const { areas, byKey } = naturalAreas();
    expect(areas.length).toBeGreaterThan(4500);
    expect(byKey.size).toBe(areas.length);
    for (const area of areas) expect(ATLAS_COUNTRIES).toContain(area.country);
    // Every state of Nigeria, and the capital's territory.
    expect(areasOf('Nigeria')).toHaveLength(37);
    expect(areasOf('Germany')).toHaveLength(16);
    expect(countriesOfAreas(['NG-KN', 'DE-BY', 'nowhere'])).toEqual([
      'Nigeria',
      'Germany',
    ]);
  });

  it('finds an area by its name, its other names, and with or without its kind', () => {
    const keys = (said: string, within?: string[]) =>
      areasNamed(said, within)?.keys ?? null;
    expect(keys('Kano', ['Nigeria'])).toEqual(['NG-KN']);
    expect(keys('Kano State', ['Nigeria'])).toEqual(['NG-KN']);
    // Natural Earth's own spelling is Nassarawa; the state's is Nasarawa.
    expect(keys('Nasarawa', ['Nigeria'])).toEqual(['NG-NA']);
    expect(keys('Federal Capital Territory', ['Nigeria'])).toEqual(['NG-FC']);
    // Accents folded, and the English name or the local one.
    for (const said of ['Thuringia', 'Thüringen', 'Thuringen', 'THÜRINGEN'])
      expect(keys(said, ['Germany'])).toEqual(['DE-TH']);
    expect(keys('Bavaria')).toEqual(['DE-BY']);
    expect(keys('Bayern')).toEqual(['DE-BY']);
    expect(keys('Baden-Wurttemberg', ['Germany'])).toEqual(['DE-BW']);
    // An old name.
    expect(keys('Orissa', ['India'])).toEqual(['IN-OR']);
    expect(keys('North-West Frontier Province')).toEqual(['PK-KP']);
    // Niger on a map of Nigeria is Niger State.
    expect(keys('Niger', ['Nigeria'])).toEqual(['NG-NI']);
    expect(keys('Atlantis')).toBeNull();
    expect(keys('Wakanda State', ['Nigeria'])).toBeNull();
  });

  it('reads an area inside the countries in view, its own name before another', () => {
    const keys = (said: string, within?: string[]) =>
      areasNamed(said, within)?.keys ?? null;
    expect(keys('Punjab', ['India'])).toEqual(['IN-PB']);
    expect(keys('Punjab', ['Pakistan'])).toEqual(['PK-PB']);
    expect(keys('Punjab', ['India', 'Pakistan'])?.sort()).toEqual([
      'IN-PB',
      'PK-PB',
    ]);
    // The state, not the capital whose English name is Washington.
    expect(keys('Washington', ['United States of America'])).toEqual(['US-WA']);
    expect(keys('Georgia', ['United States of America'])).toEqual(['US-GA']);
    expect(keys('Kano', ['Germany'])).toBeNull();
  });

  it('reads a part of a country, and a larger region, as all their areas', () => {
    const scotland = areasNamed('Scotland', ['United Kingdom']);
    expect(scotland?.countries).toEqual(['United Kingdom']);
    expect(scotland?.keys.length).toBeGreaterThan(25);
    expect(areasNamed('Wales')?.keys.length).toBeGreaterThan(15);
    const usa = ['United States of America'];
    expect(areasNamed('the Midwest', usa)?.keys).toHaveLength(12);
    expect(areasNamed('Northeast', usa)?.keys).toContain('US-NY');
    expect(areasNamed('South', usa)?.keys).toContain('US-TX');
    // "The South" is many countries' own: read only where the map is.
    expect(areasNamed('South')).toBeNull();
    // Italy's regions by their English names.
    const lombardy = areasNamed('Lombardy', ['Italy']);
    expect(lombardy?.keys.length).toBeGreaterThan(5);
    expect(lombardy?.countries).toEqual(['Italy']);
    expect(areasNamed('Catalonia', ['Spain'])?.keys).toHaveLength(4);
  });
});
