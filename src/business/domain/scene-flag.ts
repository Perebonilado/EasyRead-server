/**
 * Flags drawn by code: each country's true flag, as flag-icons draws it,
 * never one the artist remembers (a star too many, the stripes the wrong
 * way round). One to six in a picture: one large, or several in rows
 * with each country's name under its flag, coming in one after another.
 * Each flag is a part the voice can point at, by the name the writer
 * gave it.
 *
 * A flag keeps its own colours in every look: any of its colours that is
 * one of the paper theme's tokens is moved a shade off it, so a theme's
 * recolouring (scene-themes codeColour) never touches it; its frame and
 * its name are drawn in the tokens, and take the theme's.
 */
import { readFileSync } from 'node:fs';
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import type { Element } from 'domhandler';
import { walk } from './scene-dom';
import {
  EXACT_ROOM,
  TEXT_FLOOR,
  escapeXml,
  r1,
  wrapWords,
} from './scene-exact-style';
import type { FlagCountry } from './scene-flag-names';
import type { FilmShape } from './scene-shape';
import { sanitizeTree } from './scene-svg';
import { PAPER, codeColour, recolour } from './scene-themes';

/** A flag picture: its countries, each with the name the writer gave it. */
export interface FlagSpec {
  flags: (FlagCountry & { said: string })[];
}

/** A flag-icons flag's own canvas (its 4:3 set). */
const FLAG_W = 640;
const FLAG_H = 480;

const kept = new Map<string, string>();

/** A flag's inside, read once from flag-icons: sanitised, its ids its own, its colours kept from the themes. */
export function flagInner(code: string): string {
  const cached = kept.get(code);
  if (cached !== undefined) return cached;
  if (!/^[a-z]{2}(?:-[a-z]{2,3})?$|^[a-z]{2,5}$/.test(code))
    throw new Error(`no flag "${code}"`);
  const file = require.resolve(`flag-icons/flags/4x3/${code}.svg`);
  const doc = parseDocument(readFileSync(file, 'utf8'), { xmlMode: true });
  const root = doc.children.find(
    (node) => 'name' in node && (node as Element).name === 'svg',
  ) as Element | undefined;
  if (!root) throw new Error(`no flag "${code}"`);
  sanitizeTree(root);
  // Its ids made its own: two flags in one picture each keep their clips.
  const prefix = `f-${code}-`;
  for (const node of walk(root)) {
    for (const [attr, value] of Object.entries(node.attribs)) {
      if (attr === 'id' && node !== root) node.attribs[attr] = prefix + value;
      else if (attr === 'href' || attr === 'xlink:href') {
        // Plain href: the picture is set inside another, with no xlink of its own.
        delete node.attribs[attr];
        node.attribs.href = value.replace(/^#/, `#${prefix}`);
      } else if (value.includes('url(#'))
        node.attribs[attr] = value.replace(/url\(#/g, `url(#${prefix}`);
    }
  }
  const inner = root.children
    .map((node) => render(node, { xmlMode: true, selfClosingTags: true }))
    .join('')
    .replace(/>\s+</g, '><')
    .trim();
  const own = recolour(inner, (hex) =>
    codeColour(hex, PAPER) !== null ? shadeOff(hex) : null,
  );
  kept.set(code, own);
  return own;
}

/** A colour a shade off itself: the same to the eye, but no token. */
function shadeOff(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const b = n & 0xff;
  const moved = (n & 0xffff00) | (b > 0 ? b - 1 : 1);
  return `#${moved.toString(16).padStart(6, '0').toUpperCase()}`;
}

/** How flags stand, by how many and the film's shape: columns a row. */
function columnsFor(n: number, shape: FilmShape): number {
  if (shape === 'tall') return n === 1 ? 1 : n <= 4 ? (n === 3 ? 1 : 2) : 2;
  return n <= 3 ? n : n === 4 ? 2 : 3;
}

/** Flags, drawn: one SVG, each flag (with its name) a part, in stage units for the film's shape. */
export function renderFlags(
  spec: FlagSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): {
  svg: string;
  viewBox: [number, number, number, number];
  parts: Record<string, string>;
  moves: boolean;
} {
  const flags = spec.flags;
  if (!flags.length) throw new Error('a flag picture needs a country');
  const n = flags.length;
  const room = EXACT_ROOM[shape];
  const cols = columnsFor(n, shape);
  const rows = Math.ceil(n / cols);
  const gap = Math.round(text * 1.4);
  const named = n > 1;
  const size = Math.round(text * 1.1);
  const most = n === 1 ? (shape === 'tall' ? 640 : 820) : Infinity;
  const across = Math.min(most, (room.w - gap * (cols - 1)) / cols);
  // The names' room under each flag: as many lines as the longest needs.
  const lines = named
    ? Math.max(...flags.map((f) => wrapWords(f.name, across, size, 2).length))
    : 0;
  const nameH = named ? size * 1.25 * lines + text * 0.5 : 0;
  const fw = Math.min(
    across,
    ((room.h - gap * (rows - 1)) / rows - nameH) * (FLAG_W / FLAG_H),
  );
  const fh = fw * (FLAG_H / FLAG_W);
  const k = fw / FLAG_W;
  const cellH = fh + nameH;
  const width = cols * fw + gap * (cols - 1);
  const height = rows * cellH + gap * (rows - 1);
  const parts: Record<string, string> = {};
  const out: string[] = [];
  out.push(
    `<style>@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}` +
      `.pop{transform-box:fill-box;transform-origin:center;animation:pop .45s cubic-bezier(.2,.8,.3,1.2) both}</style>`,
  );
  const corner = Math.max(6, fw * 0.03);
  flags.forEach((flag, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols);
    // A short last row is centred under the rest.
    const x0 = (width - (inRow * fw + gap * (inRow - 1))) / 2;
    const x = x0 + (i - row * cols) * (fw + gap);
    const y = row * (cellH + gap);
    const id = `flag-${flag.code}`;
    parts[flag.said] = id;
    const clip = `${id}-frame`;
    const label = named
      ? wrapWords(flag.name, fw, size, 2)
          .map(
            (line, j) =>
              `<text x="${r1(x + fw / 2)}" y="${r1(y + fh + text * 0.5 + size * (1 + j * 1.25))}" font-size="${size}" font-weight="700" fill="${PAPER.ink}" text-anchor="middle">${escapeXml(line)}</text>`,
          )
          .join('')
      : '';
    out.push(
      `<g id="${id}"><g class="pop" style="animation-delay:${(named ? 0.2 + i * 0.3 : 0.1).toFixed(2)}s">` +
        `<clipPath id="${clip}"><rect width="${FLAG_W}" height="${FLAG_H}" rx="${r1(corner / k)}"/></clipPath>` +
        `<g transform="translate(${r1(x)} ${r1(y)}) scale(${(Math.round(k * 10000) / 10000).toString()})">` +
        `<g clip-path="url(#${clip})">${flagInner(flag.code)}</g>` +
        `<rect width="${FLAG_W}" height="${FLAG_H}" rx="${r1(corner / k)}" fill="none" stroke="${PAPER.paperEdge}" stroke-width="${r1(3 / k)}"/>` +
        `</g>${label}</g></g>`,
    );
  });
  // Room round it for the frames' strokes.
  const viewBox: [number, number, number, number] = [
    -4,
    -4,
    Math.ceil(width) + 8,
    Math.ceil(height) + 8,
  ];
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">${out.join('')}</svg>`,
    viewBox,
    parts,
    moves: named,
  };
}
