import {
  bookLines,
  lineOf,
  mendScreenplay,
  talkIn,
  type ScreenplayBeatDraft,
  type ScreenplayCastDraft,
  type ScreenplayDraft,
} from './scene-screenplay';
import type { SceneStage } from './scene-script';
import type { StoryPresence, StoryVoice } from './scene-story';

type SceneStageLike = Pick<SceneStage, 'show' | 'backdrop' | 'cut' | 'arrive'>;

const characters: {
  id: string;
  name: string;
  aliases: string[];
  voice: StoryVoice;
}[] = [
  { id: 'ada', name: 'Ada', aliases: [], voice: 'girl' as const },
  { id: 'kofi', name: 'Kofi', aliases: [], voice: 'boy' as const },
  {
    id: 'nana',
    name: 'Nana Efua',
    aliases: ['Nana'],
    voice: 'old woman' as const,
  },
];
const places = [
  { id: 'yard', name: 'the yard', aliases: [], sound: null, look: 'a fire' },
];

/** The page of the book, as it is written. */
const material = [
  'Ada, her little brother Kofi and their grandmother, Nana Efua, sat by the fire.',
  '"Tell us a story, Nana," said Ada.',
  'Kofi groaned. "Not the one about the tortoise again!"',
  'Nana Efua laughed. "No, Kofi. Tonight I will tell you about the moon."',
].join('\n\n');

const beat = (
  kind: ScreenplayBeatDraft['kind'],
  say: string,
  extra: Partial<ScreenplayBeatDraft> = {},
): ScreenplayBeatDraft => ({
  kind,
  who: null,
  to: null,
  from: null,
  say,
  do: null,
  state: null,
  show: null,
  pace: null,
  hold: null,
  place: null,
  music: null,
  energy: null,
  ...extra,
});

const thing = (
  id: string,
  kind: ScreenplayCastDraft['kind'],
  extra: Partial<ScreenplayCastDraft> = {},
): ScreenplayCastDraft => ({
  id,
  kind,
  name: id,
  brief: null,
  motion: null,
  parts: null,
  states: null,
  shape: null,
  sound: null,
  ref: kind === 'character' || kind === 'place' ? id : null,
  state: null,
  figure: null,
  count: null,
  pose: null,
  signs: null,
  holding: null,
  ...extra,
});

const draft = (): ScreenplayDraft => ({
  fit: 'good',
  fitReason: null,
  title: 'A story by the fire',
  mood: 'calm',
  opening: ['ada', 'kofi', 'nana'],
  beats: [
    beat('narration', 'A warm night. Ada, Kofi and Nana sit by the fire.', {
      place: 'yard',
    }),
    beat('line', 'Tell us a story, Nana.', {
      who: 'ada',
      to: 'nana',
      state: 'happy',
    }),
    beat('action', 'Kofi groans and shakes his head.', {
      who: 'kofi',
      do: 'shake',
      state: 'sad',
      hold: 1,
    }),
    beat('line', 'Not the one about the tortoise again!', {
      who: 'kofi',
      pace: 'quick',
    }),
    beat('action', 'Nana laughs.', { who: 'nana', do: 'laugh', hold: 0.8 }),
    beat('line', 'No, Kofi. Tonight I will tell you about the moon.', {
      who: 'nana',
      to: 'kofi',
    }),
  ],
  cast: [
    thing('ada', 'character', { name: 'Ada' }),
    thing('kofi', 'character', { name: 'Kofi' }),
    thing('nana', 'character', { name: 'Nana Efua' }),
    thing('yard', 'place'),
  ],
});

const mend = (d: ScreenplayDraft = draft()) =>
  mendScreenplay(d, { material, characters, places });

describe('a line as its character says it', () => {
  it('keeps only their words, without the marks or the narrator round them', () => {
    expect(lineOf('Tell us a story, Nana.')).toEqual({
      text: 'Tell us a story, Nana.',
      attributed: false,
    });
    expect(lineOf('"Tell us a story, Nana," said Ada.')).toEqual({
      text: 'Tell us a story, Nana.',
      attributed: true,
    });
    expect(
      lineOf('"Long ago," she began, "the moon was not in the sky."').text,
    ).toBe('Long ago, the moon was not in the sky.');
  });
});

describe("the book's own lines", () => {
  it('reads every line on the page, and who says it where the book tells', () => {
    const lines = bookLines(material, [
      { id: 'ada', names: ['Ada'] },
      { id: 'kofi', names: ['Kofi'] },
      { id: 'nana', names: ['Nana Efua', 'Nana'] },
    ]);
    expect(lines.map((l) => [l.speaker, l.text])).toEqual([
      ['ada', 'Tell us a story, Nana,'],
      ['kofi', 'Not the one about the tortoise again!'],
      ['nana', 'No, Kofi. Tonight I will tell you about the moon.'],
    ]);
    expect(talkIn(material)).toBeGreaterThan(0.4);
  });
});

