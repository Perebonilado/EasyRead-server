import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import {
  counterText,
  numberOf,
  readCounter,
  renderCounter,
} from './scene-counter';
import {
  gridOf,
  perIcon,
  readIcons,
  renderIcons,
  wavesOf,
} from './scene-icons';
import {
  bustOf,
  initialsOf,
  readNamecard,
  renderNamecard,
  withBust,
} from './scene-namecard';
import { faceOf, pageOf, readCalendar, renderCalendar } from './scene-calendar';
import { benches, hemicycle, readSeats, renderSeats } from './scene-seats';
import { readStrike, renderStrike } from './scene-strike';
import { readTransfer, renderTransfer } from './scene-transfer';
import { readDocument, renderDocument } from './scene-document';
import { readSplit, renderSplit } from './scene-split';
import {
  TEXT_FLOOR,
  fitWords,
  sourceText,
  styleOf,
  withSourceLine,
  type InfographicDrawing,
} from './scene-infographic-style';
import { sanitizeTree } from './scene-svg';
import { PAPER, codeColour } from './scene-themes';

/** What every infographic drawing keeps to: safe, its parts and states its own groups, in the theme's tokens, readable, small. */
function sound(d: InfographicDrawing, text = TEXT_FLOOR, own: string[] = []) {
  const root = parseDocument(d.svg, { xmlMode: true }).children.find(
    (n) => 'name' in n && (n as Element).name === 'svg',
  ) as Element;
  expect(sanitizeTree(root)).toEqual([]);
  expect(d.svg).toContain(`viewBox="${d.viewBox.join(' ')}"`);
  expect(d.viewBox[2]).toBeGreaterThan(0);
  expect(d.viewBox[3]).toBeGreaterThan(0);
  const ids = [...d.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of [...Object.values(d.parts), ...Object.values(d.states)])
    expect(ids).toContain(id);
  // Every colour a token of the paper theme: recoloured for every other look.
  for (const m of d.svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g))
    if (!own.includes(m[1].toUpperCase()))
      expect([m[1], codeColour(m[1], PAPER)]).not.toEqual([m[1], null]);
  // Never words smaller than its audience reads (a hair under, as set).
  const sizes = [...d.svg.matchAll(/font-size="([\d.]+)"/g)].map((m) =>
    Number(m[1]),
  );
  if (sizes.length)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(text * 0.8 - 0.05);
  expect(d.svg.length).toBeLessThan(30_000);
  // Its motion is the house's, clear of the player's own loops.
  expect(d.svg).not.toMatch(/@keyframes (?:step|bob|rig-step)\b/);
}

describe('the infographic style', () => {
  it('writes only the keyframes a drawing uses', () => {
    const style = styleOf({
      a: 'animation:ig-wipe-down .3s both',
      b: 'animation:ig-pop .4s both',
    });
    expect(style).toContain('@keyframes ig-wipe-down');
    expect(style).toContain('@keyframes ig-pop');
    expect(style).not.toContain('@keyframes ig-wipe{');
    expect(style).toContain('.a{animation:ig-wipe-down .3s both}');
  });

  it('fits words to a width, smaller and on more lines before it cuts them short', () => {
    const one = fitWords('People lived in the colony', 2000, 60, 30, 2);
    expect(one).toEqual({ size: 60, lines: ['People lived in the colony'] });
    const two = fitWords('People lived in the colony', 500, 60, 30, 2);
    expect(two.lines.length).toBe(2);
    const cut = fitWords(
      'A very long caption that will never fit in this narrow room at all',
      200,
      40,
      30,
      2,
    );
    expect(cut.lines).toHaveLength(2);
    expect(cut.lines[1].endsWith('…')).toBe(true);
  });

  it('says where a number is from, once', () => {
    expect(sourceText('K.W.J. Post, 1963')).toBe('Source: K.W.J. Post, 1963');
    expect(sourceText('Source: UN, 2024')).toBe('Source: UN, 2024');
    expect(sourceText('Census 2011')).toBe('Source: Census 2011');
    expect(sourceText('From the 1952 census')).toBe('From the 1952 census');
    expect(sourceText('  ')).toBeNull();
  });

  it('sets a source line under a drawing at its own smallest words, its frame grown to hold it', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 620"><text font-size="22">5</text><text font-size="28">x</text></svg>';
    const out = withSourceLine(svg, [0, 0, 1000, 620], 'Source: UN, 2024');
    expect(out.viewBox[3]).toBeGreaterThan(620);
    expect(out.svg).toContain('<g id="source"><text');
    expect(out.svg).toContain('font-size="22"');
    expect(out.svg).toContain(`viewBox="${out.viewBox.join(' ')}"`);
  });
});

