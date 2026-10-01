/**
 * "Where sleeping sickness is found": an explainer whose pictures are
 * maps of real places, written by hand, not by the writer, for the maps
 * drawn by code (scene-map). Two scenes: a map of Africa, the countries
 * where each form of the disease is found coloured in two groups, with
 * Kinshasa and Kampala marked; and a scene whose writer asked the artist
 * for "a map of Uganda", which code draws as a map instead. Its voice is
 * timed by code at an even pace, so it composes with no model asked and
 * nothing voiced, in either shape (composeAdolescentFilm's make).
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
  map: null,
} as const;

const said = (
  say: string,
  delivery: Beat['delivery'],
  pause: Beat['pause'] = 'short',
): Beat => ({
  say,
  pause,
  delivery,
  speaker: null,
  music: null,
  energy: null,
});

const step = (
  beat: number,
  phrase: string,
  layout: Step['layout'],
  show: string[] | null,
  effects: Step['effects'] = null,
): Step => ({ beat, phrase, layout, show, arrows: show ? [] : null, effects });

const point = (target: string) => [{ target, do: 'point' as const }];

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

const WEST = 'West and Central African form';
const EAST = 'East African form';

/** The map of Africa, as the writer gives it: names only. */
export const AFRICA_MAP: Cast = {
  ...NONE,
  id: 'africa',
  kind: 'map',
  name: 'Where sleeping sickness is found',
  map: {
    region: 'Africa',
    highlight: [
      { name: 'DRC', label: true, group: WEST },
      { name: 'Angola', label: false, group: WEST },
      { name: 'Central African Republic', label: false, group: WEST },
      { name: 'Republic of the Congo', label: false, group: WEST },
      { name: 'Cameroon', label: false, group: WEST },
      { name: 'Gabon', label: false, group: WEST },
      { name: 'Equatorial Guinea', label: false, group: WEST },
      { name: 'Chad', label: false, group: WEST },
      { name: 'South Sudan', label: false, group: WEST },
      { name: 'Guinea', label: false, group: WEST },
      { name: 'Ivory Coast', label: false, group: WEST },
      { name: 'Uganda', label: true, group: EAST },
      { name: 'Malawi', label: true, group: EAST },
      { name: 'Tanzania', label: false, group: EAST },
      { name: 'Zambia', label: false, group: EAST },
      { name: 'Zimbabwe', label: false, group: EAST },
    ],
    places: ['Kinshasa', 'Kampala', 'Sahara'],
    routes: null,
  },
};

interface Written {
  title: string;
  seconds: number;
  teach: string;
  beats: Beat[];
  cast: Cast[];
  steps: Step[];
}

const SCENES: Written[] = [
  {
    title: 'Where It Is Found',
    seconds: 30,
    teach:
      'Sleeping sickness (human African trypanosomiasis) is found only in sub-Saharan Africa, where the tsetse fly that spreads it lives. Most cases today are in the Democratic Republic of the Congo. A faster form is found in East Africa, in countries such as Uganda and Malawi.',
    beats: [
      said(
        'Sleeping sickness is found in only one part of the world: Africa, south of the Sahara.',
        'hook',
      ),
      said(
        'Most cases today are in the Democratic Republic of the Congo, around its capital, Kinshasa.',
        'explain',
      ),
      said(
        'In East Africa a faster form is found, in Uganda, around Kampala, and in Malawi.',
        'explain',
      ),
      said(
        'Both are spread by the tsetse fly, so the disease is found wherever the fly can live.',
        'key',
        'long',
      ),
    ],
    cast: [AFRICA_MAP],
    steps: [
      step(0, 'Sleeping sickness is found', 'one', ['africa']),
      step(0, 'south of the Sahara', null, null, point('africa.Sahara')),
      step(
        1,
        'Democratic Republic of the Congo',
        null,
        null,
        point('africa.DRC'),
      ),
      step(1, 'Kinshasa', null, null, point('africa.Kinshasa')),
      step(2, 'in Uganda', null, null, point('africa.Uganda')),
      step(2, 'around Kampala', null, null, point('africa.Kampala')),
      step(2, 'in Malawi', null, null, point('africa.Malawi')),
    ],
  },
  {
    title: 'Both Forms in One Country',
    seconds: 16,
    teach:
      'Uganda is the one country where both forms of sleeping sickness are found: the West African form in the north-west, and the faster East African form in the south-east, near Lake Victoria.',
    beats: [
      said('Uganda is the one country where both forms are found.', 'hook'),
      said(
        'The faster form is found in the south-east, near Lake Victoria.',
        'key',
        'long',
      ),
    ],
    // As a writer might still ask: a map of a real place, of the artist.
    cast: [
      {
        ...NONE,
        id: 'uganda',
        kind: 'drawing',
        name: 'Map of Uganda',
        brief:
          'A map of Uganda with its capital Kampala and Lake Victoria marked.',
        parts: [],
        states: [],
        shape: 'square',
      },
    ],
    steps: [
      step(0, 'Uganda is the one', 'one', ['uganda']),
      step(1, 'near Lake Victoria', null, null, point('uganda.Lake Victoria')),
    ],
  },
];

/** The piece as a film, as the Studio keeps one. */
export const SLEEPING_SICKNESS_FILM: Film = {
  source: 'written by hand for the maps drawn by code',
  brief: {
    format: 'explainer',
    idea: 'Where sleeping sickness is found',
    audience: 'adults',
    who: { band: 'general-adult' },
    minutes: 1,
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
    subject: 'health: sleeping sickness',
    maths: false,
    pictures: [],
  },
  outline: {
    title: 'Where Sleeping Sickness Is Found',
    logline: 'A disease found only where the fly that spreads it lives.',
    scenes: SCENES.map((one) => ({
      title: one.title,
      summary: one.teach,
      set: null,
      cast: [],
      seconds: one.seconds,
      teach: one.teach,
      points: [],
    })),
  },
  scenes: SCENES.map((one): FilmScene => {
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

/** The piece composed now, in a shape: nothing asked of a model, nothing voiced. */
export const composeSleepingSickness = (
  shape: FilmShape = 'wide',
): Promise<ComposedScene[]> =>
  composeAdolescentFilm(SLEEPING_SICKNESS_FILM, shape);