describe('a screenplay made sound and staged', () => {
  it('says each line whole in its speaker voice, to whom it is said, and the narrator little', () => {
    const { script, problems } = mend();
    expect(problems).toEqual([]);
    expect(
      script.beats.map((b) => [b.kind, b.speaker ?? null, b.to ?? null]),
    ).toEqual([
      ['narration', null, null],
      ['line', 'ada', 'nana'],
      ['line', 'kofi', null],
      ['line', 'nana', 'kofi'],
    ]);
    expect(script.beats[1].lines).toEqual([
      { span: [0, 'Tell us a story, Nana.'.length], speaker: 'ada' },
    ]);
    expect(script.beats[2].pace).toBe('quick');
  });

  it('plays each action in the quiet after the line before it', () => {
    const { script } = mend();
    // Kofi's groan after Ada's line; Nana's laugh after Kofi's.
    expect(script.beats[1].holdS).toBe(1);
    expect(script.beats[2].holdS).toBe(0.8);
    const moments = script.steps.filter((s) => s.after !== undefined);
    expect(
      moments.map((s) => [s.at.beat, s.after, s.effects.map((e) => e.do)]),
    ).toEqual([
      [1, 0, ['shake', 'show']],
      [2, 0, ['laugh']],
    ]);
    expect(moments[0].effects[1]).toEqual({
      target: 'kofi',
      part: 'sad',
      do: 'show',
    });
  });

  it('stages everyone there as it opens, and keeps them on: the camera, not the writer, goes close', () => {
    const { script } = mend();
    // The scene's place from its first step: the narration names the yard.
    expect(script.steps[0].stage).toEqual({
      layout: 'row',
      show: ['ada', 'kofi', 'nana'],
      arrows: [],
      backdrop: 'yard',
    });
    // The scene is the yard from its first step; Ada's face as she asks.
    expect(
      script.steps.filter((s) => s.stage?.backdrop === 'yard'),
    ).toHaveLength(1);
    expect(
      script.steps.find((s) => s.effects.some((e) => e.target === 'ada'))
        ?.effects,
    ).toEqual([{ target: 'ada', part: 'happy', do: 'show' }]);
    expect(
      script.steps.every((s) => !s.stage || s.stage.show.length === 3),
    ).toBe(true);
  });

  it("takes the book's word for who says a line", () => {
    const wrong = draft();
    wrong.beats[3] = { ...wrong.beats[3], who: 'ada' };
    const { script, mended } = mend(wrong);
    expect(script.beats[2].speaker).toBe('kofi');
    expect(mended.join(' ')).toContain('said by kofi in the book, not ada');
  });

  it('sends back a page that drops or rewords a line of the book', () => {
    const lost = draft();
    lost.beats[3] = { ...lost.beats[3], say: 'I do not want that story.' };
    const { problems } = mend(lost);
    expect(problems.join(' ')).toContain(
      'These lines of the book are missing or reworded: "Not the one about the tortoise again!" (kofi)',
    );
  });

  it('names who a lost line is by, when the writer left them out of the cast', () => {
    const lost = draft();
    lost.cast = lost.cast.filter((t) => t.id !== 'kofi');
    lost.opening = ['ada', 'nana'];
    lost.beats[2] = beat('narration', 'Someone groans.');
    lost.beats[3] = beat('narration', 'Nobody wants that story again.');
    const { problems } = mend(lost);
    expect(problems.join(' ')).toContain(
      '"Not the one about the tortoise again!" (kofi, not in your cast yet)',
    );
  });

  it('keeps a line whose speech was split, and takes the narrator words off a line', () => {
    const split = draft();
    split.beats.splice(
      5,
      1,
      beat('line', '"No, Kofi," said Nana Efua.', { who: 'nana' }),
      beat('line', 'Tonight I will tell you about the moon.', { who: 'nana' }),
    );
    const { script, problems, mended } = mend(split);
    expect(problems).toEqual([]);
    expect(script.beats[3].say).toBe('No, Kofi.');
    expect(mended.join(' ')).toContain('the line without the words around it');
  });

  it('sends back a narrator who says too much, or too long a sentence', () => {
    const told = draft();
    told.beats.splice(
      1,
      0,
      beat(
        'narration',
        'The night is warm and the stars are bright over the little house where they all live together.',
      ),
      beat('narration', 'Ada loves stories more than anything in the world.'),
      beat('narration', 'She asks her grandmother for one every single night.'),
    );
    const { problems } = mend(told);
    expect(problems.join(' ')).toContain('The narrator says');
    expect(problems.join(' ')).toContain('Narration runs long');
  });

  it('walks someone on and off where the actions say, and shows whoever speaks', () => {
    const coming = draft();
    coming.opening = ['ada', 'kofi'];
    coming.beats = [
      beat('line', 'Tell us a story, Nana.', { who: 'ada' }),
      beat('action', 'Nana comes out of the house.', {
        who: 'nana',
        do: 'enter',
        hold: 1.5,
      }),
      beat('line', 'No, Kofi. Tonight I will tell you about the moon.', {
        who: 'nana',
      }),
      beat('action', 'Kofi runs off.', { who: 'kofi', do: 'leave', hold: 1 }),
      beat('line', 'Not the one about the tortoise again!', { who: 'kofi' }),
    ];
    const { script } = mend(coming);
    const stages = script.steps.flatMap((s) =>
      s.stage
        ? [
            [
              s.stage.show,
              s.stage.arrive ?? null,
              s.stage.leave ?? null,
              s.stage.cutIn ?? null,
            ],
          ]
        : [],
    );
    expect(stages).toEqual([
      [['ada', 'kofi'], null, null, null],
      [['ada', 'kofi', 'nana'], ['nana'], null, null],
      [['ada', 'nana'], null, ['kofi'], null],
    ]);
    // Kofi, sent off by the words, calls from off the stage: not brought back.
  });

  it('cuts in someone who speaks without being on the stage', () => {
    const quiet = draft();
    quiet.opening = ['ada'];
    quiet.beats = [
      beat('line', 'Tell us a story, Nana.', { who: 'ada' }),
      beat('line', 'No, Kofi. Tonight I will tell you about the moon.', {
        who: 'nana',
      }),
    ];
    const { script } = mend(quiet);
    const last = script.steps[script.steps.length - 1].stage;
    expect(last?.show).toEqual(['ada', 'nana']);
    expect(last?.cutIn).toEqual(['nana']);
  });

  it('opens in quiet for what happens before the first word, and looks up at the sky', () => {
    const quiet = draft();
    quiet.opening = [];
    quiet.beats = [
      beat('action', 'Ada walks up to the fire.', {
        who: 'ada',
        do: 'enter',
        hold: 2,
      }),
      beat('line', 'Tell us a story, Nana.', { who: 'ada' }),
      beat('action', 'Ada looks up at the sky.', {
        who: 'ada',
        do: 'look',
        hold: 1.2,
      }),
      beat('line', 'Does the moon have a story too?', { who: 'ada' }),
    ];
    const { script } = mend(quiet);
    expect(script.lead).toBe(2);
    expect(script.steps[0]).toMatchObject({
      at: { beat: -1 },
      after: 0,
      stage: { show: [] },
    });
    expect(script.steps[1]).toMatchObject({
      at: { beat: -1 },
      after: 0,
      stage: { show: ['ada'], arrive: ['ada'] },
    });
    const look = script.steps.find((s) =>
      s.effects.some((e) => e.do === 'look'),
    );
    expect(look?.effects).toEqual([{ target: 'ada', part: '@up', do: 'look' }]);
  });

  it('changes a thing as the story does, drawn for the artist, and never labels it', () => {
    const flame = draft();
    flame.cast.push(
      thing('match', 'drawing', {
        name: 'a match',
        brief: 'a long wooden match',
        parts: [{ name: 'head', label: true }],
        states: [{ name: 'lit', look: 'a small bright flame' }],
      }),
    );
    flame.beats.push(
      beat('action', 'The flame shivers and goes out.', {
        who: 'match',
        do: 'still',
        state: 'out',
        show: 'match',
        hold: 1.2,
      }),
    );
    const { script, mended } = mend(flame);
    const match = script.cast.find((t) => t.id === 'match');
    expect(match?.kind === 'drawing' && match.parts).toEqual([
      { name: 'head', label: false },
    ]);
    expect(match?.kind === 'drawing' && match.states).toEqual([
      { name: 'lit', look: 'a small bright flame' },
      { name: 'out', look: 'The flame shivers and goes out.' },
    ]);
    expect(mended.join(' ')).toContain('a state "out" for the artist to draw');
    const last = script.steps[script.steps.length - 1];
    expect(last.stage?.show).toContain('match');
    expect(last.effects).toEqual([
      { target: 'match', part: 'out', do: 'show' },
    ]);
  });

  it('brings in whoever comes with someone, and whoever is hugged', () => {
    const goat = draft();
    goat.cast.push(thing('goat', 'character', { name: 'goat' }));
    goat.opening = ['ada', 'kofi'];
    goat.beats = [
      beat('line', 'Tell us a story, Nana.', { who: 'ada' }),
      beat('action', 'Nana comes out, leading a brown goat on a rope.', {
        who: 'nana',
        do: 'enter',
        hold: 1.5,
      }),
      beat('line', 'No, Kofi. Tonight I will tell you about the moon.', {
        who: 'nana',
      }),
    ];
    const withGoat = (characterList: typeof characters) =>
      mendScreenplay(goat, {
        material,
        characters: characterList,
        places,
      }).script.steps.find((step) => step.stage?.arrive)?.stage;
    expect(
      withGoat([
        ...characters,
        { id: 'goat', name: 'goat', aliases: ['brown goat'], voice: 'boy' },
      ]),
    ).toMatchObject({
      // Three at most on a story's stage: Kofi, who has said nothing,
      // steps out of the frame as Nana comes with her goat.
      show: ['ada', 'nana', 'goat'],
      arrive: ['nana', 'goat'],
    });
    const hugged = draft();
    hugged.opening = ['ada', 'kofi'];
    hugged.beats = [
      beat('line', 'Tell us a story, Nana.', { who: 'ada' }),
      beat('action', 'Ada hugs Nana.', { who: 'ada', to: 'nana', do: 'hug' }),
    ];
    const last = mend(hugged).script.steps.at(-1);
    expect(last?.stage?.cutIn).toEqual(['nana']);
    expect(last?.effects).toEqual([{ target: 'ada', part: 'nana', do: 'hug' }]);
  });

  it('plays a run of actions one after another in the quiet, quickened when it runs long, and sends back far too many', () => {
    const busy = draft();
    busy.beats.splice(
      2,
      1,
      beat('action', 'Kofi groans.', { who: 'kofi', do: 'shake', hold: 2 }),
      beat('action', 'Ada laughs.', { who: 'ada', do: 'laugh', hold: 2 }),
    );
    const { script, mended } = mend(busy);
    const after = script.steps.filter((s) => s.after !== undefined);
    // Four seconds asked, three held: the second starts at 1.5s.
    expect(after.slice(0, 2).map((s) => s.after)).toEqual([0, 1.5]);
    expect(script.beats[1].holdS).toBe(3);
    expect(mended.join(' ')).toContain('4s of actions after sentence 2');
    const crowded = draft();
    crowded.beats.splice(
      2,
      1,
      ...['one', 'two', 'three'].map((n) =>
        beat('action', `Kofi groans, ${n}.`, {
          who: 'kofi',
          do: 'shake',
          hold: 2,
        }),
      ),
    );
    expect(mend(crowded).problems.join(' ')).toContain(
      'Too much happens without a word after "Tell us a story,…"',
    );
  });

  it('sends off together whoever the words say go together', () => {
    const home = draft();
    home.beats.push(
      beat('action', "Ada takes her grandmother's hand.", {
        who: 'ada',
        to: 'nana',
        do: 'reach',
      }),
      beat('action', 'Together, they walk toward the house.', {
        who: 'ada',
        do: 'leave',
        hold: 2,
      }),
    );
    const last = mend(home).script.steps.at(-1)?.stage;
    expect(last).toMatchObject({ show: ['kofi'], leave: ['ada', 'nana'] });
  });
});

