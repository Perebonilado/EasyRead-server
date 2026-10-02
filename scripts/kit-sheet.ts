/**
 * A contact sheet of kit pieces (kit/registry), drawn by resvg: each piece
 * in a cell of its own, its feet on a ground line, its id, settings, size
 * and notes under it. For looking at the kit while it is made.
 *
 *   npx ts-node --transpile-only scripts/kit-sheet.ts <out.png> '<json list>' [columns] [wide|tall]
 *
 * The list is [[id, {settings}, colour?, seed], ...]; colour is a side's
 * name or a role ("ink"). Every id of the kit, three seeds each:
 *
 *   npx ts-node --transpile-only scripts/kit-sheet.ts kit.png all
 */
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import type { ShotLookDto } from '../src/contracts';
import { KIT, KIT_IDS, makeKit } from '../src/business/domain/kit/registry';
import { validateRig } from '../src/business/domain/kit/rig';
import { kitStyle } from '../src/business/domain/kit/style';

const LOOK: ShotLookDto = {
  palette: {
    paper: '#F4EFE6',
    ink: '#1D232B',
    muted: '#646B76',
    accent: '#D9480F',
    held: '#1864AB',
    sides: { North: '#0050BE', South: '#BB7907', Strikers: '#A22700' },
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};

type Cell = [string, Record<string, unknown>, string | undefined, number];

const [, , out = 'kit-sheet.png', given = 'all', colsArg, shapeArg] =
  process.argv;
const list: Cell[] =
  given === 'all'
    ? KIT_IDS.flatMap((id) =>
        [1, 2, 3].map((seed): Cell => [id, {}, 'North', seed]),
      )
    : (JSON.parse(given) as Cell[]);
const cols = Number(colsArg ?? 4);
const shape = shapeArg === 'tall' ? 'tall' : 'wide';
const W = 520;
const H = 420;
const style = kitStyle(LOOK, { shape });
const cells: string[] = [];
list.forEach(([id, params, colour, seed], i) => {
  const cx = (i % cols) * W;
  const cy = Math.floor(i / cols) * H;
  const made = makeKit(id, params, style, seed, colour);
  if (!made) {
    const raw = KIT[id]?.make(
      { ...(params as Record<string, string>), ...(colour ? { colour } : {}) },
      style,
      seed,
    );
    console.log(
      'INVALID',
      id,
      JSON.stringify(params),
      raw ? validateRig(raw).slice(0, 6) : 'no such id',
    );
    cells.push(
      `<text x="${cx + 20}" y="${cy + 40}" font-size="20" fill="red">${id} is broken</text>`,
    );
    return;
  }
  const { piece } = made;
  const [bx, by, bw, bh] = piece.box;
  const k = Math.min((W - 40) / bw, (H - 70) / bh);
  const ox = cx + (W - bw * k) / 2 - bx * k;
  const oy = cy + H - 30 - (by + bh) * k;
  // Each cell's ids its own, as the stage makes them per mount.
  const inner = piece.svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .replace(/id="/g, `id="c${i}-`)
    .replace(/href="#/g, `href="#c${i}-`)
    .replace(/url\(#/g, `url(#c${i}-`);
  cells.push(
    `<line x1="${cx + 10}" x2="${cx + W - 10}" y1="${cy + H - 30}" y2="${cy + H - 30}" stroke="#d8d0c2" stroke-width="2"/>`,
    `<g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)}) scale(${k.toFixed(4)})">${inner}</g>`,
    `<text x="${cx + 12}" y="${cy + 22}" font-size="15" font-family="Helvetica" fill="#646B76">${id} ${Object.values(params).join(' ')} #${seed} · ${Math.round(piece.svg.length / 1024)} KB${piece.notes ? ` · ${piece.notes[0]}` : ''}</text>`,
  );
});
const rows = Math.ceil(list.length / cols);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * W}" height="${rows * H}" viewBox="0 0 ${cols * W} ${rows * H}"><rect width="100%" height="100%" fill="${LOOK.palette.paper}"/>${cells.join('')}</svg>`;
writeFileSync(
  out,
  new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng(),
);
console.log('wrote', out);
