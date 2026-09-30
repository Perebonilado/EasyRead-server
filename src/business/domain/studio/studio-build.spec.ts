import {
  WATER_OUTLINE,
  WATER_PICTURES,
} from '../__fixtures__/water-cycle-build';
import type { OutlineScene } from './studio';
import { mendOutline } from './studio-check';
import { joinFor } from './studio-edit';
import { picturesIn, sectionOf, withBuilds } from './studio-build';

const scene = (
  title: string,
  build: OutlineScene['build'] = null,
  extra: Partial<OutlineScene> = {},
): OutlineScene => ({
  title,
  summary: title,
  set: null,
  cast: [],
  seconds: 20,
  teach: title,
  points: [],
  ...(build ? { build } : {}),
  ...extra,
});

describe("an explainer's continuous builds (part C), by code", () => {
  it('names the pictures a scene teaches', () => {
    expect(picturesIn(WATER_OUTLINE[0], WATER_PICTURES)).toEqual([
      'sun',
      'sea',
      'water vapour',
    ]);
  });

  it('turns a build on where scenes side by side share two of the show’s pictures', () => {
    const plain = WATER_OUTLINE.map(({ build: _, ...rest }) => {
      void _;
      return rest;
    });
    expect(withBuilds(plain, WATER_PICTURES).map((s) => s.build)).toEqual([
      'start',
      'continue',
      'continue',
    ]);
    // Sharing one picture is not enough.
    const one = [scene('The sun'), scene('The sun and the moon')];
    expect(withBuilds(one, WATER_PICTURES).map((s) => s.build ?? null)).toEqual(
      [null, null],
    );
  });

  it("puts the writer's marks right: a continue with nothing before it starts, a start nothing continues is none", () => {
    expect(
      withBuilds(
        [scene('A', 'continue'), scene('B', 'continue'), scene('C', 'start')],
        [],
      ).map((s) => s.build ?? null),
    ).toEqual(['start', 'continue', null]);
    expect(
      withBuilds([scene('A'), scene('B', 'continue')], []).map(
        (s) => s.build ?? null,
      ),
    ).toEqual(['start', 'continue']);
  });

  it('never builds a scene that is acted: a story’s, or a clip', () => {
    const acted = scene('The market', 'continue', {
      set: 'market',
      cast: ['ana'],
    });
    expect(
      withBuilds([scene('A', 'start'), acted], []).map((s) => s.build ?? null),
    ).toEqual([null, null]);
  });

  it('marks the outline as it is mended, and leaves a story’s alone', () => {
    const mended = mendOutline(
      {
        title: 'Water',
        logline: '',
        scenes: WATER_OUTLINE.map(({ build: _, ...rest }) => {
          void _;
          return rest;
        }),
      },
      {
        characters: [],
        sets: [],
        world: null,
        subject: 'science',
        maths: false,
        pictures: WATER_PICTURES,
      },
    );
    expect(mended.scenes.map((s) => s.build)).toEqual([
      'start',
      'continue',
      'continue',
    ]);
  });

  it('finds the section a scene is in', () => {
    const scenes = [
      scene('Intro'),
      scene('A', 'start'),
      scene('B', 'continue'),
      scene('C', 'continue'),
      scene('End'),
    ];
    expect(sectionOf(scenes, 0)).toBeNull();
    expect(sectionOf(scenes, 2)).toEqual({ from: 1, to: 3 });
    expect(sectionOf(scenes, 3)).toEqual({ from: 1, to: 3 });
  });

  it('joins a scene that continues a build by carrying the stage on', () => {
    const side = {
      sheet: null,
      scene: WATER_OUTLINE[1],
      build: 'continue' as const,
    };
    expect(joinFor({ sheet: null }, side).join).toBe('continue');
    expect(joinFor({ sheet: null }, { ...side, build: null }).join).not.toBe(
      'continue',
    );
  });
});
