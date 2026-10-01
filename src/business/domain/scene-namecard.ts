/**
 * A name card: who someone is, in the few words a viewer needs while the
 * voice tells their part. A portrait slot (their initials on a disc, or
 * their figure-kit bust once one is drawn: never a photo), their name,
 * their role, one line on what they stand for, and a border in their
 * colour, the show's colour for them in every scene.
 *
 * The bust is a seam (infographic-editor-plan §3, stage 6c): the
 * `illustrated` kit draws a person's head and shoulders in their described
 * likeness (bustSvg(figure, colourToken)); `withBust(card, svg)` puts it
 * in the card's slot. Until then, and for anyone the show never drew, the
 * slot is their initials.
 */
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import type { Element } from 'domhandler';
import { walk } from './scene-dom';
import { measureText } from './scene-font';
import { colourOr, tokenOf, type PaletteToken } from './scene-palette';
import type { FilmShape } from './scene-shape';
import { sanitizeTree } from './scene-svg';
import { PAPER, codeColour, recolour } from './scene-themes';
import {
  TEXT_FLOOR,
  delayOf,
  escapeXml,
  fitWords,
  r1,
  roomOf,
  strokeOf,
  styleOf,
  svgOf,
  textLines,
  type InfographicDrawing,
} from './scene-infographic-style';

export interface NamecardSpec {
  name: string;
  /** What they were: "Premier of the Western Region". */
  role: string | null;
  /** One line on what they stand for in the story: "Led the Action Group". */
  line: string | null;
  colour: PaletteToken | null;
  /** Their figure-kit bust, put in by withBust; null, their initials. */
  bust: { svg: string; viewBox: [number, number, number, number] } | null;
}

/** A name card as the writer gives it. */
export interface NamecardDraft {
  name: string | null;
  role: string | null;
  line: string | null;
}

const clean = (text: unknown, most: number) =>
  typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

/** A name card made sound, or null with no one to name. */
export function readNamecard(
  raw: NamecardDraft | null | undefined,
  name: string,
  extra: { colour?: unknown } = {},
): NamecardSpec | null {
  const who = clean(raw?.name, 48) || clean(name, 48);
  if (!who) return null;
  return {
    name: who,
    role: clean(raw?.role, 60) || null,
    line: clean(raw?.line, 80) || null,
    colour: tokenOf(extra.colour),
    bust: null,
  };
}

export const namecardPartNames = (spec: NamecardSpec): string[] => [
  'portrait',
  'name',
  ...(spec.role ? ['role'] : []),
  ...(spec.line ? ['line'] : []),
];

/** Words before a name that are no part of it. */
const TITLES =
  /^(?:sir|dame|dr|doctor|prof|professor|mr|mrs|ms|miss|lord|lady|chief|alhaji|alhaja|president|premier|prime|minister|king|queen|prince|princess|emperor|empress|sultan|emir|oba|general|gen|colonel|col|captain|capt|saint|st|rev|reverend|father|mother|sister|brother|judge|justice|senator|governor|mayor)\.?$/i;

/** Someone's initials, as a card shows them: their first name's and their last's ("AB"); one for a single name. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && /\p{L}/u.test(w));
  const named = words.filter((w) => !TITLES.test(w));
  const kept = named.length ? named : words;
  if (!kept.length) return '?';
  const first = [...kept[0]].find((ch) => /\p{L}/u.test(ch)) ?? '';
  if (kept.length === 1) return first.toUpperCase();
  const last = [...kept[kept.length - 1]].find((ch) => /\p{L}/u.test(ch)) ?? '';
  return `${first}${last}`.toUpperCase();
}

/** The figure kit's ink (scene-ink's FIGURE_INK). */
const FIGURE_INK = '#2D2A32';

/** A colour a shade off itself: the same to the eye, but no theme token (as a flag's are kept). */
function shadeOff(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const b = n & 0xff;
  const moved = (n & 0xffff00) | (b > 0 ? b - 1 : 1);
  return `#${moved.toString(16).padStart(6, '0').toUpperCase()}`;
}

/**
 * A bust made ready for a card's slot: sanitised, its ids its own, its
 * viewBox kept, and its colours its own in every look (a white collar
 * stays white on a dark board, the kit's ink stays dark), except the
 * person's own colour, which is the show's and changes with the look.
 */
