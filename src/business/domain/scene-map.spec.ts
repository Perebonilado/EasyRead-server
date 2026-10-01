import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import { drawByCode } from './scene-code';
import {
  PERIOD_NOTE,
  frameFor,
  groupColour,
  mapColourHex,
  mapFrameOf,
  mapPartNames,
  readMap,
  readMapBase,
  renderMap,
  withShowMap,
  type MapDraft,
  type ShowMapBase,
} from './scene-map';
import { THEMES, codeColour } from './scene-themes';

const draft = (region: string, more: Partial<MapDraft> = {}): MapDraft => ({
  region,
  highlight: null,
  places: null,
  routes: null,
  ...more,
});

const specOf = (one: MapDraft) => {
  const { spec } = readMap(one);
  if (!spec) throw new Error('no map');
  return spec;
};

/** Where a part's mark is drawn: its circle's centre. */
function markOf(svg: string, id: string): [number, number] {
  const doc = parseDocument(svg, { xmlMode: true });
  let found: [number, number] | null = null;
  const walk = (node: Element) => {
    if (found) return;
    if (node.attribs?.id === id) {
      const find = (n: Element) => {
        if (found) return;
        if (n.name === 'circle')
          found = [Number(n.attribs.cx), Number(n.attribs.cy)];
        for (const c of n.children ?? []) if ('name' in c) find(c as Element);
      };
      find(node);
    }
    for (const c of node.children ?? []) if ('name' in c) walk(c as Element);
  };
  for (const c of doc.children) if ('name' in c) walk(c as Element);
  if (!found) throw new Error(`no mark for ${id}`);
  return found;
}

