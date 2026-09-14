import {
  currentChannels,
  currentOverride,
  runWithChannels,
} from './processing-context';

describe('the channels of the job in hand', () => {
  it('are seen down the stack inside a run, and nowhere outside it', async () => {
    expect(currentChannels()).toBeNull();
    const seen = await runWithChannels(
      { text: 'modal', audio: 'openai' },
      { text: 'modal' },
      async () => {
        await Promise.resolve();
        return { channels: currentChannels(), override: currentOverride() };
      },
    );
    expect(seen).toEqual({
      channels: { text: 'modal', audio: 'openai' },
      override: { text: 'modal' },
    });
    expect(currentChannels()).toBeNull();
    expect(currentOverride()).toBeNull();
  });
});
