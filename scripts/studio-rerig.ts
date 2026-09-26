/**
 * A Studio show's animals and creatures rigged by code, with no model
 * asked: each drawing made still, its parts joined to the body (a tail
 * drawn apart moved in to meet it), and its motion the rig's, turning
 * each part about its own joint (scene-sheet-rig). Then every scene the
 * show has made, which carries its drawings inside it, patched to the
 * rigged drawing, so a scene made before plays as one made now.
 *
 *   npm run studio:rerig -- <showId>                     says what would change
 *   npm run studio:rerig -- <showId> --go                rigs the cast and patches the show's scenes
 *   npm run studio:rerig -- <showId> --go <scene.json>…  patches those scene files too
 *                                                        (a copy in the client's public/dev-scenes)
 *
 * Nothing is lost: the cast and each scene are copied beside themselves
 * as .bak before they are first written, and a run again rigs the same
 * way. A person drawn by the kit has a rig of its own and is left alone.
 * The show's scenes are found on the local disk (STORAGE_DRIVER=local);
 * the cast is read and written through the storage port.
 */
import { promises as fs } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { NotFoundError } from '../src/business/domain/errors/errors';
import {
  castOf,
  type CharacterSheet,
} from '../src/business/domain/scene-sheet';
import { RIG_VERSION, rigSheet } from '../src/business/domain/scene-sheet-rig';
import { revealedSvg } from '../src/business/domain/scene-svg';
import { studioCastKey } from '../src/business/handlers/studio/studio-cast.service';
import type { StoragePort } from '../src/business/ports/storage.port';
import { LocalStorageAdapter } from '../src/web/adapters/local-storage.adapter';
import { S3StorageAdapter } from '../src/web/adapters/s3-storage.adapter';

loadEnv();

const config = new ConfigService();
const driver = config.get<string>('STORAGE_DRIVER', 'local');

/** A drawing as it was before it was rigged, and what it is now. */
interface Swap {
  id: string;
  from: Set<string>;
  to: string;
  moves: boolean;
}

/** The svg a sheet was kept with, and as castOf showed it to the scenes. */
function spellings(sheet: Partial<CharacterSheet> | undefined): string[] {
  const d = sheet?.drawing;
  if (!d?.svg) return [];
  return [
    d.svg,
    revealedSvg(d.svg, [
      ...Object.values(d.parts ?? {}),
      ...Object.values(d.states ?? {}),
      ...Object.values(d.labels ?? {}),
    ]),
  ];
}

async function exists(storage: StoragePort, key: string): Promise<boolean> {
  try {
    await storage.size(key);
    return true;
  } catch (error) {
    if (error instanceof NotFoundError) return false;
    throw error;
  }
}

/**
 * A scene's drawings swapped for their rigged ones: the same drawing, or
 * the same drawing with signs set over its head (scene.processor), which
 * keep their place after it.
 */
function patched(
  scene: { things?: { id?: string; svg?: unknown; moves?: unknown }[] },
  swaps: Swap[],
): string[] {
  const done: string[] = [];
  for (const thing of scene.things ?? []) {
    if (typeof thing.svg !== 'string') continue;
    for (const swap of swaps) {
      let next: string | null = null;
      for (const from of swap.from) {
        if (thing.svg === from) next = swap.to;
        else {
          const open = from.replace(/<\/svg>\s*$/i, '');
          if (open !== from && thing.svg.startsWith(open))
            next =
              swap.to.replace(/<\/svg>\s*$/i, '') +
              thing.svg.slice(open.length);
        }
        if (next) break;
      }
      if (!next) continue;
      thing.svg = next;
      if (typeof thing.moves === 'boolean') thing.moves = swap.moves;
      done.push(thing.id ?? swap.id);
      break;
    }
  }
  return done;
}

