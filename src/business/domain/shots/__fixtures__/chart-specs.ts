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
};
