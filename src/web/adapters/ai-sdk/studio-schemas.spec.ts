import { sceneScriptSchema } from './schemas';
import { studioOutlineSchema, studioTeachBackSchema } from './studio-schemas';

/**
 * The E9 fields a writer fills (studio-explainer-plan, Ask 9): a
 * question's answers on the lesson writer's sentences, "What next?" on the
 * outline, and the teach-back check's verdict. An answer that leaves them
 * out still parses, as the older answers do.
 */
describe('the E9 fields of the writers’ schemas', () => {
  const beat = {
    say: 'What is it on the other side?',
    pause: 'long',
    delivery: 'question',
    speaker: null,
    music: null,
    energy: null,
  };
  const page = {
    fit: 'good',
    fitReason: null,
    title: 'Day and night',
    mood: 'curious',
    cast: [],
    steps: [],
  };

  it("takes a question's answers on a sentence, and a sentence without them", () => {
    const withChoices = sceneScriptSchema.parse({
      ...page,
      beats: [
        {
          ...beat,
          choices: [
            { text: 'Night', right: true },
            { text: 'Day', right: false },
          ],
        },
      ],
    });
    expect(withChoices.beats[0].choices).toHaveLength(2);
    expect(
      sceneScriptSchema.parse({ ...page, beats: [beat] }).beats[0].choices,
    ).toBeNull();
  });

  it('takes "What next?" on an outline, and none', () => {
    const outline = { title: 'A', logline: 'B', scenes: [] };
    expect(
      studioOutlineSchema.parse({ ...outline, next: ['Why?', 'How?'] }).next,
    ).toEqual(['Why?', 'How?']);
    expect(studioOutlineSchema.parse(outline).next).toEqual([]);
  });

  it("takes the teach-back's points by number and its reply", () => {
    expect(
      studioTeachBackSchema.parse({
        got: [1],
        missing: [2, 3],
        reply: 'Nice!',
      }),
    ).toEqual({
      got: [1],
      missing: [2, 3],
      reply: 'Nice!',
    });
  });
});
