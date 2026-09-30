import { ideaLabel, ideaStarts } from './scene-ideas';
import { mendScript, type SceneScriptDraft } from './scene-script';

/**
 * A scene's ideas (studio-explainer-plan, Ask 9, idea 2): where each small
 * idea starts, found in the sentences.
 */
describe('ideaStarts', () => {
  const beats = [
    {
      say: 'Have you ever wondered where the Sun goes at night?',
      pause: 'long' as const,
    },
    { say: 'The Sun does not go anywhere.', pause: 'short' as const },
    { say: 'It is our Earth that spins.', pause: 'short' as const },
    { say: 'It makes one whole turn every day.', pause: 'long' as const },
    { say: 'The side facing the Sun has day.', pause: 'short' as const },
  ];

  it('finds each point where it is first taught, in order, the first at the scene start', () => {
    expect(
      ideaStarts(beats, [
        'The Sun stays put: a big warm light',
        'The Earth spins: one whole turn every day',
        'The day side faces the Sun',
      ]),
    ).toEqual([
      { beat: 0, label: 'The Sun stays put' },
      { beat: 2, label: 'The Earth spins' },
      { beat: 4, label: 'The day side faces the Sun' },
    ]);
  });

  it('falls back on the long pauses where too few points are found, labelled by their first words', () => {
    expect(ideaStarts(beats, ['Photosynthesis: a leaf'])).toEqual([
      { beat: 0, label: 'Have you ever wondered where the…' },
      { beat: 1, label: 'The Sun does not go anywhere' },
      { beat: 4, label: 'The side facing the Sun has…' },
    ]);
  });

  it('keeps an idea where it is taught when the first point is not found, the scene start its own', () => {
    expect(
      ideaStarts(beats, [
        'Photosynthesis: a leaf',
        'The Earth spins',
        'Day side: the Sun',
      ]),
    ).toEqual([
      { beat: 0, label: 'Photosynthesis' },
      { beat: 2, label: 'The Earth spins' },
      { beat: 4, label: 'Day side' },
    ]);
  });

  it('is one idea for a scene of one sentence, and none for no sentences', () => {
    expect(ideaStarts([{ say: 'Hello there.' }], [], 'Greeting')).toEqual([
      { beat: 0, label: 'Hello there' },
    ]);
    expect(ideaStarts([], ['a'])).toEqual([]);
  });

  it('labels a point by its idea, not what to show for it, and cuts a long one', () => {
    expect(ideaLabel("Newton's second law: the working F = ma")).toBe(
      "Newton's second law",
    );
    expect(
      ideaLabel('a'.repeat(30) + ' ' + 'b'.repeat(40)).length,
    ).toBeLessThanOrEqual(60);
  });
});

describe('a draft written when questions carried answers to pick', () => {
  it('is mended with its question a plain spoken one, its answers ignored', () => {
    const draft = {
      fit: 'good',
      fitReason: null,
      title: 'Day and night',
      mood: 'curious',
      beats: [
        {
          say: 'What is it on the other side?',
          pause: 'long',
          delivery: 'question',
          choices: [
            { text: 'Night', right: true },
            { text: 'Day', right: false },
          ],
        },
        { say: 'It is night there.', pause: 'long', delivery: 'explain' },
      ],
      cast: [],
      steps: [],
    } as unknown as SceneScriptDraft;
    const { script } = mendScript(draft);
    expect(script.beats[0].delivery).toBe('question');
    expect(script.beats[0]).not.toHaveProperty('choices');
    expect(script.beats[1].say).toBe('It is night there.');
  });
});
