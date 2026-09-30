/**
 * The looks' contact sheet (studio-explainer-plan, Ask 2): explainer
 * scenes as stills in every theme, recoloured as the player recolours them
 * (scene-themes' themedSvg) and laid out as the card's still is (stepSvg),
 * with no model called. Each scene's fullest step, on the wide stage; and
 * for the first two scenes, the look code chooses for them beside its dark
 * twin, as a viewer's "Dark picture" shows it.
 *
 *   npm run theme:bench -- [--out <dir>] <scene.json> ...
 *   (SCENE_OUT=<a scene-out dir> for the two fixtures made by scene:page)
 *
 * A chart made before the chart palette (one blue) is drawn again from its
 * own numbers, as the next make draws it. Writes one PNG a still, the
 * sheet (sheet.png) and index.html to the out dir (scene-out/themes by
 * default).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { SceneDto } from '../src/contracts';
import { drawByCode } from '../src/business/domain/scene-code';
import {
  fullestStep,
  hiddenAt,
  stepSvg,
} from '../src/business/domain/scene-compose';
import { rasterise } from '../src/business/domain/scene-raster';
import {
  THEMES,
  THEME_IDS,
  themedSvg,
  type ExplainerTheme,
  type ThemeId,
} from '../src/business/domain/scene-themes';
import { allThemeProblems } from '../src/business/domain/theme-check';
import { themeFor } from '../src/business/domain/studio/studio-look';
import { AUDIENCE_BAND } from '../src/business/domain/studio/studio-audience';
import type { StudioAudience } from '../src/business/domain/studio/studio';

/** How wide each still is, in pixels. */
const STILL_PX = 480;

/** Each fixture: its scene, what it is about and whom for (the look code chooses from them). */
interface Fixture {
  path: string;
  subject: string;
  audience: StudioAudience;
  maths?: boolean;
}

const DEV = join(__dirname, '..', '..', 'easyread', 'public', 'dev-scenes');
/** Where local pages were made (scene:page keeps them): SCENE_OUT, or this checkout's scene-out. */
const OUT = process.env.SCENE_OUT ?? join(__dirname, '..', 'scene-out');
/** Six lessons unlike each other: numbers, a body, a child's sums, history, a chart, the very small. */
const FIXTURES: Fixture[] = [
  {
    path: join(DEV, 'primary-p1', 'scene.json'),
    subject: 'maths: adding and times tables',
    audience: 'children',
    maths: true,
  },
  {
    path: join(DEV, 'hemo-p1', 'scene.json'),
    subject: 'medicine: blood disorders',
    audience: 'adults',
  },
  {
    path: join(DEV, 'design-p37', 'scene.json'),
    subject: 'computing: system design',
    audience: 'adults',
  },
  {
    path: join(DEV, 'southpole-p2', 'scene.json'),
    subject: 'history: the race to the South Pole',
    audience: 'teens',
  },
  {
    path: join(OUT, '01a0d18b-7d52-7510-a814-b148dea8ffd3-p3', 'scene.json'),
    subject: 'geography: water at home',
    audience: 'teens',
  },
  {
    path: join(OUT, '01a0d2ed-8985-7d36-9e2f-263bc8ade95d-p6', 'scene.json'),
    subject: 'biology: parasites in the blood and cells',
    audience: 'adults',
  },
];

/** A chart's numbers, read back from its own drawing: each bar's name and the value written on it. */
function chartOf(svg: string, parts: Record<string, string>) {
  const unit = /font-weight="700"[^>]*>-?[\d.,]+\s*(%|[^<]*)</.exec(svg)?.[1];
  const bars = Object.entries(parts).flatMap(([label, id]) => {
    const at = svg.indexOf(`id="${id}"`);
    const value =
      at < 0 ? null : /font-weight="700"[^>]*>(-?[\d.,]+)/.exec(svg.slice(at));
    return value ? [{ label, value: Number(value[1].replace(/,/g, '')) }] : [];
  });
  return { kind: 'bar' as const, unit: unit?.trim() || null, bars };
}

