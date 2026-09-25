import { DEFAULT_PROFILE, describeProfile, profileOf } from './scene-profile';

describe("a document's profile", () => {
  const read = {
    subject: 'biology',
    kind: 'textbook' as const,
    tone: 'neutral' as const,
    formats: [],
    story: false,
  };

  it('keeps the stage the reader was at least likely of, with its reasons', () => {
    expect(
      profileOf({
        ...read,
        stage: 'middle',
        stageSure: 'likely',
        stageWhy: 'JSS Basic Science',
      }),
    ).toMatchObject({ stage: 'middle', stageWhy: 'JSS Basic Science' });
  });

  it('takes an unsure stage, or an unknown one, for none', () => {
    expect(
      profileOf({ ...read, stage: 'higher', stageSure: 'unsure' }).stage,
    ).toBeNull();
    expect(
      profileOf({ ...read, stage: 'grown-ups' as never, stageSure: 'sure' })
        .stage,
    ).toBeNull();
  });

  it('leaves the stage absent on a profile kept before stages, so it is asked', () => {
    expect('stage' in profileOf(read)).toBe(false);
    expect('stage' in DEFAULT_PROFILE).toBe(false);
  });

  it('tells the writer whom the book is for', () => {
    expect(
      describeProfile(
        profileOf({ ...read, stage: 'early', stageSure: 'sure' }),
      ),
    ).toBe(
      'This book: biology, textbook. It is for primary school. Formats you may use on its pages: explainer, and working ("math") on a page that works a calculation.',
    );
    expect(describeProfile(profileOf(read))).toBe(
      'This book: biology, textbook. Formats you may use on its pages: explainer, and working ("math") on a page that works a calculation.',
    );
  });
});