describe('voices beyond the stage', () => {
  /** Matthew 3:13-17, World English Bible (public domain). */
  const baptism = [
    'Then Jesus came from Galilee to the Jordan to John, to be baptized by him.',
    'But John would have hindered him, saying, “I need to be baptized by you, and you come to me?”',
    'But Jesus, answering, said to him, “Allow it now, for this is the fitting way for us to fulfill all righteousness.”',
    'Then he allowed him. Jesus, when he was baptized, went up directly from the water: and behold, the heavens were opened to him.',
    'Behold, a voice out of the heavens said, “This is my beloved Son, with whom I am well pleased.”',
  ].join('\n\n');
  const bible: {
    id: string;
    name: string;
    aliases: string[];
    voice: StoryVoice;
    presence: StoryPresence;
  }[] = [
    { id: 'jesus', name: 'Jesus', aliases: [], voice: 'man', presence: 'seen' },
    {
      id: 'john',
      name: 'John the Baptist',
      aliases: ['John'],
      voice: 'man',
      presence: 'seen',
    },
    {
      id: 'god',
      name: 'God',
      aliases: ['the Father'],
      voice: 'divine',
      presence: 'above',
    },
  ];
  const river = [
    {
      id: 'jordan',
      name: 'the Jordan',
      aliases: [],
      sound: null,
      look: 'a river',
    },
  ];
  /** The writer as it went wrong in production: God's line said by Jesus. */
  const written = (): ScreenplayDraft => ({
    fit: 'good',
    fitReason: null,
    title: 'The baptism',
    mood: 'calm',
    opening: ['john'],
    beats: [
      beat('narration', 'Jesus comes to the Jordan.', { place: 'jordan' }),
      beat('action', 'Jesus walks to John.', {
        who: 'jesus',
        do: 'enter',
        hold: 1.2,
      }),
      beat('line', 'I need to be baptized by you, and you come to me?', {
        who: 'john',
        to: 'jesus',
      }),
      beat(
        'line',
        'Allow it now, for this is the fitting way for us to fulfill all righteousness.',
        { who: 'jesus', to: 'john' },
      ),
      beat('narration', 'The heavens open.'),
      beat('line', 'This is my beloved Son, with whom I am well pleased.', {
        who: 'jesus',
      }),
    ],
    cast: [
      thing('john', 'character', { name: 'John' }),
      thing('jesus', 'character', { name: 'Jesus' }),
      thing('jordan', 'place'),
    ],
  });

  it("gives God's line back to God, from above, and never puts God on the stage", () => {
    const { script, mended } = mendScreenplay(written(), {
      material: baptism,
      characters: bible,
      places: river,
    });
    const last = script.beats[script.beats.length - 1];
    expect(last.kind).toBe('line');
    expect(last.from).toBe('above');
    const god = script.cast.find(
      (t) => t.kind === 'character' && t.ref === 'god',
    );
    expect(god).toBeDefined();
    expect(last.speaker).toBe(god!.id);
    expect(mended.join('\n')).toContain('brought into the cast');
    for (const step of script.steps) {
      expect(step.stage?.show ?? []).not.toContain(god!.id);
      expect(step.stage?.cutIn ?? []).not.toContain(god!.id);
    }
  });

  it('lets the narrator say words from above when the story has no one heard from above', () => {
    const { script } = mendScreenplay(written(), {
      material: baptism,
      characters: bible.filter((c) => c.id !== 'god'),
      places: river,
    });
    const last = script.beats[script.beats.length - 1];
    expect(last.kind).toBe('narration');
    expect(last.from).toBe('above');
    expect(last.speaker).toBeUndefined();
  });

  it('puts a thinker on the stage, and a phone in the hand of whoever hears one', () => {
    const cast = [
      {
        id: 'tobi',
        name: 'Tobi',
        aliases: [],
        voice: 'boy' as const,
        presence: 'seen' as const,
      },
      {
        id: 'dad',
        name: 'Dad',
        aliases: [],
        voice: 'man' as const,
        presence: 'heard' as const,
      },
    ];
    const material = [
      '“Where is he?” Tobi thought.',
      'The phone rang. Dad’s voice crackled over the phone: “I am on my way.”',
    ].join('\n\n');
    const { script } = mendScreenplay(
      {
        fit: 'good',
        fitReason: null,
        title: 'Waiting',
        mood: 'calm',
        opening: [],
        beats: [
          beat('line', 'Where is he?', { who: 'tobi' }),
          beat('narration', 'The phone rings.'),
          beat('line', 'I am on my way.', { who: 'dad', to: 'tobi' }),
        ],
        cast: [
          thing('tobi', 'character', { name: 'Tobi' }),
          thing('dad', 'character', { name: 'Dad' }),
        ],
      },
      { material, characters: cast },
    );
    expect(script.beats[0].from).toBe('thought');
    expect(script.beats[2].from).toBe('phone');
    const shown = new Set(script.steps.flatMap((s) => s.stage?.show ?? []));
    expect(shown.has('tobi')).toBe(true);
    expect(shown.has('dad')).toBe(false);
    const tobi = script.cast.find((t) => t.id === 'tobi');
    expect(tobi?.kind === 'character' && tobi.holding).toBe('phone');
  });

  it("sends back a line the book's characters never say", () => {
    const d = draft();
    d.beats.push(
      beat('line', 'The fire is warm and the stars are bright tonight.', {
        who: 'ada',
      }),
    );
    const { problems } = mend(d);
    expect(problems.join(' ')).toContain('not in the book');
  });
});

