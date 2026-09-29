/**
 * The whole script as a story (story plan S3, S4): the voice lint, plants
 * and turns in the scenes' words, and the table read made sound, with its
 * bar and the scenes it sends back.
 */
import { bibleOf, outlineOf, storySheetOf } from './studio';
import {
  BAR,
  FIRST_SCENE_RULE,
  RUBRIC_KEYS,
  belowBar,
  checkPlantsShown,
  coldReadOf,
  filmAsSeen,
  lintTelling,
  checkTurnsShown,
  isStockLine,
  lintVoices,
  notesFor,
  scenesToRewrite,
  scriptInWords,
  tableReadOf,
  voiceProfile,
} from './studio-script';
import {
  beatSheetOf,
  premiseOf,
  scenePlanOf,
  withPersonas,
} from './studio-story';

const persona = (voice: string, personality: string[]) => ({
  want: 'to win the race',
  need: 'to trust a friend',
  flaw: 'too proud',
  fear: 'losing',
  personality,
  voice,
  habits: [],
  relationships: [],
  arc: { from: 'alone', to: 'together' },
});

const bible = withPersonas(
  bibleOf({
    characters: [
      { name: 'Leila', voice: 'girl', role: 'main', figure: { age: 'child' } },
      {
        name: 'Tomas',
        voice: 'boy',
        role: 'supporting',
        figure: { age: 'child' },
      },
    ],
    sets: [{ name: 'Harbour', id: 'harbour' }],
  }),
  new Map([
    [
      'leila',
      persona("short sentences; says 'Easy peasy' when it is not", [
        'counts boats out loud',
      ]),
    ],
    [
      'tomas',
      persona("long, careful sentences; says 'Technically speaking'", [
        'collects shells',
      ]),
    ],
  ]),
);

const line = (who: string, say: string) => ({
  kind: 'line',
  who,
  say,
  feeling: 'neutral',
});
const sheet = (title: string, beats: Record<string, unknown>[]) =>
  storySheetOf({
    title,
    set: 'harbour',
    onStage: [
      { who: 'leila', spot: 'left' },
      { who: 'tomas', spot: 'right' },
    ],
    beats,
  });

describe('the voice lint: lines any character could have said', () => {
  it('hears a pet phrase in the voice note', () => {
    const leila = voiceProfile(bible.characters[0]);
    expect(leila?.phrases).toEqual(['Easy peasy']);
    expect(leila?.short).toBe(true);
  });

  it('knows a stock line', () => {
    expect(isStockLine('Okay!')).toBe(true);
    expect(isStockLine("Oh no! Let's go!")).toBe(true);
    expect(isStockLine('Nine boats, and not one of them ours.')).toBe(false);
  });

  it('flags a scene made of stock lines', () => {
    const notes = lintVoices(
      [
        sheet('Dock', [
          line('leila', 'Oh no!'),
          line('tomas', "Let's go!"),
          line('leila', 'Easy peasy. Nine boats.'),
        ]),
      ],
      bible,
    );
    expect(notes.map((n) => [n.scene, n.kind])).toEqual([[0, 'voice']]);
    expect(notes[0].message).toMatch(
      /^Lines any character could say: "Oh no!", "Let's go!"/,
    );
  });

  it("flags a pet phrase in the wrong mouth, but not a callback after its owner said it, nor the last scene's", () => {
    const early = lintVoices(
      [
        sheet('Dock', [line('tomas', 'Easy peasy, the boat will float.')]),
        sheet('Home', [line('leila', 'Nine boats.')]),
      ],
      bible,
    );
    expect(early.map((n) => n.message)).toEqual([
      '"Easy peasy, the boat will float." is Tomas\'s line, but it is Leila\'s pet phrase: give Tomas words of their own, or give the line to Leila.',
    ]);
    const callback = lintVoices(
      [
        sheet('Dock', [
          line('leila', 'Easy peasy.'),
          line('tomas', 'Easy peasy, you said.'),
        ]),
        sheet('Home', [line('leila', 'Nine boats.')]),
      ],
      bible,
    );
    expect(callback).toEqual([]);
    const last = lintVoices(
      [
        sheet('Dock', [line('leila', 'Nine boats.')]),
        sheet('Home', [line('tomas', 'Easy peasy.')]),
      ],
      bible,
    );
    expect(last).toEqual([]);
  });

  it('flags a long line from someone who talks in short ones', () => {
    const notes = lintVoices(
      [
        sheet('Dock', [
          line(
            'leila',
            'I really think that we should probably go down to the harbour now before the tide comes in again',
          ),
        ]),
      ],
      bible,
    );
    expect(notes[0].message).toMatch(/Leila talks in short sentences/);
  });

  it('flags someone none of whose lines sound like them', () => {
    const plainTomas = [
      'The water is cold.',
      'We need a rope.',
      'Look at that.',
      'It is getting dark.',
    ].map((say) => line('tomas', say));
    const notes = lintVoices([sheet('Dock', plainTomas)], bible);
    expect(notes.map((n) => n.message)).toContain(
      'None of Tomas\'s 4 lines sounds like them: use their way of speaking ("Technically speaking") somewhere in this scene.',
    );
    // One line in their way is enough.
    const one = [
      ...plainTomas,
      line('tomas', 'Technically speaking, it floats.'),
    ];
    expect(
      lintVoices([sheet('Dock', one)], bible).some((n) =>
        n.message.startsWith('None of'),
      ),
    ).toBe(false);
  });
});

