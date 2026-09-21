/**
 * Keeping a drawing: the step where a person, and only a person, puts
 * something into the library.
 *
 * `visual:draw` gets as far as a sheet and stops. Nothing it produced is
 * in the library, and nothing should be: the gate can tell a sound path
 * from an unsound one and the judge can tell a shape from a description,
 * but neither has ever seen the thing. So a person looks at the sheet
 * and names what to keep, and this writes those and no others.
 *
 *   npm run visual:accept -- --terms "kidney,funnel"
 *   npm run visual:accept -- --all
 *
 *   --in       where visual:draw wrote (default drawings)
 *   --terms    which of them to keep, comma separated
 *   --all      keep every drawing on the sheet
 *   --replace  allow one to stand in for a drawing the library already has
 *   --dry-run  say what would be written and write nothing
 *
 * It writes the frontend's `packs/drawn.ts` — the client is the source
 * of the library and the server's copy is generated from it — then runs
 * that generator so both sides agree, and marks the terms drawn in the
 * miss log so they stop being asked for.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Sequelize } from 'sequelize';
import {
  presetOf,
  type ThingDrawing,
} from '../src/business/domain/visual-draw';
import { knownPicture } from '../src/business/domain/visual-presets';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

interface Kept {
  term: string;
  looksLike: string;
  drawing: ThingDrawing;
}

/** Where the client keeps the library. The server's copy is generated from it. */
const CLIENT = resolve(
  process.env.EASYREAD_CLIENT ?? join(__dirname, '../../easyread'),
);

const PACK = join(CLIENT, 'src/lib/visual/packs/drawn.ts');
const PRESETS = join(CLIENT, 'src/lib/visual/presets.ts');

const quote = (s: string) => JSON.stringify(s);

/** The pack file, written whole from every drawing kept so far. */
function packSource(entries: Record<string, unknown>): string {
  const body = Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, preset]) => {
      const p = preset as {
        svg: string;
        aspect: number;
        tags: string;
        outline?: boolean;
        parts?: Record<string, { at: number[] }>;
      };
      const parts = p.parts
        ? [
            '    parts: {',
            ...Object.entries(p.parts).map(
              ([part, spec]) =>
                `      ${quote(part)}: { at: [${spec.at[0]}, ${spec.at[1]}] },`,
            ),
            '    },',
          ].join('\n')
        : null;
      return [
        `  ${quote(name)}: {`,
        `    svg: ${quote(p.svg)},`,
        `    aspect: ${p.aspect},`,
        `    tags: ${quote(p.tags)},`,
        p.outline ? '    outline: true,' : null,
        parts,
        '  },',
      ]
        .filter((line) => line !== null)
        .join('\n');
    })
    .join('\n');
  return [
    '/**',
    ' * Drawings the library was missing, drawn for it and kept by hand.',
    ' *',
    ' * Written by easyread-server/scripts/visual-accept.ts. Every entry in',
    ' * here was asked for by a real page, drawn from a description with its',
    ' * name withheld, put through the gate and the judge, and then looked',
    ' * at by a person who said keep it. Edit it like any other pack; the',
    ' * script only ever adds.',
    ' */',
    'import type { Preset } from "../presets";',
    '',
    'export const DRAWN: Record<string, Preset> = {',
    body,
    '};',
    '',
  ].join('\n');
}

/** What is already in the pack, so accepting again adds rather than replaces the file. */
function existingPack(): Record<string, unknown> {
  if (!existsSync(PACK)) return {};
  // The pack is generated and its entries are plain data, so the file is
  // read back through the same loader the client uses rather than parsed.
  const source = readFileSync(PACK, 'utf8');
  const body = source.slice(
    source.indexOf('{', source.indexOf('export const DRAWN')),
    source.lastIndexOf('}') + 1,
  );
  try {
    return JSON.parse(
      body
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/^(\s*)([A-Za-z_][\w-]*)\s*:/gm, '$1"$2":'),
    ) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Could not read the drawings already in ${PACK}. It has been hand-edited into a shape this cannot add to; add the new ones by hand, or move it aside.`,
    );
  }
}

/** Says the pack is in PACKS, or what to add if it is not. */
function checkRegistered(): string | null {
  const source = readFileSync(PRESETS, 'utf8');
  if (source.includes('./packs/drawn')) return null;
  return [
    `${PRESETS} does not load the pack yet. Add these two lines:`,
    '  import { DRAWN } from "./packs/drawn";',
    '  ...and `drawn: DRAWN,` to PACKS.',
  ].join('\n');
}

async function markDrawn(pairs: { term: string; name: string }[]) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('No DATABASE_URL, so the miss log is left as it is.');
    return;
  }
  const db = new Sequelize(url, { dialect: 'mysql', logging: false });
  try {
    for (const { term, name } of pairs)
      await db.query(
        "UPDATE visual_terms SET drawing = :name, found_by = 'hand' WHERE term = :term",
        { replacements: { name, term } },
      );
  } finally {
    await db.close();
  }
}

async function main(): Promise<void> {
  const dir = arg('in') ?? 'drawings';
  const chosenPath = join(dir, 'chosen.json');
  if (!existsSync(chosenPath))
    throw new Error(
      `Nothing to accept: ${chosenPath} is not there. Run visual:draw first.`,
    );
  const chosen = JSON.parse(readFileSync(chosenPath, 'utf8')) as Kept[];

  const wanted = (arg('terms') ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!wanted.length && !flag('all'))
    throw new Error(
      'Name what to keep: --terms "kidney,funnel", or --all to keep the sheet.',
    );
  const taking = chosen.filter(
    (k) => flag('all') || wanted.includes(k.term.trim().toLowerCase()),
  );
  if (!taking.length) throw new Error(`None of those are in ${chosenPath}.`);

  const pack = existingPack();
  const added: { term: string; name: string }[] = [];
  for (const k of taking) {
    const { name, ...preset } = presetOf(k.term, k.drawing, k.looksLike);
    // A pack entry outranks a hand-made preset of the same name, so
    // accepting one silently replaces a drawing somebody made on purpose.
    if (knownPicture(name) && !pack[name] && !flag('replace')) {
      console.log(
        `  skipped "${k.term}": the library already draws "${name}". Pass --replace to stand in for it.`,
      );
      continue;
    }
    pack[name] = preset;
    added.push({ term: k.term, name });
    console.log(`  keeping "${k.term}" as "${name}"`);
  }
  if (!added.length) {
    console.log('Nothing kept.');
    return;
  }

  if (flag('dry-run')) {
    console.log(`\nWould write ${added.length} into ${PACK}. Nothing written.`);
    return;
  }

  writeFileSync(PACK, packSource(pack));
  const todo = checkRegistered();
  if (todo) console.log(`\n${todo}`);

  // The client is the source; the server's copy is generated from it.
  try {
    execFileSync('node', ['scripts/visual-living.mjs'], {
      cwd: CLIENT,
      stdio: 'inherit',
    });
  } catch {
    console.log(
      `\nThe pack is written, but the server's copy was not regenerated. Run it yourself:\n  cd ${CLIENT} && node scripts/visual-living.mjs`,
    );
  }

  await markDrawn(added);
  console.log(
    `\n${added.length} drawing(s) in the library. They are asked for by name from now on.`,
  );
}

void main();
