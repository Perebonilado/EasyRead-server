/**
 * The yardstick: every kept page put together again, with no model
 * called, and measured the way a learner meets it: what the frame audit
 * finds on it, the smallest words on its stage in pixels at a phone's
 * width, the reading pane's and a desktop's, and, with --stills, a still
 * of every step. With --against, an earlier run's numbers beside each
 * page's, so a change that makes any page worse shows.
 *
 *   SCENE_KEEP_PARTS=<dir> npm run scene:page -- <documentId> <page>   (or scene:try)
 *   npm run scene:bench -- <parts dir> [--out <dir>] [--against <report.json>] [--stills]
 *
 * Writes report.json and index.html to the out dir (scene-out/bench by
 * default). A page passes when the audit finds nothing and no words are
 * set smaller than 14px on a 560px pane.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { SceneDto, SceneTiming } from '../src/contracts';
import { drawByCode } from '../src/business/domain/scene-code';
import {
  composeScene,
  hiddenAt,
  stepSvg,
} from '../src/business/domain/scene-compose';
import { rasterise } from '../src/business/domain/scene-raster';
import {
  SCENE_GENERATOR_VERSION,
  type SceneScript,
} from '../src/business/domain/scene-script';
import type { GatedDrawing } from '../src/business/domain/scene-svg';
import type { TimedBeat } from '../src/business/domain/scene-timing';

/** What the processor keeps when SCENE_KEEP_PARTS is set. */
interface Parts {
  script: SceneScript;
  drawings: [string, GatedDrawing | null][];
  beats: TimedBeat[];
  durationMs: number;
  timing: SceneTiming;
}

/** The widths the stage is read at: a phone and the reading pane (the box), a desktop (wide). */
const WIDTHS = [
  { px: 390, staging: 'box' },
  { px: 560, staging: 'box' },
  { px: 1440, staging: 'wide' },
] as const;
/** The smallest words may be on the pane, in pixels. */
const PASS_PX = 14;
const STILL_PX = 360;

interface PageReport {
  page: string;
  title: string;
  steps: number;
  timing: SceneTiming;
  found: { box: number; wide: number; what: string[] };
  /** The smallest words, in pixels, at each width, and what they are. */
  smallest: { px: number; width: number; what: string }[];
  passes: boolean;
  stills: string[];
}

/** Every run of words on a staging's stage: its size in stage units, and what it is. */
function sizesOf(scene: SceneDto, staging: 'box' | 'wide') {
  const out: { size: number; what: string }[] = [];
  const set = scene.stagings[staging];
  set.places.forEach((places, k) => {
    for (const [id, place] of Object.entries(places)) {
      if (place.caption)
        out.push({
          size: place.caption.size,
          what: `${id} caption, step ${k + 1}`,
        });
      if (place.size)
        out.push({ size: place.size, what: `${id} words, step ${k + 1}` });
      for (const label of place.labels ?? [])
        out.push({
          size: label.size,
          what: `${id} label "${label.lines.join(' ')}", step ${k + 1}`,
        });
    }
    for (const [id, pill] of Object.entries(set.pills?.[k] ?? {}))
      if (pill)
        out.push({ size: pill.size, what: `arrow ${id} label, step ${k + 1}` });
  });
  for (const [id, bubble] of Object.entries(set.bubbles ?? {}))
    if (bubble) out.push({ size: bubble.size, what: `bubble ${id}` });
  return out;
}

