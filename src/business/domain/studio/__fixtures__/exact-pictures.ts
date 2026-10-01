/**
 * "Pictures where the facts matter": an explainer whose pictures are the
 * exact ones code draws (scene-exact), written by hand, not by the
 * writer. Flags of five countries on five continents; the quadratic
 * formula, and a two-line worked step; photosynthesis as a chemical
 * equation; the water cycle and photosynthesis as flows; a decision
 * tree; water, glucose and caffeine as molecules; and a scene whose
 * writer still asked the artist for "the flag of Ghana" and "a glucose
 * molecule", which code draws instead. Its voice is timed by code at an
 * even pace, so it composes with no model asked and nothing voiced, in
 * either shape (composeAdolescentFilm's make).
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
  flag: null,
  equation: null,
  flow: null,
  molecule: null,
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
const shown = (target: string) => [{ target, do: 'show' as const }];

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

interface Written {
  /** Its folder in the stage lab: exact-<key>. */
  key: string;
  title: string;
  seconds: number;
  teach: string;
  beats: Beat[];
  cast: Cast[];
  steps: Step[];
}

/** The scenes, each one kind (or two), in the order the proof shows them. */
export const EXACT_SCENES: Written[] = [
  {
    key: 'flags',
    title: 'Five Flags',
    seconds: 24,
    teach:
      'Every country has its own flag. Brazil is in South America, Kenya in Africa, Japan in Asia, Germany in Europe and Australia in Oceania.',
    beats: [
      said('Every country has a flag of its own.', 'hook'),
      said('Brazil, in South America, and Kenya, in Africa.', 'explain'),
      said('Japan, in Asia, and Germany, in Europe.', 'explain'),
      said('And Australia, in Oceania.', 'key', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'flags',
        kind: 'flag',
        name: 'Five continents, five flags',
        flag: ['Brazil', 'Kenya', 'Japan', 'Germany', 'Australia'],
      },
    ],
    steps: [
      step(0, 'Every country has', 'one', ['flags']),
      step(1, 'Brazil', null, null, point('flags.Brazil')),
      step(1, 'Kenya', null, null, point('flags.Kenya')),
      step(2, 'Japan', null, null, point('flags.Japan')),
      step(2, 'Germany', null, null, point('flags.Germany')),
      step(3, 'Australia', null, null, point('flags.Australia')),
    ],
  },
  {
    key: 'quadratic',
    title: 'The Quadratic Formula',
    seconds: 22,
    teach:
      'The quadratic formula solves any equation a x squared plus b x plus c equals zero: x equals minus b, plus or minus the square root of b squared minus four a c, all over two a.',
    beats: [
      said('One formula solves every quadratic equation.', 'hook'),
      said(
        'x equals minus b, plus or minus the square root of b squared minus four a c, all over two a.',
        'explain',
      ),
      said(
        'The part under the square root tells you how many answers there are.',
        'key',
        'long',
      ),
    ],
    cast: [
      {
        ...NONE,
        id: 'formula',
        kind: 'equation',
        name: 'The quadratic formula',
        equation: [
          'x = \\frac{-\\term{b}{b} \\pm \\sqrt{\\term{discriminant}{b^2 - 4ac}}}{2\\term{a}{a}}',
        ],
      },
    ],
    steps: [
      step(0, 'One formula solves', 'one', ['formula']),
      step(1, 'minus b', null, null, point('formula.b')),
      step(
        2,
        'under the square root',
        null,
        null,
        point('formula.discriminant'),
      ),
    ],
  },
  {
    key: 'worked',
    title: 'Solving by Factorising',
    seconds: 20,
    teach:
      'x squared minus five x plus six equals zero factorises into x minus two times x minus three equals zero.',
    beats: [
      said('Take x squared minus five x plus six equals zero.', 'explain'),
      said(
        'It splits into x minus two, times x minus three, equals zero.',
        'key',
      ),
      said('So x is two, or x is three.', 'recap', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'step',
        kind: 'equation',
        name: 'Factorising',
        equation: ['x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0'],
      },
    ],
    steps: [
      step(0, 'Take x squared', 'one', ['step']),
      step(1, 'It splits into', null, null, shown('step.line 2')),
    ],
  },
  {
    key: 'photo-equation',
    title: 'Photosynthesis in Symbols',
    seconds: 20,
    teach:
      'In photosynthesis, six carbon dioxide and six water make one glucose and six oxygen, using light.',
    beats: [
      said('A leaf turns air and water into sugar.', 'hook'),
      said(
        'Six carbon dioxide and six water, with light, make one glucose and six oxygen.',
        'key',
        'long',
      ),
    ],
    cast: [
      {
        ...NONE,
        id: 'photo',
        kind: 'equation',
        name: 'Photosynthesis',
        equation: [
          '\\term{carbon dioxide}{\\ce{6CO2}} + \\term{water}{\\ce{6H2O}} \\ce{->[light]} \\term{glucose}{\\ce{C6H12O6}} + \\term{oxygen}{\\ce{6O2}}',
        ],
      },
    ],
    steps: [
      step(0, 'A leaf turns air', 'one', ['photo']),
      step(1, 'Six carbon dioxide', null, null, point('photo.carbon dioxide')),
      step(1, 'one glucose', null, null, point('photo.glucose')),
      step(1, 'six oxygen', null, null, point('photo.oxygen')),
    ],
  },
  {
    key: 'water-cycle',
    title: 'The Water Cycle',
    seconds: 26,
    teach:
      'The sun warms water so it evaporates; the vapour cools and condenses into clouds; the water falls as precipitation; it collects in rivers, lakes and seas, and the cycle starts again.',
    beats: [
      said('The water you drink has been round this loop before.', 'hook'),
      said('The sun warms the sea, and water evaporates.', 'explain'),
      said('High up it cools, and condensation makes clouds.', 'explain'),
      said('It falls back down to the ground as precipitation.', 'explain'),
      said('Collection in rivers and seas starts it all again.', 'key', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'cycle',
        kind: 'flow',
        name: 'The water cycle',
        flow: {
          direction: 'cycle',
          nodes: [
            { label: 'Evaporation', kind: null },
            { label: 'Condensation', kind: null },
            { label: 'Precipitation', kind: null },
            { label: 'Collection', kind: null },
          ],
          edges: null,
        },
      },
    ],
    steps: [
      step(0, 'The water you drink', 'one', ['cycle']),
      step(1, 'evaporates', null, null, point('cycle.Evaporation')),
      step(2, 'condensation', null, null, point('cycle.Condensation')),
      step(3, 'precipitation', null, null, point('cycle.Precipitation')),
      step(4, 'Collection', null, null, point('cycle.Collection')),
    ],
  },
  {
    key: 'photo-flow',
    title: 'What a Leaf Needs',
    seconds: 22,
    teach:
      'Photosynthesis takes in sunlight, water and carbon dioxide in the chloroplast, and gives out glucose and oxygen.',
    beats: [
      said('A leaf is a tiny food factory.', 'hook'),
      said(
        'Sunlight, water and carbon dioxide all go into the chloroplast.',
        'explain',
      ),
      said('Out come glucose, the food, and oxygen.', 'key', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'leaf',
        kind: 'flow',
        name: 'Photosynthesis',
        flow: {
          direction: 'across',
          nodes: [
            { label: 'Sunlight', kind: null },
            { label: 'Water', kind: null },
            { label: 'Carbon dioxide', kind: null },
            { label: 'Chloroplast', kind: null },
            { label: 'Glucose', kind: null },
            { label: 'Oxygen', kind: null },
          ],
          edges: [
            { from: 'Sunlight', to: 'Chloroplast', label: null },
            { from: 'Water', to: 'Chloroplast', label: null },
            { from: 'Carbon dioxide', to: 'Chloroplast', label: null },
            { from: 'Chloroplast', to: 'Glucose', label: null },
            { from: 'Chloroplast', to: 'Oxygen', label: null },
          ],
        },
      },
    ],
    steps: [
      step(0, 'A leaf is', 'one', ['leaf']),
      step(1, 'Sunlight', null, null, point('leaf.Sunlight')),
      step(1, 'chloroplast', null, null, point('leaf.Chloroplast')),
      step(2, 'glucose', null, null, point('leaf.Glucose')),
      step(2, 'oxygen', null, null, point('leaf.Oxygen')),
    ],
  },
  {
    key: 'decision',
    title: 'When to See a Doctor',
    seconds: 26,
    teach:
      'A fever above 38 degrees Celsius that lasts more than three days needs a doctor; a shorter one needs rest, water and checking.',
    beats: [
      said('Is the temperature above 38 degrees?', 'question'),
      said('If not, rest and drink water.', 'explain'),
      said('If it is, ask: has it lasted over three days?', 'explain'),
      said('Then it is time to see a doctor.', 'key', 'long'),
    ],
    cast: [
      {
        ...NONE,
        id: 'fever',
        kind: 'flow',
        name: 'A fever: what to do',
        flow: {
          direction: 'down',
          nodes: [
            { label: 'Above 38°C?', kind: 'decision' },
            { label: 'Rest and drink water', kind: 'end' },
            { label: 'Over 3 days?', kind: 'decision' },
            { label: 'See a doctor', kind: 'end' },
            { label: 'Keep checking', kind: 'end' },
          ],
          edges: [
            { from: 'Above 38°C?', to: 'Rest and drink water', label: 'No' },
            { from: 'Above 38°C?', to: 'Over 3 days?', label: 'Yes' },
            { from: 'Over 3 days?', to: 'See a doctor', label: 'Yes' },
            { from: 'Over 3 days?', to: 'Keep checking', label: 'No' },
          ],
        },
      },
    ],
    steps: [
      step(0, 'Is the temperature', 'one', ['fever']),
      step(
        1,
        'rest and drink',
        null,
        null,
        point('fever.Rest and drink water'),
      ),
      step(2, 'over three days', null, null, point('fever.Over 3 days?')),
      step(3, 'see a doctor', null, null, point('fever.See a doctor')),
    ],
  },
  {
    key: 'molecules',
    title: 'Three Molecules',
    seconds: 26,
    teach:
      'Water is two hydrogen atoms joined to one oxygen. Glucose is a ring of carbon atoms with oxygen and hydrogen. Caffeine is two joined rings holding nitrogen atoms.',
    beats: [
      said('Water is one oxygen holding two hydrogens.', 'hook'),
      said(
        'Glucose, the sugar in your blood, is a ring with oxygen all round it.',
        'explain',
      ),
      said(
        'Caffeine is two rings joined together, with nitrogen in them.',
        'key',
        'long',
      ),
    ],
    cast: [
      {
        ...NONE,
        id: 'water',
        kind: 'molecule',
        name: 'Water',
        molecule: 'water',
      },
      {
        ...NONE,
        id: 'glucose',
        kind: 'molecule',
        name: 'Glucose',
        molecule: 'glucose',
      },
      {
        ...NONE,
        id: 'caffeine',
        kind: 'molecule',
        name: 'Caffeine',
        molecule: 'caffeine',
      },
    ],
    steps: [
      step(0, 'Water is one', 'one', ['water']),
      step(0, 'two hydrogens', null, null, point('water.hydrogen')),
      step(1, 'Glucose', 'one', ['glucose']),
      step(1, 'a ring', null, null, point('glucose.ring')),
      step(2, 'Caffeine', 'one', ['caffeine']),
      step(2, 'with nitrogen', null, null, point('caffeine.nitrogen')),
    ],
  },
  {
    key: 'asked-artist',
    title: 'Ghana and Its Sugar',
    seconds: 18,
    teach:
      "Ghana's flag has red, gold and green stripes with a black star. Cocoa from Ghana is sweetened with sugar such as glucose.",
    beats: [
      said("Ghana's flag has a black star at its heart.", 'hook'),
      said('Its cocoa is sweetened with sugars like glucose.', 'key', 'long'),
    ],
    // As a writer might still ask: the artist for a flag and a molecule.
    cast: [
      {
        ...NONE,
        id: 'ghana',
        kind: 'drawing',
        name: 'Flag of Ghana',
        brief:
          'The national flag of Ghana: red, gold and green stripes with a black star.',
        parts: [],
        states: [],
        shape: 'wide',
      },
      {
        ...NONE,
        id: 'sugar',
        kind: 'drawing',
        name: 'Glucose molecule',
        brief: 'The structural formula of a glucose molecule, as a ring.',
        parts: [{ name: 'oxygen', label: false }],
        states: [],
        shape: 'square',
      },
    ],
    steps: [
      step(0, "Ghana's flag", 'one', ['ghana']),
      step(1, 'sugars like glucose', 'one', ['sugar']),
      step(1, 'glucose', null, null, point('sugar.oxygen')),
    ],
  },
];

/** The piece as a film, as the Studio keeps one. */
export const EXACT_FILM: Film = {
  source: 'written by hand for the exact pictures drawn by code',
  brief: {
    format: 'explainer',
    idea: 'Pictures where the facts matter',
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
    subject: 'science and the world: flags, equations, processes, molecules',
    maths: true,
    pictures: [],
  },
  outline: {
    title: 'Pictures Where the Facts Matter',
    logline: 'Flags, equations, processes and molecules, drawn exactly.',
    scenes: EXACT_SCENES.map((one) => ({
      title: one.title,
      summary: one.teach,
      set: null,
      cast: [],
      seconds: one.seconds,
      teach: one.teach,
      points: [],
    })),
  },
  scenes: EXACT_SCENES.map((one): FilmScene => {
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
export const composeExactPictures = (
  shape: FilmShape = 'wide',
): Promise<ComposedScene[]> => composeAdolescentFilm(EXACT_FILM, shape);
