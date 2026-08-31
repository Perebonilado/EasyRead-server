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

describe('the tutor never sounds like a recording', () => {
  const profile = {
    pace: 'steady' as const,
    depth: 'standard' as const,
    interactivity: 'standard' as const,
    styleNotes: null,
    paceSource: 'default' as const,
    depthSource: 'default' as const,
    interactivitySource: 'default' as const,
  };

  it('tells a spoken tutor to stop and give room after asking', () => {
    const spoken = profileInstructions(profile, 'spoken');
    expect(spoken).toMatch(/stop speaking and give them real time/i);
  });

  it('never orders continuous talking here, where no engine backs it', () => {
    // The old "keep teaching continuously" order taught the tutor to talk
    // through its own questions. Continuation now belongs to teach mode's
    // auto-continue engine, not the profile.
    expect(profileInstructions(profile, 'spoken')).not.toMatch(
      /keep teaching continuously/i,
    );
  });

  it('leaves written answers alone: a chat reply has no silence to fill', () => {
    expect(profileInstructions(profile, 'written')).not.toMatch(
      /stop speaking/i,
    );
  });
});
