/**
 * A creature drawn by the kit (scene-creature), made whole: its body built
 * (scene-creature-body) and drawn as the animal kit draws an animal
 * (scene-animal-draw's `drawBuilt`), with the kit's own eyes (one, two or
 * three), feelings, mouths that talk, blinks and signs, every pose, and
 * the CSS that moves it on the stage's clock.
 */
import { beatOf } from './scene-figure';
import type { SheetFace } from './scene-sheet-face';
import type { CreatureSpec } from './scene-creature';
import {
  drawBuilt,
  type AnimalDrawing,
  type AnimalHow,
} from './scene-animal-draw';
import { LINE } from './scene-animal-body';
import { buildCreature, creatureTall } from './scene-creature-body';

/**
 * A creature drawn from its spec. `seed` (its id) sets when it blinks and
 * breathes, and where its spots fall, the same in every make.
 */
export function drawCreature(
  spec: CreatureSpec,
  seed = '',
  how: AnimalHow = {},
): AnimalDrawing {
  const key = seed || JSON.stringify(spec);
  const id = `c${Math.floor(beatOf(`${key}:id`) * 1e6).toString(36)}`;
  return drawBuilt(buildCreature(spec, id, key), key, id, how);
}

/** A creature's face as a check measures one: its eyes and its mouth, exactly as drawn. */
export function creatureFace(spec: CreatureSpec, seed = ''): SheetFace {
  const drawn = drawCreature(spec, seed);
  return {
    mouth: drawn.anchors.mouth,
    scale: 1,
    line: LINE,
    skin: '#ffffff',
    eyes: drawn.eyes.map((box) => ({ box, lid: '#ffffff' })),
    covered: {},
  };
}

export { creatureTall };
