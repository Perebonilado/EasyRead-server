/**
 * Drawing the library out, in a batch, by hand, never inside a lesson.
 *
 * The library is the limit on what a page may show, and it is thin. This
 * fills it. For each term: one call says what the thing looks like, in
 * plain words, with nothing about what it is for; then six candidates
 * are drawn from that description alone, with the name withheld, because
 * a name says what a thing does and asking by name is how you get a
 * beaker for a kidney. A gate throws out the ones nobody should have to
 * look at, a judge is shown the description and never the name, and what
 * survives is written out for a person to accept or reject.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register \
 *     scripts/visual-draw.ts --terms "tower,exchange,shelf" --out drawings
 *
 *   --fake        run the whole loop on the fake model, to prove the loop
 *   --candidates  how many to draw a term (default six)
 *   --repairs     how many times the judge may send one back (default two)
 *
 * It writes, into --out: a JSON pack of what passed, ready to be pasted
 * into the library, and a PNG a person looks at before it goes in.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiSdkLlmAdapter } from '../src/web/adapters/ai-sdk/ai-sdk-llm.adapter';
import { FakeLlmAdapter } from '../src/web/adapters/fake-llm.adapter';
import {
  drawingProblems,
  presetOf,
  type ThingDrawing,
} from '../src/business/domain/visual-draw';
import { rasterise } from '../src/business/domain/visual-render';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

/** The candidate drawn on its own square, for the judge and for the sheet. */
function svgOf(drawing: ThingDrawing, size = 200): string {
  const w = Math.round(size * Math.min(1, drawing.aspect));
  const h = Math.round(size / Math.max(1, drawing.aspect));
  const scale = (d: string) =>
    d.replace(/-?\d*\.?\d+/g, (n) =>
      String(Math.round(Number(n) * 1000) / 1000),
    );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="${w}" height="${h}">`,
    `<rect width="1" height="1" fill="#11151F"/>`,
    `<g transform="scale(1,1)">`,
    `<path d="${scale(drawing.body)}" fill="#6E9EEA" stroke="#8DB4F3" stroke-width="0.012" stroke-linejoin="round"/>`,
    drawing.detail
      ? `<path d="${scale(drawing.detail)}" fill="none" stroke="#11151F" stroke-width="0.016" stroke-linecap="round"/>`
      : '',
    ...drawing.parts.map(
      (part) =>
        `<circle cx="${part.at[0]}" cy="${part.at[1]}" r="0.022" fill="#F2B44A"/>`,
    ),
    `</g></svg>`,
  ].join('');
}

/** The sheet a person accepts from: every candidate that passed, side by side. */
function sheetSvg(
  kept: { term: string; drawing: ThingDrawing; note: string }[],
): string {
  const cell = 210;
  const across = Math.min(4, Math.max(1, kept.length));
  const down = Math.ceil(kept.length / across);
  const rows = kept.map((one, i) => {
    const x = (i % across) * cell;
    const y = Math.floor(i / across) * (cell + 26);
    const inner = svgOf(one.drawing, cell - 30)
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '');
    return [
      `<g transform="translate(${x + 15},${y + 15}) scale(${cell - 30})">${inner}</g>`,
      `<text x="${x + cell / 2}" y="${y + cell + 6}" fill="#E9EDF5" font-size="12" font-family="sans-serif" text-anchor="middle">${one.term}</text>`,
    ].join('');
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${across * cell} ${down * (cell + 26)}" width="${across * cell}" height="${down * (cell + 26)}">`,
    `<rect width="100%" height="100%" fill="#0B0F17"/>`,
    ...rows,
    `</svg>`,
  ].join('');
}

async function main(): Promise<void> {
  const terms = (arg('terms') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (!terms.length) {
    console.error(
      'Give it something to draw: --terms "tower,exchange,shelf". The queue is the miss log in visual_terms, most wanted first.',
    );
    process.exit(1);
  }
  const out = arg('out') ?? 'drawings';
  const candidates = Number(arg('candidates') ?? 6);
  const repairs = Number(arg('repairs') ?? 2);
  const llm = flag('fake')
    ? new FakeLlmAdapter()
    : new AiSdkLlmAdapter(new ConfigService(process.env));
  mkdirSync(out, { recursive: true });

  const kept: { term: string; drawing: ThingDrawing; note: string }[] = [];
  const presets: Record<string, unknown> = {};
  let spent = 0;

  for (const term of terms) {
    const form = await llm.thingForm({ term });
    spent += 1;
    const { looksLike, parts, aspect } = form.value;
    console.log(`\n${term}\n  looks like: ${looksLike}`);

    let taken: ThingDrawing | null = null;
    let note = '';
    for (let round = 0; round <= repairs && !taken; round += 1) {
      const drawn: ThingDrawing[] = [];
      for (let i = 0; i < candidates; i += 1) {
        // The name never goes this way: only the description does.
        const one = await llm.thingDrawing({
          looksLike,
          parts,
          aspect,
          ...(note ? { correction: note } : {}),
        });
        spent += 1;
        drawn.push(one.value);
      }
      const passed = drawn.filter((one) => !drawingProblems(one).length);
      console.log(
        `  round ${round + 1}: ${passed.length} of ${drawn.length} through the gate`,
      );
      if (!passed.length) {
        note = drawingProblems(
          drawn[0] ?? { body: '', detail: null, aspect: 1, parts: [] },
        ).join('; ');
        continue;
      }
      // The judge sees the drawing and the description, never the name.
      for (const one of passed) {
        const png = await rasterise(svgOf(one, 320), 320);
        const said = await llm.judgeSketch({
          png,
          description: looksLike,
          see: looksLike,
        });
        spent += 1;
        if (said.value.shows) {
          taken = one;
          break;
        }
        note = said.value.wrong ?? note;
      }
      if (!taken) console.log(`  the judge said: ${note}`);
    }

    if (!taken) {
      console.log(`  nothing passed for "${term}"`);
      continue;
    }
    kept.push({ term, drawing: taken, note: looksLike });
    const preset = presetOf(term, taken, looksLike);
    const { name, ...rest } = preset;
    presets[name] = rest;
    console.log(`  kept, ${taken.parts.length} named part(s)`);
  }

  writeFileSync(
    join(out, 'presets.json'),
    `${JSON.stringify(presets, null, 2)}\n`,
  );
  if (kept.length)
    writeFileSync(
      join(out, 'sheet.png'),
      await rasterise(sheetSvg(kept), Math.min(4, kept.length) * 210),
    );
  console.log(
    `\n${kept.length} of ${terms.length} drawn, ${spent} calls. Look at ${join(out, 'sheet.png')}, then paste what you accept from ${join(out, 'presets.json')} into the library.`,
  );
}

void main();
