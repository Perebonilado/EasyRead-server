import type { ExplainerSheet } from '../studio/studio';
import { explainerSheetOf } from '../studio/studio';
import {
  BEATS,
  DURATION_MS,
  LINES,
  MAP,
  PALETTE,
  PLAN,
  REGISTRY,
} from './__fixtures__/regional-turn';
import { checkTimed } from './shot-check-timed';
import { SHOT_SOUNDS } from './shot-sound';
import {
  composeShotScene,
  shotsInputOf,
  shotsScriptOf,
  shotsSettledMs,
  type ShotsInput,
} from './shot-compose';

const sheet: ExplainerSheet = explainerSheetOf({
  kind: 'explainer',
  title: 'Pressure Turns Regional',
  transition: 'cut',
  draft: {
    fit: 'good',
    fitReason: null,
    title: 'Pressure Turns Regional',
    mood: 'serious',
    pace: 'infographic',
    beats: LINES.map((say, k) => ({
      say,
      pause: 'short',
      delivery: k < 2 ? 'hook' : k === 2 ? 'question' : 'explain',
      speaker: null,
      music: k === 0 ? 'curious' : k === 4 ? 'calm' : null,
      energy: null,
      ...(k === 6 ? { hold: true } : {}),
    })),
    cast: [],
    steps: [],
  },
  engine: 'shots',
  shots: PLAN,
  registry: REGISTRY,
  rowClaims: LINES.map((_, k) => (k === 4 ? ['c7'] : [])),
});

const world = {
  palette: PALETTE,
  held: { token: 'chart5' as const, for: 'the payoff' },
  base: { kind: 'map' as const, region: 'Nigeria' },
};

describe('a shots sheet as the make reads it', () => {
  it('gives the make its plan, what it may name and the show’s world, and nothing for today’s storyboard', () => {
    const input = shotsInputOf(sheet, world, true, 'row-1')!;
    expect(input.plan).toBe(PLAN);
    expect(input.registry).toHaveLength(REGISTRY.length);
    expect(input.rowClaims[4]).toEqual(['c7']);
    expect(input.world).toEqual({
      palette: PALETTE,
      held: 'chart5',
      base: world.base,
    });
    expect(input).toMatchObject({ first: true, seed: 'row-1' });
    const today = explainerSheetOf({
      ...sheet,
      engine: undefined,
      shots: undefined,
    });
    expect(shotsInputOf(today, world, true, 'row-1')).toBeNull();
  });

  it('speaks its lines as a lesson’s, word for word, with no cast and no steps', () => {
    const script = shotsScriptOf(sheet, { stage: 'higher', maths: false });
    expect(script.beats.map((b) => b.say)).toEqual(LINES);
    expect(script.beats[0]).toMatchObject({
      delivery: 'hook',
      music: 'curious',
    });
    expect(script.beats[6].hold).toBe(true);
    expect(script.cast).toEqual([]);
    expect(script.steps).toEqual([]);
    expect(script.pace).toBe('infographic');
  });
});

