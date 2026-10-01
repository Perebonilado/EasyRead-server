/**
 * Pictures where the facts matter, caught when the artist is asked for
 * one: a real country's flag, an equation, a molecule's structure, a
 * process or a cycle with named steps. The artist draws these wrong (a
 * star too many, a formula garbled, a bond missing, steps out of order),
 * so code draws them instead: a flag from flag-icons, an equation set by
 * MathJax, a molecule laid out by openchemlib, a flow laid out by dagre.
 *
 * Read from a drawing's caption and brief. What code can draw from the
 * words alone (a flag of a country it knows, a molecule it knows by name,
 * an equation it knows by name, steps written as "A → B → C") is drawn
 * by code when the drawing comes back the same; the rest goes back to
 * the writer once (studio-check) to be written as its own kind.
 */
import { countriesIn, type FlagCountry } from './scene-flag-names';
import type { FlowDraft } from './scene-flow';
import {
  moleculeKey,
  moleculesIn,
  type KnownMolecule,
} from './scene-molecule-names';

export type ExactKind = 'flag' | 'equation' | 'flow' | 'molecule';

/** An equation known by its name, set as code sets working: its lines of TeX, its parts marked. */
export interface NamedEquation {
  key: string;
  name: string;
  latex: string[];
}

/**
 * Equations a lesson names more than any, set once here and checked by
 * the tests (each sets): what a drawing called "the photosynthesis
 * equation" is drawn as, never the artist's guess at it.
 */
export const NAMED_EQUATIONS: readonly (NamedEquation & { said: RegExp })[] = [
  {
    key: 'quadratic-formula',
    name: 'The quadratic formula',
    said: /\bquadratic formula\b/,
    latex: [
      'x = \\frac{-\\term{b}{b} \\pm \\sqrt{\\term{discriminant}{b^2 - 4ac}}}{2\\term{a}{a}}',
    ],
  },
  {
    key: 'pythagoras',
    name: "Pythagoras' theorem",
    said: /\bpythagor(?:as|ean)\b/,
    latex: ['\\term{a}{a}^2 + \\term{b}{b}^2 = \\term{hypotenuse}{c}^2'],
  },
  {
    key: 'mass-energy',
    name: 'E = mc²',
    said: /\be\s*=\s*mc(?:\^?2|²)|\bmass[- ]energy\b/,
    latex: [
      '\\term{energy}{E} = \\term{mass}{m}\\,\\term{speed of light}{c}^2',
    ],
  },
  {
    key: 'newtons-second-law',
    name: "Newton's second law",
    said: /\bnewton'?s second law\b|\bf\s*=\s*ma\b/,
    latex: ['\\term{force}{F} = \\term{mass}{m}\\,\\term{acceleration}{a}'],
  },
  {
    key: 'ohms-law',
    name: "Ohm's law",
    said: /\bohm'?s law\b|\bv\s*=\s*ir\b/,
    latex: ['\\term{voltage}{V} = \\term{current}{I}\\,\\term{resistance}{R}'],
  },
  {
    key: 'speed',
    name: 'Speed',
    said: /\bspeed\s*(?:=|equals|is)\s*distance\b|\bspeed[, ]+distance(?: and|,)? time\b/,
    latex: [
      '\\term{speed}{\\text{speed}} = \\frac{\\term{distance}{\\text{distance}}}{\\term{time}{\\text{time}}}',
    ],
  },
  {
    key: 'density',
    name: 'Density',
    said: /\bdensity (?:equation|formula)\b|\bdensity\s*=\s*mass\b/,
    latex: [
      '\\term{density}{\\rho} = \\frac{\\term{mass}{m}}{\\term{volume}{V}}',
    ],
  },
  {
    key: 'circle-area',
    name: 'Area of a circle',
    said: /\barea of a circle\b/,
    latex: ['\\term{area}{A} = \\pi \\term{radius}{r}^2'],
  },
  {
    key: 'kinetic-energy',
    name: 'Kinetic energy',
    said: /\bkinetic energy (?:equation|formula)\b/,
    latex: [
      '\\term{kinetic energy}{E_k} = \\tfrac{1}{2}\\,\\term{mass}{m}\\,\\term{speed}{v}^2',
    ],
  },
  {
    key: 'photosynthesis',
    name: 'Photosynthesis',
    said: /\bphotosynthesis\b/,
    latex: [
      '\\term{carbon dioxide}{\\ce{6CO2}} + \\term{water}{\\ce{6H2O}} \\ce{->[light]} \\term{glucose}{\\ce{C6H12O6}} + \\term{oxygen}{\\ce{6O2}}',
    ],
  },
  {
    key: 'respiration',
    name: 'Respiration',
    said: /\b(?:aerobic |cellular )?respiration\b/,
    latex: [
      '\\term{glucose}{\\ce{C6H12O6}} + \\term{oxygen}{\\ce{6O2}} \\ce{->} \\term{carbon dioxide}{\\ce{6CO2}} + \\term{water}{\\ce{6H2O}}',
    ],
  },
  {
    key: 'methane-combustion',
    name: 'Burning methane',
    said: /\b(?:combustion|burning) of methane\b|\bmethane (?:combustion|burning)\b/,
    latex: [
      '\\term{methane}{\\ce{CH4}} + \\term{oxygen}{\\ce{2O2}} \\ce{->} \\term{carbon dioxide}{\\ce{CO2}} + \\term{water}{\\ce{2H2O}}',
    ],
  },
  {
    key: 'neutralisation',
    name: 'Neutralisation',
    said: /\bneutrali[sz]ation\b/,
    latex: [
      '\\term{acid}{\\ce{HCl}} + \\term{alkali}{\\ce{NaOH}} \\ce{->} \\term{salt}{\\ce{NaCl}} + \\term{water}{\\ce{H2O}}',
    ],
  },
];

