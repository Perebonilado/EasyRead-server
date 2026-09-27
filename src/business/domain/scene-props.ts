/**
 * The things a story's people handle on the stage: bread on the table, a
 * cup of wine, a fish, a bowl, a jar; and in a Studio story whatever else
 * they carry about or find (a ball, a book, a bag, a bone, a shoe, a
 * tuft of fur). Found in the words (a table the text sets is a table the
 * stage sets), drawn in the figure kit's hand (flat colours, the figure's
 * dark outline) and handed to the player apart from whoever holds them,
 * which puts them on the table, on the ground, in hands and in mouths as
 * the words say: taken, broken, given, eaten, drunk, thrown, caught,
 * dropped, kicked.
 *
 * Only gear stays drawn in the hand, as part of the person: a staff, an
 * umbrella, a flag (scene-figure.ts FIGURE_GEAR).
 */
import { FIGURE_INK } from './scene-figure';

/** What a book's page may set on its stage: the table's things. */
export const PAGE_PROPS = [
  'bread',
  'cup',
  'fish',
  'bowl',
  'jar',
  'plate',
  'basket',
  'fruit',
  'lamp',
] as const;
export type PageProp = (typeof PAGE_PROPS)[number];

/**
 * Everything that may be on a story's stage to be handled, one list: the
 * table's things, what people carry, and a story's small staples.
 */
export const STAGE_PROPS = [
  ...PAGE_PROPS,
  // What people carry about.
  'ball',
  'book',
  'phone',
  'letter',
  'magnifier',
  'pills',
  'thermometer',
  'syringe',
  'lantern',
  'bag',
  // A story's staples: what a dog chews, what is found, what is lost.
  'bone',
  'shoe',
  'stick',
  'toy',
  'pepper',
  'tomato',
  'key',
  'box',
  'fur',
] as const;
export type StageProp = (typeof STAGE_PROPS)[number];

/** Each prop by the words for it, singular or plural. */
export const PROP_WORDS: Record<StageProp, RegExp> = {
  bread:
    /\b(?:bread|loaf|loaves|flatbread|buns?|cakes?|biscuits?|morsel|crust)\b/iu,
  cup: /\b(?:cups?|chalices?|goblets?|mugs?|wine)\b/iu,
  fish: /\b(?:fish|fishes)\b/iu,
  bowl: /\b(?:bowls?|dish|dishes)\b/iu,
  jar: /\b(?:jars?|jugs?|pitchers?|flasks?|water ?pots?)\b/iu,
  plate: /\b(?:plates?|platters?)\b/iu,
  basket: /\b(?:baskets?)\b/iu,
  // "The fruit of the vine" is wine, not fruit on the table.
  fruit:
    /\b(?:fruit(?! of the vine)|apples?|figs?|grapes|mangoe?s?|bananas?|dates)\b/iu,
  lamp: /\b(?:lamps?|candles?)\b/iu,
  ball: /\b(?:balls?|football)\b/iu,
  book: /\b(?:books?|notebooks?|storybooks?)\b/iu,
  phone: /\b(?:phones?|mobiles?)\b/iu,
  letter: /\b(?:letters?|envelopes?|notes?)\b/iu,
  magnifier: /\b(?:magnifiers?|magnifying glass(?:es)?)\b/iu,
  pills: /\b(?:pills?|tablets?|medicines?)\b/iu,
  thermometer: /\bthermometers?\b/iu,
  syringe: /\b(?:syringes?|injections?|needles?)\b/iu,
  lantern: /\b(?:lanterns?|torch|torches)\b/iu,
  bag: /\b(?:bags?|handbags?|satchels?|sacks?)\b/iu,
  bone: /\bbones?\b/iu,
  shoe: /\b(?:shoes?|sandals?|slippers?|boots?|trainers?|sneakers?)\b/iu,
  // A walking stick is a staff, held for good.
  stick: /\b(?<!walking )(?:sticks?|twigs?)\b/iu,
  toy: /\b(?:toys?|teddy(?: bears?)?|rubber ducks?|dolls?)\b/iu,
  pepper: /\b(?:peppers?|chill(?:i|ies)|chil(?:e|es))\b/iu,
  tomato: /\btomato(?:es)?\b/iu,
  key: /\bkeys?\b/iu,
  box: /\b(?:box|parcel|package)\b/iu,
  fur: /\b(?:tufts? of (?:\p{L}+ )?(?:fur|hair)|tufts?|fur)\b/iu,
};

