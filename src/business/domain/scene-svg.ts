/**
 * The gate every drawing passes before a learner sees it.
 *
 * A drawing is an SVG the artist wrote for one thing on one page: its own
 * shapes, its own labels, its own animation in CSS or SMIL. It is model
 * output and therefore untrusted however the prompt was worded, so it is
 * parsed, cut down to an allowlist, mended where arithmetic can mend it,
 * and checked. What cannot be mended becomes a note the artist gets on its
 * one retry.
 *
 * Parts, labels and states are found by name, whatever spelling the
 * artist used for the id, and kept as a map to the id it did use: nothing
 * in the drawing is renamed, so its own CSS keeps working.
 */
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import { Text, type Element } from 'domhandler';
import { elements, removeNode, textOf, walk } from './scene-dom';
import { groupId, idKey, type DrawingThing } from './scene-script';
import { liftCallouts, type Callout, type InkField } from './scene-callouts';
import { renderSvg, type InkBox } from './scene-raster';

/** The canvas the artist is given, by shape. */
export const CANVAS: Record<DrawingThing['shape'], { w: number; h: number }> = {
  square: { w: 800, h: 800 },
  wide: { w: 960, h: 600 },
  tall: { w: 600, h: 800 },
};

export const GATE = {
  /** Past this the drawing is sent back: a page carries every drawing it shows. */
  maxChars: 150_000,
  maxElements: 1_200,
  /** Past this it is kept, with a note. */
  heavyChars: 80_000,
  /** A brightness or colour change quicker than this flashes; it is slowed to a second. */
  shortestCycleS: 0.34,
  /** A label smaller than this share of the drawing's width is hard to read once it is scaled. */
  smallestLabel: 0.034,
} as const;

/**
 * What a drawing may be built from, by lower-cased name. Anything else is
 * removed with everything inside it; `a` and `switch` are unwrapped and
 * keep their children.
 */
const ALLOWED = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textpath',
  'lineargradient',
  'radialgradient',
  'stop',
  'pattern',
  'clippath',
  'mask',
  'marker',
  'filter',
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fecomposite',
  'fedisplacementmap',
  'fedropshadow',
  'feflood',
  'fefunca',
  'fefuncb',
  'fefuncg',
  'fefuncr',
  'fegaussianblur',
  'femerge',
  'femergenode',
  'femorphology',
  'feoffset',
  'feturbulence',
  'style',
  'animate',
  'animatetransform',
  'animatemotion',
  'mpath',
  'set',
]);
const UNWRAP = new Set(['a', 'switch']);

/** Elements that put ink down. */
const DRAWN = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'use',
]);

const SMIL = new Set(['animate', 'animatetransform', 'animatemotion', 'set']);

/**
 * What SMIL may animate. Never `href`: animating a link to `javascript:`
 * is the classic way script gets into an SVG that has no script in it.
 */
const SMIL_ATTRIBUTES = new Set([
  'opacity',
  'fill',
  'stroke',
  'fill-opacity',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'd',
  'points',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'width',
  'height',
  'offset',
  'stop-color',
  'stop-opacity',
  'transform',
  'visibility',
  'display',
  'font-size',
  'stddeviation',
  'dx',
  'dy',
]);

/** Namespaces an attribute may carry; editor namespaces and anything else go. */
const KEPT_PREFIXES = new Set(['xmlns', 'xlink', 'xml']);

/**
 * CSS with nothing in it that reaches outside the drawing or runs: no
 * imports, no fonts, no url() but to the drawing's own ids, no IE-era
 * script hooks. Reduced rather than parsed: what is suspect is removed.
 */