/** Every file under a folder whose name ends in scene.json. */
async function sceneFiles(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sceneFiles(path)));
    else if (entry.name.endsWith('scene.json')) out.push(path);
  }
  return out.sort();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const go = args.includes('--go');
  const [showId, ...files] = args.filter((a) => !a.startsWith('--'));
  if (!showId) {
    console.error('npm run studio:rerig -- <showId> [--go] [scene.json ...]');
    process.exit(2);
  }
  const storage: StoragePort =
    driver === 's3'
      ? new S3StorageAdapter(config)
      : new LocalStorageAdapter(config);
  const key = studioCastKey(showId);
  const raw = await storage.get(key);
  const cast = JSON.parse(raw.toString('utf8')) as Record<
    string,
    Partial<CharacterSheet>
  >;
  const backedUp = await exists(storage, `${key}.bak`);
  const before = backedUp
    ? (JSON.parse((await storage.get(`${key}.bak`)).toString('utf8')) as Record<
        string,
        Partial<CharacterSheet>
      >)
    : {};

  // The cast: each sheet the artist drew, rigged unless it is already.
  const swaps: Swap[] = [];
  let changed = false;
  for (const [id, sheet] of Object.entries(castOf(cast))) {
    if (sheet.figure) continue;
    const was = before[id]?.rig ? [] : spellings(before[id]);
    if (sheet.rig?.version === RIG_VERSION) {
      console.log(`${id}: rigged already`);
      if (was.length)
        swaps.push({
          id,
          from: new Set(was),
          to: sheet.drawing.svg,
          moves: sheet.drawing.moves,
        });
      continue;
    }
    const rigged = await rigSheet(sheet);
    const { rig } = rigged.sheet;
    console.log(
      `${id}: rigged; joints ${Object.entries(rig?.joints ?? {})
        .map(([part, [x, y]]) => `${part} (${x}, ${y})`)
        .join(
          ', ',
        )}${rig?.mended.length ? `; moved in: ${rig.mended.map((m) => `${m.part} by (${m.dx}, ${m.dy})`).join(', ')}` : ''}${rigged.notes.length ? `; ${rigged.notes.join(' ')}` : ''}`,
    );
    cast[id] = rigged.sheet;
    changed = true;
    swaps.push({
      id,
      from: new Set([
        ...was,
        ...spellings(sheet),
        ...spellings(castOf({ [id]: before[id] })[id]),
      ]),
      to: rigged.sheet.drawing.svg,
      moves: rigged.sheet.drawing.moves,
    });
  }
  if (changed && go) {
    if (!backedUp)
      await storage.put({
        key: `${key}.bak`,
        body: raw,
        mimeType: 'application/json',
      });
    await storage.put({
      key,
      body: Buffer.from(JSON.stringify(cast)),
      mimeType: 'application/json',
    });
    console.log(
      `${key}: written${backedUp ? '' : `, the old one kept as ${key}.bak`}`,
    );
  }

  // The show's made scenes, in storage, and any scene files named.
  const root = resolve(config.get<string>('STORAGE_ROOT', './storage'));
  const stored =
    driver === 'local' || !driver
      ? await sceneFiles(join(root, 'studio', showId))
      : [];
  if (driver && driver !== 'local')
    console.log(
      `STORAGE_DRIVER=${driver}: the show's scenes are not listed; only the scene files named are patched`,
    );
  const targets = [
    ...stored.map((path) => ({ path, key: relative(root, path) })),
    ...files.map((path) => ({ path: resolve(path), key: null })),
  ];
  for (const { path, key: sceneKey } of targets) {
    const text = await fs.readFile(path, 'utf8');
    const scene = JSON.parse(text) as Parameters<typeof patched>[0];
    const done = patched(scene, swaps);
    const name = sceneKey ?? path;
    if (!done.length) {
      console.log(`${name}: nothing to patch`);
      continue;
    }
    console.log(
      `${name}: ${done.join(', ')}${go ? ' patched' : ' would be patched'}`,
    );
    if (!go) continue;
    const body = Buffer.from(JSON.stringify(scene));
    if (sceneKey) {
      if (!(await exists(storage, `${sceneKey}.bak`)))
        await storage.put({
          key: `${sceneKey}.bak`,
          body: Buffer.from(text),
          mimeType: 'application/json',
        });
      await storage.put({ key: sceneKey, body, mimeType: 'application/json' });
    } else {
      await fs
        .access(`${path}.bak`)
        .catch(() => fs.writeFile(`${path}.bak`, text));
      await fs.writeFile(path, body);
    }
  }
  if (!go) console.log('Nothing written: run again with --go.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
