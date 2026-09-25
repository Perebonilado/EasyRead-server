import {
  dialogueOf,
  heardFrom,
  quotedSpans,
  type Speaker,
} from './scene-dialogue';

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

describe('voices beyond the stage', () => {
  /** Matthew 3:13-17, World English Bible (public domain). */
  const baptism = [
    'Then Jesus came from Galilee to the Jordan to John, to be baptized by him.',
    'But John would have hindered him, saying, “I need to be baptized by you, and you come to me?”',
    'But Jesus, answering, said to him, “Allow it now, for this is the fitting way for us to fulfill all righteousness.”',
    'Then he allowed him.',
    'Behold, a voice out of the heavens said, “This is my beloved Son, with whom I am well pleased.”',
  ];
  const withGod: Speaker[] = [
    { id: 'jesus', names: ['Jesus'] },
    { id: 'john', names: ['John', 'John the Baptist'] },
    { id: 'god', names: ['God', 'the Father'], presence: 'above' },
  ];
  const lines = (sentences: string[], speakers: Speaker[]) =>
    dialogueOf(sentences, speakers).map(
      (line) =>
        `${line.speaker}${line.from ? ` (${line.from})` : ''}: ${sentences[line.beat].slice(line.span[0], line.span[1])}`,
    );

  it('gives a voice from heaven to the one heard from above, never to anyone on the stage', () => {
    expect(lines(baptism, withGod)).toEqual([
      'john: I need to be baptized by you, and you come to me?',
      'jesus: Allow it now, for this is the fitting way for us to fulfill all righteousness.',
      'god (above): This is my beloved Son, with whom I am well pleased.',
    ]);
  });

  it('leaves a voice from heaven to the narrator when no one in the story is heard from above', () => {
    const said = lines(
      baptism,
      withGod.filter((one) => one.id !== 'god'),
    );
    expect(said).toHaveLength(2);
    expect(said.join('\n')).not.toContain('beloved Son');
  });

  it('knows a thought from words said aloud', () => {
    const mira: Speaker[] = [
      { id: 'mira', names: ['Mira'] },
      { id: 'tobi', names: ['Tobi'] },
    ];
    expect(
      lines(
        [
          '“I wish I could fly,” Mira thought.',
          'Mira thought for a moment, then said, “Yes.”',
          'In a small voice, Tobi said, “Sorry.”',
          '“Where did it go?” Tobi wondered aloud.',
        ],
        mira,
      ),
    ).toEqual([
      'mira (thought): I wish I could fly,',
      'mira: Yes.',
      'tobi: Sorry.',
      'tobi: Where did it go?',
    ]);
  });

  it('gives a voice down a phone, a letter and a crowd to whoever the words say', () => {
    const cast: Speaker[] = [
      { id: 'tobi', names: ['Tobi'] },
      { id: 'dad', names: ['Dad'], presence: 'heard' },
      { id: 'grandpa', names: ['Grandpa'] },
      { id: 'crowd', names: ['The crowd', 'the crowd', 'the people'] },
    ];
    expect(
      lines(
        [
          'Dad’s voice crackled over the phone: “I’m on my way.”',
          'Tobi opened it. Grandpa’s letter said, “Dear Tobi, be brave.”',
          'The crowd shouted, “Hosanna!”',
        ],
        cast,
      ),
    ).toEqual([
      'dad (phone): I’m on my way.',
      'grandpa (letter): Dear Tobi, be brave.',
      'crowd: Hosanna!',
    ]);
  });

  it('gives a voice from out of sight to the one only heard', () => {
    const cast: Speaker[] = [
      { id: 'ada', names: ['Ada'] },
      { id: 'kofi', names: ['Kofi'] },
      { id: 'mum', names: ['Mum'], presence: 'heard' },
    ];
    expect(
      lines(
        [
          '“Race you home!” said Kofi.',
          '“You are on,” said Ada.',
          'A voice called from the house, “Dinner is ready!”',
        ],
        cast,
      ),
    ).toEqual([
      'kofi: Race you home!',
      'ada: You are on,',
      'mum (off): Dinner is ready!',
    ]);
  });

  it('reads where a line comes from only in the words that bring it in', () => {
    expect(heardFrom('She put down the phone and said,', '', 'Hi.')).toBeNull();
    expect(heardFrom('', ' Mira thought about it.', 'Yes.')).toBeNull();
    expect(heardFrom('', ', she thought.', 'Maybe,')).toBe('thought');
    expect(heardFrom('A voice from the sky boomed:', '', 'Go!')).toBe('above');
  });

  it('gives "they" to the story\'s group, and "he" to the man named last', () => {
    const feeding = [
      'Jesus came out, saw a great multitude, and he began to teach them many things.',
      'When it was late in the day, his disciples came to him, and said, “This place is deserted.”',
      'But he answered them, “You give them something to eat.” They asked him, “Shall we go and buy bread?”',
      'He said to them, “How many loaves do you have?” When they knew, they said, “Five, and two fish.”',
    ];
    const cast: Speaker[] = [
      { id: 'jesus', names: ['Jesus'], gender: 'm' },
      { id: 'john', names: ['John'], gender: 'm' },
      { id: 'disciples', names: ['Disciples', 'disciples'], group: true },
    ];
    expect(lines(feeding, cast)).toEqual([
      'disciples: This place is deserted.',
      'jesus: You give them something to eat.',
      'disciples: Shall we go and buy bread?',
      'jesus: How many loaves do you have?',
      'disciples: Five, and two fish.',
    ]);
  });
});

