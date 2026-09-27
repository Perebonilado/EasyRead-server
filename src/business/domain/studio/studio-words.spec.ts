import { honestReply } from './studio-words';

describe("the producer's reply to a change", () => {
  it('says a change set going is a try, never done', () => {
    expect(
      honestReply(
        "Got it — scene 1 needs fixing so Tobi climbs out of bed. I'm changing that now.",
        'scene',
      ),
    ).toBe(
      "Got it — scene 1 needs fixing so Tobi climbs out of bed. I'll try that and check it.",
    );
    expect(honestReply('Fixed! It is done now.', 'scene')).toBe(
      "I'll try that and check it.",
    );
    expect(honestReply('Trimming scene 2 now.', 'scene', false)).toBe(
      "I'll try that.",
    );
  });

  it('leaves a reply that promises only a try, or starts nothing, as it was', () => {
    const tried =
      "I'll rewrite scene 1 so Tobi climbs out of bed, then make it again and check it.";
    expect(honestReply(tried, 'scene')).toBe(tried);
    expect(honestReply('Done!', 'none')).toBe('Done!');
    expect(honestReply('Writing the outline now.', 'outline')).toBe(
      'Writing the outline now.',
    );
  });
});
