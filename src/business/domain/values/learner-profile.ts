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
      'Go slower than you naturally would: smaller pieces, one at a time, repeat the key point in different words. Slow means smaller steps, never longer pauses — keep the lesson moving through them.',
    steady:
      'Keep a steady, natural pace, always moving: land one idea, go to the next.',
    faster:
      'This student chose a fast pace — keep it tight, skip the padding and the recaps, and trust them to interrupt if you lose them.',
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
    less: 'Check in only when you finish a chapter, and never in the opening minutes of one — this student chose to mostly listen. One check at a chapter boundary, then straight on.',
    standard:
      'Check in at most once per topic, AFTER you have finished teaching it — never while the student is still settling into new material.',
    more: 'Quiz and question often — this student learns by doing. Still let each new idea land before the first question about it.',
  },
  written: {
    // Chat's analogue of quizzing: a single check-question, or none at all.
    less: 'Do not end with check-questions.',
    standard: 'Occasionally end with one short question when it would help.',
    more: 'End with one short check-question that tests the idea just explained.',
  },
};

/**
 * Check-ins must sound human whatever the dials say. The continuation
 * order that used to live here ("keep teaching continuously, never stop")
 * moved into the teach-mode instructions, where the auto-continue engine
 * exists to honour it — here it reached Q&A calls with no engine, and
 * worse, it taught the tutor to talk through its own questions.
 */
const NATURAL_CHECKS =
  'When you check in or ask anything, use your own words and vary them; repeating one stock phrase like "are you still with me" makes you sound like a recording. After you ask, stop speaking and give them real time.';

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
    register === 'spoken' ? `- ${NATURAL_CHECKS}` : null,
    profile.styleNotes
      ? register === 'spoken'
        ? `- Observed: ${profile.styleNotes}`
        : `- What has worked for this reader before: ${profile.styleNotes}. Use it.`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}
