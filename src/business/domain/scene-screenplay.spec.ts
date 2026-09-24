import {
  bookLines,
  lineOf,
  mendScreenplay,
  talkIn,
  type ScreenplayBeatDraft,
  type ScreenplayCastDraft,
  type ScreenplayDraft,
} from './scene-screenplay';
import type { StoryPresence, StoryVoice } from './scene-story';

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
    expect(script.steps[0].stage).toEqual({
      layout: 'row',
      show: ['ada', 'kofi', 'nana'],
      arrows: [],
    });
    // The narration moves the scene to the yard; Ada's face as she asks.
    expect(script.steps[1].stage?.backdrop).toBe('yard');
    expect(script.steps[2].effects).toEqual([
      { target: 'ada', part: 'happy', do: 'show' },
    ]);
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
      show: ['ada', 'kofi', 'nana', 'goat'],
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
});
