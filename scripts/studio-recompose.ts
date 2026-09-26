/**
 * A Studio scene put together again from the parts it was made from, with
 * no model and no voice: for working on the stage (the layout, the crowd,
 * the camera) against a real film.
 *
 *   npm run studio:remake -- <episodeId> --scenes 2 --out <dir>
 *   npm run studio:recompose -- <dir>/scene-parts.json [<out dir>]
 *
 * Writes scene.json to the out dir (the parts' own folder when none is
 * given, beside its audio.mp3) and prints what the frame audit found and
 * what the crowd came to. A set kept before its ground was measured is
 * measured here, once per run, from the parts' own drawing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SceneTiming } from '../src/contracts';
import { drawByCode } from '../src/business/domain/scene-code';
import { CROWD_ID, composeScene } from '../src/business/domain/scene-compose';
import { measureGround } from '../src/business/domain/scene-ground';
import type { DocumentProfile } from '../src/business/domain/scene-profile';
import {
  SCENE_GENERATOR_VERSION,
  isCodeThing,
  type SceneScript,
} from '../src/business/domain/scene-script';
import type { GatedDrawing } from '../src/business/domain/scene-svg';
import type { TimedBeat } from '../src/business/domain/scene-timing';

/** What the processor keeps when SCENE_KEEP_PARTS is set. */
interface Parts {
  script: SceneScript;
  drawings: [string, GatedDrawing | null][];
  beats: TimedBeat[];
  durationMs: number;
  timing: SceneTiming;
  profile?: (DocumentProfile & { film?: boolean }) | null;
  /** The show's own key, when kept after crowds were seeded by it. */
  key?: string | null;
}

const [partsFile, outArg] = process.argv.slice(2);
if (!partsFile) {
  console.error('npm run studio:recompose -- <parts.json> [<out dir>]');
  process.exit(2);
}

async function main(): Promise<void> {
  const parts = JSON.parse(readFileSync(partsFile, 'utf8')) as Parts;
  const out = outArg ?? dirname(partsFile);
  const drawings = new Map(parts.drawings);
  for (const thing of parts.script.cast) {
    if (isCodeThing(thing))
      drawings.set(thing.id, await drawByCode(thing).catch(() => null));
    // A place's ground, where the parts were kept without it.
    const drawing = drawings.get(thing.id);
    if (thing.kind === 'place' && drawing && !drawing.ground) {
      const ground = await measureGround(drawing);
      if (ground) drawings.set(thing.id, { ...drawing, ground });
      else console.warn(`${thing.id}: its ground could not be measured`);
    }
  }
  const { scene, audit } = composeScene({
    script: parts.script,
    drawings,
    beats: parts.beats,
    durationMs: parts.durationMs,
    timing: parts.timing,
    generator: SCENE_GENERATOR_VERSION,
    profile: parts.profile ?? null,
    key: parts.key ?? null,
  });
  writeFileSync(join(out, 'scene.json'), JSON.stringify(scene, null, 2));
  for (const staging of ['box', 'wide'] as const) {
    const found = audit[staging].flat();
    console.log(
      `${staging}: ${found.length} found${found.length ? `: ${found.map((c) => `${c.kind} ${c.a} / ${c.b}`).join('; ')}` : ''}`,
    );
  }
  const crowd = scene.things.find((t) => t.id === CROWD_ID);
  if (crowd?.kind === 'drawing')
    console.log(
      `crowd: ${(crowd.svg.match(/<svg x=/g) ?? []).length} people, ${Math.round(crowd.svg.length / 1024)} KB, in ${scene.setting?.crowd?.place ?? 'no place'}`,
    );
  console.log(`→ ${join(out, 'scene.json')}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