/** What each prop is, for what may be done with it. */
export const PROP_KIND: Record<StageProp, 'food' | 'drink' | 'thing'> = {
  bread: 'food',
  cup: 'drink',
  fish: 'food',
  bowl: 'thing',
  jar: 'drink',
  plate: 'thing',
  basket: 'thing',
  fruit: 'food',
  lamp: 'thing',
  ball: 'thing',
  book: 'thing',
  phone: 'thing',
  letter: 'thing',
  magnifier: 'thing',
  pills: 'thing',
  thermometer: 'thing',
  syringe: 'thing',
  lantern: 'thing',
  bag: 'thing',
  bone: 'thing',
  shoe: 'thing',
  stick: 'thing',
  toy: 'thing',
  pepper: 'food',
  tomato: 'food',
  key: 'thing',
  box: 'thing',
  fur: 'thing',
};

/** How a thing moves loose, once it leaves a hand, and how it is carried. */
export interface PropLoose {
  bounce: number;
  rolls?: true;
  spins?: true;
  hangs?: true;
}

/**
 * How each thing moves loose, once it leaves a hand: how often it bounces
 * where it lands (a ball twice, a cup not at all), whether it rolls on,
 * and whether it turns over in the air. And a bag is carried hanging at
 * the side, not held up before them.
 */
export const PROP_LOOSE: Record<StageProp, PropLoose> = {
  bread: { bounce: 0 },
  cup: { bounce: 0 },
  fish: { bounce: 1, spins: true },
  bowl: { bounce: 0 },
  jar: { bounce: 0 },
  plate: { bounce: 0, spins: true },
  basket: { bounce: 0 },
  fruit: { bounce: 0, rolls: true },
  lamp: { bounce: 0 },
  ball: { bounce: 2, rolls: true, spins: true },
  book: { bounce: 0, spins: true },
  phone: { bounce: 0, spins: true },
  letter: { bounce: 0 },
  magnifier: { bounce: 0, spins: true },
  pills: { bounce: 1 },
  thermometer: { bounce: 0, spins: true },
  syringe: { bounce: 0, spins: true },
  lantern: { bounce: 0 },
  bag: { bounce: 0, hangs: true },
  bone: { bounce: 1, spins: true },
  shoe: { bounce: 1, spins: true },
  stick: { bounce: 1, spins: true },
  toy: { bounce: 1, spins: true },
  pepper: { bounce: 1, spins: true },
  tomato: { bounce: 0, rolls: true, spins: true },
  key: { bounce: 0, spins: true },
  box: { bounce: 0, spins: true },
  fur: { bounce: 0 },
};