describe('scenes: only who is in them, where they are', () => {
  const gospel = [
    { id: 'jesus', name: 'Jesus', aliases: [], voice: 'man' as const },
    { id: 'centurion', name: 'Centurion', aliases: [], voice: 'man' as const },
    {
      id: 'mother-in-law',
      name: 'Peter’s mother-in-law',
      aliases: [],
      voice: 'old woman' as const,
    },
  ];
  const towns = [
    {
      id: 'capernaum',
      name: 'Capernaum',
      aliases: [],
      sound: null,
      look: 'a town',
    },
    {
      id: 'peters-house',
      name: 'Peter’s House',
      aliases: [],
      sound: null,
      look: 'a house',
    },
    {
      id: 'hillside',
      name: 'the hillside',
      aliases: [],
      sound: null,
      look: 'a slope',
    },
  ];
  const cast = [
    thing('jesus', 'character', { name: 'Jesus' }),
    thing('centurion', 'character', { name: 'Centurion' }),
    thing('mother-in-law', 'character', { name: 'Peter’s mother-in-law' }),
    thing('leper', 'person', { name: 'Man with leprosy' }),
    thing('capernaum', 'place'),
    thing('peters-house', 'place'),
    thing('hillside', 'place'),
  ];
  const staged = (beats: ScreenplayBeatDraft[], opening: string[] = []) =>
    mendScreenplay(
      { ...draft(), opening, beats, cast },
      { characters: gospel, places: towns },
    ).script.steps.flatMap((step) =>
      step.stage
        ? [
            `${step.stage.show.join('+')}${step.stage.backdrop ? ` @${step.stage.backdrop}` : ''}`,
          ]
        : [],
    );

  it('clears the stage at each scene: the leper, the centurion, Peter’s house', () => {
    expect(
      staged(
        [
          beat(
            'narration',
            'On the hillside, a man with leprosy comes to Jesus.',
            {
              place: 'hillside',
            },
          ),
          beat('line', 'Lord, if you are willing, you can make me clean.', {
            who: 'leper',
          }),
          beat('line', 'I am willing. Be clean!', { who: 'jesus' }),
          beat(
            'narration',
            'Later, in Capernaum, a centurion comes to Jesus.',
            {
              place: 'capernaum',
            },
          ),
          beat('line', 'Lord, my servant is lying at home paralyzed.', {
            who: 'centurion',
          }),
          beat('line', 'I will come and heal him.', { who: 'jesus' }),
          beat(
            'narration',
            'Jesus enters Peter’s house and sees Peter’s mother-in-law lying ill.',
          ),
        ],
        // The writer listed everyone as the page opens: only those in the
        // first scene are there.
        ['jesus', 'centurion', 'leper'],
      ),
    ).toEqual([
      'jesus+leper @hillside',
      'centurion+jesus @capernaum',
      'jesus+mother-in-law @peters-house',
    ]);
  });

  it('starts a scene where time passes, with whom its narration names', () => {
    expect(
      staged([
        beat('narration', 'In Capernaum, the centurion asks Jesus for help.', {
          place: 'capernaum',
        }),
        beat('line', 'Lord, my servant is lying at home paralyzed.', {
          who: 'centurion',
        }),
        beat('narration', 'That evening, Peter’s mother-in-law lies ill.'),
        beat('line', 'Get up.', { who: 'jesus' }),
      ]),
    ).toEqual([
      // In the order the words name them.
      'centurion+jesus @capernaum',
      'mother-in-law @capernaum',
      'mother-in-law+jesus',
    ]);
  });

  it('brings back the one the scene follows when no one else is left', () => {
    expect(
      staged(
        [
          beat('narration', 'In Capernaum, Jesus teaches.', {
            place: 'capernaum',
          }),
          beat('line', 'Stretch out your hand.', { who: 'jesus' }),
          beat('action', 'Jesus leaves.', {
            who: 'jesus',
            do: 'leave',
            hold: 1,
          }),
          beat('line', 'Do not tell others about me.', { who: 'jesus' }),
        ],
        ['jesus'],
      ),
    ).toEqual(['jesus @capernaum', '', 'jesus']);
  });
});

