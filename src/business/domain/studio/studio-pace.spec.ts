import { briefOf, EMPTY_BRIEF } from './studio';
import type { AudienceBand as PaceBand } from '../scene-pace';
import type { AudienceBand } from './studio-audience';
import {
  NUDGE_MUCH,
  NUDGE_STEP,
  nudged,
  paceAsked,
  studioMakerRate,
  studioMotionFactor,
  studioPaceBrief,
} from './studio-pace';

describe("an explainer's voice pace from its brief", () => {
  it('shares its bands with the audience profile, both ways', () => {
    // A type check: each band union is assignable to the other.
    type Same = [PaceBand] extends [AudienceBand]
      ? [AudienceBand] extends [PaceBand]
        ? true
        : false
      : false;
    const same: Same = true;
    expect(same).toBe(true);
  });

  it('reads whom it is for from the audience profile, its rate from its recipe', () => {
    expect(studioPaceBrief({ audience: 'young children' })).toEqual({
      band: 'early-years',
      baseWpm: 110,
    });
    expect(studioPaceBrief({ audience: null })).toEqual({
      band: 'general-adult',
    });
    // Learning English: the recipe's rate is a tenth slower.
    expect(
      studioPaceBrief({
        audience: 'adults',
        who: {
          band: 'university',
          prior: 'some',
          goal: 'understand',
          language: 'learning',
          support: 'normal',
        },
      }).baseWpm,
    ).toBe(Math.round(155 * 0.9));
  });

  it('takes the Pace chips as the voice’s pace, and a nudge from the chat', () => {
    expect(studioPaceBrief({ audience: 'teens', pace: 'snappy' })).toEqual({
      band: 'secondary-lower',
      baseWpm: 142,
      maker: 'brisk',
    });
    expect(studioPaceBrief({ audience: 'adults', voicePace: 1.06 })).toEqual({
      band: 'general-adult',
      baseWpm: 155,
      nudge: 1.06,
    });
    expect(studioMakerRate({ audience: 'adults', pace: 'gentle' })).toBe(0.93);
    expect(
      studioMakerRate({ audience: 'adults', pace: 'snappy', voicePace: 1.06 }),
    ).toBe(1.145);
  });

  it('gives the picture a motion factor for later', () => {
    expect(studioMotionFactor({ audience: 'young children' })).toBe(0.75);
    expect(studioMotionFactor({ audience: 'adults', pace: 'snappy' })).toBe(
      1.08,
    );
  });

  it('keeps a nudge in the brief, sound, and drops it at 1', () => {
    const brief = briefOf({ voicePace: 1.06 }, EMPTY_BRIEF);
    expect(brief.voicePace).toBe(1.06);
    expect(briefOf({ idea: 'x' }, brief).voicePace).toBe(1.06);
    expect(briefOf({ voicePace: 1 }, brief).voicePace).toBeUndefined();
    expect(briefOf({ voicePace: 9 }, brief).voicePace).toBe(1.06);
  });
});

describe('the voice’s pace asked in the chat', () => {
  it.each([
    ['The voice is a bit slow', NUDGE_STEP],
    ['can the narrator speak faster?', NUDGE_STEP],
    ['speed up the voice please', NUDGE_STEP],
    ['the narration drags', NUDGE_STEP],
    ['the voice is way too slow', NUDGE_MUCH],
    ['the voice feels rushed', -NUDGE_STEP],
    ['talk slower', -NUDGE_STEP],
    ['can you slow the narration down', -NUDGE_STEP],
    ['the voice is much too fast', -NUDGE_MUCH],
  ])('"%s" is %p', (said, change) => {
    expect(paceAsked(said)).toBe(change);
  });

  it.each([
    'make scene 2 faster',
    'the drawings are too slow',
    'add a scene about osmosis',
    'the voice is fine',
  ])('"%s" says nothing of the voice’s pace', (said) => {
    expect(paceAsked(said)).toBeNull();
  });

  it('holds the nudge to its range', () => {
    expect(nudged(undefined, 0.06)).toBe(1.06);
    expect(nudged(1.1, 0.1)).toBe(1.14);
    expect(nudged(0.9, -0.1)).toBe(0.88);
  });
});
