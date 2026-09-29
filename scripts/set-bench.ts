/**
 * The set bench (studio-scenery-plan L3): the twelve places of
 * src/business/domain/set-bench.ts, each laid out by hand and built by
 * code with no model asked, drawn flat (with two of the kit's people
 * standing where the action is, for scale) and as its layers seen
 * through a camera that has panned and pushed in, so the layers part as
 * the player parts them. One contact sheet of them all, each place's
 * pictures, and a report.
 *
 *   npm run set:bench -- --out <dir> [--only lagos-market,farm] [--judge] [--paint 3]
 *
 * --judge asks the drawing judge (drawing_judge: Gemini) to look at each
 * place once, all its layers as the player shows them and no one in it,
 * as a set painted for a show is looked at; about
 * 0.4¢ a look. --paint n asks the set painter (set_paint: DeepSeek) to lay
 * out the first n of lagos-market, moses-riverside and new-york-street
 * from their briefs, as a show's painter would, and builds those too:
 * the prompt's changes, checked by a real pass. Nothing is stored.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiSdkLlmAdapter } from '../src/web/adapters/ai-sdk/ai-sdk-llm.adapter';
import { SET_BENCH, type BenchPlace } from '../src/business/domain/set-bench';
import {
  SET_H,
  SET_W,
  buildSet,
  describeLayout,
  layoutBrief,
  layoutOf,
  type BuiltSet,
  type SetLayout,
} from '../src/business/domain/scene-set-layout';
import { drawExtra, extraFor } from '../src/business/domain/scene-figure';
import { FIGURE_INK, SET_UNIT_SHARE } from '../src/business/domain/scene-ink';
import { rasterise } from '../src/business/domain/scene-raster';
import {
  verdictScore,
  type DrawingVerdict,
} from '../src/business/domain/drawing-score';
import { costOf } from '../src/business/domain/cost';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

/** How wide each picture is drawn on the sheet, and for the judge. */
const PX = 800;
const JUDGE_PX = 768;
/** The camera the layered picture is seen through: panned this far right, pushed in this much. */
const PAN = 150;
const PUSH = 1.12;

/** Two of the kit's people where the action is, where people stand, for scale. */
function people(focal: number, world: BenchPlace['world']): string {
  const unit = SET_UNIT_SHARE * SET_H;
  const feet = (820 / 900) * SET_H;
  return [-1, 1]
    .map((side, k) => {
      const spec = extraFor(world, 'set-bench', k);
      const drawn = drawExtra(spec, { detail: 0, id: `p${k}` });
      const [bx, by, bw, bh] = drawn.viewBox;
      const x = focal * SET_W + side * 110;
      return `<svg x="${(x + bx * unit).toFixed(1)}" y="${(feet + by * unit).toFixed(1)}" width="${(bw * unit).toFixed(1)}" height="${(bh * unit).toFixed(1)}" viewBox="${bx} ${by} ${bw} ${bh}" overflow="visible"><g stroke="${FIGURE_INK}" stroke-width="2.6" stroke-linejoin="round">${drawn.legs}${drawn.upper}</g></svg>`;
    })
    .join('');
}

/** The flat picture with the people standing in it, before what stands before the camera. */
function flatWithPeople(
  built: BuiltSet,
  layout: SetLayout,
  world: BenchPlace['world'],
): string {
  const them = people(layout.focal?.x ?? 0.5, world);
  return built.svg.replace(/<\/g><\/svg>$/, `${them}</g></svg>`);
}