describe('a map drawn by code', () => {
  it("reads the writer's names, and leaves off what it does not know", () => {
    const { spec, dropped } = readMap(
      draft('Africa', {
        highlight: [
          { name: 'DRC', label: true, group: 'Sleeping sickness' },
          { name: 'Ivory Coast', label: false, group: 'Sleeping sickness' },
          { name: 'Wakanda', label: true, group: 'Sleeping sickness' },
          { name: 'Kenya', label: true, group: 'Malaria only' },
        ],
        places: ['Kinshasa', 'Kampala', 'Zenith City', 'Nigeria'],
        routes: [{ from: 'Kinshasa', to: 'Nairobi', name: null }],
      }),
    );
    expect(spec?.region).toMatchObject({ name: 'Africa', kind: 'continent' });
    expect(spec?.highlights).toEqual([
      {
        name: 'DRC',
        countries: ['Dem. Rep. Congo'],
        label: true,
        group: 0,
      },
      {
        name: 'Ivory Coast',
        countries: ["Côte d'Ivoire"],
        label: false,
        group: 0,
      },
      { name: 'Kenya', countries: ['Kenya'], label: true, group: 1 },
    ]);
    expect(spec?.groups).toEqual(['Sleeping sickness', 'Malaria only']);
    // A route's end the writer did not list is marked too.
    expect(spec?.places.map((p) => p.name)).toEqual([
      'Kinshasa',
      'Kampala',
      'Nairobi',
    ]);
    expect(spec?.routes[0].name).toBe('Kinshasa to Nairobi');
    expect(dropped).toEqual([
      '"Wakanda" is no country or region the map knows',
      '"Zenith City" is no place the map knows',
      '"Nigeria" is a country, not a place: colour it as a highlight',
    ]);
  });

  it('shows what it colours when the writer names no region it knows', () => {
    const spec = specOf(
      draft('the lands of the north', {
        highlight: [{ name: 'Norway' }, { name: 'Sweden' }],
      }),
    );
    expect(spec.region.countries).toEqual(['Norway', 'Sweden']);
    expect(readMap(draft('Narnia')).spec).toBeNull();
  });

  it('fits a projection to each region', async () => {
    const world = await renderMap(specOf(draft('world')));
    expect(world.projection).toBe('naturalEarth1');
    expect(world.resolution).toBe('110m');
    const africa = await renderMap(specOf(draft('Africa')));
    expect(africa.projection).toBe('azimuthalEqualArea');
    expect(africa.resolution).toBe('110m');
    const europe = await renderMap(specOf(draft('Europe')));
    expect(europe.projection).toBe('conicEqualArea');
    // A country's coast from the finer data.
    for (const one of ['Nigeria', 'UK', 'Japan']) {
      const map = await renderMap(specOf(draft(one)));
      expect(map.resolution).toBe('50m');
      expect(map.projection).toBe('azimuthalEqualArea');
    }
    // Africa is taller than wide, the world twice as wide as tall.
    expect(africa.viewBox[2] / africa.viewBox[3]).toBeLessThan(1);
    expect(world.viewBox[2] / world.viewBox[3]).toBeGreaterThan(1.8);
  });

  it('puts places where they are', async () => {
    const uk = await renderMap(
      specOf(draft('UK', { places: ['London', 'Edinburgh', 'Belfast'] })),
    );
    const london = markOf(uk.svg, uk.parts.London);
    const edinburgh = markOf(uk.svg, uk.parts.Edinburgh);
    const belfast = markOf(uk.svg, uk.parts.Belfast);
    // London is south and east of Edinburgh; Belfast west of both.
    expect(london[1]).toBeGreaterThan(edinburgh[1]);
    expect(london[0]).toBeGreaterThan(edinburgh[0]);
    expect(belfast[0]).toBeLessThan(edinburgh[0]);
    const japan = await renderMap(
      specOf(draft('Japan', { places: ['Tokyo', 'Osaka', 'Sapporo'] })),
    );
    const tokyo = markOf(japan.svg, japan.parts.Tokyo);
    const osaka = markOf(japan.svg, japan.parts.Osaka);
    const sapporo = markOf(japan.svg, japan.parts.Sapporo);
    expect(tokyo[0]).toBeGreaterThan(osaka[0]);
    expect(sapporo[1]).toBeLessThan(tokyo[1]);
    // Each place named on the map, beside its mark, as a label.
    expect(japan.labels.Tokyo).toBe('label-tokyo');
    const at = japan.svg.indexOf('id="label-tokyo"');
    const label = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>Tokyo</.exec(
      japan.svg.slice(at),
    );
    expect(label).not.toBeNull();
    expect(Math.abs(Number(label![1]) - tokyo[0])).toBeLessThan(260);
    expect(Math.abs(Number(label![2]) - tokyo[1])).toBeLessThan(120);
    expect(japan.callouts).toEqual([]);
  });

  it('colours each group its own colour, with a key, each country a part', async () => {
    const map = await renderMap(
      specOf(
        draft('Africa', {
          highlight: [
            { name: 'Nigeria', label: true, group: 'Found' },
            { name: 'Ghana', label: false, group: 'Found' },
            { name: 'Ethiopia', label: true, group: 'Eliminated' },
          ],
        }),
      ),
    );
    expect(Object.keys(map.parts)).toEqual(
      expect.arrayContaining(['Nigeria', 'Ghana', 'Ethiopia']),
    );
    const groupOf = (id: string) => {
      const at = map.svg.indexOf(`id="${id}"`);
      return /fill="(#[0-9A-F]+)"/i.exec(map.svg.slice(at))?.[1];
    };
    expect(groupOf(map.parts.Nigeria)).toBe(groupColour(0, 2));
    expect(groupOf(map.parts.Ghana)).toBe(groupColour(0, 2));
    expect(groupOf(map.parts.Ethiopia)).toBe(groupColour(1, 2));
    expect(groupColour(0, 2)).not.toBe(groupColour(1, 2));
    expect(map.svg).toContain('>Found</text>');
    expect(map.svg).toContain('>Eliminated</text>');
    // Only the labelled ones are named.
    expect(Object.keys(map.labels)).toEqual(['Nigeria', 'Ethiopia']);
    expect(map.svg).toContain('>Nigeria</text>');
    expect(map.svg).not.toContain('>Ghana</text>');
  });

  it("keeps its groups' colours apart in every theme", () => {
    for (const theme of Object.values(THEMES)) {
      const colours = [0, 1, 2, 3].map((i) =>
        codeColour(groupColour(i, 4), theme),
      );
      expect(colours.every(Boolean)).toBe(true);
      expect(new Set(colours).size).toBe(4);
      // One group in the theme's accent.
      expect(codeColour(groupColour(0, 1), theme)).toBe(theme.accent);
    }
  });

  it('draws a river and a lake the voice names, each a part, and every lake in view', async () => {
    const map = await renderMap(
      specOf(draft('Uganda', { places: ['Kampala', 'Lake Victoria', 'Nile'] })),
    );
    expect(map.parts.Nile).toBe('place-nile');
    expect(map.parts['Lake Victoria']).toBe('place-lake-victoria');
    expect(map.svg).toMatch(
      /id="place-nile"><g[^>]*><path d="M[^"]+" fill="none"/,
    );
    // A lake no one names is drawn too (Lake Kyoga), and a river's label
    // and a lake's are written beside them.
    expect(
      (map.svg.match(/fill-opacity="0.14"/g) ?? []).length,
    ).toBeGreaterThan(1);
    expect(map.svg).toContain('>Nile</text>');
    expect(map.svg).toContain('>Lake Victoria</text>');
    // Naming a river never widens the map: Uganda stays in view.
    expect(map.viewBox[2]).toBeLessThan(1000);
  });

  it('draws a route between two places, as a part', async () => {
    const map = await renderMap(
      specOf(
        draft('Asia', {
          routes: [{ from: "Xi'an", to: 'Samarkand', name: 'Silk Road' }],
        }),
      ),
    );
    expect(map.parts['Silk Road']).toBe('route-silk-road');
    expect(map.svg).toContain('class="route"');
  });

  it('stays small enough to play on a phone', async () => {
    for (const region of [
      'world',
      'Africa',
      'Europe',
      'Asia',
      'North America',
      'South America',
      'Oceania',
      'Nigeria',
      'United States',
      'Canada',
      'Indonesia',
      'Chile',
      'Norway',
    ])
      for (const shape of ['wide', 'tall'] as const) {
        const map = await renderMap(specOf(draft(region)), shape);
        expect([region, shape, map.svg.length < 90_000]).toEqual([
          region,
          shape,
          true,
        ]);
      }
  });

  it('is wide or tall as its film is', async () => {
    const russia = specOf(draft('Russia'));
    const wide = await renderMap(russia, 'wide');
    const tall = await renderMap(russia, 'tall');
    expect(wide.viewBox[2] / wide.viewBox[3]).toBeGreaterThan(1.5);
    // A tall film's map is square or taller than wide, at most a little wider.
    expect(tall.viewBox[2] / tall.viewBox[3]).toBeLessThanOrEqual(1.16);
    const chile = specOf(draft('Chile'));
    const narrow = await renderMap(chile, 'tall');
    expect(narrow.viewBox[2] / narrow.viewBox[3]).toBeGreaterThanOrEqual(0.74);
  });

  // ── Areas, named regions, seams, pins, the show's frame ─────────────────

  /** Nigeria's three regions of 1946, as groups of today's states. */
  const NIGERIA: ShowMapBase = {
    kind: 'map',
    region: 'Nigeria',
    groups: [
      {
        name: 'Northern Region',
        members: [
          'Sokoto',
          'Kebbi',
          'Zamfara',
          'Katsina',
          'Kano',
          'Jigawa',
          'Yobe',
          'Borno',
          'Kaduna',
          'Bauchi',
          'Gombe',
          'Adamawa',
          'Taraba',
          'Plateau',
          'Nasarawa',
          'Benue',
          'Kogi',
          'Kwara',
          'Niger',
          'Federal Capital Territory',
        ],
        colour: 'chart1',
      },
      {
        name: 'Western Region',
        members: [
          'Lagos',
          'Ogun',
          'Oyo',
          'Osun',
          'Ondo',
          'Ekiti',
          'Edo',
          'Delta',
        ],
        colour: 'chart2',
      },
      {
        name: 'Eastern Region',
        members: [
          'Anambra',
          'Enugu',
          'Ebonyi',
          'Imo',
          'Abia',
          'Rivers',
          'Bayelsa',
          'Akwa Ibom',
          'Cross River',
        ],
      },
    ],
    year: 1946,
  };

  /** Every point of a part's paths, in the drawing's units. */
  function pointsOf(svg: string, id: string): [number, number][] {
    const at = svg.indexOf(`id="${id}"`);
    if (at < 0) throw new Error(`no ${id}`);
    // The part's own group, to its close.
    let depth = 0;
    let end = at;
    for (const m of svg.slice(at).matchAll(/<g\b|<\/g>/g)) {
      depth += m[0] === '</g>' ? -1 : 1;
      if (depth === 0) {
        end = at + m.index;
        break;
      }
    }
    const out: [number, number][] = [];
    for (const d of svg.slice(at, end).matchAll(/ d="([^"]+)"/g)) {
      const n = (d[1].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
    }
    return out;
  }

  it('colours areas inside a country, and a part of one, as highlights are', () => {
    const { spec, dropped } = readMap(
      draft('Nigeria', {
        areas: [
          { name: 'Kano State', label: true, group: 'Hit hardest' },
          'Lagos',
          { name: 'Wakanda', label: true, group: null },
        ],
      }),
    );
    expect(spec?.areas).toEqual([
      {
        name: 'Kano State',
        keys: ['NG-KN'],
        countries: ['Nigeria'],
        label: true,
        group: 0,
      },
      {
        name: 'Lagos',
        keys: ['NG-LA'],
        countries: ['Nigeria'],
        label: false,
        group: 1,
      },
    ]);
    expect(dropped).toEqual(['"Wakanda" is no area the map knows']);
    // Scotland as a highlight colours Scotland, not the whole United Kingdom.
    const uk = readMap(draft('UK', { highlight: [{ name: 'Scotland' }] })).spec;
    expect(uk?.highlights).toEqual([]);
    expect(uk?.areas?.[0].name).toBe('Scotland');
    expect(uk?.areas?.[0].keys.length).toBeGreaterThan(25);
    expect(mapPartNames(uk!)).toEqual(['Scotland']);
  });

  it("reads named regions: their members, the show's own by name, a colour each", () => {
    const { spec, dropped } = readMap(
      draft('Nigeria', {
        groups: [
          { name: 'Northern Region' },
          { name: 'Western Region', colour: 'accent' },
          { name: 'Middle Belt', members: ['Plateau', 'Benue', 'Atlantis'] },
          { name: 'Nowhere', members: ['Narnia'] },
        ],
        base: NIGERIA,
      }),
    );
    const merged = spec?.merged ?? [];
    expect(merged.map((m) => m.name)).toEqual([
      'Northern Region',
      'Western Region',
      'Middle Belt',
    ]);
    // The show's members and colour; the writer's colour over the show's.
    expect(merged[0].keys).toHaveLength(20);
    expect(merged[0].keys).toContain('NG-NA');
    expect(merged[0].colour).toBe('chart1');
    expect(merged[1].colour).toBe('accent');
    // A region of the writer's own takes the next colour after the show's three.
    expect(merged[2].keys).toEqual(['NG-PL', 'NG-BE']);
    expect(merged[2].colour).toBe('chart5');
    expect(dropped).toEqual([
      '"Atlantis" in "Middle Belt" is no country or area the map knows',
      '"Narnia" in "Nowhere" is no country or area the map knows',
      'the group "Nowhere" has nothing the map knows in it',
    ]);
    // A region of countries, and one of a country's areas and a country.
    const sahel = readMap(
      draft('West Africa', {
        groups: [
          { name: 'The Sahel', members: ['Mali', 'Niger', 'Burkina Faso'] },
          { name: 'Hausaland', members: ['Kano', 'Katsina', 'Niger'] },
        ],
      }),
    ).spec;
    expect(sahel?.merged?.[0]).toMatchObject({
      countries: ['Mali', 'Niger', 'Burkina Faso'],
      keys: [],
    });
    expect(sahel?.merged?.[1]).toMatchObject({
      countries: ['Niger'],
      keys: ['NG-KN', 'NG-KT'],
    });
  });

  it('keeps a named region, a colour, the same in every scene of the show', () => {
    const first = readMap(
      draft('Nigeria', { groups: [{ name: 'Eastern Region' }], base: NIGERIA }),
    ).spec;
    const second = readMap(
      draft('', {
        groups: [{ name: 'Western Region' }, { name: 'Eastern Region' }],
        base: NIGERIA,
      }),
    ).spec;
    // The East has no colour of its own: the third of the map's, in both.
    expect(first?.merged?.[0].colour).toBe('chart2');
    expect(
      second?.merged?.find((m) => m.name === 'Eastern Region')?.colour,
    ).toBe('chart2');
    // A highlight of a group's name is the group; a colour group of a
    // region's name takes the region's colour.
    const third = readMap(
      draft('Nigeria', {
        highlight: [{ name: 'Northern Region', label: true }],
        areas: [{ name: 'Lagos', group: 'Western Region' }],
        base: NIGERIA,
      }),
    ).spec;
    expect(third?.merged?.map((m) => m.name)).toEqual(['Northern Region']);
    expect(third?.groupColours).toEqual(['chart2']);
    // The show's palette names a thing's colour.
    const palette = readMap(
      draft('Nigeria', {
        areas: [{ name: 'Kano' }],
        palette: [{ thing: 'Kano', colour: 'bad' }],
      }),
    ).spec;
    expect(palette?.areas?.[0].colour).toBe('bad');
  });

  it('draws each named region as one shape, inside the frame, a part the voice can point at', async () => {
    const spec = readMap(
      draft('Nigeria', {
        groups: [
          { name: 'Northern Region' },
          { name: 'Western Region' },
          { name: 'Eastern Region' },
        ],
        base: NIGERIA,
      }),
    ).spec!;
    for (const shape of ['wide', 'tall'] as const) {
      const map = await renderMap(spec, shape);
      const [, , W, H] = map.viewBox;
      for (const name of [
        'Northern Region',
        'Western Region',
        'Eastern Region',
      ]) {
        const id = map.parts[name];
        expect(id).toBe(`group-${name.toLowerCase().replace(' ', '-')}`);
        // One shape: one path, filled in its colour, and its name written in it.
        const at = map.svg.indexOf(`id="${id}"`);
        const own = map.svg.slice(at, map.svg.indexOf('</g></g>', at));
        expect(own.match(/<path /g)).toHaveLength(1);
        const points = pointsOf(map.svg, id);
        expect(points.length).toBeGreaterThan(20);
        for (const [x, y] of points) {
          expect(x).toBeGreaterThanOrEqual(-5);
          expect(x).toBeLessThanOrEqual(W + 5);
          expect(y).toBeGreaterThanOrEqual(-5);
          expect(y).toBeLessThanOrEqual(H + 5);
        }
        expect(map.labels[name]).toBeDefined();
      }
      // In the show's colours: the North orange, the West green.
      expect(map.svg).toContain(`fill="${mapColourHex('chart1')}"`);
      expect(map.svg).toContain(`fill="${mapColourHex('chart2')}"`);
      // The North is the largest, as it is.
      const span = (name: string) => {
        const xs = pointsOf(map.svg, map.parts[name]).map((p) => p[0]);
        return Math.max(...xs) - Math.min(...xs);
      };
      expect(span('Northern Region')).toBeGreaterThan(span('Eastern Region'));
      expect(map.svg.length).toBeLessThan(90_000);
    }
  });

  it('draws the border two regions share as a seam, and none where they do not meet', async () => {
    const spec = readMap(
      draft('Nigeria', {
        groups: [
          { name: 'Northern Region' },
          { name: 'Western Region' },
          { name: 'Eastern Region' },
        ],
        seams: [
          { between: ['Northern Region', 'Eastern Region'], style: 'dashed' },
          {
            between: ['Western Region', 'Eastern Region'],
            style: 'glow',
            name: 'Niger crossing',
          },
          { between: ['Kano', 'Lagos'] },
          { between: ['Northern Region', 'Atlantis'] },
        ],
        base: NIGERIA,
      }),
    ).spec!;
    expect(spec.seams?.map((s) => s.name)).toEqual([
      'Northern Region and Eastern Region',
      'Niger crossing',
      'Kano and Lagos',
    ]);
    const map = await renderMap(spec, 'wide');
    expect(map.parts['Northern Region and Eastern Region']).toBe(
      'seam-northern-region-and-eastern-region',
    );
    // Dashed: a line drawn on a map; glowing: a wide soft line under a bright one.
    const dashed = map.svg.slice(
      map.svg.indexOf('id="seam-northern-region-and-eastern-region"'),
    );
    expect(dashed).toMatch(/^[^]*?stroke-dasharray="12 9"/);
    expect(map.parts['Niger crossing']).toBe('seam-niger-crossing');
    // Its line lies along the two regions' shared edge: each of its points
    // near a point of each region's outline.
    const seam = pointsOf(
      map.svg,
      map.parts['Northern Region and Eastern Region'],
    );
    expect(seam.length).toBeGreaterThan(5);
    const north = pointsOf(map.svg, map.parts['Northern Region']);
    const east = pointsOf(map.svg, map.parts['Eastern Region']);
    const near = (p: [number, number], list: [number, number][]) =>
      Math.min(...list.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
    const step = Math.max(1, Math.floor(seam.length / 12));
    for (let i = 0; i < seam.length; i += step) {
      expect(near(seam[i], north)).toBeLessThan(12);
      expect(near(seam[i], east)).toBeLessThan(12);
    }
    // Kano and Lagos do not meet: no line, left off.
    expect(map.parts['Kano and Lagos']).toBeUndefined();
    expect(map.outside).toContain('Kano and Lagos');
  });

  it('puts a pin on its place, with a number on a card, as a part', async () => {
    const { spec, dropped } = readMap(
      draft('Nigeria', {
        places: ['Kano', 'Lagos'],
        highlight: [{ name: 'Nigeria', group: null }],
        pins: [
          { place: 'Kano', label: null, number: '1,000' },
          { place: 'Borno', label: null, number: null },
          { place: 'Lagos', label: 'Nigeria', number: null },
          { place: 'Atlantis' },
        ],
      }),
    );
    // A place with a pin on it is marked by the pin alone, by its name;
    // a pin named as another part is told apart.
    expect(spec?.pins?.map((p) => [p.name, p.number])).toEqual([
      ['Kano', '1,000'],
      ['Borno', null],
      ['Nigeria 2', null],
    ]);
    expect(spec?.places.map((p) => p.name)).toEqual([]);
    expect(dropped).toEqual(['the pin on "Atlantis": no place the map knows']);
    const map = await renderMap(spec!, 'wide');
    expect(map.parts.Kano).toBe('pin-kano');
    expect(map.parts.Borno).toBe('pin-borno');
    expect(map.parts['Nigeria 2']).toBe('pin-nigeria-2');
    expect(map.svg).toContain('>1,000</text>');
    // The pin's point is the city's: where the place's own mark is on the
    // same map without the pin.
    const plain = await renderMap(
      readMap(draft('Nigeria', { places: ['Kano'] })).spec!,
      'wide',
    );
    const pin = pointsOf(map.svg, 'pin-kano')[0];
    const mark = markOf(plain.svg, plain.parts.Kano);
    expect(Math.hypot(pin[0] - mark[0], pin[1] - mark[1])).toBeLessThan(1);
    // Named beside it as a label, as a place is.
    expect(map.labels.Kano).toBeDefined();
    expect(map.svg).toContain('>Kano</text>');
  });

  it("draws every map of the show into the show's one frame, whatever each colours", async () => {
    const scenes: MapDraft[] = [
      draft('Nigeria', { groups: [{ name: 'Northern Region' }] }),
      draft('Nigeria', {
        groups: [{ name: 'Western Region' }, { name: 'Eastern Region' }],
        seams: [{ between: ['Western Region', 'Eastern Region'] }],
        places: ['Lagos', 'Kano'],
        pins: [{ place: 'Abuja', number: '1991' }],
      }),
      draft('', { areas: [{ name: 'Lagos', label: true, group: 'Capital' }] }),
      draft('Kano', { highlight: [{ name: 'Nigeria' }] }),
    ].map((one) => ({ ...one, base: NIGERIA }));
    for (const shape of ['wide', 'tall'] as const) {
      const frame = await mapFrameOf(NIGERIA, shape);
      expect(frame).not.toBeNull();
      const maps = await Promise.all(
        scenes.map(async (one) => renderMap(readMap(one).spec!, shape)),
      );
      for (const map of maps) {
        expect(map.framed).toBe(true);
        // The frame exactly, the key and the note inside it.
        expect(map.viewBox).toEqual([0, 0, frame!.width, frame!.height]);
        // The same land, drawn the same.
        expect(/<defs><path id="map-land" d="([^"]+)"/.exec(map.svg)?.[1]).toBe(
          /<defs><path id="map-land" d="([^"]+)"/.exec(maps[0].svg)?.[1],
        );
      }
      // A place is at the same point of the drawing in every scene.
      const lagos = (svg: string, id: string) => markOf(svg, id);
      const one = await renderMap(
        readMap({ ...scenes[0], places: ['Lagos'] }).spec!,
        shape,
      );
      expect(lagos(one.svg, one.parts.Lagos)).toEqual(
        lagos(maps[1].svg, maps[1].parts.Lagos),
      );
      // Each shape's frame within its film's limits: wide as Nigeria, or squarer.
      const aspect = frame!.width / frame!.height;
      if (shape === 'tall') expect(aspect).toBeLessThanOrEqual(1.16);
      else expect(aspect).toBeGreaterThanOrEqual(0.8);
    }
    // The same base, the same frame; another shape, another frame.
    const [wide, again, tall] = await Promise.all([
      mapFrameOf(NIGERIA, 'wide'),
      mapFrameOf({ ...NIGERIA, groups: [] }, 'wide'),
      mapFrameOf(NIGERIA, 'tall'),
    ]);
    expect(again).toEqual(wide);
    expect(tall).not.toEqual(wide);
    // A frame made again from its numbers draws the same as one fitted.
    const fitted = await frameFor(wide!.region, 'wide');
    expect(fitted.projection).toEqual(wide!.projection);
  });

  it("keeps its own frame where it asks for more than the show's map, or elsewhere", () => {
    const wider = readMap({
      ...draft('Africa', { highlight: [{ name: 'Nigeria' }] }),
      base: NIGERIA,
    }).spec;
    expect(wider?.base).toBeUndefined();
    const elsewhere = readMap({ ...draft('Ghana'), base: NIGERIA }).spec;
    expect(elsewhere?.base).toBeUndefined();
    const same = readMap({ ...draft('Nigeria'), base: NIGERIA }).spec;
    expect(same?.base?.countries).toEqual(['Nigeria']);
    // A map of a show over a continent draws a country of it in the continent's frame.
    const africa = readMap({
      ...draft('Kenya'),
      base: { kind: 'map', region: 'Africa' },
    }).spec;
    expect(africa?.base?.name).toBe('Africa');
  });

  it("gives a scene's maps the show's one map, and makes the show's map sound", () => {
    const scene = {
      cast: [
        { id: 'map', kind: 'map', map: draft('Nigeria') },
        { id: 'cell', kind: 'drawing' },
      ],
    };
    const given = withShowMap(scene, NIGERIA, [
      { thing: 'Northern Region', colour: 'chart3' },
      { thing: 'nothing', colour: '#ff0000' },
    ]);
    expect(given.cast[0].map?.base?.region).toBe('Nigeria');
    expect(given.cast[0].map?.palette).toEqual([
      { thing: 'Northern Region', colour: 'chart3' },
    ]);
    expect(given.cast[1]).toBe(scene.cast[1]);
    // Done again, the same.
    expect(
      withShowMap(given, NIGERIA, [
        { thing: 'Northern Region', colour: 'chart3' },
      ]),
    ).toEqual(given);
    // No show's map, nothing changed.
    expect(withShowMap(scene, null)).toBe(scene);
    // Made sound: a region code knows, tokens only, members trimmed.
    expect(readMapBase({ kind: 'map', region: 'Narnia' })).toBeNull();
    expect(readMapBase('Nigeria')).toBeNull();
    const sound = readMapBase({
      region: ' Nigeria ',
      groups: [
        { name: 'North', members: ['Kano', '', 7], colour: '#BB7907' },
        { name: 'north', members: ['Sokoto'] },
        { name: '', members: ['Lagos'] },
        { name: 'East', members: null, colour: 'Chart 2', label: false },
      ],
      seams: [
        { between: ['North', 'East'], style: 'glow' },
        { between: ['North'] },
      ],
      year: '1946',
      bordersDiffer: 'yes',
    });
    expect(sound).toEqual({
      kind: 'map',
      region: 'Nigeria',
      groups: [
        { name: 'North', members: ['Kano', '7'], colour: null, label: null },
        { name: 'East', members: [], colour: 'chart2', label: false },
      ],
      seams: [{ between: ['North', 'East'], style: 'glow', name: null }],
      year: 1946,
      bordersDiffer: null,
    });
  });

  it("says a map of the past is drawn with today's borders, unless research says they were the same", async () => {
    const note = async (more: Partial<MapDraft>) => {
      const map = await renderMap(
        readMap(draft('Germany', more)).spec!,
        'wide',
      );
      return map.period && map.svg.includes(`>${PERIOD_NOTE}</text>`);
    };
    expect(await note({ year: 1961 })).toBe(true);
    expect(await note({ year: 1961, bordersDiffer: false })).toBe(false);
    expect(await note({ year: 2020 })).toBe(false);
    expect(await note({ year: 2015, bordersDiffer: true })).toBe(true);
    expect(await note({})).toBe(false);
    // A year from the show's map, and a year not yet come is none.
    expect(readMap({ ...draft('Nigeria'), base: NIGERIA }).spec?.period).toBe(
      true,
    );
    expect(
      readMap(draft('Nigeria', { year: 3020 })).spec?.year,
    ).toBeUndefined();
    // In the frame, in a corner, kept clear of the key.
    const framed = await renderMap(
      readMap({
        ...draft('Nigeria', {
          areas: [
            { name: 'Kano', group: 'Hit' },
            { name: 'Lagos', group: 'Spared' },
          ],
        }),
        base: NIGERIA,
      }).spec!,
      'wide',
    );
    // The key's card and the note each in a corner of their own.
    const [, , W, H] = framed.viewBox;
    const cornerOf = (id: string) => {
      const at = framed.svg.indexOf(`id="${id}"`);
      const [x, y] = /x="([\d.]+)" y="([\d.]+)"/
        .exec(framed.svg.slice(at))!
        .slice(1)
        .map(Number);
      return `${x < W / 2 ? 'left' : 'right'} ${y < H / 2 ? 'top' : 'bottom'}`;
    };
    expect(framed.svg).toContain('id="key"');
    expect(framed.svg).toContain('id="period"');
    expect(cornerOf('key')).not.toBe(cornerOf('period'));
    expect(framed.viewBox[3]).toBe((await mapFrameOf(NIGERIA, 'wide'))!.height);
  });

  it('keeps a framed map exactly its frame on the stage, its ink never cropping it', async () => {
    const spec = readMap({
      ...draft('Nigeria', { groups: [{ name: 'Eastern Region' }] }),
      base: NIGERIA,
    }).spec!;
    const frame = (await mapFrameOf(NIGERIA, 'wide'))!;
    const drawn = await drawByCode(
      { id: 'map', kind: 'map', name: 'Nigeria in 1946', map: spec, text: 40 },
      'wide',
    );
    expect(drawn.viewBox).toEqual([0, 0, frame.width, frame.height]);
    expect(drawn.parts['Eastern Region']).toBe('group-eastern-region');
  }, 60_000);
});
