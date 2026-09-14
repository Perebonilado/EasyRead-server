import {
  channelsForJob,
  followsTextChannel,
  isChannel,
  resolveChannels,
} from './processing';

describe('which work follows the text channel', () => {
  it('is the writing a school prepares, and not the reading, the embedding or the learner-facing tasks', () => {
    for (const task of [
      'summarize',
      'simplify_standard',
      'lecture_outline',
      'lecture_segment',
      'lecture_verify',
    ] as const) {
      expect(followsTextChannel(task)).toBe(true);
    }
    for (const task of [
      'ocr_page',
      'embed',
      'chat_document',
      'highlight_explain',
      'topic_quiz',
      'learn_write',
    ] as const) {
      expect(followsTextChannel(task)).toBe(false);
    }
  });
});

describe('the channels a job runs on', () => {
  const setting = { text: 'modal', audio: 'openai' } as const;

  it("keeps a learner's own document on OpenAI whatever is set", () => {
    expect(channelsForJob({ school: false, setting })).toEqual({
      text: 'openai',
      audio: 'openai',
    });
    expect(
      channelsForJob({ school: false, setting, override: { text: 'modal' } }),
    ).toEqual({ text: 'openai', audio: 'openai' });
  });

  it("gives a school's document the setting, and the run's own choice over it", () => {
    expect(channelsForJob({ school: true, setting })).toEqual(setting);
    expect(
      channelsForJob({ school: true, setting, override: { audio: 'modal' } }),
    ).toEqual({ text: 'modal', audio: 'modal' });
    expect(resolveChannels(setting, { text: 'openai' })).toEqual({
      text: 'openai',
      audio: 'openai',
    });
    expect(resolveChannels(setting, null)).toEqual(setting);
  });

  it('knows a channel from a stray word', () => {
    expect(isChannel('openai')).toBe(true);
    expect(isChannel('modal')).toBe(true);
    expect(isChannel('groq')).toBe(false);
    expect(isChannel(undefined)).toBe(false);
  });
});
