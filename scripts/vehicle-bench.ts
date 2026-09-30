/**
 * The vehicle bench (studio-interactions-plan I3): every kind of the
 * vehicle kit, from every side (side, three-quarter, front, back), in
 * three style packs (a present-day town anywhere, a West African town, an
 * ancient place), each row at one scale so its views compare; and a strip
 * of the city liveries (London's red bus and black cab, a New York cab)
 * and a car mirrored. One contact sheet, each drawing's SVG, and a report.
 *
 *   npm run vehicle:bench -- --out <dir> [--judge] [--kinds bicycle,taxi]
 *     [--pause <ms>] [--client <motion bench dir>]
 *
 * --kinds judges only those kinds; --pause waits between the judge's
 * looks, and before its one retry of a look it could not have (the
 * judge is sometimes too busy).
 * --judge asks the drawing judge (drawing_judge: Gemini) to look at each
 * kind once, from the side in its own place's colours: does it read as
 * that vehicle; about 0.4¢ a look. --client writes the drawings the
 * motion bench (/dev/motion, "vehicles") plays: vehicles.json.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiSdkLlmAdapter } from '../src/web/adapters/ai-sdk/ai-sdk-llm.adapter';
import {
  PACK_VEHICLES,
  VEHICLE_KIT,
  VEHICLE_VIEWS,
  drawVehicleKit,
  type VehicleDrawing,
  type VehicleKitKind,
  type VehicleLook,
} from '../src/business/domain/scene-vehicles';
import { KIT_M } from '../src/business/domain/scene-set-draw';
import { rasterise } from '../src/business/domain/scene-raster';
import {
  verdictScore,
  type DrawingVerdict,
} from '../src/business/domain/drawing-score';
import { costOf } from '../src/business/domain/cost';
import type { StylePackId } from '../src/business/domain/scene-style-packs';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const PACKS: StylePackId[] = [
  'modern-town',
  'west-african-town',
  'ancient-near-east',
];
const CELL_W = 210;
const CELL_H = 150;
const LABEL_W = 170;
const HEAD = 96;
const GAP = 16;
/** Each kind's own place, for the judge's look: where it is at home. */
const HOME: Record<VehicleKitKind, StylePackId> = {
  bicycle: 'modern-town',
  motorbike: 'west-african-town',
  car: 'modern-town',
  taxi: 'modern-town',
  van: 'modern-town',
  truck: 'modern-town',
  bus: 'modern-town',
  danfo: 'west-african-town',
  handcart: 'modern-town',
  'animal-cart': 'ancient-near-east',
  wheelbarrow: 'modern-town',
  'rowing-boat': 'modern-town',
  canoe: 'west-african-town',
  chariot: 'ancient-near-east',
};
const WORDS: Record<VehicleKitKind, string> = {
  bicycle: 'a bicycle',
  motorbike: 'a motorbike (an okada)',
  car: 'a car',
  taxi: 'a taxi',
  van: 'a van',
  truck: 'a truck (a lorry)',
  bus: 'a bus',
  danfo: 'a danfo (a Lagos minibus, yellow with black stripes)',
  handcart: 'a hand-pushed cart',
  'animal-cart': 'a donkey cart (the cart alone, its shafts empty)',
  wheelbarrow: 'a wheelbarrow',
  'rowing-boat': 'a rowing boat with its oars',
  canoe: 'a canoe',
  chariot: 'an ancient chariot (the chariot alone, its pole empty)',
};

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A drawing placed in a box, at `scale` of its units to the sheet's, its ground on the box's foot. */
function placed(
  drawing: VehicleDrawing,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
): string {
  const [vx, vy, vw, vh] = drawing.viewBox;
  const inner = drawing.svg
    .replace(/^<svg[^>]*>/u, '')
    .replace(/<\/svg>$/u, '');
  const dw = vw * scale;
  const dh = vh * scale;
  const left = x + (w - dw) / 2;
  const top = y + h - 10 - dh;
  // Lights on, where the drawing has them, so they can be seen: no.
  return `<svg x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="visible">${inner}</svg>`;
}

