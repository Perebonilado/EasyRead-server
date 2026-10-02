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
};
