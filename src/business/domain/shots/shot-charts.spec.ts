import type { FilmShape, ShotSvgAssetDto } from '../../../contracts';
import { SAFE, TEXT } from '../studio/explainer-rules';
import { CHART_SPECS, DARK_LOOK, LIGHT_LOOK } from './__fixtures__/chart-specs';
import {
  coloursFor,
  contrast,
  fit,
  frameOf,
  paintOf,
  said,
  slugOf,
  wholeWords,
  wordsWithin,
  wrap,
} from './shot-chart-kit';
import { CHART_KINDS, chartAsset, chartPartIds, mapAsset } from './shot-charts';

const SHAPES: FilmShape[] = ['wide', 'tall'];

/** Every sample, drawn in both shapes. */
const DRAWN: {
  kind: string;
  name: string;
  shape: FilmShape;
  asset: ShotSvgAssetDto;
}[] = [];
for (const [kind, specs] of Object.entries(CHART_SPECS))
  for (const [name, spec] of Object.entries(specs))
    for (const shape of SHAPES) {
      const asset = chartAsset(kind, spec, LIGHT_LOOK, shape);
      if (!asset) throw new Error(`${kind} ${name} ${shape} drew nothing`);
      DRAWN.push({ kind, name, shape, asset });
    }

const each = DRAWN.map((d) => [`${d.kind} ${d.name} ${d.shape}`, d] as const);

/** The data-part ids an SVG carries, in order. */
const partsIn = (svg: string) =>
  [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);

