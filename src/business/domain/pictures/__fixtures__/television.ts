/**
 * A small research log of the first years of television, written from
 * well-known facts (Baird's demonstration to the Royal Institution on 26
 * January 1926; Farnsworth's first all-electronic image in San Francisco
 * on 7 September 1927; Zworykin's iconoscope at RCA, announced in 1933;
 * the BBC's service from Alexandra Palace from 2 November 1936, Baird's
 * system dropped in February 1937; RCA's television at the 1939 New York
 * World's Fair), with eleven lines a film could say over it. The picture
 * desk's pass is run on it by hand (scripts/pictures-desk.ts --research
 * television) and in the specs: people, places, things and events.
 */
import type { EditorResearch, EditorWorld } from '../../studio/studio-editor';

const source = (page: string) => [
  {
    url: `https://en.wikipedia.org/wiki/${page}`,
    title: `${page.replace(/_/gu, ' ')} - Wikipedia`,
  },
];

const claim = (
  id: string,
  text: string,
  kind: 'event' | 'claim' | 'date',
  page: string,
) => ({
  id,
  text,
  kind,
  sources: source(page),
  confidence: 'high',
  visual: '',
  contested: false,
  who: null,
  status: 'verified',
});

export const TELEVISION_RESEARCH = {
  claims: [
    claim(
      'c1',
      'On 26 January 1926 John Logie Baird demonstrated television to members of the Royal Institution at his laboratory in Frith Street, Soho, London.',
      'event',
      'John_Logie_Baird',
    ),
    claim(
      'c2',
      "Baird's televisor scanned the scene with a spinning Nipkow disc, making a picture of 30 lines.",
      'claim',
      'Baird_Televisor',
    ),
    claim(
      'c3',
      'On 7 September 1927 Philo Farnsworth transmitted the first all-electronic television image, a straight line, at his laboratory at 202 Green Street in San Francisco.',
      'event',
      'Philo_Farnsworth',
    ),
    claim(
      'c4',
      "Farnsworth's image dissector camera tube scanned the picture with electrons, with no moving parts.",
      'claim',
      'Video_camera_tube',
    ),
    claim(
      'c5',
      'Vladimir Zworykin, working for RCA, developed the iconoscope camera tube, announced in 1933.',
      'claim',
      'Iconoscope',
    ),
    claim(
      'c6',
      'David Sarnoff led RCA and pushed for television to become a set in every home.',
      'claim',
      'David_Sarnoff',
    ),
    claim(
      'c7',
      "The BBC opened the world's first regular high-definition television service at Alexandra Palace in London on 2 November 1936.",
      'event',
      'BBC_Television_Service',
    ),
    claim(
      'c8',
      "The BBC alternated Baird's 240-line system with Marconi-EMI's 405-line electronic system until February 1937, when it dropped Baird's.",
      'event',
      'BBC_Television_Service',
    ),
    claim(
      'c9',
      "RCA introduced television to the public at the 1939 New York World's Fair, where David Sarnoff spoke at the dedication of its pavilion on 20 April 1939.",
      'event',
      "1939_New_York_World's_Fair",
    ),
    claim(
      'c10',
      'Early television sets showed their picture on a cathode-ray tube.',
      'claim',
      'Cathode-ray_tube',
    ),
  ],
  timeline: [
    {
      date: '26 January 1926',
      event:
        'Baird demonstrates television to members of the Royal Institution',
      place: 'Frith Street, London',
      claims: ['c1'],
    },
    {
      date: '7 September 1927',
      event: 'Farnsworth transmits the first all-electronic television image',
      place: 'San Francisco',
      claims: ['c3'],
    },
    {
      date: '1933',
      event: 'Zworykin announces the iconoscope camera tube',
      claims: ['c5'],
    },
    {
      date: '2 November 1936',
      event: 'The BBC Television Service opens at Alexandra Palace',
      place: 'Alexandra Palace, London',
      claims: ['c7'],
    },
    {
      date: 'February 1937',
      event: "The BBC drops Baird's mechanical system",
      claims: ['c8'],
    },
    {
      date: '20 April 1939',
      event: "RCA introduces television at the New York World's Fair",
      place: 'New York',
      claims: ['c9', 'c6'],
    },
  ],
  people: [
    {
      name: 'John Logie Baird',
      role: 'Scottish inventor who demonstrated mechanical television',
      wanted: 'to send moving pictures by wire and by radio',
      did: 'Demonstrated television to members of the Royal Institution in London in 1926',
      claims: ['c1', 'c2'],
    },
    {
      name: 'Philo Farnsworth',
      role: 'American inventor of electronic television',
      wanted: 'a television with no moving parts',
      did: 'Transmitted the first all-electronic television image in San Francisco in 1927',
      claims: ['c3', 'c4'],
    },
    {
      name: 'Vladimir Zworykin',
      role: 'RCA engineer who developed the iconoscope',
      wanted: 'an electronic camera RCA could sell',
      did: 'Developed the iconoscope camera tube at RCA',
      claims: ['c5'],
    },
    {
      name: 'David Sarnoff',
      role: 'head of RCA',
      wanted: 'a television set in every home',
      did: "Introduced RCA television at the 1939 New York World's Fair",
      claims: ['c6', 'c9'],
    },
  ],
  moments: [],
  numbers: [],
  myths: [],
  perspectives: [],
  looks: [],
  pronunciations: [],
  open: [],
  searched: 0,
} as unknown as EditorResearch;

