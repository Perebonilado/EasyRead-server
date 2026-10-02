/**
 * Fixtures for the shots engine's specs: the first scene of "The Regional
 * Turn" (an editor's episode about Nigeria's road to independence), its
 * lines timed as a voice would say them, a plan of shots for it, the
 * registry the board would give it, and a small drawn map standing in for
 * the show's (three regions, a seam, a point on the earth to a point on
 * the drawing).
 */
import type { ShotSvgAssetDto } from '../../../../contracts';
import type { TimedBeat } from '../../scene-timing';
import type { ShotMapSet } from '../shot-map';
import type { RegistryEntry, ShotPlan } from '../types';

export const LINES = [
  'After the 1945 strikes, colonial Nigeria began shifting power into regional legislatures.',
  'Then the fight changed: independence was no longer one deadline, but three.',
  'Why did self-government become a regional fight?',
  'Those strikes made the old order harder to manage, so pressure for change kept rising everywhere.',
  'The 1951 constitution answered by giving regional legislatures real political weight.',
  'That mattered because regional leaders now had places to count seats and make stronger demands.',
  'Politics now ran through three regional bases, not one neutral national center in Lagos.',
];

/** Lines as a voice says them: each word `wordMs` long, `gapMs` between lines, from `startMs`. */
export function timedBeats(
  lines: readonly string[],
  { startMs = 100, wordMs = 320, gapMs = 700 } = {},
): TimedBeat[] {
  let t = startMs;
  return lines.map((text, k) => {
    if (k > 0) t += gapMs;
    const words = [...text.matchAll(/\S+/g)].map((m) => {
      const word = [m.index, m.index + m[0].length, t, t + wordMs - 30];
      t += wordMs;
      return word;
    });
    return {
      text,
      startMs: words[0][2],
      endMs: words[words.length - 1][3],
      words,
    };
  });
}

export const BEATS = timedBeats(LINES);
export const DURATION_MS = BEATS[BEATS.length - 1].endMs + 700;

/** The start of a word of a line, by its index in the line. */
export const wordAt = (beat: number, word: number) =>
  BEATS[beat].words[word][2];

export const REGISTRY: RegistryEntry[] = [
  {
    name: 'place:Lagos',
    kind: 'place',
    about: 'the colonial capital',
    claim: 'c3',
    geo: { lng: 3.38, lat: 6.52 },
  },
  {
    name: 'place:Kano',
    kind: 'place',
    about: 'a northern city',
    geo: { lng: 8.52, lat: 12.0 },
  },
  { name: 'place:Atlantis', kind: 'place', about: 'no such place' },
  { name: 'region:North Region', kind: 'region', about: 'the largest region' },
  { name: 'region:West Region', kind: 'region', about: 'Lagos and the west' },
  { name: 'region:East Region', kind: 'region', about: 'the east' },
  { name: 'seam:federal balance', kind: 'seam', about: 'North and East' },
  {
    name: 'number:1951 constitution',
    kind: 'number',
    about: 'the year',
    claim: 'c7',
    value: 1951,
  },
  {
    name: 'number:three deadlines',
    kind: 'number',
    about: 'deadlines',
    value: 3,
    unit: 'deadlines',
  },
  {
    name: 'person:Ahmadu Bello',
    kind: 'person',
    about: 'Northern leader',
    claim: 'c9',
  },
  { name: 'claim:c1', kind: 'claim', about: 'regional legislatures from 1946' },
];

/** A drawn map of three regions and a seam, 900 × 700, the earth mapped straight onto it. */
export const MAP_ASSET: ShotSvgAssetDto = {
  kind: 'svg',
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 700">' +
    '<g id="map-group-north-region" data-part="group-north-region"><rect x="100" y="50" width="700" height="350" fill="#0050BE"/></g>' +
    '<g id="map-group-west-region" data-part="group-west-region"><rect x="100" y="400" width="350" height="250" fill="#BB7907"/></g>' +
    '<g id="map-group-east-region" data-part="group-east-region"><rect x="450" y="400" width="350" height="250" fill="#28825A"/></g>' +
    '<g id="map-seam-federal-balance" data-part="seam-federal-balance"><path d="M450 400 L800 400" stroke="#1F2A37"/></g>' +
    '</svg>',
  box: [0, 0, 900, 700],
  parts: {
    'group-north-region': { box: [100, 50, 700, 350], role: 'North Region' },
    'group-west-region': { box: [100, 400, 350, 250], role: 'West Region' },
    'group-east-region': { box: [450, 400, 350, 250], role: 'East Region' },
    'seam-federal-balance': { box: [450, 398, 350, 4], role: 'ink' },
  },
  focal: [100, 50, 700, 600],
};

