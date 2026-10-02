/**
 * A scene for the shot board's specs, from a history show that is not
 * any one region's default: the Berlin Wall, on a show map of Germany's
 * two states of the time. Its lines name a city the map knows (Berlin), a
 * street it does not (Bernauer Strasse, a research moment's place), a
 * number (the inner border's length), a person with their own words (a
 * quote) and a person with no trace at all; its world has a place made up
 * with no claims, which never reaches the registry.
 */
import type { EditorResearch, EditorWorld } from '../../studio/studio-editor';
import type { EditorialRow } from '../../studio/studio-editorial';

const row = (
  say: string,
  visual: EditorialRow['visual'],
  claims: string[],
): EditorialRow => ({
  say,
  visual,
  show: '',
  claims,
  act: 1,
  plant: null,
  payoff: null,
  delivery: 'explain',
  music: null,
  hold: false,
});

export const WALL_ROWS: EditorialRow[] = [
  row('In 1961, Berlin was cut in two overnight.', 'place', ['c1']),
  row('The inner border ran for 1,393 kilometres.', 'how-many', ['c2']),
  row('In 1987, Reagan spoke at the Brandenburg Gate.', 'who', ['c3']),
  row('“Tear down this wall,” he said.', 'exact-words', ['c3']),
  row('East Germany’s leader, Erich Honecker, held on.', 'who', []),
  row('Two years later, the Wall opened.', 'when', ['c4']),
];

const source = (n: number) => [
  { url: `https://example.org/wall/${n}`, title: `The Wall, part ${n}` },
];

export const WALL_RESEARCH: EditorResearch = {
  claims: [
    {
      id: 'c1',
      text: 'The Berlin Wall went up on 13 August 1961.',
      kind: 'date',
      sources: source(1),
      confidence: 'high',
      visual: 'a map',
      contested: false,
      who: null,
      status: 'verified',
    },
    {
      id: 'c2',
      text: 'The inner German border ran for 1,393 kilometres.',
      kind: 'number',
      sources: source(2),
      confidence: 'high',
      visual: 'a counter',
      contested: false,
      who: null,
      status: 'verified',
    },
    {
      id: 'c3',
      text: 'At the Brandenburg Gate on 12 June 1987, Ronald Reagan said: “Mr. Gorbachev, tear down this wall!”',
      kind: 'quote',
      sources: source(3),
      confidence: 'high',
      visual: 'a quote',
      contested: false,
      who: 'Ronald Reagan',
      status: 'verified',
    },
    {
      id: 'c4',
      text: 'The Berlin Wall opened on 9 November 1989.',
      kind: 'event',
      sources: source(4),
      confidence: 'high',
      visual: 'a calendar',
      contested: false,
      who: null,
      status: 'verified',
    },
    {
      id: 'c9',
      text: 'A claim the fact check cut.',
      kind: 'claim',
      sources: source(9),
      confidence: 'low',
      visual: '',
      contested: false,
      who: null,
      status: 'cut',
    },
  ],
  timeline: [
    {
      date: '1961',
      event: 'The Wall goes up',
      claims: ['c1'],
      place: 'Berlin',
    },
    { date: '1987', event: 'Reagan speaks at the Gate', claims: ['c3'] },
    { date: '1989', event: 'The Wall opens', claims: ['c4'] },
  ],
  people: [
    {
      name: 'Ronald Reagan',
      role: 'President of the United States',
      wanted: 'the Wall gone',
      did: 'spoke at the Brandenburg Gate',
      claims: ['c3'],
    },
    {
      name: 'Erich Honecker',
      role: 'East Germany’s leader',
      wanted: 'the Wall kept',
      did: 'held on',
      claims: [],
    },
  ],
  moments: [
    {
      when: '13 August 1961',
      where: 'Bernauer Strasse',
      who: 'Berliners',
      what: 'Families watched the wire go up',
      looked: 'wire across a street',
      claims: ['c1'],
    },
  ],
  numbers: [
    {
      label: 'Length of the inner border',
      value: '1,393 km',
      claims: ['c2'],
      checked: true,
    },
    {
      label: 'The day the Wall opened',
      value: '9 November 1989',
      claims: ['c4'],
      checked: true,
    },
  ],
  myths: [],
  perspectives: [],
  looks: [],
  pronunciations: [],
  open: [],
  searched: 3,
};

export const WALL_WORLD: EditorWorld = {
  era: '1945-1975',
  region: 'Germany',
  palette: [
    { thing: 'East Germany', token: 'chart0' },
    { thing: 'West Germany', token: 'chart1' },
  ],
  held: { token: 'accent', for: 'the open gate' },
  legend: '',
  picture: 'the map of the two Germanys',
  base: {
    kind: 'map',
    region: 'Germany',
    groups: [
      {
        name: 'East Germany',
        members: [
          'Brandenburg',
          'Saxony',
          'Thuringia',
          'Saxony-Anhalt',
          'Mecklenburg-Vorpommern',
        ],
        colour: 'chart0',
        label: null,
      },
      {
        name: 'West Germany',
        members: ['Bavaria', 'Hesse', 'Lower Saxony'],
        colour: 'chart1',
        label: null,
      },
    ],
    seams: [
      {
        between: ['East Germany', 'West Germany'],
        style: 'dashed',
        name: 'inner border',
      },
    ],
    year: 1961,
    bordersDiffer: true,
  },
  places: [
    {
      id: 'kiosk',
      name: 'A border kiosk at dawn',
      kind: 'street',
      look: 'a kiosk by the wire',
      time: 'dawn',
      claims: ['the border at dawn'],
    },
  ],
  people: [],
  things: [],
};
