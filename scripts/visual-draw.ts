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
import { rasterise } from '../src/business/domain/visual-render';
import {
  ALLOWED_ELEMENTS,
  DRAW_VIEWBOX,
  framed,
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

/** The candidate on its own square, for the judge and for the sheet. */
function svgOf(drawing: ThingDrawing, size = 200): string {
  const w = Math.round(size * Math.min(1, drawing.aspect));
  const h = Math.round(size / Math.max(1, drawing.aspect));
  // The drawing's own markup, dropped in as it will be stored, so what
  // the judge and the person look at is what the library will hold.
  //
  // Stripped to the allowed elements first, because the sheet now shows
  // candidates that FAILED the gate, and a failing candidate is exactly
  // the one carrying a <text> or a tag the rasteriser will refuse. One
  // of those used to take the whole run down with it.
  const inner = safeInner(drawing.svg);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${w}" height="${h}">`,
    `<rect width="100" height="100" fill="#11151F"/>`,
    `<g fill="none" stroke="#8DB4F3" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" color="#8DB4F3">${inner}</g>`,
    `</svg>`,
  ].join('');
}

/** A grid of drawings under captions, for the judge to choose from or a person to accept from. */
function sheetSvg(cells: { drawing: ThingDrawing; caption: string }[]): string {
  const cell = 210;
  const across = Math.min(4, Math.max(1, cells.length));
  const down = Math.ceil(cells.length / across);
  const rows = cells.map((one, i) => {
    const x = (i % across) * cell;
    const y = Math.floor(i / across) * (cell + 26);
    const inner = svgOf(one.drawing, cell - 30)
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '');
    return [
      // The drawing is on a 100-unit viewBox, not a unit square. Scaling
      // by the cell drew everything a hundred times too big and clean off
      // the sheet, which is why a page of them came back blank.
      `<g transform="translate(${x + 15},${y + 15}) scale(${(cell - 30) / DRAW_VIEWBOX.w})">${inner}</g>`,
      `<text x="${x + cell / 2}" y="${y + cell + 6}" fill="#E9EDF5" font-size="13" font-family="sans-serif" text-anchor="middle">${one.caption}</text>`,
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

      const judged = drawn.map((one) => ({
        one,
        wrong: drawingProblems(one),
      }));
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
      let png: Buffer;
      try {
        png = await rasterise(
          sheetSvg(
            passed.map((one, i) => ({ drawing: one, caption: String(i + 1) })),
          ),
          Math.min(4, passed.length) * 210,
        );
      } catch (cause) {
        note = `the drawing would not render: ${String(cause)}`;
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
      try {
        writeFileSync(
          file,
          await rasterise(sheetSvg(tried), Math.min(4, tried.length) * 210),
        );
        console.log(`  ${tried.length} candidate(s) drawn: ${file}`);
      } catch (cause) {
        // A sheet nobody can render is a shame, not a reason to lose the
        // other four terms and the hundred calls already spent.
        console.log(`  (could not draw the sheet: ${String(cause)})`);
      }
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
    writeFileSync(
      join(out, 'sheet.png'),
      await rasterise(
        sheetSvg(kept.map((k) => ({ drawing: k.drawing, caption: k.term }))),
        Math.min(4, kept.length) * 210,
      ),
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