async function main(): Promise<void> {
  const out = resolve(
    flag('--out') ??
      join('scene-out', 'vehicle-bench', new Date().toISOString().slice(0, 16)),
  );
  mkdirSync(out, { recursive: true });
  const judging = args.includes('--judge');
  const report: Record<string, unknown>[] = [];
  const cols = PACKS.length * VEHICLE_VIEWS.length;
  const width = LABEL_W + cols * CELL_W + (PACKS.length - 1) * GAP + 20;
  const rows = VEHICLE_KIT.length + 1;
  const height = HEAD + rows * CELL_H + 40;
  const parts: string[] = [
    `<text x="20" y="34" font-size="24" font-family="Liberation Sans" fill="#222">The vehicle kit (studio-interactions-plan I3): every kind × side, three-quarter, front, back × three packs</text>`,
    `<text x="20" y="58" font-size="14" font-family="Liberation Sans" fill="#666">each row at one scale; a cell greyed is a kind its pack does not have (drawn only when a story names it); the bar is a metre</text>`,
  ];
  PACKS.forEach((pack, p) => {
    const x = LABEL_W + p * (VEHICLE_VIEWS.length * CELL_W + GAP);
    parts.push(
      `<text x="${x + 4}" y="${HEAD - 22}" font-size="17" font-family="Liberation Sans" font-weight="bold" fill="#333">${pack}</text>`,
    );
    VEHICLE_VIEWS.forEach((view, v) =>
      parts.push(
        `<text x="${x + v * CELL_W + CELL_W / 2}" y="${HEAD - 4}" font-size="13" text-anchor="middle" font-family="Liberation Sans" fill="#777">${view}</text>`,
      ),
    );
  });
  const drawn: Record<string, VehicleDrawing> = {};
  VEHICLE_KIT.forEach((kind, row) => {
    const y = HEAD + row * CELL_H;
    const all = PACKS.flatMap((pack) =>
      VEHICLE_VIEWS.map((view) => ({
        pack,
        view,
        drawing: drawVehicleKit(kind, { view, pack }),
      })),
    );
    // One scale for the row: its largest fits its cell.
    const scale = Math.min(
      ...all.map(({ drawing: d }) =>
        Math.min((CELL_W - 16) / d.viewBox[2], (CELL_H - 22) / d.viewBox[3]),
      ),
    );
    const side = all.find((one) => one.view === 'side')!.drawing;
    parts.push(
      `<rect x="0" y="${y}" width="${width}" height="${CELL_H}" fill="${row % 2 ? '#efebe3' : '#f7f4ee'}"/>`,
      `<text x="20" y="${y + 36}" font-size="17" font-family="Liberation Sans" font-weight="bold" fill="#222">${esc(kind)}</text>`,
      `<text x="20" y="${y + 56}" font-size="12" font-family="Liberation Sans" fill="#666">${side.size.long} × ${side.size.wide} × ${side.size.high} m</text>`,
      `<text x="20" y="${y + 72}" font-size="12" font-family="Liberation Sans" fill="#666">seats: ${esc((side.affordances.seats ?? []).map((s) => s.id).join(', ') || '—')}</text>`,
      `<text x="20" y="${y + 88}" font-size="12" font-family="Liberation Sans" fill="#666">${side.leaf ? (side.leaf.slide !== undefined ? 'sliding door' : 'hinged door') : 'no door'}${side.vehicle.water ? ' · floats' : ''}</text>`,
      `<rect x="20" y="${y + 100}" width="${(KIT_M * scale).toFixed(1)}" height="5" fill="#555"/>`,
    );
    for (const { pack, view, drawing } of all) {
      const p = PACKS.indexOf(pack);
      const v = VEHICLE_VIEWS.indexOf(view);
      const x =
        LABEL_W + p * (VEHICLE_VIEWS.length * CELL_W + GAP) + v * CELL_W;
      const home = PACK_VEHICLES[pack].kinds.includes(kind);
      parts.push(
        `<g opacity="${home ? 1 : 0.28}">${placed(drawing, x, y, CELL_W, CELL_H, scale)}</g>`,
      );
      drawn[`${kind}/${pack}/${view}`] = drawing;
    }
  });
  // The liveries, named only: London's, New York's; and a car facing left.
  const extras: [string, VehicleKitKind, VehicleLook][] = [
    ['London bus', 'bus', { livery: 'london', pack: 'western-city' }],
    [
      'London bus 3q',
      'bus',
      { livery: 'london', pack: 'western-city', view: '3q' },
    ],
    ['London cab', 'taxi', { livery: 'london', pack: 'western-city' }],
    [
      'London cab 3q',
      'taxi',
      { livery: 'london', pack: 'western-city', view: '3q' },
    ],
    ['New York cab', 'taxi', { livery: 'new-york', pack: 'western-city' }],
    ['western-city bus', 'bus', { pack: 'western-city' }],
    ['car, facing left', 'car', { facing: -1, pack: 'modern-town' }],
    [
      'car 3q, facing left',
      'car',
      { facing: -1, view: '3q', pack: 'modern-town' },
    ],
    ['a red bicycle', 'bicycle', { name: 'the red bicycle', view: '3q' }],
    [
      'a horse cart',
      'animal-cart',
      { name: 'the horse cart', pack: 'village-farm', view: '3q' },
    ],
    ['plain (scenery)', 'danfo', { plain: true, pack: 'west-african-town' }],
    ['rowing boat front', 'rowing-boat', { view: 'front', pack: 'nature' }],
  ];
  const y = HEAD + VEHICLE_KIT.length * CELL_H;
  parts.push(
    `<rect x="0" y="${y}" width="${width}" height="${CELL_H + 40}" fill="#e9e4da"/>`,
    `<text x="20" y="${y + 36}" font-size="17" font-family="Liberation Sans" font-weight="bold" fill="#222">named only</text>`,
  );
  extras.forEach(([label, kind, look], k) => {
    const d = drawVehicleKit(kind, look);
    const x = LABEL_W + k * CELL_W;
    const scale = Math.min(
      (CELL_W - 16) / d.viewBox[2],
      (CELL_H - 22) / d.viewBox[3],
    );
    parts.push(
      placed(d, x, y, CELL_W, CELL_H, scale),
      `<text x="${x + CELL_W / 2}" y="${y + CELL_H + 14}" font-size="12" text-anchor="middle" font-family="Liberation Sans" fill="#555">${esc(label)}</text>`,
    );
  });
  const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f4f1ea"/>${parts.join('')}</svg>`;
  writeFileSync(join(out, 'sheet.svg'), sheetSvg);
  writeFileSync(join(out, 'sheet.png'), await rasterise(sheetSvg, width));
  mkdirSync(join(out, 'svg'), { recursive: true });
  for (const [key, d] of Object.entries(drawn))
    writeFileSync(join(out, 'svg', `${key.replace(/\//g, '--')}.svg`), d.svg);

  // The judge, once a kind: from the side, in its own place's colours.
  let spent = 0;
  if (judging) {
    const llm = new AiSdkLlmAdapter(new ConfigService({ ...process.env }));
    const only = flag('--kinds')?.split(',');
    const pause = Number(flag('--pause') ?? 0);
    const wait = (ms: number) =>
      new Promise((done) => setTimeout(done, Math.max(0, ms)));
    for (const kind of VEHICLE_KIT.filter((k) => !only || only.includes(k))) {
      const d = drawVehicleKit(kind, { pack: HOME[kind] });
      const [vx, vy, vw, vh] = d.viewBox;
      const pad = Math.max(vw, vh) * 0.08;
      const framedSvg = d.svg
        .replace(
          /viewBox="[^"]*"/u,
          `viewBox="${vx - pad} ${vy - pad} ${vw + 2 * pad} ${vh + 2 * pad}"`,
        )
        .replace(
          /<g /u,
          `<rect x="${vx - pad}" y="${vy - pad}" width="${vw + 2 * pad}" height="${vh + 2 * pad}" fill="#ffffff" stroke="none"/><g `,
        );
      let verdict: DrawingVerdict | null = null;
      const png = await rasterise(framedSvg, 768);
      for (let attempt = 0; attempt < 2 && !verdict; attempt += 1) {
        if (attempt) await wait(pause * 3);
        try {
          const judged = await llm.drawingJudge({
            png,
            kind: 'thing',
            brief: `${WORDS[kind]}, drawn side on by code in a flat cartoon style. Does it read as ${WORDS[kind]}?`,
          });
          verdict = judged.value;
          spent += costOf({ task: 'drawing_judge', ...judged.usage }) ?? 0;
        } catch (error) {
          console.warn(
            `! ${kind}: the judge could not be asked: ${(error as Error).message}`,
          );
        }
      }
      await wait(pause);
      report.push({
        kind,
        pack: HOME[kind],
        score: verdict ? verdictScore(verdict) : null,
        verdict,
      });
      console.log(
        `${kind.padEnd(12)} ${verdict ? verdictScore(verdict).toFixed(2) : 'not judged'}`,
      );
    }
  }
  writeFileSync(
    join(out, 'report.json'),
    JSON.stringify(
      {
        judged: judging,
        spentUsd: Math.round(spent * 10000) / 10000,
        kinds: report,
      },
      null,
      2,
    ),
  );

  // The motion bench's drawings: each kind from each side, in a town.
  const client = flag('--client');
  if (client) {
    const vehicles: Record<string, Record<string, unknown>> = {};
    for (const kind of VEHICLE_KIT)
      for (const view of VEHICLE_VIEWS) {
        const d = drawVehicleKit(kind, {
          view,
          pack: HOME[kind],
        });
        vehicles[`${kind}:${view}`] = {
          svg: d.svg,
          viewBox: d.viewBox,
          ...(d.leaf ? { leaf: d.leaf } : {}),
          ...(d.opening ? { opening: d.opening } : {}),
          affordances: d.affordances,
          vehicle: d.vehicle,
          size: d.size,
        };
      }
    writeFileSync(
      join(resolve(client), 'vehicles.json'),
      JSON.stringify({ vehicles }),
    );
    console.log(`wrote ${join(resolve(client), 'vehicles.json')}`);
  }
  console.log(`sheet: ${join(out, 'sheet.png')}`);
}

void main();
