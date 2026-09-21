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
const WHOLE = /^(the\s+)?(shape|outline|body|form|silhouette|thing|object)$/i;

export function formProblems(form: ThingForm): string[] {
  const problems: string[] = [];
  for (const part of form.parts)
    if (WHOLE.test(part.id.trim()))
      problems.push(
        `"${part.id}" is the whole thing, not a part of it; name a feature on it a person could point at separately`,
      );
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
  const asked = (form?.parts ?? []).map((p) => p.id);
  const problems = svgProblems(drawing.svg, asked);
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
  // Every part the description named needs somewhere for a callout to
  // land, as well as a group to light.
  const pointed = new Set(drawing.parts.map((p) => idKey(p.name)));
  for (const id of asked) {
    const key = idKey(id);
    if (key && !pointed.has(key))
      problems.push(`the part "${id}" has no point for a line to meet it`);
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
