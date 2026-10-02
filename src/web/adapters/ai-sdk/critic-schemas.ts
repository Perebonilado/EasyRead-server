/**
 * The critic's answer (explainer_critic; explainer-animation-plan §9.3):
 * a score from 1 to 10 with a line why for each axis it is asked for, at
 * most three fixes from the closed list, and a verdict. Flat and lenient,
 * as the Studio's answers are: a value a little wrong is caught as
 * nothing, never the whole answer lost. shot-critic's critiqueOf makes it
 * sound: each score on its axis, each fix on a shot the scene has.
 */
import { z } from 'zod';
import { CRITIC_AXES } from '../../../business/domain/studio/explainer-rules';
import { CRITIC_FIX_KINDS } from '../../../business/domain/shots/shot-critic';

const maybe = () => z.string().nullable().catch(null);

export const shotCriticSchema = z.object({
  scores: z
    .array(
      z.object({
        axis: z
          .enum(CRITIC_AXES as unknown as [string, ...string[]])
          .nullable()
          .catch(null),
        score: z.number().min(1).max(10).nullable().catch(null),
        why: z.string().catch(''),
      }),
    )
    .catch([]),
  fixes: z
    .array(
      z.object({
        kind: z
          .enum(CRITIC_FIX_KINDS as unknown as [string, ...string[]])
          .nullable()
          .catch(null),
        shot: z.number().int().nullable().catch(null),
        target: maybe(),
        to: maybe(),
        note: z.string().catch(''),
      }),
    )
    .catch([]),
  verdict: z.string().catch(''),
});
