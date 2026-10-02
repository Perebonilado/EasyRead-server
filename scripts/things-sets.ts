/**
 * Stills of code-drawn sets (kit/sets), drawn by resvg as they open, or
 * in a later state: for looking at sets while they are made.
 *
 *   npx ts-node --transpile-only scripts/things-sets.ts <out.png> '<json list>' [columns] [wide|tall] [editorial|illustrated] [theme]
 *
 * The list is [[{settings}, seed, state?], ...].
 */
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import type { ShotLookDto } from '../src/contracts';
import {
  drawSet,
  lightRank,
  setSettingsOf,
  type SetSettings,
} from '../src/business/domain/kit/sets';
import { eraOf } from '../src/business/domain/kit/eras';
import type { KitLook } from '../src/business/domain/kit/style';
import { THEMES, type ThemeId } from '../src/business/domain/scene-themes';

const [
  ,
  ,
  out = 'sets.png',
  given = '[]',
  colsArg,
  shapeArg,
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
    sides: {},
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};
const shape = shapeArg === 'tall' ? 'tall' : 'wide';
const list = JSON.parse(given) as [Record<string, unknown>, number, string?][];
const cols = Number(colsArg ?? 2);
const CW = shape === 'wide' ? 960 : 540;
const CH = shape === 'wide' ? 480 : 918;
const cells: string[] = [];
list.forEach(([raw, seed, state], i) => {
  const settings: SetSettings = setSettingsOf(raw, eraOf(raw.era) ?? null);
  const made = drawSet(settings, LOOK, {
    shape,
    kitLook: (lookArg ?? 'editorial') as KitLook,
    seed,
  });
  let svg = made.asset.svg;
  // A later state painted in, as the client's scenery would at its end.
  if (state && made.asset.scenery?.states[state]) {
    for (const [part, look] of Object.entries(
      made.asset.scenery.states[state],
    )) {
      const re = new RegExp(`(<[a-zA-Z]+[^>]*data-part="${part}")([^>]*)>`);
      svg = svg.replace(re, (_m, head: string, tail: string) => {
        let t = tail;
        let h = head;
        const setAttr = (name: string, value: string) => {
          const has = new RegExp(`\\s${name}="[^"]*"`);
          if (has.test(h)) h = h.replace(has, ` ${name}="${value}"`);
          else if (has.test(t)) t = t.replace(has, ` ${name}="${value}"`);
          else t += ` ${name}="${value}"`;
        };
        if (look.fill)
          setAttr(/<stop/.test(h) ? 'stop-color' : 'fill', look.fill);
        if (look.opacity !== undefined)
          setAttr('opacity', String(look.opacity));
        if (look.rotate) {
          const p = made.asset.parts[part];
          if (p?.pivot)
            setAttr(
              'transform',
              `rotate(${look.rotate} ${p.box[0] + p.box[2] * p.pivot[0]} ${p.box[1] + p.box[3] * p.pivot[1]})`,
            );
        }
        return `${h}${t}>`;
      });
      // Lights: each child lit by its rank, as the player lights them.
      if (look.lit !== undefined) {
        const lit = look.lit;
        const groupRe = new RegExp(`(<g data-part="${part}"[^>]*>)(.*?)(</g>)`);
        svg = svg.replace(
          groupRe,
          (_m, open: string, inner: string, close: string) => {
            let n = 0;
            const lighted = inner.replace(
              /<path d="([^"]+)"(?: opacity="0")?\/>/g,
              (_p, d: string) => {
                const on = lightRank(part, n) < lit;
                n += 1;
                return `<path d="${d}"${on ? '' : ' opacity="0"'}/>`;
              },
            );
            return `${open}${lighted}${close}`;
          },
        );
      }
    }
  }
  const [, , W, H] = made.asset.box;
  const k = Math.min(CW / W, CH / H);
  const x = (i % cols) * CW;
  const y = Math.floor(i / cols) * (CH + 24);
  const inner = svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .replace(/id="/g, `id="c${i}-`)
    .replace(/url\(#/g, `url(#c${i}-`);
  const [fx, fy, fw, fh] = made.asset.focal ?? [0, 0, 0, 0];
  cells.push(
    `<svg x="${x}" y="${y}" width="${CW}" height="${CH}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><g>${inner}</g><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="#ff00aa" stroke-width="${2 / k}" stroke-dasharray="${8 / k} ${6 / k}" opacity="0.5"/></svg>`,
    `<text x="${x + 8}" y="${y + CH + 17}" font-size="14" font-family="Helvetica" fill="#333">${made.notes.slice(0, 3).join(' · ')}${state ? ` → ${state}` : ''} · ${Math.round(made.asset.svg.length / 1024)} KB</text>`,
  );
});
const rows = Math.ceil(list.length / cols);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * CW}" height="${rows * (CH + 24)}"><rect width="100%" height="100%" fill="#ffffff"/>${cells.join('')}</svg>`;
writeFileSync(
  out,
  new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng(),
);
console.log('wrote', out);
