/**
 * Documents (explainer-animation-plan §7.2, tech §4.2): the paper of
 * history as props a shot can hold up, at their real sizes in the kit's
 * units (a hundred to the metre), standing on their foot: a letter, a
 * charter or treaty with its seal, a newspaper, a ballot paper, a
 * banknote-like note (never a real currency's design: no country, no
 * portrait, no number unless it is given), a booklet, and a rubber stamp.
 *
 * Words: a document drawn here shows its lines as grey bars, never words
 * of its own. Words on screen come only from the research: a caller that
 * has them (a headline, a title the registry holds) hands them in, and
 * they are escaped; the registry's entries hand in none, so a board's
 * document is the paper itself, and a document whose words matter is the
 * full-frame `document` chart, which sets them from the research.
 *
 * Parts: `page` (the paper), its parts of writing (`masthead`,
 * `headline`, `column-N`, `photo`, `lines`, `title`, `clause-N`,
 * `option-N`), what marks it (`signature` paths the draw recipe can
 * write on, a `seal`), and `stamp`: the spot a stamp lands on (the stamp
 * recipe's target).
 */
import type { ShotBox } from '../../../contracts';
import type { KitEntry, KitParams } from './registry';
import type { KitPiece } from './rig';
import {
  type Pt,
  type Shape,
  circle,
  ellipse,
  groundShadow,
  n1,
  unionBox,
} from './shape';
import type { KitStyle } from './style';
import { mixOk } from './style';
import {
  type Fill,
  Drawing,
  band,
  box,
  escapeText,
  inLook,
  many,
  poly,
  shadeOf,
  wornColour,
} from './paint';

export const DOCUMENT_KINDS = [
  'letter',
  'charter',
  'newspaper',
  'ballot',
  'note',
  'booklet',
  'stamp',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** What a caller may hand a document: words from the research, already checked as true, and a colour. */
export interface DocumentInput {
  /** A headline or a title, from the research only; at most eight words are shown. */
  text?: string;
  colour?: string;
  /** A note's value, when the line says it. */
  value?: number;
}

const PAPER = '#f4efe4';
const PARCHMENT = '#ead9b5';
const INK = '#3b3f46';
const BARS = '#b9b4aa';

/** A signature: a seeded hand-written stroke across a span, as a path the draw recipe writes on, and its shape. */
function signature(
  x0: number,
  x1: number,
  y: number,
  h: number,
  seed: number,
): { d: string; shape: Shape } {
  const points: Pt[] = [];
  const n = 9;
  let s = seed >>> 0 || 1;
  const r = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i <= n; i += 1)
    points.push([
      x0 + ((x1 - x0) * i) / n + (r() - 0.5) * h * 0.4,
      y + (i % 2 ? -h : h) * (0.3 + r() * 0.7) * (i === 0 || i === n ? 0.2 : 1),
    ]);
  let d = `M${n1(points[0][0])} ${n1(points[0][1])}`;
  for (let i = 1; i < points.length; i += 1) {
    const [px, py] = points[i - 1];
    const [x, y2] = points[i];
    d += `C${n1(px + (x - px) * 0.5)} ${n1(py)} ${n1(px + (x - px) * 0.5)} ${n1(y2)} ${n1(x)} ${n1(y2)}`;
  }
  // Its ink, as thin bands along the points (so it has a box and fills like the rest).
  const strokes = points
    .slice(1)
    .map((p, i) => band(points[i], p, Math.max(0.25, h * 0.08)));
  return { d, shape: many(strokes) };
}

/** Lines of writing as grey bars, ragged at their ends. */
function lines(
  x0: number,
  x1: number,
  y0: number,
  count: number,
  gap: number,
  thick: number,
  seed: number,
): Shape {
  const out: Shape[] = [];
  let s = seed >>> 0 || 7;
  for (let i = 0; i < count; i += 1) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const end =
      i === count - 1
        ? x0 + (x1 - x0) * (0.35 + (s / 4294967296) * 0.3)
        : x1 - (x1 - x0) * ((s % 1000) / 1000) * 0.12;
    out.push(box(x0, y0 + i * gap, end, y0 + i * gap + thick, thick / 2));
  }
  return many(out);
}

