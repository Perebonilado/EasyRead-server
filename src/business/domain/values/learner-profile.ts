import type { LearnerProfileRecord } from '../../repositories/learning.repository';

/**
 * The learner profile, rendered as standing orders for a model.
 *
 * This block is what the adaptive loop actually changes: the tutor's tool
 * calls and the auto-adjust reflex both end up here — on the next session,
 * and (because the voice client re-sends instructions on every page turn)
 * within the current one.
 *
 * Two registers, because the same dial reads differently spoken and written:
 * a voice tutor "goes slower"; a chat answer "explains in smaller steps, one
 * idea per paragraph". The dials and their meanings are identical — only the
 * verbs change.
 */
export type ProfileRegister = 'spoken' | 'written';

const PACE: Record<
  ProfileRegister,
  Record<LearnerProfileRecord['pace'], string>
> = {
  spoken: {
    slower:
      'Go slower than you naturally would: smaller pieces, one at a time, repeat the key point in different words.',
    steady: 'Keep a steady, natural pace.',
    faster: 'This student moves quickly — keep it tight and skip the padding.',
  },
  written: {
    slower:
      'Explain in small steps, one idea per paragraph, and restate the key point in different words at the end.',
    steady: 'Explain at a natural length.',
    faster: 'Be brief. Lead with the answer; skip the warm-up.',
  },
};

const DEPTH: Record<
  ProfileRegister,
  Record<LearnerProfileRecord['depth'], string>
> = {
  spoken: {
    lighter: 'Stay at main ideas; only unpack when they ask.',
    standard: 'Unpack concepts normally.',
    deeper:
      'Break everything further down than feels necessary; assume gaps in the foundations.',
  },
  written: {
    lighter: 'Stay at the main idea unless asked to go deeper.',
    standard: 'Unpack concepts normally.',
    deeper:
      'Break concepts further down than seems necessary; assume gaps in the foundations and fill them without being asked.',
  },
};

const INTERACTIVITY: Record<
  ProfileRegister,
  Record<LearnerProfileRecord['interactivity'], string>
> = {
  spoken: {
    less: 'Check in sparingly — this student prefers to listen.',
    standard: 'Check in regularly.',
    more: 'Quiz and question constantly — this student learns by doing.',
  },
  written: {
    // Chat's analogue of quizzing: a single check-question, or none at all.
    less: 'Do not end with check-questions.',
    standard: 'Occasionally end with one short question when it would help.',
    more: 'End with one short check-question that tests the idea just explained.',
  },
};

export function profileInstructions(
  profile: LearnerProfileRecord,
  register: ProfileRegister = 'spoken',
): string {
  return [
    register === 'spoken'
      ? 'How THIS student learns (apply it, it overrides your default style):'
      : 'How THIS reader learns (shape your FIRST answer to this — do not wait to be told an explanation did not land):',
    `- ${PACE[register][profile.pace]}`,
    `- ${DEPTH[register][profile.depth]}`,
    `- ${INTERACTIVITY[register][profile.interactivity]}`,
    profile.styleNotes
      ? register === 'spoken'
        ? `- Observed: ${profile.styleNotes}`
        : `- What has worked for this reader before: ${profile.styleNotes}. Use it.`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}