/** A story of two scenes: the spare key planted in the first, paid off in the second. */
const story = {
  premise: premiseOf({ title: 'The Key', logline: 'Leila must find the key.' }),
  beats: beatSheetOf(
    {
      beats: [
        {
          role: 'setup',
          what: 'Tomas hides a spare key under a shell.',
          intensity: 2,
          plants: [{ id: 'spare-key', what: 'the spare key' }],
        },
        { role: 'problem', what: 'The boathouse is locked.', intensity: 5 },
        {
          role: 'payoff',
          what: 'Leila remembers the shell and opens the boathouse.',
          intensity: 8,
          pays: ['spare-key'],
        },
      ],
    },
    'short',
  ),
  plan: scenePlanOf({
    scenes: [
      {
        title: 'Dock',
        beats: [0, 1],
        turn: 'the boathouse is locked and the race boat is inside',
        summary: 'Tomas hides a key; the boathouse is locked.',
      },
      {
        title: 'Boathouse',
        beats: [2],
        turn: 'Leila opens the boathouse with the spare key',
        summary: 'Leila opens the boathouse.',
      },
    ],
  }),
};
const outline = {
  ...outlineOf({
    title: 'The Key',
    logline: 'Leila must find the key.',
    scenes: [
      { title: 'Dock', summary: '', set: 'harbour', seconds: 30 },
      { title: 'Boathouse', summary: '', set: 'harbour', seconds: 30 },
    ],
  }),
  story,
};

describe('plants and turns in the words of the scenes', () => {
  const planted = sheet('Dock', [
    line('tomas', 'Technically speaking, a spare key belongs under a shell.'),
    line('leila', 'The boathouse is locked! The race boat is inside!'),
  ]);
  const paid = sheet('Boathouse', [
    line('leila', 'The shell! The spare key! Easy peasy.'),
    {
      kind: 'business',
      who: 'leila',
      do: 'open',
      target: 'boathouse',
      say: 'Leila opens the boathouse.',
    },
  ]);

  it('finds what is planted and paid off where the beats say', () => {
    expect(checkPlantsShown(story, [planted, paid], outline, bible)).toEqual(
      [],
    );
  });

  it('says when a scene never shows its plant, or never brings it back', () => {
    const bare = sheet('Dock', [line('leila', 'The boathouse is locked!')]);
    const forgot = sheet('Boathouse', [line('leila', 'We are in!')]);
    expect(
      checkPlantsShown(story, [bare, forgot], outline, bible).map((n) => [
        n.scene,
        n.message,
      ]),
    ).toEqual([
      [
        0,
        'This scene plants "the spare key" for later, but its words never show it: let us see or hear it here (a thing handled, a line, a look at it).',
      ],
      [
        1,
        'This scene pays off "the spare key", planted in scene 1, but its words never bring it back: let it come back here, and matter.',
      ],
    ]);
  });

  it("says when a scene's planned turn does not show in what is said or done", () => {
    expect(checkTurnsShown(story, [planted, paid], outline, bible)).toEqual([]);
    const flat = sheet('Dock', [
      line('leila', 'Shells everywhere. Easy peasy.'),
    ]);
    expect(checkTurnsShown(story, [flat, paid], outline, bible)).toEqual([
      expect.objectContaining({
        scene: 0,
        kind: 'turn',
        message:
          "The scene's turn, as planned, does not show in what is said or done: by its end, the boathouse is locked and the race boat is inside.",
      }),
    ]);
  });

  it('writes the script out as a screenplay, beats numbered, with what code measured', () => {
    const words = scriptInWords([planted, paid], bible, outline);
    expect(words).toContain('SCENE 1: "Dock", in Harbour, day;');
    expect(words).toContain(
      '  1. TOMAS: Technically speaking, a spare key belongs under a shell.',
    );
    expect(words).toContain('  2. [Leila opens the boathouse.]');
    expect(words).toContain(
      'turn: Leila opens the boathouse with the spare key',
    );
  });
});