describe('counter', () => {
  it('reads a number however the writer wrote it', () => {
    expect(numberOf(45)).toEqual({ value: 45, places: 0 });
    expect(numberOf('1,500,000')).toEqual({ value: 1500000, places: 0 });
    expect(numberOf('about 3.5 million')).toEqual({ value: 3.5, places: 1 });
    expect(numberOf('many')).toBeNull();
    expect(counterText(1500000, 0)).toBe('1,500,000');
    expect(counterText(3.5, 1)).toBe('3.5');
  });

  it('is made sound: no number, no counter; a later value the same is no later value', () => {
    expect(
      readCounter({
        value: null,
        unit: null,
        prefix: null,
        label: null,
        then: null,
      }),
    ).toBeNull();
    const spec = readCounter(
      {
        value: '45',
        unit: ' million ',
        prefix: 'about',
        label: 'people',
        then: 45,
      },
      { colour: 'chart 2', source: 'UN' },
    );
    expect(spec).toEqual({
      value: 45,
      places: 0,
      unit: 'million',
      prefix: 'about',
      label: 'people',
      then: null,
      colour: 'chart2',
      source: 'UN',
    });
  });

  it.each(['wide', 'tall'] as const)(
    'rolls up to its value, in the %s frame',
    (shape) => {
      const d = renderCounter(
        readCounter(
          {
            value: 45,
            unit: 'million',
            prefix: 'about',
            label: 'people lived in the colony',
            then: 52,
          },
          { source: 'Census, 1952' },
        )!,
        shape,
      );
      sound(d);
      expect(Object.keys(d.parts)).toEqual(['number', 'label', 'source']);
      expect(d.states).toEqual({ then: 'counter-then' });
      expect(d.viewBox[2]).toBe(shape === 'wide' ? 1400 : 720);
      // Still, each wheel stands at its own digit: 4, 5, then (later) 5, 2.
      const wheels = [
        ...d.svg.matchAll(
          /<g class="roll"[^>]*>((?:<text[^>]*>\d<\/text>)+)<\/g>/g,
        ),
      ].map((m) => [...m[1].matchAll(/>(\d)</g)].pop()![1]);
      expect(wheels.join('')).toBe('4552');
      expect(d.svg).toContain('clip-path="url(#counter-window)"');
    },
  );
});

