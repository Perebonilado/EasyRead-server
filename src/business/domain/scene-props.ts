/**
 * The things a story's people handle on the stage: bread on the table, a
 * cup of wine, a fish, a bowl, a jar. Found in the page's own words (a
 * table the text sets is a table the stage sets), drawn in the figure
 * kit's hand (flat colours, the figure's dark outline) and handed to the
 * player, which puts them on the table and in people's hands as the
 * narration says: taken, broken, given, eaten, drunk.
 */
import { FIGURE_INK } from './scene-figure';

/** What may be on a story's stage to be handled. */
export const STAGE_PROPS = [
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
};

/** The props a page's words name, in the order they are first named. */
export function propsIn(texts: readonly string[]): StageProp[] {
  const found: { prop: StageProp; at: number }[] = [];
  const all = texts.join('\n');
  for (const prop of STAGE_PROPS) {
    const m = PROP_WORDS[prop].exec(all);
    if (m) found.push({ prop, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.prop);
}

/** A prop as the player gets it: its drawing, where it is held, and where it goes to the mouth. */
export interface PropDrawing {
  svg: string;
  viewBox: [number, number, number, number];
  /** Where a hand holds it, in its own units; its base rests on a surface at y = 0. */
  grip: [number, number];
  /** The part that goes to the mouth: a cup's rim, a loaf's end. */
  mouth: [number, number];
  /** A broken piece, for bread: the left half; the right is its mirror. */
  half?: string;
}

const LINE = 2.6;
const r1 = (n: number) => Math.round(n * 10) / 10;
const inked = (fill: string) => `fill="${fill}"`;
const flat = (fill: string) => `fill="${fill}" stroke="none"`;
const line = (d: string, colour: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

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
      };
    case 'plate':
      return {
        ...framed(
          `<ellipse cx="0" cy="-4" rx="24" ry="5" ${inked('#e8e2d6')}/><ellipse cx="0" cy="-5" rx="14" ry="2.5" ${flat('#d6cfc1')}/>`,
          [-25, -10, 50, 10],
        ),
        grip: [16, -4],
        mouth: [-16, -4],
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
      };
    case 'fruit':
      return {
        ...framed(
          `<circle cx="-9" cy="-7" r="7" ${inked('#c8473d')}/><circle cx="6" cy="-7" r="7" ${inked('#e0a33a')}/><circle cx="-1" cy="-15" r="7" ${inked('#7a9c3e')}/>`,
          [-17, -23, 31, 23],
        ),
        grip: [-1, -10],
        mouth: [-9, -10],
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
      };
  }
}
