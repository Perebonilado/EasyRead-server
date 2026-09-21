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
import { idKey, svgProblems } from './visual-svg';

export interface ThingPart {
  name: string;
  /** Where a leader line meets this part, in viewBox units. */
  at: number[];
}

export interface ThingDrawing {
  /** An SVG document drawn in line, each named part its own <g id>. */
  svg: string;
  aspect: number;
  parts: ThingPart[];
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

/**
 * What is wrong with a drawn thing, or nothing when a person may look at
 * it. Given the description it was drawn from, it also checks that the
 * drawing drew that and not something adjacent.
 */
export function drawingProblems(drawing: ThingDrawing): string[] {
  const problems = svgProblems(
    drawing.svg,
    drawing.parts.map((p) => p.name),
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
    const key = idKey(part.name);
    if (!key) problems.push('a part has no name');
    if (seen.has(key)) problems.push(`the part "${part.name}" is named twice`);
    seen.add(key);
  }
  return problems;
}

/** One named part of a library drawing, in the shape the library keeps them. */
export interface PresetPartOut {
  at: [number, number];
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
  svg: string;
  aspect: number;
  tags: string;
  outline: true;
  parts?: Record<string, PresetPartOut>;
} {
  const name = term.trim().toLowerCase().replace(/\s+/g, '-');
  return {
    name,
    svg: drawing.svg,
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
              { at: [part.at[0], part.at[1]] as [number, number] },
            ]),
          ),
        }
      : {}),
  };
}
