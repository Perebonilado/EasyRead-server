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

export interface ThingDrawing {
  body: string;
  detail: string | null;
  aspect: number;
  parts: { name: string; at: number[] }[];
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

const NUMBERS = /-?\d*\.?\d+(?:e-?\d+)?/g;
const COMMANDS = /[A-Za-z]/g;

/** The box a path covers, as fractions of the unit square. */
export function spreadOf(d: string): { w: number; h: number } {
  const all = (d.match(NUMBERS) ?? []).map(Number).filter(Number.isFinite);
  const xs = all.filter((_, i) => i % 2 === 0);
  const ys = all.filter((_, i) => i % 2 === 1);
  if (!xs.length || !ys.length) return { w: 0, h: 0 };
  return {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

/** What is wrong with a drawn thing, or nothing when a person may look at it. */
export function drawingProblems(drawing: ThingDrawing): string[] {
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
  }
  return problems;
}

/** The preset a passed drawing becomes, ready to paste into the library. */
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
  parts?: { name: string; at: [number, number] }[];
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
          parts: drawing.parts.map((part) => ({
            name: part.name,
            at: [part.at[0], part.at[1]] as [number, number],
          })),
        }
      : {}),
  };
}