describe('a stage never left empty', () => {
  const shows = (script: { steps: { stage: { show: string[] } | null }[] }) =>
    script.steps.flatMap((step) =>
      step.stage ? [step.stage.show.join('+') || '(no one)'] : [],
    );

  it('goes on with whoever was there when a new scene names no one', () => {
    // Matthew 8:16: "When evening came, many…" after a scene in the house.
    const { script } = mendScreenplay(
      {
        ...draft(),
        opening: ['ada', 'nana'],
        beats: [
          beat('narration', 'A warm night in the yard.', { place: 'yard' }),
          beat('line', 'Tell us a story, Nana.', { who: 'ada', to: 'nana' }),
          beat('narration', 'Later, more neighbours gather round the fire.'),
          beat('line', 'Tonight I will tell you about the moon.', {
            who: 'nana',
          }),
        ],
      },
      { material, characters, places },
    );
    expect(shows(script)).not.toContain('(no one)');
    expect(shows(script).at(-1)).toBe('ada+nana');
  });

  it('brings back one who went, for a conversation with someone there', () => {
    // Matthew 8:18-20: Jesus orders the crossing, the writer has him go,
    // and the expert in the law then speaks to him.
    const { script } = mendScreenplay(
      {
        ...draft(),
        opening: ['ada', 'nana'],
        beats: [
          beat('narration', 'A warm night in the yard.', { place: 'yard' }),
          beat('line', 'Tell us a story, Nana.', { who: 'ada', to: 'nana' }),
          beat('action', 'Nana goes inside.', { who: 'nana', do: 'leave' }),
          beat('line', 'Wait, Nana! One more story!', {
            who: 'ada',
            to: 'nana',
          }),
        ],
      },
      { material, characters, places },
    );
    expect(shows(script).at(-1)).toBe('ada+nana');
  });

  it('starts a new scene "soon after", with only its own people', () => {
    const { script } = mendScreenplay(
      {
        ...draft(),
        opening: ['ada', 'nana'],
        beats: [
          beat('narration', 'A warm night in the yard.', { place: 'yard' }),
          beat('line', 'Tell us a story, Nana.', { who: 'ada', to: 'nana' }),
          beat('narration', 'Soon after, Kofi sits by the fire.'),
          beat('line', 'Not the tortoise again!', { who: 'kofi' }),
        ],
      },
      { material, characters, places },
    );
    expect(shows(script)).toEqual(['ada+nana', 'kofi']);
    expect(script.steps.filter((s) => s.stage?.cut)).toHaveLength(1);
  });

  it('brings on the one a narration is about', () => {
    const { script } = mendScreenplay(
      {
        ...draft(),
        opening: ['ada'],
        beats: [
          beat('narration', 'A warm night in the yard.', { place: 'yard' }),
          beat('line', 'Tell us a story, Nana.', { who: 'ada' }),
          beat('narration', 'Kofi comes running up the path.'),
          beat('action', 'Kofi groans.', { who: 'kofi', do: 'shake' }),
        ],
      },
      { material, characters, places },
    );
    expect(shows(script)).toEqual(['ada', 'ada+kofi']);
    expect(script.steps.find((s) => s.stage?.cutIn)?.stage?.cutIn).toEqual([
      'kofi',
    ]);
  });
});

