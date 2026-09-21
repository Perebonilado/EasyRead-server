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

/**
 * The box every drawing is drawn on.
 *
 * Big, because a hundred units is not enough room to draw in. On a
 * hundred-unit square every coordinate is coarse and what comes back is
 * a doodle; given eight hundred the same model draws the thing.
 */
export const DRAW_VIEWBOX = { w: 800, h: 600 } as const;

export const SVG_GATE = {
  /** Fewer drawn elements than this and there is nothing on it to name. */
  minElements: 4,
  /** Room for a real diagram. Forty elements is a pictogram. */
  maxElements: 240,
  maxChars: 24000,
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
  'defs',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'marker',
  'title',
  'desc',
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
  return elementsOf(groupInk(svg, id)).some((el) => DRAWN.has(el));
}

/** The markup inside a named group, or empty when there is no such group. */
export function groupInk(svg: string, id: string): string {
  const open = new RegExp(
    `<\\s*g\\b[^>]*\\bid\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const found = open.exec(svg);
  if (!found) return '';
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
  return svg.slice(start, Math.max(start, i));
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

/** The corners a drawing reaches, per axis. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const nums = (text: string): number[] =>
  (text.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? [])
    .map(Number)
    .filter(Number.isFinite);

const attr = (el: string, name: string): number => {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(el);
  return m ? (nums(m[1])[0] ?? 0) : 0;
};

/**
 * The box a drawing covers, per axis.
 *
 * Measured per axis and not from every number thrown together, because
 * a drawing sitting from 20 to 80 across and 10 to 70 down covers three
 * fifths of the box each way, while the numbers pooled together run 10
 * to 80 and look like seven tenths. The first drawing to get through
 * passed on exactly that arithmetic and came out in a corner.
 */
export function boxOf(svg: string): Box | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const pairs = (list: number[]) => {
    for (let i = 0; i + 1 < list.length; i += 2) {
      xs.push(list[i]);
      ys.push(list[i + 1]);
    }
  };
  // Everything but the <svg> tag itself, so the viewBox is not counted.
  const body = svg.replace(/<\s*svg\b[^>]*>/i, '');
  for (const [, el] of body.matchAll(/<\s*([a-zA-Z][\w:-]*)\b[^>]*>/g)) void el;
  for (const m of body.matchAll(/<\s*([a-zA-Z][\w:-]*)\b([^>]*)>/g)) {
    const name = m[1].toLowerCase();
    const el = m[0];
    if (name === 'path') {
      const d = /\bd\s*=\s*["']([^"']*)["']/i.exec(el);
      // Every command in the allowed set takes its numbers as x,y pairs.
      if (d) pairs(nums(d[1]));
    } else if (name === 'rect') {
      const x = attr(el, 'x');
      const y = attr(el, 'y');
      xs.push(x, x + attr(el, 'width'));
      ys.push(y, y + attr(el, 'height'));
    } else if (name === 'circle') {
      const r = attr(el, 'r');
      xs.push(attr(el, 'cx') - r, attr(el, 'cx') + r);
      ys.push(attr(el, 'cy') - r, attr(el, 'cy') + r);
    } else if (name === 'ellipse') {
      const rx = attr(el, 'rx');
      const ry = attr(el, 'ry');
      xs.push(attr(el, 'cx') - rx, attr(el, 'cx') + rx);
      ys.push(attr(el, 'cy') - ry, attr(el, 'cy') + ry);
    } else if (name === 'line') {
      xs.push(attr(el, 'x1'), attr(el, 'x2'));
      ys.push(attr(el, 'y1'), attr(el, 'y2'));
    } else if (name === 'polyline' || name === 'polygon') {
      const pts = /\bpoints\s*=\s*["']([^"']*)["']/i.exec(el);
      if (pts) pairs(nums(pts[1]));
    }
  }
  if (!xs.length || !ys.length) return null;
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/**
 * The drawing with its viewBox pulled in around what was actually drawn.
 *
 * The spec is explicit that a drawing floating in a corner is fixed on
 * accept rather than sent back, and it is right: a good cone with a
 * margin round it was being thrown out and drawn again six times over,
 * when the frame is one line of arithmetic we can do ourselves. Also
 * gives the true proportion, which the model was guessing at.
 */
export function framed(
  drawing: { svg: string; aspect: number },
  pad = 4,
): { svg: string; aspect: number } {
  const box = boxOf(drawing.svg);
  if (!box) return drawing;
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w <= 0 || h <= 0) return drawing;
  const view = [
    (box.minX - pad).toFixed(2),
    (box.minY - pad).toFixed(2),
    (w + pad * 2).toFixed(2),
    (h + pad * 2).toFixed(2),
  ].join(' ');
  return {
    svg: drawing.svg.replace(
      /(<\s*svg\b[^>]*?)\bviewBox\s*=\s*["'][^"']*["']/i,
      `$1viewBox="${view}"`,
    ),
    aspect: Math.min(3, Math.max(0.3, (w + pad * 2) / (h + pad * 2))),
  };
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

  // A part that is the outline over again is not a part: lighting it
  // lights the whole drawing. This was caught when drawings were path
  // data and the check did not survive the move to markup; the first
  // real drawing to get through had a "lobe" that was the outline
  // copied character for character.
  const shapes = (markup: string) =>
    [...markup.matchAll(/\bd\s*=\s*["']([^"']+)["']/gi)].map((m) =>
      m[1]
        .replace(/[\s,]+/g, ' ')
        .trim()
        .toUpperCase(),
    );
  const outside = shapes(text.replace(/<\s*g\b[\s\S]*<\/\s*g\s*>/gi, ''));
  for (const id of written) {
    const within = shapes(groupInk(text, id));
    if (within.some((d) => outside.includes(d)))
      problems.push(
        `the group "${id}" is the outline drawn again; a part is one piece of the thing, not all of it`,
      );
  }

  return problems;
}
