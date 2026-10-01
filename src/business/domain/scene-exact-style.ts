/**
 * What the exact pictures code draws share (flags, flows, molecules):
 * the room each is drawn for in a film of each shape, the smallest text
 * its audience reads, and how its words are broken to fit. Each is drawn
 * in stage units for that room, so the text it is drawn with is the text
 * a learner sees when it stands alone on the stage.
 */
import { measureText } from './scene-font';
import type { FilmShape } from './scene-shape';
import type { LearningStage } from './scene-stage';
import { AUDIENCE_RECIPES, STAGE_BAND } from './studio/studio-audience';

/**
 * The room one picture takes when it stands alone on the stage, in
 * stage units: a wide film's stage less its margins and its caption; a
 * tall film's text area less its caption (scene-shape textAreaOf).
 */
export const EXACT_ROOM: Readonly<Record<FilmShape, { w: number; h: number }>> =
  {
    wide: { w: 1400, h: 620 },
    tall: { w: 720, h: 780 },
  };

/** A grown-up's smallest text on the stage (AUDIENCE_RECIPES' adults), for a page whose audience is not known. */
export const TEXT_FLOOR = 32;

/** The smallest text an audience reads on the stage, by its learning stage (the audience recipe's textSize). */
export function textFloorOf(stage: LearningStage | null | undefined): number {
  return stage ? AUDIENCE_RECIPES[STAGE_BAND[stage]].textSize : TEXT_FLOOR;
}

export const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Words broken into lines inside a width, at most `most` of them, the
 * last cut short with an ellipsis; a single word wider than the width
 * keeps its own line.
 */
export function wrapWords(
  text: string,
  width: number,
  size: number,
  most = 3,
  weight: 600 | 700 = 600,
): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && measureText(next, size, weight) > width) {
      out.push(current);
      current = word;
    } else current = next;
  }
  if (current) out.push(current);
  if (out.length <= most) return out;
  let last = out.slice(most - 1).join(' ');
  while (last.length > 1 && measureText(`${last}…`, size, weight) > width)
    last = last.slice(0, -1);
  return [...out.slice(0, most - 1), `${last.trimEnd()}…`];
}

/** The widest of some lines, as set. */
export const widest = (
  lines: readonly string[],
  size: number,
  weight: 600 | 700 = 600,
) => Math.max(0, ...lines.map((line) => measureText(line, size, weight)));
