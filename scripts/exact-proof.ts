/**
 * The exact pictures (scene-exact) composed as a Studio explainer composes
 * them, from the hand-written piece in studio/__fixtures__/exact-pictures:
 * flags, equations, flows and molecules drawn by code, in both shapes, no
 * model asked and nothing voiced. Writes each scene to
 * <out dir>/exact-<key>[-tall]/scene.json for the stage lab
 * (/dev/stage?scene=exact-flags&tall=1&safe=1), and with --png each code
 * drawing on its own as a PNG beside it, and reports what each scene
 * holds: its things, what code drew, how large, and the tall text checks.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/exact-proof.ts <out dir> [--png <png dir>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXACT_SCENES,
  composeExactPictures,
} from '../src/business/domain/studio/__fixtures__/exact-pictures';
import { lessonTextFaults } from '../src/business/domain/scene-lesson-check';
import { rasterise } from '../src/business/domain/scene-raster';

async function main() {
  const args = process.argv.slice(2);
  const out = args.find((a) => !a.startsWith('--')) ?? 'scene-out';
  const pngAt = args.indexOf('--png');
  const pngs = pngAt >= 0 ? args[pngAt + 1] : null;
  for (const shape of ['wide', 'tall'] as const) {
    const film = await composeExactPictures(shape);
    for (const [i, one] of film.entries()) {
      const key = EXACT_SCENES[i].key;
      const dir = join(out, `exact-${key}${shape === 'tall' ? '-tall' : ''}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'scene.json'), JSON.stringify(one.scene));
      const things = one.scene.things.map((t) =>
        t.kind === 'drawing'
          ? `${t.id} (${t.source ?? 'art'}, ${(t.svg.length / 1024).toFixed(1)} KB, parts ${Object.keys(t.parts).join('/') || '-'})`
          : `${t.id} (${t.kind})`,
      );
      const faults = lessonTextFaults(one.scene);
      console.log(
        `${shape} ${key}: ${things.join('; ')}; text ${faults.length ? faults.map((f) => f.message).join('; ') : 'clear'}`,
      );
      if (pngs) {
        mkdirSync(pngs, { recursive: true });
        for (const t of one.scene.things)
          if (t.kind === 'drawing' && t.source)
            writeFileSync(
              join(pngs, `${key}-${t.id}-${shape}.png`),
              await rasterise(t.svg, 900),
            );
      }
    }
  }
}

void main();