export const MAP: ShotMapSet = {
  id: 'map',
  asset: MAP_ASSET,
  parts: {
    'North Region': 'group-north-region',
    'West Region': 'group-west-region',
    'East Region': 'group-east-region',
    'federal balance': 'seam-federal-balance',
  },
  // Longitude 2–15 across, latitude 4–14 down: Nigeria, roughly.
  project: (lng, lat) => {
    const x = 100 + ((lng - 2) / 13) * 700;
    const y = 650 - ((lat - 4) / 10) * 600;
    return x >= 0 && x <= 900 && y >= 0 && y <= 700 ? [x, y] : null;
  },
  chip: {
    text: "Today's borders · Natural Earth",
    licence: 'Public domain',
    source: 'Natural Earth',
  },
  flat: true,
};

export const PALETTE = [
  { thing: 'North Region', token: 'chart0' as const },
  { thing: 'West Region', token: 'chart1' as const },
  { thing: 'East Region', token: 'chart2' as const },
];

/**
 * A plan for the scene as the board might write it: the map, the regions
 * filled as the voice names them, a chart the kind cannot draw yet, a
 * portrait with no picture, and a few names that are not on the set.
 */
export const PLAN: ShotPlan = {
  shots: [
    {
      on: 'After the 1945 strikes',
      set: { kind: 'map', style: 'atlas', tilt: 'tilted' },
      actors: [],
      info: [
        { recipe: 'pin', target: 'place:Lagos', on: 'colonial Nigeria' },
        {
          recipe: 'fill',
          target: 'region:North Region',
          on: 'regional legislatures',
        },
        {
          recipe: 'label',
          target: 'person:Ahmadu Bello',
          on: 'shifting power',
        },
        { recipe: 'pin', target: 'place:Atlantis', on: 'power' },
      ],
      life: ['cloud-shadows'],
      camera: [{ move: 'establish', on: 'After the 1945 strikes' }],
      join: 'cut',
      focal: 'region:North Region',
    },
    {
      on: 'Then the fight changed',
      set: {
        kind: 'chart',
        chart: { kind: 'counter', spec: { value: 3, label: 'deadlines' } },
      },
      actors: [],
      info: [
        { recipe: 'count', target: 'number:three deadlines', on: 'but three' },
      ],
      life: [],
      camera: [],
      join: 'dissolve',
    },
    {
      on: 'Why did self-government',
      set: { kind: 'map' },
      actors: [
        {
          id: 'crowd',
          kit: 'people.crowd',
          place: 'place:Kano',
          moves: [{ move: 'enter', on: 'regional fight' }],
        },
      ],
      info: [
        {
          recipe: 'seam',
          target: 'seam:federal balance',
          on: 'self-government',
        },
        { recipe: 'ask', text: 'Why regional?', on: 'regional fight' },
      ],
      life: [],
      camera: [
        {
          move: 'push',
          target: 'seam:federal balance',
          on: 'become',
          amount: 'medium',
        },
      ],
      join: 'cut',
    },
    {
      on: 'The 1951 constitution',
      set: { kind: 'portrait', person: 'person:Ahmadu Bello' },
      actors: [],
      info: [
        {
          recipe: 'label',
          target: 'region:West Region',
          text: 'the West pressed hardest first',
          on: 'regional legislatures',
        },
      ],
      life: [],
      camera: [],
      join: 'cut',
    },
    {
      on: 'Politics now ran through three regional bases',
      set: { kind: 'map' },
      actors: [],
      info: [
        {
          recipe: 'fill',
          target: 'region:West Region',
          on: 'three regional bases',
          colour: 'side:West Region',
        },
        { recipe: 'pin', target: 'Lagos', on: 'in Lagos', until: 'Lagos' },
        { recipe: 'label', target: 'place:Lagos', on: 'Lagos' },
      ],
      life: [],
      camera: [
        { move: 'travel', target: 'place:Lagos', on: 'national center' },
      ],
      join: 'continue',
    },
  ],
};