/** The layers as the camera sees them panned and pushed in: each moved by its own depth, the people on the floor's. */
function throughCamera(
  built: BuiltSet,
  layout: SetLayout,
  world: BenchPlace['world'],
  camera = { pan: PAN, push: PUSH, people: true },
): string {
  const cx = SET_W / 2;
  const cy = SET_H / 2;
  const inner = (svg: string) =>
    svg.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>$/, '');
  const moved = (depth: number, markup: string) => {
    const k = 1 + (camera.push - 1) * depth;
    return `<g transform="translate(${(cx - camera.pan * depth).toFixed(1)} ${cy}) scale(${k.toFixed(4)}) translate(${-cx} ${-cy})">${markup}</g>`;
  };
  const out: string[] = [];
  for (const layer of built.layered.layers) {
    out.push(moved(layer.depth, inner(layer.svg)));
    if (
      camera.people &&
      (layer.id === 'floor' ||
        (layer.id === 'stage' &&
          !built.layered.layers.some((one) => one.id === 'floor')))
    )
      out.push(moved(1, people(layout.focal?.x ?? 0.5, world)));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SET_W} ${SET_H}"><rect width="${SET_W}" height="${SET_H}" fill="#f4f1ea"/>${out.join('')}</svg>`;
}

async function compose(
  width: number,
  height: number,
  items: { png: Buffer; x: number; y: number; w: number; h: number }[],
  extra: string,
): Promise<Buffer> {
  const images = items
    .map(
      (one) =>
        `<image x="${one.x.toFixed(1)}" y="${one.y.toFixed(1)}" width="${one.w.toFixed(1)}" height="${one.h.toFixed(1)}" href="data:image/png;base64,${one.png.toString('base64')}"/>`,
    )
    .join('');
  return rasterise(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f4f1ea"/>${images}${extra}</svg>`,
    width,
  );
}

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Row {
  id: string;
  label: string;
  flat: Buffer;
  layered: Buffer;
  verdict?: DrawingVerdict | null;
}

