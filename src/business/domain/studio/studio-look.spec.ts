/**
 * An explainer's look, chosen by code from whom it is for and what it is
 * about, or by the maker on the Look row or in the chat
 * (studio-explainer-plan, Ask 2 §4).
 */
import { EMPTY_BRIEF, briefOf, type StudioBrief } from './studio';
import {
  bandOfAudience,
  lookHeard,
  showTheme,
  themeFor,
  type AudienceBand,
} from './studio-look';
import { briefDto } from '../../handlers/studio/studio-views';
import { STUDIO_PROMPTS } from '../../../web/adapters/studio-prompts';
import { studioTurnSchema } from '../../../web/adapters/ai-sdk/studio-schemas';

const explainer = (over: Partial<StudioBrief> = {}): StudioBrief => ({
  ...EMPTY_BRIEF,
  format: 'explainer',
  idea: 'how vaccines work',
  audience: 'adults',
  ...over,
});

describe('the look code chooses', () => {
  it.each<[string, AudienceBand, boolean, string]>([
    ['the water cycle', 'early-years', false, 'sunny'],
    ['fractions', 'primary-upper', true, 'sunny'],
    ['maths: solving linear equations', 'secondary-lower', true, 'chalkboard'],
    ['algebra', 'secondary-upper', false, 'chalkboard'],
    ['physics: forces', 'secondary-upper', false, 'blueprint'],
    ['computing: how the internet works', 'general-adult', false, 'blueprint'],
    ['system design: a cloud file store', 'professional', false, 'blueprint'],
    ['astronomy: the solar system', 'university', false, 'nightsky'],
    ['biology: inside a cell', 'secondary-upper', false, 'nightsky'],
    ['medicine: blood disorders', 'university', false, 'cleanlab'],
    ['business: supply and demand', 'general-adult', false, 'cleanlab'],
    ['history: the race to the South Pole', 'general-adult', false, 'paper'],
    ['literature: reading a poem', 'secondary-lower', false, 'paper'],
  ])('%s for %s is %s', (subject, band, maths, look) => {
    expect(themeFor({ subject, band, maths })).toBe(look);
  });

  it('gives every children’s film the Sunny look, whatever it is about', () => {
    for (const band of [
      'early-years',
      'primary-lower',
      'primary-upper',
    ] as const)
      expect(themeFor({ subject: 'computing: networks', band })).toBe('sunny');
  });

  it('reads a band from the brief’s audience until the audience profile says one', () => {
    expect(bandOfAudience('young children')).toBe('early-years');
    expect(bandOfAudience('children')).toBe('primary-upper');
    expect(bandOfAudience('teens')).toBe('secondary-lower');
    expect(bandOfAudience('adults')).toBe('general-adult');
    expect(bandOfAudience(null)).toBe('general-adult');
  });

  it('plays the maker’s look when they chose one, and none for a story', () => {
    const bible = { subject: 'medicine: vaccines', maths: false };
    expect(showTheme(explainer(), bible)).toBe('cleanlab');
    expect(showTheme(explainer({ look: 'chalkboard' }), bible)).toBe(
      'chalkboard',
    );
    expect(showTheme(explainer({ audience: 'children' }), bible)).toBe('sunny');
    expect(showTheme(explainer({ format: 'story' }), bible)).toBeNull();
    // Before the bible, from the idea.
    expect(
      showTheme(explainer({ idea: 'how rockets reach orbit' }), null),
    ).toBe('nightsky');
  });
});

describe('the look the maker asks for in words', () => {
  it.each<[string, string, string | null]>([
    ['make it dark', 'paper', 'nightsky'],
    ['Can we make it dark?', 'sunny', 'chalkboard'],
    ['dark mode please', 'cleanlab', 'blueprint'],
    ['make it dark', 'blueprint', 'blueprint'],
    ['make it light again', 'nightsky', 'paper'],
    ['not so dark', 'chalkboard', 'sunny'],
    ['use a chalkboard look', 'paper', 'chalkboard'],
    ['Chalkboard', 'paper', 'chalkboard'],
    ['switch to the blueprint style', 'sunny', 'blueprint'],
    ['night sky', 'paper', 'nightsky'],
    ['a clean lab look', 'paper', 'cleanlab'],
    ['make it sunny and bright', 'nightsky', 'sunny'],
    ['a dark comedy for adults', 'paper', null],
    ['explain how chalk forms in the sea', 'paper', null],
    ['draw a blueprint of the engine in scene 2', 'paper', null],
    ['the dark side of the moon', 'paper', null],
    ['make scene 3 shorter', 'paper', null],
  ])('"%s" on %s is %s', (words, current, look) => {
    expect(lookHeard(words, current as never)).toBe(look);
  });
});

describe('the look in the brief', () => {
  it('is kept when chosen, anything else ignored, and absent until chosen', () => {
    const chosen = briefOf({ look: 'blueprint' }, explainer());
    expect(chosen.look).toBe('blueprint');
    expect(briefOf({ look: 'neon' }, chosen).look).toBe('blueprint');
    expect(briefOf({ look: 'neon' }, explainer())).not.toHaveProperty('look');
    expect(briefDto(chosen).look).toBe('blueprint');
    expect(briefDto(explainer())).not.toHaveProperty('look');
  });

  it('is heard from the producer, a look not on the list caught as none', () => {
    const turn = studioTurnSchema.parse({
      reply: 'Done.',
      brief: { look: 'chalkboard' },
      action: 'none',
    });
    expect(turn.brief.look).toBe('chalkboard');
    const stray = studioTurnSchema.parse({
      reply: 'Done.',
      brief: { look: 'neon' },
      action: 'none',
    });
    expect(stray.brief.look).toBeNull();
  });

  it('is taught to the producer: the six looks, set only when asked, nothing made again', () => {
    const prompt = STUDIO_PROMPTS.studioTurn;
    for (const name of ['"chalkboard"', '"nightsky"', '"cleanlab"', 'Sunny'])
      expect(prompt).toContain(name);
    expect(prompt).toContain('never ask');
    expect(prompt).toContain('with nothing made again');
  });
});
