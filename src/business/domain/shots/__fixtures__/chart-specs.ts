/**
 * Specs for every chart kind, as the board writes them (the scene
 * writer's fields for each kind), two or three each: what the specs test
 * and the stills show. The looks are a light editorial one and a dark one.
 */
import type { ShotLookDto } from '../../../../contracts';

export const LIGHT_LOOK: ShotLookDto = {
  palette: {
    paper: '#FBF7EF',
    ink: '#1F2A37',
    muted: '#5B6675',
    accent: '#D9502E',
    held: '#0050BE',
    sides: {
      'Northern Region': '#B26F00',
      'Eastern Region': '#0050BE',
      'Western Region': '#28825A',
      NPC: '#B26F00',
      NCNC: '#0050BE',
      'Action Group': '#28825A',
    },
  },
  fonts: {
    display: 'Charter, Georgia, serif',
    text: '"Avenir Next", "Helvetica Neue", sans-serif',
  },
  grain: 0.15,
  motion: 'springy',
};

export const DARK_LOOK: ShotLookDto = {
  palette: {
    paper: '#14202B',
    ink: '#F2EFE6',
    muted: '#A9B4BF',
    accent: '#F2B33D',
    held: '#7FD3F4',
    sides: { North: '#F2B33D', South: '#7FD3F4' },
  },
  fonts: {
    display: '"Helvetica Neue", sans-serif',
    text: '"Helvetica Neue", sans-serif',
  },
  grain: 0.1,
  motion: 'mechanical',
};

/** A kind's samples: a name for each, and its spec. */
export const CHART_SPECS: Record<
  string,
  Record<string, Record<string, unknown>>
