/**
 * How a Studio explainer's picture moves and its text is read, for whom it
 * is made (studio-explainer-plan, Ask 3): the audience recipe's reading
 * rate and card length (studio-audience, E2) and its motion, leaned by the
 * maker's pace (E1's motion factor), as the scene carries them to the
 * player (SceneDto.reading) and as the text is paced by code before the
 * scene is stored (scene-reading).
 */
import type { SceneReading } from '../scene-reading';
import type { StudioBrief } from './studio';
import { profileOf, recipeFor } from './studio-audience';

/** The slowest and quickest a picture moves, against a grown-up's. */
export const MOTION_RANGE: readonly [number, number] = [0.7, 1.1];

/**
 * A picture's motion for whom it is made: its audience's (the recipe's,
 * a young child's at three quarters of a grown-up's), times the maker's
 * pace's share of it (E1's motion factor over its band's base: 0.93
 * gentle, 1 lively, 1.08 snappy), within MOTION_RANGE. 1 is a grown-up's.
 */
export function motionFor(audience: number, pace = 1): number {
  const [lo, hi] = MOTION_RANGE;
  return Math.round(Math.min(hi, Math.max(lo, audience * pace)) * 100) / 100;
}

/**
 * How an explainer's text is read and its picture moves, from its brief:
 * its audience's reading rate, card length and motion, the maker's pace
 * leaning the motion (`pace`, E1's; 1 until it is passed). A brief with no
 * audience is for anyone grown up.
 */
export function studioReading(
  brief: Pick<StudioBrief, 'audience' | 'who'>,
  pace = 1,
): SceneReading {
  const who = profileOf(brief);
  const recipe = recipeFor(who ?? { band: 'general-adult' });
  return {
    wpm: recipe.readWpm,
    motion: motionFor(recipe.motion, pace),
    cardWords: recipe.cardWords,
  };
}