describe('the table read, made sound', () => {
  const scores = Object.fromEntries(RUBRIC_KEYS.map((key) => [key, 8]));

  it('keeps scores within 0 to 10, reads every scene, and drops what is not there', () => {
    const read = tableReadOf(
      {
        scores: { ...scores, dialogue: 14, fit: null, nonsense: 3 },
        overall: '7.46',
        scenes: [
          {
            scene: 2,
            score: 4,
            notes: ['Beat 3: show it, do not say it.', ''],
          },
          { scene: 9, score: 1, notes: ['no such scene'] },
        ],
        voice: [
          { scene: 1, who: 'Tomas', line: 'Okay!', why: 'anyone says it' },
          { scene: 5, who: 'Tomas', line: 'Out of range', why: '' },
        ],
        verdict: 'Close.',
      },
      3,
    );
    expect(read.overall).toBe(7.5);
    expect(read.scores.dialogue).toBe(10);
    expect(read.scores.fit).toBeUndefined();
    expect(read.scenes).toEqual([
      { scene: 0, score: 7.5, given: false, notes: [] },
      {
        scene: 1,
        score: 4,
        given: true,
        notes: ['Beat 3: show it, do not say it.'],
      },
      { scene: 2, score: 7.5, given: false, notes: [] },
    ]);
    expect(read.voice).toEqual([
      { scene: 0, who: 'Tomas', line: 'Okay!', why: 'anyone says it' },
    ]);
  });

  it('takes the mean of the items when no overall is given', () => {
    expect(tableReadOf({ scores: { want: 6, dialogue: 8 } }, 1).overall).toBe(
      7,
    );
  });

  it('holds a read to the bar: the overall, and every item', () => {
    const good = tableReadOf({ scores, overall: 7.8, scenes: [] }, 2);
    expect(belowBar(good)).toEqual([]);
    const low = tableReadOf(
      { scores: { ...scores, hook: 3 }, overall: 6.5, scenes: [] },
      2,
    );
    expect(belowBar(low)).toEqual(['overall 6.5', 'hook 3']);
    expect(BAR.overall).toBeGreaterThan(BAR.item);
  });

  it('sends back the failing scenes only, the first for a hook and the last for a button, at most half', () => {
    const read = tableReadOf(
      {
        scores: { ...scores, button: 4 },
        overall: 6,
        scenes: [
          { scene: 1, score: 8 },
          { scene: 2, score: 4 },
          { scene: 3, score: 5 },
          { scene: 4, score: 7 },
          { scene: 5, score: 3 },
          { scene: 6, score: 8 },
        ],
      },
      6,
    );
    // The button's scene first, then the lowest: three of six.
    expect(scenesToRewrite(read)).toEqual([1, 4, 5]);
    const noted = tableReadOf(
      {
        scores,
        overall: 6.5,
        scenes: [
          { scene: 1, score: 7, notes: ['Beat 2: a dodge, not an answer.'] },
          { scene: 2, score: 8 },
        ],
      },
      2,
    );
    expect(scenesToRewrite(noted)).toEqual([0]);
  });

  it("gives a scene's writer the critic's notes, the lines heard as anyone's, and code's own", () => {
    const read = tableReadOf(
      {
        scores: { ...scores, hook: 3 },
        overall: 6,
        scenes: [{ scene: 1, score: 5, notes: ['Beat 1: open on the lock.'] }],
        voice: [{ scene: 1, who: 'Tomas', line: 'Okay!', why: 'generic' }],
      },
      2,
    );
    expect(
      notesFor(
        0,
        read,
        [{ scene: 0, kind: 'plant', message: 'Show the key.' }],
        bible,
      ),
    ).toEqual([
      'Beat 1: open on the lock.',
      "\"Okay!\" could be anyone's line (generic): say it as Tomas would (Tomas long, careful sentences; says 'Technically speaking').",
      'Show the key.',
      'Open with a hook: a joke, a mystery or a problem in the first seconds.',
    ]);
  });
});

