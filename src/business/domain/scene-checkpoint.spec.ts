import { choicesOf, ideaLabel, ideaStarts } from './scene-checkpoint';
import { mendScript, type SceneScriptDraft } from './scene-script';

/**
 * A question's answers and a scene's ideas (studio-explainer-plan, Ask 9,
 * ideas 1 and 2): the answers made sound by code or dropped, and where
 * each small idea starts found in the sentences.
 */
describe('choicesOf', () => {
  const two = [
    { text: 'Night', right: true },
    { text: 'Day as well', right: false },
  ];

  it('keeps two or three short answers with exactly one right, on a question only', () => {
    expect(choicesOf(two, 'question')).toEqual(two);
    expect(choicesOf(two, 'explain')).toBeUndefined();
    expect(choicesOf(null, 'question')).toBeUndefined();
  });

  it('drops answers with none or two right, or with no wrong one', () => {
    expect(
      choicesOf(
        [
          { text: 'A', right: false },
          { text: 'B', right: false },
        ],
        'question',
      ),
    ).toBeUndefined();
    expect(
      choicesOf(
        [
          { text: 'A', right: true },
          { text: 'B', right: true },
        ],
        'question',
      ),
    ).toBeUndefined();
    expect(choicesOf([{ text: 'A', right: true }], 'question')).toBeUndefined();
  });

  it('cuts a long answer to a chip, drops empty and repeated ones, and keeps three at most with the right one', () => {
    const kept = choicesOf(
      [
        { text: 'The first wrong one', right: false },
        { text: '  ', right: false },
        { text: 'the first wrong one.', right: false },
        {
          text: 'Because the Earth keeps on spinning round and round all day',
          right: true,
        },
        { text: 'Another wrong one', right: false },
        { text: 'A third wrong one', right: false },
      ],
      'question',
    );
    expect(kept).toEqual([
      { text: 'The first wrong one', right: false },
      { text: 'Because the Earth keeps on spinning round', right: true },
      { text: 'Another wrong one', right: false },
    ]);
  });
});

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

describe('a draft with a question, mended', () => {
  const draft = (beats: SceneScriptDraft['beats']): SceneScriptDraft => ({
    fit: 'good',
    fitReason: null,
    title: 'Day and night',
    mood: 'curious',
    beats,
    cast: [],
    steps: [],
  });

  it('keeps the answers on a question with a sentence after it, and on nothing else', () => {
    const { script } = mendScript(
      draft([
        {
          say: 'What is it on the other side?',
          pause: 'long',
          delivery: 'question',
          choices: [
            { text: 'Night', right: true },
            { text: 'Day', right: false },
          ],
        },
        {
          say: 'It is night there.',
          pause: 'long',
          delivery: 'explain',
          choices: [
            { text: 'x', right: true },
            { text: 'y', right: false },
          ],
        },
      ]),
    );
    expect(script.beats[0].choices).toEqual([
      { text: 'Night', right: true },
      { text: 'Day', right: false },
    ]);
    expect(script.beats[1].choices).toBeUndefined();
  });

  it('drops the answers of a question that ends the scene: nothing says which is right', () => {
    const { script } = mendScript(
      draft([
        { say: 'The Earth spins.', pause: 'short', delivery: 'explain' },
        {
          say: 'What is it on the other side?',
          pause: 'long',
          delivery: 'question',
          choices: [
            { text: 'Night', right: true },
            { text: 'Day', right: false },
          ],
        },
      ]),
    );
    expect(script.beats[1].choices).toBeUndefined();
  });
});