/** What a drawing asked of the artist is, when it is a picture code draws exactly. */
export interface ExactAsk {
  kind: ExactKind;
  /** What code can draw from the words alone; absent, the writer is asked to write it as its kind. */
  flags?: FlagCountry[];
  molecule?: KnownMolecule;
  equation?: NamedEquation;
  flow?: FlowDraft;
}

const lower = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Words that name a molecule's structure, not a molecule in a scene. */
const MOLECULE_NAMED =
  /\b(?:molecules?|molecular structure|structural formula|chemical structure|skeletal formula|structure of|ball[- ]and[- ]stick|space[- ]filling)\b/;
/** Words that name an equation; not baby formula, nor Formula One. */
const EQUATION_NAMED = /\b(?:equations?|formulae?|formulas)\b/;
const NOT_EQUATION =
  /\b(?:baby|infant|milk|formula (?:one|1)|f1)\b|\b(?:structural|skeletal|molecular|chemical) formula\b/;
/** Words that name a flow of named steps. */
const FLOW_NAMED =
  /\b(?:flow ?charts?|flow diagram|process diagram|cycle diagram|life ?cycle|water cycle|carbon cycle|nitrogen cycle|rock cycle|food (?:chain|web)s?|family tree|decision tree|tree diagram|(?:steps|stages) (?:of|in) the process)\b/;
/** Steps written one after another with arrows: "egg → caterpillar → pupa". */
const ARROWS = /\s*(?:→|->|=>|⟶|➜|>)\s*/;

