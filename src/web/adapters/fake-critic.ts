/**
 * The critic, offline (FakeLlmAdapter): an answer read from the call's own
 * parts (shot-critic's criticParts), the same every time, nothing spent.
 * A scene the code checks found no problem in passes, 8.5 on every axis
 * it is asked for; one they found problems in scores 6 on motion, and
 * asks for a camera move on its first shot. Code holds it to the closed
 * lists, as it holds a model's.
 */
import { CRITIC_AXES } from '../../business/domain/studio/explainer-rules';

export function fakeCriticAnswer(
  parts: readonly string[],
): Record<string, unknown> {
  const all = parts.join('\n');
  const shots = [...all.matchAll(/^s(\d+) · /gmu)].map((m) => Number(m[1]));
  const opening = all.includes('It opens the episode');
  const troubled = all.includes('Its problems:');
  const axes = CRITIC_AXES.filter((axis) => opening || axis !== 'hook');
  return {
    scores: axes.map((axis) => ({
      axis,
      score: troubled && axis === 'motion' ? 6 : 8.5,
      why:
        troubled && axis === 'motion'
          ? 'the picture holds still while the voice moves on'
          : 'as planned',
    })),
    fixes:
      troubled && shots.length
        ? [
            {
              kind: 'add-camera',
              shot: shots[0],
              target: null,
              to: 'push',
              note: 'move in on what the voice names',
            },
          ]
        : [],
    verdict: troubled ? 'Holds still too long.' : 'Ready.',
  };
}