/** The props a page's words name, in the order they are first named: of `among`, a book's page's own. */
export function propsIn(
  texts: readonly string[],
  among: readonly StageProp[] = PAGE_PROPS,
): StageProp[] {
  const found: { prop: StageProp; at: number }[] = [];
  const all = texts.join('\n');
  for (const prop of among) {
    const m = PROP_WORDS[prop].exec(all);
    if (m) found.push({ prop, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.prop);
}

/** How big a thing of a show's own is, beside the people: in a hand, in the arms, or bigger. */
export type PropSize = 'small' | 'medium' | 'large';

/** A prop as the player gets it: its drawing, where it is held, and where it goes to the mouth. */
export interface PropDrawing {
  svg: string;
  viewBox: [number, number, number, number];
  /** Where a hand holds it, in its own units; its base rests on a surface at y = 0. */
  grip: [number, number];
  /** The part that goes to the mouth: a cup's rim, a loaf's end. */
  mouth: [number, number];
  /** Where an animal's mouth holds it: a ball's middle, a bone's, a bag's handle. */
  bite: [number, number];
  /** A broken piece, for bread: the left half; the right is its mirror. */
  half?: string;
}

/**
 * A thing of a show's own as the stage gets it: the artist's drawing, in
 * the kit's units, standing on its base at y = 0, and what code measured
 * of it: how big it is, where a hand and a mouth hold it, and how it moves
 * loose.
 */
export interface OwnPropDrawing extends PropDrawing {
  size: PropSize;
  loose: PropLoose;
  /** What it was drawn to look like, when the words said: "red". */
  look?: string;
}

/**
 * How tall clothes are carried, in the kit's units: held up or over an
 * arm, never as tall as someone wearing them (a child stands 190).
 */
export const CARRIED_CLOTHES = 72;

/**
 * A thing drawn at a size, drawn no taller than `most`: its drawing
 * scaled down about its base, and where it is held with it. As it was
 * when it is no taller.
 */
export function noTallerThan<T extends PropDrawing>(
  drawing: T,
  most: number,
): T {
  const [x, y, w, h] = drawing.viewBox;
  const tall = Math.max(w, h);
  if (tall <= most || tall <= 0) return drawing;
  const k = most / tall;
  const at = ([px, py]: [number, number]): [number, number] => [
    r1(px * k),
    r1(py * k),
  ];
  const viewBox: [number, number, number, number] = [
    r1(x * k),
    r1(y * k),
    r1(w * k),
    r1(h * k),
  ];
  const svg = drawing.svg
    .replace(/(<svg\b[^>]*?\bviewBox=")[^"]*(")/u, `$1${viewBox.join(' ')}$2`)
    .replace(
      /(<svg\b[^>]*>)/u,
      `$1<g transform="scale(${Math.round(k * 1000) / 1000})">`,
    )
    .replace(/<\/svg>\s*$/u, '</g></svg>');
  return {
    ...drawing,
    svg,
    viewBox,
    grip: at(drawing.grip),
    mouth: at(drawing.mouth),
    bite: at(drawing.bite),
  };
}

const LINE = 2.6;
const r1 = (n: number) => Math.round(n * 10) / 10;
const inked = (fill: string) => `fill="${fill}"`;
const flat = (fill: string) => `fill="${fill}" stroke="none"`;
const line = (d: string, colour: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Shapes that overlap drawn as one: their outline under, their colour over, no seam between. */
const whole = (shapes: string, fill: string) =>
  `<g fill="${FIGURE_INK}">${shapes}</g><g fill="${fill}" stroke="none">${shapes}</g>`;

/** Drawn with the figure's outline, framed with room for it. */
function framed(
  markup: string,
  [x, y, w, h]: [number, number, number, number],
): { svg: string; viewBox: [number, number, number, number] } {
  const viewBox: [number, number, number, number] = [
    r1(x - 3),
    r1(y - 3),
    r1(w + 6),
    r1(h + 6),
  ];
  return {
    viewBox,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"><g stroke="${FIGURE_INK}" stroke-width="${LINE}" stroke-linejoin="round">${markup}</g></svg>`,
  };
}

const CRUST = '#d9a066';
const CRUMB = '#f3dcb6';
const WOOD = '#8a5a3b';
const ORANGE = '#f0924a';
const RED = '#e0463a';
const LEAF = '#6a9c3e';

/** A prop drawn in the kit's hand, at its own size in the kit's units (a grown person is about 224 tall). */
export function drawProp(prop: StageProp): PropDrawing {
  switch (prop) {
    case 'bread': {
      const loaf =
        `<path d="M-22,0 Q-24,-18 -8,-20 Q0,-21 8,-20 Q24,-18 22,0 Z" ${inked(CRUST)}/>` +
        line('M-10,-17 L-6,-5 M0,-18 L3,-6 M10,-17 L12,-6', '#b67f45', 2.4);
      // The left half: the crust round the left, the white crumb at the break.
      const half =
        `<path d="M1,0 L-22,0 Q-24,-18 -8,-20 Q-2,-21 2,-20 L-1,-15 L3,-10 L-1,-5 Z" ${inked(CRUST)}/>` +
        `<path d="M2,-20 L-1,-15 L3,-10 L-1,-5 L1,0" fill="none" stroke="${CRUMB}" stroke-width="3" stroke-linecap="round"/>`;
      return {
        ...framed(loaf, [-25, -22, 50, 22]),
        grip: [0, -10],
        mouth: [-14, -12],
        bite: [-14, -12],
        half: framed(half, [-25, -22, 28, 22]).svg,
      };
    }
    case 'cup': {
      const handle = 'M11,-20 Q21,-20 21,-13 Q21,-7 11,-7';
      return {
        ...framed(
          line(handle, FIGURE_INK, 8.2) +
            line(handle, '#b98a5a', 3) +
            `<path d="M-11,-26 L11,-26 L9,-2 Q0,1 -9,-2 Z" ${inked('#b98a5a')}/>` +
            `<ellipse cx="0" cy="-26" rx="11" ry="3" ${inked('#6b2f45')}/>`,
          [-12, -30, 35, 31],
        ),
        grip: [0, -12],
        mouth: [-6, -26],
        bite: [16, -13],
      };
    }
    case 'fish':
      return {
        ...framed(
          `<path d="M-20,-8 Q-6,-20 12,-8 Q-6,4 -20,-8 Z" ${inked('#8fb3c7')}/>` +
            `<path d="M12,-8 L22,-15 L22,-1 Z" ${inked('#7aa0b5')}/>` +
            `<circle cx="-12" cy="-10" r="1.8" ${flat(FIGURE_INK)}/>` +
            line('M-2,-14 Q1,-8 -2,-2', '#6f93a8', 2),
          [-21, -17, 44, 18],
        ),
        grip: [2, -8],
        mouth: [-16, -8],
        bite: [2, -8],
      };
    case 'bowl':
      return {
        ...framed(
          `<path d="M-20,-14 L20,-14 Q18,0 0,0 Q-18,0 -20,-14 Z" ${inked('#b9744a')}/>` +
            `<ellipse cx="0" cy="-14" rx="20" ry="4" ${inked('#7a4a2e')}/>`,
          [-21, -19, 42, 19],
        ),
        grip: [0, -8],
        mouth: [-12, -14],
        bite: [17, -12],
      };
    case 'jar':
      return {
        ...framed(
          `<path d="M-7,-34 L7,-34 L7,-28 Q14,-22 13,-10 Q12,0 0,0 Q-12,0 -13,-10 Q-14,-22 -7,-28 Z" ${inked('#c98a5c')}/>` +
            line('M-11,-16 L11,-16', '#a8704a', 2.4),
          [-14, -35, 28, 35],
        ),
        grip: [0, -18],
        mouth: [0, -34],
        bite: [0, -31],
      };
    case 'plate':
      return {
        ...framed(
          `<ellipse cx="0" cy="-4" rx="24" ry="5" ${inked('#e8e2d6')}/><ellipse cx="0" cy="-5" rx="14" ry="2.5" ${flat('#d6cfc1')}/>`,
          [-25, -10, 50, 10],
        ),
        grip: [16, -4],
        mouth: [-16, -4],
        bite: [20, -4],
      };
    case 'basket':
      return {
        ...framed(
          `<path d="M-22,-18 L22,-18 L17,0 L-17,0 Z" ${inked('#c9a15e')}/>` +
            line('M-19,-12 L19,-12 M-18,-6 L18,-6', '#a9813e', 2) +
            `<path d="M-16,-18 Q0,-38 16,-18" fill="none" stroke="${FIGURE_INK}" stroke-width="5"/>` +
            `<path d="M-16,-18 Q0,-38 16,-18" fill="none" stroke="#c9a15e" stroke-width="2"/>`,
          [-23, -32, 46, 32],
        ),
        grip: [0, -30],
        mouth: [-12, -18],
        bite: [0, -30],
      };
    case 'fruit':
      return {
        ...framed(
          `<circle cx="-9" cy="-7" r="7" ${inked('#c8473d')}/><circle cx="6" cy="-7" r="7" ${inked('#e0a33a')}/><circle cx="-1" cy="-15" r="7" ${inked('#7a9c3e')}/>`,
          [-17, -23, 31, 23],
        ),
        grip: [-1, -10],
        mouth: [-9, -10],
        bite: [-1, -10],
      };
    case 'lamp':
      return {
        ...framed(
          `<path d="M-14,-4 Q-14,-12 0,-12 Q14,-12 16,-8 L22,-10 L18,-4 Q10,0 -8,0 Q-14,0 -14,-4 Z" ${inked('#c98a5c')}/>` +
            `<path d="M20,-12 Q17,-20 20,-26 Q24,-19 20,-12 Z" ${inked('#ffc24a')}/>`,
          [-15, -27, 38, 27],
        ),
        grip: [0, -6],
        mouth: [0, -6],
        bite: [-10, -6],
      };
    case 'ball':
      // Its seams, so it is seen to spin.
      return {
        ...framed(
          `<circle cx="0" cy="-12" r="12" ${inked(ORANGE)}/>` +
            line('M-11.6,-10 Q0,-4.5 11.6,-10', '#c4692c', 2) +
            line('M-2,-23.8 Q-6.6,-12 -2,-0.2', '#c4692c', 2),
          [-13, -25, 26, 26],
        ),
        grip: [0, -12],
        mouth: [0, -12],
        bite: [0, -12],
      };
    case 'book':
      // Shut, its cover to the viewer, the spine down the left.
      return {
        ...framed(
          `<rect x="-13" y="-32" width="26" height="32" rx="2" ${inked('#4a8fd9')}/>` +
            `<rect x="-11.7" y="-30.7" width="4.5" height="29.4" ${flat('#34518f')}/>` +
            `<rect x="-3" y="-25" width="12" height="6" rx="1" ${inked('#f5f5f2')}/>`,
          [-14, -33, 28, 34],
        ),
        grip: [0, -14],
        mouth: [0, -20],
        bite: [0, -29],
      };
    case 'phone':
      return {
        ...framed(
          `<rect x="-8" y="-30" width="16" height="30" rx="3.5" ${inked('#3a3740')}/><rect x="-5.5" y="-27" width="11" height="21" rx="1.5" ${flat('#9fd3f0')}/>`,
          [-9, -31, 18, 32],
        ),
        grip: [0, -12],
        mouth: [0, -26],
        bite: [0, -15],
      };
    case 'letter':
      // An envelope, its flap folded down.
      return {
        ...framed(
          `<rect x="-16" y="-20" width="32" height="20" rx="1" ${inked('#fbf7ee')}/>` +
            line('M-15,-19 L0,-8 L15,-19', FIGURE_INK, 2),
          [-17, -21, 34, 22],
        ),
        grip: [-9, -10],
        mouth: [0, -10],
        bite: [0, -10],
      };
    case 'magnifier':
      return {
        ...framed(
          line('M-3,0 L5,-15', FIGURE_INK, 7.6) +
            line('M-3,0 L5,-15', WOOD, 4.2) +
            `<circle cx="11" cy="-27" r="12" fill="#d6ecf7" fill-opacity="0.85" stroke-width="4.2"/>` +
            line('M4,-30 Q6,-35 11,-36', '#ffffff', 2.2),
          [-6, -41, 31, 42],
        ),
        grip: [0, -6],
        mouth: [11, -27],
        bite: [1, -7],
      };
    case 'pills':
      // A bottle, a cross on its label.
      return {
        ...framed(
          `<rect x="-10" y="-26" width="20" height="26" rx="3" ${inked(ORANGE)}/>` +
            `<rect x="-7" y="-20" width="14" height="12" rx="1" ${flat('#ffffff')}/>` +
            `<path d="M-1.4,-17.5 h2.8 v3 h3 v2.8 h-3 v3 h-2.8 v-3 h-3 v-2.8 h3 Z" ${flat(RED)}/>` +
            `<rect x="-11.5" y="-34" width="23" height="9" rx="2" ${inked('#f5f5f2')}/>`,
          [-12, -35, 24, 36],
        ),
        grip: [0, -13],
        mouth: [0, -34],
        bite: [0, -30],
      };
    case 'thermometer':
      return {
        ...framed(
          `<rect x="-3.5" y="-42" width="7" height="36" rx="3.5" ${inked('#f5f5f2')}/>` +
            `<rect x="-1.3" y="-28" width="2.6" height="22" ${flat(RED)}/>` +
            `<circle cx="0" cy="-5" r="5" ${inked(RED)}/>`,
          [-6, -43, 12, 44],
        ),
        grip: [0, -18],
        mouth: [0, -40],
        bite: [0, -22],
      };
    case 'syringe':
      // Lying down, the needle to the right.
      return {
        ...framed(
          line('M16,-5 L31,-5', '#8d8f96', 2) +
            `<rect x="-12" y="-10" width="28" height="10" rx="2" ${inked('#eef6fb')}/>` +
            `<rect x="-1" y="-7.6" width="15.6" height="5.2" ${flat('#7cc3e8')}/>` +
            `<rect x="-22" y="-6.5" width="10" height="3" ${inked('#c9cdd3')}/>` +
            `<rect x="-25" y="-11" width="3.5" height="12" rx="1" ${inked('#c9cdd3')}/>`,
          [-26, -12, 58, 13],
        ),
        grip: [2, -5],
        mouth: [28, -5],
        bite: [2, -5],
      };
    case 'lantern':
      // Hanging from its handle, a flame inside.
      return {
        ...framed(
          `<path d="M-7,-30 Q-7,-41 0,-41 Q7,-41 7,-30" fill="none" stroke-width="2.4"/>` +
            `<path d="M-8,-30 L8,-30 L11,-26 L-11,-26 Z" ${inked('#3a3740')}/>` +
            `<rect x="-9" y="-26" width="18" height="21" ${inked('#ffe16b')}/>` +
            `<path d="M0,-21 Q4,-15.5 0,-10 Q-4,-15.5 0,-21 Z" ${flat(ORANGE)}/>` +
            `<rect x="-11" y="-5" width="22" height="5" rx="1.5" ${inked('#3a3740')}/>`,
          [-12, -42, 24, 43],
        ),
        grip: [0, -40],
        mouth: [0, -15],
        bite: [0, -40],
      };
    case 'bag':
      return {
        ...framed(
          `<path d="M-8,-20 Q-8,-34 0,-34 Q8,-34 8,-20" fill="none" stroke-width="2.6"/>` +
            `<path d="M-15,-21 L15,-21 L17,0 L-17,0 Z" ${inked('#9a6b4b')}/>` +
            line('M-15.4,-15 L15.4,-15', '#7c5539', 2),
          [-18, -35, 36, 36],
        ),
        grip: [0, -33],
        mouth: [0, -12],
        bite: [0, -33],
      };
    case 'bone': {
      const shapes =
        `<rect x="-15" y="-10" width="30" height="6"/>` +
        [-15.5, 15.5]
          .flatMap((x) =>
            [-9.8, -4.4].map((y) => `<circle cx="${x}" cy="${y}" r="4.4"/>`),
          )
          .join('');
      return {
        ...framed(whole(shapes, '#f3ead8'), [-21, -15, 42, 16]),
        grip: [0, -7],
        mouth: [-14, -7],
        bite: [0, -7],
      };
    }
    case 'shoe':
      // A trainer from the side, its toe to the right.
      return {
        ...framed(
          `<path d="M-16,-4 L-16,-15 Q-14,-19 -8,-17.5 L0,-13 Q10,-11.5 15,-8 Q18,-6 17,-4 Z" ${inked('#d9534f')}/>` +
            `<path d="M-17,-4 L18,-4 Q18,0 14,0 L-15,0 Q-17,0 -17,-4 Z" ${inked('#f5f5f2')}/>` +
            line('M-6,-15 L-3,-12.5 M-1.5,-13.5 L1.5,-11', '#f5f5f2', 1.8),
          [-18, -20, 37, 21],
        ),
        grip: [-11, -14],
        mouth: [0, -8],
        bite: [7, -8],
      };
    case 'stick': {
      const bend = 'M-24,-3 Q-6,-7.5 24,-4';
      const twig = 'M4,-5.6 L10,-12.5';
      return {
        ...framed(
          line(bend, FIGURE_INK, 6.6) +
            line(twig, FIGURE_INK, 4.8) +
            line(bend, WOOD, 3.4) +
            line(twig, WOOD, 2.2),
          [-27, -16, 54, 16],
        ),
        grip: [-9, -5],
        mouth: [0, -5],
        bite: [-2, -5],
      };
    }
    case 'toy':
      // A rubber duck.
      return {
        ...framed(
          `<path d="M-12,-9 Q-12,0 2,0 Q14,0 15,-9 Q16,-14 10,-13 Q4,-12 -2,-12 Q-10,-13 -12,-9 Z" ${inked('#f4c95d')}/>` +
            `<circle cx="-5" cy="-18" r="7" ${inked('#f4c95d')}/>` +
            `<path d="M-12,-17 L-18,-15.5 L-12,-14 Z" ${inked(ORANGE)}/>` +
            `<circle cx="-6.5" cy="-19.5" r="1.4" ${flat(FIGURE_INK)}/>`,
          [-19, -26, 35, 26],
        ),
        grip: [2, -7],
        mouth: [-12, -16],
        bite: [2, -9],
      };
    case 'pepper':
      // A red pepper, its green stalk.
      return {
        ...framed(
          `<path d="M-11,-17 Q-14,-6 -8,-1 Q-4,1 0,-2 Q4,1 8,-1 Q14,-6 11,-17 Q6,-20.5 0,-18.5 Q-6,-20.5 -11,-17 Z" ${inked('#d93a2e')}/>` +
            line('M0,-18 Q0,-23 4,-25', FIGURE_INK, 5.4) +
            line('M0,-18 Q0,-23 4,-25', LEAF, 2.6) +
            line('M-6,-14 Q-8,-9 -6,-5', '#f07b6b', 2),
          [-13, -26, 26, 27],
        ),
        grip: [0, -9],
        mouth: [0, -14],
        bite: [0, -9],
      };
    case 'tomato':
      return {
        ...framed(
          `<circle cx="0" cy="-11" r="11" ${inked('#e0533d')}/>` +
            `<path d="M0,-22 L3,-19 L7,-20 L4,-17 L0,-18 L-4,-17 L-7,-20 L-3,-19 Z" ${inked(LEAF)}/>` +
            line('M-6,-13 Q-6,-8 -3,-5', '#f28a78', 2),
          [-12, -23, 24, 24],
        ),
        grip: [0, -11],
        mouth: [0, -14],
        bite: [0, -11],
      };
    case 'key':
      return {
        ...framed(
          `<circle cx="-11" cy="-6" r="5.5" ${inked('#e0b84a')}/>` +
            `<circle cx="-11" cy="-6" r="2" ${inked('#fbf7ee')}/>` +
            `<rect x="-5.5" y="-7.5" width="19" height="3" ${inked('#e0b84a')}/>` +
            `<rect x="8" y="-4.5" width="2.6" height="4" ${inked('#e0b84a')}/>` +
            `<rect x="11.5" y="-4.5" width="2.6" height="3" ${inked('#e0b84a')}/>`,
          [-17, -12, 32, 12],
        ),
        grip: [-11, -6],
        mouth: [0, -6],
        bite: [2, -6],
      };
    case 'box':
      // A parcel, taped across.
      return {
        ...framed(
          `<rect x="-17" y="-26" width="34" height="26" ${inked('#c9a15e')}/>` +
            `<rect x="-3" y="-24.7" width="6" height="23.4" ${flat('#e6cf9c')}/>` +
            line('M-17,-20 L17,-20', '#a9813e', 1.8),
          [-18, -27, 36, 28],
        ),
        grip: [0, -13],
        mouth: [0, -24],
        bite: [0, -24],
      };
    case 'fur':
      // A tuft of it, pale, a few wisps.
      return {
        ...framed(
          `<path d="M-9,0 Q-11,-8 -5,-14 Q-5.5,-7 -1.5,-2.5 Q-1,-10 5,-15 Q3,-7 6,-2.5 Q9,-7 13,-9 Q11,-2 6,0 Z" ${inked('#f5f0e6')}/>` +
            line('M-5,-10 Q-4,-5 -2,-2 M4,-11 Q3,-6 4,-3', '#c9b89c', 1.6),
          [-12, -16, 26, 17],
        ),
        grip: [1, -6],
        mouth: [1, -6],
        bite: [1, -6],
      };
  }
}
