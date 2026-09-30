/**
 * "How a vaccine trains the immune system": the vertical plan's first
 * explainer test piece (studio-vertical-plan §9.2), written by hand, not
 * by the writer. Three small ideas, one a scene: a stack (what a vaccine
 * does, step by step), a compare (the body meeting a germ unprepared and
 * trained) and a focus (one labelled drawing, antibodies on a germ, with
 * two cards under it). Its voice is timed by code at an even pace and its
 * one drawing is drawn here, so it composes with no model asked and
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
} as const;

const card = (id: string, name: string): Cast => ({
  ...NONE,
  id,
  kind: 'words',
  name,
  style: 'keyword',
});

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
  arrows: Step['arrows'] = [],
  effects: Step['effects'] = null,
): Step => ({ beat, phrase, layout, show, arrows, effects });

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
    const one: TimedBeat = {
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

/** The one labelled drawing: antibodies from a B cell, locked onto a germ. Square, as a tall film asks. */
const IMMUNE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <g id="virus">
    <g stroke="#1F2A37" stroke-width="6" stroke-linecap="round">
      <line x1="560" y1="130" x2="560" y2="80"/><line x1="650" y1="170" x2="690" y2="135"/>
      <line x1="690" y1="260" x2="740" y2="260"/><line x1="650" y1="350" x2="690" y2="385"/>
      <line x1="470" y1="170" x2="430" y2="135"/><line x1="560" y1="390" x2="560" y2="440"/>
    </g>
    <g fill="#E0663A" stroke="#1F2A37" stroke-width="4">
      <circle cx="560" cy="72" r="14"/><circle cx="696" cy="128" r="14"/><circle cx="748" cy="260" r="14"/>
      <circle cx="696" cy="392" r="14"/><circle cx="424" cy="128" r="14"/><circle cx="560" cy="448" r="14"/>
    </g>
    <circle cx="560" cy="260" r="130" fill="#F4A07E" stroke="#1F2A37" stroke-width="6"/>
    <circle cx="520" cy="230" r="22" fill="#E0663A"/><circle cx="600" cy="300" r="16" fill="#E0663A"/>
  </g>
  <g id="antibody" fill="none" stroke="#3D8FD1" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
    <path d="M405 395 L445 350 M445 350 L485 305 M445 350 L500 360"/>
    <path d="M330 300 L375 285 M375 285 L420 255 M375 285 L405 320"/>
    <path d="M470 470 L500 420 M500 420 L520 380 M500 420 L550 430"/>
  </g>
  <g id="b-cell">
    <circle cx="220" cy="560" r="170" fill="#BFE0F5" stroke="#1F2A37" stroke-width="6"/>
    <circle cx="200" cy="580" r="70" fill="#3D8FD1" stroke="#1F2A37" stroke-width="5"/>
    <g fill="none" stroke="#3D8FD1" stroke-width="10" stroke-linecap="round">
      <path d="M340 450 L370 420 M370 420 L395 390 M370 420 L405 430"/>
    </g>
  </g>
