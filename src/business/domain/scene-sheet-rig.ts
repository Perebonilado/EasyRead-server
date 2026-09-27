/**
 * An animal or a creature the artist drew, made ready for code to move,
 * as the figure kit's people are. The artist's own motion is taken out:
 * it turned Pip's tail about a point 730 units away, since an origin in
 * px under fill-box counts from the part's own corner. Every part is
 * measured against the body and proved joined, and one that floats a
 * little is moved in to meet it. Code then moves the parts: the body
 * breathes, the tail wags and the ears twitch, each turning about its
 * own joint, and only as far as it stays joined at every extreme.
 *
 * Motion goes on groups of the rig's own, by class, never on the parts'
 * ids: the parts keep their ids and anything else aimed at them.
 */
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import { Element, Text } from 'domhandler';
import { byId, elements, removeNode, textOf, walk } from './scene-dom';
import {
  IDENTITY,
  apply,
  distanceTo,
  inkBoxOf,
  inkCells,
  invert,
  joined,
  mendVector,
  multiply,
  parseTransform,
  relate,
  type Matrix,
  type Point,
  type Relation,
  type ViewBox,
} from './scene-joints';
import { renderSvg, type InkBox, type InkMap } from './scene-raster';
import type { CharacterSheet } from './scene-sheet';
import type { GatedDrawing } from './scene-svg';

/**
 * Rigs made by an older way of making them are made again. 4: the head
 * dips about its joint, the tail wags wide on cue, and the body sinks on
 * its legs, for the stage to act the words with. 5: what lived by its
 * own motion, found by its name, moves by code: a flame flickers, wings
 * flap, a glow pulses, a fin swishes, leaves rustle.
 */
export const RIG_VERSION = 5;

/** What the rig found and did: each part's joint, in the drawing's units, and each part moved in to meet the body. */
export interface SheetRig {
  version: number;
  joints: Record<string, Point>;
  mended: { part: string; dx: number; dy: number }[];
  /** How far the head turns about its joint, in degrees, proved joined: absent, it keeps still. */
  dip?: number;
  /** How far the body sinks on its legs lying down, as a share of the frame's height: absent, it stands. */
  sinks?: number;
  /** Which way it faces as drawn: its head to the left (-1) or the right (1) of its body; absent, the viewer. */
  faces?: -1 | 1;
}

/** The most the body sinks on its legs, as a share of their height: lying down. */
const LOW_MOST = 0.55;
/** A head this far to one side of the body's middle, as a share of the body's width, faces that way. */
const FACING_SHARE = 0.15;

/** A part drawn inside a group the rig moved it in by before: that group, which moves with it. */
function mendedOuter(node: Element): Element {
  const parent = node.parent as Element | null;
  return parent &&
    /\brig-mend\b/.test(parent.attribs.class ?? '') &&
    elements(parent.children).length === 1
    ? mendedOuter(parent)
    : node;
}

/**
 * The stage's still frame, in seconds, for anyone who asks for less
 * motion (STILL_AT_MS in the client's timeline): a swing is at its
 * middle there, so the still shows the part as drawn.
 */
export const STILL_AT_S = 1.5;

/** How far each part moves, before holdsTogether halves it. */
export const SWINGS = {
  /** The body's rise, as a share of the sheet's height. */
  breathe: 0.0035,
  breatheS: 4.2,
  wag: 12,
  wagS: 1.6,
  ear: 4,
  earS: 3.2,
  /** How far the tail wags on cue (the stage sets how far and how fast), and the head dips. */
  wagAct: 28,
  dip: 16,
  /** How the tail shows a feeling: wide and quick, drooping, tucked, stiff and raised. */
  happy: 18,
  happyS: 0.7,
  sad: 25,
  sadS: 3.2,
  afraid: 40,
  afraidS: 1.4,
  surprised: 15,
  /** What moved by its own motion: a flame's flicker (a share of its size), a wing's flap, a fin's swish and leaves' rustle (degrees), a glow's swell (a share). */
  flicker: 0.12,
  flickerS: 0.9,
  flap: 22,
  flapS: 0.7,
  swish: 16,
  swishS: 1.2,
  rustle: 4,
  rustleS: 1.1,
  pulse: 0.06,
  pulseS: 2.2,
} as const;

/** How a part that lived by its own motion moves, found by its name. */
export type Mover = 'flicker' | 'flap' | 'pulse' | 'swish' | 'rustle';

/** The words in a part's name that say how it moves: its id's, or its classes'. */
const MOVER_WORDS: Record<string, Mover> = {
  flame: 'flicker',
  flames: 'flicker',
  fire: 'flicker',
  blaze: 'flicker',
  wing: 'flap',
  wings: 'flap',
  glow: 'pulse',
  halo: 'pulse',
  aura: 'pulse',
  shine: 'pulse',
  sparkle: 'pulse',
  fin: 'swish',
  fins: 'swish',
  leaf: 'rustle',
  leaves: 'rustle',
  foliage: 'rustle',
  frond: 'rustle',
  fronds: 'rustle',
};

/** How a part moves by its name, or null for one that does not. */
export function moverOf(node: Pick<Element, 'attribs'>): Mover | null {
  const names = [node.attribs.id ?? '', node.attribs.class ?? '']
    .join(' ')
    .toLowerCase()
    .split(/[^a-z]+/);
  for (const word of names) if (MOVER_WORDS[word]) return MOVER_WORDS[word];
  return null;
}

const SMIL = new Set(['animate', 'animatetransform', 'animatemotion', 'set']);

/** CSS that moves things: every animation, transition and transform (and its parts: a turn, a scale, a move), and where a transform turns. */
const MOTION =
  /^(?:animation(?:-[a-z-]+)?|transition(?:-[a-z-]+)?|transform|transform-origin|transform-box|rotate|scale|translate)$/i;

/** Where a drawing defines things rather than drawing them: kept in every version of it. */
const DEFINITIONS = new Set([
  'defs',
  'style',
  'lineargradient',
  'radialgradient',
  'pattern',
  'clippath',
  'mask',
  'marker',
  'filter',
  'symbol',
]);

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

/** Declarations with no motion in them. */
function stillDeclarations(block: string): string {
  return block
    .split(';')
    .filter((declaration) => {
      const at = declaration.indexOf(':');
      if (at < 0) return declaration.trim().length > 0;
      return !MOTION.test(declaration.slice(0, at).trim());
    })
    .join(';');
}

