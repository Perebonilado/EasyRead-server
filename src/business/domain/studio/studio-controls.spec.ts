/**
 * The maker's controls (studio-story-plan §2, S1): a narrator, a genre,
 * an ending, a pace and an animation style, each optional; safe for the
 * audience; the narrator kept by code; the style and the pace as data on
 * the film's own hooks.
 */
import { bibleOf, briefOf, storySheetOf, EMPTY_BRIEF } from './studio';
import { checkSheet, errorsIn, repairSheet } from './studio-check';
import {
  narrationKept,
  narrationProblems,
  narratorRuleOf,
  narratorWords,
} from './studio-narrator';
import {
  STYLE_PRESETS,
  energyOf,
  leanedMusic,
  safetyWords,
  setLookOf,
} from './studio-style';
import { describeBrief } from './studio-words';
import { buildSet, layoutOf } from '../scene-set-layout';
import { narratingSpeaker } from '../scene-voice';
import { STUDIO_PROMPTS } from '../../../web/adapters/studio-prompts';
import { briefDto } from '../../handlers/studio/studio-views';

/** Kai, Pepper and Nana, in the park. */
const bible = bibleOf({
  characters: [
    { name: 'Kai', voice: 'boy', role: 'main', figure: { age: 'child' } },
    { name: 'Nana', voice: 'old woman', role: 'supporting' },
  ],
  sets: [{ name: 'Park', id: 'park', look: 'a town park with a pond' }],
});

const line = (who: string, say: string) => ({
  kind: 'line',
  who,
  say,
  feeling: 'happy',
  from: 'here',
});
const narration = (say: string) => ({ kind: 'narration', say });

const sheetWith = (beats: unknown[]) =>
  storySheetOf({
    title: 'At the pond',
    set: 'park',
    time: 'day',
    weather: 'clear',
    crowd: 'none',
    mood: 'bright',
    music: 'calm',
    transition: 'cut',
    onStage: [
      { who: 'kai', spot: 'centre-left', pose: 'standing', face: 'happy' },
      { who: 'nana', spot: 'centre-right', pose: 'standing', face: 'happy' },
    ],
    props: [],
    beats,
    camera: [],
  });

describe('the brief’s controls', () => {
  it('are optional, each kept as said, and absent until chosen', () => {
    const plain = briefOf({ format: 'story', idea: 'a lost kite' });
    for (const key of ['narrator', 'genre', 'ending', 'pace', 'style'])
      expect(plain).not.toHaveProperty(key);
    const chosen = briefOf(
      {
        narrator: 'character',
        narratorCharacter: 'Kai',
        genre: 'mystery',
        ending: 'twist',
        pace: 'snappy',
        style: 'bold-cartoon',
      },
      plain,
    );
    expect(chosen).toMatchObject({
      narrator: 'character',
      narratorCharacter: 'Kai',
      genre: 'mystery',
      ending: 'twist',
      pace: 'snappy',
      style: 'bold-cartoon',
    });
    // Nonsense is no choice; a later message keeps what was chosen.
    expect(briefOf({ genre: 'opera', pace: null }, chosen).genre).toBe(
      'mystery',
    );
    // Who tells it only when one of the cast does.
    expect(briefOf({ narrator: 'light' }, chosen)).not.toHaveProperty(
      'narratorCharacter',
    );
    expect(briefDto(chosen)).toMatchObject({
      genre: 'mystery',
      pace: 'snappy',
    });
  });

  it('never set dark comedy for children, whatever is asked', () => {
    const kids = briefOf({ audience: 'children', genre: 'dark-comedy' });
    expect(kids.genre).toBe('comedy');
    const young = briefOf(
      { genre: 'dark-comedy' },
      { ...EMPTY_BRIEF, audience: 'young children' },
    );
    expect(young.genre).toBe('comedy');
    expect(briefOf({ audience: 'adults', genre: 'dark-comedy' }).genre).toBe(
      'dark-comedy',
    );
    const teens = briefOf({ audience: 'teens', genre: 'dark-comedy' });
    expect(teens.genre).toBe('dark-comedy');
    expect(safetyWords(teens)).toMatch(/mild/);
    // An audience changed to children later takes it away.
    expect(briefOf({ audience: 'children' }, teens).genre).toBe('comedy');
    expect(safetyWords({ audience: 'children', genre: 'romance' })).toMatch(
      /crush or a friendship/,
    );
  });

  it('reach the writers in words: the narrator, the genre, the style, the safety', () => {
    const brief = briefOf({
      format: 'story',
      idea: 'a lost kite',
      audience: 'children',
      narrator: 'none',
      genre: 'adventure',
      style: 'picture-book',
      pace: 'gentle',
    });
    const words = describeBrief(brief);
    expect(words).toContain('Narrator: none');
    expect(words).toContain('Genre: adventure');
    expect(words).toContain('Animation style: picture book');
    expect(words).toMatch(/Big action moves[^.]*at most 1 a scene/);
    expect(words).toContain('Safety: Peril stays cartoon peril');
    expect(
      narratorWords({ narrator: 'character', narratorCharacter: 'Kai' }),
    ).toMatch(/Kai tells it, in the first person/);
  });

  it('are asked about by the producer only when useful, and dark comedy never for children', () => {
    const turn = STUDIO_PROMPTS.studioTurn;
    expect(turn).toContain('"none", "light", "storyteller", "character"');
    expect(turn).toMatch(/only when they seem to care/);
    expect(turn).toMatch(/"Leave it to us" leaves them null/);
    expect(turn).toMatch(/for children or young children never set it/);
    expect(STUDIO_PROMPTS.studioScene).toMatch(/never\s+sexual/);
  });
});