describe('scripture the book quotes', () => {
  it('is read out by the narrator, as a quotation, whoever the writer gave it to', () => {
    const { script, mended } = mendScreenplay(
      {
        ...draft(),
        opening: ['ada'],
        beats: [
          beat('narration', 'Evening in the yard.', { place: 'yard' }),
          beat('line', 'He took our weaknesses and carried our diseases.', {
            who: 'nana',
          }),
          beat('line', 'Tell us a story, Nana.', { who: 'ada' }),
        ],
      },
      {
        material: [
          'In this way what was spoken by Isaiah the prophet was fulfilled: “He took our weaknesses and carried our diseases.”',
          '“Tell us a story, Nana,” said Ada.',
        ].join('\n\n'),
        characters,
        places,
      },
    );
    expect(script.beats.map((b) => [b.kind, b.speaker ?? null, b.say])).toEqual(
      [
        ['narration', null, 'Evening in the yard.'],
        [
          'narration',
          null,
          '"He took our weaknesses and carried our diseases."',
        ],
        ['line', 'ada', 'Tell us a story, Nana.'],
      ],
    );
    expect(mended.join(' ')).toContain('scripture the book quotes');
  });
});

describe('two places at once: cutting between them', () => {
  const kids = [
    { id: 'sally', name: 'Sally', aliases: [], voice: 'girl' as const },
    { id: 'james', name: 'James', aliases: [], voice: 'boy' as const },
    { id: 'mark', name: 'Mark', aliases: [], voice: 'boy' as const },
  ];
  const woods = [
    { id: 'woods', name: 'the woods', aliases: [], sound: null, look: 'trees' },
    {
      id: 'cave',
      name: 'the cave',
      aliases: [],
      sound: null,
      look: 'a dark cave',
    },
  ];

  it('shows Sally alone in the cave when she speaks, and the boys above when they do', () => {
    const { script } = mendScreenplay(
      {
        ...draft(),
        opening: ['james', 'mark'],
        cast: [
          thing('sally', 'character', { name: 'Sally' }),
          thing('james', 'character', { name: 'James' }),
          thing('mark', 'character', { name: 'Mark' }),
          thing('woods', 'place'),
          thing('cave', 'place'),
        ],
        beats: [
          beat(
            'narration',
            'Night in the woods. The boys reach the fallen tree.',
            {
              place: 'woods',
            },
          ),
          beat('line', 'Hey! Are you stuck under this tree?', { who: 'james' }),
          beat('line', 'Kind of! I fell into a cave.', {
            who: 'sally',
            place: 'cave',
          }),
          beat('line', 'James, you stay with Sally. I will get my dad.', {
            who: 'mark',
          }),
          beat('line', 'Please hurry, I am scared.', { who: 'sally' }),
        ],
      },
      { characters: kids, places: woods },
    );
    expect(
      script.steps.flatMap((step) =>
        step.stage
          ? [
              `${step.stage.show.join('+')}${step.stage.backdrop ? ` @${step.stage.backdrop}` : ''}${step.stage.cut ? ' cut' : ''}`,
            ]
          : [],
      ),
    ).toEqual([
      'james+mark @woods',
      'sally @cave cut',
      'james+mark @woods cut',
      'sally @cave cut',
    ]);
  });

  const stages = (script: { steps: { stage: SceneStageLike | null }[] }) =>
    script.steps.flatMap((step) =>
      step.stage
        ? [
            `${step.stage.show.join('+')}${step.stage.backdrop ? ` @${step.stage.backdrop}` : ''}${step.stage.cut ? ' cut' : ''}${step.stage.arrive ? ` arrive ${step.stage.arrive.join('+')}` : ''}`,
          ]
        : [],
    );
  const whereabouts = {
    place: 'woods',
    people: { sally: 'cave', james: 'woods', mark: 'woods' },
  };
  const kidsCast = [
    thing('sally', 'character', { name: 'Sally' }),
    thing('james', 'character', { name: 'James' }),
    thing('mark', 'character', { name: 'Mark' }),
  ];

  it('keeps Sally in the cave where the story has her, when the writer puts them all in one place', () => {
    // As the writer set Hide-and-Seek's page 11: everyone in the cave, no
    // line given a place, the cave left out of the cast.
    const { script, mended } = mendScreenplay(
      {
        ...draft(),
        opening: ['mark', 'james', 'sally'],
        cast: [...kidsCast, thing('woods', 'place')],
        beats: [
          beat(
            'narration',
            'Night falls by the old tree. Mark, James and Sally are here.',
            { place: 'woods', with: ['mark', 'james', 'sally'] },
          ),
          beat('line', 'James, you stay with Sally. I will get my dad.', {
            who: 'mark',
          }),
          beat('line', 'Don’t be scared. I am right here with you.', {
            who: 'james',
            to: 'sally',
          }),
          beat('line', 'No, you’re not. You’re up there and I’m down here.', {
            who: 'sally',
          }),
          beat('narration', 'Sally waits in the dark.'),
          beat('line', 'Hurry!', { who: 'james' }),
        ],
      },
      { characters: kids, places: woods, whereabouts },
    );
    expect(stages(script)).toEqual([
      'mark+james @woods',
      'sally @cave cut',
      'mark+james @woods cut',
    ]);
    // The cave, where she is, brought into the cast to cut to.
    expect(script.cast.find((t) => t.id === 'cave')).toEqual({
      id: 'cave',
      kind: 'place',
      ref: 'cave',
      name: 'the cave',
      sound: null,
    });
    expect(mended.join(' ')).toContain(
      "cave: one of the story's places; brought into the cast",
    );
  });

  it('moves to one of the story’s places the writer names, though it left it out of its cast', () => {
    // Matthew 8:14, as its page ends: "Jesus enters Peter's house".
    const { script } = mendScreenplay(
      {
        ...draft(),
        opening: ['james'],
        cast: [...kidsCast, thing('woods', 'place')],
        beats: [
          beat('narration', 'Night in the woods.', { place: 'woods' }),
          beat('line', 'Where is she?', { who: 'james' }),
          beat('narration', 'Later, James climbs down into the cave.', {
            place: 'the cave',
            with: ['james'],
          }),
        ],
      },
      { characters: kids, places: woods },
    );
    expect(stages(script)).toEqual(['james @woods', 'james @cave cut']);
    // Or one its narration names, with no place given at all.
    const named = mendScreenplay(
      {
        ...draft(),
        opening: ['james'],
        cast: [...kidsCast, thing('woods', 'place')],
        beats: [
          beat('narration', 'Night in the woods.', { place: 'woods' }),
          beat('line', 'Where is she?', { who: 'james' }),
          beat('narration', 'Later, James goes down into the cave.'),
        ],
      },
      { characters: kids, places: woods },
    );
    expect(stages(named.script)).toEqual(['james @woods', 'james @cave cut']);
  });

  it('never makes a question to the viewer a scene that moves anyone', () => {
    // Hide-and-Seek page 10: the writer set its last question in the woods
    // with Sally in it, and Sally was drawn in the woods.
    const { script } = mendScreenplay(
      {
        ...draft(),
        opening: ['james'],
        cast: [...kidsCast, thing('woods', 'place'), thing('cave', 'place')],
        beats: [
          beat('narration', 'Night in the woods.', { place: 'woods' }),
          beat('line', 'Hey! Are you stuck under this tree?', { who: 'james' }),
          beat('line', 'Kind of! I fell into a cave.', { who: 'sally' }),
          beat('narration', 'Can you spot the big tree trunk?', {
            place: 'woods',
            with: ['sally'],
          }),
        ],
      },
      { characters: kids, places: woods, whereabouts },
    );
    expect(stages(script)).toEqual(['james @woods', 'sally @cave cut']);
  });

  it('cuts to those elsewhere when the last one where the stage looks leaves', () => {
    const { script } = mendScreenplay(
      {
        ...draft(),
        opening: ['sally'],
        cast: [...kidsCast, thing('cave', 'place')],
        beats: [
          beat('narration', 'Night in the cave.', { place: 'cave' }),
          beat('line', 'Pull me up!', { who: 'sally' }),
          beat('line', 'Hold on!', { who: 'james' }),
          beat('narration', 'Sally climbs up the rope.'),
          beat('action', 'Sally climbs out of the cave.', {
            who: 'sally',
            do: 'leave',
          }),
        ],
      },
      {
        characters: kids,
        places: woods,
        whereabouts: {
          place: 'cave',
          people: { sally: 'cave', james: 'woods', mark: 'woods' },
        },
      },
    );
    expect(stages(script)).toEqual([
      'sally @cave',
      'james @woods cut',
      'sally @cave cut',
      'james @woods cut',
    ]);
  });

  it('keeps someone where the story has them though a later scene lists them elsewhere, until their own words move them', () => {
    // Mark's father comes to the tree. The writer lists him in its cave
    // scene; he is only there once he speaks from it.
    const { script } = mendScreenplay(
      {
        ...draft(),
        opening: ['james'],
        cast: [
          ...kidsCast,
          thing('dad', 'character', { name: 'Dad' }),
          thing('woods', 'place'),
          thing('cave', 'place'),
        ],
        beats: [
          beat('narration', 'Night by the old tree.', { place: 'woods' }),
          beat('line', 'She is down there!', { who: 'james' }),
          beat('action', 'Dad runs up with a rope.', {
            who: 'dad',
            do: 'enter',
          }),
          beat('line', 'Sally, are you hurt?', { who: 'dad' }),
          beat('line', 'No, but I am scared.', { who: 'sally' }),
          beat('narration', 'Dad climbs down into the cave.', {
            place: 'cave',
            with: ['dad', 'sally'],
          }),
          beat('line', 'I am here now.', { who: 'dad', place: 'cave' }),
          beat('line', 'Pull us up!', { who: 'james' }),
        ],
      },
      {
        characters: [
          ...kids,
          { id: 'dad', name: 'Dad', aliases: [], voice: 'man' as const },
        ],
        places: woods,
        whereabouts: {
          ...whereabouts,
          people: { ...whereabouts.people, dad: 'woods' },
        },
      },
    );
    expect(stages(script)).toEqual([
      'james @woods',
      'james+dad arrive dad',
      'sally @cave cut',
      // "Dad climbs down into the cave": seen above, where he still is.
      'dad+james @woods cut',
      // "I am here now", said in the cave: he is there.
      'dad+sally @cave cut',
      'james @woods cut',
    ]);
  });
});

