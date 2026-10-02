import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import { groupColour, readMap, renderMap, type MapDraft } from './scene-map';
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
});
