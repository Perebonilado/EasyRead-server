/**
 * The vertical plan's explainer test piece (studio-vertical-plan §9.2),
 * "how a vaccine trains the immune system", composed from its hand-written
 * sheets in both shapes: no model asked, nothing voiced. Writes each scene
 * to <out dir>/vaccine-s<n>[-tall]/scene.json for the stage lab
 * (/dev/stage?scene=vaccine-s1&tall=1&safe=1), and reports the tall
 * text checks (scene-lesson-check). --adolescent and --water add the
 * Adolescent Health film and the water-cycle build.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/vertical-lesson.ts <out dir> [--adolescent] [--water]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeVaccine } from '../src/business/domain/studio/__fixtures__/vaccine';
import { composeAdolescentFilm } from '../src/business/domain/studio/__fixtures__/adolescent-health';
import { composeWaterBuild } from '../src/business/domain/__fixtures__/water-cycle-scenes';
import { lessonTextFaults } from '../src/business/domain/scene-lesson-check';

async function main() {
  const out =
    process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'scene-out';
  // --adolescent: the Adolescent Health film too (its sheets as made), as ah-s<n>.
  const pieces: [
    string,
    (shape: 'wide' | 'tall') => ReturnType<typeof composeVaccine>,
  ][] = [
    ['vaccine', composeVaccine],
    ...(process.argv.includes('--adolescent')
      ? [
          [
            'ah',
            (shape: 'wide' | 'tall') => composeAdolescentFilm(undefined, shape),
          ] as [string, typeof composeVaccine],
        ]
      : []),
    // --water: the water-cycle build (its board), as water-s<n>.
    ...(process.argv.includes('--water')
      ? [
          [
            'water',
            (shape: 'wide' | 'tall') =>
              composeWaterBuild(shape) as unknown as ReturnType<
                typeof composeVaccine
              >,
          ] as [string, typeof composeVaccine],
        ]
      : []),
  ];
  for (const [name, compose] of pieces)
    for (const shape of ['wide', 'tall'] as const) {
      const film = await compose(shape);
      film.forEach((one, i) => {
        const dir = join(
          out,
          `${name}-s${i + 1}${shape === 'tall' ? '-tall' : ''}`,
        );
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'scene.json'), JSON.stringify(one.scene));
        const faults = lessonTextFaults(one.scene);
        const audit = one.audit.wide.flat();
        console.log(
          `${name} ${shape} s${i + 1} "${one.scene.title}": ${one.scene.steps.length} steps; audit ${audit.length ? audit.map((c) => `${c.kind} ${c.a}/${c.b}`).join('; ') : 'clear'}; text ${faults.length ? faults.map((f) => f.message).join('; ') : 'clear'}`,
        );
        if (one.staging.length)
          console.log(`  staging: ${one.staging.join(' | ')}`);
      });
    }
}

void main();
