/**
 * Drawing the library out, in a batch, by hand, never inside a lesson.
 *
 * The library is the limit on what a page may show, and it is thin. This
 * fills it. For each term: one call says what the thing looks like, in
 * plain words, with nothing about what it is for; then several
 * candidates are drawn from that description alone, with the name
 * withheld, because a name says what a thing does and asking by name is
 * how you get a beaker for a kidney. A gate throws out the ones nobody
 * should have to look at, a judge is shown them together and picks one,
 * and what it picks waits for a person.
 *
 * The queue is the miss log: the terms pages actually asked for and the
 * library could not draw, most wanted first. Work that, not a wishlist.
 *
 *   npm run visual:draw                       # the top misses
 *   npm run visual:draw -- --terms "tower,shelf"
 *   npm run visual:draw -- --fake             # the whole loop, no spend
 *
 *   --limit       how many terms to take off the miss log (default 10)
 *   --terms       draw these instead, comma separated
 *   --out         where to write (default drawings)
 *   --candidates  how many to draw a term (default six)
 *   --repairs     how many times the judge may send one back (default two)
 *   --temperature how far the six are allowed to disagree (default 0.9)
 *   --max-calls   stop before spending more than this many calls
 *
 * It writes, into --out: `chosen.json` for `visual:accept` to read, a
 * `presets.json` in the library's own shape, a PNG a person looks at,
 * and `misses.json` — what nothing could draw, and why.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize';
import { AiSdkLlmAdapter } from '../src/web/adapters/ai-sdk/ai-sdk-llm.adapter';
import { FakeLlmAdapter } from '../src/web/adapters/fake-llm.adapter';
import {
  drawingProblems,
  presetOf,
  type ThingDrawing,
} from '../src/business/domain/visual-draw';
import { execFileSync } from 'node:child_process';
import {
  ALLOWED_ELEMENTS,
  DRAW_VIEWBOX,
  framed,
  renderable,
} from '../src/business/domain/visual-svg';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const num = (name: string, fallback: number) =>
  Number(arg(name) ?? fallback) || fallback;

/**
 * The miss log, most wanted first: what pages asked to be drawn and the
 * library had nothing for. Read straight, the way the migration runner
 * reads, rather than standing the whole application up for one query.
 */
async function missingTerms(limit: number): Promise<string[]> {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      'DATABASE_URL is not set, so there is no miss log to work from. Pass --terms instead.',
    );
  const db = new Sequelize(url, { dialect: 'mysql', logging: false });
  try {
    const [rows] = await db.query(
      'SELECT term FROM visual_terms WHERE drawing IS NULL GROUP BY term ORDER BY SUM(times) DESC LIMIT :limit',
      { replacements: { limit } },
    );
    return (rows as { term: string }[]).map((r) => r.term);
  } finally {
    await db.close();
  }
}

/** Runs the jobs at most `width` at a time, keeping their order. */
async function inFlight<T>(
  count: number,
  width: number,
  job: (i: number) => Promise<T>,
): Promise<T[]> {
  const out: T[] = new Array<T>(count);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= count) return;
      out[i] = await job(i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(width, count) }, () => worker()),
  );
  return out;
}

/**
 * Rasterise, in a process that is allowed to die.
 *
 * resvg panics rather than throws on geometry it cannot handle, and a
 * panic in a native module takes the whole run with it — which it did,
 * twice, including from inside the very check meant to prevent it. Over
 * here the worst a bad drawing can do is kill a child process and give
 * us a false back.
 */
