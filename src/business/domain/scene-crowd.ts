/**
 * A crowd, drawn by code: rows of simple people behind the story's own,
 * smaller and quieter than them, dressed for the story's world. A story
 * says "crowds followed him" and the stage shows them, at no cost to
 * anyone: no model is asked.
 *
 * Each person is a few shapes (a body, a head, hair or a head covering,
 * two eyes) in the kit's style, far lighter than a figure the kit draws in
 * full, so twenty of them weigh less than one of the story's people. They
 * breathe, each on their own beat; their eyes follow whoever speaks (the
 * stage sets how far); and they cheer or gasp together when the stage
 * tells them to.
 */
import type { StoryWorld } from './scene-story';
import type { GatedDrawing } from './scene-svg';

/** The crowd's canvas: as wide as the stage, as tall as people seen over each other's shoulders. */
export const CROWD_CANVAS = { w: 1600, h: 420 } as const;

const INK = '#2d2a32';
const SKINS = [
  '#f9e1cf',
  '#f1cdb0',
  '#e6b893',
  '#d6a07a',
  '#c28a61',
  '#a86f49',
  '#8c5a3b',
  '#704731',
  '#553524',
  '#3f291d',
];
const HAIRS = ['#2b2324', '#4a3226', '#7a4f33', '#a9a6ab'];

/** What people wear in a world, and the colours they wear it in. */
interface Wardrobe {
  /** How a body is cut: a robe to the ground, a shirt, a dress. */
  cuts: readonly ('robe' | 'shirt' | 'dress' | 'wide')[];
  heads: readonly ('hair' | 'scarf' | 'wrap' | 'gele' | 'cap')[];
  colours: readonly string[];
  /** Skin tones, 1 to 10, most seen there. */
  skins: readonly number[];
}

const EARTH = ['#9a6b4b', '#f5f5f2', '#34518f', '#8d8f96', '#c9a36a', '#b85c4a', '#6d8f5a'];
const BRIGHT = ['#f0924a', '#6dbf73', '#f4c95d', '#8a6bd1', '#4a8fd9', '#d9534f', '#3fb0a4', '#ef8fb3'];

/**
 * The wardrobe for a story's world: the ancient world in robes and head
 * cloths, West Africa in kaftans, agbadas and geles, anywhere else in
 * everyday clothes.
 */
export function wardrobeFor(world: StoryWorld | null): Wardrobe {
  const text = world
    ? [world.era, world.region, world.culture, world.homes, world.landscape]
        .join(' ')
        .toLowerCase()
    : '';
  if (
    /\b(?:bc|ad|first century|1st century|ancient|biblical|bible|roman|galilee|judea|judaea|jerusalem|israel|nazareth|egypt|egyptian|pharaoh|babylon|medieval|middle ages)\b/.test(
      text,
    )
  )
    return {
      cuts: ['robe', 'robe', 'shirt'],
      heads: ['hair', 'scarf', 'wrap', 'hair'],
      colours: EARTH,
      skins: [4, 5, 5, 6, 6, 7],
    };
  if (
    /\b(?:nigeria|nigerian|yoruba|igbo|hausa|ghana|ghanaian|akan|west africa|west african|lagos|accra|ibadan|kano|abuja)\b/.test(
      text,
    )
  )
    return {
      cuts: ['wide', 'shirt', 'dress', 'robe'],
      heads: ['hair', 'gele', 'cap', 'hair', 'scarf'],
      colours: BRIGHT,
      skins: [7, 8, 8, 9, 9, 10],
    };
  return {
    cuts: ['shirt', 'shirt', 'dress'],
    heads: ['hair', 'hair', 'cap', 'scarf'],
    colours: [...BRIGHT, ...EARTH],
    skins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  };
}

