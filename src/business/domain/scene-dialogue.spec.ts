import { dialogueOf, quotedSpans, type Speaker } from './scene-dialogue';

const fireside: Speaker[] = [
  { id: 'ada', names: ['Ada'] },
  { id: 'kofi', names: ['Kofi'] },
  { id: 'nana', names: ['Nana Efua', 'Nana', 'Grandma'] },
];

/** Each line as "speaker: words". */
const said = (
  sentences: string[],
  speakers: Speaker[],
  given?: Map<number, string[]>,
) =>
  dialogueOf(sentences, speakers, given).map(
    (line) =>
      `${line.speaker}: ${sentences[line.beat].slice(line.span[0], line.span[1])}`,
  );

describe('who says each line', () => {
  it('finds every speaker on a page the writer marked no one on', () => {
    // As the writer wrote the fire test page, with no speaker on any sentence.
    const page = [
      'It is a warm night, and the stars shine bright above Ada, her brother Kofi, and their grandmother, Nana Efua, as they sit beside a fire outside their house.',
      "Ada asks, 'Tell us a story, Nana.'",
      'But Kofi groans, not wanting to hear the story about the tortoise again.',
      "Nana Efua laughs and promises a new story: 'Tonight I will tell you about the moon.'",
      "Ada is surprised. 'The moon? Does the moon have a story too?'",
      "Nana Efua smiles and shares her wisdom. 'Everything has a story, if you are quiet enough to listen.'",
      "Kofi leans in, eager for the story to begin. 'Then tell it quickly, Nana, before the fire goes out!'",
      "Ada pokes her brother and says, 'Shh, Kofi. Let Nana speak.'",
      "Nana Efua gazes up at the sky and begins the tale. 'Long ago, the moon was not in the sky at all.'",
    ];
    expect(said(page, fireside)).toEqual([
      'ada: Tell us a story, Nana.',
      'nana: Tonight I will tell you about the moon.',
      'ada: The moon? Does the moon have a story too?',
      'nana: Everything has a story, if you are quiet enough to listen.',
      'kofi: Then tell it quickly, Nana, before the fire goes out!',
      'ada: Shh, Kofi. Let Nana speak.',
      'nana: Long ago, the moon was not in the sky at all.',
    ]);
  });

  it('reads a speech verb and a name after the quote, before or after the verb', () => {
    const cast: Speaker[] = [
      { id: 'mira', names: ['Mira'] },
      { id: 'tobi', names: ['Tobi', 'grandfather', 'Grandpa'] },
      { id: 'ember', names: ['Ember', 'the fox'] },
    ];
    expect(
      said(
        [
          '"You are holding the matches upside down," says the fox.',
          '"Mira! You did it!" Tobi shouted.',
          '"Same time tomorrow?" asked Mira, grinning at Tobi.',
          '"Come home," said Mira\'s grandfather.',
        ],
        cast,
      ),
    ).toEqual([
      'ember: You are holding the matches upside down,',
      'tobi: Mira! You did it!',
      'mira: Same time tomorrow?',
      // Never "Mira's": the one who is someone's is not the speaker.
      'tobi: Come home,',
    ]);
  });

  it('gives two characters in one sentence each their own line', () => {
    expect(
      said(
        ['"Ready?" asks Ada. "Always," says Kofi.'],
        fireside,
        // The writer marked the sentence as Ada's: the words say otherwise for the second.
        new Map([[0, ['ada']]]),
      ),
    ).toEqual(['ada: Ready?', 'kofi: Always,']);
    expect(said(['Ada asks, "Ready?" Kofi nods. "Always."'], fireside)).toEqual(
      ['ada: Ready?', 'kofi: Always.'],
    );
  });

  it('carries a speech on through its pause for breath', () => {
    const cast: Speaker[] = [
      { id: 'tobi', names: ['Tobi'] },
      { id: 'mira', names: ['Mira'] },
    ];
    expect(
      said(
        [
          "Tobi chuckled softly. 'Ah,' he said, 'So you've met the old rascal.'",
        ],
        cast,
      ),
    ).toEqual(['tobi: Ah,', "tobi: So you've met the old rascal."]);
  });

  it("takes the writer's word when the sentence names no one", () => {
    expect(
      said(['"We must hurry."'], fireside, new Map([[0, ['kofi']]])),
    ).toEqual(['kofi: We must hurry.']);
    // Nothing to go on: the narrator's.
    expect(said(['"We must hurry."'], fireside)).toEqual([]);
  });

  it('answers in turn, in a conversation of two', () => {
    expect(
      said(
        [
          'Ada asks, "Is it far?"',
          '"Not far," says Kofi.',
          '"Will we be back by dark?"',
        ],
        fireside,
      ),
    ).toEqual([
      'ada: Is it far?',
      'kofi: Not far,',
      'ada: Will we be back by dark?',
    ]);
  });

  it('never takes a name for a common word, or a name inside the quote', () => {
    const cast: Speaker[] = [
      { id: 'rose', names: ['Rose'] },
      { id: 'sam', names: ['Sam'] },
    ];
    expect(said(['As the sun rose, Sam said, "Rose, wake up!"'], cast)).toEqual(
      ['sam: Rose, wake up!'],
    );
  });

  it('keeps apostrophes inside single-quoted lines', () => {
    const text = "'I can't,' says Tobi, 'not tonight.'";
    expect(quotedSpans(text).map(([a, b]) => text.slice(a, b))).toEqual([
      "I can't,",
      'not tonight.',
    ]);
    expect(said([text], [{ id: 'tobi', names: ['Tobi'] }])).toEqual([
      "tobi: I can't,",
      'tobi: not tonight.',
    ]);
  });
});