describe('a scene of shots composed', () => {
  const script = shotsScriptOf(sheet, { stage: 'higher', maths: false });
  const input: ShotsInput = shotsInputOf(sheet, world, true, 'row-1')!;
  const made = {
    script,
    beats: BEATS,
    durationMs: DURATION_MS,
    timing: 'voice' as const,
    shape: 'wide' as const,
    theme: 'paper' as const,
    generator: 'scene-2',
    profile: {
      kind: 'textbook' as const,
      tone: 'serious' as const,
      story: false,
      stage: 'higher' as const,
      film: true,
    },
    map: MAP,
  };
  const { scene, notes, problems } = composeShotScene(input, made);

  it('is a lesson scene played by the shots engine: its picture in shots, no things, steps or effects', () => {
    expect(scene.engine).toBe('shots');
    expect(scene.version).toBe(4);
    expect(scene.things).toEqual([]);
    expect(scene.steps).toEqual([]);
    expect(scene.effects).toEqual([]);
    expect(scene.stagings).toEqual({
      box: { w: 1600, h: 900, places: [] },
      wide: { w: 1600, h: 900, places: [] },
    });
    expect(scene.shape).toBeUndefined();
    expect(scene.setting).toEqual({ film: true });
    expect(scene.stage).toBe('higher');
    expect(scene.shots?.version).toBe(1);
    expect(scene.shots?.look.palette.sides['North Region']).toBe('#0050BE');
  });

  it('keeps the voice’s beats, its timing and a lesson’s music', () => {
    expect(scene.beats.map((b) => b.text)).toEqual(LINES);
    expect(scene.beats[0].words).toEqual(BEATS[0].words);
    expect(scene.beats[0].delivery).toBe('hook');
    expect(scene.beats[3].delivery).toBeUndefined();
    expect(scene.timing).toBe('voice');
    expect(scene.durationMs).toBe(DURATION_MS);
    expect(scene.sound?.music?.[0]).toMatchObject({ atMs: 0 });
    expect(scene.sound?.palette).toBe('lesson');
    expect(scene.settledMs).toBeGreaterThanOrEqual(
      BEATS[BEATS.length - 1].endMs,
    );
  });

  it('times every shot on the voice, from the start to the end, each change inside its shot', () => {
    const shots = scene.shots!.shots;
    expect(shots[0].startMs).toBe(0);
    expect(shots[shots.length - 1].endMs).toBe(DURATION_MS);
    for (let i = 1; i < shots.length; i += 1)
      expect(shots[i].startMs).toBe(shots[i - 1].endMs);
    for (const shot of shots)
      for (const item of shot.info) {
        expect(item.atMs).toBeGreaterThanOrEqual(shot.startMs);
        expect(item.atMs + item.durMs).toBeLessThanOrEqual(shot.endMs);
      }
    // Every asset a shot names is among the assets.
    for (const shot of shots)
      if ('asset' in shot.set)
        expect(scene.shots!.assets[shot.set.asset]).toBeDefined();
  });

  it('gives its motion its sounds, and leaves its pace mended', () => {
    // A pin pops as it lands; every sound is one the player's library makes.
    expect(scene.shots!.sounds.some((s) => s.sound === 'pop')).toBe(true);
    for (const cue of scene.shots!.sounds)
      expect(SHOT_SOUNDS).toContain(cue.sound);
    expect(problems.map((p) => p.code)).not.toContain('first-change');
    expect(
      checkTimed(scene.shots!.shots, DURATION_MS, { first: true }),
    ).toEqual(problems);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('holds the row the editor holds: no stillness found in it', () => {
    const held = [BEATS[6].startMs, DURATION_MS] as const;
    expect(
      problems.filter(
        (p) => p.code === 'quiet' && p.message.includes(`from ${held[0]}`),
      ),
    ).toEqual([]);
  });

  it('is the same every time', () => {
    expect(composeShotScene(input, made)).toEqual({ scene, notes, problems });
  });

  it('is composed for a tall frame as a tall scene', () => {
    const tall = composeShotScene(input, {
      ...made,
      shape: 'tall',
      map: null,
    }).scene;
    expect(tall.shape).toBe('tall');
    expect(tall.stagings.wide).toEqual({ w: 900, h: 1600, places: [] });
    expect(tall.stagings.box).toEqual({ w: 900, h: 1600, places: [] });
  });

  it('says when everything has finished: the last word, or the last change after it', () => {
    expect(shotsSettledMs([{ endMs: 5000 }], [], 6000)).toBe(5000);
    expect(
      shotsSettledMs(
        [{ endMs: 5000 }],
        [
          {
            id: 's1',
            startMs: 0,
            endMs: 6000,
            set: { kind: 'plain' },
            actors: [],
            info: [{ id: 'a', recipe: 'ask', atMs: 5200, durMs: 600 }],
            life: [],
            camera: [],
            join: 'cut',
            joinMs: 0,
          },
        ],
        6000,
      ),
    ).toBe(5800);
  });
});