/** Two flatmates locked out on a street at night, as a film of that kind had them. */
const flat = bibleOf({
  characters: [
    { name: 'Dee', voice: 'woman', role: 'main', figure: { age: 'adult' } },
    {
      name: 'Tessa',
      voice: 'woman',
      role: 'supporting',
      figure: { age: 'adult' },
    },
  ],
  sets: [
    {
      name: 'The corner outside',
      id: 'street',
      look: 'a city street at night',
    },
  ],
});
const flatSheet = (beats: Record<string, unknown>[]) =>
  storySheetOf({
    title: 'Locked out',
    set: 'street',
    time: 'night',
    onStage: [
      { who: 'dee', spot: 'centre-left', holding: 'cup' },
      { who: 'tessa', spot: 'centre-right', holding: 'phone' },
    ],
    beats,
  });
const move = (kind: string, who: string, say: string, fields = {}) => ({
  kind,
  who,
  say,
  ...fields,
});

describe('the telling lint: lines that narrate what we see', () => {
  it('flags a line that says again what a move beside it shows', () => {
    const notes = lintTelling(
      [
        flatSheet([
          move(
            'business',
            'dee',
            'Dee unlocks the apartment door with the key.',
            {
              do: 'open',
              target: 'door',
            },
          ),
          { ...line('dee', "Unlocked. Rent's still not paid."), to: 'tessa' },
          move(
            'business',
            'tessa',
            'Tessa sends Dee four hundred dollars on her phone.',
            {
              do: 'use',
              thing: 'phone',
            },
          ),
          { ...line('tessa', 'Sent. Four hundred exactly.'), to: 'dee' },
        ]),
      ],
      flat,
    );
    expect(notes).toHaveLength(2);
    expect(notes.every((n) => n.kind === 'telling')).toBe(true);
    expect(notes[0].message).toMatch(
      /"Unlocked\." says what we have just seen/,
    );
    expect(notes[1].message).toMatch(/"Sent\."/);
  });

  it('flags a line that repeats the narration, and one that narrates its own doing', () => {
    const notes = lintTelling(
      [
        flatSheet([
          { kind: 'narration', say: 'The door is locked.' },
          line('dee', "Well. Door's locked."),
          move('business', 'tessa', 'Tessa opens the window.', {
            do: 'open',
            target: 'window',
          }),
          line('tessa', "I'm opening the window, everyone."),
        ]),
      ],
      flat,
    );
    expect(notes.map((n) => n.message)).toEqual([
      expect.stringMatching(/"Door's locked\." says again what the narration/),
      expect.stringMatching(/says what Tessa is doing as we watch it/),
    ]);
  });

  it('flags status fragments in a row, the time said again, and lines said to no one', () => {
    const notes = lintTelling(
      [
        flatSheet([
          { kind: 'narration', say: 'Eleven fifty-two at night.' },
          {
            ...line('dee', "It's 11:52. Door's locked. That's fine."),
            to: 'tessa',
          },
          { ...line('tessa', 'Midnight, Dee. Midnight!'), to: 'dee' },
        ]),
        storySheetOf({
          title: 'Alone',
          set: 'street',
          onStage: [{ who: 'dee', spot: 'centre' }],
          beats: [line('dee', 'Right.'), line('dee', 'Where did it go?')],
        }),
      ],
      flat,
    );
    const said = notes.map((n) => n.message).join('\n');
    expect(said).toMatch(/narration announces the time/);
    expect(said).toMatch(
      /"It's 11:52\." "Door's locked\." "That's fine\." report how things are/,
    );
    expect(said).toMatch(/says the time again/);
    expect(said).toMatch(/Dee says "Right\." to no one, alone/);
    // The second said to no one is one too many, question or not.
    expect(said).toMatch(/Dee says "Where did it go\?" to no one/);
  });

  it('leaves lines that do something to someone', () => {
    expect(
      lintTelling(
        [
          flatSheet([
            move(
              'business',
              'tessa',
              'Tessa slides a day-old doughnut to Dee.',
              {
                do: 'give',
                thing: 'doughnut',
              },
            ),
            line('tessa', 'Day-old. Two dollars.'),
            line('dee', "I'm not begging a bird."),
            move('business', 'dee', 'Dee takes the key.', { do: 'take' }),
            line(
              'dee',
              'Give me that before midnight or I sleep on the stoop.',
            ),
          ]),
        ],
        flat,
      ),
    ).toEqual([]);
  });
});