/** The scene with any chart made before the palette drawn again from its own numbers. */
async function withCharts(scene: SceneDto): Promise<SceneDto> {
  const things = await Promise.all(
    scene.things.map(async (thing) => {
      if (
        thing.kind !== 'drawing' ||
        thing.source !== 'chart' ||
        !thing.svg.includes('#3D8FD1')
      )
        return thing;
      const chart = chartOf(thing.svg, thing.parts);
      if (chart.bars.length < 2) return thing;
      const drawn = await drawByCode({
        id: thing.id,
        kind: 'chart',
        name: thing.caption ?? thing.id,
        chart,
      });
      return { ...thing, svg: drawn.svg };
    }),
  );
  return { ...scene, things };
}

/** The scene's fullest step as a still in a theme, as a PNG. */
async function stillIn(
  scene: SceneDto,
  theme: ExplainerTheme,
): Promise<Buffer> {
  const staging = 'wide';
  const k = fullestStep(scene);
  const set = scene.stagings[staging];
  const scale = STILL_PX / set.w;
  const until = (scene.steps[k + 1]?.atMs ?? scene.durationMs) - 1;
  const pngs = new Map<string, Buffer>();
  for (const id of scene.steps[k].show) {
    const thing = scene.things.find((t) => t.id === id);
    const place = set.places[k]?.[id];
    if (thing?.kind !== 'drawing' || !place) continue;
    const hidden = hiddenAt(scene, thing, until);
    const themed = themedSvg(thing, theme);
    const svg = hidden.length
      ? themed.replace(
          /(<svg\b[^>]*>)/i,
          `$1<style>${hidden.map((h) => `[id="${h.replace(/"/g, '')}"]`).join(',')}{display:none}</style>`,
        )
      : themed;
    try {
      pngs.set(
        id,
        await rasterise(svg, Math.max(48, Math.round(place.w * scale * 2))),
      );
    } catch {
      // Left out of the still.
    }
  }
  return rasterise(stepSvg(scene, pngs, staging, k, theme), STILL_PX * 2);
}