describe('what people do with the things on the table', () => {
  const supper = (): ScreenplayDraft => ({
    ...draft(),
    beats: [
      beat(
        'narration',
        'Nana Efua took the bread, broke it and gave it to Kofi.',
        {
          place: 'yard',
        },
      ),
      beat('line', 'Take it, and eat, child.', {
        who: 'nana',
        to: 'kofi',
        state: 'happy',
      }),
      beat('narration', 'Kofi ate.'),
      beat('action', 'Ada drinks from the cup.', {
        who: 'ada',
        do: 'drink',
        hold: 1,
      }),
      beat('line', 'Thank you.', { who: 'kofi', to: 'nana' }),
    ],
  });

  it('acts the narration’s business on its words, never a line’s own words, and sets the table from the page', () => {
    const { script, mended } = mend(supper());
    const business = script.beats.flatMap((b, k) =>
      (b.business ?? []).map(
        (one) =>
          `${k}: ${one.who} ${one.does} ${one.prop}${one.to ? ` to ${one.to}` : ''}`,
      ),
    );
    expect(business.sort()).toEqual([
      '0: nana break bread',
      '0: nana give bread to kofi',
      '0: nana take bread',
      // Staged by the writer after the sentence before it.
      '2: ada drink cup',
      '2: kofi eat bread',
    ]);
    // "Take it, and eat" is said, not done.
    expect(script.beats[1].business).toBeUndefined();
    expect(script.props).toEqual(['bread', 'cup']);
    expect(mended.join(' ')).toContain("the narration's business acted");
  });

  it('puts bread the writer drew as a thing on the table instead, and breaks what is in hand', () => {
    const drawn: ScreenplayDraft = {
      ...draft(),
      beats: [
        beat('narration', 'Night falls by the fire.', { place: 'yard' }),
        beat('action', 'Nana takes the bread.', {
          who: 'nana',
          do: 'take',
          show: 'bread',
          hold: 1,
        }),
        beat('action', 'She breaks it.', { who: 'nana', do: 'break', hold: 1 }),
        beat('line', 'Share it, children.', { who: 'nana', to: 'ada' }),
      ],
      cast: [
        ...draft().cast,
        thing('bread', 'drawing', {
          name: 'loaf of bread',
          brief: 'a round loaf',
        }),
      ],
    };
    const { script, mended } = mend(drawn);
    expect(script.cast.some((t) => t.id === 'bread')).toBe(false);
    expect(script.steps.some((s) => s.stage?.show.includes('bread'))).toBe(
      false,
    );
    expect(script.props).toContain('bread');
    const business = script.beats.flatMap((b) =>
      (b.business ?? []).map((one) => `${one.who} ${one.does} ${one.prop}`),
    );
    expect(business).toEqual(['nana take bread', 'nana break bread']);
    expect(mended.join(' ')).toContain('bread: on the table as a prop');
  });

  it('acts what the book says is done with things even when the storyboard leaves it out, and asks again', () => {
    const book =
      'Nana Efua took the bread, broke it and gave it to Kofi.\n\n"Eat, child," she said.';
    const dropped: ScreenplayDraft = {
      ...draft(),
      beats: [
        beat('narration', 'Nana Efua took the bread.', { place: 'yard' }),
        beat('line', 'Eat, child.', { who: 'nana', to: 'kofi' }),
      ],
    };
    const { script, problems, mended } = mendScreenplay(dropped, {
      material: book,
      characters,
      places,
    });
    const business = script.beats.flatMap((b) =>
      (b.business ?? []).map(
        (one) =>
          `${one.who} ${one.does} ${one.prop}${one.to ? ` to ${one.to}` : ''}`,
      ),
    );
    expect(business).toEqual([
      'nana take bread',
      'nana break bread',
      'nana give bread to kofi',
    ]);
    expect(problems.join(' ')).toContain('nana breaks the bread');
    expect(mended.join(' ')).toContain('from the book, acted though left out');
  });

  it('shows how a line lands on the one it is said to, as it ends', () => {
    const { script } = mend(supper());
    const reaction = script.steps.find((step) =>
      step.effects.some(
        (e) => e.target === 'kofi' && e.part === 'happy' && e.do === 'show',
      ),
    );
    expect(reaction?.at.beat).toBe(1);
    expect(reaction?.word).toBeGreaterThan(0);
  });
});
