/**
 * The glitch checks (studio-glitch-plan) over a film's scenes: the flicker
 * check (every stage held long enough to see), the text check (words on
 * words or on things, standing and in passing) and whether each drawing
 * shows what its label says. No model, no database, nothing stored.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/studio-film-check.ts --fixture <out dir>
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/studio-film-check.ts --made <file>.json ...
 *
 * --fixture composes "Adolescent Health Medicine: Five Foundations" from
 * its saved sheets, voice and drawings as the Studio composes it now
 * (domain/studio/__fixtures__/adolescent-health), writes each scene to
 * <out dir>/glitch-after-s<n>/scene.json for the stage lab, and reports.
 * --made reports on scenes as they were made (their scene.json files),
 * arrivals timed as the player timed them before they waited for room.
 * Prints the report, and writes it as report.json beside the scenes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SceneDto } from '../src/contracts';
import {
  ADOLESCENT_FILM,
  composeAdolescentFilm,
} from '../src/business/domain/studio/__fixtures__/adolescent-health';
import { pictureMismatches } from '../src/business/domain/studio/studio-check';
import {
  flickersOf,
  holdMsOf,
  readingOf,
} from '../src/business/domain/scene-reading';
import {
  passingOverlaps,
  standingOverlaps,
} from '../src/business/domain/scene-text-check';

interface Report {
  scene: number;
  title: string;
  flickers: ReturnType<typeof flickersOf>;
  standing: ReturnType<typeof standingOverlaps>;
  passing: ReturnType<typeof passingOverlaps>;
  /** Drawings that are not what their labels say, as the scene shows them. */
  pictures: ReturnType<typeof pictureMismatches>;
  /** Those the sheet drew wrong that the scene shows as their label in type. */
  setInType: string[];
  words?: Record<string, unknown>;
}

/** A sheet's wrong pictures split into those still drawn and those set in type. */
function pictured(
  scene: SceneDto,
  wrong: ReturnType<typeof pictureMismatches>,
): Pick<Report, 'pictures' | 'setInType'> {
  const kind = (id: string) => scene.things.find((t) => t.id === id)?.kind;
  return {
    pictures: wrong.filter((one) => kind(one.id) === 'drawing'),
    setInType: wrong
      .filter((one) => kind(one.id) === 'words')
      .map((one) => `${one.id} "${one.name}"`),
  };
}

function reportOf(
  scene: SceneDto,
  n: number,
  room: boolean,
  words?: Record<string, unknown>,
): Report {
  const reading = readingOf(scene);
  const sheet = ADOLESCENT_FILM.scenes[n]?.sheet;
  return {
    scene: n + 1,
    title: scene.title,
    flickers: flickersOf(scene, holdMsOf(reading)),
    standing: [
      ...standingOverlaps(scene, 'box'),
      ...standingOverlaps(scene, 'wide'),
    ],
    passing: passingOverlaps(scene, reading, room),
    ...pictured(scene, sheet ? pictureMismatches(sheet) : []),
    ...(words && Object.keys(words).length ? { words } : {}),
  };
}

function print(reports: Report[]): void {
  for (const r of reports) {
    console.log(`scene ${r.scene} "${r.title}"`);
    console.log(
      `  flicker: ${r.flickers.length ? r.flickers.map((f) => `${f.kind} ${f.what} at ${f.atMs}ms held ${f.heldMs}ms`).join('; ') : 'none'}`,
    );
    console.log(
      `  words standing: ${r.standing.length ? r.standing.map((o) => `${o.staging} step ${o.step} ${o.kind} ${o.a} / ${o.b}`).join('; ') : 'none'}`,
    );
    console.log(
      `  words in passing: ${r.passing.length ? r.passing.map((o) => `step ${o.step} at ${o.atMs}ms ${o.a} over ${o.b}`).join('; ') : 'none'}`,
    );
    console.log(
      `  pictures against labels: ${r.pictures.length ? r.pictures.map((p) => `${p.id} "${p.name}" (${p.why} ${p.with})`).join('; ') : 'all agree'}`,
    );
    if (r.setInType.length)
      console.log(`  set in type, not drawn: ${r.setInType.join('; ')}`);
    if (r.words)
      console.log(`  drawn words set clear: ${JSON.stringify(r.words)}`);
  }
  const sum = (f: (r: Report) => number) =>
    reports.reduce((n, r) => n + f(r), 0);
  console.log(
    `film: ${sum((r) => r.flickers.length)} flickers, ${sum((r) => r.standing.length)} words standing on words or things, ${sum((r) => r.passing.length)} in passing, ${sum((r) => r.pictures.length)} pictures not what their labels say`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--fixture') {
    const out = args[1];
    if (!out) throw new Error('Say where to write: --fixture <out dir>');
    const made = await composeAdolescentFilm();
    const reports = made.map((one, n) => {
      const dir = join(out, `glitch-after-s${n}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'scene.json'), JSON.stringify(one.scene));
      for (const note of one.pacing) console.log(`s${n}: ${note}`);
      const audit = [...one.audit.box.flat(), ...one.audit.wide.flat()];
      if (audit.length)
        console.log(
          `s${n}: compose audit: ${audit.map((c) => `${c.kind} ${c.a} / ${c.b}`).join('; ')}`,
        );
      return reportOf(one.scene, n, true, one.words);
    });
    print(reports);
    writeFileSync(join(out, 'report.json'), JSON.stringify(reports, null, 1));
    return;
  }
  if (args[0] === '--made') {
    const files = args.slice(1);
    const reports = files.map((file, n) =>
      reportOf(JSON.parse(readFileSync(file, 'utf8')) as SceneDto, n, false),
    );
    print(reports);
    writeFileSync(
      join(dirname(files[0]), 'report.json'),
      JSON.stringify(reports, null, 1),
    );
    return;
  }
  throw new Error('Use --fixture <out dir> or --made <scene.json> ...');
}

main().catch((error: Error) => {
  console.error(error);
  process.exit(1);
});
