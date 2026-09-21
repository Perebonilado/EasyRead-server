/**
 * The gate a drawn thing has to pass before a person is asked to look.
 *
 * Six candidates are drawn for every term and most of them are wrong in
 * ways nobody needs to see: a path that runs off the square, an outline
 * of four commands that is really just a box, a drawing huddled in one
 * corner, a part pointing at nothing. This catches those for nothing, so
 * the judge and the person only ever see candidates worth judging.
 *
 * What it cannot catch is whether the drawing looks like the thing. That
 * is the judge's job, and the judge is shown the description and never
 * the name, for the same reason the drawer is not.
 */
import { pathProblem } from './visual';

export interface ThingPart {
  name: string;
  at: number[];
  /** Closed ink that is this part alone, drawn over the body. */
  fill?: string | null;
  /** Open lines that are this part alone, drawn over the body. */
  stroke?: string | null;
}

export interface ThingDrawing {
  body: string;
  detail: string | null;
  aspect: number;
  parts: ThingPart[];
}

/** What the describer said the thing looks like, and the parts it named. */
export interface ThingForm {
  looksLike: string;
  parts: string[];
  aspect: number;
}

export const DRAW_GATE = {
  /** A silhouette of fewer commands than this is a box with pretensions. */
  minBodyCommands: 5,
  maxCommands: 40,
  /** How much of the square the drawing has to reach across and down. */
  minSpread: 0.6,
  minAspect: 0.3,
  maxAspect: 3,
  maxParts: 6,
} as const;

const COMMANDS = /[A-Za-z]/g;

/** How many numbers each command carries, and how many of them are its endpoint. */
const ARITY: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };

/**
 * The box a path covers, as fractions of the unit square.
 *
 * Only points the pen actually reaches count. A cubic's two control
 * handles can sit well outside the ink they bend — read every number as
 * a coordinate and a modest drawing measures as a generous one, which is
 * how a drawing huddled in a corner passes a rule meant to stop exactly
 * that.
 */
