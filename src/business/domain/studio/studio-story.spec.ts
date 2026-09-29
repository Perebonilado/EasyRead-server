/**
 * Story development (studio-story-plan S2): the premise, the characters
 * with personality, the beat sheet for the length with its tension curve,
 * and the scene plan the outline is built from, each checked by code.
 */
import { bibleOf, outlineOf, storySheetOf } from './studio';
import {
  beatSheetOf,
  checkBeats,
  checkCurve,
  checkPersonas,
  checkPlan,
  checkPremise,
  checkSetups,
  checkStructure,
  contextOf,
  covered,
  isGenericTrait,
  isStoryChange,
  stemOf,
  stemsOf,
  keptPersonas,
  outlineFromPlan,
  personasOf,
  premiseOf,
  scenePlanOf,
  storyOf,
  templateFor,
  withPersonas,
  type StoryBeat,
} from './studio-story';
import { describeBible } from './studio-words';
import { sceneFingerprint } from '../../handlers/studio/studio-views';

const bible = bibleOf({
  characters: [
    { name: 'Mina', voice: 'girl', role: 'main', figure: { age: 'child' } },
    {
      name: 'Theo',
      voice: 'boy',
      role: 'supporting',
      figure: { age: 'child' },
    },
  ],
  sets: [{ name: 'Harbour', id: 'harbour' }],
});

const beat = (
  role: string,
  intensity: number,
  plants: string[] = [],
  pays: string[] = [],
): Partial<Omit<StoryBeat, 'plants'>> & { plants: string[] } => ({
  role: role as StoryBeat['role'],
  what: `The ${role} happens.`,
  wants: 'Mina wants the boat back',
  stops: 'the tide',
  changes: 'it is harder now',
  intensity,
  plants,
  pays,
  // Each beat after the first follows by therefore or but (B1).
  link:
    role === 'setup'
      ? null
      : ['inciting', 'problem', 'turn', 'twist'].includes(role)
        ? 'but'
        : 'therefore',
});

/** A two-minute story, shaped as it should be. */
const good = [
  beat('setup', 2, ['old whistle']),
  beat('inciting', 4),
  beat('attempt', 5),
  beat('relief', 3),
  beat('attempt', 6),
  beat('turn', 5),
  beat('climax', 9, [], ['old whistle']),
  beat('resolution', 3),
];

describe('the template for a length', () => {
  it('is five beats for a minute, a fuller shape for two, three acts for five', () => {
    expect(templateFor(0.5)).toBe('short');
    expect(templateFor(1)).toBe('short');
    expect(templateFor(1.5)).toBe('medium');
    expect(templateFor(2)).toBe('medium');
    expect(templateFor(3)).toBe('long');
    expect(templateFor(5)).toBe('long');
  });

  it('asks for the beats the length takes', () => {
    expect(checkStructure(beatSheetOf({ beats: good }, 'medium'))).toEqual([]);
    const short = beatSheetOf(
      {
        beats: [
          beat('setup', 2),
          beat('problem', 5),
          beat('attempt', 6),
          beat('twist', 8),
          beat('payoff', 3),
        ],
      },
      'short',
    );
    expect(checkStructure(short)).toEqual([]);
    // A three-act film needs two attempts and a low point.
    const thin = beatSheetOf({ beats: good }, 'long');
    expect(checkStructure(thin).join(' ')).toMatch(/low point/);
  });
});

