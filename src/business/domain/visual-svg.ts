/**
 * The contract a drawn SVG has to meet, and what is wrong with one.
 *
 * The drawer used to be asked for a single path-data string on a unit
 * square: M, L, C, Q and Z only, every coordinate a two-decimal fraction
 * between 0 and 1, wrapped in JSON. Nothing else in this codebase asks a
 * model for that, and it is the hardest way to ask. Drawing a circle
 * that way costs four cubic bends and a magic constant; `<circle cx="50"
 * cy="50" r="30"/>` costs one element a model has written a million
 * times. The library was getting beans that were not bean-shaped because
 * of how it asked, not because of what it asked for.
 *
 * So a drawing is an SVG document now, which is also what the spec
 * describes: a root `<svg>` with a viewBox, drawn in line, with every
 * named part its own `<g id>`. The group id is the whole point — it is
 * what a callout attaches to and what a cue lights on its own.
 */

/** The box every drawing is drawn on. Integers, because models count better than they divide. */
export const DRAW_VIEWBOX = { w: 100, h: 100 } as const;

export const SVG_GATE = {
  /** Fewer drawn elements than this and there is nothing on it to name. */
  minElements: 4,
  maxElements: 40,
  /** How much of the viewBox the drawing has to reach across and down. */
  minSpread: 0.7,
  maxChars: 4000,
} as const;

/**
 * What a drawing may be built from.
 *
 * The same list the tutor's whiteboard uses, less the text elements: a
 * word drawn inside a picture is a word the page never said, and the
 * card rules put the labels on at lesson time in the page's own
 * vocabulary.
 */
export const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'title',
]);

/** Elements that put ink on the page, as opposed to grouping it. */
const DRAWN = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);

const TAG = /<\s*([a-zA-Z][a-zA-Z0-9:-]*)/g;

/** Every element name in the markup, in order. */
export function elementsOf(svg: string): string[] {
  return [...svg.matchAll(TAG)].map((m) => m[1].toLowerCase());
}

/** The ids of the groups in the markup: the parts a lesson can reach. */
export function groupsOf(svg: string): string[] {
  return [...svg.matchAll(/<\s*g\b[^>]*\bid\s*=\s*["']([^"']+)["']/gi)].map(
    (m) => m[1],
  );
}

/** Whether a named group has anything drawn inside it. */
export function groupHasInk(svg: string, id: string): boolean {
  const open = new RegExp(
    `<\\s*g\\b[^>]*\\bid\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const found = open.exec(svg);
  if (!found) return false;
  // Walk to this group's own close, so a nested group is not mistaken
  // for the end of it.
  let depth = 1;
  let i = found.index + found[0].length;
  const start = i;
  while (depth > 0 && i < svg.length) {
    const next = /<\s*(\/?)\s*g\b[^>]*?(\/?)>/gi;
    next.lastIndex = i;
    const step = next.exec(svg);
    if (!step) break;
    if (step[1]) depth -= 1;
    else if (!step[2]) depth += 1;
    i = step.index + step[0].length;
  }
  const inside = svg.slice(start, Math.max(start, i));
  return elementsOf(inside).some((el) => DRAWN.has(el));
}

/**
 * A name reduced to what it is, for matching.
 *
 * The describer writes "renal pelvis" and the drawer writes
 * `<g id="renal-pelvis">` or `renalPelvis`, and all three are the same
 * part. Comparing the words as written failed every time a part had two
 * of them in it.
 */
export const idKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Every number written in a coordinate or size attribute. */
function coordsOf(svg: string): number[] {
  const out: number[] = [];
  for (const m of svg.matchAll(
    /\b(?:x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|d|points)\s*=\s*["']([^"']*)["']/gi,
  ))
    for (const n of m[1].match(/-?\d*\.?\d+/g) ?? []) {
      const v = Number(n);
      if (Number.isFinite(v)) out.push(v);
    }
  return out;
}

/**
 * What is wrong with a drawn SVG, or nothing when a person may look at
 * it. Given the parts the description named, it also checks the drawing
 * drew those and made each one reachable.
 */
export function svgProblems(svg: string, parts: string[] = []): string[] {
  const problems: string[] = [];
  const text = svg.trim();
  if (!text.startsWith('<svg'))
    return ['the drawing does not start with an <svg> element'];
  if (text.length > SVG_GATE.maxChars)
    problems.push(
      `the drawing is ${text.length} characters; keep it under ${SVG_GATE.maxChars}`,
    );
  if (!/\bviewBox\s*=\s*["'][^"']+["']/i.test(text))
    problems.push('the <svg> has no viewBox');

  const elements = elementsOf(text);
  const banned = [
    ...new Set(elements.filter((el) => !ALLOWED_ELEMENTS.has(el))),
  ];
  if (banned.length)
    problems.push(
      `${banned.map((b) => `<${b}>`).join(', ')} ${banned.length > 1 ? 'are' : 'is'} not allowed; use only ${[...DRAWN].join(', ')} and g`,
    );

  // Attributes, not just elements. The allowlist above keeps <script>
  // out; this keeps script out of what is left. Nothing here needs a
  // handler or a link, and the drawing is markup a person will commit,
  // so it is refused at the door rather than cleaned up later.
  const attrs = [
    ...text.matchAll(/\s(on[a-z]+|href|xlink:href|style)\s*=/gi),
  ].map((m) => m[1].toLowerCase());
  for (const bad of new Set(attrs))
    problems.push(`the attribute ${bad} is not allowed in a drawing`);

  const ink = elements.filter((el) => DRAWN.has(el)).length;
  if (ink < SVG_GATE.minElements)
    problems.push(
      `the drawing is ${ink} elements; under ${SVG_GATE.minElements} there is nothing on it to name`,
    );
  if (ink > SVG_GATE.maxElements)
    problems.push(
      `the drawing is ${ink} elements; keep it under ${SVG_GATE.maxElements} so it reads small`,
    );

  // Line, not silhouette. A filled loop of wire is a disc and a filled
  // section has no inside, and both were being drawn and accepted.
  for (const m of text.matchAll(/\bfill\s*=\s*["']([^"']*)["']/gi)) {
    const v = m[1].trim().toLowerCase();
    if (v && v !== 'none')
      problems.push(
        `fill="${m[1]}" fills the drawing in; every element is fill="none" so an inside edge survives`,
      );
  }

  // Every part the description named has to be somewhere a cue can reach.
  const written = groupsOf(text);
  const keys = written.map(idKey);
  for (const part of parts) {
    const key = idKey(part);
    if (!key) continue;
    const at = keys.indexOf(key);
    if (at < 0) {
      problems.push(
        `the part "${part}" has no group of its own; give it <g id="${part
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}"> so a lesson can point at it`,
      );
      continue;
    }
    if (!groupHasInk(text, written[at]))
      problems.push(`the group for "${part}" is empty`);
  }

  // Fills the frame, and stays inside it.
  const nums = coordsOf(text);
  if (nums.length) {
    const biggest = Math.max(...nums);
    const smallest = Math.min(...nums);
    const span = Math.max(DRAW_VIEWBOX.w, DRAW_VIEWBOX.h);
    if (biggest < span * SVG_GATE.minSpread)
      problems.push(
        `the drawing only reaches ${Math.round(biggest)} of ${span}; it should fill the viewBox`,
      );
    if (biggest > span * 1.02 || smallest < -span * 0.02)
      problems.push(
        `the drawing goes outside the viewBox and would be cut off; keep it between 0 and ${span}`,
      );
  }
  return problems;
}
