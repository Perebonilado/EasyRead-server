/**
 * The checks by code for a tall film's words (studio-vertical-plan §6.2
 * and §6.4), written with the tall lessons (V2) for V4 to run over every
 * film: pure functions of the SceneDto, as the text check's.
 *
 *  - In the safe zone: every run of words the stage sets (a caption, a
 *    card, a stat, a label, an arrow's label), where the camera shows it
 *    at each step, lies inside the frame's safe rectangle (scene-shape
 *    SAFE: clear of TikTok's, Shorts' and Reels' own buttons and
 *    captions) and clear of the subtitles' band, which a tall film always
 *    keeps, subtitles on or off.
 *  - Large enough: its size, times the camera's scale then, is at least
 *    READ_LEAST (40 units in a tall film: 48 px on a 1080-wide frame).
 *
 * A wide film has no platform overlay worth composing round (§5.1), so
 * the first is a tall film's alone; the second is measured in either
 * shape, at the shape's own least.
 */
import type { SceneDto } from '../../contracts';
import { READ_LEAST } from './scene-lesson-shape';
import { SAFE, SUBTITLE_BAND, shapeOf } from './scene-shape';
import { wordsAt, type WordsBox } from './scene-text-check';

type Box = { x: number; y: number; w: number; h: number };

/** A run of words where a tall film should not have it. */
export interface LessonTextFault {
  step: number;
  atMs: number;
  /** Whose words, and which. */
  owner: string;
  what: WordsBox['what'];
  /** `unsafe`: out of the safe rectangle; `subtitles`: in the subtitles' band; `small`: smaller than may be read. */
  kind: 'unsafe' | 'subtitles' | 'small';
  message: string;
}

/** A hair's slack, in stage units, so a box on the line is in. */
const HAIR = 1;

/** Where the camera looks at a step, as a box of the stage: a build's board view, else the whole stage. */
export function viewAtStep(scene: Pick<SceneDto, 'stagings'>, k: number): Box {
  const stage = scene.stagings.wide;
  const view = stage.views?.[k];
  return view
    ? { x: view[0], y: view[1], w: view[2], h: view[3] }
    : { x: 0, y: 0, w: stage.w, h: stage.h };
}

/** A box on the stage as the frame shows it through a view. */
const onFrame = (box: Box, view: Box, W: number): Box => {
  const s = W / view.w;
  return {
    x: (box.x - view.x) * s,
    y: (box.y - view.y) * s,
    w: box.w * s,
    h: box.h * s,
  };
};

const inside = (box: Box, room: Box) =>
  box.x >= room.x - HAIR &&
  box.y >= room.y - HAIR &&
  box.x + box.w <= room.x + room.w + HAIR &&
  box.y + box.h <= room.y + room.h + HAIR;

const seenIn = (box: Box, W: number, H: number) =>
  box.x < W && box.y < H && box.x + box.w > 0 && box.y + box.h > 0;

/** Every run of words out of a tall frame's safe rectangle, in its subtitles' band, or too small to read, step by step. */
export function lessonTextFaults(
  scene: Pick<SceneDto, 'things' | 'steps' | 'stagings' | 'shape'>,
): LessonTextFault[] {
  const shape = shapeOf(scene);
  const { w: W, h: H } = scene.stagings.wide;
  const safe = SAFE[shape];
  const room: Box = {
    x: W * safe.left,
    y: H * safe.top,
    w: W * (1 - safe.left - safe.right),
    h: H * (1 - safe.top - safe.bottom),
  };
  const band = SUBTITLE_BAND[shape];
  const least = READ_LEAST[shape];
  const out: LessonTextFault[] = [];
  scene.steps.forEach((step, k) => {
    const view = viewAtStep(scene, k);
    const scale = W / view.w;
    for (const words of wordsAt(scene, 'wide', k)) {
      const box = onFrame(words.box, view, W);
      if (!seenIn(box, W, H)) continue;
      const fault = (kind: LessonTextFault['kind'], message: string) =>
        out.push({
          step: k,
          atMs: step.atMs,
          owner: words.owner,
          what: words.what,
          kind,
          message: `step ${k + 1}: ${words.owner}'s ${words.what} "${words.text.slice(0, 32)}" ${message}`,
        });
      if (shape === 'tall') {
        if (!inside(box, room))
          fault('unsafe', 'is outside the safe rectangle');
        else if (box.y + box.h > H * band.from + HAIR)
          fault('subtitles', "reaches into the subtitles' band");
      }
      const seen = Math.round(words.size * scale * 10) / 10;
      if (seen < least) fault('small', `is set at ${seen}, under ${least}`);
    }
  });
  return out;
}