/** Every step of a staging as a PNG, the drawings as they stand at each step's end. */
async function stillsOf(
  scene: SceneDto,
  staging: 'box' | 'wide',
): Promise<Buffer[]> {
  const set = scene.stagings[staging];
  const scale = STILL_PX / set.w;
  const out: Buffer[] = [];
  for (let k = 0; k < scene.steps.length; k += 1) {
    const until = (scene.steps[k + 1]?.atMs ?? scene.durationMs) - 1;
    const pngs = new Map<string, Buffer>();
    for (const id of scene.steps[k].show) {
      const thing = scene.things.find((t) => t.id === id);
      const place = set.places[k]?.[id];
      if (thing?.kind !== 'drawing' || !place) continue;
      const hidden = hiddenAt(scene, thing, until);
      const svg = hidden.length
        ? thing.svg.replace(
            /(<svg\b[^>]*>)/i,
            `$1<style>${hidden.map((h) => `[id="${h.replace(/"/g, '')}"]`).join(',')}{display:none}</style>`,
          )
        : thing.svg;
      try {
        pngs.set(
          id,
          await rasterise(svg, Math.max(48, Math.round(place.w * scale * 2))),
        );
      } catch {
        // Left out of the still.
      }
    }
    out.push(await rasterise(stepSvg(scene, pngs, staging, k), STILL_PX * 2));
  }
  return out;
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const dir = args.find(
    (a, i) =>
      !a.startsWith('--') &&
      !args[i - 1]?.startsWith('--') &&
      args[i - 1] !== '--against',
  );
  if (!dir) {
    console.error(
      'npm run scene:bench -- <parts dir> [--out <dir>] [--against <report.json>] [--stills]',
    );
    process.exit(2);
  }
  const out = resolve(option('--out') ?? join('scene-out', 'bench'));
  mkdirSync(out, { recursive: true });
  const before = option('--against');
  const earlier = new Map<string, PageReport>(
    before && existsSync(before)
      ? (
          JSON.parse(readFileSync(before, 'utf8')) as { pages: PageReport[] }
        ).pages.map((p) => [p.page, p])
      : [],
  );
  const stills = args.includes('--stills');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('-parts.json'))
    .sort();
  const pages: PageReport[] = [];
  for (const file of files) {
    const page = basename(file, '-parts.json');
    const parts = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Parts;
    const drawings = new Map(parts.drawings);
    for (const thing of parts.script.cast)
      if (
        thing.kind === 'math' ||
        thing.kind === 'plot' ||
        thing.kind === 'quote'
      )
        drawings.set(thing.id, await drawByCode(thing).catch(() => null));
    const { scene, audit } = composeScene({
      script: parts.script,
      drawings,
      beats: parts.beats,
      durationMs: parts.durationMs,
      timing: parts.timing,
      generator: SCENE_GENERATOR_VERSION,
    });
    const smallest = WIDTHS.map(({ px, staging }) => {
      const sizes = sizesOf(scene, staging);
      const least = sizes.reduce(
        (a, b) => (b.size < a.size ? b : a),
        sizes[0] ?? { size: Infinity, what: 'no words' },
      );
      return {
        width: px,
        px:
          Math.round(((least.size * px) / scene.stagings[staging].w) * 10) / 10,
        what: least.what,
      };
    });
    const found = [...audit.box.flat(), ...audit.wide.flat()].map(
      (c) => `${c.kind} ${c.a} / ${c.b}`,
    );
    const report: PageReport = {
      page,
      title: scene.title,
      steps: scene.steps.length,
      timing: scene.timing,
      found: {
        box: audit.box.flat().length,
        wide: audit.wide.flat().length,
        what: [...new Set(found)],
      },
      smallest,
      passes:
        !found.length &&
        (smallest.find((s) => s.width === 560)?.px ?? 0) >= PASS_PX,
      stills: [],
    };
    if (stills) {
      mkdirSync(join(out, page), { recursive: true });
      const made = await stillsOf(scene, 'box');
      made.forEach((png, k) => {
        const name = `${page}/box-${k + 1}.png`;
        writeFileSync(join(out, name), png);
        report.stills.push(name);
      });
    }
    pages.push(report);
    const was = earlier.get(page);
    console.log(
      `${report.passes ? 'pass' : 'FAIL'} ${page}: audit ${report.found.box}+${report.found.wide}${was ? ` (was ${was.found.box}+${was.found.wide})` : ''}; smallest ${smallest.map((s) => `${s.px}px@${s.width}`).join(' ')}`,
    );
  }
  writeFileSync(
    join(out, 'report.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        generator: SCENE_GENERATOR_VERSION,
        pages,
      },
      null,
      2,
    ),
  );
  const row = (p: PageReport) => {
    const was = earlier.get(p.page);
    const worse =
      was && p.found.box + p.found.wide > was.found.box + was.found.wide;
    return `<tr class="${p.passes ? 'pass' : 'fail'}${worse ? ' worse' : ''}">
      <td><b>${escape(p.page)}</b><br><small>${escape(p.title)}</small></td>
      <td>${p.found.box} + ${p.found.wide}${was ? `<br><small>was ${was.found.box} + ${was.found.wide}</small>` : ''}${p.found.what.length ? `<br><small>${p.found.what.map(escape).join('<br>')}</small>` : ''}</td>
      ${p.smallest.map((s) => `<td class="${s.width === 560 && s.px < PASS_PX ? 'small' : ''}">${s.px}px<br><small>${escape(s.what)}</small></td>`).join('')}
      <td>${p.steps} · ${p.timing}</td>
    </tr>
    ${p.stills.length ? `<tr><td colspan="6" class="stills">${p.stills.map((s) => `<img src="${s}" width="${STILL_PX / 2}">`).join('')}</td></tr>` : ''}`;
  };
  writeFileSync(
    join(out, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Scene bench</title>
<style>
  body{font:14px system-ui,sans-serif;margin:24px;color:#1f2a37;background:#fbf7ef}
  table{border-collapse:collapse;width:100%}
  td,th{border-bottom:1px solid #e5dccb;padding:8px;vertical-align:top;text-align:left}
  small{color:#6b7785}
  tr.fail td:first-child{border-left:4px solid #e0663a}
  tr.pass td:first-child{border-left:4px solid #3fa66b}
  tr.worse{background:#fde9e1}
  td.small{color:#b0402a;font-weight:600}
  .stills img{margin:0 6px 6px 0;border:1px solid #e5dccb;background:#fff}
</style>
<h1>Scene bench, ${escape(SCENE_GENERATOR_VERSION)}</h1>
<p>${pages.filter((p) => p.passes).length} of ${pages.length} pages pass: nothing found by the audit, and no words under ${PASS_PX}px on a 560px pane.</p>
<table><tr><th>Page</th><th>Audit, box + wide</th>${WIDTHS.map((w) => `<th>Smallest at ${w.px}px</th>`).join('')}<th>Steps · timing</th></tr>
${pages.map(row).join('\n')}
</table>`,
  );
  console.log(
    `${pages.filter((p) => p.passes).length} of ${pages.length} pass → ${join(out, 'index.html')}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