export function bustOf(
  svg: string,
  keep: string | null = null,
): { svg: string; viewBox: [number, number, number, number] } | null {
  const doc = parseDocument(svg, { xmlMode: true });
  const root = doc.children.find(
    (node) => 'name' in node && (node as Element).name === 'svg',
  ) as Element | undefined;
  if (!root) return null;
  sanitizeTree(root);
  const box = (root.attribs.viewBox ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBox: [number, number, number, number] =
    box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
      ? (box as [number, number, number, number])
      : [
          0,
          0,
          Number(root.attribs.width) || 100,
          Number(root.attribs.height) || 100,
        ];
  // Its ids made its own, so nothing in the card answers to them.
  for (const node of walk(root))
    for (const [attr, value] of Object.entries(node.attribs)) {
      if (attr === 'id' && node !== root) node.attribs[attr] = `bust-${value}`;
      else if (attr === 'href' || attr === 'xlink:href') {
        delete node.attribs[attr];
        node.attribs.href = value.replace(/^#/, '#bust-');
      } else if (value.includes('url(#'))
        node.attribs[attr] = value.replace(/url\(#/g, 'url(#bust-');
    }
  const inner = root.children
    .map((node) => render(node, { xmlMode: true, selfClosingTags: true }))
    .join('')
    .replace(/>\s+</g, '><')
    .trim();
  const own = recolour(inner, (hex) =>
    (keep && hex.toUpperCase() === keep.toUpperCase()) ||
    (codeColour(hex, PAPER) === null && hex.toUpperCase() !== FIGURE_INK)
      ? null
      : shadeOff(hex),
  );
  return { svg: own, viewBox };
}

/**
 * A name card with someone's bust in its portrait slot: the seam for the
 * figure kit's bust (bustSvg). Takes the card (its spec, or a thing that
 * carries one as `namecard`) and the bust's whole <svg>; gives the card
 * back with the bust kept, to be drawn in the slot. A bust that cannot be
 * read leaves the card as it was, with its initials.
 */
export function withBust<T extends NamecardSpec | { namecard: NamecardSpec }>(
  card: T,
  svg: string,
): T {
  const carried = 'namecard' in card;
  const spec: NamecardSpec = carried ? card.namecard : card;
  const bust = bustOf(svg, spec.colour ? colourOr(spec.colour, '') : null);
  if (!bust) return card;
  return carried ? { ...card, namecard: { ...spec, bust } } : { ...card, bust };
}

/** The light ground a bust stands on, the same in every look (no token), as a portrait's backdrop. */
const BUST_GROUND = '#EFE9DD';

/** A name card, drawn: its portrait, name, role and line, each a part, in its colour's border. */
export function renderNamecard(
  spec: NamecardSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): InfographicDrawing {
  const room = roomOf(shape);
  const colour = colourOr(spec.colour, PAPER.accent);
  const stroke = strokeOf(text) * 2;
  const pad = text * 0.9;
  const tall = shape === 'tall';
  const cardW = tall ? room.w * 0.92 : Math.min(room.w * 0.86, text * 34);
  const disc = tall ? Math.min(cardW * 0.56, text * 8.4) : text * 7.2;
  const textW = tall ? cardW - pad * 2 : cardW - pad * 3 - disc;
  const name = fitWords(spec.name, textW, text * 2.1, text * 1.2, 2);
  const role = spec.role
    ? fitWords(spec.role, textW, text * 1.2, text, 2, 600)
    : null;
  const line = spec.line
    ? fitWords(spec.line, textW, text * 1.1, text, 2, 600)
    : null;
  const nameH = name.lines.length * name.size * 1.12;
  const roleH = role ? role.lines.length * role.size * 1.2 + text * 0.25 : 0;
  const lineH = line ? line.lines.length * line.size * 1.25 + text * 0.45 : 0;
  const block = nameH + roleH + lineH;
  const cardH = tall
    ? pad * 2 + disc + text * 0.8 + block
    : Math.max(disc + pad * 2, block + pad * 2);
  const discX = tall ? cardW / 2 : pad + disc / 2;
  const discY = tall ? pad + disc / 2 : cardH / 2;
  const textX = tall ? cardW / 2 : pad * 2 + disc;
  const anchor = tall ? 'middle' : 'start';
  let y = tall ? pad + disc + text * 0.8 : (cardH - block) / 2;
  const parts: Record<string, string> = {
    portrait: 'card-portrait',
    name: 'card-name',
  };
  const out: string[] = [
    styleOf({
      card: 'animation:ig-rise .5s cubic-bezier(.2,.8,.3,1) both',
      pop: 'transform-box:fill-box;transform-origin:center;animation:ig-pop .45s cubic-bezier(.2,.8,.3,1.2) both',
      rise: 'animation:ig-rise .4s ease-out both',
    }),
  ];
  out.push(
    `<g class="card" style="${delayOf(0.05)}"><rect x="${r1(stroke / 2)}" y="${r1(stroke / 2)}" width="${r1(cardW - stroke)}" height="${r1(cardH - stroke)}" rx="${r1(text * 0.7)}" fill="${PAPER.card}" stroke="${colour}" stroke-width="${r1(stroke)}"/></g>`,
  );
  // The portrait: their bust in a circle, or their initials on a disc of their colour.
  const r = disc / 2;
  const portrait = spec.bust
    ? `<defs><clipPath id="card-portrait-clip"><circle cx="${r1(discX)}" cy="${r1(discY)}" r="${r1(r)}"/></clipPath></defs>` +
      `<circle cx="${r1(discX)}" cy="${r1(discY)}" r="${r1(r)}" fill="${BUST_GROUND}"/>` +
      `<g clip-path="url(#card-portrait-clip)"><svg x="${r1(discX - r)}" y="${r1(discY - r)}" width="${r1(disc)}" height="${r1(disc)}" viewBox="${spec.bust.viewBox.map(r1).join(' ')}" preserveAspectRatio="xMidYMax slice">${spec.bust.svg}</svg></g>` +
      `<circle cx="${r1(discX)}" cy="${r1(discY)}" r="${r1(r)}" fill="none" stroke="${colour}" stroke-width="${r1(stroke * 0.8)}"/>`
    : (() => {
        const initials = initialsOf(spec.name);
        const size = Math.min(
          disc * 0.42,
          (disc * 0.78) / Math.max(1, measureText(initials, 1, 700)),
        );
        return (
          `<circle cx="${r1(discX)}" cy="${r1(discY)}" r="${r1(r)}" fill="${colour}" fill-opacity="0.16" stroke="${colour}" stroke-width="${r1(stroke * 0.8)}"/>` +
          `<text x="${r1(discX)}" y="${r1(discY + size * 0.36)}" font-size="${r1(size)}" font-weight="700" fill="${colour}" text-anchor="middle">${escapeXml(initials)}</text>`
        );
      })();
  out.push(
    `<g id="card-portrait"><g class="pop" style="${delayOf(0.3)}">${portrait}</g></g>`,
  );
  out.push(
    `<g id="card-name"><g class="rise" style="${delayOf(0.45)}">${textLines(name.lines, textX, y + name.size * 0.9, name.size, { anchor, leading: 1.12 })}</g></g>`,
  );
  y += nameH;
  if (role) {
    parts.role = 'card-role';
    y += text * 0.25;
    out.push(
      `<g id="card-role"><g class="rise" style="${delayOf(0.6)}">${textLines(role.lines, textX, y + role.size * 0.95, role.size, { anchor, weight: 700, fill: colour, leading: 1.2 })}</g></g>`,
    );
    y += role.lines.length * role.size * 1.2;
  }
  if (line) {
    parts.line = 'card-line';
    y += text * 0.45;
    out.push(
      `<g id="card-line"><g class="rise" style="${delayOf(0.75)}">${textLines(line.lines, textX, y + line.size * 0.95, line.size, { anchor, weight: 600, fill: PAPER.ink, leading: 1.25 })}</g></g>`,
    );
  }
  const viewBox: [number, number, number, number] = [
    r1(-text * 0.3),
    r1(-text * 0.3),
    r1(cardW + text * 0.6),
    r1(cardH + text * 0.6),
  ];
  return { svg: svgOf(viewBox, out.join('')), viewBox, parts, states: {} };
}