describe('the narrator, kept by code', () => {
  const beats = [
    narration('A windy afternoon in the park.'),
    line('kai', 'Nana, look how high the kite goes!'),
    narration('Kai looks up at the sky.'),
    line('nana', 'Hold the string tight, love.'),
    narration('The wind grows stronger and stronger over the pond.'),
    line('kai', 'I have got it, I promise!'),
    narration('And the kite flies on.'),
  ];

  it('with none, allows no narration at all, and makes it what it shows or cuts it', () => {
    const sheet = sheetWith(beats);
    const rule = narratorRuleOf({ narrator: 'none' });
    const problems = narrationProblems(sheet, bible, rule);
    expect(problems.filter((p) => p.level === 'error')).toHaveLength(4);
    expect(
      checkSheet(sheet, bible, null, null, rule).map((p) => p.rule),
    ).toContain('narrator');
    const kept = narrationKept(sheet, bible, rule);
    expect(kept.beats.some((b) => b.kind === 'narration')).toBe(false);
    // "Kai looks up at the sky." is Kai looking, its words kept.
    expect(kept.beats).toContainEqual(
      expect.objectContaining({ kind: 'action', who: 'kai', do: 'look' }),
    );
    expect(kept.beats.filter((b) => b.kind === 'line')).toHaveLength(3);
    const repaired = repairSheet(sheet, bible, null, rule);
    expect(errorsIn(checkSheet(repaired, bible, null, null, rule))).toEqual([]);
  });

  it('light, opens and closes a scene only, a tenth of its words at most', () => {
    const sheet = sheetWith(beats);
    const rule = narratorRuleOf({ narrator: 'light' });
    const messages = narrationProblems(sheet, bible, rule).map(
      (p) => p.message,
    );
    expect(
      messages.some((m) => /Beat 3 is narration in the middle/.test(m)),
    ).toBe(true);
    expect(messages.some((m) => /Beat 1 /.test(m))).toBe(false);
    const kept = narrationKept(sheet, bible, rule);
    expect(narrationProblems(kept, bible, rule)).toEqual([]);
    // The opening bridge stays.
    expect(kept.beats[0]).toMatchObject({ kind: 'narration' });
  });

  it('a storyteller, a third or so of the words', () => {
    const rule = narratorRuleOf({ narrator: 'storyteller' });
    const balanced = sheetWith([
      narration('A windy afternoon in the park.'),
      line(
        'kai',
        'Nana, look how high the kite goes, it is nearly at the clouds!',
      ),
      line(
        'nana',
        'Hold the string tight, love, or the wind will take it away.',
      ),
      line('kai', 'I have got it, I promise!'),
    ]);
    expect(narrationProblems(balanced, bible, rule)).toEqual([]);
    expect(narrationProblems(sheetWith(beats), bible, rule)).toHaveLength(1);
    const heavy = sheetWith([
      narration(
        'Once upon a time, by a pond in a quiet town park, there lived a boy who loved kites.',
      ),
      line('kai', 'Look!'),
      narration(
        'He ran and ran and ran until the kite rose high above all the trees in the park.',
      ),
      line('nana', 'Well done.'),
    ]);
    expect(narrationProblems(heavy, bible, rule)[0]?.message).toMatch(
      /35% at most/,
    );
  });

  it('one of the cast, known by their name, telling it in their own voice', () => {
    const rule = narratorRuleOf(
      { narrator: 'character', narratorCharacter: 'Kai' },
      bible,
    );
    expect(rule).toEqual({ mode: 'character', character: 'kai' });
    // Left unsaid, the main character tells it.
    expect(narratorRuleOf({ narrator: 'character' }, bible)?.character).toBe(
      'kai',
    );
    const speaker = narratingSpeaker({
      voice: 'kai-voice',
      pace: 1.05,
      style: 'as Kai, a boy, saying their own line',
    });
    expect(speaker).toMatchObject({ voice: 'kai-voice' });
    expect(speaker?.style).toMatch(/telling the story/);
    expect(narratingSpeaker(null)).toBeNull();
  });

  it('left to us, is checked as it always was', () => {
    expect(narratorRuleOf({})).toBeNull();
    expect(narrationProblems(sheetWith(beats), bible, null)).toEqual([]);
  });
});

