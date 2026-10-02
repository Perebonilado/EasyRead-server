/**
 * The infographic kinds for the client's dev page (/dev/kinds): each
 * kind's drawing as code draws it for the stage, in both shapes, and each
 * kind's scene composed as a Studio editor's episode composes it, no
 * model asked and nothing voiced. Writes, under the client's
 * public/dev-scenes (which git leaves out):
 *
 *   kinds/drawings.json          every kind's drawing, wide and tall
 *   kinds/<kind>-<shape>.json    its scene, for the stage
 *
 * and with --png, each drawing as a PNG beside them, for a quick look.
 *
 *   npm run kinds:fixtures -- <client>/public/dev-scenes [--png <dir>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KIND_SCENES,
  composeKinds,
} from '../src/business/domain/studio/__fixtures__/infographic-kinds';
import { rasterise } from '../src/business/domain/scene-raster';

async function main() {
  const args = process.argv.slice(2);
  const out = args.find((a) => !a.startsWith('--')) ?? 'scene-out';
  const pngAt = args.indexOf('--png');
  const pngs = pngAt >= 0 ? args[pngAt + 1] : null;
  const dir = join(out, 'kinds');
  mkdirSync(dir, { recursive: true });
  const drawings: unknown[] = [];
  for (const shape of ['wide', 'tall'] as const) {
    const film = await composeKinds(shape);
    for (const [i, one] of film.entries()) {
      const key = KIND_SCENES[i].key;
      writeFileSync(
        join(dir, `${key}-${shape}.json`),
        JSON.stringify(one.scene),
      );
      for (const thing of one.scene.things) {
        if (thing.kind !== 'drawing' || !thing.source) continue;
        drawings.push({
          key,
          shape,
          id: thing.id,
          source: thing.source,
          svg: thing.svg,
          aspect: thing.aspect,
          parts: thing.parts,
          states: thing.states,
        });
        if (pngs) {
          mkdirSync(pngs, { recursive: true });
          writeFileSync(
            join(pngs, `${key}-${shape}.png`),
            await rasterise(thing.svg, shape === 'wide' ? 1200 : 720),
          );
        }
        console.log(
          `${shape} ${key}: ${thing.id} (${thing.source}, ${(thing.svg.length / 1024).toFixed(1)} KB, parts ${Object.keys(thing.parts).join('/') || '-'}, states ${Object.keys(thing.states).join('/') || '-'})`,
        );
      }
      const shown = one.scene.effects
        .filter((e) => e.do === 'show')
        .map((e) => `${e.part}@${(e.atMs / 1000).toFixed(1)}s`);
      console.log(
        `  ${(one.scene.durationMs / 1000).toFixed(1)}s, ${one.scene.steps.length} steps, shows ${shown.join(', ') || '-'}`,
      );
    }
  }
  writeFileSync(join(dir, 'drawings.json'), JSON.stringify(drawings));
  console.log(
    `wrote ${drawings.length} drawings and ${KIND_SCENES.length * 2} scenes to ${dir}`,
  );
}

void main();
