/**
 * Clothes at rest (studio-drawings-plan §7, D2). A show's own thing that
 * is worn (a uniform, a coat, a dress, a jumper, a scarf) is drawn by the
 * artist as it looks worn, and so, set down, it stood upright on the
 * floor like an invisible person. Here code draws it a second way, for
 * when it is neither worn nor held: folded on the floor or a table, or,
 * in a room, on a hanger from a peg on the wall; in the thing's own
 * colours, from the words for it ("white shirt and navy jumper") or from
 * its drawing.
 *
 * Drawn as the kit's props are: in its own units (a grown-up stands 224
 * tall), its outline the kit's, its foot at y = 0 and its middle at x =
 * 0; the stage stands that point where the thing rests. A thing on a
 * hanger hangs well above that point, as on the wall behind it.
 */
import { FIGURE_INK, KIT_EXTRAS, KIT_LINE, CLOTH, shade } from './scene-ink';
import { wearableOf } from './scene-wear';
import { CLOTH_COLOURS, type ClothColour } from './scene-figure';

/** One of a thing's looks at rest: its drawing, its frame, and the point of it that stands where it rests. */
export interface RestLook {
  svg: string;
  viewBox: [number, number, number, number];
  /** Where it rests, in its own units: its foot's middle. */
  anchor: [number, number];
}

/** A worn thing's looks at rest: folded, and on a hanger (a room's only). */
export interface RestLooks {
  folded: RestLook;
  hung?: RestLook;
}

/** How a thing worn is shaped, for its looks at rest. */
type Garment =
  'long' | 'top' | 'shirt' | 'dress' | 'scarf' | 'cloth' | 'outfit';