/** Words set in the document, escaped, in the look's reading face (or a newspaper's serif): only what a caller hands in. */
function words(
  text: string | undefined,
  x: number,
  y: number,
  size: number,
  fill: string,
  options: {
    anchor?: 'start' | 'middle';
    serif?: boolean;
    bold?: boolean;
    most?: number;
  } = {},
): string {
  const trimmed = (text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, options.most ?? 8)
    .join(' ');
  if (!trimmed) return '';
  const family = options.serif
    ? 'Georgia, "Times New Roman", serif'
    : '"Plus Jakarta Sans", sans-serif';
  return `<text x="${n1(x)}" y="${n1(y)}" font-size="${n1(size)}" font-family='${family}' font-weight="${options.bold ? 800 : 600}" fill="${fill}" text-anchor="${options.anchor ?? 'start'}">${escapeText(trimmed)}</text>`;
}

/** A document drawn: its page standing on its foot (y = 0), its writing as bars, its marks, the spot a stamp lands on. */
export function drawDocument(
  kind: DocumentKind,
  input: DocumentInput,
  style: KitStyle,
  seed: number,
): KitPiece {
  const size = {
    letter: [21, 29.7],
    charter: [42, 56],
    newspaper: [38, 58],
    ballot: [14, 30],
    note: [15, 7.2],
    booklet: [15, 21],
    stamp: [8, 11],
  }[kind];
  const [w, h] = size;
  const d = new Drawing(style, Math.max(w, h) * 1.6);
  const paper = inLook(
    style,
    kind === 'charter' ? PARCHMENT : kind === 'note' ? '#dfe5d6' : PAPER,
  );
  const ink = inLook(style, INK);
  const bars = mixOk(inLook(style, BARS), paper, 0.1);
  const x0 = -w / 2;
  const y0 = -h;
  const notes: string[] = [];
  d.group('document', null, [0, 0]);
  const page = (fills: Fill[]) => d.part('page', 'document', fills);
  const stampSpot = (cx: number, cy: number, r: number) =>
    d.part('stamp', 'document', [], {
      box: [cx - r, cy - r, 2 * r, 2 * r],
      extra: `<rect x="${n1(cx - r)}" y="${n1(cy - r)}" width="${n1(2 * r)}" height="${n1(2 * r)}" fill="none"/>`,
    });
  switch (kind) {
    case 'letter': {
      page([
        [box(x0, y0, x0 + w, 0), paper],
        [
          poly([
            [x0 + w - 3, y0],
            [x0 + w, y0],
            [x0 + w, y0 + 3],
          ]),
          shadeOf(paper, 0.08),
          { bare: true },
        ],
      ]);
      d.part(
        'letterhead',
        'document',
        [[box(x0 + 2, y0 + 2, x0 + 9, y0 + 3), bars]],
        {
          extra: words(input.text, x0 + 2, y0 + 3.6, 1.1, ink, { most: 6 }),
        },
      );
      d.part('lines', 'document', [
        [lines(x0 + 2, x0 + w - 2, y0 + 7, 12, 1.3, 0.45, seed), bars],
      ]);
      const sig = signature(x0 + 2.5, x0 + 9, y0 + 25, 0.8, seed);
      d.part('signature', 'document', [[sig.shape, ink]]);
      d.path('signature', sig.d);
      stampSpot(x0 + w - 5, y0 + 23, 3.2);
      break;
    }
    case 'charter': {
      page([
        [box(x0, y0, x0 + w, 0, 0.6), paper],
        [
          box(x0 + 1.6, y0 + 1.6, x0 + w - 1.6, -1.6),
          mixOk(paper, '#8a6a3a', 0.25),
        ],
        [box(x0 + 2.2, y0 + 2.2, x0 + w - 2.2, -2.2), paper],
      ]);
      d.part(
        'title',
        'document',
        [
          [
            box(x0 + w * 0.25, y0 + 5, x0 + w * 0.75, y0 + 7.4, 1),
            mixOk(bars, '#6a4f2a', 0.3),
          ],
        ],
        {
          extra: words(input.text, 0, y0 + 7, 2.2, ink, {
            anchor: 'middle',
            serif: true,
            most: 6,
          }),
        },
      );
      for (let k = 0; k < 4; k += 1)
        d.part(`clause-${k + 1}`, 'document', [
          [
            lines(x0 + 5, x0 + w - 5, y0 + 11 + k * 8.5, 4, 1.6, 0.6, seed + k),
            bars,
          ],
        ]);
      // Signatures across the foot, and the seal on its ribbon.
      for (let k = 0; k < 3; k += 1) {
        const sig = signature(
          x0 + 5 + k * 11,
          x0 + 13 + k * 11,
          -9,
          1.2,
          seed + 31 * k,
        );
        d.part(`signature-${k + 1}`, 'document', [[sig.shape, ink]]);
        d.path(`signature-${k + 1}`, sig.d);
      }
      const red = inLook(style, '#9c2f2a');
      d.part('seal', 'document', [
        [
          poly([
            [x0 + w - 9, -6],
            [x0 + w - 11, 2.5],
            [x0 + w - 8.6, 0.6],
            [x0 + w - 7, 2.6],
            [x0 + w - 7, -6],
          ]),
          inLook(style, '#c9a44e'),
        ],
        [circle([x0 + w - 8, -7], 3.6), red],
        [circle([x0 + w - 8, -7], 2.4), shadeOf(red, 0.18), { bare: true }],
      ]);
      stampSpot(x0 + w - 10, y0 + 16, 4.5);
      break;
    }
    case 'newspaper': {
      page([
        [box(x0, y0, x0 + w, 0), paper],
        [
          box(x0, y0 + h * 0.5 - 0.15, x0 + w, y0 + h * 0.5 + 0.15),
          shadeOf(paper, 0.1),
          { bare: true },
        ],
      ]);
      d.part('masthead', 'document', [
        [
          box(x0 + 2, y0 + 2, x0 + w - 2, y0 + 7.5),
          input.text ? paper : mixOk(ink, paper, 0.1),
        ],
        [box(x0 + 2, y0 + 8.2, x0 + w - 2, y0 + 8.6), ink],
        [box(x0 + 2, y0 + 9.1, x0 + w - 2, y0 + 9.3), ink],
      ]);
      d.part(
        'headline',
        'document',
        input.text
          ? [
              [
                box(x0 + 2, y0 + 10.5, x0 + w - 2, y0 + 15.5),
                paper,
                { bare: true },
              ],
            ]
          : [
              [box(x0 + 2, y0 + 10.8, x0 + w * 0.82, y0 + 12.6, 0.4), ink],
              [box(x0 + 2, y0 + 13.4, x0 + w * 0.58, y0 + 15.2, 0.4), ink],
            ],
        {
          extra: words(input.text, x0 + 2, y0 + 14.6, 3.6, ink, {
            serif: true,
            bold: true,
            most: 5,
          }),
        },
      );
      d.part('photo', 'document', [
        [box(x0 + 2, y0 + 17, x0 + w * 0.62, y0 + 31), mixOk(ink, paper, 0.55)],
        [
          many(
            Array.from({ length: 6 }, (_, i) =>
              box(
                x0 + 2,
                y0 + 17 + i * 2.4,
                x0 + w * 0.62,
                y0 + 17.6 + i * 2.4,
              ),
            ),
          ),
          mixOk(ink, paper, 0.45),
          { bare: true },
        ],
      ]);
      const cols = 3;
      const cw = (w - 4 - 2 * (cols - 1)) / cols;
      for (let k = 0; k < cols; k += 1) {
        const cx = x0 + 2 + k * (cw + 2);
        const top = k === 2 ? y0 + 17 : y0 + 33;
        d.part(`column-${k + 1}`, 'document', [
          [
            lines(cx, cx + cw, top, k === 2 ? 26 : 16, 1.25, 0.42, seed + k),
            bars,
          ],
        ]);
      }
      stampSpot(x0 + w - 8, y0 + 24, 4.6);
      break;
    }
    case 'ballot': {
      page([[box(x0, y0, x0 + w, 0), paper]]);
      d.part(
        'title',
        'document',
        [
          [
            box(x0 + 1.5, y0 + 1.5, x0 + w - 1.5, y0 + 3.4, 0.4),
            mixOk(ink, paper, 0.2),
          ],
        ],
        {
          extra: words(input.text, 0, y0 + 3, 1.3, paper, {
            anchor: 'middle',
            most: 4,
          }),
        },
      );
      const options = 5;
      for (let k = 0; k < options; k += 1) {
        const y = y0 + 6 + k * 4.6;
        d.part(`option-${k + 1}`, 'document', [
          [box(x0 + 1.5, y, x0 + w - 6, y + 0.8, 0.3), bars],
          [
            box(x0 + 1.5, y + 1.5, x0 + w * 0.5, y + 2.1, 0.3),
            mixOk(bars, paper, 0.3),
          ],
          [
            box(x0 + w - 4.5, y - 0.2, x0 + w - 1.5, y + 2.8, 0.2),
            mixOk(ink, paper, 0.25),
          ],
          [
            box(x0 + w - 4.2, y + 0.1, x0 + w - 1.8, y + 2.5, 0.1),
            paper,
            { bare: true },
          ],
        ]);
        d.part(`box-${k + 1}`, `option-${k + 1}`, [], {
          box: [x0 + w - 4.5, y - 0.2, 3, 3],
          extra: `<rect x="${n1(x0 + w - 4.5)}" y="${n1(y - 0.2)}" width="3" height="3" fill="none"/>`,
        });
      }
      // The voter's cross, in the first box: the picture's later state, brought on by a recipe.
      d.part('cross', 'option-1', [
        [band([x0 + w - 4.1, y0 + 6.1], [x0 + w - 1.9, y0 + 8.3], 0.4), ink],
        [band([x0 + w - 1.9, y0 + 6.1], [x0 + w - 4.1, y0 + 8.3], 0.4), ink],
      ]);
      stampSpot(0, y0 + h - 4, 2.4);
      notes.push('the cross is a later part');
      break;
    }
    case 'note': {
      // A note like a banknote, never one: no country, no portrait, no figure unless the line gives one.
      const tintC = wornColour(style, input.colour, '#6f9a7c').colour;
      page([
        [box(x0, y0, x0 + w, 0, 0.3), paper],
        [
          box(x0 + 0.4, y0 + 0.4, x0 + w - 0.4, -0.4, 0.2),
          mixOk(tintC, paper, 0.55),
        ],
        [
          box(x0 + 0.8, y0 + 0.8, x0 + w - 0.8, -0.8, 0.2),
          mixOk(tintC, paper, 0.8),
        ],
      ]);
      // Its guilloche: rings of fine lines, as engraving does.
      const rings: Shape[] = [];
      const centre: Pt = [x0 + w * 0.7, y0 + h / 2];
      const oval = (rx: number, ry: number, back: boolean): Pt[] =>
        Array.from({ length: 33 }, (_, i) => {
          const a = ((back ? 32 - i : i) * Math.PI * 2) / 32;
          return [centre[0] + Math.cos(a) * rx, centre[1] + Math.sin(a) * ry];
        });
      for (let k = 0; k < 7; k += 1) {
        const r = 1 + k * 0.35;
        // A ring: the outer oval one way, the inner the other, so the middle is left open.
        rings.push(
          poly([
            ...oval(r * 1.3, r, false),
            ...oval(r * 1.3 - 0.1, r - 0.1, true),
          ]),
        );
      }
      d.part('pattern', 'document', [
        [many(rings), mixOk(tintC, paper, 0.35), { bare: true }],
      ]);
      d.part('oval', 'document', [
        [
          ellipse([x0 + w * 0.28, y0 + h / 2], 2.6, 2.5),
          mixOk(tintC, paper, 0.45),
        ],
        [
          ellipse([x0 + w * 0.28, y0 + h / 2], 2.1, 2.0),
          mixOk(tintC, paper, 0.75),
          { bare: true },
        ],
      ]);
      d.part('serial', 'document', [
        [
          box(x0 + 1.2, y0 + 1.1, x0 + 4.6, y0 + 1.6, 0.2),
          mixOk(tintC, '#000000', 0.2),
        ],
        [
          box(x0 + w - 4.6, -1.6, x0 + w - 1.2, -1.1, 0.2),
          mixOk(tintC, '#000000', 0.2),
        ],
      ]);
      d.part(
        'value',
        'document',
        [[circle([x0 + w - 2.4, y0 + 2.4], 1.4), mixOk(tintC, paper, 0.3)]],
        {
          extra:
            input.value !== undefined && Number.isFinite(input.value)
              ? words(String(input.value), x0 + w - 2.4, y0 + 2.9, 1.3, paper, {
                  anchor: 'middle',
                  bold: true,
                })
              : '',
        },
      );
      if (input.value !== undefined) d.value('value', input.value);
      stampSpot(x0 + w * 0.5, y0 + h / 2, 1.8);
      notes.push('no currency, no portrait');
      break;
    }
    case 'booklet': {
      const cover = wornColour(style, input.colour, '#7a3b34').colour;
      page([
        [box(x0 + 0.6, y0 + 0.6, x0 + w + 0.4, 0.3, 0.4), shadeOf(paper, 0.08)],
        [box(x0 + 0.3, y0 + 0.3, x0 + w + 0.2, 0.15, 0.4), paper],
        [box(x0, y0, x0 + w, 0, 0.5), cover],
        [box(x0, y0, x0 + 1.2, 0, 0.3), shadeOf(cover, 0.2), { bare: true }],
      ]);
      d.part(
        'title',
        'document',
        [
          [
            box(x0 + 3, y0 + 4, x0 + w - 3, y0 + 5.4, 0.4),
            mixOk(cover, '#ffffff', 0.55),
          ],
          [circle([0, y0 + h * 0.45], 2.6), mixOk(cover, '#ffffff', 0.35)],
        ],
        {
          extra: words(input.text, 0, y0 + 5, 1.2, cover, {
            anchor: 'middle',
            most: 4,
          }),
        },
      );
      stampSpot(0, y0 + h * 0.72, 2.6);
      break;
    }
    case 'stamp': {
      // A rubber stamp: its wooden handle, its mount, and the rubber face it inks with.
      const wood = inLook(style, '#9b6a47');
      const face = wornColour(style, input.colour, '#9c2f2a').colour;
      d.part('handle', 'document', [
        [ellipse([0, y0 + 2.2], 2.2, 2.2), wood],
        [box(-1.2, y0 + 3.5, 1.2, y0 + 7, 0.6), wood],
      ]);
      d.part('mount', 'document', [
        [box(-4, y0 + 7, 4, -1.1, 0.4), shadeOf(wood, 0.15)],
      ]);
      d.part('face', 'document', [[box(-3.8, -1.1, 3.8, 0, 0.2), face]]);
      d.anchor('stamp', 'document', [0, -1]);
      break;
    }
  }
  // A soft shadow on what it stands on.
  const root = d.parts.find((one) => one.id === 'document');
  if (root)
    root.markup = groundShadow(
      `${kind}-shadow`,
      [0, 0],
      w * 0.55,
      Math.max(0.4, w * 0.035),
      style.shadow.colour,
      style.shadow.opacity * 0.6,
    );
  const drawn = unionBox(
    d.parts
      .filter((p) => p.box && (p.box[2] > 0 || p.box[3] > 0))
      .map((p) => p.box!),
  );
  const pad = Math.max(w, h) * 0.04;
  const boxAll: ShotBox = [
    Math.min(drawn[0], -w * 0.55) - pad,
    drawn[1] - pad,
    Math.max(drawn[2], w * 1.1) + 2 * pad,
    -(drawn[1] - pad),
  ];
  return d.piece({
    id: `document.${kind}`,
    box: boxAll,
    focal: [x0, y0, w, h],
    rig: {
      states:
        kind === 'ballot'
          ? { blank: { cross: { opacity: 0 } }, marked: {} }
          : {},
      moves: ['enter', 'exit'],
    },
    colours: ['paper'],
    notes: [
      input.text ? 'words from the research' : 'no words: its lines are bars',
      ...notes,
    ],
  });
}

export const DOCUMENT_KIT: Readonly<Record<string, KitEntry>> = {
  document: {
    family: 'documents',
    looks: ['editorial', 'illustrated'],
    about:
      'A document as a prop, its lines bars, never words of its own: kind letter (a signature part to draw), charter (a treaty: clauses, signatures, a seal), newspaper (masthead, headline, columns), ballot (its cross the state marked), note (like a banknote, never a currency), booklet, stamp (a rubber stamp). Each has a stamp spot (part stamp).',
    params: { kind: { values: DOCUMENT_KINDS, default: 'letter', about: 'which document' } },
    moves: ['enter', 'exit'],
    make: (params: KitParams, style: KitStyle, seed: number) =>
      drawDocument(
        (DOCUMENT_KINDS as readonly unknown[]).includes(params.kind) ? (params.kind as DocumentKind) : 'letter',
        typeof params.colour === 'string' ? { colour: params.colour } : {},
        style,
        seed,
      ),
  },
};