async function main(): Promise<void> {
  const out = resolve(
    flag('--out') ??
      join('scene-out', 'set-bench', new Date().toISOString().slice(0, 16)),
  );
  mkdirSync(out, { recursive: true });
  const only = (flag('--only') ?? '')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean);
  const bench = SET_BENCH.filter(
    (one) => !only.length || only.includes(one.id),
  );
  const llm = new AiSdkLlmAdapter(new ConfigService({ ...process.env }));
  const judging = args.includes('--judge');
  const paint = Number(flag('--paint') ?? 0);
  const rows: Row[] = [];
  const report: Record<string, unknown>[] = [];
  let spent = 0;

  const draw = async (
    id: string,
    label: string,
    one: BenchPlace,
    layout: SetLayout,
  ): Promise<Row> => {
    const built = buildSet(layout, one.place);
    const flatSvg = flatWithPeople(built, layout, one.world);
    const [flat, layered] = await Promise.all([
      rasterise(flatSvg, PX),
      rasterise(throughCamera(built, layout, one.world), PX),
    ]);
    mkdirSync(join(out, id), { recursive: true });
    writeFileSync(join(out, id, 'flat.png'), flat);
    writeFileSync(join(out, id, 'layered.png'), layered);
    writeFileSync(join(out, id, 'set.svg'), built.svg);
    writeFileSync(
      join(out, id, 'layout.json'),
      JSON.stringify(layout, null, 2),
    );
    let verdict: DrawingVerdict | null | undefined;
    if (judging) {
      try {
        const judged = await llm.drawingJudge({
          // The place as the player shows it, all its layers, and no one in it.
          png: await rasterise(
            throughCamera(built, layout, one.world, {
              pan: 0,
              push: 1,
              people: false,
            }),
            JUDGE_PX,
          ),
          kind: 'place',
          brief: `${one.place.name}: ${one.brief}`,
        });
        verdict = judged.value;
        spent += costOf({ task: 'drawing_judge', ...judged.usage }) ?? 0;
      } catch (error) {
        console.warn(
          `! ${id}: the judge could not be asked: ${(error as Error).message}`,
        );
        verdict = null;
      }
    }
    const elements = built.layered.layers.reduce(
      (sum, layer) => sum + (layer.svg.match(/<[a-zA-Z]/g) ?? []).length,
      0,
    );
    report.push({
      id,
      label,
      style: layout.style ?? null,
      layout: describeLayout(layout),
      layers: built.layered.layers.map((layer) => `${layer.id} ${layer.depth}`),
      elements,
      pieces: built.placed.length,
      clutter: built.placed.filter((p) => p.clutter).length,
      fore: built.layered.fore.length,
      notes: built.notes,
      ...(verdict !== undefined
        ? { score: verdict ? verdictScore(verdict) : null, verdict }
        : {}),
    });
    console.log(
      `${id.padEnd(20)} ${String(layout.style).padEnd(18)} ${String(built.placed.length).padStart(3)} pieces ${String(elements).padStart(5)} shapes${verdict ? `  ${verdictScore(verdict)}/10 ${verdict.sees}` : ''}`,
    );
    for (const note of built.notes) console.log(`    ${note}`);
    return {
      id,
      label,
      flat,
      layered,
      ...(verdict !== undefined ? { verdict } : {}),
    };
  };

  for (const one of bench)
    rows.push(
      await draw(
        one.id,
        `${one.place.name} (${one.id})`,
        one,
        layoutOf(one.layout, one.place, one.world),
      ),
    );

  // A real painter's pass: the brief as a show sends it, laid out by the set painter.
  const painted = ['lagos-market', 'moses-riverside', 'new-york-street']
    .map((id) => SET_BENCH.find((one) => one.id === id)!)
    .slice(0, paint);
  for (const one of painted) {
    const brief = layoutBrief(one.place, 'The set bench', one.world);
    try {
      const made = await llm.setLayout({ brief });
      spent += costOf({ task: 'set_paint', ...made.usage }) ?? 0;
      writeFileSync(
        join(out, `${one.id}.painter.json`),
        JSON.stringify(
          { brief, reply: made.value, model: made.usage.model },
          null,
          2,
        ),
      );
      const layout = layoutOf(made.value, one.place, one.world);
      rows.push(
        await draw(
          `${one.id}-painter`,
          `${one.place.name}: the painter's own layout`,
          one,
          layout,
        ),
      );
    } catch (error) {
      console.warn(
        `! ${one.id}: the painter could not lay it out: ${(error as Error).message}`,
      );
    }
  }

  // The contact sheet: each place flat, and through the camera.
  const CELL_W = 640;
  const CELL_H = 360;
  const HEAD = 34;
  const width = CELL_W * 2 + 60;
  const height = 90 + rows.length * (CELL_H + HEAD + 16);
  const texts: string[] = [
    `<text x="20" y="40" font-size="26" font-weight="700" fill="#2d2a32">Set bench: richer scenery (L3)</text>`,
    `<text x="20" y="68" font-size="15" fill="#666">flat, with two of the kit's people for scale · layers through a camera panned ${PAN} and pushed in ${Math.round((PUSH - 1) * 100)}%${judging ? ' · judged by the drawing judge' : ''}</text>`,
  ];
  const items: Parameters<typeof compose>[2] = [];
  rows.forEach((row, k) => {
    const y = 90 + k * (CELL_H + HEAD + 16);
    const score = row.verdict
      ? ` · ${verdictScore(row.verdict)}/10: ${row.verdict.sees}`
      : row.verdict === null
        ? ' · not judged'
        : '';
    texts.push(
      `<text x="20" y="${y + 22}" font-size="16" font-weight="700" fill="#2d2a32">${esc(`${row.label}${score}`.slice(0, 150))}</text>`,
    );
    items.push({ png: row.flat, x: 20, y: y + HEAD, w: CELL_W, h: CELL_H });
    items.push({
      png: row.layered,
      x: 40 + CELL_W,
      y: y + HEAD,
      w: CELL_W,
      h: CELL_H,
    });
  });
  const sheet = await compose(width, height, items, texts.join(''));
  writeFileSync(join(out, 'sheet.png'), sheet);
  writeFileSync(
    join(out, 'report.json'),
    JSON.stringify(
      { at: new Date().toISOString(), spentUsd: spent, places: report },
      null,
      2,
    ),
  );
  const scores = report
    .map((one) => one.score)
    .filter((n): n is number => typeof n === 'number');
  if (scores.length)
    console.log(
      `\njudged ${scores.length}: mean ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}, lowest ${Math.min(...scores)}`,
    );
  console.log(
    `spent ${(spent * 100).toFixed(2)}¢\n→ ${join(out, 'sheet.png')}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
