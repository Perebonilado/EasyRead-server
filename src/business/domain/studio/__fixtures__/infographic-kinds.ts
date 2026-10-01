/**
 * The infographic kinds (infographic-editor-plan §3, stage 6), one scene
 * each, written by hand from facts anyone can check, as an editor's
 * episode writes them (paced at the playbook's three to five seconds):
 * a counter that rolls on to a later number, a unit chart with a part
 * picked out, a name card, calendars that merge into one date, a
 * parliament's seats, a question struck out and rewritten, money moving
 * until it stops, a report stamped, and a split screen that changes. Its
 * voice is timed by code at an even pace, so it composes with no model
 * asked and nothing voiced, in either shape. Some later looks are shown by
 * the writer's effects; the rest come on their cue words, by code.
 */
import type { TimedBeat } from '../../scene-timing';
import type { SceneScriptDraft } from '../../scene-script';
import type { FilmShape } from '../../scene-shape';
import {
  composeAdolescentFilm,
  type ComposedScene,
  type Film,
  type FilmScene,
} from './adolescent-health';

type Beat = SceneScriptDraft['beats'][number];
type Cast = SceneScriptDraft['cast'][number];
type Step = SceneScriptDraft['steps'][number];

const NONE = {
  brief: null,
  motion: null,
  parts: null,
  states: null,
  shape: null,
  value: null,
  style: null,
  sound: null,
  lines: null,
  plot: null,
  quote: null,
  phrases: null,
  ref: null,
  state: null,
  figure: null,
  count: null,
  pose: null,
  signs: null,
  holding: null,
  timeline: null,
  chart: null,
} as const;

const said = (
  say: string,
  delivery: Beat['delivery'] = 'explain',
  pause: Beat['pause'] = 'short',
): Beat => ({ say, pause, delivery, speaker: null, music: null, energy: null });

const shows = (beat: number, phrase: string, id: string): Step => ({
  beat,
  phrase,
  layout: 'one',
  show: [id],
  arrows: [],
  effects: null,
});

/** A later look shown on the writer's words. */
const later = (beat: number, phrase: string, target: string): Step => ({
  beat,
  phrase,
  layout: null,
  show: null,
  arrows: null,
  effects: [{ target, do: 'show' }],
});

/** A sentence's words timed at an even pace: 150 words a minute, a short or long pause after. */
function timed(beats: Beat[]): { beats: TimedBeat[]; durationMs: number } {
  const WORD_MS = 400;
  let t = 400;
  const out = beats.map((beat) => {
    const words: [number, number, number, number][] = [];
    let at = 0;
    for (const word of beat.say.split(/\s+/)) {
      const from = beat.say.indexOf(word, at);
      at = from + word.length;
      words.push([from, at, t, t + WORD_MS - 40]);
      t += WORD_MS;
    }
    const one = {
      text: beat.say,
      startMs: words[0][2],
      endMs: words[words.length - 1][3],
      words,
      delivery: beat.delivery,
    } as TimedBeat;
    t += beat.pause === 'long' ? 1100 : 550;
    return one;
  });
  return { beats: out, durationMs: t + 600 };
}

export interface KindScene {
  /** The kind it shows, and its folder in public/dev-scenes/kinds. */
  key: string;
  title: string;
  seconds: number;
  teach: string;
  beats: Beat[];
  cast: Cast[];
  steps: Step[];
}

