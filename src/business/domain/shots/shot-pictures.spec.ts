import { MAP, PALETTE } from './__fixtures__/regional-turn';
import { buildShots, type BuildContext } from './shot-build';
import {
  coverScale,
  pictureAssetOf,
  pictureCredits,
  pictureSetOf,
  photoTreatment,
} from './shot-pictures';
import { registryOf } from './shot-registry';
import type { RegistryEntry, ShotPlan } from './types';

// What the desk's pass stores for Ahmadu Bello and for a Lagos photograph.
const BELLO: RegistryEntry = {
  name: 'person:Ahmadu Bello',
  kind: 'person',
  about: 'Northern Region leader',
  qid: 'Q401032',
  picture: {
    asset: '01a0fbbe-ad7b-7dac-bb7a-7308651951d5',
    credit: 'Ahmadu Bello, 1960 · US Department of Energy · Public domain',
    url: 'api/v1/studio/pictures/01a0fbbe-ad7b-7dac-bb7a-7308651951d5',
    width: 1280,
    height: 1602,
    focal: [427, 534, 427, 534],
    depthUrl:
      'api/v1/studio/pictures/01a0fbbe-ad7b-7dac-bb7a-7308651951d5/depth',
    licence: 'Public domain',
    source: 'US Department of Energy',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ahmadu_Bello.jpg',
    fullCredit:
      '“Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge” by US Department of Energy, via Wikimedia Commons, Public domain.',
    kind: 'portrait',
    year: 1960,
    mono: true,
    dates: '1910–1966',
    role: 'Northern Region leader',
  },
};
const LAGOS_PHOTO: RegistryEntry = {
  name: 'photo:Lagos Marina 1958',
  kind: 'photo',
  about: 'an archive photo of Lagos, 1958 (USIA)',
  picture: {
    asset: 'p2',
    credit: 'Lagos, 1958 · USIA · Public domain',
    url: 'api/v1/studio/pictures/p2',
    width: 2560,
    height: 1700,
    focal: [800, 500, 900, 700],
    licence: 'Public domain',
    source: 'USIA',
    fullCredit:
      '“Lagos Marina, 1958” by USIA, via Wikimedia Commons, Public domain.',
    kind: 'photo',
    year: 1958,
    mono: false,
  },
};
const NO_PICTURE: RegistryEntry = {
  name: 'person:Nnamdi Azikiwe',
  kind: 'person',
  about: 'Eastern nationalist',
};

const ctx: BuildContext = {
  shape: 'wide',
  palette: PALETTE,
  held: null,
  theme: 'paper',
  map: MAP,
  seed: 'pictures',
};

const shot = (set: ShotPlan['shots'][number]['set'], on: string) => ({
  on,
  set,
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'cut' as const,
});

describe('a cleared picture as a set', () => {
  it('makes the image asset the stage draws, its credit the chip', () => {
    const made = pictureAssetOf(BELLO)!;
    expect(made.asset).toEqual({
      kind: 'image',
      url: 'api/v1/studio/pictures/01a0fbbe-ad7b-7dac-bb7a-7308651951d5',
      width: 1280,
      height: 1602,
      depthUrl:
        'api/v1/studio/pictures/01a0fbbe-ad7b-7dac-bb7a-7308651951d5/depth',
      focal: [427, 534, 427, 534],
      credit: {
        text: 'Ahmadu Bello, 1960 · US Department of Energy · Public domain',
        licence: 'Public domain',
        source: 'US Department of Energy',
        url: 'https://commons.wikimedia.org/wiki/File:Ahmadu_Bello.jpg',
      },
    });
    expect(pictureAssetOf(NO_PICTURE)).toBeNull();
    expect(pictureAssetOf(null)).toBeNull();
  });

  it('runs a photo full-bleed only where it covers the frame without blowing up past 1.2×, else a print', () => {
    const colour = LAGOS_PHOTO.picture!;
    expect(coverScale({ width: 2560, height: 1700 }, 'wide')).toBeCloseTo(
      0.75,
      5,
    );
    expect(photoTreatment(colour, 'wide')).toBe('natural');
    expect(photoTreatment({ ...colour, mono: true }, 'wide')).toBe('duotone');
    // 1920 / 1700 tall is 1.13: still full-bleed; a 1280-wide copy is not.
    expect(photoTreatment(colour, 'tall')).toBe('natural');
    expect(
      photoTreatment({ ...colour, width: 1280, height: 850 }, 'wide'),
    ).toBe('cutout');
    expect(photoTreatment(colour, 'wide', 'halftone')).toBe('halftone');
  });

  it("makes a portrait card of the person's name, years and role, a black-and-white print in the show's ink", () => {
    expect(
      pictureSetOf({
        kind: 'portrait',
        asset: 'picture-1',
        name: 'person:Ahmadu Bello',
        picture: BELLO.picture!,
        shape: 'wide',
      }),
    ).toEqual({
      kind: 'portrait',
      asset: 'picture-1',
      name: 'Ahmadu Bello',
      dates: '1910–1966',
      role: 'Northern Region leader',
      treatment: 'duotone',
    });
  });

  it('builds portrait and photo shots with their assets and chips; a person with no picture is a safe shot', () => {
    const registry = registryOf([
      BELLO,
      LAGOS_PHOTO,
      NO_PICTURE,
      ...([] as RegistryEntry[]),
    ]);
    const plan: ShotPlan = {
      shots: [
        shot({ kind: 'map' }, 'In Lagos'),
        shot(
          { kind: 'portrait', person: 'person:Ahmadu Bello' },
          'Ahmadu Bello',
        ),
        shot({ kind: 'photo', photo: 'photo:Lagos Marina 1958' }, 'the Marina'),
        shot({ kind: 'portrait', person: 'person:Nnamdi Azikiwe' }, 'Azikiwe'),
      ],
    };
    const built = buildShots(plan, registry, ctx);
    expect(built.shots.map((s) => s.set.kind)).toEqual([
      'map',
      'portrait',
      'photo',
      'photo',
    ]);
    expect(built.shots[1].set).toMatchObject({
      kind: 'portrait',
      name: 'Ahmadu Bello',
      dates: '1910–1966',
    });
    expect(built.shots[1].chip?.text).toBe(
      'Ahmadu Bello, 1960 · US Department of Energy · Public domain',
    );
    expect(built.shots[2].set).toMatchObject({
      kind: 'photo',
      treatment: 'natural',
    });
    const portraitAsset = (built.shots[1].set as { asset: string }).asset;
    expect(built.assets[portraitAsset]).toMatchObject({
      kind: 'image',
      url: BELLO.picture!.url,
    });
    // Azikiwe has no portrait: the photo before is carried on, the camera moving.
    expect(built.notes.join('\n')).toMatch(
      /no cleared picture of "person:Nnamdi Azikiwe"/u,
    );
    expect(built.shots[3].camera[0]).toMatchObject({ move: 'push' });
  });

  it('lists the full credit of every picture a plan shows, once, for the description', () => {
    const registry = registryOf([BELLO, LAGOS_PHOTO]);
    const plan: ShotPlan = {
      shots: [
        shot({ kind: 'portrait', person: 'person:Ahmadu Bello' }, 'a'),
        shot({ kind: 'photo', photo: 'photo:Lagos Marina 1958' }, 'b'),
        shot({ kind: 'portrait', person: 'person:Ahmadu Bello' }, 'c'),
        shot({ kind: 'map' }, 'd'),
      ],
    };
    expect(pictureCredits(plan, registry)).toEqual([
      BELLO.picture!.fullCredit,
      LAGOS_PHOTO.picture!.fullCredit,
    ]);
  });
});
