import { profileInstructions } from './learner-profile';
import { DEFAULT_LEARNER_PROFILE } from '../../repositories/learning.repository';

describe('profileInstructions', () => {
  it('speaks to a tutor and writes to a chat differently for the same dials', () => {
    const profile = {
      ...DEFAULT_LEARNER_PROFILE,
      pace: 'slower' as const,
      depth: 'deeper' as const,
    };
    const spoken = profileInstructions(profile, 'spoken');
    const written = profileInstructions(profile, 'written');

    expect(spoken).toContain('Go slower than you naturally would');
    expect(written).toContain('one idea per paragraph');
    // Same meaning, different register — never the same sentence.
    expect(spoken).not.toBe(written);
  });

  it('tells the chat to shape the FIRST answer', () => {
    expect(profileInstructions(DEFAULT_LEARNER_PROFILE, 'written')).toContain(
      'FIRST answer',
    );
  });

  it('keeps interactivity meaningful in writing: check-questions, not quizzes', () => {
    const more = profileInstructions(
      { ...DEFAULT_LEARNER_PROFILE, interactivity: 'more' },
      'written',
    );
    const less = profileInstructions(
      { ...DEFAULT_LEARNER_PROFILE, interactivity: 'less' },
      'written',
    );
    expect(more).toContain('check-question');
    expect(less).toContain('Do not end with check-questions');
  });

  it('carries style notes in both registers', () => {
    const profile = {
      ...DEFAULT_LEARNER_PROFILE,
      styleNotes: 'clinical anecdotes land well',
    };
    expect(profileInstructions(profile, 'spoken')).toContain(
      'clinical anecdotes',
    );
    expect(profileInstructions(profile, 'written')).toContain(
      'clinical anecdotes',
    );
  });

  it('defaults to the spoken register (the voice tutor came first)', () => {
    expect(profileInstructions(DEFAULT_LEARNER_PROFILE)).toContain(
      'THIS student',
    );
  });
});