function draw(svg: string, width: number, out?: string): Buffer | null {
  try {
    const png = execFileSync(
      process.execPath,
      [
        join(__dirname, 'rasterise-one.js'),
        String(width),
        ...(out ? [out] : []),
      ],
      {
        input: svg,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 20_000,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
    return out ? Buffer.alloc(0) : png;
  } catch {
    return null;
  }
}

/**
 * Whether the rasteriser can actually draw this one.
 *
 * The spec's first gate rule is "parses and renders", and until now
 * nothing checked it: a candidate with a malformed attribute took out
 * the judge's whole sheet, and with it the other five candidates and
 * the round. Rendered small and on its own, it costs almost nothing and
 * the failure belongs to the candidate that caused it.
 */
function renders(drawing: ThingDrawing): boolean {
  return renderable(drawing.svg) && draw(svgOf(drawing, 48), 48) !== null;
}

/** Markup cut down to what the rasteriser will certainly accept. */
function safeInner(svg: string): string {
  return (
    svg
      .replace(/^[\s\S]*?<svg[^>]*>/i, '')
      .replace(/<\/svg>\s*$/i, '')
      // Elements with content that is not ink: take the content too.
      .replace(/<\s*(text|title|style|script)\b[\s\S]*?<\/\s*\1\s*>/gi, '')
      // Anything else outside the allowed set, including a stray open tag.
      .replace(
        /<\s*\/?\s*([a-zA-Z][\w:-]*)\b[^>]*\/?>/g,
        (tag, name: string) =>
          ALLOWED_ELEMENTS.has(name.toLowerCase()) ? tag : '',
      )
  );
}

/** The candidate on its own square, at full size, the way it will be stored. */
function svgOf(drawing: ThingDrawing, size = 200): string {
  const view = viewOf(drawing.svg);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.join(' ')}" width="${size}" height="${Math.round((size * view[3]) / view[2])}">`,
    `<rect x="${view[0]}" y="${view[1]}" width="${view[2]}" height="${view[3]}" fill="#FFFFFF"/>`,
    `<g color="#1A2233">${safeInner(drawing.svg)}</g>`,
    `</svg>`,
  ].join('');
}

/** A drawing's own viewBox, or a sane one when it has none. */
function viewOf(svg: string): [number, number, number, number] {
  const found = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svg);
  const n = (found?.[1].match(/-?\d*\.?\d+/g) ?? []).map(Number);
  return n.length === 4 && n[2] > 0 && n[3] > 0
    ? [n[0], n[1], n[2], n[3]]
    : [0, 0, DRAW_VIEWBOX.w, DRAW_VIEWBOX.h];
}

/**
 * The same markup with every id of its own made unique to this tile.
 *
 * A sheet holds several drawings at once and each brings its own defs.
 * They all call their gradient bodyGrad, so on one sheet the last one
 * defined wins and every tile is painted in the last tile's colours.
 */
