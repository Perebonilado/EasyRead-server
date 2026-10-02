/**
 * A cleared picture as a shot's set (WP11; research §3.4–3.5): the image
 * asset the stage draws (our copy's address, its size, its subject's box,
 * its depth map) with its credit as the shot's chip, and the set it makes.
 *
 *  - A photo runs full-bleed only where our copy covers the frame without
 *    being blown up past 1.2× (research: never above 1.25×, and the camera
 *    pushes a little); else it is a print on the paper, whole, with a white
 *    border and a soft shadow (the "cutout" treatment). A black-and-white
 *    print takes the show's ink and paper (a duotone: it loses no colour it
 *    had); a colour one stays as it is.
 *  - A portrait is a card: the print, the person's name, their years and
 *    who they were in three words.
 *
 * Pure: everything comes from the registry entry the desk's pass stored.
 */
import type {
  FilmShape,
  ShotCreditDto,
  ShotImageAssetDto,
  ShotSetDto,
} from '../../../contracts';
import type { RegistryEntry, ShotPlan, TargetRegistry } from './types';

type Picture = NonNullable<RegistryEntry['picture']>;
type Treatment = 'natural' | 'duotone' | 'halftone' | 'cutout';

/** The frame in the export's pixels, per shape. */
const FRAME: Readonly<Record<FilmShape, { w: number; h: number }>> = {
  wide: { w: 1920, h: 1080 },
  tall: { w: 1080, h: 1920 },
};

/** The most our copy may be blown up to cover the frame (research's 1.25×, with room for the camera's push). */
export const FULL_BLEED_MOST = 1.2;

/** How much a picture must be blown up to cover the frame of a shape. */
export const coverScale = (
  picture: { width: number; height: number },
  shape: FilmShape,
) => Math.max(FRAME[shape].w / picture.width, FRAME[shape].h / picture.height);

/** The image asset and the chip a cleared picture makes, or null for an entry with no picture to draw. */
export function pictureAssetOf(entry: RegistryEntry | null): {
  asset: ShotImageAssetDto;
  credit: ShotCreditDto;
  picture: Picture;
} | null {
  const picture = entry?.picture;
  if (!picture?.url || !picture.width || !picture.height) return null;
  const credit: ShotCreditDto = {
    text: picture.credit,
    licence: picture.licence ?? '',
    source: picture.source ?? '',
    ...(picture.sourceUrl ? { url: picture.sourceUrl } : {}),
  };
  return {
    asset: {
      kind: 'image',
      url: picture.url,
      width: picture.width,
      height: picture.height,
      ...(picture.depthUrl ? { depthUrl: picture.depthUrl } : {}),
      ...(picture.focal ? { focal: picture.focal } : {}),
      credit,
    },
    credit,
    picture,
  };
}

/** How a photo is shown in a shape: as the plan asks, else full-bleed when it can be (duotone if it has no colour), else a print. */
export function photoTreatment(
  picture: Picture,
  shape: FilmShape,
  asked?: Treatment,
): Treatment {
  if (asked) return asked;
  if (!picture.width || !picture.height) return 'cutout';
  if (
    coverScale({ width: picture.width, height: picture.height }, shape) >
    FULL_BLEED_MOST
  )
    return 'cutout';
  return picture.mono ? 'duotone' : 'natural';
}

/** The set a cleared picture makes: a photo, a portrait card, or a document's page. */
export function pictureSetOf(input: {
  kind: 'photo' | 'portrait' | 'document';
  asset: string;
  /** The name the plan gave it ("person:Ahmadu Bello"). */
  name: string;
  picture: Picture;
  shape: FilmShape;
  treatment?: Treatment;
}): ShotSetDto {
  const { picture } = input;
  if (input.kind === 'photo')
    return {
      kind: 'photo',
      asset: input.asset,
      treatment: photoTreatment(picture, input.shape, input.treatment),
    };
  if (input.kind === 'portrait')
    return {
      kind: 'portrait',
      asset: input.asset,
      name: input.name.replace(/^[a-z]+:/iu, '').trim(),
      ...(picture.dates ? { dates: picture.dates } : {}),
      ...(picture.role ? { role: picture.role } : {}),
      treatment: picture.mono ? 'duotone' : 'natural',
    };
  return { kind: 'document', asset: input.asset };
}

/**
 * The full credits of the pictures a scene's plan shows (its portraits,
 * photos and documents), each once, for the episode's description.
 */
export function pictureCredits(
  plan: ShotPlan,
  registry: TargetRegistry,
): string[] {
  const out: string[] = [];
  for (const shot of plan.shots) {
    const set = shot.set;
    const name =
      set.kind === 'portrait'
        ? set.person
        : set.kind === 'photo'
          ? set.photo
          : set.kind === 'document'
            ? set.document
            : null;
    const picture = name ? registry.resolve(name)?.picture : undefined;
    const credit = picture?.fullCredit ?? picture?.credit;
    if (credit && !out.includes(credit)) out.push(credit);
  }
  return out;
}