/** The phrases of a drawing that are about a flag: its caption, and "the flag of …" or "… flag" in its brief. */
function flagWords(name: string, brief: string): string | null {
  const said: string[] = [];
  if (/\bflags?\b/.test(name)) said.push(name);
  for (const m of brief.matchAll(/\b(?:national )?flags? of ([^.;:()]+)/g))
    said.push(m[1]);
  for (const m of brief.matchAll(
    /((?:\S+\s+){0,3}\S+?)(?:'s)? (?:national )?flags?\b/g,
  ))
    said.push(m[1]);
  return said.length ? said.join(' , ') : null;
}

/**
 * What a drawing's caption and brief ask the artist for, when it is a
 * picture code draws exactly; null for anything else. Read in order: a
 * molecule's structure, a flag, an equation, a flow.
 */
export function exactPictureIn(
  name: string,
  brief: string | null | undefined,
): ExactAsk | null {
  const caption = lower(name);
  const asked = lower(brief ?? '');
  const both = `${caption}. ${asked}`;
  // A molecule's structure: the one molecule it names, of those code
  // knows, and little else ("Glucose molecule", "Structure of caffeine";
  // not "Oxygen molecules in the blood", which is a scene).
  const briefStructure =
    /\b(?:structural formula|chemical structure|skeletal formula|molecular structure|ball[- ]and[- ]stick|space[- ]filling)\b/.test(
      asked,
    );
  if (MOLECULE_NAMED.test(caption) || briefStructure) {
    const named = moleculesIn(caption);
    const known = named.length
      ? named
      : /\bmolecules?\b/.test(caption) || briefStructure
        ? moleculesIn(asked)
        : [];
    let rest = ` ${moleculeKey(caption)} `;
    for (const one of named)
      for (const key of [one.name, ...one.aliases].map(moleculeKey))
        rest = rest.replace(` ${key} `, ' ');
    const alone = rest.trim().split(/\s+/).filter(Boolean).length <= 1;
    if (known.length === 1 && alone)
      return { kind: 'molecule', molecule: known[0] };
    // Several known molecules in one drawing: each is its own molecule.
    // One code does not know (an antibody, DNA's double helix) stays
    // the artist's: it is a picture, not a structure to get right.
    if (known.length > 1 && alone) return { kind: 'molecule' };
  }
  // A real country's flag.
  const flagged = flagWords(caption, asked);
  if (flagged) {
    const flags = countriesIn(flagged);
    if (flags.length) return { kind: 'flag', flags };
    if (/\bflags? of\b|\bnational flags?\b/.test(both)) return { kind: 'flag' };
  }
  // An equation: one code knows by name is set as it is.
  if (
    (EQUATION_NAMED.test(caption) ||
      EQUATION_NAMED.test(asked) ||
      /\b[a-z]\s*=\s*[a-z0-9]/.test(caption)) &&
    !NOT_EQUATION.test(both)
  ) {
    const known = NAMED_EQUATIONS.find((one) => one.said.test(both));
    if (EQUATION_NAMED.test(caption) || known || /=/.test(caption))
      return known
        ? {
            kind: 'equation',
            equation: { key: known.key, name: known.name, latex: known.latex },
          }
        : { kind: 'equation' };
  }
  // A process with named steps: written with arrows, code lays it out.
  if (FLOW_NAMED.test(both)) {
    const steps = (brief ?? '')
      .split(/[.;:\n]/)
      .map((part) =>
        part
          .split(ARROWS)
          .map((step, i, all) => {
            // The words round the chain are not steps: "the cycle goes
            // evaporation → … → collection, and round again".
            let one = step;
            if (i === 0) one = one.split(',').pop() ?? one;
            if (i === all.length - 1) one = one.split(',')[0];
            one = one.replace(/^\s*(?:and |then )?|\s*$/g, '').trim();
            return one ? one[0].toUpperCase() + one.slice(1) : '';
          })
          .filter(Boolean),
      )
      .find(
        (list) =>
          list.length >= 3 && list.every((s) => s.split(/\s+/).length <= 6),
      );
    if (steps) {
      const cycle = /\bcycle\b/.test(both);
      return {
        kind: 'flow',
        flow: {
          direction: cycle ? 'cycle' : null,
          nodes: steps.map((label) => ({ label, kind: null })),
          edges: null,
        },
      };
    }
    return { kind: 'flow' };
  }
  return null;
}

/** What the writer is told of a drawing that is one of these, on the one send-back. */
export function exactAskMessage(id: string, ask: ExactAsk): string {
  switch (ask.kind) {
    case 'flag':
      return `The drawing "${id}" is a real country's flag: show it as kind "flag" (flag: the country names), drawn by code from the true flag. The artist never draws a flag.`;
    case 'molecule':
      return `The drawing "${id}" is a molecule's structure: show it as kind "molecule" (molecule: its common name, like "glucose"), drawn by code from its real structure. The artist never draws a molecule.`;
    case 'equation':
      return `The drawing "${id}" is an equation: show it as kind "equation" (equation: one to four lines of LaTeX, chemistry in \\ce{...}), set by code; the voice says it in words. The artist never draws an equation.`;
    case 'flow':
      return `The drawing "${id}" is a process or a cycle with named steps: show it as kind "flow" (flow.nodes, flow.edges, flow.direction), laid out by code with its arrows.`;
  }
}
