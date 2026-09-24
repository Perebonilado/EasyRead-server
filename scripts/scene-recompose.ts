/**
 * A page put together again from its parts, with no model called: for
 * working on the layout, the labels and the audit.
 *
 *   SCENE_KEEP_PARTS=<dir> npm run scene:page -- <documentId> <page>
 *   npm run scene:recompose -- <dir>/<documentId>-p<page>-parts.json <out dir>
 *
 * Writes scene.json to the out dir (beside the page's audio.mp3, when
 * there is one) and prints what the frame audit found. Working, graphs
 * and passages are drawn again, by code as they always are, so changes
 * to how code draws them show too.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneTiming } from '../src/contracts';
import { drawByCode } from '../src/business/domain/scene-code';
import { composeScene } from '../src/business/domain/scene-compose';
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
}

const [partsFile, out] = process.argv.slice(2);
if (!partsFile || !out) {
  console.error('npm run scene:recompose -- <parts.json> <out dir>');
  process.exit(2);
}
async function main(): Promise<void> {
  const parts = JSON.parse(readFileSync(partsFile, 'utf8')) as Parts;
  const drawings = new Map(parts.drawings);
  for (const thing of parts.script.cast)
    if (isCodeThing(thing))
      drawings.set(thing.id, await drawByCode(thing).catch(() => null));
  const { scene, audit } = composeScene({
    script: parts.script,
    drawings,
    beats: parts.beats,
    durationMs: parts.durationMs,
    timing: parts.timing,
    generator: SCENE_GENERATOR_VERSION,
  });
  writeFileSync(join(out, 'scene.json'), JSON.stringify(scene, null, 2));
  for (const staging of ['box', 'wide'] as const) {
    const found = audit[staging].flat();
    console.log(
      `${staging}: ${found.length} found${found.length ? `: ${found.map((c) => `${c.kind} ${c.a} / ${c.b}`).join('; ')}` : ''}`,
    );
  }
  for (const thing of scene.things)
    if (thing.kind === 'drawing' && thing.callouts)
      console.log(
        `${thing.id}: labels ${Object.values(thing.callouts).join(', ')}`,
      );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