describe('chartAsset', () => {
  it('draws a sample of every kind it knows', () => {
    const kinds = new Set(DRAWN.map((d) => d.kind));
    for (const kind of CHART_KINDS) expect(kinds.has(kind)).toBe(true);
  });

  it.each(each)(
    '%s: is a still SVG with no motion of its own',
    (_, { asset }) => {
      expect(asset.kind).toBe('svg');
      expect(
        asset.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'),
      ).toBe(true);
      expect(asset.svg.endsWith('</svg>')).toBe(true);
      expect(asset.svg).not.toMatch(
        /<style|@keyframes|animation|<animate|<set\b|class="/i,
      );
      expect(asset.svg).not.toMatch(/<script|on[a-z]+=|javascript:/i);
    },
  );

  it.each(each)(
    '%s: names every part once, and draws every part it names',
    (_, { asset }) => {
      const drawn = partsIn(asset.svg);
      expect(new Set(drawn).size).toBe(drawn.length);
      expect([...drawn].sort()).toEqual(Object.keys(asset.parts).sort());
    },
  );

  it.each(each)('%s: keeps every box inside its own', (_, { asset }) => {
    const [bx, by, bw, bh] = asset.box;
    const inside = (b: number[]) =>
      b.every((n) => Number.isFinite(n)) &&
      b[2] >= 0 &&
      b[3] >= 0 &&
      b[0] >= bx - 1 &&
      b[1] >= by - 1 &&
      b[0] + b[2] <= bx + bw + 1 &&
      b[1] + b[3] <= by + bh + 1;
    for (const [id, part] of Object.entries(asset.parts))
      expect([id, inside(part.box)]).toEqual([id, true]);
    expect(asset.focal && inside(asset.focal)).toBe(true);
  });

  it.each(each)(
    '%s: is the full frame of its shape (a tall list may run on down)',
    (_, { asset, shape }) => {
      const { W, H } = frameOf(shape);
      expect(asset.box.slice(0, 3)).toEqual([0, 0, W]);
      if (shape === 'wide') expect(asset.box[3]).toBe(H);
      else expect(asset.box[3]).toBeGreaterThanOrEqual(H);
    },
  );

  it.each(each)(
    '%s: sets no words under the floor a viewer must read (the source at the chip size)',
    (_, { asset, shape }) => {
      // Text is a share of the frame's short side (the rules file).
      const { W, H: frameH } = frameOf(shape);
      const H = Math.min(W, frameH);
      const sizes = [
        ...asset.svg.matchAll(/<text[^>]*font-size="([\d.]+)"/g),
      ].map((m) => Number(m[1]));
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes)
        expect(size).toBeGreaterThanOrEqual(
          Math.floor(TEXT.chip * H * 10) / 10,
        );
      const source = asset.svg.match(
        /data-part="source"[^>]*font-size="([\d.]+)"/,
      );
      const others = [
        ...asset.svg.matchAll(
          /<text(?![^>]*data-part="source")[^>]*font-size="([\d.]+)"/g,
        ),
      ].map((m) => Number(m[1]));
      for (const size of others)
        expect(size).toBeGreaterThanOrEqual(
          Math.floor(TEXT.mustRead * H * 10) / 10,
        );
      if (source) expect(Number(source[1])).toBeCloseTo(TEXT.chip * H, 0);
    },
  );

  it.each(each)(
    '%s: in a wide frame keeps its words inside the safe area',
    (_, { asset, shape }) => {
      if (shape !== 'wide') return;
      const { W, H } = frameOf('wide');
      const words = Object.entries(asset.parts).filter(([id]) =>
        /^(label|value|date|title|number|unit|prefix|source|speaker|quote-line|old|new|key|total|headline|x-label|y-label)/.test(
          id,
        ),
      );
      for (const [id, part] of words) {
        const [x, y, w, h] = part.box;
        expect([
          id,
          x >= SAFE.wide.x0 * W - 2 &&
            x + w <= SAFE.wide.x1 * W + 2 &&
            y >= SAFE.wide.y0 * H - 2 &&
            y + h <= SAFE.wide.y1 * H + 2,
        ]).toEqual([id, true]);
      }
    },
  );

  it.each(each)(
    "%s: keeps every word out of the captions' band at the foot",
    (_, { asset, shape }) => {
      const { H } = frameOf(shape);
      const foot = SAFE[shape].captionY0 * H + 1;
      const top = SAFE[shape].y0 * H - 1;
      for (const m of asset.svg.matchAll(/<text([^>]*)>(.*?)<\/text>/g)) {
        const size = Number(/font-size="([\d.]+)"/.exec(m[1])?.[1] ?? 0);
        const ys = [
          Number(/ y="([-\d.]+)"/.exec(m[1])?.[1] ?? NaN),
          ...[...m[2].matchAll(/<tspan[^>]* y="([-\d.]+)"/g)].map((t) =>
            Number(t[1]),
          ),
        ].filter((y) => Number.isFinite(y));
        const words = m[2].replace(/<[^>]+>/g, '');
        // A tall list in pages of a frame's height each: each word against its own page's band.
        for (const y of ys) {
          const page = Math.floor((y - size * 0.75) / H) * H;
          expect([words, y - page + size * 0.2 <= foot]).toEqual([words, true]);
          expect([words, y - page - size * 0.75 >= top]).toEqual([words, true]);
        }
      }
    },
  );

  it.each(each)(
    '%s: draws the same for the same spec, every time',
    (_, { kind, name, shape, asset }) => {
      const again = chartAsset(
        kind,
        CHART_SPECS[kind][name],
        LIGHT_LOOK,
        shape,
      );
      expect(JSON.stringify(again)).toBe(JSON.stringify(asset));
    },
  );

  it('draws the main parts under the same names in either shape', () => {
    for (const [kind, specs] of Object.entries(CHART_SPECS))
      for (const spec of Object.values(specs)) {
        const wide = chartPartIds(kind, spec, 'wide');
        const tall = chartPartIds(kind, spec, 'tall');
        const main = (ids: string[]) =>
          ids
            .filter(
              (id) =>
                /^(bar|event|group|icon|node|seat|token|side|day|date|number|quote-line|curve|point)-?/.test(
                  id,
                ) && !id.startsWith('quote-line'),
            )
            .sort();
        expect([kind, main(tall)]).toEqual([kind, main(wide)]);
      }
  });

  it('draws in the look: its paper, its ink and its accent', () => {
    const asset = chartAsset(
      'counter',
      CHART_SPECS.counter.share,
      DARK_LOOK,
      'wide',
    )!;
    expect(asset.svg).toContain(`fill="${DARK_LOOK.palette.paper}"`);
    expect(asset.svg).toContain(`fill="${DARK_LOOK.palette.accent}"`);
    expect(asset.svg).toContain(
      DARK_LOOK.fonts.display.replace(/"/g, '&quot;'),
    );
  });

  it('colours a bar in the side of its name, and says so by its role', () => {
    const asset = chartAsset(
      'chart',
      CHART_SPECS.chart.regions,
      LIGHT_LOOK,
      'wide',
    )!;
    expect(asset.parts['bar-northern-region'].role).toBe('Northern Region');
    expect(asset.svg).toMatch(/data-part="bar-northern-region" fill="#B26F00"/);
    expect(asset.parts['bar-northern-region'].value).toBe(16.8);
    expect(asset.parts['bar-northern-region'].pivot).toEqual([0.5, 1]);
  });

  it('gives a counter its number as a part a count can roll, with its value', () => {
    const asset = chartAsset(
      'counter',
      CHART_SPECS.counter.people,
      LIGHT_LOOK,
      'tall',
    )!;
    expect(asset.parts.number.value).toBe(45);
    expect(asset.svg).toMatch(
      /<text data-part="number"[^>]*text-anchor="end"[^>]*>45<\/text>/,
    );
    expect(asset.svg).toContain('tabular-nums');
    expect(Object.keys(asset.parts)).toEqual(
      expect.arrayContaining(['number', 'unit', 'prefix', 'label', 'source']),
    );
  });

  it('gives paths to what is drawn on or travelled along', () => {
    const timeline = chartAsset(
      'timeline',
      CHART_SPECS.timeline.road,
      LIGHT_LOOK,
      'wide',
    )!;
    expect(timeline.parts.spine.path).toMatch(/^M[\d.]+ [\d.]+H[\d.]+$/);
    const flow = chartAsset('flow', CHART_SPECS.flow.law, LIGHT_LOOK, 'wide')!;
    const paths = Object.entries(flow.parts).filter(([id]) =>
      id.startsWith('path-'),
    );
    expect(paths).toHaveLength(4);
    for (const [, part] of paths) expect(part.path).toMatch(/^M/);
    const transfer = chartAsset(
      'transfer',
      CHART_SPECS.transfer.taxes,
      LIGHT_LOOK,
      'wide',
    )!;
    expect(transfer.parts.arc.path).toMatch(/^M[\d.]+ [\d.]+C/);
    expect(
      Object.keys(transfer.parts).filter((id) => id.startsWith('token-')),
    ).toHaveLength(5);
    const plot = chartAsset(
      'plot',
      CHART_SPECS.plot.parabola,
      LIGHT_LOOK,
      'wide',
    )!;
    expect(plot.parts.curve.path).toMatch(/^M/);
  });

  it("marks what belongs to the picture's later state", () => {
    const strike = chartAsset(
      'strike',
      CHART_SPECS.strike.motion,
      LIGHT_LOOK,
      'wide',
    )!;
    expect(strike.parts.new.later).toBe(true);
    expect(strike.parts.strike.later).toBe(true);
    expect(strike.parts.old.later).toBeUndefined();
    const doc = chartAsset(
      'document',
      CHART_SPECS.document.report,
      LIGHT_LOOK,
      'wide',
    )!;
    expect(doc.parts.stamp.later).toBe(true);
    const cal = chartAsset(
      'calendar',
      CHART_SPECS.calendar.years,
      LIGHT_LOOK,
      'wide',
    )!;
    expect(cal.parts.merge.later).toBe(true);
  });

  it('lays a month out on its real weekdays, the day marked', () => {
    const asset = chartAsset(
      'calendar',
      CHART_SPECS.calendar.day,
      LIGHT_LOOK,
      'wide',
    )!;
    // 1 October 1960 was a Saturday: day 1 sits in the sixth column.
    const day1 = asset.parts['day-1'].box;
    const day3 = asset.parts['day-3'].box;
    expect(day1[0]).toBeGreaterThan(day3[0]);
    expect(
      Object.keys(asset.parts).filter((id) => id.startsWith('day-')),
    ).toHaveLength(31);
    expect(asset.parts.date.value).toBe(1);
    expect(asset.svg).toContain('Saturday');
  });

  it("names a graph's points apart from each other and off its axes, in either shape", () => {
    const apart = (a: number[], b: number[]) =>
      a[0] + a[2] <= b[0] ||
      b[0] + b[2] <= a[0] ||
      a[1] + a[3] <= b[1] ||
      b[1] + b[3] <= a[1];
    for (const shape of SHAPES) {
      const asset = chartAsset(
        'plot',
        CHART_SPECS.plot.parabola,
        LIGHT_LOOK,
        shape,
      )!;
      const names = Object.entries(asset.parts).filter(([id]) =>
        /^label-/.test(id),
      );
      expect(names.length).toBeGreaterThanOrEqual(2);
      names.forEach(([id, { box }], i) => {
        for (const [other, part] of names.slice(i + 1))
          expect([id, other, shape, apart(box, part.box)]).toEqual([
            id,
            other,
            shape,
            true,
          ]);
        for (const axis of ['axis-x', 'axis-y'])
          expect([id, axis, shape, apart(box, asset.parts[axis].box)]).toEqual([
            id,
            axis,
            shape,
            true,
          ]);
      });
    }
  });

  it("turns a document's stamp clear of its headline, inside the words' area and out of the captions' band", () => {
    for (const shape of SHAPES) {
      const { text, size } = frameOf(shape);
      const asset = chartAsset(
        'document',
        CHART_SPECS.document.report,
        LIGHT_LOOK,
        shape,
      )!;
      const [x, y, w, h] = asset.parts.stamp.box;
      const headline = asset.parts.headline.box;
      expect([shape, y + h <= text.y1 + 1]).toEqual([shape, true]);
      expect([shape, x >= text.x0 - 1 && x + w <= text.x1 + 1]).toEqual([
        shape,
        true,
      ]);
      expect([
        shape,
        y >= headline[1] + headline[3] - size.label * 0.3,
      ]).toEqual([shape, true]);
    }
  });

  it('lights a chamber by party, what is left over muted', () => {
    const asset = chartAsset(
      'seats',
      CHART_SPECS.seats.house,
      LIGHT_LOOK,
      'wide',
    )!;
    expect(asset.parts['group-npc'].role).toBe('NPC');
    expect(asset.parts['group-npc'].value).toBe(134);
    expect(asset.parts['group-others'].role).toBe('muted');
    expect(asset.parts.total.value).toBe(312);
    expect(asset.svg).toContain('157 for a majority');
  });

  it('escapes every word it is given', () => {
    const asset = chartAsset(
      'chart',
      {
        chart: {
          kind: 'bar',
          unit: null,
          bars: [
            { label: '<script>alert(1)</script>', value: 3 },
            { label: 'A & "B"', value: 4 },
          ],
        },
      },
      LIGHT_LOOK,
      'wide',
    )!;
    expect(asset.svg).not.toContain('<script');
    expect(asset.svg).toContain('&lt;script&gt;');
    expect(asset.svg).toContain('A &amp; &quot;B&quot;');
  });

  it('draws nothing for a kind it does not know, a name card, or a spec it cannot read', () => {
    expect(chartAsset('molecule', {}, LIGHT_LOOK, 'wide')).toBeNull();
    expect(
      chartAsset(
        'namecard',
        {
          namecard: { name: 'Herbert Macaulay', role: 'Engineer', line: null },
        },
        LIGHT_LOOK,
        'wide',
      ),
    ).toBeNull();
    for (const kind of CHART_KINDS)
      expect([kind, chartAsset(kind, {}, LIGHT_LOOK, 'tall')]).toEqual([
        kind,
        null,
      ]);
    expect(
      chartAsset(
        'chart',
        { chart: { kind: 'bar', bars: [{ label: 'One', value: 1 }] } },
        LIGHT_LOOK,
        'wide',
      ),
    ).toBeNull();
    expect(
      chartAsset(
        'plot',
        { plot: { fn: 'x +', xFrom: 0, xTo: 1 } },
        LIGHT_LOOK,
        'wide',
      ),
    ).toBeNull();
  });

  it("reads a spec under its kind's name or as it is", () => {
    const nested = chartAsset(
      'counter',
      { counter: { value: 12, unit: '%' } },
      LIGHT_LOOK,
      'wide',
    );
    const flat = chartAsset(
      'counter',
      { value: 12, unit: '%' },
      LIGHT_LOOK,
      'wide',
    );
    expect(flat).toEqual(nested);
  });
});