describe('the tension curve', () => {
  it('passes a curve that rises, dips for relief, turns, peaks at the climax and falls', () => {
    expect(checkCurve(beatSheetOf({ beats: good }, 'medium'))).toEqual([]);
    expect(checkBeats(beatSheetOf({ beats: good }, 'medium'))).toEqual([]);
  });

  it('sends back a flat curve', () => {
    const flat = good.map((b) => ({ ...b, intensity: 5 }));
    expect(
      checkCurve(beatSheetOf({ beats: flat }, 'medium')).join(' '),
    ).toMatch(/flat/);
  });

  it('sends back one that peaks too early, or never dips', () => {
    const early = good.map((b, k) => ({
      ...b,
      intensity: k === 2 ? 10 : b.intensity,
    }));
    expect(
      checkCurve(beatSheetOf({ beats: early }, 'medium')).join(' '),
    ).toMatch(/peaks too early/);
    const straight = good.map((b, k) => ({
      ...b,
      intensity: [2, 3, 4, 5, 6, 7, 9, 3][k],
    }));
    expect(
      checkCurve(beatSheetOf({ beats: straight }, 'medium')).join(' '),
    ).toMatch(/relief beat/);
  });

  it('sends back one that does not fall after the climax', () => {
    const hanging = good.map((b, k) => ({
      ...b,
      intensity: k === 7 ? 9 : b.intensity,
    }));
    expect(
      checkCurve(beatSheetOf({ beats: hanging }, 'medium')).join(' '),
    ).toMatch(/fall into the resolution|peaks too early/);
  });
});

describe('setups and payoffs', () => {
  it('pays off everything planted, and plants everything paid off', () => {
    expect(checkSetups(beatSheetOf({ beats: good }, 'medium'))).toEqual([]);
    const unpaid = good.map((b) => ({ ...b, pays: [] }));
    expect(
      checkSetups(beatSheetOf({ beats: unpaid }, 'medium')).join(' '),
    ).toMatch(
      /"old whistle" \(old-whistle\) is planted in beat 1 but never pays off/,
    );
    const unplanted = good.map((b) => ({ ...b, plants: [] }));
    expect(
      checkSetups(beatSheetOf({ beats: unplanted }, 'medium')).join(' '),
    ).toMatch(/was never planted/);
  });
});