/** Each kind's scene, in the order the plan lists them. */
export const KIND_SCENES: KindScene[] = [
  {
    key: 'counter',
    title: 'More of us',
    seconds: 12,
    teach:
      'In 1950 about 2.5 billion people lived on Earth. Today about 8 billion do.',
    beats: [
      said('In 1950, about 2.5 billion people lived on Earth.', 'hook'),
      said(
        'Today, it is more than three times that: about 8 billion.',
        'key',
        'long',
      ),
    ],
    cast: [
      {
        ...NONE,
        id: 'people',
        kind: 'counter',
        name: 'People on Earth',
        counter: {
          value: 2.5,
          unit: 'billion',
          prefix: 'about',
          label: 'people on Earth',
          then: 8,
        },
        source: 'UN World Population Prospects, 2024',
      },
    ],
    steps: [shows(0, 'In 1950', 'people')],
  },
  {
    key: 'icons',
    title: 'Rocky and gassy',
    seconds: 10,
    teach: 'The Sun has eight planets. Four are rocky.',
    beats: [
      said('Our Sun has eight planets.', 'hook'),
      said('Four of them are small and rocky, like ours.', 'key', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'planets',
        kind: 'icons',
        name: 'Planets',
        icons: {
          icon: 'globe',
          count: 8,
          per: 1,
          unit: 'planets',
          label: 'The planets of our Sun',
          highlight: 4,
          highlightLabel: '4 are rocky',
        },
        source: 'NASA',
        colour: 'chart0',
      },
    ],
    steps: [shows(0, 'Our Sun', 'planets')],
  },
  {
    key: 'namecard',
    title: 'Two prizes',
    seconds: 9,
    teach: 'Marie Curie won Nobel Prizes in physics and in chemistry.',
    beats: [
      said('Marie Curie studied radiation in Paris.', 'hook'),
      said(
        'She won the Nobel Prize twice, in physics and in chemistry.',
        'key',
        'long',
      ),
    ],
    cast: [
      {
        ...NONE,
        id: 'curie',
        kind: 'namecard',
        name: 'Marie Curie',
        namecard: {
          name: 'Marie Curie',
          role: 'Physicist and chemist',
          line: 'The first person to win two Nobel Prizes',
        },
        colour: 'chart5',
      },
    ],
    steps: [shows(0, 'Marie Curie', 'curie')],
  },
  {
    key: 'calendar',
    title: 'One day',
    seconds: 14,
    teach:
      'The West governed itself from 1957 and the North from 1959. All of Nigeria became independent on 1 October 1960.',
    beats: [
      said('The West ran its own affairs from 1957.', 'explain'),
      said('The North waited until 1959.', 'explain'),
      said(
        'Then, on 1 October 1960, they became one free country.',
        'key',
        'long',
      ),
    ],
    cast: [
      {
        ...NONE,
        id: 'dates',
        kind: 'calendar',
        name: '',
        calendar: {
          calendars: [
            { label: 'West', dates: ['1957'] },
            { label: 'North', dates: ['1959'] },
          ],
          merge: '1 October 1960',
        },
        colour: 'chart1',
      },
    ],
    steps: [shows(0, 'The West', 'dates')],
  },
  {
    key: 'seats',
    title: 'A majority',
    seconds: 13,
    teach:
      "India's Lok Sabha has 543 seats. In 2024 the NDA won 293, the INDIA bloc 234, and others 16. A majority is 272.",
    beats: [
      said("India's lower house has 543 seats.", 'hook'),
      said('To govern alone, a side needs 272 of them.', 'explain'),
      said('In 2024 the governing alliance won 293.', 'key', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'house',
        kind: 'seats',
        name: 'Lok Sabha, 2024',
        seats: {
          layout: 'hemicycle',
          groups: [
            { name: 'NDA', seats: 293 },
            { name: 'INDIA', seats: 234 },
            { name: 'Others', seats: 16, colour: 'muted' },
          ],
          majority: true,
          label: 'Lok Sabha, 2024',
        },
        source: 'Election Commission of India',
      },
    ],
    steps: [
      shows(0, "India's lower house", 'house'),
      {
        beat: 2,
        phrase: 'governing alliance',
        layout: null,
        show: null,
        arrows: null,
        effects: [{ target: 'house.NDA', do: 'point' }],
      },
    ],
  },
  {
    key: 'strike',
    title: 'The real question',
    seconds: 9,
    teach: 'The question was never if. It was how.',
    beats: [
      said('Everyone asked if it would happen.', 'hook'),
      said('The real question was how.', 'key', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'question',
        kind: 'strike',
        name: '',
        strike: { from: 'IF', to: 'HOW', label: 'The question' },
      },
    ],
    steps: [shows(0, 'Everyone asked', 'question')],
  },
  {
    key: 'transfer',
    title: 'Money home',
    seconds: 12,
    teach:
      'Workers abroad send money home to their families every month, until the border closes.',
    beats: [
      said('Every month, workers abroad send money home.', 'hook'),
      said('Families build houses and pay school fees with it.', 'explain'),
      said('Then the border closed, and the money stopped.', 'key', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'money',
        kind: 'transfer',
        name: '',
        transfer: {
          from: 'Workers abroad',
          to: 'Families at home',
          token: 'coin',
          label: 'every month',
          shut: true,
        },
      },
    ],
    steps: [shows(0, 'Every month', 'money')],
  },
  {
    key: 'document',
    title: 'Not recommended',
    seconds: 11,
    teach:
      'The commission was asked whether to make new states. Its report said no.',
    beats: [
      said('A commission was asked whether to make new states.', 'hook'),
      said(
        'Its report came back with two words: not recommended.',
        'key',
        'long',
      ),
    ],
    cast: [
      {
        ...NONE,
        id: 'report',
        kind: 'document',
        name: '',
        document: {
          style: 'paper',
          title: 'Report of the Commission',
          headline: 'New states?',
          stamp: 'Not recommended',
        },
      },
    ],
    steps: [shows(0, 'A commission', 'report')],
  },
  {
    key: 'split',
    title: 'Then and now',
    seconds: 12,
    teach:
      'Renewing a passport once meant paper forms and long queues. Now it is done online.',
    beats: [
      said(
        'Renewing a passport once meant paper forms and long queues.',
        'hook',
      ),
      said('Today it is done online, in minutes.', 'key', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'passport',
        kind: 'split',
        name: '',
        split: {
          sides: [
            {
              label: 'Then',
              items: ['Paper forms', 'Long queues'],
              icon: 'paper',
            },
            { label: 'Waiting', items: ['Weeks by post'], icon: 'computer' },
          ],
          change: { side: 2, label: 'Today', items: ['Online', 'In minutes'] },
        },
      },
    ],
    steps: [
      shows(0, 'Renewing a passport', 'passport'),
      later(1, 'Today', 'passport.change'),
    ],
  },
];