describe('icons', () => {
  it('stands each icon for a round number when there are too many to draw', () => {
    expect(perIcon(45, 100)).toBe(1);
    expect(perIcon(45000, 100)).toBe(500);
    expect(perIcon(45000, 100, 1000)).toBe(1000);
    expect(perIcon(45000, 100, 3)).toBe(500);
    expect(perIcon(3_000_000, 80)).toBe(50000);
  });

  it('comes in waves, each as many as all before it', () => {
    expect(wavesOf(10)).toEqual([0, 1, 2, 2, 3, 3, 3, 3, 4, 4]);
    expect(
      gridOf(45, 1400, 500).cols * gridOf(45, 1400, 500).rows,
    ).toBeGreaterThanOrEqual(45);
  });

  it('is made sound: its icon read from what it counts', () => {
    const spec = readIcons(
      {
        icon: null,
        count: '45,000',
        per: 1000,
        unit: 'troops',
        label: 'sent to Burma',
        highlight: 12000,
        highlightLabel: 'never came home',
      },
      'Soldiers',
      { source: 'War Office' },
    )!;
    expect(spec.icon).toBe('soldier');
    expect(spec.per).toBe(1000);
    expect(spec.highlight).toEqual({ count: 12000, label: 'never came home' });
    expect(
      readIcons(
        {
          icon: 'dot',
          count: 0,
          per: null,
          unit: null,
          label: null,
          highlight: null,
          highlightLabel: null,
        },
        'x',
      ),
    ).toBeNull();
    // A highlight as large as the whole is no highlight.
    expect(
      readIcons(
        {
          icon: 'dot',
          count: 5,
          per: null,
          unit: null,
          label: null,
          highlight: 5,
          highlightLabel: null,
        },
        'x',
      )!.highlight,
    ).toBeNull();
  });

  it.each(['wide', 'tall'] as const)(
    'draws as many icons as it counts, its subset a state, in the %s frame',
    (shape) => {
      const spec = readIcons(
        {
          icon: 'soldier',
          count: 45000,
          per: 1000,
          unit: 'soldiers',
          label: 'Soldiers sent to Burma',
          highlight: 12000,
          highlightLabel: 'never came home',
        },
        'Soldiers',
        { source: 'War Office, 1946' },
      )!;
      const d = renderIcons(spec, shape);
      sound(d);
      expect(
        (d.svg.match(/<use href="#i-soldier"[^>]*class="pop"/g) ?? []).length,
      ).toBe(45 + 12);
      expect(d.states).toEqual({
        highlight: 'icons-highlight',
        'never came home': 'icons-highlight',
      });
      expect(d.parts).toMatchObject({
        icons: 'icons-grid',
        label: 'icons-label',
        key: 'icons-key',
        source: 'source',
      });
      // The rest dimmed when picked out, as still as moving.
      expect(d.svg).toMatch(/class="dim"[^>]*opacity="0.6"/);
      expect(d.svg).toContain('= 1,000 soldiers');
    },
  );

  it('draws a part of an icon for a part of a count', () => {
    const d = renderIcons(
      readIcons(
        {
          icon: 'coin',
          count: 3.5,
          per: null,
          unit: 'billion dollars',
          label: null,
          highlight: null,
          highlightLabel: null,
        },
        'x',
      )!,
    );
    sound(d);
    expect((d.svg.match(/<use href="#i-coin"/g) ?? []).length).toBe(4 + 1);
    expect(d.svg).toContain('clip-path="url(#icons-part)"');
    expect(d.svg).toContain('= 1 billion dollars');
  });
});