export function sanitizeCss(css: string): string {
  return (
    css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@import[^;]*;?/gi, '')
      .replace(/@font-face\s*\{[^}]*\}/gi, '')
      .replace(/@namespace[^;]*;?/gi, '')
      // A url() to anything but one of the drawing's own ids.
      .replace(/url\(\s*(['"]?)\s*(?!#)[^)]*\)/gi, 'none')
      .replace(
        /[^;{}]*(?:expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding\s*:)[^;{}]*;?/gi,
        '',
      )
      // A flash: a cycle too short is slowed to a second.
      .replace(
        /(animation(?:-duration)?\s*:\s*[^;{}]*)/gi,
        (declaration: string) => slowFlashes(declaration),
      )
  );
}

/** Times in a CSS animation declaration: the duration (the first in the shorthand) slowed when it would flash. */
function slowFlashes(declaration: string): string {
  const onlyDuration = /animation-duration/i.test(declaration);
  let seen = 0;
  return declaration.replace(
    /(\d*\.?\d+)(ms|s)\b/gi,
    (whole, n: string, unit: string) => {
      seen += 1;
      // In the shorthand the first time is the duration and the second the delay.
      if (!onlyDuration && seen > 1) return whole;
      const seconds =
        unit.toLowerCase() === 'ms' ? Number(n) / 1000 : Number(n);
      return seconds > 0 && seconds < GATE.shortestCycleS ? '1s' : whole;
    },
  );
}

const numbers = (text: string): number[] =>
  (text.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);

/** A finite viewBox with a positive size, or null. */
export function viewBoxOf(
  root: Element,
): [number, number, number, number] | null {
  const raw = root.attribs.viewBox ?? root.attribs.viewbox;
  let box = raw ? numbers(raw) : [];
  if (box.length !== 4) {
    // No viewBox, but a size: the size is the frame.
    const w = numbers(root.attribs.width ?? '')[0];
    const h = numbers(root.attribs.height ?? '')[0];
    box = w > 0 && h > 0 ? [0, 0, w, h] : [];
  }
  if (box.length !== 4) return null;
  if (!box.every(Number.isFinite)) return null;
  const [, , w, h] = box;
  if (!(w > 0) || !(h > 0) || w > 1e5 || h > 1e5) return null;
  return box as [number, number, number, number];
}

/** Attributes that hold words, colours or references rather than numbers. */
const NOT_NUMBERS = new Set([
  'id',
  'class',
  'style',
  'fill',
  'stroke',
  'color',
  'stop-color',
  'flood-color',
  'lighting-color',
  'href',
  'xlink:href',
  'font-family',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'clip-rule',
  'clip-path',
  'mask',
  'filter',
  'marker-start',
  'marker-mid',
  'marker-end',
  'attributename',
  'attributetype',
  'type',
  'calcmode',
  'begin',
  'end',
  'repeatcount',
  'restart',
  'additive',
  'accumulate',
  'preserveaspectratio',
  'gradientunits',
  'patternunits',
  'patterncontentunits',
  'maskunits',
  'clippathunits',
  'filterunits',
  'primitiveunits',
  'spreadmethod',
  'in',
  'in2',
  'result',
  'operator',
  'mode',
  'visibility',
  'display',
  'overflow',
  'xmlns',
  'xmlns:xlink',
  'xml:space',
]);

/**
 * Whether resvg will survive the numbers: none infinite, none absurd
 * enough to overflow what it is turned into (861bad6). Checked before any
 * render, so a drawing that would take the child down is refused instead.
 * Only attributes that hold numbers are read: a colour like #1e90ff reads
 * as 1e90 and once sent a good drawing back to be drawn again.
 */
export function numbersSane(root: Element): boolean {
  for (const node of walk(root))
    for (const [attr, value] of Object.entries(node.attribs)) {
      if (NOT_NUMBERS.has(attr.toLowerCase())) continue;
      if (/\b(NaN|Infinity)\b/.test(value)) return false;
      for (const n of numbers(value))
        if (!Number.isFinite(n) || Math.abs(n) > 1e6) return false;
    }
  return true;
}

/** The markup from a reply: a fence and a sentence in front are expected and dropped (79c2523). */
export function svgFromReply(reply: string): string | null {
  // The first drawing, to its own close: a reply offering two drawings
  // must not become one document with the second nested in the first.
  const start = reply.search(/<svg[\s>]/i);
  if (start < 0) return null;
  const tags = /<(\/?)svg\b[^>]*?(\/?)>/gi;
  tags.lastIndex = start;
  let depth = 0;
  for (let tag = tags.exec(reply); tag; tag = tags.exec(reply)) {
    if (tag[1]) depth -= 1;
    else if (!tag[2]) depth += 1;
    if (depth === 0) return reply.slice(start, tag.index + tag[0].length);
  }
  return null;
}

/** Removes every child and puts one text node in their place. */
function setText(node: Element, text: string): void {
  const replacement = new Text(text);
  replacement.parent = node;
  node.children = [replacement];
}

function unwrapNode(node: Element): void {
  const parent = node.parent as Element | null;
  if (!parent) return;
  const at = parent.children.indexOf(node);
  for (const child of node.children) child.parent = parent;
  parent.children.splice(at, 1, ...node.children);
}

const internal = (href: string | undefined) =>
  Boolean(href && /^\s*#/.test(href));

/** Whether a node still hangs from the root, through parents that still hold it. */
function attached(node: Element, root: Element): boolean {
  let at: Element = node;
  while (at !== root) {
    const parent = at.parent as Element | null;
    if (!parent || !parent.children.includes(at)) return false;
    at = parent;
  }
  return true;
}

/**
 * The drawing cut down to what is allowed: elements off the list removed
 * with their contents, handlers and outside links removed, CSS reduced,
 * SMIL kept to the attributes it may animate. Returns what was removed,
 * for the log.
 */
export function sanitizeTree(root: Element): string[] {
  const removed = new Set<string>();
  let xlink = false;
  // Collected first: the tree changes under a live walk.
  for (const node of [...walk(root)]) {
    // Inside something already removed: gone with it.
    if (!attached(node, root)) continue;
    const name = node.name.toLowerCase();
    if (node !== root && UNWRAP.has(name)) {
      unwrapNode(node);
      continue;
    }
    if (node !== root && !ALLOWED.has(name)) {
      removed.add(`<${node.name}>`);
      removeNode(node);
      continue;
    }
    for (const [attr, value] of Object.entries(node.attribs)) {
      const lower = attr.toLowerCase();
      const prefix = lower.includes(':')
        ? lower.slice(0, lower.indexOf(':'))
        : null;
      const bad =
        lower.startsWith('on') ||
        (prefix !== null && !KEPT_PREFIXES.has(prefix)) ||
        lower === 'xml:base' ||
        /javascript\s*:|vbscript\s*:/i.test(value) ||
        /^\s*data\s*:/i.test(value) ||
        ((lower === 'href' || lower === 'xlink:href') && !internal(value));
      if (bad) {
        removed.add(attr);
        delete node.attribs[attr];
      } else if (lower === 'style') {
        node.attribs[attr] = sanitizeCss(value);
      } else if (prefix === 'xlink') {
        xlink = true;
      }
    }
    if (SMIL.has(name)) {
      const target = (
        node.attribs.attributeName ??
        node.attribs.attributename ??
        ''
      ).toLowerCase();
      const values = [
        node.attribs.to,
        node.attribs.from,
        node.attribs.values,
        node.attribs.by,
      ]
        .filter(Boolean)
        .join(' ');
      if (
        (name !== 'animatemotion' && !SMIL_ATTRIBUTES.has(target)) ||
        /javascript|url\(\s*['"]?(?!#)/i.test(values)
      ) {
        removed.add(`<${node.name} attributeName="${target}">`);
        removeNode(node);
        continue;
      }
      // A flash in SMIL: a cycle too short is slowed to a second.
      const dur = node.attribs.dur;
      if (dur) {
        const n = numbers(dur)[0];
        const seconds = /ms/i.test(dur) ? n / 1000 : n;
        if (seconds > 0 && seconds < GATE.shortestCycleS)
          node.attribs.dur = '1s';
      }
    }
    if (name === 'style') setText(node, sanitizeCss(textOf(node)));
    else if (name === 'title' || name === 'desc') removeNode(node);
  }
  root.attribs.xmlns = 'http://www.w3.org/2000/svg';
  if (xlink) root.attribs['xmlns:xlink'] = 'http://www.w3.org/1999/xlink';
  return [...removed];
}

/**
 * A backdrop, removed: the first thing drawn, when it is a rectangle over
 * most of the canvas. A drawing sits on a shared stage, so it must be a
 * cut-out; models paint a white or tinted sheet under nearly everything.
 */
export function removeBackdrop(
  root: Element,
  box: [number, number, number, number],
): boolean {
  const [x0, y0, w, h] = box;
  const covers = (value: string | undefined, whole: number) => {
    if (!value) return false;
    if (/%\s*$/.test(value)) return numbers(value)[0] >= 85;
    return numbers(value)[0] >= whole * 0.85;
  };
  for (const node of walk(root)) {
    const name = node.name.toLowerCase();
    if (node === root || name === 'g') continue;
    if (
      name === 'defs' ||
      name === 'style' ||
      name === 'filter' ||
      name === 'clippath' ||
      name === 'mask' ||
      name === 'lineargradient' ||
      name === 'radialgradient' ||
      name === 'pattern' ||
      name === 'marker' ||
      name === 'symbol'
    )
      continue;
    if (!DRAWN.has(name)) continue;
    if (name !== 'rect') return false;
    // Inside a definition it is not drawn where it sits.
    for (
      let p = node.parent as Element | null;
      p && p !== root;
      p = p.parent as Element | null
    )
      if (
        ['defs', 'clippath', 'mask', 'pattern', 'marker', 'symbol'].includes(
          p.name.toLowerCase(),
        )
      )
        return false;
    const x = numbers(node.attribs.x ?? '0')[0] ?? 0;
    const y = numbers(node.attribs.y ?? '0')[0] ?? 0;
    const near = Math.abs(x - x0) <= w * 0.08 && Math.abs(y - y0) <= h * 0.08;
    if (
      near &&
      covers(node.attribs.width, w) &&
      covers(node.attribs.height, h)
    ) {
      removeNode(node);
      return true;
    }
    return false;
  }
  return false;
}

/**
 * Text that says the drawing's own name, removed: the caption under the
 * drawing says it already, and the artist writes a title on one drawing
 * in five however plainly it is told not to. A part's label is kept even
 * when the part is named after the whole ("kidney cortex" on a kidney).
 */
export function removeOwnName(
  root: Element,
  name: string,
  keep: ReadonlySet<string>,
): number {
  const key = idKey(name);
  if (key.length < 4) return 0;
  let removed = 0;
  for (const node of [...walk(root)]) {
    if (node.name.toLowerCase() !== 'text' || !attached(node, root)) continue;
    let inside = false;
    for (
      let at = node.parent as Element | null;
      at && at !== root;
      at = at.parent as Element | null
    )
      if (at.attribs?.id && keep.has(at.attribs.id)) inside = true;
    if (inside) continue;
    const said = idKey(textOf(node));
    if (said === key || (said.length >= key.length && said.includes(key))) {
      const group = node.parent as Element | null;
      removeNode(node);
      removed += 1;
      // A title written as a label: its leader goes with it, or the
      // drawing keeps a line pointing at nothing.
      if (
        group &&
        group !== root &&
        group.name.toLowerCase() === 'g' &&
        !(group.attribs.id && keep.has(group.attribs.id)) &&
        onlyLeader(group)
      )
        removeNode(group);
    }
  }
  return removed;
}

/**
 * Whether a group holds nothing but a leader: a few straight lines and
 * perhaps a dot. A path counts only when it is straight (moves and lines,
 * no curves), since drawings are made of curved paths.
 */
function onlyLeader(group: Element): boolean {
  const inside = [...walk(group)].filter((n) => n !== group);
  if (!inside.length || inside.length > 4) return false;
  return inside.every((n) => {
    const name = n.name.toLowerCase();
    if (name === 'line') return true;
    if (name === 'polyline')
      return (n.attribs.points?.match(/-?\d*\.?\d+/g)?.length ?? 0) <= 6;
    if (name === 'path')
      return (
        /^[\sMmLlHhVvZz\d.,-]*$/.test(n.attribs.d ?? '') &&
        (n.attribs.d?.match(/[LlHhVv]/g)?.length ?? 0) <= 2
      );
    if (name === 'circle') return numbers(n.attribs.r ?? '0')[0] <= 12;
    return false;
  });
}

/** Ids in the drawing matched to the names the writer gave: parts, their labels, states. */
export function namedGroups(
  root: Element,
  thing: Pick<DrawingThing, 'parts' | 'states'>,
): {
  parts: Record<string, string>;
  labels: Record<string, string>;
  states: Record<string, string>;
} {
  const ids: string[] = [];
  for (const node of walk(root)) if (node.attribs.id) ids.push(node.attribs.id);
  const keyed = ids.map((id) => ({ id, key: idKey(id) }));
  const isLabel = (key: string) => /^label|label$|text$/.test(key);
  const find = (keys: string[], label: boolean): string | null => {
    for (const key of keys) {
      const exact = keyed.find((one) => one.key === key);
      if (exact) return exact.id;
    }
    // An id with a word in front: part-chloroplasts, g-chloroplasts.
    for (const key of keys) {
      const suffixed = keyed.find(
        (one) =>
          one.key.endsWith(key) &&
          one.key.length - key.length <= 5 &&
          isLabel(one.key) === label,
      );
      if (suffixed) return suffixed.id;
    }
    return null;
  };
  const parts: Record<string, string> = {};
  const labels: Record<string, string> = {};
  const states: Record<string, string> = {};
  for (const part of thing.parts) {
    const key = idKey(part.name);
    const group = find([key], false);
    const label = find([`${key}label`, `label${key}`, `${key}text`], true);
    if (group) parts[part.name] = group;
    if (label && label !== group) labels[part.name] = label;
  }
  for (const state of thing.states) {
    const found = find([idKey(state.name)], false);
    if (found) states[state.name] = found;
  }
  return { parts, labels, states };
}

/** Whether anything in the drawing moves: a keyframes rule in use, or SMIL. */
export function movesOf(root: Element): boolean {
  let keyframes = false;
  let animated = false;
  for (const node of walk(root)) {
    const name = node.name.toLowerCase();
    if (SMIL.has(name)) return true;
    if (name === 'style') {
      const css = textOf(node);
      if (/@keyframes/i.test(css)) keyframes = true;
      if (/animation(?:-name)?\s*:/i.test(css)) animated = true;
    }
    if (/animation(?:-name)?\s*:/i.test(node.attribs.style ?? ''))
      animated = true;
  }
  return keyframes && animated;
}

/** The smallest label, as a share of the drawing's width; null when it has no text. */
export function smallestLabel(root: Element, width: number): number | null {
  let smallest: number | null = null;
  const note = (value: string | undefined) => {
    const n = value ? numbers(value)[0] : undefined;
    if (n && n > 0) smallest = smallest === null ? n : Math.min(smallest, n);
  };
  for (const node of walk(root)) {
    const name = node.name.toLowerCase();
    if (name === 'text' || name === 'tspan') {
      note(node.attribs['font-size']);
      const inline = /font-size\s*:\s*([\d.]+)/i.exec(node.attribs.style ?? '');
      if (inline) note(inline[1]);
    }
    if (name === 'style')
      for (const m of textOf(node).matchAll(/font-size\s*:\s*([\d.]+)/gi))
        note(m[1]);
  }
  return smallest === null ? null : smallest / width;
}

/** A drawing through the gate: safe, framed, and its named groups found. */
export interface GatedDrawing {
  svg: string;
  viewBox: [number, number, number, number];
  /** Width over height of the framed drawing. */
  aspect: number;
  /** Part name, as the writer gave it, to the id of its group. */
  parts: Record<string, string>;
  /** Part name to the id of its label's group. */
  labels: Record<string, string>;
  /** State name to the id of its overlay group. */
  states: Record<string, string>;
  moves: boolean;
  /** Labels lifted out of the drawing for the stage to set: what each says and where it points. */
  callouts: Callout[];
  /** Where the drawing has ink, so words set over it can keep to its empty room. */
  field: InkField | null;
  /** A passage set by code: the size of its words, in its own units, so its notes are never set larger. */
  words?: { size: number };
  /** A character's head, in its own units: where their words come from. */
  head?: [number, number];
}

export interface GateResult {
  /** Null when nothing usable came back. */
  drawing: GatedDrawing | null;
  /** What fell short, told to the artist on a retry. */
  notes: string[];
  /**
   * Whether it fell short enough to draw again: nothing usable, parts
   * missing, or still when it was asked to move. Small text or a label
   * inside its part's group is not worth a minute's redraw.
   */
  retry: boolean;
  /** How well it met the brief, to keep the better of two tries. */
  score: number;
  /** What was cut or mended, for the log. */
  mended: string[];
}

/**
 * The frame pulled round the ink when the ink is small in its canvas or
 * spills out of it, with room for things that move (58e6821). A drawing
 * already filling its canvas keeps the canvas: it was drawn to be seen
 * that way.
 */
export function framedBox(
  box: [number, number, number, number],
  ink: InkBox,
): [number, number, number, number] {
  const [x0, y0, w, h] = box;
  // Any spill at all: a label a few units over the edge is a word cut in
  // half, and the reading font sets it a little wider than this measure.
  const spills =
    ink.x < x0 - 0.5 ||
    ink.y < y0 - 0.5 ||
    ink.x + ink.width > x0 + w + 0.5 ||
    ink.y + ink.height > y0 + h + 0.5;
  // Empty room either way is room the drawing is shown smaller for: a
  // figure standing in the lower half of its canvas came out half size.
  const small = ink.width < w * 0.92 || ink.height < h * 0.92;
  if (!spills && !small) return box;
  const pad =
    Math.max(ink.width, ink.height) * (spills && !small ? 0.04 : 0.07);
  const round = (n: number) => Math.round(n * 100) / 100;
  if (spills && !small) {
    // Grown to take the spill in; never cut.
    const left = Math.min(x0, ink.x - pad);
    const top = Math.min(y0, ink.y - pad);
    const right = Math.max(x0 + w, ink.x + ink.width + pad);
    const bottom = Math.max(y0 + h, ink.y + ink.height + pad);
    return [round(left), round(top), round(right - left), round(bottom - top)];
  }
  return [
    round(ink.x - pad),
    round(ink.y - pad),
    round(ink.width + pad * 2),
    round(ink.height + pad * 2),
  ];
}

/** What the gate found short in a drawing, before it is rendered. */
interface Shortfall {
  missingParts: string[];
  missingLabels: string[];
  missingStates: string[];
  still: boolean;
  smallText: number | null;
  tooMany: number | null;
}

/**
 * Everything the gate can say without rendering: the markup parsed,
 * sanitised and mended, and its groups found. Null when there is no SVG
 * to speak of.
 */
export function inspectSvg(
  reply: string,
  thing: Pick<DrawingThing, 'parts' | 'states' | 'motion'> & { name?: string },
):
  | {
      root: Element;
      viewBox: [number, number, number, number];
      short: Shortfall;
      mended: string[];
    }
  | { root: null; notes: string[]; mended: string[] } {
  const markup = svgFromReply(reply);
  if (!markup)
    return {
      root: null,
      notes: ['Reply with one complete <svg> element.'],
      mended: [],
    };
  const doc = parseDocument(markup, { xmlMode: true, recognizeCDATA: true });
  const root = elements(doc.children).find(
    (node) => node.name.toLowerCase() === 'svg',
  );
  if (!root)
    return {
      root: null,
      notes: ['Reply with one complete <svg> element.'],
      mended: [],
    };
  const viewBox = viewBoxOf(root);
  if (!viewBox)
    return {
      root: null,
      notes: [
        'The <svg> needs a viewBox of four numbers with a positive width and height.',
      ],
      mended: [],
    };
  const mended = sanitizeTree(root).map((what) => `removed ${what}`);
  if (removeBackdrop(root, viewBox)) mended.push('removed a backdrop');
  const { parts, labels, states } = namedGroups(root, thing);
  if (
    thing.name &&
    removeOwnName(
      root,
      thing.name,
      new Set([
        ...Object.values(parts),
        ...Object.values(labels),
        ...Object.values(states),
      ]),
    )
  )
    mended.push('removed a title that repeated the caption');
  const count = [...walk(root)].length;
  const label = smallestLabel(root, viewBox[2]);
  return {
    root,
    viewBox,
    mended,
    short: {
      missingParts: thing.parts
        .filter((p) => !parts[p.name])
        .map((p) => p.name),
      missingLabels: thing.parts
        .filter((p) => p.label && parts[p.name] && !labels[p.name])
        .map((p) => p.name),
      missingStates: thing.states
        .filter((s) => !states[s.name])
        .map((s) => s.name),
      still: Boolean(thing.motion) && !movesOf(root),
      smallText: label !== null && label < GATE.smallestLabel ? label : null,
      tooMany: count > GATE.maxElements ? count : null,
    },
  };
}

/** The artist's notes for what fell short, and whether it is worth a redraw. */
function judged(
  short: Shortfall,
  thing: Pick<DrawingThing, 'motion'>,
  width: number,
): { notes: string[]; retry: boolean; score: number } {
  const notes: string[] = [];
  const groups = [
    ...short.missingParts.map((name) => `<g id="${groupId(name)}">`),
    ...short.missingLabels.map((name) => `<g id="${groupId(name)}-label">`),
    ...short.missingStates.map((name) => `<g id="${groupId(name)}">`),
  ];
  if (groups.length)
    notes.push(
      `These groups are missing: ${groups.join(', ')}. Draw each named thing in its own group with exactly that id.`,
    );
  if (short.still)
    notes.push(
      `Nothing moves. Animate it as asked (${thing.motion}) with CSS @keyframes in a <style>, or SMIL.`,
    );
  if (short.smallText !== null)
    notes.push(
      `Some text is too small to read once the drawing is scaled down; use font-size ${Math.ceil(width * GATE.smallestLabel * 1.1)} or more.`,
    );
  if (short.tooMany !== null)
    notes.push(
      `The drawing has ${short.tooMany} elements; keep it under ${GATE.maxElements / 2}.`,
    );
  const score =
    100 -
    12 * short.missingParts.length -
    10 * short.missingStates.length -
    4 * short.missingLabels.length -
    (short.still ? 25 : 0) -
    (short.smallText !== null ? 5 : 0) -
    (short.tooMany !== null ? 10 : 0);
  return {
    notes,
    retry:
      short.missingParts.length + short.missingStates.length > 0 ||
      short.still ||
      short.tooMany !== null,
    score,
  };
}

/**
 * One drawing through the whole gate: inspected, rendered in a child to
 * prove it draws and to find its ink, framed, and serialised. A drawing
 * that renders is returned even when it fell short, so the processor can
 * keep the better of two tries.
 */
export async function gateDrawing(
  reply: string,
  thing: Pick<DrawingThing, 'parts' | 'states' | 'motion'> & { name?: string },
): Promise<GateResult> {
  const inspected = inspectSvg(reply, thing);
  if (!inspected.root)
    return {
      drawing: null,
      notes: inspected.notes,
      retry: true,
      score: 0,
      mended: inspected.mended,
    };
  const { root, mended, short } = inspected;
  let viewBox = inspected.viewBox;
  const failed = (note: string): GateResult => ({
    drawing: null,
    notes: [note],
    retry: true,
    score: 0,
    mended,
  });
  root.attribs.viewBox = viewBox.join(' ');
  delete root.attribs.viewbox;
  delete root.attribs.width;
  delete root.attribs.height;
  delete root.attribs.preserveAspectRatio;
  let svg = render(root, { xmlMode: true, selfClosingTags: true });
  if (svg.length > GATE.maxChars)
    return failed(
      `The drawing is ${svg.length} characters; keep it under ${GATE.heavyChars}.`,
    );
  if (!numbersSane(root))
    return failed(
      'A number in the drawing cannot be drawn; check the coordinates and the viewBox.',
    );
  let ink: InkBox | null;
  try {
    ({ ink } = await renderSvg(svg));
  } catch (error) {
    return failed(
      `The drawing will not render (${(error as Error).message}). Write plain, well-formed SVG.`,
    );
  }
  if (!ink || ink.width * ink.height < viewBox[2] * viewBox[3] * 0.01)
    return failed(
      'The drawing came out blank: draw the thing, large, inside the viewBox.',
    );
  // Its labels lifted out for the stage to set, and the drawing framed to
  // its own ink without them. A drawing whose labels cannot be measured
  // keeps them, as drawn.
  let callouts: Callout[] = [];
  let field: InkField | null = null;
  const before = namedGroups(root, thing);
  if (Object.keys(before.labels).length)
    try {
      const lifted = await liftCallouts(root, before, viewBox);
      callouts = lifted.callouts;
      field = lifted.field;
      if (lifted.ink && lifted.ink.width > 0 && lifted.ink.height > 0)
        ink = lifted.ink;
      if (lifted.lifted.length)
        mended.push(
          `lifted ${lifted.lifted.length} label${lifted.lifted.length === 1 ? '' : 's'} for the stage to set`,
        );
    } catch (error) {
      mended.push(`labels left as drawn: ${(error as Error).message}`);
    }
  svg = render(root, { xmlMode: true, selfClosingTags: true });
  const framed = framedBox(viewBox, ink);
  if (framed.join(' ') !== viewBox.join(' ')) {
    viewBox = framed;
    root.attribs.viewBox = viewBox.join(' ');
    svg = render(root, { xmlMode: true, selfClosingTags: true });
    mended.push(`framed to ${viewBox.join(' ')}`);
  }
  if (svg.length > GATE.heavyChars)
    mended.push(`heavy: ${svg.length} characters`);
  const { parts, labels, states } = namedGroups(root, thing);
  return {
    drawing: {
      svg,
      viewBox,
      aspect: Math.min(2.6, Math.max(0.4, viewBox[2] / viewBox[3])),
      parts,
      labels,
      states,
      moves: movesOf(root),
      callouts,
      field,
    },
    ...judged(short, thing, viewBox[2]),
    mended,
  };
}