/** A small, stable number from a seed: the same crowd in every make. */
function beatOf(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** One of the crowd, standing at (x, y) (their feet), at a size, facing the viewer. */
function person(
  x: number,
  y: number,
  k: number,
  seed: string,
  wardrobe: Wardrobe,
  index: number,
): string {
  const pick = <T>(list: readonly T[], salt: string): T =>
    list[Math.floor(beatOf(`${seed}:${index}:${salt}`) * list.length) % list.length];
  const cut = pick(wardrobe.cuts, 'cut');
  const head = pick(wardrobe.heads, 'head');
  const cloth = pick(wardrobe.colours, 'cloth');
  const accent = pick(wardrobe.colours, 'accent');
  const skin = SKINS[pick(wardrobe.skins, 'skin') - 1] ?? SKINS[4];
  const hair = pick(HAIRS, 'hair');
  const child = beatOf(`${seed}:${index}:age`) < 0.18;
  const s = k * (child ? 0.78 : 1);
  // The body: shoulders to the ground, a robe wider at the foot.
  const half = (cut === 'wide' ? 34 : 26) * s;
  const foot = (cut === 'robe' || cut === 'dress' || cut === 'wide' ? 34 : 28) * s;
  const top = y - 118 * s;
  const cy = top - 22 * s;
  const body = `<path d="M${r1(x - foot)},${r1(y)} L${r1(x - half)},${r1(top + 10 * s)} Q${r1(x - half)},${r1(top)} ${r1(x - half + 10 * s)},${r1(top)} L${r1(x + half - 10 * s)},${r1(top)} Q${r1(x + half)},${r1(top)} ${r1(x + half)},${r1(top + 10 * s)} L${r1(x + foot)},${r1(y)} Z" fill="${cloth}"/>`;
  const trim =
    cut === 'robe' || cut === 'wide'
      ? `<rect x="${r1(x - half + 2)}" y="${r1(top + 50 * s)}" width="${r1(half * 2 - 4)}" height="${r1(6 * s)}" fill="${accent}"/>`
      : '';
  const face = `<ellipse cx="${r1(x)}" cy="${r1(cy)}" rx="${r1(30 * s)}" ry="${r1(27 * s)}" fill="${skin}"/>`;
  let cover = '';
  switch (head) {
    case 'scarf':
      cover = `<path d="M${r1(x - 34 * s)},${r1(cy + 4 * s)} Q${r1(x - 34 * s)},${r1(cy - 36 * s)} ${r1(x)},${r1(cy - 36 * s)} Q${r1(x + 34 * s)},${r1(cy - 36 * s)} ${r1(x + 34 * s)},${r1(cy + 4 * s)} Q${r1(x + 36 * s)},${r1(cy + 34 * s)} ${r1(x + 24 * s)},${r1(cy + 40 * s)} L${r1(x - 24 * s)},${r1(cy + 40 * s)} Q${r1(x - 36 * s)},${r1(cy + 34 * s)} ${r1(x - 34 * s)},${r1(cy + 4 * s)} Z" fill="${accent}"/><ellipse cx="${r1(x)}" cy="${r1(cy + 4 * s)}" rx="${r1(25 * s)}" ry="${r1(23 * s)}" fill="${skin}"/>`;
      break;
    case 'wrap':
      cover = `<path d="M${r1(x - 32 * s)},${r1(cy - 12 * s)} Q${r1(x - 36 * s)},${r1(cy - 44 * s)} ${r1(x)},${r1(cy - 44 * s)} Q${r1(x + 36 * s)},${r1(cy - 44 * s)} ${r1(x + 32 * s)},${r1(cy - 12 * s)} Q${r1(x)},${r1(cy - 20 * s)} ${r1(x - 32 * s)},${r1(cy - 12 * s)} Z" fill="${accent}"/>`;
      break;
    case 'gele':
      cover = `<path d="M${r1(x - 34 * s)},${r1(cy - 14 * s)} Q${r1(x - 46 * s)},${r1(cy - 44 * s)} ${r1(x - 16 * s)},${r1(cy - 56 * s)} Q${r1(x + 4 * s)},${r1(cy - 66 * s)} ${r1(x + 22 * s)},${r1(cy - 54 * s)} Q${r1(x + 48 * s)},${r1(cy - 44 * s)} ${r1(x + 34 * s)},${r1(cy - 14 * s)} Q${r1(x)},${r1(cy - 26 * s)} ${r1(x - 34 * s)},${r1(cy - 14 * s)} Z" fill="${accent}"/>`;
      break;
    case 'cap':
      cover = `<path d="M${r1(x - 31 * s)},${r1(cy - 8 * s)} Q${r1(x - 31 * s)},${r1(cy - 34 * s)} ${r1(x)},${r1(cy - 34 * s)} Q${r1(x + 31 * s)},${r1(cy - 34 * s)} ${r1(x + 31 * s)},${r1(cy - 8 * s)} Z" fill="${accent}"/>`;
      break;
    default:
      cover = `<path d="M${r1(x - 31 * s)},${r1(cy - 2 * s)} Q${r1(x - 33 * s)},${r1(cy - 32 * s)} ${r1(x)},${r1(cy - 32 * s)} Q${r1(x + 33 * s)},${r1(cy - 32 * s)} ${r1(x + 31 * s)},${r1(cy - 2 * s)} Q${r1(x + 18 * s)},${r1(cy - 18 * s)} ${r1(x)},${r1(cy - 18 * s)} Q${r1(x - 18 * s)},${r1(cy - 18 * s)} ${r1(x - 31 * s)},${r1(cy - 2 * s)} Z" fill="${hair}"/>`;
  }
  // Eyes: white, with pupils the stage turns toward whoever speaks.
  const eyes = [-1, 1]
    .map(
      (side) =>
        `<ellipse cx="${r1(x + side * 10 * s)}" cy="${r1(cy + 2 * s)}" rx="${r1(8 * s)}" ry="${r1(9 * s)}" fill="#ffffff"/>`,
    )
    .join('');
  const pupils = [-1, 1]
    .map(
      (side) =>
        `<circle cx="${r1(x + side * 10 * s)}" cy="${r1(cy + 3 * s)}" r="${r1(3.4 * s)}" fill="${INK}" stroke="none"/>`,
    )
    .join('');
  const beat = r1(beatOf(`${seed}:${index}:beat`) * 3.2);
  return `<g class="cp" style="animation-delay:-${beat}s">${body}${trim}${face}${cover}${eyes}<g class="pp">${pupils}</g></g>`;
}

/**
 * The crowd for a page: a few people in one row, or many in three, the
 * back rows smaller and higher; a gap in the middle of the front row,
 * where the story's people stand in front of them. The same crowd for
 * the same seed.
 */
export function drawCrowd(input: {
  size: 'few' | 'many';
  world: StoryWorld | null;
  seed: string;
}): GatedDrawing {
  const { w, h } = CROWD_CANVAS;
  const wardrobe = wardrobeFor(input.world);
  const rows =
    input.size === 'many'
      ? [
          { n: 9, y: h - 150, k: 0.62, spread: 0.94 },
          { n: 8, y: h - 80, k: 0.78, spread: 0.96 },
          { n: 6, y: h - 8, k: 0.92, spread: 1 },
        ]
      : [{ n: 6, y: h - 8, k: 0.9, spread: 1 }];
  const people: string[] = [];
  let index = 0;
  rows.forEach((row, r) => {
    for (let i = 0; i < row.n; i += 1) {
      const t = (i + 0.5) / row.n;
      // The front row leaves the middle to the story's people.
      if (r === rows.length - 1 && input.size === 'many' && t > 0.34 && t < 0.66)
        continue;
      const jitter = (beatOf(`${input.seed}:${r}:${i}:x`) - 0.5) * 40;
      const x = r1(w * (0.5 + (t - 0.5) * row.spread) + jitter);
      people.push(person(x, row.y, row.k, input.seed, wardrobe, index));
      index += 1;
    }
  });
  const style = [
    `.cp{stroke:${INK};stroke-width:2.6;stroke-linejoin:round;transform-box:fill-box;transform-origin:50% 100%;animation:crowd-breathe 3.4s ease-in-out infinite}`,
    '@keyframes crowd-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.01,1.02)}}',
    '.pp{transform:translateX(var(--look,0px));transition:transform .3s ease-out}',
  ].join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><style>${style}</style>${people.join('')}</svg>`;
  return {
    svg,
    viewBox: [0, 0, w, h],
    aspect: w / h,
    parts: {},
    labels: {},
    states: {},
    moves: true,
    callouts: [],
    field: null,
    // Their words come from over their heads, in the middle.
    head: [w / 2, h * 0.3],
  };
}