describe('namecard', () => {
  it.each([
    ['Obafemi Awolowo', 'OA'],
    ['Sir Abubakar Tafawa Balewa', 'AB'],
    ['Dr. Kwame Nkrumah', 'KN'],
    ['Gandhi', 'G'],
    ['Marie Skłodowska-Curie', 'MC'],
  ])('%s is %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });

  it.each(['wide', 'tall'] as const)(
    'draws its portrait, name, role and line as parts, in the %s frame',
    (shape) => {
      const spec = readNamecard(
        {
          name: 'Obafemi Awolowo',
          role: 'Premier of the Western Region',
          line: 'Wanted a federation of strong regions',
        },
        'Awolowo',
        { colour: 'chart2' },
      )!;
      const d = renderNamecard(spec, shape);
      sound(d);
      expect(Object.keys(d.parts)).toEqual([
        'portrait',
        'name',
        'role',
        'line',
      ]);
      expect(d.svg).toContain('>OA<');
      expect(d.svg).toContain(`stroke="${PAPER.chart[2]}"`);
      // Tall stands the portrait over the words, centred; wide beside them.
      expect(d.svg).toMatch(
        shape === 'tall'
          ? /id="card-name">.*text-anchor="middle"/
          : /id="card-name">.*text-anchor="start"/,
      );
    },
  );

  it("takes a kit bust into its slot: its ids its own, its colours kept but for the person's", () => {
    const spec = readNamecard({ name: 'Ada', role: null, line: null }, 'Ada', {
      colour: 'chart0',
    })!;
    const bust =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><g id="head"><circle cx="50" cy="40" r="20" fill="#8D5524" stroke="#2D2A32"/></g>' +
      `<rect id="coat" x="20" y="70" width="60" height="50" fill="${PAPER.chart[0]}"/><rect id="collar" fill="#FFFFFF" width="5" height="5"/><script>alert(1)</script></svg>`;
    const carded = withBust(
      { id: 'x', kind: 'namecard', namecard: spec },
      bust,
    );
    const kept = carded.namecard.bust!;
    expect(kept.viewBox).toEqual([0, 0, 100, 120]);
    expect(kept.svg).toContain('id="bust-head"');
    expect(kept.svg).not.toContain('<script');
    // The kit's ink and a white collar stay as drawn in every look; the coat is the show's colour.
    expect(kept.svg).not.toContain('#2D2A32');
    expect(kept.svg).not.toMatch(/fill="#FFFFFF"/);
    expect(kept.svg).toContain(`fill="${PAPER.chart[0]}"`);
    const d = renderNamecard(carded.namecard);
    sound(d, TEXT_FLOOR, ['#EFE9DD', '#8D5524', '#2D2A31', '#FFFFFE']);
    expect(d.svg).toContain('clip-path="url(#card-portrait-clip)"');
    expect(d.svg).not.toContain('>A<');
    expect(bustOf('not svg')).toBeNull();
    // A card with no bust, given nothing readable, is as it was.
    expect(withBust(spec, '<p>no</p>')).toBe(spec);
  });
});

describe('calendar', () => {
  it.each([
    ['1 October 1960', { day: 1, month: 10, year: '1960' }],
    ['October 1, 1960', { day: 1, month: 10, year: '1960' }],
    ['1960-10-01', { day: 1, month: 10, year: '1960' }],
    ['May 1953', { day: null, month: 5, year: '1953' }],
    ['1957', { day: null, month: null, year: '1957' }],
    ['44 BC', { day: null, month: null, year: '44 BC' }],
    ['3rd of March', { day: 3, month: 3, year: null }],
    ['Day 44', { day: null, month: null, year: null }],
  ])('reads "%s"', (text, read) => {
    expect(pageOf(text)).toMatchObject({ text, ...read });
  });

  it('shows on a page what its date says', () => {
    expect(faceOf(pageOf('1 October 1960')!)).toEqual({
      band: 'OCTOBER 1960',
      big: '1',
    });
    expect(faceOf(pageOf('May 1953')!)).toEqual({ band: '1953', big: 'MAY' });
    expect(faceOf(pageOf('1957')!)).toEqual({ band: '', big: '1957' });
    expect(faceOf(pageOf('Day 44')!)).toEqual({ band: '', big: 'Day 44' });
  });

  it('is made sound: one calendar has nothing to meet, so its meeting is its next page', () => {
    const one = readCalendar({
      calendars: [{ label: null, dates: ['1957', ''] }],
      merge: '1960',
    })!;
    expect(one.calendars[0].pages.map((p) => p.text)).toEqual(['1957', '1960']);
    expect(one.merge).toBeNull();
    expect(readCalendar({ calendars: [], merge: null })).toBeNull();
  });

  it.each(['wide', 'tall'] as const)(
    'flips its later pages and merges, as states, in the %s frame',
    (shape) => {
      const spec = readCalendar({
        calendars: [
          { label: 'West: self-rule', dates: ['1957', '1958'] },
          { label: 'North: self-rule', dates: ['1959'] },
        ],
        merge: '1 October 1960',
      })!;
      const d = renderCalendar(spec, shape);
      sound(d);
      expect(d.parts).toEqual({
        'West: self-rule': 'calendar-1',
        'North: self-rule': 'calendar-2',
      });
      expect(d.states).toMatchObject({
        '1958': 'calendar-1-page-2',
        'page 2': 'calendar-1-page-2',
        merge: 'calendar-merge',
        '1 October 1960': 'calendar-merge',
      });
      // A page turning away is gone when still: the still is the page it turned to.
      expect(d.svg).toMatch(/class="flip" opacity="0"/);
      expect(d.svg).toMatch(/class="gather" opacity="0"/);
    },
  );
});

describe('seats', () => {
  it.each([12, 46, 312, 650])(
    'lays %i seats round a hemicycle, none touching',
    (n) => {
      const { seats, dot } = hemicycle(n);
      expect(seats).toHaveLength(n);
      let nearest = Infinity;
      for (let i = 0; i < seats.length; i += 1)
        for (let j = i + 1; j < seats.length; j += 1)
          nearest = Math.min(
            nearest,
            Math.hypot(seats[i].x - seats[j].x, seats[i].y - seats[j].y),
          );
      expect(nearest).toBeGreaterThanOrEqual(dot * 2 - 1e-9);
      // In order round the arc: each a wedge's.
      expect(new Set(seats.map((s) => s.order)).size).toBe(n);
    },
  );

  it('lays a chamber as two benches facing', () => {
    const { seats, rows } = benches(46);
    expect(seats).toHaveLength(46);
    expect(seats.filter((s) => s.y < rows)).toHaveLength(23);
  });

  it('is made sound: groups added up, more than six as Others, nothing without seats', () => {
    const spec = readSeats(
      {
        layout: 'parliament',
        groups: [
          { name: 'A', seats: '10' },
          { name: 'a', seats: 5 },
          { name: 'B', seats: 3 },
          { name: 'C', seats: 2 },
          { name: 'D', seats: 2 },
          { name: 'E', seats: 1 },
          { name: 'F', seats: 1 },
          { name: 'G', seats: 1 },
          { name: '', seats: 4 },
        ],
        majority: true,
        label: null,
      },
      'The House',
    )!;
    expect(spec.layout).toBe('hemicycle');
    expect(spec.groups.map((g) => [g.name, g.seats])).toEqual([
      ['A', 15],
      ['B', 3],
      ['C', 2],
      ['D', 2],
      ['E', 1],
      ['Others', 2],
    ]);
    expect(spec.label).toBe('The House');
    expect(
      readSeats({ layout: null, groups: [], majority: null, label: null }, 'x'),
    ).toBeNull();
  });

  it.each(['wide', 'tall'] as const)(
    'fills its seats by group, with its key and majority line, in the %s frame',
    (shape) => {
      const spec = readSeats(
        {
          layout: 'hemicycle',
          groups: [
            { name: 'NPC', seats: 134 },
            { name: 'NCNC', seats: 89 },
            { name: 'AG', seats: 73 },
            { name: 'Others', seats: 16 },
          ],
          majority: true,
          label: 'House of Representatives, 1959',
        },
        'x',
        { source: 'K.W.J. Post, 1963' },
      )!;
      const d = renderSeats(spec, shape);
      sound(d);
      expect((d.svg.match(/<circle cx/g) ?? []).length).toBe(312 + 4);
      expect(d.parts).toMatchObject({
        NPC: 'seats-npc',
        AG: 'seats-ag',
        majority: 'seats-majority',
        source: 'source',
      });
      expect(d.svg).toContain('157 for a majority');
      expect(d.svg).toContain('>312<');
    },
  );

  it('draws a chamber too large to seat one by one with each dot standing for more', () => {
    const d = renderSeats(
      readSeats(
        {
          layout: 'hemicycle',
          groups: [{ name: 'Deputies', seats: 2977 }],
          majority: false,
          label: 'Congress',
        },
        'x',
      )!,
    );
    sound(d);
    expect(d.svg).toContain('Each dot = 5 members');
    expect((d.svg.match(/<circle cx/g) ?? []).length).toBeLessThanOrEqual(
      700 + 1,
    );
  });
});

describe('strike', () => {
  it('is made sound: both words, and different', () => {
    expect(readStrike({ from: 'IF', to: 'if', label: null })).toBeNull();
    expect(readStrike({ from: '', to: 'HOW', label: null })).toBeNull();
  });

  it.each(['wide', 'tall'] as const)(
    'strikes the old words and writes the new on its cue, in the %s frame',
    (shape) => {
      const d = renderStrike(
        readStrike({
          from: '1956',
          to: 'As soon as practicable',
          label: 'Self-government by',
        })!,
        shape,
      );
      sound(d);
      expect(d.parts).toMatchObject({
        '1956': 'strike-old',
        old: 'strike-old',
        label: 'strike-label',
      });
      expect(d.states).toEqual({
        replaced: 'strike-new',
        'As soon as practicable': 'strike-new',
        new: 'strike-new',
      });
      expect(d.svg).toContain(`stroke="${PAPER.bad}"`);
    },
  );
});

describe('transfer', () => {
  it('is made sound: two ends, its token read from what moves', () => {
    const spec = readTransfer(
      {
        from: 'The South',
        to: 'The North',
        token: null,
        label: 'revenue',
        shut: true,
      },
      'Money',
    )!;
    expect(spec.token).toBe('coin');
    expect(
      readTransfer(
        { from: 'A', to: 'a', token: null, label: null, shut: null },
        'x',
      ),
    ).toBeNull();
  });

  it.each(['wide', 'tall'] as const)(
    'moves its tokens round and round, and shuts on its cue, in the %s frame',
    (shape) => {
      const d = renderTransfer(
        readTransfer(
          {
            from: 'The South',
            to: 'The North',
            token: 'coin',
            label: 'revenue',
            shut: true,
          },
          'x',
        )!,
        shape,
      );
      sound(d);
      expect(d.parts).toMatchObject({
        'The South': 'transfer-from',
        'The North': 'transfer-to',
        tokens: 'transfer-tokens',
        revenue: 'transfer-label',
      });
      expect(d.states).toEqual({
        shut: 'transfer-shut',
        closed: 'transfer-shut',
        stopped: 'transfer-shut',
      });
      expect((d.svg.match(/<animateMotion /g) ?? []).length).toBe(5);
      expect(d.svg).toContain('repeatCount="indefinite"');
    },
  );
});

describe('document', () => {
  it.each(['wide', 'tall'] as const)(
    'is a paper with its lines as bars, stamped on its cue, in the %s frame',
    (shape) => {
      const d = renderDocument(
        readDocument(
          {
            style: 'paper',
            title: 'Report of the Commission',
            headline: 'New states?',
            stamp: 'Not recommended',
          },
          'x',
        )!,
        shape,
      );
      sound(d);
      expect(d.parts).toMatchObject({
        title: 'document-title',
        headline: 'document-headline',
        page: 'document-page',
      });
      expect(d.states).toEqual({
        stamp: 'document-stamp',
        'Not recommended': 'document-stamp',
      });
      expect(d.svg).toContain('>NOT<');
      // Its lines are bars, never words.
      expect((d.svg.match(/<text/g) ?? []).length).toBeLessThan(10);
    },
  );

  it('is a newspaper with a masthead and columns', () => {
    const d = renderDocument(
      readDocument(
        {
          style: 'newspaper',
          title: 'Daily Times',
          headline: 'Freedom in 1960',
          stamp: null,
        },
        'x',
      )!,
    );
    sound(d);
    expect(d.states).toEqual({});
    expect(d.svg).toContain('>DAILY TIMES<');
  });
});

describe('split', () => {
  it('is made sound: two named sides, a change by side 1 or 2', () => {
    expect(
      readSplit({
        sides: [{ label: 'A', items: null, icon: null }],
        change: null,
      }),
    ).toBeNull();
    const spec = readSplit({
      sides: [
        {
          label: 'Before',
          items: ['Paper forms', '', 'Long queues', 'a', 'b', 'c'],
          icon: 'documents',
        },
        { label: 'After', items: ['Online'], icon: 'laptop' },
      ],
      change: { side: 1, label: 'Later', items: ['Phones'] },
    })!;
    expect(spec.sides[0].items).toEqual([
      'Paper forms',
      'Long queues',
      'a',
      'b',
    ]);
    expect(spec.sides.map((s) => s.icon)).toEqual(['paper', 'computer']);
    expect(spec.change).toEqual({ side: 0, label: 'Later', items: ['Phones'] });
  });

  it.each(['wide', 'tall'] as const)(
    'sets its sides along a line, one changing on its cue, in the %s frame',
    (shape) => {
      const spec = readSplit({
        sides: [
          {
            label: 'Direct rule',
            items: ['British officers', 'Courts'],
            icon: 'government',
          },
          {
            label: 'Indirect rule',
            items: ['Emirs', 'Native courts'],
            icon: 'crown',
          },
        ],
        change: { side: 2, label: 'After 1951', items: ['Elected councils'] },
      })!;
      const d = renderSplit(spec, shape);
      sound(d);
      expect(d.parts).toMatchObject({
        'Direct rule': 'split-1',
        'Indirect rule': 'split-2',
      });
      expect(d.parts.Emirs).toMatch(/^split-2-/);
      expect(d.states).toEqual({
        change: 'split-change',
        changed: 'split-change',
        'After 1951': 'split-change',
      });
      // Side by side when wide; one over the other when tall.
      const rects = [
        ...d.svg.matchAll(
          /<rect x="([\d.-]+)" y="([\d.-]+)" width="[\d.]+" height="[\d.]+" rx="[\d.]+" fill="#[0-9A-F]+" fill-opacity="0.1"/g,
        ),
      ];
      const [a, b] = rects;
      if (shape === 'wide') expect(Number(b[1])).toBeGreaterThan(Number(a[1]));
      else expect(Number(b[2])).toBeGreaterThan(Number(a[2]));
    },
  );
});