export function spreadOf(d: string): { w: number; h: number } {
  const tokens = d.trim().match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  let command = '';
  let numbers: number[] = [];
  const takeEndpoint = () => {
    const need = ARITY[command] ?? 0;
    if (!need) return;
    // A run of numbers after one letter is that command repeated.
    for (let i = 0; i + need <= numbers.length; i += need) {
      const x = numbers[i + need - 2];
      const y = numbers[i + need - 1];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        xs.push(x);
        ys.push(y);
      }
    }
  };
  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token)) {
      takeEndpoint();
      command = token.toUpperCase();
      numbers = [];
    } else numbers.push(Number(token));
  }
  takeEndpoint();
  if (!xs.length || !ys.length) return { w: 0, h: 0 };
  return {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * Words that say what a part is for rather than what it looks like.
 *
 * A description that reaches for one of these has stopped describing and
 * started explaining, and nothing downstream can draw an explanation:
 * "filters blood" has no shape, so the drawer invents one, and what it
 * invents is the thing the word is associated with. Catching it here
 * costs one call; catching it at the judge costs seven.
 */
const PURPOSE =
  /\b(filters?|stores?|protects?|converts?|represents?|symbolis[ei]s?|symboliz[ei]s?|carries|transports?|produces?|controls?|regulates?|absorbs?|generates?|processes|means|signifies)\b/i;

/**
 * What is wrong with a description, before anything is drawn from it.
 * Empty when it is geometry all the way down.
 */
export function formProblems(form: ThingForm): string[] {
  const problems: string[] = [];
  const said = PURPOSE.exec(form.looksLike);
  if (said)
    problems.push(
      `"${said[0]}" says what it is for, not what it looks like; describe the shape instead`,
    );
  for (const part of form.parts) {
    const bad = PURPOSE.exec(part);
    if (bad)
      problems.push(
        `the part "${part}" is named for what it does ("${bad[0]}"); name the shape a person could point at`,
      );
  }
  return problems;
}

/**
 * What is wrong with a drawn thing, or nothing when a person may look at
 * it. Given the description it was drawn from, it also checks that the
 * drawing drew that and not something adjacent.
 */
export function drawingProblems(
  drawing: ThingDrawing,
  form?: ThingForm,
): string[] {
  const problems: string[] = [];
  const bad = pathProblem(drawing.body);
  if (bad) problems.push(`the outline is not sound: ${bad}`);
  if (drawing.detail) {
    const worse = pathProblem(drawing.detail);
    if (worse) problems.push(`the detail is not sound: ${worse}`);
  }
  const commands = (drawing.body.match(COMMANDS) ?? []).length;
  if (commands < DRAW_GATE.minBodyCommands)
    problems.push(
      `the outline is ${commands} commands; under ${DRAW_GATE.minBodyCommands} is a box, not a drawing`,
    );
  const total =
    commands + ((drawing.detail ?? '').match(COMMANDS) ?? []).length;
  if (total > DRAW_GATE.maxCommands)
    problems.push(
      `the drawing is ${total} commands; keep it under ${DRAW_GATE.maxCommands} so it reads small`,
    );
  if (!drawing.body.toUpperCase().includes('Z'))
    problems.push('the outline is not closed');
  const spread = spreadOf(drawing.body);
  if (spread.w < DRAW_GATE.minSpread || spread.h < DRAW_GATE.minSpread)
    problems.push(
      `the drawing fills ${Math.round(spread.w * 100)} by ${Math.round(spread.h * 100)} percent of its square; it should fill at least ${Math.round(DRAW_GATE.minSpread * 100)} each way`,
    );
  if (
    drawing.aspect < DRAW_GATE.minAspect ||
    drawing.aspect > DRAW_GATE.maxAspect
  )
    problems.push(
      `the proportion ${drawing.aspect} is outside what a box can hold`,
    );
  if (drawing.parts.length > DRAW_GATE.maxParts)
    problems.push(
      `there are ${drawing.parts.length} parts; ${DRAW_GATE.maxParts} is the most`,
    );
  const seen = new Set<string>();
  for (const part of drawing.parts) {
    const key = part.name.trim().toLowerCase();
    if (!key) problems.push('a part has no name');
    if (seen.has(key)) problems.push(`the part "${part.name}" is named twice`);
    seen.add(key);
    const [x, y] = part.at;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1
    )
      problems.push(`the part "${part.name}" points off the square`);
    // Ink is what makes a part a part. Without it the name is a pin in
    // the picture: a line can point at it, but it can never be drawn,
    // lit or dimmed on its own, and the lesson can only ever show the
    // whole thing at once.
    if (!part.fill && !part.stroke)
      problems.push(
        `the part "${part.name}" has no ink of its own; give it a fill or a stroke so it can be drawn alone`,
      );
    for (const [what, d] of [
      ['fill', part.fill],
      ['stroke', part.stroke],
    ] as const) {
      if (!d) continue;
      const bad = pathProblem(d);
      if (bad)
        problems.push(`the part "${part.name}" ${what} is not sound: ${bad}`);
    }
  }
  // The parts are the description's, not the drawer's. A drawing that
  // invents one is drawing something else; one that drops one cannot be
  // used by the page that asked for it.
  if (form) {
    const asked = form.parts.map((p) => p.trim().toLowerCase()).filter(Boolean);
    const drew = drawing.parts.map((p) => p.name.trim().toLowerCase());
    const missing = asked.filter((p) => !drew.includes(p));
    const extra = drew.filter((p) => p && !asked.includes(p));
    if (missing.length)
      problems.push(
        `the description named ${asked.length} part(s) and this drew ${drew.length}; ${missing.map((p) => `"${p}"`).join(', ')} missing`,
      );
    if (extra.length)
      problems.push(
        `${extra.map((p) => `"${p}"`).join(', ')} was not in the description; draw only the parts named`,
      );
  }
  return problems;
}

/** One named part of a library drawing, in the shape the library keeps them. */
export interface PresetPartOut {
  at: [number, number];
  fill?: string;
  stroke?: string;
}

/**
 * The preset a passed drawing becomes — in the library's own shape, not
 * a shape near it.
 *
 * Parts are keyed by name here, as every pack keeps them, so an accepted
 * drawing drops into the library whole. Emitting them as a list was the
 * reason the old output could not be used without a person transposing
 * it by hand first.
 */
export function presetOf(
  term: string,
  drawing: ThingDrawing,
  looksLike: string,
): {
  name: string;
  body: string;
  detail?: string;
  aspect: number;
  tags: string;
  parts?: Record<string, PresetPartOut>;
} {
  const name = term.trim().toLowerCase().replace(/\s+/g, '-');
  return {
    name,
    body: drawing.body,
    ...(drawing.detail ? { detail: drawing.detail } : {}),
    aspect: Math.round(drawing.aspect * 100) / 100,
    tags: [
      term.toLowerCase(),
      ...(looksLike
        .toLowerCase()
        .match(/[a-z]{4,}/g)
        ?.slice(0, 6) ?? []),
    ]
      .filter((word, i, all) => all.indexOf(word) === i)
      .join(' '),
    ...(drawing.parts.length
      ? {
          parts: Object.fromEntries(
            drawing.parts.map((part) => [
              part.name.trim().toLowerCase(),
              {
                at: [part.at[0], part.at[1]] as [number, number],
                ...(part.fill ? { fill: part.fill } : {}),
                ...(part.stroke ? { stroke: part.stroke } : {}),
              },
            ]),
          ),
        }
      : {}),
  };
}
