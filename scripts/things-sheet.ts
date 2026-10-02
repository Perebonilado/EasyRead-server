/**
 * A contact sheet of the things kit (WP10: buildings, documents, objects,
 * machines), drawn by resvg: each piece in a cell, its feet on a ground
 * line, its id and notes under it. For looking at the kit while it is made.
 *
 *   npx ts-node --transpile-only scripts/things-sheet.ts <out.png> '<json list>' [columns] [editorial|illustrated] [theme]
 *
 * The list is [[kitId, {settings}, seed], ...]; "all" draws every id of
 * the things families once.
 */
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import type { ShotLookDto } from '../src/contracts';
import { THINGS_KIT } from '../src/business/domain/kit/things';
import { paramsOf } from '../src/business/domain/kit/registry';
import { validateRig } from '../src/business/domain/kit/rig';
import { kitStyle, type KitLook } from '../src/business/domain/kit/style';
import { THEMES, type ThemeId } from '../src/business/domain/scene-themes';

type Cell = [string, Record<string, unknown>, number];
const [
  ,
  ,
  out = 'things-sheet.png',
  given = 'all',
  colsArg,
  lookArg,
  themeArg,
] = process.argv;
const theme = THEMES[(themeArg ?? 'paper') as ThemeId] ?? THEMES.paper;
const LOOK: ShotLookDto = {
  palette: {
    paper: theme.paper,
    ink: theme.ink,
    muted: theme.muted,
    accent: theme.accent,
    sides: { North: '#0050BE', South: '#BB7907' },
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};
const list: Cell[] =
  given === 'all'
    ? Object.keys(THINGS_KIT).map((id): Cell => [id, {}, 1])
    : (JSON.parse(given) as Cell[]);
const cols = Number(colsArg ?? 4);
const W = 560;
const H = 460;
const style = kitStyle(LOOK, { look: (lookArg ?? 'editorial') as KitLook });
const cells: string[] = [];
list.forEach(([id, raw, seed], i) => {
  const cx = (i % cols) * W;
  const cy = Math.floor(i / cols) * H;
  const entry = THINGS_KIT[id];
  if (!entry) {
    cells.push(
      `<text x="${cx + 20}" y="${cy + 40}" font-size="20" fill="red">${id}: no such id</text>`,
    );
    return;
  }
  const params = {
    ...paramsOf(id, raw),
    ...(typeof raw.colour === 'string' ? { colour: raw.colour } : {}),
  };
  const piece = entry.make(params, style, seed);
  const problems = validateRig(piece);
  if (problems.length) console.log('INVALID', id, problems.slice(0, 6));
  const [bx, by, bw, bh] = piece.box;
  const k = Math.min((W - 40) / bw, (H - 80) / bh);
  const ox = cx + (W - bw * k) / 2 - bx * k;
  const oy = cy + H - 34 - (by + bh) * k;
  const inner = piece.svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .replace(/id="/g, `id="c${i}-`)
    .replace(/href="#/g, `href="#c${i}-`)
    .replace(/url\(#/g, `url(#c${i}-`);
  const [fx, fy, fw, fh] = piece.focal;
  cells.push(
    `<line x1="${cx + 10}" x2="${cx + W - 10}" y1="${cy + H - 34}" y2="${cy + H - 34}" stroke="#d8d0c2" stroke-width="2"/>`,
    `<g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)}) scale(${k.toFixed(5)})">${inner}<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="#e0663a" stroke-width="${(1.5 / k).toFixed(2)}" stroke-dasharray="${(6 / k).toFixed(1)} ${(4 / k).toFixed(1)}" opacity="0.5"/></g>`,
    `<text x="${cx + 12}" y="${cy + 22}" font-size="15" font-family="Helvetica" fill="#646B76">${id} ${Object.values(raw).join(' ')} #${seed} · ${Math.round(piece.svg.length / 1024)} KB${piece.notes ? ` · ${piece.notes.join(' · ')}` : ''}</text>`,
  );
});
const rows = Math.ceil(list.length / cols);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * W}" height="${rows * H}" viewBox="0 0 ${cols * W} ${rows * H}"><rect width="100%" height="100%" fill="${LOOK.palette.paper}"/>${cells.join('')}</svg>`;
writeFileSync(
  out,
  new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng(),
);
console.log('wrote', out);