describe('the characters', () => {
  it('flag stock traits, and keep a sheet for everyone who matters', () => {
    expect(isGenericTrait('kind')).toBe(true);
    expect(isGenericTrait('Very brave.')).toBe(true);
    expect(isGenericTrait('counts every step out loud')).toBe(false);
    const personas = personasOf(
      {
        characters: [
          {
            id: 'mina',
            want: 'to sail alone',
            need: 'to trust her brother',
            flaw: 'never admits she is lost',
            fear: 'deep water',
            personality: ['brave', 'kind'],
            voice: 'quick, bossy, says "obviously"',
            habits: ['chews her plait'],
            relationships: [
              {
                with: 'theo',
                is: 'big sister',
                tension: 'she leads, he knows the way',
              },
            ],
            arc: { from: 'alone', to: 'together' },
          },
        ],
      },
      bible,
    );
    const problems = checkPersonas(bible, personas).join(' ');
    expect(problems).toMatch(/Mina's traits "brave", "kind" are stock/);
    expect(problems).toMatch(/Give Theo a full sheet/);
  });

  it('are kept in the bible with their looks, and kept when the cast changes', () => {
    const personas = personasOf(
      {
        characters: [
          {
            id: 'Mina',
            want: 'to sail alone',
            need: 'help',
            flaw: 'proud',
            fear: 'deep water',
            personality: ['names every gull', 'hums sea shanties'],
            voice: 'quick',
            habits: [],
            relationships: [
              { with: 'theo', is: 'big sister', tension: 'who leads' },
              { with: 'nobody', is: 'stranger', tension: '' },
            ],
            arc: { from: 'alone', to: 'together' },
          },
        ],
      },
      bible,
    );
    const grown = withPersonas(bible, personas);
    const mina = grown.characters[0];
    expect(mina.figure).toEqual(bible.characters[0].figure);
    expect(mina.persona?.relationships.map((r) => r.with)).toEqual(['theo']);
    // Read back from where it is kept.
    expect(
      bibleOf(JSON.parse(JSON.stringify(grown))).characters[0].persona,
    ).toEqual(mina.persona);
    // A cast written again keeps who they are.
    expect(keptPersonas(bible, grown).characters[0].persona).toEqual(
      mina.persona,
    );
    // The writers are told who they are.
    expect(describeBible(grown, true)).toMatch(
      /who they are: wants to sail alone[^\n]*names every gull[^\n]*to Theo: big sister \(who leads\)/,
    );
    // And a written scene is not made again because of it.
    const sheet = storySheetOf({
      title: 'Harbour',
      set: 'harbour',
      onStage: [{ who: 'mina', spot: 'left' }],
      beats: [
        { kind: 'line', who: 'mina', say: 'Obviously.', feeling: 'happy' },
      ],
    });
    expect(sceneFingerprint(sheet, grown, {} as never)).toBe(
      sceneFingerprint(sheet, bible, {} as never),
    );
  });
});

describe('the premise and the scene plan', () => {
  it('asks a premise for its logline, stakes, hook, tools and a comedy’s running gag', () => {
    const thin = premiseOf(
      { title: 'Boats', logline: 'A boat.' },
      { genre: 'comedy' },
    );
    const problems = checkPremise(thin).join(' ');
    expect(problems).toMatch(/logline/);
    expect(problems).toMatch(/running gag/);
    // The maker's genre and ending over the writer's.
    expect(
      premiseOf({ genre: 'drama', ending: 'open' }, { genre: 'mystery' }),
    ).toMatchObject({
      genre: 'mystery',
      ending: 'open',
    });
  });

  it('gives every scene a turn and every beat a scene, and builds the outline from it', () => {
    const sheet = beatSheetOf({ beats: good }, 'medium');
    const plan = scenePlanOf({
      scenes: [
        {
          title: 'The empty mooring',
          beats: [0, 1, 2, 3],
          purpose: 'the boat is gone',
          conflict: 'Mina wants to go alone; Theo will not let her',
          turn: 'they set off together',
          shift: 'calm to panic',
          moment: 'the rope cut clean',
          set: 'harbour',
          cast: ['mina', 'theo'],
          seconds: 50,
          summary: 'Mina finds the boat gone and Theo insists on coming.',
        },
        {
          title: 'The whistle',
          beats: [4, 5, 6],
          purpose: 'the climax',
          conflict: 'the tide against them',
          turn: '',
          shift: 'fear to joy',
          moment: 'the whistle over the water',
          set: 'harbour',
          cast: ['mina', 'theo'],
          seconds: 50,
          summary: 'Mina blows the old whistle and the boat comes back.',
        },
      ],
    });
    const problems = checkPlan(plan, sheet).join(' ');
    expect(problems).toMatch(/Scene 2 \("The whistle"\) has no turn/);
    expect(problems).toMatch(/Beats 8 are in no scene/);
    const premise = premiseOf({
      title: 'The Whistle',
      logline: 'Mina must get the boat back before the tide turns.',
    });
    const outline = outlineFromPlan(plan, premise);
    expect(outline).toMatchObject({
      title: 'The Whistle',
      logline: 'Mina must get the boat back before the tide turns.',
    });
    expect(outline.scenes[0]).toEqual({
      title: 'The empty mooring',
      summary: 'Mina finds the boat gone and Theo insists on coming.',
      set: 'harbour',
      cast: ['mina', 'theo'],
      seconds: 50,
      teach: null,
      points: [],
    });
    // Kept inside the outline, and read back from it.
    const kept = outlineOf(
      JSON.parse(
        JSON.stringify({ ...outline, story: { premise, beats: sheet, plan } }),
      ),
    );
    expect(kept.story?.plan.scenes[0].turn).toBe('they set off together');
    expect(kept.story?.beats.template).toBe('medium');
    expect(storyOf(null)).toBeNull();
    expect(outlineOf({ title: 'Old', scenes: [] }).story).toBeUndefined();
  });
});

/**
 * A real beat sheet (DeepSeek, the no-setting brief, 2026-09-29): a robot
 * who loses its wind-up star, its friend Bea and her dog Biscuit. Its
 * curve was good and its setups sound, but the first check read plants as
 * strings and flagged them all.
 */
const realBible = bibleOf({
  characters: [
    { name: 'Pip', kind: 'creature', voice: 'creature', role: 'main' },
    {
      name: 'Bea',
      voice: 'girl',
      role: 'supporting',
      figure: { age: 'child' },
    },
    { name: 'Biscuit', kind: 'animal', voice: 'creature', role: 'supporting' },
  ],
  sets: [{ name: 'Playroom', id: 'playroom' }],
});
const realPersona = (
  personality: string[],
  habits: string[],
  voice: string,
) => ({
  want: 'to find the star',
  need: 'to ask for help',
  flaw: 'does it all alone',
  fear: 'being a bother',
  personality,
  voice,
  habits,
  relationships: [],
  arc: { from: 'alone', to: 'together' },
});
const realCast = withPersonas(
  realBible,
  new Map([
    [
      'pip',
      realPersona(
        [
          'counts the rivets on its arms when it gets worried',
          'hums a three-note tune while thinking',
        ],
        ['taps its chest panel'],
        "short chirpy sentences, often asks 'Star?' and repeats 'I can do it'",
      ),
    ],
    [
      'bea',
      realPersona(
        ['keeps a magnifier on a string and checks every clue twice'],
        ['points with the magnifier'],
        "brisk, warm; says 'What do we know?' and 'Case closed, almost!'",
      ),
    ],
    [
      'biscuit',
      realPersona(
        ['sniffs everything twice', 'carries one blue sock everywhere'],
        ['nose twitches'],
        "short barks; says 'wuff?' for questions",
      ),
    ],
  ]),
);
const realContext = contextOf(realCast);
const realBeats = (
  plants: unknown[][],
  pays: string[][],
  intensity = [2, 4, 6, 3, 9, 5],
  roles = ['setup', 'problem', 'attempt', 'relief', 'climax', 'resolution'],
) =>
  beatSheetOf(
    {
      beats: [
        'Pip winds up its star on the rug, humming its three-note tune; Bea visits with her magnifier; Biscuit naps by the toy chest.',
        'The star bounces off the table, rolls into the dark gap beneath the toy chest and vanishes with a faint squeak.',
        "Pip searches alone and finds only Biscuit's blue sock, counts its rivets and whispers a very soft 'please?'",
        "Biscuit sneezes over his sock; Bea calls him Deputy Nose and asks 'What do we know?'",
        "Biscuit's nose points at the gap; Bea lifts the chest with her magnifier handle; Pip whispers 'Please help?' and pulls out the star.",
        'Pip wraps the star in its yellow scarf and hums its happy three-note tune; Bea says the case is closed.',
      ]
        .slice(0, roles.length)
        .map((what, k) => ({
          role: roles[k],
          what,
          intensity: intensity[k],
          plants: plants[k] ?? [],
          pays: pays[k] ?? [],
        })),
    },
    'short',
  );

describe('plants with ids, and payoffs matched by their words', () => {
  it('gives every plant an id, from its words where none was given', () => {
    const sheet = realBeats(
      [[{ id: 'Spare Key', what: 'the spare key' }, "Bea's magnifier"]],
      [],
    );
    expect(sheet.beats[0].plants).toEqual([
      { id: 'spare-key', what: 'the spare key' },
      { id: 'bea-s-magnifier', what: "Bea's magnifier" },
    ]);
  });

  it('pays a plant off by its id, and flags one that never is', () => {
    const paid = realBeats(
      [[{ id: 'toy-chest-gap', what: 'the dark gap under the toy chest' }]],
      [[], [], [], [], ['toy-chest-gap']],
    );
    expect(checkSetups(paid, realContext)).toEqual([]);
    const unpaid = realBeats([[{ id: 'kite', what: 'a red kite' }]], []);
    expect(checkSetups(unpaid, realContext)).toEqual([
      '"a red kite" (kite) is planted in beat 1 but never pays off: pay it off in a later beat, naming "kite" in its pays, or leave it out.',
    ]);
    const nowhere = realBeats([], [[], [], [], [], ['golden-key']]);
    expect(checkSetups(nowhere, realContext).join(' ')).toMatch(
      /"golden-key" pays off in beat 5 but was never planted/,
    );
  });

  it('matches older payoffs by their words: stems, and words in common', () => {
    // As the real sheet had them: labels that differ from plant to payoff.
    const sheet = realBeats(
      [
        ['wind-up star', 'yellow scarf', "Bea's magnifier"],
        ['toy chest gap', "Biscuit's nose"],
        ["Pip's soft please"],
      ],
      [
        [],
        [],
        [],
        [],
        ['whispers please help', 'wind-up star', 'toy chest gap'],
        ['yellow scarf'],
      ],
    );
    expect(checkSetups(sheet, realContext)).toEqual([]);
  });

  it('treats habits and ways of speaking as running traits, never plants to pay off', () => {
    // Planted and paid under differing labels, and both a character's habit.
    const sheet = realBeats(
      [[], [], ['rivet counting', 'threenote tune']],
      [[], [], ['blue sock'], [], [], ['rivets counted', 'three-note tune']],
    );
    expect(checkSetups(sheet, realContext)).toEqual([]);
    // Without the characters' sheets, the same are plants that went unpaid.
    expect(checkSetups(sheet).length).toBeGreaterThan(0);
  });

  it('holds a real plant that nothing pays off, however alike its words', () => {
    const sheet = realBeats(
      [[{ id: 'music-box', what: 'a broken music box' }]],
      [[], [], [], [], ['wind-up star']],
    );
    expect(checkSetups(sheet, realContext).join(' ')).toMatch(
      /"a broken music box" \(music-box\) is planted in beat 1 but never pays off/,
    );
  });

  it('stems words lightly, for comparing', () => {
    expect(['counting', 'counts', 'counted'].map(stemOf)).toEqual([
      'count',
      'count',
      'count',
    ]);
    expect(stemOf('hummed')).toBe('hum');
    expect(stemOf('whispers')).toBe('whisper');
    expect(stemsOf("Pip's soft please", new Set(['pip']))).toEqual([
      'soft',
      'please',
    ]);
    expect(covered(['team'], ['teamwork'])).toBe(1);
    expect(covered(['soft', 'please'], ['whisper', 'please', 'help'])).toBe(
      0.5,
    );
  });
});

describe('the tension curve, on the real example', () => {
  it('passes the real curve: rising, a relief dip, the climax its peak, then down', () => {
    expect(checkCurve(realBeats([], []))).toEqual([]);
  });

  it("lets a short film's payoff be its peak, just after the twist", () => {
    const first = realBeats(
      [],
      [],
      [2, 4, 6, 8, 9],
      ['setup', 'problem', 'attempt', 'twist', 'payoff'],
    );
    expect(checkCurve(first)).toEqual([]);
  });

  it('says which beat peaks too early, with the curve as it is', () => {
    const early = realBeats([], [], [2, 9, 6, 3, 8, 4]);
    expect(checkCurve(early)).toEqual([
      'The tension peaks too early (2, 9, 6, 3, 8, 4): beat 2 (problem, 9) is as high as the climax, beat 5 (climax, 8). Keep every beat before the climax lower than it.',
    ]);
  });

  it('says when it peaks after the climax, not "too early"', () => {
    const late = realBeats([], [], [2, 4, 6, 3, 7, 9]);
    const said = checkCurve(late).join(' ');
    expect(said).toMatch(
      /peaks after the climax \(2, 4, 6, 3, 7, 9\): beat 6 \(resolution, 9\) is higher than the climax, beat 5 \(climax, 7\)/,
    );
    expect(said).not.toMatch(/too early/);
  });
});

describe('a change asked of the story itself', () => {
  it('is told from its words: the plot, who someone is, the ending', () => {
    expect(isStoryChange('make the ending funnier')).toBe(true);
    expect(isStoryChange('give the grandmother a secret')).toBe(true);
    expect(isStoryChange('more tension before the race')).toBe(true);
    expect(isStoryChange('add a scene where the puppy finds a bone')).toBe(
      false,
    );
    expect(isStoryChange('make the scenes shorter')).toBe(false);
    expect(isStoryChange('I want it set at the beach')).toBe(false);
    expect(isStoryChange(null)).toBe(false);
  });
});
