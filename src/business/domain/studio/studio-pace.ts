/**
 * A Studio explainer's voice pace from its brief: whom it is for as a band
 * (scene-pace), the maker's Pace chips (gentle, lively, snappy) as the
 * voice's pace, and their "a bit faster" in the chat as a nudge
 * (studio-explainer-plan, Ask 1 §6). Kept in the Studio's own module: the
 * audience profile (Ask 8) replaces the band below with its own.
 */
import {
  NUDGE_RANGE,
  makerRate,
  motionFactor,
  type AudienceBand,
  type MakerPace,
  type PaceBrief,
} from '../scene-pace';
import type { StudioAudience, StudioBrief, StudioPace } from './studio';

/** The Studio's four audiences as bands, until the audience profile says more. */
export const STUDIO_AUDIENCE_BAND: Record<StudioAudience, AudienceBand> = {
  'young children': 'early-years',
  children: 'primary-upper',
  teens: 'secondary-lower',
  adults: 'general-adult',
};

/** The brief's Pace chips as the voice's pace: one vocabulary for both. */
export const STUDIO_PACE_MAKER: Record<StudioPace, MakerPace> = {
  gentle: 'relaxed',
  lively: 'natural',
  snappy: 'brisk',
};

/** The band a brief's audience comes to; a brief with none is for anyone grown up. */
export const bandOfBrief = (
  brief: Pick<StudioBrief, 'audience'>,
): AudienceBand =>
  brief.audience ? STUDIO_AUDIENCE_BAND[brief.audience] : 'general-adult';

/** An explainer's voice pace, from its brief. */
export function studioPaceBrief(
  brief: Pick<StudioBrief, 'audience' | 'pace' | 'voicePace'>,
): PaceBrief {
  return {
    band: bandOfBrief(brief),
    ...(brief.pace ? { maker: STUDIO_PACE_MAKER[brief.pace] } : {}),
    ...(brief.voicePace && brief.voicePace !== 1
      ? { nudge: brief.voicePace }
      : {}),
  };
}

/** The maker's share of the voice's pace a brief comes to (scene-pace makerRate). */
export const studioMakerRate = (
  brief: Pick<StudioBrief, 'audience' | 'pace' | 'voicePace'>,
): number => makerRate(studioPaceBrief(brief));

/**
 * How fast an explainer's picture moves, for whom and at the maker's pace
 * (studio-explainer-plan, Ask 3): read by the motion grammar once it is
 * built, 1 an adult's.
 */
export const studioMotionFactor = (
  brief: Pick<StudioBrief, 'audience' | 'pace' | 'voicePace'>,
): number => {
  const pace = studioPaceBrief(brief);
  return motionFactor(pace.band, pace.maker);
};

/** One nudge from the chat: about six per cent, or ten for "much". */
export const NUDGE_STEP = 0.06;
export const NUDGE_MUCH = 0.1;

/**
 * What the maker said of the voice's pace in the chat, as a change to it:
 * "the voice is a bit slow" is +6 %, "talk much slower" −10 %; null for
 * words that say nothing of it. Code's reading, before any model's.
 */
export function paceAsked(said: string): number | null {
  const text = said.toLowerCase();
  if (
    !/\b(voice|narrat\w*|speak\w*|talk\w*|read\w*|pace|speed|spoken|said)\b/.test(
      text,
    )
  )
    return null;
  const much = /\b(much|way|far|a lot|lots|really|very)\b/.test(text)
    ? NUDGE_MUCH
    : NUDGE_STEP;
  // "Too slow", "speed it up", "faster": quicker. "Too fast", "slow it
  // down", "slower": slower. Either said of the voice, not the picture.
  const quicker =
    /\b(too|bit|little|so|rather|kind of|kinda|is|sounds|feels|seems|very|really|way)\s+(slow|sluggish|draggy)\b|\bspeed\s+(it|the\s+\w+|things)?\s*up\b|\b(faster|quicker|pick up the pace|brisker|hurry)\b|\b(drags?|dragging)\b/.test(
      text,
    );
  const slower =
    /\b(too|bit|little|so|rather|kind of|kinda|is|sounds|feels|seems|very|really|way)\s+(fast|quick|rushed|hurried)\b|\bslow\s+(it|the\s+\w+|things)?\s*down\b|\b(slower|less rushed|calmer pace)\b|\b(rushed|rushing|rushes)\b/.test(
      text,
    );
  if (quicker === slower) return null;
  return quicker ? much : -much;
}

/** The brief's nudge after a change asked in the chat, held to its range. */
export function nudged(current: number | undefined, change: number): number {
  const next = (current ?? 1) * (1 + change);
  return (
    Math.round(
      Math.min(NUDGE_RANGE[1], Math.max(NUDGE_RANGE[0], next)) * 1000,
    ) / 1000
  );
}