export const TELEVISION_WORLD = {
  era: '1900-1945',
  region: null,
  palette: [],
  held: null,
  legend: '',
  picture: '',
  places: [],
  people: [],
  things: [
    { name: 'televisor', look: 'a wooden cabinet with a small glowing window' },
    { name: 'image dissector', look: 'a long glass camera tube' },
    { name: 'iconoscope', look: 'a glass camera tube with a side arm' },
    { name: 'cathode-ray tube', look: 'a glass tube with a round screen' },
    {
      name: 'Nipkow disc',
      look: 'a spinning disc pierced by a spiral of holes',
    },
  ],
} as unknown as EditorWorld;

export const TELEVISION_ROWS: { say: string; claims: string[] }[] = [
  {
    say: 'In January 1926, John Logie Baird showed moving pictures to a room of scientists in London.',
    claims: ['c1'],
  },
  {
    say: 'His televisor broke each face into thirty lines with a spinning disc.',
    claims: ['c2'],
  },
  {
    say: 'A year later in San Francisco, Philo Farnsworth sent a picture with no moving parts at all.',
    claims: ['c3'],
  },
  {
    say: 'His image dissector scanned the picture with electrons instead of a disc.',
    claims: ['c4'],
  },
  {
    say: 'At RCA, Vladimir Zworykin built a rival electronic camera, the iconoscope.',
    claims: ['c5'],
  },
  {
    say: 'David Sarnoff, who ran RCA, wanted a television in every home.',
    claims: ['c6'],
  },
  {
    say: 'In November 1936, the BBC began the first regular television service from Alexandra Palace.',
    claims: ['c7'],
  },
  {
    say: "For a few months, Baird's system and the electronic one took turns on air.",
    claims: ['c8'],
  },
  {
    say: 'By February 1937 the BBC had chosen the electronic system, and the spinning disc was finished.',
    claims: ['c8'],
  },
  {
    say: "In 1939, RCA showed television to crowds at the New York World's Fair.",
    claims: ['c9'],
  },
  {
    say: 'Every one of those pictures reached the home through a cathode-ray tube.',
    claims: ['c10'],
  },
];

/** The pass's input: the lines, the research and the world. */
export const TELEVISION = {
  rows: TELEVISION_ROWS,
  research: TELEVISION_RESEARCH,
  world: TELEVISION_WORLD,
};