describe('the style presets and the pace', () => {
  it('are data: a look, the camera’s energy, the action and the music', () => {
    for (const preset of Object.values(STYLE_PRESETS)) {
      expect(preset.tintK).toBeLessThan(0.1);
      expect(preset.cut).toBeGreaterThan(0.5);
      expect(preset.moves).toBeGreaterThanOrEqual(1);
    }
    expect(energyOf({})).toBeNull();
    const snappy = energyOf({ style: 'bold-cartoon', pace: 'snappy' })!;
    const gentle = energyOf({ style: 'picture-book', pace: 'gentle' })!;
    expect(snappy.cut).toBeLessThan(gentle.cut);
    expect(snappy.moves).toBeGreaterThan(gentle.moves);
    expect(energyOf({ style: 'sitcom' })!.push).toBeLessThan(0.5);
    expect(leanedMusic('calm', 'sitcom')).toBe('playful');
    expect(leanedMusic('calm', null)).toBe('calm');
    expect(setLookOf({})).toBeNull();
  });

  it('tints a set’s palette and weighs its ink', () => {
    const place = {
      id: 'park',
      name: 'the park',
      aliases: [],
      look: 'a town park',
      firstPage: 1,
      sound: null,
      kind: 'outdoor' as const,
      stand: 'on' as const,
      front: null,
      features: [],
    };
    const layout = layoutOf(
      {
        ground: 'grass',
        backdrop: 'city',
        items: [{ kind: 'house', x: 0.3, row: 'back', scale: 1 }],
      },
      place,
      null,
    );
    const plain = buildSet(layout, place).svg;
    const cosy = buildSet(
      layout,
      place,
      {},
      null,
      setLookOf({ style: 'cosy' }),
    ).svg;
    expect(cosy).not.toBe(plain);
    // And the house look is as it was without one.
    expect(buildSet(layout, place, {}, null, null).svg).toBe(plain);
  });
});