/** The piece as a film, as the Studio keeps one: an editor's episode, paced as one. */
export const KINDS_FILM: Film = {
  source: 'written by hand for the infographic kinds drawn by code',
  brief: {
    format: 'explainer',
    idea: 'Infographic kinds',
    audience: 'adults',
    who: { band: 'general-adult' },
    minutes: 3,
    tone: 'calm',
    setting: null,
    characters: null,
    include: null,
    source: null,
  },
  bible: {
    characters: [],
    sets: [],
    world: null,
    subject:
      'numbers, people, dates, votes and decisions, drawn as infographics',
    maths: false,
    pictures: [],
  },
  outline: {
    title: 'Infographic Kinds',
    logline: 'Every infographic kind, drawn by code.',
    scenes: KIND_SCENES.map((one) => ({
      title: one.title,
      summary: one.teach,
      set: null,
      cast: [],
      seconds: one.seconds,
      teach: one.teach,
      points: [],
    })),
  },
  scenes: KIND_SCENES.map((one): FilmScene => {
    const { beats, durationMs } = timed(one.beats);
    return {
      sheet: {
        kind: 'explainer',
        title: one.title,
        transition: 'cut',
        draft: {
          fit: 'good',
          fitReason: null,
          title: one.title,
          mood: 'curious',
          beats: one.beats,
          cast: one.cast,
          steps: one.steps,
          pace: 'infographic',
        },
      },
      beats,
      durationMs,
      timing: 'aligned',
      voicePace: 1,
      drawings: {},
      made: { steps: [], effects: [] },
    };
  }),
};

/** The kinds composed now, in a shape: nothing asked of a model, nothing voiced. */
export const composeKinds = (
  shape: FilmShape = 'wide',
): Promise<ComposedScene[]> => composeAdolescentFilm(KINDS_FILM, shape);