/** The index of the brace that closes the one at `open`, or the end. */
function closing(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

/** A stylesheet with its motion taken out: no @keyframes, and no declaration that animates or transforms. */
export function stillCss(css: string): string {
  let out = '';
  let at = 0;
  while (at < css.length) {
    const open = css.indexOf('{', at);
    if (open < 0) break;
    let head = css.slice(at, open);
    // A statement before the rule (an @charset) is kept as written.
    const semi = head.lastIndexOf(';');
    if (semi >= 0) {
      out += head.slice(0, semi + 1);
      head = head.slice(semi + 1);
    }
    const close = closing(css, open);
    const body = css.slice(open + 1, close);
    const name = head.trim();
    if (/^@(?:-[a-z]+-)?keyframes\b/i.test(name)) {
      // Motion, all of it.
    } else if (name.startsWith('@')) {
      const inner = stillCss(body);
      if (inner.trim()) out += `${name}{${inner}}`;
    } else {
      const kept = stillDeclarations(body);
      if (kept.trim()) out += `${name}{${kept}}`;
    }
    at = close + 1;
  }
  return out;
}

function setText(node: Element, text: string): void {
  const replacement = new Text(text);
  replacement.parent = node;
  node.children = [replacement];
}

function unwrap(node: Element): void {
  const parent = node.parent as Element | null;
  if (!parent) return;
  const at = parent.children.indexOf(node);
  for (const child of node.children) child.parent = parent;
  parent.children.splice(at, 1, ...node.children);
}

/**
 * A drawing with the artist's motion taken out, in place: no SMIL, no
 * @keyframes, no animation, transform or transform-origin in its CSS,
 * and no motion from a rig made before. Its transform attributes and its
 * colours are kept: that is where the parts are drawn. Returns what went.
 */
export function stillSheet(root: Element): string[] {
  const removed = new Set<string>();
  for (const node of [...walk(root)]) {
    const name = node.name.toLowerCase();
    if (SMIL.has(name)) {
      removeNode(node);
      removed.add('SMIL');
      continue;
    }
    if (
      name === 'g' &&
      !node.attribs.id &&
      /\brig-(?:breathe|tail|ear|head|legs|flicker|flap|pulse|swish|rustle)\b/.test(
        node.attribs.class ?? '',
      )
    ) {
      unwrap(node);
      removed.add('an old rig');
      continue;
    }
    if (name === 'style') {
      const css = textOf(node);
      const kept = stillCss(css);
      if (kept.replace(/\s/g, '') !== css.replace(/\s/g, ''))
        removed.add('CSS motion');
      if (kept.trim()) setText(node, kept);
      else removeNode(node);
    }
    if (node.attribs.style !== undefined) {
      const kept = stillDeclarations(node.attribs.style);
      if (kept !== node.attribs.style) removed.add('inline motion');
      if (kept.trim()) node.attribs.style = kept;
      else delete node.attribs.style;
    }
  }
  return [...removed];
}

/** A part of the figure measured against the rest. */
interface Limb {
  /** Its name in the rig: head, legs, arms, tail, ears, or an ear's own id; or a part that moves by its name, by its own. */
  name: string;
  kind: 'head' | 'legs' | 'arms' | 'tail' | 'ear' | 'ears' | 'mover';
  /** How a part found by its name moves. */
  motion?: Mover;
  node: Element;
  /** What moves it: the part, or the rig's group round it once it is moved in. */
  outer: Element;
}

interface Figure {
  body: Element | null;
  head: Element | null;
  faces: Element[];
  limbs: Limb[];
}

const EAR_ID =
  /^(?:ears?[-_\s]?(?:l|r|left|right|\d)|(?:left|right)[-_\s]?ears?)$/i;

const hasInk = (node: Element) =>
  [...walk(node)].some((one) => DRAWN.has(one.name.toLowerCase()));

/** Whether `a` is `b` or holds it, through parents that still hold what they held. */
function holds(a: Element, b: Element): boolean {
  for (let at: Element | null = b; at;) {
    if (at === a) return true;
    const parent = at.parent as Element | null;
    if (parent && !parent.children.includes(at)) return false;
    at = parent;
  }
  return false;
}

/**
 * What rises as the body breathes: everything drawn but the legs, each
 * group as high up as it can be taken without them. The body, the head,
 * the faces over it, and whatever else the artist drew (a collar, a
 * saddle), so nothing slides on what it is drawn on. Everything, when
 * there are no legs to stand on.
 */
function aboveLegs(node: Element, legs: Element | null): Element[] {
  return elements(node.children).flatMap((child) => {
    if (child === legs || DEFINITIONS.has(child.name.toLowerCase())) return [];
    if (legs && holds(child, legs)) return aboveLegs(child, legs);
    return hasInk(child) ? [child] : [];
  });
}

const TAIL_NAME = /(?:^|[-_\s])tail|^tail/i;

/**
 * A tail drawn before tails were asked for, by any name that says so
 * ("tailwag", "dog-tail"): the outermost such element, never one on the
 * head.
 */
function tailByName(root: Element, head: Element | null): Element | null {
  const named = (node: Element) =>
    TAIL_NAME.test(node.attribs.id ?? '') ||
    (node.attribs.class ?? '').split(/\s+/).some((one) => TAIL_NAME.test(one));
  const found = [...walk(root)].filter(
    (node) =>
      node !== root &&
      named(node) &&
      hasInk(node) &&
      !(head && holds(head, node)),
  );
  return (
    found.find(
      (node) => !found.some((other) => other !== node && holds(other, node)),
    ) ?? null
  );
}

/**
 * A tail drawn inside the body (or the legs or arms) taken out to be a
 * part of its own, just behind the part it was in and drawn exactly where
 * it was: then it can be measured against the body and turn about its own
 * joint without taking the body with it.
 */
function lifted(
  root: Element,
  tail: Element | null,
  parts: (Element | null)[],
): Element | null {
  const within =
    tail && parts.find((part) => part && part !== tail && holds(part, tail));
  if (!tail || !within) return tail;
  const from = spaceOf(root, tail);
  const to = spaceOf(root, within);
  const back = to && invert(to);
  if (!from || !back) return tail;
  const [a, b, c, d, e, f] = multiply(back, from);
  const parent = tail.parent as Element;
  parent.children.splice(parent.children.indexOf(tail), 1);
  const home = within.parent as Element;
  const identity = [a, b, c, d, e, f].every(
    (n, i) => Math.abs(n - IDENTITY[i]) < 1e-9,
  );
  const placed = identity
    ? tail
    : new Element('g', {
        transform: `matrix(${[a, b, c, d, e, f].map((n) => r4(n)).join(' ')})`,
      });
  if (placed !== tail) {
    placed.children = [tail];
    tail.parent = placed;
  }
  home.children.splice(home.children.indexOf(within), 0, placed);
  placed.parent = home;
  return tail;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * The figure's parts, found by the names the gate matched, and a tail
 * drawn before tails were asked for, by its own name, taken out of the
 * body when it was drawn inside it.
 */
function figureOf(
  root: Element,
  drawing: Pick<GatedDrawing, 'parts' | 'states'>,
): Figure {
  const part = (name: string) => {
    const id = drawing.parts[name];
    return id ? byId(root, id) : null;
  };
  const head = part('head');
  // The drawing's own groups, and inside any the rig moved in before.
  const top = (node: Element): Element[] =>
    elements(node.children).flatMap((child) =>
      /\brig-mend\b/.test(child.attribs.class ?? '') ? top(child) : [child],
    );
  const tail = lifted(
    root,
    part('tail') ??
      top(root).find(
        (node) =>
          node.name.toLowerCase() === 'g' && /^tail$/i.test(node.attribs.id),
      ) ??
      tailByName(root, head),
    [part('body'), part('arms'), part('legs')],
  );
  const faces = Object.values(drawing.states)
    .map((id) => byId(root, id))
    .filter((node): node is Element => Boolean(node));
  // A part the rig moved in before moves with the group that moved it.
  const outerOf = (node: Element): Element => {
    const parent = node.parent as Element | null;
    return parent &&
      /\brig-mend\b/.test(parent.attribs.class ?? '') &&
      elements(parent.children).length === 1
      ? outerOf(parent)
      : node;
  };
  const limbs: Limb[] = [];
  const add = (name: string, kind: Limb['kind'], node: Element | null) => {
    if (node && hasInk(node))
      limbs.push({ name, kind, node, outer: outerOf(node) });
  };
  add('head', 'head', head);
  add('legs', 'legs', part('legs'));
  add('arms', 'arms', part('arms'));
  add('tail', 'tail', tail);
  if (head) {
    // Ears each in a group of their own turn about their own joints; ears
    // drawn as one group are only held on.
    const group = part('ears');
    const each = group
      ? elements(group.children).filter(
          (node) => node.name.toLowerCase() === 'g' && hasInk(node),
        )
      : [...walk(root)].filter((node) => EAR_ID.test(node.attribs.id ?? ''));
    if (group && each.length < 2) add('ears', 'ears', group);
    else
      each
        .filter(
          (ear) => !each.some((other) => other !== ear && holds(other, ear)),
        )
        .forEach((ear, i) => add(ear.attribs.id || `ear-${i + 1}`, 'ear', ear));
  }
  // Parts that lived by their own motion, by their names (a flame, a wing,
  // a glow): the outermost of each, never a part or a face named above.
  const named = [...walk(root)].filter(
    (node) =>
      node !== root &&
      moverOf(node) &&
      hasInk(node) &&
      !limbs.some((limb) => holds(node, limb.node) || limb.node === node) &&
      !faces.some((face) => holds(face, node) || holds(node, face)),
  );
  named
    .filter(
      (node) => !named.some((other) => other !== node && holds(other, node)),
    )
    .forEach((node, i) => {
      const motion = moverOf(node)!;
      limbs.push({
        name: node.attribs.id || `${motion}-${i + 1}`,
        kind: 'mover',
        motion,
        node,
        outer: outerOf(node),
      });
    });
  return { body: part('body'), head, faces, limbs };
}

const ears = (figure: Figure) =>
  figure.limbs.filter((limb) => limb.kind === 'ear' || limb.kind === 'ears');

/** What a part is measured against: the head against the trunk, an ear against the head, anything else against the rest of the trunk. */
function referenceOf(
  limb: Limb,
  figure: Figure,
): { keep: Element[] | null; drop: Element[] } | null {
  // A part that moves by its name, against what it is on: the head, when
  // it is drawn in it (a flame for hair); else all the rest of the figure.
  if (limb.kind === 'mover')
    return figure.head &&
      figure.head !== limb.node &&
      holds(figure.head, limb.node)
      ? { keep: [figure.head], drop: [...figure.faces, limb.node] }
      : { keep: null, drop: [...figure.faces, limb.node] };
  if (limb.kind === 'ear' || limb.kind === 'ears')
    return figure.head
      ? {
          keep: [figure.head],
          drop: [...figure.faces, ...ears(figure).map((one) => one.node)],
        }
      : null;
  // The trunk: the body, arms and legs, and whatever the artist drew
  // outside the named parts (a collar, a saddle), less this part.
  const others = figure.limbs
    .filter((one) => one.kind !== 'legs' && one.kind !== 'arms')
    .map((one) => one.node);
  return { keep: null, drop: [...figure.faces, limb.node, ...others] };
}

const partOf = (limb: Limb, figure: Figure) => ({
  keep: [limb.node],
  drop: [
    ...figure.faces,
    ...figure.limbs.filter((one) => one !== limb).map((one) => one.node),
  ],
});

/** The path to a node from the root, child by child. */
function pathOf(root: Element, node: Element): number[] {
  const path: number[] = [];
  for (let at = node; at !== root;) {
    const parent = at.parent as Element;
    path.unshift(parent.children.indexOf(at));
    at = parent;
  }
  return path;
}

function follow(root: Element, path: number[]): Element {
  let at = root;
  for (const i of path) at = at.children[i] as Element;
  return at;
}

/** A new group put round a node, where the node was. */
function wrap(node: Element, attribs: Record<string, string>): Element {
  const parent = node.parent as Element;
  const group = new Element('g', attribs);
  parent.children[parent.children.indexOf(node)] = group;
  group.parent = parent;
  group.children = [node];
  node.parent = group;
  return group;
}

/**
 * One version of the drawing: only what `keep` holds (everything, when
 * null) less what `drop` holds, with the groups in `moved` given a
 * transform. Its definitions and styles stay, so its colours do too.
 */
export function variant(
  root: Element,
  keep: Element[] | null,
  drop: Element[],
  moved: Map<Element, string> = new Map(),
): string {
  const copy = root.cloneNode(true);
  const inCopy = (node: Element) => follow(copy, pathOf(root, node));
  const keeps = keep ? new Set(keep.map(inCopy)) : null;
  // Never what holds a part that is kept.
  const drops = new Set(
    drop.filter((one) => !keep?.some((kept) => holds(one, kept))).map(inCopy),
  );
  const moves = [...moved].map(([node, transform]) => ({
    node: inCopy(node),
    transform,
  }));
  const prune = (node: Element, kept: boolean): boolean => {
    node.children = node.children.filter((child) => {
      if (!(child instanceof Element)) return true;
      if (drops.has(child)) return false;
      if (DEFINITIONS.has(child.name.toLowerCase())) return true;
      const keepIt = kept || !keeps || keeps.has(child);
      if (child.children.some((one) => one instanceof Element))
        return prune(child, keepIt) || keepIt;
      return keepIt;
    });
    return node.children.some(
      (child) =>
        child instanceof Element && !DEFINITIONS.has(child.name.toLowerCase()),
    );
  };
  prune(copy, false);
  for (const { node, transform } of moves)
    if (holds(copy, node)) wrap(node, { transform });
  return render(copy, { xmlMode: true, selfClosingTags: true });
}

/** How many cells across the maps are: about 480 on the longer side. */
const maskCols = ([, , w, h]: ViewBox) =>
  Math.max(64, Math.round((480 * w) / Math.max(w, h)));

/** Maps of several versions of one drawing, each drawn once however often it is asked for. */
async function masksOf(svgs: string[], viewBox: ViewBox): Promise<InkMap[]> {
  const unique = [...new Set(svgs)];
  if (!unique.length) return [];
  const { masks } = await renderSvg(unique[0], undefined, {
    masks: { svgs: unique, cols: maskCols(viewBox) },
  });
  if (!masks || masks.length !== unique.length)
    throw new Error('the parts came back unmeasured');
  const bySvg = new Map(unique.map((svg, i) => [svg, masks[i]]));
  return svgs.map((svg) => bySvg.get(svg)!);
}

/** A part as measured: how it meets the rest, where its ink is, and where the rest's is. */
interface Measured {
  relation: Relation;
  box: InkBox | null;
  restBox: InkBox | null;
}

/** Every part measured against what it joins, in one render. */
async function measure(
  root: Element,
  figure: Figure,
  viewBox: ViewBox,
): Promise<Map<string, Measured>> {
  const plans = figure.limbs.flatMap((limb) => {
    const ref = referenceOf(limb, figure);
    if (!ref) return [];
    const part = partOf(limb, figure);
    return [
      {
        limb,
        part: variant(root, part.keep, part.drop),
        ref: variant(root, ref.keep, ref.drop),
      },
    ];
  });
  const masks = await masksOf(
    plans.flatMap((plan) => [plan.part, plan.ref]),
    viewBox,
  );
  const out = new Map<string, Measured>();
  plans.forEach((plan, i) => {
    const part = masks[i * 2];
    const ref = masks[i * 2 + 1];
    const restBox = inkBoxOf(ref, viewBox);
    // Nothing to join, or nothing to be joined: nothing to say.
    if (!restBox || !inkCells(part)) return;
    out.set(plan.limb.name, {
      relation: relate(part, ref, viewBox),
      box: inkBoxOf(part, viewBox),
      restBox,
    });
  });
  return out;
}

/** What to tell the artist about a part that floats. */
export function floatNote(kind: Limb['kind'], gap: number): string {
  const units = Math.round(gap);
  switch (kind) {
    case 'tail':
      return `The tail floats ${units} units from the body: draw its base overlapping the body, behind it.`;
    case 'legs':
      return `The legs float ${units} units from the body: draw their tops overlapping the body, behind it.`;
    case 'arms':
      return `The arms float ${units} units from the body: draw them overlapping the body at the shoulders.`;
    case 'head':
      return `The head floats ${units} units from the body: draw the neck overlapping the body.`;
    default:
      return `The ${kind === 'ear' ? 'ear' : 'ears'} float${kind === 'ear' ? 's' : ''} ${units} units from the head: draw ${kind === 'ear' ? 'its base' : 'their bases'} overlapping the head, behind it.`;
  }
}

function parse(svg: string): Element | null {
  const doc = parseDocument(svg, { xmlMode: true, recognizeCDATA: true });
  return (
    elements(doc.children).find((node) => node.name.toLowerCase() === 'svg') ??
    null
  );
}

/**
 * What floats in a drawn character, as notes for the artist: the parts
 * that do not meet the body (or an ear the head), as still as drawn.
 */
export async function jointNotes(drawing: GatedDrawing): Promise<string[]> {
  const root = parse(drawing.svg);
  if (!root) return [];
  stillSheet(root);
  const figure = figureOf(root, drawing);
  const measured = await measure(root, figure, drawing.viewBox);
  return figure.limbs.flatMap((limb) => {
    const one = measured.get(limb.name);
    return one && !joined(one.relation, drawing.viewBox)
      ? [floatNote(limb.kind, one.relation.gap)]
      : [];
  });
}

/** Where a group put round `node` draws: the space of the node's parent. Null when a transform cannot be read. */
function spaceOf(root: Element, node: Element): Matrix | null {
  const chain: Element[] = [];
  for (
    let at = node.parent as Element | null;
    at && at !== root;
    at = at.parent as Element | null
  )
    chain.unshift(at);
  let m = IDENTITY;
  for (const at of chain) {
    const t = parseTransform(at.attribs.transform);
    if (!t) return null;
    m = multiply(m, t);
  }
  return m;
}

/** A point in the drawing's units, in the space a group round `node` draws in. */
function localPoint(root: Element, node: Element, point: Point): Point | null {
  const space = spaceOf(root, node);
  const back = space && invert(space);
  return back ? apply(back, point) : null;
}

/** A move in the drawing's units, in the space a group round `node` draws in. */
function localMove(root: Element, node: Element, move: Point): Point | null {
  const space = spaceOf(root, node);
  const back = space && invert([...space.slice(0, 4), 0, 0] as Matrix);
  return back ? apply(back, move) : null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A limb moved in to meet the body, and put behind what it joins when it goes behind (a tail, legs, ears). */
function mend(root: Element, figure: Figure, limb: Limb, move: Point): boolean {
  const local = localMove(root, limb.outer, move);
  if (!local) return false;
  const moving = [limb];
  // What sits on the head moves with it: its faces, and ears drawn beside it.
  if (limb.kind === 'head')
    moving.push(
      ...ears(figure).filter((ear) => !holds(limb.node, ear.node)),
      ...figure.faces
        .filter((face) => !holds(limb.node, face))
        .map((face) => ({ ...limb, node: face, outer: face })),
    );
  for (const one of moving) {
    const here = localMove(root, one.outer, move) ?? local;
    const group = wrap(one.outer, {
      class: 'rig-mend',
      transform: `translate(${r1(here[0])} ${r1(here[1])})`,
    });
    const own = figure.limbs.find((other) => other.node === one.node);
    if (own) own.outer = group;
  }
  const joins =
    limb.kind === 'ear' || limb.kind === 'ears' ? figure.head : figure.body;
  if (
    joins &&
    limb.kind !== 'head' &&
    limb.kind !== 'arms' &&
    !holds(limb.outer, joins)
  ) {
    const parent = limb.outer.parent as Element;
    const siblings = parent.children;
    // Behind a sibling it joins, or first inside the group it is drawn in.
    const target = joins.parent === parent ? joins : null;
    const at = siblings.indexOf(limb.outer);
    const to = target
      ? siblings.indexOf(target)
      : parent === joins
        ? siblings.findIndex((one) => one instanceof Element)
        : -1;
    if (to >= 0 && to < at) {
      siblings.splice(at, 1);
      siblings.splice(to, 0, limb.outer);
    }
  }
  return true;
}

/** A motion to prove: what moves, what it must stay joined to, and how far, largest first. */
export interface Swing {
  part: { keep: Element[]; drop: Element[] };
  ref: { keep: Element[] | null; drop: Element[] };
  /** The transform for each group that moves, at one amplitude. */
  moved: (amplitude: number) => Map<Element, string>;
  /** The amplitude asked for; it is halved twice at most before the part is kept still. */
  amplitude: number;
  /** Whether it swings both ways, so both extremes are proved. */
  both: boolean;
}

/**
 * How far each motion may go: its amplitude when the part stays joined
 * at every extreme, halved when it does not, halved again, and 0 (still)
 * when it still does not. A part must also stay in the frame: one that
 * loses a quarter of its ink off the edge has gone too far. Each round
 * renders only the motions not yet proved, all in one child.
 */
export async function holdsTogether(
  root: Element,
  viewBox: ViewBox,
  swings: Swing[],
  grid?: string,
): Promise<{ amplitudes: number[]; grid?: InkMap }> {
  const amplitudes: (number | null)[] = swings.map(() => null);
  const whole: number[] = [];
  let field: InkMap | undefined;
  const distances = new Map<InkMap, Float64Array>();
  const toRef = (map: InkMap) => {
    const known = distances.get(map) ?? distanceTo(map);
    distances.set(map, known);
    return known;
  };
  for (let round = 0; round < 3; round += 1) {
    const open = swings.flatMap((swing, i) =>
      amplitudes[i] === null ? [{ swing, i }] : [],
    );
    if (!open.length) break;
    const svgs: string[] = [];
    const plans = open.map(({ swing, i }) => {
      const level = swing.amplitude * 0.5 ** round;
      const rest = round
        ? -1
        : svgs.push(variant(root, swing.part.keep, swing.part.drop)) - 1;
      const tries = (swing.both ? [1, -1] : [1]).map((sign) => {
        const moved = swing.moved(level * sign);
        return {
          part:
            svgs.push(variant(root, swing.part.keep, swing.part.drop, moved)) -
            1,
          ref:
            svgs.push(variant(root, swing.ref.keep, swing.ref.drop, moved)) - 1,
        };
      });
      return { i, level, rest, tries };
    });
    const [masks, measured] = await Promise.all([
      masksOf(svgs, viewBox),
      grid && !round
        ? renderSvg(grid, undefined, { grid: { svg: grid, cols: 48 } })
        : Promise.resolve(null),
    ]);
    if (measured?.grid) field = measured.grid;
    for (const { i, level, rest, tries } of plans) {
      if (rest >= 0) whole[i] = inkCells(masks[rest]);
      const holds = tries.every(({ part, ref }) => {
        const relation = relate(
          masks[part],
          masks[ref],
          viewBox,
          toRef(masks[ref]),
        );
        return (
          joined(relation, viewBox) && inkCells(masks[part]) >= whole[i] * 0.75
        );
      });
      if (holds) amplitudes[i] = level;
      else if (round === 2) amplitudes[i] = 0;
    }
  }
  return {
    amplitudes: amplitudes.map((one) => one ?? 0),
    ...(field ? { grid: field } : {}),
  };
}

/**
 * A delay that puts a swing at its middle, as drawn, on the still frame:
 * a quarter of the way through its cycle, where an ease-in-out from one
 * extreme to the other crosses 0.
 */
export function restDelay(cycle: number): number {
  const d = (STILL_AT_S - cycle / 4) % cycle;
  return r2(d > 0 ? d - cycle : d);
}

/** The amplitudes the rig moves with, once proved. */
interface Motion {
  breathe: number;
  wag: number;
  /** The tail's wag on cue, and the head's dip, each either way: the stage sets how far, -1 to 1. */
  wagAct?: number;
  dip?: number;
  /** How far the legs fold as the body sinks on them, as a share of their height: the stage sets how far, 0 to 1. */
  low?: number;
  happy: number;
  sad: number;
  afraid: number;
  surprised: number;
  ear: number;
  /** Which way the tail droops: 1 when it turns clockwise to hang down. */
  droop: 1 | -1;
}

const swingFrames = (name: string, a: number, b: number) =>
  `@keyframes ${name}{0%,100%{transform:rotate(${r2(a)}deg)}50%{transform:rotate(${r2(b)}deg)}}`;

const liftCss = ([x, y]: Point) =>
  x ? `translate(${r2(x)}px,${r2(y)}px)` : `translateY(${r2(y)}px)`;

/** A move in a group's own units, as CSS's translate takes it, times a variable the stage sets. */
const byVar = (name: string, [x, y]: Point) =>
  `calc(var(--${name},0)*${r2(x)}px) calc(var(--${name},0)*${r2(y)}px)`;

/**
 * The rig's CSS: each motion by class, its pivot on the group itself.
 * `lifts`: each breath's rise in the units of the groups that take it,
 * the first by rig-breathe alone, the rest by rig-breathe-1 and on;
 * `lows`, as far as each sinks when the legs fold all they may.
 *
 * What the stage acts, it sets on the drawing, -1 to 1 (0 as drawn):
 * --tail, the tail wagged (its own wag let go while .wagging); --head,
 * the head turned about its joint; --low, 0 to 1, the body sunk on its
 * legs, the legs folding under it.
 */
export function rigCss(
  motion: Motion,
  lifts: Point[] = [[0, -motion.breathe]],
  lows: Point[] = [],
): string {
  const { droop } = motion;
  const tail =
    motion.wag ||
    motion.happy ||
    motion.sad ||
    motion.afraid ||
    motion.surprised;
  // A feeling the tail cannot show without coming loose: it keeps still.
  const tailFeeling = (feeling: string, amplitude: number, css: string) =>
    !tail
      ? ''
      : amplitude
        ? css
        : `.feel-${feeling} .rig-tail{animation:none;transform:none}`;
  return [
    motion.breathe
      ? lifts
          .map((lift, k) => {
            const name = k ? `rig-breathe-${k}` : 'rig-breathe';
            const rule = k
              ? `.${name}{animation-name:${name}}`
              : `.rig-breathe{animation:rig-breathe ${SWINGS.breatheS}s ease-in-out infinite}`;
            return `${rule}@keyframes ${name}{0%,100%{transform:translateY(0)}50%{transform:${liftCss(lift)}}}`;
          })
          .join('')
      : '',
    tail || motion.ear ? '.rig-tail,.rig-ear{transform-box:view-box}' : '',
    motion.wag
      ? `.rig-tail{animation:rig-wag ${SWINGS.wagS}s ease-in-out ${restDelay(SWINGS.wagS)}s infinite}${swingFrames('rig-wag', -motion.wag, motion.wag)}`
      : '',
    tailFeeling(
      'happy',
      motion.happy,
      `.feel-happy .rig-tail{animation:rig-happy ${SWINGS.happyS}s ease-in-out infinite}${swingFrames('rig-happy', -motion.happy, motion.happy)}`,
    ),
    tailFeeling(
      'sad',
      motion.sad,
      `.feel-sad .rig-tail{animation:rig-sad ${SWINGS.sadS}s ease-in-out infinite}${swingFrames('rig-sad', droop * motion.sad, droop * motion.sad * 0.88)}`,
    ),
    tailFeeling(
      'afraid',
      motion.afraid,
      `.feel-afraid .rig-tail{animation:rig-afraid ${SWINGS.afraidS}s ease-in-out infinite}${swingFrames('rig-afraid', droop * motion.afraid, droop * motion.afraid * 0.93)}`,
    ),
    tailFeeling(
      'surprised',
      motion.surprised,
      `.feel-surprised .rig-tail{animation:none;transform:rotate(${r2(-droop * motion.surprised)}deg)}`,
    ),
    motion.ear
      ? `.rig-ear{animation:rig-ear ${SWINGS.earS}s ease-in-out ${restDelay(SWINGS.earS)}s infinite}.rig-ear-r{animation-name:rig-ear-r}${swingFrames('rig-ear', -motion.ear, motion.ear)}${swingFrames('rig-ear-r', motion.ear, -motion.ear)}`
      : '',
    // Acted: a wag on cue in place of its own, the head, the body sunk.
    motion.wagAct
      ? `.rig-tail{transform-box:view-box;rotate:calc(var(--tail,0)*${r2(motion.wagAct)}deg)}.wagging .rig-tail{animation:none;transform:none}`
      : '',
    motion.dip
      ? `.rig-head{transform-box:view-box;rotate:calc(var(--head,0)*${r2(motion.dip)}deg)}`
      : '',
    motion.low && lows.length
      ? [
          `.rig-legs{transform-box:view-box;scale:1 calc(1 - var(--low,0)*${r2(motion.low)})}`,
          ...lows.map(
            (low, k) =>
              `.${k ? `rig-breathe-${k}` : 'rig-breathe'}{translate:${byVar('low', low)}}`,
          ),
        ].join('')
      : '',
  ].join('');
}

/**
 * The CSS for what moves by its name, each kind as far as it was proved:
 * a flame stretching and squashing about its foot, wings beating (the
 * right one mirrored), a fin swishing, leaves rustling in small uneven
 * shakes, a glow swelling and dimming. Each on the still frame as drawn.
 */
export function moverCss(moving: ReadonlyMap<Mover, number>): string {
  const run = (name: Mover, s: number) =>
    `.rig-${name}{transform-box:view-box;animation:rig-${name} ${s}s ease-in-out ${restDelay(s)}s infinite}`;
  const out: string[] = [];
  const flicker = moving.get('flicker');
  if (flicker)
    out.push(
      run('flicker', SWINGS.flickerS),
      `@keyframes rig-flicker{0%,100%{transform:scale(1,1)}30%{transform:scale(${r4(1 + flicker * 0.4)},${r4(1 - flicker)})}65%{transform:scale(${r4(1 - flicker * 0.5)},${r4(1 + flicker)})}}`,
    );
  const flap = moving.get('flap');
  if (flap)
    out.push(
      run('flap', SWINGS.flapS),
      '.rig-flap-r{animation-name:rig-flap-r}',
      swingFrames('rig-flap', -flap, flap),
      swingFrames('rig-flap-r', flap, -flap),
    );
  const swish = moving.get('swish');
  if (swish)
    out.push(
      run('swish', SWINGS.swishS),
      swingFrames('rig-swish', -swish, swish),
    );
  const rustle = moving.get('rustle');
  if (rustle)
    out.push(
      run('rustle', SWINGS.rustleS),
      `@keyframes rig-rustle{0%,100%{transform:rotate(0deg)}20%{transform:rotate(${r2(rustle)}deg)}40%{transform:rotate(${r2(-rustle * 0.6)}deg)}60%{transform:rotate(${r2(rustle * 0.5)}deg)}80%{transform:rotate(${r2(-rustle * 0.3)}deg)}}`,
    );
  const pulse = moving.get('pulse');
  if (pulse !== undefined)
    out.push(
      run('pulse', SWINGS.pulseS),
      `@keyframes rig-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(${r4(1 + pulse)})}}`,
    );
  return out.join('');
}

const centreOf = (box: InkBox): Point => [
  box.x + box.width / 2,
  box.y + box.height / 2,
];

/**
 * A sheet the artist drew, rigged by code: made still, every part proved
 * joined (moved in when it floats no further than its own length), and
 * moved by the rig's CSS about its joints. A person drawn by the kit has
 * a rig of its own and comes back as it was. The notes say what could
 * not be joined; those parts are kept still.
 */
export async function rigSheet(
  sheet: CharacterSheet,
): Promise<{ sheet: CharacterSheet; notes: string[] }> {
  if (sheet.figure) return { sheet, notes: [] };
  const { drawing } = sheet;
  const root = parse(drawing.svg);
  if (!root) return { sheet, notes: [] };
  const viewBox = drawing.viewBox;
  stillSheet(root);
  const figure = figureOf(root, drawing);
  let measured = await measure(root, figure, viewBox);
  const notes: string[] = [];
  const mended: SheetRig['mended'] = [];
  for (const limb of figure.limbs) {
    const one = measured.get(limb.name);
    // Legs stand on the ground where the frame says: never moved up to the
    // body; and what moves by its name (a halo, a spark) may float.
    if (
      !one?.box ||
      limb.kind === 'legs' ||
      limb.kind === 'mover' ||
      joined(one.relation, viewBox)
    )
      continue;
    const move =
      one.relation.gap <= Math.max(one.box.width, one.box.height)
        ? mendVector(one.relation, one.box)
        : null;
    if (move && mend(root, figure, limb, move))
      mended.push({ part: limb.name, dx: move[0], dy: move[1] });
  }
  if (mended.length) measured = await measure(root, figure, viewBox);
  const joints: Record<string, Point> = {};
  for (const limb of figure.limbs) {
    const one = measured.get(limb.name);
    if (!one) continue;
    if (joined(one.relation, viewBox) && one.relation.joint)
      joints[limb.name] = one.relation.joint;
    else if (limb.kind !== 'mover')
      notes.push(
        `${floatNote(limb.kind, one.relation.gap)} ${limb.kind === 'legs' ? 'They are left standing where they are drawn.' : 'It could not be moved in, so it is kept still.'}`,
      );
  }
  // The notes about a character point at its head where it is now.
  const anchors = { ...sheet.anchors };
  const head = mended.find((one) => one.part === 'head');
  if (head && anchors.head)
    anchors.head = [
      r1(anchors.head[0] + head.dx),
      r1(anchors.head[1] + head.dy),
    ];
  // And its mouth, which moved with it.
  if (head && anchors.mouth)
    anchors.mouth = [
      r1(anchors.mouth[0] + head.dx),
      r1(anchors.mouth[1] + head.dy),
    ];

  // The motions to prove, each about its part's own joint.
  const tail = figure.limbs.find(
    (limb) => limb.kind === 'tail' && joints[limb.name],
  );
  const earLimbs = figure.limbs.filter(
    (limb) => limb.kind === 'ear' && joints[limb.name],
  );
  const legs = figure.limbs.find((limb) => limb.kind === 'legs');
  const neck = figure.limbs.find(
    (limb) => limb.kind === 'head' && joints[limb.name],
  );
  const rotate = (limb: Limb) => {
    const pivot = localPoint(root, limb.outer, joints[limb.name]);
    return pivot
      ? (degrees: number) =>
          new Map([
            [
              limb.outer,
              `rotate(${r2(degrees)} ${r1(pivot[0])} ${r1(pivot[1])})`,
            ],
          ])
      : null;
  };
  // Everything but the legs rises as the body breathes, together.
  const lifted = aboveLegs(root, legs?.outer ?? null);
  const swings: { name: keyof Motion; swing: Swing }[] = [];
  const tailTurns = tail ? rotate(tail) : null;
  const tailOn = tail && measured.get(tail.name);
  let droop: 1 | -1 = 1;
  if (tail && tailTurns && tailOn?.box && tailOn.restBox) {
    // A tail droops away from the body's middle and down.
    droop = centreOf(tailOn.box)[0] >= centreOf(tailOn.restBox)[0] ? 1 : -1;
    const ref = referenceOf(tail, figure)!;
    const part = partOf(tail, figure);
    const swing = (amplitude: number, both: boolean): Swing => ({
      part,
      ref,
      moved: tailTurns,
      amplitude,
      both,
    });
    swings.push(
      { name: 'wag', swing: swing(SWINGS.wag, true) },
      { name: 'wagAct', swing: swing(SWINGS.wagAct, true) },
      { name: 'happy', swing: swing(SWINGS.happy, true) },
      { name: 'sad', swing: swing(droop * SWINGS.sad, false) },
      { name: 'afraid', swing: swing(droop * SWINGS.afraid, false) },
      { name: 'surprised', swing: swing(-droop * SWINGS.surprised, false) },
    );
  }
  // The head dips about where it joins the body, either way, as far as
  // it stays joined: to lick, to sniff, to chew.
  const headTurns = neck ? rotate(neck) : null;
  if (neck && headTurns)
    swings.push({
      name: 'dip',
      swing: {
        part: partOf(neck, figure),
        ref: referenceOf(neck, figure)!,
        moved: headTurns,
        amplitude: SWINGS.dip,
        both: true,
      },
    });
  const earTurns = earLimbs.map((ear) => ({ ear, turns: rotate(ear) }));
  for (const { ear, turns } of earTurns)
    if (turns)
      swings.push({
        name: 'ear',
        swing: {
          part: partOf(ear, figure),
          ref: referenceOf(ear, figure)!,
          moved: turns,
          amplitude: SWINGS.ear,
          both: true,
        },
      });
  const rise = SWINGS.breathe * viewBox[3];
  if (legs && joints[legs.name]) {
    swings.push({
      name: 'breathe',
      swing: {
        part: partOf(legs, figure),
        ref: referenceOf(legs, figure)!,
        moved: (amount) =>
          new Map(
            lifted.flatMap((node): [Element, string][] => {
              const move = localMove(root, node, [0, -amount]);
              return move
                ? [[node, `translate(${r2(move[0])} ${r2(move[1])})`]]
                : [];
            }),
          ),
        amplitude: rise,
        both: false,
      },
    });
  }
  // What moved by its own motion, about where it is held: a flame about
  // its foot, a glow about its middle, a wing, a fin and leaves about where
  // they join what they are on.
  const movers = figure.limbs.flatMap((limb) => {
    const one = measured.get(limb.name);
    const motion = limb.motion;
    if (limb.kind !== 'mover' || !motion || !one?.box) return [];
    const box = one.box;
    const at: Point | undefined =
      motion === 'flicker'
        ? [box.x + box.width / 2, box.y + box.height]
        : motion === 'pulse'
          ? centreOf(box)
          : joints[limb.name];
    const pivot = at && localPoint(root, limb.outer, at);
    if (!at || !pivot) return [];
    const [px, py] = pivot.map(r1);
    const scaled = (sx: number, sy: number) =>
      `translate(${px} ${py}) scale(${r4(sx)} ${r4(sy)}) translate(${-px} ${-py})`;
    const moved = (amount: number) =>
      new Map([
        [
          limb.outer,
          motion === 'flicker'
            ? scaled(1 - amount * 0.5, 1 + amount)
            : motion === 'pulse'
              ? scaled(1 + amount, 1 + amount)
              : `rotate(${r2(amount)} ${px} ${py})`,
        ],
      ]);
    // A wing on the right flaps the other way to one on the left.
    const right =
      one.restBox && at[0] > centreOf(one.restBox)[0] ? true : false;
    return [
      {
        limb,
        motion,
        pivot: [px, py] as Point,
        right,
        swing: {
          part: partOf(limb, figure),
          ref: referenceOf(limb, figure)!,
          moved,
          amplitude: SWINGS[motion],
          both: motion !== 'pulse',
        } satisfies Swing,
      },
    ];
  });
  const still = render(root, { xmlMode: true, selfClosingTags: true });
  const proved = await holdsTogether(
    root,
    viewBox,
    [...swings.map((one) => one.swing), ...movers.map((one) => one.swing)],
    still,
  );
  const moverAmplitudes = proved.amplitudes.slice(swings.length);
  const amplitude = (name: keyof Motion) => {
    const found = swings
      .map((one, i) => ({ name: one.name, amplitude: proved.amplitudes[i] }))
      .filter((one) => one.name === name);
    // Every ear must hold at the amplitude they all share.
    return found.length
      ? Math.min(...found.map((one) => Math.abs(one.amplitude)))
      : 0;
  };
  // How far the body may sink on its legs, folding them under it: as far
  // as its lowest ink stays off the ground, and at most half again of
  // their height. Joined all the way, since the legs fold as it sinks.
  const legsOn =
    legs && joints[legs.name] ? measured.get(legs.name) : undefined;
  const sink =
    legsOn?.box && legsOn.restBox
      ? Math.min(
          LOW_MOST * legsOn.box.height,
          legsOn.box.y +
            legsOn.box.height -
            (legsOn.restBox.y + legsOn.restBox.height) -
            0.04 * legsOn.box.height,
        )
      : 0;
  const low =
    legsOn?.box && sink > 0.08 * legsOn.box.height
      ? sink / legsOn.box.height
      : 0;
  const motion: Motion = {
    // No legs to lift off: the body breathes as far as it likes.
    breathe: legs && joints[legs.name] ? amplitude('breathe') : rise,
    wag: amplitude('wag'),
    wagAct: amplitude('wagAct'),
    dip: amplitude('dip'),
    low: r2(low),
    happy: amplitude('happy'),
    sad: amplitude('sad'),
    afraid: amplitude('afraid'),
    surprised: amplitude('surprised'),
    ear: amplitude('ear'),
    droop,
  };
  // Which way it faces as drawn: its head well to one side of its body.
  const headOn = neck && measured.get(neck.name);
  const faces: -1 | 1 | null =
    headOn?.box &&
    headOn.restBox &&
    Math.abs(centreOf(headOn.box)[0] - centreOf(headOn.restBox)[0]) >
      FACING_SHARE * headOn.restBox.width
      ? centreOf(headOn.box)[0] > centreOf(headOn.restBox)[0]
        ? 1
        : -1
      : null;

  // The rig's groups, round the parts as they are now: a tail and ears
  // each turning about its joint, the head about its own, the legs
  // folding, and everything above the legs rising.
  const tailMoves =
    motion.wag ||
    motion.happy ||
    motion.sad ||
    motion.afraid ||
    motion.surprised;
  const wrapped = new Map<Element, Element>();
  const outermost = (node: Element) => wrapped.get(node) ?? node;
  const turnAbout = (limb: Limb, className: string) => {
    const pivot = localPoint(root, limb.outer, joints[limb.name]);
    if (!pivot) return;
    wrapped.set(
      limb.outer,
      wrap(outermost(limb.outer), {
        class: className,
        style: `transform-origin:${r1(pivot[0])}px ${r1(pivot[1])}px`,
      }),
    );
  };
  if (tail && tailTurns && (tailMoves || motion.wagAct))
    turnAbout(tail, 'rig-tail');
  if (motion.ear && figure.head) {
    const headBox = measured.get(earLimbs[0]?.name ?? '')?.restBox;
    for (const { ear, turns } of earTurns) {
      if (!turns) continue;
      const right = headBox
        ? joints[ear.name][0] > centreOf(headBox)[0]
        : false;
      turnAbout(ear, right ? 'rig-ear rig-ear-r' : 'rig-ear');
    }
  }
  if (motion.dip && neck) {
    // The head and what sits on it, drawn beside it: its faces, its ears.
    turnAbout(neck, 'rig-head');
    const beside = [
      ...figure.faces.map(mendedOuter),
      ...ears(figure).map((ear) => ear.outer),
    ].filter((node) => !holds(neck.node, node) && !holds(node, neck.node));
    for (const node of new Set(beside)) {
      const pivot = localPoint(root, node, joints[neck.name]);
      if (!pivot) continue;
      wrapped.set(
        node,
        wrap(outermost(node), {
          class: 'rig-head',
          style: `transform-origin:${r1(pivot[0])}px ${r1(pivot[1])}px`,
        }),
      );
    }
  }
  if (motion.low && legs && legsOn?.box) {
    // The legs fold from the ground up: shorter, their feet where they stand.
    const foot = localPoint(root, legs.outer, [
      legsOn.box.x + legsOn.box.width / 2,
      legsOn.box.y + legsOn.box.height,
    ]);
    if (foot)
      wrapped.set(
        legs.outer,
        wrap(outermost(legs.outer), {
          class: 'rig-legs',
          style: `transform-origin:${r1(foot[0])}px ${r1(foot[1])}px`,
        }),
      );
  }
  // Each group rises (and sinks) as far on the screen, in its own units:
  // one drawn inside a scaled group moves less in them, as the proof
  // moved it.
  const lifts: Point[] = [];
  const lows: Point[] = [];
  if (motion.breathe || motion.low)
    for (const node of lifted) {
      const unit = localMove(root, node, [0, 1]);
      if (!unit) continue;
      const lift: Point = [
        r2(-unit[0] * motion.breathe),
        r2(-unit[1] * motion.breathe),
      ];
      const sunk: Point = [r2(unit[0] * sink), r2(unit[1] * sink)];
      let k = lifts.findIndex(
        (one, i) =>
          one[0] === lift[0] &&
          one[1] === lift[1] &&
          lows[i][0] === sunk[0] &&
          lows[i][1] === sunk[1],
      );
      if (k < 0) {
        k = lifts.push(lift) - 1;
        lows.push(sunk);
      }
      wrap(outermost(node), {
        class: k ? `rig-breathe rig-breathe-${k}` : 'rig-breathe',
      });
    }
  // What moves by its name: each of a kind moving as far as the least of
  // them may; a glow that may not swell still brightens and dims.
  const moving = new Map<Mover, number>();
  movers.forEach((one, i) => {
    const amplitude = Math.abs(moverAmplitudes[i] ?? 0);
    if (!amplitude && one.motion !== 'pulse') return;
    moving.set(
      one.motion,
      Math.min(moving.get(one.motion) ?? Infinity, amplitude),
    );
  });
  for (const one of movers) {
    if (!moving.has(one.motion)) continue;
    wrap(outermost(one.limb.outer), {
      class: `rig-${one.motion}${one.motion === 'flap' && one.right ? ' rig-flap-r' : ''}`,
      style: `transform-origin:${one.pivot[0]}px ${one.pivot[1]}px`,
    });
  }
  const css = rigCss(motion, lifts, lows) + moverCss(moving);
  const style = new Element('style', {});
  setText(style, css);
  style.parent = root;
  root.children.push(style);
  const svg = render(root, { xmlMode: true, selfClosingTags: true });
  const moves = Boolean(
    motion.breathe || tailMoves || motion.ear || moving.size,
  );
  return {
    sheet: {
      ...sheet,
      drawing: {
        ...drawing,
        svg,
        moves,
        ...(proved.grid
          ? { field: { viewBox: drawing.viewBox, map: proved.grid } }
          : {}),
      },
      anchors,
      rig: {
        version: RIG_VERSION,
        joints,
        mended,
        ...(motion.dip ? { dip: motion.dip } : {}),
        ...(motion.low && lows.length
          ? { sinks: Math.round((sink / viewBox[3]) * 1000) / 1000 }
          : {}),
        ...(faces ? { faces } : {}),
      },
    },
    notes,
  };
}