/** A worn thing's shape at rest, by what the kit draws it as; null for what has none (a hat, shoes, glasses). */
function garmentOf(name: string): Garment | null {
  const worn = wearableOf(name);
  if (!worn) return null;
  if (worn.slot === 'outfit') return 'outfit';
  switch (worn.kit) {
    case 'lab coat':
    case 'coat':
    case 'robe':
    case 'uniform':
      return 'long';
    case 'dress':
    case 'pyjamas':
      return 'dress';
    case 'shirt and tie':
    case 't-shirt':
      return 'shirt';
    case 'jumper':
    case 'hoodie':
    case 'cardigan':
    case 'jacket':
    case 'apron':
      return 'top';
    case 'scarf':
      return 'scarf';
    case 'cloak':
      return 'cloth';
    default:
      return null;
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const inked = (fill: string) => `fill="${fill}"`;
const flat = (fill: string) => `fill="${fill}" stroke="none"`;
const line = (d: string, colour: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

function framed(
  markup: string,
  [x, y, w, h]: [number, number, number, number],
): Pick<RestLook, 'svg' | 'viewBox'> {
  const viewBox: [number, number, number, number] = [
    r1(x - 3),
    r1(y - 3),
    r1(w + 6),
    r1(h + 6),
  ];
  return {
    viewBox,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"><g stroke="${FIGURE_INK}" stroke-width="${KIT_LINE}" stroke-linejoin="round">${markup}</g></svg>`,
  };
}

/** The colours cloth is said in, in the order said: "a white shirt and navy jumper" is white, then navy. */
function coloursSaid(words: string): string[] {
  const out: string[] = [];
  const same: Record<string, ClothColour> = { gray: 'grey', golden: 'yellow' };
  for (const word of words.toLowerCase().split(/[^a-z]+/u)) {
    const colour = (CLOTH_COLOURS as readonly string[]).includes(word)
      ? (word as ClothColour)
      : same[word];
    if (colour && !out.includes(CLOTH[colour])) out.push(CLOTH[colour]);
  }
  return out;
}

/** The colour said of what is worn under (a shirt, a blouse): "a white shirt and navy jumper" is white. */
function innerColour(words: string): string | null {
  const m =
    /\b([a-z]+)\s+(?:[a-z]+\s+){0,2}?(?:shirt|blouse|t-shirt|tee)s?\b/iu.exec(
      words,
    );
  return m ? (coloursSaid(m[1])[0] ?? null) : null;
}

/** A drawing's fill colours, commonest first, without its ink, its whites' outline or what is barely there. */
function coloursDrawn(svg: string): string[] {
  const counts = new Map<string, number>();
  for (const m of svg.matchAll(/fill="(#[0-9a-f]{6})"/giu)) {
    const hex = m[1].toLowerCase();
    if (hex === FIGURE_INK) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
}

/** One folded piece of cloth, as wide as `w`, its foot at `y`: a fold across it, and its collar where it has one. */
function foldedLayer(
  y: number,
  w: number,
  h: number,
  colour: string,
  collar: 'shirt' | 'round' | null,
): string {
  const x = -w / 2;
  const body = `<rect x="${r1(x)}" y="${r1(y - h)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h * 0.35)}" ${inked(colour)}/>`;
  // The folded sleeves, as seams in from each side.
  const seams = line(
    `M${r1(x + w * 0.2)},${r1(y - h + 3)} L${r1(x + w * 0.2)},${r1(y - 3)} M${r1(-x - w * 0.2)},${r1(y - h + 3)} L${r1(-x - w * 0.2)},${r1(y - 3)}`,
    shade(colour, 0.72),
    1.6,
  );
  const neck =
    collar === 'shirt'
      ? `<path d="M${r1(-8)},${r1(y - h)} L0,${r1(y - h + 8)} L8,${r1(y - h)} Z" ${inked(KIT_EXTRAS.paper)}/>`
      : collar === 'round'
        ? `<path d="M-9,${r1(y - h + 0.5)} Q0,${r1(y - h + 8)} 9,${r1(y - h + 0.5)}" ${inked(shade(colour, 0.82))}/>`
        : '';
  return body + seams + neck;
}

/** Folded on the floor or a table: one piece, or a pile of two in their own colours. */
function folded(garment: Garment, colours: string[]): RestLook {
  const [first, second] = colours;
  const w = garment === 'scarf' ? 44 : garment === 'cloth' ? 60 : 56;
  const h = garment === 'scarf' ? 8 : 12;
  const collar =
    garment === 'shirt'
      ? 'shirt'
      : garment === 'top' || garment === 'long'
        ? 'round'
        : null;
  let markup = `<ellipse cx="0" cy="0" rx="${r1(w * 0.55)}" ry="3" ${flat('#1d1a22')} fill-opacity="0.12"/>`;
  let top = 0;
  if (second && (garment === 'long' || garment === 'outfit')) {
    // A uniform, or clothes: the lower piece under, the upper on it.
    markup += foldedLayer(0, w + 4, h, second, null);
    top = -h + 1;
    markup += foldedLayer(top, w - 6, h, first, 'shirt');
    top -= h - 1;
  } else if (garment === 'scarf') {
    markup +=
      foldedLayer(0, w, h, first, null) +
      `<rect x="${r1(w / 2 - 10)}" y="-3" width="10" height="6" rx="2" ${inked(first)}/>` +
      line(
        `M${r1(w / 2 - 8)},3 L${r1(w / 2 - 8)},7 M${r1(w / 2 - 3)},3 L${r1(w / 2 - 3)},7`,
        FIGURE_INK,
        1.6,
      );
    top = -h;
  } else {
    markup += foldedLayer(0, w, h, first, collar);
    top = -h;
  }
  return {
    ...framed(markup, [-w / 2 - 4, top - 2, w + 8, -top + 9]),
    anchor: [0, 0],
  };
}

/** On a hanger from a peg on the wall, its hem well off the floor. */
function hung(garment: Garment, colours: string[]): RestLook {
  const [first, second] = colours;
  // Its hanger's hook on a peg rail at a grown-up's shoulder.
  const rail = -176;
  const shoulder = rail + 26;
  const hem =
    garment === 'long'
      ? shoulder + 96
      : garment === 'dress'
        ? shoulder + 90
        : shoulder + 58;
  const half = 26;
  const peg =
    `<rect x="-26" y="${rail - 12}" width="52" height="10" rx="3" ${inked(KIT_EXTRAS['dark wood'])}/>` +
    `<circle cx="0" cy="${rail - 2}" r="4.4" ${inked(KIT_EXTRAS.plank)}/>`;
  const hook = line(
    `M0,${rail - 2} Q6,${rail + 4} 0,${rail + 10} L0,${rail + 14}`,
    FIGURE_INK,
    2.2,
  );
  const hanger = line(
    `M-${half + 4},${shoulder + 2} L0,${rail + 14} L${half + 4},${shoulder + 2} Z`,
    KIT_EXTRAS['dark wood'],
    3,
  );
  // The body and the sleeves hanging down its sides.
  const flare = garment === 'dress' ? 16 : garment === 'long' ? 6 : 2;
  const sleeves =
    garment === 'dress'
      ? ''
      : `<path d="M-${half},${shoulder + 2} L-${half + 10},${shoulder + 8} L-${half + 12},${r1(shoulder + (hem - shoulder) * 0.72)} L-${half + 2},${r1(shoulder + (hem - shoulder) * 0.72)} Z" ${inked(first)}/>` +
        `<path d="M${half},${shoulder + 2} L${half + 10},${shoulder + 8} L${half + 12},${r1(shoulder + (hem - shoulder) * 0.72)} L${half + 2},${r1(shoulder + (hem - shoulder) * 0.72)} Z" ${inked(first)}/>`;
  const body = `<path d="M-${half},${shoulder} Q0,${shoulder - 6} ${half},${shoulder} L${half + flare},${hem} L-${half + flare},${hem} Z" ${inked(first)}/>`;
  // A shirt under it, seen at its neck (a uniform), or its own collar.
  const neck =
    second && garment === 'long'
      ? `<path d="M-10,${shoulder - 2} L0,${shoulder + 22} L10,${shoulder - 2} Z" ${inked(second)}/>`
      : garment === 'shirt'
        ? `<path d="M-10,${shoulder - 2} L0,${shoulder + 10} L10,${shoulder - 2} Z" ${inked(KIT_EXTRAS.paper)}/>`
        : `<path d="M-9,${shoulder - 1} Q0,${shoulder + 8} 9,${shoulder - 1}" ${inked(shade(first, 0.8))}/>`;
  const buttons =
    garment === 'long' || garment === 'top'
      ? [0.38, 0.58, 0.78]
          .map(
            (k) =>
              `<circle cx="0" cy="${r1(shoulder + (hem - shoulder) * k)}" r="2.2" ${flat(shade(first, 0.6))}/>`,
          )
          .join('')
      : '';
  return {
    // Framed down to the floor below it, where it rests.
    ...framed(peg + sleeves + body + neck + buttons + hook + hanger, [
      -half - 16,
      rail - 12,
      (half + 16) * 2,
      -(rail - 12) - 3,
    ]),
    anchor: [0, 0],
  };
}

/**
 * A worn thing's looks at rest, in its own colours: folded, and on a
 * hanger where there is a wall to hang it on (a room, a vessel). Null for
 * a thing not worn, or worn where no fold or hanger shows (a hat, shoes).
 */
export function restLooksOf(
  thing: { name: string; look?: string | null },
  drawing: { svg: string } | null,
  indoors: boolean,
): RestLooks | null {
  const garment = garmentOf(thing.name);
  if (!garment) return null;
  const words = `${thing.look ?? ''} ${thing.name}`;
  const said = coloursSaid(words);
  const inner = innerColour(words);
  // Its own colour first (the jumper's, the coat's), what is under it
  // (the shirt's) second: from the words, else from its drawing.
  const colours = said.length
    ? inner && said.length > 1
      ? [said.find((one) => one !== inner) ?? said[0], inner]
      : said
    : drawing
      ? coloursDrawn(drawing.svg)
      : [];
  const outer = [colours[0] ?? CLOTH.blue, ...(colours[1] ? [colours[1]] : [])];
  const hangs = indoors && garment !== 'outfit' && garment !== 'scarf';
  return {
    folded: folded(garment, outer),
    ...(hangs ? { hung: hung(garment, outer) } : {}),
  };
}