function namespaced(svg: string, tag: string): string {
  const ids = [...svg.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
  let out = svg;
  for (const id of new Set(ids)) {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(
        new RegExp(`\\bid\\s*=\\s*(["'])${safe}\\1`, 'g'),
        `id="${tag}-${id}"`,
      )
      .replace(
        new RegExp(`url\\(\\s*#${safe}\\s*\\)`, 'g'),
        `url(#${tag}-${id})`,
      )
      .replace(
        new RegExp(`\\b(href|xlink:href)\\s*=\\s*(["'])#${safe}\\2`, 'g'),
        `$1="#${tag}-${id}"`,
      );
  }
  return out;
}

/**
 * A grid of drawings under captions.
 *
 * Laid out with a transform per tile rather than a nested <svg>. resvg
 * panics outright on two nested svg elements in one document — one tile
 * renders, two abort the process — and a panic is not something a
 * try/catch can hold, so the shape of the sheet has to avoid it rather
 * than survive it.
 */
function sheetSvg(cells: { drawing: ThingDrawing; caption: string }[]): string {
  cells = cells.filter((c) => renderable(c.drawing.svg));
  if (!cells.length)
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" width="210" height="210"><rect width="100%" height="100%" fill="#0B0F17"/></svg>';
  const cell = 210;
  const pad = 15;
  const inner = cell - pad * 2;
  const across = Math.min(4, Math.max(1, cells.length));
  const down = Math.ceil(cells.length / across);
  const rows = cells.map((one, i) => {
    const x = (i % across) * cell + pad;
    const y = Math.floor(i / across) * (cell + 26) + pad;
    const [vx, vy, vw, vh] = viewOf(one.drawing.svg);
    const scale = inner / Math.max(vw, vh);
    const at = `translate(${x} ${y}) scale(${scale.toFixed(4)}) translate(${-vx} ${-vy})`;
    const markup = namespaced(safeInner(one.drawing.svg), `t${i}`);
    return [
      `<g transform="${at}">`,
      `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#FFFFFF"/>`,
      `<g color="#1A2233">${markup}</g>`,
      `</g>`,
      `<text x="${x - pad + cell / 2}" y="${y - pad + cell + 6}" fill="#E9EDF5" font-size="13" font-family="sans-serif" text-anchor="middle">${one.caption}</text>`,
    ].join('');
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${across * cell} ${down * (cell + 26)}" width="${across * cell}" height="${down * (cell + 26)}">`,
    `<rect width="100%" height="100%" fill="#0B0F17"/>`,
    ...rows,
    `</svg>`,
  ].join('');
}

interface Kept {
  term: string;
  looksLike: string;
  drawing: ThingDrawing;
}

/** Everything drawn for one term, kept or not, so a failed run can be looked at. */
interface Tried {
  drawing: ThingDrawing;
  caption: string;
}

async function main(): Promise<void> {
  const asked = (arg('terms') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const terms = asked.length ? asked : await missingTerms(num('limit', 10));
  if (!terms.length) {
    console.log('The miss log is empty: nothing a page asked for is undrawn.');
    return;
  }
  const out = arg('out') ?? 'drawings';
  const candidates = num('candidates', 6);
  const repairs = num('repairs', 2);
  const temperature = Number(arg('temperature') ?? 0.9);
  const maxCalls = num('max-calls', Number.POSITIVE_INFINITY);
  const llm = flag('fake')
    ? new FakeLlmAdapter()
    : new AiSdkLlmAdapter(new ConfigService(process.env));
  mkdirSync(out, { recursive: true });

  const kept: Kept[] = [];
  const everyTried: { term: string; tried: Tried[] }[] = [];
  const missed: { term: string; why: string }[] = [];
  let spent = 0;
  const budgetLeft = () => maxCalls - spent;

  for (const term of terms) {
    if (budgetLeft() <= 0) {
      console.log(`\nstopping at ${spent} calls, as asked`);
      break;
    }
    console.log(`\n${term}`);

    let taken: ThingDrawing | null = null;
    let note = '';
    const tried: Tried[] = [];
    for (let round = 0; round <= repairs && !taken; round += 1) {
      if (budgetLeft() < candidates + 1) {
        note = note || 'ran out of budget';
        break;
      }
      // Six at a raised temperature, three in flight: six of one mind is
      // one candidate, and six at once finds a rate limit.
      const drawn = await inFlight(candidates, 3, async () => {
        const one = await llm.thingDrawing({
          term,
          temperature,
          ...(note ? { note } : {}),
        });
        // Framed here rather than sent back for it: the spec says to
        // normalise the viewBox on accept, and a well-drawn cone with a
        // margin round it is not a fault worth six more calls.
        return { ...one.value, ...framed(one.value) };
      });
      spent += candidates;

      const judged = drawn.map((one) => {
        const wrong = drawingProblems(one);
        if (!renders(one))
          wrong.unshift(
            'the drawing will not render: check the markup is well formed',
          );
        return { one, wrong };
      });
      // Every candidate is kept for the sheet, with what was wrong with
      // it. A run that draws nothing used to leave nothing to look at,
      // which is no way to find out why it drew nothing.
      judged.forEach((j, i) =>
        tried.push({
          drawing: j.one,
          caption: `${round + 1}.${i + 1} ${j.wrong.length ? j.wrong[0].slice(0, 44) : 'through the gate'}`,
        }),
      );
      const passed = judged.filter((j) => !j.wrong.length).map((j) => j.one);
      console.log(
        `  round ${round + 1}: ${passed.length} of ${drawn.length} through the gate`,
      );
      if (!passed.length) {
        // Every way they failed, not just the first one's: one candidate's
        // complaint is a sample of one.
        note = [...new Set(judged.flatMap((j) => j.wrong))]
          .slice(0, 4)
          .join('; ');
        console.log(`  the gate said: ${note}`);
        continue;
      }

      // Shown together and numbered, so the judge chooses rather than
      // settling for the first one it can live with.
      const png = draw(
        sheetSvg(
          passed.map((one, i) => ({ drawing: one, caption: String(i + 1) })),
        ),
        Math.min(4, passed.length) * 210,
      );
      if (!png) {
        note = 'the sheet of these would not render';
        console.log(`  ${note}`);
        continue;
      }
      const said = await llm.judgeDrawings({
        png,
        looksLike: term,
        count: passed.length,
      });
      spent += 1;
      if (said.value.pick) {
        taken = passed[said.value.pick - 1];
        console.log(`  the judge took ${said.value.pick} of ${passed.length}`);
      } else {
        note = said.value.wrong ?? note;
        console.log(`  the judge took none: ${note}`);
      }
    }

    // The sheet of everything tried, kept or not: the only way to see
    // what the drawer is actually producing when none of it gets through.
    if (tried.length) everyTried.push({ term, tried });
    if (tried.length) {
      const file = join(out, `tried-${term.replace(/\W+/g, '-')}.png`);
      const drawable = tried.filter((one) => renders(one.drawing));
      const ok = draw(
        sheetSvg(drawable),
        Math.min(4, Math.max(1, drawable.length)) * 210,
        file,
      );
      console.log(
        ok
          ? `  ${drawable.length} of ${tried.length} candidate(s) drawn: ${file}`
          : '  (the sheet would not render)',
      );
    }

    if (!taken) {
      missed.push({ term, why: note || 'nothing came through' });
      console.log(`  nothing passed for "${term}"`);
      continue;
    }
    kept.push({ term, looksLike: term, drawing: taken });
    console.log(`  kept, ${taken.parts.length} named part(s)`);
  }

  // What the accept step reads, and what a person reads.
  writeFileSync(join(out, 'chosen.json'), `${JSON.stringify(kept, null, 2)}\n`);
  // The candidates themselves, kept or not. A picture of a failed run is
  // worth a lot; the markup behind it is worth more, and re-rendering it
  // later costs nothing where redrawing it costs a hundred calls.
  writeFileSync(
    join(out, 'tried.json'),
    `${JSON.stringify(everyTried, null, 2)}\n`,
  );
  writeFileSync(
    join(out, 'presets.json'),
    `${JSON.stringify(
      Object.fromEntries(
        kept.map((k) => {
          const { name, ...rest } = presetOf(k.term, k.drawing, k.looksLike);
          return [name, rest];
        }),
      ),
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(out, 'misses.json'),
    `${JSON.stringify(missed, null, 2)}\n`,
  );
  if (kept.length)
    draw(
      sheetSvg(kept.map((k) => ({ drawing: k.drawing, caption: k.term }))),
      Math.min(4, kept.length) * 210,
      join(out, 'sheet.png'),
    );

  console.log(
    [
      `\n${kept.length} of ${terms.length} drawn in ${spent} calls.`,
      kept.length
        ? `Look at ${join(out, 'sheet.png')}, then keep what is right:\n  npm run visual:accept -- --terms "${kept.map((k) => k.term).join(',')}"`
        : 'Nothing to accept.',
      missed.length ? `${missed.length} went back to the queue.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

void main();