describe('the kit', () => {
  it("sizes words by the rules, as shares of the frame's height", () => {
    expect(frameOf('wide').size.label).toBeCloseTo(TEXT.mustRead * 900, 1);
    expect(frameOf('tall').size.label).toBeCloseTo(TEXT.mustRead * 900, 1);
    expect(frameOf('tall').text.y1).toBeCloseTo(SAFE.tall.captionY0 * 1600, 1);
  });

  it('names parts from their names in any script', () => {
    expect(slugOf('Northern Region')).toBe('northern-region');
    expect(slugOf('São Paulo')).toBe('sao-paulo');
    expect(slugOf('東京')).toBe('東京');
    expect(slugOf('!!!')).toBe('');
  });

  it('never sets words under their floor, and breaks a long word rather than cutting it', () => {
    const set = fit('Constitutionalisation', 300, 80, 50, 3);
    expect(set.size).toBe(50);
    expect(set.lines.join('').replace(/-/g, '')).toBe('Constitutionalisation');
    expect(wrap('Self-government begins', 520, 50, 3)).toEqual([
      'Self-government',
      'begins',
    ]);
    expect(wrap('Self-government begins', 400, 50, 3)).toEqual([
      'Self-',
      'government',
      'begins',
    ]);
  });

  it('cuts words it must shorten only between whole words, or with a hyphen', () => {
    const long = 'The fears of minorities and the means of allaying them';
    const cut = said(long, 40);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut).toBe('The fears of minorities and the means…');
    expect(said('Constitutionalisation', 10)).toBe('Constitut-');
    expect(said('  short  words ', 40)).toBe('short words');
    expect(wholeWords('One two three', 9)).toBe('One two…');
    expect(
      wordsWithin(
        { label: long, groups: [{ name: long }] },
        { label: 30, name: 20 },
      ),
    ).toEqual({
      label: 'The fears of minorities and…',
      groups: [{ name: 'The fears of…' }],
    });
    // Words past the fitter's last line are let go at a whole word.
    const set = fit(long, 300, 50, 50, 2);
    expect(set.lines).toHaveLength(2);
    expect(set.lines[1].endsWith('…')).toBe(true);
    for (const word of set.lines.join(' ').replace('…', '').split(' '))
      expect(long.split(' ')).toContain(word);
  });

  it("keeps a reader's own cut out of the middle of a word", () => {
    const label =
      'people who lived in the colony when the census was taken that year';
    const asset = chartAsset(
      'counter',
      { counter: { value: 45, unit: 'million', label } },
      LIGHT_LOOK,
      'wide',
    )!;
    const words = [
      ...asset.svg.matchAll(/data-part="label"[^>]*>(.*?)<\/text>/g),
    ]
      .map((m) => m[1].replace(/<[^>]+>/g, ' '))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(words.endsWith('…')).toBe(true);
    for (const word of words.replace('…', '').split(' '))
      expect(label.split(' ')).toContain(word);
    // A document's title taken from its name, longer than the reader keeps.
    const name = 'Report of the Commission appointed to enquire into the fears';
    const paper = chartAsset(
      'document',
      { name, document: { headline: 'Not recommended' } },
      LIGHT_LOOK,
      'wide',
    )!;
    const title = [
      ...paper.svg.matchAll(/data-part="title"[^>]*>(.*?)<\/text>/g),
    ]
      .map((m) => m[1].replace(/<[^>]+>/g, ' '))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(title.endsWith('…')).toBe(true);
    for (const word of title.replace('…', '').split(' '))
      expect(name.split(' ')).toContain(word);
  });

  it('colours several things apart, what is left over muted', () => {
    const paint = paintOf(LIGHT_LOOK);
    const colours = coloursFor(paint, [
      { name: 'NPC' },
      { name: 'Alpha' },
      { name: 'Beta' },
      { name: 'Others' },
    ]);
    expect(colours[0]).toEqual({ colour: '#B26F00', role: 'NPC' });
    expect(colours[3].role).toBe('muted');
    expect(new Set(colours.map((c) => c.colour)).size).toBe(4);
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});

describe('mapAsset', () => {
  const base = {
    kind: 'map' as const,
    region: 'Nigeria',
    groups: [
      {
        name: 'Northern Region',
        members: ['Kano', 'Kaduna', 'Sokoto', 'Borno'],
      },
      { name: 'Western Region', members: ['Lagos', 'Ogun', 'Oyo'] },
    ],
    seams: [],
    year: null,
    bordersDiffer: null,
  };

  it("draws the show's map full frame, its regions named parts in their sides' colours, with no motion of its own", async () => {
    for (const shape of SHAPES) {
      const asset = await mapAsset(base, LIGHT_LOOK, shape);
      expect(asset).not.toBeNull();
      const { W, H } = frameOf(shape);
      expect(asset!.box).toEqual([0, 0, W, H]);
      expect(asset!.svg).not.toMatch(/<style|@keyframes|animation|class="/);
      expect(asset!.svg).not.toMatch(/id="map-(frame|land)"/);
      expect(asset!.parts['group-northern-region'].role).toBe(
        'Northern Region',
      );
      expect(asset!.svg).toContain('#B26F00');
      expect([...partsIn(asset!.svg)].sort()).toEqual(
        Object.keys(asset!.parts).sort(),
      );
      for (const part of Object.values(asset!.parts)) {
        const [x, y, w, h] = part.box;
        expect(x >= 0 && y >= 0 && x + w <= W + 1 && y + h <= H + 1).toBe(true);
      }
    }
  });

  it('gives a route its path and a place its mark', async () => {
    const asset = await mapAsset(
      {
        region: 'Nigeria',
        highlight: null,
        places: ['Kano', 'Lagos'],
        routes: [{ from: 'Lagos', to: 'Kano', name: 'The tour north' }],
        base,
      },
      LIGHT_LOOK,
      'wide',
    );
    expect(asset!.parts['route-the-tour-north'].path).toMatch(
      /^M[\d.]+ [\d.]+Q/,
    );
    expect(asset!.parts['place-kano']).toBeDefined();
    expect(asset!.parts['label-kano']).toBeDefined();
  });

  it("keeps its names, its key and a past map's note inside the words' area, out of the captions' band", async () => {
    const past = { ...base, year: 1959 };
    const tour = {
      region: 'Nigeria',
      highlight: null,
      places: ['Kano', 'Lagos'],
      routes: [{ from: 'Lagos', to: 'Kano', name: 'The tour north' }],
      groups: base.groups.map((g) => ({ name: g.name })),
      base: past,
    };
    const europe = {
      region: 'Europe',
      highlight: [
        { name: 'France', label: true, group: 'Founders' },
        { name: 'Germany', label: true, group: 'Founders' },
        { name: 'Poland', label: true, group: 'Joined later' },
      ],
      places: ['Brussels'],
      routes: null,
    };
    for (const shape of SHAPES) {
      const { text } = frameOf(shape);
      const assets = await Promise.all(
        [past, tour, europe].map((input) => mapAsset(input, LIGHT_LOOK, shape)),
      );
      expect(assets[0]!.parts.period).toBeDefined();
      expect(assets[1]!.parts['label-kano']).toBeDefined();
      expect(assets[2]!.parts.key).toBeDefined();
      for (const asset of assets)
        for (const [id, part] of Object.entries(asset!.parts)) {
          if (!/^label-|^key$|^period$/.test(id)) continue;
          const [x, y, w, h] = part.box;
          expect({
            id,
            shape,
            inside:
              x >= text.x0 - 1 &&
              y >= text.y0 - 1 &&
              x + w <= text.x1 + 1 &&
              y + h <= text.y1 + 1,
          }).toEqual({ id, shape, inside: true });
        }
    }
  });

  it('draws nothing for a map of nowhere code knows', async () => {
    expect(
      await mapAsset(
        { region: 'Atlantis', highlight: null, places: null, routes: null },
        LIGHT_LOOK,
        'wide',
      ),
    ).toBeNull();
  });
});