describe('clarity: what a first-time viewer can follow', () => {
  const scores = Object.fromEntries(RUBRIC_KEYS.map((key) => [key, 8]));
  const viewer = coldReadOf({
    about: 'Two women stand by a door at night; one keeps filming.',
    who: 'the woman with the cup',
    wants: 'four hundred dollars and a key, not sure why',
    obstacle: '',
    stakes: '',
    clock: 'midnight, though I do not know what happens then',
    confused: ['who the one filming is to her', 'why she needs a key'],
    sure: 3,
  });

  it('is the first item, a floor no film below it clears, whatever else it does well', () => {
    expect(RUBRIC_KEYS[0]).toBe('clarity');
    const read = tableReadOf(
      { scores: { ...scores, clarity: 4 }, overall: 8.2, scenes: [] },
      5,
      viewer,
    );
    expect(read.overall).toBe(4);
    expect(belowBar(read)[0]).toMatch(/^clarity 4/);
    // The first scene is written again, told what the viewer made of it.
    expect(scenesToRewrite(read)).toContain(0);
    const notes = notesFor(0, read, [], flat);
    expect(notes).toContain(FIRST_SCENE_RULE);
    expect(notes.join(' ')).toMatch(/confused by: who the one filming is/);
    // Clear enough, it passes as before.
    const clear = tableReadOf(
      { scores: { ...scores, clarity: 8 }, overall: 7.8, scenes: [] },
      5,
      viewer && { ...viewer, confused: ['why a key'] },
    );
    expect(belowBar(clear)).toEqual([]);
    // Two things or more the viewer could not follow: unclear, whatever
    // the critic scored.
    const muddled = tableReadOf(
      { scores: { ...scores, clarity: 8 }, overall: 7.8, scenes: [] },
      5,
      viewer,
    );
    expect(belowBar(muddled)[0]).toMatch(/^clarity 6/);
  });

  it("takes the viewer's own sureness where the critic gave no clarity", () => {
    const { clarity: _gone, ...rest } = scores;
    void _gone;
    const read = tableReadOf(
      { scores: rest, overall: 7.5, scenes: [] },
      2,
      viewer,
    );
    expect(read.scores.clarity).toBe(3);
    expect(belowBar(read)).toContain('clarity 3 (the floor)');
  });

  it('shows the viewer only what the film shows: no names till someone says them', () => {
    const film = filmAsSeen(
      [
        flatSheet([
          { kind: 'narration', say: 'Late at night.' },
          {
            ...line('tessa', 'Two hundred people are watching, babe.'),
            to: 'dee',
          },
          move('action', 'tessa', 'Tessa leans in with the phone on Dee.', {
            do: 'lean-in',
            target: 'dee',
          }),
          { ...line('tessa', 'Give them something, Dee.'), to: 'dee' },
          { ...line('dee', 'I need a key.'), to: 'tessa' },
        ]),
      ],
      flat,
    );
    expect(film).toContain('We see: a city street at night, night');
    expect(film).not.toContain('The corner outside');
    expect(film).toMatch(/UNNAMED 2 \(to UNNAMED 1\): Two hundred people/);
    expect(film).toMatch(
      /\[we see: UNNAMED 2 leans in with the phone on UNNAMED 1\]/,
    );
    // Once her name is said, Dee is Dee; Tessa's never is.
    expect(film).toMatch(/DEE \(to UNNAMED 2\): I need a key\./);
    expect(film).not.toContain('TESSA');
  });
});
