import { sceneScriptSchema } from './schemas';
import { studioOutlineSchema } from './studio-schemas';

/**
 * The E9 fields a writer fills (studio-explainer-plan, Ask 9): "What
 * next?" on the outline. The lesson writer is no longer asked for a
 * question's answers to pick; an answer that still carries them parses,
 * with them left out. An answer that leaves "What next?" out still
 * parses, as the older answers do.
 */
describe('the E9 fields of the writers’ schemas', () => {
  it("leaves a question's answers to pick out of the lesson writer's sentences", () => {
    const parsed = sceneScriptSchema.parse({
      fit: 'good',
      fitReason: null,
      title: 'Day and night',
      mood: 'curious',
      cast: [],
      steps: [],
      beats: [
        {
          say: 'What is it on the other side?',
          pause: 'long',
          delivery: 'question',
          speaker: null,
          music: null,
          energy: null,
          choices: [
            { text: 'Night', right: true },
            { text: 'Day', right: false },
          ],
        },
      ],
    });
    expect(parsed.beats[0].delivery).toBe('question');
    expect(parsed.beats[0]).not.toHaveProperty('choices');
  });

  it('takes "What next?" on an outline, and none', () => {
    const outline = { title: 'A', logline: 'B', scenes: [] };
    expect(
      studioOutlineSchema.parse({ ...outline, next: ['Why?', 'How?'] }).next,
    ).toEqual(['Why?', 'How?']);
    expect(studioOutlineSchema.parse(outline).next).toEqual([]);
  });
});