/** A title in at most two short lines, for the sheet's margin. */
const titleLines = (title: string): string[] => {
  const words = title.replace(/:.*$/, '').split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length > 18) lines.push(word);
    else lines[lines.length - 1] = last ? `${last} ${word}` : word;
  }
  return lines.length > 2 ? [lines[0], `${lines[1]}…`] : lines;
};

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const out = resolve(at >= 0 ? args[at + 1] : join('scene-out', 'themes'));
  const named = args.filter(
    (a, i) => !a.startsWith('--') && args[i - 1] !== '--out',
  );
  const fixtures: Fixture[] = named.length
    ? named.map((path) => ({ path, subject: '', audience: 'adults' }))
    : FIXTURES;
  mkdirSync(out, { recursive: true });
  const problems = allThemeProblems();
  if (problems.length) console.warn(problems.join('\n'));

  type Cell = { file: string; theme: ThemeId; note?: string };
  const rows: { title: string; chosen: ThemeId; cells: Cell[] }[] = [];
  for (const fixture of fixtures) {
    const scene = await withCharts(
      JSON.parse(readFileSync(fixture.path, 'utf8')) as SceneDto,
    );
    const name = basename(dirname(fixture.path));
    const chosen = themeFor({
      subject: fixture.subject || scene.title,
      band: AUDIENCE_BAND[fixture.audience],
      maths: fixture.maths ?? false,
    });
    const cells: Cell[] = [];
    for (const id of THEME_IDS) {
      const file = `${name}-${id}.png`;
      writeFileSync(join(out, file), await stillIn(scene, THEMES[id]));
      cells.push({ file, theme: id });
    }
    rows.push({ title: scene.title, chosen, cells });
    console.log(`${name}: ${scene.title} (code chooses ${chosen})`);
  }
  // The look code chooses for the first two, beside its dark twin.
  const twins = rows.slice(0, 2).map((row) => {
    const light = THEMES[row.chosen].dark
      ? THEMES[row.chosen].twin
      : row.chosen;
    const dark = THEMES[light].twin;
    const find = (id: ThemeId) => row.cells.find((c) => c.theme === id)!;
    return {
      title: row.title,
      cells: [
        { ...find(light), note: 'as made' },
        { ...find(dark), note: 'Dark picture on' },
      ],
    };
  });

  // The sheet, as one picture: a row a scene, a column a theme.
  const W = STILL_PX;
  const H = Math.round((STILL_PX * 9) / 16);
  const LEFT = 220;
  const TOP = 60;
  const GAP = 14;
  const rowH = H + GAP + 22;
  const parts: string[] = [];
  THEME_IDS.forEach((id, j) =>
    parts.push(
      `<text x="${LEFT + j * (W + GAP) + W / 2}" y="${TOP - 18}" font-size="26" font-weight="700" text-anchor="middle" fill="#1F2A37">${THEMES[id].name}${THEMES[id].dark ? ' (dark)' : ''}</text>`,
    ),
  );
  const image = (file: string, x: number, y: number) =>
    `<image x="${x}" y="${y}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${readFileSync(join(out, file)).toString('base64')}"/>`;
  rows.forEach((row, i) => {
    const y = TOP + i * rowH;
    parts.push(
      ...titleLines(row.title).map(
        (line, n) =>
          `<text x="16" y="${y + H / 2 - 20 + n * 24}" font-size="19" font-weight="700" fill="#1F2A37">${escape(line)}</text>`,
      ),
      `<text x="16" y="${y + H / 2 + 36}" font-size="17" fill="#5B6675">code chooses ${escape(THEMES[row.chosen].name)}</text>`,
    );
    row.cells.forEach((cell, j) => {
      const x = LEFT + j * (W + GAP);
      parts.push(image(cell.file, x, y));
      if (cell.theme === row.chosen)
        parts.push(
          `<rect x="${x - 4}" y="${y - 4}" width="${W + 8}" height="${H + 8}" rx="6" fill="none" stroke="#E0663A" stroke-width="4"/>`,
        );
    });
  });
  const twinTop = TOP + rows.length * rowH + 50;
  parts.push(
    `<text x="16" y="${twinTop - 20}" font-size="26" font-weight="700" fill="#1F2A37">Dark twins: the look as made, and as "Dark picture" shows it</text>`,
  );
  twins.forEach((row, i) => {
    const x0 = LEFT + i * 2 * (W + GAP) + i * 40;
    row.cells.forEach((cell, j) => {
      const x = x0 + j * (W + GAP);
      parts.push(
        image(cell.file, x, twinTop),
        `<text x="${x + W / 2}" y="${twinTop + H + 26}" font-size="18" text-anchor="middle" fill="#1F2A37">${escape(row.title.slice(0, 28))}: ${THEMES[cell.theme].name}, ${cell.note}</text>`,
      );
    });
  });
  const sheetW = LEFT + THEME_IDS.length * (W + GAP) + 20;
  const sheetH = twinTop + H + 60;
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" font-family="Liberation Sans, sans-serif"><rect width="${sheetW}" height="${sheetH}" fill="#FFFFFF"/>${parts.join('')}</svg>`;
  writeFileSync(join(out, 'sheet.png'), await rasterise(sheet, sheetW));

  const cell = (c: Cell, chosen?: ThemeId) =>
    `<figure${c.theme === chosen ? ' class="chosen"' : ''}><img src="${c.file}" alt=""><figcaption>${THEMES[c.theme].name}${c.note ? `: ${c.note}` : ''}</figcaption></figure>`;
  writeFileSync(
    join(out, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Explainer looks</title><style>body{font:14px system-ui;margin:24px;color:#1F2A37}section{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:8px 0 24px}figure{margin:0}img{width:100%;border-radius:6px;display:block}.chosen img{outline:3px solid #E0663A;outline-offset:2px}figcaption{font-size:12px;margin-top:4px}.twins{grid-template-columns:repeat(4,1fr)}</style>` +
      `<h1>Explainer looks: ${rows.length} scenes in ${THEME_IDS.length} themes</h1><p>Recoloured as the player recolours them; the look code chooses for each is outlined. ${problems.length ? `Theme problems: ${escape(problems.join('; '))}` : 'Every theme passes its contrast and colour-blind checks.'}</p>` +
      rows
        .map(
          (row) =>
            `<h2>${escape(row.title)} <small>(code chooses ${THEMES[row.chosen].name})</small></h2><section>${row.cells.map((c) => cell(c, row.chosen)).join('')}</section>`,
        )
        .join('') +
      `<h2>Dark twins: as made, and with "Dark picture" on</h2><section class="twins">${twins.flatMap((row) => row.cells.map((c) => cell(c))).join('')}</section>`,
  );
  console.log(`wrote ${join(out, 'sheet.png')} and ${join(out, 'index.html')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