> = {
  counter: {
    people: {
      counter: {
        value: '45',
        unit: 'million',
        prefix: 'about',
        label: 'people lived in the colony',
        then: null,
      },
      source: 'Census of Nigeria, 1952',
    },
    share: {
      counter: {
        value: 70,
        unit: '%',
        prefix: null,
        label: 'of voters turned out',
        then: null,
      },
    },
    money: {
      counter: {
        value: '1,500,000',
        unit: null,
        prefix: '$',
        label: 'raised in a year',
        then: '2,250,000',
      },
      colour: 'chart2',
      source: 'Annual report, 2019',
    },
  },
  chart: {
    regions: {
      chart: {
        kind: 'bar',
        unit: 'million',
        bars: [
          { label: 'Northern Region', value: 16.8 },
          { label: 'Eastern Region', value: 7.2 },
          { label: 'Western Region', value: 6.1 },
        ],
      },
      source: 'Census of Nigeria, 1952',
    },
    turnout: {
      chart: {
        kind: 'bar',
        unit: '%',
        bars: [
          { label: 'Kenya', value: 65 },
          { label: 'Ghana', value: 79 },
          { label: 'Senegal', value: 61 },
          { label: 'South Africa', value: 58 },
          { label: 'Brazil', value: 79 },
          { label: 'India', value: 66 },
          { label: 'Indonesia', value: 81 },
        ],
      },
      source: 'International IDEA',
    },
    prices: {
      chart: {
        kind: 'line',
        unit: '%',
        bars: [
          { label: '2016', value: 15.7 },
          { label: '2017', value: 16.5 },
          { label: '2018', value: 12.1 },
          { label: '2019', value: 11.4 },
          { label: '2020', value: 13.2 },
          { label: '2021', value: 17 },
          { label: '2022', value: 18.8 },
          { label: '2023', value: 24.7 },
        ],
      },
      source: 'National statistics office',
    },
  },
  timeline: {
    road: {
      timeline: [
        { when: '1914', name: 'North and South joined' },
        { when: '1946', name: 'Richards constitution' },
        { when: '1951', name: 'Regions elect assemblies' },
        { when: '1954', name: 'A federation' },
        { when: '1957', name: 'Self-government begins' },
        { when: '1960', name: 'Independence' },
      ],
      source: 'Coleman, Nigeria: Background to Nationalism',
    },
    curie: {
      timeline: [
        { when: '1891', name: 'Moves to Paris' },
        { when: '1898', name: 'Finds polonium' },
        { when: '1903', name: 'Nobel Prize, physics' },
        { when: '1911', name: 'Nobel Prize, chemistry' },
      ],
    },
    stages: {
      timeline: [
        { when: 'Stage 1', name: 'Seed' },
        { when: 'Stage 2', name: 'Sprout' },
        { when: 'Stage 3', name: 'Flowers' },
      ],
    },
  },
  quote: {
    rivonia: {
      quote:
        'I have cherished the ideal of a democratic and free society in which all persons live together in harmony and with equal opportunities.',
      speaker: 'Nelson Mandela',
      when: '1964',
      phrases: [{ name: 'equal', phrase: 'equal opportunities' }],
    },
    step: {
      quote: "That's one small step for man, one giant leap for mankind.",
      speaker: 'Neil Armstrong',
      when: '1969',
    },
  },
  strike: {
    motion: { strike: { from: 'IF', to: 'HOW', label: 'The motion' } },
    date: {
      strike: {
        from: '1956',
        to: 'As soon as practicable',
        label: 'Self-government',
      },
    },
  },
  document: {
    report: {
      document: {
        style: 'paper',
        title: 'Report of the Commission',
        headline: 'The fears of minorities and the means of allaying them',
        stamp: 'Not recommended',
      },
    },
    paper: {
      document: {
        style: 'newspaper',
        title: 'The Evening Gazette',
        headline: 'Independence on 1 October',
        stamp: null,
      },
    },
  },
  icons: {
    school: {
      icons: {
        icon: 'child',
        count: 100,
        per: null,
        unit: 'children',
        label: 'children of primary school age',
        highlight: 30,
        highlightLabel: 'not in school',
      },
      source: 'UNESCO Institute for Statistics',
    },
    troops: {
      icons: {
        icon: 'soldier',
        count: '45,000',
        per: null,
        unit: 'soldiers',
        label: 'soldiers sent overseas',
        highlight: null,
        highlightLabel: null,
      },
    },
    schools: {
      icons: {
        icon: 'school',
        count: 7,
        per: null,
        unit: 'schools',
        label: null,
        highlight: null,
        highlightLabel: null,
      },
    },
  },
  seats: {
    house: {
      seats: {
        layout: 'hemicycle',
        groups: [
          { name: 'NPC', seats: 134 },
          { name: 'NCNC', seats: 89 },
          { name: 'Action Group', seats: 73 },
          { name: 'Others', seats: 16 },
        ],
        majority: true,
        label: 'House of Representatives, 1959',
      },
      source: 'Post, The Nigerian Federal Election of 1959',
    },
    commons: {
      seats: {
        layout: 'chamber',
        groups: [
          { name: 'Government', seats: 52 },
          { name: 'Opposition', seats: 38 },
        ],
        majority: false,
        label: null,
      },
    },
  },
  calendar: {
    day: {
      calendar: {
        calendars: [{ label: null, dates: ['1 October 1960'] }],
        merge: null,
      },
    },
    years: {
      calendar: {
        calendars: [
          { label: 'Eastern Region', dates: ['1957'] },
          { label: 'Northern Region', dates: ['1959'] },
        ],
        merge: '1 October 1960',
      },
    },
  },
  split: {
    systems: {
      split: {
        sides: [
          {
            label: 'Federal',
            items: ['Regions run schools', 'Regions keep taxes', 'One army'],
            icon: 'government',
          },
          {
            label: 'Unitary',
            items: ['One parliament decides', 'Taxes go to the centre'],
            icon: 'government',
          },
        ],
        change: null,
      },
    },
    before: {
      split: {
        sides: [
          {
            label: 'Before',
            items: ['Paper ballots', 'Counted by hand'],
            icon: null,
          },
          {
            label: 'After',
            items: ['Machines', 'Results in hours'],
            icon: null,
          },
        ],
        change: null,
      },
    },
  },
  transfer: {
    taxes: {
      transfer: {
        from: 'Eastern Region',
        to: 'Federal treasury',
        token: 'coin',
        label: 'oil revenue',
        shut: false,
      },
    },
    people: {
      transfer: {
        from: 'Villages',
        to: 'Cities',
        token: 'person',
        label: null,
        shut: false,
      },
    },
  },
  plot: {
    parabola: {
      plot: {
        fn: 'x^2 - 4',
        xFrom: -3,
        xTo: 3,
        yFrom: null,
        yTo: null,
        xLabel: 'Time (s)',
        yLabel: 'Height (m)',
        points: [
          { x: 2, name: 'Lands' },
          { x: 0, name: 'Lowest' },
        ],
      },
    },
    growth: {
      plot: {
        fn: '100 * 1.07^x',
        xFrom: 0,
        xTo: 30,
        yFrom: null,
        yTo: null,
        xLabel: 'Years',
        yLabel: null,
        points: [{ x: 10, name: 'Doubled' }],
      },
      source: 'Compound interest at 7%',
    },
  },
  flow: {
    water: {
      flow: {
        direction: 'cycle',
        nodes: [
          { label: 'Evaporation', kind: 'step' },
          { label: 'Clouds form', kind: 'step' },
          { label: 'Rain falls', kind: 'step' },
          { label: 'Rivers to the sea', kind: 'step' },
        ],
        edges: null,
      },
    },
    law: {
      flow: {
        direction: 'across',
        nodes: [
          { label: 'Bill drafted', kind: 'start' },
          { label: 'Assembly votes', kind: 'step' },
          { label: 'Senate agrees', kind: 'step' },
          { label: 'President signs', kind: 'step' },
          { label: 'Law', kind: 'end' },
        ],
        edges: null,
      },
    },
    choice: {
      flow: {
        direction: 'down',
        nodes: [
          { label: 'Majority?', kind: 'decision' },
          { label: 'Form a government', kind: 'step' },
          { label: 'Seek a coalition', kind: 'step' },
        ],
        edges: [
          { from: 'Majority?', to: 'Form a government', label: 'Yes' },
          { from: 'Majority?', to: 'Seek a coalition', label: 'No' },
        ],
      },
    },
  },
};