</svg>`;

const IMMUNE = {
  svg: IMMUNE_SVG,
  viewBox: [0, 0, 800, 800] as [number, number, number, number],
  aspect: 1,
  parts: { virus: 'virus', antibody: 'antibody', 'B cell': 'b-cell' },
  labels: {},
  states: {},
  moves: false,
  callouts: [
    { part: 'virus', text: 'Germ', anchor: [690, 260] as [number, number] },
    {
      part: 'antibody',
      text: 'Antibodies',
      anchor: [470, 330] as [number, number],
    },
    { part: 'B cell', text: 'B cell', anchor: [90, 560] as [number, number] },
  ],
};

interface Written {
  title: string;
  seconds: number;
  teach: string;
  beats: Beat[];
  cast: Cast[];
  steps: Step[];
  drawings?: FilmScene['drawings'];
}

const SCENES: Written[] = [
  {
    title: 'A Practice Run',
    seconds: 16,
    teach:
      'A vaccine gives the body a safe practice run against a germ: a harmless piece of it, immune cells learning its shape, and memory cells that remember it.',
    beats: [
      said(
        'How does a vaccine teach your body to fight a germ it has never met?',
        'hook',
      ),
      said(
        'First, the vaccine brings a harmless piece of the germ.',
        'explain',
      ),
      said('Next, immune cells learn its shape.', 'explain'),
      said('Last, memory cells keep that shape for years.', 'key', 'long'),
    ],
    cast: [
      card('piece', 'A harmless piece'),
      card('learn', 'Cells learn its shape'),
      card('memory', 'Memory cells remember'),
    ],
    steps: [
      step(0, 'How does a vaccine', 'stack', ['piece']),
      step(1, 'a harmless piece', 'stack', ['piece']),
      step(2, 'immune cells learn', 'stack', ['piece', 'learn']),
      step(3, 'memory cells keep', 'stack', ['piece', 'learn', 'memory']),
    ],
  },
  {
    title: 'Unprepared or Trained',
    seconds: 14,
    teach:
      'Meeting a germ for the first time, the body is slow to respond and you may get sick; trained by a vaccine, it responds fast.',
    beats: [
      said(
        'Without a vaccine, the body meets the germ unprepared and is slow to fight back.',
        'explain',
      ),
      said(
        'With a vaccine, it has practised, so it fights back fast.',
        'key',
        'long',
      ),
    ],
    cast: [
      card('slow', 'Unprepared: slow to fight back'),
      card('fast', 'Trained: fights back fast'),
    ],
    steps: [
      step(0, 'Without a vaccine', 'compare', ['slow']),
      step(1, 'With a vaccine', 'compare', ['slow', 'fast']),
    ],
  },
  {
    title: 'Antibodies Lock On',
    seconds: 16,
    teach:
      'B cells make antibodies that lock onto the germ, and memory cells stay ready for years.',
    beats: [
      said(
        'When the real germ comes, B cells make antibodies at once.',
        'explain',
      ),
      said('The antibodies lock onto the germ and stop it.', 'key'),
      said('And memory cells stay ready for years.', 'recap', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'immune',
        kind: 'drawing',
        name: 'Antibodies on a germ',
        brief:
          'A round germ with spikes, top right; Y-shaped antibodies stuck to it; a B cell below left, making more.',
        motion: '',
        parts: [
          { name: 'virus', label: true },
          { name: 'antibody', label: true },
          { name: 'B cell', label: true },
        ],
        states: [],
        shape: 'square',
      },
      card('lock', 'Antibodies lock on'),
      card('ready', 'Ready for years'),
    ],
    steps: [
      step(0, 'When the real germ comes', 'focus', ['immune']),
      step(0, 'B cells make antibodies', null, null, null, [
        { target: 'immune.B cell', do: 'point' },
      ]),
      step(1, 'The antibodies lock', 'focus', ['immune', 'lock']),
      step(2, 'memory cells stay ready', 'focus', ['immune', 'lock', 'ready']),
    ],
    drawings: { immune: IMMUNE },
  },
];

/** The piece as a film, as the Studio keeps one: its brief, bible, outline and scenes. */
export const VACCINE_FILM: Film = {
  source: 'written by hand for studio-vertical-plan §9.2',
  brief: {
    format: 'explainer',
    idea: 'How a vaccine trains the immune system',
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
    subject: 'biology: vaccines and the immune system',
    maths: false,
    pictures: [],
  },
  outline: {
    title: 'How a Vaccine Trains Your Body',
    logline: 'A vaccine is a safe practice run for the immune system.',
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
      drawings: one.drawings ?? {},
      made: { steps: [], effects: [] },
    };
  }),
};

/** The piece composed now, in a shape: nothing asked of a model, nothing voiced. */
export const composeVaccine = (
  shape: FilmShape = 'tall',
): Promise<ComposedScene[]> => composeAdolescentFilm(VACCINE_FILM, shape);
