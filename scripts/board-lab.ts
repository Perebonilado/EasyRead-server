/**
 * The board lab (studio-explainer-plan, part C): a continuous build's
 * scenes made from fixtures, as the Studio makes them, for the player's
 * strip lab and the proof. The water cycle in three scenes, its sheets
 * written by hand, its drawings drawn by hand in the house palette, its
 * voice timed by an estimate: no model is asked, nothing is voiced.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/board-lab.ts <out dir>
 *
 * Writes <out dir>/e5-water-<n>/scene.json, and prints each scene's board
 * and whatever its audit found overlapping.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeWaterBuild } from '../src/business/domain/__fixtures__/water-cycle-scenes';

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('Say where to write: board-lab.ts <out dir>');
  const made = await composeWaterBuild();
  for (const [n, { scene, audit, pacing }] of made.entries()) {
    const dir = join(out, `e5-water-${n + 1}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'scene.json'), JSON.stringify(scene));
    console.log(
      `scene ${n + 1} "${scene.title}": ${Math.round(scene.durationMs / 1000)}s, carried [${scene.board?.carried.join(', ') ?? ''}]`,
    );
    for (const [k, step] of scene.steps.entries())
      console.log(
        `  ${k + 1}. ${step.atMs}ms show [${step.show.join(', ')}]${step.faded ? ` faded [${step.faded.join(', ')}]` : ''} enter {${Object.entries(
          step.enter,
        )
          .map(([id, e]) => `${id}:${e.how}`)
          .join(', ')}} view ${JSON.stringify(scene.stagings.wide.views?.[k])}`,
      );
    for (const staging of ['box', 'wide'] as const)
      audit[staging].forEach((found, k) =>
        found.forEach((one) =>
          console.log(
            `  audit ${staging} step ${k + 1}: ${one.kind} ${one.a} / ${one.b}`,
          ),
        ),
      );
    for (const note of pacing) console.log(`  ${note}`);
  }
}

void main();
