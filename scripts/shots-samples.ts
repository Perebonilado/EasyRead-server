/**
 * The shots engine's charts, to look at and to play.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/shots-samples.ts --stills <dir> [--kind counter] [--boxes]
 *
 * --stills renders every chart kind's sample specs (shots/__fixtures__/
 * chart-specs.ts) in both shapes, in the light look and the first of each
 * in the dark one, as PNGs into <dir>; --boxes adds a second PNG of each
 * with its parts' boxes, its focal box and the words' safe area drawn on.
 * The stills use the Mac's own faces (Georgia, Avenir Next, Helvetica
 * Neue) for the looks' display and text faces, as the browser would use
 * the show's.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { FilmShape, ShotLookDto, ShotSvgAssetDto } from '../src/contracts';
import {
  CHART_SPECS,
  DARK_LOOK,
  LIGHT_LOOK,
} from '../src/business/domain/shots/__fixtures__/chart-specs';
import { chartAsset } from '../src/business/domain/shots/shot-charts';
import { frameOf } from '../src/business/domain/shots/shot-chart-kit';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? (args[at + 1] ?? '') : null;
};

/** The Mac's faces the looks name, as files resvg can read. */
const FONT_FILES = [
  '/System/Library/Fonts/Supplemental/Charter.ttc',
  '/System/Library/Fonts/Supplemental/Georgia.ttf',
  '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
  '/System/Library/Fonts/Supplemental/Georgia Italic.ttf',
  '/System/Library/Fonts/Avenir Next.ttc',
  '/System/Library/Fonts/HelveticaNeue.ttc',
  '/System/Library/Fonts/NewYork.ttf',
].filter((path) => existsSync(path));

function png(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'Helvetica Neue',
    },
    fitTo: { mode: 'width', value: width },
  });
  return resvg.render().asPng();
}

/** The asset with its parts' boxes (magenta), its focal box (green) and the words' safe area (blue) drawn on. */
function withBoxes(asset: ShotSvgAssetDto, shape: FilmShape): string {
  const { text } = frameOf(shape);
  const rects = Object.entries(asset.parts)
    .map(
      ([, part]) =>
        `<rect x="${part.box[0]}" y="${part.box[1]}" width="${part.box[2]}" height="${part.box[3]}" fill="none" stroke="#FF00AA" stroke-width="1.5" opacity="0.8"/>`,
    )
    .join('');
  const focal = asset.focal
    ? `<rect x="${asset.focal[0]}" y="${asset.focal[1]}" width="${asset.focal[2]}" height="${asset.focal[3]}" fill="none" stroke="#00AA44" stroke-width="3" stroke-dasharray="14 8"/>`
    : '';
  const safe = `<rect x="${text.x0}" y="${text.y0}" width="${text.x1 - text.x0}" height="${text.y1 - text.y0}" fill="none" stroke="#2266FF" stroke-width="2" stroke-dasharray="6 6"/>`;
  return asset.svg.replace(/<\/svg>$/, `${rects}${focal}${safe}</svg>`);
}

function stills(dir: string, only: string | null, boxes: boolean): void {
  mkdirSync(dir, { recursive: true });
  const looks: [string, ShotLookDto][] = [
    ['light', LIGHT_LOOK],
    ['dark', DARK_LOOK],
  ];
  let made = 0;
  for (const [kind, specs] of Object.entries(CHART_SPECS)) {
    if (only && kind !== only) continue;
    Object.entries(specs).forEach(([name, spec], i) => {
      for (const shape of ['wide', 'tall'] as FilmShape[])
        for (const [lookName, look] of looks) {
          if (lookName === 'dark' && i > 0) continue;
          const asset = chartAsset(kind, spec, look, shape);
          const file = `${kind}-${name}-${shape}${lookName === 'dark' ? '-dark' : ''}`;
          if (!asset) {
            console.log(`${file}: no asset`);
            continue;
          }
          const width = shape === 'wide' ? 1280 : 720;
          writeFileSync(join(dir, `${file}.png`), png(asset.svg, width));
          if (boxes)
            writeFileSync(
              join(dir, `${file}-boxes.png`),
              png(withBoxes(asset, shape), width),
            );
          made += 1;
          console.log(
            `${file}: ${Object.keys(asset.parts).length} parts, ${(asset.svg.length / 1024).toFixed(1)} KB`,
          );
        }
    });
  }
  console.log(`${made} stills in ${dir}`);
}

const stillsDir = flag('--stills');
if (stillsDir !== null)
  stills(stillsDir, flag('--kind'), args.includes('--boxes'));
