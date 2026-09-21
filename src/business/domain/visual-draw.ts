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
  /**
   * Closed path data for this part alone, drawn over the body.
   *
   * Named `shape` rather than `fill`, which is what the library calls it
   * once accepted. In SVG, `fill` names the paint, so a model asked for
   * a part's `fill` answers "none" or "black" — correctly, and with no
   * geometry in it at all. The field the model sees has to say what it
   * wants.
   */
  shape?: string | null;
  /** Open path data for this part alone, drawn over the body. */
  line?: string | null;
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
  /** Each part with its own shape, so the drawer is not inventing it. */
  parts: { id: string; shape: string }[];
  aspect: number;
}

export const DRAW_GATE = {
  /**
   * Ink across the whole drawing — outline, detail and every part.
   *
   * Counted over everything and not over the outline alone, because the
   * outlines this set most wants are simple: a volcano is a triangle and
   * a circuit is a rectangle, four commands each, and a floor on the
   * outline threw out both for being boxes. They are boxes. The drawing
   * is the box plus the crater, the conduit and the chamber, and that is
   * what there has to be enough of.
   */
  minInk: 6,
  maxInk: 140,
  /** An outline still has to be a closed shape and not a line. */
  minBodyCommands: 3,
  maxCommands: 40,
  /** How much of the square the drawing has to reach across and down. */
  minSpread: 0.6,
  minAspect: 0.3,
  maxAspect: 3,
  maxParts: 6,
} as const;

const COMMANDS = /[A-Za-z]/g;

/** A path stripped to its shape, so two ways of writing one compare equal. */
const tidy = (d: string) =>
  d
    .replace(/[\s,]+/g, ' ')
    .trim()
    .toUpperCase();

/** How many numbers each command carries, and how many of them are its endpoint. */
const ARITY: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };

/**
 * The box a path covers, as fractions of the unit square.
 *
 * The curve itself is measured, not the numbers written down. Both
 * shortcuts are wrong and wrong in opposite directions: read every
 * number as a coordinate and a cubic's control handles, which the pen
 * never reaches, inflate a huddled drawing into a generous one; read
 * only the endpoints and a bean drawn as two symmetric curves measures
 * zero wide, because its width lives entirely in the bulge. So each
 * segment is walked and sampled, which is what the eye sees.
 */
export function spreadOf(d: string): { w: number; h: number } {
  const tokens = d.trim().match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  const mark = (x: number, y: number) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  };
  /** Points along a bend, enough that its widest part is not missed. */
  const STEPS = 12;
  let command = '';
  let numbers: number[] = [];
  let at: [number, number] = [0, 0];
  let started: [number, number] = [0, 0];
  const walk = () => {
    const need = ARITY[command] ?? 0;
    if (!need) {
      // Close: back to where this subpath began.
      if (command === 'Z') at = started;
      return;
    }
    // A run of numbers after one letter is that command repeated.
    for (let i = 0; i + need <= numbers.length; i += need) {
      const n = numbers.slice(i, i + need);
      if (command === 'M') {
        at = [n[0], n[1]];
        started = at;
        mark(at[0], at[1]);
      } else if (command === 'L') {
        at = [n[0], n[1]];
        mark(at[0], at[1]);
      } else if (command === 'C' || command === 'Q') {
        const [x0, y0] = at;
        const end: [number, number] =
          command === 'C' ? [n[4], n[5]] : [n[2], n[3]];
        for (let k = 0; k <= STEPS; k += 1) {
          const t = k / STEPS;
          const u = 1 - t;
          if (command === 'C')
            mark(
              u * u * u * x0 +
                3 * u * u * t * n[0] +
                3 * u * t * t * n[2] +
                t * t * t * end[0],
              u * u * u * y0 +
                3 * u * u * t * n[1] +
                3 * u * t * t * n[3] +
                t * t * t * end[1],
            );
          else
            mark(
              u * u * x0 + 2 * u * t * n[0] + t * t * end[0],
              u * u * y0 + 2 * u * t * n[1] + t * t * end[1],
            );
        }
        at = end;
      }
    }
  };
  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token)) {
      walk();
      command = token.toUpperCase();
      numbers = [];
    } else numbers.push(Number(token));
  }
  walk();
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
    const named = PURPOSE.exec(part.id);
    if (named)
      problems.push(
        `the part "${part.id}" is named for what it does ("${named[0]}"); name the shape a person could point at`,
      );
    // The spec's own rule: a part's shape that states a purpose cannot
    // be drawn, so it goes back before anything tries.
    const said = PURPOSE.exec(part.shape);
    if (said)
      problems.push(
        `the shape of "${part.id}" says what it does ("${said[0]}"): "${part.shape}". Say what it looks like instead`,
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
  const count = (d: string | null | undefined) =>
    ((d ?? '').match(COMMANDS) ?? []).length;
  const commands = count(drawing.body);
  if (commands < DRAW_GATE.minBodyCommands)
    problems.push(
      `the outline is ${commands} commands; it is a line, not a shape`,
    );
  const ink =
    commands +
    count(drawing.detail) +
    drawing.parts.reduce((n, p) => n + count(p.shape) + count(p.line), 0);
  if (ink < DRAW_GATE.minInk)
    problems.push(
      `the whole drawing is ${ink} commands; under ${DRAW_GATE.minInk} there is nothing on it to name`,
    );
  if (ink > DRAW_GATE.maxInk)
    problems.push(
      `the whole drawing is ${ink} commands; keep it under ${DRAW_GATE.maxInk} so it reads small`,
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
    if (!part.shape && !part.line)
      problems.push(
        `the part "${part.name}" has no ink of its own; give it a shape or a line so it can be drawn alone`,
      );
    for (const [what, d] of [
      ['shape', part.shape],
      ['line', part.line],
    ] as const) {
      if (!d) continue;
      const bad = pathProblem(d);
      if (bad)
        problems.push(`the part "${part.name}" ${what} is not sound: ${bad}`);
      // A part that is the outline over again is not a part. It is the
      // commonest thing that comes back — cortex traced onto the whole
      // kidney, slope onto the whole volcano — and it passes every other
      // check while making the drawing unusable, because lighting that
      // part lights the entire thing.
      if (tidy(d) === tidy(drawing.body))
        problems.push(
          `the part "${part.name}" is the outline drawn again; a part is one piece of the thing, not all of it`,
        );
    }
  }
  // The parts are the description's, not the drawer's. A drawing that
  // invents one is drawing something else; one that drops one cannot be
  // used by the page that asked for it.
  if (form) {
    const asked = form.parts
      .map((p) => p.id.trim().toLowerCase())
      .filter(Boolean);
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
  outline: true;
  parts?: Record<string, PresetPartOut>;
} {
  const name = term.trim().toLowerCase().replace(/\s+/g, '-');
  return {
    name,
    body: drawing.body,
    ...(drawing.detail ? { detail: drawing.detail } : {}),
    aspect: Math.round(drawing.aspect * 100) / 100,
    // Everything drawn here is a diagram, and a diagram is line. The
    // spec is flat about it: outline only, no fill on any element.
    outline: true as const,
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
                // The library's own words for the same two things.
                ...(part.shape ? { fill: part.shape } : {}),
                ...(part.line ? { stroke: part.line } : {}),
              },
            ]),
          ),
        }
      : {}),
  };
}
